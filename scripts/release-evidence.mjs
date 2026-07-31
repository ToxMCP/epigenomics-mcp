#!/usr/bin/env node
/**
 * Generate an audit-ready release evidence bundle.
 *
 * Usage:
 *   node scripts/release-evidence.mjs [--out-dir release-evidence] [--allow-dirty]
 */

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

import { ConfigSchema } from "../dist/epimcp/config.js";
import { ReleaseEvidenceSchema } from "../dist/release_evidence/schema.js";
import {
  RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES,
  RELEASE_EVIDENCE_CHECKSUM_FILES,
  RELEASE_EVIDENCE_GENERATED_FILES,
  formatChecksumFile,
} from "../dist/release_evidence/artifacts.js";

const DEFAULT_OUT_DIR = "release-evidence";
const RELEASE_GATE_JSON = RELEASE_EVIDENCE_GENERATED_FILES[0];
const RELEASE_GATE_TEXT = RELEASE_EVIDENCE_GENERATED_FILES[1];
const ORDERED_TREND_CALIBRATION_JSON = RELEASE_EVIDENCE_GENERATED_FILES[2];
const NPM_PACK_DRY_RUN_JSON = RELEASE_EVIDENCE_GENERATED_FILES[3];
const SCIENTIFIC_INVARIANTS_JSON = RELEASE_EVIDENCE_GENERATED_FILES[4];

function parseArgs(argv) {
  const args = {
    outDir: DEFAULT_OUT_DIR,
    allowDirty: process.env.EPIMCP_RELEASE_EVIDENCE_ALLOW_DIRTY === "1",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out-dir" || arg === "--output-dir") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a directory value`);
      }
      args.outDir = value;
      i++;
    } else if (arg === "--allow-dirty") {
      args.allowDirty = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function toPosixPath(path) {
  return path.split(sep).join("/");
}

function repoRelative(path) {
  return toPosixPath(relative(process.cwd(), path));
}

function resetOutputDir(outDir) {
  const resolved = resolve(outDir);
  const root = resolve(process.cwd());
  if (resolved === root || root.startsWith(`${resolved}${sep}`)) {
    throw new Error(`Refusing to use unsafe release evidence directory: ${outDir}`);
  }
  rmSync(resolved, { recursive: true, force: true });
  mkdirSync(resolved, { recursive: true });
  return resolved;
}

function listFilesRecursively(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`Required evidence input path does not exist: ${path}`);
  }
  const stat = statSync(resolved);
  if (stat.isFile()) {
    return [resolved];
  }
  return readdirSync(resolved, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.name !== "__pycache__" &&
        !entry.name.endsWith(".pyc") &&
        !entry.name.endsWith(".pyo"),
    )
    .flatMap((entry) => listFilesRecursively(join(resolved, entry.name)))
    .sort();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function checksumEntry(path) {
  const stat = statSync(path);
  return {
    path: repoRelative(path),
    sha256: sha256(path),
    bytes: stat.size,
  };
}

function runCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: options.stdio ?? "pipe",
  });
}

function parseGitStatusPaths(status) {
  if (status === null || status.length === 0) {
    return [];
  }
  return status
    .split("\n")
    .map((line) => line.slice(3).split(" -> ").pop() ?? "")
    .filter((path) => path.length > 0);
}

function getGitStatus() {
  try {
    return runCommand("git", ["status", "--porcelain"]).trimEnd();
  } catch {
    return null;
  }
}

function getGitState(status, outDir) {
  const sourceDirtyPaths = parseGitStatusPaths(status).filter(
    (path) => !path.startsWith(`${outDir}/`),
  );
  try {
    const commit = runCommand("git", ["rev-parse", "HEAD"]).trim();
    return {
      available: true,
      commit,
      dirty: sourceDirtyPaths.length > 0,
    };
  } catch {
    return { available: false };
  }
}

function assertCleanSource(status, outDir, allowDirty) {
  const sourceDirtyPaths = parseGitStatusPaths(status).filter(
    (path) => !path.startsWith(`${outDir}/`),
  );
  if (sourceDirtyPaths.length === 0 || allowDirty) {
    return;
  }

  throw new Error(
    [
      "Refusing to generate release evidence from a dirty source tree.",
      "Commit or stash code/docs/config changes first, then run npm run release:evidence.",
      "For local experiments only, pass --allow-dirty or set EPIMCP_RELEASE_EVIDENCE_ALLOW_DIRTY=1.",
      "",
      sourceDirtyPaths.join("\n"),
    ].join("\n"),
  );
}

function fixedOrNow(name) {
  return process.env[name] ?? new Date().toISOString();
}

function runReleaseGate(outputDir) {
  runCommand(
    process.execPath,
    ["scripts/release-gate.mjs", "--out-dir", outputDir],
    { stdio: "inherit" },
  );
}

