import { z } from "zod";
import type { ExperimentalDesign } from "../contracts/design.js";
import { QualificationWarningSchema } from "../contracts/qualification.js";
import type { QualificationWarning } from "../contracts/qualification.js";

// ─────────────────────────────────────────────────────────────────────────────
// Cytotoxicity confounding classification (v0.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic cytotoxicity/stress confounding status.
 *
 * Ordered from least to most severe:
 * no_context_available < unlikely_confounding < possible_confounding
 * < likely_confounding < dominant_confounding < review_required
 */
export const CytotoxicityConfoundingStatusSchema = z.enum([
  "no_context_available",
  "unlikely_confounding",
  "possible_confounding",
  "likely_confounding",
  "dominant_confounding",
  "review_required",
]);

export type CytotoxicityConfoundingStatus = z.infer<
  typeof CytotoxicityConfoundingStatusSchema
>;

/**
 * Result of cytotoxicity confounding classification.
 */
export const CytotoxicityConfoundingResultSchema = z
  .object({
    status: CytotoxicityConfoundingStatusSchema,
    warnings: z.array(QualificationWarningSchema),
    rationale: z.string().min(1),
    blocksDownstream: z.boolean(),
    minViability: z.number().optional(),
    maxStressFlagCount: z.number().optional(),
  })
  .strict();

export type CytotoxicityConfoundingResult = z.infer<
  typeof CytotoxicityConfoundingResultSchema
>;

/**
 * Options for cytotoxicity confounding classification.
 */
export interface CytotoxicityClassificationOptions {
  /** Viability threshold for cytotoxicity detection (default 0.8). */
  viabilityThreshold?: number;
  /** Threshold below which confounding is considered possible (default 0.7). */
  possibleThreshold?: number;
  /** Threshold below which confounding is considered likely (default 0.5). */
  likelyThreshold?: number;
  /** Threshold below which confounding is considered dominant (default 0.5). */
  dominantThreshold?: number;
}

/**
 * Type of cytotoxicity or companion assay measurement.
 */
export const CytotoxicityAssayTypeSchema = z.enum([
  "viability",
  "stress",
  "morphology",
  "apoptosis_necrosis",
  "companion_assay",
]);

export type CytotoxicityAssayType = z.infer<typeof CytotoxicityAssayTypeSchema>;

/**
 * Source of cytotoxicity evidence.
 */
export const CytotoxicityEvidenceSourceSchema = z.enum([
  "measured_concurrent",
  "measured_separate_experiment",
  "literature",
  "declared",
  "not_available",
]);

export type CytotoxicityEvidenceSource = z.infer<
  typeof CytotoxicityEvidenceSourceSchema
>;

/**
 * A single cytotoxicity-related measurement.
 */
export const CytotoxicityMeasurementSchema = z
  .object({
    sampleId: z.string().min(1).optional(),
    doseGroupId: z.string().min(1).optional(),
    doseValue: z.number().finite().optional(),
    timepointHours: z.number().finite().optional(),
    value: z.number().finite(),
    unit: z.string().min(1),
    metric: z.string().min(1),
  })
  .strict()
  .refine(
    (m) =>
      m.sampleId !== undefined ||
      m.doseGroupId !== undefined ||
      m.doseValue !== undefined,
    {
      message:
        "Measurement must have at least one of sampleId, doseGroupId, or doseValue",
    },
  );

export type CytotoxicityMeasurement = z.infer<
  typeof CytotoxicityMeasurementSchema
>;

/**
 * Cytotoxicity context entry for a single assay or measurement set.
 */
export const CytotoxicityContextEntrySchema = z
  .object({
    assayType: CytotoxicityAssayTypeSchema,
    evidenceSource: CytotoxicityEvidenceSourceSchema,
    measurements: z.array(CytotoxicityMeasurementSchema),
    stressFlags: z.array(z.string().min(1)).optional(),
    notes: z.string().optional(),
  })
  .strict();

