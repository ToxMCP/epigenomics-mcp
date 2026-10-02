/** Exercise source or installed npm packages with actual SDK1/SDK2 clients. */
import { strict as assert } from "node:assert";
import { spawn, execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { checkReports } from "./check_protocol_compatibility.mjs";

const root = resolve(import.meta.dirname, "..");
const { values } = parseArgs({ options: {
  "server-root": { type: "string", default: root },
  "output-dir": { type: "string" },
} });
assert.ok(values["output-dir"], "--output-dir is required");
const serverRoot = resolve(values["server-root"]);
const output = resolve(values["output-dir"]);
const dataRoot = resolve(output, "workspace");
mkdirSync(dataRoot, { recursive: true });
cpSync(resolve(root, "tests/compatibility/data"), resolve(dataRoot, "tests/compatibility/data"), { recursive: true });
mkdirSync(resolve(dataRoot, "benchmarks/fixtures/frozen_public/gse67005"), { recursive: true });
cpSync(resolve(root, "benchmarks/fixtures/frozen_public/gse67005/design.tsv"), resolve(dataRoot, "benchmarks/fixtures/frozen_public/gse67005/design.tsv"));
const env = { ...process.env, EPIMCP_ALLOWED_FILE_ROOTS: dataRoot, EPIMCP_MCP_HOST: "127.0.0.1", EPIMCP_MCP_PORT: "0", EPIMCP_RATE_LIMIT_PER_MINUTE: "1000" };
delete env.EPIMCP_AUTH_TOKEN;
const reports = [];
for (const modern of [false, true]) {
  const sdkRoot = modern ? root : resolve(root, "tests/compatibility/legacy-client");
  const mode = modern ? "modern" : "legacy";
  function probe(transport, url) {
    const outputPath = resolve(output, `${mode}-${transport}.json`);
    execFileSync(process.execPath, [resolve(root, "scripts/protocol_probe.mjs"), "--sdk-root", sdkRoot,
      "--modern", String(modern), "--server-root", serverRoot, "--data-root", dataRoot,
      "--fixtures", resolve(root, "tests/compatibility/requests.json"), "--output", outputPath,
      ...(url ? ["--url", url] : [])], { cwd: dataRoot, env, stdio: "inherit", timeout: 120_000 });
    reports.push(JSON.parse(readFileSync(outputPath, "utf8")));
  }
  probe("stdio");
  const child = spawn(process.execPath, ["--import", resolve(root, "scripts/compatibility-clock.mjs"), resolve(serverRoot, "dist/epimcp/http.js")], { cwd: dataRoot, env, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  try {
    const deadline = Date.now() + 15_000;
    let match;
    while (!(match = stderr.match(/listening on (http:\/\/127\.0\.0\.1:\d+\/mcp)/))) {
      assert.equal(child.exitCode, null, stderr);
      assert.ok(Date.now() < deadline, `HTTP startup timed out: ${stderr}`);
      await new Promise(done => setTimeout(done, 25));
    }
    probe("http", match[1]);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise(done => { child.once("exit", done); setTimeout(() => { child.kill("SIGKILL"); done(); }, 5000).unref(); });
    }
  }
}
console.log(JSON.stringify(checkReports(reports, JSON.parse(readFileSync(resolve(root, "tests/compatibility/v0.2.2-catalog-sha256.json"), "utf8")))));
