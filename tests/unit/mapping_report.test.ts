import { describe, it, expect } from "vitest";
import {
  MappingRequestSchema,
  MappingReportEntrySchema,
  MappingCountSummarySchema,
  BlockedRollupSummarySchema,
  ConfidenceDistributionSchema,
  MappingSummaryReportSchema,
  buildMappingSummaryReport,
  type MappingRequest,
  type RegionToGeneMapping,
  type EpigenomicAnnotationTrace,
} from "../../src/reports/mapping_report.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides?: Partial<MappingRequest>): MappingRequest {
  return MappingRequestSchema.parse({
    featureId: "feat_default",
    chrom: "chr1",
    start: 1000,
    end: 2000,
    ...overrides,
  });
}

function makeMapping(
  overrides?: Partial<RegionToGeneMapping>,
): RegionToGeneMapping {
  return {
    featureId: overrides?.featureId ?? "feat_default",
    geneIds: overrides?.geneIds ?? ["ENSG000001"],
    method: overrides?.method ?? "direct_promoter_overlap",
    confidence: overrides?.confidence ?? "high",
    pathwayRollupAllowed:
      overrides?.pathwayRollupAllowed ??
      (overrides?.method
        ? [
            "direct_promoter_overlap",
            "gene_body_overlap",
            "enhancer_target_from_database",
            "chromatin_interaction_supported",
          ].includes(overrides.method)
        : true),
    ...(overrides?.distanceBp !== undefined
      ? { distanceBp: overrides.distanceBp }
      : {}),
    ...(overrides?.downstreamUseRule
      ? { downstreamUseRule: overrides.downstreamUseRule }
      : {}),
    ...(overrides?.annotationTrace
      ? { annotationTrace: overrides.annotationTrace }
      : {}),
  } as RegionToGeneMapping;
}

