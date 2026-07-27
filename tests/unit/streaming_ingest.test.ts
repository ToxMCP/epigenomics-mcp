import { createHash } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { streamIngestFeatureTableFile } from "../../src/ingestion/streaming_ingest.js";

const temporaryDirectories: string[] = [];

function temporaryGzipFile(name: string, content: string): string {
  const directory = mkdtempSync(join(tmpdir(), "epimcp-streaming-ingest-"));
  temporaryDirectories.push(directory);
  const path = join(directory, name);
  writeFileSync(path, gzipSync(content));
  return path;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("streaming feature-table ingestion", () => {
  it("canonicalizes a gzip-compressed wide matrix in bounded batches", async () => {
    const content = [
      "feature_id\tcontrol-1\ttreated-1",
      "cg001\t0.1\t0.2",
      "cg002\t0.3\t0.4",
      "cg003\t0.5\t0.6",
    ].join("\n");
    const path = temporaryGzipFile("features.tsv.gz", content);

    const result = await streamIngestFeatureTableFile(
      path,
      {
        tableId: "streaming-wide",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        signalMetric: "beta_value",
        explicitShape: "wide",
        sampleIdColumns: ["control-1", "treated-1"],
        designSampleIds: ["control-1", "treated-1"],
        featureIdColumn: "feature_id",
      },
      {
        compression: "auto",
        delimiter: "\t",
        hasHeader: true,
        batchSize: 2,
      },
    );

    expect(result).toMatchObject({
      ingestionCompatible: true,
      featureCount: 3,
      dataRowCount: 3,
      batchCount: 2,
      sampleCount: 2,
      firstFeatureId: "cg001",
      lastFeatureId: "cg003",
      errorCount: 0,
    });
    expect(result.contentChecksumSha256).toBe(
      createHash("sha256").update(content).digest("hex"),
    );
  });

  it("supports headerless narrowPeak input with explicit source columns", async () => {
    const content = [
      "chr1\t10\t20\tPeak_1\t100\t.\t2.5\t5\t4\t3",
      "chr2\t30\t45\tPeak_2\t250\t.\t3.5\t7\t6\t4",
    ].join("\n");
    const path = temporaryGzipFile("peaks.bed.gz", content);

    const result = await streamIngestFeatureTableFile(
      path,
      {
        tableId: "streaming-peaks",
        featureClass: "atac_peak",
        modality: "atac_seq",
        signalMetric: "accessibility_signal",
        explicitShape: "wide",
        sampleIdColumns: ["aggregate_signal"],
        featureIdColumn: "feature_id",
        coordinateColumns: {
          chrom: "chrom",
          start: "start",
          end: "end",
        },
        genomeBuildLiteral: "GRCh38",
        coordinateSystemLiteral: "0-based-half-open",
      },
      {
        compression: "gzip",
        delimiter: "\t",
        hasHeader: false,
        headers: [
          "chrom",
          "start",
          "end",
          "feature_id",
          "score",
          "strand",
          "aggregate_signal",
          "minus_log10_p",
          "minus_log10_q",
          "peak_offset",
        ],
        batchSize: 1,
      },
    );

    expect(result).toMatchObject({
      ingestionCompatible: true,
      featureCount: 2,
      dataRowCount: 2,
      batchCount: 2,
      firstFeatureId: "Peak_1",
      lastFeatureId: "Peak_2",
      errorCount: 0,
    });
  });

  it("reports malformed rows without retaining unbounded error details", async () => {
    const path = temporaryGzipFile(
      "malformed.tsv.gz",
      [
        "feature_id\tcontrol-1\ttreated-1",
        "cg001\t0.1\t0.2",
        "cg002\tbad",
        "cg003\t0.5\tnot-numeric",
      ].join("\n"),
    );

    const result = await streamIngestFeatureTableFile(
      path,
      {
        tableId: "streaming-malformed",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        signalMetric: "beta_value",
        explicitShape: "wide",
        sampleIdColumns: ["control-1", "treated-1"],
        featureIdColumn: "feature_id",
      },
      {
        compression: "gzip",
        delimiter: "\t",
        hasHeader: true,
        batchSize: 2,
        maxErrorDetails: 1,
      },
    );

    expect(result.ingestionCompatible).toBe(false);
    expect(result.featureCount).toBe(1);
    expect(result.dataRowCount).toBe(3);
    expect(result.errorCount).toBe(2);
    expect(result.errors).toHaveLength(1);
  });
});
