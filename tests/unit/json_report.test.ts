import { describe, it, expect } from "vitest";
import {
  generateJsonReport,
  type ReportInput,
} from "../../src/reports/json_report.js";
import type { QualificationResult } from "../../src/qualification/engine.js";
import type { ControlAndDoseValidationResult } from "../../src/validators/design_validator.js";
import type { CoordinateSystemValidationResult } from "../../src/validators/coordinate_validator.js";
import type { QcProfile } from "../../src/contracts/qc.js";

function makeDesignValidation(
  overrides?: Partial<ControlAndDoseValidationResult>,
): ControlAndDoseValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
    orderedDoseGroups: [
      { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
    ],
    identifiedControlGroupId: "ctrl",
    ...overrides,
  };
}

function makeCoordinateValidation(
  overrides?: Partial<CoordinateSystemValidationResult>,
): CoordinateSystemValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
    ...overrides,
  };
}

function makeQcProfile(overrides?: Partial<QcProfile>): QcProfile {
  return {
    datasetId: "ds-001",
    totalFeatures: 2,
    featuresWithMissingValues: 0,
    missingnessRate: 0,
    meanReplicateCorrelation: 0.95,
    minReplicateCorrelation: 0.92,
    varianceAcrossDoses: 0.05,
    designAdequacyFlags: {
      sufficientReplicates: true,
      doseRangeDeclared: true,
      controlsPresent: true,
      batchStructureKnown: true,
      speciesBuildDeclared: true,
    },
    ...overrides,
  };
}

function makeQualificationResult(
  overrides?: Partial<QualificationResult>,
): QualificationResult {
  return {
    qualifiedCount: 2,
    excludedCount: 0,
    warnings: [],
    qualifications: [
      {
        featureId: "cg00000001",
        status: "accepted_for_pod",
        warnings: [],
        mappedGeneIds: ["BRCA1"],
        mappingConfidence: "high",
        mappingMethod: "direct_promoter_overlap",
      },
      {
        featureId: "cg00000002",
        status: "accepted_for_pod",
        warnings: [],
        mappedGeneIds: ["TP53"],
        mappingConfidence: "medium",
        mappingMethod: "nearest_gene",
      },
    ],
    claimGuardResult: {
      persistenceStatus: "not_assessed",
      reversibilityStatus: "not_assessed",
      heritabilityClaim: "none",
    },
    ...overrides,
  };
}

function makeReportInput(overrides?: Partial<ReportInput>): ReportInput {
  return {
    datasetId: "ds-001",
    designValidation: makeDesignValidation(),
    coordinateValidation: makeCoordinateValidation(),
    platform: "Illumina EPIC",
    classificationSummary: {
      totalFeatures: 2,
      byClass: { cpg_methylation: 2 },
      byModality: { dna_methylation_array: 2 },
    },
    qcProfile: makeQcProfile(),
    mappingSummary: {
      totalFeaturesWithRegion: 2,
      mappedFeatures: 2,
      nearestGeneOnlyCount: 1,
      ambiguousMappings: 0,
      pathwayRollupBlockedCount: 1,
    },
    contextSummary: {
      cellCompositionStatus: "not_evaluated",
      cytotoxicityStatus: "unknown",
    },
    qualificationResult: makeQualificationResult(),
    claimGuardResult: {
      persistenceStatus: "not_assessed",
      reversibilityStatus: "not_assessed",
      heritabilityClaim: "none",
    },
    generatedAt: "2026-05-05T00:00:00.000Z",
    reportId: "report-001",
    ...overrides,
  };
}

