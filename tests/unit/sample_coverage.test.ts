import { describe, it, expect } from "vitest";
import {
  validateSampleCoverage,
  SampleCoverageValidationResultSchema,
  SampleCoverageDiscrepancySchema,
  SampleCoverageDetailSchema,
  CoverageDiscrepancyScopeSchema,
  CoverageMismatchDirectionSchema,
} from "../../src/validators/sample_coverage.js";
import type { EpigenomicFeatureMatrix } from "../../src/contracts/features.js";
import type { ExperimentalDesign } from "../../src/contracts/design.js";

function makeMatrix(
  overrides: Partial<EpigenomicFeatureMatrix> = {},
): EpigenomicFeatureMatrix {
  return {
    matrixId: "matrix-001",
    featureIds: ["cg001", "cg002"],
    sampleIds: ["s1", "s2", "s3"],
    wideValues: {
      cg001: { s1: 0.82, s2: 0.85, s3: 0.88 },
      cg002: { s1: 0.45, s2: 0.48, s3: 0.51 },
    },
    ...overrides,
  };
}

function makeDesign(
  overrides: Partial<ExperimentalDesign> = {},
): ExperimentalDesign {
  return {
    designId: "design-001",
    species: "Homo sapiens",
    doseGroups: [
      { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
    ],
    samples: [
      {
        sampleId: "s1",
        doseGroupId: "ctrl",
        species: "Homo sapiens",
        controlFlag: true,
      },
      {
        sampleId: "s2",
        doseGroupId: "low",
        species: "Homo sapiens",
      },
      {
        sampleId: "s3",
        doseGroupId: "high",
        species: "Homo sapiens",
      },
    ],
    hasControls: true,
    minReplicatesPerGroup: 1,
    ...overrides,
  };
}

// ── Complete valid coverage ──

describe("validateSampleCoverage - complete valid coverage", () => {
  it("passes when all matrix samples match design samples bidirectionally (wide form)", () => {
    const matrix = makeMatrix();
    const design = makeDesign();

    const result = validateSampleCoverage(matrix, design);

    expect(result.valid).toBe(true);
    expect(result.coverageComplete).toBe(true);
    expect(result.blocksDownstream).toBe(false);
    expect(result.designSamples).toBe(3);
    expect(result.matrixSamples).toBe(3);
    expect(result.matchedSamples).toBe(3);
    expect(result.unmatchedMatrixSamples).toHaveLength(0);
    expect(result.unmatchedDesignSamples).toHaveLength(0);
    expect(result.samplesMissingGroup).toHaveLength(0);
    expect(result.discrepancies).toHaveLength(0);
  });

  it("passes when all matrix samples match design samples bidirectionally (long form)", () => {
    const matrix: EpigenomicFeatureMatrix = {
      matrixId: "matrix-long-001",
      featureIds: ["cg001"],
      sampleIds: ["s1", "s2"],
      longValues: [
        { featureId: "cg001", sampleId: "s1", value: 0.82 },
        { featureId: "cg001", sampleId: "s2", value: 0.85 },
      ],
    };
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s2",
          doseGroupId: "low",
          species: "Homo sapiens",
        },
      ],
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
    });

    const result = validateSampleCoverage(matrix, design);

    expect(result.valid).toBe(true);
    expect(result.coverageComplete).toBe(true);
    expect(result.matrixSamples).toBe(2);
    expect(result.matchedSamples).toBe(2);
    expect(result.discrepancies).toHaveLength(0);
  });

  it("produces per-sample detail for every sample", () => {
    const matrix = makeMatrix();
    const design = makeDesign();

    const result = validateSampleCoverage(matrix, design);

    expect(result.samples).toHaveLength(3);
    for (const s of result.samples) {
      expect(s.presentInDesign).toBe(true);
      expect(s.presentInMatrix).toBe(true);
      expect(s.hasGroupAssignment).toBe(true);
    }
  });

  it("validates against SampleCoverageValidationResultSchema", () => {
    const matrix = makeMatrix();
    const design = makeDesign();

    const result = validateSampleCoverage(matrix, design);
    expect(() => SampleCoverageValidationResultSchema.parse(result)).not.toThrow();
  });
});

// ── Unmatched matrix samples ──

