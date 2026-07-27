import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { Transform, type Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { z } from "zod";
import {
  canonicalizeFeatureTableRows,
  IngestFeatureTableOptionsSchema,
  type IngestFeatureTableOptions,
} from "./feature_table.js";

export const StreamingIngestOptionsSchema = z
  .object({
    compression: z
      .enum(["auto", "none", "gzip"])
      .default("auto")
      .describe("Input compression; auto recognizes .gz paths"),
    delimiter: z
      .enum([",", "\t", ";", "|"])
      .default("\t")
      .describe("Field delimiter used by the decompressed text"),
    hasHeader: z
      .boolean()
      .default(true)
      .describe("Whether the first decompressed line contains column names"),
    headers: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe("Explicit headers required when the source has no header row"),
    batchSize: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .default(1000)
      .describe("Rows canonicalized per bounded in-memory batch"),
    maxErrorDetails: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Maximum detailed ingestion errors retained in the result"),
  })
  .strict()
  .refine(
    (options) =>
      (options.hasHeader && options.headers === undefined) ||
      (!options.hasHeader && options.headers !== undefined),
    {
      message:
        "headers must be supplied exactly when hasHeader is false",
      path: ["headers"],
    },
  );

export type StreamingIngestOptions = z.input<
  typeof StreamingIngestOptionsSchema
>;

export const StreamingIngestResultSchema = z
  .object({
    ingestionCompatible: z
      .boolean()
      .describe("True when every streamed row canonicalized successfully"),
    featureCount: z
      .number()
      .int()
      .nonnegative()
      .describe("Canonical features produced across all batches"),
    dataRowCount: z
      .number()
      .int()
      .nonnegative()
      .describe("Non-header source rows encountered"),
    batchCount: z
      .number()
      .int()
      .nonnegative()
      .describe("Bounded canonicalization batches executed"),
    sampleCount: z
      .number()
      .int()
      .nonnegative()
      .describe("Explicit sample columns or design samples supplied"),
    firstFeatureId: z.string().nullable(),
    lastFeatureId: z.string().nullable(),
    sourceFileBytes: z.number().int().nonnegative(),
    sourceChecksumSha256: z.string().length(64),
    contentChecksumSha256: z.string().length(64),
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export type StreamingIngestResult = z.infer<
  typeof StreamingIngestResultSchema
>;

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    const nextCharacter = line[index + 1];
    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === delimiter && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  fields.push(current);
  return fields;
}

async function checksumFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

function decompressedStream(
  path: string,
  compression: "auto" | "none" | "gzip",
): Readable {
  const resolvedCompression =
    compression === "auto"
      ? path.toLowerCase().endsWith(".gz")
        ? "gzip"
        : "none"
      : compression;
  const source = createReadStream(path);
  return resolvedCompression === "gzip" ? source.pipe(createGunzip()) : source;
}

/**
 * Canonicalize a large delimited table without retaining the complete feature
 * matrix. Existing file-policy limits are enforced before this function is
 * called; the caller must explicitly opt in to streaming and authorize the
 * source size.
 */
export async function streamIngestFeatureTableFile(
  path: string,
  tableOptions: IngestFeatureTableOptions,
  streamingOptions: StreamingIngestOptions = {},
): Promise<StreamingIngestResult> {
  const parsedTableOptions =
    IngestFeatureTableOptionsSchema.parse(tableOptions);
  const options = StreamingIngestOptionsSchema.parse(streamingOptions);
  const sourceChecksumSha256 = await checksumFile(path);
  const contentHash = createHash("sha256");
  const hashTap = new Transform({
    transform(chunk, _encoding, callback) {
      contentHash.update(chunk as Buffer);
      callback(null, chunk);
    },
  });
  const input = decompressedStream(path, options.compression).pipe(hashTap);
  const lines = createInterface({ input, crlfDelay: Infinity });

  let headers = options.headers;
  let dataRowCount = 0;
  let featureCount = 0;
  let batchCount = 0;
  let errorCount = 0;
  let firstFeatureId: string | null = null;
  let lastFeatureId: string | null = null;
  const errorDetails: string[] = [];
  const warningDetails = new Set<string>();
  let batch: Record<string, string>[] = [];
  const featureIdColumn = parsedTableOptions.featureIdColumn ?? "feature_id";

  const retainError = (message: string): void => {
    errorCount++;
    if (errorDetails.length < options.maxErrorDetails) {
      errorDetails.push(message);
    }
  };

  const processBatch = (): void => {
    if (batch.length === 0 || headers === undefined) return;
    batchCount++;
    const result = canonicalizeFeatureTableRows(
      batch,
      headers,
      parsedTableOptions,
      path,
    );
    featureCount += result.features?.length ?? 0;
    for (const error of result.errors) {
      retainError(`batch ${batchCount}: ${error}`);
    }
    for (const warning of result.warnings) {
      warningDetails.add(warning);
    }
    batch = [];
  };

  for await (const line of lines) {
    if (headers === undefined) {
      headers = parseDelimitedLine(line, options.delimiter);
      if (
        headers.length === 0 ||
        headers.some((header) => header.trim().length === 0) ||
        new Set(headers).size !== headers.length
      ) {
        throw new Error(
          "Streaming input header must contain unique non-empty column names",
        );
      }
      continue;
    }

    if (line.trim().length === 0) continue;
    dataRowCount++;
    const fields = parseDelimitedLine(line, options.delimiter);
    if (fields.length !== headers.length) {
      retainError(
        `row ${dataRowCount}: expected ${headers.length} fields, received ${fields.length}`,
      );
      continue;
    }

    const row = Object.fromEntries(
      headers.map((header, index) => [header, fields[index] ?? ""]),
    );
    const featureId = row[featureIdColumn]?.trim();
    if (featureId) {
      firstFeatureId ??= featureId;
      lastFeatureId = featureId;
    }
    batch.push(row);
    if (batch.length >= options.batchSize) processBatch();
  }
  processBatch();

  if (headers === undefined) {
    throw new Error("Streaming input contains no header or data rows");
  }
  if (dataRowCount === 0) {
    retainError("Streaming input contains no data rows");
  }

  const sampleCount =
    parsedTableOptions.sampleIdColumns?.length ??
    parsedTableOptions.designSampleIds?.length ??
    0;
  const result = {
    ingestionCompatible: errorCount === 0 && featureCount === dataRowCount,
    featureCount,
    dataRowCount,
    batchCount,
    sampleCount,
    firstFeatureId,
    lastFeatureId,
    sourceFileBytes: statSync(path).size,
    sourceChecksumSha256,
    contentChecksumSha256: contentHash.digest("hex"),
    errorCount,
    warningCount: warningDetails.size,
    errors: errorDetails,
    warnings: [...warningDetails],
  };
  return StreamingIngestResultSchema.parse(result);
}
