import { z } from "zod";
import { readTableFile, ReadTableOptionsSchema } from "./csv_reader.js";
import { detectTableFormat, TableShapeSchema } from "./format_detection.js";
import type { FormatDetectionOptions } from "./format_detection.js";
import {
  EpigenomicFeatureSchema,
  EpigenomicFeatureMatrixSchema,
  FeatureClassSchema,
  ModalitySchema,
  SummaryResponseTableSchema,
} from "../contracts/features.js";
import type {
  EpigenomicFeature,
  EpigenomicFeatureMatrix,
  SummaryResponseTable,
} from "../contracts/features.js";
import { MeasurementSemanticsSchema } from "../contracts/measurement_semantics.js";
import { GenomeBuildSchema, CoordinateSystemSchema } from "../contracts/coordinates.js";
import type { GenomicRegion } from "../contracts/coordinates.js";

/**
 * Row-level provenance for traced feature parsing.
 */
export const RowProvenanceSchema = z
  .object({
    sourceFile: z.string().min(1).describe("Source file path"),
    lineNumber: z.number().int().nonnegative().describe("1-based line number in source"),
    rawFeatureId: z.string().min(1).describe("Feature identifier as read from source"),
    parsedSuccessfully: z.boolean().describe("Whether the row was fully parsed"),
    parsingNotes: z
      .array(z.string())
      .default([])
      .describe("Notes about parsing decisions (e.g., NA -> null)"),
  })
  .strict();

export type RowProvenance = z.infer<typeof RowProvenanceSchema>;

/**
 * Column mapping for coordinate-bearing features.
 */
export const CoordinateColumnMappingSchema = z
  .object({
    chrom: z.string().optional().describe("Chromosome column name"),
    start: z.string().optional().describe("Start coordinate column name"),
    end: z.string().optional().describe("End coordinate column name"),
    build: z.string().optional().describe("Genome build column name or literal value"),
    coordinateSystem: z
      .string()
      .optional()
      .describe("Coordinate system column name or literal value"),
  })
  .strict();

export type CoordinateColumnMapping = z.infer<typeof CoordinateColumnMappingSchema>;

/**
 * Options for feature table canonicalization.
 */
export const IngestFeatureTableOptionsObjectSchema = z
  .object({
    tableId: z.string().min(1).describe("Stable table identifier"),
    featureClass: FeatureClassSchema.describe("Feature class for all rows"),
    modality: ModalitySchema.describe("Assay modality"),
    signalMetric: MeasurementSemanticsSchema.describe("Measurement semantics"),
    declaredOtherDescription: z
      .string()
      .min(1)
      .optional()
      .describe("Required when signalMetric is declared_other"),
    explicitShape: TableShapeSchema.exclude(["ambiguous"])
      .optional()
      .describe("Override auto-detected table shape"),
    sampleIdColumns: z
      .array(z.string())
      .optional()
      .describe("Known sample column names for wide-matrix detection"),
    designSampleIds: z
      .array(z.string().min(1))
      .optional()
      .describe("Expected sample IDs from design for validation"),
    readTableOptions: ReadTableOptionsSchema.partial()
      .optional()
      .describe("Options passed to underlying table reader"),
    featureIdColumn: z
      .string()
      .min(1)
      .default("feature_id")
      .describe("Column name for feature identifier"),
    sampleIdColumn: z
      .string()
      .min(1)
      .default("sample_id")
      .describe("Column name for sample identifier in long form"),
    valueColumn: z
      .string()
      .min(1)
      .default("value")
      .describe("Column name for response value in long form"),
    coordinateColumns: CoordinateColumnMappingSchema.optional().describe(
      "Optional coordinate column mapping",
    ),
    genomeBuildLiteral: GenomeBuildSchema.optional().describe(
      "Literal genome build when not present as a column",
    ),
    coordinateSystemLiteral: CoordinateSystemSchema.optional().describe(
      "Literal coordinate system when not present as a column",
    ),
  })
  .strict();

export const IngestFeatureTableOptionsSchema =
  IngestFeatureTableOptionsObjectSchema
  .refine(
    (o) => {
      if (o.signalMetric === "declared_other") {
        return o.declaredOtherDescription !== undefined && o.declaredOtherDescription.length > 0;
      }
      return true;
    },
    {
      message: "declaredOtherDescription is required when signalMetric is 'declared_other'",
      path: ["declaredOtherDescription"],
    },
  );

