import {
  ExternalDatabaseMappingSchema,
  type ExternalDatabaseMapping,
  type ExternalDatabaseMappingMethod,
  type BiosampleContextMatch,
  type MappingConfidence,
  type DownstreamUseRule,
} from "../contracts/mapping.js";
import { EpigenomicAnnotationTraceSchema } from "../contracts/provenance.js";
import { type QualificationWarning } from "../contracts/qualification.js";
import { GenomeBuildSchema } from "../contracts/coordinates.js";

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Raw region without build/coordinate-system decoration.
 * Used for adapter queries because the external resource is responsible
 * for its own coordinate semantics.
 */
export interface AdapterRegion {
  chrom: string;
  start: number;
  end: number;
}

/**
 * Result of an external database lookup.
 */
export interface ExternalMappingLookupResult {
  geneIds: string[];
  confidence: MappingConfidence;
  biosampleContextMatch: BiosampleContextMatch;
}

/**
 * Optional external adapter for database-supported mappings.
 *
 * v0.1 ships with MockExternalMappingAdapter only.  Real HTTP-backed
 * adapters (e.g., ENCODE REST, GeneHancer API) may be promoted behind
 * feature flags in v0.2.
 */
export interface ExternalMappingAdapter {
  lookupEnhancerTargets(
    featureId: string,
    region: AdapterRegion,
  ): Promise<ExternalMappingLookupResult>;

  lookupChromatinInteractions(
    featureId: string,
    region: AdapterRegion,
  ): Promise<ExternalMappingLookupResult>;
}

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

/**
 * In-memory mock adapter for v0.1 testing and CI.
 *
 * Returns pre-configured responses by featureId.  Falls back to a safe
 * empty result when no preset is found.
 */
export class MockExternalMappingAdapter implements ExternalMappingAdapter {
  constructor(
    private readonly responses: Record<
      string,
      ExternalMappingLookupResult
    > = {},
  ) {}

  async lookupEnhancerTargets(
    featureId: string,
    _region: AdapterRegion,
  ): Promise<ExternalMappingLookupResult> {
    return (
      this.responses[featureId] ?? {
        geneIds: [],
        confidence: "none",
        biosampleContextMatch: "unknown",
      }
    );
  }

  async lookupChromatinInteractions(
    featureId: string,
    _region: AdapterRegion,
  ): Promise<ExternalMappingLookupResult> {
    return (
      this.responses[featureId] ?? {
        geneIds: [],
        confidence: "none",
        biosampleContextMatch: "unknown",
      }
    );
  }
}

// ---------------------------------------------------------------------------
// Downstream use rule computation
// ---------------------------------------------------------------------------

/**
 * Compute the downstream use rule and any warnings based on mapping method
 * and biosample context match quality.
 *
 * Fail-closed: ambiguous or poor biosample matches restrict downstream use.
 */
export function computeDownstreamUseRule(
  method: ExternalDatabaseMappingMethod,
  biosampleContextMatch: BiosampleContextMatch,
  featureId: string,
): { downstreamUseRule: DownstreamUseRule; warnings: QualificationWarning[] } {
  const warnings: QualificationWarning[] = [];

  if (biosampleContextMatch === "exact" || biosampleContextMatch === "close") {
    return {
      downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
      warnings,
    };
  }

  if (biosampleContextMatch === "distant") {
    warnings.push({
      warningCode: "EPIW005_BIOSAMPLE_CONTEXT_MISMATCH",
      severity: "warning",
      message:
        `Feature ${featureId} (${method}) has a distant biosample context match; ` +
        `pathway roll-up is blocked`,
      category: "mapping_proximity",
      featureIds: [featureId],
      blocksDownstream: false,
    });
    return {
      downstreamUseRule: "block_pathway_rollup",
      warnings,
    };
  }

  // unknown
  warnings.push({
    warningCode: "EPIW005_BIOSAMPLE_CONTEXT_MISMATCH",
    severity: "warning",
    message:
      `Feature ${featureId} (${method}) has unknown biosample context match; ` +
      `treated as exploratory only`,
    category: "mapping_proximity",
    featureIds: [featureId],
    blocksDownstream: false,
  });
  return {
    downstreamUseRule: "exploratory_only",
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Mapping builders
// ---------------------------------------------------------------------------

export interface ExternalMappingBuildOptions {
  sourceResource: string;
  annotationRelease: string;
  genomeBuild?: string;
}

/**
 * Build an enhancer-target mapping from an external database lookup.
 *
 * The adapter is optional; when omitted a MockExternalMappingAdapter
 * with no presets is used, yielding a safe empty result.
 */
export async function buildEnhancerTargetMapping(
  featureId: string,
  region: AdapterRegion,
  options: ExternalMappingBuildOptions,
  adapter?: ExternalMappingAdapter,
): Promise<ExternalDatabaseMapping> {
  const resolvedAdapter = adapter ?? new MockExternalMappingAdapter();
  const lookup = await resolvedAdapter.lookupEnhancerTargets(featureId, region);

  const { downstreamUseRule, warnings } = computeDownstreamUseRule(
    "enhancer_target_from_database",
    lookup.biosampleContextMatch,
    featureId,
  );

  const annotationTrace =
    options.genomeBuild && GenomeBuildSchema.safeParse(options.genomeBuild).success
      ? EpigenomicAnnotationTraceSchema.parse({
          traceId: `${featureId}_enhancer_${options.annotationRelease}`,
          sourceResource: options.sourceResource,
          sourceVersion: options.annotationRelease,
          genomeBuild: options.genomeBuild,
        })
      : undefined;

  return ExternalDatabaseMappingSchema.parse({
    featureId,
    geneIds: lookup.geneIds,
    method: "enhancer_target_from_database",
    confidence: lookup.confidence,
    sourceResource: options.sourceResource,
    annotationRelease: options.annotationRelease,
    biosampleContextMatch: lookup.biosampleContextMatch,
    downstreamUseRule,
    warnings,
    annotationTrace,
  });
}

/**
 * Build a chromatin-interaction-supported mapping from an external
 * database lookup.
 *
 * The adapter is optional; when omitted a MockExternalMappingAdapter
 * with no presets is used, yielding a safe empty result.
 */
export async function buildChromatinInteractionMapping(
  featureId: string,
  region: AdapterRegion,
  options: ExternalMappingBuildOptions,
  adapter?: ExternalMappingAdapter,
): Promise<ExternalDatabaseMapping> {
  const resolvedAdapter = adapter ?? new MockExternalMappingAdapter();
  const lookup = await resolvedAdapter.lookupChromatinInteractions(
    featureId,
    region,
  );

  const { downstreamUseRule, warnings } = computeDownstreamUseRule(
    "chromatin_interaction_supported",
    lookup.biosampleContextMatch,
    featureId,
  );

  const annotationTrace =
    options.genomeBuild && GenomeBuildSchema.safeParse(options.genomeBuild).success
      ? EpigenomicAnnotationTraceSchema.parse({
          traceId: `${featureId}_chromatin_${options.annotationRelease}`,
          sourceResource: options.sourceResource,
          sourceVersion: options.annotationRelease,
          genomeBuild: options.genomeBuild,
        })
      : undefined;

  return ExternalDatabaseMappingSchema.parse({
    featureId,
    geneIds: lookup.geneIds,
    method: "chromatin_interaction_supported",
    confidence: lookup.confidence,
    sourceResource: options.sourceResource,
    annotationRelease: options.annotationRelease,
    biosampleContextMatch: lookup.biosampleContextMatch,
    downstreamUseRule,
    warnings,
    annotationTrace,
  });
}