function runScientificInvariantsGate(outputDir) {
  runCommand("python3", ["scripts/vendor_verify.py"], { stdio: "inherit" });
  const output = runCommand(
    "python3",
    ["scripts/scientific_invariants_gate.py", "--json"],
  );
  const result = JSON.parse(output);
  if (
    !Number.isInteger(result.checkedObjects) ||
    result.checkedObjects <= 0 ||
    !Array.isArray(result.blocking) ||
    result.blocking.length > 0
  ) {
    throw new Error("Scientific-invariants gate did not produce a clean result.");
  }
  writeFileSync(
    join(outputDir, SCIENTIFIC_INVARIANTS_JSON),
    JSON.stringify(result, null, 2) + "\n",
    "utf-8",
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const gitStatus = getGitStatus();
  const outDirRelative = repoRelative(resolve(args.outDir));
  assertCleanSource(gitStatus, outDirRelative, args.allowDirty);
  const gitState = getGitState(gitStatus, outDirRelative);
  const outDir = resetOutputDir(args.outDir);
  const gateDir = resolve(tmpdir(), `epimcp-release-gate-${process.pid}`);
  resetOutputDir(gateDir);

  const startedAt = fixedOrNow("EPIMCP_RELEASE_EVIDENCE_STARTED_AT");

  try {
    runScientificInvariantsGate(outDir);
    runReleaseGate(gateDir);
    copyFileSync(join(gateDir, RELEASE_GATE_JSON), join(outDir, RELEASE_GATE_JSON));
    copyFileSync(join(gateDir, RELEASE_GATE_TEXT), join(outDir, RELEASE_GATE_TEXT));
    copyFileSync(
      join(gateDir, ORDERED_TREND_CALIBRATION_JSON),
      join(outDir, ORDERED_TREND_CALIBRATION_JSON),
    );

    // Placeholders make the package dry-run prove the audit-resource bundle
    // paths are included even while this command is regenerating them.
    writeFileSync(join(outDir, "release-evidence.json"), "{}\n", "utf-8");
    writeFileSync(join(outDir, "checksums.sha256"), "", "utf-8");
    writeFileSync(join(outDir, NPM_PACK_DRY_RUN_JSON), "[]\n", "utf-8");

    const npmPackOutput = runCommand("npm", ["pack", "--dry-run", "--json"]);
    const npmPackDryRun = JSON.parse(npmPackOutput);
    const npmPackPath = join(outDir, NPM_PACK_DRY_RUN_JSON);
    writeFileSync(npmPackPath, JSON.stringify(npmPackDryRun, null, 2) + "\n", "utf-8");

    const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));
    const config = ConfigSchema.parse({});
    const releaseGate = JSON.parse(
      readFileSync(join(outDir, RELEASE_GATE_JSON), "utf-8"),
    );

    const checksumInputs = [
      ...RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES.flatMap((path) =>
        listFilesRecursively(path),
      ),
      ...RELEASE_EVIDENCE_CHECKSUM_FILES.map((path) => resolve(path)),
      join(outDir, RELEASE_GATE_JSON),
      join(outDir, RELEASE_GATE_TEXT),
      join(outDir, ORDERED_TREND_CALIBRATION_JSON),
      npmPackPath,
      join(outDir, SCIENTIFIC_INVARIANTS_JSON),
    ].sort();

    const artifactChecksums = checksumInputs.map(checksumEntry);
    const finishedAt = fixedOrNow("EPIMCP_RELEASE_EVIDENCE_FINISHED_AT");
    const evidence = ReleaseEvidenceSchema.parse({
      schemaName: "EpigenomicsMcpReleaseEvidence",
      schemaVersion: "0.1.0",
      package: {
        name: packageJson.name,
        version: packageJson.version,
      },
      config: {
        schemaVersion: config.schemaVersion,
        policyVersion: config.policyVersion,
      },
      generatedAt: fixedOrNow("EPIMCP_RELEASE_EVIDENCE_GENERATED_AT"),
      command: {
        name: "npm run release:evidence",
        startedAt,
        finishedAt,
      },
      environment: {
        nodeVersion: process.version,
        npmVersion: runCommand("npm", ["--version"]).trim(),
        platform: process.platform,
        arch: process.arch,
      },
      git: gitState,
      releaseGate: {
        ready: releaseGate.ready,
        checks: releaseGate.checks,
        benchmarkSummary: releaseGate.benchmarkSummary,
      },
      npmPackDryRun,
      artifactChecksums,
    });

    writeFileSync(
      join(outDir, "release-evidence.json"),
      JSON.stringify(evidence, null, 2) + "\n",
      "utf-8",
    );
    writeFileSync(
      join(outDir, "checksums.sha256"),
      formatChecksumFile(artifactChecksums),
      "utf-8",
    );

    console.log(`Wrote release evidence bundle to ${outDir}`);
  } finally {
    rmSync(gateDir, { recursive: true, force: true });
  }
}

main();
