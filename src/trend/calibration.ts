import { z } from "zod";

import {
  computeOrderedPairEffectInterval,
  computeOrderedTrendPermutationCore,
} from "./ordered_trend.js";

const CALIBRATION_ALPHA = 0.05;
const CALIBRATION_CONFIDENCE_LEVEL = 0.99;
const WILSON_Z_99 = 2.5758293035489004;
const EXACT_PERMUTATION_RESAMPLES = 4_999;
const BASE_SEED = 0x5eed_2026;

const WilsonIntervalSchema = z
  .object({
    confidenceLevel: z.literal(CALIBRATION_CONFIDENCE_LEVEL),
    lower: z.number().min(0).max(1),
    upper: z.number().min(0).max(1),
  })
  .strict();

const CalibrationDecisionSchema = z
  .object({
    gated: z.boolean(),
    criterion: z.enum([
      "rejection_count_at_or_below_binomial_upper_bound",
      "wilson_lower_bound_at_or_above_power_floor",
      "characterization_only",
    ]),
    referenceRate: z.number().min(0).max(1).nullable(),
    threshold: z.number().nonnegative().nullable(),
    observed: z.number().nonnegative().nullable(),
    passed: z.boolean().nullable(),
  })
  .strict();

const CalibrationScenarioSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum([
      "type_i_error",
      "ordered_power",
      "non_monotonic_specificity",
      "exchangeability_stress",
      "weak_signal_characterization",
    ]),
    assumptionStatus: z.enum([
      "exchangeable_null",
      "ordered_location_alternative",
      "non_monotonic_nonexchangeable",
      "exchangeability_violated",
    ]),
    distribution: z.enum([
      "normal",
      "centered_lognormal",
      "symmetric_discrete",
    ]),
    replicates: z.number().int().positive(),
    seed: z.number().int().nonnegative(),
    groupSizes: z.array(z.number().int().min(2)).min(3),
    locations: z.array(z.number().finite()).min(3),
    scales: z.array(z.number().positive()).min(3),
    alpha: z.literal(CALIBRATION_ALPHA),
    rejectionCount: z.number().int().nonnegative(),
    rejectionRate: z.number().min(0).max(1),
    rejectionRateWilsonInterval: WilsonIntervalSchema,
    meanOrderedPairEffect: z.number().min(-1).max(1),
    decision: CalibrationDecisionSchema,
  })
  .strict();

const ReferenceCaseSchema = z
  .object({
    id: z.string().min(1),
    groups: z.array(z.array(z.number().finite()).min(2)).min(3),
    expected: z
      .object({
        statistic: z.number().nonnegative(),
        maximumStatistic: z.number().positive(),
        pValueTwoSided: z.number().min(0).max(1),
        pValueIncreasing: z.number().min(0).max(1),
        pValueDecreasing: z.number().min(0).max(1),
      })
      .strict(),
    observed: z
      .object({
        statistic: z.number().nonnegative(),
        maximumStatistic: z.number().positive(),
        pValueTwoSided: z.number().min(0).max(1),
        pValueIncreasing: z.number().min(0).max(1),
        pValueDecreasing: z.number().min(0).max(1),
        totalLabelAllocations: z.string().regex(/^[1-9][0-9]*$/),
      })
      .strict(),
    passed: z.boolean(),
  })
  .strict();

const MonteCarloAgreementSchema = z
  .object({
    comparisonCount: z.number().int().positive(),
    randomPermutationsPerComparison: z.number().int().positive(),
    meanAbsolutePValueError: z.number().nonnegative(),
    rootMeanSquareStandardizedError: z.number().nonnegative(),
    maximumStandardizedError: z.number().nonnegative(),
    maximumAllowedRootMeanSquareStandardizedError: z.number().positive(),
    maximumAllowedStandardizedError: z.number().positive(),
    passed: z.boolean(),
  })
  .strict();

