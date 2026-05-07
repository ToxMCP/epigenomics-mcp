import { z } from "zod";

/**
 * Qualification status for downstream Bioactivity-PoD use.
 */
export const QualificationStatusSchema = z.enum([
  "accepted_for_pod",
  "accepted_with_caveats",
  "excluded_insufficient_design",
  "excluded_coordinate_ambiguity",
  "excluded_qc_failure",
  "excluded_mapping_failure",
  "exploratory_only",
]);

export type QualificationStatus = z.infer<typeof QualificationStatusSchema>;

/**
 * Epigenomics-specific qualification status for feature-level downstream eligibility.
 *
 * Derived from the architecture specification; carries more granular exclusion
 * reasons than the base QualificationStatus.
 */
export const EpigenomicsQualificationStatusSchema = z.enum([
  "accepted_for_pod",
  "accepted_with_warnings",
  "review_required",
  "exploratory_only",
  "excluded_insufficient_design",
  "excluded_invalid_coordinates",
  "excluded_missing_genome_build",
  "excluded_high_missingness",
  "excluded_mapping_ambiguous",
  "excluded_non_numeric_response",
  "excluded_confounding_dominant",
]);

export type EpigenomicsQualificationStatus = z.infer<
  typeof EpigenomicsQualificationStatusSchema
>;

/**
 * Warning or review object for confounding context.
 */
export const QualificationWarningSchema = z
  .object({
    warningCode: z.string().min(1).describe("Structured warning code"),
    severity: z.enum(["info", "warning", "error"]).describe("Severity level"),
    message: z.string().min(1).describe("Human-readable message"),
    category: z
      .enum([
        "cell_composition",
        "cytotoxicity",
        "stress_response",
        "differentiation_drift",
        "batch_effect",
        "time_dependence",
        "coordinate_semantics",
        "mapping_proximity",
        "platform_specific",
        "missing_metadata",
      ])
      .describe("Warning category"),
    featureIds: z.array(z.string()).optional().describe("Affected features"),
    blocksDownstream: z
      .boolean()
      .default(false)
      .describe("Whether this blocks downstream use"),
  })
  .strict();

export type QualificationWarning = z.infer<typeof QualificationWarningSchema>;

/**
 * Machine-readable epigenomics warning with downstream-use rule.
 *
 * Normative warning contract used in QC reports and handoff packets.
 */
export const EpigenomicsWarningSchema = z
  .object({
    schemaName: z.literal("EpigenomicsWarning"),
    schemaVersion: z.string().min(1),
    warningCode: z.string().min(1).describe("Structured warning code"),
    severity: z
      .enum(["info", "caution", "major", "critical"])
      .describe("Severity level"),
    scope: z
      .enum(["dataset", "sample", "feature", "mapping", "handoff"])
      .describe("Scope of the warning"),
    message: z.string().min(1).describe("Human-readable message"),
    downstreamUseRule: z
      .enum(["allow", "allow_with_warning", "review_required", "exploratory_only", "block"])
      .describe("Derived downstream use restriction"),
    evidenceRefs: z
      .array(z.string().min(1))
      .optional()
      .describe("References to supporting evidence"),
  })
  .strict();

export type EpigenomicsWarning = z.infer<typeof EpigenomicsWarningSchema>;

/**
 * Machine-readable epigenomics error.
 *
 * Fatal errors block packet creation; non-fatal errors are recorded for review.
 */
export const EpigenomicsErrorSchema = z
  .object({
    schemaName: z.literal("EpigenomicsError"),
    schemaVersion: z.string().min(1),
    errorCode: z.string().min(1).describe("Structured error code"),
    severity: z.enum(["error", "fatal"]).describe("Error severity"),
    scope: z
      .enum(["dataset", "sample", "feature", "mapping", "handoff"])
      .describe("Scope of the error"),
    message: z.string().min(1).describe("Human-readable message"),
    remediationHint: z
      .string()
      .optional()
      .describe("Suggested remediation or next step"),
  })
  .strict();

export type EpigenomicsError = z.infer<typeof EpigenomicsErrorSchema>;

/**
 * Structured explainability for a qualification decision.
 *
 * Makes every threshold and policy choice reviewable and regulator-readable.
 * Reasons explain what was blocked, downgraded, or accepted without making
 * regulatory conclusions.
 */
