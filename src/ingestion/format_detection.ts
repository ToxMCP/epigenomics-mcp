import { z } from "zod";
import { MeasurementSemanticsSchema } from "../contracts/measurement_semantics.js";

/**
 * Detectable table shapes for processed epigenomic feature tables.
 */
export const TableShapeSchema = z.enum([
  "long",
  "wide",
  "summary",
  "ambiguous",
]);

export type TableShape = z.infer<typeof TableShapeSchema>;

/**
 * Canonical confidence levels for shape detection.
 */
export const DetectionConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
  "override",
]);

export type DetectionConfidence = z.infer<typeof DetectionConfidenceSchema>;

/**
 * Normalised column name categories used for heuristic detection.
 */
const FEATURE_ID_INDICATORS = new Set([
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
]);

const SAMPLE_ID_INDICATORS = new Set([
  "sample_id",
  "sampleid",
  "sample",
]);

const VALUE_INDICATORS = new Set([
  "value",
  "response_value",
  "responsevalue",
  "response",
  "signal",
  "beta_value",
  "betavalue",
  "beta",
  "m_value",
  "mvalue",
  "measurement",
  "methylation",
]);

const SUMMARY_INDICATORS = new Set([
  "group",
  "group_id",
  "groupid",
  "contrast",
  "comparison",
  "effect_size",
  "effectsize",
  "effect",
  "log_fc",
  "logfc",
  "log2fc",
  "fold_change",
  "foldchange",
  "fc",
  "p_value",
  "pvalue",
  "pval",
  "q_value",
  "qvalue",
  "qval",
  "fdr",
  "adjusted_p",
  "adjustedp",
  "statistic",
  "stat",
  "t_stat",
  "tstat",
  "z_score",
  "zscore",
  "se",
  "std_error",
  "standard_error",
  "stderr",
  "ci_lower",
  "cilower",
  "ci_upper",
  "ciupper",
  "confint_low",
  "confint_high",
  "log_odds",
  "logodds",
]);

