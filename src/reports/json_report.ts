import type {
  QcProfile,
  EpigenomicsQCReport,
  ConfoundingSummary,
} from "../contracts/qc.js";
import type { QualificationResult } from "../qualification/engine.js";
import type { QualificationWarning } from "../contracts/qualification.js";
import type { ControlAndDoseValidationResult } from "../validators/design_validator.js";
import type { CoordinateSystemValidationResult } from "../validators/coordinate_validator.js";
import type { ClaimGuardResult } from "../qualification/claim_guards.js";

export interface FeatureClassificationSummary {
  totalFeatures: number;
  byClass: Record<string, number>;
  byModality: Record<string, number>;
}

export interface MappingSummary {
  totalFeaturesWithRegion: number;
  mappedFeatures: number;
  nearestGeneOnlyCount: number;
  ambiguousMappings: number;
  pathwayRollupBlockedCount: number;
}

export interface ReportInput {
  datasetId: string;
  designValidation: ControlAndDoseValidationResult;
  coordinateValidation: CoordinateSystemValidationResult;
  platform?: string;
  classificationSummary?: FeatureClassificationSummary;
  qcProfile: QcProfile | EpigenomicsQCReport;
  mappingSummary?: MappingSummary;
  contextSummary?: ConfoundingSummary;
  qualificationResult: QualificationResult;
  claimGuardResult?: ClaimGuardResult;
  generatedAt?: string;
  reportId?: string;
}

export interface ValidationReport {
  reportId: string;
  schemaName: "EpigenomicsValidationReport";
  schemaVersion: "0.1.0";
  datasetId: string;
  generatedAt: string;
  design: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    orderedDoseGroups: unknown[];
    identifiedControlGroupId?: string;
  };
  coordinates: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  platform: {
    declaredPlatform?: string;
    platformNote: string;
  };
  classification: {
    totalFeatures: number;
    byClass: Record<string, number>;
    byModality: Record<string, number>;
  };
  qc: QcProfile | EpigenomicsQCReport;
  mapping: {
    totalFeaturesWithRegion: number;
    mappedFeatures: number;
    nearestGeneOnlyCount: number;
    ambiguousMappings: number;
    pathwayRollupBlockedCount: number;
    mappingNote: string;
  };
  context: {
    cellCompositionStatus?: string;
    cytotoxicityStatus?: string;
    stressResponseStatus?: string;
    differentiationDriftStatus?: string;
    contextNote: string;
  };
  qualification: {
    qualifiedCount: number;
    excludedCount: number;
    totalFeatures: number;
    perFeatureQualifications: Array<{
      featureId: string;
      status: string;
      warnings: number;
      mappedGeneIds: number;
      mappingConfidence?: string;
      mappingMethod?: string;
    }>;
    claimGuardResult?: {
      persistenceStatus: string;
      reversibilityStatus: string;
      heritabilityClaim: string;
    };
  };
  warnings: QualificationWarning[];
  exclusions: string[];
  interpretationLimits: string[];
  refusedInferences: string[];
}

function buildWarnings(input: ReportInput): QualificationWarning[] {
  const warnings: QualificationWarning[] = [
    ...input.qualificationResult.warnings,
  ];

  for (const w of input.designValidation.warnings) {
    warnings.push({
      warningCode: "DESIGN_VALIDATION",
      severity: "warning",
      message: w,
      category: "missing_metadata",
      blocksDownstream: false,
    });
  }

  for (const w of input.coordinateValidation.warnings) {
    warnings.push({
      warningCode: "COORDINATE_VALIDATION",
      severity: "warning",
      message: w,
      category: "coordinate_semantics",
      blocksDownstream: false,
    });
  }

  return warnings;
}

function buildExclusions(input: ReportInput): string[] {
  const exclusions: string[] = [];

  if (!input.designValidation.valid) {
    exclusions.push("design_validation_failed");
  }
  if (!input.coordinateValidation.valid) {
    exclusions.push("coordinate_validation_failed");
  }

  for (const q of input.qualificationResult.qualifications ?? []) {
    if (
      q.status !== "accepted_for_pod" &&
      q.status !== "accepted_with_caveats"
    ) {
      exclusions.push(`${q.featureId}: ${q.status}`);
    }
  }

  return exclusions;
}

function isMissingContext(contextSummary: ConfoundingSummary | undefined): boolean {
  if (contextSummary === undefined) return true;
  const statuses = [
    contextSummary.cellCompositionStatus,
    contextSummary.cytotoxicityStatus,
    contextSummary.stressResponseStatus,
    contextSummary.differentiationDriftStatus,
  ];
  const undefinedOrUnknown = ["not_evaluated", "unknown", "no_context_available"];
  return statuses.some(
    (s) => s === undefined || undefinedOrUnknown.includes(s),
  );
}

