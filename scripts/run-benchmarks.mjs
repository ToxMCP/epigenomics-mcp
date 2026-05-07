#!/usr/bin/env node
/**
 * Benchmark runner CLI for Epigenomics MCP.
 *
 * Loads the benchmark manifest, executes all benchmarks against golden
 * expected outputs, writes reports and diffs, and exits non-zero on failure.
 *
 * Usage:
 *   node scripts/run-benchmarks.mjs
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadBenchmarkManifest } from "../dist/benchmarks/manifest.js";
import { runBenchmarks, formatRunnerReport } from "../dist/benchmarks/runner.js";

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

function ensureFreshDir(dir) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
  }
  mkdirSync(dir, { recursive: true });
}

function writeDiffFiles(result, diffsDir) {
  let diffCount = 0;
  for (const benchmark of result.benchmarks) {
    for (const step of benchmark.steps) {
      if (!step.passed && step.compareResult && step.compareResult.diffs.length > 0) {
        const diffFile = join(
          diffsDir,
          `${benchmark.benchmarkName}__${step.stepName}.diff.txt`,
        );
        const lines = [
          `Benchmark: ${benchmark.benchmarkName}`,
          `Step:      ${step.stepName} (${step.tool})`,
          `Output:    ${step.outputFile}`,
          "",
          "Differences:",
        ];
        for (const diff of step.compareResult.diffs) {
          lines.push(`  at ${diff.path}:`);
          lines.push(`    expected: ${JSON.stringify(diff.expected)}`);
          lines.push(`    actual:   ${JSON.stringify(diff.actual)}`);
          lines.push("");
        }
        writeFileSync(diffFile, lines.join("\n"), "utf-8");
        diffCount++;
      }
    }
  }
  return diffCount;
}

function main() {
  const { outDir } = parseArgs(process.argv.slice(2));
  const diffsDir = join(outDir, "diffs");
  console.log("Loading benchmark manifest...");
  const manifest = loadBenchmarkManifest(MANIFEST_PATH);

  console.log(`Running ${manifest.benchmarks.length} benchmark(s)...\n`);
  const result = runBenchmarks(manifest);

  ensureDir(outDir);
  ensureFreshDir(diffsDir);

  // Write JSON report
  const jsonReport = {
    passed: result.passed,
    summary: {
      totalBenchmarks: result.benchmarks.length,
      passedBenchmarks: result.benchmarks.filter((b) => b.passed).length,
      failedBenchmarks: result.benchmarks.filter((b) => !b.passed).length,
      totalSteps: result.benchmarks.reduce((sum, b) => sum + b.steps.length, 0),
      failedSteps: result.benchmarks.reduce(
        (sum, b) => sum + b.steps.filter((s) => !s.passed).length,
        0,
      ),
    },
    benchmarks: result.benchmarks,
  };
  writeFileSync(
    join(outDir, "report.json"),
    JSON.stringify(jsonReport, null, 2) + "\n",
    "utf-8",
  );

  // Write human-readable report
  const textReport = formatRunnerReport(result);
  writeFileSync(join(outDir, "report.txt"), textReport + "\n", "utf-8");

  // Write individual diff files for failed steps
  const diffCount = writeDiffFiles(result, diffsDir);

  // Print report to stdout
  console.log(textReport);
  console.log(`\nWrote ${diffCount} diff file(s) to ${diffsDir}`);
  console.log(`Wrote report.json and report.txt to ${outDir}`);

  if (!result.passed) {
    console.error("\nBenchmark run FAILED. See report.txt and diff files for details.");
    process.exit(1);
  }

  console.log("\nBenchmark run PASSED.");
  process.exit(0);
}

main();
