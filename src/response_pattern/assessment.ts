import { z } from "zod";
import type { EpigenomicsFeatureResponsePacket } from "../contracts/packets.js";
import { DesignValidationResultSchema, validateDesign } from "../validators/design.js";

export const ObservedResponsePatternSchema = z.enum([
  "flat_within_tolerance",
  "monotonic_nondecreasing",
  "monotonic_nonincreasing",
  "non_monotonic",
]);

export type ObservedResponsePattern = z.infer<
  typeof ObservedResponsePatternSchema
>;

export const ResponseDirectionFromControlSchema = z.enum([
  "increasing",
  "decreasing",
  "mixed",
  "unchanged",
  "not_assessed",
]);

export const ResponsePatternAssessmentBlockerSchema = z.enum([
  "structurally_invalid_design",
  "no_zero_dose_control",
  "negative_dose_value",
  "insufficient_distinct_dose_levels",
  "incomplete_dose_level",
  "non_finite_value",
  "mixed_dose_units",
  "multi_timepoint_design",
]);

export type ResponsePatternAssessmentBlocker = z.infer<
  typeof ResponsePatternAssessmentBlockerSchema
>;

export const NumericDoseSummarySchema = z
  .object({
    doseValue: z.number().finite().describe("Numeric dose level"),
    doseUnits: z
      .array(z.string().min(1))
      .min(1)
      .describe("Dose units declared by groups contributing to this numeric level"),
    timepointHours: z
      .array(z.number().finite())
      .describe("Explicit timepoints declared by contributing dose groups"),
    includesUnspecifiedTimepoint: z
      .boolean()
      .describe("True when at least one contributing group omits a timepoint"),
    doseGroupIds: z
      .array(z.string().min(1))
      .min(1)
      .describe("Dose-group labels collapsed into this numeric dose level"),
    sampleCount: z
      .number()
      .int()
      .nonnegative()
      .describe("Design samples assigned to the numeric dose level"),
    observedCount: z
      .number()
      .int()
      .nonnegative()
      .describe("Finite, non-missing feature values observed at the numeric dose level"),
    missingCount: z
      .number()
      .int()
      .nonnegative()
      .describe("Design samples with missing feature values at the numeric dose level"),
    invalidCount: z
      .number()
      .int()
      .nonnegative()
      .describe("Design samples with non-finite numeric values at the dose level"),
    missingFraction: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .describe("Missing fraction, or null when no samples are assigned"),
    mean: z
      .number()
      .finite()
      .nullable()
      .describe("Arithmetic mean of observed values, or null when none are observed"),
    sampleSd: z
      .number()
      .finite()
      .nonnegative()
      .nullable()
      .describe("Sample standard deviation, or null when fewer than two values are observed"),
    controlDifference: z
      .number()
      .finite()
      .nullable()
      .describe("Mean minus the zero-dose mean, or null when either mean is unavailable"),
  })
  .strict();

export type NumericDoseSummary = z.infer<typeof NumericDoseSummarySchema>;

export const FeatureResponsePatternAssessmentSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    signalMetric: z
      .string()
      .min(1)
      .describe("Signal metric whose numeric scale is used for the assessment"),
    assessmentStatus: z
      .enum(["assessed", "not_assessed"])
      .describe("Whether a complete, context-compatible observed pattern was computed"),
    assessmentBlockers: z
      .array(ResponsePatternAssessmentBlockerSchema)
      .describe("Machine-readable reasons the observed pattern was not assessed"),
    observedPattern: ObservedResponsePatternSchema.nullable().describe(
      "Tolerance-aware mathematical shape of ordered dose-level means; null when not assessed",
    ),
    directionFromControl: ResponseDirectionFromControlSchema.describe(
      "Direction of non-zero-dose means relative to the zero-dose mean",
    ),
    doseSummaries: z
      .array(NumericDoseSummarySchema)
      .min(1)
      .describe("Observed summaries ordered by ascending numeric dose"),
    observedDynamicRange: z
      .number()
      .finite()
      .nonnegative()
      .nullable()
      .describe("Maximum minus minimum among available dose-level means"),
    maximumAbsoluteControlDifference: z
      .number()
      .finite()
      .nonnegative()
      .nullable()
      .describe("Largest absolute difference from the zero-dose mean"),
    reversalCount: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe("Sign changes among non-zero adjacent mean steps; null when not assessed"),
  })
  .strict();

