#!/usr/bin/env node
/**
 * Release gate CLI for Epigenomics MCP.
 *
 * Runs the full release-readiness gate including:
 *   - schema drift detection
 *   - expected golden output completeness
 *   - golden output comparison
 *   - nondeterminism detection
 *
 * Exits 0 when release-ready, 1 otherwise.
 *
 * Usage:
 *   node scripts/release-gate.mjs
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadBenchmarkManifest } from "../dist/benchmarks/manifest.js";
import { runReleaseGate, formatReleaseGateReport } from "../dist/benchmarks/release_gate.js";

const MANIFEST_PATH = join(process.cwd(), "benchmark_manifest.yaml");

function parseArgs(argv) {
  const args = { outDir: join(process.cwd(), "benchmark-results") };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out-dir" || arg === "--output-dir") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a directory value`);
      }
      args.outDir = resolve(value);
      i++;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function main() {
  const { outDir } = parseArgs(process.argv.slice(2));
  console.log("Loading benchmark manifest...");
  const manifest = loadBenchmarkManifest(MANIFEST_PATH);

  console.log("Running release gate checks...\n");
  const result = runReleaseGate(manifest);

  ensureDir(outDir);

  // Write JSON report
  const jsonReport = {
    ready: result.ready,
    checks: result.checks.map((c) => ({
      name: c.name,
      passed: c.passed,
      details: c.details,
    })),
    benchmarkSummary: {
      totalBenchmarks: result.benchmarkResult.benchmarks.length,
      passedBenchmarks: result.benchmarkResult.benchmarks.filter((b) => b.passed).length,
      failedBenchmarks: result.benchmarkResult.benchmarks.filter((b) => !b.passed).length,
    },
  };
  writeFileSync(
    join(outDir, "release-gate.json"),
    JSON.stringify(jsonReport, null, 2) + "\n",
    "utf-8",
  );

  // Write human-readable report
  const textReport = formatReleaseGateReport(result);
  writeFileSync(join(outDir, "release-gate.txt"), textReport + "\n", "utf-8");

  // Print report to stdout
  console.log(textReport);
  console.log(`\nWrote release-gate.json and release-gate.txt to ${outDir}`);

  if (!result.ready) {
    console.error("\nRelease gate BLOCKED. Fix failing checks before releasing.");
    process.exit(1);
  }

  console.log("\nRelease gate PASSED. Release-ready.");
  process.exit(0);
}

main();
