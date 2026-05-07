import { z } from "zod";
import { EpigenomicAnnotationTraceSchema } from "./provenance.js";
import { QualificationWarningSchema } from "./qualification.js";

/**
 * Confidence level for a region-to-gene mapping.
 */
export const MappingConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
  "none",
]);

export type MappingConfidence = z.infer<typeof MappingConfidenceSchema>;

/**
 * Supported region-to-gene mapping types.
 *
 * Defines the method used to link an epigenomic region to a target gene.
 * Each mapping type carries a default downstream-use rule.
 */
export const MappingTypeSchema = z.enum([
  "direct_promoter_overlap",
  "promoter_overlap",
  "gene_body_overlap",
  "enhancer_target_from_database",
  "chromatin_interaction_supported",
  "nearest_gene",
  "inferred_target_gene",
  "unknown_target_gene",
]);

export type MappingType = z.infer<typeof MappingTypeSchema>;

/**
 * Mapping types that permit automatic pathway roll-up.
 */
export const PATHWAY_ROLLUP_ALLOWED_MAPPING_TYPES: readonly MappingType[] = [
  "direct_promoter_overlap",
  "promoter_overlap",
  "gene_body_overlap",
  "enhancer_target_from_database",
  "chromatin_interaction_supported",
];

/**
 * Downstream use rule for a mapping, derived from FR-070.
 */
export const DownstreamUseRuleSchema = z.enum([
  "allow_contextual_gene_linkage_and_pathway_rollup",
  "allow_with_warning",
  "exploratory_only",
  "block_pathway_rollup",
  "block_gene_and_pathway_rollup",
]);

export type DownstreamUseRule = z.infer<typeof DownstreamUseRuleSchema>;

/**
 * Typed region-to-gene mapping result.
 *
 * Represents the linkage between a measured epigenomic region and one or
 * more putative target genes.  This is intentionally separate from the
 * measured feature so that downstream consumers can apply mapping-aware
 * qualification rules (e.g. blocking pathway roll-up from nearest-gene-only
 * links).
 */
export const RegionToGeneMappingSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    geneIds: z
      .array(z.string().min(1))
      .describe("Mapped gene identifiers"),
    method: MappingTypeSchema.describe(
      "Mapping method (e.g. nearest_gene, direct_promoter_overlap)",
    ),
    confidence: MappingConfidenceSchema.describe(
      "Confidence level of the mapping",
    ),
    distanceBp: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Distance in base pairs when applicable"),
    pathwayRollupAllowed: z
      .boolean()
      .default(false)
      .describe(
        "Whether this mapping may be used for automated pathway roll-up",
      ),
    downstreamUseRule: DownstreamUseRuleSchema.optional().describe(
      "Derived downstream use restriction for this mapping",
    ),
    annotationTrace: EpigenomicAnnotationTraceSchema.optional().describe(
      "Annotation trace for this mapping",
    ),
  })
  .strict()
  .refine(
    (m) => {
      if (m.pathwayRollupAllowed) {
        return PATHWAY_ROLLUP_ALLOWED_MAPPING_TYPES.includes(m.method);
      }
      return true;
    },
    {
      message:
        "pathwayRollupAllowed is not permitted for this mapping type",
      path: ["pathwayRollupAllowed"],
    },
  );

export type RegionToGeneMapping = z.infer<typeof RegionToGeneMappingSchema>;

// ---------------------------------------------------------------------------
// External database-supported mapping structures
// ---------------------------------------------------------------------------

/**
 * Biosample context match quality for external database lookups.
 */
export const BiosampleContextMatchSchema = z.enum([
  "exact",
  "close",
  "distant",
  "unknown",
]);

export type BiosampleContextMatch = z.infer<typeof BiosampleContextMatchSchema>;

/**
 * External database mapping methods supported for provenance-aware
 * region-to-gene linkage.
 */
export const ExternalDatabaseMappingMethodSchema = z.enum([
  "enhancer_target_from_database",
  "chromatin_interaction_supported",
]);

export type ExternalDatabaseMappingMethod = z.infer<
  typeof ExternalDatabaseMappingMethodSchema
>;

/**
 * Provenance-aware mapping result from an external database or interaction
 * resource.
 *
 * This structure is deliberately separate from the basic RegionToGeneMapping
 * because it carries additional provenance metadata (source_resource,
 * annotation_release, biosample_context_match) required for regulator-facing
 * traceability.  It does not infer causality; it records what the external
 * resource claims under a declared biosample context.
 */
export const ExternalDatabaseMappingSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    geneIds: z.array(z.string().min(1)).describe("Mapped gene identifiers"),
    method: ExternalDatabaseMappingMethodSchema.describe(
      "External database mapping method",
    ),
    confidence: MappingConfidenceSchema.describe("Mapping confidence"),
    sourceResource: z
      .string()
      .min(1)
      .describe("External resource name (e.g., ENCODE, GeneHancer)"),
    annotationRelease: z
      .string()
      .min(1)
      .describe("Annotation or database release version"),
    biosampleContextMatch: BiosampleContextMatchSchema.describe(
      "Quality of biosample context match between query and database record",
    ),
    downstreamUseRule: DownstreamUseRuleSchema.describe(
      "Derived downstream use restriction based on method and biosample context",
    ),
    warnings: z
      .array(QualificationWarningSchema)
      .default([])
      .describe("Qualification warnings generated during mapping"),
    annotationTrace: EpigenomicAnnotationTraceSchema.optional().describe(
      "Annotation trace for this mapping",
    ),
  })
  .strict();

export type ExternalDatabaseMapping = z.infer<
  typeof ExternalDatabaseMappingSchema
>;

/**
 * Mapping payloads container.
 *
 * Keeps region-to-gene mappings and external database mappings
 * separate from measured feature payloads so downstream consumers
 * can apply mapping-aware qualification rules.
 */
export const MappingPayloadsSchema = z
  .object({
    regionToGeneMappings: z
      .array(RegionToGeneMappingSchema)
      .default([])
      .describe("Region-to-gene mappings for coordinate-bearing features"),
    externalDatabaseMappings: z
      .array(ExternalDatabaseMappingSchema)
      .default([])
      .describe("External database-supported mappings"),
  })
  .strict();

export type MappingPayloads = z.infer<typeof MappingPayloadsSchema>;
