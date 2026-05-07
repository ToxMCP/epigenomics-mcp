import { z } from "zod";
import {
  RegionToGeneMappingSchema,
  type RegionToGeneMapping,
  MappingTypeSchema,
  type MappingType,
  MappingConfidenceSchema,
  type MappingConfidence,
  PATHWAY_ROLLUP_ALLOWED_MAPPING_TYPES,
} from "../contracts/mapping.js";
import {
  EpigenomicAnnotationTraceSchema,
  type EpigenomicAnnotationTrace,
} from "../contracts/provenance.js";
import {
  QualificationWarningSchema,
  type QualificationWarning,
} from "../contracts/qualification.js";
import { GenomeBuildSchema } from "../contracts/coordinates.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * A single mapping request (input region).
 */
export const MappingRequestSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    chrom: z.string().min(1).describe("Chromosome identifier"),
    start: z.number().int().nonnegative().describe("0-based start coordinate"),
    end: z.number().int().nonnegative().describe("0-based exclusive end coordinate"),
  })
  .strict()
  .refine((r) => r.end > r.start, {
    message: "end must be greater than start",
    path: ["end"],
  });

export type MappingRequest = z.infer<typeof MappingRequestSchema>;

/**
 * Per-feature mapping report entry.
 *
 * Captures the request, response, annotation trace, and any warnings
 * or blocked-roll-up reasons for a single feature.
 */
export const MappingReportEntrySchema = z
  .object({
    request: MappingRequestSchema.describe("Input region request"),
    response: RegionToGeneMappingSchema.describe("Mapping result"),
    annotationTrace: EpigenomicAnnotationTraceSchema.optional().describe(
      "Annotation trace for this mapping",
    ),
    blockedRollUpReason: z
      .string()
      .optional()
      .describe("Reason pathway roll-up was blocked, if applicable"),
    warnings: z
      .array(QualificationWarningSchema)
      .default([])
      .describe("Warnings generated for this feature mapping"),
  })
  .strict();

export type MappingReportEntry = z.infer<typeof MappingReportEntrySchema>;

/**
 * Mapping count summary.
 */
export const MappingCountSummarySchema = z
  .object({
    totalFeatures: z.number().int().nonnegative().describe("Total features processed"),
    mappedFeatures: z
      .number()
      .int()
      .nonnegative()
      .describe("Features with at least one gene mapping"),
    unmappedFeatures: z
      .number()
      .int()
      .nonnegative()
      .describe("Features with zero gene mappings"),
    pathwayRollupAllowed: z
      .number()
      .int()
      .nonnegative()
      .describe("Features where pathway roll-up is permitted"),
    pathwayRollupBlocked: z
      .number()
      .int()
      .nonnegative()
      .describe("Features where pathway roll-up is blocked"),
    ambiguousMappings: z
      .number()
      .int()
      .nonnegative()
      .describe("Features mapped to more than one gene"),
    byMethod: z
      .record(MappingTypeSchema, z.number().int().nonnegative())
      .describe("Count of features per mapping method"),
    byConfidence: z
      .record(MappingConfidenceSchema, z.number().int().nonnegative())
      .describe("Count of features per confidence level"),
  })
  .strict();

export type MappingCountSummary = z.infer<typeof MappingCountSummarySchema>;

/**
 * Blocked roll-up summary.
 */
export const BlockedRollupSummarySchema = z
  .object({
    count: z.number().int().nonnegative().describe("Number of blocked roll-ups"),
    reasons: z.array(z.string().min(1)).describe("Unique blocking reasons"),
    affectedFeatureIds: z
      .array(z.string().min(1))
      .describe("Feature IDs with blocked roll-up"),
  })
  .strict();

export type BlockedRollupSummary = z.infer<typeof BlockedRollupSummarySchema>;

/**
 * Confidence distribution.
 */
export const ConfidenceDistributionSchema = z
  .object({
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
    none: z.number().int().nonnegative(),
  })
  .strict();

export type ConfidenceDistribution = z.infer<typeof ConfidenceDistributionSchema>;

/**
 * Epigenomics mapping summary report.
 *
 * An auditable, schema-validated report that captures every mapping
 * request, response, annotation trace, warning, and aggregate count.
 */