function makeTrace(
  traceId: string,
  overrides?: Partial<EpigenomicAnnotationTrace>,
): EpigenomicAnnotationTrace {
  return {
    traceId,
    sourceResource: overrides?.sourceResource ?? "frozen_gene_model_snapshot",
    sourceVersion: overrides?.sourceVersion ?? "GENCODE_v46",
    genomeBuild: overrides?.genomeBuild ?? "GRCh38",
    ...(overrides?.releaseDate
      ? { releaseDate: overrides.releaseDate }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("MappingRequestSchema", () => {
  it("accepts a valid request", () => {
    const req = MappingRequestSchema.parse({
      featureId: "feat_001",
      chrom: "chr1",
      start: 1000,
      end: 2000,
    });
    expect(req.featureId).toBe("feat_001");
    expect(req.chrom).toBe("chr1");
    expect(req.start).toBe(1000);
    expect(req.end).toBe(2000);
  });

  it("rejects end <= start", () => {
    expect(() =>
      MappingRequestSchema.parse({
        featureId: "feat_001",
        chrom: "chr1",
        start: 2000,
        end: 2000,
      }),
    ).toThrow(/end must be greater than start/);
  });

  it("rejects negative start", () => {
    expect(() =>
      MappingRequestSchema.parse({
        featureId: "feat_001",
        chrom: "chr1",
        start: -1,
        end: 2000,
      }),
    ).toThrow();
  });

  it("rejects extra fields", () => {
    expect(() =>
      MappingRequestSchema.parse({
        featureId: "feat_001",
        chrom: "chr1",
        start: 1000,
        end: 2000,
        extra: "field",
      }),
    ).toThrow();
  });
});

describe("MappingReportEntrySchema", () => {
  it("accepts a valid entry", () => {
    const entry = MappingReportEntrySchema.parse({
      request: makeRequest(),
      response: makeMapping(),
      warnings: [],
    });
    expect(entry.request.featureId).toBe("feat_default");
    expect(entry.response.confidence).toBe("high");
  });

  it("accepts an entry with blockedRollUpReason", () => {
    const entry = MappingReportEntrySchema.parse({
      request: makeRequest(),
      response: makeMapping({ method: "nearest_gene", pathwayRollupAllowed: false }),
      blockedRollUpReason: "Pathway roll-up blocked because mapping method 'nearest_gene' is not in the allowed roll-up type list.",
      warnings: [],
    });
    expect(entry.blockedRollUpReason).toContain("blocked");
  });

  it("rejects extra fields", () => {
    expect(() =>
      MappingReportEntrySchema.parse({
        request: makeRequest(),
        response: makeMapping(),
        warnings: [],
        extra: "field",
      }),
    ).toThrow();
  });
});

describe("MappingCountSummarySchema", () => {
  it("accepts a valid summary", () => {
    const summary = MappingCountSummarySchema.parse({
      totalFeatures: 10,
      mappedFeatures: 8,
      unmappedFeatures: 2,
      pathwayRollupAllowed: 6,
      pathwayRollupBlocked: 4,
      ambiguousMappings: 1,
      byMethod: {
        direct_promoter_overlap: 5,
        gene_body_overlap: 0,
        enhancer_target_from_database: 0,
        chromatin_interaction_supported: 0,
        nearest_gene: 3,
        inferred_target_gene: 0,
        unknown_target_gene: 2,
      },
      byConfidence: { high: 5, medium: 0, low: 3, none: 2 },
    });
    expect(summary.totalFeatures).toBe(10);
    expect(summary.byMethod.direct_promoter_overlap).toBe(5);
  });

  it("rejects negative counts", () => {
    expect(() =>
      MappingCountSummarySchema.parse({
        totalFeatures: -1,
        mappedFeatures: 0,
        unmappedFeatures: 0,
        pathwayRollupAllowed: 0,
        pathwayRollupBlocked: 0,
        ambiguousMappings: 0,
        byMethod: {},
        byConfidence: { high: 0, medium: 0, low: 0, none: 0 },
      }),
    ).toThrow();
  });
});

describe("BlockedRollupSummarySchema", () => {
  it("accepts a valid summary", () => {
    const summary = BlockedRollupSummarySchema.parse({
      count: 2,
      reasons: ["Method not allowed"],
      affectedFeatureIds: ["feat_001", "feat_002"],
    });
    expect(summary.count).toBe(2);
    expect(summary.affectedFeatureIds).toHaveLength(2);
  });
});

describe("ConfidenceDistributionSchema", () => {
  it("accepts a valid distribution", () => {
    const dist = ConfidenceDistributionSchema.parse({
      high: 5,
      medium: 2,
      low: 1,
      none: 0,
    });
    expect(dist.high).toBe(5);
    expect(dist.none).toBe(0);
  });
});

describe("MappingSummaryReportSchema", () => {
  it("accepts a valid report", () => {
    const report = MappingSummaryReportSchema.parse({
      schemaName: "EpigenomicsMappingReport",
      schemaVersion: "0.1.0",
      reportId: "550e8400-e29b-41d4-a716-446655440000",
      datasetId: "ds-001",
      generatedAt: "2026-05-05T00:00:00.000Z",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      entries: [
        {
          request: makeRequest(),
          response: makeMapping(),
          warnings: [],
        },
      ],
      counts: {
        totalFeatures: 1,
        mappedFeatures: 1,
        unmappedFeatures: 0,
        pathwayRollupAllowed: 1,
        pathwayRollupBlocked: 0,
        ambiguousMappings: 0,
        byMethod: {
          direct_promoter_overlap: 1,
          gene_body_overlap: 0,
          enhancer_target_from_database: 0,
          chromatin_interaction_supported: 0,
          nearest_gene: 0,
          inferred_target_gene: 0,
          unknown_target_gene: 0,
        },
        byConfidence: { high: 1, medium: 0, low: 0, none: 0 },
      },
      blockedRollups: {
        count: 0,
        reasons: [],
        affectedFeatureIds: [],
      },
      warnings: [],
      confidenceDistribution: { high: 1, medium: 0, low: 0, none: 0 },
    });
    expect(report.schemaName).toBe("EpigenomicsMappingReport");
    expect(report.entries).toHaveLength(1);
  });

  it("rejects invalid schemaName", () => {
    expect(() =>
      MappingSummaryReportSchema.parse({
        schemaName: "InvalidReport",
        schemaVersion: "0.1.0",
        reportId: "550e8400-e29b-41d4-a716-446655440000",
        datasetId: "ds-001",
        generatedAt: "2026-05-05T00:00:00.000Z",
        annotationRelease: "GENCODE_v46",
        genomeBuild: "GRCh38",
        entries: [],
        counts: {
          totalFeatures: 0,
          mappedFeatures: 0,
          unmappedFeatures: 0,
          pathwayRollupAllowed: 0,
          pathwayRollupBlocked: 0,
          ambiguousMappings: 0,
          byMethod: {
            direct_promoter_overlap: 0,
            gene_body_overlap: 0,
            enhancer_target_from_database: 0,
            chromatin_interaction_supported: 0,
            nearest_gene: 0,
            inferred_target_gene: 0,
            unknown_target_gene: 0,
          },
          byConfidence: { high: 0, medium: 0, low: 0, none: 0 },
        },
        blockedRollups: {
          count: 0,
          reasons: [],
          affectedFeatureIds: [],
        },
        warnings: [],
        confidenceDistribution: { high: 0, medium: 0, low: 0, none: 0 },
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Report builder – fixture suites
// ---------------------------------------------------------------------------

describe("buildMappingSummaryReport – promoter fixture", () => {
  const requests: MappingRequest[] = [
    makeRequest({ featureId: "promoter_001", chrom: "chr13", start: 32_299_000, end: 32_299_500 }),
    makeRequest({ featureId: "promoter_002", chrom: "chr17", start: 7_680_500, end: 7_681_000 }),
  ];

  const responses: RegionToGeneMapping[] = [
    makeMapping({
      featureId: "promoter_001",
      geneIds: ["ENSG00000139618"],
      method: "direct_promoter_overlap",
      confidence: "high",
      pathwayRollupAllowed: true,
      annotationTrace: makeTrace("promoter_001_promoter_GENCODE_v46"),
    }),
    makeMapping({
      featureId: "promoter_002",
      geneIds: ["ENSG00000141510"],
      method: "direct_promoter_overlap",
      confidence: "high",
      pathwayRollupAllowed: true,
      annotationTrace: makeTrace("promoter_002_promoter_GENCODE_v46"),
    }),
  ];

  const traces: EpigenomicAnnotationTrace[] = [
    makeTrace("promoter_001_promoter_GENCODE_v46"),
    makeTrace("promoter_002_promoter_GENCODE_v46"),
  ];

  it("produces a stable report", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-promoter",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440001",
    });

    expect(report.schemaName).toBe("EpigenomicsMappingReport");
    expect(report.datasetId).toBe("ds-promoter");
    expect(report.entries).toHaveLength(2);
    expect(report.counts.mappedFeatures).toBe(2);
    expect(report.counts.pathwayRollupAllowed).toBe(2);
    expect(report.counts.pathwayRollupBlocked).toBe(0);
    expect(report.counts.byMethod.direct_promoter_overlap).toBe(2);
    expect(report.confidenceDistribution.high).toBe(2);
    expect(report.blockedRollups.count).toBe(0);
  });

  it("matches snapshot", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-promoter",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(report).toMatchSnapshot();
  });
});

describe("buildMappingSummaryReport – nearest-gene-only fixture", () => {
  const requests: MappingRequest[] = [
    makeRequest({ featureId: "nearest_001", chrom: "chr13", start: 32_305_000, end: 32_305_100 }),
    makeRequest({ featureId: "nearest_002", chrom: "chr17", start: 7_685_000, end: 7_685_100 }),
  ];

  const responses: RegionToGeneMapping[] = [
    makeMapping({
      featureId: "nearest_001",
      geneIds: ["ENSG00000139618"],
      method: "nearest_gene",
      confidence: "low",
      pathwayRollupAllowed: false,
      downstreamUseRule: "exploratory_only",
      distanceBp: 5000,
      annotationTrace: makeTrace("nearest_001_nearest_gene_GENCODE_v46"),
    }),
    makeMapping({
      featureId: "nearest_002",
      geneIds: ["ENSG00000141510"],
      method: "nearest_gene",
      confidence: "low",
      pathwayRollupAllowed: false,
      downstreamUseRule: "exploratory_only",
      distanceBp: 5000,
      annotationTrace: makeTrace("nearest_002_nearest_gene_GENCODE_v46"),
    }),
  ];

  const traces: EpigenomicAnnotationTrace[] = [
    makeTrace("nearest_001_nearest_gene_GENCODE_v46"),
    makeTrace("nearest_002_nearest_gene_GENCODE_v46"),
  ];

  it("marks all as pathway roll-up blocked", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-nearest",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440002",
    });

    expect(report.counts.pathwayRollupBlocked).toBe(2);
    expect(report.counts.pathwayRollupAllowed).toBe(0);
    expect(report.blockedRollups.count).toBe(2);
    expect(report.blockedRollups.reasons.length).toBeGreaterThan(0);
    expect(report.blockedRollups.affectedFeatureIds).toContain("nearest_001");
    expect(report.confidenceDistribution.low).toBe(2);
  });

  it("emits nearest-gene warnings", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-nearest",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440002",
    });

    const warningCodes = report.warnings.map((w) => w.warningCode);
    expect(warningCodes).toContain("MAPPING_NEAREST_GENE_ONLY");
    expect(report.warnings.some((w) => w.featureIds?.includes("nearest_001"))).toBe(true);
  });

  it("matches snapshot", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-nearest",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440002",
    });
    expect(report).toMatchSnapshot();
  });
});

