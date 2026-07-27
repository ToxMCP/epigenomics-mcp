#!/usr/bin/env node

import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const serverPath = resolve(process.cwd(), "dist/epimcp/http.js");
const authToken = "epimcp-http-smoke-token";
const child = spawn("node", [serverPath], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    EPIMCP_MCP_HOST: "127.0.0.1",
    EPIMCP_MCP_PORT: "0",
    EPIMCP_AUTH_TOKEN: authToken,
    EPIMCP_MAX_HTTP_BODY_BYTES: "2048",
    EPIMCP_RATE_LIMIT_PER_MINUTE: "1000",
  },
  stdio: ["ignore", "ignore", "pipe"],
});

let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

async function waitForEndpoint() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const match = stderr.match(
      /streamable-http listening on (http:\/\/127\.0\.0\.1:\d+\/mcp)/,
    );
    if (match) {
      return new URL(match[1]);
    }
    if (child.exitCode !== null) {
      throw new Error(`HTTP server exited before startup:\n${stderr}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error(`Timed out waiting for HTTP server startup:\n${stderr}`);
}

async function stopChild() {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("HTTP server did not stop after SIGTERM")), 5_000),
    ),
  ]);
}

let client;
try {
  const endpoint = await waitForEndpoint();
  const baseUrl = new URL(endpoint);
  baseUrl.pathname = "/";

  const healthResponse = await fetch(new URL("/health", baseUrl));
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    status: "ok",
    transport: "streamable-http",
  });

  const unauthenticated = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });
  assert.equal(unauthenticated.status, 401);

  const hostileOrigin = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
  });
  assert.equal(hostileOrigin.status, 403);

  const getResponse = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get("allow"), "POST");

  const oversizedResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: "x".repeat(4096) }),
  });
  assert.equal(oversizedResponse.status, 413);

  client = new Client({ name: "epimcp-http-smoke", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers: { Authorization: `Bearer ${authToken}` },
    },
  });
  await client.connect(transport);

  const listed = await client.listTools();
  assert.ok(listed.tools.some((tool) => tool.name === "health"));

  const health = await client.callTool({ name: "health", arguments: {} });
  assert.notEqual(health.isError, true);
  assert.equal(health.structuredContent?.status, "ok");

  console.log(
    `HTTP smoke passed: auth, Origin validation, limits, initialize, listTools, health (${listed.tools.length} tools)`,
  );
} finally {
  if (client) {
    await client.close().catch(() => undefined);
  }
  await stopChild();
}
