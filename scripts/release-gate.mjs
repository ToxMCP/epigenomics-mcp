#!/usr/bin/env node
/**
 * Release gate CLI for Epigenomics MCP.
 *
 * Runs the full release-readiness gate including:
 *   - schema drift detection
 *   - expected golden output completeness
 *   - golden output comparison
 *   - nondeterminism detection
 *   - ordered-trend simulation calibration and baseline drift
 *   - qualification performance budget
 *
 * Exits 0 when release-ready, 1 otherwise.
 *
 * Usage:
 *   node scripts/release-gate.mjs
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

import { loadBenchmarkManifest } from "../dist/benchmarks/manifest.js";
import { runReleaseGate, formatReleaseGateReport } from "../dist/benchmarks/release_gate.js";
import { runOrderedTrendCalibration } from "../dist/trend/calibration.js";

const MANIFEST_PATH = join(process.cwd(), "benchmark_manifest.yaml");
const ORDERED_TREND_CALIBRATION_EXPECTED = join(
  process.cwd(),
  "benchmarks",
  "expected",
  "ordered_trend_calibration",
  "report.json",
);

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

function runPerformanceGate() {
  const run = spawnSync(
    process.execPath,
    [
      "--expose-gc",
      "benchmarks/qualification_engine_benchmark.mjs",
      "--features",
      "10000",
      "--replicates",
      "6",
      "--max-seconds",
      process.env.EPIMCP_PERFORMANCE_MAX_SECONDS ?? "20",
      "--max-rss-mib",
      process.env.EPIMCP_PERFORMANCE_MAX_RSS_MIB ?? "512",
      "--json",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  try {
    const report = JSON.parse(run.stdout.trim());
    return {
      report,
      check: {
        name: "qualification_performance",
        passed: run.status === 0 && report.passed === true,
        details:
          `${report.workload.features} real qualifications in ` +
          `${report.performance.elapsedSeconds.toFixed(3)}s; ` +
          `${report.performance.rssIncreaseMib.toFixed(1)} MiB RSS increase`,
      },
    };
  } catch {
    return {
      report: null,
      check: {
        name: "qualification_performance",
        passed: false,
        details:
          run.stderr.trim() ||
          run.stdout.trim() ||
          "Performance benchmark produced no parseable report",
      },
    };
  }
}

function runOrderedTrendCalibrationGate(outDir) {
  const report = runOrderedTrendCalibration();
  writeFileSync(
    join(outDir, "ordered-trend-calibration.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf-8",
  );
  const calibrationCheck = {
    name: "ordered_trend_calibration",
    passed: report.summary.ready,
    details:
      `${report.summary.passedGatedCheckCount}/${report.summary.gatedCheckCount} ` +
      `gated checks passed; ${report.summary.diagnosticScenarioCount} ` +
      "assumption-stress/weak-signal scenarios retained as diagnostics",
  };

  if (!existsSync(ORDERED_TREND_CALIBRATION_EXPECTED)) {
    return {
      report,
      checks: [
        calibrationCheck,
        {
          name: "ordered_trend_calibration_drift",
          passed: false,
          details: `Missing expected calibration report: ${ORDERED_TREND_CALIBRATION_EXPECTED}`,
        },
      ],
    };
  }
  const expected = JSON.parse(
    readFileSync(ORDERED_TREND_CALIBRATION_EXPECTED, "utf-8"),
  );
  const driftFree = JSON.stringify(report) === JSON.stringify(expected);
  return {
    report,
    checks: [
      calibrationCheck,
      {
        name: "ordered_trend_calibration_drift",
        passed: driftFree,
        details: driftFree
          ? "Fresh deterministic calibration matches the committed expected report."
          : "Calibration drift detected; inspect the fresh ordered-trend-calibration.json before updating the expected report.",
      },
    ],
  };
}

function main() {
  const { outDir } = parseArgs(process.argv.slice(2));
  console.log("Loading benchmark manifest...");
  const manifest = loadBenchmarkManifest(MANIFEST_PATH);

  console.log("Running release gate checks...\n");
  const result = runReleaseGate(manifest);
  ensureDir(outDir);
  const performance = runPerformanceGate();
  const calibration = runOrderedTrendCalibrationGate(outDir);
  const ready =
    result.ready &&
    performance.check.passed &&
    calibration.checks.every((check) => check.passed);

  // Write JSON report
  const jsonReport = {
    ready,
    checks: [
      ...result.checks.map((c) => ({
        name: c.name,
        passed: c.passed,
        details: c.details,
      })),
      performance.check,
      ...calibration.checks,
    ],
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
  const textReport =
    `${formatReleaseGateReport(result)}\n` +
    `${performance.check.passed ? "PASS" : "FAIL"}: ` +
    `${performance.check.name} — ${performance.check.details}\n` +
    calibration.checks
      .map(
        (check) =>
          `${check.passed ? "PASS" : "FAIL"}: ${check.name} — ${check.details}`,
      )
      .join("\n") +
    "\n" +
    `Overall release gate: ${ready ? "READY" : "BLOCKED"}`;
  writeFileSync(join(outDir, "release-gate.txt"), textReport + "\n", "utf-8");

  // Print report to stdout
  console.log(textReport);
  console.log(`\nWrote release-gate.json and release-gate.txt to ${outDir}`);

  if (!ready) {
    console.error("\nRelease gate BLOCKED. Fix failing checks before releasing.");
    process.exit(1);
  }

  console.log("\nRelease gate PASSED. Release-ready.");
  process.exit(0);
}

main();
