import { describe, expect, it } from "vitest";
import type { EpigenomicsFeatureResponsePacket } from "../../src/contracts/packets.js";
import {
  adjustPValues,
  assessOrderedTrends,
  OrderedTrendAssessmentResultSchema,
} from "../../src/trend/ordered_trend.js";

function makePacket(
  featureValues: number[][][],
): EpigenomicsFeatureResponsePacket {
  const groupIds = featureValues[0].map((_, index) => `dose-${index}`);
  const sampleIds = featureValues[0].map((group, groupIndex) =>
    group.map((_, sampleIndex) => `d${groupIndex}-r${sampleIndex + 1}`),
  );
  return {
    schemaVersion: "0.1.0",
    schemaName: "EpigenomicsFeatureResponsePacket",
    packetId: "b1b2c3d4-e5f6-7890-abcd-ef1234567890",
    datasetMetadataRef: "dataset-ordered-trend",
    designRef: "design-ordered-trend",
    features: featureValues.map((groups, featureIndex) => ({
      featureId: `feature-${featureIndex + 1}`,
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      measuredIdentifier: `cg${featureIndex + 1}`,
      signalMetric: "beta_value",
      values: Object.fromEntries(
        groups.flatMap((group, groupIndex) =>
          group.map((value, sampleIndex) => [
            sampleIds[groupIndex][sampleIndex],
            value,
          ]),
        ),
      ),
    })),
    design: {
      designId: "design-ordered-trend",
      species: "Homo sapiens",
      doseGroups: groupIds.map((doseGroupId, index) => ({
        doseGroupId,
        doseValue: index === 0 ? 0 : index * 10,
        doseUnit: "µM",
        timepointHours: 24,
      })),
      samples: sampleIds.flatMap((group, groupIndex) =>
        group.map((sampleId, sampleIndex) => ({
          sampleId,
          doseGroupId: groupIds[groupIndex],
          replicateIndex: sampleIndex,
          replicateType: "biological" as const,
          species: "Homo sapiens",
          controlFlag: groupIndex === 0,
        })),
      ),
      hasControls: true,
      minReplicatesPerGroup: Math.min(
        ...featureValues[0].map((group) => group.length),
      ),
    },
    provenance: {
      datasetId: "dataset-ordered-trend",
      upstreamSteps: [],
    },
    qualificationSummary: {
      acceptedCount: featureValues.length,
      excludedCount: 0,
      exploratoryCount: 0,
      caveatCount: 0,
    },
    qcReportRef: "qc-ordered-trend",
    warnings: [],
    generatedAt: "2026-07-27T00:00:00.000Z",
  };
}

