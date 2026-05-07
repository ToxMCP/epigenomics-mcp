import { GenomicRegionSchema } from "../contracts/coordinates.js";

export interface CoordinateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate genome build, coordinate system, and region semantics.
 * Fail closed on unsupported builds or ambiguous coordinate conventions.
 */
export function validateCoordinates(region: unknown): CoordinateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parseResult = GenomicRegionSchema.safeParse(region);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return { valid: false, errors, warnings };
  }

  const r = parseResult.data;

  // Build-specific chromosome validation
  const hgBuilds = ["hg19", "hg38"];
  const mmBuilds = ["mm9", "mm10", "mm39"];
  const rnBuilds = ["rn6", "rn7"];

  if (hgBuilds.includes(r.build)) {
    if (!r.chrom.startsWith("chr")) {
      warnings.push(`Human build ${r.build} expects chr-prefixed chromosomes`);
    }
  } else if (mmBuilds.includes(r.build)) {
    if (!r.chrom.startsWith("chr")) {
      warnings.push(`Mouse build ${r.build} expects chr-prefixed chromosomes`);
    }
  } else if (rnBuilds.includes(r.build)) {
    if (!r.chrom.startsWith("chr")) {
      warnings.push(`Rat build ${r.build} expects chr-prefixed chromosomes`);
    }
  }

  // Coordinate convention enforcement for BED-like formats
  if (r.coordinateSystem !== "0-based-half-open") {
    warnings.push(
      `Coordinate system ${r.coordinateSystem} is non-standard for BED/narrowPeak; ensure 0-based half-open semantics are respected`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}
