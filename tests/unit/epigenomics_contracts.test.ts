import { describe, it, expect } from "vitest";
import {
  MissingnessProfileSchema,
  VarianceProfileSchema,
  EpigenomicsWarningSchema,
  EpigenomicsErrorSchema,
  EpigenomicsFeatureQualificationSchema,
  EpigenomicsQCReportSchema,
  EpigenomicsFeatureResponsePacketSchema,
  BioactivityPoDHandoffPacketSchema,
} from "../../src/contracts/index.js";

describe("MissingnessProfile contract", () => {
  it("accepts a valid missingness profile", () => {
    const profile = MissingnessProfileSchema.parse({
      datasetId: "ds-001",
      policyVersion: "v1.0.0",
      overallFeatureMissingFraction: 0.05,
      perFeatureMissingness: [
        { featureId: "feat-1", missingFraction: 0, band: "acceptable" },
        { featureId: "feat-2", missingFraction: 0.1, band: "warning" },
      ],
      perSampleMissingness: [
        { sampleId: "s1", missingFraction: 0.05, band: "acceptable" },
      ],
      perGroupMissingness: [
        { doseGroupId: "ctrl", missingFraction: 0, band: "acceptable", completeDropoutFeatureIds: [] },
      ],
      featuresWithCompleteGroupDropout: [],
      summaryBand: "acceptable",
    });
    expect(profile.datasetId).toBe("ds-001");
    expect(profile.summaryBand).toBe("acceptable");
  });

  it("rejects missingness profile with invalid band", () => {
    expect(() =>
      MissingnessProfileSchema.parse({
        datasetId: "ds-001",
        policyVersion: "v1.0.0",
        overallFeatureMissingFraction: 0.05,
        perFeatureMissingness: [],
        perSampleMissingness: [],
        perGroupMissingness: [],
        featuresWithCompleteGroupDropout: [],
        summaryBand: "unknown",
      }),
    ).toThrow();
  });
});

describe("VarianceProfile contract", () => {
  it("accepts a valid variance profile", () => {
    const profile = VarianceProfileSchema.parse({
      datasetId: "ds-001",
      policyVersion: "v1.0.0",
      perFeatureVariance: [
        { featureId: "feat-1", variance: 0.12, coefficientOfVariation: 0.35, dynamicRangeBand: "high" },
        { featureId: "feat-2", variance: 0.001, dynamicRangeBand: "low" },
      ],
      replicateStability: {
        meanCorrelation: 0.95,
        minCorrelation: 0.88,
        stabilityBand: "stable",
      },
      summaryBand: "acceptable",
    });
    expect(profile.datasetId).toBe("ds-001");
    expect(profile.perFeatureVariance).toHaveLength(2);
    expect(profile.replicateStability?.stabilityBand).toBe("stable");
  });

  it("accepts variance profile without replicate stability", () => {
    const profile = VarianceProfileSchema.parse({
      datasetId: "ds-002",
      policyVersion: "v1.0.0",
      perFeatureVariance: [],
      summaryBand: "not_applicable",
    });
    expect(profile.replicateStability).toBeUndefined();
  });

  it("rejects variance profile with negative variance", () => {
    expect(() =>
      VarianceProfileSchema.parse({
        datasetId: "ds-001",
        policyVersion: "v1.0.0",
        perFeatureVariance: [
          { featureId: "feat-1", variance: -0.1, dynamicRangeBand: "high" },
        ],
        summaryBand: "acceptable",
      }),
    ).toThrow();
  });
});

describe("EpigenomicsWarning contract", () => {
  it("accepts a valid warning", () => {
    const warning = EpigenomicsWarningSchema.parse({
      schemaName: "EpigenomicsWarning",
      schemaVersion: "0.1.0",
      warningCode: "EPIW001_COORDINATE_SYSTEM_NONSTANDARD",
      severity: "caution",
      scope: "feature",
      message: "Non-standard coordinate system detected",
      downstreamUseRule: "allow_with_warning",
      evidenceRefs: ["ref-1", "ref-2"],
    });
    expect(warning.warningCode).toBe("EPIW001_COORDINATE_SYSTEM_NONSTANDARD");
    expect(warning.downstreamUseRule).toBe("allow_with_warning");
    expect(warning.evidenceRefs).toEqual(["ref-1", "ref-2"]);
  });

  it("accepts a valid critical warning", () => {
    const warning = EpigenomicsWarningSchema.parse({
      schemaName: "EpigenomicsWarning",
      schemaVersion: "0.1.0",
      warningCode: "EPIW999_CRITICAL",
      severity: "critical",
      scope: "dataset",
      message: "Critical issue",
      downstreamUseRule: "block",
    });
    expect(warning.severity).toBe("critical");
  });

  it("rejects warning with invalid severity", () => {
    expect(() =>
      EpigenomicsWarningSchema.parse({
        schemaName: "EpigenomicsWarning",
        schemaVersion: "0.1.0",
        warningCode: "EPIW001",
        severity: "error",
        scope: "feature",
        message: "Bad",
        downstreamUseRule: "allow",
      }),
    ).toThrow();
  });

  it("rejects warning with extra fields", () => {
    expect(() =>
      EpigenomicsWarningSchema.parse({
        schemaName: "EpigenomicsWarning",
        schemaVersion: "0.1.0",
        warningCode: "EPIW001",
        severity: "info",
        scope: "dataset",
        message: "Note",
        downstreamUseRule: "allow",
        extraField: "bad",
      }),
    ).toThrow();
  });
});

