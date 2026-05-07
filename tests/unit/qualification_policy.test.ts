import { describe, it, expect } from "vitest";
import {
  createDefaultPolicy,
  validatePolicy,
  mergePolicyOverride,
  serializePolicy,
  deserializePolicy,
  shouldBlockForConfounding,
  PolicyVersionSchema,
  QualificationPolicySchema,
  DoseGroupPolicySchema,
  ReplicatePolicySchema,
  MissingnessThresholdSchema,
  CoordinateRequirementsSchema,
  MappingRequirementsSchema,
  ConfoundingThresholdSchema,
  FeatureFlagsSchema,
  type QualificationPolicy,
  type PolicyValidationResult,
} from "../../src/qualification/policy.js";

describe("createDefaultPolicy", () => {
  it("returns a policy with v0.1.0 version", () => {
    const policy = createDefaultPolicy();
    expect(policy.policyVersion).toBe("0.1.0");
    expect(policy.policyName).toBe("epigenomics-default-v0.1");
  });

  it("returns correct default dose group thresholds", () => {
    const policy = createDefaultPolicy();
    expect(policy.doseGroup.minTotalDoseGroups).toBe(2);
    expect(policy.doseGroup.minNonZeroDoseGroups).toBe(2);
    expect(policy.doseGroup.preferredTotalDoseGroups).toBe(4);
  });

  it("returns correct default replicate thresholds", () => {
    const policy = createDefaultPolicy();
    expect(policy.replicate.minBiologicalReplicatesPerGroup).toBe(2);
    expect(policy.replicate.preferredBiologicalReplicatesPerGroup).toBe(3);
  });

  it("returns correct default missingness thresholds", () => {
    const policy = createDefaultPolicy();
    expect(policy.missingness.warningThreshold).toBe(0.1);
    expect(policy.missingness.exclusionThreshold).toBe(0.2);
  });

  it("returns correct default coordinate requirements", () => {
    const policy = createDefaultPolicy();
    expect(policy.coordinate.requireGenomeBuild).toBe(true);
    expect(policy.coordinate.requireCoordinateSystem).toBe(true);
    expect(policy.coordinate.blockMixedBuilds).toBe(true);
    expect(policy.coordinate.silentLiftoverAllowed).toBe(false);
    expect(policy.coordinate.allowedGenomeBuilds).toEqual([
      "GRCh37",
      "GRCh38",
      "hg19",
      "hg38",
      "mm9",
      "mm10",
      "mm39",
      "rn6",
      "rn7",
    ]);
  });

  it("returns correct default mapping requirements", () => {
    const policy = createDefaultPolicy();
    expect(policy.mapping.requireProvenanceForGenePathway).toBe(true);
    expect(policy.mapping.requireProvenanceForPathwayRollup).toBe(true);
    expect(policy.mapping.blockNearestGenePathwayByDefault).toBe(true);
    expect(policy.mapping.defaultDownstreamUseRule).toBe("block");
  });

  it("returns correct default confounding thresholds", () => {
    const policy = createDefaultPolicy();
    expect(policy.confounding.cellCompositionBlockLevel).toBe(
      "dominant_confounding",
    );
    expect(policy.confounding.cytotoxicityBlockLevel).toBe(
      "dominant_confounding",
    );
    expect(policy.confounding.blockOnMissingContext).toBe(false);
  });

  it("returns all feature flags disabled by default", () => {
    const policy = createDefaultPolicy();
    expect(policy.featureFlags.enableChromatinAccessibility).toBe(false);
    expect(policy.featureFlags.enableHistoneMark).toBe(false);
    expect(policy.featureFlags.enableMirnaExpression).toBe(false);
    expect(policy.featureFlags.enableNcrnaExpression).toBe(false);
    expect(policy.featureFlags.enableChromatinStateContext).toBe(false);
    expect(policy.featureFlags.enableBatchEffectModeling).toBe(false);
    expect(policy.featureFlags.enableCellDeconvolution).toBe(false);
  });

  it("returns empty override provenance", () => {
    const policy = createDefaultPolicy();
    expect(policy.overrideProvenance).toEqual([]);
  });

  it("produces a schema-valid policy", () => {
    const policy = createDefaultPolicy();
    const result = validatePolicy(policy);
    expect(result.success).toBe(true);
  });
});

