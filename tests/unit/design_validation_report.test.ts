import { describe, it, expect } from "vitest";
import {
  emitDesignValidationReport,
  DesignValidationReportSchema,
} from "../../src/validators/design_validation_report.js";
import type { ExperimentalDesign } from "../../src/contracts/design.js";

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
        batchId: "batch-a",
      },
      {
        sampleId: "s2",
        doseGroupId: "ctrl",
        species: "Homo sapiens",
        controlFlag: true,
        batchId: "batch-b",
      },
      {
        sampleId: "s3",
        doseGroupId: "low",
        species: "Homo sapiens",
        batchId: "batch-a",
      },
      {
        sampleId: "s4",
        doseGroupId: "low",
        species: "Homo sapiens",
        batchId: "batch-b",
      },
      {
        sampleId: "s5",
        doseGroupId: "high",
        species: "Homo sapiens",
        batchId: "batch-a",
      },
      {
        sampleId: "s6",
        doseGroupId: "high",
        species: "Homo sapiens",
        batchId: "batch-b",
      },
    ],
    hasControls: true,
    minReplicatesPerGroup: 2,
    ...overrides,
  };
}

describe("emitDesignValidationReport", () => {
  it("produces a valid report for a well-formed design", () => {
    const report = emitDesignValidationReport(makeDesign());

    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.schemaValid).toBe(true);
    expect(report.orderedDoseGroups).toHaveLength(3);
    expect(report.replicateCountsByGroup).toHaveLength(3);
    expect(report.batchSummary.totalSamples).toBe(6);
    expect(report.batchSummary.batchesDetected).toBe(2);
    expect(report.timepointStatus.isMultiTimepoint).toBe(false);
    expect(report.downstreamEligibility.eligibleForDoseResponse).toBe(true);
    expect(report.downstreamEligibility.eligibilityNotes.length).toBeGreaterThan(0);
  });

  it("matches snapshot for valid design", () => {
    const report = emitDesignValidationReport(makeDesign());
    expect(report).toMatchSnapshot();
  });

  it("matches snapshot for design with warnings", () => {
    const design = makeDesign({
      minReplicatesPerGroup: 1,
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
    });
    const report = emitDesignValidationReport(design);
    expect(report).toMatchSnapshot();
  });

  it("matches snapshot for blocked design (missing control)", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
      ],
      samples: [
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
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const report = emitDesignValidationReport(design);
    expect(report).toMatchSnapshot();
  });

  it("matches snapshot for blocked design (multi-timepoint rejected)", () => {
    const design = makeDesign({
      doseGroups: [
        {
          doseGroupId: "ctrl_24",
          doseValue: 0,
          doseUnit: "µM",
          timepointHours: 24,
        },
        {
          doseGroupId: "low_24",
          doseValue: 1,
          doseUnit: "µM",
          timepointHours: 24,
        },
        {
          doseGroupId: "ctrl_48",
          doseValue: 0,
          doseUnit: "µM",
          timepointHours: 48,
        },
        {
          doseGroupId: "low_48",
          doseValue: 1,
          doseUnit: "µM",
          timepointHours: 48,
        },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl_24",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s2",
          doseGroupId: "low_24",
          species: "Homo sapiens",
        },
        {
          sampleId: "s3",
          doseGroupId: "ctrl_48",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s4",
          doseGroupId: "low_48",
          species: "Homo sapiens",
        },
      ],
      minReplicatesPerGroup: 1,
    });
    const report = emitDesignValidationReport(design);
    expect(report).toMatchSnapshot();
  });

  it("matches snapshot for design with dose-batch confounding", () => {
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
          batchId: "batch-a",
        },
        {
          sampleId: "s2",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
          batchId: "batch-a",
        },
        {
          sampleId: "s3",
          doseGroupId: "low",
          species: "Homo sapiens",
          batchId: "batch-b",
        },
        {
          sampleId: "s4",
          doseGroupId: "low",
          species: "Homo sapiens",
          batchId: "batch-b",
        },
        {
          sampleId: "s5",
          doseGroupId: "high",
          species: "Homo sapiens",
          batchId: "batch-c",
        },
        {
          sampleId: "s6",
          doseGroupId: "high",
          species: "Homo sapiens",
          batchId: "batch-c",
        },
      ],
    });
    const report = emitDesignValidationReport(design);
    expect(report.batchSummary.doseBatchConfoundingDetected).toBe(true);
    expect(report.downstreamEligibility.eligibilityNotes.some((n) =>
      n.includes("Dose-batch confounding"),
    )).toBe(true);
    expect(report).toMatchSnapshot();
  });

  it("matches snapshot for split multi-timepoint design", () => {
    const design = makeDesign({
      doseGroups: [
        {
          doseGroupId: "ctrl",
          doseValue: 0,
          doseUnit: "µM",
          timepointHours: 24,
        },
        {
          doseGroupId: "low",
          doseValue: 1,
          doseUnit: "µM",
          timepointHours: 24,
        },
        {
          doseGroupId: "ctrl_48",
          doseValue: 0,
          doseUnit: "µM",
          timepointHours: 48,
        },
        {
          doseGroupId: "low_48",
          doseValue: 1,
          doseUnit: "µM",
          timepointHours: 48,
        },
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
          doseGroupId: "ctrl_48",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s4",
          doseGroupId: "low_48",
          species: "Homo sapiens",
        },
      ],
      minReplicatesPerGroup: 1,
    });
    const report = emitDesignValidationReport(design, {
      multiTimepointPolicy: "split",
    });
    expect(report.timepointStatus.policyApplied).toBe("split");
    expect(report.downstreamEligibility.eligibilityNotes.some((n) =>
      n.includes("split"),
    )).toBe(true);
    expect(report).toMatchSnapshot();
  });

  it("sets schemaValid=false and blocks downstream on schema violations", () => {
    const report = emitDesignValidationReport({
      designId: "bad",
      // missing required fields
    } as unknown as ExperimentalDesign);

    expect(report.valid).toBe(false);
    expect(report.schemaValid).toBe(false);
    expect(report.downstreamEligibility.eligibleForDoseResponse).toBe(false);
    expect(report.orderedDoseGroups).toHaveLength(0);
    expect(report.replicateCountsByGroup).toHaveLength(0);
  });

  it("includes replicate type breakdowns", () => {
    const design = makeDesign({
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
          replicateType: "biological",
        },
        {
          sampleId: "s2",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
          replicateType: "technical",
        },
        {
          sampleId: "s3",
          doseGroupId: "low",
          species: "Homo sapiens",
          replicateType: "pooled",
        },
        {
          sampleId: "s4",
          doseGroupId: "low",
          species: "Homo sapiens",
          replicateType: "pseudobulk",
        },
        {
          sampleId: "s5",
          doseGroupId: "high",
          species: "Homo sapiens",
          replicateType: "biological",
        },
        {
          sampleId: "s6",
          doseGroupId: "high",
          species: "Homo sapiens",
        },
      ],
    });
    const report = emitDesignValidationReport(design);

    const ctrlGroup = report.replicateCountsByGroup.find(
      (g) => g.doseGroupId === "ctrl",
    );
    expect(ctrlGroup).toBeDefined();
    expect(ctrlGroup!.biological).toBe(1);
    expect(ctrlGroup!.technical).toBe(1);

    const lowGroup = report.replicateCountsByGroup.find(
      (g) => g.doseGroupId === "low",
    );
    expect(lowGroup!.pooled).toBe(1);
    expect(lowGroup!.pseudobulk).toBe(1);

    const highGroup = report.replicateCountsByGroup.find(
      (g) => g.doseGroupId === "high",
    );
    expect(highGroup!.biological).toBe(2);
  });

  it("produces deterministic ordering of orderedDoseGroups", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "high", doseValue: 100, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        { doseGroupId: "mid", doseValue: 10, doseUnit: "µM" },
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s3", doseGroupId: "mid", species: "Homo sapiens" },
        { sampleId: "s4", doseGroupId: "high", species: "Homo sapiens" },
      ],
      minReplicatesPerGroup: 1,
    });
    const report = emitDesignValidationReport(design);

    expect(report.orderedDoseGroups.map((g) => g.doseGroupId)).toEqual([
      "ctrl",
      "low",
      "mid",
      "high",
    ]);
  });
});

describe("DesignValidationReportSchema", () => {
  it("validates a correct report object", () => {
    const report = emitDesignValidationReport(makeDesign());
    const parsed = DesignValidationReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });

  it("rejects a report with missing required fields", () => {
    const result = DesignValidationReportSchema.safeParse({
      valid: true,
      errors: [],
      warnings: [],
      // missing orderedDoseGroups, replicateCountsByGroup, etc.
    });
    expect(result.success).toBe(false);
  });

  it("rejects a report with invalid batchSummary", () => {
    const report = emitDesignValidationReport(makeDesign());
    const bad = {
      ...report,
      batchSummary: {
        ...report.batchSummary,
        batchIdCompleteness: 1.5, // out of range
      },
    };
    const result = DesignValidationReportSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
