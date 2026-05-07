import { z } from "zod";

/**
 * Semver-compatible policy version.
 */
export const PolicyVersionSchema = z
  .string()
  .min(1)
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*))?(?:\+([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*))?$/,
    "Must be a valid semantic version string",
  )
  .describe("Policy version in semver format");

export type PolicyVersion = z.infer<typeof PolicyVersionSchema>;

/**
 * Dose-group policy thresholds.
 */
export const DoseGroupPolicySchema = z
  .object({
    minTotalDoseGroups: z
      .number()
      .int()
      .nonnegative()
      .describe("Minimum total dose groups (including control)"),
    minNonZeroDoseGroups: z
      .number()
      .int()
      .nonnegative()
      .describe("Minimum non-zero dose groups"),
    preferredTotalDoseGroups: z
      .number()
      .int()
      .nonnegative()
      .describe("Preferred total dose groups for accepted_for_pod"),
  })
  .strict()
  .refine(
    (d) => d.preferredTotalDoseGroups >= d.minTotalDoseGroups,
    {
      message: "preferredTotalDoseGroups must be >= minTotalDoseGroups",
      path: ["preferredTotalDoseGroups"],
    },
  )
  .refine(
    (d) => d.minNonZeroDoseGroups <= d.minTotalDoseGroups,
    {
      message: "minNonZeroDoseGroups must be <= minTotalDoseGroups",
      path: ["minNonZeroDoseGroups"],
    },
  );

export type DoseGroupPolicy = z.infer<typeof DoseGroupPolicySchema>;

/**
 * Policy for n=1 biological replicate groups.
 *
 * Fail-closed: n=1 is excluded by default.  Review-required allows a
 * human reviewer to accept single-replicate groups for exploratory use.
 */
export const N1BiologicalReplicatePolicySchema = z.enum([
  "excluded",
  "review_required",
]);

export type N1BiologicalReplicatePolicy = z.infer<
  typeof N1BiologicalReplicatePolicySchema
>;

/**
 * Replicate policy thresholds.
 */
export const ReplicatePolicySchema = z
  .object({
    minBiologicalReplicatesPerGroup: z
      .number()
      .int()
      .nonnegative()
      .describe("Minimum biological replicates per group"),
    preferredBiologicalReplicatesPerGroup: z
      .number()
      .int()
      .nonnegative()
      .describe("Preferred biological replicates per group"),
    n1BiologicalReplicatePolicy: N1BiologicalReplicatePolicySchema.default(
      "excluded",
    ).describe(
      "Whether n=1 biological replicate groups are excluded or sent for review",
    ),
  })
  .strict()
  .refine(
    (r) =>
      r.preferredBiologicalReplicatesPerGroup >=
      r.minBiologicalReplicatesPerGroup,
    {
      message:
        "preferredBiologicalReplicatesPerGroup must be >= minBiologicalReplicatesPerGroup",
      path: ["preferredBiologicalReplicatesPerGroup"],
    },
  );

export type ReplicatePolicy = z.infer<typeof ReplicatePolicySchema>;

/**
 * Missingness threshold policy.
 */
export const MissingnessThresholdSchema = z
  .object({
    warningThreshold: z
      .number()
      .min(0)
      .max(1)
      .describe("Missingness rate triggering a warning"),
    exclusionThreshold: z
      .number()
      .min(0)
      .max(1)
      .describe("Missingness rate triggering exclusion"),
  })
  .strict()
  .refine(
    (m) => m.exclusionThreshold >= m.warningThreshold,
    {
      message: "exclusionThreshold must be >= warningThreshold",
      path: ["exclusionThreshold"],
    },
  );

export type MissingnessThreshold = z.infer<typeof MissingnessThresholdSchema>;

/**
 * Supported genome builds for policy configuration.
 */