export type FeatureResponsePatternAssessment = z.infer<
  typeof FeatureResponsePatternAssessmentSchema
>;

export const ResponsePatternAssessmentResultSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    schemaName: z.literal("ResponsePatternAssessmentResult"),
    sourcePacketRef: z.string().min(1).describe("Source response packet identifier"),
    datasetId: z.string().min(1).describe("Dataset identifier from packet provenance"),
    designValidation: DesignValidationResultSchema.describe(
      "Canonical design readiness reported independently from observed pattern shape",
    ),
    tolerance: z
      .object({
        absolute: z
          .number()
          .finite()
          .nonnegative()
          .describe("Absolute tolerance on the feature signal-metric scale"),
        source: z
          .enum(["exact_zero", "caller_supplied"])
          .describe("Whether exact comparison or a caller-supplied tolerance was used"),
        scale: z
          .literal("signal_metric_units")
          .describe("Tolerance is applied independently on each feature signal scale"),
        biologicalSignificanceAssessed: z
          .literal(false)
          .describe("A numeric tolerance is not a biological-significance threshold"),
      })
      .strict(),
    totalFeatures: z.number().int().nonnegative().describe("Features in the source packet"),
    offset: z.number().int().nonnegative().describe("Zero-based feature offset returned"),
    count: z.number().int().nonnegative().describe("Feature assessments returned"),
    hasMore: z.boolean().describe("Whether another bounded feature page is available"),
    nextOffset: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe("Offset for the next page, or null at the end"),
    features: z
      .array(FeatureResponsePatternAssessmentSchema)
      .describe("Bounded page of feature-level descriptive assessments"),
    scientificScope: z
      .object({
        interpretationBoundary: z.literal(
          "descriptive_group_mean_pattern_only",
        ),
        trendSignificance: z.literal("not_assessed"),
        biologicalSignificance: z.literal("not_assessed"),
        bmdSuitability: z.literal("not_assessed"),
        monotonicityRequiredForQualification: z.literal(false),
      })
      .strict()
      .describe("Machine-readable limits on interpretation and downstream use"),
  })
  .strict();

export type ResponsePatternAssessmentResult = z.infer<
  typeof ResponsePatternAssessmentResultSchema
>;

export interface AssessResponsePatternsOptions {
  absoluteTolerance?: number;
  offset?: number;
  limit?: number;
}

