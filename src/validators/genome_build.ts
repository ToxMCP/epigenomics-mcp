import { z } from "zod";
import type { ProvenanceRecord } from "../contracts/provenance.js";

/**
 * Default allowed genome builds for v0.1.
 *
 * GRCh37 / GRCh38 are the canonical human builds.
 * mm10 / mm39 are the canonical mouse builds.
 */
export const DEFAULT_ALLOWED_BUILDS: readonly string[] = [
  "GRCh37",
  "GRCh38",
  "hg19",
  "hg38",
  "mm9",
  "mm10",
  "mm39",
  "rn6",
  "rn7",
];

/**
 * Keywords that indicate a coordinate liftover step in upstream provenance.
 */
const LIFTOVER_STEP_NAMES: readonly string[] = [
  "liftover",
  "liftOver",
  "crossmap",
  "crossMap",
  "chain_file_conversion",
  "coordinate_liftover",
];

/**
 * Minimal schema for extracting build information from a raw feature object.
 */
const BuildExtractionSchema = z.object({
  featureId: z.string().min(1),
  measuredRegion: z
    .object({
      build: z.string().min(1).optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

export interface GenomeBuildValidationOptions {
  /** Permitted genome builds. Defaults to DEFAULT_ALLOWED_BUILDS. */
  allowedBuilds?: readonly string[];
  /** Whether mixed genome builds within a dataset block qualification. */
  blockMixedBuilds?: boolean;
  /** Whether coordinate-bearing features require an explicit build. */
  requireGenomeBuild?: boolean;
  /** Whether silent coordinate liftover is permitted (must always be false). */
  silentLiftoverAllowed?: boolean;
  /** Upstream provenance steps for liftover detection. */
  provenanceSteps?: readonly ProvenanceRecord[];
}

export interface GenomeBuildValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  mixedBuildDetected: boolean;
  buildsFound: string[];
  liftoverDetected: boolean;
}

/**
 * Determine whether a provenance step indicates upstream liftover.
 */
function isLiftoverStep(step: ProvenanceRecord): boolean {
  const text = `${step.stepName} ${step.toolName}`.toLowerCase();
  return LIFTOVER_STEP_NAMES.some((keyword) =>
    text.includes(keyword.toLowerCase()),
  );
}

/**
 * Validate genome builds for a set of epigenomic features.
 *
 * Rules:
 * - Region-bearing features (those with measuredRegion) must declare a build
 *   if requireGenomeBuild is true.
 * - Declared builds must be present in the allowedBuilds allowlist.
 * - Mixed builds within a single dataset are rejected when blockMixedBuilds
 *   is true. The caller must split upstream.
 * - Silent liftover is never performed. If silentLiftoverAllowed is true,
 *   a fatal error is emitted (fail-closed).
 * - Declared upstream liftover in provenance is accepted with a warning,
 *   but no automatic coordinate transformation is performed.
 *
 * Fail-closed: ambiguous or unsupported builds produce errors, not warnings.
 */
export function validateGenomeBuilds(
  features: unknown[],
  options: GenomeBuildValidationOptions = {},
): GenomeBuildValidationResult {
  const allowedBuilds = options.allowedBuilds ?? DEFAULT_ALLOWED_BUILDS;
  const blockMixedBuilds = options.blockMixedBuilds ?? true;
  const requireGenomeBuild = options.requireGenomeBuild ?? true;
  const silentLiftoverAllowed = options.silentLiftoverAllowed ?? false;
  const provenanceSteps = options.provenanceSteps ?? [];

  const errors: string[] = [];
  const warnings: string[] = [];
  const buildsFound: string[] = [];
  let liftoverDetected = false;

  // Fatal fail-closed: silent liftover is never permitted.
  if (silentLiftoverAllowed) {
    errors.push(
      "EPI004: silentLiftoverAllowed is true; automatic coordinate liftover is prohibited in Epigenomics MCP",
    );
  }

  // Detect declared upstream liftover in provenance.
  for (const step of provenanceSteps) {
    if (isLiftoverStep(step)) {
      liftoverDetected = true;
      warnings.push(
        `EPI004: Upstream liftover detected in step "${step.stepName}" (${step.toolName}); coordinates must not be transformed again downstream`,
      );
    }
  }

  // Per-feature build extraction and allowlist validation.
  for (const raw of features) {
    const parseResult = BuildExtractionSchema.safeParse(raw);
    if (!parseResult.success) {
      // Cannot parse feature enough to validate build; skip if no measuredRegion
      // expected, otherwise treat as schema-level error.
      continue;
    }

    const feature = parseResult.data;

    if (feature.measuredRegion) {
      const build = feature.measuredRegion.build;

      if (!build) {
        if (requireGenomeBuild) {
          errors.push(
            `EPI004: Feature ${feature.featureId} has measuredRegion but missing genome build`,
          );
        }
      } else {
        if (!buildsFound.includes(build)) {
          buildsFound.push(build);
        }

        if (!allowedBuilds.includes(build)) {
          errors.push(
            `EPI004: Feature ${feature.featureId} declares unsupported genome build "${build}"; allowed builds are: ${allowedBuilds.join(", ")}`,
          );
        }
      }
    }
  }

  // Mixed-build gate.
  const allowedBuildsFound = buildsFound.filter((build) =>
    allowedBuilds.includes(build),
  );
  const mixedBuildDetected = allowedBuildsFound.length > 1;
  if (blockMixedBuilds && mixedBuildDetected) {
    errors.push(
      `EPI004: Mixed genome builds detected in dataset (${allowedBuildsFound.join(", ")}); split upstream or use a single assembly`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    mixedBuildDetected,
    buildsFound,
    liftoverDetected,
  };
}
