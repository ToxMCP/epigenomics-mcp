import { z } from "zod";
import type { EpigenomicFeature } from "../contracts/features.js";
import type { ExperimentalDesign } from "../contracts/design.js";
import type {
  FeatureQualification,
  QualificationWarning,
} from "../contracts/qualification.js";
import { QualificationStatusSchema } from "../contracts/qualification.js";
import type { QualificationPolicy, ConfoundingBlockLevel } from "./policy.js";
import { shouldBlockForConfounding } from "./policy.js";
import type { GenomeBuildValidationResult } from "../validators/genome_build.js";
import type {
  FeatureMissingness,
  MissingnessProfile,
} from "../qc/missingness.js";
import {
  RULE_CODES,
  buildExplainability,
} from "./explainability.js";
import type { RuleCode } from "./explainability.js";

/**
 * Confounding assessment supplied by a context model.
 */
export interface ConfoundingAssessment {
  status: string;
  warnings: QualificationWarning[];
}

/**
 * Mapping metadata for a single feature.
 */
export interface FeatureMappingInfo {
  mappedGeneIds: string[];
  mappingConfidence: "high" | "medium" | "low" | "none";
  mappingMethod: string;
  ambiguityDetected: boolean;
}

/**
 * Context required to run fail-closed qualification rules on a feature.
 */
export interface FeatureRuleContext {
  design: ExperimentalDesign;
  policy: QualificationPolicy;
  buildValidation: GenomeBuildValidationResult;
  missingnessProfile?: MissingnessProfile;
  missingnessByFeature?: ReadonlyMap<string, FeatureMissingness>;
  cellCompositionResult?: ConfoundingAssessment;
  cytotoxicityResult?: ConfoundingAssessment;
  stressResponseResult?: ConfoundingAssessment;
  differentiationDriftResult?: ConfoundingAssessment;
  mappingInfo?: FeatureMappingInfo;
}

/**
 * Result of applying qualification rules to a single feature.
 */
export interface FeatureRuleResult {
  qualification: FeatureQualification;
  blocked: boolean;
  /** Code of the first rule that triggered a non-accepted status. */
  ruleTriggered: string | null;
}

function isMissing(value: number | null | undefined): boolean {
  return value === null || value === undefined || Number.isNaN(value);
}

function isNonNumeric(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && !Number.isFinite(value);
}

function buildWarning(
  warningCode: string,
  message: string,
  severity: "info" | "warning" | "error",
  category: QualificationWarning["category"],
  blocksDownstream: boolean,
  featureIds?: string[],
): QualificationWarning {
  const w: QualificationWarning = {
    warningCode,
    severity,
    message,
    category,
    blocksDownstream,
  };
  if (featureIds !== undefined && featureIds.length > 0) {
    w.featureIds = featureIds;
  }
  return w;
}

function countBiologicalReplicatesPerGroup(design: ExperimentalDesign): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sample of design.samples) {
    const rType = sample.replicateType;
    // Technical replicates must not count toward biological minimum.
    if (rType === "technical") continue;
    // Pooled and pseudobulk count as biological for the minimum check,
    // but generate warnings elsewhere.
    counts.set(sample.doseGroupId, (counts.get(sample.doseGroupId) || 0) + 1);
  }
  // Ensure every declared dose group has an entry (even if zero)
  for (const dg of design.doseGroups) {
    if (!counts.has(dg.doseGroupId)) {
      counts.set(dg.doseGroupId, 0);
    }
  }
  return counts;
}

function countDistinctDoseLevels(design: ExperimentalDesign): number {
  return new Set(design.doseGroups.map((group) => group.doseValue)).size;
}

function countDistinctNonZeroDoseLevels(
  design: ExperimentalDesign,
): number {
  return new Set(
    design.doseGroups
      .map((group) => group.doseValue)
      .filter((doseValue) => doseValue !== 0),
  ).size;
}

