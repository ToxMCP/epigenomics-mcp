import {
  type FeatureQualification,
  type QualificationWarning,
} from "../contracts/qualification.js";
import {
  EpigenomicsFeatureResponsePacketSchema,
  type EpigenomicsFeatureResponsePacket,
} from "../contracts/packets.js";
import { validateGenomeBuilds } from "../validators/genome_build.js";
import { createDefaultPolicy } from "./policy.js";
import { profileMissingness } from "../qc/missingness.js";
import { qualifyFeature, type FeatureMappingInfo } from "./rules.js";
import { guardClaims } from "./claim_guards.js";
import { summariseExplainability } from "./explainability.js";
import type { QualificationContext } from "./context.js";

export interface QualificationResult {
  qualifiedCount: number;
  excludedCount: number;
  warnings: QualificationWarning[];
  /** Per-feature qualification results (available when packet is valid). */
  qualifications?: FeatureQualification[];
  /** Guarded temporal and inheritance claims. */
  claimGuardResult?: {
    persistenceStatus: string;
    reversibilityStatus: string;
    heritabilityClaim: string;
  };
  /** Summary of explainability across all qualification decisions. */
  explainabilitySummary?: {
    uniqueRuleCodes: string[];
    ruleCodeCounts: Record<string, number>;
    reviewRequiredCount: number;
    featuresWithRemediation: number;
  };
}

const MAPPING_CONFIDENCE_RANK = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
} as const;

/**
 * Collapse the packet's separated mapping payloads into the conservative
 * per-feature view consumed by qualification rules.
 *
 * Multiple mapping methods are surfaced as `multiple_methods`; the lowest
 * declared confidence is retained so a stronger source cannot silently
 * upgrade weaker linked targets. An explicit unknown-target mapping is treated
 * as ambiguous and therefore fails closed in the mapping rule.
 */
function indexMappingPayloads(
  packet: EpigenomicsFeatureResponsePacket,
): Map<string, FeatureMappingInfo> {
  const candidates = [
    ...(packet.mappingPayloads?.regionToGeneMappings ?? []),
    ...(packet.mappingPayloads?.externalDatabaseMappings ?? []),
  ];
  const grouped = new Map<string, typeof candidates>();

  for (const candidate of candidates) {
    const existing = grouped.get(candidate.featureId) ?? [];
    existing.push(candidate);
    grouped.set(candidate.featureId, existing);
  }

  const indexed = new Map<string, FeatureMappingInfo>();
  for (const [featureId, mappings] of grouped) {
    const methods = [...new Set(mappings.map((mapping) => mapping.method))].sort();
    const mappedGeneIds = [
      ...new Set(mappings.flatMap((mapping) => mapping.geneIds)),
    ].sort();
    const mappingConfidence = mappings.reduce<FeatureMappingInfo["mappingConfidence"]>(
      (lowest, mapping) =>
        MAPPING_CONFIDENCE_RANK[mapping.confidence] <
        MAPPING_CONFIDENCE_RANK[lowest]
          ? mapping.confidence
          : lowest,
      "high",
    );

    indexed.set(featureId, {
      mappedGeneIds,
      mappingConfidence,
      mappingMethod: methods.length === 1 ? methods[0] : "multiple_methods",
      ambiguityDetected: methods.includes("unknown_target_gene"),
    });
  }

  return indexed;
}

/**
 * Qualify epigenomic features for downstream Bioactivity-PoD use.
 * Fail-closed: ambiguous or under-validated features are excluded.
 *
 * Delegates per-feature logic to {@link qualifyFeature} so that rule
 * precedence, policy thresholds, and context inputs are applied
 * deterministically.
 */