const EffectIntervalCoverageSchema = z
  .object({
    id: z.string().min(1),
    distribution: z.literal("normal"),
    groupSizes: z.array(z.number().int().min(2)).min(3),
    locations: z.array(z.number().finite()).min(3),
    scales: z.array(z.number().positive()).min(3),
    trueOrderedPairEffect: z.number().min(-1).max(1),
    replicates: z.number().int().positive(),
    bootstrapResamples: z.number().int().positive(),
    nominalConfidenceLevel: z.literal(0.95),
    coverageCount: z.number().int().nonnegative(),
    coverageRate: z.number().min(0).max(1),
    coverageWilsonInterval: WilsonIntervalSchema,
    meanIntervalWidth: z.number().nonnegative().max(2),
    minimumAllowedWilsonLowerBound: z.number().min(0).max(1),
    passed: z.boolean(),
  })
  .strict();

export const OrderedTrendCalibrationReportSchema = z
  .object({
    schemaName: z.literal("OrderedTrendCalibrationReport"),
    schemaVersion: z.literal("0.1.0"),
    method: z.literal("jonckheere_terpstra_permutation"),
    protocol: z
      .object({
        framework: z.literal("ADEMP"),
        alpha: z.literal(CALIBRATION_ALPHA),
        calibrationConfidenceLevel: z.literal(
          CALIBRATION_CONFIDENCE_LEVEL,
        ),
        baseSeed: z.number().int().nonnegative(),
        dataGenerator: z.literal("mulberry32_box_muller_v1"),
        inferenceEngine: z.literal("production_ordered_trend_core"),
        exactReference: z.literal(
          "complete_distinct_label_allocation_enumeration",
        ),
        sources: z
          .array(
            z
              .object({
                title: z.string().min(1),
                url: z.string().url(),
              })
              .strict(),
          )
          .min(4),
      })
      .strict(),
    referenceCases: z.array(ReferenceCaseSchema).min(3),
    scenarios: z.array(CalibrationScenarioSchema).min(8),
    monteCarloAgreement: MonteCarloAgreementSchema,
    effectIntervalCoverage: z.array(EffectIntervalCoverageSchema).min(2),
    summary: z
      .object({
        gatedCheckCount: z.number().int().positive(),
        passedGatedCheckCount: z.number().int().nonnegative(),
        diagnosticScenarioCount: z.number().int().positive(),
        ready: z.boolean(),
      })
      .strict(),
    interpretationBoundaries: z.array(z.string().min(1)).min(4),
  })
  .strict();

export type OrderedTrendCalibrationReport = z.infer<
  typeof OrderedTrendCalibrationReportSchema
>;

interface ScenarioDefinition {
  id: string;
  category: z.infer<typeof CalibrationScenarioSchema>["category"];
  assumptionStatus: z.infer<
    typeof CalibrationScenarioSchema
  >["assumptionStatus"];
  distribution: z.infer<typeof CalibrationScenarioSchema>["distribution"];
  replicates: number;
  seed: number;
  groupSizes: number[];
  locations: number[];
  scales: number[];
  decision:
    | { type: "null_upper"; nominalRate: number }
    | { type: "power_floor"; floor: number }
    | { type: "diagnostic" };
}

