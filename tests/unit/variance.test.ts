import { describe, it, expect } from "vitest";
import {
  profileVariance,
  DEFAULT_VARIANCE_POLICY,
  VariancePolicySchema,
} from "../../src/qc/variance.js";
import { VarianceProfileSchema } from "../../src/contracts/qc.js";
import type { EpigenomicFeature } from "../../src/contracts/features.js";
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
      { sampleId: "s-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      { sampleId: "s-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      { sampleId: "s-low-1", doseGroupId: "low", species: "Homo sapiens" },
      { sampleId: "s-low-2", doseGroupId: "low", species: "Homo sapiens" },
      { sampleId: "s-high-1", doseGroupId: "high", species: "Homo sapiens" },
      { sampleId: "s-high-2", doseGroupId: "high", species: "Homo sapiens" },
    ],
    hasControls: true,
    minReplicatesPerGroup: 2,
    ...overrides,
  } as ExperimentalDesign;
}

function makeFeature(
  featureId: string,
  values: Record<string, number | null>,
): EpigenomicFeature {
  return {
    featureId,
    featureClass: "cpg_methylation",
    modality: "dna_methylation_array",
    measuredIdentifier: featureId,
    signalMetric: "beta_value",
    values,
  };
}

describe("profileVariance", () => {
  it("returns acceptable band when variance is moderate or high and replicates are stable", () => {
    const design = makeDesign();
    // Values chosen to produce variance above the moderate threshold (0.001)
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": 0.40,
        "s-ctrl-2": 0.50,
        "s-low-1": 0.45,
        "s-low-2": 0.55,
        "s-high-1": 0.60,
        "s-high-2": 0.65,
      }),
      makeFeature("cg002", {
        "s-ctrl-1": 0.30,
        "s-ctrl-2": 0.35,
        "s-low-1": 0.40,
        "s-low-2": 0.32,
        "s-high-1": 0.38,
        "s-high-2": 0.42,
      }),
    ];

    const result = profileVariance("ds-001", features, design);

    expect(result.summaryBand).toBe("acceptable");
    expect(result.perFeatureVariance).toHaveLength(2);
    expect(result.perFeatureVariance.every((f) => f.dynamicRangeBand !== "not_applicable")).toBe(true);
    expect(result.replicateStability?.stabilityBand).toBe("stable");
    expect(VarianceProfileSchema.safeParse(result).success).toBe(true);
  });

  it("handles high missingness without imputation", () => {
    const design = makeDesign();
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": null,
        "s-ctrl-2": null,
        "s-low-1": null,
        "s-low-2": 0.80,
        "s-high-1": null,
        "s-high-2": null,
      }),
      makeFeature("cg002", {
        "s-ctrl-1": 0.40,
        "s-ctrl-2": 0.50,
        "s-low-1": 0.45,
        "s-low-2": 0.55,
        "s-high-1": 0.60,
        "s-high-2": 0.65,
      }),
    ];

    const result = profileVariance("ds-002", features, design);

    // cg001 has only 1 present value -> variance = 0, band = not_applicable
    const cg001 = result.perFeatureVariance.find((f) => f.featureId === "cg001");
    expect(cg001).toBeDefined();
    expect(cg001!.variance).toBe(0);
    expect(cg001!.dynamicRangeBand).toBe("not_applicable");

    // cg002 has all values present -> variance computed normally
    const cg002 = result.perFeatureVariance.find((f) => f.featureId === "cg002");
    expect(cg002).toBeDefined();
    expect(cg002!.variance).toBeGreaterThan(0);
    expect(["moderate", "high"]).toContain(cg002!.dynamicRangeBand);

    // Summary band should be acceptable because only one feature is not_applicable
    // and the other has good variance with stable replicates
    expect(VarianceProfileSchema.safeParse(result).success).toBe(true);
  });

  it("flags zero variance as low dynamic range when sufficient values are present", () => {
    const design = makeDesign();
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": 0.5,
        "s-ctrl-2": 0.5,
        "s-low-1": 0.5,
        "s-low-2": 0.5,
        "s-high-1": 0.5,
        "s-high-2": 0.5,
      }),
    ];

    const result = profileVariance("ds-003", features, design);

    expect(result.perFeatureVariance[0].variance).toBe(0);
    expect(result.perFeatureVariance[0].dynamicRangeBand).toBe("low");
    expect(result.summaryBand).toBe("warning");
    expect(VarianceProfileSchema.safeParse(result).success).toBe(true);
  });

  it("detects unstable replicates from low correlation", () => {
    const design = makeDesign();
    // High variance within replicates -> low correlation
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": 0.1,
        "s-ctrl-2": 0.9,
        "s-low-1": 0.15,
        "s-low-2": 0.85,
        "s-high-1": 0.2,
        "s-high-2": 0.8,
      }),
      makeFeature("cg002", {
        "s-ctrl-1": 0.05,
        "s-ctrl-2": 0.95,
        "s-low-1": 0.1,
        "s-low-2": 0.9,
        "s-high-1": 0.15,
        "s-high-2": 0.85,
      }),
    ];

    const result = profileVariance("ds-004", features, design);

    expect(result.replicateStability).toBeDefined();
    expect(result.replicateStability!.stabilityBand).toBe("unstable");
    expect(result.summaryBand).toBe("warning");
    expect(VarianceProfileSchema.safeParse(result).success).toBe(true);
  });

  it("returns not_assessed when there are insufficient replicates", () => {
    const design = makeDesign({
      samples: [
        { sampleId: "s-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-low-1", doseGroupId: "low", species: "Homo sapiens" },
      ],
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
      minReplicatesPerGroup: 1,
    });
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": 0.8,
        "s-low-1": 0.79,
      }),
    ];

    const result = profileVariance("ds-005", features, design);

    // replicateStability is omitted when not_assessed to keep output minimal
    expect(result.replicateStability).toBeUndefined();
    expect(result.summaryBand).toBe("warning");
    expect(VarianceProfileSchema.safeParse(result).success).toBe(true);
  });

  it("skips technical replicates for stability assessment", () => {
    const design = makeDesign({
      samples: [
        { sampleId: "s-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
        { sampleId: "s-ctrl-1-tech", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "technical" },
        { sampleId: "s-low-1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
        { sampleId: "s-low-1-tech", doseGroupId: "low", species: "Homo sapiens", replicateType: "technical" },
        { sampleId: "s-high-1", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
        { sampleId: "s-high-2", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
      ],
    });
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": 0.8,
        "s-ctrl-1-tech": 0.81,
        "s-low-1": 0.79,
        "s-low-1-tech": 0.80,
        "s-high-1": 0.77,
        "s-high-2": 0.83,
      }),
      makeFeature("cg002", {
        "s-ctrl-1": 0.6,
        "s-ctrl-1-tech": 0.61,
        "s-low-1": 0.59,
        "s-low-1-tech": 0.60,
        "s-high-1": 0.55,
        "s-high-2": 0.61,
      }),
    ];

    const result = profileVariance("ds-006", features, design);

    // ctrl and low have only 1 biological replicate -> stability not assessed from them
    // high has 2 biological replicates -> assessed; correlation should be stable
    expect(result.replicateStability).toBeDefined();
    expect(result.replicateStability!.stabilityBand).toBe("stable");
    expect(VarianceProfileSchema.safeParse(result).success).toBe(true);
  });

  it("returns not_applicable when there are no features", () => {
    const design = makeDesign();
    const result = profileVariance("ds-007", [], design);

    expect(result.summaryBand).toBe("not_applicable");
    expect(result.perFeatureVariance).toHaveLength(0);
    expect(VarianceProfileSchema.safeParse(result).success).toBe(true);
  });

  it("uses versioned policy thresholds", () => {
    const policy = VariancePolicySchema.parse({
      version: "v-test",
      highDynamicRangeThreshold: 0.1,
      moderateDynamicRangeThreshold: 0.01,
      stableReplicateCorrelationThreshold: 0.95,
      unstableReplicateCorrelationThreshold: 0.8,
    });

    const design = makeDesign();
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": 0.8,
        "s-ctrl-2": 0.81,
        "s-low-1": 0.79,
        "s-low-2": 0.82,
        "s-high-1": 0.77,
        "s-high-2": 0.83,
      }),
    ];

    const result = profileVariance("ds-008", features, design, policy);
    expect(result.policyVersion).toBe("v-test");
    expect(VarianceProfileSchema.safeParse(result).success).toBe(true);
  });

  it("rejects invalid policy (high < moderate threshold)", () => {
    expect(() =>
      VariancePolicySchema.parse({
        version: "v-bad",
        highDynamicRangeThreshold: 0.001,
        moderateDynamicRangeThreshold: 0.01,
        stableReplicateCorrelationThreshold: 0.9,
        unstableReplicateCorrelationThreshold: 0.7,
      }),
    ).toThrow();
  });

  it("never imputes missing values", () => {
    const design = makeDesign();
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": 0.8,
        "s-ctrl-2": null,
        "s-low-1": 0.79,
        "s-low-2": 0.82,
        "s-high-1": 0.77,
        "s-high-2": 0.83,
      }),
    ];

    const result = profileVariance("ds-009", features, design);

    // Variance computed only from present values (5 values, not 6)
    expect(result.perFeatureVariance[0].variance).toBeGreaterThan(0);
    expect(result.perFeatureVariance[0].coefficientOfVariation).toBeDefined();
    expect(VarianceProfileSchema.safeParse(result).success).toBe(true);
  });

  it("produces byte-stable output by rounding floats", () => {
    const design = makeDesign();
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": 0.8,
        "s-ctrl-2": 0.81,
        "s-low-1": 0.79,
        "s-low-2": 0.82,
        "s-high-1": 0.77,
        "s-high-2": 0.83,
      }),
    ];

    const result1 = profileVariance("ds-010", features, design);
    const result2 = profileVariance("ds-010", features, design);

    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it("matches snapshot for zero-variance fixture", () => {
    const design = makeDesign();
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": 0.5,
        "s-ctrl-2": 0.5,
        "s-low-1": 0.5,
        "s-low-2": 0.5,
        "s-high-1": 0.5,
        "s-high-2": 0.5,
      }),
    ];

    const result = profileVariance("ds-011", features, design);
    expect(result).toMatchSnapshot();
  });

  it("matches snapshot for unstable-replicate fixture", () => {
    const design = makeDesign();
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": 0.1,
        "s-ctrl-2": 0.9,
        "s-low-1": 0.15,
        "s-low-2": 0.85,
        "s-high-1": 0.2,
        "s-high-2": 0.8,
      }),
    ];

    const result = profileVariance("ds-012", features, design);
    expect(result).toMatchSnapshot();
  });

  it("respects custom policy for replicate stability thresholds", () => {
    const design = makeDesign();
    // Data that gives pairwise replicate correlations of ~0.5.
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": 0.1,
        "s-ctrl-2": 0.1,
        "s-low-1": 0.2,
        "s-low-2": 0.2,
        "s-high-1": 0.3,
        "s-high-2": 0.3,
      }),
      makeFeature("cg002", {
        "s-ctrl-1": 0.2,
        "s-ctrl-2": 0.2,
        "s-low-1": 0.3,
        "s-low-2": 0.3,
        "s-high-1": 0.4,
        "s-high-2": 0.4,
      }),
      makeFeature("cg003", {
        "s-ctrl-1": 0.3,
        "s-ctrl-2": 0.15,
        "s-low-1": 0.4,
        "s-low-2": 0.25,
        "s-high-1": 0.5,
        "s-high-2": 0.35,
      }),
    ];

    // With default policy (stable >= 0.9, unstable >= 0.7), this should be unstable
    const resultDefault = profileVariance("ds-013", features, design, DEFAULT_VARIANCE_POLICY);
    expect(resultDefault.replicateStability!.stabilityBand).toBe("unstable");

    // With lenient policy (stable >= 0.3, unstable >= 0.1), this should be stable
    const lenientPolicy = VariancePolicySchema.parse({
      version: "v-lenient",
      highDynamicRangeThreshold: 0.01,
      moderateDynamicRangeThreshold: 0.001,
      stableReplicateCorrelationThreshold: 0.3,
      unstableReplicateCorrelationThreshold: 0.1,
    });
    const resultLenient = profileVariance("ds-013", features, design, lenientPolicy);
    expect(resultLenient.replicateStability!.stabilityBand).toBe("stable");
  });
});
