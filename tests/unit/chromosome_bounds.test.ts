import { describe, it, expect } from "vitest";
import {
  validateChromosomeBounds,
  validateChromosomeBoundsAsync,
  getFrozenBuilds,
  getFrozenChromosomesForBuild,
} from "../../src/validators/chromosome_bounds.js";
import {
  AnnotationClient,
  MockAnnotationTransport,
} from "../../src/integrations/annotation_client.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFeature(
  overrides: {
    featureId?: string;
    chrom?: string;
    start?: number;
    end?: number;
    build?: string;
  } = {},
): {
  featureId: string;
  measuredRegion: { chrom: string; start: number; end: number; build: string };
} {
  return {
    featureId: overrides.featureId ?? "feat-001",
    measuredRegion: {
      chrom: overrides.chrom ?? "chr1",
      start: overrides.start ?? 1000,
      end: overrides.end ?? 2000,
      build: overrides.build ?? "hg38",
    },
  };
}

// ---------------------------------------------------------------------------
// Frozen snapshot introspection
// ---------------------------------------------------------------------------

describe("getFrozenBuilds", () => {
  it("returns supported builds", () => {
    const builds = getFrozenBuilds();
    expect(builds).toContain("hg38");
    expect(builds).toContain("GRCh38");
    expect(builds).toContain("hg19");
    expect(builds).toContain("GRCh37");
    expect(builds).toContain("mm9");
    expect(builds).toContain("mm10");
    expect(builds).toContain("mm39");
    expect(builds).toContain("rn6");
    expect(builds).toContain("rn7");
  });
});

