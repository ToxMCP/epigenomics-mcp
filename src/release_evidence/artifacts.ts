import type { ReleaseEvidenceChecksum } from "./schema.js";

export const RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES = [
  "schemas/current",
  "benchmarks/expected",
  "benchmarks/fixtures/synthetic",
  "benchmarks/fixtures/frozen_public",
  "src/epigenomics_mcp/governance",
  "tests/fixtures/governance",
  "vendor/schema-spine",
] as const;

export const RELEASE_EVIDENCE_CHECKSUM_FILES = [
  "benchmark_manifest.yaml",
  "docs/validation-statement.md",
  "docs/tool-reference.md",
  "toxmcp.manifest.yaml",
  "evaluation.xml",
  "SECURITY.md",
  "CITATION.cff",
  "pyproject.toml",
  "uv.lock",
  "scripts/generate_spine_projection_golden.py",
  "scripts/scientific_invariants_gate.py",
  "scripts/vendor_verify.py",
] as const;

export const RELEASE_EVIDENCE_GENERATED_FILES = [
  "release-gate.json",
  "release-gate.txt",
  "npm-pack-dry-run.json",
  "scientific-invariants.json",
] as const;

export function formatChecksumFile(
  entries: ReleaseEvidenceChecksum[],
): string {
  return [...entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => `${entry.sha256}  ${entry.path}`)
    .join("\n") + "\n";
}
