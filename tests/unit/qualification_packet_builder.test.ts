import { describe, it, expect } from "vitest";
import {
  EpigenomicsFeatureQualificationSchema,
  DatasetQualificationSummarySchema,
} from "../../src/contracts/qualification.js";
import type { EpigenomicsFeatureResponsePacket } from "../../src/contracts/packets.js";
import { qualifyFeatures } from "../../src/qualification/engine.js";
import {
  buildQualificationPacket,
  mapToEpigenomicsFeatureQualification,
  buildDatasetQualificationSummary,
} from "../../src/qualification/packet_builder.js";
import { RULE_CODES } from "../../src/qualification/explainability.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeValidPacket(): EpigenomicsFeatureResponsePacket {
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
          "sample-low-1": 0.78,
          "sample-low-2": 0.80,
        },
      },
      {
        featureId: "cg00000002",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000002",
        signalMetric: "beta_value",
        values: {
          "sample-ctrl-1": null,
          "sample-ctrl-2": null,
          "sample-low-1": null,
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
    },
    provenance: {
      datasetId: "dataset-001",
      upstreamSteps: [
        { stepName: "norm", toolName: "minfi", toolVersion: "1.44.0", parameters: {} },
      ],
    },
    qualificationSummary: {
      acceptedCount: 1,
      excludedCount: 1,
      exploratoryCount: 0,
      caveatCount: 0,
    },
    qcReportRef: "qc-001",
    warnings: [],
    generatedAt: "2026-05-05T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// mapToEpigenomicsFeatureQualification
// ---------------------------------------------------------------------------

describe("mapToEpigenomicsFeatureQualification", () => {
  it("maps accepted_for_pod to accepted_for_pod", () => {
    const result = mapToEpigenomicsFeatureQualification(
      {
        featureId: "cg00000001",
        status: "accepted_for_pod",
        warnings: [],
        explainability: {
          ruleCode: RULE_CODES.ACCEPTED,
          reasonTemplate: "Feature cg00000001 satisfies all policy thresholds.",
          reviewRequired: false,
          policyReference: "none",
        },
      },
      "dataset-001",
    );

    expect(result.qualificationStatus).toBe("accepted_for_pod");
    expect(result.downstreamUseRule).toBe("allow");
    expect(result.humanReviewRequired).toBe(false);
    expect(result.warningRefs).toEqual([]);
    expect(result.qualificationReasons.length).toBeGreaterThan(0);

    const validated = EpigenomicsFeatureQualificationSchema.parse(result);
    expect(validated.featureId).toBe("cg00000001");
  });

  it("maps accepted_with_caveats to accepted_with_warnings", () => {
    const result = mapToEpigenomicsFeatureQualification(
      {
        featureId: "cg00000001",
        status: "accepted_with_caveats",
        warnings: [
          {
            warningCode: "EPIW001",
            severity: "warning",
            message: "Non-standard coordinate system",
            category: "coordinate_semantics",
            blocksDownstream: false,
          },
        ],
        explainability: {
          ruleCode: RULE_CODES.MAJOR_WARNINGS,
          reasonTemplate: "Feature cg00000001 carries 1 warning(s).",
          reviewRequired: false,
          policyReference: "warning_accumulation",
        },
      },
      "dataset-001",
    );

    expect(result.qualificationStatus).toBe("accepted_with_warnings");
    expect(result.downstreamUseRule).toBe("allow_with_warning");
    expect(result.warningRefs).toEqual(["EPIW001"]);
  });

  it("maps missing_build to excluded_missing_genome_build", () => {
    const result = mapToEpigenomicsFeatureQualification(
      {
        featureId: "cg00000001",
        status: "excluded_coordinate_ambiguity",
        warnings: [],
        explainability: {
          ruleCode: RULE_CODES.MISSING_BUILD,
          reasonTemplate: "Feature cg00000001 missing genome build.",
          reviewRequired: true,
          policyReference: "coordinate.requireGenomeBuild",
        },
      },
      "dataset-001",
    );

    expect(result.qualificationStatus).toBe("excluded_missing_genome_build");
    expect(result.downstreamUseRule).toBe("block");
    expect(result.humanReviewRequired).toBe(true);
  });

  it("maps high_missingness to excluded_high_missingness", () => {
    const result = mapToEpigenomicsFeatureQualification(
      {
        featureId: "cg00000001",
        status: "excluded_qc_failure",
        warnings: [],
        explainability: {
          ruleCode: RULE_CODES.HIGH_MISSINGNESS,
          reasonTemplate: "Feature cg00000001 has 75.0% missing values.",
          reviewRequired: true,
          policyReference: "missingness.exclusionThreshold",
          thresholdValue: "20.0%",
          observedValue: "75.0%",
        },
      },
      "dataset-001",
    );

    expect(result.qualificationStatus).toBe("excluded_high_missingness");
    expect(result.downstreamUseRule).toBe("block");
  });

  it("maps non_numeric_response to excluded_non_numeric_response", () => {
    const result = mapToEpigenomicsFeatureQualification(
      {
        featureId: "cg00000001",
        status: "excluded_qc_failure",
        warnings: [],
        explainability: {
          ruleCode: RULE_CODES.NON_NUMERIC_RESPONSE,
          reasonTemplate: "Feature cg00000001 contains non-finite response values.",
          reviewRequired: true,
          policyReference: "platform_numeric_validity",
        },
      },
      "dataset-001",
    );

    expect(result.qualificationStatus).toBe("excluded_non_numeric_response");
    expect(result.downstreamUseRule).toBe("block");
  });

  it("maps dominant_confounding to excluded_confounding_dominant", () => {
    const result = mapToEpigenomicsFeatureQualification(
      {
        featureId: "cg00000001",
        status: "exploratory_only",
        warnings: [],
        explainability: {
          ruleCode: RULE_CODES.DOMINANT_CONFOUNDING,
          reasonTemplate: "Feature cg00000001 is affected by confounding.",
          reviewRequired: true,
          policyReference: "confounding.cellCompositionBlockLevel",
        },
      },
      "dataset-001",
    );

    expect(result.qualificationStatus).toBe("excluded_confounding_dominant");
    expect(result.downstreamUseRule).toBe("block");
  });

  it("maps n=1 replicates review to review_required", () => {
    const result = mapToEpigenomicsFeatureQualification(
      {
        featureId: "cg00000001",
        status: "exploratory_only",
        warnings: [],
        explainability: {
          ruleCode: RULE_CODES.INSUFFICIENT_REPLICATES,
          reasonTemplate: "Feature cg00000001 has n=1 biological replicate.",
          reviewRequired: true,
          policyReference: "replicate.minBiologicalReplicatesPerGroup",
        },
      },
      "dataset-001",
    );

    expect(result.qualificationStatus).toBe("review_required");
    expect(result.downstreamUseRule).toBe("review_required");
  });

  it("produces deterministic immutable IDs for identical inputs", () => {
    const baseQualification = {
      featureId: "cg00000001",
      status: "accepted_for_pod" as const,
      warnings: [],
      explainability: {
        ruleCode: RULE_CODES.ACCEPTED,
        reasonTemplate: "OK",
        reviewRequired: false,
        policyReference: "none",
      },
    };

    const id1 = mapToEpigenomicsFeatureQualification(baseQualification, "dataset-001");
    const id2 = mapToEpigenomicsFeatureQualification(baseQualification, "dataset-001");

    // The featureId should be identical; the internal qualification object
    // should be structurally identical (IDs derived deterministically).
    expect(id1.featureId).toBe(id2.featureId);
    expect(id1.qualificationStatus).toBe(id2.qualificationStatus);
    expect(id1.qualificationReasons).toEqual(id2.qualificationReasons);
  });

  it("produces different IDs for different inputs", () => {
    const q1 = mapToEpigenomicsFeatureQualification(
      {
        featureId: "cg00000001",
        status: "accepted_for_pod",
        warnings: [],
        explainability: {
          ruleCode: RULE_CODES.ACCEPTED,
          reasonTemplate: "OK",
          reviewRequired: false,
          policyReference: "none",
        },
      },
      "dataset-001",
    );

    const q2 = mapToEpigenomicsFeatureQualification(
      {
        featureId: "cg00000002",
        status: "accepted_for_pod",
        warnings: [],
        explainability: {
          ruleCode: RULE_CODES.ACCEPTED,
          reasonTemplate: "OK",
          reviewRequired: false,
          policyReference: "none",
        },
      },
      "dataset-001",
    );

    // Different feature IDs should produce different qualification objects
    expect(q1.featureId).not.toBe(q2.featureId);
  });
});

// ---------------------------------------------------------------------------
// buildDatasetQualificationSummary
// ---------------------------------------------------------------------------

describe("buildDatasetQualificationSummary", () => {
  it("accepts all features and computes correct counts", () => {
    const features: Parameters<typeof buildDatasetQualificationSummary>[1] = [
      {
        schemaName: "EpigenomicsFeatureQualification",
        schemaVersion: "0.1.0",
        featureId: "cg00000001",
        qualificationStatus: "accepted_for_pod",
        qualificationReasons: ["OK"],
        warningRefs: [],
        humanReviewRequired: false,
        downstreamUseRule: "allow",
      },
      {
        schemaName: "EpigenomicsFeatureQualification",
        schemaVersion: "0.1.0",
        featureId: "cg00000002",
        qualificationStatus: "accepted_with_warnings",
        qualificationReasons: ["Warning"],
        warningRefs: ["W001"],
        humanReviewRequired: false,
        downstreamUseRule: "allow_with_warning",
      },
      {
        schemaName: "EpigenomicsFeatureQualification",
        schemaVersion: "0.1.0",
        featureId: "cg00000003",
        qualificationStatus: "excluded_high_missingness",
        qualificationReasons: ["Missing"],
        warningRefs: [],
        humanReviewRequired: true,
        downstreamUseRule: "block",
      },
    ];

    const summary = buildDatasetQualificationSummary("dataset-001", features, [], {
      generatedAt: "2026-05-05T00:00:00Z",
    });

    expect(summary.totalFeatures).toBe(3);
    expect(summary.acceptedForPodCount).toBe(1);
    expect(summary.acceptedWithWarningsCount).toBe(1);
    expect(summary.excludedCount).toBe(1);
    expect(summary.excludedByReason["excluded_high_missingness"]).toBe(1);
    expect(summary.humanReviewRequired).toBe(true);
    expect(summary.overallDownstreamUseRule).toBe("block");

    const validated = DatasetQualificationSummarySchema.parse(summary);
    expect(validated.datasetId).toBe("dataset-001");
  });

  it("uses allow when all features are accepted without warnings", () => {
    const features: Parameters<typeof buildDatasetQualificationSummary>[1] = [
      {
        schemaName: "EpigenomicsFeatureQualification",
        schemaVersion: "0.1.0",
        featureId: "cg00000001",
        qualificationStatus: "accepted_for_pod",
        qualificationReasons: ["OK"],
        warningRefs: [],
        humanReviewRequired: false,
        downstreamUseRule: "allow",
      },
    ];

    const summary = buildDatasetQualificationSummary("dataset-001", features, []);
    expect(summary.overallDownstreamUseRule).toBe("allow");
    expect(summary.humanReviewRequired).toBe(false);
  });

  it("upgrades overall rule to block when global warnings block downstream", () => {
    const features: Parameters<typeof buildDatasetQualificationSummary>[1] = [
      {
        schemaName: "EpigenomicsFeatureQualification",
        schemaVersion: "0.1.0",
        featureId: "cg00000001",
        qualificationStatus: "accepted_for_pod",
        qualificationReasons: ["OK"],
        warningRefs: [],
        humanReviewRequired: false,
        downstreamUseRule: "allow",
      },
    ];

    const globalWarnings = [
      {
        warningCode: "EPI001",
        severity: "error" as const,
        message: "Packet schema issue",
        category: "missing_metadata" as const,
        blocksDownstream: true,
      },
    ];

    const summary = buildDatasetQualificationSummary("dataset-001", features, globalWarnings);
    expect(summary.overallDownstreamUseRule).toBe("block");
  });

  it("allows overriding summaryId", () => {
    const features: Parameters<typeof buildDatasetQualificationSummary>[1] = [
      {
        schemaName: "EpigenomicsFeatureQualification",
        schemaVersion: "0.1.0",
        featureId: "cg00000001",
        qualificationStatus: "accepted_for_pod",
        qualificationReasons: ["OK"],
        warningRefs: [],
        humanReviewRequired: false,
        downstreamUseRule: "allow",
      },
    ];

    const summary = buildDatasetQualificationSummary("dataset-001", features, [], {
      summaryId: "12345678-1234-1234-1234-123456789abc",
    });
    expect(summary.summaryId).toBe("12345678-1234-1234-1234-123456789abc");
  });

  it("produces deterministic summary IDs for identical inputs", () => {
    const features: Parameters<typeof buildDatasetQualificationSummary>[1] = [
      {
        schemaName: "EpigenomicsFeatureQualification",
        schemaVersion: "0.1.0",
        featureId: "cg00000001",
        qualificationStatus: "accepted_for_pod",
        qualificationReasons: ["OK"],
        warningRefs: [],
        humanReviewRequired: false,
        downstreamUseRule: "allow",
      },
    ];

    const summary1 = buildDatasetQualificationSummary("dataset-001", features, [], {
      generatedAt: "2026-05-05T00:00:00Z",
    });
    const summary2 = buildDatasetQualificationSummary("dataset-001", features, [], {
      generatedAt: "2026-05-05T00:00:00Z",
    });

    expect(summary1.summaryId).toBe(summary2.summaryId);
  });
});

// ---------------------------------------------------------------------------
// buildQualificationPacket (integration)
// ---------------------------------------------------------------------------

describe("buildQualificationPacket", () => {
  it("builds a complete qualification packet from a valid response packet", () => {
    const packet = makeValidPacket();
    const qualification = qualifyFeatures(packet);

    const result = buildQualificationPacket(packet, qualification);

    expect(result.qualifiedFeatures).toHaveLength(2);
    expect(result.datasetSummary.totalFeatures).toBe(2);
    expect(result.datasetSummary.datasetId).toBe("dataset-001");

    // First feature: complete data but below preferred dose groups → accepted_with_warnings
    const q1 = result.qualifiedFeatures[0];
    expect(q1.feature.featureId).toBe("cg00000001");
    expect(q1.qualification.qualificationStatus).toBe("accepted_with_warnings");
    expect(q1.qualification.downstreamUseRule).toBe("allow_with_warning");

    // Second feature should be excluded (high missingness)
    const q2 = result.qualifiedFeatures[1];
    expect(q2.feature.featureId).toBe("cg00000002");
    expect(q2.qualification.qualificationStatus).toBe("excluded_high_missingness");
    expect(q2.qualification.downstreamUseRule).toBe("block");

    // Schema validation
    for (const qf of result.qualifiedFeatures) {
      EpigenomicsFeatureQualificationSchema.parse(qf.qualification);
    }
    DatasetQualificationSummarySchema.parse(result.datasetSummary);
  });

  it("attaches epigenomics qualifications to canonical features", () => {
    const packet = makeValidPacket();
    const qualification = qualifyFeatures(packet);
    const result = buildQualificationPacket(packet, qualification);

    for (const qf of result.qualifiedFeatures) {
      expect(qf.feature).toBeDefined();
      expect(qf.qualification).toBeDefined();
      expect(qf.qualification.featureId).toBe(qf.feature.featureId);
    }
  });

  it("uses custom datasetId when provided", () => {
    const packet = makeValidPacket();
    const qualification = qualifyFeatures(packet);
    const result = buildQualificationPacket(packet, qualification, {
      datasetId: "custom-dataset",
    });

    expect(result.datasetSummary.datasetId).toBe("custom-dataset");
  });

  it("uses custom summaryId when provided", () => {
    const packet = makeValidPacket();
    const qualification = qualifyFeatures(packet);
    const result = buildQualificationPacket(packet, qualification, {
      summaryId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });

    expect(result.datasetSummary.summaryId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("uses custom generatedAt when provided", () => {
    const packet = makeValidPacket();
    const qualification = qualifyFeatures(packet);
    const result = buildQualificationPacket(packet, qualification, {
      generatedAt: "2025-01-01T00:00:00Z",
    });

    expect(result.datasetSummary.generatedAt).toBe("2025-01-01T00:00:00Z");
  });

  it("propagates global warnings from qualification result", () => {
    const packet = makeValidPacket();
    const qualification = qualifyFeatures(packet);
    const result = buildQualificationPacket(packet, qualification);

    // Global warnings from the engine should be present
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("handles an empty feature list gracefully", () => {
    const packet = makeValidPacket();
    packet.features = [];
    // Rebuild qualification summary to match empty features
    packet.qualificationSummary = {
      acceptedCount: 0,
      excludedCount: 0,
      exploratoryCount: 0,
      caveatCount: 0,
    };

    const qualification = qualifyFeatures(packet);
    const result = buildQualificationPacket(packet, qualification);

    expect(result.qualifiedFeatures).toHaveLength(0);
    expect(result.datasetSummary.totalFeatures).toBe(0);
    expect(result.datasetSummary.acceptedForPodCount).toBe(0);
    expect(result.datasetSummary.excludedCount).toBe(0);
  });

  it("is deterministic: identical inputs produce identical outputs", () => {
    const packet = makeValidPacket();
    const qualification = qualifyFeatures(packet);

    const result1 = buildQualificationPacket(packet, qualification, {
      generatedAt: "2026-05-05T00:00:00Z",
    });
    const result2 = buildQualificationPacket(packet, qualification, {
      generatedAt: "2026-05-05T00:00:00Z",
    });

    expect(result1.qualifiedFeatures.length).toBe(result2.qualifiedFeatures.length);
    for (let i = 0; i < result1.qualifiedFeatures.length; i++) {
      expect(result1.qualifiedFeatures[i].qualification.qualificationStatus).toBe(
        result2.qualifiedFeatures[i].qualification.qualificationStatus,
      );
      expect(result1.qualifiedFeatures[i].qualification.qualificationReasons).toEqual(
        result2.qualifiedFeatures[i].qualification.qualificationReasons,
      );
    }
    expect(result1.datasetSummary.summaryId).toBe(result2.datasetSummary.summaryId);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("buildQualificationPacket edge cases", () => {
  it("creates fallback exclusion when qualification is missing for a feature", () => {
    const packet = makeValidPacket();
    packet.features = [
      {
        featureId: "cg00000099",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000099",
        signalMetric: "beta_value",
        values: { "sample-1": 0.5 },
      },
    ];

    // Simulate a qualification result with no per-feature qualifications
    const qualification = {
      qualifiedCount: 0,
      excludedCount: 0,
      warnings: [],
    };

    const result = buildQualificationPacket(packet, qualification);

    expect(result.qualifiedFeatures).toHaveLength(1);
    expect(result.qualifiedFeatures[0].qualification.qualificationStatus).toBe(
      "excluded_insufficient_design",
    );
    expect(result.qualifiedFeatures[0].qualification.downstreamUseRule).toBe("block");
    expect(result.qualifiedFeatures[0].qualification.humanReviewRequired).toBe(true);
  });

  it("rejects invalid epigenomics qualification status in strict schema", () => {
    expect(() =>
      EpigenomicsFeatureQualificationSchema.parse({
        schemaName: "EpigenomicsFeatureQualification",
        schemaVersion: "0.1.0",
        featureId: "feat-1",
        qualificationStatus: "invalid_status",
        qualificationReasons: ["Bad"],
      }),
    ).toThrow();
  });

  it("rejects dataset summary with negative counts", () => {
    expect(() =>
      DatasetQualificationSummarySchema.parse({
        schemaName: "DatasetQualificationSummary",
        schemaVersion: "0.1.0",
        summaryId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        datasetId: "ds-001",
        totalFeatures: -1,
        acceptedForPodCount: 0,
        acceptedWithWarningsCount: 0,
        reviewRequiredCount: 0,
        exploratoryOnlyCount: 0,
        excludedCount: 0,
        excludedByReason: {},
        overallDownstreamUseRule: "allow",
        humanReviewRequired: false,
        generatedAt: "2026-05-05T00:00:00Z",
      }),
    ).toThrow();
  });
});
