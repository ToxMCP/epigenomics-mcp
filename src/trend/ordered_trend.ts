import { z } from "zod";
import type { EpigenomicsFeatureResponsePacket } from "../contracts/packets.js";
import { DesignValidationResultSchema, validateDesign } from "../validators/design.js";

const DEFAULT_EXACT_ENUMERATION_LIMIT = 50_000;
const MAX_RESAMPLING_COMPARISONS = 100_000_000;
const EXACT_DISTRIBUTION_CACHE_LIMIT = 128;

export const PAdjustmentMethodSchema = z.enum([
  "benjamini_yekutieli",
  "benjamini_hochberg",
]);
export type PAdjustmentMethod = z.infer<typeof PAdjustmentMethodSchema>;

export const OrderedTrendBlockerSchema = z.enum([
  "structurally_invalid_design",
  "no_zero_dose_control",
  "negative_dose_value",
  "insufficient_distinct_dose_levels",
  "mixed_dose_units",
  "multi_timepoint_design",
  "multi_batch_design_not_supported",
  "undeclared_or_non_biological_replicate_type",
  "insufficient_observations_per_dose",
  "missing_value",
  "non_finite_value",
]);
export type OrderedTrendBlocker = z.infer<typeof OrderedTrendBlockerSchema>;

const DoseObservationCountSchema = z
  .object({
    doseValue: z.number().finite(),
    doseGroupIds: z.array(z.string().min(1)).min(1),
    sampleCount: z.number().int().nonnegative(),
    observedCount: z.number().int().nonnegative(),
  })
  .strict();

const PermutationEvidenceSchema = z
  .object({
    mode: z.enum(["exact", "monte_carlo"]),
    totalLabelAllocations: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .describe("Exact multinomial count serialized as a decimal integer"),
    evaluatedPermutations: z.number().int().positive(),
    requestedRandomPermutations: z.number().int().positive(),
    permutationSeed: z.number().int().nonnegative().nullable(),
    pValueResolution: z.number().positive().max(1),
    monteCarloStandardErrorTwoSided: z
      .number()
      .finite()
      .nonnegative()
      .nullable(),
  })
  .strict();

const OrderedPairEffectIntervalSchema = z
  .object({
    method: z.literal("dose_stratified_percentile_bootstrap"),
    confidenceLevel: z.number().min(0.8).max(0.99),
    lower: z.number().min(-1).max(1),
    upper: z.number().min(-1).max(1),
    bootstrapResamples: z.number().int().positive(),
    bootstrapSeed: z.number().int().nonnegative(),
    simultaneousAcrossFeatures: z.literal(false),
  })
  .strict();

const OrderedTrendTestSchema = z
  .object({
    statistic: z.number().finite().nonnegative(),
    maximumStatistic: z.number().finite().positive(),
    orderedPairProbability: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "Probability that a higher-dose observation exceeds a lower-dose observation, with half credit for ties",
      ),
    orderedPairEffect: z
      .number()
      .min(-1)
      .max(1)
      .describe("Centered ordered-pair probability: 2p - 1"),
    direction: z.enum([
      "increasing",
      "decreasing",
      "no_ordered_direction",
    ]),
    pValueTwoSided: z.number().min(0).max(1),
    pValueIncreasing: z.number().min(0).max(1),
    pValueDecreasing: z.number().min(0).max(1),
    adjustedPValueTwoSided: z.number().min(0).max(1),
    passesFdrThreshold: z.boolean(),
    statisticalEvidence: z.enum([
      "fdr_below_threshold",
      "not_below_threshold",
    ]),
    permutation: PermutationEvidenceSchema,
    effectInterval: OrderedPairEffectIntervalSchema,
  })
  .strict();

export const FeatureOrderedTrendAssessmentSchema = z
  .object({
    featureId: z.string().min(1),
    signalMetric: z.string().min(1),
    assessmentStatus: z.enum(["assessed", "not_assessed"]),
    assessmentBlockers: z.array(OrderedTrendBlockerSchema),
    doseObservationCounts: z.array(DoseObservationCountSchema).min(1),
    test: OrderedTrendTestSchema.nullable(),
  })
  .strict();
export type FeatureOrderedTrendAssessment = z.infer<
  typeof FeatureOrderedTrendAssessmentSchema
