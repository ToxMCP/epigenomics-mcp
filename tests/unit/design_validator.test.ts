import { describe, it, expect } from "vitest";
import {
  validateControlAndDoseAxis,
  type ValidateControlAndDoseOptions,
} from "../../src/validators/design_validator.js";
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
      },
      {
        sampleId: "s2",
        doseGroupId: "ctrl",
        species: "Homo sapiens",
        controlFlag: true,
      },
      { sampleId: "s3", doseGroupId: "low", species: "Homo sapiens" },
      { sampleId: "s4", doseGroupId: "low", species: "Homo sapiens" },
      { sampleId: "s5", doseGroupId: "high", species: "Homo sapiens" },
      { sampleId: "s6", doseGroupId: "high", species: "Homo sapiens" },
    ],
    hasControls: true,
    minReplicatesPerGroup: 2,
    ...overrides,
  };
}

describe("validateControlAndDoseAxis", () => {
  it("passes a valid design with inferred zero-dose control", () => {
    const result = validateControlAndDoseAxis(makeDesign());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.identifiedControlGroupId).toBe("ctrl");
    expect(result.orderedDoseGroups.map((g) => g.doseGroupId)).toEqual([
      "ctrl",
      "low",
      "high",
    ]);
  });

  it("passes with explicit controlGroupId", () => {
    const result = validateControlAndDoseAxis(makeDesign(), {
      controlGroupId: "ctrl",
    });
    expect(result.valid).toBe(true);
    expect(result.identifiedControlGroupId).toBe("ctrl");
  });

  it("fails when explicit controlGroupId does not exist", () => {
    const result = validateControlAndDoseAxis(makeDesign(), {
      controlGroupId: "missing",
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("does not match any dose group")),
    ).toBe(true);
  });

  it("fails when explicit controlGroupId is not a control group", () => {
    const result = validateControlAndDoseAxis(makeDesign(), {
      controlGroupId: "low",
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("does not identify a control group"),
      ),
    ).toBe(true);
  });

  it("fails when no control group is present", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s3", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s4", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s5", doseGroupId: "high", species: "Homo sapiens" },
        { sampleId: "s6", doseGroupId: "high", species: "Homo sapiens" },
      ],
      hasControls: true,
    });
    const result = validateControlAndDoseAxis(design);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("No control group detected")),
    ).toBe(true);
  });

  it("fails with multiple inferred control groups without explicit id", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl1", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "ctrl2", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl1",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s2",
          doseGroupId: "ctrl2",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s3", doseGroupId: "low", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const result = validateControlAndDoseAxis(design);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("Multiple control groups detected")),
    ).toBe(true);
  });

  it("passes with multiple control groups when explicit id is provided", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl1", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "ctrl2", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl1",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s2",
          doseGroupId: "ctrl2",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s3", doseGroupId: "low", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const result = validateControlAndDoseAxis(design, {
      controlGroupId: "ctrl1",
    });
    expect(result.valid).toBe(true);
    expect(result.identifiedControlGroupId).toBe("ctrl1");
  });

  it("infers control from all-controlFlag samples when doseValue is non-zero", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "vehicle", doseValue: 0.1, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "vehicle",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "s2",
          doseGroupId: "vehicle",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s3", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s4", doseGroupId: "low", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 2,
    });
    const result = validateControlAndDoseAxis(design);
    expect(result.valid).toBe(true);
    expect(result.identifiedControlGroupId).toBe("vehicle");
  });

  it("orders dose groups deterministically by doseValue", () => {
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
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const result = validateControlAndDoseAxis(design);
    expect(result.valid).toBe(true);
    expect(result.orderedDoseGroups.map((g) => g.doseGroupId)).toEqual([
      "ctrl",
      "low",
      "mid",
      "high",
    ]);
    expect(result.orderedDoseGroups.map((g) => g.doseValue)).toEqual([
      0, 1, 10, 100,
    ]);
  });

  it("uses lexicographic tie-break when doseValues are equal", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "b", doseValue: 5, doseUnit: "µM" },
        { doseGroupId: "a", doseValue: 5, doseUnit: "µM" },
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s2", doseGroupId: "a", species: "Homo sapiens" },
        { sampleId: "s3", doseGroupId: "b", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const result = validateControlAndDoseAxis(design);
    expect(result.orderedDoseGroups.map((g) => g.doseGroupId)).toEqual([
      "ctrl",
      "a",
      "b",
    ]);
  });

  it("rejects mixed dose units without normalisation provenance", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        { doseGroupId: "high", doseValue: 10, doseUnit: "mg/kg" },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s3", doseGroupId: "high", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const result = validateControlAndDoseAxis(design);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("Mixed dose units") && e.includes("require declared normalisation provenance"),
      ),
    ).toBe(true);
  });

  it("accepts mixed dose units when normalisation provenance is provided", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        { doseGroupId: "high", doseValue: 10, doseUnit: "mg/kg" },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s3", doseGroupId: "high", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const result = validateControlAndDoseAxis(design, {
      normalisationProvenance: "Converted from mg/kg to µM using MW=322.24",
    });
    expect(result.valid).toBe(true);
    expect(
      result.warnings.some((w) => w.includes("Mixed dose units normalised")),
    ).toBe(true);
  });

  it("rejects missing doseUnit", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "" },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const result = validateControlAndDoseAxis(design);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("missing or empty doseUnit")),
    ).toBe(true);
  });

  it("rejects multi-timepoint by default (v0.1 policy)", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM", timepointHours: 24 },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM", timepointHours: 24 },
        { doseGroupId: "ctrl_48", doseValue: 0, doseUnit: "µM", timepointHours: 48 },
        { doseGroupId: "low_48", doseValue: 1, doseUnit: "µM", timepointHours: 48 },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
        {
          sampleId: "s3",
          doseGroupId: "ctrl_48",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s4", doseGroupId: "low_48", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const result = validateControlAndDoseAxis(design);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("Multi-timepoint design detected") && e.includes("v0.1 requires single-timepoint"),
      ),
    ).toBe(true);
  });

  it("splits multi-timepoint design when policy is set to split", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM", timepointHours: 24 },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM", timepointHours: 24 },
        { doseGroupId: "ctrl_48", doseValue: 0, doseUnit: "µM", timepointHours: 48 },
        { doseGroupId: "low_48", doseValue: 1, doseUnit: "µM", timepointHours: 48 },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
        {
          sampleId: "s3",
          doseGroupId: "ctrl_48",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s4", doseGroupId: "low_48", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const result = validateControlAndDoseAxis(design, {
      multiTimepointPolicy: "split",
    });
    expect(result.valid).toBe(true);
    expect(result.splitDesigns).toBeDefined();
    expect(result.splitDesigns!).toHaveLength(2);

    const tp24 = result.splitDesigns!.find((d) => d.designId.endsWith("_tp24"));
    const tp48 = result.splitDesigns!.find((d) => d.designId.endsWith("_tp48"));

    expect(tp24).toBeDefined();
    expect(tp24!.doseGroups).toHaveLength(2);
    expect(tp24!.samples).toHaveLength(2);
    expect(tp24!.hasControls).toBe(true);

    expect(tp48).toBeDefined();
    expect(tp48!.doseGroups).toHaveLength(2);
    expect(tp48!.samples).toHaveLength(2);
    expect(tp48!.hasControls).toBe(true);

    expect(
      result.warnings.some((w) =>
        w.includes("split into 2 single-timepoint design(s)"),
      ),
    ).toBe(true);
  });

  it("warns when a split design has fewer than 2 dose groups", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM", timepointHours: 24 },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM", timepointHours: 24 },
        { doseGroupId: "orphan_ctrl", doseValue: 0, doseUnit: "µM", timepointHours: 48 },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s3", doseGroupId: "orphan_ctrl", species: "Homo sapiens", controlFlag: true },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const result = validateControlAndDoseAxis(design, {
      multiTimepointPolicy: "split",
    });
    expect(result.valid).toBe(true);
    expect(result.splitDesigns).toHaveLength(2);
    expect(
      result.warnings.some((w) =>
        w.includes("48h") && w.includes("fewer than 2 dose groups"),
      ),
    ).toBe(true);
  });

  it("handles zero-dose control without explicit controlFlag", () => {
    const design = makeDesign({
      samples: [
        { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens" },
        { sampleId: "s2", doseGroupId: "ctrl", species: "Homo sapiens" },
        { sampleId: "s3", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s4", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s5", doseGroupId: "high", species: "Homo sapiens" },
        { sampleId: "s6", doseGroupId: "high", species: "Homo sapiens" },
      ],
    });
    const result = validateControlAndDoseAxis(design);
    expect(result.valid).toBe(true);
    expect(result.identifiedControlGroupId).toBe("ctrl");
  });

  it("fails on schema violations and returns empty orderedDoseGroups", () => {
    const result = validateControlAndDoseAxis({
      designId: "bad",
      // missing required fields
    } as unknown as ExperimentalDesign);
    expect(result.valid).toBe(false);
    expect(result.orderedDoseGroups).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles designs with no timepoint defined (single implicit timepoint)", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        {
          sampleId: "s1",
          doseGroupId: "ctrl",
          species: "Homo sapiens",
          controlFlag: true,
        },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    const result = validateControlAndDoseAxis(design);
    expect(result.valid).toBe(true);
    expect(result.splitDesigns).toBeUndefined();
    expect(result.errors).toHaveLength(0);
  });
});
