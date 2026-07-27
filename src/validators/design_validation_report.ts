import { z } from "zod";
import type { ExperimentalDesign } from "../contracts/design.js";
import {
  DoseAxisGroupSchema,
  ExperimentalDesignSchema,
} from "../contracts/design.js";
import {
  createDefaultPolicy,
  type QualificationPolicy,
} from "../qualification/policy.js";
import { validateControlAndDoseAxis } from "./design_validator.js";
import {
  countReplicatesByType,
  validateReplicates,
} from "./replicate_validator.js";
import { ReplicateGroupCountsSchema } from "./replicate_validator.js";

/**
 * Batch summary for design validation report.
 */
export const BatchSummarySchema = z
  .object({
    batchIdCompleteness: z
      .number()
      .min(0)
      .max(1)
      .describe("Fraction of samples with non-empty batchId"),
    totalSamples: z.number().int().nonnegative(),
    samplesWithBatchId: z.number().int().nonnegative(),
    batchesDetected: z.number().int().nonnegative(),
    batchIds: z.array(z.string().min(1)),
    doseBatchConfoundingDetected: z.boolean(),
    confoundedDoseGroups: z.array(z.string().min(1)),
  })
  .strict();

export type BatchSummary = z.infer<typeof BatchSummarySchema>;

/**
 * Timepoint status summary.
 */
export const TimepointStatusSchema = z
  .object({
    isMultiTimepoint: z.boolean(),
    timepoints: z.array(z.number().finite()),
    undefinedTimepointCount: z.number().int().nonnegative(),
    policyApplied: z.enum(["single_timepoint", "split", "rejected"]),
  })
  .strict();

export type TimepointStatus = z.infer<typeof TimepointStatusSchema>;

export const DesignReadinessStatusSchema = z.enum([
  "invalid",
  "structural_only",
  "comparison_only",
  "dose_response_minimum",
  "dose_response_preferred",
]);

export type DesignReadinessStatus = z.infer<
  typeof DesignReadinessStatusSchema
>;

export const ObservedDesignReadinessSchema = z
  .object({
    declaredDoseGroups: z.number().int().nonnegative(),
    distinctDoseLevels: z.number().int().nonnegative(),
    distinctNonZeroDoseLevels: z.number().int().nonnegative(),
    minEffectiveBiologicalReplicatesPerGroup: z
      .number()
      .int()
      .nonnegative(),
  })
  .strict();

export type ObservedDesignReadiness = z.infer<
  typeof ObservedDesignReadinessSchema
>;

export const DesignReadinessThresholdsSchema = z
  .object({
    minimumTotalDoseLevels: z.number().int().nonnegative(),
    minimumNonZeroDoseLevels: z.number().int().nonnegative(),
    preferredTotalDoseLevels: z.number().int().nonnegative(),
    minimumBiologicalReplicatesPerGroup: z.number().int().nonnegative(),
    preferredBiologicalReplicatesPerGroup: z.number().int().nonnegative(),
  })
  .strict();

export type DesignReadinessThresholds = z.infer<
  typeof DesignReadinessThresholdsSchema
>;

/**
 * Machine-readable reasons that prevent analytical use of an experimental
 * design. These codes complement, rather than replace, the regulator-readable
 * eligibility notes.
 */
export const DesignReadinessBlockerSchema = z.enum([
  "structural_validation_failed",
  "no_treated_dose",
  "insufficient_total_dose_levels",
  "insufficient_nonzero_dose_levels",
  "insufficient_biological_replicates",
  "dose_batch_confounding",
  "multi_timepoint_requires_split",
]);

export type DesignReadinessBlocker = z.infer<
  typeof DesignReadinessBlockerSchema
>;

/**
 * Orthogonal ingestion and analysis-readiness states.
 *
 * `structurallyValid` is the ingestion boundary. Comparison and
 * dose-response readiness are progressively stricter analytical boundaries.
 */
