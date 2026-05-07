import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT_PATH = join(process.cwd(), "scripts", "run-benchmarks.mjs");
const DRIFT_FIXTURE = "bm_beta_manifest_complete";
const DRIFT_FILE = "design_validation.json";
const EXPECTED_DIR = join(process.cwd(), "benchmarks", "expected", DRIFT_FIXTURE);
const BACKUP_PATH = join(EXPECTED_DIR, `.${DRIFT_FILE}.backup`);

function backupGolden() {
  const originalPath = join(EXPECTED_DIR, DRIFT_FILE);
  writeFileSync(BACKUP_PATH, readFileSync(originalPath));
}

function restoreGolden() {
  const originalPath = join(EXPECTED_DIR, DRIFT_FILE);
  if (existsSync(BACKUP_PATH)) {
    writeFileSync(originalPath, readFileSync(BACKUP_PATH));
    rmSync(BACKUP_PATH);
  }
}

describe("benchmark CLI script", () => {
  it("exits 0 and writes report artifacts on pass", () => {
    const resultsDir = mkdtempSync(join(tmpdir(), "epimcp-benchmark-cli-"));
    try {
      const stdout = execSync(`node "${SCRIPT_PATH}" --out-dir "${resultsDir}"`, {
        encoding: "utf-8",
      });

      expect(stdout).toContain("=== Overall: PASSED ===");
      expect(stdout).toContain("Wrote report.json and report.txt");
      expect(existsSync(join(resultsDir, "report.json"))).toBe(true);
      expect(existsSync(join(resultsDir, "report.txt"))).toBe(true);
      expect(existsSync(join(resultsDir, "diffs"))).toBe(true);

      const report = JSON.parse(readFileSync(join(resultsDir, "report.json"), "utf-8"));
      expect(report.passed).toBe(true);
      expect(report.summary.failedBenchmarks).toBe(0);
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });

  it("exits 1 and writes diff artifacts on fixture drift", () => {
    const resultsDir = mkdtempSync(join(tmpdir(), "epimcp-benchmark-cli-drift-"));
    backupGolden();

    try {
      // Introduce drift
      const originalPath = join(EXPECTED_DIR, DRIFT_FILE);
      const original = JSON.parse(readFileSync(originalPath, "utf-8"));
      const drifted = { ...original, schemaValid: !original.schemaValid };
      writeFileSync(originalPath, JSON.stringify(drifted, null, 2) + "\n");

      let exitedNonZero = false;
      let stdout = "";
      let stderr = "";
      try {
        execSync(`node "${SCRIPT_PATH}" --out-dir "${resultsDir}"`, {
          encoding: "utf-8",
        });
      } catch (err: unknown) {
        exitedNonZero = true;
        const error = err as { stdout?: string; stderr?: string };
        stdout = error.stdout ?? "";
        stderr = error.stderr ?? "";
      }

      expect(exitedNonZero).toBe(true);
      const combined = stdout + stderr;
      expect(combined).toContain("=== Overall: FAILED ===");
      expect(combined).toContain("[FAIL]");
      expect(combined).toContain("schemaValid");

      // Verify diff files were written
      const diffDir = join(resultsDir, "diffs");
      expect(existsSync(diffDir)).toBe(true);
      // The diff directory exists; at least one diff file should be present
      const hasDiffFile = existsSync(join(diffDir, `${DRIFT_FIXTURE}__design_validation.diff.txt`));
      expect(hasDiffFile).toBe(true);

      // Verify the diff file contains actionable output
      const diffContent = readFileSync(
        join(diffDir, `${DRIFT_FIXTURE}__design_validation.diff.txt`),
        "utf-8",
      );
      expect(diffContent).toContain("Benchmark:");
      expect(diffContent).toContain("Step:");
      expect(diffContent).toContain("Differences:");
      expect(diffContent).toContain("schemaValid");
    } finally {
      restoreGolden();
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });
});