describe("EpigenomicsError contract", () => {
  it("accepts a valid error", () => {
    const error = EpigenomicsErrorSchema.parse({
      schemaName: "EpigenomicsError",
      schemaVersion: "0.1.0",
      errorCode: "EPIE001_FATAL",
      severity: "fatal",
      scope: "dataset",
      message: "Fatal error blocks packet creation",
      remediationHint: "Check input files",
    });
    expect(error.errorCode).toBe("EPIE001_FATAL");
    expect(error.severity).toBe("fatal");
    expect(error.remediationHint).toBe("Check input files");
  });

  it("accepts minimal error without remediation hint", () => {
    const error = EpigenomicsErrorSchema.parse({
      schemaName: "EpigenomicsError",
      schemaVersion: "0.1.0",
      errorCode: "EPIE002",
      severity: "error",
      scope: "feature",
      message: "Feature error",
    });
    expect(error.remediationHint).toBeUndefined();
  });

  it("rejects error with invalid severity", () => {
    expect(() =>
      EpigenomicsErrorSchema.parse({
        schemaName: "EpigenomicsError",
        schemaVersion: "0.1.0",
        errorCode: "EPIE001",
        severity: "warning",
        scope: "dataset",
        message: "Bad",
      }),
    ).toThrow();
  });
});

describe("EpigenomicsFeatureQualification contract", () => {
  it("accepts a valid accepted qualification", () => {
    const qual = EpigenomicsFeatureQualificationSchema.parse({
      schemaName: "EpigenomicsFeatureQualification",
      schemaVersion: "0.1.0",
      featureId: "cg00000001",
      qualificationStatus: "accepted_for_pod",
      qualificationReasons: ["Passed all QC checks"],
      warningRefs: [],
      humanReviewRequired: false,
      downstreamUseRule: "allow",
    });
    expect(qual.featureId).toBe("cg00000001");
    expect(qual.qualificationStatus).toBe("accepted_for_pod");
    expect(qual.humanReviewRequired).toBe(false);
  });

  it("accepts a valid excluded qualification", () => {
    const qual = EpigenomicsFeatureQualificationSchema.parse({
      schemaName: "EpigenomicsFeatureQualification",
      schemaVersion: "0.1.0",
      featureId: "cg00000002",
      qualificationStatus: "excluded_high_missingness",
      qualificationReasons: ["Missingness exceeds exclusion threshold"],
      warningRefs: ["warn-001"],
      humanReviewRequired: true,
    });
    expect(qual.qualificationStatus).toBe("excluded_high_missingness");
    expect(qual.humanReviewRequired).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const qual = EpigenomicsFeatureQualificationSchema.parse({
      schemaName: "EpigenomicsFeatureQualification",
      schemaVersion: "0.1.0",
      featureId: "feat-1",
      qualificationStatus: "exploratory_only",
      qualificationReasons: ["Confounding dominant"],
    });
    expect(qual.warningRefs).toEqual([]);
    expect(qual.humanReviewRequired).toBe(false);
    expect(qual.downstreamUseRule).toBeUndefined();
  });

  it("rejects qualification without reasons", () => {
    expect(() =>
      EpigenomicsFeatureQualificationSchema.parse({
        schemaName: "EpigenomicsFeatureQualification",
        schemaVersion: "0.1.0",
        featureId: "feat-1",
        qualificationStatus: "accepted_for_pod",
        qualificationReasons: [],
      }),
    ).toThrow();
  });

  it("rejects qualification with extra fields", () => {
    expect(() =>
      EpigenomicsFeatureQualificationSchema.parse({
        schemaName: "EpigenomicsFeatureQualification",
        schemaVersion: "0.1.0",
        featureId: "feat-1",
        qualificationStatus: "accepted_for_pod",
        qualificationReasons: ["OK"],
        extraField: "bad",
      }),
    ).toThrow();
  });
});

