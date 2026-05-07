import { describe, it, expect } from "vitest";
import {
  classifyRegionFeatureClass,
  buildRegionFeatures,
  RegionFeatureClassSchema,
  ClassificationConfidenceSchema,
  RegionClassificationOptionsSchema,
  RegionClassificationResultSchema,
  RegionFeatureBuildOptionsSchema,
} from "../../src/ingestion/region_feature_classifier.js";
import {
  GenericRegionFeatureSchema,
  ChromatinAccessibilityFeatureSchema,
  HistoneMarkFeatureSchema,
} from "../../src/contracts/features.js";

describe("classifyRegionFeatureClass", () => {
  // --- BED-like generic region fixtures ---

  it("classifies BED-like table as generic_region_feature when coordinates and semantics are declared", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["chrom", "start", "end", "sample_A", "sample_B"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
    });

    expect(result.featureClass).toBe("generic_region_feature");
    expect(result.confidence).toBe("high");
    expect(result.regionColumns).toEqual({
      chrom: "chrom",
      start: "start",
      end: "end",
    });
    expect(result.errors).toHaveLength(0);
  });

  it("classifies generic region feature with chromatin_interaction modality", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chromatin_interaction",
      modality: "hic",
      headers: ["chr", "start", "end", "signal"],
      detectedShape: "wide",
      featureValueSemantics: "normalized_signal",
    });

    expect(result.featureClass).toBe("chromatin_interaction");
    expect(result.confidence).toBe("high");
    expect(result.errors).toHaveLength(0);
  });

  it("classifies generic region feature for unknown assay family when coordinates present", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "unknown",
      modality: "chip_seq",
      headers: ["chromosome", "start", "end", "score"],
      detectedShape: "summary",
      featureValueSemantics: "peak_score",
    });

    expect(result.featureClass).toBe("generic_region_feature");
    expect(result.confidence).toBe("high");
  });

  // --- ATAC-like feature-flag fixtures ---

  it("classifies ATAC table as atac_peak when feature flag is enabled", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["chr", "start", "end", "peak_format", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
      featureFlags: {
        enableChromatinAccessibility: true,
        enableHistoneMark: false,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    });

    expect(result.featureClass).toBe("atac_peak");
    expect(result.confidence).toBe("high");
    expect(result.errors).toHaveLength(0);
  });

  it("falls back to generic_region_feature when ATAC flag is disabled", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["chr", "start", "end", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
      featureFlags: {
        enableChromatinAccessibility: false,
        enableHistoneMark: false,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    });

    expect(result.featureClass).toBe("generic_region_feature");
    expect(result.confidence).toBe("high");
    expect(result.warnings).toContain(
      "ATAC-seq modality detected but enableChromatinAccessibility feature flag is disabled; classifying as generic_region_feature",
    );
  });

  it("reduces confidence when ATAC flag enabled but peak_format column missing", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["chr", "start", "end", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
      featureFlags: {
        enableChromatinAccessibility: true,
        enableHistoneMark: false,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    });

    expect(result.featureClass).toBe("atac_peak");
    expect(result.confidence).toBe("medium");
    expect(result.warnings).toContain(
      "ATAC-seq modality detected with feature flag enabled but peak_format column is missing; confidence reduced to medium",
    );
  });

  // --- Histone mark feature-flag fixtures ---

  it("classifies ChIP table as histone_mark_peak when flag enabled and mark present", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "histone_modification",
      modality: "chip_seq",
      headers: ["chr", "start", "end", "mark", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "peak_score",
      featureFlags: {
        enableChromatinAccessibility: false,
        enableHistoneMark: true,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    });

    expect(result.featureClass).toBe("histone_mark_peak");
    expect(result.confidence).toBe("high");
    expect(result.errors).toHaveLength(0);
  });

  it("falls back to chip_peak_narrow when mark name is missing but histone flag enabled", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chip_seq",
      modality: "chip_seq",
      headers: ["chr", "start", "end", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "peak_score",
      featureFlags: {
        enableChromatinAccessibility: false,
        enableHistoneMark: true,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    });

    expect(result.featureClass).toBe("chip_peak_narrow");
    expect(result.confidence).toBe("medium");
    expect(result.warnings).toContain(
      "ChIP-seq modality detected without mark name; defaulting to chip_peak_narrow. Provide mark name or explicitFeatureClass for precise classification.",
    );
  });

  it("falls back to generic_region_feature when histone mark flag is disabled", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "histone_modification",
      modality: "chip_seq",
      headers: ["chr", "start", "end", "mark", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "peak_score",
      featureFlags: {
        enableChromatinAccessibility: false,
        enableHistoneMark: false,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    });

    expect(result.featureClass).toBe("generic_region_feature");
    expect(result.confidence).toBe("high");
    expect(result.warnings).toContain(
      "ChIP-seq modality detected but enableHistoneMark feature flag is disabled; classifying as generic_region_feature",
    );
  });

  // --- Missing metric semantics / fail-closed ---

  it("warns about declared_other semantics", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["chr", "start", "end", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "declared_other",
    });

    expect(result.warnings).toContain(
      "Measurement semantics are 'declared_other'; downstream interpretation requires explicit metric documentation",
    );
  });

  // --- Fail-closed on missing coordinates ---

  it("returns unclassified when region columns are missing", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["feature_id", "sample_A", "sample_B"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
    });

    expect(result.featureClass).toBe("unclassified");
    expect(result.confidence).toBe("low");
    expect(result.errors).toContain(
      "Region feature classification requires chromosome, start, and end columns; none detected",
    );
  });

  it("returns unclassified when only chrom and start are present", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["chr", "start", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
    });

    expect(result.featureClass).toBe("unclassified");
    expect(result.errors).toHaveLength(1);
  });

  // --- Explicit override ---

  it("honours explicitFeatureClass override to generic_region_feature", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["chr", "start", "end", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
      explicitFeatureClass: "generic_region_feature",
    });

    expect(result.featureClass).toBe("generic_region_feature");
    expect(result.confidence).toBe("override");
    expect(result.errors).toHaveLength(0);
  });

  it("blocks explicit ATAC override when feature flag is disabled", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["chr", "start", "end", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
      explicitFeatureClass: "atac_peak",
      featureFlags: {
        enableChromatinAccessibility: false,
        enableHistoneMark: false,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    });

    expect(result.featureClass).toBe("unclassified");
    expect(result.confidence).toBe("low");
    expect(result.errors).toContain(
      'Feature class "atac_peak" is reserved behind the enableChromatinAccessibility feature flag',
    );
  });

  it("blocks explicit histone_mark_peak override when feature flag is disabled", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "histone_modification",
      modality: "chip_seq",
      headers: ["chr", "start", "end", "mark", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "peak_score",
      explicitFeatureClass: "histone_mark_peak",
      featureFlags: {
        enableChromatinAccessibility: false,
        enableHistoneMark: false,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    });

    expect(result.featureClass).toBe("unclassified");
    expect(result.errors).toContain(
      'Feature class "histone_mark_peak" is reserved behind the enableHistoneMark feature flag',
    );
  });

  it("allows explicit histone_mark_peak when feature flag is enabled", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "histone_modification",
      modality: "chip_seq",
      headers: ["chr", "start", "end", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "peak_score",
      explicitFeatureClass: "histone_mark_peak",
      featureFlags: {
        enableChromatinAccessibility: false,
        enableHistoneMark: true,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    });

    expect(result.featureClass).toBe("histone_mark_peak");
    expect(result.confidence).toBe("override");
    expect(result.errors).toHaveLength(0);
  });

  // --- Mixed class warnings ---

  it("warns when headers contain mixed ATAC and ChIP indicators", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "unknown",
      modality: "atac_seq",
      headers: ["chr", "start", "end", "peak_format", "mark", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
      featureFlags: {
        enableChromatinAccessibility: true,
        enableHistoneMark: true,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    });

    // modality is atac_seq, so ATAC takes precedence
    expect(result.featureClass).toBe("atac_peak");
    expect(result.warnings).toContain(
      "Headers contain both peak-format and mark-name indicators; mixed-class table detected. Verify that modality and explicitFeatureClass are correctly specified.",
    );
  });

  // --- Schema validation ---

  it("produces output valid against RegionClassificationResultSchema", () => {
    const result = classifyRegionFeatureClass({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["chr", "start", "end", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
    });

    expect(() =>
      RegionClassificationResultSchema.parse(result),
    ).not.toThrow();
  });

  it("rejects invalid options via schema", () => {
    const parseResult = RegionClassificationOptionsSchema.safeParse({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: [],
      detectedShape: "wide",
      // missing featureValueSemantics
    });

    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const paths = parseResult.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("featureValueSemantics");
    }
  });
});

