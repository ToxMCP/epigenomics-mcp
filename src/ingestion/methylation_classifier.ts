import { z } from "zod";
import {
  CpGMethylationFeatureSchema,
  DifferentialMethylatedRegionFeatureSchema,
  type CpGMethylationFeature,
  type DifferentialMethylatedRegionFeature,
} from "../contracts/features.js";
import { AssayFamilySchema } from "../contracts/dataset.js";
import { ModalitySchema } from "../contracts/features.js";
import { MeasurementSemanticsSchema } from "../contracts/measurement_semantics.js";
import { PlatformAnnotationProvenanceSchema } from "../contracts/provenance.js";
import { TableShapeSchema } from "./format_detection.js";

/**
 * Detectable methylation feature classes.
 */
export const MethylationFeatureClassSchema = z.enum([
  "cpg_methylation",
  "dmr",
  "differential_methylated_region",
  "unclassified",
]);

export type MethylationFeatureClass = z.infer<
  typeof MethylationFeatureClassSchema
>;

/**
 * Confidence levels for methylation feature classification.
 */
export const ClassificationConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
  "override",
]);

export type ClassificationConfidence = z.infer<
  typeof ClassificationConfidenceSchema
>;

/**
 * Options for methylation feature classification.
 */
export const MethylationClassificationOptionsSchema = z
  .object({
    assayFamily: AssayFamilySchema,
    modality: ModalitySchema,
    headers: z.array(z.string()),
    detectedShape: TableShapeSchema,
    featureValueSemantics: MeasurementSemanticsSchema,
    platformAnnotationProvenance: PlatformAnnotationProvenanceSchema.optional(),
    explicitFeatureClass: MethylationFeatureClassSchema.exclude([
      "unclassified",
    ]).optional(),
  })
  .strict();

export type MethylationClassificationOptions = z.infer<
  typeof MethylationClassificationOptionsSchema
>;

/**
 * Result of methylation feature classification.
 */
export const MethylationClassificationResultSchema = z
  .object({
    featureClass: MethylationFeatureClassSchema,
    confidence: ClassificationConfidenceSchema,
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    probeIdColumn: z.string().optional(),
    regionColumns: z
      .object({
        chrom: z.string(),
        start: z.string(),
        end: z.string(),
      })
      .optional(),
  })
  .strict();

export type MethylationClassificationResult = z.infer<
  typeof MethylationClassificationResultSchema
>;

/**
 * Options for building methylation features from raw rows.
 */
export const MethylationFeatureBuildOptionsSchema = z
  .object({
    genomeBuild: z.string().min(1).optional(),
    coordinateSystem: z
      .enum(["0-based-half-open", "1-based-closed"])
      .optional(),
    featureIdColumn: z.string().min(1).optional(),
  })
  .strict();

export type MethylationFeatureBuildOptions = z.infer<
  typeof MethylationFeatureBuildOptionsSchema
>;

/**
 * Result of building methylation features from raw rows.
 */
