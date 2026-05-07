import { z } from "zod";
import {
  RegionToGeneMappingSchema,
  type RegionToGeneMapping,
  PATHWAY_ROLLUP_ALLOWED_MAPPING_TYPES,
} from "../contracts/mapping.js";
import { QualificationWarningSchema } from "../contracts/qualification.js";
import type { EpigenomicFeature } from "../contracts/features.js";

/**
 * Pathway coverage result for a set of mapped epigenomic features.
 */
export const EpigenomicsPathwayCoverageSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    schemaName: z.literal("EpigenomicsPathwayCoverage"),
    coverageId: z.string().min(1),
    eligibleFeatureIds: z
      .array(z.string().min(1))
      .describe("Features whose mappings permit pathway roll-up"),
    blockedFeatureIds: z
      .array(z.string().min(1))
      .describe("Features whose mappings block pathway roll-up"),
    unmappedFeatureIds: z
      .array(z.string().min(1))
      .describe("Features with no mapping attempt"),
    warnings: z.array(QualificationWarningSchema).default([]),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type EpigenomicsPathwayCoverage = z.infer<
  typeof EpigenomicsPathwayCoverageSchema
>;

export interface MapFeaturesToPathwaysOptions {
  /** Override the generated coverageId. */
  coverageId?: string;
  /** Override the generated timestamp. */
  generatedAt?: string;
}

/**
 * Map epigenomic features to pathway roll-up eligibility.
 *
 * For each feature, inspects its region-to-gene mapping.  Features are:
 * - eligible: mapping exists and method is in PATHWAY_ROLLUP_ALLOWED_MAPPING_TYPES
 * - blocked: mapping exists but method is not permitted for pathway roll-up
 * - unmapped: no mapping found for the featureId
 *
 * Fail-closed: nearest-gene-only mappings block pathway roll-up.
 * This tool does not perform actual pathway enrichment; it only
 * classifies which features may safely participate in downstream
 * pathway analysis given their mapping provenance.
 */
export function mapEpigenomicFeaturesToPathways(
  features: EpigenomicFeature[],
  mappings: RegionToGeneMapping[],
  options: MapFeaturesToPathwaysOptions = {},
): EpigenomicsPathwayCoverage {
  const coverageId = options.coverageId ?? `pathway-coverage-${Date.now()}`;
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const mappingMap = new Map<string, RegionToGeneMapping>();
  for (const m of mappings) {
    const parsed = RegionToGeneMappingSchema.safeParse(m);
    if (parsed.success) {
      mappingMap.set(parsed.data.featureId, parsed.data);
    }
  }

  const eligibleFeatureIds: string[] = [];
  const blockedFeatureIds: string[] = [];
  const unmappedFeatureIds: string[] = [];
  const warnings: z.infer<typeof QualificationWarningSchema>[] = [];

  for (const feature of features) {
    const mapping = mappingMap.get(feature.featureId);
    if (!mapping) {
      unmappedFeatureIds.push(feature.featureId);
      continue;
    }

    if (
      mapping.pathwayRollupAllowed &&
      PATHWAY_ROLLUP_ALLOWED_MAPPING_TYPES.includes(mapping.method)
    ) {
      eligibleFeatureIds.push(feature.featureId);
    } else {
      blockedFeatureIds.push(feature.featureId);
      warnings.push({
        warningCode: "EPIW008_PATHWAY_ROLLUP_BLOCKED",
        severity: "warning",
        message: `Feature ${feature.featureId} mapped by ${mapping.method} blocks automatic pathway roll-up`,
        category: "mapping_proximity",
        featureIds: [feature.featureId],
        blocksDownstream: false,
      });
    }
  }

  return EpigenomicsPathwayCoverageSchema.parse({
    schemaVersion: "0.1.0",
    schemaName: "EpigenomicsPathwayCoverage",
    coverageId,
    eligibleFeatureIds: eligibleFeatureIds.sort(),
    blockedFeatureIds: blockedFeatureIds.sort(),
    unmappedFeatureIds: unmappedFeatureIds.sort(),
    warnings,
    generatedAt,
  });
}