describe("buildRegionFeatures", () => {
  const baseOptions = {
    assayFamily: "chromatin_accessibility" as const,
    modality: "atac_seq" as const,
    headers: ["chr", "start", "end", "sample_A", "sample_B"],
    detectedShape: "wide" as const,
    featureValueSemantics: "accessibility_signal" as const,
  };

  const baseClassification = {
    featureClass: "generic_region_feature" as const,
    confidence: "high" as const,
    warnings: [] as string[],
    errors: [] as string[],
    regionColumns: {
      chrom: "chr",
      start: "start",
      end: "end",
    },
  };

  it("builds generic region features from BED-like rows", () => {
    const rows = [
      { chr: "chr1", start: "1000", end: "2000", sample_A: "1.23", sample_B: "2.34" },
      { chr: "chr2", start: "5000", end: "6000", sample_A: "3.45", sample_B: "4.56" },
    ];

    const result = buildRegionFeatures(
      rows,
      baseClassification,
      baseOptions,
      ["sample_A", "sample_B"],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(2);
    expect(result.errors).toHaveLength(0);

    const feat1 = result.features[0];
    expect(feat1.featureId).toBe("chr1:1000-2000");
    expect(feat1.featureClass).toBe("generic_region_feature");
    expect(feat1.measuredRegion).toEqual({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      build: "hg38",
      coordinateSystem: "0-based-half-open",
    });
    expect(feat1.values).toEqual({
      sample_A: 1.23,
      sample_B: 2.34,
    });
  });

  it("builds ATAC features with peakFormat when flag enabled", () => {
    const classification = {
      featureClass: "atac_peak" as const,
      confidence: "high" as const,
      warnings: [] as string[],
      errors: [] as string[],
      regionColumns: {
        chrom: "chr",
        start: "start",
        end: "end",
      },
    };
    const options = {
      ...baseOptions,
      headers: ["chr", "start", "end", "peak_format", "sample_A"],
      featureFlags: {
        enableChromatinAccessibility: true,
        enableHistoneMark: false,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    };
    const rows = [
      { chr: "chr1", start: "1000", end: "2000", peak_format: "narrowPeak", sample_A: "2.5" },
    ];

    const result = buildRegionFeatures(
      rows,
      classification,
      options,
      ["sample_A"],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(1);
    const feat = result.features[0];
    expect(feat.featureClass).toBe("atac_peak");
    expect(feat).toHaveProperty("peakFormat", "narrowPeak");
    expect(() => ChromatinAccessibilityFeatureSchema.parse(feat)).not.toThrow();
  });

  it("defaults peakFormat to custom when column is missing", () => {
    const classification = {
      featureClass: "atac_peak" as const,
      confidence: "high" as const,
      warnings: [] as string[],
      errors: [] as string[],
      regionColumns: {
        chrom: "chr",
        start: "start",
        end: "end",
      },
    };
    const options = {
      ...baseOptions,
      featureFlags: {
        enableChromatinAccessibility: true,
        enableHistoneMark: false,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    };
    const rows = [
      { chr: "chr1", start: "1000", end: "2000", sample_A: "2.5" },
    ];

    const result = buildRegionFeatures(
      rows,
      classification,
      options,
      ["sample_A"],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toHaveProperty("peakFormat", "custom");
  });

  it("builds histone mark features with mark name when flag enabled", () => {
    const classification = {
      featureClass: "histone_mark_peak" as const,
      confidence: "high" as const,
      warnings: [] as string[],
      errors: [] as string[],
      regionColumns: {
        chrom: "chr",
        start: "start",
        end: "end",
      },
    };
    const options = {
      assayFamily: "histone_modification" as const,
      modality: "chip_seq" as const,
      headers: ["chr", "start", "end", "mark", "sample_A"],
      detectedShape: "wide" as const,
      featureValueSemantics: "peak_score" as const,
      featureFlags: {
        enableChromatinAccessibility: false,
        enableHistoneMark: true,
        enableMirnaExpression: false,
        enableNcrnaExpression: false,
        enableChromatinStateContext: false,
        enableBatchEffectModeling: false,
        enableCellDeconvolution: false,
      },
    };
    const rows = [
      { chr: "chr1", start: "1000", end: "2000", mark: "H3K27ac", sample_A: "15.2" },
    ];

    const result = buildRegionFeatures(
      rows,
      classification,
      options,
      ["sample_A"],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(1);
    const feat = result.features[0];
    expect(feat.featureClass).toBe("histone_mark_peak");
    expect(feat).toHaveProperty("histoneMark", "H3K27ac");
    expect(() => HistoneMarkFeatureSchema.parse(feat)).not.toThrow();
  });

  it("handles missing values and NA strings as null", () => {
    const rows = [
      { chr: "chr1", start: "1000", end: "2000", sample_A: "", sample_B: "NA" },
    ];

    const result = buildRegionFeatures(
      rows,
      baseClassification,
      baseOptions,
      ["sample_A", "sample_B"],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(1);
    expect(result.features[0].values).toEqual({
      sample_A: null,
      sample_B: null,
    });
  });

  it("reports errors for rows with missing region coordinates", () => {
    const rows = [
      { chr: "", start: "", end: "", sample_A: "1.0" },
    ];

    const result = buildRegionFeatures(
      rows,
      baseClassification,
      baseOptions,
      ["sample_A"],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("unable to determine featureId");
  });

  it("uses explicit featureIdColumn when provided", () => {
    const rows = [
      { peak_id: "peak-001", chr: "chr1", start: "1000", end: "2000", sample_A: "1.0" },
    ];

    const result = buildRegionFeatures(
      rows,
      baseClassification,
      {
        ...baseOptions,
        headers: ["peak_id", "chr", "start", "end", "sample_A"],
      },
      ["sample_A"],
      {
        genomeBuild: "hg38",
        coordinateSystem: "0-based-half-open",
        featureIdColumn: "peak_id",
      },
    );

    expect(result.features).toHaveLength(1);
    expect(result.features[0].featureId).toBe("peak-001");
  });

  it("produces generic region features that validate against GenericRegionFeatureSchema", () => {
    const rows = [
      { chr: "chr1", start: "1000", end: "2000", sample_A: "1.0" },
    ];

    const result = buildRegionFeatures(
      rows,
      baseClassification,
      baseOptions,
      ["sample_A"],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(1);
    expect(() =>
      GenericRegionFeatureSchema.parse(result.features[0]),
    ).not.toThrow();
  });

  it("returns error when regionColumns are missing in classification", () => {
    const classification = {
      featureClass: "generic_region_feature" as const,
      confidence: "high" as const,
      warnings: [] as string[],
      errors: [] as string[],
    };
    const rows = [
      { chr: "chr1", start: "1000", end: "2000", sample_A: "1.0" },
    ];

    const result = buildRegionFeatures(
      rows,
      classification as unknown as typeof baseClassification,
      baseOptions,
      ["sample_A"],
    );

    expect(result.features).toHaveLength(0);
    expect(result.errors).toContain(
      "Region columns are required to build region features",
    );
  });
});

describe("RegionFeatureClassSchema", () => {
  it("accepts valid region feature classes", () => {
    expect(RegionFeatureClassSchema.parse("generic_region_feature")).toBe(
      "generic_region_feature",
    );
    expect(RegionFeatureClassSchema.parse("atac_peak")).toBe("atac_peak");
    expect(RegionFeatureClassSchema.parse("histone_mark_peak")).toBe(
      "histone_mark_peak",
    );
    expect(RegionFeatureClassSchema.parse("unclassified")).toBe("unclassified");
  });

  it("rejects invalid region feature classes", () => {
    expect(() => RegionFeatureClassSchema.parse("cpg_methylation")).toThrow();
    expect(() => RegionFeatureClassSchema.parse("dmr")).toThrow();
  });
});

describe("ClassificationConfidenceSchema", () => {
  it("accepts valid confidence levels", () => {
    expect(ClassificationConfidenceSchema.parse("high")).toBe("high");
    expect(ClassificationConfidenceSchema.parse("medium")).toBe("medium");
    expect(ClassificationConfidenceSchema.parse("low")).toBe("low");
    expect(ClassificationConfidenceSchema.parse("override")).toBe("override");
  });

  it("rejects invalid confidence levels", () => {
    expect(() => ClassificationConfidenceSchema.parse("maybe")).toThrow();
  });
});

describe("RegionFeatureBuildOptionsSchema", () => {
  it("accepts valid build options", () => {
    const opts = RegionFeatureBuildOptionsSchema.parse({
      genomeBuild: "hg38",
      coordinateSystem: "0-based-half-open",
      featureIdColumn: "peak_id",
    });
    expect(opts.genomeBuild).toBe("hg38");
  });

  it("accepts empty build options", () => {
    const opts = RegionFeatureBuildOptionsSchema.parse({});
    expect(opts.genomeBuild).toBeUndefined();
  });
});