const AssessResponsePatternsCoreOptionsSchema = z
  .object({
    absoluteTolerance: z.number().finite().nonnegative().default(0),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleSd(values: number[], valueMean: number | null): number | null {
  if (values.length < 2 || valueMean === null) return null;
  const squaredDifferenceSum = values.reduce((sum, value) => {
    const difference = value - valueMean;
    return sum + difference * difference;
  }, 0);
  return Math.sqrt(squaredDifferenceSum / (values.length - 1));
}

function stepSign(difference: number, tolerance: number): -1 | 0 | 1 {
  if (difference > tolerance) return 1;
  if (difference < -tolerance) return -1;
  return 0;
}

function classifyPattern(
  means: number[],
  tolerance: number,
): { pattern: ObservedResponsePattern; reversalCount: number } {
  const signs = means
    .slice(1)
    .map((value, index) => stepSign(value - means[index], tolerance));
  const nonZeroSigns = signs.filter((sign) => sign !== 0);

  if (nonZeroSigns.length === 0) {
    return { pattern: "flat_within_tolerance", reversalCount: 0 };
  }

  let reversalCount = 0;
  for (let index = 1; index < nonZeroSigns.length; index++) {
    if (nonZeroSigns[index] !== nonZeroSigns[index - 1]) reversalCount++;
  }

  if (nonZeroSigns.every((sign) => sign === 1)) {
    return { pattern: "monotonic_nondecreasing", reversalCount };
  }
  if (nonZeroSigns.every((sign) => sign === -1)) {
    return { pattern: "monotonic_nonincreasing", reversalCount };
  }
  return { pattern: "non_monotonic", reversalCount };
}

function directionFromControl(
  doseSummaries: NumericDoseSummary[],
  controlMean: number,
  tolerance: number,
): z.infer<typeof ResponseDirectionFromControlSchema> {
  const nonControlDifferences = doseSummaries
    .filter((summary) => summary.doseValue !== 0)
    .map((summary) => (summary.mean as number) - controlMean);

  if (nonControlDifferences.every((difference) => Math.abs(difference) <= tolerance)) {
    return "unchanged";
  }
  if (
    nonControlDifferences.every((difference) => difference >= -tolerance) &&
    nonControlDifferences.some((difference) => difference > tolerance)
  ) {
    return "increasing";
  }
  if (
    nonControlDifferences.every((difference) => difference <= tolerance) &&
    nonControlDifferences.some((difference) => difference < -tolerance)
  ) {
    return "decreasing";
  }
  return "mixed";
}

function assessFeature(
  packet: EpigenomicsFeatureResponsePacket,
  feature: EpigenomicsFeatureResponsePacket["features"][number],
  absoluteTolerance: number,
  structurallyValidDesign: boolean,
): FeatureResponsePatternAssessment {
  const doseValues = Array.from(
    new Set(packet.design.doseGroups.map((group) => group.doseValue)),
  ).sort((a, b) => a - b);
  const doseSummaries: NumericDoseSummary[] = doseValues.map((doseValue) => {
    const contributingGroups = packet.design.doseGroups.filter(
      (group) => group.doseValue === doseValue,
    );
    const contributingIds = new Set(
      contributingGroups.map((group) => group.doseGroupId),
    );
    const sampleIds = packet.design.samples
      .filter((sample) => contributingIds.has(sample.doseGroupId))
      .map((sample) => sample.sampleId);
    const rawValues = sampleIds.map((sampleId) => feature.values[sampleId]);
    const values = rawValues.filter(
      (value): value is number =>
        value !== null && value !== undefined && Number.isFinite(value),
    );
    const missingCount = rawValues.filter(
      (value) => value === null || value === undefined,
    ).length;
    const invalidCount = rawValues.filter(
      (value) =>
        value !== null && value !== undefined && !Number.isFinite(value),
    ).length;
    const valueMean = mean(values);

    return {
      doseValue,
      doseUnits: Array.from(
        new Set(contributingGroups.map((group) => group.doseUnit)),
      ).sort(),
      timepointHours: Array.from(
        new Set(
          contributingGroups
            .map((group) => group.timepointHours)
            .filter((timepoint): timepoint is number => timepoint !== undefined),
        ),
      ).sort((a, b) => a - b),
      includesUnspecifiedTimepoint: contributingGroups.some(
        (group) => group.timepointHours === undefined,
      ),
      doseGroupIds: contributingGroups
        .map((group) => group.doseGroupId)
        .sort(),
      sampleCount: sampleIds.length,
      observedCount: values.length,
      missingCount,
      invalidCount,
      missingFraction:
        sampleIds.length === 0
          ? null
          : missingCount / sampleIds.length,
      mean: valueMean,
      sampleSd: sampleSd(values, valueMean),
      controlDifference: null,
    };
  });

  const control = doseSummaries.find((summary) => summary.doseValue === 0);
  const controlMean = control?.mean ?? null;
  for (const summary of doseSummaries) {
    summary.controlDifference =
      controlMean === null || summary.mean === null
        ? null
        : summary.mean - controlMean;
  }

  const blockers: ResponsePatternAssessmentBlocker[] = [];
  if (!structurallyValidDesign) {
    blockers.push("structurally_invalid_design");
  }
  if (!control) blockers.push("no_zero_dose_control");
  if (doseSummaries.some((summary) => summary.doseValue < 0)) {
    blockers.push("negative_dose_value");
  }
  if (doseSummaries.length < 3) {
    blockers.push("insufficient_distinct_dose_levels");
  }
  if (doseSummaries.some((summary) => summary.mean === null)) {
    blockers.push("incomplete_dose_level");
  }
  if (doseSummaries.some((summary) => summary.invalidCount > 0)) {
    blockers.push("non_finite_value");
  }

  const doseUnits = new Set(
    packet.design.doseGroups.map((group) => group.doseUnit),
  );
  if (doseUnits.size > 1) blockers.push("mixed_dose_units");

  const timepointKeys = new Set(
    packet.design.doseGroups.map((group) =>
      group.timepointHours === undefined
        ? "unspecified"
        : String(group.timepointHours),
    ),
  );
  if (timepointKeys.size > 1) blockers.push("multi_timepoint_design");

  const availableMeans = doseSummaries
    .map((summary) => summary.mean)
    .filter((value): value is number => value !== null);
  const observedDynamicRange =
    availableMeans.length === 0
      ? null
      : Math.max(...availableMeans) - Math.min(...availableMeans);
  const maximumAbsoluteControlDifference =
    controlMean === null
      ? null
      : Math.max(
          ...doseSummaries
            .filter((summary) => summary.controlDifference !== null)
            .map((summary) => Math.abs(summary.controlDifference as number)),
        );

  if (blockers.length > 0 || controlMean === null) {
    return FeatureResponsePatternAssessmentSchema.parse({
      featureId: feature.featureId,
      signalMetric: feature.signalMetric,
      assessmentStatus: "not_assessed",
      assessmentBlockers: blockers,
      observedPattern: null,
      directionFromControl: "not_assessed",
      doseSummaries,
      observedDynamicRange,
      maximumAbsoluteControlDifference,
      reversalCount: null,
    });
  }

  const completeMeans = doseSummaries.map((summary) => summary.mean as number);
  const classification = classifyPattern(completeMeans, absoluteTolerance);

  return FeatureResponsePatternAssessmentSchema.parse({
    featureId: feature.featureId,
    signalMetric: feature.signalMetric,
    assessmentStatus: "assessed",
    assessmentBlockers: [],
    observedPattern: classification.pattern,
    directionFromControl: directionFromControl(
      doseSummaries,
      controlMean,
      absoluteTolerance,
    ),
    doseSummaries,
    observedDynamicRange,
    maximumAbsoluteControlDifference,
    reversalCount: classification.reversalCount,
  });
}

/**
 * Classify the observed shape of dose-level means without fitting a model.
 *
 * The assessment is descriptive only. It does not test a statistical trend,
 * choose a biological-significance threshold, establish BMD suitability, or
 * alter feature qualification.
 */
export function assessResponsePatterns(
  packet: EpigenomicsFeatureResponsePacket,
  options: AssessResponsePatternsOptions = {},
): ResponsePatternAssessmentResult {
  const parsedOptions = AssessResponsePatternsCoreOptionsSchema.parse(options);
  const absoluteTolerance = parsedOptions.absoluteTolerance;
  const offset = parsedOptions.offset;
  const limit = parsedOptions.limit;
  const designValidation = validateDesign(packet.design);
  const features = packet.features
    .slice(offset, offset + limit)
    .map((feature) =>
      assessFeature(
        packet,
        feature,
        absoluteTolerance,
        designValidation.structurallyValid,
      ),
    );
  const nextOffset =
    offset + features.length < packet.features.length
      ? offset + features.length
      : null;

  return ResponsePatternAssessmentResultSchema.parse({
    schemaVersion: "0.1.0",
    schemaName: "ResponsePatternAssessmentResult",
    sourcePacketRef: packet.packetId,
    datasetId: packet.provenance.datasetId,
    designValidation,
    tolerance: {
      absolute: absoluteTolerance,
      source: absoluteTolerance === 0 ? "exact_zero" : "caller_supplied",
      scale: "signal_metric_units",
      biologicalSignificanceAssessed: false,
    },
    totalFeatures: packet.features.length,
    offset,
    count: features.length,
    hasMore: nextOffset !== null,
    nextOffset,
    features,
    scientificScope: {
      interpretationBoundary: "descriptive_group_mean_pattern_only",
      trendSignificance: "not_assessed",
      biologicalSignificance: "not_assessed",
      bmdSuitability: "not_assessed",
      monotonicityRequiredForQualification: false,
    },
  });
}