function buildRefusedInferences(input: ReportInput): string[] {
  const refused: string[] = [];

  if (isMissingContext(input.contextSummary)) {
    refused.push(
      "The service refused to infer confounding adjustment in the absence of complete cell-composition, cytotoxicity, stress-response, or differentiation-drift context.",
    );
  }

  if (input.mappingSummary && input.mappingSummary.nearestGeneOnlyCount > 0) {
    refused.push(
      "The service refused to infer high-confidence gene targets from nearest-gene-only mappings; pathway rollup is suppressed.",
    );
  }

  if (input.claimGuardResult) {
    if (input.claimGuardResult.persistenceStatus === "not_assessed") {
      refused.push(
        "The service refused to infer persistence of epigenomic changes because the design lacks repeated or recovery timepoints.",
      );
    }
    if (input.claimGuardResult.reversibilityStatus === "not_assessed") {
      refused.push(
        "The service refused to infer reversibility of epigenomic changes because the design lacks repeated or recovery timepoints.",
      );
    }
    if (input.claimGuardResult.heritabilityClaim === "none") {
      refused.push(
        "The service refused to infer heritability or transgenerational transmission because multigenerationalDesign is not explicitly true.",
      );
    }
  }

  return refused;
}

/**
 * Generate a machine-readable JSON validation report from qualification
 * and validation outputs.
 */
export function generateJsonReport(input: ReportInput): ValidationReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const reportId = input.reportId ?? crypto.randomUUID();
  const totalFeatures =
    input.classificationSummary?.totalFeatures ??
    (input.qualificationResult.qualifications?.length ?? 0);

  return {
    reportId,
    schemaName: "EpigenomicsValidationReport",
    schemaVersion: "0.1.0",
    datasetId: input.datasetId,
    generatedAt,
    design: {
      valid: input.designValidation.valid,
      errors: input.designValidation.errors,
      warnings: input.designValidation.warnings,
      orderedDoseGroups: input.designValidation.orderedDoseGroups,
      ...(input.designValidation.identifiedControlGroupId
        ? {
            identifiedControlGroupId:
              input.designValidation.identifiedControlGroupId,
          }
        : {}),
    },
    coordinates: {
      valid: input.coordinateValidation.valid,
      errors: input.coordinateValidation.errors,
      warnings: input.coordinateValidation.warnings,
    },
    platform: {
      declaredPlatform: input.platform,
      platformNote: input.platform ?? "No platform explicitly declared.",
    },
    classification: {
      totalFeatures,
      byClass: input.classificationSummary?.byClass ?? {},
      byModality: input.classificationSummary?.byModality ?? {},
    },
    qc: input.qcProfile,
    mapping: {
      totalFeaturesWithRegion:
        input.mappingSummary?.totalFeaturesWithRegion ?? 0,
      mappedFeatures: input.mappingSummary?.mappedFeatures ?? 0,
      nearestGeneOnlyCount:
        input.mappingSummary?.nearestGeneOnlyCount ?? 0,
      ambiguousMappings: input.mappingSummary?.ambiguousMappings ?? 0,
      pathwayRollupBlockedCount:
        input.mappingSummary?.pathwayRollupBlockedCount ?? 0,
      mappingNote:
        "Region-to-gene mapping does not imply causal target assignment.",
    },
    context: {
      cellCompositionStatus: input.contextSummary?.cellCompositionStatus,
      cytotoxicityStatus: input.contextSummary?.cytotoxicityStatus,
      stressResponseStatus: input.contextSummary?.stressResponseStatus,
      differentiationDriftStatus:
        input.contextSummary?.differentiationDriftStatus,
      contextNote:
        "Confounding context is modelled separately and reported for reviewer awareness.",
    },
    qualification: {
      qualifiedCount: input.qualificationResult.qualifiedCount,
      excludedCount: input.qualificationResult.excludedCount,
      totalFeatures,
      perFeatureQualifications:
        input.qualificationResult.qualifications?.map((q) => ({
          featureId: q.featureId,
          status: q.status,
          warnings: q.warnings.length,
          mappedGeneIds: q.mappedGeneIds?.length ?? 0,
          mappingConfidence: q.mappingConfidence,
          mappingMethod: q.mappingMethod,
        })) ?? [],
      ...(input.claimGuardResult
        ? {
            claimGuardResult: {
              persistenceStatus: input.claimGuardResult.persistenceStatus,
              reversibilityStatus: input.claimGuardResult.reversibilityStatus,
              heritabilityClaim: input.claimGuardResult.heritabilityClaim,
            },
          }
        : {}),
    },
    warnings: buildWarnings(input),
    exclusions: buildExclusions(input),
    interpretationLimits: [
      "This report does not infer causality between epigenomic changes and phenotypic outcomes.",
      "Dose-response modelling is performed by downstream Bioactivity-PoD MCP, not this service.",
      "Pathway roll-up is blocked for nearest-gene-only mappings.",
      "Persistence, reversibility, and heritability claims are guarded by design metadata and may be defaulted to 'not_assessed' or 'none'.",
    ],
    refusedInferences: buildRefusedInferences(input),
  };
}
