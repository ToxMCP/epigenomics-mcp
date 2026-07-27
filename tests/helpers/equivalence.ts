/**
 * Shared test helpers for verifying service / MCP tool / CLI output equivalence.
 *
 * Keeps transport wrappers thin by calling each pathway with the same input
 * and comparing normalized JSON outputs.
 */

import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { TOOL_DEFINITIONS } from "../../src/epimcp/tool_registry.js";
import type { SyntheticFixtureName } from "../../benchmarks/fixtures/synthetic/index.js";
import { loadSyntheticFixture } from "../../benchmarks/fixtures/synthetic/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLI_CMD = "npx tsx src/epimcp/cli.ts";

const DETERMINISTIC_PACKET_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const DETERMINISTIC_TIMESTAMP = "2026-05-05T00:00:00Z";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PathwayResults<T> {
  service: T;
  mcp: T;
  cli: T;
}

export interface EquivalenceOptions {
  /** Tool name in the MCP registry (e.g. "qualify_features") */
  mcpToolName: string;
  /** CLI command name (e.g. "qualify") */
  cliCommand: string;
  /**
   * Build the MCP arguments from the prepared fixture input.
   * Receives the same object that is passed to the service function.
   */
  buildMcpArgs: (input: unknown) => Record<string, unknown>;
  /**
   * Build the CLI argument string from the temporary file path.
   */
  buildCliArgs: (filePath: string) => string;
  /**
   * Optional normalization applied to all three outputs before comparison.
   */
  normalize?: (value: unknown) => unknown;
}

// ---------------------------------------------------------------------------
// Packet builder
// ---------------------------------------------------------------------------

function buildPacketFromFixture(fixtureName: SyntheticFixtureName): unknown {
  const fixture = loadSyntheticFixture(fixtureName);
  const featureTable = fixture.featureTable ?? [];
  const design = fixture.design;
  const metadata = fixture.metadata ?? null;

  const datasetId =
    (metadata && typeof metadata === "object" && "datasetId" in metadata
      ? (metadata.datasetId as string)
      : null) ?? `${fixtureName}-ds-001`;

  const provenance =
    (metadata && typeof metadata === "object" && "provenance" in metadata
      ? (metadata.provenance as Record<string, unknown>)
      : null) ?? {
      datasetId,
      upstreamSteps: [
        {
          stepName: "normalisation",
          toolName: "minfi",
          toolVersion: "1.44.0",
          parameters: {},
        },
      ],
    };
  const mappingPayloads =
    metadata && typeof metadata === "object" && "mappingPayloads" in metadata
      ? metadata.mappingPayloads
      : undefined;

  return {
    schemaVersion: "0.1.0",
    schemaName: "EpigenomicsFeatureResponsePacket",
    packetId: DETERMINISTIC_PACKET_ID,
    datasetMetadataRef: datasetId,
    designRef:
      (design && typeof design === "object" && "designId" in design
        ? (design.designId as string)
        : null) ?? `${fixtureName}-design-001`,
    features: featureTable,
    design,
    provenance,
    qualificationSummary: {
      acceptedCount: featureTable.length,
      excludedCount: 0,
      exploratoryCount: 0,
      caveatCount: 0,
    },
    qcReportRef: "qc-report-001",
    warnings: [],
    generatedAt: DETERMINISTIC_TIMESTAMP,
    ...(mappingPayloads ? { mappingPayloads } : {}),
  };
}

// ---------------------------------------------------------------------------
// Pathway callers
// ---------------------------------------------------------------------------

async function callService<T>(
  serviceFn: (input: unknown) => T,
  input: unknown,
): Promise<T> {
  return serviceFn(input);
}

async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const tool = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!tool) {
    throw new Error(`MCP tool "${toolName}" not found in registry`);
  }
  const result = await tool.handler(args);
  if (
    !result.content ||
    result.content.length === 0 ||
    result.content[0].type !== "text"
  ) {
    throw new Error(
      `MCP tool "${toolName}" returned unexpected content shape`,
    );
  }
  return JSON.parse(result.content[0].text) as unknown;
}