export const DownstreamEligibilitySchema = z
  .object({
    structurallyValid: z.boolean(),
    eligibleForComparison: z.boolean(),
    eligibleForDoseResponse: z.boolean(),
    preferredForDoseResponse: z.boolean(),
    readinessStatus: DesignReadinessStatusSchema,
    observed: ObservedDesignReadinessSchema,
    thresholds: DesignReadinessThresholdsSchema,
    comparisonBlockers: z.array(DesignReadinessBlockerSchema),
    doseResponseBlockers: z.array(DesignReadinessBlockerSchema),
    eligibilityNotes: z.array(z.string().min(1)),
  })
  .strict();

export type DownstreamEligibility = z.infer<typeof DownstreamEligibilitySchema>;

/**
 * Design validation report summarizing all validation outcomes.
 *
 * Emitted by validate_epigenomics_experiment_design; feeds qualification
 * and QC report generation.
 */
export const DesignValidationReportSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(z.string().min(1)),
    warnings: z.array(z.string().min(1)),
    schemaValid: z.boolean().optional().describe("Whether the input passed schema validation"),
    orderedDoseGroups: z.array(DoseAxisGroupSchema),
    replicateCountsByGroup: z.array(ReplicateGroupCountsSchema),
    batchSummary: BatchSummarySchema,
    timepointStatus: TimepointStatusSchema,
    downstreamEligibility: DownstreamEligibilitySchema,
  })
  .strict();

export type DesignValidationReport = z.infer<typeof DesignValidationReportSchema>;

/**
 * Options for emitting a design validation report.
 */
export interface EmitDesignValidationReportOptions {
  /** Explicit control group identifier. */
  controlGroupId?: string;
  /** Provenance declaration when dose groups use mixed units. */
  normalisationProvenance?: string;
  /** v0.1 policy for multi-timepoint designs: reject (default) or split. */
  multiTimepointPolicy?: "split" | "reject";
  /** Explicit qualification policy; defaults to the versioned project policy. */
  policy?: QualificationPolicy;
}

/**
 * Detect dose-batch confounding.
 *
 * Perfect confounding is flagged when every dose group belongs to exactly one
 * batch and every batch contains exactly one dose group. Partial or incomplete
 * association remains reviewable context rather than an automatic blocker.
 */
function detectDoseBatchConfounding(design: ExperimentalDesign): {
  detected: boolean;
  confoundedGroups: string[];
} {
  const samplesWithBatch = design.samples.filter(
    (s) => s.batchId !== undefined && s.batchId.trim() !== "",
  );
  const uniqueBatches = new Set(samplesWithBatch.map((s) => s.batchId));

  if (uniqueBatches.size <= 1) {
    return { detected: false, confoundedGroups: [] };
  }

  const groupToBatches = new Map<string, Set<string>>();
  const batchToGroups = new Map<string, Set<string>>();
  for (const sample of samplesWithBatch) {
    const batchId = sample.batchId!;
    const groupBatches =
      groupToBatches.get(sample.doseGroupId) ?? new Set<string>();
    groupBatches.add(batchId);
    groupToBatches.set(sample.doseGroupId, groupBatches);

    const batchGroups = batchToGroups.get(batchId) ?? new Set<string>();
    batchGroups.add(sample.doseGroupId);
    batchToGroups.set(batchId, batchGroups);
  }

  const perfectlyConfounded =
    design.doseGroups.every(
      (group) => groupToBatches.get(group.doseGroupId)?.size === 1,
    ) &&
    Array.from(batchToGroups.values()).every((groups) => groups.size === 1);
  const confoundedGroups = perfectlyConfounded
    ? design.doseGroups.map((group) => group.doseGroupId)
    : [];

  return {
    detected: confoundedGroups.length > 0,
    confoundedGroups,
  };
}

/**
 * Compute batch summary from experimental design.
 */
