import { describe, it, expect } from "vitest";
import {
  generateMarkdownReport,
  type ReportInput,
} from "../../src/reports/markdown_report.js";
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

describe("generateMarkdownReport", () => {
  it("produces a Markdown report with required sections", () => {
    const input = makeReportInput();
    const md = generateMarkdownReport(input);

    expect(md).toContain("# Epigenomics Validation Report");
    expect(md).toContain("## Design Validation");
    expect(md).toContain("## Coordinate Validation");
    expect(md).toContain("## Platform");
    expect(md).toContain("## Feature Classification");
    expect(md).toContain("## QC Profile");
    expect(md).toContain("## Mapping Summary");
    expect(md).toContain("## Context Summary");
    expect(md).toContain("## Qualification Results");
    expect(md).toContain("## Warnings");
    expect(md).toContain("## Exclusions");
    expect(md).toContain("## Interpretation Limits");
    expect(md).toContain("## Refused Inferences");
  });

  it("matches snapshot for full report", () => {
    const input = makeReportInput();
    const md = generateMarkdownReport(input);
    expect(md).toMatchSnapshot();
  });

  it("includes mandatory caveat for missing context", () => {
    const input = makeReportInput();
    const md = generateMarkdownReport(input);

    expect(md).toContain(
      "Missing confounding context (cell composition, cytotoxicity, stress response, or differentiation drift).",
    );
    expect(md).toContain(
      "The service refused to infer confounding adjustment without this information.",
    );
  });

  it("includes mandatory caveat for nearest-gene-only mapping", () => {
    const input = makeReportInput();
    const md = generateMarkdownReport(input);

    expect(md).toContain(
      "Nearest-gene-only mappings represent low-confidence contextual linkage; the service suppresses pathway rollup for these features.",
    );
  });

  it("includes mandatory caveat for unsupported persistence claim", () => {
    const input = makeReportInput();
    const md = generateMarkdownReport(input);

    expect(md).toContain(
      "The service refused to infer persistence of epigenomic changes because the design lacks repeated or recovery timepoints.",
    );
  });

  it("includes mandatory caveat for unsupported reversibility claim", () => {
    const input = makeReportInput();
    const md = generateMarkdownReport(input);

    expect(md).toContain(
      "The service refused to infer reversibility of epigenomic changes because the design lacks repeated or recovery timepoints.",
    );
  });

  it("includes mandatory caveat for unsupported heredity claim", () => {
    const input = makeReportInput();
    const md = generateMarkdownReport(input);

    expect(md).toContain(
      "The service refused to infer heritability or transgenerational transmission because multigenerationalDesign is not explicitly true.",
    );
  });

  it("does not include missing-context caveat when context is complete", () => {
    const input = makeReportInput({
      contextSummary: {
        cellCompositionStatus: "not_detected",
        cytotoxicityStatus: "not_detected",
        stressResponseStatus: "not_detected",
        differentiationDriftStatus: "not_detected",
      },
    });
    const md = generateMarkdownReport(input);

    expect(md).not.toContain(
      "Missing confounding context (cell composition, cytotoxicity, stress response, or differentiation drift).",
    );
  });

  it("does not include nearest-gene caveat when no nearest-gene mappings exist", () => {
    const input = makeReportInput({
      mappingSummary: {
        totalFeaturesWithRegion: 2,
        mappedFeatures: 2,
        nearestGeneOnlyCount: 0,
        ambiguousMappings: 0,
        pathwayRollupBlockedCount: 0,
      },
    });
    const md = generateMarkdownReport(input);

    expect(md).not.toContain(
      "Nearest-gene-only mappings represent low-confidence contextual linkage",
    );
  });

  it("includes design errors when validation fails", () => {
    const input = makeReportInput({
      designValidation: makeDesignValidation({
        valid: false,
        errors: ["Missing control group"],
      }),
    });
    const md = generateMarkdownReport(input);

    expect(md).toContain("Missing control group");
    expect(md).toContain("design_validation_failed");
  });

  it("includes coordinate errors when validation fails", () => {
    const input = makeReportInput({
      coordinateValidation: makeCoordinateValidation({
        valid: false,
        errors: ["EPI002: unsupported coordinate system"],
      }),
    });
    const md = generateMarkdownReport(input);

    expect(md).toContain("EPI002: unsupported coordinate system");
    expect(md).toContain("coordinate_validation_failed");
  });

  it("includes interpretation limits", () => {
    const input = makeReportInput();
    const md = generateMarkdownReport(input);

    expect(md).toContain(
      "This report does not infer causality between epigenomic changes and phenotypic outcomes.",
    );
    expect(md).toContain(
      "Dose-response modelling is performed by downstream Bioactivity-PoD MCP, not this service.",
    );
    expect(md).toContain(
      "Pathway roll-up is blocked for nearest-gene-only mappings.",
    );
  });

  it("renders platform as None when not declared", () => {
    const input = makeReportInput({ platform: undefined });
    const md = generateMarkdownReport(input);

    expect(md).toContain("- **Declared Platform:** None");
  });

  it("renders classification summary when provided", () => {
    const input = makeReportInput();
    const md = generateMarkdownReport(input);

    expect(md).toContain("- **Total Features:** 2");
    expect(md).toContain("- cpg_methylation: 2");
    expect(md).toContain("- dna_methylation_array: 2");
  });

  it("renders claim guard results when provided", () => {
    const input = makeReportInput();
    const md = generateMarkdownReport(input);

    expect(md).toContain("### Claim Guard Results");
    expect(md).toContain("- **Persistence Status:** not_assessed");
    expect(md).toContain("- **Reversibility Status:** not_assessed");
    expect(md).toContain("- **Heritability Claim:** none");
  });
});