describe("PolicyVersionSchema", () => {
  it("accepts valid semantic versions", () => {
    expect(PolicyVersionSchema.parse("0.1.0")).toBe("0.1.0");
    expect(PolicyVersionSchema.parse("1.2.3")).toBe("1.2.3");
    expect(PolicyVersionSchema.parse("1.2.3-alpha.1")).toBe("1.2.3-alpha.1");
    expect(PolicyVersionSchema.parse("1.2.3+build.42")).toBe("1.2.3+build.42");
  });

  it("rejects invalid version strings", () => {
    expect(() => PolicyVersionSchema.parse("v1.0")).toThrow();
    expect(() => PolicyVersionSchema.parse("1.0")).toThrow();
    expect(() => PolicyVersionSchema.parse("")).toThrow();
    expect(() => PolicyVersionSchema.parse("not-a-version")).toThrow();
  });
});

describe("DoseGroupPolicySchema", () => {
  it("accepts valid dose group policy", () => {
    const policy = DoseGroupPolicySchema.parse({
      minTotalDoseGroups: 2,
      minNonZeroDoseGroups: 1,
      preferredTotalDoseGroups: 4,
    });
    expect(policy.minTotalDoseGroups).toBe(2);
  });

  it("rejects when preferred < min total", () => {
    expect(() =>
      DoseGroupPolicySchema.parse({
        minTotalDoseGroups: 4,
        minNonZeroDoseGroups: 2,
        preferredTotalDoseGroups: 2,
      }),
    ).toThrow();
  });

  it("rejects when min non-zero > min total", () => {
    expect(() =>
      DoseGroupPolicySchema.parse({
        minTotalDoseGroups: 2,
        minNonZeroDoseGroups: 3,
        preferredTotalDoseGroups: 4,
      }),
    ).toThrow();
  });
});

describe("ReplicatePolicySchema", () => {
  it("accepts valid replicate policy", () => {
    const policy = ReplicatePolicySchema.parse({
      minBiologicalReplicatesPerGroup: 2,
      preferredBiologicalReplicatesPerGroup: 3,
    });
    expect(policy.minBiologicalReplicatesPerGroup).toBe(2);
  });

  it("rejects when preferred < min", () => {
    expect(() =>
      ReplicatePolicySchema.parse({
        minBiologicalReplicatesPerGroup: 3,
        preferredBiologicalReplicatesPerGroup: 2,
      }),
    ).toThrow();
  });
});

describe("MissingnessThresholdSchema", () => {
  it("accepts valid missingness thresholds", () => {
    const policy = MissingnessThresholdSchema.parse({
      warningThreshold: 0.1,
      exclusionThreshold: 0.2,
    });
    expect(policy.exclusionThreshold).toBe(0.2);
  });

  it("rejects when exclusion < warning", () => {
    expect(() =>
      MissingnessThresholdSchema.parse({
        warningThreshold: 0.3,
        exclusionThreshold: 0.2,
      }),
    ).toThrow();
  });

  it("rejects thresholds outside [0,1]", () => {
    expect(() =>
      MissingnessThresholdSchema.parse({
        warningThreshold: -0.1,
        exclusionThreshold: 0.2,
      }),
    ).toThrow();
    expect(() =>
      MissingnessThresholdSchema.parse({
        warningThreshold: 0.1,
        exclusionThreshold: 1.1,
      }),
    ).toThrow();
  });
});