function computeBatchSummary(design: ExperimentalDesign): BatchSummary {
  const totalSamples = design.samples.length;
  const samplesWithBatchId = design.samples.filter(
    (s) => s.batchId !== undefined && s.batchId.trim() !== "",
  ).length;
  const batchIdCompleteness =
    totalSamples > 0 ? samplesWithBatchId / totalSamples : 0;

  const batchIds = Array.from(
    new Set(
      design.samples
        .map((s) => s.batchId)
        .filter((b): b is string => b !== undefined && b.trim() !== ""),
    ),
  ).sort();

  // Perfect dose-batch confounding can only be asserted when batch metadata
  // are complete. Partial metadata remain a warning rather than an automatic
  // analytical blocker.
  const { detected, confoundedGroups } =
    samplesWithBatchId === totalSamples
      ? detectDoseBatchConfounding(design)
      : { detected: false, confoundedGroups: [] };

  return {
    batchIdCompleteness,
    totalSamples,
    samplesWithBatchId,
    batchesDetected: batchIds.length,
    batchIds,
    doseBatchConfoundingDetected: detected,
    confoundedDoseGroups: confoundedGroups,
  };
}

/**
 * Compute timepoint status from experimental design.
 */
function computeTimepointStatus(
  design: ExperimentalDesign,
  options: EmitDesignValidationReportOptions,
): TimepointStatus {
  const timepointSet = new Set<number | undefined>();
  for (const dg of design.doseGroups) {
    timepointSet.add(dg.timepointHours);
  }

  const undefinedTimepointCount = Array.from(timepointSet).filter(
    (t) => t === undefined,
  ).length;

  const definedTimepoints = Array.from(timepointSet)
    .filter((t): t is number => t !== undefined)
    .sort((a, b) => a - b);

  const isMultiTimepoint = timepointSet.size > 1;

  let policyApplied: TimepointStatus["policyApplied"] = "single_timepoint";
  if (isMultiTimepoint) {
    policyApplied = options.multiTimepointPolicy === "split" ? "split" : "rejected";
  }

  return {
    isMultiTimepoint,
    timepoints: definedTimepoints,
    undefinedTimepointCount,
    policyApplied,
  };
}

/**
 * Compute downstream eligibility notes.
 */
