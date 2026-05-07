import { describe, it, expect } from "vitest";
import {
  classifyFeatureType,
  classifyFeatureTable,
  buildFeatureClassificationReport,
  DetectableFeatureClassSchema,
  ClassificationConfidenceSchema,
  FeatureTypeClassificationOptionsSchema,
  FeatureTypeClassificationResultSchema,
  FeatureClassificationReportSchema,
} from "../../src/ingestion/feature_type_classifier.js";
import {
  GeneLinkedFeatureSchema,
  FeatureClassSchema,
} from "../../src/contracts/features.js";
import {
  isMeasurementSemanticsCompatible,
} from "../../src/contracts/measurement_semantics.js";

describe("classifyFeatureType", () => {
  // --- CpG methylation fixtures ---

  it("classifies beta value matrix as cpg_methylation", () => {
    const result = classifyFeatureType({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_A", "sample_B"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
    });

    expect(result.featureClass).toBe("cpg_methylation");
    expect(result.confidence).toBe("high");
    expect(result.probeIdColumn).toBe("probe_id");
    expect(result.isSummaryOnly).toBe(false);
  });

  it("classifies DMR coordinate table as dmr", () => {
    const result = classifyFeatureType({
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
  });

  // --- Generic region fixtures ---

  it("classifies BED-like table as generic_region_feature", () => {
    const result = classifyFeatureType({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["chrom", "start", "end", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
    });

    expect(result.featureClass).toBe("generic_region_feature");
    expect(result.confidence).toBe("high");
  });

  // --- Gene-linked fixtures ---

  it("classifies table with gene_id as gene_linked_feature", () => {
    const result = classifyFeatureType({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "gene_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
    });

    expect(result.featureClass).toBe("gene_linked_feature");
    expect(result.confidence).toBe("high");
    expect(result.geneIdColumn).toBe("gene_id");
  });

  it("classifies table with ensembl_id as gene_linked_feature", () => {
    const result = classifyFeatureType({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["chr", "start", "end", "ensembl_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
    });

    expect(result.featureClass).toBe("gene_linked_feature");
    expect(result.geneIdColumn).toBe("ensembl_id");
  });

  it("classifies table with symbol as gene_linked_feature", () => {
    const result = classifyFeatureType({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_bsseq",
      headers: ["feature_id", "symbol", "beta_value"],
      detectedShape: "summary",
      featureValueSemantics: "beta_value",
    });

    expect(result.featureClass).toBe("gene_linked_feature");
    expect(result.geneIdColumn).toBe("symbol");
  });

  it("produces valid GeneLinkedFeature schema from classification", () => {
    const feature = GeneLinkedFeatureSchema.parse({
      featureId: "feat-001",
      featureClass: "gene_linked_feature",
      modality: "dna_methylation_array",
      measuredIdentifier: "cg00000001",
      linkedGeneIds: ["BRCA1"],
      mappingMethod: "direct_promoter_overlap",
      signalMetric: "beta_value",
      values: { sample_A: 0.82 },
    });

    expect(feature.featureClass).toBe("gene_linked_feature");
    expect(feature.linkedGeneIds).toEqual(["BRCA1"]);
    expect(feature.mappingMethod).toBe("direct_promoter_overlap");
  });

  it("rejects GeneLinkedFeature without linkedGeneIds", () => {
    expect(() =>
      GeneLinkedFeatureSchema.parse({
        featureId: "feat-001",
        featureClass: "gene_linked_feature",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000001",
        signalMetric: "beta_value",
        values: { sample_A: 0.82 },
      }),
    ).toThrow();
  });

  // --- Summary-only fixtures ---

  it("classifies summary table as summary_only", () => {
    const result = classifyFeatureType({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["feature_id", "effect_size", "p_value", "q_value"],
      detectedShape: "summary",
      featureValueSemantics: "effect_size",
    });

    expect(result.featureClass).toBe("summary_only");
    expect(result.isSummaryOnly).toBe(true);
  });

  it("classifies table with mostly summary columns as summary_only", () => {
    const result = classifyFeatureType({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_bsseq",
      headers: ["feature_id", "logfc", "pval", "fdr"],
      detectedShape: "wide",
      featureValueSemantics: "effect_size",
    });

    expect(result.featureClass).toBe("summary_only");
    expect(result.isSummaryOnly).toBe(true);
  });

  // --- Reserved feature-flag fixtures ---

  it("classifies ATAC as generic_region_feature when flag is disabled", () => {
    const result = classifyFeatureType({
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
    expect(result.warnings).toContain(
      "ATAC-seq modality detected but enableChromatinAccessibility feature flag is disabled; classifying as generic_region_feature",
    );
  });

  it("classifies ATAC as atac_peak when flag is enabled", () => {
    const result = classifyFeatureType({
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
  });

  it("blocks explicit ATAC override when flag is disabled", () => {
    const result = classifyFeatureType({
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
    expect(result.errors).toContain(
      'Feature class "atac_peak" is reserved behind the enableChromatinAccessibility feature flag',
    );
  });

  it("blocks explicit histone_mark_peak override when flag is disabled", () => {
    const result = classifyFeatureType({
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

  it("blocks explicit mirna_expression override when flag is disabled", () => {
    const result = classifyFeatureType({
      assayFamily: "mirna_expression",
      modality: "mirna_expression",
      headers: ["feature_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "normalized_signal",
      explicitFeatureClass: "mirna_expression",
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
      'Feature class "mirna_expression" is reserved behind the enableMirnaExpression feature flag',
    );
  });

  it("blocks explicit ncrna_expression override when flag is disabled", () => {
    const result = classifyFeatureType({
      assayFamily: "ncrna_expression",
      modality: "mirna_expression",
      headers: ["feature_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "normalized_signal",
      explicitFeatureClass: "ncrna_expression",
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
      'Feature class "ncrna_expression" is reserved behind the enableNcrnaExpression feature flag',
    );
  });

  // --- Explicit override ---

  it("honours explicitFeatureClass override to gene_linked_feature", () => {
    const result = classifyFeatureType({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
      explicitFeatureClass: "gene_linked_feature",
    });

    expect(result.featureClass).toBe("gene_linked_feature");
    expect(result.confidence).toBe("override");
  });

  it("honours explicitFeatureClass override to summary_only", () => {
    const result = classifyFeatureType({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
      explicitFeatureClass: "summary_only",
    });

    expect(result.featureClass).toBe("summary_only");
    expect(result.confidence).toBe("override");
  });

  // --- Fail-closed ---

  it("returns unclassified for invalid options", () => {
    const result = classifyFeatureType({
      // @ts-expect-error testing invalid assay family
      assayFamily: "invalid_family",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
    });

    expect(result.featureClass).toBe("unclassified");
    expect(result.confidence).toBe("low");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns unclassified when region columns are missing for non-methylation", () => {
    const result = classifyFeatureType({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["feature_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
    });

    expect(result.featureClass).toBe("unclassified");
    expect(result.errors).toContain(
      "Region feature classification requires chromosome, start, and end columns; none detected",
    );
  });

  // --- Schema validation ---

  it("produces output valid against FeatureTypeClassificationResultSchema", () => {
    const result = classifyFeatureType({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
    });

    expect(() =>
      FeatureTypeClassificationResultSchema.parse(result),
    ).not.toThrow();
  });
});

describe("buildFeatureClassificationReport", () => {
  it("proceeds for clean classification", () => {
    const classification = classifyFeatureType({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
    });

    const report = buildFeatureClassificationReport(
      "report-001",
      [{ probe_id: "cg001", sample_A: "0.8" }],
      ["probe_id", "sample_A"],
      classification,
      "dna_methylation",
      "dna_methylation_array",
    );

    expect(report.recommendedAction).toBe("proceed");
    expect(report.blockingErrors).toHaveLength(0);
    expect(report.tableAnalysed).toBe(true);
  });

  it("recommends review_required for medium confidence", () => {
    const classification = classifyFeatureType({
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

    // ATAC with flag enabled but no peak_format -> medium confidence
    expect(classification.confidence).toBe("medium");

    const report = buildFeatureClassificationReport(
      "report-002",
      [{ chr: "chr1", start: "1000", end: "2000", sample_A: "1.0" }],
      ["chr", "start", "end", "sample_A"],
      classification,
      "chromatin_accessibility",
      "atac_seq",
    );

    expect(report.recommendedAction).toBe("review_required");
  });

  it("flags reserved classes in report", () => {
    const classification = classifyFeatureType({
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

    const report = buildFeatureClassificationReport(
      "report-003",
      [{ chr: "chr1", start: "1000", end: "2000", peak_format: "narrowPeak", sample_A: "1.0" }],
      ["chr", "start", "end", "peak_format", "sample_A"],
      classification,
      "chromatin_accessibility",
      "atac_seq",
    );

    expect(report.reservedClassesDetected).toContain("atac_peak");
    expect(report.advisoryNotes.some((n) => n.includes("Reserved feature class"))).toBe(true);
  });

  it("reports blocked for errors", () => {
    const classification = classifyFeatureType({
      assayFamily: "chromatin_accessibility",
      modality: "atac_seq",
      headers: ["feature_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "accessibility_signal",
    });

    const report = buildFeatureClassificationReport(
      "report-004",
      [{ feature_id: "f1", sample_A: "1.0" }],
      ["feature_id", "sample_A"],
      classification,
      "chromatin_accessibility",
      "atac_seq",
    );

    expect(report.recommendedAction).toBe("blocked");
    expect(report.blockingErrors.length).toBeGreaterThan(0);
  });

  it("includes mixed-feature analysis when provided", () => {
    const classification = classifyFeatureType({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
    });

    const mixedAnalysis = {
      isMixed: true,
      isBlocked: false,
      dominantClass: "cpg_methylation" as const,
      detectedClasses: ["cpg_methylation", "dmr"] as const,
      classCounts: { cpg_methylation: 3, dmr: 1 },
      warnings: ["Mixed feature classes detected"],
      errors: [],
      rowClassifications: [],
      splitRowGroups: {},
    };

    const report = buildFeatureClassificationReport(
      "report-005",
      [],
      ["probe_id", "sample_A"],
      classification,
      "dna_methylation",
      "dna_methylation_array",
      mixedAnalysis,
    );

    expect(report.mixedFeatureAnalysis).toBeDefined();
    expect(report.mixedFeatureAnalysis!.isMixed).toBe(true);
    expect(report.recommendedAction).toBe("split_table");
  });

  it("produces output valid against FeatureClassificationReportSchema", () => {
    const classification = classifyFeatureType({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id", "sample_A"],
      detectedShape: "wide",
      featureValueSemantics: "beta_value",
    });

    const report = buildFeatureClassificationReport(
      "report-006",
      [{ probe_id: "cg001", sample_A: "0.8" }],
      ["probe_id", "sample_A"],
      classification,
      "dna_methylation",
      "dna_methylation_array",
    );

    expect(() => FeatureClassificationReportSchema.parse(report)).not.toThrow();
  });
});

describe("classifyFeatureTable", () => {
  it("classifies and analyses mixed features in one call", () => {
    const rows = [
      { feature_id: "f1", probe_id: "cg001", sample_A: "0.8" },
      { feature_id: "f2", chr: "chr1", start: "100", end: "200", sample_A: "0.9" },
    ];

    const result = classifyFeatureTable(
      rows,
      ["feature_id", "probe_id", "chr", "start", "end", "sample_A"],
      {
        assayFamily: "dna_methylation",
        modality: "dna_methylation_array",
        headers: ["feature_id", "probe_id", "chr", "start", "end", "sample_A"],
        detectedShape: "wide",
        featureValueSemantics: "beta_value",
      },
      { policy: "split" },
    );

    expect(result.classification.featureClass).toBe("cpg_methylation");
    expect(result.mixedAnalysis).toBeDefined();
    expect(result.mixedAnalysis!.isMixed).toBe(true);
    expect(result.report.mixedFeatureAnalysis).toBeDefined();
    expect(result.report.recommendedAction).toBe("split_table");
  });

  it("returns report without mixed analysis when config omitted", () => {
    const rows = [
      { probe_id: "cg001", sample_A: "0.8" },
    ];

    const result = classifyFeatureTable(
      rows,
      ["probe_id", "sample_A"],
      {
        assayFamily: "dna_methylation",
        modality: "dna_methylation_array",
        headers: ["probe_id", "sample_A"],
        detectedShape: "wide",
        featureValueSemantics: "beta_value",
      },
    );

    expect(result.classification.featureClass).toBe("cpg_methylation");
    expect(result.mixedAnalysis).toBeUndefined();
    expect(result.report.recommendedAction).toBe("proceed");
  });
});

describe("schema contracts", () => {
  it("DetectableFeatureClassSchema accepts all v0.1 classes", () => {
    expect(DetectableFeatureClassSchema.parse("cpg_methylation")).toBe("cpg_methylation");
    expect(DetectableFeatureClassSchema.parse("dmr")).toBe("dmr");
    expect(DetectableFeatureClassSchema.parse("generic_region_feature")).toBe("generic_region_feature");
    expect(DetectableFeatureClassSchema.parse("gene_linked_feature")).toBe("gene_linked_feature");
    expect(DetectableFeatureClassSchema.parse("summary_only")).toBe("summary_only");
    expect(DetectableFeatureClassSchema.parse("unclassified")).toBe("unclassified");
  });

  it("DetectableFeatureClassSchema rejects invalid classes", () => {
    expect(() => DetectableFeatureClassSchema.parse("snp")).toThrow();
  });

  it("ClassificationConfidenceSchema accepts valid levels", () => {
    expect(ClassificationConfidenceSchema.parse("high")).toBe("high");
    expect(ClassificationConfidenceSchema.parse("override")).toBe("override");
  });

  it("FeatureTypeClassificationOptionsSchema validates required fields", () => {
    const parseResult = FeatureTypeClassificationOptionsSchema.safeParse({
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      headers: ["probe_id"],
      detectedShape: "wide",
      // missing featureValueSemantics
    });
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const paths = parseResult.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("featureValueSemantics");
    }
  });

  it("FeatureClassSchema includes gene_linked_feature", () => {
    expect(FeatureClassSchema.parse("gene_linked_feature")).toBe("gene_linked_feature");
  });

  it("isMeasurementSemanticsCompatible allows declared_other for gene_linked_feature", () => {
    expect(
      isMeasurementSemanticsCompatible("gene_linked_feature", "declared_other"),
    ).toBe(true);
  });

  it("isMeasurementSemanticsCompatible allows beta_value for gene_linked_feature", () => {
    expect(
      isMeasurementSemanticsCompatible("gene_linked_feature", "beta_value"),
    ).toBe(true);
  });

  it("isMeasurementSemanticsCompatible allows accessibility_signal for gene_linked_feature", () => {
    expect(
      isMeasurementSemanticsCompatible("gene_linked_feature", "accessibility_signal"),
    ).toBe(true);
  });
});
