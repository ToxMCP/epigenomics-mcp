import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { FeatureFlagsSchema } from "../qualification/policy.js";

/**
 * Coordinate default settings.
 */
export const CoordinateDefaultsSchema = z
  .object({
    defaultGenomeBuild: z
      .string()
      .min(1)
      .default("GRCh38")
      .describe("Default genome build when not explicitly specified"),
    defaultCoordinateSystem: z
      .enum([
        "ucsc_bed_0based_half_open",
        "gff_gtf_1based_closed",
        "platform_native_probe",
        "no_coordinates_feature_id_only",
      ])
      .default("ucsc_bed_0based_half_open")
      .describe("Default coordinate system convention"),
    defaultChromosomeNaming: z
      .enum(["ucsc", "ensembl", "ncbi"])
      .default("ucsc")
      .describe("Default chromosome naming convention"),
  })
  .strict();

export type CoordinateDefaults = z.infer<typeof CoordinateDefaultsSchema>;

/**
 * Missingness threshold settings at multiple levels.
 */
export const MissingnessThresholdsSchema = z
  .object({
    probeLevelWarning: z
      .number()
      .min(0)
      .max(1)
      .default(0.05)
      .describe("Missingness rate triggering a warning at probe/feature level"),
    probeLevelExclusion: z
      .number()
      .min(0)
      .max(1)
      .default(0.2)
      .describe("Missingness rate triggering exclusion at probe/feature level"),
    sampleLevelWarning: z
      .number()
      .min(0)
      .max(1)
      .default(0.1)
      .describe("Missingness rate triggering a warning at sample level"),
    sampleLevelExclusion: z
      .number()
      .min(0)
      .max(1)
      .default(0.3)
      .describe("Missingness rate triggering exclusion at sample level"),
    groupLevelWarning: z
      .number()
      .min(0)
      .max(1)
      .default(0.1)
      .describe("Missingness rate triggering a warning at group/dose level"),
    groupLevelExclusion: z
      .number()
      .min(0)
      .max(1)
      .default(0.2)
      .describe("Missingness rate triggering exclusion at group/dose level"),
  })
  .strict()
  .refine(
    (m) => m.probeLevelExclusion >= m.probeLevelWarning,
    {
      message: "probeLevelExclusion must be >= probeLevelWarning",
      path: ["probeLevelExclusion"],
    },
  )
  .refine(
    (m) => m.sampleLevelExclusion >= m.sampleLevelWarning,
    {
      message: "sampleLevelExclusion must be >= sampleLevelWarning",
      path: ["sampleLevelExclusion"],
    },
  )
  .refine(
    (m) => m.groupLevelExclusion >= m.groupLevelWarning,
    {
      message: "groupLevelExclusion must be >= groupLevelWarning",
      path: ["groupLevelExclusion"],
    },
  );

export type MissingnessThresholds = z.infer<typeof MissingnessThresholdsSchema>;

/**
 * Replicate threshold settings.
 */
export const ReplicateThresholdsSchema = z
  .object({
    minBiologicalReplicatesPerGroup: z
      .number()
      .int()
      .min(1)
      .default(2)
      .describe("Minimum biological replicates required per group"),
    preferredBiologicalReplicatesPerGroup: z
      .number()
      .int()
      .min(1)
      .default(3)
      .describe("Preferred biological replicates per group"),
    maxCvThreshold: z
      .number()
      .min(0)
      .default(0.3)
      .describe("Maximum coefficient of variation threshold for replicate consistency"),
  })
  .strict()
  .refine(
    (r) =>
      r.preferredBiologicalReplicatesPerGroup >=
      r.minBiologicalReplicatesPerGroup,
    {
      message:
        "preferredBiologicalReplicatesPerGroup must be >= minBiologicalReplicatesPerGroup",
      path: ["preferredBiologicalReplicatesPerGroup"],
    },
  );

export type ReplicateThresholds = z.infer<typeof ReplicateThresholdsSchema>;

/**
 * Local snapshot path settings for cached resources.
 */
export const LocalSnapshotPathsSchema = z
  .object({
    annotationSnapshot: z
      .string()
      .default("./snapshots/annotations")
      .describe("Path to local annotation snapshot directory"),
    referenceGenomeCache: z
      .string()
      .default("./snapshots/reference")
      .describe("Path to local reference genome cache directory"),
    geneMappingCache: z
      .string()
      .default("./snapshots/mappings")
      .describe("Path to local gene mapping cache directory"),
    policySnapshot: z
      .string()
      .default("./snapshots/policies")
      .describe("Path to local policy snapshot directory"),
  })
  .strict();

export type LocalSnapshotPaths = z.infer<typeof LocalSnapshotPathsSchema>;

/**
 * File access policy for MCP-exposed file-reading tools.
 */
