import { describe, it, expect } from "vitest";
import {
  buildInferredTargetGeneMapping,
  buildUnknownTargetGeneMapping,
  isPathwayRollupAllowed,
  applyMappingGuardrails,
  applyExternalMappingGuardrails,
  applyBatchMappingGuardrails,
  MappingProvenanceSchema,
  GuardedMappingResultSchema,
  BatchGuardedMappingResultSchema,
} from "../../../src/mapping/annotation_guardrails.js";
import {
  RegionToGeneMappingSchema,
  ExternalDatabaseMappingSchema,
  type RegionToGeneMapping,
  type ExternalDatabaseMapping,
} from "../../../src/contracts/mapping.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const provenance = MappingProvenanceSchema.parse({
  annotationRelease: "GENCODE_v46",
  genomeBuild: "GRCh38",
  sourceResource: "Ensembl",
});

function makeRegionMapping(overrides?: Partial<RegionToGeneMapping>): RegionToGeneMapping {
  return RegionToGeneMappingSchema.parse({
    featureId: "feat-001",
    geneIds: ["ENSG00000141510"],
    method: "direct_promoter_overlap",
    confidence: "high",
    pathwayRollupAllowed: true,
    ...overrides,
  });
}

function makeExternalMapping(overrides?: Partial<ExternalDatabaseMapping>): ExternalDatabaseMapping {
  return ExternalDatabaseMappingSchema.parse({
    featureId: "feat-001",
    geneIds: ["ENSG00000141510"],
    method: "enhancer_target_from_database",
    confidence: "high",
    sourceResource: "GeneHancer",
    annotationRelease: "v4.7",
    biosampleContextMatch: "exact",
    downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// buildInferredTargetGeneMapping
// ---------------------------------------------------------------------------

describe("buildInferredTargetGeneMapping", () => {
  it("builds a guarded inferred-target mapping with geneIds", () => {
    const result = buildInferredTargetGeneMapping(
      "feat-001",
      ["ENSG00000141510"],
      provenance,
      { rationale: "co-expression heuristic" },
    );

    expect(() => GuardedMappingResultSchema.parse(result)).not.toThrow();
    expect(result.mapping.featureId).toBe("feat-001");
    expect(result.mapping.method).toBe("inferred_target_gene");
    expect(result.mapping.confidence).toBe("low");
    expect(result.mapping.geneIds).toEqual(["ENSG00000141510"]);
    expect(result.mapping.pathwayRollupAllowed).toBe(false);
    expect(result.mapping.downstreamUseRule).toBe("block_pathway_rollup");
    expect(result.blockedPathwayRollup).toBe(true);
    expect(result.blockedCausalClaim).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW011_INFERRED_TARGET_GENE");
    expect(result.warnings[0].message).toContain("co-expression heuristic");
  });

  it("builds an empty inferred-target mapping when no geneIds", () => {
    const result = buildInferredTargetGeneMapping("feat-002", [], provenance);
    expect(result.mapping.confidence).toBe("none");
    expect(result.mapping.geneIds).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.blockedPathwayRollup).toBe(true);
    expect(result.blockedCausalClaim).toBe(true);
  });

  it("includes annotation trace with provenance", () => {
    const result = buildInferredTargetGeneMapping(
      "feat-003",
      ["ENSG00000141510"],
      provenance,
    );
    expect(result.mapping.annotationTrace).toBeDefined();
    expect(result.mapping.annotationTrace!.sourceResource).toBe("Ensembl");
    expect(result.mapping.annotationTrace!.sourceVersion).toBe("GENCODE_v46");
    expect(result.mapping.annotationTrace!.genomeBuild).toBe("GRCh38");
    expect(result.mapping.annotationTrace!.traceId).toContain("feat-003");
    expect(result.mapping.annotationTrace!.traceId).toContain("inferred_target_gene");
  });

  it("includes optional distanceBp when provided", () => {
    const result = buildInferredTargetGeneMapping(
      "feat-004",
      ["ENSG00000141510"],
      provenance,
      { distanceBp: 50000 },
    );
    expect(result.mapping.distanceBp).toBe(50000);
  });

  it("rejects invalid provenance", () => {
    expect(() =>
      buildInferredTargetGeneMapping("feat-005", ["GENE1"], {
        annotationRelease: "",
        genomeBuild: "bad_build",
        sourceResource: "",
      } as unknown as typeof provenance),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildUnknownTargetGeneMapping
// ---------------------------------------------------------------------------

describe("buildUnknownTargetGeneMapping", () => {
  it("builds a guarded unknown-target mapping", () => {
    const result = buildUnknownTargetGeneMapping("feat-001", provenance, {
      reason: "no overlapping gene model",
    });

    expect(() => GuardedMappingResultSchema.parse(result)).not.toThrow();
    expect(result.mapping.featureId).toBe("feat-001");
    expect(result.mapping.method).toBe("unknown_target_gene");
    expect(result.mapping.confidence).toBe("none");
    expect(result.mapping.geneIds).toHaveLength(0);
    expect(result.mapping.pathwayRollupAllowed).toBe(false);
    expect(result.mapping.downstreamUseRule).toBe("block_gene_and_pathway_rollup");
    expect(result.blockedPathwayRollup).toBe(true);
    expect(result.blockedCausalClaim).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW012_UNKNOWN_TARGET_GENE");
    expect(result.warnings[0].message).toContain("no overlapping gene model");
  });

  it("includes annotation trace with provenance", () => {
    const result = buildUnknownTargetGeneMapping("feat-002", provenance);
    expect(result.mapping.annotationTrace).toBeDefined();
    expect(result.mapping.annotationTrace!.sourceResource).toBe("Ensembl");
    expect(result.mapping.annotationTrace!.genomeBuild).toBe("GRCh38");
  });

  it("rejects invalid provenance", () => {
    expect(() =>
      buildUnknownTargetGeneMapping("feat-003", {
        annotationRelease: "",
        genomeBuild: "GRCh38",
        sourceResource: "test",
      } as unknown as typeof provenance),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// isPathwayRollupAllowed
// ---------------------------------------------------------------------------

describe("isPathwayRollupAllowed", () => {
  it("returns true for direct_promoter_overlap", () => {
    expect(isPathwayRollupAllowed("direct_promoter_overlap")).toBe(true);
  });

  it("returns true for gene_body_overlap", () => {
    expect(isPathwayRollupAllowed("gene_body_overlap")).toBe(true);
  });

  it("returns true for enhancer_target_from_database", () => {
    expect(isPathwayRollupAllowed("enhancer_target_from_database")).toBe(true);
  });

  it("returns true for chromatin_interaction_supported", () => {
    expect(isPathwayRollupAllowed("chromatin_interaction_supported")).toBe(true);
  });

  it("returns false for nearest_gene", () => {
    expect(isPathwayRollupAllowed("nearest_gene")).toBe(false);
  });

  it("returns false for inferred_target_gene", () => {
    expect(isPathwayRollupAllowed("inferred_target_gene")).toBe(false);
  });

  it("returns false for unknown_target_gene", () => {
    expect(isPathwayRollupAllowed("unknown_target_gene")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyMappingGuardrails
// ---------------------------------------------------------------------------

describe("applyMappingGuardrails", () => {
  it("allows pathway roll-up for promoter overlap mapping", () => {
    const mapping = makeRegionMapping({
      method: "direct_promoter_overlap",
      pathwayRollupAllowed: true,
    });
    const result = applyMappingGuardrails(mapping);
    expect(result.blockedPathwayRollup).toBe(false);
    expect(result.blockedCausalClaim).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it("allows pathway roll-up for gene body overlap mapping", () => {
    const mapping = makeRegionMapping({
      method: "gene_body_overlap",
      pathwayRollupAllowed: true,
    });
    const result = applyMappingGuardrails(mapping);
    expect(result.blockedPathwayRollup).toBe(false);
    expect(result.blockedCausalClaim).toBe(false);
  });

  it("blocks pathway roll-up for nearest_gene mapping", () => {
    const mapping = makeRegionMapping({
      method: "nearest_gene",
      confidence: "low",
      pathwayRollupAllowed: false,
      downstreamUseRule: "exploratory_only",
    });
    const result = applyMappingGuardrails(mapping);
    expect(result.blockedPathwayRollup).toBe(true);
    expect(result.blockedCausalClaim).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW008_PATHWAY_ROLLUP_BLOCKED");
  });

  it("blocks pathway roll-up for inferred_target_gene mapping", () => {
    const mapping = makeRegionMapping({
      method: "inferred_target_gene",
      confidence: "low",
      pathwayRollupAllowed: false,
      downstreamUseRule: "block_pathway_rollup",
    });
    const result = applyMappingGuardrails(mapping);
    expect(result.blockedPathwayRollup).toBe(true);
    expect(result.blockedCausalClaim).toBe(true);
  });

  it("blocks pathway roll-up for unknown_target_gene mapping", () => {
    const mapping = makeRegionMapping({
      method: "unknown_target_gene",
      confidence: "none",
      geneIds: [],
      pathwayRollupAllowed: false,
      downstreamUseRule: "block_gene_and_pathway_rollup",
    });
    const result = applyMappingGuardrails(mapping);
    expect(result.blockedPathwayRollup).toBe(true);
    expect(result.blockedCausalClaim).toBe(true);
  });

  it("schema rejects pathwayRollupAllowed=true for blocked method before guardrails run", () => {
    // The schema itself is fail-closed: nearest_gene cannot have pathwayRollupAllowed=true
    expect(() =>
      RegionToGeneMappingSchema.parse({
        featureId: "feat-001",
        geneIds: ["ENSG00000141510"],
        method: "nearest_gene",
        confidence: "low",
        pathwayRollupAllowed: true,
      }),
    ).toThrow(/pathwayRollupAllowed is not permitted for this mapping type/);
  });
});

// ---------------------------------------------------------------------------
// applyExternalMappingGuardrails
// ---------------------------------------------------------------------------

describe("applyExternalMappingGuardrails", () => {
  it("allows pathway roll-up for exact biosample context", () => {
    const mapping = makeExternalMapping({
      biosampleContextMatch: "exact",
      downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
    });
    const result = applyExternalMappingGuardrails(mapping);
    expect(result.blockedPathwayRollup).toBe(false);
    expect(result.blockedCausalClaim).toBe(true); // external never causal
  });

  it("allows pathway roll-up for close biosample context", () => {
    const mapping = makeExternalMapping({
      biosampleContextMatch: "close",
      downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
    });
    const result = applyExternalMappingGuardrails(mapping);
    expect(result.blockedPathwayRollup).toBe(false);
  });

  it("blocks pathway roll-up for distant biosample context", () => {
    const mapping = makeExternalMapping({
      biosampleContextMatch: "distant",
      downstreamUseRule: "block_pathway_rollup",
    });
    const result = applyExternalMappingGuardrails(mapping);
    expect(result.blockedPathwayRollup).toBe(true);
    expect(result.blockedCausalClaim).toBe(true);
  });

  it("blocks pathway roll-up for unknown biosample context", () => {
    const mapping = makeExternalMapping({
      biosampleContextMatch: "unknown",
      downstreamUseRule: "exploratory_only",
    });
    const result = applyExternalMappingGuardrails(mapping);
    expect(result.blockedPathwayRollup).toBe(true);
  });

  it("blocks pathway roll-up when downstreamUseRule is block_gene_and_pathway_rollup", () => {
    const mapping = makeExternalMapping({
      downstreamUseRule: "block_gene_and_pathway_rollup",
    });
    const result = applyExternalMappingGuardrails(mapping);
    expect(result.blockedPathwayRollup).toBe(true);
  });

  it("preserves existing warnings", () => {
    const mapping = makeExternalMapping({
      warnings: [
        {
          warningCode: "EPIW005_BIOSAMPLE_CONTEXT_MISMATCH",
          severity: "warning",
          message: "biosample mismatch",
          category: "mapping_proximity",
          blocksDownstream: false,
        },
      ],
    });
    const result = applyExternalMappingGuardrails(mapping);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW005_BIOSAMPLE_CONTEXT_MISMATCH");
  });

  it("always blocks causal claims for external mappings", () => {
    const mapping = makeExternalMapping({
      biosampleContextMatch: "exact",
      downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
    });
    const result = applyExternalMappingGuardrails(mapping);
    expect(result.blockedCausalClaim).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyBatchMappingGuardrails
// ---------------------------------------------------------------------------

describe("applyBatchMappingGuardrails", () => {
  it("classifies mixed mappings correctly", () => {
    const mappings: RegionToGeneMapping[] = [
      makeRegionMapping({
        featureId: "feat-promoter",
        method: "direct_promoter_overlap",
        pathwayRollupAllowed: true,
      }),
      makeRegionMapping({
        featureId: "feat-genebody",
        method: "gene_body_overlap",
        pathwayRollupAllowed: true,
      }),
      makeRegionMapping({
        featureId: "feat-nearest",
        method: "nearest_gene",
        confidence: "low",
        pathwayRollupAllowed: false,
        downstreamUseRule: "exploratory_only",
      }),
      makeRegionMapping({
        featureId: "feat-inferred",
        method: "inferred_target_gene",
        confidence: "low",
        pathwayRollupAllowed: false,
        downstreamUseRule: "block_pathway_rollup",
      }),
      makeRegionMapping({
        featureId: "feat-unknown",
        method: "unknown_target_gene",
        confidence: "none",
        geneIds: [],
        pathwayRollupAllowed: false,
        downstreamUseRule: "block_gene_and_pathway_rollup",
      }),
    ];

    const result = applyBatchMappingGuardrails(mappings);
    expect(() => BatchGuardedMappingResultSchema.parse(result)).not.toThrow();

    expect(result.allowedForPathwayRollup).toEqual([
      "feat-genebody",
      "feat-promoter",
    ]);
    expect(result.blockedFromPathwayRollup).toEqual([
      "feat-inferred",
      "feat-nearest",
      "feat-unknown",
    ]);
    expect(result.blockedCausalClaims).toEqual([
      "feat-inferred",
      "feat-nearest",
      "feat-unknown",
    ]);
    expect(result.allWarnings).toHaveLength(3); // nearest, inferred, unknown
  });

  it("handles empty input", () => {
    const result = applyBatchMappingGuardrails([]);
    expect(result.results).toHaveLength(0);
    expect(result.allowedForPathwayRollup).toHaveLength(0);
    expect(result.blockedFromPathwayRollup).toHaveLength(0);
    expect(result.blockedCausalClaims).toHaveLength(0);
    expect(result.allWarnings).toHaveLength(0);
  });

  it("sorts feature ID lists", () => {
    const mappings: RegionToGeneMapping[] = [
      makeRegionMapping({
        featureId: "feat-c",
        method: "direct_promoter_overlap",
        pathwayRollupAllowed: true,
      }),
      makeRegionMapping({
        featureId: "feat-a",
        method: "direct_promoter_overlap",
        pathwayRollupAllowed: true,
      }),
      makeRegionMapping({
        featureId: "feat-b",
        method: "nearest_gene",
        confidence: "low",
        pathwayRollupAllowed: false,
        downstreamUseRule: "exploratory_only",
      }),
    ];
    const result = applyBatchMappingGuardrails(mappings);
    expect(result.allowedForPathwayRollup).toEqual(["feat-a", "feat-c"]);
    expect(result.blockedFromPathwayRollup).toEqual(["feat-b"]);
  });
});