function computeDownstreamEligibility(
  design: ExperimentalDesign,
  structurallyValid: boolean,
  controlResult: ReturnType<typeof validateControlAndDoseAxis>,
  batchSummary: BatchSummary,
  timepointStatus: TimepointStatus,
  policy: QualificationPolicy,
): DownstreamEligibility {
  const notes: string[] = [];
  const comparisonBlockers: DesignReadinessBlocker[] = [];
  const doseResponseBlockers: DesignReadinessBlocker[] = [];
  const distinctDoseLevels = new Set(
    design.doseGroups.map((group) => group.doseValue),
  ).size;
  const distinctNonZeroDoseLevels = new Set(
    design.doseGroups
      .map((group) => group.doseValue)
      .filter((doseValue) => doseValue !== 0),
  ).size;
  const replicateValidation = validateReplicates(
    design,
    policy.replicate,
  );
  const observed: ObservedDesignReadiness = {
    declaredDoseGroups: design.doseGroups.length,
    distinctDoseLevels,
    distinctNonZeroDoseLevels,
    minEffectiveBiologicalReplicatesPerGroup:
      replicateValidation.minEffectiveBiological,
  };
  const thresholds: DesignReadinessThresholds = {
    minimumTotalDoseLevels: policy.doseGroup.minTotalDoseGroups,
    minimumNonZeroDoseLevels: policy.doseGroup.minNonZeroDoseGroups,
    preferredTotalDoseLevels: policy.doseGroup.preferredTotalDoseGroups,
    minimumBiologicalReplicatesPerGroup:
      policy.replicate.minBiologicalReplicatesPerGroup,
    preferredBiologicalReplicatesPerGroup:
      policy.replicate.preferredBiologicalReplicatesPerGroup,
  };

  const minimumReplicationMet =
    observed.minEffectiveBiologicalReplicatesPerGroup >=
    thresholds.minimumBiologicalReplicatesPerGroup;
  const preferredReplicationMet =
    observed.minEffectiveBiologicalReplicatesPerGroup >=
    thresholds.preferredBiologicalReplicatesPerGroup;
  const aggregateTimepointReady = !timepointStatus.isMultiTimepoint;

  if (!structurallyValid) {
    comparisonBlockers.push("structural_validation_failed");
    doseResponseBlockers.push("structural_validation_failed");
  }
  if (distinctNonZeroDoseLevels === 0) {
    comparisonBlockers.push("no_treated_dose");
    doseResponseBlockers.push("no_treated_dose");
  }
  if (distinctDoseLevels < thresholds.minimumTotalDoseLevels) {
    doseResponseBlockers.push("insufficient_total_dose_levels");
  }
  if (
    distinctNonZeroDoseLevels > 0 &&
    distinctNonZeroDoseLevels < thresholds.minimumNonZeroDoseLevels
  ) {
    doseResponseBlockers.push("insufficient_nonzero_dose_levels");
  }
  if (!minimumReplicationMet) {
    comparisonBlockers.push("insufficient_biological_replicates");
    doseResponseBlockers.push("insufficient_biological_replicates");
  }
  if (batchSummary.doseBatchConfoundingDetected) {
    comparisonBlockers.push("dose_batch_confounding");
    doseResponseBlockers.push("dose_batch_confounding");
  }
  if (!aggregateTimepointReady) {
    comparisonBlockers.push("multi_timepoint_requires_split");
    doseResponseBlockers.push("multi_timepoint_requires_split");
  }

  const eligibleForComparison =
    comparisonBlockers.length === 0;
  const eligibleForDoseResponse = doseResponseBlockers.length === 0;
  const preferredForDoseResponse =
    eligibleForDoseResponse &&
    distinctDoseLevels >= thresholds.preferredTotalDoseLevels &&
    preferredReplicationMet;

  let readinessStatus: DesignReadinessStatus = "invalid";
  if (structurallyValid) {
    readinessStatus = "structural_only";
  }
  if (eligibleForComparison) {
    readinessStatus = "comparison_only";
  }
  if (eligibleForDoseResponse) {
    readinessStatus = "dose_response_minimum";
  }
  if (preferredForDoseResponse) {
    readinessStatus = "dose_response_preferred";
  }

  if (!structurallyValid) {
    notes.push(
      "Structural design validation failed; ingestion and downstream analysis are blocked.",
    );
  } else {
    notes.push("Design is structurally valid for ingestion.");
  }

  if (controlResult.warnings.some((w) => w.includes("Mixed dose units normalised"))) {
    notes.push(
      "Mixed dose units were normalised per declared provenance; verify conversion correctness before modelling.",
    );
  }

  if (!minimumReplicationMet) {
    notes.push(
      `Observed minimum effective biological replication is ${observed.minEffectiveBiologicalReplicatesPerGroup} per group; ${thresholds.minimumBiologicalReplicatesPerGroup} is required for comparison and dose-response readiness.`,
    );
  }

  if (batchSummary.doseBatchConfoundingDetected) {
    notes.push(
      `Dose-batch confounding detected in group(s): ${batchSummary.confoundedDoseGroups.join(", ")}; comparison and dose-response readiness are blocked.`,
    );
  }

  if (batchSummary.batchIdCompleteness < 1) {
    notes.push(
      `Incomplete batch metadata (${batchSummary.samplesWithBatchId}/${batchSummary.totalSamples} samples); unannotated batch effects may confound dose-response estimates.`,
    );
  }

  if (timepointStatus.isMultiTimepoint) {
    if (timepointStatus.policyApplied === "rejected") {
      notes.push(
        "Multi-timepoint design is not analysis-ready as an aggregate under v0.1 policy; per-timepoint splitting is required.",
      );
    } else if (timepointStatus.policyApplied === "split") {
      notes.push(
        "Multi-timepoint design requires single-timepoint subsets; readiness must be evaluated independently for each split.",
      );
    }
  }

  if (controlResult.splitDesigns && controlResult.splitDesigns.length > 0) {
    notes.push(
      `Design split into ${controlResult.splitDesigns.length} single-timepoint design(s); downstream eligibility applies per split design.`,
    );
  }

  if (distinctNonZeroDoseLevels === 0) {
    notes.push(
      "No non-zero dose level is present; the design cannot support a treatment-versus-control comparison.",
    );
  } else if (distinctNonZeroDoseLevels < thresholds.minimumNonZeroDoseLevels) {
    notes.push(
      `The design has ${distinctNonZeroDoseLevels} distinct non-zero dose level(s); ${thresholds.minimumNonZeroDoseLevels} are required by project policy for dose-response readiness.`,
    );
  }

  if (
    eligibleForDoseResponse &&
    distinctDoseLevels < thresholds.preferredTotalDoseLevels
  ) {
    notes.push(
      `The design meets the minimum dose-response threshold but has ${distinctDoseLevels} distinct total dose levels; ${thresholds.preferredTotalDoseLevels} are preferred.`,
    );
  }

  if (eligibleForDoseResponse && !preferredReplicationMet) {
    notes.push(
      `The design meets minimum replication but has ${observed.minEffectiveBiologicalReplicatesPerGroup} effective biological replicates per group; ${thresholds.preferredBiologicalReplicatesPerGroup} are preferred.`,
    );
  }

  if (preferredForDoseResponse) {
    notes.push(
      "Design meets the project policy's preferred dose-level and biological-replication thresholds.",
    );
  } else if (eligibleForDoseResponse) {
    notes.push(
      "Design meets the project policy's minimum dose-response readiness threshold.",
    );
  } else if (eligibleForComparison) {
    notes.push(
      "Design supports a treatment-versus-control comparison but not dose-response modelling.",
    );
  }

  return {
    structurallyValid,
    eligibleForComparison,
    eligibleForDoseResponse,
    preferredForDoseResponse,
    readinessStatus,
    observed,
    thresholds,
    comparisonBlockers,
    doseResponseBlockers,
    eligibilityNotes: notes,
  };
}