describe("validateSampleCoverage - unmatched matrix samples", () => {
  it("fails when a wide-form sample column is not in design", () => {
    const matrix = makeMatrix({
      sampleIds: ["s1", "s2", "s_unknown"],
      wideValues: {
        cg001: { s1: 0.82, s2: 0.85, s_unknown: 0.99 },
        cg002: { s1: 0.45, s2: 0.48, s_unknown: 0.55 },
      },
    });
    const design = makeDesign();

    const result = validateSampleCoverage(matrix, design);

    expect(result.valid).toBe(false);
    expect(result.coverageComplete).toBe(false);
    expect(result.blocksDownstream).toBe(true);
    expect(result.unmatchedMatrixSamples).toEqual(["s_unknown"]);

    const disc = result.discrepancies.find(
      (d) => d.sampleId === "s_unknown",
    );
    expect(disc).toBeDefined();
    expect(disc!.scope).toBe("column");
    expect(disc!.direction).toBe("matrix_to_design");
    expect(disc!.errorCode).toBe("EPIC001_UNMATCHED_MATRIX_SAMPLE");
    expect(disc!.message).toContain("s_unknown");
  });

  it("fails when a long-form sample_id is not in design", () => {
    const matrix: EpigenomicFeatureMatrix = {
      matrixId: "matrix-long-001",
      featureIds: ["cg001"],
      sampleIds: ["s1", "s_unknown"],
      longValues: [
        { featureId: "cg001", sampleId: "s1", value: 0.82 },
        { featureId: "cg001", sampleId: "s_unknown", value: 0.99 },
      ],
    };
    const design = makeDesign();

    const result = validateSampleCoverage(matrix, design);

    expect(result.valid).toBe(false);
    expect(result.unmatchedMatrixSamples).toEqual(["s_unknown"]);

    const disc = result.discrepancies.find(
      (d) => d.sampleId === "s_unknown",
    );
    expect(disc).toBeDefined();
    expect(disc!.scope).toBe("row");
    expect(disc!.direction).toBe("matrix_to_design");
  });

  it("flags multiple unmatched matrix samples", () => {
    const matrix = makeMatrix({
      sampleIds: ["s1", "s_extra_a", "s_extra_b"],
      wideValues: {
        cg001: { s1: 0.82, s_extra_a: 0.85, s_extra_b: 0.88 },
        cg002: { s1: 0.45, s_extra_a: 0.48, s_extra_b: 0.51 },
      },
    });
    const design = makeDesign();

    const result = validateSampleCoverage(matrix, design);

    expect(result.unmatchedMatrixSamples).toEqual(["s_extra_a", "s_extra_b"]);
    expect(result.discrepancies.filter((d) => d.direction === "matrix_to_design")).toHaveLength(2);
  });
});

// ── Extra design samples ──

describe("validateSampleCoverage - extra design samples", () => {
  it("fails when a design sample is missing from the matrix", () => {
    const matrix = makeMatrix({
      sampleIds: ["s1", "s2"],
      wideValues: {
        cg001: { s1: 0.82, s2: 0.85 },
        cg002: { s1: 0.45, s2: 0.48 },
      },
    });
    const design = makeDesign();

    const result = validateSampleCoverage(matrix, design);

    expect(result.valid).toBe(false);
    expect(result.coverageComplete).toBe(false);
    expect(result.unmatchedDesignSamples).toEqual(["s3"]);
    expect(result.blocksDownstream).toBe(true);

    const disc = result.discrepancies.find((d) => d.sampleId === "s3");
    expect(disc).toBeDefined();
    expect(disc!.scope).toBe("dataset");
    expect(disc!.direction).toBe("design_to_matrix");
    expect(disc!.errorCode).toBe("EPIC002_UNMATCHED_DESIGN_SAMPLE");
  });

  it("flags multiple extra design samples", () => {
    const matrix = makeMatrix({
      sampleIds: ["s1"],
      wideValues: {
        cg001: { s1: 0.82 },
        cg002: { s1: 0.45 },
      },
    });
    const design = makeDesign();

    const result = validateSampleCoverage(matrix, design);

    expect(result.unmatchedDesignSamples).toEqual(["s2", "s3"]);
    expect(result.discrepancies.filter((d) => d.direction === "design_to_matrix")).toHaveLength(2);
  });
});

// ── Missing group assignments ──

