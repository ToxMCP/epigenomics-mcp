import { describe, it, expect } from "vitest";
import {
  analyzeMixedFeatures,
  buildSplitFeatureMatrices,
  MixedFeatureHandlingPolicySchema,
  MixedFeatureDetectionConfigSchema,
  PerRowFeatureClassSchema,
  RowClassificationResultSchema,
  MixedFeatureAnalysisResultSchema,
  SplitMatrixBuildOptionsSchema,
  SplitFeatureMatrixSchema,
  perRowClassToFeatureClass,
} from "../../src/ingestion/mixed_feature_handler.js";

describe("analyzeMixedFeatures", () => {
  // -----------------------------------------------------------------------
  // Config validation
  // -----------------------------------------------------------------------

  it("blocks on invalid config", () => {
    const result = analyzeMixedFeatures(
      [{ feature_id: "f1" }],
      ["feature_id"],
      "dna_methylation",
      "dna_methylation_array",
      // @ts-expect-error testing invalid config
      { policy: "not_a_policy" },
    );

    expect(result.isBlocked).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("config.policy");
  });

  it("accepts valid config defaults", () => {
    const result = analyzeMixedFeatures(
      [{ feature_id: "f1", probe_id: "cg001" }],
      ["feature_id", "probe_id"],
      "dna_methylation",
      "dna_methylation_array",
    );

    expect(() =>
      MixedFeatureAnalysisResultSchema.parse(result),
    ).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // Explicit override
  // -----------------------------------------------------------------------

  it("short-circuits with explicitFeatureClass override", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001" },
      { feature_id: "f2", chr: "chr1", start: "100", end: "200" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end"],
      "dna_methylation",
      "dna_methylation_array",
      { explicitFeatureClass: "cpg_methylation" },
    );

    expect(result.isMixed).toBe(false);
    expect(result.isBlocked).toBe(false);
    expect(result.dominantClass).toBe("cpg_methylation");
    expect(result.detectedClasses).toEqual(["cpg_methylation"]);
    expect(result.splitRowGroups["cpg_methylation"]).toHaveLength(2);
    expect(result.rowClassifications.every((r) => r.detectedClass === "cpg_methylation")).toBe(
      true,
    );
  });

  // -----------------------------------------------------------------------
  // Mixed CpG / DMR
  // -----------------------------------------------------------------------

  it("detects mixed CpG and DMR rows", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001", sample_A: "0.8" },
      { feature_id: "f2", chr: "chr1", start: "100", end: "200", sample_A: "0.9" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "split" },
    );

    expect(result.isMixed).toBe(true);
    expect(result.detectedClasses).toContain("cpg_methylation");
    expect(result.detectedClasses).toContain("dmr");
    expect(result.classCounts["cpg_methylation"]).toBe(1);
    expect(result.classCounts["dmr"]).toBe(1);
  });

  it("splits mixed CpG/DMR into homogenous groups with policy split", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001", sample_A: "0.8" },
      { feature_id: "f2", probe_id: "cg002", sample_A: "0.7" },
      { feature_id: "f3", chr: "chr1", start: "100", end: "200", sample_A: "0.9" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "split" },
    );

    expect(result.isBlocked).toBe(false);
    expect(result.splitRowGroups["cpg_methylation"]).toHaveLength(2);
    expect(result.splitRowGroups["dmr"]).toHaveLength(1);
    expect(result.splitRowGroups["cpg_methylation"][0].feature_id).toBe("f1");
    expect(result.splitRowGroups["dmr"][0].feature_id).toBe("f3");
    expect(result.warnings.some((w) => w.includes("split"))).toBe(true);
  });

  it("blocks mixed CpG/DMR with policy block", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001", sample_A: "0.8" },
      { feature_id: "f2", chr: "chr1", start: "100", end: "200", sample_A: "0.9" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "block" },
    );

    expect(result.isBlocked).toBe(true);
    expect(result.errors.some((e) => e.includes("blocked by mixed-feature policy"))).toBe(true);
    expect(Object.keys(result.splitRowGroups)).toHaveLength(0);
  });

  it("emits review warnings for mixed CpG/DMR with policy review_required", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001", sample_A: "0.8" },
      { feature_id: "f2", chr: "chr1", start: "100", end: "200", sample_A: "0.9" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "review_required" },
    );

    expect(result.isMixed).toBe(true);
    expect(result.isBlocked).toBe(false);
    expect(result.warnings.some((w) => w.includes("review_required"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Methylation family mixed-class"))).toBe(true);
  });

  it("does not warn about methylation mixed-class when allowMethylationMixedClasses is true", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001", sample_A: "0.8" },
      { feature_id: "f2", chr: "chr1", start: "100", end: "200", sample_A: "0.9" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "review_required", allowMethylationMixedClasses: true },
    );

    expect(result.warnings.some((w) => w.includes("Methylation family mixed-class"))).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Ambiguous rows in methylation tables
  // -----------------------------------------------------------------------

  it("flags ambiguous rows that have both probe_id and region columns", () => {
    const rows = [
      {
        feature_id: "f1",
        probe_id: "cg001",
        chr: "chr1",
        start: "100",
        end: "200",
        sample_A: "0.8",
      },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "split" },
    );

    expect(result.rowClassifications[0].detectedClass).toBe("ambiguous");
    expect(result.errors.some((e) => e.includes("conflicting feature-class indicators"))).toBe(
      true,
    );
    expect(result.splitRowGroups["ambiguous"]).toHaveLength(1);
  });

  it("never silently relabels ambiguous rows", () => {
    const rows = [
      {
        feature_id: "f1",
        probe_id: "cg001",
        chr: "chr1",
        start: "100",
        end: "200",
        sample_A: "0.8",
      },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "split" },
    );

    // The ambiguous row must NOT appear in cpg_methylation or dmr groups
    expect(result.splitRowGroups["cpg_methylation"] ?? []).toHaveLength(0);
    expect(result.splitRowGroups["dmr"] ?? []).toHaveLength(0);
    expect(result.splitRowGroups["ambiguous"]).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Unknown feature class
  // -----------------------------------------------------------------------

  it("flags unknown rows that lack any recognised indicators", () => {
    const rows = [{ feature_id: "f1", other_col: "x" }];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "other_col"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "split" },
    );

    expect(result.rowClassifications[0].detectedClass).toBe("unknown");
    expect(result.warnings.some((w) => w.includes("no recognised feature-class indicators"))).toBe(
      true,
    );
    expect(result.splitRowGroups["unknown"]).toHaveLength(1);
  });

  it("never silently relabels unknown rows into a guessed class", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001", sample_A: "0.8" },
      { feature_id: "f2", other_col: "x" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "other_col", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "split" },
    );

    expect(result.rowClassifications[1].detectedClass).toBe("unknown");
    expect(result.splitRowGroups["unknown"]).toHaveLength(1);
    expect(result.splitRowGroups["cpg_methylation"]).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Mixed ATAC / histone
  // -----------------------------------------------------------------------

  it("detects mixed ATAC and histone rows", () => {
    const rows = [
      { feature_id: "f1", chr: "chr1", start: "100", end: "200", peak_format: "narrowPeak", sample_A: "2.5" },
      { feature_id: "f2", chr: "chr2", start: "300", end: "400", mark: "H3K27ac", sample_A: "15.2" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "chr", "start", "end", "peak_format", "mark", "sample_A"],
      "chromatin_accessibility",
      "atac_seq",
      { policy: "split" },
    );

    expect(result.isMixed).toBe(true);
    expect(result.detectedClasses).toContain("atac_peak");
    expect(result.detectedClasses).toContain("histone_mark_peak");
  });

  it("splits mixed ATAC/histone into homogenous groups", () => {
    const rows = [
      { feature_id: "f1", chr: "chr1", start: "100", end: "200", peak_format: "narrowPeak", sample_A: "2.5" },
      { feature_id: "f2", chr: "chr2", start: "300", end: "400", mark: "H3K27ac", sample_A: "15.2" },
      { feature_id: "f3", chr: "chr3", start: "500", end: "600", peak_format: "broadPeak", sample_A: "3.1" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "chr", "start", "end", "peak_format", "mark", "sample_A"],
      "chromatin_accessibility",
      "atac_seq",
      { policy: "split" },
    );

    expect(result.isBlocked).toBe(false);
    expect(result.splitRowGroups["atac_peak"]).toHaveLength(2);
    expect(result.splitRowGroups["histone_mark_peak"]).toHaveLength(1);
  });

  it("blocks mixed ATAC/histone with policy block", () => {
    const rows = [
      { feature_id: "f1", chr: "chr1", start: "100", end: "200", peak_format: "narrowPeak", sample_A: "2.5" },
      { feature_id: "f2", chr: "chr2", start: "300", end: "400", mark: "H3K27ac", sample_A: "15.2" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "chr", "start", "end", "peak_format", "mark", "sample_A"],
      "chromatin_accessibility",
      "atac_seq",
      { policy: "block" },
    );

    expect(result.isBlocked).toBe(true);
    expect(result.errors.some((e) => e.includes("blocked by mixed-feature policy"))).toBe(true);
  });

  it("emits review warnings for mixed ATAC/histone with policy review_required", () => {
    const rows = [
      { feature_id: "f1", chr: "chr1", start: "100", end: "200", peak_format: "narrowPeak", sample_A: "2.5" },
      { feature_id: "f2", chr: "chr2", start: "300", end: "400", mark: "H3K27ac", sample_A: "15.2" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "chr", "start", "end", "peak_format", "mark", "sample_A"],
      "chromatin_accessibility",
      "atac_seq",
      { policy: "review_required" },
    );

    expect(result.warnings.some((w) => w.includes("Region-level mixed-class"))).toBe(true);
  });

  it("does not warn about region mixed-class when allowRegionMixedClasses is true", () => {
    const rows = [
      { feature_id: "f1", chr: "chr1", start: "100", end: "200", peak_format: "narrowPeak", sample_A: "2.5" },
      { feature_id: "f2", chr: "chr2", start: "300", end: "400", mark: "H3K27ac", sample_A: "15.2" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "chr", "start", "end", "peak_format", "mark", "sample_A"],
      "chromatin_accessibility",
      "atac_seq",
      { policy: "review_required", allowRegionMixedClasses: true },
    );

    expect(result.warnings.some((w) => w.includes("Region-level mixed-class"))).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Ambiguous rows in region tables
  // -----------------------------------------------------------------------

  it("flags ambiguous rows that have both peak_format and mark", () => {
    const rows = [
      { feature_id: "f1", chr: "chr1", start: "100", end: "200", peak_format: "narrowPeak", mark: "H3K27ac", sample_A: "2.5" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "chr", "start", "end", "peak_format", "mark", "sample_A"],
      "chromatin_accessibility",
      "atac_seq",
      { policy: "split" },
    );

    expect(result.rowClassifications[0].detectedClass).toBe("ambiguous");
    expect(result.errors.some((e) => e.includes("conflicting feature-class indicators"))).toBe(
      true,
    );
  });

  // -----------------------------------------------------------------------
  // Generic region fallback
  // -----------------------------------------------------------------------

  it("classifies coordinate-only rows as generic_region_feature for non-methylation families", () => {
    const rows = [
      { feature_id: "f1", chr: "chr1", start: "100", end: "200", sample_A: "2.5" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "chr", "start", "end", "sample_A"],
      "chromatin_accessibility",
      "atac_seq",
      { policy: "split" },
    );

    expect(result.isMixed).toBe(false);
    expect(result.detectedClasses).toEqual(["generic_region_feature"]);
  });

  it("classifies Hi-C rows as chromatin_interaction when coordinates present", () => {
    const rows = [
      { feature_id: "f1", chr: "chr1", start: "100", end: "200", sample_A: "2.5" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "chr", "start", "end", "sample_A"],
      "chromatin_interaction",
      "hic",
      { policy: "split" },
    );

    expect(result.detectedClasses).toEqual(["chromatin_interaction"]);
  });

  // -----------------------------------------------------------------------
  // Determinism
  // -----------------------------------------------------------------------

  it("produces deterministic detectedClasses ordering regardless of input row order", () => {
    const rowsA = [
      { feature_id: "f1", peak_format: "narrowPeak", sample_A: "2.5" },
      { feature_id: "f2", mark: "H3K27ac", sample_A: "15.2" },
    ];
    const rowsB = [
      { feature_id: "f2", mark: "H3K27ac", sample_A: "15.2" },
      { feature_id: "f1", peak_format: "narrowPeak", sample_A: "2.5" },
    ];

    const resultA = analyzeMixedFeatures(
      rowsA,
      ["feature_id", "peak_format", "mark", "sample_A"],
      "chromatin_accessibility",
      "atac_seq",
      { policy: "split" },
    );
    const resultB = analyzeMixedFeatures(
      rowsB,
      ["feature_id", "peak_format", "mark", "sample_A"],
      "chromatin_accessibility",
      "atac_seq",
      { policy: "split" },
    );

    expect(resultA.detectedClasses).toEqual(resultB.detectedClasses);
    expect(resultA.detectedClasses).toEqual(["atac_peak", "histone_mark_peak"]);
  });

  it("preserves original row order within each split group", () => {
    const rows = [
      { feature_id: "f1", peak_format: "narrowPeak", sample_A: "2.5" },
      { feature_id: "f2", mark: "H3K27ac", sample_A: "15.2" },
      { feature_id: "f3", peak_format: "broadPeak", sample_A: "3.1" },
      { feature_id: "f4", mark: "H3K4me3", sample_A: "8.0" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "peak_format", "mark", "sample_A"],
      "chromatin_accessibility",
      "atac_seq",
      { policy: "split" },
    );

    expect(result.splitRowGroups["atac_peak"][0].feature_id).toBe("f1");
    expect(result.splitRowGroups["atac_peak"][1].feature_id).toBe("f3");
    expect(result.splitRowGroups["histone_mark_peak"][0].feature_id).toBe("f2");
    expect(result.splitRowGroups["histone_mark_peak"][1].feature_id).toBe("f4");
  });

  it("produces identical warnings and errors for identical inputs", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001", sample_A: "0.8" },
      { feature_id: "f2", other_col: "x" },
      { feature_id: "f3", chr: "chr1", start: "100", end: "200", sample_A: "0.9" },
    ];

    const result1 = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "other_col", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "review_required" },
    );
    const result2 = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "other_col", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "review_required" },
    );

    expect(result1.warnings).toEqual(result2.warnings);
    expect(result1.errors).toEqual(result2.errors);
    expect(result1.detectedClasses).toEqual(result2.detectedClasses);
    expect(result1.classCounts).toEqual(result2.classCounts);
  });

  // -----------------------------------------------------------------------
  // Dominant class detection
  // -----------------------------------------------------------------------

  it("identifies the dominant class correctly", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001", sample_A: "0.8" },
      { feature_id: "f2", probe_id: "cg002", sample_A: "0.7" },
      { feature_id: "f3", probe_id: "cg003", sample_A: "0.6" },
      { feature_id: "f4", chr: "chr1", start: "100", end: "200", sample_A: "0.9" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "split" },
    );

    expect(result.dominantClass).toBe("cpg_methylation");
  });

  // -----------------------------------------------------------------------
  // Not mixed when all rows are the same class
  // -----------------------------------------------------------------------

  it("reports not mixed when all rows are CpG", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001", sample_A: "0.8" },
      { feature_id: "f2", probe_id: "cg002", sample_A: "0.7" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "split" },
    );

    expect(result.isMixed).toBe(false);
    expect(result.detectedClasses).toEqual(["cpg_methylation"]);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("reports not mixed when all rows are generic region features", () => {
    const rows = [
      { feature_id: "f1", chr: "chr1", start: "100", end: "200", sample_A: "2.5" },
      { feature_id: "f2", chr: "chr2", start: "300", end: "400", sample_A: "3.1" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "chr", "start", "end", "sample_A"],
      "chromatin_accessibility",
      "atac_seq",
      { policy: "split" },
    );

    expect(result.isMixed).toBe(false);
    expect(result.detectedClasses).toEqual(["generic_region_feature"]);
  });

  // -----------------------------------------------------------------------
  // Schema validation
  // -----------------------------------------------------------------------

  it("produces output valid against MixedFeatureAnalysisResultSchema", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001", sample_A: "0.8" },
      { feature_id: "f2", chr: "chr1", start: "100", end: "200", sample_A: "0.9" },
    ];

    const result = analyzeMixedFeatures(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "sample_A"],
      "dna_methylation",
      "dna_methylation_array",
      { policy: "split" },
    );

    expect(() => MixedFeatureAnalysisResultSchema.parse(result)).not.toThrow();
  });
});

