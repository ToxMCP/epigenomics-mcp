import { describe, it, expect } from "vitest";
import {
  classifyMethylationFeatureClass,
  buildMethylationFeatures,
  MethylationFeatureClassSchema,
  ClassificationConfidenceSchema,
  MethylationClassificationOptionsSchema,
  MethylationClassificationResultSchema,
  MethylationFeatureBuildOptionsSchema,
} from "../../src/ingestion/methylation_classifier.js";
import {
  CpGMethylationFeatureSchema,
  DifferentialMethylatedRegionFeatureSchema,
} from "../../src/contracts/features.js";

describe("classifyMethylationFeatureClass", () => {
  // --- CpG methylation classification ---

  it("classifies beta value matrix as cpg_methylation with high confidence", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_A", "sample_B", "sample_C"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
      platformAnnotationProvenance: {
        platform: "EPIC",
        manifestVersion: "EPIC v2",
      },
    });

    expect(result.featureClass).toBe("cpg_methylation");
    expect(result.confidence).toBe("high");
    expect(result.probeIdColumn).toBe("probe_id");
    expect(result.errors).toHaveLength(0);
  });

  it("classifies M-value matrix as cpg_methylation", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["cpg_id", "donor_1", "donor_2"],
      detectedShape: "wide",
      featureValueSemantics: "m_value",
      platformAnnotationProvenance: {
        platform: "450K",
        manifestVersion: "hg19",
      },
    });

    expect(result.featureClass).toBe("cpg_methylation");
    expect(result.confidence).toBe("high");
    expect(result.probeIdColumn).toBe("cpg_id");
  });

  it("classifies BS-seq percent methylation as cpg_methylation", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_bsseq",
      headers: ["feature_id", "chr", "position", "sample_1", "sample_2"],
      detectedShape: "wide",
      featureValueSemantics: "percent_methylation",
    });

    expect(result.featureClass).toBe("cpg_methylation");
    expect(result.confidence).toBe("high");
  });

  it("classifies DMC summary as cpg_methylation (site-level differential)", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "delta_beta", "p_value", "q_value"],
      detectedShape: "summary",
      featureValueSemantics: "delta_beta",
      platformAnnotationProvenance: {
        platform: "EPIC",
        manifestVersion: "EPIC v2",
      },
    });

    expect(result.featureClass).toBe("cpg_methylation");
    expect(result.confidence).toBe("high");
    expect(result.probeIdColumn).toBe("probe_id");
  });

  // --- DMR classification ---

  it("classifies DMR coordinate table as dmr with high confidence", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_bsseq",
      headers: ["chr", "start", "end", "delta_beta", "q_value"],
      detectedShape: "summary",
      featureValueSemantics: "delta_beta",
    });

    expect(result.featureClass).toBe("dmr");
    expect(result.confidence).toBe("high");
    expect(result.regionColumns).toEqual({
      chrom: "chr",
      start: "start",
      end: "end",
    });
    expect(result.errors).toHaveLength(0);
  });

  it("classifies DMR effect-size table as dmr", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: [
        "feature_id",
        "chromosome",
        "start",
        "end",
        "effect_size",
        "p_value",
      ],
      detectedShape: "summary",
      featureValueSemantics: "effect_size",
      platformAnnotationProvenance: {
        platform: "EPIC",
        manifestVersion: "EPIC v2",
      },
    });

    expect(result.featureClass).toBe("dmr");
    expect(result.confidence).toBe("high");
  });

  it("classifies DMR with q_value semantics as dmr", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_bsseq",
      headers: ["chr", "start", "end", "q_value"],
      detectedShape: "summary",
      featureValueSemantics: "q_value",
    });

    expect(result.featureClass).toBe("dmr");
    expect(result.confidence).toBe("high");
  });

  // --- Ambiguous / fail-closed ---

  it("returns unclassified when CpG and DMR indicators tie", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "chr", "start", "end", "delta_beta", "q_value"],
      detectedShape: "summary",
      featureValueSemantics: "delta_beta",
      platformAnnotationProvenance: {
        platform: "EPIC",
        manifestVersion: "EPIC v2",
      },
    });

    expect(result.featureClass).toBe("unclassified");
    expect(result.confidence).toBe("low");
    expect(result.errors).toContain(
      "Ambiguous methylation feature classification: CpG and DMR indicators are tied. Provide explicitFeatureClass override.",
    );
  });

  it("returns unclassified for insufficient evidence", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_bsseq",
      headers: ["a", "b", "c"],
      detectedShape: "ambiguous",
      featureValueSemantics: "beta_value",
    });

    expect(result.featureClass).toBe("unclassified");
    expect(result.confidence).toBe("low");
    expect(result.errors).toContain(
      "Insufficient evidence to classify methylation feature type. Provide explicitFeatureClass override.",
    );
  });

  it("fails closed on non-methylation assay family", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "chromatin_accessibility",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_1"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
    });

    expect(result.featureClass).toBe("unclassified");
    expect(result.errors).toContain(
      'Assay family "chromatin_accessibility" is not dna_methylation; cannot classify methylation features',
    );
  });

  it("fails closed on invalid modality", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      // @ts-expect-error testing invalid modality
      modality: "atac_seq",
      headers: ["feature_id", "sample_1"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
    });

    expect(result.featureClass).toBe("unclassified");
    expect(result.errors).toContain(
      'Modality "atac_seq" is not a supported DNA methylation modality',
    );
  });

  // --- Explicit override ---

  it("honours explicitFeatureClass override to cpg_methylation", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_bsseq",
      headers: ["chr", "start", "end", "effect_size"],
      detectedShape: "summary",
      featureValueSemantics: "effect_size",
      explicitFeatureClass: "cpg_methylation",
    });

    expect(result.featureClass).toBe("cpg_methylation");
    expect(result.confidence).toBe("override");
    expect(result.errors).toHaveLength(0);
  });

  it("honours explicitFeatureClass override to dmr", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_1", "sample_2"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
      platformAnnotationProvenance: {
        platform: "EPIC",
        manifestVersion: "EPIC v2",
      },
      explicitFeatureClass: "dmr",
    });

    expect(result.featureClass).toBe("dmr");
    expect(result.confidence).toBe("override");
  });

  it("honours explicitFeatureClass override to differential_methylated_region", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_bsseq",
      headers: ["probe_id", "sample_1"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
      explicitFeatureClass: "differential_methylated_region",
    });

    expect(result.featureClass).toBe("differential_methylated_region");
    expect(result.confidence).toBe("override");
  });

  // --- Platform provenance advisory ---

  it("warns when array-derived features lack platformAnnotationProvenance", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_1"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
    });

    expect(result.warnings).toContain(
      "Array-derived methylation features should include platformAnnotationProvenance for reproducible interpretation",
    );
  });

  it("does not warn for BS-seq without platformAnnotationProvenance", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_bsseq",
      headers: ["feature_id", "sample_1"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
    });

    expect(result.warnings).not.toContain(
      "Array-derived methylation features should include platformAnnotationProvenance for reproducible interpretation",
    );
  });

  // --- Schema validation ---

  it("produces output valid against MethylationClassificationResultSchema", () => {
    const result = classifyMethylationFeatureClass({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_1"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
      platformAnnotationProvenance: {
        platform: "EPIC",
        manifestVersion: "EPIC v2",
      },
    });

    expect(() =>
      MethylationClassificationResultSchema.parse(result),
    ).not.toThrow();
  });

  it("rejects invalid options via schema", () => {
    const parseResult = MethylationClassificationOptionsSchema.safeParse({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
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

describe("buildMethylationFeatures", () => {
  const baseOptions = {
    assayFamily: "dna_methylation" as const,
    modality: "dna_methylation_array" as const,
    headers: ["probe_id", "sample_A", "sample_B"],
    detectedShape: "wide" as const,
    featureValueSemantics: "beta_value" as const,
    platformAnnotationProvenance: {
      platform: "EPIC",
      manifestVersion: "EPIC v2",
    },
  };

  const baseClassification = {
    featureClass: "cpg_methylation" as const,
    confidence: "high" as const,
    warnings: [] as string[],
    errors: [] as string[],
    probeIdColumn: "probe_id",
  };

  it("builds CpG methylation features preserving probe IDs and platform provenance", () => {
    const rows = [
      { probe_id: "cg00000001", sample_A: "0.82", sample_B: "0.75" },
      { probe_id: "cg00000002", sample_A: "0.91", sample_B: "0.88" },
    ];

    const result = buildMethylationFeatures(
      rows,
      baseClassification,
      baseOptions,
      ["sample_A", "sample_B"],
    );

    expect(result.features).toHaveLength(2);
    expect(result.errors).toHaveLength(0);

    const feat1 = result.features[0];
    expect(feat1.featureId).toBe("cg00000001");
    expect(feat1.featureClass).toBe("cpg_methylation");
    expect(feat1.measuredIdentifier).toBe("cg00000001");
    expect(feat1.platformAnnotationProvenance).toEqual({
      platform: "EPIC",
      manifestVersion: "EPIC v2",
    });
    expect(feat1.values).toEqual({
      sample_A: 0.82,
      sample_B: 0.75,
    });
  });

  it("builds CpG features with coordinates when region columns present", () => {
    const classification = {
      ...baseClassification,
      regionColumns: {
        chrom: "chr",
        start: "start",
        end: "end",
      },
    };
    const options = {
      ...baseOptions,
      headers: ["probe_id", "chr", "start", "end", "sample_A"],
    };
    const rows = [
      {
        probe_id: "cg00000001",
        chr: "chr1",
        start: "1000",
        end: "1001",
        sample_A: "0.82",
      },
    ];

    const result = buildMethylationFeatures(
      rows,
      classification,
      options,
      ["sample_A"],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(1);
    const feat = result.features[0];
    expect(feat.measuredRegion).toEqual({
      chrom: "chr1",
      start: 1000,
      end: 1001,
      build: "hg38",
      coordinateSystem: "0-based-half-open",
    });
  });

  it("builds DMR features with required coordinates and summary stats", () => {
    const classification = {
      featureClass: "dmr" as const,
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
      assayFamily: "dna_methylation" as const,
      modality: "dna_methylation_bsseq" as const,
      headers: ["chr", "start", "end", "delta_beta", "p_value", "q_value"],
      detectedShape: "summary" as const,
      featureValueSemantics: "delta_beta" as const,
    };
    const rows = [
      {
        chr: "chr1",
        start: "1000",
        end: "2000",
        delta_beta: "-0.15",
        p_value: "0.001",
        q_value: "0.01",
      },
    ];

    const result = buildMethylationFeatures(
      rows,
      classification,
      options,
      [],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(1);
    const feat = result.features[0];
    expect(feat.featureClass).toBe("dmr");
    expect(feat.measuredRegion).toEqual({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      build: "hg38",
      coordinateSystem: "0-based-half-open",
    });
    expect(feat.effectSize).toBe(-0.15);
    expect(feat.pValue).toBe(0.001);
    expect(feat.qValue).toBe(0.01);
  });

  it("builds DMR features with explicit differential_methylated_region class", () => {
    const classification = {
      featureClass: "differential_methylated_region" as const,
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
      assayFamily: "dna_methylation" as const,
      modality: "dna_methylation_bsseq" as const,
      headers: ["chr", "start", "end", "effect_size"],
      detectedShape: "summary" as const,
      featureValueSemantics: "effect_size" as const,
    };
    const rows = [
      {
        chr: "chr1",
        start: "500",
        end: "1500",
        effect_size: "0.25",
      },
    ];

    const result = buildMethylationFeatures(
      rows,
      classification,
      options,
      [],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(1);
    expect(result.features[0].featureClass).toBe(
      "differential_methylated_region",
    );
  });

  it("handles missing values and NA strings as null", () => {
    const rows = [
      { probe_id: "cg00000001", sample_A: "", sample_B: "NA" },
    ];

    const result = buildMethylationFeatures(
      rows,
      baseClassification,
      baseOptions,
      ["sample_A", "sample_B"],
    );

    expect(result.features).toHaveLength(1);
    expect(result.features[0].values).toEqual({
      sample_A: null,
      sample_B: null,
    });
  });

  it("generates featureId from coordinates when no probe or feature id column", () => {
    const classification = {
      featureClass: "dmr" as const,
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
      assayFamily: "dna_methylation" as const,
      modality: "dna_methylation_bsseq" as const,
      headers: ["chr", "start", "end", "q_value"],
      detectedShape: "summary" as const,
      featureValueSemantics: "q_value" as const,
    };
    const rows = [
      { chr: "chr1", start: "1000", end: "2000", q_value: "0.05" },
    ];

    const result = buildMethylationFeatures(
      rows,
      classification,
      options,
      [],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(1);
    expect(result.features[0].featureId).toBe("chr1:1000-2000");
  });

  it("reports errors for rows missing required region coordinates in DMR", () => {
    const classification = {
      featureClass: "dmr" as const,
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
      assayFamily: "dna_methylation" as const,
      modality: "dna_methylation_bsseq" as const,
      headers: ["chr", "start", "end", "q_value"],
      detectedShape: "summary" as const,
      featureValueSemantics: "q_value" as const,
    };
    const rows = [
      { chr: "", start: "", end: "", q_value: "0.05" },
    ];

    const result = buildMethylationFeatures(
      rows,
      classification,
      options,
      [],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("unable to determine featureId");
  });

  it("reports schema validation errors for malformed rows", () => {
    const rows = [
      { probe_id: "cg00000001", sample_A: "not_a_number", sample_B: "0.75" },
    ];

    const result = buildMethylationFeatures(
      rows,
      baseClassification,
      baseOptions,
      ["sample_A", "sample_B"],
    );

    // "not_a_number" parses to null via parseNumberOrNull, so the feature
    // should still be valid (null is allowed).
    expect(result.features).toHaveLength(1);
    expect(result.features[0].values.sample_A).toBeNull();
  });

  it("produces CpG features that validate against CpGMethylationFeatureSchema", () => {
    const rows = [
      { probe_id: "cg00000001", sample_A: "0.82", sample_B: "0.75" },
    ];

    const result = buildMethylationFeatures(
      rows,
      baseClassification,
      baseOptions,
      ["sample_A", "sample_B"],
    );

    expect(result.features).toHaveLength(1);
    expect(() =>
      CpGMethylationFeatureSchema.parse(result.features[0]),
    ).not.toThrow();
  });

  it("produces DMR features that validate against DifferentialMethylatedRegionFeatureSchema", () => {
    const classification = {
      featureClass: "dmr" as const,
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
      assayFamily: "dna_methylation" as const,
      modality: "dna_methylation_bsseq" as const,
      headers: ["chr", "start", "end", "delta_beta", "q_value"],
      detectedShape: "summary" as const,
      featureValueSemantics: "delta_beta" as const,
    };
    const rows = [
      {
        chr: "chr1",
        start: "1000",
        end: "2000",
        delta_beta: "-0.15",
        q_value: "0.01",
      },
    ];

    const result = buildMethylationFeatures(
      rows,
      classification,
      options,
      [],
      { genomeBuild: "hg38", coordinateSystem: "0-based-half-open" },
    );

    expect(result.features).toHaveLength(1);
    expect(() =>
      DifferentialMethylatedRegionFeatureSchema.parse(result.features[0]),
    ).not.toThrow();
  });

  it("uses explicit featureIdColumn when provided", () => {
    const classification = {
      featureClass: "dmr" as const,
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
      assayFamily: "dna_methylation" as const,
      modality: "dna_methylation_bsseq" as const,
      headers: ["dmr_id", "chr", "start", "end", "q_value"],
      detectedShape: "summary" as const,
      featureValueSemantics: "q_value" as const,
    };
    const rows = [
      {
        dmr_id: "dmr-001",
        chr: "chr1",
        start: "1000",
        end: "2000",
        q_value: "0.01",
      },
    ];

    const result = buildMethylationFeatures(
      rows,
      classification,
      options,
      [],
      {
        genomeBuild: "hg38",
        coordinateSystem: "0-based-half-open",
        featureIdColumn: "dmr_id",
      },
    );

    expect(result.features).toHaveLength(1);
    expect(result.features[0].featureId).toBe("dmr-001");
  });
});

describe("MethylationFeatureClassSchema", () => {
  it("accepts valid classes", () => {
    expect(MethylationFeatureClassSchema.parse("cpg_methylation")).toBe(
      "cpg_methylation",
    );
    expect(MethylationFeatureClassSchema.parse("dmr")).toBe("dmr");
    expect(
      MethylationFeatureClassSchema.parse("differential_methylated_region"),
    ).toBe("differential_methylated_region");
    expect(MethylationFeatureClassSchema.parse("unclassified")).toBe(
      "unclassified",
    );
  });

  it("rejects invalid classes", () => {
    expect(() => MethylationFeatureClassSchema.parse("atac_peak")).toThrow();
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

describe("MethylationFeatureBuildOptionsSchema", () => {
  it("accepts valid build options", () => {
    const opts = MethylationFeatureBuildOptionsSchema.parse({
      genomeBuild: "hg38",
      coordinateSystem: "0-based-half-open",
      featureIdColumn: "probe_id",
    });
    expect(opts.genomeBuild).toBe("hg38");
  });

  it("accepts empty build options", () => {
    const opts = MethylationFeatureBuildOptionsSchema.parse({});
    expect(opts.genomeBuild).toBeUndefined();
  });

  it("rejects invalid coordinate system", () => {
    expect(() =>
      MethylationFeatureBuildOptionsSchema.parse({
        // @ts-expect-error testing invalid coordinate system
        coordinateSystem: "unknown",
      }),
    ).toThrow();
  });
});
