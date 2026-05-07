import { describe, it, expect } from "vitest";
import {
  summarizeReplicateConsistency,
  ReplicateConsistencyGroupSchema,
  ReplicateConsistencyPacketSchema,
} from "../../src/summarization/replicate_consistency.js";
import type { EpigenomicsFeatureResponsePacket } from "../../src/contracts/packets.js";

function makePacket(
  features: EpigenomicsFeatureResponsePacket["features"],
  samples?: EpigenomicsFeatureResponsePacket["design"]["samples"],
): EpigenomicsFeatureResponsePacket {
  return {
    schemaVersion: "0.1.0",
    schemaName: "EpigenomicsFeatureResponsePacket",
    packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    datasetMetadataRef: "dataset-001",
    designRef: "design-001",
    features,
    design: {
      designId: "design-001",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
      ],
      samples: samples ?? [
        { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-c3", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s-l2", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s-h1", doseGroupId: "high", species: "Homo sapiens" },
        { sampleId: "s-h2", doseGroupId: "high", species: "Homo sapiens" },
        { sampleId: "s-h3", doseGroupId: "high", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 2,
    },
    provenance: {
      datasetId: "dataset-001",
      upstreamSteps: [
        { stepName: "norm", toolName: "minfi", toolVersion: "1.44.0", parameters: {} },
      ],
    },
    qualificationSummary: {
      acceptedCount: features.length,
      excludedCount: 0,
      exploratoryCount: 0,
      caveatCount: 0,
    },
    qcReportRef: "qc-001",
    warnings: [],
    generatedAt: "2026-05-05T00:00:00Z",
  };
}

describe("summarizeReplicateConsistency", () => {
  it("produces correct summaries for balanced replicates", () => {
    const packet = makePacket([
      {
        featureId: "cg00000001",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000001",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.80,
          "s-c2": 0.82,
          "s-c3": 0.84,
          "s-l1": 0.70,
          "s-l2": 0.72,
          "s-h1": 0.60,
          "s-h2": 0.62,
          "s-h3": 0.64,
        },
      },
      {
        featureId: "cg00000002",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000002",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.20,
          "s-c2": 0.22,
          "s-c3": 0.24,
          "s-l1": 0.30,
          "s-l2": 0.32,
          "s-h1": 0.40,
          "s-h2": 0.42,
          "s-h3": 0.44,
        },
      },
    ]);

    const result = summarizeReplicateConsistency(packet);
    expect(result.groupCount).toBe(3);
    expect(result.groupsWithWarning).toBe(0);

    // Validate packet schema
    expect(() => ReplicateConsistencyPacketSchema.parse(result.packet)).not.toThrow();

    const ctrl = result.packet.groups.find((g) => g.doseGroupId === "ctrl")!;
    expect(ctrl.totalReplicates).toBe(3);
    expect(ctrl.biologicalReplicates).toBe(3);
    expect(ctrl.technicalReplicates).toBe(0);
    expect(ctrl.featureCount).toBe(2);
    expect(ctrl.evaluableFeatureCount).toBe(2);
    expect(ctrl.unusualSpreadWarning).toBe(false);
    expect(ctrl.meanOfFeatureMeans).toBeCloseTo(0.52, 6);
    expect(ctrl.meanOfFeatureSds).toBeGreaterThan(0);
    expect(ctrl.medianFeatureSd).toBeGreaterThan(0);
    expect(ctrl.pooledSd).toBeGreaterThan(0);
    expect(ctrl.meanCv).not.toBeNull();
    expect(ctrl.medianCv).not.toBeNull();
    expect(ctrl.maxCv).not.toBeNull();
    expect(ctrl.featuresExceedingCvThreshold).toBe(0);
  });

  it("detects unstable replicate groups and raises warnings", () => {
    // Feature values with very high variance within groups
    const packet = makePacket([
      {
        featureId: "cg-highvar-1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-highvar-1",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.10,
          "s-c2": 0.50,
          "s-c3": 0.90,
          "s-l1": 0.15,
          "s-l2": 0.55,
          "s-h1": 0.20,
          "s-h2": 0.60,
          "s-h3": 0.95,
        },
      },
      {
        featureId: "cg-highvar-2",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-highvar-2",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.05,
          "s-c2": 0.45,
          "s-c3": 0.85,
          "s-l1": 0.10,
          "s-l2": 0.50,
          "s-h1": 0.25,
          "s-h2": 0.65,
          "s-h3": 0.90,
        },
      },
      {
        featureId: "cg-highvar-3",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-highvar-3",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.12,
          "s-c2": 0.52,
          "s-c3": 0.92,
          "s-l1": 0.18,
          "s-l2": 0.58,
          "s-h1": 0.22,
          "s-h2": 0.62,
          "s-h3": 0.97,
        },
      },
      {
        featureId: "cg-highvar-4",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-highvar-4",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.08,
          "s-c2": 0.48,
          "s-c3": 0.88,
          "s-l1": 0.14,
          "s-l2": 0.54,
          "s-h1": 0.28,
          "s-h2": 0.68,
          "s-h3": 0.93,
        },
      },
    ]);

    const result = summarizeReplicateConsistency(packet, { cvThreshold: 0.3 });

    const ctrl = result.packet.groups.find((g) => g.doseGroupId === "ctrl")!;
    // With values spread 0.05-0.90, CV should be very high
    expect(ctrl.maxCv).toBeGreaterThan(0.3);
    expect(ctrl.unusualSpreadWarning).toBe(true);
    expect(result.groupsWithWarning).toBeGreaterThan(0);
  });

  it("distinguishes biological and technical replicates", () => {
    const samplesWithTechReps = [
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" as const },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" as const },
      { sampleId: "s-c1-tech", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "technical" as const },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" as const },
      { sampleId: "s-l1-tech", doseGroupId: "low", species: "Homo sapiens", replicateType: "technical" as const },
      { sampleId: "s-h1", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" as const },
      { sampleId: "s-h2", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" as const },
      { sampleId: "s-h3", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" as const },
    ];

    const packet = makePacket(
      [
        {
          featureId: "cg00000001",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg00000001",
          signalMetric: "beta_value",
          values: {
            "s-c1": 0.80,
            "s-c2": 0.82,
            "s-c1-tech": 0.81,
            "s-l1": 0.70,
            "s-l1-tech": 0.71,
            "s-h1": 0.60,
            "s-h2": 0.62,
            "s-h3": 0.64,
          },
        },
      ],
      samplesWithTechReps,
    );

    const result = summarizeReplicateConsistency(packet);
    const ctrl = result.packet.groups.find((g) => g.doseGroupId === "ctrl")!;
    expect(ctrl.totalReplicates).toBe(3);
    expect(ctrl.biologicalReplicates).toBe(2);
    expect(ctrl.technicalReplicates).toBe(1);

    const low = result.packet.groups.find((g) => g.doseGroupId === "low")!;
    expect(low.totalReplicates).toBe(2);
    expect(low.biologicalReplicates).toBe(1);
    expect(low.technicalReplicates).toBe(1);

    const high = result.packet.groups.find((g) => g.doseGroupId === "high")!;
    expect(high.totalReplicates).toBe(3);
    expect(high.biologicalReplicates).toBe(3);
    expect(high.technicalReplicates).toBe(0);
  });

  it("counts samples with undefined replicateType as biological", () => {
    const packet = makePacket([
      {
        featureId: "cg00000001",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000001",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.80,
          "s-c2": 0.82,
          "s-c3": 0.84,
          "s-l1": 0.70,
          "s-l2": 0.72,
          "s-h1": 0.60,
          "s-h2": 0.62,
          "s-h3": 0.64,
        },
      },
    ]);

    const result = summarizeReplicateConsistency(packet);
    const ctrl = result.packet.groups.find((g) => g.doseGroupId === "ctrl")!;
    expect(ctrl.biologicalReplicates).toBe(3);
    expect(ctrl.technicalReplicates).toBe(0);
  });

  it("handles single-replicate groups (sd = 0, cv = 0)", () => {
    const singleRepSamples = [
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens" },
      { sampleId: "s-h1", doseGroupId: "high", species: "Homo sapiens" },
    ];

    const packet = makePacket(
      [
        {
          featureId: "cg00000001",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg00000001",
          signalMetric: "beta_value",
          values: {
            "s-c1": 0.80,
            "s-l1": 0.70,
            "s-h1": 0.60,
          },
        },
      ],
      singleRepSamples,
    );

    const result = summarizeReplicateConsistency(packet);
    const ctrl = result.packet.groups.find((g) => g.doseGroupId === "ctrl")!;
    expect(ctrl.totalReplicates).toBe(1);
    expect(ctrl.meanOfFeatureSds).toBe(0);
    expect(ctrl.medianFeatureSd).toBe(0);
    expect(ctrl.pooledSd).toBe(0);
    expect(ctrl.meanCv).toBe(0);
    expect(ctrl.medianCv).toBe(0);
    expect(ctrl.maxCv).toBe(0);
    expect(ctrl.unusualSpreadWarning).toBe(false);
  });

  it("excludes CV when mean is near zero", () => {
    const packet = makePacket([
      {
        featureId: "cg-near-zero",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-near-zero",
        signalMetric: "m_value",
        values: {
          "s-c1": 1e-13,
          "s-c2": -1e-13,
          "s-c3": 2e-13,
          "s-l1": 1e-13,
          "s-l2": -1e-13,
          "s-h1": 2e-13,
          "s-h2": -2e-13,
          "s-h3": 1e-13,
        },
      },
      {
        featureId: "cg-normal",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-normal",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.80,
          "s-c2": 0.82,
          "s-c3": 0.84,
          "s-l1": 0.70,
          "s-l2": 0.72,
          "s-h1": 0.60,
          "s-h2": 0.62,
          "s-h3": 0.64,
        },
      },
    ]);

    const result = summarizeReplicateConsistency(packet);
    const ctrl = result.packet.groups.find((g) => g.doseGroupId === "ctrl")!;
    // One feature excluded from CV due to near-zero mean
    expect(ctrl.evaluableFeatureCount).toBe(1);
    expect(ctrl.featureCount).toBe(2);
  });

  it("handles missing values gracefully", () => {
    const packet = makePacket([
      {
        featureId: "cg-missing",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-missing",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.80,
          "s-c2": null,
          "s-c3": 0.84,
          "s-l1": 0.70,
          "s-l2": null,
          "s-h1": 0.60,
          "s-h2": 0.62,
          "s-h3": null,
        },
      },
    ]);

    const result = summarizeReplicateConsistency(packet);
    const ctrl = result.packet.groups.find((g) => g.doseGroupId === "ctrl")!;
    expect(ctrl.totalReplicates).toBe(3);
    // Only 2 present values, SD computed from those
    expect(ctrl.meanOfFeatureSds).toBeGreaterThan(0);
    expect(ctrl.pooledSd).toBeGreaterThan(0);
    expect(ctrl.evaluableFeatureCount).toBe(1);
  });

  it("handles all-missing features with zero SD and no CV contribution", () => {
    const packet = makePacket([
      {
        featureId: "cg-all-missing",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-all-missing",
        signalMetric: "beta_value",
        values: {
          "s-c1": null,
          "s-c2": null,
          "s-c3": null,
          "s-l1": null,
          "s-l2": null,
          "s-h1": null,
          "s-h2": null,
          "s-h3": null,
        },
      },
    ]);

    const result = summarizeReplicateConsistency(packet);
    const ctrl = result.packet.groups.find((g) => g.doseGroupId === "ctrl")!;
    expect(ctrl.meanOfFeatureSds).toBe(0);
    expect(ctrl.medianFeatureSd).toBe(0);
    expect(ctrl.pooledSd).toBe(0);
    expect(ctrl.evaluableFeatureCount).toBe(0);
    expect(ctrl.meanCv).toBeNull();
    expect(ctrl.medianCv).toBeNull();
    expect(ctrl.maxCv).toBeNull();
  });

  it("uses custom CV threshold correctly", () => {
    const packet = makePacket([
      {
        featureId: "cg00000001",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000001",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.80,
          "s-c2": 0.82,
          "s-c3": 0.84,
          "s-l1": 0.70,
          "s-l2": 0.72,
          "s-h1": 0.60,
          "s-h2": 0.62,
          "s-h3": 0.64,
        },
      },
    ]);

    const resultLowThreshold = summarizeReplicateConsistency(packet, { cvThreshold: 0.01 });
    const resultHighThreshold = summarizeReplicateConsistency(packet, { cvThreshold: 1.0 });

    const ctrlLow = resultLowThreshold.packet.groups.find((g) => g.doseGroupId === "ctrl")!;
    const ctrlHigh = resultHighThreshold.packet.groups.find((g) => g.doseGroupId === "ctrl")!;

    expect(ctrlLow.cvThreshold).toBe(0.01);
    expect(ctrlHigh.cvThreshold).toBe(1.0);
    expect(ctrlLow.featuresExceedingCvThreshold).toBeGreaterThanOrEqual(
      ctrlHigh.featuresExceedingCvThreshold,
    );
  });

  it("produces summary output with expected precision for mean calculations", () => {
    const packet = makePacket([
      {
        featureId: "cg-precise",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-precise",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.1,
          "s-c2": 0.2,
          "s-c3": 0.3,
          "s-l1": 0.4,
          "s-l2": 0.5,
          "s-h1": 0.6,
          "s-h2": 0.7,
          "s-h3": 0.8,
        },
      },
    ]);

    const result = summarizeReplicateConsistency(packet);
    const ctrl = result.packet.groups.find((g) => g.doseGroupId === "ctrl")!;
    // Mean of [0.1, 0.2, 0.3] = 0.2
    expect(ctrl.meanOfFeatureMeans).toBeCloseTo(0.2, 10);
    // SD of [0.1, 0.2, 0.3] = 0.1
    expect(ctrl.meanOfFeatureSds).toBeCloseTo(0.1, 10);
    expect(ctrl.medianFeatureSd).toBeCloseTo(0.1, 10);

    const low = result.packet.groups.find((g) => g.doseGroupId === "low")!;
    expect(low.meanOfFeatureMeans).toBeCloseTo(0.45, 10);
    expect(low.meanOfFeatureSds).toBeCloseTo(0.070710678, 6);

    const high = result.packet.groups.find((g) => g.doseGroupId === "high")!;
    expect(high.meanOfFeatureMeans).toBeCloseTo(0.7, 10);
    expect(high.meanOfFeatureSds).toBeCloseTo(0.1, 10);
  });

  it("validates ReplicateConsistencyGroupSchema for all generated groups", () => {
    const packet = makePacket([
      {
        featureId: "cg00000001",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000001",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.80,
          "s-c2": null,
          "s-c3": 0.84,
          "s-l1": 0.70,
          "s-l2": null,
          "s-h1": null,
          "s-h2": null,
          "s-h3": null,
        },
      },
    ]);

    const result = summarizeReplicateConsistency(packet);
    for (const group of result.packet.groups) {
      expect(() => ReplicateConsistencyGroupSchema.parse(group)).not.toThrow();
    }
  });

  it("handles a group with no assigned samples", () => {
    const customPacket: EpigenomicsFeatureResponsePacket = {
      ...makePacket([]),
      design: {
        designId: "design-001",
        species: "Homo sapiens",
        doseGroups: [
          { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
          { doseGroupId: "empty", doseValue: 99, doseUnit: "µM" },
        ],
        samples: [
          { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        ],
        hasControls: true,
        minReplicatesPerGroup: 1,
      },
      features: [
        {
          featureId: "cg00000001",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg00000001",
          signalMetric: "beta_value",
          values: {
            "s-c1": 0.80,
          },
        },
      ],
    };

    const result = summarizeReplicateConsistency(customPacket);
    const empty = result.packet.groups.find((g) => g.doseGroupId === "empty")!;
    expect(empty.totalReplicates).toBe(0);
    expect(empty.biologicalReplicates).toBe(0);
    expect(empty.technicalReplicates).toBe(0);
    expect(empty.meanOfFeatureMeans).toBeNull();
    expect(empty.meanOfFeatureSds).toBe(0);
    expect(empty.medianFeatureSd).toBe(0);
    expect(empty.pooledSd).toBe(0);
    expect(empty.meanCv).toBeNull();
    expect(empty.medianCv).toBeNull();
    expect(empty.maxCv).toBeNull();
    expect(empty.evaluableFeatureCount).toBe(0);
    expect(empty.unusualSpreadWarning).toBe(false);
  });

  it("does not perform dose-response modelling or outlier removal", () => {
    const packet = makePacket([
      {
        featureId: "cg00000001",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000001",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.80,
          "s-c2": 0.82,
          "s-c3": 0.84,
          "s-l1": 0.70,
          "s-l2": 0.72,
          "s-h1": 0.60,
          "s-h2": 0.62,
          "s-h3": 0.64,
        },
      },
    ]);

    const result = summarizeReplicateConsistency(packet);
    for (const g of result.packet.groups) {
      expect(g).toHaveProperty("meanOfFeatureMeans");
      expect(g).toHaveProperty("meanOfFeatureSds");
      expect(g).toHaveProperty("medianFeatureSd");
      expect(g).toHaveProperty("pooledSd");
      expect(g).toHaveProperty("meanCv");
      expect(g).toHaveProperty("medianCv");
      expect(g).toHaveProperty("maxCv");
      expect(g).not.toHaveProperty("pod");
      expect(g).not.toHaveProperty("bmd");
      expect(g).not.toHaveProperty("trendPvalue");
      expect(g).not.toHaveProperty("outlierRemoved");
      expect(g).not.toHaveProperty("fittedModel");
    }
  });
});
