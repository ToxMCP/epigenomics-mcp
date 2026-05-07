import { createHash } from "crypto";
import { readFileSync, statSync } from "fs";
import { z } from "zod";

/**
 * Supported text encodings for table ingestion.
 */
export const TableEncodingSchema = z.enum([
  "utf-8",
  "utf-16le",
  "latin1",
  "ascii",
]);

export type TableEncoding = z.infer<typeof TableEncodingSchema>;

/**
 * Options for reading a delimited text file.
 */
export const ReadTableOptionsSchema = z
  .object({
    delimiter: z
      .enum([",", "\t", ";", "|"])
      .optional()
      .describe("Explicit delimiter override. When omitted, auto-detect."),
    encoding: TableEncodingSchema.default("utf-8").describe(
      "File text encoding",
    ),
    fallbackEncodings: z
      .array(TableEncodingSchema)
      .default(["latin1"])
      .describe("Encodings to attempt on decode failure"),
    headerRowIndex: z
      .number()
      .int()
      .nonnegative()
      .default(0)
      .describe("Zero-based index of the header row"),
    offset: z
      .number()
      .int()
      .nonnegative()
      .default(0)
      .describe("Zero-based data-row offset for paginated table reads"),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum number of parsed data rows to return"),
    maxFileBytes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum file size accepted before reading bytes"),
  })
  .strict();

export type ReadTableOptions = z.input<typeof ReadTableOptionsSchema>;

/**
 * Result of reading a delimited text file.
 */
export const ReadTableResultSchema = z
  .object({
    success: z.boolean(),
    headers: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.string())),
    rowCount: z.number().int().nonnegative(),
    dataRowCount: z.number().int().nonnegative(),
    totalDataRowCount: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    nextOffset: z.number().int().nonnegative().nullable(),
    checksumSha256: z.string().length(64),
    delimiterUsed: z.enum([",", "\t", ";", "|"]),
    encodingUsed: TableEncodingSchema,
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export type ReadTableResult = z.infer<typeof ReadTableResultSchema>;

/**
 * Detect delimiter from a sample line.
 * Prefers tab when both comma and tab are present (common in TSV exports
 * that may contain commas inside fields).  Falls back to comma, then
 * semicolon, then pipe.
 */
function detectDelimiter(line: string): "," | "\t" | ";" | "|" {
  const tabCount = (line.match(/\t/g) || []).length;
  const commaCount = (line.match(/,/g) || []).length;
  const semiCount = (line.match(/;/g) || []).length;
  const pipeCount = (line.match(/\|/g) || []).length;

  if (tabCount > 0 && tabCount >= commaCount) return "\t";
  if (commaCount > 0) return ",";
  if (semiCount > 0) return ";";
  if (pipeCount > 0) return "|";
  return ",";
}

/**
 * Parse a single CSV/TSV line respecting double-quoted fields.
 * Does not handle escaped quotes inside quoted fields ("") –
 * that is acceptable for v0.1 processed feature tables.
 */
function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Compute SHA-256 hex checksum of file bytes.
 */
function computeChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Read a delimited table file with deterministic, fail-closed behaviour.
 *
 * Responsibilities:
 * - Read raw bytes and compute SHA-256 checksum
 * - Decode text with configurable encoding and fallbacks
 * - Auto-detect delimiter or accept explicit override
 * - Validate headers (non-empty, no duplicates)
 * - Parse rows into record objects
 * - Report malformed rows as errors, never throw
 *
 * Does NOT infer biological semantics from filenames.
 */
