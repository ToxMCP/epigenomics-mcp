#!/usr/bin/env node

/**
 * Stateless MCP Streamable HTTP entry point.
 *
 * Security defaults:
 * - binds to 127.0.0.1;
 * - validates Host and Origin headers;
 * - limits request bodies and request rate;
 * - requires bearer authentication for non-loopback bindings.
 *
 * Each POST receives a fresh MCP server and transport. The SDK requires this
 * lifecycle in stateless mode and it also prevents request-id collisions
 * between clients.
 */

import { timingSafeEqual } from "node:crypto";
import {
  createServer as createNodeHttpServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
  type ServerResponse,
} from "node:http";
import { isIP, type AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig, type Config } from "./config.js";
import { createEpigenomicsMcpServer } from "./server.js";

const MCP_PATH = "/mcp";
const HEALTH_PATH = "/health";
const DEFAULT_PORT = 8000;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;

class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface HttpRuntimeConfig {
  host: string;
  port: number;
  allowedHosts: ReadonlySet<string>;
  allowedOrigins: ReadonlySet<string>;
  authToken?: string;
  maxBodyBytes: number;
  rateLimitPerMinute: number;
}

interface RateLimitEntry {
  windowStartedAt: number;
  count: number;
}

function parseInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function parseCsv(raw: string | undefined): string[] {
  return raw
    ? raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
}

function normalizeHostname(value: string): string {
  const candidate = value.trim().toLowerCase();
  if (!candidate) {
    throw new Error("Host names must not be empty");
  }

  try {
    const authority = isIP(candidate) === 6 ? `[${candidate}]` : candidate;
    const parsed = new URL(`http://${authority}`);
    return parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  } catch {
    throw new Error(`Invalid host name: ${value}`);
  }
}

function normalizeOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Origin must use http or https");
    }
    return parsed.origin;
  } catch {
    throw new Error(`Invalid origin: ${value}`);
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = normalizeHostname(host);
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

function defaultLoopbackOrigins(port: number): string[] {
  return [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ];
}

export function loadHttpRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): HttpRuntimeConfig {
  const host = env.EPIMCP_MCP_HOST ?? DEFAULT_HOST;
  const port = parseInteger(
    env.EPIMCP_MCP_PORT ?? env.PORT,
    DEFAULT_PORT,
    0,
    65535,
    "EPIMCP_MCP_PORT",
  );
  const loopback = isLoopbackHost(host);
  const configuredHosts = parseCsv(env.EPIMCP_ALLOWED_HOSTS);
  const configuredOrigins = parseCsv(env.EPIMCP_ALLOWED_ORIGINS);
  const authToken = env.EPIMCP_AUTH_TOKEN?.trim() || undefined;

  if (!loopback && configuredHosts.length === 0) {
    throw new Error(
      "EPIMCP_ALLOWED_HOSTS is required when EPIMCP_MCP_HOST is not a loopback address",
    );
  }
  if (!loopback && !authToken) {
    throw new Error(
      "EPIMCP_AUTH_TOKEN is required when EPIMCP_MCP_HOST is not a loopback address",
    );
  }

  const allowedHosts = new Set(
    (configuredHosts.length > 0
      ? configuredHosts
      : [host, "127.0.0.1", "localhost", "::1"]
    ).map(normalizeHostname),
  );
  const allowedOrigins = new Set(
    (configuredOrigins.length > 0
      ? configuredOrigins
      : loopback
        ? defaultLoopbackOrigins(port)
        : []
    ).map(normalizeOrigin),
  );

  return {
    host,
    port,
    allowedHosts,
    allowedOrigins,
    authToken,
    maxBodyBytes: parseInteger(
      env.EPIMCP_MAX_HTTP_BODY_BYTES,
      DEFAULT_MAX_BODY_BYTES,
      1024,
      100 * 1024 * 1024,
      "EPIMCP_MAX_HTTP_BODY_BYTES",
    ),
    rateLimitPerMinute: parseInteger(
      env.EPIMCP_RATE_LIMIT_PER_MINUTE,
      DEFAULT_RATE_LIMIT_PER_MINUTE,
      1,
      1_000_000,
      "EPIMCP_RATE_LIMIT_PER_MINUTE",
    ),
  };
}

function requestPath(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    throw new HttpStatusError(400, "Malformed request URL");
  }
}

function requestHostname(req: IncomingMessage): string {
  const host = req.headers.host;
  if (!host) {
    throw new HttpStatusError(400, "Missing Host header");
  }
  try {
    return normalizeHostname(host);
  } catch {
    throw new HttpStatusError(400, "Invalid Host header");
  }
}