/**
 * Build ordered dose-axis groups with replicate counts and sample references.
 */
function buildOrderedDoseGroups(design: ExperimentalDesign): z.infer<typeof DoseAxisGroupSchema>[] {
  const groupSamples = new Map<string, string[]>();
  for (const s of design.samples) {
    const list = groupSamples.get(s.doseGroupId) ?? [];
    list.push(s.sampleId);
    groupSamples.set(s.doseGroupId, list);
  }

  const ordered = [...design.doseGroups].sort((a, b) => {
    if (a.doseValue !== b.doseValue) {
      return a.doseValue - b.doseValue;
    }
    return a.doseGroupId.localeCompare(b.doseGroupId);
  });

  return ordered.map((dg) => ({
    doseGroupId: dg.doseGroupId,
    doseValue: dg.doseValue,
    doseUnit: dg.doseUnit,
    ...(dg.timepointHours !== undefined
      ? { timepointHours: dg.timepointHours }
      : {}),
    replicateCount: groupSamples.get(dg.doseGroupId)?.length ?? 0,
    sampleIds: groupSamples.get(dg.doseGroupId) ?? [],
  }));
}

/**
 * Emit a comprehensive design validation report.
 *
 * Combines schema validation, control-and-dose-axis validation,
 * replicate counting, batch confounding assessment, timepoint policy
 * evaluation, and downstream eligibility into a single regulator-facing
 * report object.
 *
 * Fail-closed: any blocking error sets valid=false and
 * eligibleForDoseResponse=false.
 */
