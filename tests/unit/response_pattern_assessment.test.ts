import { describe, expect, it } from "vitest";
import type { EpigenomicsFeatureResponsePacket } from "../../src/contracts/packets.js";
import {
  assessResponsePatterns,
  ResponsePatternAssessmentResultSchema,
} from "../../src/response_pattern/assessment.js";

function makePacket(
  featureMeans: number[][],
): EpigenomicsFeatureResponsePacket {
  const sampleIds = [
    ["c1", "c2"],
    ["l1", "l2"],
    ["h1", "h2"],
  ];
  return {
    schemaVersion: "0.1.0",
    schemaName: "EpigenomicsFeatureResponsePacket",
    packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    datasetMetadataRef: "dataset-response-pattern",
    designRef: "design-response-pattern",
    features: featureMeans.map((means, featureIndex) => ({
      featureId: `feature-${featureIndex + 1}`,
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      measuredIdentifier: `cg${featureIndex + 1}`,
      signalMetric: "beta_value",
      values: Object.fromEntries(
        means.flatMap((value, doseIndex) =>
          sampleIds[doseIndex].map((sampleId) => [sampleId, value]),
        ),
      ),
    })),
    design: {
      designId: "design-response-pattern",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "control", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
      ],
      samples: [
        {
          sampleId: "c1",
          doseGroupId: "control",
          replicateType: "biological",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "c2",
          doseGroupId: "control",
          replicateType: "biological",
          species: "Homo sapiens",
          controlFlag: true,
        },
        {
          sampleId: "l1",
          doseGroupId: "low",
          replicateType: "biological",
          species: "Homo sapiens",
        },
        {
          sampleId: "l2",
          doseGroupId: "low",
          replicateType: "biological",
          species: "Homo sapiens",
        },
        {
          sampleId: "h1",
          doseGroupId: "high",
          replicateType: "biological",
          species: "Homo sapiens",
        },
        {
          sampleId: "h2",
          doseGroupId: "high",
          replicateType: "biological",
          species: "Homo sapiens",
        },
      ],
      hasControls: true,
      minReplicatesPerGroup: 2,
    },
    provenance: {
      datasetId: "dataset-response-pattern",
      upstreamSteps: [],
    },
    qualificationSummary: {
      acceptedCount: featureMeans.length,
      excludedCount: 0,
      exploratoryCount: 0,
      caveatCount: 0,
    },
    qcReportRef: "qc-response-pattern",
    warnings: [],
    generatedAt: "2026-07-27T00:00:00.000Z",
  };
}