export type CytotoxicityContextEntry = z.infer<
  typeof CytotoxicityContextEntrySchema
>;

/**
 * Comprehensive cytotoxicity profile for a dataset.
 */
export const CytotoxicityProfileSchema = z
  .object({
    datasetId: z.string().min(1),
    entries: z.array(CytotoxicityContextEntrySchema),
    timepointAligned: z.boolean(),
    doseAligned: z.boolean(),
    hasCytotoxicityData: z.boolean(),
    cytotoxicityDetected: z.boolean(),
    warnings: z.array(QualificationWarningSchema),
  })
  .strict();

export type CytotoxicityProfile = z.infer<typeof CytotoxicityProfileSchema>;

/**
 * Options for cytotoxicity context ingestion.
 */
export interface CytotoxicityOptions {
  /** Viability threshold below which cytotoxicity is flagged (default 0.8 = 80%). */
  viabilityThreshold?: number;
  /** Require at least one measurement per entry (default true). */
  requireMeasurements?: boolean;
}

const DEFAULT_VIABILITY_THRESHOLD = 0.8;
const EPS = 1e-12;

function buildWarning(
  warningCode: string,
  message: string,
  severity: "info" | "warning" | "error",
  category: "cytotoxicity" | "stress_response" = "cytotoxicity",
): QualificationWarning {
  return {
    warningCode,
    severity,
    message,
    category,
    blocksDownstream: severity === "error",
  };
}

function isValidNumber(n: number | undefined): boolean {
  return n !== undefined && Number.isFinite(n) && !Number.isNaN(n);
}

function hasNegativeOrInvalidMeasurement(measurements: CytotoxicityMeasurement[]): boolean {
  for (const m of measurements) {
    if (Number.isNaN(m.value)) return true;
    // Fractional viability/stress metrics should not be negative
    if (m.value < 0) return true;
  }
  return false;
}

function checkTimepointAlignment(
  entries: CytotoxicityContextEntry[],
  design: ExperimentalDesign,
): boolean {
  const designTimepoints = new Set<number>();
  for (const dg of design.doseGroups) {
    if (isValidNumber(dg.timepointHours)) {
      designTimepoints.add(dg.timepointHours as number);
    }
  }

  // If design has no timepoints, skip alignment check
  if (designTimepoints.size === 0) return true;

  for (const entry of entries) {
    for (const m of entry.measurements) {
      if (isValidNumber(m.timepointHours)) {
        const tp = m.timepointHours as number;
        let found = false;
        for (const dtp of designTimepoints) {
          if (Math.abs(tp - dtp) < EPS) {
            found = true;
            break;
          }
        }
        if (!found) return false;
      }
    }
  }

  return true;
}

function checkDoseAlignment(
  entries: CytotoxicityContextEntry[],
  design: ExperimentalDesign,
): boolean {
  const designDoseValues = new Set(design.doseGroups.map((g) => g.doseValue));
  const designDoseGroupIds = new Set(design.doseGroups.map((g) => g.doseGroupId));

  for (const entry of entries) {
    for (const m of entry.measurements) {
      let aligned = false;

      if (m.doseValue !== undefined && isValidNumber(m.doseValue)) {
        for (const dv of designDoseValues) {
          if (Math.abs(m.doseValue - dv) < EPS) {
            aligned = true;
            break;
          }
        }
      }

      if (!aligned && m.doseGroupId !== undefined) {
        if (designDoseGroupIds.has(m.doseGroupId)) {
          aligned = true;
        }
      }

      if (!aligned) {
        return false;
      }
    }
  }

  return true;
}

