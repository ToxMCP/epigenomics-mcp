import { describe, it, expect } from "vitest";
import {
  RULE_CODES,
  buildExplainability,
  summariseExplainability,
} from "../../src/qualification/explainability.js";
import { createDefaultPolicy } from "../../src/qualification/policy.js";
import type { QualificationExplainability } from "../../src/contracts/qualification.js";

describe("RULE_CODES", () => {
  it("contains exactly the expected rule codes", () => {
    expect(RULE_CODES.MISSING_BUILD).toBe("RULE_001_MISSING_BUILD");
    expect(RULE_CODES.INVALID_COORDINATES).toBe("RULE_002_INVALID_COORDINATES");
    expect(RULE_CODES.INSUFFICIENT_DESIGN).toBe("RULE_003_INSUFFICIENT_DESIGN");
    expect(RULE_CODES.INSUFFICIENT_REPLICATES).toBe(
      "RULE_004_INSUFFICIENT_REPLICATES",
    );
    expect(RULE_CODES.HIGH_MISSINGNESS).toBe("RULE_005_HIGH_MISSINGNESS");
    expect(RULE_CODES.NON_NUMERIC_RESPONSE).toBe(
      "RULE_006_NON_NUMERIC_RESPONSE",
    );
    expect(RULE_CODES.DOMINANT_CONFOUNDING).toBe(
      "RULE_007_DOMINANT_CONFOUNDING",
    );
    expect(RULE_CODES.MAPPING_AMBIGUITY).toBe("RULE_008_MAPPING_AMBIGUITY");
    expect(RULE_CODES.MAJOR_WARNINGS).toBe("RULE_009_MAJOR_WARNINGS");
    expect(RULE_CODES.ACCEPTED).toBe("RULE_010_ACCEPTED");
  });
});

