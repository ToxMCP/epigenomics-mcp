import { z } from "zod";
import type { EpigenomicFeature } from "../contracts/features.js";
import type { ExperimentalDesign } from "../contracts/design.js";
import {
  VarianceProfileSchema,
} from "../contracts/qc.js";
import type {
  VarianceProfile,
  FeatureVariance,
  DynamicRangeBand,
  ReplicateStabilityBand,
} from "../contracts/qc.js";

/**
 * Versioned policy configuration for variance and dynamic-range thresholds.
 */
export const VariancePolicySchema = z
  .object({
    version: z.string().min(1),
    highDynamicRangeThreshold: z.number().nonnegative(),
    moderateDynamicRangeThreshold: z.number().nonnegative(),
    stableReplicateCorrelationThreshold: z.number().min(-1).max(1),
    unstableReplicateCorrelationThreshold: z.number().min(-1).max(1),
  })
  .strict()
  .refine(
    (p) => p.highDynamicRangeThreshold >= p.moderateDynamicRangeThreshold,
    {
      message: "highDynamicRangeThreshold must be >= moderateDynamicRangeThreshold",
      path: ["highDynamicRangeThreshold"],
    },
  )
  .refine(
    (p) => p.stableReplicateCorrelationThreshold >= p.unstableReplicateCorrelationThreshold,
    {
      message: "stableReplicateCorrelationThreshold must be >= unstableReplicateCorrelationThreshold",
      path: ["stableReplicateCorrelationThreshold"],
    },
  );

export type VariancePolicy = z.infer<typeof VariancePolicySchema>;

/**
 * Default variance policy for v0.1.
 *
 * Thresholds are chosen for beta-value (0-1) epigenomic data.
 */
export const DEFAULT_VARIANCE_POLICY: VariancePolicy = {
  version: "v1.0.0",
  highDynamicRangeThreshold: 0.01,
  moderateDynamicRangeThreshold: 0.001,
  stableReplicateCorrelationThreshold: 0.9,
  unstableReplicateCorrelationThreshold: 0.7,
};

const NEAR_ZERO = 1e-12;
const DECIMAL_PLACES = 10;

function isMissing(value: number | null | undefined): boolean {
  return value === null || value === undefined || Number.isNaN(value);
}

function roundN(value: number): number {
  const factor = 10 ** DECIMAL_PLACES;
  return Math.round(value * factor) / factor;
}

function computeMean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  return sum / values.length;
}

function computeSampleVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = computeMean(values) as number;
  let sqDiffSum = 0;
  for (const v of values) {
    const diff = v - mean;
    sqDiffSum += diff * diff;
  }
  return sqDiffSum / (values.length - 1);
}

function computeCv(variance: number, mean: number): number | null {
  if (Math.abs(mean) < NEAR_ZERO) return null;
  const sd = Math.sqrt(variance);
  return sd / Math.abs(mean);
}

function assignDynamicRangeBand(
  variance: number,
  presentCount: number,
  policy: VariancePolicy,
): DynamicRangeBand {
  if (presentCount < 2) return "not_applicable";
  if (variance >= policy.highDynamicRangeThreshold) return "high";
  if (variance >= policy.moderateDynamicRangeThreshold) return "moderate";
  return "low";
}

/**
 * Compute Pearson correlation between two numeric arrays.
 *
 * Scientific assumption: both arrays have the same length and contain
 * no missing values. Returns null when variance in either array is zero.
 */
function pearsonCorrelation(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n === 0 || n !== y.length) return null;

  const meanX = computeMean(x) as number;
  const meanY = computeMean(y) as number;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den < NEAR_ZERO) return null;
  return num / den;
}

/**
 * Compute replicate-stability statistics from pairwise correlations.
 *
 * For each dose group, computes all pairwise Pearson correlations between
 * biological replicates. Returns mean and min correlation across all pairs
 * and groups.
 */
