import { describe, it, expect } from "vitest";
import { validateDesign } from "../../src/validators/design.js";
import { validateCoordinates } from "../../src/validators/coordinates.js";

describe("validateDesign", () => {
  it("passes a valid design with controls", () => {
    const result = validateDesign({
      designId: "design-001",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s3", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s4", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s5", doseGroupId: "high", species: "Homo sapiens" },
        { sampleId: "s6", doseGroupId: "high", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 2,
    });
    expect(result.valid).toBe(true);
    expect(result.structurallyValid).toBe(true);
    expect(result.comparisonReady).toBe(true);
    expect(result.doseResponseReady).toBe(true);
    expect(result.preferredForDoseResponse).toBe(false);
    expect(result.readinessStatus).toBe("dose_response_minimum");
    expect(result.comparisonBlockers).toEqual([]);
    expect(result.doseResponseBlockers).toEqual([]);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when sample references unknown dose group", () => {
    const result = validateDesign({
      designId: "design-bad",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s2", doseGroupId: "missing", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("missing"))).toBe(true);
  });

  it("fails structural validation on duplicate sample identifiers", () => {
    const result = validateDesign({
      designId: "design-duplicate-sample",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s1", doseGroupId: "low", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });

    expect(result.structurallyValid).toBe(false);
    expect(result.errors.some((error) => error.includes("Duplicate sampleId"))).toBe(true);
  });

  it("fails structural validation on duplicate dose-group identifiers", () => {
    const result = validateDesign({
      designId: "design-duplicate-group",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "group", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "group", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s1", doseGroupId: "group", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s2", doseGroupId: "group", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });

    expect(result.structurallyValid).toBe(false);
    expect(result.errors.some((error) => error.includes("Duplicate doseGroupId"))).toBe(true);
  });

  it("warns when fewer than 2 replicates per group", () => {
    const result = validateDesign({
      designId: "design-low-n",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
    });
    expect(result.warnings.some((w) => w.includes("fewer than 2"))).toBe(true);
    expect(result.structurallyValid).toBe(true);
    expect(result.comparisonReady).toBe(false);
    expect(result.doseResponseReady).toBe(false);
    expect(result.comparisonBlockers).toContain(
      "insufficient_biological_replicates",
    );
    expect(result.doseResponseBlockers).toContain(
      "insufficient_biological_replicates",
    );
    expect(result.observedDesign.minEffectiveBiologicalReplicatesPerGroup).toBe(1);
  });

  it("separates baseline ingestion from analytical readiness", () => {
    const result = validateDesign({
      designId: "design-baseline",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      ],
      hasControls: true,
      minReplicatesPerGroup: 2,
    });

    expect(result.valid).toBe(true);
    expect(result.structurallyValid).toBe(true);
    expect(result.comparisonReady).toBe(false);
    expect(result.doseResponseReady).toBe(false);
    expect(result.readinessStatus).toBe("structural_only");
    expect(result.comparisonBlockers).toContain("no_treated_dose");
    expect(result.doseResponseBlockers).toEqual([
      "no_treated_dose",
      "insufficient_total_dose_levels",
    ]);
  });

  it("classifies control plus one treated level as comparison-only", () => {
    const result = validateDesign({
      designId: "design-comparison",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "treated", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "t1", doseGroupId: "treated", species: "Homo sapiens" },
        { sampleId: "t2", doseGroupId: "treated", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 2,
    });

    expect(result.structurallyValid).toBe(true);
    expect(result.comparisonReady).toBe(true);
    expect(result.doseResponseReady).toBe(false);
    expect(result.readinessStatus).toBe("comparison_only");
    expect(result.comparisonBlockers).toEqual([]);
    expect(result.doseResponseBlockers).toEqual([
      "insufficient_nonzero_dose_levels",
    ]);
  });
});

describe("validateCoordinates", () => {
  it("passes valid 0-based half-open region", () => {
    const result = validateCoordinates({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      build: "hg38",
      coordinateSystem: "0-based-half-open",
    });
    expect(result.valid).toBe(true);
  });

  it("warns on non-standard coordinate system", () => {
    const result = validateCoordinates({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      build: "hg38",
      coordinateSystem: "1-based-closed",
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("non-standard"))).toBe(true);
  });

  it("fails on invalid chromosome for human build", () => {
    const result = validateCoordinates({
      chrom: "chrMT",
      start: 1000,
      end: 2000,
      build: "hg38",
      coordinateSystem: "0-based-half-open",
    });
    expect(result.valid).toBe(false);
  });
});
