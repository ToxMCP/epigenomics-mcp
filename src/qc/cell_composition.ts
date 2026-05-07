import { z } from "zod";
import type { ExperimentalDesign } from "../contracts/design.js";
import { QualificationWarningSchema } from "../contracts/qualification.js";
import type { QualificationWarning } from "../contracts/qualification.js";

/**
 * Deterministic cell-composition confounding status.
 *
 * Ordered from least to most severe:
 * no_context_available < unlikely_confounding < possible_confounding
 * < likely_confounding < dominant_confounding < review_required
 */
export const CellCompositionConfoundingStatusSchema = z.enum([
  "no_context_available",
  "unlikely_confounding",
  "possible_confounding",
  "likely_confounding",
  "dominant_confounding",
  "review_required",
]);

export type CellCompositionConfoundingStatus = z.infer<
  typeof CellCompositionConfoundingStatusSchema
>;

/**
 * Result of cell-composition confounding classification.
 */
export const CellCompositionConfoundingResultSchema = z
  .object({
    status: CellCompositionConfoundingStatusSchema,
    warnings: z.array(QualificationWarningSchema),
    rationale: z.string().min(1),
    blocksDownstream: z.boolean(),
    maxFractionDelta: z.number().min(0).max(1).optional(),
  })
  .strict();

export type CellCompositionConfoundingResult = z.infer<
  typeof CellCompositionConfoundingResultSchema
>;

/**
 * Options for confounding classification.
 */
export interface CellCompositionClassificationOptions {
  /** Threshold above which a shift is considered possible (default 0.1). */
  possibleThreshold?: number;
  /** Threshold above which a shift is considered likely (default 0.3). */
  likelyThreshold?: number;
  /** Threshold above which a shift is considered dominant (default 0.5). */
  dominantThreshold?: number;
}

/**
 * Source of cell-composition evidence for a sample.
 */
export const CellCompositionSourceSchema = z.enum([
  "measured_flow_cytometry",
  "measured_sorting",
  "externally_estimated",
  "declared_pure",
  "declared_mixed_unknown_fractions",
  "not_declared",
]);

export type CellCompositionSource = z.infer<typeof CellCompositionSourceSchema>;

/**
 * Fraction of a specific cell type in a sample.
 */
export const CellTypeFractionSchema = z
  .object({
    cellType: z.string().min(1),
    fraction: z.number().min(0).max(1),
  })
  .strict();

export type CellTypeFraction = z.infer<typeof CellTypeFractionSchema>;

/**
 * Cell-composition metadata for a single sample.
 */
export const SampleCellCompositionSchema = z
  .object({
    sampleId: z.string().min(1),
    source: CellCompositionSourceSchema,
    declaredCellType: z.string().min(1).optional(),
    fractions: z.array(CellTypeFractionSchema).optional(),
    notes: z.string().optional(),
  })
  .strict();

export type SampleCellComposition = z.infer<typeof SampleCellCompositionSchema>;

/**
 * Detected cell-composition shift for a dose group relative to control.
 */
export const GroupCellCompositionShiftSchema = z
  .object({
    doseGroupId: z.string().min(1),
    shiftDetected: z.boolean(),
    maxFractionDelta: z.number().min(0).max(1).optional(),
    shiftedCellTypes: z.array(z.string().min(1)).optional(),
    notes: z.string().optional(),
  })
  .strict();

export type GroupCellCompositionShift = z.infer<
  typeof GroupCellCompositionShiftSchema
>;

/**
 * Comprehensive cell-composition profile for a dataset.
 */
export const CellCompositionProfileSchema = z
  .object({
    datasetId: z.string().min(1),
    samples: z.array(SampleCellCompositionSchema),
    groupShifts: z.array(GroupCellCompositionShiftSchema),
    warnings: z.array(QualificationWarningSchema),
    fractionSumValid: z.boolean(),
    hasAnyCompositionData: z.boolean(),
  })
  .strict();

export type CellCompositionProfile = z.infer<
  typeof CellCompositionProfileSchema
>;