describe("buildExplainability", () => {
  const policy = createDefaultPolicy();

  it("builds explainability for MISSING_BUILD", () => {
    const ex = buildExplainability(
      RULE_CODES.MISSING_BUILD,
      "feat-001",
      policy,
      {},
    );
    expect(ex.ruleCode).toBe("RULE_001_MISSING_BUILD");
    expect(ex.reasonTemplate).toContain("feat-001");
    expect(ex.reasonTemplate).toContain("genome build is missing");
    expect(ex.remediationHint).toContain("Add the genome build");
    expect(ex.reviewRequired).toBe(true);
    expect(ex.policyReference).toBe("coordinate.requireGenomeBuild");
  });

  it("builds explainability for INVALID_COORDINATES", () => {
    const ex = buildExplainability(
      RULE_CODES.INVALID_COORDINATES,
      "feat-002",
      policy,
      { build: "unknown_build" },
    );
    expect(ex.ruleCode).toBe("RULE_002_INVALID_COORDINATES");
    expect(ex.reasonTemplate).toContain("unknown_build");
    expect(ex.reasonTemplate).toContain("not in the policy allowlist");
    expect(ex.remediationHint).toContain("Confirm the genome build");
    expect(ex.reviewRequired).toBe(true);
    expect(ex.policyReference).toBe("coordinate.allowedGenomeBuilds");
  });

  it("builds explainability for INSUFFICIENT_DESIGN", () => {
    const ex = buildExplainability(
      RULE_CODES.INSUFFICIENT_DESIGN,
      "feat-003",
      policy,
      { totalDoseGroups: 1, nonZeroDoseGroups: 0 },
    );
    expect(ex.ruleCode).toBe("RULE_003_INSUFFICIENT_DESIGN");
    expect(ex.reasonTemplate).toContain("1 dose groups");
    expect(ex.reasonTemplate).toContain("0 non-zero");
    expect(ex.reasonTemplate).toContain("minimum of 2 total / 2 non-zero");
    expect(ex.remediationHint).toContain("Add additional dose groups");
    expect(ex.reviewRequired).toBe(true);
    expect(ex.policyReference).toBe(
      "doseGroup.minTotalDoseGroups / doseGroup.minNonZeroDoseGroups",
    );
    expect(ex.thresholdValue).toBe("2 total / 2 non-zero");
    expect(ex.observedValue).toBe("1 total / 0 non-zero");
  });

  it("builds explainability for INSUFFICIENT_REPLICATES", () => {
    const ex = buildExplainability(
      RULE_CODES.INSUFFICIENT_REPLICATES,
      "feat-004",
      policy,
      { minBiologicalReplicates: 1 },
    );
    expect(ex.ruleCode).toBe("RULE_004_INSUFFICIENT_REPLICATES");
    expect(ex.reasonTemplate).toContain("1 biological replicate(s)");
    expect(ex.reasonTemplate).toContain("below the policy minimum of 2");
    expect(ex.remediationHint).toContain("Increase biological replication");
    expect(ex.reviewRequired).toBe(true);
    expect(ex.thresholdValue).toBe("2");
    expect(ex.observedValue).toBe("1");
  });

  it("builds explainability for HIGH_MISSINGNESS", () => {
    const ex = buildExplainability(
      RULE_CODES.HIGH_MISSINGNESS,
      "feat-005",
      policy,
      { missingFraction: 0.35 },
    );
    expect(ex.ruleCode).toBe("RULE_005_HIGH_MISSINGNESS");
    expect(ex.reasonTemplate).toContain("35.0% missing values");
    expect(ex.reasonTemplate).toContain("exclusion threshold of 20.0%");
    expect(ex.remediationHint).toContain("Investigate sample-level missingness");
    expect(ex.reviewRequired).toBe(true);
    expect(ex.thresholdValue).toBe("20.0%");
    expect(ex.observedValue).toBe("35.0%");
  });

  it("builds explainability for NON_NUMERIC_RESPONSE", () => {
    const ex = buildExplainability(
      RULE_CODES.NON_NUMERIC_RESPONSE,
      "feat-006",
      policy,
      {},
    );
    expect(ex.ruleCode).toBe("RULE_006_NON_NUMERIC_RESPONSE");
    expect(ex.reasonTemplate).toContain("non-finite");
    expect(ex.remediationHint).toContain("Check upstream normalisation");
    expect(ex.reviewRequired).toBe(true);
  });

  it("builds explainability for DOMINANT_CONFOUNDING", () => {
    const ex = buildExplainability(
      RULE_CODES.DOMINANT_CONFOUNDING,
      "feat-007",
      policy,
      {
        confoundingLevel: "dominant_confounding",
        confoundingType: "cytotoxicity",
        blockLevel: "dominant_confounding",
      },
    );
    expect(ex.ruleCode).toBe("RULE_007_DOMINANT_CONFOUNDING");
    expect(ex.reasonTemplate).toContain("dominant_confounding");
    expect(ex.reasonTemplate).toContain("downgraded to exploratory-only");
    expect(ex.remediationHint).toContain("confounding-context metadata");
    expect(ex.reviewRequired).toBe(true);
    expect(ex.thresholdValue).toBe("dominant_confounding");
    expect(ex.observedValue).toBe("dominant_confounding");
  });

  it("builds explainability for MAPPING_AMBIGUITY", () => {
    const ex = buildExplainability(
      RULE_CODES.MAPPING_AMBIGUITY,
      "feat-008",
      policy,
      {},
    );
    expect(ex.ruleCode).toBe("RULE_008_MAPPING_AMBIGUITY");
    expect(ex.reasonTemplate).toContain("mapping ambiguity");
    expect(ex.remediationHint).toContain("Review the mapping pipeline");
    expect(ex.reviewRequired).toBe(true);
  });

  it("builds explainability for MAJOR_WARNINGS", () => {
    const ex = buildExplainability(
      RULE_CODES.MAJOR_WARNINGS,
      "feat-009",
      policy,
      { warningCount: 3 },
    );
    expect(ex.ruleCode).toBe("RULE_009_MAJOR_WARNINGS");
    expect(ex.reasonTemplate).toContain("3 warning(s)");
    expect(ex.reasonTemplate).toContain("accepted with caveats");
    expect(ex.remediationHint).toContain("Review the attached warnings");
    expect(ex.reviewRequired).toBe(false);
    expect(ex.observedValue).toBe("3");
  });

  it("builds explainability for ACCEPTED", () => {
    const ex = buildExplainability(
      RULE_CODES.ACCEPTED,
      "feat-010",
      policy,
      {},
    );
    expect(ex.ruleCode).toBe("RULE_010_ACCEPTED");
    expect(ex.reasonTemplate).toContain("satisfies all policy thresholds");
    expect(ex.reviewRequired).toBe(false);
    expect(ex.policyReference).toBe("none");
    expect(ex.remediationHint).toBeUndefined();
  });

  it("does not include thresholdValue or observedValue when absent", () => {
    const ex = buildExplainability(
      RULE_CODES.ACCEPTED,
      "feat-011",
      policy,
      {},
    );
    expect(ex.thresholdValue).toBeUndefined();
    expect(ex.observedValue).toBeUndefined();
  });

  it("reason templates do not make regulatory conclusions", () => {
    const codes = Object.values(RULE_CODES) as string[];
    for (const code of codes) {
      const ex = buildExplainability(code as RuleCode, "feat-x", policy, {});
      expect(ex.reasonTemplate).not.toMatch(/unsafe/i);
      expect(ex.reasonTemplate).not.toMatch(/toxic/i);
      expect(ex.reasonTemplate).not.toMatch(/risk/i);
    }
  });
});