function round(value: number): number {
  return Number(value.toFixed(12));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function normalSampler(random: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    const first = Math.max(random(), Number.MIN_VALUE);
    const second = random();
    const radius = Math.sqrt(-2 * Math.log(first));
    const angle = 2 * Math.PI * second;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

function sampleGroups(
  definition: Pick<
    ScenarioDefinition,
    "distribution" | "groupSizes" | "locations" | "scales"
  >,
  random: () => number,
  normal: () => number,
): number[][] {
  return definition.groupSizes.map((size, groupIndex) =>
    Array.from({ length: size }, () => {
      const location = definition.locations[groupIndex];
      const scale = definition.scales[groupIndex];
      if (definition.distribution === "normal") {
        return location + scale * normal();
      }
      if (definition.distribution === "centered_lognormal") {
        return location + scale * (Math.exp(normal()) - Math.exp(0.5));
      }
      const draw = random();
      const discrete = draw < 0.25 ? -1 : draw < 0.75 ? 0 : 1;
      return location + scale * discrete;
    }),
  );
}

function wilsonInterval(successes: number, total: number): {
  confidenceLevel: typeof CALIBRATION_CONFIDENCE_LEVEL;
  lower: number;
  upper: number;
} {
  const rate = successes / total;
  const zSquared = WILSON_Z_99 * WILSON_Z_99;
  const denominator = 1 + zSquared / total;
  const center = (rate + zSquared / (2 * total)) / denominator;
  const radius =
    (WILSON_Z_99 / denominator) *
    Math.sqrt(
      (rate * (1 - rate)) / total + zSquared / (4 * total * total),
    );
  return {
    confidenceLevel: CALIBRATION_CONFIDENCE_LEVEL,
    lower: round(Math.max(0, center - radius)),
    upper: round(Math.min(1, center + radius)),
  };
}

function binomialUpperCount(
  trials: number,
  probability: number,
  cumulativeProbability: number,
): number {
  let mass = Math.pow(1 - probability, trials);
  let cumulative = mass;
  if (cumulative >= cumulativeProbability) return 0;
  for (let count = 0; count < trials; count++) {
    mass *=
      ((trials - count) / (count + 1)) *
      (probability / (1 - probability));
    cumulative += mass;
    if (cumulative >= cumulativeProbability) return count + 1;
  }
  return trials;
}

function runScenario(
  definition: ScenarioDefinition,
): z.infer<typeof CalibrationScenarioSchema> {
  const random = mulberry32(definition.seed);
  const normal = normalSampler(random);
  let rejectionCount = 0;
  let effectSum = 0;

  for (let replicate = 0; replicate < definition.replicates; replicate++) {
    const groups = sampleGroups(definition, random, normal);
    const result = computeOrderedTrendPermutationCore(groups, {
      permutationResamples: EXACT_PERMUTATION_RESAMPLES,
      seed: (definition.seed + replicate) >>> 0,
    });
    if (result.pValueTwoSided <= CALIBRATION_ALPHA) rejectionCount++;
    effectSum += result.orderedPairEffect;
  }

  const interval = wilsonInterval(rejectionCount, definition.replicates);
  let decision: z.infer<typeof CalibrationDecisionSchema>;
  if (definition.decision.type === "null_upper") {
    const upperCount = binomialUpperCount(
      definition.replicates,
      definition.decision.nominalRate,
      CALIBRATION_CONFIDENCE_LEVEL,
    );
    decision = {
      gated: true,
      criterion: "rejection_count_at_or_below_binomial_upper_bound",
      referenceRate: definition.decision.nominalRate,
      threshold: upperCount,
      observed: rejectionCount,
      passed: rejectionCount <= upperCount,
    };
  } else if (definition.decision.type === "power_floor") {
    decision = {
      gated: true,
      criterion: "wilson_lower_bound_at_or_above_power_floor",
      referenceRate: null,
      threshold: definition.decision.floor,
      observed: interval.lower,
      passed: interval.lower >= definition.decision.floor,
    };
  } else {
    decision = {
      gated: false,
      criterion: "characterization_only",
      referenceRate: null,
      threshold: null,
      observed: null,
      passed: null,
    };
  }

  return CalibrationScenarioSchema.parse({
    ...definition,
    decision,
    alpha: CALIBRATION_ALPHA,
    rejectionCount,
    rejectionRate: round(rejectionCount / definition.replicates),
    rejectionRateWilsonInterval: interval,
    meanOrderedPairEffect: round(effectSum / definition.replicates),
  });
}

function runReferenceCases(): z.infer<typeof ReferenceCaseSchema>[] {
  const definitions = [
    {
      id: "complete_separation_increasing",
      groups: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      expected: {
        statistic: 12,
        maximumStatistic: 12,
        pValueTwoSided: 2 / 90,
        pValueIncreasing: 1 / 90,
        pValueDecreasing: 1,
      },
    },
    {
      id: "complete_separation_decreasing",
      groups: [
        [6, 5],
        [4, 3],
        [2, 1],
      ],
      expected: {
        statistic: 0,
        maximumStatistic: 12,
        pValueTwoSided: 2 / 90,
        pValueIncreasing: 1,
        pValueDecreasing: 1 / 90,
      },
    },
    {
      id: "all_ties",
      groups: [
        [1, 1],
        [1, 1],
        [1, 1],
      ],
      expected: {
        statistic: 6,
        maximumStatistic: 12,
        pValueTwoSided: 1,
        pValueIncreasing: 1,
        pValueDecreasing: 1,
      },
    },
  ];

  return definitions.map((definition, index) => {
    const result = computeOrderedTrendPermutationCore(definition.groups, {
      permutationResamples: EXACT_PERMUTATION_RESAMPLES,
      seed: BASE_SEED + index,
    });
    const observed = {
      statistic: result.statistic,
      maximumStatistic: result.maximumStatistic,
      pValueTwoSided: result.pValueTwoSided,
      pValueIncreasing: result.pValueIncreasing,
      pValueDecreasing: result.pValueDecreasing,
      totalLabelAllocations: result.totalLabelAllocations,
    };
    const passed =
      observed.statistic === definition.expected.statistic &&
      observed.maximumStatistic === definition.expected.maximumStatistic &&
      Math.abs(
        observed.pValueTwoSided - definition.expected.pValueTwoSided,
      ) < 1e-12 &&
      Math.abs(
        observed.pValueIncreasing - definition.expected.pValueIncreasing,
      ) < 1e-12 &&
      Math.abs(
        observed.pValueDecreasing - definition.expected.pValueDecreasing,
      ) < 1e-12;
    return ReferenceCaseSchema.parse({ ...definition, observed, passed });
  });
}

function runMonteCarloAgreement(): z.infer<
  typeof MonteCarloAgreementSchema
> {
  const comparisonCount = 32;
  const randomPermutationsPerComparison = 4_999;
  const random = mulberry32(BASE_SEED ^ 0x4d43_4152);
  const normal = normalSampler(random);
  let absoluteErrorSum = 0;
  let standardizedSquaredSum = 0;
  let maximumStandardizedError = 0;

  for (let index = 0; index < comparisonCount; index++) {
    const groups = [3, 3, 3].map(() =>
      Array.from({ length: 3 }, () => normal()),
    );
    const exact = computeOrderedTrendPermutationCore(groups, {
      permutationResamples: EXACT_PERMUTATION_RESAMPLES,
      seed: BASE_SEED + index,
    });
    const monteCarlo = computeOrderedTrendPermutationCore(groups, {
      permutationResamples: randomPermutationsPerComparison,
      seed: (BASE_SEED ^ 0x9e37_79b9 ^ index) >>> 0,
      exactEnumerationLimit: 1,
    });
    const error = Math.abs(
      monteCarlo.pValueTwoSided - exact.pValueTwoSided,
    );
    const boundedProbability = Math.min(
      1 - 1 / (randomPermutationsPerComparison + 1),
      Math.max(
        1 / (randomPermutationsPerComparison + 1),
        exact.pValueTwoSided,
      ),
    );
    const standardError = Math.sqrt(
      (boundedProbability * (1 - boundedProbability)) /
        (randomPermutationsPerComparison + 1),
    );
    const standardizedError = error / standardError;
    absoluteErrorSum += error;
    standardizedSquaredSum += standardizedError * standardizedError;
    maximumStandardizedError = Math.max(
      maximumStandardizedError,
      standardizedError,
    );
  }

  const rootMeanSquareStandardizedError = Math.sqrt(
    standardizedSquaredSum / comparisonCount,
  );
  const maximumAllowedRootMeanSquareStandardizedError = 1.5;
  const maximumAllowedStandardizedError = 4.5;
  return MonteCarloAgreementSchema.parse({
    comparisonCount,
    randomPermutationsPerComparison,
    meanAbsolutePValueError: round(absoluteErrorSum / comparisonCount),
    rootMeanSquareStandardizedError: round(
      rootMeanSquareStandardizedError,
    ),
    maximumStandardizedError: round(maximumStandardizedError),
    maximumAllowedRootMeanSquareStandardizedError,
    maximumAllowedStandardizedError,
    passed:
      rootMeanSquareStandardizedError <=
        maximumAllowedRootMeanSquareStandardizedError &&
      maximumStandardizedError <= maximumAllowedStandardizedError,
  });
}

function normalCdf(value: number): number {
  if (value === 0) return 0.5;
  const sign = value < 0 ? -1 : 1;
  const scaled = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * scaled);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t) *
      Math.exp(-scaled * scaled);
  return 0.5 * (1 + sign * erf);
}

