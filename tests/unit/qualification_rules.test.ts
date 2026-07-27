import { describe, it, expect } from "vitest";
import { qualifyFeature } from "../../src/qualification/rules.js";
import { createDefaultPolicy } from "../../src/qualification/policy.js";
import type { EpigenomicFeature } from "../../src/contracts/features.js";
import type { ExperimentalDesign } from "../../src/contracts/design.js";
import type { GenomeBuildValidationResult } from "../../src/validators/genome_build.js";
import type { MissingnessProfile } from "../../src/qc/missingness.js";
import type { ConfoundingAssessment } from "../../src/qualification/rules.js";

// ── Minimal fixtures ──

const validBuildValidation: GenomeBuildValidationResult = {
  valid: true,
  errors: [],
  warnings: [],
  mixedBuildDetected: false,
  buildsFound: ["GRCh38"],
  liftoverDetected: false,
};

const invalidBuildValidation: GenomeBuildValidationResult = {
  valid: false,
  errors: ['EPI004: Feature f1 declares unsupported genome build "unknown_build"'],
  warnings: [],
  mixedBuildDetected: false,
  buildsFound: ["unknown_build"],
  liftoverDetected: false,
};

const mixedBuildValidation: GenomeBuildValidationResult = {
  valid: false,
  errors: ['EPI004: Mixed genome builds detected in dataset (GRCh37, GRCh38)'],
  warnings: [],
  mixedBuildDetected: true,
  buildsFound: ["GRCh37", "GRCh38"],
  liftoverDetected: false,
};