/**
 * Options for cell-composition ingestion.
 */
export interface CellCompositionOptions {
  /** Tolerance for fraction-sum validation (default 0.05). */
  fractionTolerance?: number;
  /** Fraction delta threshold for group-shift detection (default 0.1). */
  shiftThreshold?: number;
}

const DEFAULT_FRACTION_TOLERANCE = 0.05;
const DEFAULT_SHIFT_THRESHOLD = 0.1;

function buildWarning(
  warningCode: string,
  message: string,
  severity: "info" | "warning" | "error",
): QualificationWarning {
  return {
    warningCode,
    severity,
    message,
    category: "cell_composition",
    blocksDownstream: severity === "error",
  };
}

function validateFractionSum(
  fractions: CellTypeFraction[] | undefined,
  tolerance: number,
): { valid: boolean; sum: number } {
  if (fractions === undefined || fractions.length === 0) {
    return { valid: true, sum: 0 };
  }
  const sum = fractions.reduce((acc, f) => acc + f.fraction, 0);
  return { valid: Math.abs(sum - 1.0) <= tolerance, sum };
}

function detectGroupShifts(
  samples: SampleCellComposition[],
  design: ExperimentalDesign,
  shiftThreshold: number,
): GroupCellCompositionShift[] {
  const controlSamples = design.samples.filter(
    (s) => s.controlFlag === true || design.doseGroups.find((g) => g.doseGroupId === s.doseGroupId)?.doseValue === 0,
  );

  const controlSampleIds = new Set(controlSamples.map((s) => s.sampleId));
  const controlCompositions = samples.filter((s) => controlSampleIds.has(s.sampleId));

  // Build control mean fractions per cell type
  const controlMeans = new Map<string, number>();
  const controlCellTypes = new Set<string>();
  for (const comp of controlCompositions) {
    if (comp.fractions) {
      for (const f of comp.fractions) {
        controlCellTypes.add(f.cellType);
        controlMeans.set(f.cellType, (controlMeans.get(f.cellType) || 0) + f.fraction);
      }
    }
  }
  const controlCount = controlCompositions.length;
  if (controlCount > 0) {
    for (const ct of controlCellTypes) {
      controlMeans.set(ct, (controlMeans.get(ct) || 0) / controlCount);
    }
  }

  const shifts: GroupCellCompositionShift[] = [];

  for (const doseGroup of design.doseGroups) {
    const groupSamples = design.samples.filter(
      (s) => s.doseGroupId === doseGroup.doseGroupId,
    );
    const groupSampleIds = new Set(groupSamples.map((s) => s.sampleId));
    const groupCompositions = samples.filter((s) => groupSampleIds.has(s.sampleId));

    const groupMeans = new Map<string, number>();
    const groupCellTypes = new Set<string>();
    for (const comp of groupCompositions) {
      if (comp.fractions) {
        for (const f of comp.fractions) {
          groupCellTypes.add(f.cellType);
          groupMeans.set(f.cellType, (groupMeans.get(f.cellType) || 0) + f.fraction);
        }
      }
    }
    const groupCount = groupCompositions.length;
    if (groupCount > 0) {
      for (const ct of groupCellTypes) {
        groupMeans.set(ct, (groupMeans.get(ct) || 0) / groupCount);
      }
    }

    // Skip groups with no composition data; we cannot assess shifts
    if (groupCount === 0) {
      shifts.push({
        doseGroupId: doseGroup.doseGroupId,
        shiftDetected: false,
        maxFractionDelta: 0,
        notes: "No composition data available for this dose group",
      });
      continue;
    }

    const allCellTypes = new Set([...controlCellTypes, ...groupCellTypes]);
    let maxDelta = 0;
    const shiftedCellTypes: string[] = [];

    for (const ct of allCellTypes) {
      const controlMean = controlMeans.get(ct) || 0;
      const groupMean = groupMeans.get(ct) || 0;
      const delta = Math.abs(groupMean - controlMean);
      if (delta > maxDelta) {
        maxDelta = delta;
      }
      // Use a small epsilon to avoid floating-point boundary false positives
      if (delta > shiftThreshold + 1e-12) {
        shiftedCellTypes.push(ct);
      }
    }

    maxDelta = Math.round(maxDelta * 1_000_000) / 1_000_000;

    shifts.push({
      doseGroupId: doseGroup.doseGroupId,
      shiftDetected: shiftedCellTypes.length > 0,
      maxFractionDelta: maxDelta,
      shiftedCellTypes: shiftedCellTypes.length > 0 ? shiftedCellTypes : undefined,
      notes:
        shiftedCellTypes.length > 0
          ? `Cell-composition shift detected relative to control (threshold ${shiftThreshold})`
          : undefined,
    });
  }

  return shifts;
}