function callCli(args: string): unknown {
  try {
    const stdout = execSync(`${CLI_CMD} ${args}`, {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return JSON.parse(stdout) as unknown;
  } catch (err) {
    // CLI may exit non-zero for blocking warnings / validation failures.
    // Parse stdout if available so we can still compare the structured output.
    const execErr = err as { stdout?: string; stderr?: string };
    if (execErr.stdout) {
      return JSON.parse(execErr.stdout) as unknown;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function defaultNormalize(value: unknown): unknown {
  // By default, no normalization beyond JSON round-trip
  return JSON.parse(JSON.stringify(value));
}

/**
 * Normalize outputs by stripping fields that are expected to differ across
 * independent invocations (random UUIDs, timestamps).
 *
 * Accepts a list of field paths to delete. Paths use dot notation, e.g.
 * "handoffId", "reportId", "generatedAt".
 */
export function stripFields(
  value: unknown,
  paths: string[],
): unknown {
  const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

  for (const path of paths) {
    const keys = path.split(".");
    let target: Record<string, unknown> = clone;
    for (let i = 0; i < keys.length - 1; i++) {
      const next = target[keys[i]];
      if (next && typeof next === "object") {
        target = next as Record<string, unknown>;
      } else {
        target = {};
        break;
      }
    }
    const lastKey = keys[keys.length - 1];
    if (lastKey && lastKey in target) {
      delete target[lastKey];
    }
  }

  return clone;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the same input through service, MCP tool, and CLI pathways and return
 * all three normalized outputs.
 */
export async function runEquivalence<T = unknown>(
  serviceFn: (input: unknown) => T,
  options: EquivalenceOptions,
  fixtureName: SyntheticFixtureName,
): Promise<PathwayResults<T>> {
  const packet = buildPacketFromFixture(fixtureName);

  // Service
  const serviceResult = await callService(serviceFn, packet);

  // MCP
  const mcpArgs = options.buildMcpArgs(packet);
  const mcpResult = await callMcpTool(options.mcpToolName, mcpArgs);

  // CLI (needs temp file)
  const tmpDir = mkdtempSync(join(tmpdir(), "epimcp-equiv-"));
  const packetPath = join(tmpDir, "packet.json");
  writeFileSync(packetPath, JSON.stringify(packet, null, 2));

  let cliResult: unknown;
  try {
    cliResult = callCli(options.buildCliArgs(packetPath));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const normalize = options.normalize ?? defaultNormalize;

  return {
    service: normalize(serviceResult) as T,
    mcp: normalize(mcpResult) as T,
    cli: normalize(cliResult) as T,
  };
}

/**
 * Assert that service, MCP, and CLI outputs are deeply equal.
 *
 * On mismatch, prints a concise diff and throws.
 */
export function assertEquivalent<T>(
  results: PathwayResults<T>,
  options?: { context?: string },
): void {
  const context = options?.context ? `${options.context}: ` : "";

  const serviceJson = JSON.stringify(results.service, null, 2);
  const mcpJson = JSON.stringify(results.mcp, null, 2);
  const cliJson = JSON.stringify(results.cli, null, 2);

  if (!isDeepStrictEqual(results.service, results.mcp)) {
    throw new Error(
      `${context}Service and MCP outputs differ.\nService:\n${serviceJson}\nMCP:\n${mcpJson}`,
    );
  }

  if (!isDeepStrictEqual(results.service, results.cli)) {
    throw new Error(
      `${context}Service and CLI outputs differ.\nService:\n${serviceJson}\nCLI:\n${cliJson}`,
    );
  }
}

/**
 * Zod-safe assertion that parses each output through a schema before comparing.
 */
export function assertEquivalentParsed<T>(
  results: PathwayResults<unknown>,
  schema: z.ZodType<T>,
  options?: { context?: string },
): PathwayResults<T> {
  const parsed: PathwayResults<T> = {
    service: schema.parse(results.service),
    mcp: schema.parse(results.mcp),
    cli: schema.parse(results.cli),
  };

  assertEquivalent(parsed, options);
  return parsed;
}