export function readTableFile(
  filePath: string,
  options: ReadTableOptions = {},
): ReadTableResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate options schema
  const optionsResult = ReadTableOptionsSchema.safeParse(options);
  if (!optionsResult.success) {
    for (const issue of optionsResult.error.issues) {
      errors.push(`options.${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      success: false,
      headers: [],
      rows: [],
      rowCount: 0,
      dataRowCount: 0,
      totalDataRowCount: 0,
      hasMore: false,
      nextOffset: null,
      checksumSha256: "0".repeat(64),
      delimiterUsed: ",",
      encodingUsed: "utf-8",
      errors,
      warnings,
    };
  }

  const opts = optionsResult.data;

  // Read file bytes
  let buffer: Buffer;
  try {
    if (opts.maxFileBytes !== undefined) {
      const stat = statSync(filePath);
      if (stat.size > opts.maxFileBytes) {
        errors.push(
          `File exceeds maximum allowed size: ${stat.size} bytes > ${opts.maxFileBytes} bytes`,
        );
        return {
          success: false,
          headers: [],
          rows: [],
          rowCount: 0,
          dataRowCount: 0,
          totalDataRowCount: 0,
          hasMore: false,
          nextOffset: null,
          checksumSha256: "0".repeat(64),
          delimiterUsed: opts.delimiter ?? ",",
          encodingUsed: opts.encoding,
          errors,
          warnings,
        };
      }
    }
    buffer = readFileSync(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to read file: ${message}`);
    return {
      success: false,
      headers: [],
      rows: [],
      rowCount: 0,
      dataRowCount: 0,
      totalDataRowCount: 0,
      hasMore: false,
      nextOffset: null,
      checksumSha256: "0".repeat(64),
      delimiterUsed: opts.delimiter ?? ",",
      encodingUsed: opts.encoding,
      errors,
      warnings,
    };
  }

  const checksumSha256 = computeChecksum(buffer);

  /**
   * Validate that a buffer is valid UTF-8 by round-tripping.
   * Node's Buffer.toString('utf8') silently replaces invalid bytes
   * with U+FFFD, so we must compare the re-encoded buffer.
   */
  function isValidUtf8(buf: Buffer): boolean {
    const decoded = buf.toString("utf8");
    const reencoded = Buffer.from(decoded, "utf8");
    return reencoded.equals(buf);
  }

  // Decode text with primary encoding + fallbacks
  let text: string;
  let encodingUsed: TableEncoding = opts.encoding;
  const encodingsToTry = [opts.encoding, ...opts.fallbackEncodings];

  let decodeError: string | null = null;
  for (const enc of encodingsToTry) {
    try {
      const candidate = buffer.toString(enc);
      if (enc === "utf-8" && !isValidUtf8(buffer)) {
        decodeError = "Invalid UTF-8 sequence detected";
        continue;
      }
      text = candidate;
      encodingUsed = enc;
      decodeError = null;
      break;
    } catch (err) {
      decodeError = err instanceof Error ? err.message : String(err);
    }
  }

  if (decodeError !== null || text! === undefined) {
    errors.push(`Failed to decode file: ${decodeError ?? "unknown error"}`);
    return {
      success: false,
      headers: [],
      rows: [],
      rowCount: 0,
      dataRowCount: 0,
      totalDataRowCount: 0,
      hasMore: false,
      nextOffset: null,
      checksumSha256,
      delimiterUsed: opts.delimiter ?? ",",
      encodingUsed: opts.encoding,
      errors,
      warnings,
    };
  }

  // Split into lines preserving empty lines for row counting, then filter
  // out trailing newline artifacts
  const allLines = text.split(/\r?\n/);

  // Remove trailing empty line caused by trailing newline
  if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
    allLines.pop();
  }

  const nonEmptyLines = allLines.filter((l) => l.trim().length > 0);
  if (allLines.length === 0 || nonEmptyLines.length === 0) {
    errors.push("File is empty: no header row found");
    return {
      success: false,
      headers: [],
      rows: [],
      rowCount: allLines.length,
      dataRowCount: 0,
      totalDataRowCount: 0,
      hasMore: false,
      nextOffset: null,
      checksumSha256,
      delimiterUsed: opts.delimiter ?? ",",
      encodingUsed,
      errors,
      warnings,
    };
  }

  // Determine delimiter
  const headerLine = allLines[opts.headerRowIndex];
  const delimiterUsed = opts.delimiter ?? detectDelimiter(headerLine);

  // Parse header
  const rawHeaders = parseLine(headerLine, delimiterUsed);
  const headers = rawHeaders.map((h) => h.trim());

  const emptyHeaders = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.length === 0);
  if (emptyHeaders.length > 0) {
    errors.push(
      `Empty header name(s) at column index(es): ${emptyHeaders.map(({ i }) => i).join(", ")}`,
    );
  }

  const headerSet = new Set<string>();
  const duplicateHeaders: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (headerSet.has(h)) {
      duplicateHeaders.push(i);
    } else {
      headerSet.add(h);
    }
  }
  if (duplicateHeaders.length > 0) {
    errors.push(
      `Duplicate header name(s) at column index(es): ${duplicateHeaders.join(", ")}`,
    );
  }

  // Parse data rows
  const parsedRows: Record<string, string>[] = [];
  let malformedRowCount = 0;

  for (let i = opts.headerRowIndex + 1; i < allLines.length; i++) {
    const line = allLines[i];

    if (line.trim().length === 0) {
      warnings.push(`Skipped empty row at line ${i + 1}`);
      continue;
    }

    const fields = parseLine(line, delimiterUsed);

    if (fields.length !== headers.length) {
      malformedRowCount++;
      errors.push(
        `Malformed row at line ${i + 1}: expected ${headers.length} columns, got ${fields.length}`,
      );
      continue;
    }

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = fields[j];
    }
    parsedRows.push(row);
  }

  const paginatedRows = opts.limit === undefined
    ? parsedRows.slice(opts.offset)
    : parsedRows.slice(opts.offset, opts.offset + opts.limit);
  const nextOffset = opts.offset + paginatedRows.length;
  const hasMore = nextOffset < parsedRows.length;

  const success = errors.length === 0;

  return {
    success,
    headers,
    rows: paginatedRows,
    rowCount: allLines.length,
    dataRowCount: paginatedRows.length,
    totalDataRowCount: parsedRows.length,
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
    checksumSha256,
    delimiterUsed,
    encodingUsed,
    errors,
    warnings,
  };
}