/**
 * Ingest and validate cell-composition evidence for a dataset.
 *
 * Parses purified/mixed-population declarations, measured fractions,
 * externally-estimated fractions, and evidence sources.  Detects
 * group-level shifts when an experimental design is supplied.
 *
 * Fail-closed behaviour:
 * - Fraction sums outside tolerance emit an error-level warning.
 * - Missing composition data for any sample emits a warning.
 * - No default deconvolution from epigenomic data is performed.
 */
export function ingestCellComposition(
  datasetId: string,
  sampleInputs: SampleCellComposition[],
  design?: ExperimentalDesign,
  options: CellCompositionOptions = {},
): CellCompositionProfile {
  const tolerance = options.fractionTolerance ?? DEFAULT_FRACTION_TOLERANCE;
  const shiftThreshold = options.shiftThreshold ?? DEFAULT_SHIFT_THRESHOLD;

  const warnings: QualificationWarning[] = [];
  let fractionSumValid = true;
  let hasAnyCompositionData = false;

  const samples: SampleCellComposition[] = [];

  for (const raw of sampleInputs) {
    const parsed = SampleCellCompositionSchema.parse(raw);

    // Auto-fill declared_pure if declaredCellType is present but fractions are missing
    if (
      parsed.source === "declared_pure" &&
      parsed.fractions === undefined &&
      parsed.declaredCellType !== undefined
    ) {
      parsed.fractions = [
        { cellType: parsed.declaredCellType, fraction: 1.0 },
      ];
    }

    // Check for presence of composition data
    if (
      parsed.source !== "not_declared" &&
      parsed.source !== "declared_mixed_unknown_fractions"
    ) {
      if (parsed.fractions !== undefined && parsed.fractions.length > 0) {
        hasAnyCompositionData = true;
      } else if (parsed.source === "declared_pure" && parsed.declaredCellType) {
        hasAnyCompositionData = true;
      } else {
        warnings.push(
          buildWarning(
            "CC_MISSING_FRACTIONS",
            `Sample ${parsed.sampleId} has source ${parsed.source} but no fractions provided`,
            "warning",
          ),
        );
      }
    }

    // Validate fraction sums for sources that should have fractions
    if (
      parsed.fractions !== undefined &&
      parsed.fractions.length > 0 &&
      parsed.source !== "declared_mixed_unknown_fractions" &&
      parsed.source !== "not_declared"
    ) {
      const { valid, sum } = validateFractionSum(parsed.fractions, tolerance);
      if (!valid) {
        fractionSumValid = false;
        warnings.push(
          buildWarning(
            "CC_FRACTION_SUM_MISMATCH",
            `Sample ${parsed.sampleId} fraction sum ${sum.toFixed(4)} is outside tolerance ${tolerance} of 1.0`,
            "error",
          ),
        );
      }
    }

    // Warn if not_declared samples are present
    if (parsed.source === "not_declared") {
      warnings.push(
        buildWarning(
          "CC_NOT_DECLARED",
          `Sample ${parsed.sampleId} has no cell-composition declaration`,
          "warning",
        ),
      );
    }

    samples.push(parsed);
  }

  // Detect group-level shifts when design is available
  let groupShifts: GroupCellCompositionShift[] = [];
  if (design !== undefined && hasAnyCompositionData) {
    groupShifts = detectGroupShifts(samples, design, shiftThreshold);
    const shiftedGroups = groupShifts.filter((g) => g.shiftDetected);
    if (shiftedGroups.length > 0) {
      warnings.push(
        buildWarning(
          "CC_GROUP_SHIFT",
          `Cell-composition shift detected in ${shiftedGroups.length} dose group(s) relative to control`,
          "warning",
        ),
      );
    }
  }

  return CellCompositionProfileSchema.parse({
    datasetId,
    samples,
    groupShifts,
    warnings,
    fractionSumValid,
    hasAnyCompositionData,
  });
}


