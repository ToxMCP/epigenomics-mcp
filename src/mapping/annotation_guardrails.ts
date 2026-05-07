/**
 * Annotation and region-to-gene mapping guardrails.
 *
 * Responsibilities:
 * - Provide typed, provenance-aware mapping builders for all MappingType values.
 * - Enforce fail-closed pathway roll-up rules: nearest-gene, inferred-target,
 *   and unknown-target mappings cannot drive automated pathway or causal claims.
 * - Produce EpigenomicAnnotationTrace on every mapping for regulator-facing
 *   traceability.
 * - Surface structured warnings when mappings are downgraded or blocked.
 */

import { z } from "zod";
import {
  RegionToGeneMappingSchema,
  type RegionToGeneMapping,
  type MappingType,
  DownstreamUseRuleSchema,
  PATHWAY_ROLLUP_ALLOWED_MAPPING_TYPES,
  ExternalDatabaseMappingSchema,
  type ExternalDatabaseMapping,
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
 * Provenance required for any annotation-driven mapping.
 */
export const MappingProvenanceSchema = z
  .object({
    annotationRelease: z.string().min(1).describe("Annotation release identifier"),
    genomeBuild: GenomeBuildSchema.describe("Genome build"),
    sourceResource: z
      .string()
      .min(1)
      .describe("Source resource name (e.g., GENCODE, Ensembl)"),
  })
  .strict();

export type MappingProvenance = z.infer<typeof MappingProvenanceSchema>;

/**
 * Result of applying guardrails to a single region-to-gene mapping.
 */
export const GuardedMappingResultSchema = z
  .object({
    mapping: RegionToGeneMappingSchema.describe("Guarded mapping result"),
    warnings: z
      .array(QualificationWarningSchema)
      .default([])
      .describe("Guardrail warnings"),
    blockedPathwayRollup: z
      .boolean()
      .describe("Whether pathway roll-up is blocked for this mapping"),
    blockedCausalClaim: z
      .boolean()
      .describe("Whether causal target assignment is blocked"),
  })
  .strict();

export type GuardedMappingResult = z.infer<typeof GuardedMappingResultSchema>;

// ---------------------------------------------------------------------------
// Annotation trace builder
// ---------------------------------------------------------------------------

function buildAnnotationTrace(
  featureId: string,
  method: MappingType,
  provenance: MappingProvenance,
): EpigenomicAnnotationTrace {
  return EpigenomicAnnotationTraceSchema.parse({
    traceId: `${featureId}_${method}_${provenance.annotationRelease}`,
    sourceResource: provenance.sourceResource,
    sourceVersion: provenance.annotationRelease,
    genomeBuild: provenance.genomeBuild,
  });
}

// ---------------------------------------------------------------------------
// Low-confidence / blocked mapping builders
// ---------------------------------------------------------------------------

/**
 * Build an inferred-target-gene mapping.
 *
 * Used when a target gene is inferred by heuristic (e.g., correlation,
 * co-expression, or non-genomic evidence) rather than direct genomic
 * overlap or curated database linkage.
 *
 * Guardrails:
 * - confidence is always "low"
 * - pathwayRollupAllowed is false
 * - downstreamUseRule is "block_pathway_rollup"
 * - causal claims are blocked
 */
export function buildInferredTargetGeneMapping(
  featureId: string,
  geneIds: string[],
  provenance: MappingProvenance,
  options?: { distanceBp?: number; rationale?: string },
): GuardedMappingResult {
  MappingProvenanceSchema.parse(provenance);

  const warnings: QualificationWarning[] = [];

  if (geneIds.length > 0) {
    warnings.push({
      warningCode: "EPIW011_INFERRED_TARGET_GENE",
      severity: "warning",
      message:
        `Feature ${featureId} target gene(s) inferred by heuristic` +
        (options?.rationale ? ` (${options.rationale})` : "") +
        "; pathway roll-up and causal claims are blocked.",
      category: "mapping_proximity",
      featureIds: [featureId],
      blocksDownstream: false,
    });
  }

  const annotationTrace = buildAnnotationTrace(featureId, "inferred_target_gene", provenance);

  const mapping = RegionToGeneMappingSchema.parse({
    featureId,
    geneIds,
    method: "inferred_target_gene",
    confidence: geneIds.length > 0 ? "low" : "none",
    ...(options?.distanceBp !== undefined ? { distanceBp: options.distanceBp } : {}),
    pathwayRollupAllowed: false,
    downstreamUseRule: DownstreamUseRuleSchema.parse("block_pathway_rollup"),
    annotationTrace,
  });

  return GuardedMappingResultSchema.parse({
    mapping,
    warnings,
    blockedPathwayRollup: true,
    blockedCausalClaim: true,
  });
}

/**
 * Build an unknown-target-gene mapping.
 *
 * Used when no target gene could be assigned by any method.
 *
 * Guardrails:
 * - confidence is always "none"
 * - geneIds is empty
 * - pathwayRollupAllowed is false
 * - downstreamUseRule is "block_gene_and_pathway_rollup"
 * - causal claims are blocked
 */
export function buildUnknownTargetGeneMapping(
  featureId: string,
  provenance: MappingProvenance,
  options?: { reason?: string },
): GuardedMappingResult {
  MappingProvenanceSchema.parse(provenance);

  const warnings: QualificationWarning[] = [
    {
      warningCode: "EPIW012_UNKNOWN_TARGET_GENE",
      severity: "warning",
      message:
        `Feature ${featureId} has no assigned target gene` +
        (options?.reason ? ` (${options.reason})` : ""),
      category: "mapping_proximity",
      featureIds: [featureId],
      blocksDownstream: false,
    },
  ];

  const annotationTrace = buildAnnotationTrace(featureId, "unknown_target_gene", provenance);

  const mapping = RegionToGeneMappingSchema.parse({
    featureId,
    geneIds: [],
    method: "unknown_target_gene",
    confidence: "none",
    pathwayRollupAllowed: false,
    downstreamUseRule: DownstreamUseRuleSchema.parse("block_gene_and_pathway_rollup"),
    annotationTrace,
  });

  return GuardedMappingResultSchema.parse({
    mapping,
    warnings,
    blockedPathwayRollup: true,
    blockedCausalClaim: true,
  });
}

// ---------------------------------------------------------------------------
// Pathway roll-up guardrail
// ---------------------------------------------------------------------------

/**
 * Determine whether a mapping method permits automated pathway roll-up.
 *
 * Fail-closed: only methods explicitly listed in
 * PATHWAY_ROLLUP_ALLOWED_MAPPING_TYPES are permitted.
 */
export function isPathwayRollupAllowed(method: MappingType): boolean {
  return PATHWAY_ROLLUP_ALLOWED_MAPPING_TYPES.includes(method);
}

/**
 * Apply guardrails to an existing RegionToGeneMapping.
 *
 * Validates that pathwayRollupAllowed is consistent with the mapping method,
 * emits warnings when roll-up is blocked, and returns a guarded result with
 * explicit blocking flags.
 */
export function applyMappingGuardrails(
  mapping: RegionToGeneMapping,
): GuardedMappingResult {
  const parsed = RegionToGeneMappingSchema.parse(mapping);

  const warnings: QualificationWarning[] = [];
  let blockedPathwayRollup = false;
  let blockedCausalClaim = false;

  // Enforce pathway roll-up rule
  if (!isPathwayRollupAllowed(parsed.method)) {
    blockedPathwayRollup = true;
    warnings.push({
      warningCode: "EPIW008_PATHWAY_ROLLUP_BLOCKED",
      severity: "warning",
      message: `Feature ${parsed.featureId} mapped by ${parsed.method} blocks automatic pathway roll-up`,
      category: "mapping_proximity",
      featureIds: [parsed.featureId],
      blocksDownstream: false,
    });
  }

  // Enforce causal claim blocking for low-confidence methods
  if (
    parsed.method === "nearest_gene" ||
    parsed.method === "inferred_target_gene" ||
    parsed.method === "unknown_target_gene"
  ) {
    blockedCausalClaim = true;
  }

  // If pathwayRollupAllowed is true but method doesn't support it, downgrade
  if (parsed.pathwayRollupAllowed && !isPathwayRollupAllowed(parsed.method)) {
    warnings.push({
      warningCode: "EPIW013_PATHWAY_ROLLUP_INCONSISTENT",
      severity: "warning",
      message: `Feature ${parsed.featureId} has pathwayRollupAllowed=true but method ${parsed.method} does not support it; treated as blocked`,
      category: "mapping_proximity",
      featureIds: [parsed.featureId],
      blocksDownstream: false,
    });
  }

  return GuardedMappingResultSchema.parse({
    mapping: parsed,
    warnings,
    blockedPathwayRollup,
    blockedCausalClaim,
  });
}

// ---------------------------------------------------------------------------
// External mapping guardrail
// ---------------------------------------------------------------------------

/**
 * Apply guardrails to an external database mapping.
 *
 * Biosample context mismatch blocks pathway roll-up. All other external
 * mappings are treated as contextual linkage only (no causal claims).
 */
export function applyExternalMappingGuardrails(
  mapping: ExternalDatabaseMapping,
): {
  mapping: ExternalDatabaseMapping;
  warnings: QualificationWarning[];
  blockedPathwayRollup: boolean;
  blockedCausalClaim: boolean;
} {
  const parsed = ExternalDatabaseMappingSchema.parse(mapping);
  const warnings: QualificationWarning[] = [...parsed.warnings];

  let blockedPathwayRollup = false;
  const blockedCausalClaim = true; // External mappings never imply causality

  if (parsed.downstreamUseRule === "block_pathway_rollup") {
    blockedPathwayRollup = true;
  } else if (parsed.downstreamUseRule === "exploratory_only") {
    blockedPathwayRollup = true;
  } else if (parsed.downstreamUseRule === "block_gene_and_pathway_rollup") {
    blockedPathwayRollup = true;
  }

  // Downgrade if biosample context is poor
  if (
    parsed.biosampleContextMatch === "distant" ||
    parsed.biosampleContextMatch === "unknown"
  ) {
    blockedPathwayRollup = true;
  }

  return {
    mapping: parsed,
    warnings,
    blockedPathwayRollup,
    blockedCausalClaim,
  };
}

// ---------------------------------------------------------------------------
// Batch guardrails
// ---------------------------------------------------------------------------

/**
 * Result of applying guardrails to a batch of mappings.
 */
export const BatchGuardedMappingResultSchema = z
  .object({
    results: z.array(GuardedMappingResultSchema).describe("Per-mapping guarded results"),
    allowedForPathwayRollup: z
      .array(z.string().min(1))
      .describe("Feature IDs permitted for pathway roll-up"),
    blockedFromPathwayRollup: z
      .array(z.string().min(1))
      .describe("Feature IDs blocked from pathway roll-up"),
    blockedCausalClaims: z
      .array(z.string().min(1))
      .describe("Feature IDs where causal claims are blocked"),
    allWarnings: z.array(QualificationWarningSchema).describe("All warnings"),
  })
  .strict();

export type BatchGuardedMappingResult = z.infer<typeof BatchGuardedMappingResultSchema>;

/**
 * Apply guardrails to a batch of region-to-gene mappings.
 */
export function applyBatchMappingGuardrails(
  mappings: RegionToGeneMapping[],
): BatchGuardedMappingResult {
  const results: GuardedMappingResult[] = [];
  const allowedForPathwayRollup: string[] = [];
  const blockedFromPathwayRollup: string[] = [];
  const blockedCausalClaims: string[] = [];
  const allWarnings: QualificationWarning[] = [];

  for (const mapping of mappings) {
    const guarded = applyMappingGuardrails(mapping);
    results.push(guarded);

    if (guarded.blockedPathwayRollup) {
      blockedFromPathwayRollup.push(guarded.mapping.featureId);
    } else {
      allowedForPathwayRollup.push(guarded.mapping.featureId);
    }

    if (guarded.blockedCausalClaim) {
      blockedCausalClaims.push(guarded.mapping.featureId);
    }

    allWarnings.push(...guarded.warnings);
  }

  return BatchGuardedMappingResultSchema.parse({
    results,
    allowedForPathwayRollup: allowedForPathwayRollup.sort(),
    blockedFromPathwayRollup: blockedFromPathwayRollup.sort(),
    blockedCausalClaims: blockedCausalClaims.sort(),
    allWarnings,
  });
}
