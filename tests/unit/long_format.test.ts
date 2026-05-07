import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  canonicalizeLongRows,
  canonicalizeLongFile,
  LongFormatOptionsSchema,
  LongFormatResultSchema,
  LongFormatProvenanceSchema,
} from "../../src/ingestion/long_format.js";
import { LongResponseRecordSchema } from "../../src/ingestion/wide_format.js";

describe("canonicalizeLongRows", () => {
  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it("canonicalizes valid long-form rows into records", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
      { feature_id: "cg001", sample_id: "s2", value: "0.85" },
      { feature_id: "cg002", sample_id: "s1", value: "0.45" },
      { feature_id: "cg002", sample_id: "s2", value: "0.48" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-long-1",
    });

    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(4);
    expect(result.featureIds).toEqual(["cg001", "cg002"]);
    expect(result.sampleIds).toEqual(["s1", "s2"]);
    expect(result.errors).toHaveLength(0);
  });

  it("preserves feature and sample order of first appearance", () => {
    const rows = [
      { feature_id: "cg003", sample_id: "s2", value: "0.1" },
      { feature_id: "cg001", sample_id: "s1", value: "0.2" },
      { feature_id: "cg002", sample_id: "s3", value: "0.3" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-order",
    });

    expect(result.featureIds).toEqual(["cg003", "cg001", "cg002"]);
    expect(result.sampleIds).toEqual(["s2", "s1", "s3"]);
  });

  // ---------------------------------------------------------------------------
  // Missing required columns
  // ---------------------------------------------------------------------------

  it("fails closed when feature_id column is missing", () => {
    const rows = [{ id: "cg001", sample_id: "s1", value: "0.82" }];

    const result = canonicalizeLongRows(rows, ["id", "sample_id", "value"], {
      tableId: "test-missing-feature",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI001") && e.includes("feature_id"))).toBe(true);
    expect(result.records).toHaveLength(0);
  });

  it("fails closed when sample_id column is missing", () => {
    const rows = [{ feature_id: "cg001", id: "s1", value: "0.82" }];

    const result = canonicalizeLongRows(rows, ["feature_id", "id", "value"], {
      tableId: "test-missing-sample",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI001") && e.includes("sample_id"))).toBe(true);
  });

  it("fails closed when value column is missing", () => {
    const rows = [{ feature_id: "cg001", sample_id: "s1", val: "0.82" }];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "val"], {
      tableId: "test-missing-value",
      valueColumn: "value",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI001") && e.includes("value"))).toBe(true);
  });

  it("reports all missing columns in a single error", () => {
    const rows = [{ a: "1" }];

    const result = canonicalizeLongRows(rows, ["a"], {
      tableId: "test-all-missing",
    });

    expect(result.success).toBe(false);
    const error = result.errors.find((e) => e.includes("EPI001"));
    expect(error).toContain("feature_id");
    expect(error).toContain("sample_id");
    expect(error).toContain("value");
  });

  // ---------------------------------------------------------------------------
  // Duplicate feature/sample keys
  // ---------------------------------------------------------------------------

  it("fails closed on duplicate feature_id + sample_id", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
      { feature_id: "cg001", sample_id: "s1", value: "0.99" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-dup-key",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI006") && e.includes("duplicate"))).toBe(true);
    expect(result.records).toHaveLength(1);
  });

  it("allows same feature_id with different sample_ids", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
      { feature_id: "cg001", sample_id: "s2", value: "0.85" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-same-feature",
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("allows same sample_id with different feature_ids", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
      { feature_id: "cg002", sample_id: "s1", value: "0.45" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-same-sample",
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Numeric coercion failures
  // ---------------------------------------------------------------------------

  it("fails closed on non-numeric response values", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "hello" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-bad-num",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI001") && e.includes("non-numeric"))).toBe(true);
  });

  it("treats NA, empty, and nan as null", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "NA" },
      { feature_id: "cg001", sample_id: "s2", value: "" },
      { feature_id: "cg002", sample_id: "s1", value: "nan" },
      { feature_id: "cg002", sample_id: "s2", value: "null" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-nulls",
    });

    expect(result.success).toBe(true);
    expect(result.records.every((r) => r.responseValue === null)).toBe(true);
  });

  it("reports row-level location for non-numeric failures", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "bad_value" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-row-loc",
    });

    expect(result.errors.some((e) => e.includes("Row 2"))).toBe(true);
    expect(result.provenance[0].parsedSuccessfully).toBe(false);
    expect(result.provenance[0].parsingNotes).toContain("non-numeric value 'bad_value'");
  });

  // ---------------------------------------------------------------------------
  // Row-level error locations
  // ---------------------------------------------------------------------------

  it("reports correct line numbers for multiple errors", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
      { feature_id: "", sample_id: "s2", value: "0.85" },
      { feature_id: "cg003", sample_id: "", value: "0.88" },
      { feature_id: "cg004", sample_id: "s4", value: "bad" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-multi-errors",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Row 3"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Row 4"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Row 5"))).toBe(true);
  });

  it("tracks failed row provenance for missing feature_id", () => {
    const rows = [{ feature_id: "", sample_id: "s1", value: "0.82" }];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-prov-fail",
    });

    expect(result.provenance).toHaveLength(1);
    expect(result.provenance[0].parsedSuccessfully).toBe(false);
    expect(result.provenance[0].parsingNotes).toContain("missing feature_id");
  });

  it("tracks failed row provenance for missing sample_id", () => {
    const rows = [{ feature_id: "cg001", sample_id: "", value: "0.82" }];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-prov-fail-sample",
    });

    expect(result.provenance).toHaveLength(1);
    expect(result.provenance[0].parsedSuccessfully).toBe(false);
    expect(result.provenance[0].parsingNotes).toContain("missing sample_id");
  });

  // ---------------------------------------------------------------------------
  // Design sample ID validation
  // ---------------------------------------------------------------------------

  it("warns on unmatched sample IDs when designSampleIds provided", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
      { feature_id: "cg001", sample_id: "s_unknown", value: "0.85" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-unmatched",
      designSampleIds: ["s1", "s2"],
    });

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes("s_unknown") && w.includes("not found in design"))).toBe(true);
  });

  it("succeeds when all sample IDs match designSampleIds", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
      { feature_id: "cg001", sample_id: "s2", value: "0.85" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-matched",
      designSampleIds: ["s1", "s2"],
    });

    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Extensions preservation
  // ---------------------------------------------------------------------------

  it("preserves additional columns as extensions by default", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82", chr: "chr1", start: "1000" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value", "chr", "start"], {
      tableId: "test-extensions",
    });

    expect(result.success).toBe(true);
    expect(result.provenance[0].extensions).toBeDefined();
    expect(result.provenance[0].extensions!["chr"]).toBe("chr1");
    expect(result.provenance[0].extensions!["start"]).toBe("1000");
  });

  it("omits extensions when preserveExtensions is false", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82", extra: "x" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value", "extra"], {
      tableId: "test-no-extensions",
      preserveExtensions: false,
    });

    expect(result.success).toBe(true);
    expect(result.provenance[0].extensions).toBeUndefined();
  });

  it("does not include required columns in extensions", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82", chr: "chr1" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value", "chr"], {
      tableId: "test-ext-exclude",
    });

    expect(result.provenance[0].extensions).toBeDefined();
    expect(result.provenance[0].extensions).not.toHaveProperty("feature_id");
    expect(result.provenance[0].extensions).not.toHaveProperty("sample_id");
    expect(result.provenance[0].extensions).not.toHaveProperty("value");
  });

  // ---------------------------------------------------------------------------
  // Custom column names
  // ---------------------------------------------------------------------------

  it("accepts custom column names via options", () => {
    const rows = [
      { probe: "cg001", donor: "s1", beta: "0.82" },
    ];

    const result = canonicalizeLongRows(rows, ["probe", "donor", "beta"], {
      tableId: "test-custom",
      featureIdColumn: "probe",
      sampleIdColumn: "donor",
      valueColumn: "beta",
    });

    expect(result.success).toBe(true);
    expect(result.records[0].featureId).toBe("cg001");
    expect(result.records[0].sampleId).toBe("s1");
    expect(result.records[0].responseValue).toBe(0.82);
  });

  // ---------------------------------------------------------------------------
  // Empty rows
  // ---------------------------------------------------------------------------

  it("returns success false for empty row input", () => {
    const result = canonicalizeLongRows([], ["feature_id", "sample_id", "value"], {
      tableId: "test-empty",
    });

    expect(result.success).toBe(false);
    expect(result.records).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Schema round-trip
  // ---------------------------------------------------------------------------

  it("produces results valid against LongFormatResultSchema", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-roundtrip",
    });

    expect(() => LongFormatResultSchema.parse(result)).not.toThrow();
  });

  it("produces records valid against LongResponseRecordSchema", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "NA" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-record-roundtrip",
    });

    for (const record of result.records) {
      expect(() => LongResponseRecordSchema.parse(record)).not.toThrow();
    }
  });

  it("produces provenance valid against LongFormatProvenanceSchema", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82", extra: "x" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value", "extra"], {
      tableId: "test-prov-roundtrip",
    });

    for (const prov of result.provenance) {
      expect(() => LongFormatProvenanceSchema.parse(prov)).not.toThrow();
    }
  });

  // ---------------------------------------------------------------------------
  // Options schema validation
  // ---------------------------------------------------------------------------

  it("requires non-empty tableId in options", () => {
    const parseResult = LongFormatOptionsSchema.safeParse({
      tableId: "",
    });

    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const paths = parseResult.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("tableId"))).toBe(true);
    }
  });

  it("accepts minimal valid options with defaults", () => {
    const parseResult = LongFormatOptionsSchema.safeParse({
      tableId: "test",
    });

    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.featureIdColumn).toBe("feature_id");
      expect(parseResult.data.sampleIdColumn).toBe("sample_id");
      expect(parseResult.data.valueColumn).toBe("value");
      expect(parseResult.data.preserveExtensions).toBe(true);
    }
  });

  it("emits EPI001 for invalid options in canonicalizeLongRows", () => {
    const rows = [{ feature_id: "cg001", sample_id: "s1", value: "0.82" }];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI001"))).toBe(true);
  });

  it("emits EPI006 for duplicate keys in canonicalizeLongRows", () => {
    const rows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
      { feature_id: "cg001", sample_id: "s1", value: "0.99" },
    ];

    const result = canonicalizeLongRows(rows, ["feature_id", "sample_id", "value"], {
      tableId: "test-epi006",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI006"))).toBe(true);
  });
});