describe("buildMappingSummaryReport – ambiguous fixture", () => {
  const requests: MappingRequest[] = [
    makeRequest({ featureId: "ambig_001", chrom: "chr1", start: 9_500, end: 10_500 }),
  ];

  const responses: RegionToGeneMapping[] = [
    makeMapping({
      featureId: "ambig_001",
      geneIds: ["GENE_A", "GENE_B"],
      method: "direct_promoter_overlap",
      confidence: "high",
      pathwayRollupAllowed: true,
      annotationTrace: makeTrace("ambig_001_promoter_GENCODE_v46"),
    }),
  ];

  const traces: EpigenomicAnnotationTrace[] = [
    makeTrace("ambig_001_promoter_GENCODE_v46"),
  ];

  it("counts ambiguous mappings", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-ambiguous",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440003",
    });

    expect(report.counts.ambiguousMappings).toBe(1);
    expect(report.counts.mappedFeatures).toBe(1);
  });

  it("emits ambiguous-mapping warning", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-ambiguous",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440003",
    });

    const warningCodes = report.warnings.map((w) => w.warningCode);
    expect(warningCodes).toContain("MAPPING_AMBIGUOUS");
    const ambigWarning = report.warnings.find(
      (w) => w.warningCode === "MAPPING_AMBIGUOUS",
    );
    expect(ambigWarning?.message).toContain("GENE_A");
    expect(ambigWarning?.message).toContain("GENE_B");
  });

  it("matches snapshot", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-ambiguous",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440003",
    });
    expect(report).toMatchSnapshot();
  });
});

