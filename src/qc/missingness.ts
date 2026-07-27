import { z } from "zod";
import type { ExperimentalDesign } from "../contracts/design.js";

export interface MissingnessFeature {
  featureId: string;
  values: Record<string, number | null>;
}

/**
 * Missingness threshold band assigned to a metric or summary.
 */
export const MissingnessBandSchema = z.enum([
  "acceptable",
  "warning",
  "exclusion",
  "not_applicable",
]);

export type MissingnessBand = z.infer<typeof MissingnessBandSchema>;

/**
 * Versioned policy configuration for missingness thresholds.
 */
export const MissingnessPolicySchema = z
  .object({
    version: z.string().min(1).describe("Policy version identifier"),
    warningThreshold: z
      .number()
      .min(0)
      .max(1)
      .describe("Fraction above which the warning band applies"),
    exclusionThreshold: z
      .number()
      .min(0)
      .max(1)
      .describe("Fraction above which the exclusion band applies"),
  })
  .strict()
  .refine((p) => p.exclusionThreshold >= p.warningThreshold, {
    message: "exclusionThreshold must be >= warningThreshold",
    path: ["exclusionThreshold"],
  });

export type MissingnessPolicy = z.infer<typeof MissingnessPolicySchema>;

/**
 * Default missingness policy for v0.1.
 */
export const DEFAULT_MISSINGNESS_POLICY: MissingnessPolicy = {
  version: "v1.0.0",
  warningThreshold: 0.05,
  exclusionThreshold: 0.2,
};

/**
 * Per-feature missingness metric.
 */
export const FeatureMissingnessSchema = z
  .object({
    featureId: z.string().min(1),
    missingFraction: z.number().min(0).max(1),
    band: MissingnessBandSchema,
  })
  .strict();

export type FeatureMissingness = z.infer<typeof FeatureMissingnessSchema>;

/**
 * Per-sample missingness metric.
 */
export const SampleMissingnessSchema = z
  .object({
    sampleId: z.string().min(1),
    missingFraction: z.number().min(0).max(1),
    band: MissingnessBandSchema,
  })
  .strict();

export type SampleMissingness = z.infer<typeof SampleMissingnessSchema>;

/**
 * Per-dose-group missingness metric.
 */
export const GroupMissingnessSchema = z
  .object({
    doseGroupId: z.string().min(1),
    missingFraction: z.number().min(0).max(1),
    band: MissingnessBandSchema,
    completeDropoutFeatureIds: z
      .array(z.string().min(1))
      .describe("Features with 100% missingness in this group"),
  })
  .strict();

export type GroupMissingness = z.infer<typeof GroupMissingnessSchema>;

/**
 * Comprehensive missingness profile for a dataset.
 */
export const MissingnessProfileSchema = z
  .object({
    datasetId: z.string().min(1),
    policyVersion: z.string().min(1),
    overallFeatureMissingFraction: z.number().min(0).max(1),
    perFeatureMissingness: z.array(FeatureMissingnessSchema),
    perSampleMissingness: z.array(SampleMissingnessSchema),
    perGroupMissingness: z.array(GroupMissingnessSchema),
    featuresWithCompleteGroupDropout: z
      .array(z.string().min(1))
      .describe("Features with complete dropout in at least one group"),
    summaryBand: MissingnessBandSchema,
  })
  .strict();

export type MissingnessProfile = z.infer<typeof MissingnessProfileSchema>;

function isMissing(value: number | null | undefined): boolean {
  return value === null || value === undefined || Number.isNaN(value);
}

function assignBand(
  fraction: number,
  policy: MissingnessPolicy,
): MissingnessBand {
  if (fraction >= policy.exclusionThreshold) return "exclusion";
  if (fraction >= policy.warningThreshold) return "warning";
  return "acceptable";
}

function computeSummaryBand(
  perFeature: FeatureMissingness[],
  perSample: SampleMissingness[],
  perGroup: GroupMissingness[],
  completeDropoutFeatures: string[],
): MissingnessBand {
  if (completeDropoutFeatures.length > 0) return "exclusion";

  const allBands = [
    ...perFeature.map((f) => f.band),
    ...perSample.map((s) => s.band),
    ...perGroup.map((g) => g.band),
  ];

  if (allBands.includes("exclusion")) return "exclusion";
  if (allBands.includes("warning")) return "warning";
  if (allBands.length === 0) return "not_applicable";
  return "acceptable";
}

