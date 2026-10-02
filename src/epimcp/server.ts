import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { McpServer } from "@modelcontextprotocol/server";
import { VERSION } from "./version.js";
import type { Config } from "./config.js";
import { registerTools } from "./tool_registry.js";
import { registerAuditResources } from "./resources.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createEpigenomicsMcpServer(config: Config): McpServer {
  const server = new McpServer(
    {
      name: config.name,
      version: VERSION,
    },
    {
      capabilities: {
        tools: { listChanged: false },
      },
      cacheHints: {
        "tools/list": { ttlMs: 60_000, cacheScope: "private" },
        "resources/list": { ttlMs: 60_000, cacheScope: "private" },
      },
      instructions:
        "Epigenomics MCP qualifies processed epigenomic feature evidence for downstream " +
        "Bioactivity-PoD use. Start with validate_design and validate_coordinates, use " +
        "the QC profiling tools before qualify_features, then generate_handoff only for " +
        "qualified packets. All decisions are deterministic, read-only, and fail closed.",
    },
  );

  registerTools(server, config);
  registerAuditResources(server);

  return server;
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

export async function startServer(config: Config): Promise<void> {
  serveStdio(() => createEpigenomicsMcpServer(config), {
    legacy: "serve",
    onerror: (error) => process.stderr.write(`stdio request error: ${error.message}\n`),
  });
}
