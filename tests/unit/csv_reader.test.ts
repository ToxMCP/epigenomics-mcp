import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { readTableFile } from "../../src/ingestion/csv_reader.js";

describe("readTableFile", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "epimcp-csv-test-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("parses a simple CSV file", () => {
    const path = join(tempDir, "simple.csv");
    writeFileSync(path, "featureId,signal,sample\ncg001,0.82,s1\ncg002,0.45,s2\n");

    const result = readTableFile(path);
    expect(result.success).toBe(true);
    expect(result.headers).toEqual(["featureId", "signal", "sample"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ featureId: "cg001", signal: "0.82", sample: "s1" });
    expect(result.delimiterUsed).toBe(",");
    expect(result.encodingUsed).toBe("utf-8");
    expect(result.dataRowCount).toBe(2);
    expect(result.rowCount).toBe(3);
    expect(result.errors).toHaveLength(0);
  });

  it("parses a simple TSV file with auto-detected tab delimiter", () => {
    const path = join(tempDir, "simple.tsv");
    writeFileSync(path, "featureId\tsignal\tsample\ncg001\t0.82\ts1\ncg002\t0.45\ts2\n");

    const result = readTableFile(path);
    expect(result.success).toBe(true);
    expect(result.headers).toEqual(["featureId", "signal", "sample"]);
    expect(result.rows).toHaveLength(2);
    expect(result.delimiterUsed).toBe("\t");
  });

  it("honours explicit delimiter override", () => {
    const path = join(tempDir, "pipe.txt");
    writeFileSync(path, "a|b|c\n1|2|3\n");

    const result = readTableFile(path, { delimiter: "|" });
    expect(result.success).toBe(true);
    expect(result.headers).toEqual(["a", "b", "c"]);
    expect(result.rows[0]).toEqual({ a: "1", b: "2", c: "3" });
    expect(result.delimiterUsed).toBe("|");
  });

  it("computes deterministic SHA-256 checksum", () => {
    const path = join(tempDir, "checksum.csv");
    const content = "a,b\n1,2\n";
    writeFileSync(path, content);

    const result = readTableFile(path);
    expect(result.checksumSha256).toHaveLength(64);
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    // Same bytes -> same checksum
    const result2 = readTableFile(path);
    expect(result2.checksumSha256).toBe(result.checksumSha256);
  });

  it("fails closed on empty file", () => {
    const path = join(tempDir, "empty.csv");
    writeFileSync(path, "");

    const result = readTableFile(path);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("fails closed on file containing only whitespace", () => {
    const path = join(tempDir, "whitespace.csv");
    writeFileSync(path, "   \n\n   \n");

    const result = readTableFile(path);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
  });

  it("reports duplicate headers", () => {
    const path = join(tempDir, "dup-headers.csv");
    writeFileSync(path, "a,b,a\n1,2,3\n");

    const result = readTableFile(path);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate header"))).toBe(true);
  });

  it("reports empty header names", () => {
    const path = join(tempDir, "empty-header.csv");
    writeFileSync(path, "a,,c\n1,2,3\n");

    const result = readTableFile(path);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Empty header"))).toBe(true);
  });

  it("reports malformed rows with wrong column count", () => {
    const path = join(tempDir, "malformed.csv");
    writeFileSync(path, "a,b,c\n1,2,3\n4,5\n6,7,8,9\n");

    const result = readTableFile(path);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.some((e) => e.includes("expected 3 columns, got 2"))).toBe(true);
    expect(result.errors.some((e) => e.includes("expected 3 columns, got 4"))).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("skips empty data rows and emits a warning", () => {
    const path = join(tempDir, "empty-rows.csv");
    writeFileSync(path, "a,b\n1,2\n\n3,4\n\n\n5,6\n");

    const result = readTableFile(path);
    expect(result.success).toBe(true);
    expect(result.rows).toHaveLength(3);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((w) => w.includes("Skipped empty row"))).toBe(true);
  });

  it("handles CRLF line endings", () => {
    const path = join(tempDir, "crlf.csv");
    writeFileSync(path, "a,b\r\n1,2\r\n3,4\r\n");

    const result = readTableFile(path);
    expect(result.success).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toEqual({ a: "3", b: "4" });
  });

  it("handles quoted fields containing delimiters", () => {
    const path = join(tempDir, "quoted.csv");
    writeFileSync(path, 'a,b\n"hello, world",2\n3,4\n');

    const result = readTableFile(path);
    expect(result.success).toBe(true);
    expect(result.rows[0]).toEqual({ a: "hello, world", b: "2" });
  });

  it("handles latin1 fallback encoding", () => {
    const path = join(tempDir, "latin1.csv");
    // Write a byte that is not valid UTF-8 but is valid latin1 (e.g., 0xE9 = é in latin1)
    writeFileSync(path, Buffer.from("a,b\ncaf\xE9,2\n", "latin1"));

    const result = readTableFile(path, { fallbackEncodings: ["latin1"] });
    expect(result.success).toBe(true);
    expect(result.encodingUsed).toBe("latin1");
    expect(result.rows[0]).toEqual({ a: "café", b: "2" });
  });

  it("fails closed when file does not exist", () => {
    const path = join(tempDir, "does-not-exist.csv");
    const result = readTableFile(path);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("Failed to read file"))).toBe(true);
  });

  it("validates options schema and fails closed on bad options", () => {
    const path = join(tempDir, "any.csv");
    writeFileSync(path, "a,b\n1,2\n");

    const result = readTableFile(path, {
      // @ts-expect-error testing invalid option
      headerRowIndex: -1,
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("options.headerRowIndex"))).toBe(true);
  });

  it("handles semicolon-delimited files with auto-detection", () => {
    const path = join(tempDir, "semi.csv");
    writeFileSync(path, "a;b;c\n1;2;3\n");

    const result = readTableFile(path);
    expect(result.success).toBe(true);
    expect(result.delimiterUsed).toBe(";");
    expect(result.rows[0]).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("does not infer biological semantics from filename", () => {
    const path = join(tempDir, "methylation_differential_peaks_important.csv");
    writeFileSync(path, "a,b\n1,2\n");

    const result = readTableFile(path);
    expect(result.success).toBe(true);
    // Result should only contain parsed data, no biological inference
    expect(result.headers).toEqual(["a", "b"]);
    expect(result.rows[0]).toEqual({ a: "1", b: "2" });
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