export const FileAccessPolicySchema = z
  .object({
    allowedRoots: z
      .array(z.string().min(1))
      .min(1)
      .default([process.cwd()])
      .describe("Directories under which MCP file reads are allowed"),
    maxFileBytes: z
      .number()
      .int()
      .positive()
      .default(25 * 1024 * 1024)
      .describe("Maximum file size accepted by MCP file-reading tools"),
    defaultRowLimit: z
      .number()
      .int()
      .positive()
      .default(1000)
      .describe("Default returned row limit for MCP table reads"),
    maxRowLimit: z
      .number()
      .int()
      .positive()
      .default(5000)
      .describe("Maximum returned row limit for MCP table reads"),
  })
  .strict()
  .refine((p) => p.maxRowLimit >= p.defaultRowLimit, {
    message: "maxRowLimit must be >= defaultRowLimit",
    path: ["maxRowLimit"],
  });

export type FileAccessPolicy = z.infer<typeof FileAccessPolicySchema>;

/**
 * Runtime configuration schema for Epigenomics MCP.
 *
 * All fields have deterministic defaults. Overrides are accepted via
 * explicit config files, environment variables, or programmatic objects.
 */
export const ConfigSchema = z.object({
  // Basic server settings
  name: z.string().default("epigenomics-mcp"),
  version: z.string().default("0.2.0"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default("127.0.0.1"),

  // Integration URLs
  annotationMcpUrl: z.string().optional(),
  evidenceRegistryUrl: z.string().optional(),
  bioactivityPodUrl: z.string().optional(),

  // Schema and policy versioning
  schemaVersion: z
    .string()
    .default("0.1.0")
    .describe("Version of the EpigenomicsFeatureResponsePacket schema emitted"),
  policyVersion: z
    .string()
    .default("0.1.0")
    .describe("Version of the default qualification policy"),

  // Genome build support
  supportedGenomeBuilds: z
    .array(z.string().min(1))
    .min(1)
    .default(["GRCh37", "GRCh38", "hg19", "hg38", "mm9", "mm10", "mm39", "rn6", "rn7"]),

  // Coordinate defaults
  coordinateDefaults: CoordinateDefaultsSchema.default({}),

  // Missingness thresholds
  missingnessThresholds: MissingnessThresholdsSchema.default({}),

  // Replicate thresholds
  replicateThresholds: ReplicateThresholdsSchema.default({}),

  // Feature flags (aligned with qualification policy feature flags)
  featureFlags: FeatureFlagsSchema.default({}),

  // Local snapshot paths
  localSnapshotPaths: LocalSnapshotPathsSchema.default({}),

  // MCP file access policy
  fileAccess: FileAccessPolicySchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Parse a comma-separated string into an array of trimmed strings.
 */
function parseCommaSeparated(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Parse a numeric value from an environment variable.
 */
function parseEnvNumber(
  value: string | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
}

/**
 * Parse a boolean value from an environment variable.
 */
function parseEnvBoolean(
  value: string | undefined,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

/**
 * Build a Config object from process environment variables.
 *
 * Environment variables follow the EPIMCP_ prefix convention.
 */
function configFromEnv(): Record<string, unknown> {
  const env = process.env;

  return {
    name: env.EPIMCP_NAME,
    version: env.EPIMCP_VERSION,
    logLevel: env.EPIMCP_LOG_LEVEL,
    port: parseEnvNumber(env.EPIMCP_PORT),
    host: env.EPIMCP_HOST,
    annotationMcpUrl: env.EPIMCP_ANNOTATION_MCP_URL,
    evidenceRegistryUrl: env.EPIMCP_EVIDENCE_REGISTRY_URL,
    bioactivityPodUrl: env.EPIMCP_BIOACTIVITY_POD_URL,
    schemaVersion: env.EPIMCP_SCHEMA_VERSION,
    policyVersion: env.EPIMCP_POLICY_VERSION,
    supportedGenomeBuilds: parseCommaSeparated(env.EPIMCP_SUPPORTED_GENOME_BUILDS),
    coordinateDefaults: {
      defaultGenomeBuild: env.EPIMCP_DEFAULT_GENOME_BUILD,
      defaultCoordinateSystem: env.EPIMCP_DEFAULT_COORDINATE_SYSTEM,
      defaultChromosomeNaming: env.EPIMCP_DEFAULT_CHROMOSOME_NAMING,
    },
    missingnessThresholds: {
      probeLevelWarning: parseEnvNumber(env.EPIMCP_PROBE_LEVEL_WARNING),
      probeLevelExclusion: parseEnvNumber(env.EPIMCP_PROBE_LEVEL_EXCLUSION),
      sampleLevelWarning: parseEnvNumber(env.EPIMCP_SAMPLE_LEVEL_WARNING),
      sampleLevelExclusion: parseEnvNumber(env.EPIMCP_SAMPLE_LEVEL_EXCLUSION),
      groupLevelWarning: parseEnvNumber(env.EPIMCP_GROUP_LEVEL_WARNING),
      groupLevelExclusion: parseEnvNumber(env.EPIMCP_GROUP_LEVEL_EXCLUSION),
    },
    replicateThresholds: (() => {
      const min = parseEnvNumber(env.EPIMCP_MIN_BIOLOGICAL_REPLICATES);
      const preferred = parseEnvNumber(env.EPIMCP_PREFERRED_BIOLOGICAL_REPLICATES);
      // If min is raised above the default preferred (3), adjust preferred
      // to match min unless explicitly overridden.
      const resolvedPreferred =
        preferred !== undefined
          ? preferred
          : min !== undefined && min > 3
            ? min
            : undefined;
      return {
        minBiologicalReplicatesPerGroup: min,
        preferredBiologicalReplicatesPerGroup: resolvedPreferred,
        maxCvThreshold: parseEnvNumber(env.EPIMCP_MAX_CV_THRESHOLD),
      };
    })(),
    featureFlags: {
      enableChromatinAccessibility: parseEnvBoolean(
        env.EPIMCP_ENABLE_CHROMATIN_ACCESSIBILITY,
      ),
      enableHistoneMark: parseEnvBoolean(env.EPIMCP_ENABLE_HISTONE_MARK),
      enableMirnaExpression: parseEnvBoolean(env.EPIMCP_ENABLE_MIRNA_EXPRESSION),
      enableNcrnaExpression: parseEnvBoolean(env.EPIMCP_ENABLE_NCRNA_EXPRESSION),
      enableChromatinStateContext: parseEnvBoolean(
        env.EPIMCP_ENABLE_CHROMATIN_STATE_CONTEXT,
      ),
      enableBatchEffectModeling: parseEnvBoolean(
        env.EPIMCP_ENABLE_BATCH_EFFECT_MODELING,
      ),
      enableCellDeconvolution: parseEnvBoolean(
        env.EPIMCP_ENABLE_CELL_DECONVOLUTION,
      ),
    },
    localSnapshotPaths: {
      annotationSnapshot: env.EPIMCP_ANNOTATION_SNAPSHOT_PATH,
      referenceGenomeCache: env.EPIMCP_REFERENCE_GENOME_CACHE_PATH,
      geneMappingCache: env.EPIMCP_GENE_MAPPING_CACHE_PATH,
      policySnapshot: env.EPIMCP_POLICY_SNAPSHOT_PATH,
    },
    fileAccess: {
      allowedRoots: parseCommaSeparated(env.EPIMCP_ALLOWED_FILE_ROOTS),
      maxFileBytes: parseEnvNumber(env.EPIMCP_MAX_FILE_BYTES),
      defaultRowLimit: parseEnvNumber(env.EPIMCP_DEFAULT_ROW_LIMIT),
      maxRowLimit: parseEnvNumber(env.EPIMCP_MAX_ROW_LIMIT),
    },
  };
}

/**
 * Recursively strip undefined values from an object.
 *
 * This prevents Zod from receiving explicit undefineds that would
 * override defaults in nested schemas.
 */
function stripUndefined<T extends Record<string, unknown>>(
  obj: T,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const nested = stripUndefined(value as Record<string, unknown>);
      if (Object.keys(nested).length > 0) {
        result[key] = nested;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Load configuration from environment, optional file, and explicit overrides.
 *
 * Priority (highest to lowest):
 * 1. Explicit overrides object
 * 2. Config file contents
 * 3. Environment variables
 * 4. Deterministic defaults
 *
 * Fail-closed: invalid config values throw a Zod validation error.
 */
export function loadConfig(options?: {
  filePath?: string;
  overrides?: Partial<Config>;
}): Config {
  let fileConfig: Record<string, unknown> = {};

  if (options?.filePath) {
    const content = readFileSync(resolve(options.filePath), "utf-8");
    const parsed = yaml.load(content);
    if (parsed && typeof parsed === "object") {
      fileConfig = parsed as Record<string, unknown>;
    }
  }

  const envConfig = stripUndefined(configFromEnv());

  return ConfigSchema.parse({
    ...envConfig,
    ...fileConfig,
    ...(options?.overrides ? stripUndefined(options.overrides as Record<string, unknown>) : {}),
  });
}

/**
 * Load configuration from environment variables only.
 *
 * Useful for testing or lightweight programmatic use.
 */
export function loadConfigFromEnv(): Config {
  return ConfigSchema.parse(stripUndefined(configFromEnv()));
}

/**
 * Load configuration from a YAML config file.
 */
export function loadConfigFromFile(filePath: string): Config {
  return loadConfig({ filePath });
}
