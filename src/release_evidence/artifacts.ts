import type { ReleaseEvidenceChecksum } from "./schema.js";

export const RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES = [
  "schemas/current",
  "benchmarks/expected",
] as const;

export const RELEASE_EVIDENCE_CHECKSUM_FILES = [
  "benchmark_manifest.yaml",
  "docs/validation-statement.md",
  "docs/tool-reference.md",
  "toxmcp.manifest.yaml",
] as const;

export const RELEASE_EVIDENCE_GENERATED_FILES = [
  "release-gate.json",
  "release-gate.txt",
  "npm-pack-dry-run.json",
] as const;

export function formatChecksumFile(
  entries: ReleaseEvidenceChecksum[],
): string {
  return [...entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => `${entry.sha256}  ${entry.path}`)
    .join("\n") + "\n";
}
