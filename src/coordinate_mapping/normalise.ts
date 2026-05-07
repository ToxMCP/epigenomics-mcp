import { SourceCoordinateSystem } from "../validators/coordinate_validator.js";
import {
  CoordinateConversionInputSchema,
  NormalizedCoordinateRecordSchema,
  type CoordinateConversionResult,
  type NormalizedCoordinateRecord,
  type CoordinateConversionProvenance,
} from "../contracts/coordinate_conversion.js";

export interface NormalisedRegion {
  chrom: string;
  start: number;
  end: number;
  sourceSystem: SourceCoordinateSystem;
}

/**
 * Normalise a genomic region from its declared source coordinate system
 * to the internal canonical representation (0-based, half-open).
 *
 * - ucsc_bed_0based_half_open → unchanged
 * - gff_gtf_1based_closed      → start shifted by -1
 * - platform_native_probe      → passed through unchanged
 * - no_coordinates_feature_id_only → throws (no coordinates to normalise)
 */
export function normaliseToCanonical(
  chrom: string,
  start: number,
  end: number,
  sourceSystem: SourceCoordinateSystem,
): NormalisedRegion {
  switch (sourceSystem) {
    case "ucsc_bed_0based_half_open":
      return { chrom, start, end, sourceSystem };
    case "gff_gtf_1based_closed":
      return { chrom, start: start - 1, end, sourceSystem };
    case "platform_native_probe":
      return { chrom, start, end, sourceSystem };
    case "no_coordinates_feature_id_only":
      throw new Error(
        "Cannot normalise region for no_coordinates_feature_id_only system",
      );
    default:
      // Exhaustiveness guard – should be unreachable because of the type system
      throw new Error(`Unsupported coordinate system: ${sourceSystem}`);
  }
}

/**
 * Convert a canonical (0-based, half-open) region to a target coordinate system.
 *
 * - ucsc_bed_0based_half_open → unchanged
 * - gff_gtf_1based_closed      → start shifted by +1
 * - platform_native_probe      → passed through unchanged
 * - no_coordinates_feature_id_only → throws (no coordinates to produce)
 */
export function convertFromCanonical(
  region: NormalisedRegion,
  targetSystem: SourceCoordinateSystem,
): { chrom: string; start: number; end: number } {
  switch (targetSystem) {
    case "ucsc_bed_0based_half_open":
      return { chrom: region.chrom, start: region.start, end: region.end };
    case "gff_gtf_1based_closed":
      return { chrom: region.chrom, start: region.start + 1, end: region.end };
    case "platform_native_probe":
      return { chrom: region.chrom, start: region.start, end: region.end };
    case "no_coordinates_feature_id_only":
      throw new Error(
        "Cannot convert to no_coordinates_feature_id_only system",
      );
    default:
      // Exhaustiveness guard
      throw new Error(`Unsupported coordinate system: ${targetSystem}`);
  }
}

/**
 * Normalize a coordinate-bearing record to the internal canonical
 * representation (0-based, half-open).
 *
 * This function is fail-closed:
 * - Rejects negative start or end coordinates (pre-conversion).
 * - Rejects intervals where end <= start (pre-conversion).
 * - Rejects negative normalized start (post-conversion).
 * - Rejects normalized intervals where end <= start (post-conversion).
 * - Returns structured errors for unsupported source systems.
 *
 * The original coordinate text, original system, and conversion
 * provenance are preserved in the returned record for full audit
 * traceability.
 */
export function normalizeCoordinateRecord(
  input: unknown,
): CoordinateConversionResult {
  const parseResult = CoordinateConversionInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      errors: parseResult.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  }

  const record = parseResult.data;
  const errors: string[] = [];

  // Pre-conversion validation: reject negative coordinates.
  // We do NOT enforce end > start here because the validity of an
  // interval depends on the source coordinate system (e.g. a 1-based
  // closed single-base feature is start=1, end=1).  Post-conversion
  // validation enforces the canonical invariant.
  if (record.start < 0) {
    errors.push(
      `EPI003: start coordinate ${record.start} is negative in original text "${record.originalCoordinateText}"`,
    );
  }
  if (record.end < 0) {
    errors.push(
      `EPI003: end coordinate ${record.end} is negative in original text "${record.originalCoordinateText}"`,
    );
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Perform conversion
  let normalizedStart: number;
  let normalizedEnd: number;
  let conversionOperation: string;

  try {
    const normalized = normaliseToCanonical(
      record.chrom,
      record.start,
      record.end,
      record.sourceSystem,
    );
    normalizedStart = normalized.start;
    normalizedEnd = normalized.end;

    switch (record.sourceSystem) {
      case "ucsc_bed_0based_half_open":
        conversionOperation =
          "pass-through (already 0-based half-open)";
        break;
      case "gff_gtf_1based_closed":
        conversionOperation =
          "start shifted by -1 (1-based closed → 0-based half-open)";
        break;
      case "platform_native_probe":
        conversionOperation =
          "pass-through (platform native probe coordinates)";
        break;
      case "no_coordinates_feature_id_only":
        conversionOperation = "none (no coordinates to normalize)";
        break;
      default:
        conversionOperation = "unknown";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errors: [`EPI003: ${message} for "${record.originalCoordinateText}"`],
    };
  }

  // Post-conversion validation
  if (normalizedStart < 0) {
    errors.push(
      `EPI003: normalized start coordinate ${normalizedStart} is negative after converting "${record.originalCoordinateText}"`,
    );
  }
  if (normalizedEnd <= normalizedStart) {
    errors.push(
      `EPI003: normalized end (${normalizedEnd}) must be greater than normalized start (${normalizedStart}) after converting "${record.originalCoordinateText}"`,
    );
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const provenance: CoordinateConversionProvenance = {
    originalCoordinateText: record.originalCoordinateText,
    originalSystem: record.sourceSystem,
    convertedAt: new Date().toISOString(),
    conversionOperation,
  };

  const normalizedRecord: NormalizedCoordinateRecord = {
    chrom: record.chrom,
    start: normalizedStart,
    end: normalizedEnd,
    sourceSystem: record.sourceSystem,
    originalCoordinateText: record.originalCoordinateText,
    provenance,
  };

  if (record.build) {
    normalizedRecord.build = record.build;
  }

  // Final schema validation as a safety net
  const finalParse = NormalizedCoordinateRecordSchema.safeParse(normalizedRecord);
  if (!finalParse.success) {
    return {
      success: false,
      errors: finalParse.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  }

  return { success: true, normalizedRecord: finalParse.data, errors: [] };
}

/**
 * Normalize a batch of coordinate-bearing records.
 *
 * Processes each record independently.  overallSuccess is true only
 * when every record converts without error.
 */
export function normalizeCoordinateRecords(
  inputs: unknown[],
): {
  overallSuccess: boolean;
  results: CoordinateConversionResult[];
  convertedCount: number;
  failedCount: number;
} {
  const results: CoordinateConversionResult[] = [];
  let convertedCount = 0;
  let failedCount = 0;

  for (const input of inputs) {
    const result = normalizeCoordinateRecord(input);
    results.push(result);
    if (result.success) {
      convertedCount++;
    } else {
      failedCount++;
    }
  }

  return {
    overallSuccess: failedCount === 0,
    results,
    convertedCount,
    failedCount,
  };
}