function trueNormalOrderedPairEffect(
  groupSizes: number[],
  locations: number[],
  scales: number[],
): number {
  let weightedProbability = 0;
  let totalWeight = 0;
  for (let lower = 0; lower < groupSizes.length - 1; lower++) {
    for (let higher = lower + 1; higher < groupSizes.length; higher++) {
      const weight = groupSizes[lower] * groupSizes[higher];
      const standardizedDifference =
        (locations[higher] - locations[lower]) /
        Math.sqrt(
          scales[higher] * scales[higher] + scales[lower] * scales[lower],
        );
      weightedProbability += weight * normalCdf(standardizedDifference);
      totalWeight += weight;
    }
  }
  return (2 * weightedProbability) / totalWeight - 1;
}

function runEffectIntervalCoverage(
  id: string,
  locations: number[],
  seed: number,
): z.infer<typeof EffectIntervalCoverageSchema> {
  const groupSizes = [6, 6, 6];
  const scales = [1, 1, 1];
  const replicates = 300;
  const bootstrapResamples = 499;
  const nominalConfidenceLevel = 0.95;
  const minimumAllowedWilsonLowerBound = 0.8;
  const trueOrderedPairEffect = trueNormalOrderedPairEffect(
    groupSizes,
    locations,
    scales,
  );
  const random = mulberry32(seed);
  const normal = normalSampler(random);
  let coverageCount = 0;
  let widthSum = 0;

  for (let replicate = 0; replicate < replicates; replicate++) {
    const groups = sampleGroups(
      {
        distribution: "normal",
        groupSizes,
        locations,
        scales,
      },
      random,
      normal,
    );
    const interval = computeOrderedPairEffectInterval(
      groups,
      nominalConfidenceLevel,
      bootstrapResamples,
      (seed + replicate) >>> 0,
    );
    if (
      interval.lower <= trueOrderedPairEffect &&
      trueOrderedPairEffect <= interval.upper
    ) {
      coverageCount++;
    }
    widthSum += interval.upper - interval.lower;
  }

  const coverageWilsonInterval = wilsonInterval(coverageCount, replicates);
  return EffectIntervalCoverageSchema.parse({
    id,
    distribution: "normal",
    groupSizes,
    locations,
    scales,
    trueOrderedPairEffect: round(trueOrderedPairEffect),
    replicates,
    bootstrapResamples,
    nominalConfidenceLevel,
    coverageCount,
    coverageRate: round(coverageCount / replicates),
    coverageWilsonInterval,
    meanIntervalWidth: round(widthSum / replicates),
    minimumAllowedWilsonLowerBound,
    passed:
      coverageWilsonInterval.lower >= minimumAllowedWilsonLowerBound,
  });
}