export type IngestFeatureTableOptions = z.input<typeof IngestFeatureTableOptionsSchema>;

/**
 * Canonical result of feature table ingestion.
 */
export const FeatureTableCanonicalizationResultSchema = z
  .object({
    success: z.boolean(),
    kind: z.enum(["matrix", "summary", "none"]).describe("Kind of canonicalized output"),
    matrix: EpigenomicFeatureMatrixSchema.optional(),
    summary: SummaryResponseTableSchema.optional(),
    features: z.array(EpigenomicFeatureSchema).optional(),
    rowProvenance: z.array(RowProvenanceSchema).describe("Row-level provenance trace"),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export type FeatureTableCanonicalizationResult = z.infer<
  typeof FeatureTableCanonicalizationResultSchema
>;

/**
 * Parse a string value into a numeric value or null.
 * Supports common missing-value indicators.
 * Returns undefined for unparseable values (caller decides fail/continue).
 */
function parseNumericValue(
  value: string | undefined,
): { value: number | null | undefined; note?: string } {
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
    lower === "missing"
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
 * Build a GenomicRegion from row values and options.
 */
function buildGenomicRegion(
  row: Record<string, string>,
  opts: CoordinateColumnMapping | undefined,
  genomeBuildLiteral: string | undefined,
  coordinateSystemLiteral: string | undefined,
): GenomicRegion | undefined {
  if (!opts) return undefined;

  const chrom = opts.chrom ? row[opts.chrom]?.trim() : undefined;
  const startRaw = opts.start ? row[opts.start]?.trim() : undefined;
  const endRaw = opts.end ? row[opts.end]?.trim() : undefined;
  const build = opts.build ? row[opts.build]?.trim() : genomeBuildLiteral;
  const coordSystem = opts.coordinateSystem
    ? row[opts.coordinateSystem]?.trim()
    : coordinateSystemLiteral;

  if (!chrom || startRaw === undefined || endRaw === undefined || !build || !coordSystem) {
    return undefined;
  }

  const start = Number(startRaw);
  const end = Number(endRaw);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    return undefined;
  }

  const regionResult = z
    .object({
      chrom: z.string().min(1).regex(/^(chr[0-9XYM]+|[0-9XYM]+)$/),
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      build: GenomeBuildSchema,
      coordinateSystem: CoordinateSystemSchema,
    })
    .refine((r) => r.end > r.start, { message: "end must be greater than start", path: ["end"] })
    .safeParse({ chrom, start, end, build, coordinateSystem: coordSystem });

  if (!regionResult.success) {
    return undefined;
  }

  return regionResult.data;
}

/**
 * Canonicalize a long-form table into an EpigenomicFeatureMatrix and EpigenomicFeature array.
 */
function canonicalizeLongForm(
  rows: Record<string, string>[],
  headers: string[],
  filePath: string,
  headerRowIndex: number,
  options: IngestFeatureTableOptions,
): {
  matrix: EpigenomicFeatureMatrix;
  features: EpigenomicFeature[];
  provenance: RowProvenance[];
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const provenance: RowProvenance[] = [];

  const featureIdCol = options.featureIdColumn ?? "feature_id";
  const sampleIdCol = options.sampleIdColumn;
  const valueCol = options.valueColumn;

  // Validate required columns exist
  const requiredCols = [featureIdCol, sampleIdCol, valueCol];
  const missingCols = requiredCols.filter((c): c is string => typeof c === "string" && !headers.includes(c));
  if (missingCols.length > 0) {
    errors.push(`Missing required long-form column(s): ${missingCols.join(", ")}`);
    return {
      matrix: {
        matrixId: options.tableId,
        featureIds: [],
        sampleIds: [],
        longValues: [],
      },
      features: [],
      provenance,
      errors,
      warnings,
    };
  }

  const featureValues = new Map<string, Map<string, number | null>>();
  const featureRegions = new Map<string, GenomicRegion | undefined>();
  const featureIdentifiers = new Map<string, string | undefined>();
  const featureIdsOrdered: string[] = [];
  const sampleIdsOrdered: string[] = [];
  const sampleIdsSet = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = headerRowIndex + 1 + i + 1; // header line + data row offset

    const featureId = row[featureIdCol!]?.trim();
    const sampleId = row[sampleIdCol!]?.trim();
    const valueRaw = row[valueCol!];

    if (!featureId) {
      errors.push(`Row ${lineNumber}: missing feature_id`);
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: "",
        parsedSuccessfully: false,
        parsingNotes: ["missing feature_id"],
      });
      continue;
    }

    if (!sampleId) {
      errors.push(`Row ${lineNumber}: missing sample_id`);
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: featureId,
        parsedSuccessfully: false,
        parsingNotes: ["missing sample_id"],
      });
      continue;
    }

    const parsed = parseNumericValue(valueRaw);
    if (parsed.value === undefined) {
      errors.push(`Row ${lineNumber}: ${parsed.note}`);
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: featureId,
        parsedSuccessfully: false,
        parsingNotes: [parsed.note ?? "non-numeric value"],
      });
      continue;
    }

    // Validate sample ID against design if provided
    if (options.designSampleIds !== undefined && !options.designSampleIds.includes(sampleId)) {
      warnings.push(
        `Row ${lineNumber}: sample_id '${sampleId}' not found in design; value retained`,
      );
    }

    if (!featureValues.has(featureId)) {
      featureValues.set(featureId, new Map());
      featureIdsOrdered.push(featureId);
      featureRegions.set(
        featureId,
        buildGenomicRegion(
          row,
          options.coordinateColumns,
          options.genomeBuildLiteral,
          options.coordinateSystemLiteral,
        ),
      );
      // measuredIdentifier: use feature_id column as default, or look for probe_id/peak_id
      const altId =
        row["probe_id"]?.trim() || row["peak_id"]?.trim() || row["measured_identifier"]?.trim();
      featureIdentifiers.set(featureId, altId || undefined);
    }

    if (!sampleIdsSet.has(sampleId)) {
      sampleIdsSet.add(sampleId);
      sampleIdsOrdered.push(sampleId);
    }

    const featureMap = featureValues.get(featureId)!;
    if (featureMap.has(sampleId)) {
      warnings.push(
        `Row ${lineNumber}: duplicate feature_id '${featureId}' + sample_id '${sampleId}'; overwriting with latest value`,
      );
    }
    featureMap.set(sampleId, parsed.value);

    const notes: string[] = [];
    if (parsed.note) notes.push(parsed.note);

    provenance.push({
      sourceFile: filePath,
      lineNumber,
      rawFeatureId: featureId,
      parsedSuccessfully: true,
      parsingNotes: notes,
    });
  }

  // Build long values
  const longValues: { featureId: string; sampleId: string; value: number | null }[] = [];
  const features: EpigenomicFeature[] = [];

  for (const featureId of featureIdsOrdered) {
    const values: Record<string, number | null> = {};
    const featureMap = featureValues.get(featureId)!;
    for (const sampleId of sampleIdsOrdered) {
      const v = featureMap.get(sampleId);
      values[sampleId] = v !== undefined ? v : null;
      longValues.push({ featureId, sampleId, value: values[sampleId] });
    }

    const region = featureRegions.get(featureId);
    const measuredIdentifier = featureIdentifiers.get(featureId);

    const featurePayload: Record<string, unknown> = {
      featureId,
      featureClass: options.featureClass,
      modality: options.modality,
      signalMetric: options.signalMetric,
      values,
    };
    if (region !== undefined) {
      featurePayload.measuredRegion = region;
    }
    if (measuredIdentifier !== undefined) {
      featurePayload.measuredIdentifier = measuredIdentifier;
    } else if (region === undefined) {
      // Schema requires at least one of measuredRegion or measuredIdentifier
      featurePayload.measuredIdentifier = featureId;
    }
    if (options.declaredOtherDescription !== undefined) {
      featurePayload.declaredOtherDescription = options.declaredOtherDescription;
    }

    const parsed = EpigenomicFeatureSchema.safeParse(featurePayload);
    if (parsed.success) {
      features.push(parsed.data);
    } else {
      for (const issue of parsed.error.issues) {
        errors.push(`Feature '${featureId}': ${issue.path.join(".")}: ${issue.message}`);
      }
    }
  }

  const matrix: EpigenomicFeatureMatrix = {
    matrixId: options.tableId,
    featureIds: featureIdsOrdered,
    sampleIds: sampleIdsOrdered,
    longValues,
  };

  return { matrix, features, provenance, errors, warnings };
}