export interface MethylationFeatureBuildResult {
  features: (
    | CpGMethylationFeature
    | DifferentialMethylatedRegionFeature
  )[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Column name normalisation
// ---------------------------------------------------------------------------

function normaliseColumnName(name: string): string {
  return name.toLowerCase().replace(/[_\s-]/g, "").trim();
}

const STRONG_PROBE_INDICATORS = new Set([
  "probe_id",
  "probeid",
  "cpg_id",
  "cpgid",
  "cg_id",
  "cgid",
  "probe",
]);

const WEAK_PROBE_INDICATORS = new Set([
  "id",
  "feature_id",
  "featureid",
]);

const CHROMOSOME_INDICATORS = new Set([
  "chr",
  "chrom",
  "chromosome",
  "seqnames",
]);

const START_INDICATORS = new Set(["start"]);
const END_INDICATORS = new Set(["end"]);

const POSITION_INDICATORS = new Set([
  "position",
  "pos",
  "bp",
  "coordinate",
]);

const EFFECT_SIZE_INDICATORS = new Set([
  "effect_size",
  "effectsize",
  "effect",
  "delta_beta",
  "deltabeta",
  "delta_m",
  "deltam",
]);

const P_VALUE_INDICATORS = new Set([
  "p_value",
  "pvalue",
  "pval",
  "p",
]);

const Q_VALUE_INDICATORS = new Set([
  "q_value",
  "qvalue",
  "qval",
  "fdr",
  "adjusted_p",
  "adjustedp",
]);

// ---------------------------------------------------------------------------
// Classification engine
// ---------------------------------------------------------------------------

/**
 * Classify a processed methylation table into CpG methylation or DMR feature
 * classes using explicit metadata and header heuristics.
 *
 * Fail-closed: ambiguous or under-specified inputs return "unclassified"
 * with blocking errors.
 *
 * Rules:
 * - assayFamily must be "dna_methylation"
 * - modality must be array or bsseq
 * - probe_id / CpG ID columns strongly indicate cpg_methylation
 * - region interval columns (chr + start + end) strongly indicate dmr
 * - raw measurement semantics (beta_value, m_value, percent_methylation)
 *   strongly indicate cpg_methylation
 * - differential / summary semantics and columns strongly indicate dmr
 * - explicitFeatureClass overrides all heuristics
 */
export function classifyMethylationFeatureClass(
  options: MethylationClassificationOptions,
): MethylationClassificationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const optionsResult =
    MethylationClassificationOptionsSchema.safeParse(options);
  if (!optionsResult.success) {
    for (const issue of optionsResult.error.issues) {
      errors.push(`options.${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      featureClass: "unclassified",
      confidence: "low",
      warnings,
      errors,
    };
  }

  const opts = optionsResult.data;

  // Gate 1: assay family
  if (opts.assayFamily !== "dna_methylation") {
    errors.push(
      `Assay family "${opts.assayFamily}" is not dna_methylation; cannot classify methylation features`,
    );
    return {
      featureClass: "unclassified",
      confidence: "low",
      warnings,
      errors,
    };
  }

  // Gate 2: modality
  if (
    opts.modality !== "dna_methylation_array" &&
    opts.modality !== "dna_methylation_bsseq"
  ) {
    errors.push(
      `Modality "${opts.modality}" is not a supported DNA methylation modality`,
    );
    return {
      featureClass: "unclassified",
      confidence: "low",
      warnings,
      errors,
    };
  }

  const normalisedHeaders = opts.headers.map((h) => normaliseColumnName(h));

  // Detect probe/CpG ID column
  let probeIdColumn: string | undefined;
  let strongProbeIndicator = false;
  for (let i = 0; i < opts.headers.length; i++) {
    if (STRONG_PROBE_INDICATORS.has(normalisedHeaders[i])) {
      probeIdColumn = opts.headers[i];
      strongProbeIndicator = true;
      break;
    }
  }
  if (!probeIdColumn) {
    for (let i = 0; i < opts.headers.length; i++) {
      if (WEAK_PROBE_INDICATORS.has(normalisedHeaders[i])) {
        probeIdColumn = opts.headers[i];
        break;
      }
    }
  }

  // Detect region interval columns (chr + start + end)
  const chromIdx = normalisedHeaders.findIndex((h) =>
    CHROMOSOME_INDICATORS.has(h),
  );
  const startIdx = normalisedHeaders.findIndex((h) =>
    START_INDICATORS.has(h),
  );
  const endIdx = normalisedHeaders.findIndex((h) =>
    END_INDICATORS.has(h),
  );
  const hasRegionInterval =
    chromIdx >= 0 && startIdx >= 0 && endIdx >= 0;

  // Detect single-site position column
  const hasPosition = normalisedHeaders.some((h) =>
    POSITION_INDICATORS.has(h),
  );

  // Detect summary stat columns
  const hasEffectSize = normalisedHeaders.some((h) =>
    EFFECT_SIZE_INDICATORS.has(h),
  );
  const hasPValue = normalisedHeaders.some((h) =>
    P_VALUE_INDICATORS.has(h),
  );
  const hasQValue = normalisedHeaders.some((h) =>
    Q_VALUE_INDICATORS.has(h),
  );
  const hasSummaryStats = hasEffectSize || hasPValue || hasQValue;

  // Region column descriptor
  let regionColumns:
    | { chrom: string; start: string; end: string }
    | undefined;
  if (hasRegionInterval) {
    regionColumns = {
      chrom: opts.headers[chromIdx],
      start: opts.headers[startIdx],
      end: opts.headers[endIdx],
    };
  }

  const semantics = opts.featureValueSemantics;

  // --- Scoring ---
  let cpgScore = 0;
  let dmrScore = 0;

  // CpG indicators
  if (probeIdColumn) {
    cpgScore += strongProbeIndicator ? 4 : 2;
  }
  if (hasPosition) cpgScore += 1;
  if (!hasRegionInterval) cpgScore += 1;
  if (
    semantics === "beta_value" ||
    semantics === "m_value" ||
    semantics === "percent_methylation"
  ) {
    cpgScore += 1;
  }
  if (semantics === "delta_beta" || semantics === "delta_m") {
    cpgScore += 1; // site-level differential is still CpG
  }
  if (opts.detectedShape === "wide") cpgScore += 1;
  if (opts.detectedShape === "summary") cpgScore -= 1;
  if (hasSummaryStats && !strongProbeIndicator) cpgScore -= 1;

  // DMR indicators
  if (hasRegionInterval) dmrScore += 3;
  if (
    semantics === "delta_beta" ||
    semantics === "delta_m" ||
    semantics === "effect_size" ||
    semantics === "q_value"
  ) {
    dmrScore += 1;
  }
  if (hasSummaryStats && !strongProbeIndicator) dmrScore += 2;
  if (opts.detectedShape === "summary") dmrScore += 1;
  if (probeIdColumn) {
    dmrScore -= strongProbeIndicator ? 2 : 1;
  }
  if (
    semantics === "beta_value" ||
    semantics === "m_value" ||
    semantics === "percent_methylation"
  ) {
    dmrScore -= 1;
  }

  // Determine class
  let featureClass: MethylationFeatureClass = "unclassified";
  let confidence: ClassificationConfidence = "low";
  const CLASSIFICATION_THRESHOLD = 3;

  if (opts.explicitFeatureClass !== undefined) {
    featureClass = opts.explicitFeatureClass;
    confidence = "override";
  } else if (
    strongProbeIndicator &&
    hasRegionInterval &&
    hasSummaryStats
  ) {
    // Fail-closed: conflicting strong indicators cannot be disambiguated
    // from headers alone.
    featureClass = "unclassified";
    confidence = "low";
    errors.push(
      "Ambiguous methylation feature classification: CpG and DMR indicators are tied. Provide explicitFeatureClass override.",
    );
  } else if (
    cpgScore > dmrScore &&
    cpgScore >= CLASSIFICATION_THRESHOLD
  ) {
    featureClass = "cpg_methylation";
    confidence = cpgScore >= 5 ? "high" : cpgScore >= 3 ? "medium" : "low";
  } else if (
    dmrScore > cpgScore &&
    dmrScore >= CLASSIFICATION_THRESHOLD
  ) {
    featureClass = "dmr";
    confidence = dmrScore >= 5 ? "high" : dmrScore >= 3 ? "medium" : "low";
  } else {
    featureClass = "unclassified";
    confidence = "low";
    errors.push(
      "Insufficient evidence to classify methylation feature type. Provide explicitFeatureClass override.",
    );
  }

  // Advisory warning for array-derived features without platform provenance
  if (
    opts.modality === "dna_methylation_array" &&
    !opts.platformAnnotationProvenance
  ) {
    warnings.push(
      "Array-derived methylation features should include platformAnnotationProvenance for reproducible interpretation",
    );
  }

  return {
    featureClass,
    confidence,
    warnings,
    errors,
    probeIdColumn,
    regionColumns,
  };
}

// ---------------------------------------------------------------------------
// Feature builder
// ---------------------------------------------------------------------------

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

function extractValuesFromSampleColumns(
  row: Record<string, string>,
  sampleColumns: string[],
): Record<string, number | null> {
  const values: Record<string, number | null> = {};
  for (const col of sampleColumns) {
    values[col] = parseNumberOrNull(row[col] ?? "");
  }
  return values;
}

function extractMeasuredRegion(
  row: Record<string, string>,
  regionColumns: { chrom: string; start: string; end: string },
  genomeBuild: string,
  coordinateSystem: "0-based-half-open" | "1-based-closed",
):
  | { chrom: string; start: number; end: number; build: string; coordinateSystem: "0-based-half-open" | "1-based-closed" }
  | undefined {
  const chrom = row[regionColumns.chrom];
  const startRaw = row[regionColumns.start];
  const endRaw = row[regionColumns.end];

  if (!chrom || startRaw === undefined || endRaw === undefined) {
    return undefined;
  }

  const start = parseInt(startRaw, 10);
  const end = parseInt(endRaw, 10);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return undefined;
  }

  return {
    chrom,
    start,
    end,
    build: genomeBuild,
    coordinateSystem,
  };
}

/**
 * Build typed methylation feature objects from raw table rows.
 *
 * Preserves probe IDs as measuredIdentifier and attaches platform
 * annotation provenance for array-derived features.
 *
 * Fail-closed: rows that fail schema validation are collected as errors
 * and skipped.
 */
export function buildMethylationFeatures(
  rows: Record<string, string>[],
  classification: MethylationClassificationResult,
  options: MethylationClassificationOptions,
  sampleColumns: string[],
  buildOptions: MethylationFeatureBuildOptions = {},
): MethylationFeatureBuildResult {
  const features: (
    | CpGMethylationFeature
    | DifferentialMethylatedRegionFeature
  )[] = [];
  const errors: string[] = [];

  const {
    genomeBuild = "hg38",
    coordinateSystem = "0-based-half-open",
    featureIdColumn,
  } = buildOptions;

  const probeIdColumn = classification.probeIdColumn;
  const regionColumns = classification.regionColumns;

  // Determine effect-size / p-value / q-value column names from headers
  const normalisedHeaders = options.headers.map((h) =>
    normaliseColumnName(h),
  );

  const effectSizeCol = options.headers.find((_, i) =>
    EFFECT_SIZE_INDICATORS.has(normalisedHeaders[i]),
  );
  const pValueCol = options.headers.find((_, i) =>
    P_VALUE_INDICATORS.has(normalisedHeaders[i]),
  );
  const qValueCol = options.headers.find((_, i) =>
    Q_VALUE_INDICATORS.has(normalisedHeaders[i]),
  );

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    // Determine featureId
    let featureId: string | undefined;
    if (featureIdColumn && row[featureIdColumn]) {
      featureId = row[featureIdColumn].trim();
    } else if (probeIdColumn && row[probeIdColumn]) {
      featureId = row[probeIdColumn].trim();
    } else if (regionColumns) {
      const chrom = row[regionColumns.chrom];
      const start = row[regionColumns.start];
      const end = row[regionColumns.end];
      if (chrom && start && end) {
        featureId = `${chrom}:${start}-${end}`;
      }
    }

    if (!featureId) {
      errors.push(`Row ${rowIdx}: unable to determine featureId`);
      continue;
    }

    // Build values from sample columns
    const values = extractValuesFromSampleColumns(row, sampleColumns);

    if (classification.featureClass === "cpg_methylation") {
      const measuredIdentifier =
        probeIdColumn && row[probeIdColumn]
          ? row[probeIdColumn].trim()
          : undefined;

      let measuredRegion = undefined;
      if (regionColumns) {
        const region = extractMeasuredRegion(
          row,
          regionColumns,
          genomeBuild,
          coordinateSystem,
        );
        if (region) {
          measuredRegion = region;
        }
      }

      const featureObj: Record<string, unknown> = {
        featureId,
        featureClass: "cpg_methylation",
        modality: options.modality,
        signalMetric: options.featureValueSemantics,
        values,
      };

      if (measuredIdentifier) {
        featureObj.measuredIdentifier = measuredIdentifier;
      }
      if (measuredRegion) {
        featureObj.measuredRegion = measuredRegion;
      }
      if (options.platformAnnotationProvenance) {
        featureObj.platformAnnotationProvenance =
          options.platformAnnotationProvenance;
      }

      const parseResult = CpGMethylationFeatureSchema.safeParse(featureObj);
      if (parseResult.success) {
        features.push(parseResult.data);
      } else {
        for (const issue of parseResult.error.issues) {
          errors.push(
            `Row ${rowIdx} (${featureId}): ${issue.path.join(".")}: ${issue.message}`,
          );
        }
      }
    } else if (
      classification.featureClass === "dmr" ||
      classification.featureClass === "differential_methylated_region"
    ) {
      if (!regionColumns) {
        errors.push(
          `Row ${rowIdx} (${featureId}): DMR features require region columns`,
        );
        continue;
      }

      const measuredRegion = extractMeasuredRegion(
        row,
        regionColumns,
        genomeBuild,
        coordinateSystem,
      );
      if (!measuredRegion) {
        errors.push(
          `Row ${rowIdx} (${featureId}): unable to parse region coordinates`,
        );
        continue;
      }

      const featureObj: Record<string, unknown> = {
        featureId,
        featureClass: classification.featureClass,
        modality: options.modality,
        measuredRegion,
        signalMetric: options.featureValueSemantics,
        values,
      };

      if (probeIdColumn && row[probeIdColumn]) {
        featureObj.measuredIdentifier = row[probeIdColumn].trim();
      }
      if (effectSizeCol && row[effectSizeCol] !== undefined) {
        const es = parseNumberOrNull(row[effectSizeCol]);
        if (es !== null) featureObj.effectSize = es;
      }
      if (pValueCol && row[pValueCol] !== undefined) {
        const pv = parseNumberOrNull(row[pValueCol]);
        if (pv !== null) featureObj.pValue = pv;
      }
      if (qValueCol && row[qValueCol] !== undefined) {
        const qv = parseNumberOrNull(row[qValueCol]);
        if (qv !== null) featureObj.qValue = qv;
      }

      const parseResult =
        DifferentialMethylatedRegionFeatureSchema.safeParse(featureObj);
      if (parseResult.success) {
        features.push(parseResult.data);
      } else {
        for (const issue of parseResult.error.issues) {
          errors.push(
            `Row ${rowIdx} (${featureId}): ${issue.path.join(".")}: ${issue.message}`,
          );
        }
      }
    }
  }

  return { features, errors };
}