export const QualificationExplainabilitySchema = z
  .object({
    ruleCode: z
      .string()
      .min(1)
      .describe("Machine-readable rule code that triggered the decision"),
    reasonTemplate: z
      .string()
      .min(1)
      .describe("Human-readable reason template explaining the decision"),
    remediationHint: z
      .string()
      .optional()
      .describe("Suggested remediation or next step"),
    reviewRequired: z
      .boolean()
      .default(false)
      .describe("Whether human review is mandatory"),
    policyReference: z
      .string()
      .min(1)
      .describe("Policy path that was applied"),
    thresholdValue: z
      .string()
      .optional()
      .describe("Threshold value that was checked"),
    observedValue: z
      .string()
      .optional()
      .describe("Observed value that triggered the decision"),
  })
  .strict();

export type QualificationExplainability = z.infer<
  typeof QualificationExplainabilitySchema
>;

/**
 * Per-feature qualification result.
 */
export const FeatureQualificationSchema = z
  .object({
    featureId: z.string().min(1),
    status: QualificationStatusSchema,
    warnings: z.array(QualificationWarningSchema).default([]),
    mappedGeneIds: z.array(z.string()).optional(),
    mappingConfidence: z.enum(["high", "medium", "low", "none"]).optional(),
    mappingMethod: z.string().optional(),
    explainability: QualificationExplainabilitySchema.optional().describe(
      "Structured explainability for this qualification decision",
    ),
  })
  .strict();

export type FeatureQualification = z.infer<typeof FeatureQualificationSchema>;

/**
 * Epigenomics feature qualification for downstream eligibility.
 *
 * Carries qualification status, reasons, and downstream-use rule in a
 * regulator-facing structure.
 */
export const EpigenomicsFeatureQualificationSchema = z
  .object({
    schemaName: z.literal("EpigenomicsFeatureQualification"),
    schemaVersion: z.string().min(1),
    featureId: z.string().min(1),
    qualificationStatus: EpigenomicsQualificationStatusSchema,
    qualificationReasons: z
      .array(z.string().min(1))
      .min(1)
      .describe("Human-readable qualification reasons"),
    warningRefs: z
      .array(z.string().min(1))
      .default([])
      .describe("References to warning objects"),
    humanReviewRequired: z
      .boolean()
      .default(false)
      .describe("Whether human review is mandatory"),
    downstreamUseRule: z
      .enum(["allow", "allow_with_warning", "review_required", "exploratory_only", "block"])
      .optional()
      .describe("Derived downstream use restriction for this feature"),
  })
  .strict();

export type EpigenomicsFeatureQualification = z.infer<
  typeof EpigenomicsFeatureQualificationSchema
>;

/**
 * Dataset-level qualification summary.
 *
 * Aggregates per-feature EpigenomicsFeatureQualification objects into
 * a regulator-facing summary with immutable object IDs.
 */
export const DatasetQualificationSummarySchema = z
  .object({
    schemaName: z.literal("DatasetQualificationSummary"),
    schemaVersion: z.literal("0.1.0"),
    summaryId: z.string().uuid().describe("Immutable deterministic summary identifier"),
    datasetId: z.string().min(1).describe("Source dataset identifier"),
    totalFeatures: z.number().int().nonnegative(),
    acceptedForPodCount: z.number().int().nonnegative(),
    acceptedWithWarningsCount: z.number().int().nonnegative(),
    reviewRequiredCount: z.number().int().nonnegative(),
    exploratoryOnlyCount: z.number().int().nonnegative(),
    excludedCount: z.number().int().nonnegative(),
    excludedByReason: z
      .record(z.string(), z.number().int().nonnegative())
      .describe("Exclusion counts keyed by EpigenomicsQualificationStatus"),
    overallDownstreamUseRule: z
      .enum(["allow", "allow_with_warning", "review_required", "exploratory_only", "block"])
      .describe("Most restrictive downstream-use rule across the dataset"),
    humanReviewRequired: z
      .boolean()
      .describe("Whether any feature mandates human review"),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type DatasetQualificationSummary = z.infer<
  typeof DatasetQualificationSummarySchema
>;
