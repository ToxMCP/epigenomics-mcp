import { z } from "zod";
import { FeatureClassSchema } from "../contracts/features.js";
import type { FeatureClass } from "../contracts/features.js";

/**
 * Policy for handling tables that contain multiple feature classes.
 *
 * - split: partition rows into homogenous groups by detected class
 * - block: reject the entire table; do not proceed with ingestion
 * - review_required: allow ingestion but flag for human review
 */
export const MixedFeatureHandlingPolicySchema = z.enum([
  "split",
  "block",
  "review_required",
]);

export type MixedFeatureHandlingPolicy = z.infer<
  typeof MixedFeatureHandlingPolicySchema
>;

/**
 * Per-row detected feature class, including sentinel values for
 * ambiguous or unclassifiable rows.
 */
export const PerRowFeatureClassSchema = z.enum([
  "cpg_methylation",
  "dmr",
  "differential_methylated_region",
  "atac_peak",
  "histone_mark_peak",
  "chip_peak_narrow",
  "chip_peak_broad",
  "generic_region_feature",
  "chromatin_interaction",
  "mirna_expression",
  "ncrna_expression",
  "unknown",
  "ambiguous",
]);

export type PerRowFeatureClass = z.infer<typeof PerRowFeatureClassSchema>;

/**
 * Configuration for mixed-feature detection and handling.
 */
export const MixedFeatureDetectionConfigSchema = z
  .object({
    policy: MixedFeatureHandlingPolicySchema.default("review_required"),
    allowMethylationMixedClasses: z
      .boolean()
      .default(false)
      .describe(
        "If true, mixed CpG/DMR tables are allowed when policy is split or review_required",
      ),
    allowRegionMixedClasses: z
      .boolean()
      .default(false)
      .describe(
        "If true, mixed ATAC/histone/generic tables are allowed when policy is split or review_required",
      ),
    explicitFeatureClass: FeatureClassSchema.optional().describe(
      "Override per-row heuristics and assign this class to all rows",
    ),
  })
  .strict();

export type MixedFeatureDetectionConfig = z.infer<
  typeof MixedFeatureDetectionConfigSchema
>;

/**
 * Classification result for a single raw row.
 */
export const RowClassificationResultSchema = z
  .object({
    rowIndex: z.number().int().nonnegative(),
    detectedClass: PerRowFeatureClassSchema,
    reason: z.string().min(1),
  })
  .strict();

export type RowClassificationResult = z.infer<
  typeof RowClassificationResultSchema
>;

/**
 * Canonical result of mixed-feature analysis.
 */
export const MixedFeatureAnalysisResultSchema = z
  .object({
    isMixed: z.boolean().describe("Whether multiple non-unknown classes were detected"),
    isBlocked: z.boolean().describe("Whether the table is blocked by policy"),
    dominantClass: PerRowFeatureClassSchema.optional().describe(
      "Most frequent class if one exists",
    ),
    detectedClasses: z
      .array(PerRowFeatureClassSchema)
      .describe("Ordered list of unique classes detected"),
    classCounts: z
      .record(z.string(), z.number().int().nonnegative())
      .describe("Count of rows per detected class"),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    rowClassifications: z.array(RowClassificationResultSchema),
    splitRowGroups: z
      .record(z.string(), z.array(z.record(z.string(), z.string())))
      .describe("Rows partitioned by detected class (deterministic ordering)"),
  })
  .strict();

export type MixedFeatureAnalysisResult = z.infer<
  typeof MixedFeatureAnalysisResultSchema
>;

// ---------------------------------------------------------------------------
// Column name normalisation
// ---------------------------------------------------------------------------

function normaliseColumnName(name: string): string {
  return name.toLowerCase().replace(/[_\s-]/g, "").trim();
}

// ---------------------------------------------------------------------------
// Row-level classification helpers
// ---------------------------------------------------------------------------

const STRONG_PROBE_INDICATORS = new Set([
  "probe_id",
  "probeid",
  "cpg_id",
  "cpgid",
  "cg_id",
  "cgid",
  "probe",
]);

// Weak probe indicators are deliberately excluded from mixed-feature
// per-row detection because they are too generic (e.g., "feature_id"
// appears in almost every table) and would cause false-positive CpG
// classifications.  Only strong indicators are used.