const DEFAULT_POSSIBLE_THRESHOLD = 0.1;
const DEFAULT_LIKELY_THRESHOLD = 0.3;
const DEFAULT_DOMINANT_THRESHOLD = 0.5;

function buildEpiWarning(
  warningCode: string,
  message: string,
  severity: "info" | "warning" | "error",
): QualificationWarning {
  return {
    warningCode,
    severity,
    message,
    category: "cell_composition",
    blocksDownstream: severity === "error",
  };
}

function hasConflictingDeclarations(
  samples: SampleCellComposition[],
): boolean {
  const pureCellTypes = new Set<string>();
  for (const s of samples) {
    if (s.source === "declared_pure" && s.declaredCellType) {
      pureCellTypes.add(s.declaredCellType);
    }
  }
  return pureCellTypes.size > 1;
}

function hasMixedNotDeclaredWithDeclared(
  samples: SampleCellComposition[],
): boolean {
  const hasNotDeclared = samples.some((s) => s.source === "not_declared");
  const hasDeclared = samples.some(
    (s) => s.source !== "not_declared",
  );
  return hasNotDeclared && hasDeclared;
}

function hasMixedUnknownWithReliable(
  samples: SampleCellComposition[],
): boolean {
  const hasUnknown = samples.some(
    (s) => s.source === "declared_mixed_unknown_fractions",
  );
  const hasReliable = samples.some(
    (s) =>
      s.source === "declared_pure" ||
      s.source === "measured_flow_cytometry" ||
      s.source === "measured_sorting" ||
      s.source === "externally_estimated",
  );
  return hasUnknown && hasReliable;
}

function allSamplesReliable(
  samples: SampleCellComposition[],
): boolean {
  return samples.every(
    (s) =>
      s.source === "declared_pure" ||
      s.source === "measured_flow_cytometry" ||
      s.source === "measured_sorting" ||
      s.source === "externally_estimated",
  );
}

function allSamplesPureSameType(
  samples: SampleCellComposition[],
): boolean {
  const pureSamples = samples.filter((s) => s.source === "declared_pure");
  if (pureSamples.length === 0) return false;
  if (pureSamples.length !== samples.length) return false;
  const firstType = pureSamples[0].declaredCellType;
  if (!firstType) return false;
  return pureSamples.every((s) => s.declaredCellType === firstType);
}

function anySampleMixedUnknown(
  samples: SampleCellComposition[],
): boolean {
  return samples.some(
    (s) => s.source === "declared_mixed_unknown_fractions",
  );
}

function getMaxFractionDelta(
  groupShifts: GroupCellCompositionShift[],
): number {
  let max = 0;
  for (const g of groupShifts) {
    if ((g.maxFractionDelta ?? 0) > max) {
      max = g.maxFractionDelta ?? 0;
    }
  }
  return max;
}

function shiftDetected(groupShifts: GroupCellCompositionShift[]): boolean {
  return groupShifts.some((g) => g.shiftDetected);
}