describe("assessResponsePatterns", () => {
  it("classifies a monotonic decrease and reports design readiness separately", () => {
    const result = assessResponsePatterns(makePacket([[0.8, 0.6, 0.4]]));
    const feature = result.features[0];

    expect(ResponsePatternAssessmentResultSchema.safeParse(result).success).toBe(
      true,
    );
    expect(result.designValidation.doseResponseReady).toBe(true);
    expect(feature.assessmentStatus).toBe("assessed");
    expect(feature.observedPattern).toBe("monotonic_nonincreasing");
    expect(feature.directionFromControl).toBe("decreasing");
    expect(feature.reversalCount).toBe(0);
    expect(feature.doseSummaries.map((summary) => summary.doseValue)).toEqual([
      0, 1, 10,
    ]);
  });

  it("treats a plateau as monotonic nondecreasing", () => {
    const result = assessResponsePatterns(makePacket([[0.2, 0.4, 0.4]]));
    expect(result.features[0].observedPattern).toBe(
      "monotonic_nondecreasing",
    );
    expect(result.features[0].directionFromControl).toBe("increasing");
  });

  it("preserves a non-monotonic response without excluding it", () => {
    const result = assessResponsePatterns(makePacket([[0.2, 0.7, 0.4]]));
    const feature = result.features[0];

    expect(feature.observedPattern).toBe("non_monotonic");
    expect(feature.reversalCount).toBe(1);
    expect(result.scientificScope.monotonicityRequiredForQualification).toBe(
      false,
    );
    expect(result.scientificScope.bmdSuitability).toBe("not_assessed");
    expect(result.scientificScope.trendSignificance).toBe("not_assessed");
  });

  it("uses only an explicit caller tolerance and does not call it biological significance", () => {
    const result = assessResponsePatterns(
      makePacket([[0.2, 0.24, 0.22]]),
      { absoluteTolerance: 0.05 },
    );

    expect(result.features[0].observedPattern).toBe("flat_within_tolerance");
    expect(result.features[0].directionFromControl).toBe("unchanged");
    expect(result.tolerance).toEqual({
      absolute: 0.05,
      source: "caller_supplied",
      scale: "signal_metric_units",
      biologicalSignificanceAssessed: false,
    });
  });

  it("does not assess a pattern with fewer than three distinct numeric doses", () => {
    const packet = makePacket([[0.2, 0.4, 0.6]]);
    packet.design.doseGroups = packet.design.doseGroups.slice(0, 2);
    packet.design.samples = packet.design.samples.slice(0, 4);
    packet.features[0].values = {
      c1: 0.2,
      c2: 0.2,
      l1: 0.4,
      l2: 0.4,
    };

    const feature = assessResponsePatterns(packet).features[0];
    expect(feature.assessmentStatus).toBe("not_assessed");
    expect(feature.assessmentBlockers).toContain(
      "insufficient_distinct_dose_levels",
    );
    expect(feature.observedPattern).toBeNull();
  });

  it("does not interpret a negative numeric dose as a treatment level", () => {
    const packet = makePacket([[0.2, 0.4, 0.6]]);
    packet.design.doseGroups[1].doseValue = -1;

    const feature = assessResponsePatterns(packet).features[0];
    expect(feature.assessmentStatus).toBe("not_assessed");
    expect(feature.assessmentBlockers).toContain("negative_dose_value");
    expect(feature.observedPattern).toBeNull();
  });

  it("keeps design depth orthogonal to a descriptive mathematical pattern", () => {
    const packet = makePacket([[0.2, 0.4, 0.6]]);
    packet.design.samples = packet.design.samples.filter((_, index) =>
      [0, 2, 4].includes(index),
    );
    packet.design.minReplicatesPerGroup = 1;
    packet.features[0].values = {
      c1: 0.2,
      l1: 0.4,
      h1: 0.6,
    };

    const result = assessResponsePatterns(packet);
    expect(result.designValidation.structurallyValid).toBe(true);
    expect(result.designValidation.doseResponseReady).toBe(false);
    expect(result.features[0].assessmentStatus).toBe("assessed");
    expect(result.features[0].observedPattern).toBe(
      "monotonic_nondecreasing",
    );
  });

  it("does not assess an aggregate pattern from a structurally invalid design", () => {
    const packet = makePacket([[0.2, 0.4, 0.6]]);
    packet.design.samples[0].doseGroupId = "undeclared";

    const result = assessResponsePatterns(packet);
    expect(result.designValidation.structurallyValid).toBe(false);
    expect(result.features[0].assessmentBlockers).toContain(
      "structurally_invalid_design",
    );
    expect(result.features[0].observedPattern).toBeNull();
  });

  it("collapses labels sharing one numeric dose and pools their samples", () => {
    const packet = makePacket([[0.2, 0.4, 0.8]]);
    packet.design.doseGroups.splice(
      2,
      0,
      { doseGroupId: "low-b", doseValue: 1, doseUnit: "µM" },
    );
    packet.design.samples.splice(4, 0, {
      sampleId: "l3",
      doseGroupId: "low-b",
      replicateType: "biological",
      species: "Homo sapiens",
    });
    packet.features[0].values.l3 = 0.7;

    const feature = assessResponsePatterns(packet).features[0];
    const pooledDose = feature.doseSummaries.find(
      (summary) => summary.doseValue === 1,
    );
    expect(feature.doseSummaries).toHaveLength(3);
    expect(pooledDose?.doseGroupIds).toEqual(["low", "low-b"]);
    expect(pooledDose?.sampleCount).toBe(3);
    expect(pooledDose?.mean).toBeCloseTo(0.5);
  });

  it("reports incomplete dose levels and an undefined single-observation SD", () => {
    const packet = makePacket([[0.2, 0.4, 0.8]]);
    packet.features[0].values = {
      c1: 0.2,
      c2: null,
      l1: 0.4,
      l2: 0.4,
      h1: null,
      h2: null,
    };

    const feature = assessResponsePatterns(packet).features[0];
    expect(feature.assessmentStatus).toBe("not_assessed");
    expect(feature.assessmentBlockers).toContain("incomplete_dose_level");
    expect(feature.doseSummaries[0].sampleSd).toBeNull();
    expect(feature.doseSummaries[2].mean).toBeNull();
  });

  it("reports non-finite values without emitting non-finite output statistics", () => {
    const packet = makePacket([[0.2, 0.4, 0.8]]);
    packet.features[0].values.h1 = Number.POSITIVE_INFINITY;

    const feature = assessResponsePatterns(packet).features[0];
    expect(feature.assessmentStatus).toBe("not_assessed");
    expect(feature.assessmentBlockers).toContain("non_finite_value");
    expect(feature.doseSummaries[2].invalidCount).toBe(1);
    expect(feature.doseSummaries[2].observedCount).toBe(1);
    expect(feature.doseSummaries[2].mean).toBe(0.8);
  });

  it("does not aggregate a multi-timepoint design into one observed pattern", () => {
    const packet = makePacket([[0.2, 0.4, 0.8]]);
    packet.design.doseGroups[0].timepointHours = 24;
    packet.design.doseGroups[1].timepointHours = 24;
    packet.design.doseGroups[2].timepointHours = 48;

    const result = assessResponsePatterns(packet);
    expect(result.designValidation.doseResponseReady).toBe(false);
    expect(result.features[0].assessmentBlockers).toContain(
      "multi_timepoint_design",
    );
    expect(result.features[0].observedPattern).toBeNull();
  });

  it("returns bounded, deterministic feature pages", () => {
    const packet = makePacket([
      [0.1, 0.2, 0.3],
      [0.3, 0.2, 0.1],
      [0.1, 0.4, 0.2],
    ]);
    const firstPage = assessResponsePatterns(packet, { offset: 0, limit: 2 });
    const secondPage = assessResponsePatterns(packet, { offset: 2, limit: 2 });

    expect(firstPage.features.map((feature) => feature.featureId)).toEqual([
      "feature-1",
      "feature-2",
    ]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextOffset).toBe(2);
    expect(secondPage.features.map((feature) => feature.featureId)).toEqual([
      "feature-3",
    ]);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextOffset).toBeNull();
  });
});
