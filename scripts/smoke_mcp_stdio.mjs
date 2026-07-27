#!/usr/bin/env node

import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = resolve(process.cwd(), "dist/epimcp/cli.js");
const transport = new StdioClientTransport({
  command: "node",
  args: [serverPath, "serve"],
  cwd: process.cwd(),
  stderr: "pipe",
});
const client = new Client({ name: "epimcp-stdio-smoke", version: "0.1.0" });

let stderr = "";
transport.stderr?.setEncoding("utf8");
transport.stderr?.on("data", (chunk) => {
  stderr += chunk;
});

try {
  await client.connect(transport);

  const listed = await client.listTools();
  assert.equal(listed.tools.length, 17);
  const readTable = listed.tools.find((tool) => tool.name === "read_table");
  assert.ok(readTable?.outputSchema);
  assert.deepEqual(readTable.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });

  const health = await client.callTool({ name: "health", arguments: {} });
  assert.notEqual(health.isError, true);
  assert.equal(health.structuredContent?.status, "ok");

  const invalidQualification = await client.callTool({
    name: "qualify_features",
    arguments: { packet: { invalid: true } },
  });
  assert.notEqual(invalidQualification.isError, true);
  assert.equal(invalidQualification.structuredContent?.qualifiedCount, 0);

  const resources = await client.listResources();
  assert.ok(
    resources.resources.some(
      (resource) => resource.uri === "epimcp://docs/tool-reference",
    ),
  );
  const toolReference = await client.readResource({
    uri: "epimcp://docs/tool-reference",
  });
  assert.match(toolReference.contents[0]?.text ?? "", /MCP payload envelope/);

  console.log(
    `stdio smoke passed: initialize, listTools, health, qualification, resources (${listed.tools.length} tools)`,
  );
} catch (error) {
  if (stderr) {
    process.stderr.write(stderr);
  }
  throw error;
} finally {
  await client.close().catch(() => undefined);
}