describe("summariseExplainability", () => {
  it("returns empty summary for empty input", () => {
    const summary = summariseExplainability([]);
    expect(summary.uniqueRuleCodes).toEqual([]);
    expect(summary.ruleCodeCounts).toEqual({});
    expect(summary.reviewRequiredCount).toBe(0);
    expect(summary.featuresWithRemediation).toBe(0);
  });

  it("counts rule codes and review flags correctly", () => {
    const items: QualificationExplainability[] = [
      {
        ruleCode: "RULE_010_ACCEPTED",
        reasonTemplate: "Accepted",
        reviewRequired: false,
        policyReference: "none",
      },
      {
        ruleCode: "RULE_009_MAJOR_WARNINGS",
        reasonTemplate: "Caveats",
        reviewRequired: false,
        policyReference: "warning_accumulation",
        remediationHint: "Review warnings",
      },
      {
        ruleCode: "RULE_001_MISSING_BUILD",
        reasonTemplate: "Blocked",
        reviewRequired: true,
        policyReference: "coordinate.requireGenomeBuild",
        remediationHint: "Add build",
      },
    ];
    const summary = summariseExplainability(items);
    expect(summary.uniqueRuleCodes).toEqual([
      "RULE_001_MISSING_BUILD",
      "RULE_009_MAJOR_WARNINGS",
      "RULE_010_ACCEPTED",
    ]);
    expect(summary.ruleCodeCounts).toEqual({
      "RULE_010_ACCEPTED": 1,
      "RULE_009_MAJOR_WARNINGS": 1,
      "RULE_001_MISSING_BUILD": 1,
    });
    expect(summary.reviewRequiredCount).toBe(1);
    expect(summary.featuresWithRemediation).toBe(2);
  });

  it("aggregates multiple occurrences of the same rule code", () => {
    const items: QualificationExplainability[] = [
      {
        ruleCode: "RULE_010_ACCEPTED",
        reasonTemplate: "A",
        reviewRequired: false,
        policyReference: "none",
      },
      {
        ruleCode: "RULE_010_ACCEPTED",
        reasonTemplate: "B",
        reviewRequired: false,
        policyReference: "none",
      },
      {
        ruleCode: "RULE_010_ACCEPTED",
        reasonTemplate: "C",
        reviewRequired: false,
        policyReference: "none",
      },
    ];
    const summary = summariseExplainability(items);
    expect(summary.ruleCodeCounts["RULE_010_ACCEPTED"]).toBe(3);
    expect(summary.uniqueRuleCodes).toEqual(["RULE_010_ACCEPTED"]);
  });
});