describe("assessOrderedTrends", () => {
  it("computes an exact increasing ordered-alternative test and bootstrap interval", () => {
    const result = assessOrderedTrends(
      makePacket([[[1, 2], [3, 4], [5, 6]]]),
      { bootstrapResamples: 199 },
    );
    const test = result.features[0].test!;

    expect(OrderedTrendAssessmentResultSchema.safeParse(result).success).toBe(
      true,
    );
    expect(test.statistic).toBe(12);
    expect(test.maximumStatistic).toBe(12);
    expect(test.orderedPairProbability).toBe(1);
    expect(test.orderedPairEffect).toBe(1);
    expect(test.direction).toBe("increasing");
    expect(test.pValueIncreasing).toBeCloseTo(1 / 90);
    expect(test.pValueTwoSided).toBeCloseTo(2 / 90);
    expect(test.permutation).toMatchObject({
      mode: "exact",
      totalLabelAllocations: "90",
      evaluatedPermutations: 90,
      permutationSeed: null,
    });
    expect(test.effectInterval).toMatchObject({
      lower: 1,
      upper: 1,
      simultaneousAcrossFeatures: false,
    });
  });

  it("computes the symmetric exact decreasing alternative", () => {
    const test = assessOrderedTrends(
      makePacket([[[6, 5], [4, 3], [2, 1]]]),
      { bootstrapResamples: 199 },
    ).features[0].test!;

    expect(test.statistic).toBe(0);
    expect(test.orderedPairEffect).toBe(-1);
    expect(test.direction).toBe("decreasing");
    expect(test.pValueDecreasing).toBeCloseTo(1 / 90);
    expect(test.pValueTwoSided).toBeCloseTo(2 / 90);
  });

  it("handles tied responses with half credit and no ordered direction", () => {
    const test = assessOrderedTrends(
      makePacket([[[1, 1], [1, 1], [1, 1]]]),
      { bootstrapResamples: 199 },
    ).features[0].test!;

    expect(test.statistic).toBe(6);
    expect(test.maximumStatistic).toBe(12);
    expect(test.orderedPairProbability).toBe(0.5);
    expect(test.orderedPairEffect).toBe(0);
    expect(test.direction).toBe("no_ordered_direction");
    expect(test.pValueTwoSided).toBe(1);
    expect(test.pValueIncreasing).toBe(1);
    expect(test.pValueDecreasing).toBe(1);
  });

  it("uses deterministic non-zero Monte Carlo p-values when exact enumeration is bounded out", () => {
    const packet = makePacket([
      [
        [1, 2, 3],
        [2, 3, 4],
        [3, 4, 5],
        [4, 5, 6],
      ],
    ]);
    const options = {
      permutationResamples: 999,
      bootstrapResamples: 199,
      seed: 1234,
    };
    const first = assessOrderedTrends(packet, options);
    const second = assessOrderedTrends(packet, options);
    const test = first.features[0].test!;

    expect(test.permutation.mode).toBe("monte_carlo");
    expect(test.permutation.totalLabelAllocations).toBe("369600");
    expect(test.permutation.evaluatedPermutations).toBe(999);
    expect(test.permutation.pValueResolution).toBe(0.001);
    expect(test.pValueTwoSided).toBeGreaterThanOrEqual(0.001);
    expect(test.permutation.monteCarloStandardErrorTwoSided).not.toBeNull();
    expect(first).toEqual(second);
  });

  it("adjusts the bounded tested family and labels partial-family scope", () => {
    const packet = makePacket([
      [[1, 2], [3, 4], [5, 6]],
      [[1, 2], [2, 3], [2, 4]],
      [[1, 2], [1, 2], [1, 2]],
    ]);
    const result = assessOrderedTrends(packet, {
      offset: 1,
      limit: 2,
      bootstrapResamples: 199,
    });

    expect(result.features.map((feature) => feature.featureId)).toEqual([
      "feature-2",
      "feature-3",
    ]);
    expect(result.multiplicity).toMatchObject({
      method: "benjamini_yekutieli",
      packetFeatureCount: 3,
      offset: 1,
      selectedFeatureCount: 2,
      testedFeatureCount: 2,
      coversEntirePacket: false,
    });
    expect(result.multiplicity.scopeWarning).toContain(
      "must not be described as packet-wide or genome-wide",
    );
  });

  it("fails closed for missing values and fewer than two observations at a dose", () => {
    const packet = makePacket([[[1, 2], [3, 4], [5, 6]]]);
    packet.features[0].values["d1-r1"] = null;
    const feature = assessOrderedTrends(packet, {
      bootstrapResamples: 199,
    }).features[0];

    expect(feature.assessmentStatus).toBe("not_assessed");
    expect(feature.assessmentBlockers).toContain("missing_value");
    expect(feature.assessmentBlockers).toContain(
      "insufficient_observations_per_dose",
    );
    expect(feature.test).toBeNull();
  });

  it("fails closed for undeclared replicate independence and multi-batch designs", () => {
    const packet = makePacket([[[1, 2], [3, 4], [5, 6]]]);
    packet.design.samples[0].replicateType = undefined;
    packet.design.samples[1].batchId = "batch-a";
    packet.design.samples[2].batchId = "batch-b";
    const feature = assessOrderedTrends(packet, {
      bootstrapResamples: 199,
    }).features[0];

    expect(feature.assessmentBlockers).toContain(
      "undeclared_or_non_biological_replicate_type",
    );
    expect(feature.assessmentBlockers).toContain(
      "multi_batch_design_not_supported",
    );
  });

  it("keeps statistical evidence separate from biological and BMD claims", () => {
    const result = assessOrderedTrends(
      makePacket([[[1, 2], [3, 4], [5, 6]]]),
      {
        bootstrapResamples: 199,
        pAdjustmentMethod: "benjamini_hochberg",
        fdrThreshold: 0.05,
      },
    );

    expect(result.features[0].test?.passesFdrThreshold).toBe(true);
    expect(result.scientificScope).toEqual({
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
    });
  });

  it("rejects requests that exceed the explicit resampling work budget", () => {
    const groups = [
      Array.from({ length: 30 }, (_, index) => index),
      Array.from({ length: 30 }, (_, index) => index + 1),
      Array.from({ length: 30 }, (_, index) => index + 2),
    ];
    const packet = makePacket(
      Array.from({ length: 100 }, () => groups),
    );

    expect(() =>
      assessOrderedTrends(packet, {
        limit: 100,
        permutationResamples: 99_999,
        bootstrapResamples: 19_999,
      }),
    ).toThrow(/pair-comparison resampling budget/);
  });
});

describe("adjustPValues", () => {
  it("implements monotone BH and conservative BY adjustments", () => {
    const pValues = [0.01, 0.04, 0.03];
    expect(adjustPValues(pValues, "benjamini_hochberg")).toEqual([
      0.03, 0.04, 0.04,
    ]);
    const by = adjustPValues(pValues, "benjamini_yekutieli");
    expect(by[0]).toBeCloseTo(0.055);
    expect(by[1]).toBeCloseTo(0.0733333333);
    expect(by[2]).toBeCloseTo(0.0733333333);
  });
});