>;

export const OrderedTrendAssessmentResultSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    schemaName: z.literal("OrderedTrendAssessmentResult"),
    sourcePacketRef: z.string().min(1),
    datasetId: z.string().min(1),
    designValidation: DesignValidationResultSchema,
    method: z
      .object({
        name: z.literal("jonckheere_terpstra_permutation"),
        doseScale: z.literal("ordinal_numeric_order"),
        numericalDoseSpacingUsed: z.literal(false),
        nullHypothesis: z.literal(
          "exchangeable_response_distributions_across_ordered_dose_groups",
        ),
        alternative: z.literal("ordered_location_shift"),
        tieHandling: z.literal("half_credit"),
        independentSamplesRequired: z.literal(true),
        twoSidedPValueUsedForMultiplicity: z.literal(true),
      })
      .strict(),
    resamplingPolicy: z
      .object({
        exactEnumerationLimit: z.number().int().positive(),
        requestedRandomPermutations: z.number().int().positive(),
        bootstrapResamples: z.number().int().positive(),
        confidenceLevel: z.number().min(0.8).max(0.99),
        seed: z.number().int().nonnegative(),
        pseudoRandomGenerator: z.literal("xorshift32_v1"),
        maximumPairComparisons: z.number().int().positive(),
      })
      .strict(),
    multiplicity: z
      .object({
        method: PAdjustmentMethodSchema,
        fdrThreshold: z.number().positive().max(0.25),
        familyDefinition: z.literal("bounded_packet_feature_slice"),
        packetFeatureCount: z.number().int().nonnegative(),
        offset: z.number().int().nonnegative(),
        requestedLimit: z.number().int().positive(),
        selectedFeatureCount: z.number().int().nonnegative(),
        testedFeatureCount: z.number().int().nonnegative(),
        coversEntirePacket: z.boolean(),
        scopeWarning: z
          .string()
          .min(1)
          .nullable()
          .describe("Warning when the adjusted family is not the complete packet"),
      })
      .strict(),
    features: z.array(FeatureOrderedTrendAssessmentSchema),
    scientificScope: z
      .object({
        interpretationBoundary: z.literal(
          "exploratory_ordered_trend_evidence_only",
        ),
        trendSignificance: z.literal(
          "assessed_with_permutation_p_values_and_bounded_family_adjustment",
        ),
        biologicalSignificance: z.literal("not_assessed"),
        causalInference: z.literal("not_assessed"),
        bmdSuitability: z.literal("not_assessed"),
        featureQualificationChanged: z.literal(false),
        independenceAndExchangeability: z.literal(
          "required_but_not_verified_by_sample_metadata",
        ),
        bootstrapIntervals: z.literal(
          "pointwise_exploratory_not_simultaneous",
        ),
      })
      .strict(),
  })
  .strict();
export type OrderedTrendAssessmentResult = z.infer<
  typeof OrderedTrendAssessmentResultSchema
>;

export interface AssessOrderedTrendsOptions {
  offset?: number;
  limit?: number;
  permutationResamples?: number;
  bootstrapResamples?: number;
  confidenceLevel?: number;
  seed?: number;
  fdrThreshold?: number;
  pAdjustmentMethod?: PAdjustmentMethod;
  exactEnumerationLimit?: number;
}

const AssessOrderedTrendsCoreOptionsSchema = z
  .object({
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(100).default(25),
    permutationResamples: z
      .number()
      .int()
      .min(99)
      .max(99_999)
      .default(4_999),
    bootstrapResamples: z
      .number()
      .int()
      .min(199)
      .max(19_999)
      .default(1_999),
    confidenceLevel: z.number().min(0.8).max(0.99).default(0.95),
    seed: z.number().int().min(0).max(0xffff_ffff).default(2_026_072_7),
    fdrThreshold: z.number().positive().max(0.25).default(0.05),
    pAdjustmentMethod: PAdjustmentMethodSchema.default(
      "benjamini_yekutieli",
    ),
    exactEnumerationLimit: z
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .default(DEFAULT_EXACT_ENUMERATION_LIMIT),
  })
  .strict();

interface OrderedDoseValues {
  doseValue: number;
  doseGroupIds: string[];
  sampleIds: string[];
  values: number[];
}