/**
 * Canonicalize a wide-form table into an EpigenomicFeatureMatrix and EpigenomicFeature array.
 */
function canonicalizeWideForm(
  rows: Record<string, string>[],
  headers: string[],
  filePath: string,
  headerRowIndex: number,
  options: IngestFeatureTableOptions,
  detectedSampleColumns: string[],
): {
  matrix: EpigenomicFeatureMatrix;
  features: EpigenomicFeature[];
  provenance: RowProvenance[];
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const provenance: RowProvenance[] = [];

  const featureIdCol = options.featureIdColumn ?? "feature_id";

  if (!headers.includes(featureIdCol!)) {
    errors.push(`Missing required wide-form column: ${featureIdCol}`);
    return {
      matrix: {
        matrixId: options.tableId,
        featureIds: [],
        sampleIds: [],
        wideValues: {},
      },
      features: [],
      provenance,
      errors,
      warnings,
    };
  }

  // An explicit sample-column declaration is authoritative. This prevents
  // numeric metadata such as POSITION, score, or q-value from being
  // misclassified as sample responses in public matrices and peak tables.
  const sampleCols =
    options.sampleIdColumns !== undefined &&
    options.sampleIdColumns.length > 0
      ? options.sampleIdColumns
      : detectedSampleColumns;

  if (sampleCols.length === 0) {
    errors.push("No sample columns identified for wide-form table");
    return {
      matrix: {
        matrixId: options.tableId,
        featureIds: [],
        sampleIds: [],
        wideValues: {},
      },
      features: [],
      provenance,
      errors,
      warnings,
    };
  }

  // Validate sample columns exist
  const missingSampleCols = sampleCols.filter((c) => !headers.includes(c));
  if (missingSampleCols.length > 0) {
    errors.push(`Sample column(s) not found in headers: ${missingSampleCols.join(", ")}`);
    return {
      matrix: {
        matrixId: options.tableId,
        featureIds: [],
        sampleIds: [],
        wideValues: {},
      },
      features: [],
      provenance,
      errors,
      warnings,
    };
  }

  // Validate sample IDs against design if provided
  if (options.designSampleIds !== undefined) {
    for (const sampleId of sampleCols) {
      if (!options.designSampleIds.includes(sampleId)) {
        warnings.push(
          `Wide-form sample column '${sampleId}' not found in design; values retained`,
        );
      }
    }
  }

  const wideValues: Record<string, Record<string, number | null>> = {};
  const features: EpigenomicFeature[] = [];
  const featureIdsOrdered: string[] = [];
  const featureIdsSeen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = headerRowIndex + 1 + i + 1;

    const featureId = row[featureIdCol!]?.trim();
    if (!featureId) {
      errors.push(`Row ${lineNumber}: missing feature_id`);
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: "",
        parsedSuccessfully: false,
        parsingNotes: ["missing feature_id"],
      });
      continue;
    }

    if (featureIdsSeen.has(featureId)) {
      warnings.push(
        `Row ${lineNumber}: duplicate feature_id '${featureId}'; overwriting with latest row`,
      );
    } else {
      featureIdsSeen.add(featureId);
      featureIdsOrdered.push(featureId);
    }

    const values: Record<string, number | null> = {};
    const parsingNotes: string[] = [];
    let hasNonNumeric = false;

    for (const sampleId of sampleCols) {
      const raw = row[sampleId];
      const parsed = parseNumericValue(raw);
      if (parsed.value === undefined) {
        errors.push(`Row ${lineNumber}, sample '${sampleId}': ${parsed.note}`);
        hasNonNumeric = true;
      } else {
        values[sampleId] = parsed.value;
        if (parsed.note) parsingNotes.push(`${sampleId}: ${parsed.note}`);
      }
    }

    if (hasNonNumeric) {
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: featureId,
        parsedSuccessfully: false,
        parsingNotes: ["one or more non-numeric sample values"],
      });
      continue;
    }

    wideValues[featureId] = values;

    const region = buildGenomicRegion(
      row,
      options.coordinateColumns,
      options.genomeBuildLiteral,
      options.coordinateSystemLiteral,
    );
    const altId =
      row["probe_id"]?.trim() || row["peak_id"]?.trim() || row["measured_identifier"]?.trim();

    const featurePayload: Record<string, unknown> = {
      featureId,
      featureClass: options.featureClass,
      modality: options.modality,
      signalMetric: options.signalMetric,
      values,
    };
    if (region !== undefined) {
      featurePayload.measuredRegion = region;
    }
    if (altId !== undefined && altId !== "") {
      featurePayload.measuredIdentifier = altId;
    } else if (region === undefined) {
      // Schema requires at least one of measuredRegion or measuredIdentifier
      featurePayload.measuredIdentifier = featureId;
    }
    if (options.declaredOtherDescription !== undefined) {
      featurePayload.declaredOtherDescription = options.declaredOtherDescription;
    }

    const parsed = EpigenomicFeatureSchema.safeParse(featurePayload);
    if (parsed.success) {
      features.push(parsed.data);
    } else {
      for (const issue of parsed.error.issues) {
        errors.push(`Feature '${featureId}': ${issue.path.join(".")}: ${issue.message}`);
      }
    }

    provenance.push({
      sourceFile: filePath,
      lineNumber,
      rawFeatureId: featureId,
      parsedSuccessfully: true,
      parsingNotes,
    });
  }

  const matrix: EpigenomicFeatureMatrix = {
    matrixId: options.tableId,
    featureIds: featureIdsOrdered,
    sampleIds: sampleCols,
    wideValues,
  };

  return { matrix, features, provenance, errors, warnings };
}

