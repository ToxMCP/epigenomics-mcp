import { z } from "zod";
import { PlatformAnnotationProvenanceSchema } from "../contracts/provenance.js";

/**
 * Modalities that inherently require platform annotation provenance.
 */
const ARRAY_DERIVED_MODALITIES: readonly string[] = [
  "dna_methylation_array",
];

/**
 * Feature classes that are typically platform-derived when a measuredIdentifier
 * is present.
 */
const PLATFORM_DERIVED_FEATURE_CLASSES: readonly string[] = [
  "cpg_methylation",
];

/**
 * Minimal extraction schema for platform validation.
 */
const PlatformFeatureExtractionSchema = z
  .object({
    featureId: z.string().min(1),
    modality: z.string().optional(),
    featureClass: z.string().optional(),
    measuredIdentifier: z.string().optional(),
    platformAnnotationProvenance: z.unknown().optional(),
  })
  .passthrough();

export interface PlatformProvenanceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Whether gene/pathway interpretation is blocked due to provenance issues. */
  blocksInterpretation: boolean;
}

export interface PlatformProvenanceValidationOptions {
  /** Whether to require platform annotation provenance for array-derived features. */
  requirePlatformProvenance?: boolean;
  /** Whether to require annotation hash/digest. */
  requireAnnotationHash?: boolean;
  /** Whether missing/incomplete provenance blocks gene/pathway interpretation. */
  blockGenePathwayWithoutProvenance?: boolean;
}

/**
 * Determine whether a feature is platform-derived and therefore requires
 * platform annotation provenance.
 */
export function isPlatformDerivedFeature(feature: {
  modality?: string;
  featureClass?: string;
  measuredIdentifier?: string;
}): boolean {
  if (
    feature.modality !== undefined &&
    ARRAY_DERIVED_MODALITIES.includes(feature.modality)
  ) {
    return true;
  }
  if (
    feature.featureClass !== undefined &&
    PLATFORM_DERIVED_FEATURE_CLASSES.includes(feature.featureClass) &&
    feature.measuredIdentifier !== undefined
  ) {
    return true;
  }
  return false;
}

/**
 * Validate platform annotation provenance for a set of epigenomic features.
 *
 * Rules (fail-closed):
 * - Array-derived features (dna_methylation_array modality) must declare
 *   platformAnnotationProvenance.
 * - Platform-derived feature classes with a measuredIdentifier must declare
 *   platformAnnotationProvenance.
 * - Declared provenance must satisfy the PlatformAnnotationProvenanceSchema.
 * - When requireAnnotationHash is true, a missing annotationHash produces a
 *   warning (not a fatal error, to allow gradual adoption).
 * - Missing or invalid provenance blocks gene/pathway interpretation when
 *   blockGenePathwayWithoutProvenance is true.
 *
 * Error code: EPI010
 */
export function validatePlatformProvenance(
  features: unknown[],
  options: PlatformProvenanceValidationOptions = {},
): PlatformProvenanceValidationResult {
  const requirePlatformProvenance = options.requirePlatformProvenance ?? true;
  const requireAnnotationHash = options.requireAnnotationHash ?? false;
  const blockGenePathwayWithoutProvenance =
    options.blockGenePathwayWithoutProvenance ?? true;

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const raw of features) {
    const parseResult = PlatformFeatureExtractionSchema.safeParse(raw);
    if (!parseResult.success) {
      continue;
    }

    const feature = parseResult.data;

    if (!isPlatformDerivedFeature(feature)) {
      continue;
    }

    if (feature.platformAnnotationProvenance === undefined) {
      if (requirePlatformProvenance) {
        errors.push(
          `EPI010: Feature ${feature.featureId} is array/probe-derived but missing platformAnnotationProvenance`,
        );
      } else {
        warnings.push(
          `EPI010: Feature ${feature.featureId} is array/probe-derived but missing platformAnnotationProvenance`,
        );
      }
      continue;
    }

    // Validate the provenance schema
    const provenanceResult = PlatformAnnotationProvenanceSchema.safeParse(
      feature.platformAnnotationProvenance,
    );
    if (!provenanceResult.success) {
      for (const issue of provenanceResult.error.issues) {
        errors.push(
          `EPI010: Feature ${feature.featureId} has invalid platformAnnotationProvenance: ${issue.path.join(".")}: ${issue.message}`,
        );
      }
      continue;
    }

    const provenance = provenanceResult.data;

    // Warn if annotation hash is missing when required
    if (requireAnnotationHash && !provenance.annotationHash) {
      warnings.push(
        `EPI010: Feature ${feature.featureId} platformAnnotationProvenance missing annotationHash`,
      );
    }
  }

  const hasIssues = errors.length > 0 || warnings.length > 0;
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    blocksInterpretation:
      blockGenePathwayWithoutProvenance && hasIssues,
  };
}