interface RawTrendTest {
  statistic: number;
  maximumStatistic: number;
  orderedPairProbability: number;
  orderedPairEffect: number;
  direction: "increasing" | "decreasing" | "no_ordered_direction";
  pValueTwoSided: number;
  pValueIncreasing: number;
  pValueDecreasing: number;
  permutation: z.infer<typeof PermutationEvidenceSchema>;
  effectInterval: z.infer<typeof OrderedPairEffectIntervalSchema>;
}

export interface OrderedTrendPermutationCoreOptions {
  permutationResamples: number;
  seed: number;
  exactEnumerationLimit?: number;
}

export interface OrderedTrendPermutationCoreResult {
  statistic: number;
  maximumStatistic: number;
  orderedPairProbability: number;
  orderedPairEffect: number;
  pValueTwoSided: number;
  pValueIncreasing: number;
  pValueDecreasing: number;
  mode: "exact" | "monte_carlo";
  totalLabelAllocations: string;
  evaluatedPermutations: number;
  pValueResolution: number;
  monteCarloStandardErrorTwoSided: number | null;
}

function comparisonScore(lowerDoseValue: number, higherDoseValue: number): number {
  if (higherDoseValue > lowerDoseValue) return 1;
  if (higherDoseValue < lowerDoseValue) return 0;
  return 0.5;
}

function orderedStatistic(groups: number[][]): {
  statistic: number;
  maximum: number;
} {
  let statistic = 0;
  let maximum = 0;
  for (let lower = 0; lower < groups.length - 1; lower++) {
    for (let higher = lower + 1; higher < groups.length; higher++) {
      maximum += groups[lower].length * groups[higher].length;
      for (const lowerValue of groups[lower]) {
        for (const higherValue of groups[higher]) {
          statistic += comparisonScore(lowerValue, higherValue);
        }
      }
    }
  }
  return { statistic, maximum };
}

function statisticForLabels(values: number[], labels: number[]): number {
  let statistic = 0;
  for (let first = 0; first < values.length - 1; first++) {
    for (let second = first + 1; second < values.length; second++) {
      if (labels[first] === labels[second]) continue;
      if (labels[first] < labels[second]) {
        statistic += comparisonScore(values[first], values[second]);
      } else {
        statistic += comparisonScore(values[second], values[first]);
      }
    }
  }
  return statistic;
}

function factorial(value: number): bigint {
  let result = 1n;
  for (let current = 2n; current <= BigInt(value); current++) {
    result *= current;
  }
  return result;
}

function multinomialCount(groupSizes: number[]): bigint {
  const total = groupSizes.reduce((sum, size) => sum + size, 0);
  return groupSizes.reduce(
    (count, size) => count / factorial(size),
    factorial(total),
  );
}

function enumerateLabels(
  counts: number[],
  callback: (labels: number[]) => void,
): void {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const labels = new Array<number>(total);

  function visit(position: number): void {
    if (position === total) {
      callback(labels);
      return;
    }
    for (let label = 0; label < counts.length; label++) {
      if (counts[label] === 0) continue;
      counts[label]--;
      labels[position] = label;
      visit(position + 1);
      counts[label]++;
    }
  }

  visit(0);
}

