/** Check the released catalog and exact application results across real clients. */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function catalogFingerprint(catalog) {
  const copied = structuredClone(catalog);
  for (const tool of copied.tools) {
    if (tool.execution !== undefined) {
      assert.deepEqual(tool.execution, { taskSupport: "forbidden" });
      delete tool.execution; // SDK2 removes the deprecated Tasks metadata.
    }
  }
  function sort(value) {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
    return value;
  }
  return createHash("sha256").update(JSON.stringify(sort(copied))).digest("hex");
}

export function applicationResults(report) {
  const results = structuredClone(report.results);
  if (report.clientSDK === "2.2.0") {
    assert.equal(report.protocol, "2026-07-28");
    for (const [label, result] of Object.entries(results)) {
      assert.deepEqual(result._meta, { "io.modelcontextprotocol/serverInfo": report.serverInfo }, label);
      delete result._meta;
      if (label.startsWith("epimcp://")) {
        assert.equal(result.ttlMs, 0);
        assert.equal(result.cacheScope, "private");
        delete result.ttlMs;
        delete result.cacheScope;
      }
    }
  }
  return results;
}

export function checkReports(reports, baseline) {
  const results = applicationResults(reports[0]);
  for (const report of reports) {
    assert.deepEqual(report.serverInfo, reports[0].serverInfo);
    assert.equal(report.catalog.tools.length, 17);
    assert.equal(report.catalog.resources.length, 16);
    assert.equal(catalogFingerprint(report.catalog), baseline.catalogSha256);
    assert.deepEqual(applicationResults(report), results);
    assert.equal(Object.keys(report.results).length, baseline.applicationRequests);
  }
  return { compatible: true, clients: reports.length, tools: 17, resources: 16, workflows: baseline.applicationRequests };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [baselinePath, ...reportPaths] = process.argv.slice(2);
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const reports = reportPaths.map(path => JSON.parse(readFileSync(path, "utf8")));
  assert.ok(reports.length > 0);
  console.log(JSON.stringify(checkReports(reports, baseline)));
}