describe("canonicalizeLongFile", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "epimcp-long-file-test-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads and canonicalizes a long CSV file", () => {
    const path = join(tempDir, "long.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,0.82\ncg001,s2,0.85\ncg002,s1,0.45\n",
    );

    const result = canonicalizeLongFile(path, {
      tableId: "test-file-long",
    });

    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(3);
    expect(result.featureIds).toEqual(["cg001", "cg002"]);
    expect(result.sampleIds).toEqual(["s1", "s2"]);
    expect(result.provenance[0].sourceFile).toBe(path);
  });

  it("fails closed when file does not exist", () => {
    const path = join(tempDir, "does-not-exist.csv");
    const result = canonicalizeLongFile(path, {
      tableId: "test-missing",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Failed to read file"))).toBe(true);
  });

  it("fails closed on empty file", () => {
    const path = join(tempDir, "empty.csv");
    writeFileSync(path, "feature_id,sample_id,value\n");

    const result = canonicalizeLongFile(path, {
      tableId: "test-empty",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("no data rows"))).toBe(true);
  });

  it("uses custom column names from options", () => {
    const path = join(tempDir, "long-custom.csv");
    writeFileSync(
      path,
      "probe,donor,beta\ncg001,s1,0.82\n",
    );

    const result = canonicalizeLongFile(path, {
      tableId: "test-custom-cols",
      featureIdColumn: "probe",
      sampleIdColumn: "donor",
      valueColumn: "beta",
    });

    expect(result.success).toBe(true);
    expect(result.records[0].featureId).toBe("cg001");
    expect(result.records[0].sampleId).toBe("s1");
  });

  it("validates designSampleIds against file-derived sample IDs", () => {
    const path = join(tempDir, "long-design.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,0.82\ncg001,s_unknown,0.85\n",
    );

    const result = canonicalizeLongFile(path, {
      tableId: "test-design",
      designSampleIds: ["s1", "s2"],
    });

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes("s_unknown") && w.includes("not found in design"))).toBe(true);
  });

  it("preserves extensions from file rows", () => {
    const path = join(tempDir, "long-ext.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value,chr,start\ncg001,s1,0.82,chr1,1000\n",
    );

    const result = canonicalizeLongFile(path, {
      tableId: "test-file-ext",
    });

    expect(result.success).toBe(true);
    expect(result.provenance[0].extensions).toBeDefined();
    expect(result.provenance[0].extensions!["chr"]).toBe("chr1");
  });

  it("emits EPI001 for missing columns in file", () => {
    const path = join(tempDir, "long-bad-cols.csv");
    writeFileSync(
      path,
      "feature_id,sample_id\ncg001,s1\n",
    );

    const result = canonicalizeLongFile(path, {
      tableId: "test-bad-cols",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI001") && e.includes("value"))).toBe(true);
  });

  it("emits EPI006 for duplicate keys in file", () => {
    const path = join(tempDir, "long-dup-file.csv");
    writeFileSync(
      path,
      "feature_id,sample_id,value\ncg001,s1,0.82\ncg001,s1,0.99\n",
    );

    const result = canonicalizeLongFile(path, {
      tableId: "test-dup-file",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("EPI006"))).toBe(true);
  });
});