/**
 * Compute a deterministic missingness profile for an epigenomics dataset.
 *
 * Profiles missingness by feature, sample, and dose group, and assigns
 * threshold bands using the supplied versioned policy config.  Fail-closed:
 * complete group dropout automatically triggers the exclusion band.
 */
export function profileMissingness(
  datasetId: string,
  features: MissingnessFeature[],
  design: ExperimentalDesign,
  policy: MissingnessPolicy = DEFAULT_MISSINGNESS_POLICY,
): MissingnessProfile {
  const totalFeatures = features.length;
  const totalSamples = design.samples.length;

  if (totalFeatures === 0 || totalSamples === 0) {
    return MissingnessProfileSchema.parse({
      datasetId,
      policyVersion: policy.version,
      overallFeatureMissingFraction: 0,
      perFeatureMissingness: [],
      perSampleMissingness: [],
      perGroupMissingness: [],
      featuresWithCompleteGroupDropout: [],
      summaryBand: "not_applicable",
    });
  }

  const sampleIndex = new Map<string, number>();
  design.samples.forEach((s, i) => sampleIndex.set(s.sampleId, i));

  const sampleIds = design.samples.map((s) => s.sampleId);

  // Per-feature missingness
  const perFeatureMissingness: FeatureMissingness[] = [];
  let totalMissingValues = 0;

  for (const feature of features) {
    let missingCount = 0;
    for (const sampleId of sampleIds) {
      const value = feature.values[sampleId];
      if (isMissing(value)) {
        missingCount++;
        totalMissingValues++;
      }
    }
    const missingFraction = missingCount / totalSamples;
    perFeatureMissingness.push({
      featureId: feature.featureId,
      missingFraction,
      band: assignBand(missingFraction, policy),
    });
  }

  const overallFeatureMissingFraction =
    totalMissingValues / (totalFeatures * totalSamples);

  // Per-sample missingness
  const perSampleMissingness: SampleMissingness[] = [];

  for (const sample of design.samples) {
    let missingCount = 0;
    for (const feature of features) {
      const value = feature.values[sample.sampleId];
      if (isMissing(value)) {
        missingCount++;
      }
    }
    const missingFraction = missingCount / totalFeatures;
    perSampleMissingness.push({
      sampleId: sample.sampleId,
      missingFraction,
      band: assignBand(missingFraction, policy),
    });
  }

  // Per-group missingness + complete dropout detection
  const perGroupMissingness: GroupMissingness[] = [];
  const completeDropoutSet = new Set<string>();

  for (const doseGroup of design.doseGroups) {
    const groupSamples = design.samples.filter(
      (s) => s.doseGroupId === doseGroup.doseGroupId,
    );
    const groupSampleCount = groupSamples.length;

    if (groupSampleCount === 0) {
      perGroupMissingness.push({
        doseGroupId: doseGroup.doseGroupId,
        missingFraction: 0,
        band: "acceptable",
        completeDropoutFeatureIds: [],
      });
      continue;
    }

    let groupMissingCount = 0;
    const groupCompleteDropoutFeatureIds: string[] = [];

    for (const feature of features) {
      let featureMissingInGroup = 0;
      for (const sample of groupSamples) {
        const value = feature.values[sample.sampleId];
        if (isMissing(value)) {
          featureMissingInGroup++;
          groupMissingCount++;
        }
      }
      if (featureMissingInGroup === groupSampleCount) {
        groupCompleteDropoutFeatureIds.push(feature.featureId);
        completeDropoutSet.add(feature.featureId);
      }
    }

    const missingFraction =
      groupMissingCount / (totalFeatures * groupSampleCount);

    // Complete dropout in any feature forces exclusion band for the group
    const band: MissingnessBand =
      groupCompleteDropoutFeatureIds.length > 0
        ? "exclusion"
        : assignBand(missingFraction, policy);

    perGroupMissingness.push({
      doseGroupId: doseGroup.doseGroupId,
      missingFraction,
      band,
      completeDropoutFeatureIds: groupCompleteDropoutFeatureIds,
    });
  }

  const featuresWithCompleteGroupDropout = Array.from(completeDropoutSet).sort();

  const summaryBand = computeSummaryBand(
    perFeatureMissingness,
    perSampleMissingness,
    perGroupMissingness,
    featuresWithCompleteGroupDropout,
  );

  return MissingnessProfileSchema.parse({
    datasetId,
    policyVersion: policy.version,
    overallFeatureMissingFraction,
    perFeatureMissingness,
    perSampleMissingness,
    perGroupMissingness,
    featuresWithCompleteGroupDropout,
    summaryBand,
  });
}