describe("getFrozenChromosomesForBuild", () => {
  it("returns chromosomes for hg38", () => {
    const chroms = getFrozenChromosomesForBuild("hg38");
    expect(chroms).toBeDefined();
    expect(chroms).toContain("chr1");
    expect(chroms).toContain("chr22");
    expect(chroms).toContain("chrX");
    expect(chroms).toContain("chrY");
    expect(chroms).toContain("chrM");
  });

  it("returns undefined for unsupported build", () => {
    const chroms = getFrozenChromosomesForBuild("canFam3");
    expect(chroms).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Synchronous validation – valid cases
// ---------------------------------------------------------------------------

describe("validateChromosomeBounds – valid chromosomes", () => {
  it("passes for a valid hg38 chr1 interval", () => {
    const result = validateChromosomeBounds([makeFeature()]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("passes for a valid hg19 chr1 interval", () => {
    const result = validateChromosomeBounds([
      makeFeature({ build: "hg19", chrom: "chr1", start: 0, end: 249250621 }),
    ]);
    expect(result.valid).toBe(true);
  });

  it("passes for a valid mm10 chrX interval", () => {
    const result = validateChromosomeBounds([
      makeFeature({ build: "mm10", chrom: "chrX", start: 0, end: 171031299 }),
    ]);
    expect(result.valid).toBe(true);
  });

  it("passes for a valid rn7 chrM interval", () => {
    const result = validateChromosomeBounds([
      makeFeature({ build: "rn7", chrom: "chrM", start: 0, end: 16313 }),
    ]);
    expect(result.valid).toBe(true);
  });

  it("passes for GRCh38 (alias of hg38)", () => {
    const result = validateChromosomeBounds([
      makeFeature({ build: "GRCh38", chrom: "chr1", start: 0, end: 248956422 }),
    ]);
    expect(result.valid).toBe(true);
  });

  it("skips features without measuredRegion", () => {
    const result = validateChromosomeBounds([
      { featureId: "feat-no-region", measuredIdentifier: "probe_001" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("skips unparseable feature objects silently", () => {
    const result = validateChromosomeBounds([
      "not-a-feature",
      42,
      null,
      { measuredRegion: { chrom: 123, start: "a", end: "b", build: true } },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Synchronous validation – out-of-bounds intervals
// ---------------------------------------------------------------------------

describe("validateChromosomeBounds – out-of-bounds intervals", () => {
  it("fails when end exceeds chromosome length", () => {
    const result = validateChromosomeBounds([
      makeFeature({ chrom: "chr1", start: 0, end: 248956423 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI009/);
    expect(result.errors[0]).toMatch(/exceeds chromosome length/);
    expect(result.errors[0]).toMatch(/248956422/);
  });

  it("fails when start is negative", () => {
    const result = validateChromosomeBounds([
      makeFeature({ chrom: "chr1", start: -1, end: 100 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI009/);
    expect(result.errors[0]).toMatch(/Start coordinate -1 is negative/);
  });

  it("fails when end equals start (zero-length interval)", () => {
    const result = validateChromosomeBounds([
      makeFeature({ chrom: "chr1", start: 1000, end: 1000 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI009/);
    expect(result.errors[0]).toMatch(/Invalid interval/);
  });

  it("fails when end is less than start", () => {
    const result = validateChromosomeBounds([
      makeFeature({ chrom: "chr1", start: 2000, end: 1000 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI009/);
    expect(result.errors[0]).toMatch(/end 1000 <= start 2000/);
  });

  it("reports multiple bounds violations independently", () => {
    const result = validateChromosomeBounds([
      makeFeature({ featureId: "f1", chrom: "chr1", start: -10, end: 100 }),
      makeFeature({ featureId: "f2", chrom: "chr1", start: 1000, end: 300000000 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatch(/f1/);
    expect(result.errors[1]).toMatch(/f2/);
  });
});

// ---------------------------------------------------------------------------
// Synchronous validation – unknown chromosomes and builds
// ---------------------------------------------------------------------------

describe("validateChromosomeBounds – unknown chromosomes and builds", () => {
  it("fails for unknown chromosome", () => {
    const result = validateChromosomeBounds([
      makeFeature({ chrom: "chrZ" }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI009/);
    expect(result.errors[0]).toMatch(/Unknown chromosome "chrZ"/);
  });

  it("fails for unknown build", () => {
    const result = validateChromosomeBounds([
      makeFeature({ build: "canFam3" }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI009/);
    expect(result.errors[0]).toMatch(/not in frozen chromosome sizes/);
  });

  it("fails for unknown contig", () => {
    const result = validateChromosomeBounds([
      makeFeature({ chrom: "chrUn_12345" }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Unknown chromosome "chrUn_12345"/);
  });
});

// ---------------------------------------------------------------------------
// Alias handling
// ---------------------------------------------------------------------------

describe("validateChromosomeBounds – alias handling", () => {
  it("fails for numeric alias when normalization is disabled", () => {
    const result = validateChromosomeBounds(
      [makeFeature({ chrom: "1" })],
      { allowAliasNormalization: false },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Unknown chromosome "1"/);
    expect(result.aliasNormalizations).toHaveLength(0);
  });

  it("passes for numeric alias when normalization is enabled", () => {
    const result = validateChromosomeBounds(
      [makeFeature({ chrom: "1" })],
      { allowAliasNormalization: true },
    );
    expect(result.valid).toBe(true);
    expect(result.aliasNormalizations).toHaveLength(1);
    expect(result.aliasNormalizations[0].originalChrom).toBe("1");
    expect(result.aliasNormalizations[0].canonicalChrom).toBe("chr1");
    expect(result.warnings[0]).toMatch(/1 → chr1/);
  });

  it("normalizes X alias to chrX", () => {
    const result = validateChromosomeBounds(
      [makeFeature({ chrom: "X" })],
      { allowAliasNormalization: true },
    );
    expect(result.valid).toBe(true);
    expect(result.aliasNormalizations[0].canonicalChrom).toBe("chrX");
  });

  it("normalizes MT alias to chrM", () => {
    const result = validateChromosomeBounds(
      [makeFeature({ chrom: "MT" })],
      { allowAliasNormalization: true },
    );
    expect(result.valid).toBe(true);
    expect(result.aliasNormalizations[0].canonicalChrom).toBe("chrM");
  });

  it("normalizes chrMT alias to chrM", () => {
    const result = validateChromosomeBounds(
      [makeFeature({ chrom: "chrMT" })],
      { allowAliasNormalization: true },
    );
    expect(result.valid).toBe(true);
    expect(result.aliasNormalizations[0].canonicalChrom).toBe("chrM");
  });

  it("records alias provenance per feature", () => {
    const result = validateChromosomeBounds(
      [
        makeFeature({ featureId: "f1", chrom: "1" }),
        makeFeature({ featureId: "f2", chrom: "X" }),
      ],
      { allowAliasNormalization: true },
    );
    expect(result.aliasNormalizations).toHaveLength(2);
    expect(result.aliasNormalizations[0]).toEqual({
      featureId: "f1",
      originalChrom: "1",
      canonicalChrom: "chr1",
    });
    expect(result.aliasNormalizations[1]).toEqual({
      featureId: "f2",
      originalChrom: "X",
      canonicalChrom: "chrX",
    });
  });

  it("does not warn when no alias normalization is needed", () => {
    const result = validateChromosomeBounds(
      [makeFeature({ chrom: "chr1" })],
      { allowAliasNormalization: true },
    );
    expect(result.valid).toBe(true);
    expect(result.aliasNormalizations).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// requireBoundsCheck option
// ---------------------------------------------------------------------------

describe("validateChromosomeBounds – requireBoundsCheck", () => {
  it("allows out-of-bounds intervals when bounds check is disabled", () => {
    const result = validateChromosomeBounds(
      [makeFeature({ chrom: "chr1", start: 0, end: 999999999 })],
      { requireBoundsCheck: false },
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("still blocks unknown chromosomes when bounds check is disabled", () => {
    const result = validateChromosomeBounds(
      [makeFeature({ chrom: "chrZ" })],
      { requireBoundsCheck: false },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Unknown chromosome/);
  });
});

// ---------------------------------------------------------------------------
// Batch validation
// ---------------------------------------------------------------------------

describe("validateChromosomeBounds – batch mixed results", () => {
  it("reports valid and invalid features in the same batch", () => {
    const result = validateChromosomeBounds([
      makeFeature({ featureId: "f-good", chrom: "chr1", start: 0, end: 1000 }),
      makeFeature({ featureId: "f-bad", chrom: "chr1", start: 0, end: 999999999 }),
      makeFeature({ featureId: "f-unknown", chrom: "chrZ" }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.some((e) => e.includes("f-bad"))).toBe(true);
    expect(result.errors.some((e) => e.includes("f-unknown"))).toBe(true);
    expect(result.errors.some((e) => e.includes("f-good"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Asynchronous validation – Annotation/Ontology MCP integration
// ---------------------------------------------------------------------------

describe("validateChromosomeBoundsAsync – annotation client fallback", () => {
  it("falls back to annotation client for unknown build not in frozen store", async () => {
    const transport = new MockAnnotationTransport();
    transport.setHandler("/v1/validate-chromosome", async () => ({
      requestId: "test-uuid",
      valid: true,
      canonicalName: "chr1",
      length: 200000000,
      build: "customBuild",
      timestamp: "2026-05-05T00:00:00Z",
    }));
    const client = new AnnotationClient({ transport, timeoutMs: 5000 });

    const result = await validateChromosomeBoundsAsync(
      [makeFeature({ build: "customBuild", chrom: "chr1", start: 0, end: 1000 })],
      { annotationClient: client },
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails closed when annotation client returns invalid chromosome", async () => {
    const transport = new MockAnnotationTransport();
    transport.setHandler("/v1/validate-chromosome", async () => ({
      requestId: "test-uuid",
      valid: false,
      build: "customBuild",
      timestamp: "2026-05-05T00:00:00Z",
    }));
    const client = new AnnotationClient({ transport, timeoutMs: 5000 });

    const result = await validateChromosomeBoundsAsync(
      [makeFeature({ build: "customBuild", chrom: "chrFake" })],
      { annotationClient: client },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Unknown chromosome/);
  });

  it("fails closed when annotation client throws", async () => {
    const transport = new MockAnnotationTransport();
    transport.setHandler("/v1/validate-chromosome", async () => {
      throw new Error("service down");
    });
    const client = new AnnotationClient({ transport, timeoutMs: 5000 });

    const result = await validateChromosomeBoundsAsync(
      [makeFeature({ build: "customBuild", chrom: "chr1", start: 0, end: 1000 })],
      { annotationClient: client },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Unknown chromosome/);
    expect(result.warnings[0]).toMatch(/Annotation\/Ontology MCP lookup failed/);
  });

  it("uses frozen store preferentially and skips client for known builds", async () => {
    const transport = new MockAnnotationTransport();
    transport.setHandler("/v1/validate-chromosome", async () => {
      throw new Error("should not be called for known build");
    });
    const client = new AnnotationClient({ transport, timeoutMs: 5000 });

    const result = await validateChromosomeBoundsAsync(
      [makeFeature({ build: "hg38", chrom: "chr1", start: 0, end: 1000 })],
      { annotationClient: client },
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("caches annotation client lookups to avoid redundant calls", async () => {
    let callCount = 0;
    const transport = new MockAnnotationTransport();
    transport.setHandler("/v1/validate-chromosome", async () => {
      callCount++;
      return {
        requestId: "test-uuid",
        valid: true,
        canonicalName: "chr1",
        length: 200000000,
        build: "customBuild",
        timestamp: "2026-05-05T00:00:00Z",
      };
    });
    const client = new AnnotationClient({ transport, timeoutMs: 5000 });

    await validateChromosomeBoundsAsync(
      [
        makeFeature({ featureId: "f1", build: "customBuild", chrom: "chr1", start: 0, end: 100 }),
        makeFeature({ featureId: "f2", build: "customBuild", chrom: "chr1", start: 200, end: 300 }),
      ],
      { annotationClient: client },
    );
    expect(callCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Asynchronous validation – alias handling with remote fallback
// ---------------------------------------------------------------------------

describe("validateChromosomeBoundsAsync – alias handling", () => {
  it("normalizes alias before remote lookup", async () => {
    const transport = new MockAnnotationTransport();
    transport.setHandler("/v1/validate-chromosome", async (body) => {
      const req = body as { chrom: string; build: string };
      expect(req.chrom).toBe("chr1"); // normalized
      return {
        requestId: "test-uuid",
        valid: true,
        canonicalName: "chr1",
        length: 200000000,
        build: req.build,
        timestamp: "2026-05-05T00:00:00Z",
      };
    });
    const client = new AnnotationClient({ transport, timeoutMs: 5000 });

    const result = await validateChromosomeBoundsAsync(
      [makeFeature({ build: "customBuild", chrom: "1", start: 0, end: 1000 })],
      { allowAliasNormalization: true, annotationClient: client },
    );
    expect(result.valid).toBe(true);
    expect(result.aliasNormalizations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("validateChromosomeBounds – edge cases", () => {
  it("passes for empty feature array", () => {
    const result = validateChromosomeBounds([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("accepts interval at exact chromosome boundary", () => {
    const result = validateChromosomeBounds([
      makeFeature({ chrom: "chrM", start: 0, end: 16569 }),
    ]);
    expect(result.valid).toBe(true);
  });

  it("rejects interval one base past chromosome boundary", () => {
    const result = validateChromosomeBounds([
      makeFeature({ chrom: "chrM", start: 0, end: 16570 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/exceeds chromosome length/);
  });

  it("reports featureId in errors when present", () => {
    const result = validateChromosomeBounds([
      makeFeature({ featureId: "my-feature-42", chrom: "chrZ" }),
    ]);
    expect(result.errors[0]).toMatch(/my-feature-42/);
  });

  it("reports '(unknown)' in errors when featureId is missing", () => {
    const result = validateChromosomeBounds([
      { measuredRegion: { chrom: "chrZ", start: 0, end: 100, build: "hg38" } },
    ]);
    expect(result.errors[0]).toMatch(/\(unknown\)/);
  });
});
