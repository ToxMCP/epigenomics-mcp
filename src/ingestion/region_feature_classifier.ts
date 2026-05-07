import { z } from "zod";
import {
  GenericRegionFeatureSchema,
  ChromatinAccessibilityFeatureSchema,
  HistoneMarkFeatureSchema,
  type GenericRegionFeature,
  type ChromatinAccessibilityFeature,
  type HistoneMarkFeature,
} from "../contracts/features.js";
import { AssayFamilySchema } from "../contracts/dataset.js";
import { ModalitySchema } from "../contracts/features.js";
import { MeasurementSemanticsSchema } from "../contracts/measurement_semantics.js";
import { TableShapeSchema } from "./format_detection.js";
import { FeatureFlagsSchema } from "../qualification/policy.js";

/**
 * Detectable region feature classes.
 */
export const RegionFeatureClassSchema = z.enum([
  "generic_region_feature",
  "atac_peak",
  "chip_peak_narrow",
  "chip_peak_broad",
  "histone_mark_peak",
  "chromatin_interaction",
  "unclassified",
]);

export type RegionFeatureClass = z.infer<typeof RegionFeatureClassSchema>;

/**
 * Confidence levels for region feature classification.
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
 * Options for region feature classification.
 */
export const RegionClassificationOptionsSchema = z
  .object({
    assayFamily: AssayFamilySchema,
    modality: ModalitySchema,
    headers: z.array(z.string()),
    detectedShape: TableShapeSchema,
    featureValueSemantics: MeasurementSemanticsSchema,
    featureFlags: FeatureFlagsSchema.optional(),
    explicitFeatureClass: RegionFeatureClassSchema.exclude([
      "unclassified",
    ]).optional(),
  })
  .strict();

export type RegionClassificationOptions = z.infer<
  typeof RegionClassificationOptionsSchema
>;

/**
 * Result of region feature classification.
 */
export const RegionClassificationResultSchema = z
  .object({
    featureClass: RegionFeatureClassSchema,
    confidence: ClassificationConfidenceSchema,
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    regionColumns: z
      .object({
        chrom: z.string(),
        start: z.string(),
        end: z.string(),
      })
      .optional(),
  })
  .strict();

export type RegionClassificationResult = z.infer<
  typeof RegionClassificationResultSchema
>;

/**
 * Options for building region features from raw rows.
 */
export const RegionFeatureBuildOptionsSchema = z
  .object({
    genomeBuild: z.string().min(1).optional(),
    coordinateSystem: z
      .enum(["0-based-half-open", "1-based-closed"])
      .optional(),
    featureIdColumn: z.string().min(1).optional(),
  })
  .strict();

export type RegionFeatureBuildOptions = z.infer<
  typeof RegionFeatureBuildOptionsSchema
>;

/**
 * Result of building region features from raw rows.
 */