/**
 * Canonicalize a summary-form table into a SummaryResponseTable.
 */
function canonicalizeSummaryForm(
  rows: Record<string, string>[],
  headers: string[],
  filePath: string,
  headerRowIndex: number,
  options: IngestFeatureTableOptions,
  detectedSummaryColumns: string[],
): {
  summary: SummaryResponseTable;
  provenance: RowProvenance[];
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const provenance: RowProvenance[] = [];

  const featureIdCol = options.featureIdColumn ?? "feature_id";

  if (!headers.includes(featureIdCol)) {
    errors.push(`Missing required summary-form column: ${featureIdCol}`);
    return {
      summary: {
        tableId: options.tableId,
        featureIds: [],
        summaryRows: [],
        isPoDReady: false,
        podReadinessReason:
          "Summary tables lack per-sample dose-group numeric structure required for PoD modelling",
        detectedSummaryColumns,
      },
      provenance,
      errors,
      warnings,
    };
  }

  const summaryRows: SummaryResponseTable["summaryRows"] = [];
  const featureIdsOrdered: string[] = [];
  const featureIdsSeen = new Set<string>();

  // Normalised summary column names for extraction
  const norm = (s: string) => s.toLowerCase().replace(/[_\s-]/g, "");

  const hasCol = (indicator: string): string | undefined => {
    const n = norm(indicator);
    return headers.find((h) => norm(h) === n);
  };

  const groupCol = hasCol("group") || hasCol("group_id") || hasCol("groupid");
  const contrastCol = hasCol("contrast") || hasCol("comparison");
  const effectCol =
    hasCol("effect_size") || hasCol("effectsize") || hasCol("effect") || hasCol("logfc") || hasCol("log2fc") || hasCol("fold_change") || hasCol("foldchange") || hasCol("fc");
  const pvalCol = hasCol("p_value") || hasCol("pvalue") || hasCol("pval");
  const qvalCol = hasCol("q_value") || hasCol("qvalue") || hasCol("qval") || hasCol("fdr");
  const seCol = hasCol("se") || hasCol("std_error") || hasCol("standard_error") || hasCol("stderr");
  const ciLowerCol = hasCol("ci_lower") || hasCol("cilower") || hasCol("confint_low");
  const ciUpperCol = hasCol("ci_upper") || hasCol("ciupper") || hasCol("confint_high");
  const statCol = hasCol("statistic") || hasCol("stat") || hasCol("t_stat") || hasCol("tstat") || hasCol("z_score") || hasCol("zscore");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = headerRowIndex + 1 + i + 1;

    const featureId = row[featureIdCol!]?.trim();
    if (!featureId) {
      errors.push(`Row ${lineNumber}: missing feature_id`);
      provenance.push({
        sourceFile: filePath,
        lineNumber,
        rawFeatureId: "",
        parsedSuccessfully: false,
        parsingNotes: ["missing feature_id"],
      });
      continue;
    }

    if (featureIdsSeen.has(featureId)) {
      warnings.push(
        `Row ${lineNumber}: duplicate feature_id '${featureId}'; overwriting with latest row`,
      );
    } else {
      featureIdsSeen.add(featureId);
      featureIdsOrdered.push(featureId);
    }

    const parseOptNum = (raw: string | undefined): number | undefined => {
      if (raw === undefined || raw.trim() === "") return undefined;
      const parsed = Number(raw.trim());
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const rawValues: Record<string, string> = {};
    for (const col of detectedSummaryColumns) {
      if (row[col] !== undefined) rawValues[col] = row[col];
    }

    const summaryRow = {
      featureId,
      ...(groupCol && row[groupCol] !== undefined ? { groupId: row[groupCol].trim() } : {}),
      ...(contrastCol && row[contrastCol] !== undefined ? { contrast: row[contrastCol].trim() } : {}),
      ...(effectCol ? { effectSize: parseOptNum(row[effectCol]) } : {}),
      ...(pvalCol ? { pValue: parseOptNum(row[pvalCol]) } : {}),
      ...(qvalCol ? { qValue: parseOptNum(row[qvalCol]) } : {}),
      ...(effectCol ? { logFoldChange: parseOptNum(row[effectCol]) } : {}),
      ...(seCol ? { standardError: parseOptNum(row[seCol]) } : {}),
      ...(ciLowerCol ? { ciLower: parseOptNum(row[ciLowerCol]) } : {}),
      ...(ciUpperCol ? { ciUpper: parseOptNum(row[ciUpperCol]) } : {}),
      ...(statCol ? { statistic: parseOptNum(row[statCol]) } : {}),
      rawValues,
    };

    summaryRows.push(summaryRow);

    provenance.push({
      sourceFile: filePath,
      lineNumber,
      rawFeatureId: featureId,
      parsedSuccessfully: true,
      parsingNotes: ["summary row canonicalized"],
    });
  }

  const summary: SummaryResponseTable = {
    tableId: options.tableId,
    featureIds: featureIdsOrdered,
    summaryRows,
    isPoDReady: false,
    podReadinessReason:
      "Summary tables lack per-sample dose-group numeric structure required for PoD modelling",
    detectedSummaryColumns,
  };

  return { summary, provenance, errors, warnings };
}

