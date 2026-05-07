import { describe, it, expect, beforeEach } from "vitest";
import {
  AnnotationClient,
  MockAnnotationTransport,
  FrozenSnapshotTransport,
  FetchAnnotationTransport,
  AnnotationClientError,
  GeneNormalizationRequestSchema,
  GeneNormalizationResponseSchema,
  SpeciesValidationRequestSchema,
  SpeciesValidationResponseSchema,
  ChromosomeValidationRequestSchema,
  ChromosomeValidationResponseSchema,
  RegionToGeneMappingRequestSchema,
  RegionToGeneMappingResponseSchema,
  PathwayMembershipRequestSchema,
  PathwayMembershipResponseSchema,
  CellTypeNormalizationRequestSchema,
  CellTypeNormalizationResponseSchema,
  OntologyReleaseTraceRequestSchema,
  OntologyReleaseTraceResponseSchema,
  type GeneNormalizationResponse,
  type SpeciesValidationResponse,
  type ChromosomeValidationResponse,
  type RegionToGeneMappingResponse,
  type PathwayMembershipResponse,
  type CellTypeNormalizationResponse,
  type OntologyReleaseTraceResponse,
} from "../../src/integrations/annotation_client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGeneNormalizationResponse(overrides?: Partial<GeneNormalizationResponse>): GeneNormalizationResponse {
  return {
    requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    normalizedGenes: [
      { inputSymbol: "TP53", canonicalSymbol: "TP53", geneId: "ENSG00000141510", confidence: "high" },
    ],
    unmappedSymbols: [],
    ontologyRelease: "Ensembl 110",
    timestamp: "2026-05-05T00:00:00Z",
    ...overrides,
  };
}

function makeSpeciesValidationResponse(overrides?: Partial<SpeciesValidationResponse>): SpeciesValidationResponse {
  return {
    requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567891",
    valid: true,
    canonicalName: "Homo sapiens",
    taxonId: "9606",
    timestamp: "2026-05-05T00:00:00Z",
    ...overrides,
  };
}

function makeChromosomeValidationResponse(
  overrides?: Partial<ChromosomeValidationResponse>,
): ChromosomeValidationResponse {
  return {
    requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567892",
    valid: true,
    canonicalName: "chr1",
    length: 248956422,
    build: "hg38",
    timestamp: "2026-05-05T00:00:00Z",
    ...overrides,
  };
}

function makeRegionToGeneMappingResponse(
  overrides?: Partial<RegionToGeneMappingResponse>,
): RegionToGeneMappingResponse {
  return {
    requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567893",
    mappings: [
      {
        featureId: "peak-001",
        region: { chrom: "chr1", start: 1000, end: 2000 },
        geneIds: ["ENSG00000141510"],
        method: "direct_promoter_overlap",
        confidence: "high",
        downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
        annotationRelease: "Ensembl 110",
      },
    ],
    unmappedFeatureIds: [],
    ontologyRelease: "Ensembl 110",
    timestamp: "2026-05-05T00:00:00Z",
    ...overrides,
  };
}

function makePathwayMembershipResponse(overrides?: Partial<PathwayMembershipResponse>): PathwayMembershipResponse {
  return {
    requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567894",
    pathways: [
      {
        pathwayId: "hsa04115",
        pathwayName: "p53 signaling pathway",
        geneIds: ["ENSG00000141510"],
        source: "KEGG",
        confidence: "high",
      },
    ],
    unmappedGeneIds: [],
    ontologyRelease: "KEGG 2024",
    timestamp: "2026-05-05T00:00:00Z",
    ...overrides,
  };
}

function makeCellTypeNormalizationResponse(
  overrides?: Partial<CellTypeNormalizationResponse>,
): CellTypeNormalizationResponse {
  return {
    requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567895",
    normalizedCellTypes: [
      { inputLabel: "hepatocyte", canonicalName: "hepatocyte", cellOntologyId: "CL:0000182", confidence: "high" },
    ],
    unmappedLabels: [],
    ontologyRelease: "CL 2024-01-01",
    timestamp: "2026-05-05T00:00:00Z",
    ...overrides,
  };
}