const CHROMOSOME_INDICATORS = new Set([
  "chr",
  "chrom",
  "chromosome",
  "seqnames",
]);

const PEAK_FORMAT_INDICATORS = new Set([
  "peak_format",
  "peakformat",
  "format",
  "caller",
  "peakcaller",
]);

const MARK_NAME_INDICATORS = new Set([
  "mark",
  "mark_name",
  "markname",
  "histone_mark",
  "histonemark",
  "antibody",
]);

interface ClassifiedColumns {
  probeCol: string | undefined;
  chromCol: string | undefined;
  startCol: string | undefined;
  endCol: string | undefined;
  peakFormatCol: string | undefined;
  markCol: string | undefined;
}

function resolveClassificationColumns(headers: string[]): ClassifiedColumns {
  const normalised = headers.map((h) => normaliseColumnName(h));

  let probeCol: string | undefined;
  for (let i = 0; i < headers.length; i++) {
    if (STRONG_PROBE_INDICATORS.has(normalised[i])) {
      probeCol = headers[i];
      break;
    }
  }
  // Weak indicators intentionally not used — see note above.

  let chromCol: string | undefined;
  for (let i = 0; i < headers.length; i++) {
    if (CHROMOSOME_INDICATORS.has(normalised[i])) {
      chromCol = headers[i];
      break;
    }
  }

  const startCol = headers.find((_, i) => normalised[i] === "start");
  const endCol = headers.find((_, i) => normalised[i] === "end");

  let peakFormatCol: string | undefined;
  for (let i = 0; i < headers.length; i++) {
    if (PEAK_FORMAT_INDICATORS.has(normalised[i])) {
      peakFormatCol = headers[i];
      break;
    }
  }

  let markCol: string | undefined;
  for (let i = 0; i < headers.length; i++) {
    if (MARK_NAME_INDICATORS.has(normalised[i])) {
      markCol = headers[i];
      break;
    }
  }

  return { probeCol, chromCol, startCol, endCol, peakFormatCol, markCol };
}

function hasCellValue(row: Record<string, string>, col: string | undefined): boolean {
  if (col === undefined) return false;
  const val = row[col];
  return val !== undefined && val.trim() !== "";
}

/**
 * Classify a single raw row into a per-row feature class.
 *
 * Fail-closed:
 * - Rows with both methylation AND region indicators are "ambiguous".
 * - Rows with both ATAC AND histone indicators are "ambiguous".
 * - Rows with no indicators are "unknown".
 */
