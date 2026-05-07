import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface DriftCheckResult {
  drift: boolean;
  diff: string;
  files: string[];
}

/**
 * Compare two directories of JSON schema files.
 * Returns drift=true if any file differs or is missing/extra.
 */
export function checkSchemaDrift(
  committedDir: string,
  exportedDir: string,
): DriftCheckResult {
  const committedFiles = new Set(readdirSync(committedDir).sort());
  const exportedFiles = new Set(readdirSync(exportedDir).sort());

  const allFiles = new Set([...committedFiles, ...exportedFiles]);
  const diffs: string[] = [];
  const changedFiles: string[] = [];

  for (const file of allFiles) {
    const committedPath = join(committedDir, file);
    const exportedPath = join(exportedDir, file);

    if (!committedFiles.has(file)) {
      diffs.push(`Only in exported: ${file}`);
      changedFiles.push(file);
      continue;
    }

    if (!exportedFiles.has(file)) {
      diffs.push(`Only in committed: ${file}`);
      changedFiles.push(file);
      continue;
    }

    const committed = readFileSync(committedPath, "utf-8");
    const exported = readFileSync(exportedPath, "utf-8");

    if (committed !== exported) {
      diffs.push(`Differs: ${file}`);
      changedFiles.push(file);
    }
  }

  return {
    drift: diffs.length > 0,
    diff: diffs.join("\n"),
    files: changedFiles,
  };
}

/**
 * Check whether the schema version literal in packets.ts changed between
 * two git refs.
 */
export function checkVersionBump(
  packetsPath: string,
  baseRef: string,
): boolean {
  const { execSync } = require("node:child_process");
  try {
    const diff = execSync(`git diff ${baseRef} HEAD -- "${resolve(packetsPath)}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return /schemaVersion/.test(diff);
  } catch {
    return false;
  }
}

/**
 * Check whether CHANGELOG.md was modified between two git refs.
 */
export function checkChangelogUpdated(
  _changelogPath: string,
  baseRef: string,
): boolean {
  const { execSync } = require("node:child_process");

  try {
    const changedFiles = execSync(
      `git diff --name-only ${baseRef} HEAD`,
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      },
    );
    return changedFiles
      .split("\n")
      .some((f: string) => f.trim().toLowerCase() === "changelog.md");
  } catch {
    return false;
  }
}
