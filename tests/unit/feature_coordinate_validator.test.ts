import { describe, it, expect } from "vitest";
import {
  validateFeatureCoordinates,
} from "../../src/validators/feature_coordinate_validator.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRegionFeature(
  overrides: {
    featureId?: string;
    featureClass?: string;
    chrom?: string;
    start?: number;
    end?: number;
    build?: string;
    coordinateSystem?: string;
    modality?: string;
    measuredIdentifier?: string;
    platformAnnotationProvenance?: Record<string, string>;
  } = {},
): Record<string, unknown> {
  return {
    featureId: overrides.featureId ?? "feat-001",
    featureClass: overrides.featureClass ?? "atac_peak",
    modality: overrides.modality ?? "atac_seq",
    measuredRegion: {
      chrom: overrides.chrom ?? "chr1",
      start: overrides.start ?? 1000,
      end: overrides.end ?? 2000,
      build: overrides.build ?? "hg38",
      coordinateSystem: overrides.coordinateSystem ?? "0-based-half-open",
    },
    signalMetric: "log2_fold_change",
    values: { s1: 1.0, s2: 2.0 },
    ...(overrides.measuredIdentifier !== undefined
      ? { measuredIdentifier: overrides.measuredIdentifier }
      : {}),
    ...(overrides.platformAnnotationProvenance !== undefined
      ? { platformAnnotationProvenance: overrides.platformAnnotationProvenance }
      : {}),
  };
}