export interface RegionFeatureBuildResult {
  features: (
    | GenericRegionFeature
    | ChromatinAccessibilityFeature
    | HistoneMarkFeature
  )[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Column name normalisation
// ---------------------------------------------------------------------------

function normaliseColumnName(name: string): string {
  return name.toLowerCase().replace(/[_\s-]/g, "").trim();
}

const CHROMOSOME_INDICATORS = new Set([
  "chr",
  "chrom",
  "chromosome",
  "seqnames",
]);

const START_INDICATORS = new Set(["start"]);
const END_INDICATORS = new Set(["end"]);

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

// ---------------------------------------------------------------------------
// Classification engine
// ---------------------------------------------------------------------------

/**
 * Classify a processed region-level table into generic or specialized region
 * feature classes using explicit metadata and header heuristics.
 *
 * Fail-closed: ambiguous or under-specified inputs return "unclassified"
 * with blocking errors.
 *
 * Rules:
 * - Region interval columns (chr + start + end) are mandatory for any
 *   coordinate-bearing region feature.
 * - When only coordinates and value semantics are declared, classify as
 *   "generic_region_feature".
 * - ATAC-specific classes (atac_peak) require enableChromatinAccessibility
 *   feature flag.
 * - Histone-mark-specific classes (histone_mark_peak) require enableHistoneMark
 *   feature flag.
 * - chip_peak_narrow and chip_peak_broad also require enableHistoneMark flag
 *   in v0.1 because they are treated as reserved ChIP classes.
 * - chromatin_interaction requires no special flag but must have coordinates.
 * - explicitFeatureClass overrides all heuristics but still respects feature
 *   flags for reserved classes.
 */
export function classifyRegionFeatureClass(
  options: RegionClassificationOptions,
): RegionClassificationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const optionsResult =
    RegionClassificationOptionsSchema.safeParse(options);
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
  const normalisedHeaders = opts.headers.map((h) => normaliseColumnName(h));

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

  // Gate 1: coordinate-bearing features require region columns
  if (!hasRegionInterval) {
    errors.push(
      "Region feature classification requires chromosome, start, and end columns; none detected",
    );
    return {
      featureClass: "unclassified",
      confidence: "low",
      warnings,
      errors,
    };
  }

  // Detect assay-specific indicators
  const hasPeakFormat = normalisedHeaders.some((h) =>
    PEAK_FORMAT_INDICATORS.has(h),
  );
  const hasMarkName = normalisedHeaders.some((h) =>
    MARK_NAME_INDICATORS.has(h),
  );

  if (hasPeakFormat && hasMarkName) {
    warnings.push(
      "Headers contain both peak-format and mark-name indicators; mixed-class table detected. Verify that modality and explicitFeatureClass are correctly specified.",
    );
  }

  const featureFlags = opts.featureFlags ?? {
    enableChromatinAccessibility: false,
    enableHistoneMark: false,
    enableMirnaExpression: false,
    enableNcrnaExpression: false,
    enableChromatinStateContext: false,
    enableBatchEffectModeling: false,
    enableCellDeconvolution: false,
  };

  // Determine class
  let featureClass: RegionFeatureClass = "unclassified";
  let confidence: ClassificationConfidence = "low";

  if (opts.explicitFeatureClass !== undefined) {
    featureClass = opts.explicitFeatureClass;
    confidence = "override";

    // Feature-flag gates for reserved classes
    if (
      featureClass === "atac_peak" &&
      !featureFlags.enableChromatinAccessibility
    ) {
      errors.push(
        `Feature class "atac_peak" is reserved behind the enableChromatinAccessibility feature flag`,
      );
      featureClass = "unclassified";
      confidence = "low";
    }
    if (
      (featureClass === "histone_mark_peak" ||
        featureClass === "chip_peak_narrow" ||
        featureClass === "chip_peak_broad") &&
      !featureFlags.enableHistoneMark
    ) {
      errors.push(
        `Feature class "${opts.explicitFeatureClass}" is reserved behind the enableHistoneMark feature flag`,
      );
      featureClass = "unclassified";
      confidence = "low";
    }
  } else {
    // Heuristic classification
    if (
      opts.modality === "atac_seq" &&
      featureFlags.enableChromatinAccessibility
    ) {
      featureClass = "atac_peak";
      confidence = hasPeakFormat ? "high" : "medium";
      if (!hasPeakFormat) {
        warnings.push(
          "ATAC-seq modality detected with feature flag enabled but peak_format column is missing; confidence reduced to medium",
        );
      }
    } else if (
      opts.modality === "chip_seq" &&
      featureFlags.enableHistoneMark
    ) {
      if (hasMarkName) {
        featureClass = "histone_mark_peak";
        confidence = "high";
      } else {
        featureClass = "chip_peak_narrow";
        confidence = "medium";
        warnings.push(
          "ChIP-seq modality detected without mark name; defaulting to chip_peak_narrow. Provide mark name or explicitFeatureClass for precise classification.",
        );
      }
    } else if (opts.modality === "hic") {
      featureClass = "chromatin_interaction";
      confidence = "high";
    } else {
      // Default to generic region feature when coordinates + semantics are declared
      featureClass = "generic_region_feature";
      confidence = "high";
    }

    // Warn when specialized modalities are detected but flags are disabled
    if (
      opts.modality === "atac_seq" &&
      !featureFlags.enableChromatinAccessibility
    ) {
      warnings.push(
        "ATAC-seq modality detected but enableChromatinAccessibility feature flag is disabled; classifying as generic_region_feature",
      );
    }
    if (
      opts.modality === "chip_seq" &&
      !featureFlags.enableHistoneMark
    ) {
      warnings.push(
        "ChIP-seq modality detected but enableHistoneMark feature flag is disabled; classifying as generic_region_feature",
      );
    }
  }

  // Missing metric semantics gate (already validated by schema, but advisory)
  if (
    opts.featureValueSemantics === "declared_other"
  ) {
    warnings.push(
      "Measurement semantics are 'declared_other'; downstream interpretation requires explicit metric documentation",
    );
  }

  return {
    featureClass,
    confidence,
    warnings,
    errors,
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
  | {
      chrom: string;
      start: number;
      end: number;
      build: string;
      coordinateSystem: "0-based-half-open" | "1-based-closed";
    }
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
 * Build typed region feature objects from raw table rows.
 *
 * Supports generic_region_feature, atac_peak (when feature flag enabled),
 * and histone_mark_peak (when feature flag enabled).
 *
 * Fail-closed: rows that fail schema validation are collected as errors
 * and skipped.
 */
export function buildRegionFeatures(
  rows: Record<string, string>[],
  classification: RegionClassificationResult,
  options: RegionClassificationOptions,
  sampleColumns: string[],
  buildOptions: RegionFeatureBuildOptions = {},
): RegionFeatureBuildResult {
  const features: (
    | GenericRegionFeature
    | ChromatinAccessibilityFeature
    | HistoneMarkFeature
  )[] = [];
  const errors: string[] = [];

  const {
    genomeBuild = "hg38",
    coordinateSystem = "0-based-half-open",
    featureIdColumn,
  } = buildOptions;

  const regionColumns = classification.regionColumns;
  if (!regionColumns) {
    errors.push("Region columns are required to build region features");
    return { features, errors };
  }

  const normalisedHeaders = options.headers.map((h) =>
    normaliseColumnName(h),
  );

  // Detect optional assay-specific columns
  const peakFormatCol = options.headers.find((_, i) =>
    PEAK_FORMAT_INDICATORS.has(normalisedHeaders[i]),
  );
  const markNameCol = options.headers.find((_, i) =>
    MARK_NAME_INDICATORS.has(normalisedHeaders[i]),
  );

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    // Determine featureId
    let featureId: string | undefined;
    if (featureIdColumn && row[featureIdColumn]) {
      featureId = row[featureIdColumn].trim();
    } else {
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

    const values = extractValuesFromSampleColumns(row, sampleColumns);

    if (classification.featureClass === "generic_region_feature") {
      const featureObj: Record<string, unknown> = {
        featureId,
        featureClass: "generic_region_feature",
        modality: options.modality,
        measuredRegion,
        signalMetric: options.featureValueSemantics,
        values,
      };

      const parseResult = GenericRegionFeatureSchema.safeParse(featureObj);
      if (parseResult.success) {
        features.push(parseResult.data);
      } else {
        for (const issue of parseResult.error.issues) {
          errors.push(
            `Row ${rowIdx} (${featureId}): ${issue.path.join(".")}: ${issue.message}`,
          );
        }
      }
    } else if (classification.featureClass === "atac_peak") {
      const peakFormat =
        peakFormatCol && row[peakFormatCol]
          ? row[peakFormatCol].trim()
          : "custom";

      const featureObj: Record<string, unknown> = {
        featureId,
        featureClass: "atac_peak",
        modality: "atac_seq",
        measuredRegion,
        peakFormat,
        signalMetric: options.featureValueSemantics,
        values,
      };

      const parseResult =
        ChromatinAccessibilityFeatureSchema.safeParse(featureObj);
      if (parseResult.success) {
        features.push(parseResult.data);
      } else {
        for (const issue of parseResult.error.issues) {
          errors.push(
            `Row ${rowIdx} (${featureId}): ${issue.path.join(".")}: ${issue.message}`,
          );
        }
      }
    } else if (classification.featureClass === "histone_mark_peak") {
      const histoneMark =
        markNameCol && row[markNameCol]
          ? row[markNameCol].trim()
          : undefined;

      const featureObj: Record<string, unknown> = {
        featureId,
        featureClass: "histone_mark_peak",
        modality: "chip_seq",
        measuredRegion,
        signalMetric: options.featureValueSemantics,
        values,
      };

      if (histoneMark) {
        featureObj.histoneMark = histoneMark;
      }

      const parseResult = HistoneMarkFeatureSchema.safeParse(featureObj);
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
      classification.featureClass === "chip_peak_narrow" ||
      classification.featureClass === "chip_peak_broad"
    ) {
      // Build as generic region feature when specialized ChIP classes
      // are requested but full specialized adapter is not active
      const featureObj: Record<string, unknown> = {
        featureId,
        featureClass: classification.featureClass,
        modality: "chip_seq",
        measuredRegion,
        signalMetric: options.featureValueSemantics,
        values,
      };

      const parseResult = GenericRegionFeatureSchema.safeParse(featureObj);
      if (parseResult.success) {
        features.push(parseResult.data as GenericRegionFeature);
      } else {
        for (const issue of parseResult.error.issues) {
          errors.push(
            `Row ${rowIdx} (${featureId}): ${issue.path.join(".")}: ${issue.message}`,
          );
        }
      }
    } else if (classification.featureClass === "chromatin_interaction") {
      const featureObj: Record<string, unknown> = {
        featureId,
        featureClass: "chromatin_interaction",
        modality: options.modality,
        measuredRegion,
        signalMetric: options.featureValueSemantics,
        values,
      };

      const parseResult = GenericRegionFeatureSchema.safeParse(featureObj);
      if (parseResult.success) {
        features.push(parseResult.data as GenericRegionFeature);
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