describe("EpigenomicsQCReport contract", () => {
  it("accepts a valid QC report", () => {
    const report = EpigenomicsQCReportSchema.parse({
      reportId: "qc-report-001",
      schemaName: "EpigenomicsQCReport",
      schemaVersion: "0.1.0",
      datasetId: "ds-001",
      designValidation: { valid: true, errors: [] },
      coordinateValidation: { valid: true, errors: [] },
      missingnessProfile: {
        datasetId: "ds-001",
        policyVersion: "v1.0.0",
        overallFeatureMissingFraction: 0,
        perFeatureMissingness: [],
        perSampleMissingness: [],
        perGroupMissingness: [],
        featuresWithCompleteGroupDropout: [],
        summaryBand: "acceptable",
      },
      varianceProfile: {
        datasetId: "ds-001",
        policyVersion: "v1.0.0",
        perFeatureVariance: [],
        summaryBand: "acceptable",
      },
      confoundingSummary: {
        cellCompositionStatus: "unlikely_confounding",
        cytotoxicityStatus: "not_evaluated",
      },
      reviewFlags: [],
      acceptedCount: 10,
      excludedCount: 0,
      warningCount: 1,
      generatedAt: "2026-05-05T00:00:00Z",
    });
    expect(report.reportId).toBe("qc-report-001");
    expect(report.acceptedCount).toBe(10);
    expect(report.excludedCount).toBe(0);
  });

  it("rejects QC report with invalid missingness profile", () => {
    expect(() =>
      EpigenomicsQCReportSchema.parse({
        reportId: "qc-report-002",
        schemaName: "EpigenomicsQCReport",
        schemaVersion: "0.1.0",
        datasetId: "ds-001",
        designValidation: { valid: true, errors: [] },
        coordinateValidation: { valid: true, errors: [] },
        missingnessProfile: {
          datasetId: "ds-001",
          policyVersion: "v1.0.0",
          overallFeatureMissingFraction: -1,
          perFeatureMissingness: [],
          perSampleMissingness: [],
          perGroupMissingness: [],
          featuresWithCompleteGroupDropout: [],
          summaryBand: "acceptable",
        },
        varianceProfile: {
          datasetId: "ds-001",
          policyVersion: "v1.0.0",
          perFeatureVariance: [],
          summaryBand: "acceptable",
        },
        confoundingSummary: {},
        reviewFlags: [],
        acceptedCount: 0,
        excludedCount: 0,
        warningCount: 0,
        generatedAt: "2026-05-05T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("EpigenomicsFeatureResponsePacket contract (existing)", () => {
  it("accepts a valid packet with qualification summary", () => {
    const packet = EpigenomicsFeatureResponsePacketSchema.parse({
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
          values: { "sample-1": 0.82 },
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
          { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
        ],
        hasControls: true,
        minReplicatesPerGroup: 1,
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
    expect(packet.schemaVersion).toBe("0.1.0");
    expect(packet.qualificationSummary.acceptedCount).toBe(1);
  });
});

describe("BioactivityPoDHandoffPacket contract (existing)", () => {
  it("accepts a valid handoff with mandatory caveats", () => {
    const handoff = BioactivityPoDHandoffPacketSchema.parse({
      schemaVersion: "0.1.0",
      schemaName: "BioactivityPoDHandoffPacket",
      handoffId: "b2c3d4e5-f6a7-8901-bcde-f23456789012",
      sourcePacketRef: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      qualifiedFeatures: [
        {
          featureId: "cg00000001",
          status: "accepted_for_pod",
          warnings: [],
        },
      ],
      excludedFeatures: [],
      doseResponseReadySubset: ["cg00000001"],
      mandatoryCaveats: [
        {
          warningCode: "EPIW001",
          severity: "warning",
          message: "Caveat message",
          category: "missing_metadata",
          blocksDownstream: false,
        },
      ],
      generatedAt: "2026-05-05T00:00:00Z",
    });
    expect(handoff.handoffId).toBe("b2c3d4e5-f6a7-8901-bcde-f23456789012");
    expect(handoff.mandatoryCaveats).toHaveLength(1);
    expect(handoff.sourcePacketRef).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });
});