describe("CoordinateRequirementsSchema", () => {
  it("accepts valid coordinate requirements", () => {
    const req = CoordinateRequirementsSchema.parse({
      requireGenomeBuild: true,
      requireCoordinateSystem: true,
      allowedGenomeBuilds: ["GRCh38", "mm10"],
      allowedCoordinateSystems: ["ucsc_bed_0based_half_open"],
      blockMixedBuilds: true,
      silentLiftoverAllowed: false,
    });
    expect(req.blockMixedBuilds).toBe(true);
  });

  it("rejects empty allowed genome builds", () => {
    expect(() =>
      CoordinateRequirementsSchema.parse({
        requireGenomeBuild: true,
        requireCoordinateSystem: true,
        allowedGenomeBuilds: [],
        allowedCoordinateSystems: ["ucsc_bed_0based_half_open"],
        blockMixedBuilds: true,
        silentLiftoverAllowed: false,
      }),
    ).toThrow();
  });

  it("rejects silent liftover when mixed builds not blocked", () => {
    expect(() =>
      CoordinateRequirementsSchema.parse({
        requireGenomeBuild: true,
        requireCoordinateSystem: true,
        allowedGenomeBuilds: ["GRCh38"],
        allowedCoordinateSystems: ["ucsc_bed_0based_half_open"],
        blockMixedBuilds: false,
        silentLiftoverAllowed: true,
      }),
    ).toThrow();
  });
});

describe("MappingRequirementsSchema", () => {
  it("accepts valid mapping requirements", () => {
    const req = MappingRequirementsSchema.parse({
      requireProvenanceForGenePathway: true,
      requireProvenanceForPathwayRollup: true,
      blockNearestGenePathwayByDefault: true,
      allowedMappingMethods: ["nearest_gene", "direct_promoter_overlap"],
      defaultDownstreamUseRule: "block",
    });
    expect(req.defaultDownstreamUseRule).toBe("block");
  });

  it("rejects empty allowed mapping methods", () => {
    expect(() =>
      MappingRequirementsSchema.parse({
        requireProvenanceForGenePathway: true,
        requireProvenanceForPathwayRollup: true,
        blockNearestGenePathwayByDefault: true,
        allowedMappingMethods: [],
        defaultDownstreamUseRule: "allow",
      }),
    ).toThrow();
  });
});

describe("ConfoundingThresholdSchema", () => {
  it("accepts valid confounding thresholds", () => {
    const req = ConfoundingThresholdSchema.parse({
      cellCompositionBlockLevel: "dominant_confounding",
      cytotoxicityBlockLevel: "likely_confounding",
      stressResponseBlockLevel: "possible_confounding",
      differentiationDriftBlockLevel: "review_required",
      blockOnMissingContext: false,
    });
    expect(req.blockOnMissingContext).toBe(false);
  });
});

describe("FeatureFlagsSchema", () => {
  it("applies default false for all flags when empty", () => {
    const flags = FeatureFlagsSchema.parse({});
    expect(flags.enableChromatinAccessibility).toBe(false);
    expect(flags.enableHistoneMark).toBe(false);
    expect(flags.enableMirnaExpression).toBe(false);
    expect(flags.enableNcrnaExpression).toBe(false);
    expect(flags.enableChromatinStateContext).toBe(false);
    expect(flags.enableBatchEffectModeling).toBe(false);
    expect(flags.enableCellDeconvolution).toBe(false);
  });

  it("accepts explicit flag overrides", () => {
    const flags = FeatureFlagsSchema.parse({
      enableChromatinAccessibility: true,
      enableHistoneMark: true,
    });
    expect(flags.enableChromatinAccessibility).toBe(true);
    expect(flags.enableHistoneMark).toBe(true);
    expect(flags.enableMirnaExpression).toBe(false);
  });
});

describe("QualificationPolicySchema", () => {
  it("accepts a complete valid policy", () => {
    const policy: QualificationPolicy = createDefaultPolicy();
    const parsed = QualificationPolicySchema.parse(policy);
    expect(parsed.policyVersion).toBe("0.1.0");
  });

  it("rejects extra fields (strict mode)", () => {
    const policy = createDefaultPolicy();
    expect(() =>
      QualificationPolicySchema.parse({
        ...policy,
        unknownField: "should fail",
      }),
    ).toThrow();
  });

  it("rejects missing required nested objects", () => {
    expect(() =>
      QualificationPolicySchema.parse({
        policyVersion: "0.1.0",
        policyName: "test",
      }),
    ).toThrow();
  });
});