const COORDINATE_ANNOTATION_INDICATORS = new Set([
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

/**
 * Options for format detection.
 */
export const FormatDetectionOptionsSchema = z
  .object({
    explicitShape: TableShapeSchema.exclude(["ambiguous"])
      .optional()
      .describe("Override auto-detection with an explicit shape"),
    featureValueSemantics: MeasurementSemanticsSchema.describe(
      "Explicit measurement semantics for feature values (mandatory)",
    ),
    sampleIdColumns: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "Known sample ID column names to improve wide-matrix detection",
      ),
  })
  .strict();

export type FormatDetectionOptions = z.input<typeof FormatDetectionOptionsSchema>;

/**
 * Result of format detection.
 */
export const DetectedFormatSchema = z
  .object({
    shape: TableShapeSchema.describe("Detected or explicit table shape"),
    confidence: DetectionConfidenceSchema.describe(
      "Confidence level of the detection",
    ),
    featureValueSemantics: MeasurementSemanticsSchema.describe(
      "Confirmed measurement semantics",
    ),
    detectedLongColumns: z
      .array(z.string())
      .describe("Columns that matched long-form indicators"),
    detectedSummaryColumns: z
      .array(z.string())
      .describe("Columns that matched summary-form indicators"),
    detectedSampleColumns: z
      .array(z.string())
      .describe("Columns inferred as sample identifiers in wide form"),
    warnings: z.array(z.string()).describe("Reviewable warnings"),
    errors: z.array(z.string()).describe("Blocking errors"),
  })
  .strict();

export type DetectedFormat = z.infer<typeof DetectedFormatSchema>;

/**
 * Normalise a column name for heuristic matching.
 * Lowercases and strips underscores, spaces, and hyphens.
 */
function normaliseColumnName(name: string): string {
  return name.toLowerCase().replace(/[_\s-]/g, "").trim();
}

/**
 * Check whether a normalised column name looks like a sample identifier
 * in a wide matrix context.
 *
 * If the user supplied sampleIdColumns, exact-match after normalisation.
 * Otherwise exclude known feature, value, summary, and coordinate
 * annotation indicators; remaining columns are treated as sample IDs.
 */
function isSampleColumn(
  normalised: string,
  userSampleIds: Set<string>,
): boolean {
  if (userSampleIds.has(normalised)) return true;
  if (FEATURE_ID_INDICATORS.has(normalised)) return false;
  if (SAMPLE_ID_INDICATORS.has(normalised)) return false;
  if (VALUE_INDICATORS.has(normalised)) return false;
  if (SUMMARY_INDICATORS.has(normalised)) return false;
  if (COORDINATE_ANNOTATION_INDICATORS.has(normalised)) return false;
  return true;
}

/**
 * Detect the shape of a processed epigenomic feature table from its headers.
 *
 * Responsibilities:
 * - Identify long-form tables (feature × sample rows)
 * - Identify wide matrices (feature rows × sample columns)
 * - Identify summary tables (feature rows × group/statistic columns)
 * - Require explicit feature_value_semantics (never inferred)
 * - Allow explicit user override of detected shape
 * - Fail closed on ambiguous inputs: return "ambiguous" with warnings
 *
 * Does NOT parse row contents or infer biological semantics from values.
 */
export function detectTableFormat(
  headers: string[],
  options: FormatDetectionOptions,
): DetectedFormat {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate options
  const optionsResult = FormatDetectionOptionsSchema.safeParse(options);
  if (!optionsResult.success) {
    for (const issue of optionsResult.error.issues) {
      errors.push(`options.${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      shape: "ambiguous",
      confidence: "low",
      featureValueSemantics: options.featureValueSemantics ?? "declared_other",
      detectedLongColumns: [],
      detectedSummaryColumns: [],
      detectedSampleColumns: [],
      warnings,
      errors,
    };
  }

  const opts = optionsResult.data;
  const semantics = opts.featureValueSemantics;

  const normalisedHeaders = headers.map((h) => normaliseColumnName(h));

  // Categorise each original column by its normalised form
  const longMatches: string[] = [];
  const summaryMatches: string[] = [];

  for (let i = 0; i < headers.length; i++) {
    const norm = normalisedHeaders[i];
    const orig = headers[i];
    if (
      FEATURE_ID_INDICATORS.has(norm) ||
      SAMPLE_ID_INDICATORS.has(norm) ||
      VALUE_INDICATORS.has(norm)
    ) {
      longMatches.push(orig);
    }
    if (SUMMARY_INDICATORS.has(norm)) {
      summaryMatches.push(orig);
    }
  }

  const hasFeatureId = normalisedHeaders.some((h) =>
    FEATURE_ID_INDICATORS.has(h),
  );
  const hasSampleId = normalisedHeaders.some((h) =>
    SAMPLE_ID_INDICATORS.has(h),
  );
  const hasValueCol = normalisedHeaders.some((h) =>
    VALUE_INDICATORS.has(h),
  );

  const userSampleIds = new Set(
    (opts.sampleIdColumns ?? []).map((s) => normaliseColumnName(s)),
  );
  const sampleMatches = headers.filter((_, i) =>
    isSampleColumn(normalisedHeaders[i], userSampleIds),
  );

  // --- Scoring ---
  let longScore = 0;
  let wideScore = 0;
  let summaryScore = 0;

  // Long-form scoring
  if (hasFeatureId) longScore += 1;
  if (hasSampleId) longScore += 1;
  if (hasValueCol) longScore += 1;
  // Bonus for the classic trio
  if (hasFeatureId && hasSampleId && hasValueCol) {
    longScore += 1;
  }

  // Wide-form scoring: MUST have feature_id
  if (hasFeatureId) {
    wideScore += 1;
    const sampleLikeCount = sampleMatches.length;
    if (sampleLikeCount >= 2) wideScore += 1;
    if (sampleLikeCount >= 3) wideScore += 1;
    // Only apply counter-evidence adjustments when there is positive
    // evidence of wide form (at least 2 sample-like columns)
    if (sampleLikeCount >= 2) {
      if (summaryMatches.length === 0) wideScore += 1;
      else wideScore -= 1;
      if (summaryMatches.length >= 2) wideScore -= 1;
      // Strong penalty for value columns (strongly suggest long form)
      if (!hasValueCol) wideScore += 1;
      else wideScore -= 2;
    }
  }

  // Summary-form scoring: MUST have feature_id
  if (hasFeatureId) {
    summaryScore += 1;
    // Positive evidence: each summary column (capped at 3)
    summaryScore += Math.min(summaryMatches.length, 3);
    // Counter-evidence: sample-like columns suggest wide form
    const sampleLikeCount = sampleMatches.length;
    if (sampleLikeCount >= 2) summaryScore -= 1;
    if (sampleLikeCount >= 3) summaryScore -= 1;
    // Counter-evidence: value column suggests long form
    if (hasValueCol) summaryScore -= 1;
  }

  // --- Determine shape ---
  let detectedShape: TableShape;
  let confidence: DetectionConfidence;

  const scores = [
    { shape: "long" as const, score: longScore },
    { shape: "wide" as const, score: wideScore },
    { shape: "summary" as const, score: summaryScore },
  ];
  scores.sort((a, b) => b.score - a.score);

  const topScore = scores[0].score;
  const tiedShapes = scores
    .filter((s) => s.score === topScore)
    .map((s) => s.shape);

  if (topScore <= 0) {
    detectedShape = "ambiguous";
    confidence = "low";
    warnings.push(
      "No recognizable table shape detected from headers; manual review required",
    );
  } else if (tiedShapes.length > 1) {
    detectedShape = "ambiguous";
    confidence = "low";
    warnings.push(
      `Ambiguous table shape: tied scores between ${tiedShapes.join(", ")}. Explicit override recommended.`,
    );
  } else {
    detectedShape = scores[0].shape;
    confidence = topScore >= 4 ? "high" : topScore >= 3 ? "medium" : "low";
  }

  // Apply explicit override
  let finalShape = detectedShape;
  if (opts.explicitShape !== undefined) {
    if (opts.explicitShape !== detectedShape && detectedShape !== "ambiguous") {
      warnings.push(
        `Explicit shape override "${opts.explicitShape}" differs from detected shape "${detectedShape}". Using explicit override.`,
      );
    }
    finalShape = opts.explicitShape;
    confidence = "override";
  }

  if (finalShape === "ambiguous" && opts.explicitShape === undefined) {
    errors.push(
      "Table shape is ambiguous. Provide explicitShape override to proceed.",
    );
  }

  return {
    shape: finalShape,
    confidence,
    featureValueSemantics: semantics,
    detectedLongColumns: longMatches,
    detectedSummaryColumns: summaryMatches,
    detectedSampleColumns:
      finalShape === "wide" || detectedShape === "wide"
        ? sampleMatches
        : [],
    warnings,
    errors,
  };
}