describe("generateJsonReport", () => {
  it("produces a stable machine-readable report", () => {
    const input = makeReportInput();
    const report = generateJsonReport(input);

    expect(report.schemaName).toBe("EpigenomicsValidationReport");
    expect(report.schemaVersion).toBe("0.1.0");
    expect(report.reportId).toBe("report-001");
    expect(report.datasetId).toBe("ds-001");
    expect(report.generatedAt).toBe("2026-05-05T00:00:00.000Z");
  });

  it("matches snapshot for full report", () => {
    const input = makeReportInput();
    const report = generateJsonReport(input);
    expect(report).toMatchSnapshot();
  });

  it("includes design validation results", () => {
    const input = makeReportInput({
      designValidation: makeDesignValidation({
        valid: false,
        errors: ["Missing control group"],
        warnings: ["Low replicate count"],
      }),
    });
    const report = generateJsonReport(input);

    expect(report.design.valid).toBe(false);
    expect(report.design.errors).toContain("Missing control group");
    expect(report.design.warnings).toContain("Low replicate count");
    expect(report.exclusions).toContain("design_validation_failed");
  });

  it("includes coordinate validation results", () => {
    const input = makeReportInput({
      coordinateValidation: makeCoordinateValidation({
        valid: false,
        errors: ["EPI002: Feature f1 is region-bearing but has no coordinate system declaration"],
      }),
    });
    const report = generateJsonReport(input);

    expect(report.coordinates.valid).toBe(false);
    expect(report.coordinates.errors).toContain(
      "EPI002: Feature f1 is region-bearing but has no coordinate system declaration",
    );
    expect(report.exclusions).toContain("coordinate_validation_failed");
  });

  it("includes platform and classification summaries", () => {
    const input = makeReportInput();
    const report = generateJsonReport(input);

    expect(report.platform.declaredPlatform).toBe("Illumina EPIC");
    expect(report.classification.totalFeatures).toBe(2);
    expect(report.classification.byClass.cpg_methylation).toBe(2);
    expect(report.classification.byModality.dna_methylation_array).toBe(2);
  });

  it("includes qc profile", () => {
    const input = makeReportInput();
    const report = generateJsonReport(input);

    expect(report.qc).toMatchObject(input.qcProfile);
  });

  it("includes mapping summary with caveats", () => {
    const input = makeReportInput();
    const report = generateJsonReport(input);

    expect(report.mapping.totalFeaturesWithRegion).toBe(2);
    expect(report.mapping.nearestGeneOnlyCount).toBe(1);
    expect(report.mapping.mappingNote).toBe(
      "Region-to-gene mapping does not imply causal target assignment.",
    );
  });

  it("includes qualification results", () => {
    const input = makeReportInput();
    const report = generateJsonReport(input);

    expect(report.qualification.qualifiedCount).toBe(2);
    expect(report.qualification.excludedCount).toBe(0);
    expect(report.qualification.totalFeatures).toBe(2);
    expect(report.qualification.perFeatureQualifications).toHaveLength(2);
    expect(report.qualification.claimGuardResult).toEqual({
      persistenceStatus: "not_assessed",
      reversibilityStatus: "not_assessed",
      heritabilityClaim: "none",
    });
  });

  it("accumulates warnings from all sources", () => {
    const input = makeReportInput({
      designValidation: makeDesignValidation({
        warnings: ["dose unit mixed"],
      }),
      coordinateValidation: makeCoordinateValidation({
        warnings: ["non-standard coordinate system"],
      }),
      qualificationResult: makeQualificationResult({
        warnings: [
          {
            warningCode: "EPI001",
            severity: "warning",
            message: "batch effect detected",
            category: "batch_effect",
            blocksDownstream: false,
          },
        ],
      }),
    });
    const report = generateJsonReport(input);

    const codes = report.warnings.map((w) => w.warningCode);
    expect(codes).toContain("EPI001");
    expect(codes).toContain("DESIGN_VALIDATION");
    expect(codes).toContain("COORDINATE_VALIDATION");
  });

  it("lists exclusions for non-accepted features", () => {
    const input = makeReportInput({
      qualificationResult: makeQualificationResult({
        qualifiedCount: 1,
        excludedCount: 1,
        qualifications: [
          {
            featureId: "cg00000001",
            status: "accepted_for_pod",
            warnings: [],
          },
          {
            featureId: "cg00000002",
            status: "excluded_qc_failure",
            warnings: [],
          },
        ],
      }),
    });
    const report = generateJsonReport(input);

    expect(report.exclusions).toContain("cg00000002: excluded_qc_failure");
    expect(report.exclusions).not.toContain("cg00000001: accepted_for_pod");
  });

  it("states interpretation limits", () => {
    const input = makeReportInput();
    const report = generateJsonReport(input);

    expect(report.interpretationLimits).toContain(
      "This report does not infer causality between epigenomic changes and phenotypic outcomes.",
    );
    expect(report.interpretationLimits).toContain(
      "Dose-response modelling is performed by downstream Bioactivity-PoD MCP, not this service.",
    );
    expect(report.interpretationLimits).toContain(
      "Pathway roll-up is blocked for nearest-gene-only mappings.",
    );
  });

  it("states refused inferences for missing context", () => {
    const input = makeReportInput();
    const report = generateJsonReport(input);

    expect(report.refusedInferences).toContain(
      "The service refused to infer confounding adjustment in the absence of complete cell-composition, cytotoxicity, stress-response, or differentiation-drift context.",
    );
  });

  it("states refused inferences for nearest-gene-only mapping", () => {
    const input = makeReportInput();
    const report = generateJsonReport(input);

    expect(report.refusedInferences).toContain(
      "The service refused to infer high-confidence gene targets from nearest-gene-only mappings; pathway rollup is suppressed.",
    );
  });

  it("states refused inferences for unsupported persistence and heredity claims", () => {
    const input = makeReportInput();
    const report = generateJsonReport(input);

    expect(report.refusedInferences).toContain(
      "The service refused to infer persistence of epigenomic changes because the design lacks repeated or recovery timepoints.",
    );
    expect(report.refusedInferences).toContain(
      "The service refused to infer reversibility of epigenomic changes because the design lacks repeated or recovery timepoints.",
    );
    expect(report.refusedInferences).toContain(
      "The service refused to infer heritability or transgenerational transmission because multigenerationalDesign is not explicitly true.",
    );
  });

  it("does not refuse inferences when context is complete", () => {
    const input = makeReportInput({
      contextSummary: {
        cellCompositionStatus: "not_detected",
        cytotoxicityStatus: "not_detected",
        stressResponseStatus: "not_detected",
        differentiationDriftStatus: "not_detected",
      },
      mappingSummary: {
        totalFeaturesWithRegion: 2,
        mappedFeatures: 2,
        nearestGeneOnlyCount: 0,
        ambiguousMappings: 0,
        pathwayRollupBlockedCount: 0,
      },
      claimGuardResult: {
        persistenceStatus: "persistent",
        reversibilityStatus: "reversible",
        heritabilityClaim: "heritable",
      },
    });
    const report = generateJsonReport(input);

    expect(report.refusedInferences).toHaveLength(0);
  });

  it("falls back to qualification count when classification summary is absent", () => {
    const input = makeReportInput({
      classificationSummary: undefined,
    });
    const report = generateJsonReport(input);

    expect(report.classification.totalFeatures).toBe(2);
  });
});