/**
 * Classify cell-composition confounding status from an ingestion profile.
 *
 * Deterministic rules:
 * - no_context_available: no composition data at all.
 * - review_required: conflicting evidence, fraction sums invalid,
 *   or not_declared mixed with declared samples.
 * - unlikely_confounding: all samples purified or measured, same cell type,
 *   valid fractions, and no group shifts detected.
 * - possible_confounding: mixed unknown fractions, no design to assess shifts,
 *   or small group shifts (<= likelyThreshold).
 * - likely_confounding: moderate group shifts (> likelyThreshold, <= dominantThreshold).
 * - dominant_confounding: large group shifts (> dominantThreshold).
 *
 * Warnings:
 * - EPIW001_CELL_COMPOSITION_CONTEXT_MISSING for no_context_available.
 * - EPIW002_CELL_TYPE_SHIFT_POSSIBLE when shift-based confounding is
 *   possible, likely, or dominant.
 *
 * Fail-closed: ambiguous or incomplete evidence defaults to a more
 * severe status rather than a milder one.
 */
export function classifyCellCompositionConfounding(
  profile: CellCompositionProfile,
  options: CellCompositionClassificationOptions = {},
): CellCompositionConfoundingResult {
  const possibleThreshold =
    options.possibleThreshold ?? DEFAULT_POSSIBLE_THRESHOLD;
  const likelyThreshold =
    options.likelyThreshold ?? DEFAULT_LIKELY_THRESHOLD;
  const dominantThreshold =
    options.dominantThreshold ?? DEFAULT_DOMINANT_THRESHOLD;

  const warnings: QualificationWarning[] = [];
  let status: CellCompositionConfoundingStatus;
  let rationale: string;
  let blocksDownstream = false;
  let maxFractionDelta: number | undefined;

  // Rule: no context available
  // declared_mixed_unknown_fractions counts as contextual knowledge
  // even though the exact fractions are unknown.
  const hasMixedUnknownOnly =
    profile.samples.length > 0 &&
    profile.samples.every(
      (s) => s.source === "declared_mixed_unknown_fractions",
    );
  if (!profile.hasAnyCompositionData && !hasMixedUnknownOnly) {
    status = "no_context_available";
    rationale =
      "No cell-composition context is available for any sample in the dataset";
    warnings.push(
      buildEpiWarning(
        "EPIW001_CELL_COMPOSITION_CONTEXT_MISSING",
        "No cell-composition context available; confounding cannot be assessed",
        "warning",
      ),
    );
    return CellCompositionConfoundingResultSchema.parse({
      status,
      warnings,
      rationale,
      blocksDownstream,
    });
  }

  // Rule: conflicting or invalid evidence → review_required
  if (!profile.fractionSumValid) {
    status = "review_required";
    rationale =
      "Fraction sums are invalid; cell-composition evidence is internally inconsistent";
    warnings.push(
      buildEpiWarning(
        "CC_FRACTION_SUM_MISMATCH",
        "Cell-composition fraction sums are invalid; review required",
        "error",
      ),
    );
    blocksDownstream = true;
    return CellCompositionConfoundingResultSchema.parse({
      status,
      warnings,
      rationale,
      blocksDownstream,
    });
  }

  if (hasMixedNotDeclaredWithDeclared(profile.samples)) {
    status = "review_required";
    rationale =
      "Some samples declare cell composition while others do not; evidence is inconsistent";
    warnings.push(
      buildEpiWarning(
        "CC_MIXED_DECLARATIONS",
        "Mixed not_declared and declared cell-composition sources; review required",
        "warning",
      ),
    );
    return CellCompositionConfoundingResultSchema.parse({
      status,
      warnings,
      rationale,
      blocksDownstream,
    });
  }

  if (hasMixedUnknownWithReliable(profile.samples)) {
    status = "review_required";
    rationale =
      "Some samples declare mixed unknown fractions while others declare reliable composition; evidence is inconsistent";
    warnings.push(
      buildEpiWarning(
        "CC_MIXED_DECLARATIONS",
        "Mixed unknown fractions and reliable composition sources; review required",
        "warning",
      ),
    );
    return CellCompositionConfoundingResultSchema.parse({
      status,
      warnings,
      rationale,
      blocksDownstream,
    });
  }

  if (hasConflictingDeclarations(profile.samples)) {
    status = "review_required";
    rationale =
      "Conflicting declared_pure cell types across samples; evidence is inconsistent";
    warnings.push(
      buildEpiWarning(
        "CC_CONFLICTING_PURE_TYPES",
        "Conflicting purified cell-type declarations; review required",
        "warning",
      ),
    );
    blocksDownstream = true;
    return CellCompositionConfoundingResultSchema.parse({
      status,
      warnings,
      rationale,
      blocksDownstream,
    });
  }

  // Assess group shifts if available
  const hasShifts = shiftDetected(profile.groupShifts);
  maxFractionDelta = profile.groupShifts.length > 0
    ? getMaxFractionDelta(profile.groupShifts)
    : undefined;

  if (hasShifts && maxFractionDelta !== undefined) {
    if (maxFractionDelta > dominantThreshold + 1e-12) {
      status = "dominant_confounding";
      rationale = `Cell-composition shift of ${maxFractionDelta.toFixed(3)} exceeds dominant threshold ${dominantThreshold}`;
    } else if (maxFractionDelta > likelyThreshold + 1e-12) {
      status = "likely_confounding";
      rationale = `Cell-composition shift of ${maxFractionDelta.toFixed(3)} exceeds likely threshold ${likelyThreshold}`;
    } else if (maxFractionDelta > possibleThreshold + 1e-12) {
      status = "possible_confounding";
      rationale = `Cell-composition shift of ${maxFractionDelta.toFixed(3)} exceeds possible threshold ${possibleThreshold}`;
    } else {
      // This branch should not normally be reached because shiftDetected
      // uses the shiftThreshold (default 0.1), but we keep it for safety.
      status = "unlikely_confounding";
      rationale = `Cell-composition shift of ${maxFractionDelta.toFixed(3)} is below possible threshold ${possibleThreshold}`;
    }
    warnings.push(
      buildEpiWarning(
        "EPIW002_CELL_TYPE_SHIFT_POSSIBLE",
        `Cell-composition shift detected (max delta ${maxFractionDelta.toFixed(3)}); potential confounding across doses`,
        "warning",
      ),
    );
    return CellCompositionConfoundingResultSchema.parse({
      status,
      warnings,
      rationale,
      blocksDownstream,
      maxFractionDelta,
    });
  }

  // No shifts detected; assess based on source reliability
  if (allSamplesPureSameType(profile.samples)) {
    status = "unlikely_confounding";
    rationale =
      "All samples are declared pure with a consistent cell type and no shifts detected";
  } else if (allSamplesReliable(profile.samples) && profile.groupShifts.length > 0) {
    // Reliable sources, design available, no shifts
    status = "unlikely_confounding";
    rationale =
      "All samples have reliable composition sources and no group-level shifts were detected";
  } else if (anySampleMixedUnknown(profile.samples)) {
    status = "possible_confounding";
    rationale =
      "Mixed-population samples with unknown fractions; composition shifts cannot be ruled out";
    warnings.push(
      buildEpiWarning(
        "EPIW002_CELL_TYPE_SHIFT_POSSIBLE",
        "Mixed population with unknown fractions; potential composition drift cannot be ruled out",
        "warning",
      ),
    );
  } else if (
    allSamplesReliable(profile.samples) &&
    profile.groupShifts.length === 0
  ) {
    // Reliable sources but no design provided to assess shifts
    status = "possible_confounding";
    rationale =
      "Reliable composition sources present but no experimental design provided to assess group-level shifts";
    warnings.push(
      buildEpiWarning(
        "EPIW002_CELL_TYPE_SHIFT_POSSIBLE",
        "Composition data available but group shifts cannot be assessed without design",
        "warning",
      ),
    );
  } else {
    // Fallback for any remaining edge cases
    status = "possible_confounding";
    rationale =
      "Cell-composition evidence is incomplete or ambiguous; potential confounding cannot be ruled out";
    warnings.push(
      buildEpiWarning(
        "EPIW002_CELL_TYPE_SHIFT_POSSIBLE",
        "Ambiguous cell-composition evidence; potential confounding cannot be ruled out",
        "warning",
      ),
    );
  }

  return CellCompositionConfoundingResultSchema.parse({
    status,
    warnings,
    rationale,
    blocksDownstream,
    maxFractionDelta,
  });
}