function makeDesign(overrides?: Partial<ExperimentalDesign>): ExperimentalDesign {
  return {
    designId: "d-001",
    species: "Homo sapiens",
    doseGroups: [
      { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
    ],
    samples: [
      { sampleId: "s-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      { sampleId: "s-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      { sampleId: "s-low-1", doseGroupId: "low", species: "Homo sapiens" },
      { sampleId: "s-low-2", doseGroupId: "low", species: "Homo sapiens" },
      { sampleId: "s-high-1", doseGroupId: "high", species: "Homo sapiens" },
      { sampleId: "s-high-2", doseGroupId: "high", species: "Homo sapiens" },
    ],
    hasControls: true,
    minReplicatesPerGroup: 2,
    ...overrides,
  };
}

function makeFeature(overrides?: Partial<EpigenomicFeature>): EpigenomicFeature {
  return {
    featureId: "cg00000001",
    featureClass: "cpg_methylation",
    modality: "dna_methylation_array",
    measuredIdentifier: "cg00000001",
    signalMetric: "beta_value",
    values: {
      "s-ctrl-1": 0.82,
      "s-ctrl-2": 0.85,
      "s-low-1": 0.78,
      "s-low-2": 0.80,
      "s-high-1": 0.75,
      "s-high-2": 0.77,
    },
    ...overrides,
  } as EpigenomicFeature;
}

function makeContext(overrides?: Parameters<typeof qualifyFeature>[1] extends infer T ? Partial<T> : never) {
  const basePolicy = createDefaultPolicy();
  // Relaxed policy for baseline fixtures to avoid spurious preferred-threshold warnings
  const policy = {
    ...basePolicy,
    doseGroup: {
      ...basePolicy.doseGroup,
      preferredTotalDoseGroups: 3,
    },
    replicate: {
      ...basePolicy.replicate,
      preferredBiologicalReplicatesPerGroup: 2,
    },
  };
  return {
    design: makeDesign(),
    policy,
    buildValidation: validBuildValidation,
    ...overrides,
  } as Parameters<typeof qualifyFeature>[1];
}

// ── Tests ──

describe("qualifyFeature", () => {
  it("accepts a clean feature with accepted_for_pod", () => {
    const result = qualifyFeature(makeFeature(), makeContext());
    expect(result.qualification.status).toBe("accepted_for_pod");
    expect(result.blocked).toBe(false);
    expect(result.ruleTriggered).toBe("RULE_010_ACCEPTED");
  });

  it("excludes feature with missing build (RULE_001)", () => {
    const feature = makeFeature({
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: undefined as unknown as "GRCh38",
        coordinateSystem: "0-based-half-open",
      },
    });
    const result = qualifyFeature(feature, makeContext());
    expect(result.qualification.status).toBe("excluded_coordinate_ambiguity");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_001_MISSING_BUILD");
    expect(result.qualification.warnings[0].warningCode).toBe("EPI004_BUILD_MISSING");
  });

  it("excludes feature with invalid coordinates (RULE_002)", () => {
    const feature = makeFeature({
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: "unknown_build",
        coordinateSystem: "0-based-half-open",
      },
    });
    const result = qualifyFeature(
      feature,
      makeContext({ buildValidation: invalidBuildValidation }),
    );
    expect(result.qualification.status).toBe("excluded_coordinate_ambiguity");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_002_INVALID_COORDINATES");
    expect(result.qualification.warnings[0].warningCode).toBe("EPI004_BUILD_VALIDATION_FAILED");
  });

  it("excludes feature when mixed builds detected (RULE_002)", () => {
    const feature = makeFeature({
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: "GRCh37",
        coordinateSystem: "0-based-half-open",
      },
    });
    const result = qualifyFeature(
      feature,
      makeContext({ buildValidation: mixedBuildValidation }),
    );
    expect(result.qualification.status).toBe("excluded_coordinate_ambiguity");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_002_INVALID_COORDINATES");
  });

  it("excludes feature with insufficient design (RULE_003)", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      ],
    });
    const result = qualifyFeature(makeFeature(), makeContext({ design }));
    expect(result.qualification.status).toBe("excluded_insufficient_design");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_003_INSUFFICIENT_DESIGN");
    expect(result.qualification.warnings[0].warningCode).toBe("EPI005_INSUFFICIENT_DESIGN");
  });

  it("excludes feature with insufficient non-zero dose groups (RULE_003)", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-low-1", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s-low-2", doseGroupId: "low", species: "Homo sapiens" },
      ],
    });
    const result = qualifyFeature(makeFeature(), makeContext({ design }));
    expect(result.qualification.status).toBe("excluded_insufficient_design");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_003_INSUFFICIENT_DESIGN");
  });

  it("does not count duplicate treated group labels as distinct dose levels", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "treated-a", doseValue: 1, doseUnit: "µM" },
        { doseGroupId: "treated-b", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "a1", doseGroupId: "treated-a", species: "Homo sapiens" },
        { sampleId: "a2", doseGroupId: "treated-a", species: "Homo sapiens" },
        { sampleId: "b1", doseGroupId: "treated-b", species: "Homo sapiens" },
        { sampleId: "b2", doseGroupId: "treated-b", species: "Homo sapiens" },
      ],
    });

    const result = qualifyFeature(makeFeature(), makeContext({ design }));
    expect(result.qualification.status).toBe("excluded_insufficient_design");
    expect(result.ruleTriggered).toBe("RULE_003_INSUFFICIENT_DESIGN");
    expect(result.qualification.warnings[0].message).toContain(
      "1 non-zero",
    );
  });

  it("excludes feature with insufficient replicates (RULE_004)", () => {
    const design = makeDesign({
      samples: [
        { sampleId: "s-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-low-1", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s-high-1", doseGroupId: "high", species: "Homo sapiens" },
      ],
      minReplicatesPerGroup: 1,
    });
    const result = qualifyFeature(makeFeature(), makeContext({ design }));
    expect(result.qualification.status).toBe("excluded_qc_failure");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_004_INSUFFICIENT_REPLICATES");
    expect(result.qualification.warnings[0].warningCode).toBe("EPI006_INSUFFICIENT_REPLICATES");
  });

  it("excludes feature with high missingness (RULE_005)", () => {
    const feature = makeFeature({
      values: {
        "s-ctrl-1": null,
        "s-ctrl-2": null,
        "s-low-1": null,
        "s-low-2": 0.8,
        "s-high-1": null,
        "s-high-2": null,
      },
    });
    const result = qualifyFeature(feature, makeContext());
    expect(result.qualification.status).toBe("excluded_qc_failure");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_005_HIGH_MISSINGNESS");
    expect(result.qualification.warnings[0].warningCode).toBe("EPIE002_EXCESSIVE_MISSINGNESS");
  });

  it("excludes feature with non-numeric response (RULE_006)", () => {
    const feature = makeFeature({
      values: {
        "s-ctrl-1": 0.82,
        "s-ctrl-2": Infinity,
        "s-low-1": 0.78,
        "s-low-2": 0.80,
        "s-high-1": 0.75,
        "s-high-2": 0.77,
      },
    });
    const result = qualifyFeature(feature, makeContext());
    expect(result.qualification.status).toBe("excluded_qc_failure");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_006_NON_NUMERIC_RESPONSE");
    expect(result.qualification.warnings[0].warningCode).toBe("EPIE003_NON_NUMERIC_RESPONSE");
  });

  it("excludes feature with -Infinity response (RULE_006)", () => {
    const feature = makeFeature({
      values: {
        "s-ctrl-1": 0.82,
        "s-ctrl-2": -Infinity,
        "s-low-1": 0.78,
        "s-low-2": 0.80,
        "s-high-1": 0.75,
        "s-high-2": 0.77,
      },
    });
    const result = qualifyFeature(feature, makeContext());
    expect(result.qualification.status).toBe("excluded_qc_failure");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_006_NON_NUMERIC_RESPONSE");
  });

  it("sets exploratory_only for dominant cell-composition confounding (RULE_007)", () => {
    const cellComposition: ConfoundingAssessment = {
      status: "dominant_confounding",
      warnings: [],
    };
    const result = qualifyFeature(
      makeFeature(),
      makeContext({ cellCompositionResult: cellComposition }),
    );
    expect(result.qualification.status).toBe("exploratory_only");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_007_DOMINANT_CONFOUNDING");
    expect(result.qualification.warnings[0].warningCode).toBe("EPI007_CELL_COMPOSITION_BLOCKING");
  });

  it("sets exploratory_only for dominant cytotoxicity confounding (RULE_007)", () => {
    const cytotoxicity: ConfoundingAssessment = {
      status: "dominant_confounding",
      warnings: [],
    };
    const result = qualifyFeature(
      makeFeature(),
      makeContext({ cytotoxicityResult: cytotoxicity }),
    );
    expect(result.qualification.status).toBe("exploratory_only");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_007_DOMINANT_CONFOUNDING");
    expect(result.qualification.warnings[0].warningCode).toBe("EPI007_CYTOXICITY_BLOCKING");
  });

  it("blocks on missing context when blockOnMissingContext is true (RULE_007)", () => {
    const policy = createDefaultPolicy();
    policy.confounding.blockOnMissingContext = true;
    const cellComposition: ConfoundingAssessment = {
      status: "no_context_available",
      warnings: [],
    };
    const result = qualifyFeature(
      makeFeature(),
      makeContext({ policy, cellCompositionResult: cellComposition }),
    );
    expect(result.qualification.status).toBe("exploratory_only");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_007_DOMINANT_CONFOUNDING");
    expect(result.qualification.warnings[0].warningCode).toBe("EPI007_MISSING_CONFOUNDING_CONTEXT");
  });

  it("does not block on missing context when blockOnMissingContext is false", () => {
    const cellComposition: ConfoundingAssessment = {
      status: "no_context_available",
      warnings: [],
    };
    const result = qualifyFeature(
      makeFeature(),
      makeContext({ cellCompositionResult: cellComposition }),
    );
    expect(result.qualification.status).toBe("accepted_for_pod");
    expect(result.blocked).toBe(false);
  });

  it("excludes feature with mapping ambiguity (RULE_008)", () => {
    const result = qualifyFeature(
      makeFeature(),
      makeContext({
        mappingInfo: {
          mappedGeneIds: ["GENE1"],
          mappingConfidence: "low",
          mappingMethod: "nearest_gene",
          ambiguityDetected: true,
        },
      }),
    );
    expect(result.qualification.status).toBe("excluded_mapping_failure");
    expect(result.blocked).toBe(true);
    expect(result.ruleTriggered).toBe("RULE_008_MAPPING_AMBIGUITY");
    expect(result.qualification.warnings[0].warningCode).toBe("EPI008_MAPPING_AMBIGUITY");
  });

  it("accepts with caveats for peak-type features (RULE_009)", () => {
    const feature = makeFeature({ featureClass: "atac_peak" as any });
    const result = qualifyFeature(feature, makeContext());
    expect(result.qualification.status).toBe("accepted_with_caveats");
    expect(result.blocked).toBe(false);
    expect(result.ruleTriggered).toBe("RULE_009_MAJOR_WARNINGS");
    expect(result.qualification.warnings[0].warningCode).toBe("EPIW003_PROXIMITY_NOT_CAUSALITY");
  });

  it("accepts with caveats for nearest-gene-only mapping (RULE_009)", () => {
    const feature = makeFeature({ featureClass: "generic_region" as any });
    const result = qualifyFeature(
      feature,
      makeContext({
        mappingInfo: {
          mappedGeneIds: ["GENE1"],
          mappingConfidence: "low",
          mappingMethod: "nearest_gene",
          ambiguityDetected: false,
        },
      }),
    );
    expect(result.qualification.status).toBe("accepted_with_caveats");
    expect(result.blocked).toBe(false);
    expect(result.ruleTriggered).toBe("RULE_009_MAJOR_WARNINGS");
    const nearestGeneWarning = result.qualification.warnings.find(
      (w) => w.warningCode === "EPIW007_NEAREST_GENE_ONLY",
    );
    expect(nearestGeneWarning).toBeDefined();
    expect(nearestGeneWarning!.severity).toBe("warning");
    expect(nearestGeneWarning!.blocksDownstream).toBe(false);
    expect(nearestGeneWarning!.featureIds).toEqual([feature.featureId]);
  });

  it("does not emit EPIW007 when nearest_gene has no mapped genes", () => {
    const feature = makeFeature({ featureClass: "generic_region" as any });
    const result = qualifyFeature(
      feature,
      makeContext({
        mappingInfo: {
          mappedGeneIds: [],
          mappingConfidence: "none",
          mappingMethod: "nearest_gene",
          ambiguityDetected: false,
        },
      }),
    );
    const nearestGeneWarning = result.qualification.warnings.find(
      (w) => w.warningCode === "EPIW007_NEAREST_GENE_ONLY",
    );
    expect(nearestGeneWarning).toBeUndefined();
  });

  it("accepts with caveats for non-standard coordinate system (RULE_009)", () => {
    const feature = makeFeature({
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: "GRCh38",
        coordinateSystem: "1-based-closed",
      },
    });
    const result = qualifyFeature(feature, makeContext());
    expect(result.qualification.status).toBe("accepted_with_caveats");
    expect(result.blocked).toBe(false);
    expect(result.ruleTriggered).toBe("RULE_009_MAJOR_WARNINGS");
    expect(result.qualification.warnings[0].warningCode).toBe("EPIW001_COORDINATE_SYSTEM_NONSTANDARD");
  });

  it("accepts cpg_methylation with caveats when coordinates are 1-based-closed", () => {
    const feature = makeFeature({
      featureClass: "cpg_methylation",
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2001,
        build: "GRCh38",
        coordinateSystem: "1-based-closed",
      },
    });
    const result = qualifyFeature(feature, makeContext());
    expect(result.qualification.status).toBe("accepted_with_caveats");
    expect(result.blocked).toBe(false);
  });

  it("missing build rule takes precedence over missingness", () => {
    const feature = makeFeature({
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: undefined as unknown as "GRCh38",
        coordinateSystem: "0-based-half-open",
      },
      values: {
        "s-ctrl-1": null,
        "s-ctrl-2": null,
        "s-low-1": null,
        "s-low-2": null,
        "s-high-1": null,
        "s-high-2": null,
      },
    });
    const result = qualifyFeature(feature, makeContext());
    expect(result.qualification.status).toBe("excluded_coordinate_ambiguity");
    expect(result.ruleTriggered).toBe("RULE_001_MISSING_BUILD");
  });

  it("insufficient design takes precedence over missingness", () => {
    const design = makeDesign({
      doseGroups: [{ doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" }],
      samples: [
        { sampleId: "s-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      ],
    });
    const feature = makeFeature({
      values: {
        "s-ctrl-1": null,
        "s-ctrl-2": null,
      },
    });
    const result = qualifyFeature(feature, makeContext({ design }));
    expect(result.qualification.status).toBe("excluded_insufficient_design");
    expect(result.ruleTriggered).toBe("RULE_003_INSUFFICIENT_DESIGN");
  });

  it("dominant confounding takes precedence over mapping ambiguity", () => {
    const cytotoxicity: ConfoundingAssessment = {
      status: "dominant_confounding",
      warnings: [],
    };
    const result = qualifyFeature(
      makeFeature(),
      makeContext({
        cytotoxicityResult: cytotoxicity,
        mappingInfo: {
          mappedGeneIds: [],
          mappingConfidence: "none",
          mappingMethod: "nearest_gene",
          ambiguityDetected: true,
        },
      }),
    );
    expect(result.qualification.status).toBe("exploratory_only");
    expect(result.ruleTriggered).toBe("RULE_007_DOMINANT_CONFOUNDING");
  });

  it("uses missingness profile when provided", () => {
    const feature = makeFeature({
      featureId: "feat-001",
      values: {
        "s-ctrl-1": 0.82,
        "s-ctrl-2": 0.85,
        "s-low-1": 0.78,
        "s-low-2": 0.80,
        "s-high-1": 0.75,
        "s-high-2": 0.77,
      },
    });
    const missingnessProfile: MissingnessProfile = {
      datasetId: "ds-001",
      policyVersion: "0.1.0",
      overallFeatureMissingFraction: 0.0,
      perFeatureMissingness: [
        { featureId: "feat-001", missingFraction: 0.5, band: "exclusion" },
      ],
      perSampleMissingness: [],
      perGroupMissingness: [],
      featuresWithCompleteGroupDropout: [],
      summaryBand: "exclusion",
    };
    const result = qualifyFeature(
      feature,
      makeContext({ missingnessProfile }),
    );
    expect(result.qualification.status).toBe("excluded_qc_failure");
    expect(result.ruleTriggered).toBe("RULE_005_HIGH_MISSINGNESS");
  });

  it("emits missingness warning when above warning but below exclusion threshold", () => {
    const feature = makeFeature({
      featureId: "feat-002",
      values: {
        "s-ctrl-1": 0.82,
        "s-ctrl-2": null,
        "s-low-1": 0.78,
        "s-low-2": null,
        "s-high-1": 0.75,
        "s-high-2": 0.77,
      },
    });
    const missingnessProfile: MissingnessProfile = {
      datasetId: "ds-001",
      policyVersion: "0.1.0",
      overallFeatureMissingFraction: 0.33,
      perFeatureMissingness: [
        { featureId: "feat-002", missingFraction: 0.33, band: "warning" },
      ],
      perSampleMissingness: [],
      perGroupMissingness: [],
      featuresWithCompleteGroupDropout: [],
      summaryBand: "warning",
    };
    const policy = createDefaultPolicy();
    policy.missingness.warningThreshold = 0.1;
    policy.missingness.exclusionThreshold = 0.5;
    const result = qualifyFeature(
      feature,
      makeContext({ policy, missingnessProfile }),
    );
    expect(result.qualification.status).toBe("accepted_with_caveats");
    expect(result.ruleTriggered).toBe("RULE_009_MAJOR_WARNINGS");
    const warn = result.qualification.warnings.find(
      (w) => w.warningCode === "EPIW002_ELEVATED_MISSINGNESS",
    );
    expect(warn).toBeDefined();
  });

  it("preserves mapped gene ids and confidence in result", () => {
    const result = qualifyFeature(
      makeFeature(),
      makeContext({
        mappingInfo: {
          mappedGeneIds: ["BRCA1", "TP53"],
          mappingConfidence: "high",
          mappingMethod: "direct_promoter_overlap",
          ambiguityDetected: false,
        },
      }),
    );
    expect(result.qualification.mappedGeneIds).toEqual(["BRCA1", "TP53"]);
    expect(result.qualification.mappingConfidence).toBe("high");
    expect(result.qualification.mappingMethod).toBe("direct_promoter_overlap");
  });

  it("defaults mapping info to empty/none/unknown when not provided", () => {
    const result = qualifyFeature(makeFeature(), makeContext());
    expect(result.qualification.mappedGeneIds).toEqual([]);
    expect(result.qualification.mappingConfidence).toBe("none");
    expect(result.qualification.mappingMethod).toBe("unknown");
  });

  it("does not exclude features without measuredRegion when build validation fails", () => {
    const feature = makeFeature(); // no measuredRegion
    const result = qualifyFeature(
      feature,
      makeContext({ buildValidation: invalidBuildValidation }),
    );
    expect(result.qualification.status).toBe("accepted_for_pod");
    expect(result.blocked).toBe(false);
  });

  it("emits preferred-dose-group warning when below preferred but above minimum", () => {
    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        { doseGroupId: "mid", doseValue: 5, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-low-1", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s-low-2", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s-mid-1", doseGroupId: "mid", species: "Homo sapiens" },
        { sampleId: "s-mid-2", doseGroupId: "mid", species: "Homo sapiens" },
      ],
    });
    const policy = createDefaultPolicy();
    policy.doseGroup.preferredTotalDoseGroups = 4;
    const result = qualifyFeature(makeFeature(), makeContext({ design, policy }));
    expect(result.qualification.status).toBe("accepted_with_caveats");
    const warn = result.qualification.warnings.find(
      (w) => w.warningCode === "EPIW005_BELOW_PREFERRED_DOSE_GROUPS",
    );
    expect(warn).toBeDefined();
  });

  it("emits preferred-replicate warning when below preferred but above minimum", () => {
    const design = makeDesign({
      samples: [
        { sampleId: "s-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s-low-1", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s-low-2", doseGroupId: "low", species: "Homo sapiens" },
        { sampleId: "s-high-1", doseGroupId: "high", species: "Homo sapiens" },
        { sampleId: "s-high-2", doseGroupId: "high", species: "Homo sapiens" },
      ],
      minReplicatesPerGroup: 2,
    });
    const policy = createDefaultPolicy();
    policy.replicate.preferredBiologicalReplicatesPerGroup = 3;
    const result = qualifyFeature(makeFeature(), makeContext({ design, policy }));
    const warn = result.qualification.warnings.find(
      (w) => w.warningCode === "EPIW006_BELOW_PREFERRED_REPLICATES",
    );
    expect(warn).toBeDefined();
    expect(result.qualification.status).toBe("accepted_with_caveats");
  });

  it("deterministic: same inputs always produce same status and warnings", () => {
    const feature = makeFeature({ featureClass: "chip_peak_narrow" as any });
    const ctx = makeContext();
    const r1 = qualifyFeature(feature, ctx);
    const r2 = qualifyFeature(feature, ctx);
    expect(r1.qualification.status).toBe(r2.qualification.status);
    expect(r1.qualification.warnings).toEqual(r2.qualification.warnings);
    expect(r1.ruleTriggered).toBe(r2.ruleTriggered);
  });
});
