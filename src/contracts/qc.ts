import { z } from "zod";
import { MissingnessProfileSchema } from "../qc/missingness.js";

/**
 * Data-quality profile for an epigenomics dataset.
 */
export const QcProfileSchema = z
  .object({
    datasetId: z.string().min(1),
    totalFeatures: z.number().int().nonnegative(),
    featuresWithMissingValues: z.number().int().nonnegative(),
    missingnessRate: z.number().min(0).max(1),
    meanReplicateCorrelation: z.number().min(-1).max(1).optional(),
    minReplicateCorrelation: z.number().min(-1).max(1).optional(),
    varianceAcrossDoses: z.number().nonnegative().optional(),
    designAdequacyFlags: z
      .object({
        sufficientReplicates: z.boolean(),
        doseRangeDeclared: z.boolean(),
        controlsPresent: z.boolean(),
        batchStructureKnown: z.boolean(),
        speciesBuildDeclared: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type QcProfile = z.infer<typeof QcProfileSchema>;

/**
 * Dynamic-range band for a single feature.
 */
export const DynamicRangeBandSchema = z.enum([
  "high",
  "moderate",
  "low",
  "not_applicable",
]);

export type DynamicRangeBand = z.infer<typeof DynamicRangeBandSchema>;

/**
 * Replicate-stability band for a dataset.
 */
export const ReplicateStabilityBandSchema = z.enum([
  "stable",
  "unstable",
  "not_assessed",
]);

export type ReplicateStabilityBand = z.infer<
  typeof ReplicateStabilityBandSchema
>;

/**
 * Per-feature variance metric.
 */
export const FeatureVarianceSchema = z
  .object({
    featureId: z.string().min(1),
    variance: z.number().nonnegative(),
    coefficientOfVariation: z.number().nonnegative().optional(),
    dynamicRangeBand: DynamicRangeBandSchema,
  })
  .strict();

export type FeatureVariance = z.infer<typeof FeatureVarianceSchema>;

/**
 * Variance profile for an epigenomics dataset.
 *
 * Captures per-feature variance, replicate stability, and low-dynamic-range
 * flags used by downstream qualification rules.
 */
export const VarianceProfileSchema = z
  .object({
    datasetId: z.string().min(1),
    policyVersion: z.string().min(1),
    perFeatureVariance: z.array(FeatureVarianceSchema),
    replicateStability: z
      .object({
        meanCorrelation: z.number().min(-1).max(1).optional(),
        minCorrelation: z.number().min(-1).max(1).optional(),
        stabilityBand: ReplicateStabilityBandSchema,
      })
      .strict()
      .optional(),
    summaryBand: z.enum(["acceptable", "warning", "exclusion", "not_applicable"]),
  })
  .strict();

export type VarianceProfile = z.infer<typeof VarianceProfileSchema>;

/**
 * Confounding summary for an epigenomics QC report.
 */
export const ConfoundingSummarySchema = z
  .object({
    cellCompositionStatus: z.string().optional(),
    cytotoxicityStatus: z.string().optional(),
    stressResponseStatus: z.string().optional(),
    differentiationDriftStatus: z.string().optional(),
  })
  .strict();

export type ConfoundingSummary = z.infer<typeof ConfoundingSummarySchema>;

/**
 * Deterministic QC report for regulator-facing review.
 *
 * Composes design validation, coordinate validation, missingness profile,
 * variance profile, confounding summary, and accepted/excluded counts into
 * a single benchmarkable object.
 */
export const EpigenomicsQCReportSchema = z
  .object({
    reportId: z.string().min(1),
    schemaName: z.literal("EpigenomicsQCReport"),
    schemaVersion: z.string().min(1),
    datasetId: z.string().min(1),
    designValidation: z
      .object({
        valid: z.boolean(),
        errors: z.array(z.string()),
      })
      .strict(),
    coordinateValidation: z
      .object({
        valid: z.boolean(),
        errors: z.array(z.string()),
      })
      .strict(),
    missingnessProfile: MissingnessProfileSchema,
    varianceProfile: VarianceProfileSchema,
    confoundingSummary: ConfoundingSummarySchema,
    reviewFlags: z.array(z.string()).default([]),
    acceptedCount: z.number().int().nonnegative(),
    excludedCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type EpigenomicsQCReport = z.infer<typeof EpigenomicsQCReportSchema>;
