import { z } from "zod";
import {
  validateCoordinateSystemDeclarations,
  isRegionBearingFeatureClass,
  type SourceCoordinateSystem,
} from "./coordinate_validator.js";
import { validateGenomeBuilds } from "./genome_build.js";
import {
  validateChromosomeBounds,
  type ChromosomeBoundsValidationOptions,
} from "./chromosome_bounds.js";
import { normalizeCoordinateRecord } from "../coordinate_mapping/normalise.js";
import {
  validatePlatformProvenance,
  type PlatformProvenanceValidationOptions,
} from "./platform_provenance.js";
import type { ProvenanceRecord } from "../contracts/provenance.js";

// ---------------------------------------------------------------------------
// Coordinate system mapping
// ---------------------------------------------------------------------------

/**
 * Map the feature-level CoordinateSystem to the SourceCoordinateSystem
 * used by the normalization engine.
 */
function mapCoordinateSystemToSourceSystem(
  cs: string,
): SourceCoordinateSystem | undefined {
  switch (cs) {
    case "0-based-half-open":
      return "ucsc_bed_0based_half_open";
    case "1-based-closed":
      return "gff_gtf_1based_closed";
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const FeatureRegionExtractionSchema = z
  .object({
    featureId: z.string().optional(),
    featureClass: z.string().optional(),
    modality: z.string().optional(),
    measuredRegion: z
      .object({
        chrom: z.string().min(1).optional(),
        start: z.number().int().optional(),
        end: z.number().int().optional(),
        build: z.string().min(1).optional(),
        coordinateSystem: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
    measuredIdentifier: z.string().optional(),
    platformAnnotationProvenance: z.unknown().optional(),
    values: z.record(z.string(), z.number().or(z.null())).optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Options and results
// ---------------------------------------------------------------------------

export interface FeatureCoordinateValidationOptions {
  /** Permitted genome builds. Defaults to all supported builds. */
  allowedBuilds?: readonly string[];
  /** Whether mixed genome builds within a dataset block qualification. */
  blockMixedBuilds?: boolean;
  /** Whether coordinate-bearing features require an explicit build. */
  requireGenomeBuild?: boolean;
  /** Whether silent coordinate liftover is permitted (must always be false). */
  silentLiftoverAllowed?: boolean;
  /** Upstream provenance steps for liftover detection. */
  provenanceSteps?: readonly ProvenanceRecord[];
  /** Chromosome bounds validation options. */
  chromosomeBoundsOptions?: ChromosomeBoundsValidationOptions;
  /** Platform provenance validation options. */
  platformProvenanceOptions?: PlatformProvenanceValidationOptions;
  /** Whether to normalize coordinates to 0-based half-open intervals. */
  normalizeCoordinates?: boolean;
}

export interface FeatureCoordinateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Features with normalized coordinates (when normalizeCoordinates is true). */
  normalizedFeatures: Array<Record<string, unknown>>;
  mixedBuildDetected: boolean;
  buildsFound: string[];
  liftoverDetected: boolean;
  /** Whether gene/pathway interpretation is blocked. */
  blocksInterpretation: boolean;
}

// ---------------------------------------------------------------------------
// Unified validation
// ---------------------------------------------------------------------------

/**
 * Validate coordinate-bearing and platform-derived features with fail-closed
 * semantics.
 *
 * Orchestrates:
 * 1. Coordinate system declaration validation (EPI002)
 * 2. Genome build validation (EPI004)
 * 3. Chromosome bounds validation (EPI009)
 * 4. Coordinate normalization to 0-based half-open (EPI003)
 * 5. Platform annotation provenance validation (EPI010)
 *
 * Any fatal error in any sub-validator causes the overall result to be invalid.
 * Warnings are aggregated across all validators.
 */
export function validateFeatureCoordinates(
  features: unknown[],
  options: FeatureCoordinateValidationOptions = {},
): FeatureCoordinateValidationResult {
  const normalizeCoordinates = options.normalizeCoordinates ?? true;

  const errors: string[] = [];
  const warnings: string[] = [];

  // ------------------------------------------------------------------
  // 1. Coordinate system declarations
  // ------------------------------------------------------------------

  const declarations: Array<{
    featureId: string;
    featureClass: string;
    declaredSystem?: string;
  }> = [];

  for (const raw of features) {
    const parseResult = FeatureRegionExtractionSchema.safeParse(raw);
    if (!parseResult.success) {
      continue;
    }
    const feature = parseResult.data;
    if (feature.featureClass) {
      const declaredSystem = feature.measuredRegion?.coordinateSystem
        ? mapCoordinateSystemToSourceSystem(feature.measuredRegion.coordinateSystem) ??
          feature.measuredRegion.coordinateSystem
        : undefined;
      declarations.push({
        featureId: feature.featureId && feature.featureId.length > 0
          ? feature.featureId
          : "(unknown)",
        featureClass: feature.featureClass,
        declaredSystem,
      });
    }
  }

  const coordinateSystemResult =
    validateCoordinateSystemDeclarations(declarations);
  errors.push(...coordinateSystemResult.errors);
  warnings.push(...coordinateSystemResult.warnings);

  // ------------------------------------------------------------------
  // 2. Genome build validation
  // ------------------------------------------------------------------

  const genomeBuildResult = validateGenomeBuilds(features, {
    allowedBuilds: options.allowedBuilds,
    blockMixedBuilds: options.blockMixedBuilds,
    requireGenomeBuild: options.requireGenomeBuild,
    silentLiftoverAllowed: options.silentLiftoverAllowed,
    provenanceSteps: options.provenanceSteps,
  });
  errors.push(...genomeBuildResult.errors);
  warnings.push(...genomeBuildResult.warnings);

  // ------------------------------------------------------------------
  // 3. Chromosome bounds validation
  // ------------------------------------------------------------------

  const chromosomeBoundsResult = validateChromosomeBounds(
    features,
    options.chromosomeBoundsOptions,
  );
  errors.push(...chromosomeBoundsResult.errors);
  warnings.push(...chromosomeBoundsResult.warnings);

  // ------------------------------------------------------------------
  // 4. Coordinate normalization
  // ------------------------------------------------------------------

  const normalizedFeatures: Array<Record<string, unknown>> = [];

  if (normalizeCoordinates) {
    for (const raw of features) {
      const parseResult = FeatureRegionExtractionSchema.safeParse(raw);
      if (!parseResult.success) {
        // If we cannot parse the feature enough to normalize, keep the
        // original so that downstream consumers still see it.
        normalizedFeatures.push(
          raw !== null && typeof raw === "object"
            ? { ...(raw as Record<string, unknown>) }
            : {},
        );
        continue;
      }

      const feature = parseResult.data;

      if (
        feature.measuredRegion === undefined ||
        !feature.featureClass ||
        !isRegionBearingFeatureClass(feature.featureClass)
      ) {
        normalizedFeatures.push({ ...feature });
        continue;
      }

      const { chrom, start, end, build, coordinateSystem } = feature.measuredRegion;
      if (
        chrom === undefined ||
        start === undefined ||
        end === undefined ||
        build === undefined ||
        coordinateSystem === undefined
      ) {
        normalizedFeatures.push({ ...feature });
        continue;
      }

      const sourceSystem = mapCoordinateSystemToSourceSystem(
        coordinateSystem,
      );

      if (sourceSystem === undefined) {
        errors.push(
          `EPI003: Feature ${feature.featureId ?? "(unknown)"} has unsupported coordinate system "${coordinateSystem}"; cannot normalize`,
        );
        normalizedFeatures.push({ ...feature });
        continue;
      }

      const conversionResult = normalizeCoordinateRecord({
        chrom,
        start,
        end,
        sourceSystem,
        originalCoordinateText: `${chrom}:${start}-${end}`,
        build,
      });

      if (!conversionResult.success) {
        errors.push(...conversionResult.errors);
        normalizedFeatures.push({ ...feature });
        continue;
      }

      const normalized = conversionResult.normalizedRecord!;
      const normalizedFeature: Record<string, unknown> = { ...feature };
      normalizedFeature.measuredRegion = {
        chrom: normalized.chrom,
        start: normalized.start,
        end: normalized.end,
        build: normalized.build ?? build,
        coordinateSystem: "0-based-half-open",
      };
      normalizedFeatures.push(normalizedFeature);
    }
  } else {
    for (const raw of features) {
      normalizedFeatures.push(
        raw !== null && typeof raw === "object"
          ? { ...(raw as Record<string, unknown>) }
          : {},
      );
    }
  }

  // ------------------------------------------------------------------
  // 5. Platform annotation provenance validation
  // ------------------------------------------------------------------

  const platformResult = validatePlatformProvenance(
    features,
    options.platformProvenanceOptions,
  );
  errors.push(...platformResult.errors);
  warnings.push(...platformResult.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedFeatures,
    mixedBuildDetected: genomeBuildResult.mixedBuildDetected,
    buildsFound: genomeBuildResult.buildsFound,
    liftoverDetected: genomeBuildResult.liftoverDetected,
    blocksInterpretation: platformResult.blocksInterpretation,
  };
}
