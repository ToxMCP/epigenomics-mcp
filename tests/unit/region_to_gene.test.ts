import { describe, it, expect } from "vitest";
import {
  PromoterWindowPolicySchema,
  GeneModelSchema,
  GeneModelSnapshotSchema,
  buildPromoterWindow,
  regionsOverlap,
  directPromoterOverlap,
  geneBodyOverlap,
} from "../../src/coordinate_mapping/region_to_gene.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultPolicy = PromoterWindowPolicySchema.parse({
  upstreamBp: 2000,
  downstreamBp: 200,
  version: "v1.0",
});

const narrowPolicy = PromoterWindowPolicySchema.parse({
  upstreamBp: 500,
  downstreamBp: 100,
  version: "v2.0-narrow",
});

const grch38Snapshot = GeneModelSnapshotSchema.parse({
  annotationRelease: "GENCODE_v46",
  genomeBuild: "GRCh38",
  genes: [
    {
      geneId: "ENSG00000139618",
      chrom: "chr13",
      start: 32_300_000,
      end: 32_400_000,
      strand: "+",
    },
    {
      geneId: "ENSG00000141510",
      chrom: "chr17",
      start: 7_660_000,
      end: 7_680_000,
      strand: "-",
    },
    {
      geneId: "ENSG00000157764",
      chrom: "chr7",
      start: 140_400_000,
      end: 140_500_000,
      strand: "+",
    },
    {
      geneId: "ENSG00000133703",
      chrom: "chr12",
      start: 25_200_000,
      end: 25_300_000,
      strand: "-",
    },
  ],
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("PromoterWindowPolicySchema", () => {
  it("accepts a valid policy", () => {
    const policy = PromoterWindowPolicySchema.parse({
      upstreamBp: 2000,
      downstreamBp: 200,
      version: "v1.0",
    });
    expect(policy.upstreamBp).toBe(2000);
    expect(policy.downstreamBp).toBe(200);
    expect(policy.version).toBe("v1.0");
  });

  it("rejects negative upstreamBp", () => {
    expect(() =>
      PromoterWindowPolicySchema.parse({
        upstreamBp: -1,
        downstreamBp: 200,
        version: "v1.0",
      }),
    ).toThrow();
  });

  it("rejects missing version", () => {
    expect(() =>
      PromoterWindowPolicySchema.parse({
        upstreamBp: 2000,
        downstreamBp: 200,
      }),
    ).toThrow();
  });

  it("rejects extra fields", () => {
    expect(() =>
      PromoterWindowPolicySchema.parse({
        upstreamBp: 2000,
        downstreamBp: 200,
        version: "v1.0",
        extra: "field",
      }),
    ).toThrow();
  });
});

describe("GeneModelSchema", () => {
  it("accepts a valid plus-strand gene", () => {
    const gene = GeneModelSchema.parse({
      geneId: "ENSG000001",
      chrom: "chr1",
      start: 1000,
      end: 2000,
      strand: "+",
    });
    expect(gene.strand).toBe("+");
  });

  it("accepts a valid minus-strand gene", () => {
    const gene = GeneModelSchema.parse({
      geneId: "ENSG000001",
      chrom: "chr1",
      start: 1000,
      end: 2000,
      strand: "-",
    });
    expect(gene.strand).toBe("-");
  });

  it("rejects end <= start", () => {
    expect(() =>
      GeneModelSchema.parse({
        geneId: "ENSG000001",
        chrom: "chr1",
        start: 2000,
        end: 2000,
        strand: "+",
      }),
    ).toThrow(/end must be greater than start/);
  });

  it("rejects invalid chromosome", () => {
    expect(() =>
      GeneModelSchema.parse({
        geneId: "ENSG000001",
        chrom: "chr1_random",
        start: 1000,
        end: 2000,
        strand: "+",
      }),
    ).toThrow();
  });
});

describe("GeneModelSnapshotSchema", () => {
  it("accepts a valid snapshot", () => {
    const snapshot = GeneModelSnapshotSchema.parse({
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      genes: [],
    });
    expect(snapshot.annotationRelease).toBe("GENCODE_v46");
    expect(snapshot.genomeBuild).toBe("GRCh38");
  });

  it("rejects invalid genome build", () => {
    expect(() =>
      GeneModelSnapshotSchema.parse({
        annotationRelease: "GENCODE_v46",
        genomeBuild: "unknown_build",
        genes: [],
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildPromoterWindow
// ---------------------------------------------------------------------------

describe("buildPromoterWindow", () => {
  it("computes plus-strand promoter window correctly", () => {
    const gene: typeof grch38Snapshot.genes[number] = {
      geneId: "ENSG000001",
      chrom: "chr1",
      start: 100_000,
      end: 200_000,
      strand: "+",
    };
    const window = buildPromoterWindow(gene, defaultPolicy);
    expect(window.chrom).toBe("chr1");
    expect(window.start).toBe(98_000); // 100_000 - 2000
    expect(window.end).toBe(100_200); // 100_000 + 200
  });

  it("computes minus-strand promoter window correctly", () => {
    const gene: typeof grch38Snapshot.genes[number] = {
      geneId: "ENSG000001",
      chrom: "chr1",
      start: 100_000,
      end: 200_000,
      strand: "-",
    };
    const window = buildPromoterWindow(gene, defaultPolicy);
    expect(window.chrom).toBe("chr1");
    expect(window.start).toBe(199_800); // 200_000 - 200
    expect(window.end).toBe(202_000); // 200_000 + 2000
  });

  it("clamps promoter start to 0 for genes near chromosome start", () => {
    const gene: typeof grch38Snapshot.genes[number] = {
      geneId: "ENSG000001",
      chrom: "chr1",
      start: 500,
      end: 2000,
      strand: "+",
    };
    const window = buildPromoterWindow(gene, defaultPolicy);
    expect(window.start).toBe(0);
    expect(window.end).toBe(700); // 500 + 200
  });

  it("uses plus-strand semantics for unknown strand", () => {
    const gene: typeof grch38Snapshot.genes[number] = {
      geneId: "ENSG000001",
      chrom: "chr1",
      start: 100_000,
      end: 200_000,
      strand: ".",
    };
    const window = buildPromoterWindow(gene, defaultPolicy);
    expect(window.start).toBe(98_000);
    expect(window.end).toBe(100_200);
  });
});

// ---------------------------------------------------------------------------
// regionsOverlap
// ---------------------------------------------------------------------------

describe("regionsOverlap", () => {
  it("returns true for overlapping regions on same chromosome", () => {
    const a = { chrom: "chr1", start: 1000, end: 2000 };
    const b = { chrom: "chr1", start: 1500, end: 2500 };
    expect(regionsOverlap(a, b)).toBe(true);
  });

  it("returns false for non-overlapping regions on same chromosome", () => {
    const a = { chrom: "chr1", start: 1000, end: 2000 };
    const b = { chrom: "chr1", start: 2000, end: 3000 };
    expect(regionsOverlap(a, b)).toBe(false);
  });

  it("returns false for regions on different chromosomes", () => {
    const a = { chrom: "chr1", start: 1000, end: 2000 };
    const b = { chrom: "chr2", start: 1500, end: 2500 };
    expect(regionsOverlap(a, b)).toBe(false);
  });

  it("returns true for nested regions", () => {
    const a = { chrom: "chr1", start: 1000, end: 5000 };
    const b = { chrom: "chr1", start: 2000, end: 3000 };
    expect(regionsOverlap(a, b)).toBe(true);
  });

  it("returns false for adjacent but non-overlapping regions", () => {
    const a = { chrom: "chr1", start: 1000, end: 2000 };
    const b = { chrom: "chr1", start: 2000, end: 3000 };
    expect(regionsOverlap(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// directPromoterOverlap
// ---------------------------------------------------------------------------

describe("directPromoterOverlap", () => {
  it("maps a feature overlapping a plus-strand promoter", () => {
    const result = directPromoterOverlap(
      "feat_001",
      "chr13",
      32_299_000, // inside promoter window of ENSG00000139618
      32_299_500,
      grch38Snapshot,
      defaultPolicy,
    );
    expect(result.featureId).toBe("feat_001");
    expect(result.method).toBe("direct_promoter_overlap");
    expect(result.confidence).toBe("high");
    expect(result.geneIds).toContain("ENSG00000139618");
    expect(result.pathwayRollupAllowed).toBe(true);
  });

  it("maps a feature overlapping a minus-strand promoter", () => {
    // ENSG00000141510 on chr17, strand -, end=7_680_000
    // promoter window = [7_680_000 - 200, 7_680_000 + 2000] = [7_679_800, 7_682_000]
    const result = directPromoterOverlap(
      "feat_002",
      "chr17",
      7_680_500, // inside promoter window
      7_681_000,
      grch38Snapshot,
      defaultPolicy,
    );
    expect(result.geneIds).toContain("ENSG00000141510");
    expect(result.confidence).toBe("high");
  });

  it("returns multiple genes when feature overlaps multiple promoters", () => {
    const overlappingSnapshot = GeneModelSnapshotSchema.parse({
      annotationRelease: "TEST_v1",
      genomeBuild: "GRCh38",
      genes: [
        {
          geneId: "GENE_A",
          chrom: "chr1",
          start: 10_000,
          end: 20_000,
          strand: "+",
        },
        {
          geneId: "GENE_B",
          chrom: "chr1",
          start: 12_000,
          end: 22_000,
          strand: "+",
        },
      ],
    });

    const result = directPromoterOverlap(
      "feat_003",
      "chr1",
      9_500, // overlaps promoter windows of both GENE_A and GENE_B
      10_500,
      overlappingSnapshot,
      defaultPolicy,
    );
    expect(result.geneIds).toHaveLength(2);
    expect(result.geneIds).toContain("GENE_A");
    expect(result.geneIds).toContain("GENE_B");
    expect(result.confidence).toBe("high");
  });

  it("returns empty geneIds when no promoter overlaps", () => {
    const result = directPromoterOverlap(
      "feat_004",
      "chr13",
      1_000_000, // far from any promoter
      1_000_100,
      grch38Snapshot,
      defaultPolicy,
    );
    expect(result.geneIds).toHaveLength(0);
    expect(result.confidence).toBe("none");
    expect(result.pathwayRollupAllowed).toBe(true);
  });

  it("returns empty geneIds for different chromosome", () => {
    const result = directPromoterOverlap(
      "feat_005",
      "chr99", // chromosome not in snapshot
      32_299_000,
      32_299_500,
      grch38Snapshot,
      defaultPolicy,
    );
    expect(result.geneIds).toHaveLength(0);
    expect(result.confidence).toBe("none");
  });

  it("includes annotation trace with release provenance", () => {
    const result = directPromoterOverlap(
      "feat_006",
      "chr13",
      32_299_000,
      32_299_500,
      grch38Snapshot,
      defaultPolicy,
    );
    expect(result.annotationTrace).toBeDefined();
    expect(result.annotationTrace!.sourceResource).toBe(
      "frozen_gene_model_snapshot",
    );
    expect(result.annotationTrace!.sourceVersion).toBe("GENCODE_v46");
    expect(result.annotationTrace!.genomeBuild).toBe("GRCh38");
    expect(result.annotationTrace!.traceId).toContain("feat_006");
    expect(result.annotationTrace!.traceId).toContain("promoter");
    expect(result.annotationTrace!.traceId).toContain("GENCODE_v46");
  });

  it("changes overlap results with different promoter policy versions", () => {
    // Using narrow policy: 500 upstream, 100 downstream
    // GENE_A on chr1, start=10_000: promoter = [9_500, 10_100]
    // Using default policy: 2000 upstream, 200 downstream
    // GENE_A promoter = [8_000, 10_200]

    const testSnapshot = GeneModelSnapshotSchema.parse({
      annotationRelease: "TEST_v1",
      genomeBuild: "GRCh38",
      genes: [
        {
          geneId: "GENE_A",
          chrom: "chr1",
          start: 10_000,
          end: 20_000,
          strand: "+",
        },
      ],
    });

    const narrowResult = directPromoterOverlap(
      "feat_007",
      "chr1",
      8_500, // inside default-policy window but outside narrow-policy window
      8_600,
      testSnapshot,
      narrowPolicy,
    );
    expect(narrowResult.geneIds).toHaveLength(0);
    expect(narrowResult.confidence).toBe("none");

    const defaultResult = directPromoterOverlap(
      "feat_007",
      "chr1",
      8_500,
      8_600,
      testSnapshot,
      defaultPolicy,
    );
    expect(defaultResult.geneIds).toContain("GENE_A");
    expect(defaultResult.confidence).toBe("high");
  });

  it("throws for invalid policy", () => {
    expect(() =>
      directPromoterOverlap(
        "feat_008",
        "chr1",
        1000,
        2000,
        grch38Snapshot,
        { upstreamBp: -1, downstreamBp: 200, version: "bad" } as unknown as typeof defaultPolicy,
      ),
    ).toThrow();
  });

  it("throws for invalid snapshot", () => {
    expect(() =>
      directPromoterOverlap(
        "feat_009",
        "chr1",
        1000,
        2000,
        { annotationRelease: "", genomeBuild: "bad", genes: [] } as unknown as typeof grch38Snapshot,
        defaultPolicy,
      ),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// geneBodyOverlap
// ---------------------------------------------------------------------------

describe("geneBodyOverlap", () => {
  it("maps a feature overlapping a gene body", () => {
    const result = geneBodyOverlap(
      "feat_010",
      "chr13",
      32_350_000, // inside ENSG00000139618 body
      32_350_100,
      grch38Snapshot,
    );
    expect(result.featureId).toBe("feat_010");
    expect(result.method).toBe("gene_body_overlap");
    expect(result.confidence).toBe("high");
    expect(result.geneIds).toContain("ENSG00000139618");
    expect(result.pathwayRollupAllowed).toBe(true);
  });

  it("maps a feature overlapping multiple gene bodies", () => {
    const overlappingSnapshot = GeneModelSnapshotSchema.parse({
      annotationRelease: "TEST_v1",
      genomeBuild: "GRCh38",
      genes: [
        {
          geneId: "GENE_C",
          chrom: "chr1",
          start: 10_000,
          end: 20_000,
          strand: "+",
        },
        {
          geneId: "GENE_D",
          chrom: "chr1",
          start: 15_000,
          end: 25_000,
          strand: "+",
        },
      ],
    });

    const result = geneBodyOverlap(
      "feat_011",
      "chr1",
      16_000, // overlaps both GENE_C and GENE_D
      17_000,
      overlappingSnapshot,
    );
    expect(result.geneIds).toHaveLength(2);
    expect(result.geneIds).toContain("GENE_C");
    expect(result.geneIds).toContain("GENE_D");
    expect(result.confidence).toBe("high");
  });

  it("returns empty geneIds when no gene body overlaps", () => {
    const result = geneBodyOverlap(
      "feat_012",
      "chr13",
      1_000_000, // far from any gene body
      1_000_100,
      grch38Snapshot,
    );
    expect(result.geneIds).toHaveLength(0);
    expect(result.confidence).toBe("none");
    expect(result.pathwayRollupAllowed).toBe(true);
  });

  it("returns empty geneIds for different chromosome", () => {
    const result = geneBodyOverlap(
      "feat_013",
      "chr99",
      32_350_000,
      32_350_100,
      grch38Snapshot,
    );
    expect(result.geneIds).toHaveLength(0);
    expect(result.confidence).toBe("none");
  });

  it("includes annotation trace with release provenance", () => {
    const result = geneBodyOverlap(
      "feat_014",
      "chr13",
      32_350_000,
      32_350_100,
      grch38Snapshot,
    );
    expect(result.annotationTrace).toBeDefined();
    expect(result.annotationTrace!.sourceResource).toBe(
      "frozen_gene_model_snapshot",
    );
    expect(result.annotationTrace!.sourceVersion).toBe("GENCODE_v46");
    expect(result.annotationTrace!.genomeBuild).toBe("GRCh38");
    expect(result.annotationTrace!.traceId).toContain("feat_014");
    expect(result.annotationTrace!.traceId).toContain("genebody");
    expect(result.annotationTrace!.traceId).toContain("GENCODE_v46");
  });

  it("maps feature at exact gene boundary (0-based half-open)", () => {
    // ENSG00000139618: start=32_300_000, end=32_400_000
    // A feature [32_300_000, 32_300_001) touches the start boundary
    const result = geneBodyOverlap(
      "feat_015",
      "chr13",
      32_300_000,
      32_300_001,
      grch38Snapshot,
    );
    expect(result.geneIds).toContain("ENSG00000139618");
  });

  it("does not map feature ending at gene start (non-overlapping)", () => {
    // ENSG00000139618: start=32_300_000
    // A feature [32_299_900, 32_300_000) ends exactly at gene start
    const result = geneBodyOverlap(
      "feat_016",
      "chr13",
      32_299_900,
      32_300_000,
      grch38Snapshot,
    );
    expect(result.geneIds).toHaveLength(0);
  });

  it("throws for invalid snapshot", () => {
    expect(() =>
      geneBodyOverlap(
        "feat_017",
        "chr1",
        1000,
        2000,
        { annotationRelease: "", genomeBuild: "bad", genes: [] } as unknown as typeof grch38Snapshot,
      ),
    ).toThrow();
  });
});
