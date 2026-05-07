import { z } from "zod";
import { readTableFile, ReadTableOptionsSchema } from "./csv_reader.js";
import { LongResponseRecordSchema } from "./wide_format.js";

/**
 * Row-level provenance for long-format canonicalisation.
 *
 * Captures parsing decisions and, when preserveExtensions is enabled,
 * additional columns from the source row under controlled extensions.
 */
export const LongFormatProvenanceSchema = z
  .object({
    sourceFile: z.string().min(1).describe("Source file path"),
    lineNumber: z.number().int().nonnegative().describe("1-based line number in source"),
    rawFeatureId: z.string().min(1).describe("Feature identifier as read from source"),
    rawSampleId: z.string().min(1).describe("Sample identifier as read from source"),
    parsedSuccessfully: z.boolean().describe("Whether the row was fully parsed"),
    parsingNotes: z
      .array(z.string())
      .default([])
      .describe("Notes about parsing decisions (e.g., NA -> null)"),
    extensions: z
      .record(z.string(), z.string())
      .optional()
      .describe("Additional non-required columns preserved from source row"),
  })
  .strict();

export type LongFormatProvenance = z.infer<typeof LongFormatProvenanceSchema>;

/**
 * Options for long-format canonicalisation.
 */
export const LongFormatOptionsSchema = z
  .object({
    tableId: z.string().min(1).describe("Stable table identifier"),
    featureIdColumn: z
      .string()
      .min(1)
      .default("feature_id")
      .describe("Column name for feature identifier"),
    sampleIdColumn: z
      .string()
      .min(1)
      .default("sample_id")
      .describe("Column name for sample identifier"),
    valueColumn: z
      .string()
      .min(1)
      .default("value")
      .describe("Column name for response value"),
    designSampleIds: z
      .array(z.string().min(1))
      .optional()
      .describe("Expected sample IDs from design for validation"),
    readTableOptions: ReadTableOptionsSchema.partial()
      .optional()
      .describe("Options passed to underlying table reader"),
    preserveExtensions: z
      .boolean()
      .default(true)
      .describe("Whether to preserve additional columns as extensions in provenance"),
  })
  .strict();

export type LongFormatOptions = z.input<typeof LongFormatOptionsSchema>;

/**
 * Result of long-format canonicalisation.
 */
