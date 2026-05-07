import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  runBenchmarks,
  formatRunnerReport,
  type RunnerResult,
} from "../../src/benchmarks/runner.js";
import { loadBenchmarkManifest } from "../../src/benchmarks/manifest.js";
import { compareObjects, formatCompareResult } from "../../src/benchmarks/compare.js";

const MANIFEST_PATH = join(process.cwd(), "benchmark_manifest.yaml");

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("benchmark runner", () => {
  it("runs all benchmarks from manifest and reports pass when golden outputs match", () => {
    const manifest = loadBenchmarkManifest(MANIFEST_PATH);
    const result = runBenchmarks(manifest);

    expect(result.passed).toBe(true);
    expect(result.benchmarks.length).toBe(manifest.benchmarks.length);

    for (const benchmark of result.benchmarks) {
      expect(benchmark.passed).toBe(true);
      for (const step of benchmark.steps) {
        expect(step.passed).toBe(true);
        expect(step.compareResult.match).toBe(true);
        expect(step.compareResult.diffs).toEqual([]);
      }
    }
  });

  it("formatRunnerReport renders a readable report for passed benchmarks", () => {
    const manifest = loadBenchmarkManifest(MANIFEST_PATH);
    const result = runBenchmarks(manifest);
    const report = formatRunnerReport(result);

    expect(report).toContain("=== Benchmark Runner Report ===");
    expect(report).toContain("=== Overall: PASSED ===");
    expect(report).toContain("[PASS]");
  });
});

describe("benchmark drift detection", () => {
  const DRIFT_FIXTURE_NAME = "bm_beta_manifest_complete";
  const DRIFT_STEP_OUTPUT = "design_validation.json";
  const expectedDir = join(process.cwd(), "benchmarks", "expected", DRIFT_FIXTURE_NAME);
  const backupPath = join(expectedDir, `.${DRIFT_STEP_OUTPUT}.backup`);

  function backupGolden() {
    const originalPath = join(expectedDir, DRIFT_STEP_OUTPUT);
    writeFileSync(backupPath, readFileSync(originalPath));
  }

  function restoreGolden() {
    const originalPath = join(expectedDir, DRIFT_STEP_OUTPUT);
    if (existsSync(backupPath)) {
      writeFileSync(originalPath, readFileSync(backupPath));
      rmSync(backupPath);
    }
  }

  it("fails with actionable diffs when a golden output drifts", () => {
    backupGolden();

    try {
      // Intentionally drift the golden output
      const originalPath = join(expectedDir, DRIFT_STEP_OUTPUT);
      const original = loadJson(originalPath) as Record<string, unknown>;
      const drifted = {
        ...original,
        schemaValid: !original.schemaValid, // flip the boolean
      };
      writeFileSync(originalPath, JSON.stringify(drifted, null, 2) + "\n");

      const manifest = loadBenchmarkManifest(MANIFEST_PATH);
      const result = runBenchmarks(manifest);

      expect(result.passed).toBe(false);

      const driftedBenchmark = result.benchmarks.find(
        (b) => b.benchmarkName === DRIFT_FIXTURE_NAME,
      );
      expect(driftedBenchmark).toBeDefined();
      expect(driftedBenchmark!.passed).toBe(false);

      const driftedStep = driftedBenchmark!.steps.find(
        (s) => s.outputFile === DRIFT_STEP_OUTPUT,
      );
      expect(driftedStep).toBeDefined();
      expect(driftedStep!.passed).toBe(false);
      expect(driftedStep!.compareResult.match).toBe(false);
      expect(driftedStep!.compareResult.diffs.length).toBeGreaterThan(0);

      const diff = driftedStep!.compareResult.diffs[0];
      expect(diff.path).toBe("schemaValid");
      expect(diff.expected).toBe(!original.schemaValid);
      expect(diff.actual).toBe(original.schemaValid);

      // Verify the report contains actionable diff output
      const report = formatRunnerReport(result);
      expect(report).toContain("=== Overall: FAILED ===");
      expect(report).toContain("[FAIL]");
      expect(report).toContain("schemaValid");
    } finally {
      restoreGolden();
    }
  });
});

describe("benchmark compare utilities", () => {
  it("compareObjects returns match=true for identical objects", () => {
    const obj = { a: 1, b: [1, 2], c: { d: "test" } };
    const result = compareObjects(obj, obj);
    expect(result.match).toBe(true);
    expect(result.diffs).toEqual([]);
  });

  it("compareObjects collects all nested differences", () => {
    const expected = { a: 1, b: { c: "x", d: [1, 2] } };
    const actual = { a: 2, b: { c: "y", d: [1, 3] } };
    const result = compareObjects(expected, actual);

    expect(result.match).toBe(false);
    expect(result.diffs.length).toBe(3);

    const paths = result.diffs.map((d) => d.path);
    expect(paths).toContain("a");
    expect(paths).toContain("b.c");
    expect(paths).toContain("b.d[1]");
  });

  it("formatCompareResult produces actionable output", () => {
    const result = compareObjects({ value: 42 }, { value: 99 });
    const formatted = formatCompareResult(result);
    expect(formatted).toContain("value");
    expect(formatted).toContain("42");
    expect(formatted).toContain("99");
  });

  it("compareObjects detects missing keys", () => {
    const expected = { a: 1, b: 2 };
    const actual = { a: 1 };
    const result = compareObjects(expected, actual);
    expect(result.match).toBe(false);
    expect(result.diffs.some((d) => d.path === "b")).toBe(true);
  });

  it("compareObjects detects extra keys", () => {
    const expected = { a: 1 };
    const actual = { a: 1, b: 2 };
    const result = compareObjects(expected, actual);
    expect(result.match).toBe(false);
    expect(result.diffs.some((d) => d.path === "b")).toBe(true);
  });

  it("compareObjects detects array length differences", () => {
    const expected = [1, 2, 3];
    const actual = [1, 2];
    const result = compareObjects(expected, actual);
    expect(result.match).toBe(false);
    expect(result.diffs.some((d) => d.path === "[2]")).toBe(true);
  });
});
