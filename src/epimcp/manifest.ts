import yaml from "js-yaml";
import { z } from "zod";

/**
 * Integration entry in the ToxMCP manifest.
 */
export const ManifestIntegrationSchema = z
  .object({
    name: z.string().min(1).describe("Integration partner name"),
    status: z
      .enum(["active", "planned", "deprecated"])
      .describe("Integration status"),
    purpose: z.string().min(1).describe("Purpose of the integration"),
    contactEndpoint: z.string().optional().describe("MCP endpoint or URL"),
    handoffSchema: z.string().optional().describe("Path to handoff schema"),
    manifestPath: z.string().optional().describe("Path to partner manifest"),
    plannedRelease: z
      .string()
      .optional()
      .describe("Target release for planned integrations"),
  })
  .strict();

export type ManifestIntegration = z.infer<typeof ManifestIntegrationSchema>;

/**
 * Release gate entry in the ToxMCP manifest.
 */
export const ManifestReleaseGateSchema = z
  .object({
    name: z.string().min(1).describe("Gate identifier"),
    description: z.string().min(1).describe("Human-readable gate description"),
    required: z.boolean().describe("Whether the gate is mandatory"),
  })
  .strict();

export type ManifestReleaseGate = z.infer<typeof ManifestReleaseGateSchema>;

/**
 * Complete ToxMCP manifest schema.
 */
export const ToxMcpManifestSchema = z
  .object({
    name: z.string().min(1).describe("Package name"),
    version: z.string().min(1).describe("Manifest version"),
    description: z.string().min(1).describe("Human-readable description"),
    toolNamespace: z.string().min(1).describe("Tool namespace for MCP tool discovery"),
    schemaRegistryPath: z.string().min(1).describe("Path to the schema registry directory"),
    supportedTransports: z
      .array(z.string().min(1))
      .min(1)
      .describe("Supported MCP transport protocols"),
    capabilities: z
      .array(z.string().min(1))
      .min(1)
      .describe("Explicit capability declarations"),
    ownedResponsibilities: z
      .array(z.string().min(1))
      .min(1)
      .describe("Responsibilities owned by this MCP"),
    nonGoals: z
      .array(z.string().min(1))
      .min(1)
      .describe("Explicitly out-of-scope capabilities"),
    schemaPaths: z
      .array(z.string().min(1))
      .min(1)
      .describe("JSON schema file paths"),
    docsPaths: z
      .array(z.string().min(1))
      .min(1)
      .describe("Documentation file paths")
      .optional(),
    mcpToolNames: z
      .array(z.string().min(1))
      .min(1)
      .describe("Exposed MCP tool names"),
    mcpResourceUris: z
      .array(z.string().min(1))
      .describe("Stable read-only MCP resource URIs")
      .optional(),
    cliCommands: z
      .array(z.string().min(1))
      .min(1)
      .describe("Supported CLI commands"),
    integrations: z
      .array(ManifestIntegrationSchema)
      .min(1)
      .describe("External MCP integrations"),
    releaseGates: z
      .array(ManifestReleaseGateSchema)
      .min(1)
      .describe("Release readiness gates"),
  })
  .strict();

export type ToxMcpManifest = z.infer<typeof ToxMcpManifestSchema>;

/**
 * Load and validate a ToxMCP manifest from YAML text.
 */
export function loadManifest(yamlText: string): ToxMcpManifest {
  const parsed = yaml.load(yamlText);
  return ToxMcpManifestSchema.parse(parsed);
}

/**
 * Validate an in-memory manifest object.
 */
export function validateManifest(manifest: unknown): ToxMcpManifest {
  return ToxMcpManifestSchema.parse(manifest);
}

/**
 * Check whether a non-goal is explicitly declared.
 */
export function hasNonGoal(manifest: ToxMcpManifest, nonGoal: string): boolean {
  return manifest.nonGoals.some((ng) =>
    ng.toLowerCase().includes(nonGoal.toLowerCase()),
  );
}

/**
 * Check whether a docs path is present.
 */
export function hasDocsPath(manifest: ToxMcpManifest, path: string): boolean {
  return (manifest.docsPaths ?? []).some((dp) => dp.includes(path));
}

/**
 * Retrieve an integration by name.
 */
export function getIntegrationByName(
  manifest: ToxMcpManifest,
  name: string,
): ManifestIntegration | undefined {
  return manifest.integrations.find(
    (i) => i.name.toLowerCase() === name.toLowerCase(),
  );
}

/**
 * Retrieve a release gate by name.
 */
export function getReleaseGateByName(
  manifest: ToxMcpManifest,
  name: string,
): ManifestReleaseGate | undefined {
  return manifest.releaseGates.find(
    (g) => g.name.toLowerCase() === name.toLowerCase(),
  );
}