const SCENARIO_DEFINITIONS: ScenarioDefinition[] = [
  {
    id: "null_normal_balanced",
    category: "type_i_error",
    assumptionStatus: "exchangeable_null",
    distribution: "normal",
    replicates: 1_000,
    seed: BASE_SEED + 101,
    groupSizes: [3, 3, 3],
    locations: [0, 0, 0],
    scales: [1, 1, 1],
    decision: { type: "null_upper", nominalRate: CALIBRATION_ALPHA },
  },
  {
    id: "null_normal_imbalanced",
    category: "type_i_error",
    assumptionStatus: "exchangeable_null",
    distribution: "normal",
    replicates: 1_000,
    seed: BASE_SEED + 102,
    groupSizes: [2, 3, 4],
    locations: [0, 0, 0],
    scales: [1, 1, 1],
    decision: { type: "null_upper", nominalRate: CALIBRATION_ALPHA },
  },
  {
    id: "null_centered_lognormal_balanced",
    category: "type_i_error",
    assumptionStatus: "exchangeable_null",
    distribution: "centered_lognormal",
    replicates: 1_000,
    seed: BASE_SEED + 103,
    groupSizes: [3, 3, 3],
    locations: [0, 0, 0],
    scales: [1, 1, 1],
    decision: { type: "null_upper", nominalRate: CALIBRATION_ALPHA },
  },
  {
    id: "null_symmetric_ties_balanced",
    category: "type_i_error",
    assumptionStatus: "exchangeable_null",
    distribution: "symmetric_discrete",
    replicates: 1_000,
    seed: BASE_SEED + 104,
    groupSizes: [3, 3, 3],
    locations: [0, 0, 0],
    scales: [1, 1, 1],
    decision: { type: "null_upper", nominalRate: CALIBRATION_ALPHA },
  },
  {
    id: "strong_ordered_increasing",
    category: "ordered_power",
    assumptionStatus: "ordered_location_alternative",
    distribution: "normal",
    replicates: 500,
    seed: BASE_SEED + 201,
    groupSizes: [3, 3, 3],
    locations: [-2, 0, 2],
    scales: [1, 1, 1],
    decision: { type: "power_floor", floor: 0.8 },
  },
  {
    id: "strong_ordered_decreasing",
    category: "ordered_power",
    assumptionStatus: "ordered_location_alternative",
    distribution: "normal",
    replicates: 500,
    seed: BASE_SEED + 202,
    groupSizes: [3, 3, 3],
    locations: [2, 0, -2],
    scales: [1, 1, 1],
    decision: { type: "power_floor", floor: 0.8 },
  },
  {
    id: "weak_ordered_increasing",
    category: "weak_signal_characterization",
    assumptionStatus: "ordered_location_alternative",
    distribution: "normal",
    replicates: 500,
    seed: BASE_SEED + 203,
    groupSizes: [3, 3, 3],
    locations: [-0.5, 0, 0.5],
    scales: [1, 1, 1],
    decision: { type: "diagnostic" },
  },
  {
    id: "non_monotonic_inverted_u",
    category: "non_monotonic_specificity",
    assumptionStatus: "non_monotonic_nonexchangeable",
    distribution: "normal",
    replicates: 500,
    seed: BASE_SEED + 301,
    groupSizes: [3, 3, 3],
    locations: [0, 3, 0],
    scales: [1, 1, 1],
    decision: { type: "null_upper", nominalRate: 0.1 },
  },
  {
    id: "heteroscedastic_balanced",
    category: "exchangeability_stress",
    assumptionStatus: "exchangeability_violated",
    distribution: "normal",
    replicates: 500,
    seed: BASE_SEED + 401,
    groupSizes: [3, 3, 3],
    locations: [0, 0, 0],
    scales: [1, 2, 4],
    decision: { type: "diagnostic" },
  },
  {
    id: "heteroscedastic_inverse_imbalance",
    category: "exchangeability_stress",
    assumptionStatus: "exchangeability_violated",
    distribution: "normal",
    replicates: 500,
    seed: BASE_SEED + 402,
    groupSizes: [5, 3, 2],
    locations: [0, 0, 0],
    scales: [1, 2, 4],
    decision: { type: "diagnostic" },
  },
];

