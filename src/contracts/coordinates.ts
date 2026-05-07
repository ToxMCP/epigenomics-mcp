import { z } from "zod";

/**
 * Supported genome builds.
 */
export const GenomeBuildSchema = z.enum([
  "GRCh37",
  "GRCh38",
  "hg19",
  "hg38",
  "mm9",
  "mm10",
  "mm39",
  "rn6",
  "rn7",
]);

export type GenomeBuild = z.infer<typeof GenomeBuildSchema>;

/**
 * Coordinate system conventions.
 */
export const CoordinateSystemSchema = z.enum([
  "0-based-half-open",
  "1-based-closed",
]);

export type CoordinateSystem = z.infer<typeof CoordinateSystemSchema>;

/**
 * Genomic interval with strict coordinate semantics.
 */
export const GenomicRegionSchema = z
  .object({
    chrom: z
      .string()
      .min(1)
      .regex(/^(chr[0-9XYM]+|[0-9XYM]+)$/)
      .describe("Chromosome identifier"),
    start: z.number().int().nonnegative().describe("Start coordinate"),
    end: z.number().int().nonnegative().describe("End coordinate"),
    build: GenomeBuildSchema.describe("Genome build"),
    coordinateSystem: CoordinateSystemSchema.describe(
      "Coordinate convention",
    ),
  })
  .strict()
  .refine((r) => r.end > r.start, {
    message: "end must be greater than start",
    path: ["end"],
  });

export type GenomicRegion = z.infer<typeof GenomicRegionSchema>;

/**
 * Genomic coordinate with optional strand.
 *
 * Extends GenomicRegion with strand orientation. Strand defaults to
 * "." (unknown) when not provided.
 */
export const GenomicCoordinateSchema = z
  .object({
    chrom: z
      .string()
      .min(1)
      .regex(/^(chr[0-9XYM]+|[0-9XYM]+)$/)
      .describe("Chromosome identifier"),
    start: z.number().int().nonnegative().describe("Start coordinate"),
    end: z.number().int().nonnegative().describe("End coordinate"),
    build: GenomeBuildSchema.describe("Genome build"),
    coordinateSystem: CoordinateSystemSchema.describe(
      "Coordinate convention",
    ),
    strand: z
      .enum(["+", "-", "."])
      .default(".")
      .describe("Strand orientation"),
  })
  .strict()
  .refine((r) => r.end > r.start, {
    message: "end must be greater than start",
    path: ["end"],
  });

export type GenomicCoordinate = z.infer<typeof GenomicCoordinateSchema>;
