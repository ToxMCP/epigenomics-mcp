import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadManifest } from "../../src/epimcp/manifest.js";

/**
 * Track-A core gate: mcp-conformance BASELINE + manifest-drift.
 *
 * This is a black-box conformance test. It spawns the BUILT server
 * (dist/epimcp/cli.js) in a fresh process over stdio using the real MCP
 * client SDK (@modelcontextprotocol/sdk Client + StdioClientTransport),
 * then asserts that the advertised runtime surface — the set of tool names
 * returned by tools/list and the set of resource URIs returned by
 * resources/list — matches EXACTLY the surface declared in the committed
 * toxmcp.manifest.yaml (mcpToolNames / mcpResourceUris).
 *
 * Because the expected sets are derived directly from the committed
 * manifest, this single test enforces two gates at once:
 *
 *   1. mcp-conformance baseline — the wire surface the server actually
 *      advertises is locked to an expected, reviewed set. Renaming,
 *      adding, or dropping a registered tool/resource without updating
 *      the manifest fails the test with an attributed set mismatch.
 *
 *   2. manifest-drift — the committed toxmcp.manifest.yaml is asserted to
 *      stay in lockstep with the live runtime surface. The manifest is the
 *      machine-readable contract other ToxMCP services consume, so drift
 *      between it and the running server is a release-blocking signal.
 *
 * MAINTAINER NOTE: the expected tool/resource sets are NOT hand-maintained
 * here — they are read from toxmcp.manifest.yaml at test time. When you add,
 * remove, or rename a tool or audit resource, update toxmcp.manifest.yaml
 * (mcpToolNames / mcpResourceUris) in the same change and this gate will pass.
 */

const REPO_ROOT = resolve(__dirname, "..", "..");
const SERVER_ENTRYPOINT = resolve(REPO_ROOT, "dist", "epimcp", "cli.js");
const MANIFEST_PATH = resolve(REPO_ROOT, "toxmcp.manifest.yaml");

function loadCommittedManifest() {
  const yamlText = readFileSync(MANIFEST_PATH, "utf-8");
  return loadManifest(yamlText);
}

describe("MCP conformance baseline (built server over stdio)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    if (!existsSync(SERVER_ENTRYPOINT)) {
      throw new Error(
        `Built server entrypoint not found at ${SERVER_ENTRYPOINT}. ` +
          `Run \`npm run build\` before this conformance test (npm test does this automatically).`,
      );
    }

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_ENTRYPOINT, "serve"],
      cwd: REPO_ROOT,
      stderr: "inherit",
    });

    client = new Client(
      { name: "epimcp-conformance-client", version: "0.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  it("advertises exactly the tool-name set declared in toxmcp.manifest.yaml", async () => {
    const manifest = loadCommittedManifest();
    const expected = [...manifest.mcpToolNames].sort();

    const listed = await client.listTools();
    const actual = listed.tools.map((tool) => tool.name).sort();

    // Attributed mismatch reporting: surface exactly what drifted.
    const missing = expected.filter((name) => !actual.includes(name));
    const unexpected = actual.filter((name) => !expected.includes(name));
    expect(
      { missing, unexpected },
      `Tool surface drift between built server and toxmcp.manifest.yaml.\n` +
        `  missing (in manifest, not advertised): ${JSON.stringify(missing)}\n` +
        `  unexpected (advertised, not in manifest): ${JSON.stringify(unexpected)}`,
    ).toEqual({ missing: [], unexpected: [] });

    expect(actual).toEqual(expected);
  });

  it("advertises exactly the resource-URI set declared in toxmcp.manifest.yaml", async () => {
    const manifest = loadCommittedManifest();
    const expected = [...(manifest.mcpResourceUris ?? [])].sort();
    // This server declares audit resources; the manifest must enumerate them.
    expect(expected.length).toBeGreaterThan(0);

    const listed = await client.listResources();
    const actual = listed.resources.map((resource) => resource.uri).sort();

    const missing = expected.filter((uri) => !actual.includes(uri));
    const unexpected = actual.filter((uri) => !expected.includes(uri));
    expect(
      { missing, unexpected },
      `Resource surface drift between built server and toxmcp.manifest.yaml.\n` +
        `  missing (in manifest, not advertised): ${JSON.stringify(missing)}\n` +
        `  unexpected (advertised, not in manifest): ${JSON.stringify(unexpected)}`,
    ).toEqual({ missing: [], unexpected: [] });

    expect(actual).toEqual(expected);
  });

  it("declares its supported transports consistently with the manifest (stdio)", async () => {
    const manifest = loadCommittedManifest();
    // The built entrypoint exercised here is the stdio transport; the manifest
    // must declare stdio among its supported transports.
    expect(manifest.supportedTransports).toContain("stdio");
  });
});
