#!/usr/bin/env node

/**
 * Streamable HTTP entry point for the Epigenomics MCP server.
 *
 * Runs the same server factory as the stdio entry (./server.ts) over the MCP
 * Streamable HTTP transport on a single POST+GET /mcp endpoint. Stateless by
 * default (no session id) so any instance can serve any request behind a
 * round-robin load balancer — the NGRA.ai fleet target.
 *
 * The stdio entry (./cli.ts → startServer) remains the default for
 * local/desktop/CLI use.
 *
 * Config (env): EPIMCP_MCP_PORT (or PORT, default 8000),
 * EPIMCP_MCP_HOST (default 127.0.0.1). Server configuration is loaded the same
 * way the stdio entry loads it (loadConfig() → env + deterministic defaults).
 */

import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createEpigenomicsMcpServer } from "./server.js";

const PORT = Number(process.env.EPIMCP_MCP_PORT ?? process.env.PORT ?? 8000);
const HOST = process.env.EPIMCP_MCP_HOST ?? "127.0.0.1";
const MCP_PATH = "/mcp";

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  transport: StreamableHTTPServerTransport,
): Promise<void> {
  const url = req.url ?? "/";
  if (url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" }).end('{"status":"ok"}');
    return;
  }
  if (!url.startsWith(MCP_PATH)) {
    res.writeHead(404).end();
    return;
  }
  try {
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      await transport.handleRequest(req, res, raw ? (JSON.parse(raw) as unknown) : undefined);
    } else {
      // GET (server->client SSE stream) and DELETE are handled by the transport.
      await transport.handleRequest(req, res);
    }
  } catch (error) {
    process.stderr.write(
      `streamable-http request error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: null,
        }),
      );
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createEpigenomicsMcpServer(config);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  const httpServer = createHttpServer((req, res) => {
    void handle(req, res, transport);
  });

  const shutdown = async (): Promise<void> => {
    await transport.close();
    await server.close();
    httpServer.close(() => {
      process.exit(0);
    });
  };
  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });

  httpServer.listen(PORT, HOST, () => {
    process.stderr.write(
      `epigenomics-mcp streamable-http listening on http://${HOST}:${PORT}${MCP_PATH}\n`,
    );
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
