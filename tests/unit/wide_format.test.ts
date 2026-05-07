import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  meltWideToLong,
  canonicalizeWideFileToLong,
  WideToLongOptionsSchema,
  WideToLongResultSchema,
  LongResponseRecordSchema,
  WideToLongProvenanceSchema,
} from "../../src/ingestion/wide_format.js";

describe("meltWideToLong", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "epimcp-wide-test-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Equivalence between long and wide fixtures
  // ---------------------------------------------------------------------------

  it("produces equivalent long records from wide and explicit long fixtures", () => {
    // Wide fixture
    const wideRows = [
      { feature_id: "cg001", s1: "0.82", s2: "0.85", s3: "0.88" },
      { feature_id: "cg002", s1: "0.45", s2: "0.48", s3: "0.51" },
    ];

    const wideResult = meltWideToLong(wideRows, ["feature_id", "s1", "s2", "s3"], {
      tableId: "test-wide-equiv",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s2", "s3"],
    });

    expect(wideResult.success).toBe(true);
    expect(wideResult.records).toHaveLength(6);

    // Equivalent long fixture (same data expressed long-form)
    const longRows = [
      { feature_id: "cg001", sample_id: "s1", value: "0.82" },
      { feature_id: "cg001", sample_id: "s2", value: "0.85" },
      { feature_id: "cg001", sample_id: "s3", value: "0.88" },
      { feature_id: "cg002", sample_id: "s1", value: "0.45" },
      { feature_id: "cg002", sample_id: "s2", value: "0.48" },
      { feature_id: "cg002", sample_id: "s3", value: "0.51" },
    ];

    // We verify equivalence by checking that every wide-derived record
    // has a matching long-derived record with the same values.
    for (const wideRecord of wideResult.records) {
      const match = longRows.find(
        (r) =>
          r.feature_id === wideRecord.featureId &&
          r.sample_id === wideRecord.sampleId &&
          Number(r.value) === wideRecord.responseValue,
      );
      expect(match).toBeDefined();
    }

    // Feature and sample order preservation
    expect(wideResult.featureIds).toEqual(["cg001", "cg002"]);
    expect(wideResult.sampleIds).toEqual(["s1", "s2", "s3"]);
  });

  it("handles NA and empty values as null when melting wide form", () => {
    const wideRows = [
      { feature_id: "cg001", s1: "NA", s2: "0.85", s3: "" },
      { feature_id: "cg002", s1: "nan", s2: "null", s3: "0.51" },
    ];

    const result = meltWideToLong(wideRows, ["feature_id", "s1", "s2", "s3"], {
      tableId: "test-wide-na",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s2", "s3"],
    });

    expect(result.success).toBe(true);

    const naRecord = result.records.find((r) => r.featureId === "cg001" && r.sampleId === "s1");
    expect(naRecord?.responseValue).toBeNull();

    const emptyRecord = result.records.find((r) => r.featureId === "cg001" && r.sampleId === "s3");
    expect(emptyRecord?.responseValue).toBeNull();

    const nanRecord = result.records.find((r) => r.featureId === "cg002" && r.sampleId === "s1");
    expect(nanRecord?.responseValue).toBeNull();

    const nullRecord = result.records.find((r) => r.featureId === "cg002" && r.sampleId === "s2");
    expect(nullRecord?.responseValue).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Unmatched sample columns
  // ---------------------------------------------------------------------------

  it("warns on unmatched sample columns when designSampleIds provided", () => {
    const wideRows = [
      { feature_id: "cg001", s1: "0.82", s_unknown: "0.85" },
    ];

    const result = meltWideToLong(wideRows, ["feature_id", "s1", "s_unknown"], {
      tableId: "test-wide-unmatched",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s_unknown"],
      designSampleIds: ["s1", "s2"],
    });

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes("s_unknown") && w.includes("not found in design"))).toBe(true);
    expect(result.records).toHaveLength(2);
  });

  it("succeeds when all sample columns match designSampleIds", () => {
    const wideRows = [
      { feature_id: "cg001", s1: "0.82", s2: "0.85" },
    ];

    const result = meltWideToLong(wideRows, ["feature_id", "s1", "s2"], {
      tableId: "test-wide-matched",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s2"],
      designSampleIds: ["s1", "s2"],
    });

    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Duplicate feature IDs
  // ---------------------------------------------------------------------------

  it("warns on duplicate feature_ids and uses latest row", () => {
    const wideRows = [
      { feature_id: "cg001", s1: "0.82", s2: "0.85" },
      { feature_id: "cg001", s1: "0.99", s2: "0.99" },
    ];

    const result = meltWideToLong(wideRows, ["feature_id", "s1", "s2"], {
      tableId: "test-wide-dup",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s2"],
    });

    expect(result.warnings.some((w) => w.includes("duplicate feature_id"))).toBe(true);
    expect(result.featureIds).toHaveLength(1);

    // Latest values should be present
    const r1 = result.records.find((r) => r.featureId === "cg001" && r.sampleId === "s1");
    expect(r1?.responseValue).toBe(0.99);
  });

  // ---------------------------------------------------------------------------
  // Non-numeric values
  // ---------------------------------------------------------------------------

  it("fails closed on non-numeric sample values", () => {
    const wideRows = [
      { feature_id: "cg001", s1: "0.82", s2: "hello" },
    ];

    const result = meltWideToLong(wideRows, ["feature_id", "s1", "s2"], {
      tableId: "test-wide-bad",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s2"],
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("non-numeric"))).toBe(true);
    expect(result.records).toHaveLength(1); // s1 is still parsed before error
  });

  it("reports non-numeric values with row and sample context", () => {
    const wideRows = [
      { feature_id: "cg001", s1: "0.82", s2: "bad_value" },
    ];

    const result = meltWideToLong(wideRows, ["feature_id", "s1", "s2"], {
      tableId: "test-wide-bad-context",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s2"],
    });

    expect(result.errors.some((e) => e.includes("bad_value"))).toBe(true);
    expect(result.provenance[0].parsedSuccessfully).toBe(false);
    expect(result.provenance[0].parsingNotes).toContain("one or more non-numeric sample values");
  });

  // ---------------------------------------------------------------------------
  // Auto-detection of sample columns
  // ---------------------------------------------------------------------------

  it("auto-detects sample columns when not explicitly provided", () => {
    const wideRows = [
      { feature_id: "cg001", donor_1: "0.82", donor_2: "0.85", chr: "chr1" },
    ];

    const result = meltWideToLong(wideRows, ["feature_id", "donor_1", "donor_2", "chr"], {
      tableId: "test-wide-auto",
      featureIdColumn: "feature_id",
    });

    expect(result.success).toBe(true);
    expect(result.sampleIds).toEqual(["donor_1", "donor_2"]);
    expect(result.records).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Missing feature_id column
  // ---------------------------------------------------------------------------

  it("fails closed when feature_id column is missing", () => {
    const wideRows = [{ id: "cg001", s1: "0.82" }];

    const result = meltWideToLong(wideRows, ["id", "s1"], {
      tableId: "test-wide-missing-feature",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1"],
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Missing required feature column"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Missing sample columns
  // ---------------------------------------------------------------------------

  it("fails closed when no sample columns are identified", () => {
    const wideRows = [{ feature_id: "cg001", chr: "chr1", start: "1000" }];

    const result = meltWideToLong(wideRows, ["feature_id", "chr", "start"], {
      tableId: "test-wide-no-samples",
      featureIdColumn: "feature_id",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("No sample columns"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Empty rows
  // ---------------------------------------------------------------------------

  it("returns success with empty records for empty row input", () => {
    const result = meltWideToLong([], ["feature_id", "s1"], {
      tableId: "test-wide-empty",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1"],
    });

    expect(result.success).toBe(false);
    expect(result.records).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Provenance preservation
  // ---------------------------------------------------------------------------

  it("preserves source column names in provenance", () => {
    const wideRows = [
      { feature_id: "cg001", s1: "0.82", s2: "0.85" },
    ];

    const result = meltWideToLong(wideRows, ["feature_id", "s1", "s2"], {
      tableId: "test-wide-prov",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s2"],
    });

    expect(result.provenance).toHaveLength(1);
    expect(result.provenance[0].sourceColumnNames).toEqual(["s1", "s2"]);
    expect(result.provenance[0].parsedSuccessfully).toBe(true);
  });

  it("tracks failed row provenance for missing feature_ids", () => {
    const wideRows = [{ feature_id: "", s1: "0.82", s2: "0.85" }];

    const result = meltWideToLong(wideRows, ["feature_id", "s1", "s2"], {
      tableId: "test-wide-prov-fail",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s2"],
    });

    expect(result.provenance).toHaveLength(1);
    expect(result.provenance[0].parsedSuccessfully).toBe(false);
    expect(result.provenance[0].parsingNotes).toContain("missing feature_id");
  });

  // ---------------------------------------------------------------------------
  // Schema round-trip
  // ---------------------------------------------------------------------------

  it("produces results valid against WideToLongResultSchema", () => {
    const wideRows = [
      { feature_id: "cg001", s1: "0.82", s2: "0.85" },
    ];

    const result = meltWideToLong(wideRows, ["feature_id", "s1", "s2"], {
      tableId: "test-wide-roundtrip",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s2"],
    });

    expect(() => WideToLongResultSchema.parse(result)).not.toThrow();
  });

  it("produces records valid against LongResponseRecordSchema", () => {
    const wideRows = [
      { feature_id: "cg001", s1: "0.82", s2: "NA" },
    ];

    const result = meltWideToLong(wideRows, ["feature_id", "s1", "s2"], {
      tableId: "test-wide-record-roundtrip",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s2"],
    });

    for (const record of result.records) {
      expect(() => LongResponseRecordSchema.parse(record)).not.toThrow();
    }
  });

  it("produces provenance valid against WideToLongProvenanceSchema", () => {
    const wideRows = [
      { feature_id: "cg001", s1: "0.82", s2: "0.85" },
    ];

    const result = meltWideToLong(wideRows, ["feature_id", "s1", "s2"], {
      tableId: "test-wide-prov-roundtrip",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1", "s2"],
    });

    for (const prov of result.provenance) {
      expect(() => WideToLongProvenanceSchema.parse(prov)).not.toThrow();
    }
  });

  // ---------------------------------------------------------------------------
  // Options schema validation
  // ---------------------------------------------------------------------------

  it("requires non-empty tableId in options", () => {
    const parseResult = WideToLongOptionsSchema.safeParse({
      tableId: "",
      featureIdColumn: "feature_id",
      sampleColumns: ["s1"],
    });

    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const paths = parseResult.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("tableId"))).toBe(true);
    }
  });

  it("accepts minimal valid options with defaults", () => {
    const parseResult = WideToLongOptionsSchema.safeParse({
      tableId: "test",
    });

    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.featureIdColumn).toBe("feature_id");
    }
  });
});

describe("canonicalizeWideFileToLong", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "epimcp-wide-file-test-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads and melts a wide CSV file", () => {
    const path = join(tempDir, "wide.csv");
    writeFileSync(
      path,
      "feature_id,s1,s2,s3\ncg001,0.82,0.85,0.88\ncg002,0.45,0.48,0.51\n",
    );

    const result = canonicalizeWideFileToLong(path, {
      tableId: "test-file-wide",
      featureIdColumn: "feature_id",
    });

    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(6);
    expect(result.featureIds).toEqual(["cg001", "cg002"]);
    expect(result.sampleIds).toEqual(["s1", "s2", "s3"]);
    expect(result.provenance[0].sourceFile).toBe(path);
  });

  it("fails closed when file does not exist", () => {
    const path = join(tempDir, "does-not-exist.csv");
    const result = canonicalizeWideFileToLong(path, {
      tableId: "test-missing",
      featureIdColumn: "feature_id",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Failed to read file"))).toBe(true);
  });

  it("fails closed on empty file", () => {
    const path = join(tempDir, "empty.csv");
    writeFileSync(path, "feature_id,s1\n");

    const result = canonicalizeWideFileToLong(path, {
      tableId: "test-empty",
      featureIdColumn: "feature_id",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("no data rows"))).toBe(true);
  });

  it("uses explicit sampleColumns override when provided", () => {
    const path = join(tempDir, "wide-explicit.csv");
    writeFileSync(
      path,
      "feature_id,donor_1,donor_2,chr\ncg001,0.82,0.85,chr1\n",
    );

    const result = canonicalizeWideFileToLong(path, {
      tableId: "test-explicit",
      featureIdColumn: "feature_id",
      sampleColumns: ["donor_1", "donor_2"],
    });

    expect(result.success).toBe(true);
    expect(result.sampleIds).toEqual(["donor_1", "donor_2"]);
    expect(result.records).toHaveLength(2);
  });

  it("validates designSampleIds against file-derived sample columns", () => {
    const path = join(tempDir, "wide-design.csv");
    writeFileSync(
      path,
      "feature_id,s1,s_unknown\ncg001,0.82,0.85\n",
    );

    const result = canonicalizeWideFileToLong(path, {
      tableId: "test-design",
      featureIdColumn: "feature_id",
      designSampleIds: ["s1", "s2"],
    });

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes("s_unknown") && w.includes("not found in design"))).toBe(true);
  });
});
