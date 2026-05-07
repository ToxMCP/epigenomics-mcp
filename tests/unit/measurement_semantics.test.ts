import { describe, it, expect } from "vitest";
import {
  MeasurementSemanticsSchema,
  FEATURE_CLASS_SEMANTICS_COMPATIBILITY,
  isMeasurementSemanticsCompatible,
  MeasurementSemanticsCompatibilityError,
} from "../../src/contracts/measurement_semantics.js";
import {
  EpigenomicFeatureSchema,
  FeatureClassSchema,
} from "../../src/contracts/features.js";

describe("MeasurementSemanticsSchema", () => {
  it("accepts all valid semantics", () => {
    const valid = [
      "beta_value",
      "m_value",
      "percent_methylation",
      "delta_beta",
      "delta_m",
      "accessibility_signal",
      "peak_score",
      "read_count",
      "normalized_signal",
      "effect_size",
      "q_value",
      "declared_other",
    ] as const;
    for (const v of valid) {
      expect(MeasurementSemanticsSchema.parse(v)).toBe(v);
    }
  });

  it("rejects invalid semantics", () => {
    expect(() => MeasurementSemanticsSchema.parse("counts")).toThrow();
    expect(() => MeasurementSemanticsSchema.parse("log2_fold_change")).toThrow();
    expect(() => MeasurementSemanticsSchema.parse("rpm")).toThrow();
    expect(() => MeasurementSemanticsSchema.parse("")).toThrow();
  });
});

describe("FEATURE_CLASS_SEMANTICS_COMPATIBILITY", () => {
  it("covers every defined feature class", () => {
    const featureClasses = FeatureClassSchema.options;
    for (const fc of featureClasses) {
      expect(FEATURE_CLASS_SEMANTICS_COMPATIBILITY[fc]).toBeDefined();
      expect(FEATURE_CLASS_SEMANTICS_COMPATIBILITY[fc].length).toBeGreaterThan(0);
    }
  });

  it("allows declared_other for every feature class", () => {
    const featureClasses = FeatureClassSchema.options;
    for (const fc of featureClasses) {
      expect(FEATURE_CLASS_SEMANTICS_COMPATIBILITY[fc]).toContain("declared_other");
    }
  });
});

describe("isMeasurementSemanticsCompatible", () => {
  it("returns true for compatible pairs", () => {
    expect(
      isMeasurementSemanticsCompatible("cpg_methylation", "beta_value"),
    ).toBe(true);
    expect(
      isMeasurementSemanticsCompatible("atac_peak", "accessibility_signal"),
    ).toBe(true);
    expect(
      isMeasurementSemanticsCompatible("chip_peak_narrow", "peak_score"),
    ).toBe(true);
    expect(
      isMeasurementSemanticsCompatible("dmr", "effect_size"),
    ).toBe(true);
    expect(
      isMeasurementSemanticsCompatible("ncrna_expression", "read_count"),
    ).toBe(true);
  });

  it("returns false for incompatible pairs", () => {
    expect(
      isMeasurementSemanticsCompatible("cpg_methylation", "accessibility_signal"),
    ).toBe(false);
    expect(
      isMeasurementSemanticsCompatible("atac_peak", "beta_value"),
    ).toBe(false);
    expect(
      isMeasurementSemanticsCompatible("chip_peak_narrow", "delta_beta"),
    ).toBe(false);
    expect(
      isMeasurementSemanticsCompatible("ncrna_expression", "peak_score"),
    ).toBe(false);
  });
});

describe("EpigenomicFeatureSchema measurement semantics validation", () => {
  const baseFeature = {
    featureId: "feat-1",
    featureClass: "cpg_methylation",
    modality: "dna_methylation_array" as const,
    measuredIdentifier: "cg00000001",
    values: { "sample-1": 0.82 },
  };

  it("accepts valid semantics for cpg_methylation", () => {
    const validSemantics = [
      "beta_value",
      "m_value",
      "percent_methylation",
      "delta_beta",
      "delta_m",
      "declared_other",
    ] as const;
    for (const semantics of validSemantics) {
      const feature = EpigenomicFeatureSchema.parse({
        ...baseFeature,
        signalMetric: semantics,
        declaredOtherDescription:
          semantics === "declared_other" ? "custom metric" : undefined,
      });
      expect(feature.signalMetric).toBe(semantics);
    }
  });

  it("accepts valid semantics for atac_peak", () => {
    const feature = EpigenomicFeatureSchema.parse({
      featureId: "peak-1",
      featureClass: "atac_peak",
      modality: "atac_seq",
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      },
      signalMetric: "accessibility_signal",
      values: { "sample-1": 12.5 },
    });
    expect(feature.signalMetric).toBe("accessibility_signal");
  });

  it("rejects missing signalMetric", () => {
    expect(() =>
      EpigenomicFeatureSchema.parse({
        ...baseFeature,
        signalMetric: undefined,
      }),
    ).toThrow();
  });

  it("rejects incompatible semantics for feature class", () => {
    expect(() =>
      EpigenomicFeatureSchema.parse({
        ...baseFeature,
        signalMetric: "accessibility_signal",
      }),
    ).toThrow(/signalMetric is incompatible with featureClass/);
  });

  it("rejects peak_score for cpg_methylation", () => {
    expect(() =>
      EpigenomicFeatureSchema.parse({
        ...baseFeature,
        signalMetric: "peak_score",
      }),
    ).toThrow(/signalMetric is incompatible with featureClass/);
  });

  it("rejects beta_value for atac_peak", () => {
    expect(() =>
      EpigenomicFeatureSchema.parse({
        featureId: "peak-1",
        featureClass: "atac_peak",
        modality: "atac_seq",
        measuredRegion: {
          chrom: "chr1",
          start: 1000,
          end: 2000,
          build: "hg38",
          coordinateSystem: "0-based-half-open",
        },
        signalMetric: "beta_value",
        values: { "sample-1": 0.5 },
      }),
    ).toThrow(/signalMetric is incompatible with featureClass/);
  });

  it("requires declaredOtherDescription when signalMetric is declared_other", () => {
    expect(() =>
      EpigenomicFeatureSchema.parse({
        ...baseFeature,
        signalMetric: "declared_other",
      }),
    ).toThrow(/declaredOtherDescription is required/);
  });

  it("accepts declared_other when description is provided", () => {
    const feature = EpigenomicFeatureSchema.parse({
      ...baseFeature,
      signalMetric: "declared_other",
      declaredOtherDescription: "custom proprietary metric",
    });
    expect(feature.signalMetric).toBe("declared_other");
    expect(feature.declaredOtherDescription).toBe("custom proprietary metric");
  });

  it("rejects empty declaredOtherDescription for declared_other", () => {
    expect(() =>
      EpigenomicFeatureSchema.parse({
        ...baseFeature,
        signalMetric: "declared_other",
        declaredOtherDescription: "",
      }),
    ).toThrow(/declaredOtherDescription is required/);
  });
});

describe("MeasurementSemanticsCompatibilityError", () => {
  it("constructs with correct message", () => {
    const err = new MeasurementSemanticsCompatibilityError(
      "cpg_methylation",
      "peak_score",
    );
    expect(err.name).toBe("MeasurementSemanticsCompatibilityError");
    expect(err.message).toContain("peak_score");
    expect(err.message).toContain("cpg_methylation");
    expect(err.featureClass).toBe("cpg_methylation");
    expect(err.semantics).toBe("peak_score");
  });
});
