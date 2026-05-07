import { describe, it, expect } from "vitest";
import {
  buildHandoffPacket,
  createHandoffPacket,
} from "../../src/handoff/builder.js";

describe("buildHandoffPacket", () => {
  it("returns not-ready for invalid packet", () => {
    const result = buildHandoffPacket({ bad: true });
    expect(result.readyForPod).toBe(false);
    expect(result.qualifiedFeatureCount).toBe(0);
  });

  it("builds ready handoff for valid packet with accepted features", () => {
    const result = buildHandoffPacket({
      schemaVersion: "0.1.0",
      schemaName: "EpigenomicsFeatureResponsePacket",
      packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      datasetMetadataRef: "dataset-001",
      designRef: "design-001",
      features: [
        {
          featureId: "cg00000001",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg00000001",
          signalMetric: "beta_value",
          values: {
            "sample-ctrl-1": 0.82,
            "sample-ctrl-2": 0.85,
            "sample-ctrl-3": 0.84,
            "sample-low-1": 0.78,
            "sample-low-2": 0.80,
            "sample-low-3": 0.79,
            "sample-mid-1": 0.77,
            "sample-mid-2": 0.76,
            "sample-mid-3": 0.78,
            "sample-high-1": 0.75,
            "sample-high-2": 0.77,
            "sample-high-3": 0.76,
          },
        },
      ],
      design: {
        designId: "design-001",
        species: "Homo sapiens",
        doseGroups: [
          { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
          { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
          { doseGroupId: "mid", doseValue: 5, doseUnit: "µM" },
          { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
        ],
        samples: [
          { sampleId: "sample-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-ctrl-3", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-low-1", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-low-2", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-low-3", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-mid-1", doseGroupId: "mid", species: "Homo sapiens" },
          { sampleId: "sample-mid-2", doseGroupId: "mid", species: "Homo sapiens" },
          { sampleId: "sample-mid-3", doseGroupId: "mid", species: "Homo sapiens" },
          { sampleId: "sample-high-1", doseGroupId: "high", species: "Homo sapiens" },
          { sampleId: "sample-high-2", doseGroupId: "high", species: "Homo sapiens" },
          { sampleId: "sample-high-3", doseGroupId: "high", species: "Homo sapiens" },
        ],
        hasControls: true,
        minReplicatesPerGroup: 3,
      },
      provenance: {
        datasetId: "dataset-001",
        upstreamSteps: [
          { stepName: "norm", toolName: "minfi", toolVersion: "1.44.0", parameters: {} },
        ],
      },
      qualificationSummary: {
        acceptedCount: 1,
        excludedCount: 0,
        exploratoryCount: 0,
        caveatCount: 0,
      },
      qcReportRef: "qc-001",
      warnings: [],
      generatedAt: "2026-05-05T00:00:00Z",
    });

    expect(result.readyForPod).toBe(true);
    expect(result.qualifiedFeatureCount).toBe(1);
    expect(result.handoffId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("createHandoffPacket", () => {
  function makeBasePacket(overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: "0.1.0",
      schemaName: "EpigenomicsFeatureResponsePacket",
      packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      datasetMetadataRef: "dataset-001",
      designRef: "design-001",
      features: [
        {
          featureId: "cg00000001",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg00000001",
          signalMetric: "beta_value",
          values: {
            "sample-ctrl-1": 0.82,
            "sample-ctrl-2": 0.85,
            "sample-ctrl-3": 0.84,
            "sample-low-1": 0.78,
            "sample-low-2": 0.80,
            "sample-low-3": 0.79,
            "sample-mid-1": 0.77,
            "sample-mid-2": 0.76,
            "sample-mid-3": 0.78,
            "sample-high-1": 0.75,
            "sample-high-2": 0.77,
            "sample-high-3": 0.76,
          },
        },
      ],
      design: {
        designId: "design-001",
        species: "Homo sapiens",
        doseGroups: [
          { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
          { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
          { doseGroupId: "mid", doseValue: 5, doseUnit: "µM" },
          { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
        ],
        samples: [
          { sampleId: "sample-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-ctrl-3", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-low-1", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-low-2", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-low-3", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-mid-1", doseGroupId: "mid", species: "Homo sapiens" },
          { sampleId: "sample-mid-2", doseGroupId: "mid", species: "Homo sapiens" },
          { sampleId: "sample-mid-3", doseGroupId: "mid", species: "Homo sapiens" },
          { sampleId: "sample-high-1", doseGroupId: "high", species: "Homo sapiens" },
          { sampleId: "sample-high-2", doseGroupId: "high", species: "Homo sapiens" },
          { sampleId: "sample-high-3", doseGroupId: "high", species: "Homo sapiens" },
        ],
        hasControls: true,
        minReplicatesPerGroup: 3,
      },
      provenance: {
        datasetId: "dataset-001",
        upstreamSteps: [
          { stepName: "norm", toolName: "minfi", toolVersion: "1.44.0", parameters: {} },
        ],
      },
      qualificationSummary: {
        acceptedCount: 1,
        excludedCount: 0,
        exploratoryCount: 0,
        caveatCount: 0,
      },
      qcReportRef: "qc-001",
      warnings: [],
      generatedAt: "2026-05-05T00:00:00Z",
      ...overrides,
    };
  }

  it("returns null for invalid packet", () => {
    const handoff = createHandoffPacket({ bad: true });
    expect(handoff).toBeNull();
  });

  it("creates handoff with accepted_for_pod feature in doseResponseReadySubset", () => {
    const handoff = createHandoffPacket(makeBasePacket());
    expect(handoff).not.toBeNull();
    expect(handoff!.schemaVersion).toBe("0.1.0");
    expect(handoff!.schemaName).toBe("BioactivityPoDHandoffPacket");
    expect(handoff!.sourcePacketRef).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(handoff!.qualifiedFeatures).toHaveLength(1);
    expect(handoff!.qualifiedFeatures[0].featureId).toBe("cg00000001");
    expect(handoff!.qualifiedFeatures[0].status).toBe("accepted_for_pod");
    expect(handoff!.excludedFeatures).toHaveLength(0);
    expect(handoff!.doseResponseReadySubset).toEqual(["cg00000001"]);
  });

  it("includes accepted_with_caveats features in doseResponseReadySubset", () => {
    // Non-standard coordinate semantics are accepted with mandatory caveats.
    const handoff = createHandoffPacket(
      makeBasePacket({
        features: [
          {
            featureId: "cg00000001",
            featureClass: "cpg_methylation",
            modality: "dna_methylation_array",
            measuredIdentifier: "cg00000001",
            measuredRegion: {
              chrom: "chr1",
              start: 1000,
              end: 1001,
              build: "GRCh38",
              coordinateSystem: "1-based-closed",
            },
            signalMetric: "beta_value",
            values: {
              "sample-ctrl-1": 0.82,
              "sample-ctrl-2": 0.85,
              "sample-ctrl-3": 0.84,
              "sample-low-1": 0.78,
              "sample-low-2": 0.80,
              "sample-low-3": 0.79,
              "sample-mid-1": 0.77,
              "sample-mid-2": 0.76,
              "sample-mid-3": 0.78,
              "sample-high-1": 0.75,
              "sample-high-2": 0.77,
              "sample-high-3": 0.76,
            },
          },
        ],
      }),
    );

    expect(handoff).not.toBeNull();
    expect(handoff!.qualifiedFeatures).toHaveLength(1);
    expect(handoff!.qualifiedFeatures[0].status).toBe("accepted_with_caveats");
    expect(handoff!.doseResponseReadySubset).toContain("cg00000001");
    expect(handoff!.excludedFeatures).toHaveLength(0);
  });

  it("returns null when all features are excluded", () => {
    // Feature with >20% missing values should be excluded
    const handoff = createHandoffPacket(
      makeBasePacket({
        features: [
          {
            featureId: "cg_missing_001",
            featureClass: "cpg_methylation",
            modality: "dna_methylation_array",
            measuredIdentifier: "cg_missing_001",
            signalMetric: "beta_value",
            values: {
              "sample-ctrl-1": null,
              "sample-ctrl-2": null,
              "sample-ctrl-3": null,
              "sample-low-1": null,
              "sample-low-2": null,
              "sample-low-3": null,
              "sample-mid-1": null,
              "sample-mid-2": null,
              "sample-mid-3": null,
              "sample-high-1": 0.75,
              "sample-high-2": 0.77,
              "sample-high-3": 0.76,
            },
          },
        ],
      }),
    );

    // Fail-closed: no eligible features means no handoff packet
    expect(handoff).toBeNull();
  });

  it("includes provenance from source packet", () => {
    const handoff = createHandoffPacket(makeBasePacket());
    expect(handoff).not.toBeNull();
    expect(handoff!.provenance).toBeDefined();
    expect(handoff!.provenance!.datasetId).toBe("dataset-001");
    expect(handoff!.provenance!.upstreamSteps).toHaveLength(1);
  });

  it("includes mandatory caveats from blocking warnings", () => {
    const handoff = createHandoffPacket(
      makeBasePacket({
        warnings: [
          {
            warningCode: "EPIW999_TEST",
            severity: "error",
            message: "Blocking test warning",
            category: "cytotoxicity",
            blocksDownstream: true,
          },
        ],
      }),
    );

    expect(handoff).not.toBeNull();
    expect(handoff!.mandatoryCaveats.length).toBeGreaterThan(0);
    expect(
      handoff!.mandatoryCaveats.some((c) => c.warningCode === "EPIW999_TEST"),
    ).toBe(true);
  });

  it("includes claim guard statuses when available", () => {
    const handoff = createHandoffPacket(makeBasePacket());
    expect(handoff).not.toBeNull();
    expect(handoff!.persistenceStatus).toBeDefined();
    expect(handoff!.reversibilityStatus).toBeDefined();
    expect(handoff!.heritabilityClaim).toBeDefined();
  });
});