function detectCytotoxicity(
  entries: CytotoxicityContextEntry[],
  viabilityThreshold: number,
): boolean {
  for (const entry of entries) {
    // Stress flags are direct indicators
    if (entry.stressFlags && entry.stressFlags.length > 0) {
      return true;
    }

    // Check viability measurements
    if (entry.assayType === "viability") {
      for (const m of entry.measurements) {
        if (
          isValidNumber(m.value) &&
          m.value < viabilityThreshold - EPS
        ) {
          return true;
        }
      }
    }

    // Declared significant cytotoxicity
    if (
      entry.evidenceSource === "declared" &&
      entry.notes &&
      entry.notes.toLowerCase().includes("cytotoxic")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Ingest and validate cytotoxicity context for a dataset.
 *
 * Parses assay_type, measured values, timepoint alignment, dose alignment,
 * stress flags, notes, and evidence source.  Does NOT infer cytotoxicity
 * from epigenomic feature values alone.
 *
 * Fail-closed behaviour:
 * - Negative or NaN measurement values emit an error-level warning.
 * - Missing cytotoxicity context emits a warning.
 * - Timepoint or dose misalignment emits a warning.
 * - Detected cytotoxicity emits a warning (info-level, advisory).
 */
export function ingestCytotoxicity(
  datasetId: string,
  entriesInput: CytotoxicityContextEntry[],
  design?: ExperimentalDesign,
  options: CytotoxicityOptions = {},
): CytotoxicityProfile {
  const viabilityThreshold =
    options.viabilityThreshold ?? DEFAULT_VIABILITY_THRESHOLD;
  const requireMeasurements =
    options.requireMeasurements ?? true;

  const warnings: QualificationWarning[] = [];
  const entries: CytotoxicityContextEntry[] = [];

  let hasMalformedValues = false;

  // Parse and validate entries
  for (const raw of entriesInput) {
    const parsed = CytotoxicityContextEntrySchema.parse(raw);

    if (requireMeasurements && parsed.measurements.length === 0) {
      warnings.push(
        buildWarning(
          "CTX_EMPTY_MEASUREMENTS",
          `Entry for assayType ${parsed.assayType} has no measurements`,
          "warning",
        ),
      );
    }

    if (hasNegativeOrInvalidMeasurement(parsed.measurements)) {
      hasMalformedValues = true;
      warnings.push(
        buildWarning(
          "CTX_MALFORMED_VALUE",
          `Negative or NaN measurement value found in assayType ${parsed.assayType}`,
          "error",
        ),
      );
    }

    entries.push(parsed);
  }

  // Missing context warning
  if (entries.length === 0) {
    warnings.push(
      buildWarning(
        "CTX_MISSING_CONTEXT",
        "No cytotoxicity context provided for dataset",
        "warning",
      ),
    );
  }

  // Alignment checks
  let timepointAligned = true;
  let doseAligned = true;

  if (design !== undefined && entries.length > 0) {
    timepointAligned = checkTimepointAlignment(entries, design);
    doseAligned = checkDoseAlignment(entries, design);

    if (!timepointAligned) {
      warnings.push(
        buildWarning(
          "CTX_TIMEPOINT_MISMATCH",
          "Cytotoxicity measurement timepoints do not align with experimental design",
          "warning",
        ),
      );
    }

    if (!doseAligned) {
      warnings.push(
        buildWarning(
          "CTX_DOSE_MISMATCH",
          "Cytotoxicity measurement doses do not align with experimental design",
          "warning",
        ),
      );
    }
  }

  const hasCytotoxicityData = entries.length > 0;
  const cytotoxicityDetected =
    !hasMalformedValues && detectCytotoxicity(entries, viabilityThreshold);

  if (cytotoxicityDetected) {
    warnings.push(
      buildWarning(
        "CTX_CYTOTOXICITY_DETECTED",
        "Cytotoxicity detected in companion/viability measurements",
        "info",
      ),
    );
  }

  // Warn on stress flags explicitly
  for (const entry of entries) {
    if (entry.stressFlags && entry.stressFlags.length > 0) {
      warnings.push(
        buildWarning(
          "CTX_STRESS_FLAG",
          `Stress flags present in ${entry.assayType}: ${entry.stressFlags.join(", ")}`,
          "warning",
          "stress_response",
        ),
      );
    }
  }

  return CytotoxicityProfileSchema.parse({
    datasetId,
    entries,
    timepointAligned,
    doseAligned,
    hasCytotoxicityData,
    cytotoxicityDetected,
    warnings,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cytotoxicity confounding classification
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_POSSIBLE_THRESHOLD = 0.8;
const DEFAULT_LIKELY_THRESHOLD = 0.7;
const DEFAULT_DOMINANT_THRESHOLD = 0.5;
const APOPTOSIS_ELEVATION_THRESHOLD = 0.2;

function buildEpiWarning(
  warningCode: string,
  message: string,
  severity: "info" | "warning" | "error",
  category: QualificationWarning["category"] = "cytotoxicity",
): QualificationWarning {
  return {
    warningCode,
    severity,
    message,
    category,
    blocksDownstream: severity === "error",
  };
}

function getMinViability(entries: CytotoxicityContextEntry[]): number | undefined {
  let min: number | undefined;
  for (const entry of entries) {
    if (entry.assayType === "viability") {
      for (const m of entry.measurements) {
        if (isValidNumber(m.value) && m.value >= 0) {
          if (min === undefined || m.value < min) {
            min = m.value;
          }
        }
      }
    }
  }
  return min;
}

function hasStressFlags(entries: CytotoxicityContextEntry[]): boolean {
  return entries.some((e) => e.stressFlags !== undefined && e.stressFlags.length > 0);
}

function countMaxStressFlags(entries: CytotoxicityContextEntry[]): number {
  let max = 0;
  for (const entry of entries) {
    if (entry.stressFlags && entry.stressFlags.length > max) {
      max = entry.stressFlags.length;
    }
  }
  return max;
}

function hasDeclaredCytotoxicity(entries: CytotoxicityContextEntry[]): boolean {
  for (const entry of entries) {
    if (
      entry.evidenceSource === "declared" &&
      entry.notes &&
      entry.notes.toLowerCase().includes("cytotoxic")
    ) {
      return true;
    }
  }
  return false;
}

function hasApoptosisNecrosisElevation(entries: CytotoxicityContextEntry[]): boolean {
  for (const entry of entries) {
    if (entry.assayType === "apoptosis_necrosis") {
      for (const m of entry.measurements) {
        if (isValidNumber(m.value) && m.value > APOPTOSIS_ELEVATION_THRESHOLD) {
          return true;
        }
      }
    }
  }
  return false;
}

function hasMalformedValues(profile: CytotoxicityProfile): boolean {
  return profile.warnings.some((w) => w.warningCode === "CTX_MALFORMED_VALUE");
}

/**
 * Classify cytotoxicity/stress confounding status from an ingestion profile.
 *
 * Deterministic rules:
 * - no_context_available: no cytotoxicity data at all.
 * - review_required: malformed measurement values prevent assessment.
 * - unlikely_confounding: all viability >= threshold, no stress flags,
 *   no declared cytotoxicity, no elevated apoptosis/necrosis.
 * - possible_confounding: minor viability drop, stress flags present without
 *   severe viability drop, or elevated apoptosis/necrosis.
 * - likely_confounding: moderate viability drop, or declared cytotoxicity.
 * - dominant_confounding: severe viability drop (< dominantThreshold),
 *   or stress flags combined with significant viability reduction.
 *
 * Warnings:
 * - EPIW003_CYTOXICITY_CONFOUNDING when cytotoxicity confounding is
 *   possible, likely, or dominant.
 * - EPIW004_STRESS_CONFOUNDING when stress flags contribute to confounding.
 *
 * Fail-closed: dominant_confounding sets blocksDownstream=true.
 * Ambiguous evidence defaults to a more severe status.
 */
export function classifyCytotoxicityConfounding(
  profile: CytotoxicityProfile,
  options: CytotoxicityClassificationOptions = {},
): CytotoxicityConfoundingResult {
  const possibleThreshold = options.possibleThreshold ?? DEFAULT_POSSIBLE_THRESHOLD;
  const likelyThreshold = options.likelyThreshold ?? DEFAULT_LIKELY_THRESHOLD;
  const dominantThreshold = options.dominantThreshold ?? DEFAULT_DOMINANT_THRESHOLD;

  const warnings: QualificationWarning[] = [];
  let status: CytotoxicityConfoundingStatus;
  let rationale: string;
  let blocksDownstream = false;

  // Rule: malformed values → review_required (fail-closed)
  if (hasMalformedValues(profile)) {
    status = "review_required";
    rationale =
      "Malformed cytotoxicity measurement values prevent reliable confounding assessment";
    warnings.push(
      buildEpiWarning(
        "CTX_MALFORMED_VALUE",
        "Cytotoxicity measurements contain malformed values; review required",
        "error",
      ),
    );
    blocksDownstream = true;
    return CytotoxicityConfoundingResultSchema.parse({
      status,
      warnings,
      rationale,
      blocksDownstream,
    });
  }

  // Rule: no context available
  if (!profile.hasCytotoxicityData) {
    status = "no_context_available";
    rationale = "No cytotoxicity context is available for this dataset";
    return CytotoxicityConfoundingResultSchema.parse({
      status,
      warnings,
      rationale,
      blocksDownstream,
    });
  }

  // Assess measurements
  const minViability = getMinViability(profile.entries);
  const hasStress = hasStressFlags(profile.entries);
  const declaredCytotoxic = hasDeclaredCytotoxicity(profile.entries);
  const apoptosisElevated = hasApoptosisNecrosisElevation(profile.entries);
  const maxStressFlags = countMaxStressFlags(profile.entries);

  // Base classification from viability measurements
  if (minViability === undefined) {
    status = "unlikely_confounding";
  } else if (minViability < dominantThreshold - EPS) {
    status = "dominant_confounding";
  } else if (minViability < likelyThreshold - EPS) {
    status = "likely_confounding";
  } else if (minViability < possibleThreshold - EPS) {
    status = "possible_confounding";
  } else {
    status = "unlikely_confounding";
  }

  // Elevation: declared cytotoxicity raises floor to likely
  if (declaredCytotoxic) {
    if (
      status === "unlikely_confounding" ||
      status === "possible_confounding"
    ) {
      status = "likely_confounding";
    }
  }

  // Elevation: elevated apoptosis/necrosis raises floor to possible
  if (apoptosisElevated) {
    if (status === "unlikely_confounding") {
      status = "possible_confounding";
    }
  }

  // Elevation: stress flags raise by one level
  if (hasStress) {
    if (status === "unlikely_confounding") {
      status = "possible_confounding";
    } else if (status === "possible_confounding") {
      status = "likely_confounding";
    } else if (status === "likely_confounding") {
      status = "dominant_confounding";
    }
  }

  // Build rationale and warnings based on final status
  if (status === "dominant_confounding") {
    blocksDownstream = true;
    rationale = buildDominantRationale(
      minViability,
      hasStress,
      declaredCytotoxic,
      maxStressFlags,
    );
    warnings.push(
      buildEpiWarning(
        "EPIW003_CYTOXICITY_CONFOUNDING",
        `Cytotoxicity confounding at dominant level; downstream use blocked`,
        "error",
      ),
    );
    if (hasStress) {
      warnings.push(
        buildEpiWarning(
          "EPIW004_STRESS_CONFOUNDING",
          `Stress-response confounding detected with ${maxStressFlags} stress flag(s)`,
          "warning",
          "stress_response",
        ),
      );
    }
  } else if (status === "likely_confounding") {
    rationale = buildLikelyRationale(
      minViability,
      hasStress,
      declaredCytotoxic,
      apoptosisElevated,
    );
    warnings.push(
      buildEpiWarning(
        "EPIW003_CYTOXICITY_CONFOUNDING",
        `Cytotoxicity confounding at likely level`,
        "warning",
      ),
    );
    if (hasStress) {
      warnings.push(
        buildEpiWarning(
          "EPIW004_STRESS_CONFOUNDING",
          `Stress-response confounding detected with ${maxStressFlags} stress flag(s)`,
          "warning",
          "stress_response",
        ),
      );
    }
  } else if (status === "possible_confounding") {
    rationale = buildPossibleRationale(
      minViability,
      hasStress,
      declaredCytotoxic,
      apoptosisElevated,
    );
    warnings.push(
      buildEpiWarning(
        "EPIW003_CYTOXICITY_CONFOUNDING",
        `Cytotoxicity confounding at possible level`,
        "warning",
      ),
    );
    if (hasStress) {
      warnings.push(
        buildEpiWarning(
          "EPIW004_STRESS_CONFOUNDING",
          `Stress-response confounding detected with ${maxStressFlags} stress flag(s)`,
          "warning",
          "stress_response",
        ),
      );
    }
  } else {
    // unlikely_confounding
    rationale = buildUnlikelyRationale(minViability, hasStress);
  }

  return CytotoxicityConfoundingResultSchema.parse({
    status,
    warnings,
    rationale,
    blocksDownstream,
    minViability: minViability ?? undefined,
    maxStressFlagCount: hasStress ? maxStressFlags : undefined,
  });
}

function buildDominantRationale(
  minViability: number | undefined,
  hasStress: boolean,
  declaredCytotoxic: boolean,
  maxStressFlags: number,
): string {
  const parts: string[] = [];
  if (minViability !== undefined) {
    parts.push(`minimum viability ${minViability.toFixed(2)} indicates severe cytotoxic injury`);
  }
  if (declaredCytotoxic) {
    parts.push("declared cytotoxicity present");
  }
  if (hasStress) {
    parts.push(`${maxStressFlags} stress flag(s) present`);
  }
  if (parts.length === 0) {
    return "Dominant cytotoxicity confounding detected from companion assays";
  }
  return `Dominant cytotoxicity confounding: ${parts.join("; ")}`;
}

function buildLikelyRationale(
  minViability: number | undefined,
  hasStress: boolean,
  declaredCytotoxic: boolean,
  apoptosisElevated: boolean,
): string {
  const parts: string[] = [];
  if (minViability !== undefined) {
    parts.push(`minimum viability ${minViability.toFixed(2)} indicates moderate cytotoxic injury`);
  }
  if (declaredCytotoxic) {
    parts.push("declared cytotoxicity present");
  }
  if (apoptosisElevated) {
    parts.push("elevated apoptosis/necrosis detected");
  }
  if (hasStress) {
    parts.push("stress flags present");
  }
  if (parts.length === 0) {
    return "Likely cytotoxicity confounding detected from companion assays";
  }
  return `Likely cytotoxicity confounding: ${parts.join("; ")}`;
}

function buildPossibleRationale(
  minViability: number | undefined,
  hasStress: boolean,
  declaredCytotoxic: boolean,
  apoptosisElevated: boolean,
): string {
  const parts: string[] = [];
  if (minViability !== undefined) {
    parts.push(`minimum viability ${minViability.toFixed(2)} is slightly reduced`);
  }
  if (declaredCytotoxic) {
    parts.push("declared cytotoxicity present");
  }
  if (apoptosisElevated) {
    parts.push("elevated apoptosis/necrosis detected");
  }
  if (hasStress) {
    parts.push("stress flags present");
  }
  if (parts.length === 0) {
    return "Possible cytotoxicity confounding detected from companion assays";
  }
  return `Possible cytotoxicity confounding: ${parts.join("; ")}`;
}

function buildUnlikelyRationale(
  minViability: number | undefined,
  hasStress: boolean,
): string {
  if (minViability !== undefined) {
    return `All viability measurements >= ${minViability.toFixed(2)}; cytotoxicity confounding unlikely`;
  }
  if (hasStress) {
    return "Stress flags present but viability is normal; cytotoxicity confounding unlikely";
  }
  return "No cytotoxicity indicators detected; confounding unlikely";
}