/**
 * Canonicalize pre-parsed table rows into matrix or summary-response objects.
 *
 * Responsibilities:
 * - Detect or accept explicit table shape
 * - Canonicalize long / wide / summary tables
 * - Validate numeric values (fail closed on non-numeric)
 * - Validate sample IDs against design when provided
 * - Detect duplicate feature IDs
 * - Preserve row-level provenance
 * - Mark summary tables as NOT PoD-ready
 */
export function canonicalizeFeatureTableRows(
  rows: Record<string, string>[],
  headers: string[],
  options: IngestFeatureTableOptions,
  sourceFilePath?: string,
): FeatureTableCanonicalizationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate options schema
  const optionsResult = IngestFeatureTableOptionsSchema.safeParse(options);
  if (!optionsResult.success) {
    for (const issue of optionsResult.error.issues) {
      errors.push(`options.${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      success: false,
      kind: "none",
      rowProvenance: [],
      errors,
      warnings,
    };
  }

  const opts = optionsResult.data;

  // Detect table format
  const detectionOpts: FormatDetectionOptions = {
    explicitShape: opts.explicitShape,
    featureValueSemantics: opts.signalMetric,
    sampleIdColumns: opts.sampleIdColumns,
  };

  const formatResult = detectTableFormat(headers, detectionOpts);
  warnings.push(...formatResult.warnings);
  errors.push(...formatResult.errors);

  if (formatResult.shape === "ambiguous") {
    return {
      success: false,
      kind: "none",
      rowProvenance: [],
      errors,
      warnings,
    };
  }

  // The filePath is used for provenance; default to empty string for row-only canonicalization
  const filePath = sourceFilePath ?? "";
  const headerRowIndex = opts.readTableOptions?.headerRowIndex ?? 0;

  switch (formatResult.shape) {
    case "long": {
      const result = canonicalizeLongForm(
        rows,
        headers,
        filePath,
        headerRowIndex,
        opts,
      );
      const matrixValid =
        result.matrix.featureIds.length > 0 && result.matrix.sampleIds.length > 0;
      return {
        success: result.errors.length === 0 && matrixValid,
        kind: "matrix",
        matrix: result.matrix,
        features: result.features,
        rowProvenance: result.provenance,
        errors: [...errors, ...result.errors],
        warnings: [...warnings, ...result.warnings],
      };
    }
    case "wide": {
      const result = canonicalizeWideForm(
        rows,
        headers,
        filePath,
        headerRowIndex,
        opts,
        formatResult.detectedSampleColumns,
      );
      const matrixValid =
        result.matrix.featureIds.length > 0 && result.matrix.sampleIds.length > 0;
      return {
        success: result.errors.length === 0 && matrixValid,
        kind: "matrix",
        matrix: result.matrix,
        features: result.features,
        rowProvenance: result.provenance,
        errors: [...errors, ...result.errors],
        warnings: [...warnings, ...result.warnings],
      };
    }
    case "summary": {
      const result = canonicalizeSummaryForm(
        rows,
        headers,
        filePath,
        headerRowIndex,
        opts,
        formatResult.detectedSummaryColumns,
      );
      const summaryValid = result.summary.featureIds.length > 0;
      return {
        success: result.errors.length === 0 && summaryValid,
        kind: "summary",
        summary: result.summary,
        rowProvenance: result.provenance,
        errors: [...errors, ...result.errors],
        warnings: [...warnings, ...result.warnings],
      };
    }
    default: {
      // Exhaustive check – should never reach here because ambiguous is handled above
      errors.push(`Unhandled table shape: ${formatResult.shape}`);
      return {
        success: false,
        kind: "none",
        rowProvenance: [],
        errors,
        warnings,
      };
    }
  }
}

/**
 * Read a feature table file and canonicalize its contents.
 *
 * This is the primary entry point for file-based feature table ingestion.
 */
export function canonicalizeFeatureTable(
  filePath: string,
  options: IngestFeatureTableOptions,
): FeatureTableCanonicalizationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate options
  const optionsResult = IngestFeatureTableOptionsSchema.safeParse(options);
  if (!optionsResult.success) {
    for (const issue of optionsResult.error.issues) {
      errors.push(`options.${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      success: false,
      kind: "none",
      rowProvenance: [],
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
      kind: "none",
      rowProvenance: [],
      errors,
      warnings,
    };
  }

  warnings.push(...tableResult.warnings);

  if (tableResult.rows.length === 0) {
    errors.push("Feature table contains no data rows");
    return {
      success: false,
      kind: "none",
      rowProvenance: [],
      errors,
      warnings,
    };
  }

  // Delegate to row-based canonicalization, passing file path for provenance
  const result = canonicalizeFeatureTableRows(
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

/**
 * Ingest a processed epigenomic feature table.
 *
 * v0.1: backward-compatible wrapper that validates rows against the
 * EpigenomicFeature schema.  For full canonicalization, use
 * canonicalizeFeatureTable or canonicalizeFeatureTableRows.
 */
export function ingestFeatureTable(
  rows: unknown[],
  options?: IngestFeatureTableOptions,
): {
  features: EpigenomicFeature[];
  rowCount: number;
  parseErrors: string[];
} {
  // If no options provided, fall back to naive schema validation (legacy behaviour)
  if (options === undefined) {
    const features: EpigenomicFeature[] = [];
    const parseErrors: string[] = [];
    for (const row of rows) {
      const result = EpigenomicFeatureSchema.safeParse(row);
      if (result.success) {
        features.push(result.data);
      } else {
        for (const issue of result.error.issues) {
          parseErrors.push(`${issue.path.join(".")}: ${issue.message}`);
        }
      }
    }
    return { features, rowCount: rows.length, parseErrors };
  }

  // If options provided, attempt canonicalization from string records
  const stringRows = rows as Record<string, string>[];
  if (stringRows.length === 0) {
    return { features: [], rowCount: 0, parseErrors: [] };
  }

  const headers = Object.keys(stringRows[0]);
  const result = canonicalizeFeatureTableRows(stringRows, headers, options);
  return {
    features: result.features ?? [],
    rowCount: rows.length,
    parseErrors: result.errors,
  };
}