function getFeatureMissingness(
  feature: EpigenomicFeature,
  profile: MissingnessProfile | undefined,
  byFeature: ReadonlyMap<string, FeatureMissingness> | undefined,
): { missingFraction: number; band: string } | undefined {
  const indexed = byFeature?.get(feature.featureId);
  if (indexed) {
    return {
      missingFraction: indexed.missingFraction,
      band: indexed.band,
    };
  }
  if (profile) {
    const found = profile.perFeatureMissingness.find(
      (m) => m.featureId === feature.featureId,
    );
    if (found) {
      return { missingFraction: found.missingFraction, band: found.band };
    }
  }
  // Fallback: compute directly from feature.values
  const values = Object.values(feature.values);
  if (values.length === 0) return undefined;
  const missingCount = values.filter(isMissing).length;
  return {
    missingFraction: missingCount / values.length,
    band: "unknown",
  };
}

function hasNonNumericResponse(feature: EpigenomicFeature): boolean {
  return Object.values(feature.values).some(isNonNumeric);
}

function makeResult(
  feature: EpigenomicFeature,
  status: z.infer<typeof QualificationStatusSchema>,
  warnings: QualificationWarning[],
  ruleCode: RuleCode,
  policy: QualificationPolicy,
  explainabilityContext: Parameters<typeof buildExplainability>[3],
  mappingInfo?: FeatureMappingInfo,
): FeatureQualification {
  return {
    featureId: feature.featureId,
    status,
    warnings,
    mappedGeneIds: mappingInfo?.mappedGeneIds ?? [],
    mappingConfidence: mappingInfo?.mappingConfidence ?? "none",
    mappingMethod: mappingInfo?.mappingMethod ?? "unknown",
    explainability: buildExplainability(
      ruleCode,
      feature.featureId,
      policy,
      explainabilityContext,
    ),
  };
}

/**
 * Qualify a single epigenomic feature using deterministic fail-closed rules.
 *
 * Rule precedence (first match wins):
 *  1. Missing build / Invalid coordinates  → excluded_coordinate_ambiguity
 *  2. Insufficient design                   → excluded_insufficient_design
 *  3. Insufficient replicates               → excluded_qc_failure
 *  4. High missingness                      → excluded_qc_failure
 *  5. Non-numeric response                  → excluded_qc_failure
 *  6. Dominant confounding                  → exploratory_only
 *  7. Mapping ambiguity                     → excluded_mapping_failure
 *  8. Major warnings                        → accepted_with_caveats
 *  9. Accepted                              → accepted_for_pod
 *
 * All policy choices are traceable to the supplied QualificationPolicy.
 */
