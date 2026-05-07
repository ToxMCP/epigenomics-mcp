import { z } from "zod";
import { readTableFile, ReadTableOptionsSchema } from "./csv_reader.js";
import { detectTableFormat } from "./format_detection.js";
import type { FormatDetectionOptions } from "./format_detection.js";

/**
 * A single canonical long-response record produced by melting a wide matrix.
 */
export const LongResponseRecordSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    sampleId: z.string().min(1).describe("Sample identifier"),
    responseValue: z.number().or(z.null()).describe("Numeric response or null for missing"),
  })
  .strict();

export type LongResponseRecord = z.infer<typeof LongResponseRecordSchema>;

/**
 * Row-level provenance for wide-to-long canonicalisation.
 */
export const WideToLongProvenanceSchema = z
  .object({
    sourceFile: z.string().min(1).describe("Source file path"),
    lineNumber: z.number().int().nonnegative().describe("1-based line number in source"),
    rawFeatureId: z.string().min(1).describe("Feature identifier as read from source"),
    sourceColumnNames: z
      .array(z.string().min(1))
      .describe("Original sample column names that contributed to this row's melting"),
    parsedSuccessfully: z.boolean().describe("Whether the row was fully parsed"),
    parsingNotes: z
      .array(z.string())
      .default([])
      .describe("Notes about parsing decisions"),
  })
  .strict();

export type WideToLongProvenance = z.infer<typeof WideToLongProvenanceSchema>;

/**
 * Options for wide-to-long canonicalisation.
 */
export const WideToLongOptionsSchema = z
  .object({
    tableId: z.string().min(1).describe("Stable table identifier"),
    featureIdColumn: z
      .string()
      .min(1)
      .default("feature_id")
      .describe("Column name for feature identifier"),
    sampleColumns: z
      .array(z.string().min(1))
      .optional()
      .describe("Explicit sample column names to melt; auto-detected if omitted"),
    designSampleIds: z
      .array(z.string().min(1))
      .optional()
      .describe("Expected sample IDs from design for validation"),
    readTableOptions: ReadTableOptionsSchema.partial()
      .optional()
      .describe("Options passed to underlying table reader"),
  })
  .strict();

export type WideToLongOptions = z.input<typeof WideToLongOptionsSchema>;

/**
 * Result of wide-to-long canonicalisation.
 */
export const WideToLongResultSchema = z
  .object({
    success: z.boolean(),
    tableId: z.string().min(1),
    records: z.array(LongResponseRecordSchema).describe("Canonical long-form records"),
    featureIds: z.array(z.string().min(1)).describe("Ordered feature identifiers"),
    sampleIds: z.array(z.string().min(1)).describe("Ordered sample identifiers"),
    provenance: z.array(WideToLongProvenanceSchema).describe("Row-level provenance trace"),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export type WideToLongResult = z.infer<typeof WideToLongResultSchema>;

/**
 * Parse a string value into a numeric value or null.
 * Supports common missing-value indicators.
 * Returns undefined for unparseable values (fail closed).
 */
function parseNumericValue(value: string | undefined): { value: number | null | undefined; note?: string } {
  if (value === undefined || value.trim() === "") {
    return { value: null, note: "empty value treated as null" };
  }
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === "na" ||
    lower === "n/a" ||
    lower === "nan" ||
    lower === "null" ||
    lower === "none" ||
    lower === "missing" ||
    lower === "inf" ||
    lower === "-inf" ||
    lower === "infinity" ||
    lower === "-infinity"
  ) {
    return { value: null, note: `${trimmed} treated as null` };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: undefined, note: `non-numeric value '${trimmed}'` };
  }
  return { value: parsed };
}

/**
 * Detect sample columns from headers when not explicitly provided.
 *
 * Uses the same heuristic as format_detection.ts: exclude known metadata
 * columns and treat the remainder as sample IDs.
 */
