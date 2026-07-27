import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import {
  EpigenomicsFeatureResponsePacketSchema,
  BioactivityPoDHandoffPacketSchema,
} from "../../src/contracts/packets.js";
import { TOOL_DEFINITIONS } from "../../src/epimcp/tool_registry.js";
import { buildHandoffPacket } from "../../src/handoff/builder.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson(path: string): unknown {
  const content = readFileSync(resolve(path), "utf-8");
  return JSON.parse(content) as unknown;
}

function callCli(args: string): unknown {
  try {
    const stdout = execSync(`npx tsx src/epimcp/cli.ts ${args}`, {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return JSON.parse(stdout) as unknown;
  } catch (err) {
    const execErr = err as { stdout?: string };
    if (execErr.stdout) {
      return JSON.parse(execErr.stdout) as unknown;
    }
    throw err;
  }
}

async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const tool = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!tool) throw new Error(`Tool ${toolName} not found`);
  const result = await tool.handler(args);
  const text = result.content[0]?.text;
  if (!text) throw new Error(`Tool ${toolName} returned empty content`);
  return JSON.parse(text) as unknown;
}

// ---------------------------------------------------------------------------
// Example 1 — Methylation matrix
// ---------------------------------------------------------------------------

describe("Example 1: Methylation matrix", () => {
  const packetPath = "examples/methylation_matrix/packet.json";

  it("packet file is valid EpigenomicsFeatureResponsePacket schema", () => {
    const packet = readJson(packetPath);
    const parsed = EpigenomicsFeatureResponsePacketSchema.safeParse(packet);
    expect(parsed.success).toBe(true);
  });

  it("CLI qualify produces expected top-level counts", () => {
    const result = callCli(`qualify ${packetPath} --json`) as {
      qualifiedCount: number;
      excludedCount: number;
    };
    expect(result.qualifiedCount).toBe(2);
    expect(result.excludedCount).toBe(0);
  });

  it("CLI build-packet produces readyForPod=true", () => {
    const result = callCli(`build-packet ${packetPath} --json`) as {
      readyForPod: boolean;
      qualifiedFeatureCount: number;
    };
    expect(result.readyForPod).toBe(true);
    expect(result.qualifiedFeatureCount).toBe(2);
  });

  it("MCP qualify_features produces same qualifiedCount as CLI", async () => {
    const packet = readJson(packetPath);
    const mcpResult = (await callMcpTool("qualify_features", { packet })) as {
      qualifiedCount: number;
      excludedCount: number;
    };
    expect(mcpResult.qualifiedCount).toBe(2);
    expect(mcpResult.excludedCount).toBe(0);
  });

  it("MCP generate_handoff produces readyForPod=true", async () => {
    const packet = readJson(packetPath);
    const mcpResult = (await callMcpTool("generate_handoff", { packet })) as {
      readyForPod: boolean;
      qualifiedFeatureCount: number;
    };
    expect(mcpResult.readyForPod).toBe(true);
    expect(mcpResult.qualifiedFeatureCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Example 2 — DMR nearest-gene warning
// ---------------------------------------------------------------------------

describe("Example 2: DMR nearest-gene warning", () => {
  const packetPath = "examples/dmr_nearest_gene_warning/packet.json";

  it("packet file is valid EpigenomicsFeatureResponsePacket schema", () => {
    const packet = readJson(packetPath);
    const parsed = EpigenomicsFeatureResponsePacketSchema.safeParse(packet);
    expect(parsed.success).toBe(true);
  });

  it("CLI qualify produces accepted_with_caveats for DMR features", () => {
    const result = callCli(`qualify ${packetPath} --json`) as {
      qualifications: Array<{
        featureId: string;
        status: string;
        mappedGeneIds: string[];
        mappingConfidence: string;
        mappingMethod: string;
        warnings: Array<{ warningCode: string }>;
      }>;
    };
    expect(result.qualifications).toHaveLength(2);
    for (const q of result.qualifications) {
      expect(q.status).toBe("accepted_with_caveats");
      expect(q.mappingMethod).toBe("nearest_gene");
      expect(q.mappingConfidence).toBe("low");
      expect(q.mappedGeneIds).toHaveLength(1);
      expect(q.warnings.map((warning) => warning.warningCode)).toContain(
        "EPIW007_NEAREST_GENE_ONLY",
      );
    }
  });

  it("MCP qualify_features matches CLI output for DMRs", async () => {
    const packet = readJson(packetPath);
    const mcpResult = (await callMcpTool("qualify_features", { packet })) as {
      qualifications: Array<{ featureId: string; status: string }>;
    };
    expect(mcpResult.qualifications).toHaveLength(2);
    for (const q of mcpResult.qualifications) {
      expect(q.status).toBe("accepted_with_caveats");
    }
  });
});

// ---------------------------------------------------------------------------
// Example 3 — Invalid build mismatch
// ---------------------------------------------------------------------------

describe("Example 3: Invalid build mismatch", () => {
  const packetPath = "examples/invalid_build_mismatch/packet.json";

  it("packet file is valid EpigenomicsFeatureResponsePacket schema", () => {
    const packet = readJson(packetPath);
    const parsed = EpigenomicsFeatureResponsePacketSchema.safeParse(packet);
    expect(parsed.success).toBe(true);
  });

  it("CLI qualify excludes all features due to mixed builds", () => {
    const result = callCli(`qualify ${packetPath} --json`) as {
      qualifiedCount: number;
      excludedCount: number;
      warnings: Array<{ warningCode: string; blocksDownstream: boolean }>;
    };
    expect(result.qualifiedCount).toBe(0);
    expect(result.excludedCount).toBe(2);
    expect(
      result.warnings.some((w) => w.warningCode === "EPI004_BUILD_VALIDATION_FAILED"),
    ).toBe(true);
    expect(result.warnings.some((w) => w.blocksDownstream)).toBe(true);
  });

  it("CLI build-packet is not readyForPod when all features excluded", () => {
    const result = callCli(`build-packet ${packetPath} --json`) as {
      readyForPod: boolean;
      qualifiedFeatureCount: number;
    };
    expect(result.readyForPod).toBe(false);
    expect(result.qualifiedFeatureCount).toBe(0);
  });

  it("MCP qualify_features matches CLI mixed-build exclusion", async () => {
    const packet = readJson(packetPath);
    const mcpResult = (await callMcpTool("qualify_features", { packet })) as {
      qualifiedCount: number;
      excludedCount: number;
      warnings: Array<{ warningCode: string }>;
    };
    expect(mcpResult.qualifiedCount).toBe(0);
    expect(mcpResult.excludedCount).toBe(2);
    expect(
      mcpResult.warnings.some((w) => w.warningCode === "EPI004_BUILD_VALIDATION_FAILED"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Example 4 — Bioactivity-PoD handoff
// ---------------------------------------------------------------------------

describe("Example 4: Bioactivity-PoD handoff", () => {
  const packetPath = "examples/bioactivity_pod_handoff/packet.json";

  it("packet file is valid EpigenomicsFeatureResponsePacket schema", () => {
    const packet = readJson(packetPath);
    const parsed = EpigenomicsFeatureResponsePacketSchema.safeParse(packet);
    expect(parsed.success).toBe(true);
  });

  it("CLI export-pod produces valid BioactivityPoDHandoffPacket", () => {
    const result = callCli(`export-pod ${packetPath} --json`) as Record<string, unknown>;
    const parsed = BioactivityPoDHandoffPacketSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("exported handoff contains correct feature IDs in doseResponseReadySubset", () => {
    const result = callCli(`export-pod ${packetPath} --json`) as {
      doseResponseReadySubset: string[];
      qualifiedFeatures: Array<{ featureId: string; status: string }>;
    };
    expect(result.doseResponseReadySubset).toContain("cg00000001");
    expect(result.doseResponseReadySubset).toContain("cg00000002");
    expect(result.qualifiedFeatures).toHaveLength(2);
  });

  it("service-layer buildHandoffPacket matches CLI summary", () => {
    const packet = readJson(packetPath);
    const serviceResult = buildHandoffPacket(packet);
    const cliResult = callCli(`build-packet ${packetPath} --json`) as {
      readyForPod: boolean;
      qualifiedFeatureCount: number;
    };
    expect(serviceResult.readyForPod).toBe(cliResult.readyForPod);
    expect(serviceResult.qualifiedFeatureCount).toBe(cliResult.qualifiedFeatureCount);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: all example files are loadable JSON
// ---------------------------------------------------------------------------

describe("Example file integrity", () => {
  const exampleFiles = [
    "examples/methylation_matrix/feature_table.json",
    "examples/methylation_matrix/design.json",
    "examples/methylation_matrix/provenance.json",
    "examples/methylation_matrix/packet.json",
    "examples/dmr_nearest_gene_warning/feature_table.json",
    "examples/dmr_nearest_gene_warning/design.json",
    "examples/dmr_nearest_gene_warning/provenance.json",
    "examples/dmr_nearest_gene_warning/packet.json",
    "examples/invalid_build_mismatch/feature_table.json",
    "examples/invalid_build_mismatch/design.json",
    "examples/invalid_build_mismatch/provenance.json",
    "examples/invalid_build_mismatch/packet.json",
    "examples/bioactivity_pod_handoff/packet.json",
  ];

  for (const file of exampleFiles) {
    it(`${file} is valid JSON`, () => {
      const data = readJson(file);
      expect(data).toBeDefined();
      expect(typeof data).toBe("object");
    });
  }
});
