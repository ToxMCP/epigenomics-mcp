import { writeFileSync, mkdirSync, cpSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import {
  EpigenomicsFeatureResponsePacketSchema,
  BioactivityPoDHandoffPacketSchema,
} from "../contracts/packets.js";
import {
  RegionToGeneMappingSchema,
  ExternalDatabaseMappingSchema,
} from "../contracts/mapping.js";
import { BaseEnvelopeSchema } from "../contracts/base.js";
import { QualificationPolicySchema } from "../qualification/policy.js";

export interface SchemaExportConfig {
  name: string;
  schema: ZodTypeAny;
  description: string;
  filename: string;
  id: string;
}

export const SCHEMA_EXPORT_CONFIGS: SchemaExportConfig[] = [
  {
    name: "EpigenomicsFeatureResponsePacket",
    schema: EpigenomicsFeatureResponsePacketSchema,
    description:
      "Primary normative export from Epigenomics MCP – a qualified, annotation-aware, provenance-rich feature-response packet.",
    filename: "epigenomics-feature-response-packet.json",
    id: "https://toxmcp.org/schemas/epigenomics-feature-response-packet/v0.1.0",
  },
  {
    name: "BioactivityPoDHandoffPacket",
    schema: BioactivityPoDHandoffPacketSchema,
    description:
      "Consumer contract for Bioactivity-PoD MCP – a dose-response-ready handoff packet derived from a qualified EpigenomicsFeatureResponsePacket.",
    filename: "bioactivity-pod-handoff-packet.json",
    id: "https://toxmcp.org/schemas/bioactivity-pod-handoff-packet/v0.1.0",
  },
  {
    name: "RegionToGeneMapping",
    schema: RegionToGeneMappingSchema,
    description:
      "Typed mapping between an epigenomic region and its putative target gene(s).",
    filename: "region-to-gene-mapping.json",
    id: "https://toxmcp.org/schemas/region-to-gene-mapping/v0.1.0",
  },
  {
    name: "ExternalDatabaseMapping",
    schema: ExternalDatabaseMappingSchema,
    description:
      "Provenance-aware mapping result from an external database or interaction resource.",
    filename: "external-database-mapping.json",
    id: "https://toxmcp.org/schemas/external-database-mapping/v0.1.0",
  },
  {
    name: "BaseEnvelope",
    schema: BaseEnvelopeSchema,
    description:
      "Shared base envelope used by all emitted objects in Epigenomics MCP.",
    filename: "base-envelope.json",
    id: "https://toxmcp.org/schemas/base-envelope/v0.1.0",
  },
  {
    name: "QualificationPolicy",
    schema: QualificationPolicySchema,
    description:
      "Versioned qualification policy configuration for Epigenomics MCP.",
    filename: "qualification-policy.json",
    id: "https://toxmcp.org/schemas/qualification-policy/v0.1.0",
  },
];

/**
 * Convert zod-to-json-schema output from "definitions" to "$defs" and hoist
 * the named definition to the root schema object.
 */
export function transformSchema(
  raw: Record<string, unknown>,
  config: SchemaExportConfig,
): Record<string, unknown> {
  const definitions = raw.definitions as
    | Record<string, Record<string, unknown>>
    | undefined;

  if (!definitions || !definitions[config.name]) {
    throw new Error(`Missing definition for ${config.name}`);
  }

  const rootDef = definitions[config.name];

  // Build new $defs from remaining definitions
  const $defs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(definitions)) {
    if (key !== config.name) {
      $defs[key] = value;
    }
  }

  const transformed: Record<string, unknown> = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: config.id,
    title: config.name,
    description: config.description,
    ...rootDef,
  };

  if (Object.keys($defs).length > 0) {
    transformed.$defs = $defs;
  }

  return transformed;
}

export function exportSchema(config: SchemaExportConfig): Record<string, unknown> {
  const raw = zodToJsonSchema(config.schema, {
    name: config.name,
    $refStrategy: "none",
  }) as Record<string, unknown>;

  return transformSchema(raw, config);
}

export function exportAllSchemas(outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });

  for (const config of SCHEMA_EXPORT_CONFIGS) {
    const schema = exportSchema(config);
    const path = resolve(outputDir, config.filename);
    writeFileSync(path, JSON.stringify(schema, null, 2) + "\n", "utf-8");
  }
}

export function getDefaultOutputDir(): string {
  return resolve(process.cwd(), "schemas", "current");
}

/**
 * Build the archive directory path for a given version.
 */
export function getArchiveDir(version: string, baseDir?: string): string {
  const root = baseDir ?? resolve(process.cwd(), "schemas");
  return resolve(root, "archive", version);
}

/**
 * Copy all schema files from the current directory to an archive version
 * directory.  Idempotent: overwrites existing archive files.
 */
export function archiveAllSchemas(
  version: string,
  currentDir?: string,
  baseDir?: string,
): void {
  const src = currentDir ?? getDefaultOutputDir();
  const dest = getArchiveDir(version, baseDir);

  mkdirSync(dest, { recursive: true });

  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isFile()) {
      cpSync(srcPath, destPath, { force: true });
    }
  }
}

/**
 * Export all schemas to the current directory and optionally archive them.
 */
export function exportAndArchiveSchemas(options: {
  outputDir?: string;
  version?: string;
  archive?: boolean;
  baseDir?: string;
}): { currentDir: string; archiveDir?: string } {
  const currentDir = options.outputDir ?? getDefaultOutputDir();
  exportAllSchemas(currentDir);

  let archiveDir: string | undefined;
  if (options.archive && options.version) {
    archiveDir = getArchiveDir(options.version, options.baseDir);
    archiveAllSchemas(options.version, currentDir, options.baseDir);
  }

  return { currentDir, archiveDir };
}
