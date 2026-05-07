import { createHash } from "node:crypto";
import { z } from "zod";
import type { EpigenomicFeature } from "../contracts/features.js";
import type { EpigenomicsFeatureResponsePacket } from "../contracts/packets.js";
import type {
  FeatureQualification,
  EpigenomicsFeatureQualification,
  QualificationWarning,
  DatasetQualificationSummary,
} from "../contracts/qualification.js";
import {
  EpigenomicsFeatureQualificationSchema,
  DatasetQualificationSummarySchema,
  EpigenomicsQualificationStatusSchema,
} from "../contracts/qualification.js";
import type { QualificationResult } from "./engine.js";
import { RULE_CODES } from "./explainability.js";

/**
 * Canonical feature with its epigenomics-specific qualification attached.
 */
export interface QualifiedFeature {
  feature: EpigenomicFeature;
  qualification: EpigenomicsFeatureQualification;
}

/**
 * Result of building the qualification packet.
 */
export interface QualificationPacketResult {
  qualifiedFeatures: QualifiedFeature[];
  datasetSummary: DatasetQualificationSummary;
  warnings: QualificationWarning[];
}

/**
 * Options for building a qualification packet.
 */
export interface BuildQualificationPacketOptions {
  /** Override the generated summaryId (default: randomUUID()). */
  summaryId?: string;
  /** Override the generatedAt timestamp (default: new Date().toISOString()). */
  generatedAt?: string;
  /** Source dataset identifier (default: extracted from packet provenance). */
  datasetId?: string;
}

/**
 * Derive an epigenomics-specific qualification status from the base
 * FeatureQualification status and explainability rule code.
 *
 * Uses the rule code to disambiguate generic exclusion reasons into
 * precise epigenomics statuses.
 */
function deriveEpigenomicsStatus(
  baseStatus: FeatureQualification["status"],
  ruleCode?: string,
): z.infer<typeof EpigenomicsQualificationStatusSchema> {
  switch (baseStatus) {
    case "accepted_for_pod":
      return "accepted_for_pod";
    case "accepted_with_caveats":
      return "accepted_with_warnings";
    case "exploratory_only": {
      if (ruleCode === RULE_CODES.INSUFFICIENT_REPLICATES) {
        return "review_required";
      }
      if (ruleCode === RULE_CODES.DOMINANT_CONFOUNDING) {
        return "excluded_confounding_dominant";
      }
      return "exploratory_only";
    }
    case "excluded_insufficient_design":
      return "excluded_insufficient_design";
    case "excluded_coordinate_ambiguity": {
      if (ruleCode === RULE_CODES.MISSING_BUILD) {
        return "excluded_missing_genome_build";
      }
      return "excluded_invalid_coordinates";
    }
    case "excluded_qc_failure": {
      if (ruleCode === RULE_CODES.HIGH_MISSINGNESS) {
        return "excluded_high_missingness";
      }
      if (ruleCode === RULE_CODES.NON_NUMERIC_RESPONSE) {
        return "excluded_non_numeric_response";
      }
      if (ruleCode === RULE_CODES.INSUFFICIENT_REPLICATES) {
        return "excluded_insufficient_design";
      }
      // Fallback for unexpected qc_failure rules
      return "excluded_high_missingness";
    }
    case "excluded_mapping_failure":
      return "excluded_mapping_ambiguous";
    default:
      return "exploratory_only";
  }
}

/**
 * Derive the downstream-use rule from an epigenomics qualification status.
 */
function deriveDownstreamUseRule(
  status: z.infer<typeof EpigenomicsQualificationStatusSchema>,
): "allow" | "allow_with_warning" | "review_required" | "exploratory_only" | "block" {
  switch (status) {
    case "accepted_for_pod":
      return "allow";
    case "accepted_with_warnings":
      return "allow_with_warning";
    case "review_required":
      return "review_required";
    case "exploratory_only":
      return "exploratory_only";
    default:
      return "block";
  }
}

