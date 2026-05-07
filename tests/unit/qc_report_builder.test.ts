import { describe, it, expect } from "vitest";
import {
  summarizeBatchProvenance,
  BatchCorrectionProvenanceSchema,
  BatchProvenanceSummarySchema,
} from "../../src/qc/report_builder.js";
import type { ExperimentalDesign } from "../../src/contracts/design.js";

function makeDesign(overrides?: Partial<ExperimentalDesign>): ExperimentalDesign {
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
        batchId: "batch1",
      },
      {
        sampleId: "s2",
        doseGroupId: "ctrl",
        species: "Homo sapiens",
        controlFlag: true,
        batchId: "batch1",
      },
      { sampleId: "s3", doseGroupId: "low", species: "Homo sapiens", batchId: "batch1" },
      { sampleId: "s4", doseGroupId: "low", species: "Homo sapiens", batchId: "batch1" },
      { sampleId: "s5", doseGroupId: "high", species: "Homo sapiens", batchId: "batch2" },
      { sampleId: "s6", doseGroupId: "high", species: "Homo sapiens", batchId: "batch2" },
    ],
    hasControls: true,
    minReplicatesPerGroup: 2,
    ...overrides,
  } as ExperimentalDesign;
}

describe("summarizeBatchProvenance", () => {
  it("warns when batch metadata is completely missing", () => {
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
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
      ],
    });

    const result = summarizeBatchProvenance("ds-001", design);

    expect(result.batchIdCompleteness).toBe(0);
    expect(result.samplesWithBatchId).toBe(0);
    expect(result.doseBatchConfoundingDetected).toBe(false);
    expect(
      result.warnings.some((w) => w.warningCode === "BATCH_MISSING_METADATA"),
    ).toBe(true);
    expect(BatchProvenanceSummarySchema.safeParse(result).success).toBe(true);
  });

  it("warns when upstream correction is declared without parameters", () => {
    const design = makeDesign();

    const result = summarizeBatchProvenance("ds-002", design, {
      method: "ComBat",
      preCorrectionBatchStructureAvailable: true,
    });

    expect(result.upstreamCorrection).toBeDefined();
    expect(result.upstreamCorrection!.method).toBe("ComBat");
    expect(
      result.warnings.some(
        (w) => w.warningCode === "BATCH_CORRECTION_NO_PARAMS",
      ),
    ).toBe(true);
    expect(BatchProvenanceSummarySchema.safeParse(result).success).toBe(true);
  });

  it("returns complete batch provenance with no warnings when everything is declared", () => {
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
          batchId: "batch1",
        },
        {
          sampleId: "s2",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
          batchId: "batch2",
        },
        {
          sampleId: "s3",
          doseGroupId: "low",
          species: "Homo sapiens",
          batchId: "batch1",
        },
        {
          sampleId: "s4",
          doseGroupId: "low",
          species: "Homo sapiens",
          batchId: "batch2",
        },
        {
          sampleId: "s5",
          doseGroupId: "high",
          species: "Homo sapiens",
          batchId: "batch1",
        },
        {
          sampleId: "s6",
          doseGroupId: "high",
          species: "Homo sapiens",
          batchId: "batch2",
        },
      ],
    });

    const result = summarizeBatchProvenance("ds-003", design, {
      method: "ComBat",
      parameters: { batchColumn: "batch_id", covariates: ["age", "sex"] },
      preCorrectionBatchStructureAvailable: true,
    });

    expect(result.batchIdCompleteness).toBe(1);
    expect(result.samplesWithBatchId).toBe(6);
    expect(result.doseBatchConfoundingDetected).toBe(false);
    expect(result.confoundedDoseGroups).toHaveLength(0);
    expect(result.upstreamCorrection).toBeDefined();
    expect(result.upstreamCorrection!.method).toBe("ComBat");
    expect(
      result.upstreamCorrection!.preCorrectionBatchStructureAvailable,
    ).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(BatchProvenanceSummarySchema.safeParse(result).success).toBe(true);
  });

  it("detects and propagates dose-batch confounding", () => {
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
          batchId: "batch1",
        },
        {
          sampleId: "s2",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
          batchId: "batch1",
        },
        {
          sampleId: "s3",
          doseGroupId: "low",
          species: "Homo sapiens",
          batchId: "batch1",
        },
        {
          sampleId: "s4",
          doseGroupId: "low",
          species: "Homo sapiens",
          batchId: "batch1",
        },
        {
          sampleId: "s5",
          doseGroupId: "high",
          species: "Homo sapiens",
          batchId: "batch2",
        },
        {
          sampleId: "s6",
          doseGroupId: "high",
          species: "Homo sapiens",
          batchId: "batch2",
        },
      ],
    });

    const result = summarizeBatchProvenance("ds-004", design);

    expect(result.doseBatchConfoundingDetected).toBe(true);
    expect(result.confoundedDoseGroups).toContain("ctrl");
    expect(result.confoundedDoseGroups).toContain("low");
    expect(result.confoundedDoseGroups).toContain("high");
    expect(
      result.warnings.some(
        (w) => w.warningCode === "BATCH_DOSE_CONFOUNDING",
      ),
    ).toBe(true);
    expect(BatchProvenanceSummarySchema.safeParse(result).success).toBe(true);
  });

  it("does not flag confounding when all samples share a single batch", () => {
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
          batchId: "batch1",
        },
        {
          sampleId: "s2",
          doseGroupId: "low",
          species: "Homo sapiens",
          batchId: "batch1",
        },
      ],
    });

    const result = summarizeBatchProvenance("ds-005", design);

    expect(result.doseBatchConfoundingDetected).toBe(false);
    expect(result.confoundedDoseGroups).toHaveLength(0);
    expect(BatchProvenanceSummarySchema.safeParse(result).success).toBe(true);
  });

  it("warns when pre-correction batch structure is unavailable", () => {
    const design = makeDesign();

    const result = summarizeBatchProvenance("ds-006", design, {
      method: "limma",
      parameters: { method: "robust" },
      preCorrectionBatchStructureAvailable: false,
    });

    expect(result.upstreamCorrection!.preCorrectionBatchStructureAvailable).toBe(
      false,
    );
    expect(
      result.warnings.some(
        (w) => w.warningCode === "BATCH_CORRECTION_NO_PRE_STRUCTURE",
      ),
    ).toBe(true);
    expect(BatchProvenanceSummarySchema.safeParse(result).success).toBe(true);
  });

  it("warns on partial batch metadata", () => {
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
          batchId: "batch1",
        },
        {
          sampleId: "s2",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s3",
          doseGroupId: "low",
          species: "Homo sapiens",
          batchId: "batch1",
        },
        {
          sampleId: "s4",
          doseGroupId: "low",
          species: "Homo sapiens",
        },
      ],
    });

    const result = summarizeBatchProvenance("ds-007", design);

    expect(result.batchIdCompleteness).toBe(0.5);
    expect(result.samplesWithBatchId).toBe(2);
    expect(
      result.warnings.some(
        (w) => w.warningCode === "BATCH_PARTIAL_METADATA",
      ),
    ).toBe(true);
    expect(BatchProvenanceSummarySchema.safeParse(result).success).toBe(true);
  });
});

describe("BatchCorrectionProvenanceSchema", () => {
  it("accepts a valid correction declaration", () => {
    const parsed = BatchCorrectionProvenanceSchema.parse({
      method: "ComBat",
      parameters: { parCombat: true },
      preCorrectionBatchStructureAvailable: true,
    });
    expect(parsed.method).toBe("ComBat");
    expect(parsed.preCorrectionBatchStructureAvailable).toBe(true);
  });

  it("accepts a correction declaration without optional parameters", () => {
    const parsed = BatchCorrectionProvenanceSchema.parse({
      method: "limma",
      preCorrectionBatchStructureAvailable: false,
    });
    expect(parsed.method).toBe("limma");
    expect(parsed.parameters).toBeUndefined();
  });

  it("rejects an empty method name", () => {
    const result = BatchCorrectionProvenanceSchema.safeParse({
      method: "",
      preCorrectionBatchStructureAvailable: true,
    });
    expect(result.success).toBe(false);
  });
});
