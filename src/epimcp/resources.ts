import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

export interface AuditResourceDefinition {
  name: string;
  title: string;
  uri: string;
  description: string;
  path: string;
  mimeType: string;
}

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const AUDIT_RESOURCES: AuditResourceDefinition[] = [
  {
    name: "schema-epigenomics-feature-response-packet",
    title: "Epigenomics Feature Response Packet Schema",
    uri: "epimcp://schemas/epigenomics-feature-response-packet",
    description: "Committed JSON Schema for EpigenomicsFeatureResponsePacket.",
    path: "schemas/current/epigenomics-feature-response-packet.json",
    mimeType: "application/schema+json",
  },
  {
    name: "schema-bioactivity-pod-handoff-packet",
    title: "Bioactivity-PoD Handoff Packet Schema",
    uri: "epimcp://schemas/bioactivity-pod-handoff-packet",
    description: "Committed JSON Schema for BioactivityPoDHandoffPacket.",
    path: "schemas/current/bioactivity-pod-handoff-packet.json",
    mimeType: "application/schema+json",
  },
  {
    name: "schema-region-to-gene-mapping",
    title: "Region-to-Gene Mapping Schema",
    uri: "epimcp://schemas/region-to-gene-mapping",
    description: "Committed JSON Schema for region-to-gene mapping records.",
    path: "schemas/current/region-to-gene-mapping.json",
    mimeType: "application/schema+json",
  },
  {
    name: "schema-external-database-mapping",
    title: "External Database Mapping Schema",
    uri: "epimcp://schemas/external-database-mapping",
    description: "Committed JSON Schema for external annotation evidence.",
    path: "schemas/current/external-database-mapping.json",
    mimeType: "application/schema+json",
  },
  {
    name: "schema-base-envelope",
    title: "Base Envelope Schema",
    uri: "epimcp://schemas/base-envelope",
    description: "Committed JSON Schema for shared packet envelope fields.",
    path: "schemas/current/base-envelope.json",
    mimeType: "application/schema+json",
  },
  {
    name: "schema-qualification-policy",
    title: "Qualification Policy Schema",
    uri: "epimcp://schemas/qualification-policy",
    description: "Committed JSON Schema for qualification policy overrides.",
    path: "schemas/current/qualification-policy.json",
    mimeType: "application/schema+json",
  },
  {
    name: "doc-validation-statement",
    title: "Validation Statement",
    uri: "epimcp://docs/validation-statement",
    description: "Regulator-facing benchmark coverage and limitation statement.",
    path: "docs/validation-statement.md",
    mimeType: "text/markdown",
  },
  {
    name: "doc-tool-reference",
    title: "Tool Reference",
    uri: "epimcp://docs/tool-reference",
    description: "MCP and CLI tool reference with usage examples.",
    path: "docs/tool-reference.md",
    mimeType: "text/markdown",
  },
  {
    name: "benchmark-manifest",
    title: "Benchmark Manifest",
    uri: "epimcp://benchmarks/manifest",
    description: "Release benchmark manifest used by the golden-output gate.",
    path: "benchmark_manifest.yaml",
    mimeType: "application/yaml",
  },
  {
    name: "release-evidence-manifest",
    title: "Latest Release Evidence Manifest",
    uri: "epimcp://release-evidence/manifest",
    description: "Generated audit manifest from npm run release:evidence.",
    path: "release-evidence/release-evidence.json",
    mimeType: "application/json",
  },
  {
    name: "release-evidence-checksums",
    title: "Latest Release Evidence Checksums",
    uri: "epimcp://release-evidence/checksums",
    description: "SHA-256 checksum list from npm run release:evidence.",
    path: "release-evidence/checksums.sha256",
    mimeType: "text/plain",
  },
  {
    name: "release-gate-json",
    title: "Latest Release Gate JSON",
    uri: "epimcp://release-evidence/release-gate-json",
    description: "JSON release-gate report captured into release evidence.",
    path: "release-evidence/release-gate.json",
    mimeType: "application/json",
  },
  {
    name: "release-gate-report",
    title: "Latest Release Gate Report",
    uri: "epimcp://release-evidence/release-gate-report",
    description: "Human-readable release-gate report captured into release evidence.",
    path: "release-evidence/release-gate.txt",
    mimeType: "text/plain",
  },
];

function readResource(definition: AuditResourceDefinition): ReadResourceResult {
  const absolutePath = resolveAuditResourcePath(definition.path);
  const text = existsSync(absolutePath)
    ? readFileSync(absolutePath, "utf-8")
    : JSON.stringify(
        {
          error: "Audit artifact has not been generated.",
          path: definition.path,
          remediation: "Run npm run release:evidence.",
        },
        null,
        2,
      ) + "\n";

  return {
    contents: [
      {
        uri: definition.uri,
        mimeType: definition.mimeType,
        text,
      },
    ],
  };
}

export function registerAuditResources(server: McpServer): void {
  for (const definition of AUDIT_RESOURCES) {
    server.registerResource(
      definition.name,
      definition.uri,
      {
        title: definition.title,
        description: definition.description,
        mimeType: definition.mimeType,
      },
      () => readResource(definition),
    );
  }
}

export function getRegisteredAuditResourceUris(): string[] {
  return AUDIT_RESOURCES.map((resource) => resource.uri);
}

export function getRegisteredAuditResources(): AuditResourceDefinition[] {
  return [...AUDIT_RESOURCES];
}

export function resolveAuditResourcePath(path: string): string {
  return resolve(PACKAGE_ROOT, path);
}