describe("buildMappingSummaryReport – no-target fixture", () => {
  const requests: MappingRequest[] = [
    makeRequest({ featureId: "notarget_001", chrom: "chr99", start: 1_000_000, end: 1_000_100 }),
    makeRequest({ featureId: "notarget_002", chrom: "chr1", start: 1_000_000, end: 1_000_100 }),
  ];

  const responses: RegionToGeneMapping[] = [
    makeMapping({
      featureId: "notarget_001",
      geneIds: [],
      method: "unknown_target_gene",
      confidence: "none",
      pathwayRollupAllowed: false,
      annotationTrace: makeTrace("notarget_001_unknown_GENCODE_v46"),
    }),
    makeMapping({
      featureId: "notarget_002",
      geneIds: [],
      method: "nearest_gene",
      confidence: "none",
      pathwayRollupAllowed: false,
      annotationTrace: makeTrace("notarget_002_nearest_gene_GENCODE_v46"),
    }),
  ];

  const traces: EpigenomicAnnotationTrace[] = [
    makeTrace("notarget_001_unknown_GENCODE_v46"),
    makeTrace("notarget_002_nearest_gene_GENCODE_v46"),
  ];

  it("counts unmapped features", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-notarget",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440004",
    });

    expect(report.counts.unmappedFeatures).toBe(2);
    expect(report.counts.mappedFeatures).toBe(0);
    expect(report.confidenceDistribution.none).toBe(2);
  });

  it("emits no-target warnings", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-notarget",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440004",
    });

    const warningCodes = report.warnings.map((w) => w.warningCode);
    expect(warningCodes).toContain("MAPPING_NO_TARGET");
    expect(
      report.warnings.some((w) => w.featureIds?.includes("notarget_001")),
    ).toBe(true);
    expect(
      report.warnings.some((w) => w.featureIds?.includes("notarget_002")),
    ).toBe(true);
  });

  it("matches snapshot", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-notarget",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440004",
    });
    expect(report).toMatchSnapshot();
  });
});