/** Run the deterministic, release-bounded ADEMP calibration protocol. */
export function runOrderedTrendCalibration(): OrderedTrendCalibrationReport {
  const referenceCases = runReferenceCases();
  const scenarios = SCENARIO_DEFINITIONS.map(runScenario);
  const monteCarloAgreement = runMonteCarloAgreement();
  const effectIntervalCoverage = [
    runEffectIntervalCoverage(
      "null_effect_percentile_interval",
      [0, 0, 0],
      BASE_SEED + 501,
    ),
    runEffectIntervalCoverage(
      "moderate_ordered_effect_percentile_interval",
      [-0.5, 0, 0.5],
      BASE_SEED + 502,
    ),
  ];
  const gatedResults = [
    ...referenceCases.map((result) => result.passed),
    ...scenarios
      .filter((scenario) => scenario.decision.gated)
      .map((scenario) => scenario.decision.passed === true),
    monteCarloAgreement.passed,
    ...effectIntervalCoverage.map((result) => result.passed),
  ];
  const diagnosticScenarioCount = scenarios.filter(
    (scenario) => !scenario.decision.gated,
  ).length;

  return OrderedTrendCalibrationReportSchema.parse({
    schemaName: "OrderedTrendCalibrationReport",
    schemaVersion: "0.1.0",
    method: "jonckheere_terpstra_permutation",
    protocol: {
      framework: "ADEMP",
      alpha: CALIBRATION_ALPHA,
      calibrationConfidenceLevel: CALIBRATION_CONFIDENCE_LEVEL,
      baseSeed: BASE_SEED,
      dataGenerator: "mulberry32_box_muller_v1",
      inferenceEngine: "production_ordered_trend_core",
      exactReference: "complete_distinct_label_allocation_enumeration",
      sources: [
        {
          title: "Using simulation studies to evaluate statistical methods",
          url: "https://doi.org/10.1002/sim.8086",
        },
        {
          title: "A distribution-free k-sample test against ordered alternatives",
          url: "https://doi.org/10.1093/biomet/41.1-2.133",
        },
        {
          title: "Permutation P-values should never be zero",
          url: "https://doi.org/10.2202/1544-6115.1585",
        },
        {
          title: "Probable inference, the law of succession, and statistical inference",
          url: "https://doi.org/10.1080/01621459.1927.10502953",
        },
        {
          title: "To permute or not to permute",
          url: "https://doi.org/10.1093/bioinformatics/btl383",
        },
      ],
    },
    referenceCases,
    scenarios,
    monteCarloAgreement,
    effectIntervalCoverage,
    summary: {
      gatedCheckCount: gatedResults.length,
      passedGatedCheckCount: gatedResults.filter(Boolean).length,
      diagnosticScenarioCount,
      ready: gatedResults.every(Boolean),
    },
    interpretationBoundaries: [
      "Passing this finite simulation grid does not establish universal statistical validity.",
      "Nominal type-I error checks apply only when responses are exchangeable under the null and observations are independent.",
      "Heteroscedastic stress scenarios are diagnostics, not calibration claims, because their group distributions are not exchangeable.",
      "Bootstrap intervals remain pointwise exploratory percentile intervals and are not simultaneous confidence bands.",
      "Strong-signal power targets do not establish sensitivity for weak biological effects or small real-world studies.",
      "No simulation result establishes biological significance, causality, BMD suitability, or regulatory acceptance.",
    ],
  });
}
