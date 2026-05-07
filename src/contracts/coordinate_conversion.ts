import { z } from "zod";
import { GenomeBuildSchema } from "./coordinates.js";
import { SourceCoordinateSystemSchema } from "../validators/coordinate_validator.js";

/**
 * Input record for coordinate conversion.
 *
 * Carries the raw coordinates as they appear in the source data,
 * the declared source coordinate system, and the original text
 * representation for audit traceability.
 */
export const CoordinateConversionInputSchema = z
  .object({
    chrom: z.string().min(1).describe("Chromosome identifier"),
    start: z.number().int().describe("Start coordinate in original system"),
    end: z.number().int().describe("End coordinate in original system"),
    sourceSystem: SourceCoordinateSystemSchema.describe(
      "Original coordinate system",
    ),
    originalCoordinateText: z
      .string()
      .min(1)
      .describe("Original coordinate text as provided by the source"),
    build: GenomeBuildSchema.optional().describe("Genome build, if known"),
  })
  .strict();

export type CoordinateConversionInput = z.infer<
  typeof CoordinateConversionInputSchema
>;

/**
 * Provenance record for a coordinate conversion operation.
 *
 * Captures the original text, original system, timestamp, and the
 * operation applied so that downstream consumers can reconstruct
 * the lineage of every normalized interval.
 */
export const CoordinateConversionProvenanceSchema = z
  .object({
    originalCoordinateText: z
      .string()
      .min(1)
      .describe("Original coordinate text as provided by the source"),
    originalSystem: SourceCoordinateSystemSchema.describe(
      "Original coordinate system",
    ),
    convertedAt: z
      .string()
      .datetime()
      .describe("ISO-8601 timestamp of conversion"),
    conversionOperation: z
      .string()
      .min(1)
      .describe("Human-readable description of the conversion applied"),
  })
  .strict();

export type CoordinateConversionProvenance = z.infer<
  typeof CoordinateConversionProvenanceSchema
>;

/**
 * Normalized coordinate record in the internal canonical representation
 * (0-based, half-open).
 *
 * Retains the original coordinate text and provenance for full
 * auditability.  All numeric coordinates are validated to be
 * non-negative and to satisfy end > start.
 */
export const NormalizedCoordinateRecordSchema = z
  .object({
    chrom: z.string().min(1).describe("Chromosome identifier"),
    start: z.number().int().nonnegative().describe("Normalized start"),
    end: z.number().int().nonnegative().describe("Normalized end"),
    build: GenomeBuildSchema.optional().describe("Genome build"),
    sourceSystem: SourceCoordinateSystemSchema.describe(
      "Original coordinate system",
    ),
    originalCoordinateText: z
      .string()
      .min(1)
      .describe("Original coordinate text as provided by the source"),
    provenance: CoordinateConversionProvenanceSchema.describe(
      "Conversion provenance",
    ),
  })
  .strict()
  .refine((r) => r.end > r.start, {
    message: "end must be greater than start",
    path: ["end"],
  });

export type NormalizedCoordinateRecord = z.infer<
  typeof NormalizedCoordinateRecordSchema
>;

/**
 * Result of a single coordinate conversion attempt.
 *
 * Fail-closed: success is false whenever validation fails, the
 * source system is unsupported, or the conversion yields an
 * invalid interval.
 */
export const CoordinateConversionResultSchema = z
  .object({
    success: z.boolean().describe("Whether conversion succeeded"),
    normalizedRecord: NormalizedCoordinateRecordSchema.optional().describe(
      "Normalized record on success",
    ),
    errors: z
      .array(z.string())
      .default([])
      .describe("Structured error messages on failure"),
  })
  .strict();

export type CoordinateConversionResult = z.infer<
  typeof CoordinateConversionResultSchema
>;

/**
 * Batch conversion result for multiple coordinate records.
 */
export const BatchCoordinateConversionResultSchema = z
  .object({
    overallSuccess: z
      .boolean()
      .describe("True only if every record converted successfully"),
    results: z
      .array(CoordinateConversionResultSchema)
      .describe("Individual conversion results in input order"),
    convertedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
  })
  .strict();

export type BatchCoordinateConversionResult = z.infer<
  typeof BatchCoordinateConversionResultSchema
>;
