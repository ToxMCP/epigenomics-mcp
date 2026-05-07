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