function validateRequestAuthority(req: IncomingMessage, runtime: HttpRuntimeConfig): void {
  if (!runtime.allowedHosts.has(requestHostname(req))) {
    throw new HttpStatusError(403, "Host is not allowed");
  }

  const origin = req.headers.origin;
  if (origin) {
    let normalized: string;
    try {
      normalized = normalizeOrigin(origin);
    } catch {
      throw new HttpStatusError(403, "Origin is not allowed");
    }
    if (!runtime.allowedOrigins.has(normalized)) {
      throw new HttpStatusError(403, "Origin is not allowed");
    }
  }
}

function hasValidBearerToken(req: IncomingMessage, expectedToken: string): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return false;
  }
  const actual = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readJsonBody(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const contentType = req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpStatusError(415, "Content-Type must be application/json");
  }

  const declaredLength = Number(req.headers["content-length"]);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength >= 0 &&
    declaredLength > maxBodyBytes
  ) {
    throw new HttpStatusError(413, `Request body exceeds ${maxBodyBytes} bytes`);
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  let exceeded = false;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBodyBytes) {
      exceeded = true;
      continue;
    }
    chunks.push(buffer);
  }

  if (exceeded) {
    throw new HttpStatusError(413, `Request body exceeds ${maxBodyBytes} bytes`);
  }
  if (chunks.length === 0) {
    throw new HttpStatusError(400, "Request body must contain one JSON-RPC message");
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpStatusError(400, "Request body is not valid JSON");
  }
}

function sendJsonError(
  res: ServerResponse,
  status: number,
  message: string,
  extraHeaders: Record<string, string> = {},
): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    }),
  );
}

function checkRateLimit(
  req: IncomingMessage,
  entries: Map<string, RateLimitEntry>,
  limit: number,
): boolean {
  const now = Date.now();
  const key = req.socket.remoteAddress ?? "unknown";
  const entry = entries.get(key);
  if (!entry || now - entry.windowStartedAt >= 60_000) {
    entries.set(key, { windowStartedAt: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export function createHttpRequestHandler(
  config: Config,
  runtime: HttpRuntimeConfig,
): RequestListener {
  const rateLimits = new Map<string, RateLimitEntry>();

  return (req, res): void => {
    void (async () => {
      const path = requestPath(req);
      if (path === HEALTH_PATH && req.method === "GET") {
        res
          .writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          })
          .end(JSON.stringify({ status: "ok", transport: "streamable-http" }));
        return;
      }
      if (path !== MCP_PATH) {
        sendJsonError(res, 404, "Not found");
        return;
      }

      validateRequestAuthority(req, runtime);

      if (runtime.authToken && !hasValidBearerToken(req, runtime.authToken)) {
        sendJsonError(res, 401, "Bearer authentication is required", {
          "WWW-Authenticate": 'Bearer realm="epigenomics-mcp"',
        });
        return;
      }
      if (!checkRateLimit(req, rateLimits, runtime.rateLimitPerMinute)) {
        sendJsonError(res, 429, "Rate limit exceeded; retry in the next minute", {
          "Retry-After": "60",
        });
        return;
      }
      if (req.method !== "POST") {
        sendJsonError(res, 405, "Stateless mode accepts MCP messages via POST", {
          Allow: "POST",
        });
        return;
      }

      const parsedBody = await readJsonBody(req, runtime.maxBodyBytes);
      const server = createEpigenomicsMcpServer(config);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      let closed = false;
      const close = async (): Promise<void> => {
        if (closed) {
          return;
        }
        closed = true;
        await transport.close();
        await server.close();
      };
      res.once("close", () => {
        void close();
      });

      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
      } finally {
        await close();
      }
    })().catch((error: unknown) => {
      const status = error instanceof HttpStatusError ? error.status : 500;
      const message =
        error instanceof HttpStatusError
          ? error.message
          : "Internal server error";
      if (!(error instanceof HttpStatusError)) {
        const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
        process.stderr.write(`streamable-http request error: ${detail}\n`);
      }
      sendJsonError(res, status, message);
    });
  };
}

export async function startHttpServer(
  config: Config = loadConfig(),
  runtime: HttpRuntimeConfig = loadHttpRuntimeConfig(),
): Promise<Server> {
  const httpServer = createNodeHttpServer(createHttpRequestHandler(config, runtime));
  httpServer.requestTimeout = 30_000;
  httpServer.headersTimeout = 10_000;
  httpServer.keepAliveTimeout = 5_000;

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(runtime.port, runtime.host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const address = httpServer.address() as AddressInfo;
  const printableHost = address.family === "IPv6" ? `[${address.address}]` : address.address;
  process.stderr.write(
    `epigenomics-mcp streamable-http listening on http://${printableHost}:${address.port}${MCP_PATH}\n`,
  );
  return httpServer;
}

async function main(): Promise<void> {
  const httpServer = await startHttpServer();
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    httpServer.close((error) => {
      if (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entryPoint === import.meta.url) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