describe("explainability integration with qualification engine", () => {
  it("includes explainability in accepted_for_pod features", async () => {
    const { qualifyFeatures } = await import(
      "../../src/qualification/engine.js"
    );
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
            "sample-ctrl-3": 0.84,
            "sample-low-1": 0.78,
            "sample-low-2": 0.8,
            "sample-low-3": 0.79,
            "sample-mid-1": 0.75,
            "sample-mid-2": 0.77,
            "sample-mid-3": 0.76,
            "sample-high-1": 0.72,
            "sample-high-2": 0.74,
            "sample-high-3": 0.73,
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
          {
            sampleId: "sample-ctrl-1",
            doseGroupId: "ctrl",
            species: "Homo sapiens",
            controlFlag: true,
          },
          {
            sampleId: "sample-ctrl-2",
            doseGroupId: "ctrl",
            species: "Homo sapiens",
            controlFlag: true,
          },
          {
            sampleId: "sample-ctrl-3",
            doseGroupId: "ctrl",
            species: "Homo sapiens",
            controlFlag: true,
          },
          {
            sampleId: "sample-low-1",
            doseGroupId: "low",
            species: "Homo sapiens",
          },
          {
            sampleId: "sample-low-2",
            doseGroupId: "low",
            species: "Homo sapiens",
          },
          {
            sampleId: "sample-low-3",
            doseGroupId: "low",
            species: "Homo sapiens",
          },
          {
            sampleId: "sample-mid-1",
            doseGroupId: "mid",
            species: "Homo sapiens",
          },
          {
            sampleId: "sample-mid-2",
            doseGroupId: "mid",
            species: "Homo sapiens",
          },
          {
            sampleId: "sample-mid-3",
            doseGroupId: "mid",
            species: "Homo sapiens",
          },
          {
            sampleId: "sample-high-1",
            doseGroupId: "high",
            species: "Homo sapiens",
          },
          {
            sampleId: "sample-high-2",
            doseGroupId: "high",
            species: "Homo sapiens",
          },
          {
            sampleId: "sample-high-3",
            doseGroupId: "high",
            species: "Homo sapiens",
          },
        ],
        hasControls: true,
        minReplicatesPerGroup: 3,
      },
      provenance: {
        datasetId: "dataset-001",
        upstreamSteps: [
          {
            stepName: "norm",
            toolName: "minfi",
            toolVersion: "1.44.0",
            parameters: {},
          },
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

    expect(result.qualifications).toHaveLength(1);
    const q = result.qualifications![0];
    expect(q.explainability).toBeDefined();
    expect(q.explainability!.ruleCode).toBe("RULE_010_ACCEPTED");
    expect(q.explainability!.reviewRequired).toBe(false);
  });

  it("includes explainability in excluded features", async () => {
    const { qualifyFeatures } = await import(
      "../../src/qualification/engine.js"
    );
    const result = qualifyFeatures({
      schemaVersion: "0.1.0",
      schemaName: "EpigenomicsFeatureResponsePacket",
      packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      datasetMetadataRef: "dataset-001",
      designRef: "design-001",
      features: [
        {
          featureId: "cg_missing",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg_missing",
          signalMetric: "beta_value",
          values: {
            "sample-ctrl-1": null,
            "sample-ctrl-2": null,
            "sample-low-1": null,
            "sample-low-2": null,
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
          {
            sampleId: "sample-ctrl-1",
            doseGroupId: "ctrl",
            species: "Homo sapiens",
            controlFlag: true,
          },
          {
            sampleId: "sample-ctrl-2",
            doseGroupId: "ctrl",
            species: "Homo sapiens",
            controlFlag: true,
          },
          {
            sampleId: "sample-low-1",
            doseGroupId: "low",
            species: "Homo sapiens",
          },
          {
            sampleId: "sample-low-2",
            doseGroupId: "low",
            species: "Homo sapiens",
          },
        ],
        hasControls: true,
        minReplicatesPerGroup: 2,
      },
      provenance: {
        datasetId: "dataset-001",
        upstreamSteps: [
          {
            stepName: "norm",
            toolName: "minfi",
            toolVersion: "1.44.0",
            parameters: {},
          },
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
    const q = result.qualifications![0];
    expect(q.status).toBe("excluded_qc_failure");
    expect(q.explainability).toBeDefined();
    expect(q.explainability!.ruleCode).toBe("RULE_005_HIGH_MISSINGNESS");
    expect(q.explainability!.reviewRequired).toBe(true);
    expect(q.explainability!.remediationHint).toBeDefined();
  });

  it("includes explainabilitySummary at the result level", async () => {
    const { qualifyFeatures } = await import(
      "../../src/qualification/engine.js"
    );
    const result = qualifyFeatures({
      schemaVersion: "0.1.0",
      schemaName: "EpigenomicsFeatureResponsePacket",
      packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      datasetMetadataRef: "dataset-001",
      designRef: "design-001",
      features: [
        {
          featureId: "cg_a",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg_a",
          signalMetric: "beta_value",
          values: { "s-1": 0.5, "s-2": 0.6 },
        },
        {
          featureId: "cg_b",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg_b",
          signalMetric: "beta_value",
          values: { "s-1": null, "s-2": null },
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
          {
            sampleId: "s-1",
            doseGroupId: "ctrl",
            species: "Homo sapiens",
            controlFlag: true,
          },
          {
            sampleId: "s-2",
            doseGroupId: "low",
            species: "Homo sapiens",
          },
        ],
        hasControls: true,
        minReplicatesPerGroup: 1,
      },
      provenance: {
        datasetId: "dataset-001",
        upstreamSteps: [
          {
            stepName: "norm",
            toolName: "minfi",
            toolVersion: "1.44.0",
            parameters: {},
          },
        ],
      },
      qualificationSummary: {
        acceptedCount: 0,
        excludedCount: 0,
        exploratoryCount: 0,
        caveatCount: 0,
      },
      qcReportRef: "qc-001",
      warnings: [],
      generatedAt: "2026-05-05T00:00:00Z",
    });

    expect(result.explainabilitySummary).toBeDefined();
    expect(result.explainabilitySummary!.uniqueRuleCodes.length).toBeGreaterThan(
      0,
    );
    expect(
      Object.keys(result.explainabilitySummary!.ruleCodeCounts).length,
    ).toBeGreaterThan(0);
  });
});

describe("explainability determinism", () => {
  it("produces identical explainability for identical inputs", () => {
    const policy = createDefaultPolicy();
    const ex1 = buildExplainability(
      RULE_CODES.INSUFFICIENT_DESIGN,
      "f1",
      policy,
      { totalDoseGroups: 1, nonZeroDoseGroups: 0 },
    );
    const ex2 = buildExplainability(
      RULE_CODES.INSUFFICIENT_DESIGN,
      "f1",
      policy,
      { totalDoseGroups: 1, nonZeroDoseGroups: 0 },
    );
    expect(ex1).toEqual(ex2);
  });
});
