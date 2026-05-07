import { describe, it, expect } from "vitest";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  mkdtempSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  checkExpectedOutputsExist,
  checkSchemaDriftGate,
  checkGoldenDrift,
  checkNondeterminism,
  runReleaseGate,
  formatReleaseGateReport,
  type ReleaseGateResult,
} from "../../src/benchmarks/release_gate.js";
import { loadBenchmarkManifest } from "../../src/benchmarks/manifest.js";
import { runBenchmarks } from "../../src/benchmarks/runner.js";

const MANIFEST_PATH = join(process.cwd(), "benchmark_manifest.yaml");

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("checkExpectedOutputsExist", () => {
  it("passes when all expected outputs are present", () => {
    const manifest = loadBenchmarkManifest(MANIFEST_PATH);
    const check = checkExpectedOutputsExist(manifest);
    expect(check.passed).toBe(true);
    expect(check.details).toContain("All expected golden output files are present");
  });

  it("fails when an expected directory is missing", () => {
    const manifest = loadBenchmarkManifest(MANIFEST_PATH);
    const brokenManifest = {
      ...manifest,
      benchmarks: [
        {
          ...manifest.benchmarks[0],
          expected: "benchmarks/expected/nonexistent_fixture_dir",
        },
      ],
    };
    const check = checkExpectedOutputsExist(brokenManifest);
    expect(check.passed).toBe(false);
    expect(check.details).toContain("missing directory");
  });

  it("fails when an expected file is missing", () => {
    const manifest = loadBenchmarkManifest(MANIFEST_PATH);
    const brokenManifest = {
      ...manifest,
      benchmarks: [
        {
          ...manifest.benchmarks[0],
          steps: [
            ...manifest.benchmarks[0].steps,
            { name: "fake_step", tool: "passthrough", output: "nonexistent.json" },
          ],
        },
      ],
    };
    const check = checkExpectedOutputsExist(brokenManifest);
    expect(check.passed).toBe(false);
    expect(check.details).toContain("missing file");
    expect(check.details).toContain("nonexistent.json");
  });
});

describe("checkSchemaDriftGate", () => {
  it("passes when committed schemas match freshly exported schemas", () => {
    const check = checkSchemaDriftGate();
    expect(check.passed).toBe(true);
    expect(check.details).toContain("No schema drift detected");
  });
});

describe("checkGoldenDrift", () => {
  it("passes when all golden outputs match", () => {
    const manifest = loadBenchmarkManifest(MANIFEST_PATH);
    const { check, result } = checkGoldenDrift(manifest);
    expect(check.passed).toBe(true);
    expect(result.passed).toBe(true);
    expect(check.details).toContain("passed golden comparison");
  });
});

describe("checkNondeterminism", () => {
  it("passes when benchmark results are deterministic", () => {
    const manifest = loadBenchmarkManifest(MANIFEST_PATH);
    const check = checkNondeterminism(manifest);
    expect(check.passed).toBe(true);
    expect(check.details).toContain("deterministic");
  });
});

