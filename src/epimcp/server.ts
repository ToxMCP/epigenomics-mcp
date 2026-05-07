import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "./version.js";
import type { Config } from "./config.js";
import { registerTools } from "./tool_registry.js";
import { registerAuditResources } from "./resources.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

function createEpigenomicsMcpServer(config: Config): McpServer {
  const server = new McpServer({
    name: "epigenomics-mcp",
    version: VERSION,
  });

  registerTools(server, config);
  registerAuditResources(server);

  return server;
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

export async function startServer(config: Config): Promise<void> {
  const transport = new StdioServerTransport();
  const server = createEpigenomicsMcpServer(config);
  await server.connect(transport);
  // Keep process alive until transport closes
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
  });
}
