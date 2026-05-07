import { describe, it, expect } from "vitest";
import {
  validateGenomeBuilds,
  DEFAULT_ALLOWED_BUILDS,
} from "../../src/validators/genome_build.js";

describe("DEFAULT_ALLOWED_BUILDS", () => {
  it("includes the frozen human, mouse, and rat builds by default", () => {
    expect(DEFAULT_ALLOWED_BUILDS).toEqual([
      "GRCh37",
      "GRCh38",
      "hg19",
      "hg38",
      "mm9",
      "mm10",
      "mm39",
      "rn6",
      "rn7",
    ]);
  });
});

describe("validateGenomeBuilds – supported builds", () => {
  it("passes when all features use allowed builds", () => {
    const result = validateGenomeBuilds([
      {
        featureId: "f1",
        measuredRegion: { build: "GRCh38", chrom: "chr1", start: 100, end: 200 },
      },
      {
        featureId: "f2",
        measuredRegion: { build: "GRCh38", chrom: "chr2", start: 300, end: 400 },
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.buildsFound).toEqual(["GRCh38"]);
  });

  it("accepts GRCh37", () => {
    const result = validateGenomeBuilds([
      {
        featureId: "f1",
        measuredRegion: { build: "GRCh37", chrom: "chr1", start: 100, end: 200 },
      },
    ]);
    expect(result.valid).toBe(true);
  });

  it("accepts mm10", () => {
    const result = validateGenomeBuilds([
      {
        featureId: "f1",
        measuredRegion: { build: "mm10", chrom: "chr1", start: 100, end: 200 },
      },
    ]);
    expect(result.valid).toBe(true);
  });

  it("accepts mm39", () => {
    const result = validateGenomeBuilds([
      {
        featureId: "f1",
        measuredRegion: { build: "mm39", chrom: "chr1", start: 100, end: 200 },
      },
    ]);
    expect(result.valid).toBe(true);
  });

  it("ignores features without measuredRegion", () => {
    const result = validateGenomeBuilds([
      { featureId: "f1", measuredIdentifier: "probe_001" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.buildsFound).toHaveLength(0);
  });
});

describe("validateGenomeBuilds – unsupported builds", () => {
  it("rejects unsupported build with error listing allowed builds", () => {
    const result = validateGenomeBuilds([
      {
        featureId: "f1",
        measuredRegion: { build: "canFam3", chrom: "chr1", start: 100, end: 200 },
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI004/);
    expect(result.errors[0]).toMatch(/canFam3/);
    expect(result.errors[0]).toMatch(/GRCh37/);
  });

  it("rejects multiple unsupported builds independently", () => {
    const result = validateGenomeBuilds([
      {
        featureId: "f1",
        measuredRegion: { build: "canFam3", chrom: "chr1", start: 100, end: 200 },
      },
      {
        featureId: "f2",
        measuredRegion: { build: "galGal6", chrom: "chr1", start: 100, end: 200 },
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

describe("validateGenomeBuilds – missing build", () => {
  it("rejects region-bearing feature with missing build when requireGenomeBuild is true", () => {
    const result = validateGenomeBuilds(
      [
        {
          featureId: "f1",
          measuredRegion: { chrom: "chr1", start: 100, end: 200 },
        },
      ],
      { requireGenomeBuild: true },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI004/);
    expect(result.errors[0]).toMatch(/missing genome build/);
  });

  it("passes when requireGenomeBuild is false and build is missing", () => {
    const result = validateGenomeBuilds(
      [
        {
          featureId: "f1",
          measuredRegion: { chrom: "chr1", start: 100, end: 200 },
        },
      ],
      { requireGenomeBuild: false },
    );
    expect(result.valid).toBe(true);
  });
});

describe("validateGenomeBuilds – mixed builds", () => {
  it("rejects mixed builds when blockMixedBuilds is true", () => {
    const result = validateGenomeBuilds([
      {
        featureId: "f1",
        measuredRegion: { build: "GRCh37", chrom: "chr1", start: 100, end: 200 },
      },
      {
        featureId: "f2",
        measuredRegion: { build: "GRCh38", chrom: "chr2", start: 300, end: 400 },
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.mixedBuildDetected).toBe(true);
    expect(result.errors[0]).toMatch(/EPI004/);
    expect(result.errors[0]).toMatch(/Mixed genome builds/);
    expect(result.errors[0]).toMatch(/GRCh37/);
    expect(result.errors[0]).toMatch(/GRCh38/);
  });

  it("allows mixed builds when blockMixedBuilds is false", () => {
    const result = validateGenomeBuilds(
      [
        {
          featureId: "f1",
          measuredRegion: { build: "GRCh37", chrom: "chr1", start: 100, end: 200 },
        },
        {
          featureId: "f2",
          measuredRegion: { build: "GRCh38", chrom: "chr2", start: 300, end: 400 },
        },
      ],
      { blockMixedBuilds: false },
    );
    expect(result.valid).toBe(true);
    expect(result.mixedBuildDetected).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("does not flag as mixed when only non-region features vary", () => {
    const result = validateGenomeBuilds([
      {
        featureId: "f1",
        measuredRegion: { build: "GRCh38", chrom: "chr1", start: 100, end: 200 },
      },
      { featureId: "f2", measuredIdentifier: "probe_001" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.mixedBuildDetected).toBe(false);
  });
});

describe("validateGenomeBuilds – config-driven allowlist", () => {
  it("accepts custom builds when allowlist is extended", () => {
    const result = validateGenomeBuilds(
      [
        {
          featureId: "f1",
          measuredRegion: { build: "customBuild_v1", chrom: "chr1", start: 100, end: 200 },
        },
      ],
      { allowedBuilds: ["customBuild_v1", "GRCh38"] },
    );
    expect(result.valid).toBe(true);
    expect(result.buildsFound).toEqual(["customBuild_v1"]);
  });

  it("rejects default builds when allowlist is narrowed", () => {
    const result = validateGenomeBuilds(
      [
        {
          featureId: "f1",
          measuredRegion: { build: "GRCh37", chrom: "chr1", start: 100, end: 200 },
        },
      ],
      { allowedBuilds: ["GRCh38"] },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/GRCh37/);
  });
});

describe("validateGenomeBuilds – liftover provenance", () => {
  it("detects declared liftover in provenance and adds warning", () => {
    const result = validateGenomeBuilds(
      [
        {
          featureId: "f1",
          measuredRegion: { build: "GRCh38", chrom: "chr1", start: 100, end: 200 },
        },
      ],
      {
        provenanceSteps: [
          {
            stepName: "liftover",
            toolName: "liftOver",
            toolVersion: "1.0",
            parameters: {},
          },
        ],
      },
    );
    expect(result.valid).toBe(true);
    expect(result.liftoverDetected).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/EPI004/);
    expect(result.warnings[0]).toMatch(/liftover detected/);
  });

  it("detects crossmap in provenance", () => {
    const result = validateGenomeBuilds(
      [],
      {
        provenanceSteps: [
          {
            stepName: "coordinate_conversion",
            toolName: "CrossMap",
            toolVersion: "0.6",
            parameters: {},
          },
        ],
      },
    );
    expect(result.liftoverDetected).toBe(true);
    expect(result.warnings[0]).toMatch(/CrossMap/);
  });

  it("never performs automatic transformation (silent liftover blocked)", () => {
    const result = validateGenomeBuilds(
      [
        {
          featureId: "f1",
          measuredRegion: { build: "GRCh38", chrom: "chr1", start: 100, end: 200 },
        },
      ],
      { silentLiftoverAllowed: true },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI004/);
    expect(result.errors[0]).toMatch(/silentLiftoverAllowed/);
    expect(result.errors[0]).toMatch(/prohibited/);
  });

  it("accepts declared liftover even with mixed builds (no automatic fix)", () => {
    const result = validateGenomeBuilds(
      [
        {
          featureId: "f1",
          measuredRegion: { build: "GRCh37", chrom: "chr1", start: 100, end: 200 },
        },
        {
          featureId: "f2",
          measuredRegion: { build: "GRCh38", chrom: "chr2", start: 300, end: 400 },
        },
      ],
      {
        provenanceSteps: [
          {
            stepName: "liftover",
            toolName: "liftOver",
            toolVersion: "1.0",
            parameters: {},
          },
        ],
      },
    );
    // Mixed builds are still rejected; liftover provenance does not auto-fix.
    expect(result.valid).toBe(false);
    expect(result.mixedBuildDetected).toBe(true);
    expect(result.liftoverDetected).toBe(true);
    expect(result.errors.some((e) => e.includes("Mixed genome builds"))).toBe(
      true,
    );
  });
});

describe("validateGenomeBuilds – edge cases", () => {
  it("passes for empty feature array", () => {
    const result = validateGenomeBuilds([]);
    expect(result.valid).toBe(true);
    expect(result.buildsFound).toHaveLength(0);
  });

  it("ignores unparseable feature objects", () => {
    const result = validateGenomeBuilds(["not-a-feature", 42, null]);
    expect(result.valid).toBe(true);
  });

  it("returns unique builds only", () => {
    const result = validateGenomeBuilds([
      {
        featureId: "f1",
        measuredRegion: { build: "GRCh38", chrom: "chr1", start: 100, end: 200 },
      },
      {
        featureId: "f2",
        measuredRegion: { build: "GRCh38", chrom: "chr2", start: 300, end: 400 },
      },
      {
        featureId: "f3",
        measuredRegion: { build: "GRCh38", chrom: "chr3", start: 500, end: 600 },
      },
    ]);
    expect(result.buildsFound).toEqual(["GRCh38"]);
  });
});
