import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { z } from "zod";
import yaml from "js-yaml";

/**
 * Public data archive sources supported for frozen fixture placeholders.
 */
export const PublicFixtureSourceSchema = z.enum([
  "geo",
  "encode",
  "biostudies",
  "sra",
  "arrayexpress",
]);

export type PublicFixtureSource = z.infer<typeof PublicFixtureSourceSchema>;

/**
 * Curation lifecycle status for a public fixture placeholder.
 */
export const PublicFixtureCurationStatusSchema = z.enum([
  "placeholder",
  "staged",
  "downloaded",
  "validated",
  "rejected",
]);

export type PublicFixtureCurationStatus = z.infer<
  typeof PublicFixtureCurationStatusSchema
>;

/**
 * Availability of the actual fixture data files on local disk.
 */
export const PublicFixtureAvailabilitySchema = z.enum([
  "unavailable",
  "pending_download",
  "available",
]);

export type PublicFixtureAvailability = z.infer<
  typeof PublicFixtureAvailabilitySchema
>;

/**
 * License classification for public datasets.
 *
 * These are broad buckets; downstream consumers must verify the exact
 * license terms before redistribution or commercial use.
 */
export const PublicFixtureLicenseSchema = z.enum([
  "public_domain",
  "cc0",
  "cc_by",
  "cc_by_sa",
  "cc_by_nc",
  "custom",
  "unknown",
]);

export type PublicFixtureLicense = z.infer<typeof PublicFixtureLicenseSchema>;

/**
 * Checksum record for a frozen fixture file.
 */
export const FixtureChecksumSchema = z
  .object({
    algorithm: z.enum(["sha256", "md5", "blake3"]),
    hash: z.string().min(1),
    filePath: z.string().min(1).describe("Relative path within fixture directory"),
  })
  .strict();

export type FixtureChecksum = z.infer<typeof FixtureChecksumSchema>;

/**
 * Single public-realism fixture placeholder.
 *
 * Describes a processed public dataset that may become a benchmark fixture
 * in v0.2/v1.0.  The placeholder itself is lightweight and does not contain
 * actual assay data.
 */
export const PublicFixturePlaceholderSchema = z
  .object({
    fixtureId: z.string().min(1).describe("Stable fixture identifier"),
    accession: z.string().min(1).describe("Primary public archive accession"),
    secondaryAccessions: z
      .array(z.string().min(1))
      .default([])
      .describe("Related accessions (e.g., SRA run IDs, ENCODE file IDs)"),
    source: PublicFixtureSourceSchema.describe("Primary archive source"),
    title: z.string().min(1).describe("Human-readable dataset title"),
    description: z.string().min(1).describe("Brief description of the dataset"),
    assayModality: z
      .enum([
        "dna_methylation_array",
        "dna_methylation_bsseq",
        "atac_seq",
        "chip_seq",
        "hic",
        "mirna_expression",
      ])
      .describe("Assay modality"),
    organism: z.string().min(1).describe("Organism name (e.g., Homo sapiens)"),
    cellLineOrTissue: z
      .string()
      .min(1)
      .describe("Cell line or tissue used in the study"),
    genomeBuild: z.string().min(1).describe("Reference genome build"),
    processedDataUrl: z
      .string()
      .url()
      .optional()
      .describe("URL to processed data if available"),
    licensing: z.object({
      classification: PublicFixtureLicenseSchema,
      verbatim: z.string().optional().describe("Verbatim license text or URL"),
      redistributionPermitted: z
        .boolean()
        .optional()
        .describe("Whether redistribution is explicitly permitted"),
      commercialUsePermitted: z
        .boolean()
        .optional()
        .describe("Whether commercial use is explicitly permitted"),
      attributionRequired: z
        .boolean()
        .optional()
        .describe("Whether attribution is required"),
    }),
    checksums: z
      .array(FixtureChecksumSchema)
      .min(1)
      .describe("Expected checksums for downloaded fixture files"),
    curationStatus: PublicFixtureCurationStatusSchema.describe(
      "Current curation lifecycle status",
    ),
    availability: PublicFixtureAvailabilitySchema.describe(
      "Local availability of fixture data files",
    ),
    curationNotes: z
      .string()
      .optional()
      .describe("Free-form curation notes and caveats"),
    expectedFeatureCount: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Expected number of features after ingestion"),
    expectedSampleCount: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Expected number of samples"),
    v0_1BlockedReason: z
      .string()
      .optional()
      .describe("Reason this fixture is blocked from v0.1 CI"),
  })
  .strict();

export type PublicFixturePlaceholder = z.infer<
  typeof PublicFixturePlaceholderSchema
>;

/**
 * Manifest containing all frozen public fixture placeholders.
 */
export const PublicFixtureManifestSchema = z
  .object({
    version: z.string().min(1),
    description: z.string().min(1),
    placeholders: z
      .array(PublicFixturePlaceholderSchema)
      .min(1)
      .describe("All public fixture placeholders"),
  })
  .strict();

export type PublicFixtureManifest = z.infer<typeof PublicFixtureManifestSchema>;

/**
 * Load and validate a public fixture manifest from a YAML file path.
 */
export function loadPublicFixtureManifest(path: string): PublicFixtureManifest {
  const raw = readFileSync(path, "utf-8");
  const parsed = yaml.load(raw);
  return PublicFixtureManifestSchema.parse(parsed);
}

/**
 * Discover all public fixture placeholder YAML files in a directory.
 *
 * Each file is expected to contain a single PublicFixturePlaceholder.
 */
export function discoverPublicFixturePlaceholders(
  dir: string,
): PublicFixturePlaceholder[] {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && extname(e.name) === ".yaml")
    .map((e) => join(dir, e.name));

  const placeholders: PublicFixturePlaceholder[] = [];
  for (const file of files) {
    const raw = readFileSync(file, "utf-8");
    const parsed = yaml.load(raw);
    placeholders.push(PublicFixturePlaceholderSchema.parse(parsed));
  }

  return placeholders;
}

/**
 * Determine whether a public fixture is locally available for benchmarking.
 *
 * A fixture is considered available when its availability field is "available"
 * AND the fixture data directory exists on disk.
 */
export function isPublicFixtureAvailable(
  placeholder: PublicFixturePlaceholder,
  fixtureDataDir?: string,
): boolean {
  if (placeholder.availability !== "available") {
    return false;
  }

  if (fixtureDataDir !== undefined) {
    return existsSync(fixtureDataDir);
  }

  return true;
}

/**
 * Environment variable used to opt-in to running benchmarks that depend on
 * unavailable public fixtures.
 */
const ENABLE_PUBLIC_FIXTURES_ENV = "EPIMCP_ENABLE_PUBLIC_FIXTURES";

/**
 * Check whether public fixture benchmarks are explicitly enabled.
 */
export function arePublicFixturesEnabled(): boolean {
  const value = process.env[ENABLE_PUBLIC_FIXTURES_ENV];
  return value === "1" || value === "true";
}

/**
 * Determine whether a benchmark referencing a public fixture should be skipped.
 *
 * Returns true (should skip) when:
 * - The fixture is unavailable locally, AND
 * - Public fixtures are not explicitly enabled.
 */
export function shouldSkipPublicFixtureBenchmark(
  placeholder: PublicFixturePlaceholder,
  fixtureDataDir?: string,
): boolean {
  if (isPublicFixtureAvailable(placeholder, fixtureDataDir)) {
    return false;
  }
  return !arePublicFixturesEnabled();
}