describe("buildMappingSummaryReport – mixed fixture", () => {
  const requests: MappingRequest[] = [
    makeRequest({ featureId: "mix_001", chrom: "chr13", start: 32_299_000, end: 32_299_500 }),
    makeRequest({ featureId: "mix_002", chrom: "chr13", start: 32_305_000, end: 32_305_100 }),
    makeRequest({ featureId: "mix_003", chrom: "chr1", start: 9_500, end: 10_500 }),
    makeRequest({ featureId: "mix_004", chrom: "chr99", start: 1_000_000, end: 1_000_100 }),
  ];

  const responses: RegionToGeneMapping[] = [
    makeMapping({
      featureId: "mix_001",
      geneIds: ["ENSG00000139618"],
      method: "direct_promoter_overlap",
      confidence: "high",
      pathwayRollupAllowed: true,
      annotationTrace: makeTrace("mix_001_promoter_GENCODE_v46"),
    }),
    makeMapping({
      featureId: "mix_002",
      geneIds: ["ENSG00000139618"],
      method: "nearest_gene",
      confidence: "low",
      pathwayRollupAllowed: false,
      downstreamUseRule: "exploratory_only",
      distanceBp: 5000,
      annotationTrace: makeTrace("mix_002_nearest_gene_GENCODE_v46"),
    }),
    makeMapping({
      featureId: "mix_003",
      geneIds: ["GENE_A", "GENE_B"],
      method: "direct_promoter_overlap",
      confidence: "high",
      pathwayRollupAllowed: true,
      annotationTrace: makeTrace("mix_003_promoter_GENCODE_v46"),
    }),
    makeMapping({
      featureId: "mix_004",
      geneIds: [],
      method: "unknown_target_gene",
      confidence: "none",
      pathwayRollupAllowed: false,
      annotationTrace: makeTrace("mix_004_unknown_GENCODE_v46"),
    }),
  ];

  const traces: EpigenomicAnnotationTrace[] = [
    makeTrace("mix_001_promoter_GENCODE_v46"),
    makeTrace("mix_002_nearest_gene_GENCODE_v46"),
    makeTrace("mix_003_promoter_GENCODE_v46"),
    makeTrace("mix_004_unknown_GENCODE_v46"),
  ];

  it("computes correct aggregate counts", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-mixed",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440005",
    });

    expect(report.counts.totalFeatures).toBe(4);
    expect(report.counts.mappedFeatures).toBe(3);
    expect(report.counts.unmappedFeatures).toBe(1);
    expect(report.counts.pathwayRollupAllowed).toBe(2);
    expect(report.counts.pathwayRollupBlocked).toBe(2);
    expect(report.counts.ambiguousMappings).toBe(1);
    expect(report.counts.byMethod.direct_promoter_overlap).toBe(2);
    expect(report.counts.byMethod.nearest_gene).toBe(1);
    expect(report.counts.byMethod.unknown_target_gene).toBe(1);
    expect(report.confidenceDistribution.high).toBe(2);
    expect(report.confidenceDistribution.low).toBe(1);
    expect(report.confidenceDistribution.none).toBe(1);
  });

  it("propagates all warning types", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-mixed",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440005",
    });

    const codes = report.warnings.map((w) => w.warningCode);
    expect(codes).toContain("MAPPING_NEAREST_GENE_ONLY");
    expect(codes).toContain("MAPPING_AMBIGUOUS");
    expect(codes).toContain("MAPPING_NO_TARGET");
  });

  it("matches snapshot", () => {
    const report = buildMappingSummaryReport(requests, responses, traces, {
      datasetId: "ds-mixed",
      annotationRelease: "GENCODE_v46",
      genomeBuild: "GRCh38",
      generatedAt: "2026-05-05T00:00:00.000Z",
      reportId: "550e8400-e29b-41d4-a716-446655440005",
    });
    expect(report).toMatchSnapshot();
  });
});

describe("buildMappingSummaryReport – error handling", () => {
  it("throws when a request has no matching response", () => {
    const requests: MappingRequest[] = [
      makeRequest({ featureId: "orphan_001" }),
    ];
    const responses: RegionToGeneMapping[] = [
      makeMapping({ featureId: "other_001" }),
    ];

    expect(() =>
      buildMappingSummaryReport(requests, responses, [], {
        datasetId: "ds-error",
        annotationRelease: "GENCODE_v46",
        genomeBuild: "GRCh38",
      }),
    ).toThrow(/Missing mapping response for feature orphan_001/);
  });
});
