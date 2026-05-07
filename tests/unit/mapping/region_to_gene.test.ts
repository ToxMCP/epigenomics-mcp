import { describe, it, expect } from "vitest";
import {
  GeneModelSnapshotSchema,
  GeneModelSchema,
} from "../../../src/coordinate_mapping/region_to_gene.js";
import { mapRegionToNearestGene } from "../../../src/mapping/region_to_gene.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

const tieSnapshot = GeneModelSnapshotSchema.parse({
  annotationRelease: "TEST_v1",
  genomeBuild: "GRCh38",
  genes: [
    {
      geneId: "GENE_LEFT",
      chrom: "chr1",
      start: 1000,
      end: 2000,
      strand: "+",
    },
    {
      geneId: "GENE_RIGHT",
      chrom: "chr1",
      start: 4000,
      end: 5000,
      strand: "+",
    },
  ],
});

// ---------------------------------------------------------------------------
// mapRegionToNearestGene
// ---------------------------------------------------------------------------

describe("mapRegionToNearestGene", () => {
  it("maps a feature to the nearest plus-strand gene by TSS distance", () => {
    // ENSG00000139618 on chr13, strand +, TSS at 32_300_000
    // Feature at [32_305_000, 32_305_100) → distance = 32_305_000 - 32_300_000 = 5_000
    const result = mapRegionToNearestGene(
      "feat_001",
      "chr13",
      32_305_000,
      32_305_100,
      grch38Snapshot,
    );
    expect(result.featureId).toBe("feat_001");
    expect(result.method).toBe("nearest_gene");
    expect(result.confidence).toBe("low");
    expect(result.geneIds).toEqual(["ENSG00000139618"]);
    expect(result.distanceBp).toBe(5000);
    expect(result.pathwayRollupAllowed).toBe(false);
    expect(result.downstreamUseRule).toBe("exploratory_only");
  });

  it("maps a feature to the nearest minus-strand gene by TSS distance", () => {
    // ENSG00000141510 on chr17, strand -, TSS at 7_680_000
    // Feature at [7_685_000, 7_685_100) → distance = 7_685_000 - 7_680_000 = 5_000
    const result = mapRegionToNearestGene(
      "feat_002",
      "chr17",
      7_685_000,
      7_685_100,
      grch38Snapshot,
    );
    expect(result.geneIds).toEqual(["ENSG00000141510"]);
    expect(result.confidence).toBe("low");
    expect(result.distanceBp).toBe(5000);
  });

  it("returns distance 0 when the feature overlaps the TSS", () => {
    // ENSG00000157764 on chr7, strand +, TSS at 140_400_000
    // Feature [140_399_900, 140_400_050) overlaps TSS
    const result = mapRegionToNearestGene(
      "feat_003",
      "chr7",
      140_399_900,
      140_400_050,
      grch38Snapshot,
    );
    expect(result.geneIds).toEqual(["ENSG00000157764"]);
    expect(result.distanceBp).toBe(0);
    expect(result.confidence).toBe("low");
  });

  it("handles distal regions far from any TSS", () => {
    // ENSG00000133703 on chr12, strand -, TSS at 25_300_000
    // Feature at [26_000_000, 26_000_100) → distance = 26_000_000 - 25_300_000 = 700_000
    const result = mapRegionToNearestGene(
      "feat_004",
      "chr12",
      26_000_000,
      26_000_100,
      grch38Snapshot,
    );
    expect(result.geneIds).toEqual(["ENSG00000133703"]);
    expect(result.distanceBp).toBe(700_000);
    expect(result.confidence).toBe("low");
    expect(result.pathwayRollupAllowed).toBe(false);
    expect(result.downstreamUseRule).toBe("exploratory_only");
  });

  it("returns all genes tied for nearest distance", () => {
    // GENE_LEFT TSS at 1000, GENE_RIGHT TSS at 4000
    // Feature at [2400, 2600) → distance to both = 1400
    const result = mapRegionToNearestGene(
      "feat_005",
      "chr1",
      2400,
      2600,
      tieSnapshot,
    );
    expect(result.geneIds).toHaveLength(2);
    expect(result.geneIds).toContain("GENE_LEFT");
    expect(result.geneIds).toContain("GENE_RIGHT");
    expect(result.distanceBp).toBe(1400);
    expect(result.confidence).toBe("low");
  });

  it("returns empty geneIds for a chromosome missing from the snapshot", () => {
    const result = mapRegionToNearestGene(
      "feat_006",
      "chr99",
      1000,
      2000,
      grch38Snapshot,
    );
    expect(result.geneIds).toHaveLength(0);
    expect(result.confidence).toBe("none");
    expect(result.distanceBp).toBeUndefined();
  });

  it("returns empty geneIds for an empty snapshot", () => {
    const emptySnapshot = GeneModelSnapshotSchema.parse({
      annotationRelease: "EMPTY_v1",
      genomeBuild: "GRCh38",
      genes: [],
    });
    const result = mapRegionToNearestGene(
      "feat_007",
      "chr1",
      1000,
      2000,
      emptySnapshot,
    );
    expect(result.geneIds).toHaveLength(0);
    expect(result.confidence).toBe("none");
    expect(result.distanceBp).toBeUndefined();
  });

  it("includes annotation trace with release provenance", () => {
    const result = mapRegionToNearestGene(
      "feat_008",
      "chr13",
      32_305_000,
      32_305_100,
      grch38Snapshot,
    );
    expect(result.annotationTrace).toBeDefined();
    expect(result.annotationTrace!.sourceResource).toBe(
      "frozen_gene_model_snapshot",
    );
    expect(result.annotationTrace!.sourceVersion).toBe("GENCODE_v46");
    expect(result.annotationTrace!.genomeBuild).toBe("GRCh38");
    expect(result.annotationTrace!.traceId).toContain("feat_008");
    expect(result.annotationTrace!.traceId).toContain("nearest_gene");
    expect(result.annotationTrace!.traceId).toContain("GENCODE_v46");
  });

  it("rejects pathwayRollupAllowed=true at schema level", async () => {
    // This is a schema-level test: nearest_gene cannot have pathwayRollupAllowed=true
    const { RegionToGeneMappingSchema } = await import(
      "../../../src/contracts/mapping.js"
    );
    expect(() =>
      RegionToGeneMappingSchema.parse({
        featureId: "feat_009",
        geneIds: ["GENE1"],
        method: "nearest_gene",
        confidence: "low",
        pathwayRollupAllowed: true,
      }),
    ).toThrow(/pathwayRollupAllowed is not permitted for this mapping type/);
  });

  it("computes distance 0 for adjacent coordinate (bedtools-closest semantics)", () => {
    // GENE_LEFT TSS at 1000
    // Feature [1000, 1001) overlaps TSS exactly → distance 0
    const overlapResult = mapRegionToNearestGene(
      "feat_010",
      "chr1",
      1000,
      1001,
      tieSnapshot,
    );
    expect(overlapResult.distanceBp).toBe(0);

    // Feature [999, 1000) ends exactly at TSS 1000 → adjacent, distance 0
    const adjacentResult = mapRegionToNearestGene(
      "feat_011",
      "chr1",
      999,
      1000,
      tieSnapshot,
    );
    expect(adjacentResult.distanceBp).toBe(0);
    expect(adjacentResult.geneIds).toEqual(["GENE_LEFT"]);
  });

  it("throws for an invalid snapshot", () => {
    expect(() =>
      mapRegionToNearestGene(
        "feat_012",
        "chr1",
        1000,
        2000,
        { annotationRelease: "", genomeBuild: "bad", genes: [] } as unknown as typeof grch38Snapshot,
      ),
    ).toThrow();
  });
});
