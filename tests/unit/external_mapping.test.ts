import { describe, it, expect } from "vitest";
import {
  MockExternalMappingAdapter,
  buildEnhancerTargetMapping,
  buildChromatinInteractionMapping,
  computeDownstreamUseRule,
} from "../../src/coordinate_mapping/external_mapping.js";
import { ExternalDatabaseMappingSchema } from "../../src/contracts/mapping.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockAdapter = new MockExternalMappingAdapter({
  "feat-enhancer-exact": {
    geneIds: ["ENSG00000141510"],
    confidence: "high",
    biosampleContextMatch: "exact",
  },
  "feat-enhancer-close": {
    geneIds: ["ENSG00000141510"],
    confidence: "medium",
    biosampleContextMatch: "close",
  },
  "feat-enhancer-distant": {
    geneIds: ["ENSG00000141510"],
    confidence: "low",
    biosampleContextMatch: "distant",
  },
  "feat-enhancer-unknown": {
    geneIds: [],
    confidence: "none",
    biosampleContextMatch: "unknown",
  },
  "feat-chromatin-exact": {
    geneIds: ["ENSG00000139618", "ENSG00000157764"],
    confidence: "high",
    biosampleContextMatch: "exact",
  },
  "feat-chromatin-distant": {
    geneIds: ["ENSG00000139618"],
    confidence: "medium",
    biosampleContextMatch: "distant",
  },
});

const defaultRegion = { chrom: "chr1", start: 1000, end: 2000 };

