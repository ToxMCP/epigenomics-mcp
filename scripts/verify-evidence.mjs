#!/usr/bin/env node
/**
 * Verify the committed release evidence bundle.
 *
 * Usage:
 *   node scripts/verify-evidence.mjs [--out-dir release-evidence]
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

import { getRegisteredAuditResources } from "../dist/epimcp/resources.js";
import {
  RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES,
  RELEASE_EVIDENCE_CHECKSUM_FILES,
  RELEASE_EVIDENCE_GENERATED_FILES,
  formatChecksumFile,
} from "../dist/release_evidence/artifacts.js";
import { ReleaseEvidenceSchema } from "../dist/release_evidence/schema.js";

const DEFAULT_OUT_DIR = "release-evidence";

function parseArgs(argv) {
  const args = { outDir: DEFAULT_OUT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out-dir" || arg === "--output-dir") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a directory value`);
      }
      args.outDir = value;
      i++;
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
    .flatMap((entry) => listFilesRecursively(join(resolved, entry.name)))
    .sort();
}

function runCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: options.stdio ?? "pipe",
  });
}

function tryRunCommand(command, args) {
  try {
    return runCommand(command, args).trim();
  } catch {
    return null;
  }
}

function packFileSet() {
  const output = runCommand("npm", ["pack", "--dry-run", "--json"]);
  const parsed = JSON.parse(output);
  const files = parsed?.[0]?.files;
  if (!Array.isArray(files)) {
    throw new Error("npm pack --dry-run --json returned an unexpected shape");
  }
  return new Set(files.map((file) => file.path));
}

function dirtyPaths() {
  const status = tryRunCommand("git", ["status", "--porcelain"]);
  if (status === null || status.length === 0) {
    return [];
  }
  return status
    .split("\n")
    .map((line) => line.slice(3).split(" -> ").pop() ?? "")
    .filter((path) => path.length > 0);
}

function changedPathsSince(commit) {
  const output = tryRunCommand("git", ["diff", "--name-only", `${commit}..HEAD`]);
  if (output === null || output.length === 0) {
    return [];
  }
  return output.split("\n").filter((path) => path.length > 0);
}

function assertPathSetContains(paths, required, label, failures) {
  const missing = required.filter((path) => !paths.has(path));
  if (missing.length > 0) {
    failures.push(`${label} missing required path(s): ${missing.join(", ")}`);
  }
}

function main() {
  const { outDir } = parseArgs(process.argv.slice(2));
  const resolvedOutDir = resolve(outDir);
  const outDirRelative = repoRelative(resolvedOutDir);
  const failures = [];

  const manifestPath = join(resolvedOutDir, "release-evidence.json");
  const checksumPath = join(resolvedOutDir, "checksums.sha256");

  if (!existsSync(manifestPath)) {
    failures.push(`Missing release evidence manifest: ${repoRelative(manifestPath)}`);
  }
  if (!existsSync(checksumPath)) {
    failures.push(`Missing checksum file: ${repoRelative(checksumPath)}`);
  }
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  const evidence = ReleaseEvidenceSchema.parse(readJson(manifestPath));
  const checksumEntries = new Map(
    evidence.artifactChecksums.map((entry) => [entry.path, entry]),
  );

  if (!evidence.releaseGate.ready) {
    failures.push("Release gate evidence is not ready.");
  }
  const failedChecks = evidence.releaseGate.checks
    .filter((check) => !check.passed)
    .map((check) => check.name);
  if (failedChecks.length > 0) {
    failures.push(`Release gate evidence has failed checks: ${failedChecks.join(", ")}`);
  }

  const currentCommit = tryRunCommand("git", ["rev-parse", "HEAD"]);
  if (currentCommit !== null && !evidence.git.available) {
    failures.push("Git metadata is available locally but missing from evidence.");
  }
  if (evidence.git.available) {
    if (!evidence.git.commit) {
      failures.push("Evidence git metadata is missing commit.");
    }
    if (evidence.git.dirty !== false) {
      failures.push("Evidence must be generated from a clean source tree.");
    }
  }

  if (evidence.git.available && evidence.git.commit && currentCommit !== null) {
    const ancestor = tryRunCommand(
      "git",
      ["merge-base", "--is-ancestor", evidence.git.commit, "HEAD"],
    );
    if (ancestor === null) {
      failures.push(
        `Evidence source commit ${evidence.git.commit} is not an ancestor of HEAD.`,
      );
    }

    const nonEvidenceChanges = changedPathsSince(evidence.git.commit).filter(
      (path) => !path.startsWith(`${outDirRelative}/`),
    );
    if (nonEvidenceChanges.length > 0) {
      failures.push(
        `Non-evidence files changed since evidence source commit: ${nonEvidenceChanges.join(", ")}`,
      );
    }
  }

  const dirtyNonEvidence = dirtyPaths().filter(
    (path) => !path.startsWith(`${outDirRelative}/`),
  );
  if (dirtyNonEvidence.length > 0) {
    failures.push(`Working tree has dirty non-evidence files: ${dirtyNonEvidence.join(", ")}`);
  }

  for (const entry of evidence.artifactChecksums) {
    const absolutePath = resolve(entry.path);
    if (!existsSync(absolutePath)) {
      failures.push(`Checksum entry points to missing file: ${entry.path}`);
      continue;
    }
    const stat = statSync(absolutePath);
    if (stat.size !== entry.bytes) {
      failures.push(`Checksum entry has stale byte size: ${entry.path}`);
    }
    const actualHash = sha256(absolutePath);
    if (actualHash !== entry.sha256) {
      failures.push(`Checksum entry has stale SHA-256: ${entry.path}`);
    }
  }

  const expectedChecksumFile = formatChecksumFile(evidence.artifactChecksums);
  const actualChecksumFile = readFileSync(checksumPath, "utf-8");
  if (actualChecksumFile !== expectedChecksumFile) {
    failures.push("checksums.sha256 does not match release-evidence.json.");
  }

  const requiredChecksumPaths = [
    ...RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES.flatMap((path) =>
      listFilesRecursively(path).map(repoRelative),
    ),
    ...RELEASE_EVIDENCE_CHECKSUM_FILES,
    ...RELEASE_EVIDENCE_GENERATED_FILES.map((path) =>
      repoRelative(join(resolvedOutDir, path)),
    ),
  ];
  assertPathSetContains(
    checksumEntries,
    requiredChecksumPaths,
    "release evidence checksums",
    failures,
  );

  const packageFiles = packFileSet();
  const requiredPackagePaths = [
    ...getRegisteredAuditResources().map((resource) => resource.path),
    ...listFilesRecursively("benchmarks/expected").map(repoRelative),
  ];
  assertPathSetContains(
    packageFiles,
    requiredPackagePaths,
    "npm package dry-run",
    failures,
  );

  const evidencePackageFiles = new Set(
    (evidence.npmPackDryRun[0]?.files instanceof Array
      ? evidence.npmPackDryRun[0].files
      : []
    ).map((file) => file.path),
  );
  assertPathSetContains(
    evidencePackageFiles,
    requiredPackagePaths,
    "recorded npm package dry-run",
    failures,
  );

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  console.log("Release evidence verification PASSED.");
}

main();
