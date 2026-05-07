import { describe, it, expect } from "vitest";
import { guardClaims } from "../../src/qualification/claim_guards.js";
import type { ExperimentalDesign } from "../../src/contracts/design.js";

function makeDesign(
  overrides: Partial<ExperimentalDesign> = {},
): ExperimentalDesign {
  return {
    designId: "design-001",
    species: "Homo sapiens",
    doseGroups: [
      { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
    ],
    samples: [
      { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
    ],
    hasControls: true,
    minReplicatesPerGroup: 1,
    ...overrides,
  };
}

describe("guardClaims", () => {
  it("defaults persistence_status to not_assessed for single-timepoint design", () => {
    const design = makeDesign({ persistenceStatus: "persistent" });
    const result = guardClaims(design);
    expect(result.persistenceStatus).toBe("not_assessed");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW009");
    expect(result.warnings[0].category).toBe("time_dependence");
    expect(result.warnings[0].blocksDownstream).toBe(false);
  });

  it("defaults reversibility_status to not_assessed for single-timepoint design", () => {
    const design = makeDesign({ reversibilityStatus: "reversible" });
    const result = guardClaims(design);
    expect(result.reversibilityStatus).toBe("not_assessed");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW009");
  });

  it("allows persistence claim when repeated/recovery timepoints are present", () => {
    const design = makeDesign({
      persistenceStatus: "persistent",
      doseGroups: [
        { doseGroupId: "ctrl-t0", doseValue: 0, doseUnit: "µM", timepointHours: 0 },
        { doseGroupId: "low-t0", doseValue: 1, doseUnit: "µM", timepointHours: 0 },
        { doseGroupId: "ctrl-t72", doseValue: 0, doseUnit: "µM", timepointHours: 72 },
        { doseGroupId: "low-t72", doseValue: 1, doseUnit: "µM", timepointHours: 72 },
      ],
      samples: [
        { sampleId: "s1", doseGroupId: "ctrl-t0", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s2", doseGroupId: "low-t0", species: "Homo sapiens" },
        { sampleId: "s3", doseGroupId: "ctrl-t72", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s4", doseGroupId: "low-t72", species: "Homo sapiens" },
      ],
    });
    const result = guardClaims(design);
    expect(result.persistenceStatus).toBe("persistent");
    expect(result.warnings).toHaveLength(0);
  });

  it("allows reversibility claim when repeated/recovery timepoints are present", () => {
    const design = makeDesign({
      reversibilityStatus: "irreversible",
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM", timepointHours: 0 },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM", timepointHours: 0 },
        { doseGroupId: "recovery", doseValue: 0, doseUnit: "µM", timepointHours: 72 },
      ],
      samples: [
        { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s3", doseGroupId: "recovery", species: "Homo sapiens", controlFlag: true },
      ],
    });
    const result = guardClaims(design);
    expect(result.reversibilityStatus).toBe("irreversible");
    expect(result.warnings).toHaveLength(0);
  });

  it("defaults both claims and emits one warning each", () => {
    const design = makeDesign({
      persistenceStatus: "transient",
      reversibilityStatus: "reversible",
    });
    const result = guardClaims(design);
    expect(result.persistenceStatus).toBe("not_assessed");
    expect(result.reversibilityStatus).toBe("not_assessed");
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.every((w) => w.warningCode === "EPIW009")).toBe(true);
  });

  it("strips heritability claim when multigenerationalDesign is not true", () => {
    const design = makeDesign({ heritabilityClaim: "heritable" });
    const result = guardClaims(design);
    expect(result.heritabilityClaim).toBe("none");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW010");
    expect(result.warnings[0].category).toBe("missing_metadata");
    expect(result.warnings[0].blocksDownstream).toBe(true);
  });

  it("strips transgenerational claim when multigenerationalDesign is not true", () => {
    const design = makeDesign({ heritabilityClaim: "transgenerational" });
    const result = guardClaims(design);
    expect(result.heritabilityClaim).toBe("none");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW010");
  });

  it("allows heritability claim when multigenerationalDesign is true", () => {
    const design = makeDesign({
      heritabilityClaim: "heritable",
      multigenerationalDesign: true,
    });
    const result = guardClaims(design);
    expect(result.heritabilityClaim).toBe("heritable");
    expect(result.warnings).toHaveLength(0);
  });

  it("allows transgenerational claim when multigenerationalDesign is true", () => {
    const design = makeDesign({
      heritabilityClaim: "transgenerational",
      multigenerationalDesign: true,
    });
    const result = guardClaims(design);
    expect(result.heritabilityClaim).toBe("transgenerational");
    expect(result.warnings).toHaveLength(0);
  });

  it("defaults all claims to not_assessed/none when absent", () => {
    const design = makeDesign();
    const result = guardClaims(design);
    expect(result.persistenceStatus).toBe("not_assessed");
    expect(result.reversibilityStatus).toBe("not_assessed");
    expect(result.heritabilityClaim).toBe("none");
    expect(result.warnings).toHaveLength(0);
  });
});

describe("claim guards integration with qualification engine", () => {
  it("returns claimGuardResult in qualification output", async () => {
    const { qualifyFeatures } = await import("../../src/qualification/engine.js");
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
          },
        },
      ],
      design: {
        designId: "design-001",
        species: "Homo sapiens",
        doseGroups: [
          { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
          { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        ],
        samples: [
          { sampleId: "sample-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-low-1", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-low-2", doseGroupId: "low", species: "Homo sapiens" },
        ],
        hasControls: true,
        minReplicatesPerGroup: 2,
        persistenceStatus: "persistent",
        heritabilityClaim: "heritable",
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

    expect(result.claimGuardResult).toBeDefined();
    expect(result.claimGuardResult!.persistenceStatus).toBe("not_assessed");
    expect(result.claimGuardResult!.reversibilityStatus).toBe("not_assessed");
    expect(result.claimGuardResult!.heritabilityClaim).toBe("none");

    const epiw009 = result.warnings.filter((w) => w.warningCode === "EPIW009");
    const epiw010 = result.warnings.filter((w) => w.warningCode === "EPIW010");
    expect(epiw009.length).toBeGreaterThanOrEqual(1);
    expect(epiw010.length).toBe(1);
  });
});

describe("claim guards integration with handoff builder", () => {
  it("strips unsupported claims from handoff packet", async () => {
    const { buildHandoffPacket } = await import("../../src/handoff/builder.js");
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
            "sample-low-1": 0.78,
            "sample-low-2": 0.80,
          },
        },
      ],
      design: {
        designId: "design-001",
        species: "Homo sapiens",
        doseGroups: [
          { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
          { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        ],
        samples: [
          { sampleId: "sample-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "sample-low-1", doseGroupId: "low", species: "Homo sapiens" },
          { sampleId: "sample-low-2", doseGroupId: "low", species: "Homo sapiens" },
        ],
        hasControls: true,
        minReplicatesPerGroup: 2,
        persistenceStatus: "persistent",
        reversibilityStatus: "reversible",
        heritabilityClaim: "transgenerational",
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
  });
});
