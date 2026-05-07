#!/usr/bin/env node
/**
 * Quick stdio smoke test for the Epigenomics MCP server.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const serverPath = resolve(process.cwd(), "dist/epimcp/cli.js");
let serverExe = "node";
let args = [serverPath, "serve"];
try {
  await import("node:fs").then((fs) => fs.promises.access(serverPath));
} catch {
  serverExe = "npx";
  args = ["tsx", resolve(process.cwd(), "src/epimcp/cli.ts"), "serve"];
}

const child = spawn(serverExe, args, {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "inherit"],
});

const initRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-client", version: "0.1.0" },
  },
};

const healthRequest = {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "health",
    arguments: {},
  },
};

await new Promise((r) => setTimeout(r, 500));
child.stdin.write(JSON.stringify(initRequest) + "\n");
await new Promise((r) => setTimeout(r, 300));
child.stdin.write(JSON.stringify(healthRequest) + "\n");
await new Promise((r) => setTimeout(r, 300));

child.kill("SIGTERM");
await new Promise((r) => child.on("exit", r));
console.log("Smoke test completed.");
