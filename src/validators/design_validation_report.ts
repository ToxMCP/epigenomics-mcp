import { z } from "zod";
import type { ExperimentalDesign } from "../contracts/design.js";
import { DoseAxisGroupSchema } from "../contracts/design.js";
import { validateControlAndDoseAxis } from "./design_validator.js";
import { countReplicatesByType } from "./replicate_validator.js";
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

/**
 * Downstream eligibility notes.
 */
export const DownstreamEligibilitySchema = z
  .object({
    eligibleForDoseResponse: z.boolean(),
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
}

/**
 * Detect dose-batch confounding.
 *
 * A dose group is flagged as confounded when all samples with batch
 * metadata in that group belong to a single batch, and the overall
 * design contains more than one distinct batch.
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

  const confoundedGroups: string[] = [];

  for (const doseGroup of design.doseGroups) {
    const groupSamples = samplesWithBatch.filter(
      (s) => s.doseGroupId === doseGroup.doseGroupId,
    );
    if (groupSamples.length === 0) {
      continue;
    }

    const groupBatches = new Set(groupSamples.map((s) => s.batchId));
    if (groupBatches.size === 1) {
      confoundedGroups.push(doseGroup.doseGroupId);
    }
  }

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

  const { detected, confoundedGroups } = detectDoseBatchConfounding(design);

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
  designValid: boolean,
  controlResult: ReturnType<typeof validateControlAndDoseAxis>,
  batchSummary: BatchSummary,
  timepointStatus: TimepointStatus,
  minReplicatesPerGroup: number,
): DownstreamEligibility {
  const notes: string[] = [];
  let eligible = true;

  if (!designValid) {
    eligible = false;
    notes.push("Design validation failed; dose-response modelling is blocked.");
  }

  if (controlResult.errors.length > 0) {
    eligible = false;
    notes.push("Control or dose-axis validation errors block downstream use.");
  }

  if (controlResult.warnings.some((w) => w.includes("Mixed dose units normalised"))) {
    notes.push(
      "Mixed dose units were normalised per declared provenance; verify conversion correctness before modelling.",
    );
  }

  if (minReplicatesPerGroup < 2) {
    notes.push(
      `Minimum replicates per group (${minReplicatesPerGroup}) is fewer than 2; statistical power may be limited.`,
    );
  }

  if (batchSummary.doseBatchConfoundingDetected) {
    notes.push(
      `Dose-batch confounding detected in group(s): ${batchSummary.confoundedDoseGroups.join(", ")}; review batch structure before downstream modelling.`,
    );
  }

  if (batchSummary.batchIdCompleteness < 1) {
    notes.push(
      `Incomplete batch metadata (${batchSummary.samplesWithBatchId}/${batchSummary.totalSamples} samples); unannotated batch effects may confound dose-response estimates.`,
    );
  }

  if (timepointStatus.isMultiTimepoint) {
    if (timepointStatus.policyApplied === "rejected") {
      eligible = false;
      notes.push(
        "Multi-timepoint design rejected under v0.1 policy; per-timepoint splitting required for downstream use.",
      );
    } else if (timepointStatus.policyApplied === "split") {
      notes.push(
        "Multi-timepoint design was split into single-timepoint subsets; each subset must be evaluated independently for downstream eligibility.",
      );
    }
  }

  if (controlResult.splitDesigns && controlResult.splitDesigns.length > 0) {
    notes.push(
      `Design split into ${controlResult.splitDesigns.length} single-timepoint design(s); downstream eligibility applies per split design.`,
    );
  }

  if (eligible && notes.length === 0) {
    notes.push("Design meets basic requirements for downstream dose-response modelling.");
  }

  return {
    eligibleForDoseResponse: eligible,
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

  // Run control-and-dose-axis validation (includes schema check)
  const controlResult = validateControlAndDoseAxis(design, options);

  errors.push(...controlResult.errors);
  warnings.push(...controlResult.warnings);

  // Schema validity is inferred from whether validateControlAndDoseAxis
  // returned schema-level errors.
  const schemaValid =
    controlResult.errors.length === 0 ||
    controlResult.orderedDoseGroups.length > 0;

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
    eligibleForDoseResponse: false,
    eligibilityNotes: ["Schema validation failed; cannot assess downstream eligibility."],
  };

  if (schemaValid && design !== null && typeof design === "object" && !Array.isArray(design)) {
    const d = design as ExperimentalDesign;

    orderedDoseGroups = buildOrderedDoseGroups(d);
    replicateCountsByGroup = countReplicatesByType(d);
    batchSummary = computeBatchSummary(d);
    timepointStatus = computeTimepointStatus(d, options);
    downstreamEligibility = computeDownstreamEligibility(
      controlResult.valid,
      controlResult,
      batchSummary,
      timepointStatus,
      d.minReplicatesPerGroup ?? 0,
    );
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