export const AllowedGenomeBuildSchema = z.enum([
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

export type AllowedGenomeBuild = z.infer<typeof AllowedGenomeBuildSchema>;

/**
 * Supported coordinate systems for policy configuration.
 */
export const AllowedCoordinateSystemSchema = z.enum([
  "ucsc_bed_0based_half_open",
  "gff_gtf_1based_closed",
  "platform_native_probe",
  "no_coordinates_feature_id_only",
]);

export type AllowedCoordinateSystem = z.infer<
  typeof AllowedCoordinateSystemSchema
>;

/**
 * Coordinate requirements policy.
 */
export const CoordinateRequirementsSchema = z
  .object({
    requireGenomeBuild: z
      .boolean()
      .describe("Whether coordinate-bearing features require an explicit build"),
    requireCoordinateSystem: z
      .boolean()
      .describe("Whether coordinate-bearing features require an explicit coordinate system"),
    allowedGenomeBuilds: z
      .array(AllowedGenomeBuildSchema)
      .min(1)
      .describe("Permitted genome builds"),
    allowedCoordinateSystems: z
      .array(AllowedCoordinateSystemSchema)
      .min(1)
      .describe("Permitted source coordinate systems"),
    blockMixedBuilds: z
      .boolean()
      .describe("Whether mixed genome builds within a dataset block handoff"),
    silentLiftoverAllowed: z
      .boolean()
      .describe("Whether silent coordinate liftover is permitted"),
  })
  .strict()
  .refine(
    (c) => !c.silentLiftoverAllowed || c.blockMixedBuilds,
    {
      message:
        "silentLiftoverAllowed=true requires blockMixedBuilds=true for safety",
      path: ["silentLiftoverAllowed"],
    },
  );

export type CoordinateRequirements = z.infer<
  typeof CoordinateRequirementsSchema
>;

/**
 * Mapping method policy enumeration.
 */
export const MappingMethodPolicySchema = z.enum([
  "direct_promoter_overlap",
  "gene_body_overlap",
  "enhancer_target_from_database",
  "chromatin_interaction_supported",
  "nearest_gene",
  "inferred_target_gene",
  "unknown_target_gene",
]);

export type MappingMethodPolicy = z.infer<typeof MappingMethodPolicySchema>;

/**
 * Downstream use rule for mapping.
 */
export const DownstreamUseRuleSchema = z.enum([
  "allow",
  "allow_with_warning",
  "exploratory_only",
  "block",
]);

export type DownstreamUseRule = z.infer<typeof DownstreamUseRuleSchema>;

/**
 * Mapping requirements policy.
 */
export const MappingRequirementsSchema = z
  .object({
    requireProvenanceForGenePathway: z
      .boolean()
      .describe("Whether gene/pathway interpretation requires mapping provenance"),
    requireProvenanceForPathwayRollup: z
      .boolean()
      .describe("Whether pathway roll-up requires mapping provenance"),
    blockNearestGenePathwayByDefault: z
      .boolean()
      .describe("Whether nearest-gene mapping blocks automatic pathway roll-up"),
    allowedMappingMethods: z
      .array(MappingMethodPolicySchema)
      .min(1)
      .describe("Permitted mapping methods"),
    defaultDownstreamUseRule: DownstreamUseRuleSchema.describe(
      "Default downstream use rule when mapping method is unspecified",
    ),
  })
  .strict();

export type MappingRequirements = z.infer<typeof MappingRequirementsSchema>;

/**
 * Confounding severity level that triggers blocking.
 */
export const ConfoundingBlockLevelSchema = z.enum([
  "unlikely_confounding",
  "possible_confounding",
  "likely_confounding",
  "dominant_confounding",
  "review_required",
]);

export type ConfoundingBlockLevel = z.infer<typeof ConfoundingBlockLevelSchema>;

/**
 * Confounding threshold policy.
 */
export const ConfoundingThresholdSchema = z
  .object({
    cellCompositionBlockLevel: ConfoundingBlockLevelSchema.describe(
      "Minimum cell-composition confounding level that blocks handoff",
    ),
    cytotoxicityBlockLevel: ConfoundingBlockLevelSchema.describe(
      "Minimum cytotoxicity confounding level that blocks handoff",
    ),
    stressResponseBlockLevel: ConfoundingBlockLevelSchema.describe(
      "Minimum stress-response confounding level that blocks handoff",
    ),
    differentiationDriftBlockLevel: ConfoundingBlockLevelSchema.describe(
      "Minimum differentiation-drift confounding level that blocks handoff",
    ),
    blockOnMissingContext: z
      .boolean()
      .describe("Whether missing confounding context blocks handoff"),
  })
  .strict();

export type ConfoundingThreshold = z.infer<typeof ConfoundingThresholdSchema>;

/**
 * Feature flags for v0.2-preview behaviours.
 */
export const FeatureFlagsSchema = z
  .object({
    enableChromatinAccessibility: z
      .boolean()
      .default(false)
      .describe("Enable ATAC-seq / chromatin accessibility features"),
    enableHistoneMark: z
      .boolean()
      .default(false)
      .describe("Enable ChIP-seq histone mark features"),
    enableMirnaExpression: z
      .boolean()
      .default(false)
      .describe("Enable miRNA expression features"),
    enableNcrnaExpression: z
      .boolean()
      .default(false)
      .describe("Enable ncRNA expression features"),
    enableChromatinStateContext: z
      .boolean()
      .default(false)
      .describe("Enable chromatin state context features"),
    enableBatchEffectModeling: z
      .boolean()
      .default(false)
      .describe("Enable advanced batch-effect modeling"),
    enableCellDeconvolution: z
      .boolean()
      .default(false)
      .describe("Enable cell-composition deconvolution from epigenomic data"),
  })
  .strict();

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

/**
 * Policy override provenance record.
 */
export const PolicyOverrideProvenanceSchema = z
  .object({
    overriddenAt: z.string().datetime().describe("ISO-8601 override timestamp"),
    overriddenBy: z.string().min(1).describe("Entity that applied the override"),
    reason: z.string().min(1).describe("Human-readable override reason"),
    sourcePolicyVersion: PolicyVersionSchema.describe(
      "Version of the base policy that was overridden",
    ),
    appliedChanges: z
      .array(z.string().min(1))
      .describe("List of policy paths that were modified"),
  })
  .strict();

export type PolicyOverrideProvenance = z.infer<
  typeof PolicyOverrideProvenanceSchema
>;

/**
 * Complete versioned qualification policy.
 */
export const QualificationPolicySchema = z
  .object({
    policyVersion: PolicyVersionSchema.describe(
      "Semver version of this policy configuration",
    ),
    policyName: z
      .string()
      .min(1)
      .default("epigenomics-default")
      .describe("Human-readable policy identifier"),
    doseGroup: DoseGroupPolicySchema,
    replicate: ReplicatePolicySchema,
    missingness: MissingnessThresholdSchema,
    coordinate: CoordinateRequirementsSchema,
    mapping: MappingRequirementsSchema,
    confounding: ConfoundingThresholdSchema,
    featureFlags: FeatureFlagsSchema,
    overrideProvenance: z
      .array(PolicyOverrideProvenanceSchema)
      .default([])
      .describe("History of explicit policy overrides"),
  })
  .strict();

export type QualificationPolicy = z.infer<typeof QualificationPolicySchema>;

/**
 * Structured validation error for policy parsing.
 */
export interface PolicyValidationError {
  code: "POLICY_SCHEMA_INVALID" | "POLICY_VERSION_MISMATCH";
  message: string;
  zodIssues?: z.ZodIssue[];
}

/**
 * Result type for safe policy validation.
 */
export type PolicyValidationResult =
  | { success: true; policy: QualificationPolicy }
  | { success: false; errors: PolicyValidationError[] };

/**
 * Create the v0.1 default qualification policy.
 *
 * Deterministic defaults derived from the Epigenomics MCP PRD.
 */
export function createDefaultPolicy(): QualificationPolicy {
  return {
    policyVersion: "0.1.0",
    policyName: "epigenomics-default-v0.1",
    doseGroup: {
      minTotalDoseGroups: 2,
      minNonZeroDoseGroups: 2,
      preferredTotalDoseGroups: 4,
    },
    replicate: {
      minBiologicalReplicatesPerGroup: 2,
      preferredBiologicalReplicatesPerGroup: 3,
      n1BiologicalReplicatePolicy: "excluded",
    },
    missingness: {
      warningThreshold: 0.1,
      exclusionThreshold: 0.2,
    },
    coordinate: {
      requireGenomeBuild: true,
      requireCoordinateSystem: true,
      allowedGenomeBuilds: ["GRCh37", "GRCh38", "hg19", "hg38", "mm9", "mm10", "mm39", "rn6", "rn7"],
      allowedCoordinateSystems: [
        "ucsc_bed_0based_half_open",
        "gff_gtf_1based_closed",
        "platform_native_probe",
        "no_coordinates_feature_id_only",
      ],
      blockMixedBuilds: true,
      silentLiftoverAllowed: false,
    },
    mapping: {
      requireProvenanceForGenePathway: true,
      requireProvenanceForPathwayRollup: true,
      blockNearestGenePathwayByDefault: true,
      allowedMappingMethods: [
        "direct_promoter_overlap",
        "gene_body_overlap",
        "enhancer_target_from_database",
        "chromatin_interaction_supported",
        "nearest_gene",
        "inferred_target_gene",
        "unknown_target_gene",
      ],
      defaultDownstreamUseRule: "block",
    },
    confounding: {
      cellCompositionBlockLevel: "dominant_confounding",
      cytotoxicityBlockLevel: "dominant_confounding",
      stressResponseBlockLevel: "dominant_confounding",
      differentiationDriftBlockLevel: "dominant_confounding",
      blockOnMissingContext: false,
    },
    featureFlags: {
      enableChromatinAccessibility: false,
      enableHistoneMark: false,
      enableMirnaExpression: false,
      enableNcrnaExpression: false,
      enableChromatinStateContext: false,
      enableBatchEffectModeling: false,
      enableCellDeconvolution: false,
    },
    overrideProvenance: [],
  };
}

/**
 * Safely validate a raw object against the QualificationPolicy schema.
 */
export function validatePolicy(
  candidate: unknown,
): PolicyValidationResult {
  const parseResult = QualificationPolicySchema.safeParse(candidate);
  if (parseResult.success) {
    return { success: true, policy: parseResult.data };
  }

  const errors: PolicyValidationError[] = parseResult.error.issues.map(
    (issue) => ({
      code: "POLICY_SCHEMA_INVALID",
      message: `${issue.path.join(".")}: ${issue.message}`,
      zodIssues: [issue],
    }),
  );

  return { success: false, errors };
}

/**
 * Merge an explicit policy override into a base policy.
 *
 * Fail-closed: any ambiguous override values are rejected.
 * Override provenance is appended to track the change.
 */
export function mergePolicyOverride(
  basePolicy: QualificationPolicy,
  override: Partial<QualificationPolicy>,
  provenance: Omit<PolicyOverrideProvenance, "sourcePolicyVersion" | "appliedChanges">,
): PolicyValidationResult {
  // Prevent overriding policyVersion directly via merge; it must be explicit.
  if (
    "policyVersion" in override &&
    override.policyVersion !== undefined &&
    override.policyVersion !== basePolicy.policyVersion
  ) {
    return {
      success: false,
      errors: [
        {
          code: "POLICY_VERSION_MISMATCH",
          message: `Override policyVersion (${override.policyVersion}) does not match base policy version (${basePolicy.policyVersion}). Version changes require explicit policy instantiation, not merge.`,
        },
      ],
    };
  }

  const merged: QualificationPolicy = {
    ...basePolicy,
    ...override,
    // Deep-merge nested objects to avoid wholesale replacement
    doseGroup: { ...basePolicy.doseGroup, ...override.doseGroup },
    replicate: { ...basePolicy.replicate, ...override.replicate },
    missingness: { ...basePolicy.missingness, ...override.missingness },
    coordinate: { ...basePolicy.coordinate, ...override.coordinate },
    mapping: { ...basePolicy.mapping, ...override.mapping },
    confounding: { ...basePolicy.confounding, ...override.confounding },
    featureFlags: { ...basePolicy.featureFlags, ...override.featureFlags },
    overrideProvenance: [
      ...basePolicy.overrideProvenance,
      {
        ...provenance,
        sourcePolicyVersion: basePolicy.policyVersion,
        appliedChanges: Object.keys(override),
      },
    ],
  };

  return validatePolicy(merged);
}

/**
 * Serialize a policy to a JSON string with deterministic field ordering.
 */
export function serializePolicy(policy: QualificationPolicy): string {
  return JSON.stringify(policy, null, 2);
}

/**
 * Deserialize a policy from a JSON string.
 */
export function deserializePolicy(json: string): PolicyValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      success: false,
      errors: [
        {
          code: "POLICY_SCHEMA_INVALID",
          message: `JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    };
  }
  return validatePolicy(parsed);
}

/**
 * Determine whether a confounding level meets or exceeds the configured block level.
 *
 * Ordinal ordering (lowest to highest severity):
 * unlikely_confounding < possible_confounding < likely_confounding < dominant_confounding < review_required
 */
const CONFOUNDING_ORDINAL: Record<
  ConfoundingBlockLevel,
  number
> = {
  unlikely_confounding: 0,
  possible_confounding: 1,
  likely_confounding: 2,
  dominant_confounding: 3,
  review_required: 4,
};

/**
 * Check if a given confounding level should block handoff under a threshold.
 */
export function shouldBlockForConfounding(
  observedLevel: ConfoundingBlockLevel,
  blockLevel: ConfoundingBlockLevel,
): boolean {
  return CONFOUNDING_ORDINAL[observedLevel] >= CONFOUNDING_ORDINAL[blockLevel];
}
