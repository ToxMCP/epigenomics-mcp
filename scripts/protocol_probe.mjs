/** Capture the complete released catalog and representative application results. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { strict as assert } from "node:assert";

const values = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, args) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), args[index + 1]]);
  return pairs;
}, []));
const sdkRoot = resolve(values["sdk-root"]);
const serverRoot = resolve(values["server-root"]);
const fixture = JSON.parse(readFileSync(resolve(values.fixtures), "utf8"));
const modern = values.modern === "true";
const { Client } = await import(pathToFileURL(resolve(sdkRoot, modern ? "node_modules/@modelcontextprotocol/client/dist/index.mjs" : "node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js")));
const { StdioClientTransport } = modern
  ? await import(pathToFileURL(resolve(sdkRoot, "node_modules/@modelcontextprotocol/client/dist/stdio.mjs")))
  : await import(pathToFileURL(resolve(sdkRoot, "node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js")));
const transport = values.url ? new (await import(pathToFileURL(resolve(sdkRoot, modern
  ? "node_modules/@modelcontextprotocol/client/dist/index.mjs"
  : "node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js")))).StreamableHTTPClientTransport(new URL(values.url)) : new StdioClientTransport({
  command: process.execPath,
  args: ["--import", resolve(import.meta.dirname, "compatibility-clock.mjs"), resolve(serverRoot, "dist/epimcp/cli.js"), "serve"],
  cwd: resolve(values["data-root"] ?? serverRoot),
  stderr: "pipe",
});
const client = new Client({ name: "epimcp-compatibility", version: "1" }, modern ? { versionNegotiation: { mode: "modern" } } : {});
let stderr = "";
transport.stderr?.on("data", chunk => { stderr += chunk; });
try {
  await client.connect(transport);
  if (modern) {
    assert.equal(client.getNegotiatedProtocolVersion(), "2026-07-28");
    assert.equal(client.getProtocolEra(), "modern");
    assert.ok(client.getDiscoverResult());
  }
  const catalog = { tools: (await client.listTools()).tools, resources: (await client.listResources()).resources };
  const results = {};
  for (const call of fixture.calls) {
    results[call.label] = await client.callTool({ name: call.name, arguments: call.arguments });
    assert.equal(Boolean(results[call.label].isError), Boolean(call.isError), call.label);
  }
  for (const uri of fixture.resources) results[uri] = await client.readResource({ uri });
  assert.equal(client.getServerVersion()?.version, JSON.parse(readFileSync(resolve(serverRoot, "package.json"), "utf8")).version);
  const report = { clientSDK: modern ? "2.2.0" : "1.31.0", protocol: modern ? client.getNegotiatedProtocolVersion() : "2025-11-25", serverInfo: client.getServerVersion(), catalog, results };
  writeFileSync(resolve(values.output), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ clientSDK: report.clientSDK, tools: catalog.tools.length, resources: catalog.resources.length, workflows: Object.keys(results).length }));
} catch (error) {
  process.stderr.write(stderr);
  throw error;
} finally {
  await client.close().catch(() => undefined);
}
