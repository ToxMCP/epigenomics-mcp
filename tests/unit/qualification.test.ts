import { describe, it, expect } from "vitest";
import { qualifyFeatures } from "../../src/qualification/engine.js";

describe("qualifyFeatures", () => {
  it("returns zero counts for invalid packet", () => {
    const result = qualifyFeatures({ bad: true });
    expect(result.qualifiedCount).toBe(0);
    expect(result.excludedCount).toBe(0);
    expect(result.warnings[0].blocksDownstream).toBe(true);
  });

  it("qualifies complete features only when the design is dose-response-ready", () => {
    const result = qualifyFeatures({
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
            "sample-low-1": 0.78,
            "sample-low-2": 0.80,
            "sample-high-1": 0.74,
            "sample-high-2": 0.76,
          },
        },
      ],
      design: {
        designId: "design-001",
        species: "Homo sapiens",
        doseGroups: [
          { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
          { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
          { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
        ],
        samples: [
          { sampleId: "sample-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-low-1", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-low-2", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-high-1", doseGroupId: "high", species: "Homo sapiens" },
          { sampleId: "sample-high-2", doseGroupId: "high", species: "Homo sapiens" },
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
        acceptedCount: 1,
        excludedCount: 0,
        exploratoryCount: 0,
        caveatCount: 0,
      },
      qcReportRef: "qc-001",
      warnings: [],
      generatedAt: "2026-05-05T00:00:00Z",
    });

    expect(result.qualifiedCount).toBe(1);
    expect(result.excludedCount).toBe(0);
    expect(result.designValidation?.doseResponseReady).toBe(true);
  });

  it("does not promote a comparison-only design to PoD qualification", () => {
    const packet = {
      schemaVersion: "0.1.0",
      schemaName: "EpigenomicsFeatureResponsePacket",
      packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567891",
      datasetMetadataRef: "dataset-comparison",
      designRef: "design-comparison",
      features: [
        {
          featureId: "cg_comparison",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg_comparison",
          signalMetric: "beta_value",
          values: {
            "ctrl-1": 0.82,
            "ctrl-2": 0.85,
            "treated-1": 0.78,
            "treated-2": 0.80,
          },
        },
      ],
      design: {
        designId: "design-comparison",
        species: "Homo sapiens",
        doseGroups: [
          { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
          { doseGroupId: "treated", doseValue: 1, doseUnit: "µM" },
        ],
        samples: [
          { sampleId: "ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "treated-1", doseGroupId: "treated", species: "Homo sapiens" },
          { sampleId: "treated-2", doseGroupId: "treated", species: "Homo sapiens" },
        ],
        hasControls: true,
        minReplicatesPerGroup: 2,
      },
      provenance: {
        datasetId: "dataset-comparison",
        upstreamSteps: [
          { stepName: "norm", toolName: "minfi", toolVersion: "1.44.0", parameters: {} },
        ],
      },
      qualificationSummary: {
        acceptedCount: 0,
        excludedCount: 1,
        exploratoryCount: 0,
        caveatCount: 0,
      },
      qcReportRef: "qc-comparison",
      warnings: [],
      generatedAt: "2026-05-05T00:00:00Z",
    };

    const result = qualifyFeatures(packet);

    expect(result.designValidation?.comparisonReady).toBe(true);
    expect(result.designValidation?.doseResponseReady).toBe(false);
    expect(result.designValidation?.doseResponseBlockers).toEqual([
      "insufficient_nonzero_dose_levels",
    ]);
    expect(result.qualifiedCount).toBe(0);
    expect(result.qualifications?.[0].status).toBe(
      "excluded_insufficient_design",
    );
  });

  it("excludes features with excessive missingness", () => {
    const result = qualifyFeatures({
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
            "sample-ctrl-1": null,
            "sample-ctrl-2": null,
            "sample-low-1": null,
            "sample-low-2": 0.80,
            "sample-high-1": null,
            "sample-high-2": null,
          },
        },
      ],
      design: {
        designId: "design-001",
        species: "Homo sapiens",
        doseGroups: [
          { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
          { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
          { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
        ],
        samples: [
          { sampleId: "sample-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-low-1", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-low-2", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-high-1", doseGroupId: "high", species: "Homo sapiens" },
          { sampleId: "sample-high-2", doseGroupId: "high", species: "Homo sapiens" },
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
        acceptedCount: 0,
        excludedCount: 1,
        exploratoryCount: 0,
        caveatCount: 0,
      },
      qcReportRef: "qc-001",
      warnings: [],
      generatedAt: "2026-05-05T00:00:00Z",
    });

    expect(result.excludedCount).toBe(1);
    expect(result.qualifiedCount).toBe(0);
  });
});
