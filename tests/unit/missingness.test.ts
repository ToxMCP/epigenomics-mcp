import { describe, it, expect } from "vitest";
import {
  profileMissingness,
  DEFAULT_MISSINGNESS_POLICY,
  MissingnessPolicySchema,
  MissingnessProfileSchema,
} from "../../src/qc/missingness.js";
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

describe("profileMissingness", () => {
  it("returns acceptable band when there is no missingness", () => {
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
      makeFeature("cg002", {
        "s-ctrl-1": 0.5,
        "s-ctrl-2": 0.51,
        "s-low-1": 0.49,
        "s-low-2": 0.52,
        "s-high-1": 0.48,
        "s-high-2": 0.53,
      }),
    ];

    const result = profileMissingness("ds-001", features, design);

    expect(result.summaryBand).toBe("acceptable");
    expect(result.overallFeatureMissingFraction).toBe(0);
    expect(result.perFeatureMissingness.every((f) => f.band === "acceptable")).toBe(true);
    expect(result.perSampleMissingness.every((s) => s.band === "acceptable")).toBe(true);
    expect(result.perGroupMissingness.every((g) => g.band === "acceptable")).toBe(true);
    expect(result.featuresWithCompleteGroupDropout).toEqual([]);
    expect(MissingnessProfileSchema.safeParse(result).success).toBe(true);
  });

  it("returns warning band when missingness is in the warning band", () => {
    // Use many features so that per-sample missingness stays in warning band
    // even when one feature has a single missing value.
    const policy = MissingnessPolicySchema.parse({
      version: "v-test",
      warningThreshold: 0.05,
      exclusionThreshold: 0.5,
    });

    const design = makeDesign();
    const features: EpigenomicFeature[] = Array.from({ length: 10 }, (_, i) =>
      makeFeature(`cg${String(i + 1).padStart(3, "0")}`, {
        "s-ctrl-1": 0.8,
        "s-ctrl-2": 0.81,
        "s-low-1": 0.79,
        "s-low-2": 0.82,
        "s-high-1": 0.77,
        "s-high-2": 0.83,
      }),
    );

    // Replace last feature with one missing value -> 1/6 ≈ 0.167 per-feature,
    // 1/10 = 0.1 per-sample -> both in warning band, below exclusion.
    features[9] = makeFeature("cg010", {
      "s-ctrl-1": null,
      "s-ctrl-2": 0.81,
      "s-low-1": 0.79,
      "s-low-2": 0.82,
      "s-high-1": 0.77,
      "s-high-2": 0.83,
    });

    const result = profileMissingness("ds-002", features, design, policy);

    expect(result.perFeatureMissingness.find((f) => f.featureId === "cg010")?.band).toBe("warning");
    expect(result.perSampleMissingness.find((s) => s.sampleId === "s-ctrl-1")?.band).toBe("warning");
    expect(result.summaryBand).toBe("warning");
    expect(result.featuresWithCompleteGroupDropout).toEqual([]);
    expect(MissingnessProfileSchema.safeParse(result).success).toBe(true);
  });

  it("returns exclusion band when missingness is in the exclusion band", () => {
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
      makeFeature("cg002", {
        "s-ctrl-1": null,
        "s-ctrl-2": null,
        "s-low-1": null,
        "s-low-2": 0.52,
        "s-high-1": 0.48,
        "s-high-2": 0.53,
      }),
    ];

    const result = profileMissingness("ds-003", features, design, DEFAULT_MISSINGNESS_POLICY);

    // cg002 has 3/6 = 0.5 missing -> exclusion (> 0.2)
    const cg002 = result.perFeatureMissingness.find((f) => f.featureId === "cg002");
    expect(cg002?.band).toBe("exclusion");
    expect(cg002?.missingFraction).toBe(0.5);
    expect(result.summaryBand).toBe("exclusion");
    expect(MissingnessProfileSchema.safeParse(result).success).toBe(true);
  });

  it("treats absent declared sample keys as missing", () => {
    const design = makeDesign();
    const features = [
      makeFeature("summary-only", {
        contrast_low_vs_ctrl: 0.25,
        contrast_high_vs_ctrl: 0.5,
      }),
    ];

    const result = profileMissingness("ds-summary", features, design);

    expect(result.overallFeatureMissingFraction).toBe(1);
    expect(result.perFeatureMissingness[0].band).toBe("exclusion");
    expect(result.featuresWithCompleteGroupDropout).toEqual(["summary-only"]);
    expect(result.summaryBand).toBe("exclusion");
  });

  it("returns exclusion band when a dose group has complete dropout for a feature", () => {
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
      makeFeature("cg002", {
        "s-ctrl-1": 0.5,
        "s-ctrl-2": 0.51,
        "s-low-1": null,
        "s-low-2": null,
        "s-high-1": 0.48,
        "s-high-2": 0.53,
      }),
    ];

    const result = profileMissingness("ds-004", features, design);

    // cg002 has complete dropout in low group (both samples null)
    expect(result.featuresWithCompleteGroupDropout).toContain("cg002");
    const lowGroup = result.perGroupMissingness.find((g) => g.doseGroupId === "low");
    expect(lowGroup?.band).toBe("exclusion");
    expect(lowGroup?.completeDropoutFeatureIds).toContain("cg002");
    expect(result.summaryBand).toBe("exclusion");
    expect(MissingnessProfileSchema.safeParse(result).success).toBe(true);
  });

  it("returns not_applicable when there are no features", () => {
    const design = makeDesign();
    const result = profileMissingness("ds-005", [], design);

    expect(result.summaryBand).toBe("not_applicable");
    expect(result.overallFeatureMissingFraction).toBe(0);
    expect(result.perFeatureMissingness).toEqual([]);
    expect(result.perSampleMissingness).toEqual([]);
    expect(result.perGroupMissingness).toEqual([]);
    expect(MissingnessProfileSchema.safeParse(result).success).toBe(true);
  });

  it("returns not_applicable when there are no samples", () => {
    const design = makeDesign({ samples: [], doseGroups: [] });
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {}),
    ];

    const result = profileMissingness("ds-006", features, design);

    expect(result.summaryBand).toBe("not_applicable");
    expect(MissingnessProfileSchema.safeParse(result).success).toBe(true);
  });

  it("computes correct per-sample missingness fractions", () => {
    const design = makeDesign();
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": null,
        "s-ctrl-2": 0.81,
        "s-low-1": 0.79,
        "s-low-2": 0.82,
        "s-high-1": 0.77,
        "s-high-2": 0.83,
      }),
      makeFeature("cg002", {
        "s-ctrl-1": 0.5,
        "s-ctrl-2": 0.51,
        "s-low-1": 0.49,
        "s-low-2": 0.52,
        "s-high-1": 0.48,
        "s-high-2": 0.53,
      }),
    ];

    const result = profileMissingness("ds-007", features, design);

    const sCtrl1 = result.perSampleMissingness.find((s) => s.sampleId === "s-ctrl-1");
    expect(sCtrl1?.missingFraction).toBe(0.5); // 1 missing out of 2 features
    expect(sCtrl1?.band).toBe("exclusion");

    const sCtrl2 = result.perSampleMissingness.find((s) => s.sampleId === "s-ctrl-2");
    expect(sCtrl2?.missingFraction).toBe(0);
    expect(sCtrl2?.band).toBe("acceptable");
  });

  it("computes correct per-group missingness fractions", () => {
    const design = makeDesign();
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": null,
        "s-ctrl-2": null,
        "s-low-1": 0.79,
        "s-low-2": 0.82,
        "s-high-1": 0.77,
        "s-high-2": 0.83,
      }),
      makeFeature("cg002", {
        "s-ctrl-1": 0.5,
        "s-ctrl-2": 0.51,
        "s-low-1": 0.49,
        "s-low-2": 0.52,
        "s-high-1": 0.48,
        "s-high-2": 0.53,
      }),
    ];

    const result = profileMissingness("ds-008", features, design);

    // ctrl group: cg001 has 2 missing, cg002 has 0 missing -> 2/4 = 0.5
    const ctrlGroup = result.perGroupMissingness.find((g) => g.doseGroupId === "ctrl");
    expect(ctrlGroup?.missingFraction).toBe(0.5);
    expect(ctrlGroup?.band).toBe("exclusion");

    // low group: 0 missing -> 0/4 = 0
    const lowGroup = result.perGroupMissingness.find((g) => g.doseGroupId === "low");
    expect(lowGroup?.missingFraction).toBe(0);
    expect(lowGroup?.band).toBe("acceptable");
  });

  it("uses the provided policy version in the output", () => {
    const design = makeDesign();
    const policy = MissingnessPolicySchema.parse({
      version: "v-custom-2.1",
      warningThreshold: 0.1,
      exclusionThreshold: 0.4,
    });

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

    const result = profileMissingness("ds-009", features, design, policy);
    expect(result.policyVersion).toBe("v-custom-2.1");
    expect(result.summaryBand).toBe("acceptable");
  });

  it("rejects policy where exclusion < warning", () => {
    expect(() =>
      MissingnessPolicySchema.parse({
        version: "v-bad",
        warningThreshold: 0.5,
        exclusionThreshold: 0.2,
      }),
    ).toThrow();
  });

  it("handles NaN as missing values", () => {
    const design = makeDesign();
    const features: EpigenomicFeature[] = [
      makeFeature("cg001", {
        "s-ctrl-1": NaN,
        "s-ctrl-2": 0.81,
        "s-low-1": 0.79,
        "s-low-2": 0.82,
        "s-high-1": 0.77,
        "s-high-2": 0.83,
      }),
    ];

    const result = profileMissingness("ds-010", features, design);
    expect(result.perFeatureMissingness[0].missingFraction).toBe(1 / 6);
    expect(result.perSampleMissingness.find((s) => s.sampleId === "s-ctrl-1")?.missingFraction).toBe(1);
  });
});
