import { z } from "zod";
import {
  RegionToGeneMappingSchema,
  type RegionToGeneMapping,
  DownstreamUseRuleSchema,
} from "../contracts/mapping.js";
import { GenomeBuildSchema } from "../contracts/coordinates.js";
import { EpigenomicAnnotationTraceSchema } from "../contracts/provenance.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Promoter window policy with explicit versioning for traceability.
 */
export const PromoterWindowPolicySchema = z
  .object({
    upstreamBp: z
      .number()
      .int()
      .nonnegative()
      .describe("Bases upstream of TSS to include"),
    downstreamBp: z
      .number()
      .int()
      .nonnegative()
      .describe("Bases downstream of TSS to include"),
    version: z.string().min(1).describe("Policy version identifier"),
  })
  .strict();

export type PromoterWindowPolicy = z.infer<typeof PromoterWindowPolicySchema>;

/**
 * Minimal gene model for overlap-based region-to-gene mapping.
 *
 * Coordinates are 0-based, half-open, consistent with the canonical
 * internal representation used throughout Epigenomics MCP.
 */
export const GeneModelSchema = z
  .object({
    geneId: z.string().min(1).describe("Stable gene identifier"),
    chrom: z
      .string()
      .min(1)
      .regex(/^(chr[0-9XYM]+|[0-9XYM]+)$/)
      .describe("Chromosome identifier"),
    start: z.number().int().nonnegative().describe("Transcription start"),
    end: z.number().int().nonnegative().describe("Transcription end"),
    strand: z
      .enum(["+", "-", "."])
      .describe("Strand orientation"),
  })
  .strict()
  .refine((g) => g.end > g.start, {
    message: "end must be greater than start",
    path: ["end"],
  });

export type GeneModel = z.infer<typeof GeneModelSchema>;

/**
 * Frozen gene-model snapshot with provenance metadata.
 */
export const GeneModelSnapshotSchema = z
  .object({
    annotationRelease: z
      .string()
      .min(1)
      .describe("Annotation release identifier (e.g. GENCODE v46)"),
    genomeBuild: GenomeBuildSchema.describe("Genome build for the snapshot"),
    genes: z.array(GeneModelSchema).describe("Gene models in the snapshot"),
  })
  .strict();

export type GeneModelSnapshot = z.infer<typeof GeneModelSnapshotSchema>;

// ---------------------------------------------------------------------------
// Overlap primitives
// ---------------------------------------------------------------------------

/**
 * Build the promoter window for a gene model under a given policy.
 *
 * The promoter window is strand-aware:
 * - Plus strand (+): TSS is at `start`; upstream is toward lower coordinates.
 * - Minus strand (-): TSS is at `end`; upstream is toward higher coordinates.
 * - Unknown strand (.): treated as plus strand (conservative default).
 *
 * Returns a 0-based, half-open interval. Negative start coordinates are
 * clamped to 0 (fail-closed on coordinate underflow).
 */
export function buildPromoterWindow(
  gene: GeneModel,
  policy: PromoterWindowPolicy,
): { chrom: string; start: number; end: number } {
  if (gene.strand === "-") {
    const windowStart = Math.max(0, gene.end - policy.downstreamBp);
    const windowEnd = gene.end + policy.upstreamBp;
    return { chrom: gene.chrom, start: windowStart, end: windowEnd };
  }

  // Default to plus-strand semantics for "+" and "."
  const windowStart = Math.max(0, gene.start - policy.upstreamBp);
  const windowEnd = gene.start + policy.downstreamBp;
  return { chrom: gene.chrom, start: windowStart, end: windowEnd };
}

/**
 * Test whether two 0-based, half-open intervals on the same chromosome
 * overlap by at least one base pair.
 */
export function regionsOverlap(
  a: { chrom: string; start: number; end: number },
  b: { chrom: string; start: number; end: number },
): boolean {
  if (a.chrom !== b.chrom) return false;
  return a.start < b.end && b.start < a.end;
}

// ---------------------------------------------------------------------------
// Mapping functions
// ---------------------------------------------------------------------------

/**
 * Map a genomic region to genes via direct promoter overlap.
 *
 * A region maps to a gene when the region overlaps the gene's promoter
 * window, computed from the configured promoter policy. All overlapping
 * genes are returned; no single-gene forcing is applied.
 *
 * Requires a configured promoter window policy and an annotation release.
 */
export function directPromoterOverlap(
  featureId: string,
  chrom: string,
  start: number,
  end: number,
  snapshot: GeneModelSnapshot,
  policy: PromoterWindowPolicy,
): RegionToGeneMapping {
  PromoterWindowPolicySchema.parse(policy);
  GeneModelSnapshotSchema.parse(snapshot);

  const featureRegion = { chrom, start, end };
  const matchedGeneIds: string[] = [];

  for (const gene of snapshot.genes) {
    const promoter = buildPromoterWindow(gene, policy);
    if (regionsOverlap(featureRegion, promoter)) {
      matchedGeneIds.push(gene.geneId);
    }
  }

  const annotationTrace = EpigenomicAnnotationTraceSchema.parse({
    traceId: `${featureId}_promoter_${snapshot.annotationRelease}`,
    sourceResource: "frozen_gene_model_snapshot",
    sourceVersion: snapshot.annotationRelease,
    genomeBuild: snapshot.genomeBuild,
  });

  return RegionToGeneMappingSchema.parse({
    featureId,
    geneIds: matchedGeneIds,
    method: "direct_promoter_overlap",
    confidence: matchedGeneIds.length > 0 ? "high" : "none",
    pathwayRollupAllowed: true,
    downstreamUseRule: DownstreamUseRuleSchema.parse(
      "allow_contextual_gene_linkage_and_pathway_rollup",
    ),
    annotationTrace,
  });
}

/**
 * Map a genomic region to genes via gene-body overlap.
 *
 * A region maps to a gene when the region overlaps the gene's transcription
 * interval [start, end). All overlapping genes are returned; no single-gene
 * forcing is applied.
 *
 * Requires an annotation release.
 */
export function geneBodyOverlap(
  featureId: string,
  chrom: string,
  start: number,
  end: number,
  snapshot: GeneModelSnapshot,
): RegionToGeneMapping {
  GeneModelSnapshotSchema.parse(snapshot);

  const featureRegion = { chrom, start, end };
  const matchedGeneIds: string[] = [];

  for (const gene of snapshot.genes) {
    const geneBody = { chrom: gene.chrom, start: gene.start, end: gene.end };
    if (regionsOverlap(featureRegion, geneBody)) {
      matchedGeneIds.push(gene.geneId);
    }
  }

  const annotationTrace = EpigenomicAnnotationTraceSchema.parse({
    traceId: `${featureId}_genebody_${snapshot.annotationRelease}`,
    sourceResource: "frozen_gene_model_snapshot",
    sourceVersion: snapshot.annotationRelease,
    genomeBuild: snapshot.genomeBuild,
  });

  return RegionToGeneMappingSchema.parse({
    featureId,
    geneIds: matchedGeneIds,
    method: "gene_body_overlap",
    confidence: matchedGeneIds.length > 0 ? "high" : "none",
    pathwayRollupAllowed: true,
    downstreamUseRule: DownstreamUseRuleSchema.parse(
      "allow_contextual_gene_linkage_and_pathway_rollup",
    ),
    annotationTrace,
  });
}