function makeArrayFeature(
  overrides: {
    featureId?: string;
    measuredIdentifier?: string;
    platformAnnotationProvenance?: Record<string, string>;
    build?: string;
    coordinateSystem?: string;
  } = {},
): Record<string, unknown> {
  return {
    featureId: overrides.featureId ?? "cg-001",
    featureClass: "cpg_methylation",
    modality: "dna_methylation_array",
    measuredIdentifier: overrides.measuredIdentifier ?? "cg000001",
    measuredRegion: {
      chrom: "chr1",
      start: 1000,
      end: 1001,
      build: overrides.build ?? "hg38",
      coordinateSystem: overrides.coordinateSystem ?? "0-based-half-open",
    },
    signalMetric: "beta_value",
    values: { s1: 0.5, s2: 0.6 },
    ...(overrides.platformAnnotationProvenance !== undefined
      ? { platformAnnotationProvenance: overrides.platformAnnotationProvenance }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("validateFeatureCoordinates – valid features", () => {
  it("passes for valid 0-based half-open region feature", () => {
    const result = validateFeatureCoordinates([makeRegionFeature()]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.mixedBuildDetected).toBe(false);
    expect(result.buildsFound).toEqual(["hg38"]);
  });

  it("passes for valid array feature with platform provenance", () => {
    const result = validateFeatureCoordinates([
      makeArrayFeature({
        platformAnnotationProvenance: {
          platform: "EPIC",
          manifestVersion: "1.0",
        },
      }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.blocksInterpretation).toBe(false);
  });

  it("normalizes 1-based closed coordinates to 0-based half-open", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({
        coordinateSystem: "1-based-closed",
        start: 1001,
        end: 2000,
      }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    const normalized = result.normalizedFeatures[0];
    expect(normalized.measuredRegion).toEqual({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      build: "hg38",
      coordinateSystem: "0-based-half-open",
    });
  });

  it("preserves 0-based half-open coordinates unchanged", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({
        coordinateSystem: "0-based-half-open",
        start: 1000,
        end: 2000,
      }),
    ]);
    expect(result.valid).toBe(true);
    const normalized = result.normalizedFeatures[0];
    expect(normalized.measuredRegion).toEqual({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      build: "hg38",
      coordinateSystem: "0-based-half-open",
    });
  });
});

// ---------------------------------------------------------------------------
// Coordinate system validation (EPI002)
// ---------------------------------------------------------------------------

describe("validateFeatureCoordinates – missing coordinate system", () => {
  it("emits EPI002 when region-bearing feature lacks coordinate system", () => {
    const feature = makeRegionFeature();
    delete (feature.measuredRegion as Record<string, unknown>).coordinateSystem;
    const result = validateFeatureCoordinates([feature]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI002"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Genome build validation (EPI004)
// ---------------------------------------------------------------------------

describe("validateFeatureCoordinates – missing/mixed builds", () => {
  it("emits EPI004 when region-bearing feature lacks genome build", () => {
    const feature = makeRegionFeature();
    delete (feature.measuredRegion as Record<string, unknown>).build;
    const result = validateFeatureCoordinates([feature]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI004"))).toBe(true);
    expect(result.errors.some((e) => e.includes("missing genome build"))).toBe(
      true,
    );
  });

  it("emits EPI004 for mixed genome builds", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({ build: "hg38" }),
      makeRegionFeature({ featureId: "feat-002", build: "hg19" }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.mixedBuildDetected).toBe(true);
    expect(result.errors.some((e) => e.includes("EPI004"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Mixed genome builds"))).toBe(
      true,
    );
  });

  it("emits EPI004 for unsupported genome build", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({ build: "canFam3" }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI004"))).toBe(true);
    expect(result.errors.some((e) => e.includes("canFam3"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Chromosome bounds validation (EPI009)
// ---------------------------------------------------------------------------

describe("validateFeatureCoordinates – chromosome bounds", () => {
  it("emits EPI009 for out-of-bounds interval", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({ chrom: "chr1", start: 0, end: 999_999_999 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI009"))).toBe(true);
    expect(
      result.errors.some((e) => e.includes("exceeds chromosome length")),
    ).toBe(true);
  });

  it("emits EPI009 for unknown chromosome (unsupported contig)", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({ chrom: "chrZ" }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI009"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Unknown chromosome"))).toBe(
      true,
    );
  });

  it("emits EPI009 for unknown build", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({ build: "unknownBuild", chrom: "chr1" }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI009"))).toBe(true);
    expect(
      result.errors.some((e) => e.includes("not in frozen chromosome sizes")),
    ).toBe(true);
  });

  it("emits EPI009 for invalid interval (end <= start)", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({ start: 2000, end: 1000 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI009"))).toBe(true);
  });

  it("passes for interval at exact chromosome boundary", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({ chrom: "chrM", start: 0, end: 16569, build: "hg38" }),
    ]);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Coordinate normalization edge cases
// ---------------------------------------------------------------------------

describe("validateFeatureCoordinates – 1-based conversion", () => {
  it("converts single-base 1-based feature to valid 0-based half-open", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({
        coordinateSystem: "1-based-closed",
        start: 1,
        end: 1,
      }),
    ]);
    expect(result.valid).toBe(true);
    const normalized = result.normalizedFeatures[0];
    expect(normalized.measuredRegion).toEqual({
      chrom: "chr1",
      start: 0,
      end: 1,
      build: "hg38",
      coordinateSystem: "0-based-half-open",
    });
  });

  it("rejects start=0 in 1-based system because it normalizes to -1", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({
        coordinateSystem: "1-based-closed",
        start: 0,
        end: 100,
      }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI003"))).toBe(true);
    expect(
      result.errors.some((e) => e.includes("normalized start coordinate -1")),
    ).toBe(true);
  });

  it("rejects zero-length interval in 0-based system", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({
        coordinateSystem: "0-based-half-open",
        start: 100,
        end: 100,
      }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI003"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Platform provenance validation (EPI010)
// ---------------------------------------------------------------------------

describe("validateFeatureCoordinates – missing platform manifests", () => {
  it("emits EPI010 when array-derived feature lacks platform provenance", () => {
    const result = validateFeatureCoordinates([
      makeArrayFeature({ platformAnnotationProvenance: undefined }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI010"))).toBe(true);
    expect(
      result.errors.some((e) => e.includes("missing platformAnnotationProvenance")),
    ).toBe(true);
    expect(result.blocksInterpretation).toBe(true);
  });

  it("passes for non-array features without platform provenance", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({ modality: "atac_seq", featureClass: "atac_peak" }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.blocksInterpretation).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Batch and edge cases
// ---------------------------------------------------------------------------

describe("validateFeatureCoordinates – batch handling", () => {
  it("reports valid and invalid features in the same batch", () => {
    const result = validateFeatureCoordinates([
      makeRegionFeature({ featureId: "f-good" }),
      makeRegionFeature({
        featureId: "f-bad-build",
        build: "unsupportedBuild",
      }),
      makeRegionFeature({
        featureId: "f-bad-bounds",
        chrom: "chr1",
        start: 0,
        end: 999_999_999,
      }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.includes("f-bad-build"))).toBe(true);
    expect(result.errors.some((e) => e.includes("f-bad-bounds"))).toBe(true);
    expect(result.errors.some((e) => e.includes("f-good"))).toBe(false);
  });

  it("preserves non-region-bearing features unchanged", () => {
    const result = validateFeatureCoordinates([
      {
        featureId: "id-only",
        featureClass: "ncrna_expression",
        modality: "mirna_expression",
        measuredIdentifier: "mir-21",
        signalMetric: "log2_cpm",
        values: { s1: 5.0 },
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.normalizedFeatures[0]).toMatchObject({
      featureId: "id-only",
      featureClass: "ncrna_expression",
    });
  });

  it("passes for empty feature array", () => {
    const result = validateFeatureCoordinates([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.normalizedFeatures).toHaveLength(0);
  });

  it("ignores unparseable feature objects", () => {
    const result = validateFeatureCoordinates([
      "not-a-feature",
      42,
      null,
      { featureId: "", featureClass: "atac_peak" },
    ]);
    expect(result.valid).toBe(false);
    // The empty featureId triggers a coordinate system validation error
    expect(result.errors.some((e) => e.includes("EPI002"))).toBe(true);
  });
});

describe("validateFeatureCoordinates – liftover provenance", () => {
  it("detects declared liftover in provenance and adds warning", () => {
    const result = validateFeatureCoordinates(
      [makeRegionFeature()],
      {
        provenanceSteps: [
          {
            stepName: "liftover",
            toolName: "liftOver",
            toolVersion: "1.0",
            parameters: {},
          },
        ],
      },
    );
    expect(result.valid).toBe(true);
    expect(result.liftoverDetected).toBe(true);
    expect(result.warnings.some((w) => w.includes("EPI004"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("liftover"))).toBe(true);
  });
});

describe("validateFeatureCoordinates – option passthrough", () => {
  it("allows mixed builds when blockMixedBuilds is false", () => {
    const result = validateFeatureCoordinates(
      [
        makeRegionFeature({ build: "hg38" }),
        makeRegionFeature({ featureId: "feat-002", build: "hg19" }),
      ],
      { blockMixedBuilds: false },
    );
    expect(result.valid).toBe(true);
    expect(result.mixedBuildDetected).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("skips bounds check when requireBoundsCheck is false", () => {
    const result = validateFeatureCoordinates(
      [
        makeRegionFeature({ chrom: "chr1", start: 0, end: 999_999_999 }),
      ],
      {
        chromosomeBoundsOptions: { requireBoundsCheck: false },
      },
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("skips coordinate normalization when normalizeCoordinates is false", () => {
    const result = validateFeatureCoordinates(
      [
        makeRegionFeature({
          coordinateSystem: "1-based-closed",
          start: 1001,
          end: 2000,
        }),
      ],
      { normalizeCoordinates: false },
    );
    expect(result.valid).toBe(true);
    const normalized = result.normalizedFeatures[0];
    // Original coordinates preserved
    expect(normalized.measuredRegion).toEqual({
      chrom: "chr1",
      start: 1001,
      end: 2000,
      build: "hg38",
      coordinateSystem: "1-based-closed",
    });
  });
});
