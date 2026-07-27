import { z } from "zod";
import {
  DesignReadinessStatusSchema,
  DesignReadinessThresholdsSchema,
  ObservedDesignReadinessSchema,
  emitDesignValidationReport,
} from "./design_validation_report.js";

export const DesignValidationResultSchema = z
  .object({
    valid: z
      .boolean()
      .describe("Backward-compatible alias for structurallyValid"),
    schemaValid: z.boolean(),
    structurallyValid: z
      .boolean()
      .describe("True when the design is valid for ingestion"),
    comparisonReady: z
      .boolean()
      .describe("True when a treatment-versus-control comparison is supported"),
    doseResponseReady: z
      .boolean()
      .describe("True when minimum project dose-response thresholds are met"),
    preferredForDoseResponse: z
      .boolean()
      .describe("True when preferred project dose-response thresholds are met"),
    readinessStatus: DesignReadinessStatusSchema,
    observedDesign: ObservedDesignReadinessSchema,
    readinessThresholds: DesignReadinessThresholdsSchema,
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    readinessReasons: z.array(z.string()),
  })
  .strict();

export type DesignValidationResult = z.infer<
  typeof DesignValidationResultSchema
>;

/**
 * Validate an experimental design and report progressively stricter
 * readiness states.
 *
 * Structural validity governs ingestion. Comparison and dose-response
 * readiness are explicit and must not be inferred from the generic `valid`
 * field.
 */
export function validateDesign(design: unknown): DesignValidationResult {
  const report = emitDesignValidationReport(design);
  const readiness = report.downstreamEligibility;

  return DesignValidationResultSchema.parse({
    valid: readiness.structurallyValid,
    schemaValid: report.schemaValid ?? false,
    structurallyValid: readiness.structurallyValid,
    comparisonReady: readiness.eligibleForComparison,
    doseResponseReady: readiness.eligibleForDoseResponse,
    preferredForDoseResponse: readiness.preferredForDoseResponse,
    readinessStatus: readiness.readinessStatus,
    observedDesign: readiness.observed,
    readinessThresholds: readiness.thresholds,
    errors: report.errors,
    warnings: report.warnings,
    readinessReasons: readiness.eligibilityNotes,
  });
}