export const MappingSummaryReportSchema = z
  .object({
    schemaName: z.literal("EpigenomicsMappingReport").describe("Normative schema name"),
    schemaVersion: z.string().min(1).describe("Semver-compatible schema version"),
    reportId: z.string().uuid().describe("Globally unique report identifier"),
    datasetId: z.string().min(1).describe("Dataset identifier"),
    generatedAt: z.string().datetime().describe("ISO-8601 generation timestamp"),
    annotationRelease: z.string().min(1).describe("Annotation release used for mapping"),
    genomeBuild: GenomeBuildSchema.describe("Genome build for the annotation"),
    entries: z
      .array(MappingReportEntrySchema)
      .describe("Per-feature mapping entries"),
    counts: MappingCountSummarySchema.describe("Aggregate mapping counts"),
    blockedRollups: BlockedRollupSummarySchema.describe("Blocked roll-up summary"),
    warnings: z
      .array(QualificationWarningSchema)
      .default([])
      .describe("Dataset-level mapping warnings"),
    confidenceDistribution: ConfidenceDistributionSchema.describe(
      "Confidence-level distribution across all features",
    ),
  })
  .strict();

export type MappingSummaryReport = z.infer<typeof MappingSummaryReportSchema>;

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

export interface BuildMappingReportOptions {
  datasetId: string;
  annotationRelease: string;
  genomeBuild: string;
  generatedAt?: string;
  reportId?: string;
}

/**
 * Build a per-feature warning list based on mapping characteristics.
 *
 * Fail-closed: ambiguous mappings and no-target mappings generate warnings.
 */
function buildEntryWarnings(
  request: MappingRequest,
  response: RegionToGeneMapping,
): QualificationWarning[] {
  const warnings: QualificationWarning[] = [];

  if (response.geneIds.length === 0) {
    warnings.push({
      warningCode: "MAPPING_NO_TARGET",
      severity: "warning",
      message: `Feature ${request.featureId} (${request.chrom}:${request.start}-${request.end}) could not be mapped to any gene target.`,
      category: "mapping_proximity",
      featureIds: [request.featureId],
      blocksDownstream: false,
    });
  } else if (response.geneIds.length > 1) {
    warnings.push({
      warningCode: "MAPPING_AMBIGUOUS",
      severity: "warning",
      message: `Feature ${request.featureId} maps to ${response.geneIds.length} genes (${response.geneIds.join(", ")}); causal target assignment is ambiguous.`,
      category: "mapping_proximity",
      featureIds: [request.featureId],
      blocksDownstream: false,
    });
  }

  if (response.method === "nearest_gene" && response.geneIds.length > 0) {
    warnings.push({
      warningCode: "MAPPING_NEAREST_GENE_ONLY",
      severity: "warning",
      message: `Feature ${request.featureId} is linked via nearest-gene only (distance ${response.distanceBp ?? "unknown"} bp); this is low-confidence contextual linkage and pathway roll-up is suppressed.`,
      category: "mapping_proximity",
      featureIds: [request.featureId],
      blocksDownstream: false,
    });
  }

  return warnings;
}

/**
 * Determine whether pathway roll-up is blocked for a mapping and, if so,
 * return a human-readable reason.
 */
function deriveBlockedRollUpReason(
  response: RegionToGeneMapping,
): string | undefined {
  if (response.pathwayRollupAllowed) return undefined;

  if (!PATHWAY_ROLLUP_ALLOWED_MAPPING_TYPES.includes(response.method)) {
    return `Pathway roll-up blocked because mapping method '${response.method}' is not in the allowed roll-up type list.`;
  }

  return "Pathway roll-up blocked by explicit policy.";
}

/**
 * Build a confidence distribution from a list of mapping entries.
 */
function buildConfidenceDistribution(
  entries: MappingReportEntry[],
): ConfidenceDistribution {
  const dist: ConfidenceDistribution = { high: 0, medium: 0, low: 0, none: 0 };
  for (const entry of entries) {
    dist[entry.response.confidence]++;
  }
  return dist;
}

