import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { request as nodeRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ConfigSchema } from "../../src/epimcp/config.js";
import { loadHttpRuntimeConfig, startHttpServer } from "../../src/epimcp/http.js";

const revision = "2026-07-28";
const token = "epimcp-protocol-test-token";
function message(method: string, params: Record<string, unknown> = {}, id = 7) {
  return { jsonrpc: "2.0", id, method, params: {
    ...params,
    _meta: {
      "io.modelcontextprotocol/protocolVersion": revision,
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  } };
}
function headers(method: string, name?: string): Record<string, string> {
  return { Accept: "application/json, text/event-stream", "Content-Type": "application/json",
    Authorization: `Bearer ${token}`, "MCP-Protocol-Version": revision, "Mcp-Method": method,
    ...(name ? { "Mcp-Name": name } : {}),
  };
}

describe("modern HTTP protocol and preserved operator guards", () => {
  let server: Server;
  let endpoint: string;
  const post = (method: string, params: Record<string, unknown> = {}, name?: string) => fetch(endpoint, {
    method: "POST", headers: headers(method, name), body: JSON.stringify(message(method, params)),
  });
  beforeAll(async () => {
    server = await startHttpServer(ConfigSchema.parse({}), loadHttpRuntimeConfig({
      EPIMCP_MCP_PORT: "0", EPIMCP_AUTH_TOKEN: token, EPIMCP_RATE_LIMIT_PER_MINUTE: "1000",
    }));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  });
  afterAll(async () => {
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  });

  it("discovers and reads privately cached catalogs without sessions", async () => {
    const discovery = await post("server/discover");
    expect(discovery.status).toBe(200);
    expect((await discovery.json()).result.supportedVersions).toContain(revision);
    for (const [method, key, count] of [["tools/list", "tools", 17], ["resources/list", "resources", 16]] as const) {
      const response = await post(method);
      expect(response.headers.get("mcp-session-id")).toBeNull();
      const { result } = await response.json();
      expect(result[key]).toHaveLength(count);
      expect(result.ttlMs).toBe(60_000);
      expect(result.cacheScope).toBe("private");
    }
  });

  it.each(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"])("retains legacy HTTP protocol %s", async protocolVersion => {
    const response = await fetch(endpoint, {
      method: "POST", headers: { ...headers("initialize"), "MCP-Protocol-Version": protocolVersion },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
        protocolVersion, capabilities: {}, clientInfo: { name: "legacy-test", version: "1" },
      } }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body.result.protocolVersion).toBe(protocolVersion);
  });

  it("rejects mismatched method/name routing headers and remains usable", async () => {
    for (const wrong of [{ "Mcp-Method": "resources/list" }, { "Mcp-Name": "read_table" }]) {
      const response = await fetch(endpoint, { method: "POST", headers: { ...headers("tools/call", "health"), ...wrong },
        body: JSON.stringify(message("tools/call", { name: "health", arguments: {} })),
      });
      expect(response.ok).toBe(false);
      expect((await response.json()).error).toBeDefined();
    }
    expect((await post("tools/call", { name: "health", arguments: {} }, "health")).status).toBe(200);
  });

  it("retains bearer, Host and Origin protections", async () => {
    const body = JSON.stringify(message("server/discover"));
    for (const [extra, expected] of [[{ Authorization: "" }, 401], [{ Host: "attacker.example" }, 403], [{ Origin: "https://attacker.example" }, 403]] as const) {
      // Use node:http so fetch cannot replace an intentionally hostile Host.
      const status = await new Promise<number | undefined>((done, reject) => {
        const req = nodeRequest(endpoint, { method: "POST", headers: { ...headers("server/discover"), ...extra } }, res => {
          res.resume();
          res.once("end", () => done(res.statusCode));
        });
        req.once("error", reject);
        req.end(body);
      });
      expect(status).toBe(expected);
    }
  });

  it("bounds bodies, rejects malformed JSON, and recovers after unknown methods", async () => {
    const oversized = await fetch(endpoint, { method: "POST", headers: headers("server/discover"), body: " ".repeat(1024 * 1024 + 1) });
    expect(oversized.status).toBe(413);
    const malformed = await fetch(endpoint, { method: "POST", headers: headers("server/discover"), body: "{" });
    expect(malformed.status).toBe(400);
    const unknown = await post("tools/not_a_real_method");
    expect((await unknown.json()).error.code).toBe(-32601);
    expect((await post("server/discover")).status).toBe(200);
  });

  it("keeps parallel scientific results isolated when JSON-RPC IDs collide", async () => {
    const packet = JSON.parse(readFileSync("tests/fixtures/valid_packet.json", "utf8"));
    const results = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
      const candidate = structuredClone(packet);
      for (const feature of candidate.features) {
        for (const sample of Object.keys(feature.values)) feature.values[sample] = (index + 1) / 20;
      }
      const response = await post("tools/call", { name: "summarize_by_group", arguments: { packet: candidate } }, "summarize_by_group");
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.id).toBe(7);
      expect(body.result.isError).not.toBe(true);
      expect(body.result.structuredContent.packet.summaries[0].mean).toBe((index + 1) / 20);
      return body.result.structuredContent.packet.packetId;
    }));
    expect(new Set(results).size).toBe(12);
  });

  it("keeps the non-loopback authentication startup guard", () => {
    expect(() => loadHttpRuntimeConfig({ EPIMCP_MCP_HOST: "0.0.0.0" })).toThrow("EPIMCP_ALLOWED_HOSTS");
    expect(() => loadHttpRuntimeConfig({ EPIMCP_MCP_HOST: "0.0.0.0", EPIMCP_ALLOWED_HOSTS: "epi.example.org" })).toThrow("EPIMCP_AUTH_TOKEN");
  });
});
