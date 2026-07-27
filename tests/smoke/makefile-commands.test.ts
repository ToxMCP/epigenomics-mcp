import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

/**
 * Smoke test that runs through the default command set defined in the Makefile.
 *
 * These tests verify that each developer-facing command is repeatable and
 * produces actionable output (exit code 0 on success, stderr on failure).
 */

describe("Makefile default command set smoke test", () => {
  const runMake = (target: string): { stdout: string; stderr: string } => {
    const stdout = execSync(`make ${target}`, {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "" };
  };

  it("make export-schemas exits 0 and writes schemas", () => {
    const { stdout } = runMake("export-schemas");
    expect(stdout).toContain("Schemas exported");
  });

  it("make validate-handoff exits 0 and validates fixtures", () => {
    const { stdout } = runMake("validate-handoff");
    expect(stdout).toContain("Handoff validation PASSED");
  });

  it("make run-benchmarks exits 0 and reports throughput", () => {
    const { stdout } = runMake("run-benchmarks");
    expect(stdout).toContain("Throughput:");
    expect(stdout).toContain("features/s");
  });

  it("make typecheck exits 0 for both Python and TypeScript", () => {
    const { stdout } = runMake("typecheck");
    expect(stdout).toContain("Python typecheck");
    expect(stdout).toContain("TypeScript typecheck");
  });

  it("make lint exits 0 for both Python and TypeScript", () => {
    const { stdout } = runMake("lint");
    expect(stdout).toContain("Python lint");
    expect(stdout).toContain("TypeScript lint");
  });

  it(
    "make smoke exits 0 after running the default command set",
    () => {
      // smoke target depends on lint, typecheck, export-schemas, validate-handoff, run-benchmarks
      const { stdout } = runMake("smoke");
      expect(stdout).toContain("Default command set smoke test PASSED");
    },
    300_000,
  );
});

describe("npm script smoke test", () => {
  const runNpm = (script: string): string => {
    return execSync(`npm run ${script}`, {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
  };

  it("npm run export:schemas exits 0", () => {
    const stdout = runNpm("export:schemas");
    expect(stdout).toContain("Schemas exported");
  });

  it("npm run validate:handoff exits 0", () => {
    const stdout = runNpm("validate:handoff");
    expect(stdout).toContain("Handoff validation PASSED");
  });

  it("npm run benchmark exits 0", () => {
    const stdout = runNpm("benchmark");
    expect(stdout).toContain("Throughput:");
  });
});