describe("buildSplitFeatureMatrices", () => {
  it("builds matrices only for resolvable classes", () => {
    const splitGroups = {
      cpg_methylation: [
        { feature_id: "cg001", sample_A: "0.8", sample_B: "0.7" },
        { feature_id: "cg002", sample_A: "0.9", sample_B: "0.6" },
      ],
      dmr: [
        { feature_id: "dmr-1", sample_A: "1.2", sample_B: "1.3" },
      ],
      unknown: [
        { feature_id: "unk-1", sample_A: "0.5", sample_B: "0.4" },
      ],
    };

    const rowClassifications: RowClassificationResult[] = [
      { rowIndex: 0, detectedClass: "cpg_methylation", reason: "probe" },
      { rowIndex: 1, detectedClass: "cpg_methylation", reason: "probe" },
      { rowIndex: 2, detectedClass: "dmr", reason: "region" },
      { rowIndex: 3, detectedClass: "unknown", reason: "none" },
    ];

    const result = buildSplitFeatureMatrices(
      splitGroups,
      rowClassifications,
      {
        tableIdPrefix: "test",
        signalMetric: "beta_value",
        sampleColumns: ["sample_A", "sample_B"],
        featureIdColumn: "feature_id",
      },
    );

    expect(result.matrices).toHaveLength(2);
    expect(result.matrices.map((m) => m.featureClass)).toContain("cpg_methylation");
    expect(result.matrices.map((m) => m.featureClass)).toContain("dmr");
    expect(result.matrices.some((m) => m.featureClass === "unknown")).toBe(false);
    expect(result.warnings.some((w) => w.includes("unknown"))).toBe(true);
  });

  it("preserves numeric values and handles NA as null", () => {
    const splitGroups = {
      cpg_methylation: [
        { feature_id: "cg001", sample_A: "0.8", sample_B: "NA" },
      ],
    };

    const rowClassifications: RowClassificationResult[] = [
      { rowIndex: 0, detectedClass: "cpg_methylation", reason: "probe" },
    ];

    const result = buildSplitFeatureMatrices(
      splitGroups,
      rowClassifications,
      {
        tableIdPrefix: "test",
        signalMetric: "beta_value",
        sampleColumns: ["sample_A", "sample_B"],
        featureIdColumn: "feature_id",
      },
    );

    expect(result.matrices).toHaveLength(1);
    const matrix = result.matrices[0];
    expect(matrix.wideValues["cg001"]["sample_A"]).toBe(0.8);
    expect(matrix.wideValues["cg001"]["sample_B"]).toBeNull();
  });

  it("reports build errors for rows missing feature_id", () => {
    const splitGroups = {
      cpg_methylation: [
        { feature_id: "", sample_A: "0.8" },
      ],
    };

    const rowClassifications: RowClassificationResult[] = [
      { rowIndex: 0, detectedClass: "cpg_methylation", reason: "probe" },
    ];

    const result = buildSplitFeatureMatrices(
      splitGroups,
      rowClassifications,
      {
        tableIdPrefix: "test",
        signalMetric: "beta_value",
        sampleColumns: ["sample_A"],
        featureIdColumn: "feature_id",
      },
    );

    expect(result.matrices).toHaveLength(1);
    expect(result.matrices[0].buildErrors.length).toBeGreaterThan(0);
    expect(result.matrices[0].buildErrors[0]).toContain("missing feature_id");
  });

  it("returns empty matrices and errors for invalid options", () => {
    const result = buildSplitFeatureMatrices(
      {},
      [],
      // @ts-expect-error testing invalid options
      { sampleColumns: [] },
    );

    expect(result.matrices).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("produces output valid against SplitFeatureMatrixSchema", () => {
    const splitGroups = {
      cpg_methylation: [
        { feature_id: "cg001", sample_A: "0.8" },
      ],
    };

    const rowClassifications: RowClassificationResult[] = [
      { rowIndex: 0, detectedClass: "cpg_methylation", reason: "probe" },
    ];

    const result = buildSplitFeatureMatrices(
      splitGroups,
      rowClassifications,
      {
        tableIdPrefix: "test",
        signalMetric: "beta_value",
        sampleColumns: ["sample_A"],
        featureIdColumn: "feature_id",
      },
    );

    expect(result.matrices).toHaveLength(1);
    expect(() => SplitFeatureMatrixSchema.parse(result.matrices[0])).not.toThrow();
  });

  it("orders matrix results deterministically by class ordinal", () => {
    const splitGroups = {
      histone_mark_peak: [
        { feature_id: "h1", sample_A: "15.2" },
      ],
      atac_peak: [
        { feature_id: "a1", sample_A: "2.5" },
      ],
      generic_region_feature: [
        { feature_id: "g1", sample_A: "1.0" },
      ],
    };

    const rowClassifications: RowClassificationResult[] = [
      { rowIndex: 0, detectedClass: "histone_mark_peak", reason: "mark" },
      { rowIndex: 1, detectedClass: "atac_peak", reason: "peak" },
      { rowIndex: 2, detectedClass: "generic_region_feature", reason: "coords" },
    ];

    const result = buildSplitFeatureMatrices(
      splitGroups,
      rowClassifications,
      {
        tableIdPrefix: "test",
        signalMetric: "peak_score",
        sampleColumns: ["sample_A"],
        featureIdColumn: "feature_id",
      },
    );

    expect(result.matrices).toHaveLength(3);
    expect(result.matrices[0].featureClass).toBe("atac_peak");
    expect(result.matrices[1].featureClass).toBe("histone_mark_peak");
    expect(result.matrices[2].featureClass).toBe("generic_region_feature");
  });
});

describe("schema contracts", () => {
  it("MixedFeatureHandlingPolicySchema accepts valid policies", () => {
    expect(MixedFeatureHandlingPolicySchema.parse("split")).toBe("split");
    expect(MixedFeatureHandlingPolicySchema.parse("block")).toBe("block");
    expect(MixedFeatureHandlingPolicySchema.parse("review_required")).toBe("review_required");
  });

  it("MixedFeatureHandlingPolicySchema rejects invalid policies", () => {
    expect(() =>
      // @ts-expect-error testing invalid policy
      MixedFeatureHandlingPolicySchema.parse("ignore"),
    ).toThrow();
  });

  it("PerRowFeatureClassSchema accepts valid classes", () => {
    expect(PerRowFeatureClassSchema.parse("cpg_methylation")).toBe("cpg_methylation");
    expect(PerRowFeatureClassSchema.parse("dmr")).toBe("dmr");
    expect(PerRowFeatureClassSchema.parse("atac_peak")).toBe("atac_peak");
    expect(PerRowFeatureClassSchema.parse("unknown")).toBe("unknown");
    expect(PerRowFeatureClassSchema.parse("ambiguous")).toBe("ambiguous");
  });

  it("RowClassificationResultSchema accepts valid results", () => {
    expect(() =>
      RowClassificationResultSchema.parse({
        rowIndex: 0,
        detectedClass: "cpg_methylation",
        reason: "probe_id present",
      }),
    ).not.toThrow();
  });

  it("SplitMatrixBuildOptionsSchema validates required fields", () => {
    const parseResult = SplitMatrixBuildOptionsSchema.safeParse({
      tableIdPrefix: "test",
      signalMetric: "beta_value",
      // missing sampleColumns
    });
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const paths = parseResult.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("sampleColumns");
    }
  });
});

describe("perRowClassToFeatureClass", () => {
  it("maps resolvable per-row classes to canonical FeatureClass", () => {
    expect(perRowClassToFeatureClass("cpg_methylation")).toBe("cpg_methylation");
    expect(perRowClassToFeatureClass("dmr")).toBe("dmr");
    expect(perRowClassToFeatureClass("atac_peak")).toBe("atac_peak");
    expect(perRowClassToFeatureClass("histone_mark_peak")).toBe("histone_mark_peak");
    expect(perRowClassToFeatureClass("generic_region_feature")).toBe("generic_region_feature");
  });

  it("returns undefined for unknown and ambiguous", () => {
    expect(perRowClassToFeatureClass("unknown")).toBeUndefined();
    expect(perRowClassToFeatureClass("ambiguous")).toBeUndefined();
  });
});
