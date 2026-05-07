import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { BenchmarkManifest } from "./manifest.js";
import { runBenchmarks, type RunnerResult } from "./runner.js";
import { compareObjects, type CompareResult } from "./compare.js";
import { exportAllSchemas } from "../scripts/export-schemas.js";
import { checkSchemaDrift } from "../scripts/schema-drift.js";

export interface GateCheck {
  name: string;
  passed: boolean;
  details: string;
}

export interface ReleaseGateResult {
  ready: boolean;
  checks: GateCheck[];
  benchmarkResult: RunnerResult;
}

const SCHEMAS_CURRENT_DIR = join(process.cwd(), "schemas", "current");

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "epimcp-gate-"));
}

/**
 * Verify that every expected output file referenced in the manifest exists.
 */
export function checkExpectedOutputsExist(manifest: BenchmarkManifest): GateCheck {
  const missing: string[] = [];

  for (const benchmark of manifest.benchmarks) {
    const expectedDir = join(process.cwd(), benchmark.expected);
    if (!existsSync(expectedDir)) {
      missing.push(`missing directory: ${benchmark.expected}`);
      continue;
    }
    for (const step of benchmark.steps) {
      const expectedFile = join(expectedDir, step.output);
      if (!existsSync(expectedFile)) {
        missing.push(`missing file: ${join(benchmark.expected, step.output)}`);
      }
    }
  }

  const passed = missing.length === 0;
  return {
    name: "expected_outputs_exist",
    passed,
    details: passed
      ? "All expected golden output files are present."
      : `Missing expected outputs:\n  ${missing.join("\n  ")}`,
  };
}

/**
 * Export schemas to a temp directory and compare against committed schemas.
 */
export function checkSchemaDriftGate(): GateCheck {
  let tempDir: string | undefined;
  try {
    tempDir = createTempDir();
    exportAllSchemas(tempDir);

    if (!existsSync(SCHEMAS_CURRENT_DIR)) {
      return {
        name: "schema_drift",
        passed: false,
        details: `Committed schema directory not found: ${SCHEMAS_CURRENT_DIR}`,
      };
    }

    const result = checkSchemaDrift(SCHEMAS_CURRENT_DIR, tempDir);
    return {
      name: "schema_drift",
      passed: !result.drift,
      details: result.drift
        ? `Schema drift detected:\n${result.diff}\n\nRegenerate with: npm run export:schemas`
        : "No schema drift detected.",
    };
  } catch (err) {
    return {
      name: "schema_drift",
      passed: false,
      details: `Schema drift check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Run benchmarks and detect golden drift by comparing against expected outputs.
 */
export function checkGoldenDrift(manifest: BenchmarkManifest): { check: GateCheck; result: RunnerResult } {
  const result = runBenchmarks(manifest);
  const passed = result.passed;
  const failedBenchmarks = result.benchmarks.filter((b) => !b.passed);

  let details: string;
  if (passed) {
    details = `All ${result.benchmarks.length} benchmark(s) passed golden comparison.`;
  } else {
    const lines = [
      `${failedBenchmarks.length} benchmark(s) failed golden comparison:`,
    ];
    for (const bm of failedBenchmarks) {
      lines.push(`  - ${bm.benchmarkName}`);
      for (const step of bm.steps.filter((s) => !s.passed)) {
        if (step.error) {
          lines.push(`      ${step.stepName}: ${step.error}`);
        } else {
          lines.push(`      ${step.stepName}: ${step.compareResult.diffs.length} diff(s)`);
        }
      }
    }
    details = lines.join("\n");
  }

  return {
    check: { name: "golden_drift", passed, details },
    result,
  };
}

/**
 * Run benchmarks twice and compare results to detect nondeterministic behaviour.
 */
export function checkNondeterminism(manifest: BenchmarkManifest): GateCheck {
  const run1 = runBenchmarks(manifest);
  const run2 = runBenchmarks(manifest);

  const compareResult = compareObjects(run1, run2);
  const passed = compareResult.match;

  return {
    name: "nondeterminism",
    passed,
    details: passed
      ? "Benchmark results are deterministic across two runs."
      : `Nondeterministic benchmark results detected:\n${formatDiffs(compareResult)}`,
  };
}

function formatDiffs(compareResult: CompareResult): string {
  if (compareResult.match) return "no differences";
  return compareResult.diffs
    .map((d) => `  at ${d.path}: expected ${JSON.stringify(d.expected)}, got ${JSON.stringify(d.actual)}`)
    .join("\n");
}

/**
 * Run the full release gate: schema drift, expected outputs, golden drift,
 * and nondeterminism checks.
 */
export function runReleaseGate(manifest: BenchmarkManifest): ReleaseGateResult {
  const checks: GateCheck[] = [];

  // 1. Schema drift
  checks.push(checkSchemaDriftGate());

  // 2. Missing expected outputs
  checks.push(checkExpectedOutputsExist(manifest));

  // 3. Golden drift (also returns benchmark result for reporting)
  const golden = checkGoldenDrift(manifest);
  checks.push(golden.check);

  // 4. Nondeterminism
  // Only run if golden drift passed; otherwise nondeterminism check is moot
  if (golden.check.passed) {
    checks.push(checkNondeterminism(manifest));
  } else {
    checks.push({
      name: "nondeterminism",
      passed: false,
      details: "Skipped: golden drift check failed; fix drift before checking determinism.",
    });
  }

  const ready = checks.every((c) => c.passed);

  return {
    ready,
    checks,
    benchmarkResult: golden.result,
  };
}

/**
 * Format a release gate result as a human-readable report.
 */
export function formatReleaseGateReport(result: ReleaseGateResult): string {
  const lines: string[] = [];
  lines.push("=== Epigenomics MCP Release Gate Report ===\n");

  for (const check of result.checks) {
    const status = check.passed ? "PASS" : "FAIL";
    lines.push(`[${status}] ${check.name}`);
    lines.push(`       ${check.details.split("\n").join("\n       ")}`);
    lines.push("");
  }

  const summaryStatus = result.ready ? "READY" : "BLOCKED";
  lines.push(`=== Release Status: ${summaryStatus} ===`);

  if (!result.ready) {
    lines.push("");
    lines.push("Blocked checks:");
    for (const check of result.checks.filter((c) => !c.passed)) {
      lines.push(`  - ${check.name}`);
    }
  }

  return lines.join("\n");
}
