import { describe, it, expect } from "vitest";
import {
  summarizeByGroup,
  FeatureGroupSummarySchema,
  GroupSummaryPacketSchema,
} from "../../src/summarization/group_summary.js";
import type { EpigenomicsFeatureResponsePacket } from "../../src/contracts/packets.js";

function makePacket(
  features: EpigenomicsFeatureResponsePacket["features"],
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
      samples: [
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

describe("summarizeByGroup", () => {
  it("produces correct summaries for balanced groups", () => {
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

    const result = summarizeByGroup(packet);
    expect(result.featureCount).toBe(1);
    expect(result.groupCount).toBe(3);
    expect(result.totalSummaries).toBe(3);

    // Check schema validity
    expect(() => GroupSummaryPacketSchema.parse(result.packet)).not.toThrow();

    const ctrl = result.packet.summaries.find((s) => s.doseGroupId === "ctrl")!;
    expect(ctrl.mean).toBeCloseTo(0.82, 6);
    expect(ctrl.n).toBe(3);
    expect(ctrl.missingCount).toBe(0);
    expect(ctrl.missingFraction).toBe(0);
    expect(ctrl.sd).toBeGreaterThan(0);

    const low = result.packet.summaries.find((s) => s.doseGroupId === "low")!;
    expect(low.mean).toBeCloseTo(0.71, 6);
    expect(low.n).toBe(2);

    const high = result.packet.summaries.find((s) => s.doseGroupId === "high")!;
    expect(high.mean).toBeCloseTo(0.62, 6);
    expect(high.n).toBe(3);
  });

  it("handles missing values correctly", () => {
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
          "s-c3": null,
          "s-l1": 0.70,
          "s-l2": null,
          "s-h1": 0.60,
          "s-h2": 0.62,
          "s-h3": null,
        },
      },
    ]);

    const result = summarizeByGroup(packet);
    const ctrl = result.packet.summaries.find((s) => s.doseGroupId === "ctrl")!;
    expect(ctrl.n).toBe(1);
    expect(ctrl.missingCount).toBe(2);
    expect(ctrl.missingFraction).toBe(2 / 3);
    expect(ctrl.mean).toBe(0.80);
    expect(ctrl.sd).toBe(0);

    const low = result.packet.summaries.find((s) => s.doseGroupId === "low")!;
    expect(low.n).toBe(1);
    expect(low.missingCount).toBe(1);
    expect(low.missingFraction).toBe(0.5);

    const high = result.packet.summaries.find((s) => s.doseGroupId === "high")!;
    expect(high.n).toBe(2);
    expect(high.missingCount).toBe(1);
    expect(high.missingFraction).toBe(1 / 3);
  });

  it("summarizes features that would be excluded due to excessive missingness", () => {
    const packet = makePacket([
      {
        featureId: "cg-bad",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-bad",
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

    const result = summarizeByGroup(packet);
    expect(result.totalSummaries).toBe(3);
    for (const s of result.packet.summaries) {
      expect(s.n).toBe(0);
      expect(s.missingCount).toBeGreaterThan(0);
      expect(s.missingFraction).toBe(1);
      expect(s.mean).toBeNull();
      expect(s.sd).toBe(0);
    }
  });

  it("preserves sample references when requested", () => {
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

    const result = summarizeByGroup(packet, { includeSampleRefs: true });
    const ctrl = result.packet.summaries.find((s) => s.doseGroupId === "ctrl")!;
    expect(ctrl.sampleRefs).toBeDefined();
    expect(ctrl.sampleRefs!["s-c1"]).toBe(0.80);
    expect(ctrl.sampleRefs!["s-c2"]).toBe(0.82);
  });

  it("omits sample references when disabled", () => {
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

    const result = summarizeByGroup(packet, { includeSampleRefs: false });
    const ctrl = result.packet.summaries.find((s) => s.doseGroupId === "ctrl")!;
    expect(ctrl.sampleRefs).toBeUndefined();
  });

  it("handles multiple features independently", () => {
    const packet = makePacket([
      {
        featureId: "cg-1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-1",
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
        featureId: "cg-2",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg-2",
        signalMetric: "beta_value",
        values: {
          "s-c1": 0.10,
          "s-c2": 0.12,
          "s-c3": 0.14,
          "s-l1": 0.20,
          "s-l2": 0.22,
          "s-h1": 0.30,
          "s-h2": 0.32,
          "s-h3": 0.34,
        },
      },
    ]);

    const result = summarizeByGroup(packet);
    expect(result.totalSummaries).toBe(6);
    const cg1Ctrl = result.packet.summaries.find(
      (s) => s.featureId === "cg-1" && s.doseGroupId === "ctrl",
    )!;
    const cg2Ctrl = result.packet.summaries.find(
      (s) => s.featureId === "cg-2" && s.doseGroupId === "ctrl",
    )!;
    expect(cg1Ctrl.mean).toBeCloseTo(0.82, 6);
    expect(cg2Ctrl.mean).toBeCloseTo(0.12, 6);
  });

  it("does not perform any dose-response modelling", () => {
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

    const result = summarizeByGroup(packet);
    // Verify the output structure contains only descriptive statistics,
    // no PoD, BMD, or other model-derived fields.
    for (const s of result.packet.summaries) {
      expect(s).toHaveProperty("mean");
      expect(s).toHaveProperty("sd");
      expect(s).toHaveProperty("n");
      expect(s).toHaveProperty("missingCount");
      expect(s).toHaveProperty("missingFraction");
      expect(s).not.toHaveProperty("pod");
      expect(s).not.toHaveProperty("bmd");
      expect(s).not.toHaveProperty("bmdl");
      expect(s).not.toHaveProperty("bmdu");
      expect(s).not.toHaveProperty("trendPvalue");
      expect(s).not.toHaveProperty("noel");
      expect(s).not.toHaveProperty("loel");
    }
  });

  it("validates FeatureGroupSummarySchema for all generated summaries", () => {
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
          "s-l2": 0.72,
          "s-h1": null,
          "s-h2": null,
          "s-h3": null,
        },
      },
    ]);

    const result = summarizeByGroup(packet);
    for (const summary of result.packet.summaries) {
      expect(() => FeatureGroupSummarySchema.parse(summary)).not.toThrow();
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

    const result = summarizeByGroup(customPacket);
    const empty = result.packet.summaries.find((s) => s.doseGroupId === "empty")!;
    expect(empty.n).toBe(0);
    expect(empty.missingCount).toBe(0);
    expect(empty.missingFraction).toBe(0);
    expect(empty.mean).toBeNull();
    expect(empty.sd).toBe(0);
  });
});