/**
 * Build qualification reasons from explainability and warnings.
 */
function buildQualificationReasons(
  qualification: FeatureQualification,
): string[] {
  const reasons: string[] = [];
  if (qualification.explainability?.reasonTemplate) {
    reasons.push(qualification.explainability.reasonTemplate);
  }
  for (const warning of qualification.warnings) {
    reasons.push(`[${warning.warningCode}] ${warning.message}`);
  }
  if (reasons.length === 0) {
    reasons.push("No specific reason recorded.");
  }
  return reasons;
}

/**
 * Generate a deterministic immutable object ID from canonical content.
 *
 * Uses SHA-256 of the supplied parts, formatted as a UUID-compatible
 * string so that it passes Zod .uuid() validation.
 */
function deterministicId(...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("|")).digest("hex");
  // Format as UUID v4-like string (8-4-4-4-12)
  // Set version bits to 0100 (version 4) and variant bits to 10
  const p1 = hash.slice(0, 8);
  const p2 = hash.slice(8, 12);
  const p3 = (parseInt(hash.slice(12, 16), 16) & 0x0fff | 0x4000).toString(16).padStart(4, "0");
  const p4 = (parseInt(hash.slice(16, 20), 16) & 0x3fff | 0x8000).toString(16).padStart(4, "0");
  const p5 = hash.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

/**
 * Map a base FeatureQualification to an EpigenomicsFeatureQualification.
 */
export function mapToEpigenomicsFeatureQualification(
  qualification: FeatureQualification,
  _datasetId: string,
): EpigenomicsFeatureQualification {
  const epigenomicsStatus = deriveEpigenomicsStatus(
    qualification.status,
    qualification.explainability?.ruleCode,
  );

  const warningRefs = qualification.warnings.map((w) => w.warningCode);
  const humanReviewRequired =
    qualification.explainability?.reviewRequired ?? false;

  const downstreamUseRule = deriveDownstreamUseRule(epigenomicsStatus);

  const result: EpigenomicsFeatureQualification = {
    schemaName: "EpigenomicsFeatureQualification",
    schemaVersion: "0.1.0",
    featureId: qualification.featureId,
    qualificationStatus: epigenomicsStatus,
    qualificationReasons: buildQualificationReasons(qualification),
    warningRefs,
    humanReviewRequired,
    downstreamUseRule,
  };

  return EpigenomicsFeatureQualificationSchema.parse(result);
}

/**
 * Build a dataset-level qualification summary from epigenomics feature
 * qualifications.
 *
 * The summaryId is deterministic based on dataset content so that
 * identical qualification inputs always yield the same immutable ID.
 */