describe("runReleaseGate", () => {
  it("returns ready=true when all checks pass", () => {
    const manifest = loadBenchmarkManifest(MANIFEST_PATH);
    const result = runReleaseGate(manifest);
    expect(result.ready).toBe(true);
    expect(result.checks.length).toBeGreaterThanOrEqual(4);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("includes all required checks", () => {
    const manifest = loadBenchmarkManifest(MANIFEST_PATH);
    const result = runReleaseGate(manifest);
    const checkNames = result.checks.map((c) => c.name);
    expect(checkNames).toContain("schema_drift");
    expect(checkNames).toContain("expected_outputs_exist");
    expect(checkNames).toContain("golden_drift");
    expect(checkNames).toContain("nondeterminism");
  });
});

describe("formatReleaseGateReport", () => {
  it("renders a readable report for a passing gate", () => {
    const manifest = loadBenchmarkManifest(MANIFEST_PATH);
    const result = runReleaseGate(manifest);
    const report = formatReleaseGateReport(result);

    expect(report).toContain("=== Epigenomics MCP Release Gate Report ===");
    expect(report).toContain("[PASS] schema_drift");
    expect(report).toContain("[PASS] expected_outputs_exist");
    expect(report).toContain("[PASS] golden_drift");
    expect(report).toContain("[PASS] nondeterminism");
    expect(report).toContain("=== Release Status: READY ===");
  });

  it("renders blocked checks for a failing gate", () => {
    const result: ReleaseGateResult = {
      ready: false,
      checks: [
        { name: "schema_drift", passed: true, details: "ok" },
        { name: "golden_drift", passed: false, details: "drift detected" },
      ],
      benchmarkResult: {
        passed: false,
        benchmarks: [],
      },
    };
    const report = formatReleaseGateReport(result);
    expect(report).toContain("[FAIL] golden_drift");
    expect(report).toContain("=== Release Status: BLOCKED ===");
    expect(report).toContain("Blocked checks:");
    expect(report).toContain("- golden_drift");
  });
});

describe("release gate failure modes", () => {
  const DRIFT_FIXTURE = "bm_beta_manifest_complete";
  const DRIFT_FILE = "design_validation.json";
  const EXPECTED_DIR = join(process.cwd(), "benchmarks", "expected", DRIFT_FIXTURE);
  const BACKUP_PATH = join(EXPECTED_DIR, `.${DRIFT_FILE}.backup`);

  function backupGolden() {
    writeFileSync(BACKUP_PATH, readFileSync(join(EXPECTED_DIR, DRIFT_FILE)));
  }

  function restoreGolden() {
    const originalPath = join(EXPECTED_DIR, DRIFT_FILE);
    if (existsSync(BACKUP_PATH)) {
      writeFileSync(originalPath, readFileSync(BACKUP_PATH));
      rmSync(BACKUP_PATH);
    }
  }

  it("fails release gate when golden output drifts", () => {
    backupGolden();

    try {
      const original = loadJson(join(EXPECTED_DIR, DRIFT_FILE)) as Record<string, unknown>;
      const drifted = { ...original, schemaValid: !original.schemaValid };
      writeFileSync(join(EXPECTED_DIR, DRIFT_FILE), JSON.stringify(drifted, null, 2) + "\n");

      const manifest = loadBenchmarkManifest(MANIFEST_PATH);
      const result = runReleaseGate(manifest);

      expect(result.ready).toBe(false);
      const goldenCheck = result.checks.find((c) => c.name === "golden_drift");
      expect(goldenCheck).toBeDefined();
      expect(goldenCheck!.passed).toBe(false);
      expect(goldenCheck!.details).toContain("failed golden comparison");
      expect(goldenCheck!.details).toContain(DRIFT_FIXTURE);

      // Nondeterminism should be skipped when golden drift fails
      const nondetCheck = result.checks.find((c) => c.name === "nondeterminism");
      expect(nondetCheck).toBeDefined();
      expect(nondetCheck!.passed).toBe(false);
      expect(nondetCheck!.details).toContain("Skipped");
    } finally {
      restoreGolden();
    }
  });

  it("fails release gate when expected output file is missing", () => {
    const manifest = loadBenchmarkManifest(MANIFEST_PATH);
    const brokenManifest = {
      ...manifest,
      benchmarks: [
        {
          ...manifest.benchmarks[0],
          steps: [
            ...manifest.benchmarks[0].steps,
            { name: "fake_step", tool: "passthrough", output: "does_not_exist.json" },
          ],
        },
      ],
    };
    const result = runReleaseGate(brokenManifest);

    expect(result.ready).toBe(false);
    const missingCheck = result.checks.find((c) => c.name === "expected_outputs_exist");
    expect(missingCheck).toBeDefined();
    expect(missingCheck!.passed).toBe(false);
    expect(missingCheck!.details).toContain("missing file");
  });
});

describe("release gate CLI script", () => {
  const CLI_PATH = join(process.cwd(), "scripts", "release-gate.mjs");

  it("exits 0 and writes report artifacts when gate passes", () => {
    const { execSync } = require("node:child_process");
    const resultsDir = mkdtempSync(join(tmpdir(), "epimcp-release-gate-cli-"));
    try {
      const stdout = execSync(`node "${CLI_PATH}" --out-dir "${resultsDir}"`, {
        encoding: "utf-8",
      });

      expect(stdout).toContain("=== Release Status: READY ===");
      expect(stdout).toContain("Release gate PASSED");
      expect(existsSync(join(resultsDir, "release-gate.json"))).toBe(true);
      expect(existsSync(join(resultsDir, "release-gate.txt"))).toBe(true);

      const jsonReport = loadJson(join(resultsDir, "release-gate.json")) as {
        ready: boolean;
        checks: Array<{ name: string; passed: boolean; details: string }>;
        benchmarkSummary: { totalBenchmarks: number; passedBenchmarks: number; failedBenchmarks: number };
      };
      expect(jsonReport.ready).toBe(true);
      expect(jsonReport.benchmarkSummary.failedBenchmarks).toBe(0);
      expect(jsonReport.checks.every((c) => c.passed)).toBe(true);
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });
});