export function qualifyFeature(
  feature: EpigenomicFeature,
  context: FeatureRuleContext,
): FeatureRuleResult {
  const {
    design,
    policy,
    buildValidation,
    missingnessProfile,
    missingnessByFeature,
    cellCompositionResult,
    cytotoxicityResult,
    stressResponseResult,
    differentiationDriftResult,
    mappingInfo,
  } = context;

  let status: z.infer<typeof QualificationStatusSchema> = "accepted_for_pod";
  const warnings: QualificationWarning[] = [];
  let blocked = false;
  let ruleTriggered: string | null = null;

  const hasRegion = feature.measuredRegion !== undefined;
  const build = feature.measuredRegion?.build;

  // ── Rule 1: Missing build ──
  if (hasRegion && policy.coordinate.requireGenomeBuild && !build) {
    status = "excluded_coordinate_ambiguity";
    warnings.push(
      buildWarning(
        "EPI004_BUILD_MISSING",
        `Feature ${feature.featureId} has measuredRegion but missing genome build`,
        "error",
        "coordinate_semantics",
        true,
        [feature.featureId],
      ),
    );
    blocked = true;
    ruleTriggered = RULE_CODES.MISSING_BUILD;
    return {
      qualification: makeResult(
        feature,
        status,
        warnings,
        RULE_CODES.MISSING_BUILD,
        policy,
        {},
        mappingInfo,
      ),
      blocked,
      ruleTriggered,
    };
  }

  // ── Rule 2: Invalid coordinates (build not in allowlist or mixed builds) ──
  if (
    hasRegion &&
    buildValidation.errors.length > 0 &&
    build !== undefined &&
    (!policy.coordinate.allowedGenomeBuilds.some((allowed) => allowed === build) ||
      buildValidation.mixedBuildDetected)
  ) {
    status = "excluded_coordinate_ambiguity";
    warnings.push(
      buildWarning(
        "EPI004_BUILD_VALIDATION_FAILED",
        `Feature ${feature.featureId} failed genome build validation (build="${build}", mixed=${buildValidation.mixedBuildDetected})`,
        "error",
        "coordinate_semantics",
        true,
        [feature.featureId],
      ),
    );
    blocked = true;
    ruleTriggered = RULE_CODES.INVALID_COORDINATES;
    return {
      qualification: makeResult(
        feature,
        status,
        warnings,
        RULE_CODES.INVALID_COORDINATES,
        policy,
        { build },
        mappingInfo,
      ),
      blocked,
      ruleTriggered,
    };
  }

  // Non-standard coordinate system warning (informational, does not block)
  if (
    hasRegion &&
    policy.coordinate.requireCoordinateSystem &&
    feature.measuredRegion!.coordinateSystem !== "0-based-half-open"
  ) {
    warnings.push(
      buildWarning(
        "EPIW001_COORDINATE_SYSTEM_NONSTANDARD",
        `Feature ${feature.featureId} uses non-standard coordinate system ${feature.measuredRegion!.coordinateSystem}`,
        "warning",
        "coordinate_semantics",
        false,
        [feature.featureId],
      ),
    );
  }

  // ── Rule 3: Insufficient design ──
  const totalDoseGroups = countDistinctDoseLevels(design);
  const nonZeroDoseGroups = countDistinctNonZeroDoseLevels(design);
  const designInsufficient =
    totalDoseGroups < policy.doseGroup.minTotalDoseGroups ||
    nonZeroDoseGroups < policy.doseGroup.minNonZeroDoseGroups;

  if (designInsufficient) {
    status = "excluded_insufficient_design";
    warnings.push(
      buildWarning(
        "EPI005_INSUFFICIENT_DESIGN",
        `Feature ${feature.featureId} excluded: design has ${totalDoseGroups} distinct dose levels (${nonZeroDoseGroups} non-zero), minimum required ${policy.doseGroup.minTotalDoseGroups} total / ${policy.doseGroup.minNonZeroDoseGroups} non-zero`,
        "error",
        "missing_metadata",
        true,
        [feature.featureId],
      ),
    );
    blocked = true;
    ruleTriggered = RULE_CODES.INSUFFICIENT_DESIGN;
    return {
      qualification: makeResult(
        feature,
        status,
        warnings,
        RULE_CODES.INSUFFICIENT_DESIGN,
        policy,
        { totalDoseGroups, nonZeroDoseGroups },
        mappingInfo,
      ),
      blocked,
      ruleTriggered,
    };
  }

  // Preferred-design warnings (non-blocking)
  if (totalDoseGroups < policy.doseGroup.preferredTotalDoseGroups) {
    warnings.push(
      buildWarning(
        "EPIW005_BELOW_PREFERRED_DOSE_GROUPS",
        `Design has ${totalDoseGroups} distinct dose levels; preferred is ${policy.doseGroup.preferredTotalDoseGroups}`,
        "warning",
        "missing_metadata",
        false,
        [feature.featureId],
      ),
    );
  }

  // ── Rule 4: Insufficient replicates ──
  const biologicalReplicateCounts = countBiologicalReplicatesPerGroup(design);
  const minBiologicalReplicates = Math.min(
    ...Array.from(biologicalReplicateCounts.values()),
  );

  const replicatesBelowMinimum =
    minBiologicalReplicates < policy.replicate.minBiologicalReplicatesPerGroup;

  // n=1 special handling based on policy
  const n1AndExcluded =
    minBiologicalReplicates === 1 &&
    policy.replicate.n1BiologicalReplicatePolicy === "excluded";

  if (replicatesBelowMinimum || n1AndExcluded) {
    status = "excluded_qc_failure";
    warnings.push(
      buildWarning(
        "EPI006_INSUFFICIENT_REPLICATES",
        `Feature ${feature.featureId} excluded: minimum ${minBiologicalReplicates} biological replicates per group, required ${policy.replicate.minBiologicalReplicatesPerGroup}`,
        "error",
        "platform_specific",
        true,
        [feature.featureId],
      ),
    );
    blocked = true;
    ruleTriggered = RULE_CODES.INSUFFICIENT_REPLICATES;
    return {
      qualification: makeResult(
        feature,
        status,
        warnings,
        RULE_CODES.INSUFFICIENT_REPLICATES,
        policy,
        { minBiologicalReplicates },
        mappingInfo,
      ),
      blocked,
      ruleTriggered,
    };
  }

  // n=1 review-required handling
  const n1AndReview =
    minBiologicalReplicates === 1 &&
    policy.replicate.n1BiologicalReplicatePolicy === "review_required";

  if (n1AndReview) {
    status = "exploratory_only";
    warnings.push(
      buildWarning(
        "EPIW006_N1_REPLICATE_REVIEW",
        `Feature ${feature.featureId} has n=1 biological replicate per group; sent for review per policy`,
        "warning",
        "platform_specific",
        true,
        [feature.featureId],
      ),
    );
    blocked = true;
    ruleTriggered = RULE_CODES.INSUFFICIENT_REPLICATES;
    return {
      qualification: makeResult(
        feature,
        status,
        warnings,
        RULE_CODES.INSUFFICIENT_REPLICATES,
        policy,
        { minBiologicalReplicates },
        mappingInfo,
      ),
      blocked,
      ruleTriggered,
    };
  }

  // Preferred-replicate warnings (non-blocking)
  if (
    minBiologicalReplicates < policy.replicate.preferredBiologicalReplicatesPerGroup
  ) {
    warnings.push(
      buildWarning(
        "EPIW006_BELOW_PREFERRED_REPLICATES",
        `Minimum ${minBiologicalReplicates} biological replicates per group; preferred is ${policy.replicate.preferredBiologicalReplicatesPerGroup}`,
        "warning",
        "platform_specific",
        false,
        [feature.featureId],
      ),
    );
  }

  // ── Rule 5: High missingness ──
  const featureMissingness = getFeatureMissingness(
    feature,
    missingnessProfile,
    missingnessByFeature,
  );
  const missingnessHigh =
    featureMissingness !== undefined &&
    featureMissingness.missingFraction >= policy.missingness.exclusionThreshold;

  if (missingnessHigh) {
    status = "excluded_qc_failure";
    warnings.push(
      buildWarning(
        "EPIE002_EXCESSIVE_MISSINGNESS",
        `Feature ${feature.featureId} has ${(featureMissingness.missingFraction * 100).toFixed(1)}% missing values (threshold ${(policy.missingness.exclusionThreshold * 100).toFixed(1)}%)`,
        "error",
        "platform_specific",
        true,
        [feature.featureId],
      ),
    );
    blocked = true;
    ruleTriggered = RULE_CODES.HIGH_MISSINGNESS;
    return {
      qualification: makeResult(
        feature,
        status,
        warnings,
        RULE_CODES.HIGH_MISSINGNESS,
        policy,
        { missingFraction: featureMissingness.missingFraction },
        mappingInfo,
      ),
      blocked,
      ruleTriggered,
    };
  }

  // Missingness warning band (non-blocking)
  if (
    featureMissingness !== undefined &&
    featureMissingness.missingFraction >= policy.missingness.warningThreshold
  ) {
    warnings.push(
      buildWarning(
        "EPIW002_ELEVATED_MISSINGNESS",
        `Feature ${feature.featureId} has ${(featureMissingness.missingFraction * 100).toFixed(1)}% missing values (warning threshold ${(policy.missingness.warningThreshold * 100).toFixed(1)}%)`,
        "warning",
        "platform_specific",
        false,
        [feature.featureId],
      ),
    );
  }

  // ── Rule 6: Non-numeric response ──
  if (hasNonNumericResponse(feature)) {
    status = "excluded_qc_failure";
    warnings.push(
      buildWarning(
        "EPIE003_NON_NUMERIC_RESPONSE",
        `Feature ${feature.featureId} contains non-finite (infinite or NaN) response values`,
        "error",
        "platform_specific",
        true,
        [feature.featureId],
      ),
    );
    blocked = true;
    ruleTriggered = RULE_CODES.NON_NUMERIC_RESPONSE;
    return {
      qualification: makeResult(
        feature,
        status,
        warnings,
        RULE_CODES.NON_NUMERIC_RESPONSE,
        policy,
        {},
        mappingInfo,
      ),
      blocked,
      ruleTriggered,
    };
  }

  // ── Rule 7: Dominant confounding ──
  const confoundingAssessments: Array<{
    result: ConfoundingAssessment | undefined;
    blockLevel: ConfoundingBlockLevel;
    category: QualificationWarning["category"];
    confoundingType: string;
  }> = [
    {
      result: cellCompositionResult,
      blockLevel: policy.confounding.cellCompositionBlockLevel,
      category: "cell_composition",
      confoundingType: "cellComposition",
    },
    {
      result: cytotoxicityResult,
      blockLevel: policy.confounding.cytotoxicityBlockLevel,
      category: "cytotoxicity",
      confoundingType: "cytotoxicity",
    },
    {
      result: stressResponseResult,
      blockLevel: policy.confounding.stressResponseBlockLevel,
      category: "stress_response",
      confoundingType: "stressResponse",
    },
    {
      result: differentiationDriftResult,
      blockLevel: policy.confounding.differentiationDriftBlockLevel,
      category: "differentiation_drift",
      confoundingType: "differentiationDrift",
    },
  ];

  let dominantConfounding = false;
  let firstBlockingConfounding: {
    confoundingType: string;
    confStatus: string;
    blockLevel: string;
  } | undefined;

  for (const assessment of confoundingAssessments) {
    if (!assessment.result) continue;
    const confStatus = assessment.result.status;

    for (const warning of assessment.result.warnings) {
      const contextualWarning = {
        ...warning,
        featureIds:
          warning.featureIds && warning.featureIds.length > 0
            ? warning.featureIds
            : [feature.featureId],
      };
      const duplicate = warnings.some(
        (existing) =>
          existing.warningCode === contextualWarning.warningCode &&
          existing.message === contextualWarning.message &&
          existing.category === contextualWarning.category,
      );
      if (!duplicate) {
        warnings.push(contextualWarning);
      }
    }

    if (confStatus === "no_context_available") {
      if (policy.confounding.blockOnMissingContext) {
        dominantConfounding = true;
        if (!firstBlockingConfounding) {
          firstBlockingConfounding = {
            confoundingType: assessment.confoundingType,
            confStatus,
            blockLevel: assessment.blockLevel,
          };
        }
        warnings.unshift(
          buildWarning(
            "EPI007_MISSING_CONFOUNDING_CONTEXT",
            `Feature ${feature.featureId} blocked: missing ${assessment.category} context and blockOnMissingContext is true`,
            "error",
            assessment.category,
            true,
            [feature.featureId],
          ),
        );
      }
      continue;
    }

    if (
      shouldBlockForConfounding(
        confStatus as ConfoundingBlockLevel,
        assessment.blockLevel,
      )
    ) {
      dominantConfounding = true;
      if (!firstBlockingConfounding) {
        firstBlockingConfounding = {
          confoundingType: assessment.confoundingType,
          confStatus,
          blockLevel: assessment.blockLevel,
        };
      }
      const warningCodeCategory =
        assessment.category === "cytotoxicity"
          ? "CYTOXICITY"
          : assessment.category.toUpperCase();
      warnings.unshift(
        buildWarning(
          `EPI007_${warningCodeCategory}_BLOCKING`,
          `Feature ${feature.featureId} blocked due to ${assessment.category} confounding at level ${confStatus}`,
          "error",
          assessment.category,
          true,
          [feature.featureId],
        ),
      );
    } else if (
      confStatus === "possible_confounding" ||
      confStatus === "likely_confounding" ||
      confStatus === "dominant_confounding"
    ) {
      warnings.push(
        buildWarning(
          `EPIW004_${assessment.category.toUpperCase()}_CONFOUNDING`,
          `Feature ${feature.featureId} has ${assessment.category} confounding at level ${confStatus}`,
          "warning",
          assessment.category,
          false,
          [feature.featureId],
        ),
      );
    }
  }

  if (dominantConfounding) {
    status = "exploratory_only";
    blocked = true;
    ruleTriggered = RULE_CODES.DOMINANT_CONFOUNDING;
    return {
      qualification: makeResult(
        feature,
        status,
        warnings,
        RULE_CODES.DOMINANT_CONFOUNDING,
        policy,
        firstBlockingConfounding
          ? {
              confoundingLevel: firstBlockingConfounding.confStatus,
              confoundingType: firstBlockingConfounding.confoundingType,
              blockLevel: firstBlockingConfounding.blockLevel,
            }
          : {},
        mappingInfo,
      ),
      blocked,
      ruleTriggered,
    };
  }

  // ── Rule 8: Mapping ambiguity ──
  const peakClasses = new Set([
    "atac_peak",
    "chip_peak_narrow",
    "chip_peak_broad",
    "histone_mark_peak",
  ]);
  const isPeakFeature = peakClasses.has(feature.featureClass);

  if (mappingInfo?.ambiguityDetected) {
    status = "excluded_mapping_failure";
    warnings.push(
      buildWarning(
        "EPI008_MAPPING_AMBIGUITY",
        `Feature ${feature.featureId} excluded due to mapping ambiguity`,
        "error",
        "mapping_proximity",
        true,
        [feature.featureId],
      ),
    );
    blocked = true;
    ruleTriggered = RULE_CODES.MAPPING_AMBIGUITY;
    return {
      qualification: makeResult(
        feature,
        status,
        warnings,
        RULE_CODES.MAPPING_AMBIGUITY,
        policy,
        {},
        mappingInfo,
      ),
      blocked,
      ruleTriggered,
    };
  }

  // Peak-type proximity warning (informational)
  if (isPeakFeature) {
    warnings.push(
      buildWarning(
        "EPIW003_PROXIMITY_NOT_CAUSALITY",
        `Feature ${feature.featureId} is a peak-type feature; nearest-gene mapping does not imply causality`,
        "warning",
        "mapping_proximity",
        false,
        [feature.featureId],
      ),
    );
  }

  // Nearest-gene-only warning (informational)
  if (
    mappingInfo?.mappingMethod === "nearest_gene" &&
    mappingInfo.mappedGeneIds.length > 0
  ) {
    warnings.push(
      buildWarning(
        "EPIW007_NEAREST_GENE_ONLY",
        `Feature ${feature.featureId} mapped by nearest-gene only; low-confidence contextual linkage, suppress pathway rollup`,
        "warning",
        "mapping_proximity",
        false,
        [feature.featureId],
      ),
    );
  }

  // ── Rule 9: Major warnings ──
  const majorWarnings = warnings.filter(
    (w) => w.severity === "warning" || w.severity === "error",
  );
  if (majorWarnings.length > 0) {
    status = "accepted_with_caveats";
    ruleTriggered = RULE_CODES.MAJOR_WARNINGS;
    return {
      qualification: makeResult(
        feature,
        status,
        warnings,
        RULE_CODES.MAJOR_WARNINGS,
        policy,
        { warningCount: majorWarnings.length },
        mappingInfo,
      ),
      blocked: false,
      ruleTriggered,
    };
  }

  status = "accepted_for_pod";
  ruleTriggered = RULE_CODES.ACCEPTED;
  return {
    qualification: makeResult(
      feature,
      status,
      warnings,
      RULE_CODES.ACCEPTED,
      policy,
      {},
      mappingInfo,
    ),
    blocked: false,
    ruleTriggered,
  };
}