describe("validatePolicy", () => {
  it("returns success for valid policy", () => {
    const result = validatePolicy(createDefaultPolicy());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.policy.policyVersion).toBe("0.1.0");
    }
  });

  it("returns failure for invalid policy with structured errors", () => {
    const result = validatePolicy({
      policyVersion: "not-semver",
      policyName: "bad",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe("POLICY_SCHEMA_INVALID");
      expect(result.errors[0].message).toContain("policyVersion");
    }
  });

  it("returns multiple errors for multiply-invalid policy", () => {
    const result = validatePolicy({
      policyVersion: "0.1.0",
      policyName: "test",
      doseGroup: {
        minTotalDoseGroups: 5,
        minNonZeroDoseGroups: 2,
        preferredTotalDoseGroups: 3,
      },
      replicate: {
        minBiologicalReplicatesPerGroup: 3,
        preferredBiologicalReplicatesPerGroup: 2,
      },
      missingness: {
        warningThreshold: 0.5,
        exclusionThreshold: 0.3,
      },
      coordinate: {
        requireGenomeBuild: true,
        requireCoordinateSystem: true,
        allowedGenomeBuilds: ["GRCh38"],
        allowedCoordinateSystems: ["ucsc_bed_0based_half_open"],
        blockMixedBuilds: false,
        silentLiftoverAllowed: true,
      },
      mapping: {
        requireProvenanceForGenePathway: true,
        requireProvenanceForPathwayRollup: true,
        blockNearestGenePathwayByDefault: true,
        allowedMappingMethods: ["nearest_gene"],
        defaultDownstreamUseRule: "block",
      },
      confounding: {
        cellCompositionBlockLevel: "dominant_confounding",
        cytotoxicityBlockLevel: "dominant_confounding",
        stressResponseBlockLevel: "dominant_confounding",
        differentiationDriftBlockLevel: "dominant_confounding",
        blockOnMissingContext: false,
      },
      featureFlags: {},
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // doseGroup preferred < min, replicate preferred < min, missingness exclusion < warning, coordinate silent liftover unsafe
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("mergePolicyOverride", () => {
  it("applies valid overrides and records provenance", () => {
    const base = createDefaultPolicy();
    const result = mergePolicyOverride(
      base,
      {
        missingness: {
          warningThreshold: 0.05,
          exclusionThreshold: 0.15,
        },
        featureFlags: {
          enableChromatinAccessibility: true,
        },
      },
      {
        overriddenAt: "2026-05-05T12:00:00Z",
        overriddenBy: "test-user",
        reason: "Tighter thresholds for high-confidence assay",
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.policy.missingness.warningThreshold).toBe(0.05);
      expect(result.policy.missingness.exclusionThreshold).toBe(0.15);
      expect(result.policy.featureFlags.enableChromatinAccessibility).toBe(
        true,
      );
      expect(result.policy.overrideProvenance).toHaveLength(1);
      expect(result.policy.overrideProvenance[0].overriddenBy).toBe(
        "test-user",
      );
      expect(result.policy.overrideProvenance[0].appliedChanges).toContain(
        "missingness",
      );
      expect(result.policy.overrideProvenance[0].appliedChanges).toContain(
        "featureFlags",
      );
      expect(result.policy.overrideProvenance[0].sourcePolicyVersion).toBe(
        "0.1.0",
      );
    }
  });

  it("rejects version mismatch in override", () => {
    const base = createDefaultPolicy();
    const result = mergePolicyOverride(
      base,
      { policyVersion: "0.2.0" },
      {
        overriddenAt: "2026-05-05T12:00:00Z",
        overriddenBy: "test-user",
        reason: "Version bump",
      },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].code).toBe("POLICY_VERSION_MISMATCH");
    }
  });

  it("allows same version override (idempotent)", () => {
    const base = createDefaultPolicy();
    const result = mergePolicyOverride(
      base,
      { policyVersion: "0.1.0" },
      {
        overriddenAt: "2026-05-05T12:00:00Z",
        overriddenBy: "test-user",
        reason: "Explicit same version",
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.policy.policyVersion).toBe("0.1.0");
    }
  });

  it("rejects invalid nested override values", () => {
    const base = createDefaultPolicy();
    const result = mergePolicyOverride(
      base,
      {
        missingness: {
          warningThreshold: 0.3,
          exclusionThreshold: 0.2,
        },
      },
      {
        overriddenAt: "2026-05-05T12:00:00Z",
        overriddenBy: "test-user",
        reason: "Bad thresholds",
      },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].code).toBe("POLICY_SCHEMA_INVALID");
    }
  });

  it("accumulates multiple override provenance records", () => {
    let policy = createDefaultPolicy();

    const first = mergePolicyOverride(
      policy,
      { policyName: "overridden-once" },
      {
        overriddenAt: "2026-05-05T10:00:00Z",
        overriddenBy: "user-a",
        reason: "First override",
      },
    );
    expect(first.success).toBe(true);
    if (!first.success) return;

    const second = mergePolicyOverride(
      first.policy,
      { policyName: "overridden-twice" },
      {
        overriddenAt: "2026-05-05T11:00:00Z",
        overriddenBy: "user-b",
        reason: "Second override",
      },
    );
    expect(second.success).toBe(true);
    if (!second.success) return;

    expect(second.policy.overrideProvenance).toHaveLength(2);
    expect(second.policy.overrideProvenance[0].overriddenBy).toBe("user-a");
    expect(second.policy.overrideProvenance[1].overriddenBy).toBe("user-b");
  });
});

describe("serializePolicy / deserializePolicy", () => {
  it("round-trips a default policy through JSON", () => {
    const original = createDefaultPolicy();
    const json = serializePolicy(original);
    const result = deserializePolicy(json);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.policy.policyVersion).toBe(original.policyVersion);
      expect(result.policy.policyName).toBe(original.policyName);
      expect(result.policy.doseGroup).toEqual(original.doseGroup);
      expect(result.policy.replicate).toEqual(original.replicate);
      expect(result.policy.missingness).toEqual(original.missingness);
      expect(result.policy.coordinate).toEqual(original.coordinate);
      expect(result.policy.mapping).toEqual(original.mapping);
      expect(result.policy.confounding).toEqual(original.confounding);
      expect(result.policy.featureFlags).toEqual(original.featureFlags);
      expect(result.policy.overrideProvenance).toEqual(
        original.overrideProvenance,
      );
    }
  });

  it("round-trips a policy with override provenance", () => {
    const merged = mergePolicyOverride(
      createDefaultPolicy(),
      {
        missingness: {
          warningThreshold: 0.05,
          exclusionThreshold: 0.15,
        },
      },
      {
        overriddenAt: "2026-05-05T12:00:00Z",
        overriddenBy: "test-user",
        reason: "Tighter thresholds",
      },
    );

    expect(merged.success).toBe(true);
    if (!merged.success) return;

    const json = serializePolicy(merged.policy);
    const result = deserializePolicy(json);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.policy.overrideProvenance).toHaveLength(1);
      expect(result.policy.missingness.warningThreshold).toBe(0.05);
    }
  });

  it("fails gracefully on invalid JSON", () => {
    const result = deserializePolicy("not-json");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].code).toBe("POLICY_SCHEMA_INVALID");
      expect(result.errors[0].message).toContain("JSON parse error");
    }
  });

  it("fails gracefully on JSON that is not a policy object", () => {
    const result = deserializePolicy('{"hello": "world"}');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].code).toBe("POLICY_SCHEMA_INVALID");
    }
  });
});

describe("shouldBlockForConfounding", () => {
  it("blocks when observed level equals block level", () => {
    expect(
      shouldBlockForConfounding("dominant_confounding", "dominant_confounding"),
    ).toBe(true);
    expect(
      shouldBlockForConfounding("possible_confounding", "possible_confounding"),
    ).toBe(true);
  });

  it("blocks when observed level exceeds block level", () => {
    expect(
      shouldBlockForConfounding("dominant_confounding", "likely_confounding"),
    ).toBe(true);
    expect(
      shouldBlockForConfounding("review_required", "dominant_confounding"),
    ).toBe(true);
  });

  it("does not block when observed level is below block level", () => {
    expect(
      shouldBlockForConfounding("possible_confounding", "likely_confounding"),
    ).toBe(false);
    expect(
      shouldBlockForConfounding("unlikely_confounding", "possible_confounding"),
    ).toBe(false);
  });

  it("does not block for unlikely when block level is dominant", () => {
    expect(
      shouldBlockForConfounding(
        "unlikely_confounding",
        "dominant_confounding",
      ),
    ).toBe(false);
  });
});