function classifyRow(
  row: Record<string, string>,
  cols: ClassifiedColumns,
  assayFamily: string,
  modality: string,
): PerRowFeatureClass {
  const hasProbe = hasCellValue(row, cols.probeCol);
  const hasRegion =
    hasCellValue(row, cols.chromCol) &&
    hasCellValue(row, cols.startCol) &&
    hasCellValue(row, cols.endCol);
  const hasPeakFormat = hasCellValue(row, cols.peakFormatCol);
  const hasMark = hasCellValue(row, cols.markCol);

  // Methylation family
  if (assayFamily === "dna_methylation") {
    if (hasProbe && hasRegion) return "ambiguous";
    if (hasProbe) return "cpg_methylation";
    if (hasRegion) return "dmr";
    return "unknown";
  }

  // Region-level families (ATAC, ChIP, Hi-C, generic)
  if (hasPeakFormat && hasMark) return "ambiguous";
  if (hasPeakFormat) return "atac_peak";
  if (hasMark) return "histone_mark_peak";

  if (hasRegion) {
    if (modality === "hic") return "chromatin_interaction";
    // When no specialised indicators are present but coordinates exist,
    // classify as generic_region_feature rather than silently guessing.
    return "generic_region_feature";
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Mapping between per-row class and canonical FeatureClass
// ---------------------------------------------------------------------------

const PER_ROW_TO_FEATURE_CLASS: Record<PerRowFeatureClass, FeatureClass | undefined> = {
  cpg_methylation: "cpg_methylation",
  dmr: "dmr",
  differential_methylated_region: "differential_methylated_region",
  atac_peak: "atac_peak",
  histone_mark_peak: "histone_mark_peak",
  chip_peak_narrow: "chip_peak_narrow",
  chip_peak_broad: "chip_peak_broad",
  generic_region_feature: "generic_region_feature",
  chromatin_interaction: "chromatin_interaction",
  mirna_expression: "mirna_expression",
  ncrna_expression: "ncrna_expression",
  unknown: undefined,
  ambiguous: undefined,
};

/**
 * Map a per-row detected class to the canonical FeatureClass enum value.
 * Returns undefined for unknown/ambiguous.
 */
export function perRowClassToFeatureClass(
  perRowClass: PerRowFeatureClass,
): FeatureClass | undefined {
  return PER_ROW_TO_FEATURE_CLASS[perRowClass];
}

// ---------------------------------------------------------------------------
// Deterministic ordering helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic ordering for PerRowFeatureClass values.
 */
const CLASS_ORDINAL: Record<PerRowFeatureClass, number> = {
  cpg_methylation: 0,
  dmr: 1,
  differential_methylated_region: 2,
  atac_peak: 3,
  histone_mark_peak: 4,
  chip_peak_narrow: 5,
  chip_peak_broad: 6,
  generic_region_feature: 7,
  chromatin_interaction: 8,
  mirna_expression: 9,
  ncrna_expression: 10,
  unknown: 11,
  ambiguous: 12,
};

function sortClassesDeterministic(classes: PerRowFeatureClass[]): PerRowFeatureClass[] {
  return [...classes].sort((a, b) => CLASS_ORDINAL[a] - CLASS_ORDINAL[b]);
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

/**
 * Analyse a raw table for mixed or ambiguous feature classes.
 *
 * Responsibilities:
 * - Inspect every row and detect its most likely feature class.
 * - Flag ambiguous rows (rows that carry conflicting indicators).
 * - Flag unknown rows (rows that carry no recognised indicators).
 * - If multiple non-unknown classes are present, mark the table as mixed.
 * - Apply the configured policy (split, block, review_required).
 * - Never silently relabel ambiguous or unknown rows.
 *
 * Deterministic guarantees:
 * - Row order is preserved within each split group.
 * - detectedClasses is sorted by a stable ordinal.
 * - Warnings and errors are emitted in row-index order.
 */
export function analyzeMixedFeatures(
  rows: Record<string, string>[],
  headers: string[],
  assayFamily: string,
  modality: string,
  config: z.input<typeof MixedFeatureDetectionConfigSchema> = {},
): MixedFeatureAnalysisResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate config
  const configResult = MixedFeatureDetectionConfigSchema.safeParse(config);
  if (!configResult.success) {
    for (const issue of configResult.error.issues) {
      errors.push(`config.${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      isMixed: false,
      isBlocked: true,
      detectedClasses: [],
      classCounts: {},
      warnings,
      errors,
      rowClassifications: [],
      splitRowGroups: {},
    };
  }
  const cfg = configResult.data;

  // Explicit override short-circuit
  if (cfg.explicitFeatureClass !== undefined) {
    const overrideClass = cfg.explicitFeatureClass as PerRowFeatureClass;
    const allRows = [...rows];
    const rowClassifications: RowClassificationResult[] = rows.map((_, idx) => ({
      rowIndex: idx,
      detectedClass: overrideClass,
      reason: `explicitFeatureClass override: ${cfg.explicitFeatureClass}`,
    }));
    return {
      isMixed: false,
      isBlocked: false,
      dominantClass: overrideClass,
      detectedClasses: [overrideClass],
      classCounts: { [overrideClass]: rows.length },
      warnings,
      errors,
      rowClassifications,
      splitRowGroups: { [overrideClass]: allRows },
    };
  }

  const cols = resolveClassificationColumns(headers);
  const rowClassifications: RowClassificationResult[] = [];
  const classCounts: Record<string, number> = {};

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const detectedClass = classifyRow(row, cols, assayFamily, modality);
    let reason: string;

    switch (detectedClass) {
      case "cpg_methylation":
        reason = `Row ${rowIdx}: probe_id/CpG identifier detected without region interval`;
        break;
      case "dmr":
        reason = `Row ${rowIdx}: region interval detected without probe_id/CpG identifier`;
        break;
      case "atac_peak":
        reason = `Row ${rowIdx}: peak_format indicator detected`;
        break;
      case "histone_mark_peak":
        reason = `Row ${rowIdx}: histone mark indicator detected`;
        break;
      case "generic_region_feature":
        reason = `Row ${rowIdx}: coordinate interval detected without specialised assay indicators`;
        break;
      case "chromatin_interaction":
        reason = `Row ${rowIdx}: Hi-C modality with coordinate interval`;
        break;
      case "ambiguous":
        reason = `Row ${rowIdx}: conflicting feature-class indicators detected`;
        break;
      case "unknown":
        reason = `Row ${rowIdx}: no recognised feature-class indicators`;
        break;
      default:
        reason = `Row ${rowIdx}: unhandled classification path`;
    }

    rowClassifications.push({ rowIndex: rowIdx, detectedClass, reason });
    classCounts[detectedClass] = (classCounts[detectedClass] ?? 0) + 1;

    if (detectedClass === "ambiguous") {
      errors.push(reason);
    } else if (detectedClass === "unknown") {
      warnings.push(reason);
    }
  }

  // Determine unique non-unknown classes
  const nonUnknownClasses = sortClassesDeterministic(
    rowClassifications
      .map((r) => r.detectedClass)
      .filter((c) => c !== "unknown" && c !== "ambiguous") as PerRowFeatureClass[],
  );
  const uniqueNonUnknown = Array.from(new Set(nonUnknownClasses));

  const isMixed = uniqueNonUnknown.length > 1;

  // Determine dominant class
  let dominantClass: PerRowFeatureClass | undefined;
  let maxCount = -1;
  for (const cls of uniqueNonUnknown) {
    const count = classCounts[cls] ?? 0;
    if (count > maxCount) {
      maxCount = count;
      dominantClass = cls;
    }
  }

  // Policy application
  let isBlocked = false;

  if (isMixed) {
    const classList = uniqueNonUnknown.join(", ");
    const mixedMsg = `Mixed feature classes detected: ${classList}. ${rows.length} rows analysed.`;

    if (cfg.policy === "block") {
      isBlocked = true;
      errors.push(mixedMsg);
      errors.push(
        "Table blocked by mixed-feature policy: block. Split the table manually or provide explicitFeatureClass.",
      );
    } else if (cfg.policy === "review_required") {
      warnings.push(mixedMsg);
      warnings.push(
        "Mixed-feature policy is review_required: downstream use requires human review before PoD modelling.",
      );

      // Additional family-specific checks
      if (
        assayFamily === "dna_methylation" &&
        !cfg.allowMethylationMixedClasses
      ) {
        warnings.push(
          "Methylation family mixed-class detection: CpG and DMR rows in the same table. Verify that this is intentional.",
        );
      }
      if (
        (assayFamily === "chromatin_accessibility" ||
          assayFamily === "histone_modification" ||
          assayFamily === "chip_seq") &&
        !cfg.allowRegionMixedClasses
      ) {
        warnings.push(
          "Region-level mixed-class detection: ATAC and histone indicators found in the same table. Verify that this is intentional.",
        );
      }
    } else if (cfg.policy === "split") {
      warnings.push(mixedMsg);
      warnings.push(
        "Mixed-feature policy is split: rows have been partitioned into homogenous groups by detected class.",
      );
    }
  }

  // Build deterministic split groups
  const splitRowGroups: Record<string, Record<string, string>[]> = {};
  if (!isBlocked) {
    for (const cls of uniqueNonUnknown) {
      splitRowGroups[cls] = [];
    }
    // Also collect unknown rows if any dominant class exists; they are kept
    // separate so callers can decide whether to drop or review them.
    if (classCounts["unknown"] ?? 0 > 0) {
      splitRowGroups["unknown"] = [];
    }
    if (classCounts["ambiguous"] ?? 0 > 0) {
      splitRowGroups["ambiguous"] = [];
    }

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const cls = rowClassifications[rowIdx].detectedClass;
      if (splitRowGroups[cls] !== undefined) {
        splitRowGroups[cls].push(rows[rowIdx]);
      }
    }
  }

  return {
    isMixed,
    isBlocked,
    dominantClass,
    detectedClasses: uniqueNonUnknown,
    classCounts,
    warnings,
    errors,
    rowClassifications,
    splitRowGroups,
  };
}

// ---------------------------------------------------------------------------
// Convenience: build canonical feature matrices from split groups
// ---------------------------------------------------------------------------

/**
 * Options for building matrices from split row groups.
 */
export const SplitMatrixBuildOptionsSchema = z
  .object({
    tableIdPrefix: z.string().min(1).default("mixed_split"),
    signalMetric: z.string().min(1),
    sampleColumns: z.array(z.string().min(1)).min(1),
    featureIdColumn: z.string().min(1).default("feature_id"),
    genomeBuild: z.string().min(1).optional(),
    coordinateSystem: z
      .enum(["0-based-half-open", "1-based-closed"])
      .optional(),
  })
  .strict();

export type SplitMatrixBuildOptions = z.infer<
  typeof SplitMatrixBuildOptionsSchema
>;

/**
 * A canonical feature matrix built from a homogenous row group.
 */
export const SplitFeatureMatrixSchema = z
  .object({
    matrixId: z.string().min(1),
    featureClass: PerRowFeatureClassSchema,
    featureIds: z.array(z.string().min(1)),
    sampleIds: z.array(z.string().min(1)),
    wideValues: z.record(
      z.string().min(1),
      z.record(z.string().min(1), z.number().or(z.null())),
    ),
    rowCount: z.number().int().nonnegative(),
    buildErrors: z.array(z.string()),
  })
  .strict();

export type SplitFeatureMatrix = z.infer<typeof SplitFeatureMatrixSchema>;

function parseNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "NA" || trimmed === "NaN") {
    return null;
  }
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

/**
 * Build canonical wide-format feature matrices from the split row groups
 * produced by analyzeMixedFeatures.
 *
 * Only groups with a recognised feature class (not "unknown" or "ambiguous")
 * are converted.  Rows within each group are processed in original order.
 */
export function buildSplitFeatureMatrices(
  splitRowGroups: Record<string, Record<string, string>[]>,
  _rowClassifications: RowClassificationResult[],
  options: SplitMatrixBuildOptions,
): {
  matrices: SplitFeatureMatrix[];
  errors: string[];
  warnings: string[];
} {
  const matrices: SplitFeatureMatrix[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const optsResult = SplitMatrixBuildOptionsSchema.safeParse(options);
  if (!optsResult.success) {
    for (const issue of optsResult.error.issues) {
      errors.push(`options.${issue.path.join(".")}: ${issue.message}`);
    }
    return { matrices, errors, warnings };
  }
  const opts = optsResult.data;

  const groupKeys = Object.keys(splitRowGroups).sort((a, b) => {
    const ordA = CLASS_ORDINAL[a as PerRowFeatureClass] ?? 999;
    const ordB = CLASS_ORDINAL[b as PerRowFeatureClass] ?? 999;
    return ordA - ordB;
  });

  for (const groupKey of groupKeys) {
    const rows = splitRowGroups[groupKey];
    if (rows.length === 0) continue;

    if (groupKey === "unknown" || groupKey === "ambiguous") {
      warnings.push(
        `Group '${groupKey}' contains ${rows.length} rows that were not converted to a feature matrix because the class is unresolvable`,
      );
      continue;
    }

    const featureIds: string[] = [];
    const wideValues: Record<string, Record<string, number | null>> = {};
    const buildErrors: string[] = [];

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const featureId = row[opts.featureIdColumn]?.trim();
      if (!featureId) {
        buildErrors.push(
          `Group ${groupKey}, row ${rowIdx}: missing feature_id in column '${opts.featureIdColumn}'`,
        );
        continue;
      }

      const values: Record<string, number | null> = {};
      for (const sampleId of opts.sampleColumns) {
        values[sampleId] = parseNumberOrNull(row[sampleId] ?? "");
      }

      featureIds.push(featureId);
      wideValues[featureId] = values;
    }

    matrices.push({
      matrixId: `${opts.tableIdPrefix}_${groupKey}`,
      featureClass: groupKey as PerRowFeatureClass,
      featureIds,
      sampleIds: opts.sampleColumns,
      wideValues,
      rowCount: featureIds.length,
      buildErrors,
    });
  }

  return { matrices, errors, warnings };
}