function xorshift32(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e37_79b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function fnv1a(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

function derivedSeed(baseSeed: number, featureId: string, salt: string): number {
  return (baseSeed ^ fnv1a(featureId) ^ fnv1a(salt)) >>> 0;
}

function shuffledLabels(labels: number[], random: () => number): number[] {
  const shuffled = [...labels];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function percentile(sortedValues: number[], probability: number): number {
  const position = probability * (sortedValues.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const fraction = position - lower;
  return (
    sortedValues[lower] * (1 - fraction) +
    sortedValues[upper] * fraction
  );
}

function bootstrapEffectInterval(
  groups: number[][],
  confidenceLevel: number,
  resamples: number,
  seed: number,
): z.infer<typeof OrderedPairEffectIntervalSchema> {
  const random = xorshift32(seed);
  const effects: number[] = [];
  for (let iteration = 0; iteration < resamples; iteration++) {
    const resampledGroups = groups.map((group) =>
      group.map(() => group[Math.floor(random() * group.length)]),
    );
    const { statistic, maximum } = orderedStatistic(resampledGroups);
    effects.push((2 * statistic) / maximum - 1);
  }
  effects.sort((left, right) => left - right);
  const tail = (1 - confidenceLevel) / 2;
  return {
    method: "dose_stratified_percentile_bootstrap",
    confidenceLevel,
    lower: percentile(effects, tail),
    upper: percentile(effects, 1 - tail),
    bootstrapResamples: resamples,
    bootstrapSeed: seed,
    simultaneousAcrossFeatures: false,
  };
}

function exactPermutationPValues(
  values: number[],
  groupSizes: number[],
  observed: number,
  maximum: number,
): {
  twoSided: number;
  increasing: number;
  decreasing: number;
  evaluated: number;
} {
  const center = maximum / 2;
  const observedDistance = Math.abs(observed - center);
  const distribution = exactStatisticDistribution(values, groupSizes);
  let twoSidedExtreme = 0;
  let increasingExtreme = 0;
  let decreasingExtreme = 0;
  for (const [statistic, count] of distribution.counts) {
    if (Math.abs(statistic - center) >= observedDistance - Number.EPSILON) {
      twoSidedExtreme += count;
    }
    if (statistic >= observed - Number.EPSILON) increasingExtreme += count;
    if (statistic <= observed + Number.EPSILON) decreasingExtreme += count;
  }
  return {
    twoSided: twoSidedExtreme / distribution.evaluated,
    increasing: increasingExtreme / distribution.evaluated,
    decreasing: decreasingExtreme / distribution.evaluated,
    evaluated: distribution.evaluated,
  };
}

interface ExactStatisticDistribution {
  counts: Map<number, number>;
  evaluated: number;
}

const exactDistributionCache = new Map<string, ExactStatisticDistribution>();

function canonicalTiePattern(values: number[]): string {
  const orderedUnique = [...new Set(values)].sort((left, right) => left - right);
  const rankByValue = new Map(
    orderedUnique.map((value, rank) => [value, rank]),
  );
  return values
    .map((value) => rankByValue.get(value))
    .sort((left, right) => (left ?? 0) - (right ?? 0))
    .join(",");
}

function exactStatisticDistribution(
  values: number[],
  groupSizes: number[],
): ExactStatisticDistribution {
  const canonicalValues = canonicalTiePattern(values)
    .split(",")
    .map(Number);
  const cacheKey = `${groupSizes.join(",")}|${canonicalValues.join(",")}`;
  const cached = exactDistributionCache.get(cacheKey);
  if (cached) return cached;

  const counts = new Map<number, number>();
  let evaluated = 0;
  enumerateLabels([...groupSizes], (labels) => {
    const statistic = statisticForLabels(canonicalValues, labels);
    counts.set(statistic, (counts.get(statistic) ?? 0) + 1);
    evaluated++;
  });
  const distribution = { counts, evaluated };
  if (exactDistributionCache.size >= EXACT_DISTRIBUTION_CACHE_LIMIT) {
    const oldest = exactDistributionCache.keys().next().value as
      | string
      | undefined;
    if (oldest !== undefined) exactDistributionCache.delete(oldest);
  }
  exactDistributionCache.set(cacheKey, distribution);
  return distribution;
}

function monteCarloPermutationPValues(
  values: number[],
  groupSizes: number[],
  observed: number,
  maximum: number,
  resamples: number,
  seed: number,
): {
  twoSided: number;
  increasing: number;
  decreasing: number;
} {
  const labels = groupSizes.flatMap((size, groupIndex) =>
    Array.from({ length: size }, () => groupIndex),
  );
  const random = xorshift32(seed);
  const center = maximum / 2;
  const observedDistance = Math.abs(observed - center);
  let twoSidedExtreme = 0;
  let increasingExtreme = 0;
  let decreasingExtreme = 0;
  for (let iteration = 0; iteration < resamples; iteration++) {
    const statistic = statisticForLabels(
      values,
      shuffledLabels(labels, random),
    );
    if (Math.abs(statistic - center) >= observedDistance - Number.EPSILON) {
      twoSidedExtreme++;
    }
    if (statistic >= observed - Number.EPSILON) increasingExtreme++;
    if (statistic <= observed + Number.EPSILON) decreasingExtreme++;
  }
  return {
    twoSided: (twoSidedExtreme + 1) / (resamples + 1),
    increasing: (increasingExtreme + 1) / (resamples + 1),
    decreasing: (decreasingExtreme + 1) / (resamples + 1),
  };
}

/**
 * Shared inference core used by the packet assessment and the release
 * calibration harness. It intentionally excludes bootstrap and multiplicity
 * work so repeated simulations exercise the production permutation algorithm
 * without doing scientifically irrelevant resampling.
 */
export function computeOrderedTrendPermutationCore(
  groups: number[][],
  options: OrderedTrendPermutationCoreOptions,
): OrderedTrendPermutationCoreResult {
  if (groups.length < 3 || groups.some((group) => group.length < 2)) {
    throw new RangeError(
      "Ordered-trend inference requires at least three groups with two observations each.",
    );
  }
  if (groups.flat().some((value) => !Number.isFinite(value))) {
    throw new TypeError("Ordered-trend inference requires finite values.");
  }
  if (
    !Number.isInteger(options.permutationResamples) ||
    options.permutationResamples < 1
  ) {
    throw new RangeError("permutationResamples must be a positive integer.");
  }
  if (
    !Number.isInteger(options.seed) ||
    options.seed < 0 ||
    options.seed > 0xffff_ffff
  ) {
    throw new RangeError("seed must be an unsigned 32-bit integer.");
  }
  const exactEnumerationLimit =
    options.exactEnumerationLimit ?? DEFAULT_EXACT_ENUMERATION_LIMIT;
  if (!Number.isInteger(exactEnumerationLimit) || exactEnumerationLimit < 1) {
    throw new RangeError("exactEnumerationLimit must be a positive integer.");
  }

  const groupSizes = groups.map((group) => group.length);
  const values = groups.flat();
  const observed = orderedStatistic(groups);
  const totalAllocations = multinomialCount(groupSizes);
  const pairCount = (values.length * (values.length - 1)) / 2;
  const exactWork = totalAllocations * BigInt(pairCount);
  const useExact =
    totalAllocations <= BigInt(exactEnumerationLimit) &&
    totalAllocations <= BigInt(options.permutationResamples + 1) &&
    exactWork <= BigInt(MAX_RESAMPLING_COMPARISONS);

  let pValues: {
    twoSided: number;
    increasing: number;
    decreasing: number;
  };
  let evaluatedPermutations: number;
  if (useExact) {
    const exact = exactPermutationPValues(
      values,
      groupSizes,
      observed.statistic,
      observed.maximum,
    );
    pValues = exact;
    evaluatedPermutations = exact.evaluated;
  } else {
    pValues = monteCarloPermutationPValues(
      values,
      groupSizes,
      observed.statistic,
      observed.maximum,
      options.permutationResamples,
      options.seed,
    );
    evaluatedPermutations = options.permutationResamples;
  }
  const orderedPairProbability = observed.statistic / observed.maximum;
  const pValueResolution = useExact
    ? 1 / evaluatedPermutations
    : 1 / (options.permutationResamples + 1);

  return {
    statistic: observed.statistic,
    maximumStatistic: observed.maximum,
    orderedPairProbability,
    orderedPairEffect: 2 * orderedPairProbability - 1,
    pValueTwoSided: pValues.twoSided,
    pValueIncreasing: pValues.increasing,
    pValueDecreasing: pValues.decreasing,
    mode: useExact ? "exact" : "monte_carlo",
    totalLabelAllocations: totalAllocations.toString(),
    evaluatedPermutations,
    pValueResolution,
    monteCarloStandardErrorTwoSided: useExact
      ? null
      : Math.sqrt(
          (pValues.twoSided * (1 - pValues.twoSided)) /
            (options.permutationResamples + 1),
        ),
  };
}

/** Shared pointwise interval core used by production and calibration. */
export function computeOrderedPairEffectInterval(
  groups: number[][],
  confidenceLevel: number,
  resamples: number,
  seed: number,
): z.infer<typeof OrderedPairEffectIntervalSchema> {
  return bootstrapEffectInterval(groups, confidenceLevel, resamples, seed);
}

export function adjustPValues(
  pValues: number[],
  method: PAdjustmentMethod,
): number[] {
  if (pValues.length === 0) return [];
  const correction =
    method === "benjamini_yekutieli"
      ? Array.from({ length: pValues.length }, (_, index) => 1 / (index + 1))
          .reduce((sum, value) => sum + value, 0)
      : 1;
  const ranked = pValues
    .map((pValue, index) => ({ pValue, index }))
    .sort((left, right) =>
      left.pValue === right.pValue
        ? left.index - right.index
        : left.pValue - right.pValue,
    );
  const adjusted = new Array<number>(pValues.length);
  let runningMinimum = 1;
  for (let rankIndex = ranked.length - 1; rankIndex >= 0; rankIndex--) {
    const rank = rankIndex + 1;
    const candidate = Math.min(
      1,
      (ranked[rankIndex].pValue * ranked.length * correction) / rank,
    );
    runningMinimum = Math.min(runningMinimum, candidate);
    adjusted[ranked[rankIndex].index] = runningMinimum;
  }
  return adjusted;
}

function designBlockers(
  packet: EpigenomicsFeatureResponsePacket,
  structurallyValid: boolean,
): OrderedTrendBlocker[] {
  const blockers: OrderedTrendBlocker[] = [];
  const doseValues = Array.from(
    new Set(packet.design.doseGroups.map((group) => group.doseValue)),
  );
  if (!structurallyValid) blockers.push("structurally_invalid_design");
  if (!doseValues.includes(0)) blockers.push("no_zero_dose_control");
  if (doseValues.some((dose) => dose < 0)) blockers.push("negative_dose_value");
  if (doseValues.length < 3) {
    blockers.push("insufficient_distinct_dose_levels");
  }
  if (
    new Set(packet.design.doseGroups.map((group) => group.doseUnit)).size > 1
  ) {
    blockers.push("mixed_dose_units");
  }
  const timepoints = new Set(
    packet.design.doseGroups.map((group) =>
      group.timepointHours === undefined
        ? "unspecified"
        : String(group.timepointHours),
    ),
  );
  if (timepoints.size > 1) blockers.push("multi_timepoint_design");

  const batches = new Set(
    packet.design.samples.map((sample) => sample.batchId ?? "unspecified"),
  );
  if (batches.size > 1) blockers.push("multi_batch_design_not_supported");
  if (
    packet.design.samples.some(
      (sample) => sample.replicateType !== "biological",
    )
  ) {
    blockers.push("undeclared_or_non_biological_replicate_type");
  }
  return blockers;
}

function orderedDoseValues(
  packet: EpigenomicsFeatureResponsePacket,
  feature: EpigenomicsFeatureResponsePacket["features"][number],
): {
  groups: OrderedDoseValues[];
  blockers: OrderedTrendBlocker[];
} {
  const groupsByDose = new Map<number, OrderedDoseValues>();
  const doseByGroupId = new Map(
    packet.design.doseGroups.map((group) => [
      group.doseGroupId,
      group.doseValue,
    ]),
  );
  for (const doseGroup of packet.design.doseGroups) {
    const existing = groupsByDose.get(doseGroup.doseValue);
    if (existing) {
      existing.doseGroupIds.push(doseGroup.doseGroupId);
    } else {
      groupsByDose.set(doseGroup.doseValue, {
        doseValue: doseGroup.doseValue,
        doseGroupIds: [doseGroup.doseGroupId],
        sampleIds: [],
        values: [],
      });
    }
  }

  const blockers: OrderedTrendBlocker[] = [];
  for (const sample of packet.design.samples) {
    const doseValue = doseByGroupId.get(sample.doseGroupId);
    if (doseValue === undefined) continue;
    const group = groupsByDose.get(doseValue);
    if (!group) continue;
    group.sampleIds.push(sample.sampleId);
    const value = feature.values[sample.sampleId];
    if (value === null || value === undefined) {
      if (!blockers.includes("missing_value")) blockers.push("missing_value");
    } else if (!Number.isFinite(value)) {
      if (!blockers.includes("non_finite_value")) {
        blockers.push("non_finite_value");
      }
    } else {
      group.values.push(value);
    }
  }

  const groups = Array.from(groupsByDose.values()).sort(
    (left, right) => left.doseValue - right.doseValue,
  );
  for (const group of groups) group.doseGroupIds.sort();
  if (groups.some((group) => group.values.length < 2)) {
    blockers.push("insufficient_observations_per_dose");
  }
  return { groups, blockers };
}

function assessFeature(
  featureId: string,
  groups: OrderedDoseValues[],
  options: z.infer<typeof AssessOrderedTrendsCoreOptionsSchema>,
): RawTrendTest {
  const numericGroups = groups.map((group) => group.values);
  const permutationSeed = derivedSeed(options.seed, featureId, "permutation");
  const core = computeOrderedTrendPermutationCore(numericGroups, {
    permutationResamples: options.permutationResamples,
    seed: permutationSeed,
    exactEnumerationLimit: options.exactEnumerationLimit,
  });
  const permutation: z.infer<typeof PermutationEvidenceSchema> = {
    mode: core.mode,
    totalLabelAllocations: core.totalLabelAllocations,
    evaluatedPermutations: core.evaluatedPermutations,
    requestedRandomPermutations: options.permutationResamples,
    permutationSeed: core.mode === "exact" ? null : permutationSeed,
    pValueResolution: core.pValueResolution,
    monteCarloStandardErrorTwoSided:
      core.monteCarloStandardErrorTwoSided,
  };
  const bootstrapSeed = derivedSeed(options.seed, featureId, "bootstrap");
  return {
    statistic: core.statistic,
    maximumStatistic: core.maximumStatistic,
    orderedPairProbability: core.orderedPairProbability,
    orderedPairEffect: core.orderedPairEffect,
    direction:
      core.orderedPairEffect > 0
        ? "increasing"
        : core.orderedPairEffect < 0
          ? "decreasing"
          : "no_ordered_direction",
    pValueTwoSided: core.pValueTwoSided,
    pValueIncreasing: core.pValueIncreasing,
    pValueDecreasing: core.pValueDecreasing,
    permutation,
    effectInterval: computeOrderedPairEffectInterval(
      numericGroups,
      options.confidenceLevel,
      options.bootstrapResamples,
      bootstrapSeed,
    ),
  };
}

function estimatedResamplingComparisons(
  groups: OrderedDoseValues[],
  featureCount: number,
  options: z.infer<typeof AssessOrderedTrendsCoreOptionsSchema>,
): number {
  const sampleCount = groups.reduce(
    (sum, group) => sum + group.values.length,
    0,
  );
  const allPairs = (sampleCount * (sampleCount - 1)) / 2;
  const crossDosePairs = groups.reduce(
    (sum, group, index) =>
      sum +
      group.values.length *
        groups
          .slice(index + 1)
          .reduce((rest, later) => rest + later.values.length, 0),
    0,
  );
  return (
    featureCount *
    (options.permutationResamples * allPairs +
      options.bootstrapResamples * crossDosePairs)
  );
}

/**
 * Assess exploratory ordered-trend evidence on independent biological
 * replicate values. Numerical dose spacing is intentionally ignored: this is
 * an ordered-alternative test, not a fitted dose-response or BMD model.
 */
export function assessOrderedTrends(
  packet: EpigenomicsFeatureResponsePacket,
  rawOptions: AssessOrderedTrendsOptions = {},
): OrderedTrendAssessmentResult {
  const options = AssessOrderedTrendsCoreOptionsSchema.parse(rawOptions);
  const designValidation = validateDesign(packet.design);
  const sharedBlockers = designBlockers(
    packet,
    designValidation.structurallyValid,
  );
  const selectedFeatures = packet.features.slice(
    options.offset,
    options.offset + options.limit,
  );
  const prepared = selectedFeatures.map((feature) => ({
    feature,
    ...orderedDoseValues(packet, feature),
  }));

  const firstAssessable = prepared.find(
    (entry) =>
      sharedBlockers.length === 0 &&
      entry.blockers.length === 0,
  );
  if (firstAssessable) {
    const estimate = estimatedResamplingComparisons(
      firstAssessable.groups,
      prepared.length,
      options,
    );
    if (estimate > MAX_RESAMPLING_COMPARISONS) {
      throw new RangeError(
        `Requested trend family exceeds the ${MAX_RESAMPLING_COMPARISONS.toLocaleString("en-US")} pair-comparison resampling budget (estimated ${Math.ceil(estimate).toLocaleString("en-US")}). Reduce limit, permutationResamples, or bootstrapResamples.`,
      );
    }
  }

  const assessments = prepared.map(
    ({ feature, groups, blockers }): FeatureOrderedTrendAssessment => {
      const combinedBlockers = Array.from(
        new Set([...sharedBlockers, ...blockers]),
      );
      const doseObservationCounts = groups.map((group) => ({
        doseValue: group.doseValue,
        doseGroupIds: group.doseGroupIds,
        sampleCount: group.sampleIds.length,
        observedCount: group.values.length,
      }));
      if (combinedBlockers.length > 0) {
        return {
          featureId: feature.featureId,
          signalMetric: feature.signalMetric,
          assessmentStatus: "not_assessed",
          assessmentBlockers: combinedBlockers,
          doseObservationCounts,
          test: null,
        };
      }
      const test = assessFeature(feature.featureId, groups, options);
      return {
        featureId: feature.featureId,
        signalMetric: feature.signalMetric,
        assessmentStatus: "assessed",
        assessmentBlockers: [],
        doseObservationCounts,
        test: {
          ...test,
          adjustedPValueTwoSided: 1,
          passesFdrThreshold: false,
          statisticalEvidence: "not_below_threshold",
        },
      };
    },
  );

  const tested = assessments.filter(
    (
      assessment,
    ): assessment is FeatureOrderedTrendAssessment & {
      test: NonNullable<FeatureOrderedTrendAssessment["test"]>;
    } => assessment.test !== null,
  );
  const adjustedPValues = adjustPValues(
    tested.map((assessment) => assessment.test.pValueTwoSided),
    options.pAdjustmentMethod,
  );
  tested.forEach((assessment, index) => {
    const adjusted = adjustedPValues[index];
    assessment.test.adjustedPValueTwoSided = adjusted;
    assessment.test.passesFdrThreshold = adjusted <= options.fdrThreshold;
    assessment.test.statisticalEvidence =
      adjusted <= options.fdrThreshold
        ? "fdr_below_threshold"
        : "not_below_threshold";
  });

  const coversEntirePacket =
    options.offset === 0 && selectedFeatures.length === packet.features.length;
  return OrderedTrendAssessmentResultSchema.parse({
    schemaVersion: "0.1.0",
    schemaName: "OrderedTrendAssessmentResult",
    sourcePacketRef: packet.packetId,
    datasetId: packet.provenance.datasetId,
    designValidation,
    method: {
      name: "jonckheere_terpstra_permutation",
      doseScale: "ordinal_numeric_order",
      numericalDoseSpacingUsed: false,
      nullHypothesis:
        "exchangeable_response_distributions_across_ordered_dose_groups",
      alternative: "ordered_location_shift",
      tieHandling: "half_credit",
      independentSamplesRequired: true,
      twoSidedPValueUsedForMultiplicity: true,
    },
    resamplingPolicy: {
      exactEnumerationLimit: options.exactEnumerationLimit,
      requestedRandomPermutations: options.permutationResamples,
      bootstrapResamples: options.bootstrapResamples,
      confidenceLevel: options.confidenceLevel,
      seed: options.seed,
      pseudoRandomGenerator: "xorshift32_v1",
      maximumPairComparisons: MAX_RESAMPLING_COMPARISONS,
    },
    multiplicity: {
      method: options.pAdjustmentMethod,
      fdrThreshold: options.fdrThreshold,
      familyDefinition: "bounded_packet_feature_slice",
      packetFeatureCount: packet.features.length,
      offset: options.offset,
      requestedLimit: options.limit,
      selectedFeatureCount: selectedFeatures.length,
      testedFeatureCount: tested.length,
      coversEntirePacket,
      scopeWarning: coversEntirePacket
        ? null
        : "Adjusted p-values apply only to the selected bounded feature slice and must not be described as packet-wide or genome-wide FDR control.",
    },
    features: assessments,
    scientificScope: {
      interpretationBoundary: "exploratory_ordered_trend_evidence_only",
      trendSignificance:
        "assessed_with_permutation_p_values_and_bounded_family_adjustment",
      biologicalSignificance: "not_assessed",
      causalInference: "not_assessed",
      bmdSuitability: "not_assessed",
      featureQualificationChanged: false,
      independenceAndExchangeability:
        "required_but_not_verified_by_sample_metadata",
      bootstrapIntervals: "pointwise_exploratory_not_simultaneous",
    },
  });
}