const defaultOptions = {
  sourceResource: "GeneHancer",
  annotationRelease: "v4.7",
  genomeBuild: "hg38" as const,
};

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("ExternalDatabaseMappingSchema", () => {
  it("accepts a valid complete payload", () => {
    const mapping = ExternalDatabaseMappingSchema.parse({
      featureId: "feat-001",
      geneIds: ["ENSG00000141510"],
      method: "enhancer_target_from_database",
      confidence: "high",
      sourceResource: "GeneHancer",
      annotationRelease: "v4.7",
      biosampleContextMatch: "exact",
      downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
    });
    expect(mapping.featureId).toBe("feat-001");
    expect(mapping.warnings).toEqual([]);
  });

  it("rejects missing sourceResource", () => {
    expect(() =>
      ExternalDatabaseMappingSchema.parse({
        featureId: "feat-001",
        geneIds: ["ENSG00000141510"],
        method: "enhancer_target_from_database",
        confidence: "high",
        annotationRelease: "v4.7",
        biosampleContextMatch: "exact",
        downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
      }),
    ).toThrow();
  });

  it("rejects missing annotationRelease", () => {
    expect(() =>
      ExternalDatabaseMappingSchema.parse({
        featureId: "feat-001",
        geneIds: ["ENSG00000141510"],
        method: "enhancer_target_from_database",
        confidence: "high",
        sourceResource: "GeneHancer",
        biosampleContextMatch: "exact",
        downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
      }),
    ).toThrow();
  });

  it("rejects missing biosampleContextMatch", () => {
    expect(() =>
      ExternalDatabaseMappingSchema.parse({
        featureId: "feat-001",
        geneIds: ["ENSG00000141510"],
        method: "enhancer_target_from_database",
        confidence: "high",
        sourceResource: "GeneHancer",
        annotationRelease: "v4.7",
        downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
      }),
    ).toThrow();
  });

  it("rejects missing downstreamUseRule", () => {
    expect(() =>
      ExternalDatabaseMappingSchema.parse({
        featureId: "feat-001",
        geneIds: ["ENSG00000141510"],
        method: "enhancer_target_from_database",
        confidence: "high",
        sourceResource: "GeneHancer",
        annotationRelease: "v4.7",
        biosampleContextMatch: "exact",
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

describe("MockExternalMappingAdapter", () => {
  it("returns preset enhancer target result", async () => {
    const result = await mockAdapter.lookupEnhancerTargets(
      "feat-enhancer-exact",
      defaultRegion,
    );
    expect(result.geneIds).toContain("ENSG00000141510");
    expect(result.confidence).toBe("high");
    expect(result.biosampleContextMatch).toBe("exact");
  });

  it("returns preset chromatin interaction result", async () => {
    const result = await mockAdapter.lookupChromatinInteractions(
      "feat-chromatin-exact",
      defaultRegion,
    );
    expect(result.geneIds).toHaveLength(2);
    expect(result.confidence).toBe("high");
    expect(result.biosampleContextMatch).toBe("exact");
  });

  it("returns safe empty fallback for unknown featureId", async () => {
    const result = await mockAdapter.lookupEnhancerTargets(
      "unknown-feat",
      defaultRegion,
    );
    expect(result.geneIds).toHaveLength(0);
    expect(result.confidence).toBe("none");
    expect(result.biosampleContextMatch).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Downstream use rule computation
// ---------------------------------------------------------------------------

describe("computeDownstreamUseRule", () => {
  it("assigns allow_contextual_gene_linkage_and_pathway_rollup for exact match", () => {
    const { downstreamUseRule, warnings } = computeDownstreamUseRule(
      "enhancer_target_from_database",
      "exact",
      "feat-001",
    );
    expect(downstreamUseRule).toBe("allow_contextual_gene_linkage_and_pathway_rollup");
    expect(warnings).toHaveLength(0);
  });

  it("assigns allow_contextual_gene_linkage_and_pathway_rollup for close match", () => {
    const { downstreamUseRule, warnings } = computeDownstreamUseRule(
      "chromatin_interaction_supported",
      "close",
      "feat-002",
    );
    expect(downstreamUseRule).toBe("allow_contextual_gene_linkage_and_pathway_rollup");
    expect(warnings).toHaveLength(0);
  });

  it("assigns block_pathway_rollup for distant match with warning", () => {
    const { downstreamUseRule, warnings } = computeDownstreamUseRule(
      "enhancer_target_from_database",
      "distant",
      "feat-003",
    );
    expect(downstreamUseRule).toBe("block_pathway_rollup");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].warningCode).toBe("EPIW005_BIOSAMPLE_CONTEXT_MISMATCH");
    expect(warnings[0].severity).toBe("warning");
    expect(warnings[0].blocksDownstream).toBe(false);
    expect(warnings[0].featureIds).toContain("feat-003");
  });

  it("assigns exploratory_only for unknown match with warning", () => {
    const { downstreamUseRule, warnings } = computeDownstreamUseRule(
      "chromatin_interaction_supported",
      "unknown",
      "feat-004",
    );
    expect(downstreamUseRule).toBe("exploratory_only");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].warningCode).toBe("EPIW005_BIOSAMPLE_CONTEXT_MISMATCH");
    expect(warnings[0].blocksDownstream).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// enhancer target mapping builder
// ---------------------------------------------------------------------------

describe("buildEnhancerTargetMapping", () => {
  it("builds a complete mapping with exact biosample context", async () => {
    const mapping = await buildEnhancerTargetMapping(
      "feat-enhancer-exact",
      defaultRegion,
      defaultOptions,
      mockAdapter,
    );
    expect(mapping.featureId).toBe("feat-enhancer-exact");
    expect(mapping.method).toBe("enhancer_target_from_database");
    expect(mapping.confidence).toBe("high");
    expect(mapping.geneIds).toContain("ENSG00000141510");
    expect(mapping.sourceResource).toBe("GeneHancer");
    expect(mapping.annotationRelease).toBe("v4.7");
    expect(mapping.biosampleContextMatch).toBe("exact");
    expect(mapping.downstreamUseRule).toBe(
      "allow_contextual_gene_linkage_and_pathway_rollup",
    );
    expect(mapping.warnings).toHaveLength(0);
  });

  it("builds a mapping with distant biosample context and warning", async () => {
    const mapping = await buildEnhancerTargetMapping(
      "feat-enhancer-distant",
      defaultRegion,
      defaultOptions,
      mockAdapter,
    );
    expect(mapping.biosampleContextMatch).toBe("distant");
    expect(mapping.downstreamUseRule).toBe("block_pathway_rollup");
    expect(mapping.warnings).toHaveLength(1);
    expect(mapping.warnings[0].warningCode).toBe("EPIW005_BIOSAMPLE_CONTEXT_MISMATCH");
  });

  it("builds a safe empty mapping for unknown featureId", async () => {
    const mapping = await buildEnhancerTargetMapping(
      "unknown-feat",
      defaultRegion,
      defaultOptions,
      mockAdapter,
    );
    expect(mapping.geneIds).toHaveLength(0);
    expect(mapping.confidence).toBe("none");
    expect(mapping.biosampleContextMatch).toBe("unknown");
    expect(mapping.downstreamUseRule).toBe("exploratory_only");
    expect(mapping.warnings).toHaveLength(1);
  });

  it("includes annotation trace when genomeBuild is provided", async () => {
    const mapping = await buildEnhancerTargetMapping(
      "feat-enhancer-exact",
      defaultRegion,
      defaultOptions,
      mockAdapter,
    );
    expect(mapping.annotationTrace).toBeDefined();
    expect(mapping.annotationTrace!.traceId).toContain("feat-enhancer-exact");
    expect(mapping.annotationTrace!.traceId).toContain("enhancer");
    expect(mapping.annotationTrace!.genomeBuild).toBe("hg38");
  });

  it("omits annotation trace when genomeBuild is omitted", async () => {
    const mapping = await buildEnhancerTargetMapping(
      "feat-enhancer-exact",
      defaultRegion,
      { sourceResource: "GeneHancer", annotationRelease: "v4.7" },
      mockAdapter,
    );
    expect(mapping.annotationTrace).toBeUndefined();
  });

  it("uses default mock adapter when none is provided", async () => {
    const mapping = await buildEnhancerTargetMapping(
      "any-feat",
      defaultRegion,
      defaultOptions,
    );
    expect(mapping.geneIds).toHaveLength(0);
    expect(mapping.confidence).toBe("none");
    expect(mapping.biosampleContextMatch).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// chromatin interaction mapping builder
// ---------------------------------------------------------------------------

describe("buildChromatinInteractionMapping", () => {
  it("builds a complete mapping with exact biosample context", async () => {
    const mapping = await buildChromatinInteractionMapping(
      "feat-chromatin-exact",
      defaultRegion,
      { sourceResource: "ENCODE", annotationRelease: "v3.0", genomeBuild: "hg38" },
      mockAdapter,
    );
    expect(mapping.featureId).toBe("feat-chromatin-exact");
    expect(mapping.method).toBe("chromatin_interaction_supported");
    expect(mapping.confidence).toBe("high");
    expect(mapping.geneIds).toHaveLength(2);
    expect(mapping.sourceResource).toBe("ENCODE");
    expect(mapping.annotationRelease).toBe("v3.0");
    expect(mapping.biosampleContextMatch).toBe("exact");
    expect(mapping.downstreamUseRule).toBe(
      "allow_contextual_gene_linkage_and_pathway_rollup",
    );
    expect(mapping.warnings).toHaveLength(0);
  });

  it("builds a mapping with distant biosample context and warning", async () => {
    const mapping = await buildChromatinInteractionMapping(
      "feat-chromatin-distant",
      defaultRegion,
      { sourceResource: "ENCODE", annotationRelease: "v3.0", genomeBuild: "hg38" },
      mockAdapter,
    );
    expect(mapping.biosampleContextMatch).toBe("distant");
    expect(mapping.downstreamUseRule).toBe("block_pathway_rollup");
    expect(mapping.warnings).toHaveLength(1);
    expect(mapping.warnings[0].warningCode).toBe("EPIW005_BIOSAMPLE_CONTEXT_MISMATCH");
  });

  it("uses default mock adapter when none is provided", async () => {
    const mapping = await buildChromatinInteractionMapping(
      "any-feat",
      defaultRegion,
      { sourceResource: "ENCODE", annotationRelease: "v3.0" },
    );
    expect(mapping.geneIds).toHaveLength(0);
    expect(mapping.confidence).toBe("none");
    expect(mapping.biosampleContextMatch).toBe("unknown");
    expect(mapping.downstreamUseRule).toBe("exploratory_only");
  });
});