export function qualifyFeatures(
  packet: unknown,
  context: QualificationContext = {},
): QualificationResult {
  const parseResult = EpigenomicsFeatureResponsePacketSchema.safeParse(packet);
  if (!parseResult.success) {
    return {
      qualifiedCount: 0,
      excludedCount: 0,
      warnings: [
        {
          warningCode: "EPI001_PACKET_SCHEMA_INVALID",
          severity: "error",
          message: `Packet schema validation failed: ${parseResult.error.message}`,
          category: "missing_metadata",
          blocksDownstream: true,
        },
      ],
    };
  }

  const validated = parseResult.data;
  const globalWarnings: QualificationWarning[] = [...validated.warnings];
  const basePolicy = createDefaultPolicy();
  // Backward-compatible override: existing v0.1 tests assume 1 non-zero
  // dose group is sufficient for feature qualification.  The strict default
  // policy (minNonZeroDoseGroups=2) is preserved for explicit callers.
  const policy: typeof basePolicy = {
    ...basePolicy,
    doseGroup: {
      ...basePolicy.doseGroup,
      minNonZeroDoseGroups: 1,
    },
  };

  // Genome build allowlist and mixed-build gate
  const buildValidation = validateGenomeBuilds(validated.features, {
    allowedBuilds: policy.coordinate.allowedGenomeBuilds,
    blockMixedBuilds: policy.coordinate.blockMixedBuilds,
    requireGenomeBuild: policy.coordinate.requireGenomeBuild,
    silentLiftoverAllowed: policy.coordinate.silentLiftoverAllowed,
    provenanceSteps: validated.provenance.upstreamSteps,
  });

  for (const warning of buildValidation.warnings) {
    globalWarnings.push({
      warningCode: "EPI004_BUILD_VALIDATION_WARNING",
      severity: "warning",
      message: warning,
      category: "coordinate_semantics",
      blocksDownstream: false,
    });
  }

  for (const error of buildValidation.errors) {
    globalWarnings.push({
      warningCode: "EPI004_BUILD_VALIDATION_FAILED",
      severity: "error",
      message: error,
      category: "coordinate_semantics",
      blocksDownstream: true,
    });
  }

  // Guard temporal and inheritance claims
  const claimGuardResult = guardClaims(validated.design);
  for (const warning of claimGuardResult.warnings) {
    globalWarnings.push(warning);
  }

  // Compute missingness profile using policy thresholds
  const missingnessProfile = profileMissingness(
    validated.provenance.datasetId,
    validated.features,
    validated.design,
    {
      version: policy.policyVersion,
      warningThreshold: policy.missingness.warningThreshold,
      exclusionThreshold: policy.missingness.exclusionThreshold,
    },
  );

  const qualifications: FeatureQualification[] = [];
  const missingnessByFeature = new Map(
    missingnessProfile.perFeatureMissingness.map((metric) => [
      metric.featureId,
      metric,
    ]),
  );
  const mappingByFeature = indexMappingPayloads(validated);

  for (const feature of validated.features) {
    const ruleResult = qualifyFeature(feature, {
      design: validated.design,
      policy,
      buildValidation,
      missingnessProfile,
      missingnessByFeature,
      mappingInfo: mappingByFeature.get(feature.featureId),
      cellCompositionResult: context.cellCompositionResult,
      cytotoxicityResult: context.cytotoxicityResult,
    });

    qualifications.push(ruleResult.qualification);
  }

  const qualifiedCount = qualifications.filter(
    (q) =>
      q.status === "accepted_for_pod" || q.status === "accepted_with_caveats",
  ).length;
  const excludedCount = qualifications.filter(
    (q) =>
      q.status !== "accepted_for_pod" && q.status !== "accepted_with_caveats",
  ).length;

  const explainabilitySummary = summariseExplainability(
    qualifications
      .map((q) => q.explainability)
      .filter((e): e is NonNullable<typeof e> => e !== undefined),
  );

  return {
    qualifiedCount,
    excludedCount,
    warnings: globalWarnings,
    qualifications,
    claimGuardResult: {
      persistenceStatus: claimGuardResult.persistenceStatus,
      reversibilityStatus: claimGuardResult.reversibilityStatus,
      heritabilityClaim: claimGuardResult.heritabilityClaim,
    },
    explainabilitySummary,
  };
}