describe("validateSampleCoverage - missing group assignments", () => {
  it("fails when a design sample has an empty doseGroupId", () => {
    const matrix = makeMatrix();
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s2",
          doseGroupId: "",
          species: "Homo sapiens",
        },
        {
          sampleId: "s3",
          doseGroupId: "high",
          species: "Homo sapiens",
        },
      ],
    });

    const result = validateSampleCoverage(matrix, design);

    expect(result.valid).toBe(false);
    expect(result.samplesMissingGroup).toEqual(["s2"]);

    const disc = result.discrepancies.find((d) => d.sampleId === "s2");
    expect(disc).toBeDefined();
    expect(disc!.errorCode).toBe("EPIC003_MISSING_GROUP_ASSIGNMENT");
    expect(disc!.message).toContain("missing or empty doseGroupId");
  });

  it("flags multiple samples missing group assignments", () => {
    const matrix = makeMatrix();
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "",
          species: "Homo sapiens",
        },
        {
          sampleId: "s2",
          doseGroupId: "",
          species: "Homo sapiens",
        },
        {
          sampleId: "s3",
          doseGroupId: "high",
          species: "Homo sapiens",
        },
      ],
    });

    const result = validateSampleCoverage(matrix, design);

    expect(result.samplesMissingGroup).toEqual(["s1", "s2"]);
    expect(
      result.discrepancies.filter(
        (d) => d.errorCode === "EPIC003_MISSING_GROUP_ASSIGNMENT",
      ),
    ).toHaveLength(2);
  });
});

// ── Duplicate sample assignments ──

describe("validateSampleCoverage - duplicate sample assignments", () => {
  it("fails when design contains duplicate sample IDs", () => {
    const matrix = makeMatrix();
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s1",
          doseGroupId: "low",
          species: "Homo sapiens",
        },
        {
          sampleId: "s3",
          doseGroupId: "high",
          species: "Homo sapiens",
        },
      ],
    });

    const result = validateSampleCoverage(matrix, design);

    expect(result.valid).toBe(false);
    expect(result.duplicateDesignSamples).toEqual(["s1"]);
    expect(result.blocksDownstream).toBe(true);

    const disc = result.discrepancies.find(
      (d) => d.errorCode === "EPIC004_DUPLICATE_DESIGN_SAMPLE",
    );
    expect(disc).toBeDefined();
    expect(disc!.sampleId).toBe("s1");
    expect(disc!.scope).toBe("dataset");
  });

  it("fails when matrix contains duplicate sample IDs", () => {
    const matrix = makeMatrix({
      sampleIds: ["s1", "s1", "s2"],
      wideValues: {
        cg001: { s1: 0.82, s2: 0.85 },
        cg002: { s1: 0.45, s2: 0.48 },
      },
    });
    const design = makeDesign();

    const result = validateSampleCoverage(matrix, design);

    expect(result.valid).toBe(false);
    expect(result.duplicateMatrixSamples).toEqual(["s1"]);
    expect(result.blocksDownstream).toBe(true);

    const disc = result.discrepancies.find(
      (d) => d.errorCode === "EPIC005_DUPLICATE_MATRIX_SAMPLE",
    );
    expect(disc).toBeDefined();
    expect(disc!.sampleId).toBe("s1");
    expect(disc!.scope).toBe("dataset");
  });

  it("flags both design and matrix duplicates when both exist", () => {
    const matrix = makeMatrix({
      sampleIds: ["s1", "s1", "s2"],
      wideValues: {
        cg001: { s1: 0.82, s2: 0.85 },
        cg002: { s1: 0.45, s2: 0.48 },
      },
    });
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s1",
          doseGroupId: "low",
          species: "Homo sapiens",
        },
        {
          sampleId: "s2",
          doseGroupId: "high",
          species: "Homo sapiens",
        },
      ],
    });

    const result = validateSampleCoverage(matrix, design);

    expect(result.duplicateDesignSamples).toEqual(["s1"]);
    expect(result.duplicateMatrixSamples).toEqual(["s1"]);
    expect(
      result.discrepancies.filter(
        (d) =>
          d.errorCode === "EPIC004_DUPLICATE_DESIGN_SAMPLE" ||
          d.errorCode === "EPIC005_DUPLICATE_MATRIX_SAMPLE",
      ),
    ).toHaveLength(2);
  });
});

// ── Combined issues ──

