import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  canonicalizeFeatureTable,
  canonicalizeFeatureTableRows,
  ingestFeatureTable,
  IngestFeatureTableOptionsSchema,
  FeatureTableCanonicalizationResultSchema,
  RowProvenanceSchema,
} from "../../src/ingestion/feature_table.js";
import { SummaryResponseTableSchema } from "../../src/contracts/features.js";

describe("canonicalizeFeatureTable", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "epimcp-feature-test-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Long-form tests
  // ---------------------------------------------------------------------------

  it("canonicalizes a classic long-form table into matrix and features", () => {
    const path = join(tempDir, "long.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,0.82\ncg001,s2,0.85\ncg002,s1,0.45\ncg002,s2,0.48\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-long-1",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.success).toBe(true);
    expect(result.kind).toBe("matrix");
    expect(result.matrix).toBeDefined();
    expect(result.matrix!.featureIds).toEqual(["cg001", "cg002"]);
    expect(result.matrix!.sampleIds).toEqual(["s1", "s2"]);
    expect(result.matrix!.longValues).toHaveLength(4);
    expect(result.features).toHaveLength(2);
    expect(result.rowProvenance).toHaveLength(4);
    expect(result.errors).toHaveLength(0);
  });

  it("handles NA and empty values as null in long form", () => {
    const path = join(tempDir, "long-na.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,NA\ncg001,s2,0.85\ncg002,s1,\ncg002,s2,nan\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-long-na",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.success).toBe(true);
    expect(result.matrix!.longValues![0].value).toBeNull();
    expect(result.matrix!.longValues![2].value).toBeNull();
    expect(result.matrix!.longValues![3].value).toBeNull();
    expect(result.warnings.some((w) => w.includes("NA"))).toBe(false); // NA is treated silently as null
  });

  it("reports non-numeric values as errors in long form", () => {
    const path = join(tempDir, "long-bad.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,hello\ncg001,s2,0.85\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-long-bad",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("non-numeric"))).toBe(true);
    expect(result.rowProvenance[0].parsedSuccessfully).toBe(false);
  });

  it("warns on duplicate feature_id + sample_id in long form", () => {
    const path = join(tempDir, "long-dup.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,0.82\ncg001,s1,0.99\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-long-dup",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.warnings.some((w) => w.includes("duplicate"))).toBe(true);
    expect(result.matrix!.longValues!.filter((v) => v.featureId === "cg001" && v.sampleId === "s1")).toHaveLength(1);
  });

  it("warns on unmatched sample IDs when designSampleIds provided", () => {
    const path = join(tempDir, "long-unmatched.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,0.82\ncg001,s_unknown,0.85\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-long-unmatched",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
      designSampleIds: ["s1", "s2"],
    });

    expect(result.warnings.some((w) => w.includes("s_unknown") && w.includes("not found in design"))).toBe(true);
    expect(result.success).toBe(true);
  });

  it("parses coordinate columns in long form", () => {
    const path = join(tempDir, "long-coord.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value,chr,start,end\ncg001,s1,0.82,chr1,1000,2000\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-long-coord",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
      coordinateColumns: { chrom: "chr", start: "start", end: "end" },
      genomeBuildLiteral: "GRCh38",
      coordinateSystemLiteral: "0-based-half-open",
    });

    expect(result.success).toBe(true);
    expect(result.features![0].measuredRegion).toEqual({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      build: "GRCh38",
      coordinateSystem: "0-based-half-open",
    });
  });

  // ---------------------------------------------------------------------------
  // Wide-form tests
  // ---------------------------------------------------------------------------

  it("canonicalizes a wide-form table into matrix and features", () => {
    const path = join(tempDir, "wide.csv");
    writeFileSync(
      path,
      "feature_id,s1,s2,s3\ncg001,0.82,0.85,0.88\ncg002,0.45,0.48,0.51\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-wide-1",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.success).toBe(true);
    expect(result.kind).toBe("matrix");
    expect(result.matrix!.featureIds).toEqual(["cg001", "cg002"]);
    expect(result.matrix!.sampleIds).toEqual(["s1", "s2", "s3"]);
    expect(result.matrix!.wideValues).toBeDefined();
    expect(result.matrix!.wideValues!["cg001"]["s2"]).toBe(0.85);
    expect(result.features).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("reports non-numeric sample values as errors in wide form", () => {
    const path = join(tempDir, "wide-bad.csv");
    writeFileSync(
      path,
      "feature_id,s1,s2\ncg001,0.82,hello\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-wide-bad",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("non-numeric"))).toBe(true);
  });

  it("warns on duplicate feature_ids in wide form", () => {
    const path = join(tempDir, "wide-dup.csv");
    writeFileSync(
      path,
      "feature_id,s1,s2\ncg001,0.82,0.85\ncg001,0.99,0.99\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-wide-dup",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.warnings.some((w) => w.includes("duplicate feature_id"))).toBe(true);
    expect(result.matrix!.featureIds).toHaveLength(1);
  });

  it("warns on unmatched sample columns when designSampleIds provided", () => {
    const path = join(tempDir, "wide-unmatched.csv");
    writeFileSync(
      path,
      "feature_id,s1,s_unknown\ncg001,0.82,0.85\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-wide-unmatched",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
      designSampleIds: ["s1", "s2"],
    });

    expect(result.warnings.some((w) => w.includes("s_unknown") && w.includes("not found in design"))).toBe(true);
    expect(result.success).toBe(true);
  });

  it("uses explicit sampleIdColumns for wide form", () => {
    const path = join(tempDir, "wide-explicit.csv");
    writeFileSync(
      path,
      "feature_id,donor_1,donor_2,donor_3\ncg001,0.82,0.85,0.88\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-wide-explicit",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
      sampleIdColumns: ["donor_1", "donor_2", "donor_3"],
    });

    expect(result.success).toBe(true);
    expect(result.matrix!.sampleIds).toEqual(["donor_1", "donor_2", "donor_3"]);
  });

  // ---------------------------------------------------------------------------
  // Summary-form tests
  // ---------------------------------------------------------------------------

  it("canonicalizes a summary-form table and marks it NOT PoD-ready", () => {
    const path = join(tempDir, "summary.csv");
    writeFileSync(
      path,
      "feature_id,group,effect_size,p_value\ncg001,ctrl_vs_treat,0.25,0.01\ncg002,ctrl_vs_treat,-0.15,0.05\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-summary-1",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "effect_size",
    });

    expect(result.success).toBe(true);
    expect(result.kind).toBe("summary");
    expect(result.summary).toBeDefined();
    expect(result.summary!.isPoDReady).toBe(false);
    expect(result.summary!.podReadinessReason).toContain("lack per-sample dose-group numeric structure");
    expect(result.summary!.featureIds).toEqual(["cg001", "cg002"]);
    expect(result.summary!.summaryRows).toHaveLength(2);
    expect(result.summary!.summaryRows[0].effectSize).toBe(0.25);
    expect(result.summary!.summaryRows[0].pValue).toBe(0.01);
    expect(result.matrix).toBeUndefined();
    expect(result.features).toBeUndefined();
  });

  it("parses various summary statistic column aliases", () => {
    const path = join(tempDir, "summary-aliases.csv");
    writeFileSync(
      path,
      "feature_id,log2fc,qval,se,ci_lower,ci_upper,stat\ncg001,1.5,0.01,0.2,1.1,1.9,7.5\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-summary-aliases",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "effect_size",
    });

    expect(result.success).toBe(true);
    const row = result.summary!.summaryRows[0];
    expect(row.logFoldChange).toBe(1.5);
    expect(row.qValue).toBe(0.01);
    expect(row.standardError).toBe(0.2);
    expect(row.ciLower).toBe(1.1);
    expect(row.ciUpper).toBe(1.9);
    expect(row.statistic).toBe(7.5);
  });

  it("preserves raw summary values in summary rows", () => {
    const path = join(tempDir, "summary-raw.csv");
    writeFileSync(
      path,
      "feature_id,group,effect_size,p_value\ncg001,ctrl_vs_treat,0.25,0.01\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-summary-raw",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "effect_size",
    });

    expect(result.summary!.summaryRows[0].rawValues).toBeDefined();
    expect(result.summary!.summaryRows[0].rawValues!["effect_size"]).toBe("0.25");
  });

  it("warns on duplicate feature_ids in summary form", () => {
    const path = join(tempDir, "summary-dup.csv");
    writeFileSync(
      path,
      "feature_id,group,effect_size\ncg001,ctrl_vs_treat,0.25\ncg001,ctrl_vs_treat2,0.35\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-summary-dup",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "effect_size",
    });

    expect(result.warnings.some((w) => w.includes("duplicate feature_id"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Malformed / error tests
  // ---------------------------------------------------------------------------

  it("fails closed on missing required long-form columns", () => {
    const path = join(tempDir, "long-missing.csv");
    writeFileSync(path, "feature_id,sample_id\ncg001,s1\n");

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-long-missing",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Missing required long-form column"))).toBe(true);
  });

  it("fails closed on empty feature table", () => {
    const path = join(tempDir, "empty-features.csv");
    writeFileSync(path, "feature_id,sample_id,value\n");

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-empty",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("no data rows"))).toBe(true);
  });

  it("fails closed when file does not exist", () => {
    const path = join(tempDir, "does-not-exist.csv");
    const result = canonicalizeFeatureTable(path, {
      tableId: "test-missing",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Failed to read file"))).toBe(true);
  });

  it("fails closed on invalid options", () => {
    const path = join(tempDir, "any.csv");
    writeFileSync(path, "feature_id,sample_id,value\ncg001,s1,0.82\n");

    const result = canonicalizeFeatureTable(path, {
      tableId: "",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("options.tableId"))).toBe(true);
  });

  it("fails closed when declared_other is missing description", () => {
    const path = join(tempDir, "other-missing.csv");
    writeFileSync(path, "feature_id,sample_id,value\ncg001,s1,0.82\n");

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-other-missing",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "declared_other",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("declaredOtherDescription"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Shape override and ambiguity
  // ---------------------------------------------------------------------------

  it("honours explicit shape override to wide", () => {
    const path = join(tempDir, "override-wide.csv");
    // Headers look long-ish but explicit override says wide
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,0.82\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-override-wide",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
      explicitShape: "wide",
    });

    expect(result.kind).toBe("matrix");
    // Should fail because wide needs sample columns
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("No sample columns"))).toBe(true);
  });

  it("honours explicit shape override to long", () => {
    const path = join(tempDir, "override-long.csv");
    // Headers look wide-ish but explicit override says long
    writeFileSync(
      path,
      "feature_id,s1,s2\ncg001,0.82,0.85\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-override-long",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
      explicitShape: "long",
    });

    expect(result.kind).toBe("matrix");
    // Should fail because long needs sample_id and value columns
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Missing required long-form column"))).toBe(true);
  });

  it("returns ambiguous when shape cannot be determined and no override given", () => {
    const path = join(tempDir, "ambiguous.csv");
    writeFileSync(path, "a,b,c\n1,2,3\n");

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-ambiguous",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.success).toBe(false);
    expect(result.kind).toBe("none");
    expect(result.errors.some((e) => e.includes("ambiguous"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Row-level provenance
  // ---------------------------------------------------------------------------

  it("preserves row-level provenance for all parsed rows", () => {
    const path = join(tempDir, "provenance.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,0.82\ncg001,s2,NA\ncg002,s1,0.45\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-provenance",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.rowProvenance).toHaveLength(3);
    expect(result.rowProvenance[0].sourceFile).toBe(path);
    expect(result.rowProvenance[0].lineNumber).toBe(2); // header is row 1
    expect(result.rowProvenance[0].rawFeatureId).toBe("cg001");
    expect(result.rowProvenance[0].parsedSuccessfully).toBe(true);

    expect(result.rowProvenance[1].parsedSuccessfully).toBe(true);
    expect(result.rowProvenance[1].parsingNotes.some((n) => n.includes("NA"))).toBe(true);
  });

  it("tracks failed row provenance for missing feature_ids", () => {
    const path = join(tempDir, "provenance-fail.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\n,s1,0.82\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-provenance-fail",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.rowProvenance).toHaveLength(1);
    expect(result.rowProvenance[0].parsedSuccessfully).toBe(false);
    expect(result.rowProvenance[0].parsingNotes).toContain("missing feature_id");
  });

  // ---------------------------------------------------------------------------
  // Schema round-trip
  // ---------------------------------------------------------------------------

  it("produces results valid against FeatureTableCanonicalizationResultSchema", () => {
    const path = join(tempDir, "roundtrip.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,0.82\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-roundtrip",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(() => FeatureTableCanonicalizationResultSchema.parse(result)).not.toThrow();
  });

  it("produces summary results valid against SummaryResponseTableSchema", () => {
    const path = join(tempDir, "roundtrip-summary.csv");
    writeFileSync(
      path,
      "feature_id,group,effect_size\ncg001,ctrl_vs_treat,0.25\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-roundtrip-summary",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "effect_size",
    });

    expect(result.summary).toBeDefined();
    expect(() => SummaryResponseTableSchema.parse(result.summary!)).not.toThrow();
  });

  it("produces provenance valid against RowProvenanceSchema", () => {
    const path = join(tempDir, "roundtrip-prov.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,0.82\n",
    );

    const result = canonicalizeFeatureTable(path, {
      tableId: "test-roundtrip-prov",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    for (const prov of result.rowProvenance) {
      expect(() => RowProvenanceSchema.parse(prov)).not.toThrow();
    }
  });

  // ---------------------------------------------------------------------------
  // canonicalizeFeatureTableRows (direct row API)
  // ---------------------------------------------------------------------------

  it("canonicalizes rows directly without file I/O", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
      { feature_id: "cg001", sample_id: "s2", value: "0.85" },
    ];

    const result = canonicalizeFeatureTableRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-rows-direct",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.success).toBe(true);
    expect(result.kind).toBe("matrix");
    expect(result.matrix!.featureIds).toEqual(["cg001"]);
  });

  // ---------------------------------------------------------------------------
  // Backward-compatible ingestFeatureTable
  // ---------------------------------------------------------------------------

  it("ingestFeatureTable validates raw objects when no options given (legacy)", () => {
    const rows = [
      {
        featureId: "cg001",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        signalMetric: "beta_value",
        measuredIdentifier: "cg001",
        values: { s1: 0.82, s2: 0.85 },
      },
    ];

    const result = ingestFeatureTable(rows);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].featureId).toBe("cg001");
    expect(result.parseErrors).toHaveLength(0);
  });

  it("ingestFeatureTable canonicalizes string records when options given", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
      { feature_id: "cg001", sample_id: "s2", value: "0.85" },
    ];

    const result = ingestFeatureTable(rows, {
      tableId: "test-ingest-opts",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "beta_value",
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0].values).toEqual({ s1: 0.82, s2: 0.85 });
  });

  it("ingestFeatureTable reports parse errors for invalid legacy rows", () => {
    const rows = [
      {
        featureId: "cg001",
        // Missing required fields
      },
    ];

    const result = ingestFeatureTable(rows);
    expect(result.features).toHaveLength(0);
    expect(result.parseErrors.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Options schema validation
  // ---------------------------------------------------------------------------

  it("requires declaredOtherDescription when signalMetric is declared_other", () => {
    const parseResult = IngestFeatureTableOptionsSchema.safeParse({
      tableId: "test",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "declared_other",
    });

    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const messages = parseResult.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("declaredOtherDescription"))).toBe(true);
    }
  });

  it("accepts valid declared_other with description", () => {
    const parseResult = IngestFeatureTableOptionsSchema.safeParse({
      tableId: "test",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      signalMetric: "declared_other",
      declaredOtherDescription: "Custom methylation metric",
    });

    expect(parseResult.success).toBe(true);
  });
});