/**
 * Build a mapping summary report from requests and responses.
 *
 * This is the primary entry point for producing auditable mapping and
 * annotation outputs.  Every request is paired with its response, and
 * aggregate counts, blocked roll-ups, warnings, and confidence
 * distributions are computed deterministically.
 */
export function buildMappingSummaryReport(
  requests: MappingRequest[],
  responses: RegionToGeneMapping[],
  annotationTraces: EpigenomicAnnotationTrace[],
  options: BuildMappingReportOptions,
): MappingSummaryReport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const reportId = options.reportId ?? crypto.randomUUID();

  // Build lookup maps
  const responseMap = new Map<string, RegionToGeneMapping>();
  for (const r of responses) {
    responseMap.set(r.featureId, r);
  }

  const traceMap = new Map<string, EpigenomicAnnotationTrace>();
  for (const t of annotationTraces) {
    // A trace may be referenced by multiple features; store by traceId
    traceMap.set(t.traceId, t);
  }

  const entries: MappingReportEntry[] = [];
  const blockedReasons = new Set<string>();
  const blockedFeatureIds: string[] = [];
  const allWarnings: QualificationWarning[] = [];

  const byMethod: Partial<Record<MappingType, number>> = {};
  const byConfidence: Partial<Record<MappingConfidence, number>> = {};

  // Initialise counters
  for (const method of MappingTypeSchema.options) {
    byMethod[method] = 0;
  }
  for (const conf of MappingConfidenceSchema.options) {
    byConfidence[conf] = 0;
  }

  let mappedFeatures = 0;
  let unmappedFeatures = 0;
  let pathwayRollupAllowed = 0;
  let pathwayRollupBlocked = 0;
  let ambiguousMappings = 0;

  for (const request of requests) {
    const response = responseMap.get(request.featureId);
    if (!response) {
      throw new Error(
        `Missing mapping response for feature ${request.featureId}`,
      );
    }

    const entryWarnings = buildEntryWarnings(request, response);
    allWarnings.push(...entryWarnings);

    const blockedReason = deriveBlockedRollUpReason(response);
    if (blockedReason) {
      blockedReasons.add(blockedReason);
      blockedFeatureIds.push(request.featureId);
    }

    // Resolve annotation trace if present on the response
    const annotationTrace = response.annotationTrace ?? undefined;

    const entry: MappingReportEntry = {
      request,
      response,
      ...(annotationTrace ? { annotationTrace } : {}),
      ...(blockedReason ? { blockedRollUpReason: blockedReason } : {}),
      warnings: entryWarnings,
    };
    entries.push(entry);

    // Update counters
    byMethod[response.method] = (byMethod[response.method] ?? 0) + 1;
    byConfidence[response.confidence] =
      (byConfidence[response.confidence] ?? 0) + 1;

    if (response.geneIds.length > 0) {
      mappedFeatures++;
    } else {
      unmappedFeatures++;
    }

    if (response.pathwayRollupAllowed) {
      pathwayRollupAllowed++;
    } else {
      pathwayRollupBlocked++;
    }

    if (response.geneIds.length > 1) {
      ambiguousMappings++;
    }
  }

  const counts: MappingCountSummary = {
    totalFeatures: requests.length,
    mappedFeatures,
    unmappedFeatures,
    pathwayRollupAllowed,
    pathwayRollupBlocked,
    ambiguousMappings,
    byMethod: byMethod as Record<MappingType, number>,
    byConfidence: byConfidence as Record<MappingConfidence, number>,
  };

  const blockedRollups: BlockedRollupSummary = {
    count: pathwayRollupBlocked,
    reasons: Array.from(blockedReasons),
    affectedFeatureIds: blockedFeatureIds,
  };

  const confidenceDistribution = buildConfidenceDistribution(entries);

  return MappingSummaryReportSchema.parse({
    schemaName: "EpigenomicsMappingReport",
    schemaVersion: "0.1.0",
    reportId,
    datasetId: options.datasetId,
    generatedAt,
    annotationRelease: options.annotationRelease,
    genomeBuild: options.genomeBuild,
    entries,
    counts,
    blockedRollups,
    warnings: allWarnings,
    confidenceDistribution,
  });
}
