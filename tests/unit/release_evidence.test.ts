import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES,
  RELEASE_EVIDENCE_CHECKSUM_FILES,
  RELEASE_EVIDENCE_GENERATED_FILES,
  formatChecksumFile,
} from "../../src/release_evidence/artifacts.js";
import { ReleaseEvidenceSchema } from "../../src/release_evidence/schema.js";
import {
  getRegisteredAuditResources,
  resolveAuditResourcePath,
} from "../../src/epimcp/resources.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("release evidence schema", () => {
  it("validates an audit evidence manifest with release gate and checksums", () => {
    const parsed = ReleaseEvidenceSchema.parse({
      schemaName: "EpigenomicsMcpReleaseEvidence",
      schemaVersion: "0.1.0",
      package: {
        name: "epigenomics-mcp",
        version: "0.1.0",
      },
      config: {
        schemaVersion: "0.1.0",
        policyVersion: "0.1.0",
      },
      generatedAt: "2026-05-07T00:00:00.000Z",
      command: {
        name: "npm run release:evidence",
        startedAt: "2026-05-07T00:00:00.000Z",
        finishedAt: "2026-05-07T00:00:01.000Z",
      },
      environment: {
        nodeVersion: "v22.0.0",
        npmVersion: "10.0.0",
        platform: "darwin",
        arch: "arm64",
      },
      git: {
        available: false,
      },
      releaseGate: {
        ready: true,
        checks: [{ name: "schema_drift", passed: true, details: "ok" }],
        benchmarkSummary: {
          totalBenchmarks: 12,
          passedBenchmarks: 12,
          failedBenchmarks: 0,
        },
      },
      npmPackDryRun: [{ name: "epigenomics-mcp", version: "0.1.0" }],
      artifactChecksums: [
        {
          path: "schemas/current/base-envelope.json",
          sha256: HASH_A,
          bytes: 123,
        },
      ],
    });

    expect(parsed.releaseGate.ready).toBe(true);
    expect(parsed.git.available).toBe(false);
  });

  it("declares the required audit checksum coverage", () => {
    expect(RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES).toContain("schemas/current");
    expect(RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES).toContain("benchmarks/expected");
    expect(RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES).toContain(
      "benchmarks/fixtures/synthetic",
    );
    expect(RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES).toContain(
      "benchmarks/fixtures/frozen_public",
    );
    expect(RELEASE_EVIDENCE_CHECKSUM_FILES).toContain("benchmark_manifest.yaml");
    expect(RELEASE_EVIDENCE_CHECKSUM_FILES).toContain("docs/validation-statement.md");
    expect(RELEASE_EVIDENCE_CHECKSUM_FILES).toContain("docs/tool-reference.md");
    expect(RELEASE_EVIDENCE_CHECKSUM_FILES).toContain("toxmcp.manifest.yaml");
    expect(RELEASE_EVIDENCE_CHECKSUM_FILES).toContain("evaluation.xml");
    expect(RELEASE_EVIDENCE_CHECKSUM_FILES).toContain("SECURITY.md");
    expect(RELEASE_EVIDENCE_GENERATED_FILES).toEqual([
      "release-gate.json",
      "release-gate.txt",
      "npm-pack-dry-run.json",
    ]);
  });

  it("formats checksum files deterministically by path", () => {
    const text = formatChecksumFile([
      { path: "z.json", sha256: HASH_B, bytes: 2 },
      { path: "a.json", sha256: HASH_A, bytes: 1 },
    ]);

    expect(text).toBe(`${HASH_A}  a.json\n${HASH_B}  z.json\n`);
  });

  it("resolves audit resource files from the package root, independent of cwd", () => {
    const originalCwd = process.cwd();
    const tempDir = mkdtempSync(join(tmpdir(), "epimcp-resource-cwd-"));
    try {
      process.chdir(tempDir);
      const toolReferencePath = resolveAuditResourcePath("docs/tool-reference.md");
      expect(toolReferencePath).toBe(resolve(originalCwd, "docs/tool-reference.md"));
      expect(readFileSync(toolReferencePath, "utf-8")).toContain(
        "MCP payload envelope",
      );
    } finally {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("packages every file backing registered audit resources", () => {
    const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });
    const pack = JSON.parse(output) as Array<{
      files: Array<{ path: string }>;
    }>;
    const paths = new Set(pack[0].files.map((file) => file.path));

    for (const resource of getRegisteredAuditResources()) {
      expect(existsSync(resource.path)).toBe(true);
      expect(paths.has(resource.path)).toBe(true);
    }

    expect(paths.has("benchmark_manifest.yaml")).toBe(true);
    expect(paths.has("release-evidence/release-evidence.json")).toBe(true);
    expect(paths.has("release-evidence/checksums.sha256")).toBe(true);
    for (const directory of RELEASE_EVIDENCE_CHECKSUM_DIRECTORIES) {
      expect(
        [...paths].some((path) => path.startsWith(`${directory}/`)),
      ).toBe(true);
    }
    for (const file of RELEASE_EVIDENCE_CHECKSUM_FILES) {
      expect(paths.has(file)).toBe(true);
    }
  });
});
