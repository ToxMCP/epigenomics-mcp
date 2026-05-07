import {
  RegionToGeneMappingSchema,
  type RegionToGeneMapping,
  DownstreamUseRuleSchema,
} from "../contracts/mapping.js";
import {
  GeneModelSnapshotSchema,
  type GeneModelSnapshot,
} from "../coordinate_mapping/region_to_gene.js";
import { EpigenomicAnnotationTraceSchema } from "../contracts/provenance.js";

/**
 * Compute the signed distance from a 0-based half-open feature interval
 * to a single genomic coordinate (e.g. a TSS).
 *
 * - If the point lies inside the interval, distance is 0.
 * - If the point is upstream (left) of the interval, distance is start - point.
 * - If the point is downstream (right) of the interval, distance is point - end.
 *
 * This treats adjacent coordinates as having distance 0, consistent with
 * bedtools-closest semantics.
 */
function distanceToPoint(
  featureStart: number,
  featureEnd: number,
  point: number,
): number {
  if (point >= featureStart && point < featureEnd) return 0;
  if (point < featureStart) return featureStart - point;
  return point - featureEnd;
}

/**
 * Return the transcription start site (TSS) for a gene model.
 *
 * Plus strand (+): TSS is at `start`.
 * Minus strand (-): TSS is at `end`.
 * Unknown strand (.): treated as plus strand (conservative default).
 */
function getTss(gene: { start: number; end: number; strand: string }): number {
  return gene.strand === "-" ? gene.end : gene.start;
}

/**
 * Map a genomic region to its nearest gene(s) by distance to TSS.
 *
 * Only genes on the same chromosome are considered.  Distance is computed
 * from the closest base in the feature region to the gene's TSS.  Ties
 * (multiple genes at the identical minimum distance) are returned together.
 *
 * Nearest-gene mapping is deliberately low-confidence contextual linkage:
 * - confidence is always "low" when a gene is found, "none" otherwise
 * - pathwayRollupAllowed is false
 * - downstreamUseRule is "exploratory_only"
 * - exact distanceBp is reported for traceability
 *
 * Requires a frozen gene-model snapshot with provenance metadata.
 */
export function mapRegionToNearestGene(
  featureId: string,
  chrom: string,
  start: number,
  end: number,
  snapshot: GeneModelSnapshot,
): RegionToGeneMapping {
  GeneModelSnapshotSchema.parse(snapshot);

  const sameChromGenes = snapshot.genes.filter((g) => g.chrom === chrom);

  if (sameChromGenes.length === 0) {
    return RegionToGeneMappingSchema.parse({
      featureId,
      geneIds: [],
      method: "nearest_gene",
      confidence: "none",
      pathwayRollupAllowed: false,
    });
  }

  let minDistance = Infinity;
  const distances = new Map<string, number>();

  for (const gene of sameChromGenes) {
    const tss = getTss(gene);
    const dist = distanceToPoint(start, end, tss);
    distances.set(gene.geneId, dist);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  const nearestGeneIds = sameChromGenes
    .filter((g) => distances.get(g.geneId) === minDistance)
    .map((g) => g.geneId);

  const annotationTrace = EpigenomicAnnotationTraceSchema.parse({
    traceId: `${featureId}_nearest_gene_${snapshot.annotationRelease}`,
    sourceResource: "frozen_gene_model_snapshot",
    sourceVersion: snapshot.annotationRelease,
    genomeBuild: snapshot.genomeBuild,
  });

  return RegionToGeneMappingSchema.parse({
    featureId,
    geneIds: nearestGeneIds,
    method: "nearest_gene",
    confidence: nearestGeneIds.length > 0 ? "low" : "none",
    distanceBp: minDistance === Infinity ? undefined : minDistance,
    pathwayRollupAllowed: false,
    downstreamUseRule: DownstreamUseRuleSchema.parse("exploratory_only"),
    annotationTrace,
  });
}