function makeOntologyReleaseTraceResponse(
  overrides?: Partial<OntologyReleaseTraceResponse>,
): OntologyReleaseTraceResponse {
  return {
    requestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567896",
    ontologyName: "GO",
    releaseName: "GO 2024-03-28",
    releaseDate: "2024-03-28T00:00:00Z",
    sourceUrl: "https://release.geneontology.org/2024-03-28/",
    checksum: "sha256:abc123",
    timestamp: "2026-05-05T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Request construction
// ---------------------------------------------------------------------------

describe("AnnotationClient request construction", () => {
  it("validates gene normalization request schema", () => {
    const valid = { geneSymbols: ["TP53"], species: "Homo sapiens", build: "hg38" };
    expect(GeneNormalizationRequestSchema.parse(valid)).toEqual(valid);
  });

  it("rejects gene normalization request with empty symbols", () => {
    expect(() => GeneNormalizationRequestSchema.parse({ geneSymbols: [], species: "Homo sapiens" })).toThrow();
  });

  it("validates species validation request schema", () => {
    const valid = { species: "Homo sapiens" };
    expect(SpeciesValidationRequestSchema.parse(valid)).toEqual(valid);
  });

  it("validates chromosome validation request schema", () => {
    const valid = { chrom: "chr1", build: "hg38" };
    expect(ChromosomeValidationRequestSchema.parse(valid)).toEqual(valid);
  });

  it("rejects invalid chromosome format", () => {
    expect(() => ChromosomeValidationRequestSchema.parse({ chrom: "1q", build: "hg38" })).toThrow();
  });

  it("validates region-to-gene mapping request schema", () => {
    const valid = {
      regions: [{ featureId: "peak-001", chrom: "chr1", start: 1000, end: 2000 }],
      species: "Homo sapiens",
      build: "hg38" as const,
    };
    expect(RegionToGeneMappingRequestSchema.parse(valid)).toEqual(valid);
  });

  it("validates pathway membership request schema", () => {
    const valid = { geneIds: ["ENSG00000141510"], species: "Homo sapiens" };
    expect(PathwayMembershipRequestSchema.parse(valid)).toEqual(valid);
  });

  it("validates cell type normalization request schema", () => {
    const valid = { cellTypeLabels: ["hepatocyte"] };
    expect(CellTypeNormalizationRequestSchema.parse(valid)).toEqual(valid);
  });

  it("validates ontology release trace request schema", () => {
    const valid = { ontologyName: "GO", requestedRelease: "2024-03-28" };
    expect(OntologyReleaseTraceRequestSchema.parse(valid)).toEqual(valid);
  });
});

// ---------------------------------------------------------------------------
// Mock transport responses
// ---------------------------------------------------------------------------

describe("AnnotationClient with MockAnnotationTransport", () => {
  let transport: MockAnnotationTransport;
  let client: AnnotationClient;

  beforeEach(() => {
    transport = new MockAnnotationTransport();
    client = new AnnotationClient({ transport, timeoutMs: 5000 });
  });

  it("returns mocked gene normalization response", async () => {
    const expected = makeGeneNormalizationResponse();
    transport.setHandler("/v1/normalize-genes", async () => expected);

    const result = await client.normalizeGenes({ geneSymbols: ["TP53"], species: "Homo sapiens" });
    expect(result.normalizedGenes[0].canonicalSymbol).toBe("TP53");
    expect(result.requestId).toBe(expected.requestId);
  });

  it("returns mocked species validation response", async () => {
    const expected = makeSpeciesValidationResponse();
    transport.setHandler("/v1/validate-species", async () => expected);

    const result = await client.validateSpecies({ species: "Homo sapiens" });
    expect(result.valid).toBe(true);
    expect(result.canonicalName).toBe("Homo sapiens");
  });

  it("returns mocked chromosome validation response", async () => {
    const expected = makeChromosomeValidationResponse();
    transport.setHandler("/v1/validate-chromosome", async () => expected);

    const result = await client.validateChromosome({ chrom: "chr1", build: "hg38" });
    expect(result.valid).toBe(true);
    expect(result.length).toBe(248956422);
  });

  it("returns mocked region-to-gene mapping response", async () => {
    const expected = makeRegionToGeneMappingResponse();
    transport.setHandler("/v1/map-regions", async () => expected);

    const result = await client.mapRegionsToGenes({
      regions: [{ featureId: "peak-001", chrom: "chr1", start: 1000, end: 2000 }],
      species: "Homo sapiens",
      build: "hg38",
    });
    expect(result.mappings[0].method).toBe("direct_promoter_overlap");
    expect(result.mappings[0].downstreamUseRule).toBe("allow_contextual_gene_linkage_and_pathway_rollup");
  });

  it("returns mocked pathway membership response", async () => {
    const expected = makePathwayMembershipResponse();
    transport.setHandler("/v1/pathways", async () => expected);

    const result = await client.queryPathwayMembership({ geneIds: ["ENSG00000141510"], species: "Homo sapiens" });
    expect(result.pathways[0].pathwayId).toBe("hsa04115");
  });

  it("returns mocked cell type normalization response", async () => {
    const expected = makeCellTypeNormalizationResponse();
    transport.setHandler("/v1/normalize-cell-types", async () => expected);

    const result = await client.normalizeCellTypes({ cellTypeLabels: ["hepatocyte"] });
    expect(result.normalizedCellTypes[0].cellOntologyId).toBe("CL:0000182");
  });

  it("returns mocked ontology release trace response", async () => {
    const expected = makeOntologyReleaseTraceResponse();
    transport.setHandler("/v1/ontology-release", async () => expected);

    const result = await client.traceOntologyRelease({ ontologyName: "GO" });
    expect(result.releaseName).toBe("GO 2024-03-28");
    expect(result.checksum).toBe("sha256:abc123");
  });

  it("validates response schema and throws on malformed data", async () => {
    transport.setHandler("/v1/normalize-genes", async () => ({
      requestId: "not-a-uuid",
      normalizedGenes: [],
      timestamp: "not-a-datetime",
    }));

    await expect(client.normalizeGenes({ geneSymbols: ["TP53"], species: "Homo sapiens" })).rejects.toThrow(
      AnnotationClientError,
    );
  });
});

// ---------------------------------------------------------------------------
// Timeout / error handling
// ---------------------------------------------------------------------------

describe("AnnotationClient timeout and error handling", () => {
  it("throws AnnotationClientError on mock handler failure", async () => {
    const transport = new MockAnnotationTransport();
    transport.setHandler("/v1/normalize-genes", async () => {
      throw new Error("mock handler error");
    });
    const client = new AnnotationClient({ transport, timeoutMs: 5000 });

    await expect(client.normalizeGenes({ geneSymbols: ["TP53"], species: "Homo sapiens" })).rejects.toThrow(
      AnnotationClientError,
    );
  });

  it("throws AnnotationClientError when no handler is registered", async () => {
    const transport = new MockAnnotationTransport();
    const client = new AnnotationClient({ transport, timeoutMs: 5000 });

    await expect(client.normalizeGenes({ geneSymbols: ["TP53"], species: "Homo sapiens" })).rejects.toThrow(
      AnnotationClientError,
    );
  });

  it("propagates abort signal via FetchAnnotationTransport", async () => {
    const transport = new FetchAnnotationTransport("http://localhost:9999");
    const client = new AnnotationClient({ transport, timeoutMs: 50 });

    // The fetch will fail because nothing is listening, but we want to verify
    // that timeout logic is wired.  We catch the expected network error.
    await expect(
      client.normalizeGenes({ geneSymbols: ["TP53"], species: "Homo sapiens" }),
    ).rejects.toThrow(AnnotationClientError);
  });

  it("throws SCHEMA_VALIDATION_ERROR when response does not match schema", async () => {
    const transport = new MockAnnotationTransport();
    transport.setHandler("/v1/validate-species", async () => ({
      valid: "yes",
      timestamp: "2026-05-05T00:00:00Z",
    }));
    const client = new AnnotationClient({ transport, timeoutMs: 5000 });

    try {
      await client.validateSpecies({ species: "Homo sapiens" });
      expect.fail("Expected error to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AnnotationClientError);
      expect((err as AnnotationClientError).code).toBe("SCHEMA_VALIDATION_ERROR");
    }
  });
});

// ---------------------------------------------------------------------------
// Fallback behaviour
// ---------------------------------------------------------------------------

describe("AnnotationClient fallback behaviour", () => {
  it("falls back to secondary transport when primary fails", async () => {
    const primary = new MockAnnotationTransport();
    const fallback = new MockAnnotationTransport();

    primary.setHandler("/v1/normalize-genes", async () => {
      throw new Error("primary down");
    });
    fallback.setHandler("/v1/normalize-genes", async () => makeGeneNormalizationResponse());

    const client = new AnnotationClient({ transport: primary, fallbackTransport: fallback, timeoutMs: 5000 });

    const result = await client.normalizeGenes({ geneSymbols: ["TP53"], species: "Homo sapiens" });
    expect(result.normalizedGenes[0].canonicalSymbol).toBe("TP53");
  });

  it("throws when both primary and fallback fail", async () => {
    const primary = new MockAnnotationTransport();
    const fallback = new MockAnnotationTransport();

    primary.setHandler("/v1/normalize-genes", async () => {
      throw new Error("primary down");
    });
    fallback.setHandler("/v1/normalize-genes", async () => {
      throw new Error("fallback down");
    });

    const client = new AnnotationClient({ transport: primary, fallbackTransport: fallback, timeoutMs: 5000 });

    await expect(client.normalizeGenes({ geneSymbols: ["TP53"], species: "Homo sapiens" })).rejects.toThrow(
      AnnotationClientError,
    );
  });

  it("resolves from frozen snapshot transport", async () => {
    const request = { geneSymbols: ["TP53"], species: "Homo sapiens" };
    const response = makeGeneNormalizationResponse();
    const snapshot = {
      geneNormalization: {
        [JSON.stringify(request)]: response,
      },
    };
    const transport = new FrozenSnapshotTransport(snapshot);
    const client = new AnnotationClient({ transport, timeoutMs: 5000 });

    const result = await client.normalizeGenes(request);
    expect(result.normalizedGenes[0].geneId).toBe("ENSG00000141510");
  });

  it("throws SNAPSHOT_MISS when frozen snapshot lacks the key", async () => {
    const transport = new FrozenSnapshotTransport({});
    const client = new AnnotationClient({ transport, timeoutMs: 5000 });

    try {
      await client.normalizeGenes({ geneSymbols: ["TP53"], species: "Homo sapiens" });
      expect.fail("Expected error to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AnnotationClientError);
      expect((err as AnnotationClientError).code).toBe("SNAPSHOT_MISS");
    }
  });
});

// ---------------------------------------------------------------------------
// Response schema validation
// ---------------------------------------------------------------------------

describe("AnnotationClient response schema validation", () => {
  it("accepts valid gene normalization response", () => {
    const response = makeGeneNormalizationResponse();
    expect(GeneNormalizationResponseSchema.parse(response).normalizedGenes).toHaveLength(1);
  });

  it("rejects gene normalization response with invalid confidence", () => {
    const response = makeGeneNormalizationResponse({
      normalizedGenes: [
        { inputSymbol: "TP53", canonicalSymbol: "TP53", geneId: "ENSG00000141510", confidence: "very-high" as "high" },
      ],
    });
    expect(() => GeneNormalizationResponseSchema.parse(response)).toThrow();
  });

  it("accepts valid region-to-gene mapping response", () => {
    const response = makeRegionToGeneMappingResponse();
    expect(RegionToGeneMappingResponseSchema.parse(response).mappings[0].method).toBe("direct_promoter_overlap");
  });

  it("rejects region-to-gene mapping with invalid downstream use rule", () => {
    const response = makeRegionToGeneMappingResponse({
      mappings: [
        {
          featureId: "peak-001",
          region: { chrom: "chr1", start: 1000, end: 2000 },
          geneIds: ["ENSG00000141510"],
          method: "nearest_gene",
          confidence: "low",
          downstreamUseRule: "allow_everything" as "block_pathway_rollup",
        },
      ],
    });
    expect(() => RegionToGeneMappingResponseSchema.parse(response)).toThrow();
  });

  it("accepts valid pathway membership response", () => {
    const response = makePathwayMembershipResponse();
    expect(PathwayMembershipResponseSchema.parse(response).pathways[0].source).toBe("KEGG");
  });

  it("accepts valid ontology release trace response", () => {
    const response = makeOntologyReleaseTraceResponse();
    expect(OntologyReleaseTraceResponseSchema.parse(response).checksum).toBe("sha256:abc123");
  });
});

// ---------------------------------------------------------------------------
// Legacy placeholder compatibility
// ---------------------------------------------------------------------------

describe("Legacy requestAnnotation placeholder", () => {
  it("returns a safe empty trace", async () => {
    const { requestAnnotation } = await import("../../src/integrations/annotation_client.js");
    const trace = await requestAnnotation({
      featureId: "feat-001",
      identifiers: ["TP53"],
      species: "Homo sapiens",
      build: "hg38",
    });
    expect(trace.resolvedGeneIds).toEqual([]);
    expect(trace.confidence).toBe("none");
    expect(trace.method).toBe("placeholder");
    expect(trace.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