describe("validateSampleCoverage - combined issues", () => {
  it("accumulates unmatched matrix samples, extra design samples, and missing groups", () => {
    const matrix = makeMatrix({
      sampleIds: ["s1", "s_unknown"],
      wideValues: {
        cg001: { s1: 0.82, s_unknown: 0.99 },
        cg002: { s1: 0.45, s_unknown: 0.55 },
      },
    });
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s2",
          doseGroupId: "",
          species: "Homo sapiens",
        },
        {
          sampleId: "s3",
          doseGroupId: "high",
          species: "Homo sapiens",
        },
      ],
    });

    const result = validateSampleCoverage(matrix, design);

    expect(result.valid).toBe(false);
    expect(result.unmatchedMatrixSamples).toEqual(["s_unknown"]);
    expect(result.unmatchedDesignSamples).toEqual(["s2", "s3"]);
    expect(result.samplesMissingGroup).toEqual(["s2"]);
    expect(result.discrepancies.length).toBeGreaterThanOrEqual(3);
  });

  it("counts matched samples correctly when only partial overlap exists", () => {
    const matrix = makeMatrix({
      sampleIds: ["s1", "s4"],
      wideValues: {
        cg001: { s1: 0.82, s4: 0.99 },
        cg002: { s1: 0.45, s4: 0.55 },
      },
    });
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s2",
          doseGroupId: "low",
          species: "Homo sapiens",
        },
      ],
    });

    const result = validateSampleCoverage(matrix, design);

    expect(result.matchedSamples).toBe(1); // only s1
    expect(result.matrixSamples).toBe(2);
    expect(result.designSamples).toBe(2);
  });
});

// ── Edge cases ──

describe("validateSampleCoverage - edge cases", () => {
  it("handles empty matrix sample list", () => {
    const matrix = makeMatrix({
      sampleIds: [],
      wideValues: {},
    });
    const design = makeDesign();

    const result = validateSampleCoverage(matrix, design);

    expect(result.valid).toBe(false);
    expect(result.matrixSamples).toBe(0);
    expect(result.unmatchedDesignSamples).toEqual(["s1", "s2", "s3"]);
  });

  it("handles empty design sample list", () => {
    const matrix = makeMatrix();
    const design = makeDesign({
      samples: [],
      doseGroups: [],
    });

    const result = validateSampleCoverage(matrix, design);

    expect(result.valid).toBe(false);
    expect(result.designSamples).toBe(0);
    expect(result.unmatchedMatrixSamples).toEqual(["s1", "s2", "s3"]);
  });

  it("is deterministic: same inputs produce identical outputs", () => {
    const matrix = makeMatrix();
    const design = makeDesign();

    const r1 = validateSampleCoverage(matrix, design);
    const r2 = validateSampleCoverage(matrix, design);
    expect(r1).toEqual(r2);
  });

  it("includes all unique sample IDs in per-sample detail even with mismatches", () => {
    const matrix = makeMatrix({ sampleIds: ["s1", "s_extra"] });
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s_design_only",
          doseGroupId: "low",
          species: "Homo sapiens",
        },
      ],
    });

    const result = validateSampleCoverage(matrix, design);

    const ids = result.samples.map((s) => s.sampleId);
    expect(ids).toContain("s1");
    expect(ids).toContain("s_extra");
    expect(ids).toContain("s_design_only");
    expect(ids).toHaveLength(3);
  });
});

// ── Schema validation ──

describe("SampleCoverage schemas", () => {
  it("accepts valid discrepancy scopes", () => {
    expect(CoverageDiscrepancyScopeSchema.parse("column")).toBe("column");
    expect(CoverageDiscrepancyScopeSchema.parse("row")).toBe("row");
    expect(CoverageDiscrepancyScopeSchema.parse("dataset")).toBe("dataset");
  });

  it("rejects invalid discrepancy scopes", () => {
    expect(() => CoverageDiscrepancyScopeSchema.parse("cell")).toThrow();
  });

  it("accepts valid mismatch directions", () => {
    expect(CoverageMismatchDirectionSchema.parse("matrix_to_design")).toBe(
      "matrix_to_design",
    );
    expect(CoverageMismatchDirectionSchema.parse("design_to_matrix")).toBe(
      "design_to_matrix",
    );
  });

  it("rejects invalid mismatch directions", () => {
    expect(() =>
      CoverageMismatchDirectionSchema.parse("unknown"),
    ).toThrow();
  });

  it("validates SampleCoverageDiscrepancySchema", () => {
    const disc = {
      scope: "column",
      direction: "matrix_to_design",
      sampleId: "s1",
      message: "test",
      errorCode: "TEST001",
    };
    expect(() => SampleCoverageDiscrepancySchema.parse(disc)).not.toThrow();
  });

  it("validates SampleCoverageDetailSchema", () => {
    const detail = {
      sampleId: "s1",
      presentInDesign: true,
      presentInMatrix: true,
      doseGroupId: "ctrl",
      hasGroupAssignment: true,
    };
    expect(() => SampleCoverageDetailSchema.parse(detail)).not.toThrow();
  });
});