export function buildDatasetQualificationSummary(
  datasetId: string,
  featureQualifications: EpigenomicsFeatureQualification[],
  globalWarnings: QualificationWarning[],
  options: {
    summaryId?: string;
    generatedAt?: string;
  } = {},
): DatasetQualificationSummary {
  const totalFeatures = featureQualifications.length;

  let acceptedForPodCount = 0;
  let acceptedWithWarningsCount = 0;
  let reviewRequiredCount = 0;
  let exploratoryOnlyCount = 0;
  let excludedCount = 0;
  const excludedByReason: Record<string, number> = {};
  let humanReviewRequired = false;
  let overallDownstreamUseRule:
    | "allow"
    | "allow_with_warning"
    | "review_required"
    | "exploratory_only"
    | "block" = "allow";

  const rulePriority: Record<string, number> = {
    allow: 0,
    allow_with_warning: 1,
    review_required: 2,
    exploratory_only: 3,
    block: 4,
  };

  for (const fq of featureQualifications) {
    switch (fq.qualificationStatus) {
      case "accepted_for_pod":
        acceptedForPodCount++;
        break;
      case "accepted_with_warnings":
        acceptedWithWarningsCount++;
        break;
      case "review_required":
        reviewRequiredCount++;
        break;
      case "exploratory_only":
        exploratoryOnlyCount++;
        break;
      default:
        excludedCount++;
        excludedByReason[fq.qualificationStatus] =
          (excludedByReason[fq.qualificationStatus] || 0) + 1;
        break;
    }

    if (fq.humanReviewRequired) {
      humanReviewRequired = true;
    }

    const featureRulePriority = rulePriority[fq.downstreamUseRule ?? "allow"];
    const currentPriority = rulePriority[overallDownstreamUseRule];
    if (featureRulePriority > currentPriority) {
      overallDownstreamUseRule = fq.downstreamUseRule ?? "allow";
    }
  }

  // Global warnings that block downstream use force the overall rule to at least block
  const hasBlockingGlobalWarning = globalWarnings.some((w) => w.blocksDownstream);
  if (hasBlockingGlobalWarning && rulePriority[overallDownstreamUseRule] < rulePriority.block) {
    overallDownstreamUseRule = "block";
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();

  // Deterministic summary ID based on dataset content
  const summaryId =
    options.summaryId ??
    deterministicId(
      datasetId,
      String(totalFeatures),
      String(acceptedForPodCount),
      String(acceptedWithWarningsCount),
      String(reviewRequiredCount),
      String(exploratoryOnlyCount),
      String(excludedCount),
      overallDownstreamUseRule,
      String(humanReviewRequired),
      generatedAt,
    );

  const summary: DatasetQualificationSummary = {
    schemaName: "DatasetQualificationSummary",
    schemaVersion: "0.1.0",
    summaryId,
    datasetId,
    totalFeatures,
    acceptedForPodCount,
    acceptedWithWarningsCount,
    reviewRequiredCount,
    exploratoryOnlyCount,
    excludedCount,
    excludedByReason,
    overallDownstreamUseRule,
    humanReviewRequired,
    generatedAt,
  };

  return DatasetQualificationSummarySchema.parse(summary);
}

/**
 * Build a complete qualification packet by attaching
 * EpigenomicsFeatureQualification objects to canonical features and
 * generating a dataset qualification summary.
 *
 * All outputs are schema-validated. Object IDs are immutable
 * (deterministically derived from canonical content).
 */
export function buildQualificationPacket(
  packet: EpigenomicsFeatureResponsePacket,
  qualificationResult: QualificationResult,
  options: BuildQualificationPacketOptions = {},
): QualificationPacketResult {
  const datasetId = options.datasetId ?? packet.provenance.datasetId;
  const qualifications = qualificationResult.qualifications ?? [];

  const qualifiedFeatures: QualifiedFeature[] = [];

  for (let i = 0; i < packet.features.length; i++) {
    const feature = packet.features[i];
    const baseQualification = qualifications[i];

    if (!baseQualification) {
      // Fail-closed: if qualification is missing, create an exclusion
      const fallbackQualification: EpigenomicsFeatureQualification =
        EpigenomicsFeatureQualificationSchema.parse({
          schemaName: "EpigenomicsFeatureQualification",
          schemaVersion: "0.1.0",
          featureId: feature.featureId,
          qualificationStatus: "excluded_insufficient_design",
          qualificationReasons: [
            "Qualification result missing for this feature during packet build.",
          ],
          warningRefs: ["EPI099_MISSING_QUALIFICATION"],
          humanReviewRequired: true,
          downstreamUseRule: "block",
        });
      qualifiedFeatures.push({ feature, qualification: fallbackQualification });
      continue;
    }

    const epigenomicsQualification = mapToEpigenomicsFeatureQualification(
      baseQualification,
      datasetId,
    );

    qualifiedFeatures.push({
      feature,
      qualification: epigenomicsQualification,
    });
  }

  const datasetSummary = buildDatasetQualificationSummary(
    datasetId,
    qualifiedFeatures.map((qf) => qf.qualification),
    qualificationResult.warnings,
    {
      summaryId: options.summaryId,
      generatedAt: options.generatedAt,
    },
  );

  return {
    qualifiedFeatures,
    datasetSummary,
    warnings: qualificationResult.warnings,
  };
}
