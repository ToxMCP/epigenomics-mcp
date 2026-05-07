import { z } from "zod";
import type { FeatureClass } from "./features.js";

/**
 * Supported measurement semantics for epigenomic feature values.
 *
 * Explicit declaration is mandatory.  The system never infers semantics
 * from numeric ranges or column names.
 */
export const MeasurementSemanticsSchema = z.enum([
  "beta_value",
  "m_value",
  "percent_methylation",
  "delta_beta",
  "delta_m",
  "accessibility_signal",
  "peak_score",
  "read_count",
  "normalized_signal",
  "effect_size",
  "q_value",
  "declared_other",
]);

export type MeasurementSemantics = z.infer<typeof MeasurementSemanticsSchema>;

/**
 * Compatibility mapping between feature classes and allowed measurement semantics.
 *
 * Fail-closed: if a feature class is not listed, no semantics are considered valid.
 */
export const FEATURE_CLASS_SEMANTICS_COMPATIBILITY: Readonly<
  Record<FeatureClass, readonly MeasurementSemantics[]>
> = {
  cpg_methylation: [
    "beta_value",
    "m_value",
    "percent_methylation",
    "delta_beta",
    "delta_m",
    "declared_other",
  ],
  dmr: [
    "beta_value",
    "m_value",
    "percent_methylation",
    "delta_beta",
    "delta_m",
    "effect_size",
    "q_value",
    "declared_other",
  ],
  differential_methylated_region: [
    "beta_value",
    "m_value",
    "percent_methylation",
    "delta_beta",
    "delta_m",
    "effect_size",
    "q_value",
    "declared_other",
  ],
  atac_peak: [
    "accessibility_signal",
    "peak_score",
    "read_count",
    "normalized_signal",
    "effect_size",
    "q_value",
    "declared_other",
  ],
  chip_peak_narrow: [
    "peak_score",
    "read_count",
    "normalized_signal",
    "effect_size",
    "q_value",
    "declared_other",
  ],
  chip_peak_broad: [
    "peak_score",
    "read_count",
    "normalized_signal",
    "effect_size",
    "q_value",
    "declared_other",
  ],
  histone_mark_peak: [
    "peak_score",
    "read_count",
    "normalized_signal",
    "effect_size",
    "q_value",
    "declared_other",
  ],
  generic_region_feature: [
    "peak_score",
    "read_count",
    "normalized_signal",
    "effect_size",
    "q_value",
    "accessibility_signal",
    "declared_other",
  ],
  chromatin_interaction: [
    "normalized_signal",
    "effect_size",
    "q_value",
    "read_count",
    "declared_other",
  ],
  ncrna_expression: [
    "normalized_signal",
    "read_count",
    "effect_size",
    "q_value",
    "declared_other",
  ],
  mirna_expression: [
    "normalized_signal",
    "read_count",
    "effect_size",
    "q_value",
    "declared_other",
  ],
  gene_linked_feature: [
    "beta_value",
    "m_value",
    "percent_methylation",
    "delta_beta",
    "delta_m",
    "accessibility_signal",
    "peak_score",
    "read_count",
    "normalized_signal",
    "effect_size",
    "q_value",
    "declared_other",
  ],
};

/**
 * Validate that a measurement semantic is compatible with a given feature class.
 */
export function isMeasurementSemanticsCompatible(
  featureClass: FeatureClass,
  semantics: MeasurementSemantics,
): boolean {
  const allowed = FEATURE_CLASS_SEMANTICS_COMPATIBILITY[featureClass];
  if (!allowed) {
    return false;
  }
  return allowed.includes(semantics);
}

/**
 * Error thrown when measurement semantics are incompatible with a feature class.
 */
export class MeasurementSemanticsCompatibilityError extends Error {
  constructor(
    public readonly featureClass: FeatureClass,
    public readonly semantics: MeasurementSemantics,
  ) {
    super(
      `Measurement semantic "${semantics}" is not compatible with feature class "${featureClass}"`,
    );
    this.name = "MeasurementSemanticsCompatibilityError";
  }
}