export function emitDesignValidationReport(
  design: unknown,
  options: EmitDesignValidationReportOptions = {},
): DesignValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const policy = options.policy ?? createDefaultPolicy();

  const schemaResult = ExperimentalDesignSchema.safeParse(design);
  if (!schemaResult.success) {
    errors.push(
      ...schemaResult.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    );
  }

  // Run control-and-dose-axis validation (includes an independent schema check).
  const controlResult = validateControlAndDoseAxis(design, options);

  if (schemaResult.success) {
    errors.push(...controlResult.errors);
  }
  warnings.push(...controlResult.warnings);

  const schemaValid = schemaResult.success;

  // If schema parsing failed, we cannot safely derive further metadata.
  let orderedDoseGroups: z.infer<typeof DoseAxisGroupSchema>[] = [];
  let replicateCountsByGroup: z.infer<typeof ReplicateGroupCountsSchema>[] = [];
  let batchSummary: BatchSummary = {
    batchIdCompleteness: 0,
    totalSamples: 0,
    samplesWithBatchId: 0,
    batchesDetected: 0,
    batchIds: [],
    doseBatchConfoundingDetected: false,
    confoundedDoseGroups: [],
  };
  let timepointStatus: TimepointStatus = {
    isMultiTimepoint: false,
    timepoints: [],
    undefinedTimepointCount: 0,
    policyApplied: "single_timepoint",
  };
  let downstreamEligibility: DownstreamEligibility = {
    structurallyValid: false,
    eligibleForComparison: false,
    eligibleForDoseResponse: false,
    preferredForDoseResponse: false,
    readinessStatus: "invalid",
    observed: {
      declaredDoseGroups: 0,
      distinctDoseLevels: 0,
      distinctNonZeroDoseLevels: 0,
      minEffectiveBiologicalReplicatesPerGroup: 0,
    },
    thresholds: {
      minimumTotalDoseLevels: policy.doseGroup.minTotalDoseGroups,
      minimumNonZeroDoseLevels: policy.doseGroup.minNonZeroDoseGroups,
      preferredTotalDoseLevels: policy.doseGroup.preferredTotalDoseGroups,
      minimumBiologicalReplicatesPerGroup:
        policy.replicate.minBiologicalReplicatesPerGroup,
      preferredBiologicalReplicatesPerGroup:
        policy.replicate.preferredBiologicalReplicatesPerGroup,
    },
    comparisonBlockers: ["structural_validation_failed"],
    doseResponseBlockers: ["structural_validation_failed"],
    eligibilityNotes: ["Schema validation failed; cannot assess downstream eligibility."],
  };

  if (schemaResult.success) {
    const d = schemaResult.data;

    const duplicateDoseGroupIds = d.doseGroups
      .map((group) => group.doseGroupId)
      .filter(
        (doseGroupId, index, all) =>
          all.indexOf(doseGroupId) !== index,
      );
    if (duplicateDoseGroupIds.length > 0) {
      errors.push(
        `Duplicate doseGroupId values detected: ${Array.from(new Set(duplicateDoseGroupIds)).join(", ")}`,
      );
    }

    const duplicateSampleIds = d.samples
      .map((sample) => sample.sampleId)
      .filter(
        (sampleId, index, all) => all.indexOf(sampleId) !== index,
      );
    if (duplicateSampleIds.length > 0) {
      errors.push(
        `Duplicate sampleId values detected: ${Array.from(new Set(duplicateSampleIds)).join(", ")}`,
      );
    }

    const groupIds = new Set(d.doseGroups.map((group) => group.doseGroupId));
    for (const sample of d.samples) {
      if (!groupIds.has(sample.doseGroupId)) {
        errors.push(
          `Sample ${sample.sampleId} references unknown doseGroupId ${sample.doseGroupId}`,
        );
      }
    }

    orderedDoseGroups = buildOrderedDoseGroups(d);
    replicateCountsByGroup = countReplicatesByType(d);
    batchSummary = computeBatchSummary(d);
    timepointStatus = computeTimepointStatus(d, options);
    const structurallyValid = errors.length === 0;
    downstreamEligibility = computeDownstreamEligibility(
      d,
      structurallyValid,
      controlResult,
      batchSummary,
      timepointStatus,
      policy,
    );
    if (
      downstreamEligibility.observed
        .minEffectiveBiologicalReplicatesPerGroup <
      downstreamEligibility.thresholds
        .minimumBiologicalReplicatesPerGroup
    ) {
      warnings.push(
        `Observed minimum effective biological replicates per group (${downstreamEligibility.observed.minEffectiveBiologicalReplicatesPerGroup}) is fewer than ${downstreamEligibility.thresholds.minimumBiologicalReplicatesPerGroup}; comparison and dose-response readiness are blocked`,
      );
    }
  }

  const valid = errors.length === 0;

  return DesignValidationReportSchema.parse({
    valid,
    errors,
    warnings,
    ...(schemaValid !== undefined ? { schemaValid } : {}),
    orderedDoseGroups,
    replicateCountsByGroup,
    batchSummary,
    timepointStatus,
    downstreamEligibility,
  });
}