function computeReplicateStability(
  features: EpigenomicFeature[],
  design: ExperimentalDesign,
  policy: VariancePolicy,
): { meanCorrelation: number | undefined; minCorrelation: number | undefined; stabilityBand: ReplicateStabilityBand } {
  const groupSamples = new Map<string, string[]>();
  for (const sample of design.samples) {
    // Skip technical replicates for stability assessment
    if (sample.replicateType === "technical") continue;
    const list = groupSamples.get(sample.doseGroupId) ?? [];
    list.push(sample.sampleId);
    groupSamples.set(sample.doseGroupId, list);
  }

  const allCorrelations: number[] = [];

  for (const doseGroup of design.doseGroups) {
    const sampleIds = groupSamples.get(doseGroup.doseGroupId) ?? [];
    if (sampleIds.length < 2) continue;

    // For each pair of samples in the group, compute correlation across features
    for (let i = 0; i < sampleIds.length; i++) {
      for (let j = i + 1; j < sampleIds.length; j++) {
        const s1 = sampleIds[i];
        const s2 = sampleIds[j];

        const pairValues1: number[] = [];
        const pairValues2: number[] = [];

        for (const feature of features) {
          const v1 = feature.values[s1];
          const v2 = feature.values[s2];
          if (!isMissing(v1) && !isMissing(v2)) {
            pairValues1.push(v1 as number);
            pairValues2.push(v2 as number);
          }
        }

        if (pairValues1.length < 2) continue;
        const r = pearsonCorrelation(pairValues1, pairValues2);
        if (r !== null) {
          allCorrelations.push(roundN(r));
        }
      }
    }
  }

  if (allCorrelations.length === 0) {
    return {
      meanCorrelation: undefined,
      minCorrelation: undefined,
      stabilityBand: "not_assessed",
    };
  }

  // Deterministic: sort correlations before aggregation
  allCorrelations.sort((a, b) => a - b);

  const meanCorrelation = roundN(allCorrelations.reduce((sum, c) => sum + c, 0) / allCorrelations.length);
  const minCorrelation = roundN(allCorrelations[0]);

  let stabilityBand: ReplicateStabilityBand;
  if (meanCorrelation >= policy.stableReplicateCorrelationThreshold &&
      minCorrelation >= policy.unstableReplicateCorrelationThreshold) {
    stabilityBand = "stable";
  } else {
    stabilityBand = "unstable";
  }

  return { meanCorrelation, minCorrelation, stabilityBand };
}

function computeSummaryBand(
  perFeature: FeatureVariance[],
  replicateStability: ReplicateStabilityBand,
): "acceptable" | "warning" | "exclusion" | "not_applicable" {
  if (perFeature.length === 0) return "not_applicable";

  const bands = new Set(perFeature.map((f) => f.dynamicRangeBand));
  const hasLowDynamicRange = bands.has("low");
  const hasNotApplicable = bands.has("not_applicable");

  if (replicateStability === "unstable") return "warning";
  if (hasNotApplicable && perFeature.every((f) => f.dynamicRangeBand === "not_applicable")) {
    return "not_applicable";
  }
  if (hasLowDynamicRange) return "warning";
  return "acceptable";
}

/**
 * Compute a deterministic variance profile for an epigenomics dataset.
 *
 * Computes per-feature variance, coefficient of variation, dynamic-range
 * bands, and replicate-stability metrics. All floating-point outputs are
 * rounded to a fixed number of decimal places for byte-stable JSON.
 *
 * Fail-closed: features with insufficient present values emit zero variance
 * and the "not_applicable" dynamic-range band.
 */
export function profileVariance(
  datasetId: string,
  features: EpigenomicFeature[],
  design: ExperimentalDesign,
  policy: VariancePolicy = DEFAULT_VARIANCE_POLICY,
): VarianceProfile {
  const perFeatureVariance: FeatureVariance[] = [];

  for (const feature of features) {
    const presentValues: number[] = [];
    for (const sample of design.samples) {
      const raw = feature.values[sample.sampleId];
      if (!isMissing(raw)) {
        presentValues.push(raw as number);
      }
    }

    const variance = roundN(computeSampleVariance(presentValues));
    const mean = computeMean(presentValues);
    const cv = mean !== null ? computeCv(variance, mean) : null;

    const featureVariance: FeatureVariance = {
      featureId: feature.featureId,
      variance,
      ...(cv !== null ? { coefficientOfVariation: roundN(cv) } : {}),
      dynamicRangeBand: assignDynamicRangeBand(variance, presentValues.length, policy),
    };

    perFeatureVariance.push(featureVariance);
  }

  // Stable ordering: sort by featureId lexicographically
  perFeatureVariance.sort((a, b) => a.featureId.localeCompare(b.featureId));

  const { meanCorrelation, minCorrelation, stabilityBand } = computeReplicateStability(
    features,
    design,
    policy,
  );

  const summaryBand = computeSummaryBand(perFeatureVariance, stabilityBand);

  return VarianceProfileSchema.parse({
    datasetId,
    policyVersion: policy.version,
    perFeatureVariance,
    ...(meanCorrelation !== undefined
      ? {
          replicateStability: {
            meanCorrelation,
            minCorrelation,
            stabilityBand,
          },
        }
      : {}),
    summaryBand,
  });
}
