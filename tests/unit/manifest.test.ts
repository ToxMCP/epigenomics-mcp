import { describe, it, expect } from "vitest";
import {
  loadManifest,
  validateManifest,
  hasNonGoal,
  hasDocsPath,
  getIntegrationByName,
  getReleaseGateByName,
} from "../../src/epimcp/manifest.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("manifest", () => {
  it("loads and validates the committed toxmcp.manifest.yaml", () => {
    const yamlText = readFileSync(
      resolve(process.cwd(), "toxmcp.manifest.yaml"),
      "utf-8",
    );
    const manifest = loadManifest(yamlText);
    expect(manifest.name).toBe("epigenomics-mcp");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.toolNamespace).toBe("epimcp");
    expect(manifest.schemaRegistryPath).toBe("schemas/current");
    expect(manifest.supportedTransports).toContain("stdio");
    expect(manifest.supportedTransports).toContain("streamable-http");
    expect(manifest.capabilities.length).toBeGreaterThan(0);
    expect(manifest.ownedResponsibilities.length).toBeGreaterThan(0);
    expect(manifest.nonGoals.length).toBeGreaterThan(0);
  });

  it("validates an in-memory manifest object", () => {
    const manifest = validateManifest({
      name: "test-mcp",
      version: "0.0.1",
      description: "Test manifest",
      toolNamespace: "test",
      schemaRegistryPath: "schemas/test",
      supportedTransports: ["stdio"],
      capabilities: ["test_capability"],
      ownedResponsibilities: ["test"],
      nonGoals: ["none"],
      schemaPaths: ["schemas/test.json"],
      mcpToolNames: ["health"],
      cliCommands: ["test"],
      integrations: [
        {
          name: "Test Integration",
          status: "active",
          purpose: "Testing",
        },
      ],
      releaseGates: [
        {
          name: "test_gate",
          description: "A test gate",
          required: true,
        },
      ],
    });
    expect(manifest.name).toBe("test-mcp");
    expect(manifest.toolNamespace).toBe("test");
    expect(manifest.schemaRegistryPath).toBe("schemas/test");
    expect(manifest.supportedTransports).toEqual(["stdio"]);
    expect(manifest.capabilities).toEqual(["test_capability"]);
  });

  it("detects non-goals correctly", () => {
    const manifest = validateManifest({
      name: "test-mcp",
      version: "0.0.1",
      description: "Test manifest",
      toolNamespace: "test",
      schemaRegistryPath: "schemas/test",
      supportedTransports: ["stdio"],
      capabilities: ["test_capability"],
      ownedResponsibilities: ["test"],
      nonGoals: ["Raw FASTQ processing"],
      schemaPaths: ["schemas/test.json"],
      mcpToolNames: ["health"],
      cliCommands: ["test"],
      integrations: [
        {
          name: "Test Integration",
          status: "active",
          purpose: "Testing",
        },
      ],
      releaseGates: [
        {
          name: "test_gate",
          description: "A test gate",
          required: true,
        },
      ],
    });
    expect(hasNonGoal(manifest, "FASTQ")).toBe(true);
    expect(hasNonGoal(manifest, "something else")).toBe(false);
  });

  it("retrieves integrations by name", () => {
    const manifest = validateManifest({
      name: "test-mcp",
      version: "0.0.1",
      description: "Test manifest",
      toolNamespace: "test",
      schemaRegistryPath: "schemas/test",
      supportedTransports: ["stdio"],
      capabilities: ["test_capability"],
      ownedResponsibilities: ["test"],
      nonGoals: ["none"],
      schemaPaths: ["schemas/test.json"],
      mcpToolNames: ["health"],
      cliCommands: ["test"],
      integrations: [
        {
          name: "Annotation/Ontology MCP",
          status: "active",
          purpose: "Testing",
        },
      ],
      releaseGates: [
        {
          name: "test_gate",
          description: "A test gate",
          required: true,
        },
      ],
    });
    const integration = getIntegrationByName(manifest, "annotation/ontology mcp");
    expect(integration).toBeDefined();
    expect(integration?.status).toBe("active");
  });

  it("retrieves release gates by name", () => {
    const manifest = validateManifest({
      name: "test-mcp",
      version: "0.0.1",
      description: "Test manifest",
      toolNamespace: "test",
      schemaRegistryPath: "schemas/test",
      supportedTransports: ["stdio"],
      capabilities: ["test_capability"],
      ownedResponsibilities: ["test"],
      nonGoals: ["none"],
      schemaPaths: ["schemas/test.json"],
      mcpToolNames: ["health"],
      cliCommands: ["test"],
      integrations: [
        {
          name: "Test Integration",
          status: "active",
          purpose: "Testing",
        },
      ],
      releaseGates: [
        {
          name: "typecheck",
          description: "TypeScript type check",
          required: true,
        },
      ],
    });
    const gate = getReleaseGateByName(manifest, "typecheck");
    expect(gate).toBeDefined();
    expect(gate?.required).toBe(true);
  });
});