function detectSampleColumns(headers: string[], featureIdColumn: string): string[] {
  const metadataIndicators = new Set([
    "feature_id",
    "featureid",
    "feature",
    "probe_id",
    "probeid",
    "cpg_id",
    "cpgid",
    "peak_id",
    "peakid",
    "region_id",
    "regionid",
    "chr",
    "chrom",
    "chromosome",
    "seqnames",
    "start",
    "end",
    "strand",
    "width",
    "gene",
    "gene_id",
    "geneid",
    "symbol",
    "annotation",
    "type",
    "context",
    "build",
    "genome",
  ]);

  const normalise = (s: string) => s.toLowerCase().replace(/[_\s-]/g, "").trim();

  return headers.filter((h) => {
    const norm = normalise(h);
    if (norm === normalise(featureIdColumn)) return false;
    if (metadataIndicators.has(norm)) return false;
    return true;
  });
}

/**
 * Melt a wide-format matrix into canonical long response records.
 *
 * Responsibilities:
 * - Melt sample columns into {featureId, sampleId, responseValue} records
 * - Validate all sample columns are present in design metadata when design is supplied
 * - Preserve source column names and row provenance
 * - Detect duplicate feature IDs
 * - Fail closed on non-numeric values
 */
export function meltWideToLong(
  rows: Record<string, string>[],
  headers: string[],
  options: WideToLongOptions,
  sourceFilePath?: string,
): WideToLongResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const provenance: WideToLongProvenance[] = [];

  // Validate options
  const optionsResult = WideToLongOptionsSchema.safeParse(options);
  if (!optionsResult.success) {
    for (const issue of optionsResult.error.issues) {
      errors.push(`options.${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      success: false,
      tableId: options.tableId ?? "",
      records: [],
      featureIds: [],
      sampleIds: [],
      provenance,
      errors,
      warnings,
    };
  }

  const opts = optionsResult.data;
  const filePath = sourceFilePath ?? "<inline>";
  const headerRowIndex = opts.readTableOptions?.headerRowIndex ?? 0;

  // Validate feature_id column exists
  if (!headers.includes(opts.featureIdColumn)) {
    errors.push(`Missing required feature column: ${opts.featureIdColumn}`);
    return {
      success: false,
      tableId: opts.tableId,
      records: [],
      featureIds: [],
      sampleIds: [],
      provenance,
      errors,
      warnings,
    };
  }

  // Determine sample columns
  const sampleCols =
    opts.sampleColumns && opts.sampleColumns.length > 0
      ? opts.sampleColumns
      : detectSampleColumns(headers, opts.featureIdColumn);

  if (sampleCols.length === 0) {
    errors.push("No sample columns identified for wide-form table");
    return {
      success: false,
      tableId: opts.tableId,
      records: [],
      featureIds: [],
      sampleIds: [],
      provenance,
      errors,
      warnings,
    };
  }

  // Validate sample columns exist in headers
  const missingSampleCols = sampleCols.filter((c) => !headers.includes(c));
  if (missingSampleCols.length > 0) {
    errors.push(`Sample column(s) not found in headers: ${missingSampleCols.join(", ")}`);
    return {
      success: false,
      tableId: opts.tableId,
      records: [],
      featureIds: [],
      sampleIds: [],
      provenance,
      errors,
      warnings,
    };
  }

  // Validate sample IDs against design if provided
  if (opts.designSampleIds !== undefined) {
    for (const sampleId of sampleCols) {
      if (!opts.designSampleIds.includes(sampleId)) {
        warnings.push(
          `Wide-form sample column '${sampleId}' not found in design; values retained`,
        );
      }
    }
  }

  const records: LongResponseRecord[] = [];
  const featureIdsOrdered: string[] = [];
  const featureIdsSeen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = headerRowIndex + 1 + i + 1;

    const featureId = row[opts.featureIdColumn]?.trim();
    if (!featureId) {
      errors.push(`Row ${lineNumber}: missing ${opts.featureIdColumn}`);
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: "",
        sourceColumnNames: sampleCols,
        parsedSuccessfully: false,
        parsingNotes: [`missing ${opts.featureIdColumn}`],
      });
      continue;
    }

    if (featureIdsSeen.has(featureId)) {
      warnings.push(
        `Row ${lineNumber}: duplicate feature_id '${featureId}'; overwriting with latest row`,
      );
      // Remove existing records for this feature so only the latest row remains
      for (let r = records.length - 1; r >= 0; r--) {
        if (records[r].featureId === featureId) {
          records.splice(r, 1);
        }
      }
    } else {
      featureIdsSeen.add(featureId);
      featureIdsOrdered.push(featureId);
    }

    const parsingNotes: string[] = [];
    let hasNonNumeric = false;
    let rowRecordsCreated = 0;

    for (const sampleId of sampleCols) {
      const raw = row[sampleId];
      const parsed = parseNumericValue(raw);
      if (parsed.value === undefined) {
        errors.push(`Row ${lineNumber}, sample '${sampleId}': ${parsed.note}`);
        hasNonNumeric = true;
      } else {
        records.push({
          featureId,
          sampleId,
          responseValue: parsed.value,
        });
        rowRecordsCreated++;
        if (parsed.note) parsingNotes.push(`${sampleId}: ${parsed.note}`);
      }
    }

    if (hasNonNumeric) {
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: featureId,
        sourceColumnNames: sampleCols,
        parsedSuccessfully: false,
        parsingNotes: ["one or more non-numeric sample values"],
      });
      continue;
    }

    provenance.push({
      sourceFile: filePath,
      lineNumber,
      rawFeatureId: featureId,
      sourceColumnNames: sampleCols,
      parsedSuccessfully: true,
      parsingNotes: parsingNotes.length > 0 ? parsingNotes : ["melted successfully"],
    });
  }

  const success = errors.length === 0 && records.length > 0;

  return {
    success,
    tableId: opts.tableId,
    records,
    featureIds: featureIdsOrdered,
    sampleIds: sampleCols,
    provenance,
    errors,
    warnings,
  };
}

/**
 * Read a wide-format feature table file and canonicalize it into long records.
 *
 * This is the primary file-based entry point for wide-to-long canonicalisation.
 */
export function canonicalizeWideFileToLong(
  filePath: string,
  options: WideToLongOptions,
): WideToLongResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate options
  const optionsResult = WideToLongOptionsSchema.safeParse(options);
  if (!optionsResult.success) {
    for (const issue of optionsResult.error.issues) {
      errors.push(`options.${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      success: false,
      tableId: options.tableId ?? "",
      records: [],
      featureIds: [],
      sampleIds: [],
      provenance: [],
      errors,
      warnings,
    };
  }

  const opts = optionsResult.data;

  // Read the table file
  const tableResult = readTableFile(filePath, opts.readTableOptions ?? {});
  if (!tableResult.success) {
    errors.push(...tableResult.errors);
    warnings.push(...tableResult.warnings);
    return {
      success: false,
      tableId: opts.tableId,
      records: [],
      featureIds: [],
      sampleIds: [],
      provenance: [],
      errors,
      warnings,
    };
  }

  warnings.push(...tableResult.warnings);

  if (tableResult.rows.length === 0) {
    errors.push("Feature table contains no data rows");
    return {
      success: false,
      tableId: opts.tableId,
      records: [],
      featureIds: [],
      sampleIds: [],
      provenance: [],
      errors,
      warnings,
    };
  }

  // Auto-detect sample columns if not explicitly provided
  let sampleColumns = opts.sampleColumns;
  if (!sampleColumns || sampleColumns.length === 0) {
    const detectionOpts: FormatDetectionOptions = {
      featureValueSemantics: "beta_value", // placeholder; not used for wide detection here
      sampleIdColumns: undefined,
    };
    const formatResult = detectTableFormat(tableResult.headers, detectionOpts);
    if (formatResult.detectedSampleColumns.length > 0) {
      sampleColumns = formatResult.detectedSampleColumns;
    }
  }

  // Delegate to row-based melting
  const result = meltWideToLong(
    tableResult.rows,
    tableResult.headers,
    { ...opts, sampleColumns },
    filePath,
  );

  return {
    ...result,
    errors: [...errors, ...result.errors],
    warnings: [...warnings, ...result.warnings],
  };
}