export const LongFormatResultSchema = z
  .object({
    success: z.boolean(),
    tableId: z.string().min(1),
    records: z.array(LongResponseRecordSchema).describe("Canonical long-form records"),
    featureIds: z.array(z.string().min(1)).describe("Ordered feature identifiers"),
    sampleIds: z.array(z.string().min(1)).describe("Ordered sample identifiers"),
    provenance: z.array(LongFormatProvenanceSchema).describe("Row-level provenance trace"),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export type LongFormatResult = z.infer<typeof LongFormatResultSchema>;

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
 * Extract additional columns (extensions) from a row, excluding the
 * required feature, sample, and value columns.
 */
function extractExtensions(
  row: Record<string, string>,
  featureIdColumn: string,
  sampleIdColumn: string,
  valueColumn: string,
): Record<string, string> | undefined {
  const extensions: Record<string, string> = {};
  for (const [key, val] of Object.entries(row)) {
    if (key === featureIdColumn || key === sampleIdColumn || key === valueColumn) {
      continue;
    }
    extensions[key] = val;
  }
  return Object.keys(extensions).length > 0 ? extensions : undefined;
}

/**
 * Canonicalize long-format rows into {featureId, sampleId, responseValue} records.
 *
 * Responsibilities:
 * - Validate required columns exist (feature_id, sample_id, value)
 * - Require exactly one row per feature_id × sample_id (fail closed on duplicates)
 * - Validate numeric response values (fail closed on non-numeric)
 * - Validate sample IDs against design metadata when provided
 * - Preserve additional columns as extensions in provenance when enabled
 * - Emit EPI001 for schema/structural failures and EPI006 for duplicate keys
 */
export function canonicalizeLongRows(
  rows: Record<string, string>[],
  headers: string[],
  options: LongFormatOptions,
  sourceFilePath?: string,
): LongFormatResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const provenance: LongFormatProvenance[] = [];

  // Validate options
  const optionsResult = LongFormatOptionsSchema.safeParse(options);
  if (!optionsResult.success) {
    for (const issue of optionsResult.error.issues) {
      errors.push(`EPI001: options.${issue.path.join(".")}: ${issue.message}`);
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

  // Validate required columns exist
  const requiredCols = [opts.featureIdColumn, opts.sampleIdColumn, opts.valueColumn];
  const missingCols = requiredCols.filter((c) => !headers.includes(c));
  if (missingCols.length > 0) {
    errors.push(`EPI001: Missing required long-form column(s): ${missingCols.join(", ")}`);
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

  const records: { featureId: string; sampleId: string; responseValue: number | null }[] = [];
  const featureIdsOrdered: string[] = [];
  const sampleIdsOrdered: string[] = [];
  const featureIdsSeen = new Set<string>();
  const sampleIdsSet = new Set<string>();
  const keysSeen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = headerRowIndex + 1 + i + 1;

    const featureId = row[opts.featureIdColumn]?.trim();
    const sampleId = row[opts.sampleIdColumn]?.trim();
    const valueRaw = row[opts.valueColumn];

    if (!featureId) {
      errors.push(`EPI001: Row ${lineNumber}: missing ${opts.featureIdColumn}`);
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: "",
        rawSampleId: sampleId ?? "",
        parsedSuccessfully: false,
        parsingNotes: [`missing ${opts.featureIdColumn}`],
      });
      continue;
    }

    if (!sampleId) {
      errors.push(`EPI001: Row ${lineNumber}: missing ${opts.sampleIdColumn}`);
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: featureId,
        rawSampleId: "",
        parsedSuccessfully: false,
        parsingNotes: [`missing ${opts.sampleIdColumn}`],
      });
      continue;
    }

    const parsed = parseNumericValue(valueRaw);
    if (parsed.value === undefined) {
      errors.push(`EPI001: Row ${lineNumber}: ${parsed.note}`);
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: featureId,
        rawSampleId: sampleId,
        parsedSuccessfully: false,
        parsingNotes: [parsed.note ?? "non-numeric value"],
      });
      continue;
    }

    // Validate sample ID against design if provided
    if (opts.designSampleIds !== undefined && !opts.designSampleIds.includes(sampleId)) {
      warnings.push(
        `Row ${lineNumber}: sample_id '${sampleId}' not found in design; value retained`,
      );
    }

    // Detect duplicate feature_id × sample_id — fail closed
    const key = `${featureId}\t${sampleId}`;
    if (keysSeen.has(key)) {
      errors.push(
        `EPI006: Row ${lineNumber}: duplicate feature_id '${featureId}' + sample_id '${sampleId}'; exactly one row per combination required`,
      );
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: featureId,
        rawSampleId: sampleId,
        parsedSuccessfully: false,
        parsingNotes: ["duplicate feature_id + sample_id combination"],
      });
      continue;
    }
    keysSeen.add(key);

    if (!featureIdsSeen.has(featureId)) {
      featureIdsSeen.add(featureId);
      featureIdsOrdered.push(featureId);
    }

    if (!sampleIdsSet.has(sampleId)) {
      sampleIdsSet.add(sampleId);
      sampleIdsOrdered.push(sampleId);
    }

    records.push({
      featureId,
      sampleId,
      responseValue: parsed.value,
    });

    const notes: string[] = [];
    if (parsed.note) notes.push(parsed.note);

    const extensions = opts.preserveExtensions
      ? extractExtensions(row, opts.featureIdColumn, opts.sampleIdColumn, opts.valueColumn)
      : undefined;

    provenance.push({
      sourceFile: filePath,
      lineNumber,
      rawFeatureId: featureId,
      rawSampleId: sampleId,
      parsedSuccessfully: true,
      parsingNotes: notes,
      ...(extensions !== undefined ? { extensions } : {}),
    });
  }

  const success = errors.length === 0 && records.length > 0;

  return {
    success,
    tableId: opts.tableId,
    records,
    featureIds: featureIdsOrdered,
    sampleIds: sampleIdsOrdered,
    provenance,
    errors,
    warnings,
  };
}

/**
 * Read a long-format feature table file and canonicalize it into long records.
 *
 * This is the primary file-based entry point for long-format canonicalisation.
 */
export function canonicalizeLongFile(
  filePath: string,
  options: LongFormatOptions,
): LongFormatResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate options
  const optionsResult = LongFormatOptionsSchema.safeParse(options);
  if (!optionsResult.success) {
    for (const issue of optionsResult.error.issues) {
      errors.push(`EPI001: options.${issue.path.join(".")}: ${issue.message}`);
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

  // Delegate to row-based canonicalization
  const result = canonicalizeLongRows(
    tableResult.rows,
    tableResult.headers,
    opts,
    filePath,
  );

  return {
    ...result,
    errors: [...errors, ...result.errors],
    warnings: [...warnings, ...result.warnings],
  };
}
