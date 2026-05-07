import { z } from "zod";
import type { EpigenomicFeatureMatrix } from "../contracts/features.js";
import type { ExperimentalDesign, SampleMetadata } from "../contracts/design.js";

/**
 * Scope of a sample-coverage discrepancy.
 *
 * - column: wide-form sample column that lacks design metadata.
 * - row: long-form sample_id entry that lacks design metadata.
 * - dataset: structural issue that affects the whole matrix/design pairing.
 */
export const CoverageDiscrepancyScopeSchema = z.enum([
  "column",
  "row",
  "dataset",
]);

export type CoverageDiscrepancyScope = z.infer<
  typeof CoverageDiscrepancyScopeSchema
>;

/**
 * Direction of a coverage mismatch.
 *
 * - matrix_to_design: a sample present in the matrix is absent from design.
 * - design_to_matrix: a sample present in design is absent from matrix.
 */
export const CoverageMismatchDirectionSchema = z.enum([
  "matrix_to_design",
  "design_to_matrix",
]);

export type CoverageMismatchDirection = z.infer<
  typeof CoverageMismatchDirectionSchema
>;

/**
 * Structured discrepancy for a single sample-coverage issue.
 */
export const SampleCoverageDiscrepancySchema = z
  .object({
    scope: CoverageDiscrepancyScopeSchema,
    direction: CoverageMismatchDirectionSchema,
    sampleId: z.string().min(1).describe("Affected sample identifier"),
    featureId: z
      .string()
      .optional()
      .describe("Affected feature identifier (row-scoped only)"),
    message: z.string().min(1),
    errorCode: z.string().min(1),
  })
  .strict();

export type SampleCoverageDiscrepancy = z.infer<
  typeof SampleCoverageDiscrepancySchema
>;

/**
 * Per-sample coverage detail.
 */
export const SampleCoverageDetailSchema = z
  .object({
    sampleId: z.string().min(1),
    presentInDesign: z.boolean(),
    presentInMatrix: z.boolean(),
    doseGroupId: z.string().optional(),
    hasGroupAssignment: z.boolean(),
  })
  .strict();

export type SampleCoverageDetail = z.infer<typeof SampleCoverageDetailSchema>;

/**
 * Overall sample-coverage validation result.
 */
export const SampleCoverageValidationResultSchema = z
  .object({
    valid: z.boolean(),
    coverageComplete: z.boolean(),
    designSamples: z.number().int().nonnegative(),
    matrixSamples: z.number().int().nonnegative(),
    matchedSamples: z.number().int().nonnegative(),
    unmatchedMatrixSamples: z.array(z.string().min(1)),
    unmatchedDesignSamples: z.array(z.string().min(1)),
    samplesMissingGroup: z.array(z.string().min(1)),
    duplicateDesignSamples: z.array(z.string().min(1)),
    duplicateMatrixSamples: z.array(z.string().min(1)),
    samples: z.array(SampleCoverageDetailSchema),
    discrepancies: z.array(SampleCoverageDiscrepancySchema),
    blocksDownstream: z.boolean(),
  })
  .strict();

export type SampleCoverageValidationResult = z.infer<
  typeof SampleCoverageValidationResultSchema
>;

const ERROR_CODES = {
  UNMATCHED_MATRIX_SAMPLE: "EPIC001_UNMATCHED_MATRIX_SAMPLE",
  UNMATCHED_DESIGN_SAMPLE: "EPIC002_UNMATCHED_DESIGN_SAMPLE",
  MISSING_GROUP_ASSIGNMENT: "EPIC003_MISSING_GROUP_ASSIGNMENT",
  DUPLICATE_DESIGN_SAMPLE: "EPIC004_DUPLICATE_DESIGN_SAMPLE",
  DUPLICATE_MATRIX_SAMPLE: "EPIC005_DUPLICATE_MATRIX_SAMPLE",
} as const;

/**
 * Extract sample IDs from a feature matrix.
 *
 * For wide-form: uses matrix.sampleIds directly.
 * For long-form: derives from matrix.sampleIds (already collected during
 * canonicalization) or falls back to longValues sampleIds.
 */
function extractMatrixSampleIds(matrix: EpigenomicFeatureMatrix): string[] {
  // sampleIds is the canonical ordered list; use it directly.
  return matrix.sampleIds;
}

/**
 * Validate sample coverage between a feature matrix and an experimental design.
 *
 * Rules (fail-closed):
 * - Every sample present in the matrix must resolve to a design metadata entry.
 * - Every design sample must be represented in the matrix (bidirectional where required).
 * - Every design sample must have a doseGroupId assignment.
 * - Duplicate sample IDs in either design or matrix are flagged as errors.
 * - Discrepancies are emitted with row/column/dataset scope for downstream tracing.
 *
 * @param matrix Canonical epigenomic feature matrix
 * @param design Experimental design with sample metadata
 * @returns Structured coverage validation result
 */
export function validateSampleCoverage(
  matrix: EpigenomicFeatureMatrix,
  design: ExperimentalDesign,
): SampleCoverageValidationResult {
  const discrepancies: SampleCoverageDiscrepancy[] = [];

  const matrixSampleIds = extractMatrixSampleIds(matrix);
  const designSamples = design.samples;

  // --- Duplicate detection ---
  const designIdCounts = new Map<string, number>();
  for (const s of designSamples) {
    designIdCounts.set(s.sampleId, (designIdCounts.get(s.sampleId) ?? 0) + 1);
  }
  const duplicateDesignSamples = Array.from(designIdCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b));

  for (const dupId of duplicateDesignSamples) {
    discrepancies.push({
      scope: "dataset",
      direction: "design_to_matrix",
      sampleId: dupId,
      message: `Duplicate sample ID '${dupId}' detected in design (${designIdCounts.get(dupId)} occurrences)`,
      errorCode: ERROR_CODES.DUPLICATE_DESIGN_SAMPLE,
    });
  }

  const matrixIdCounts = new Map<string, number>();
  for (const id of matrixSampleIds) {
    matrixIdCounts.set(id, (matrixIdCounts.get(id) ?? 0) + 1);
  }
  const duplicateMatrixSamples = Array.from(matrixIdCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b));

  for (const dupId of duplicateMatrixSamples) {
    discrepancies.push({
      scope: "dataset",
      direction: "matrix_to_design",
      sampleId: dupId,
      message: `Duplicate sample ID '${dupId}' detected in matrix (${matrixIdCounts.get(dupId)} occurrences)`,
      errorCode: ERROR_CODES.DUPLICATE_MATRIX_SAMPLE,
    });
  }

  // --- Build lookup maps ---
  const designSampleMap = new Map<string, SampleMetadata>();
  for (const s of designSamples) {
    // In case of duplicates, first occurrence wins for lookup
    if (!designSampleMap.has(s.sampleId)) {
      designSampleMap.set(s.sampleId, s);
    }
  }

  const matrixSampleSet = new Set(matrixSampleIds);

  // --- Bidirectional coverage checks ---
  const unmatchedMatrixSamples: string[] = [];
  const unmatchedDesignSamples: string[] = [];
  const samplesMissingGroup: string[] = [];

  // Matrix → Design
  for (const sampleId of matrixSampleIds) {
    if (!designSampleMap.has(sampleId)) {
      unmatchedMatrixSamples.push(sampleId);
      // Determine scope based on matrix format
      const scope: CoverageDiscrepancyScope =
        matrix.wideValues !== undefined ? "column" : "row";
      discrepancies.push({
        scope,
        direction: "matrix_to_design",
        sampleId,
        message: `Matrix sample '${sampleId}' is not present in design metadata`,
        errorCode: ERROR_CODES.UNMATCHED_MATRIX_SAMPLE,
      });
    }
  }

  // Design → Matrix
  for (const sample of designSamples) {
    if (!matrixSampleSet.has(sample.sampleId)) {
      // Only record once per sampleId (duplicates already flagged)
      if (!unmatchedDesignSamples.includes(sample.sampleId)) {
        unmatchedDesignSamples.push(sample.sampleId);
        discrepancies.push({
          scope: "dataset",
          direction: "design_to_matrix",
          sampleId: sample.sampleId,
          message: `Design sample '${sample.sampleId}' is not present in feature matrix`,
          errorCode: ERROR_CODES.UNMATCHED_DESIGN_SAMPLE,
        });
      }
    }

    // Group assignment check
    if (
      sample.doseGroupId === undefined ||
      sample.doseGroupId === null ||
      sample.doseGroupId.trim() === ""
    ) {
      if (!samplesMissingGroup.includes(sample.sampleId)) {
        samplesMissingGroup.push(sample.sampleId);
        discrepancies.push({
          scope: "dataset",
          direction: "design_to_matrix",
          sampleId: sample.sampleId,
          message: `Design sample '${sample.sampleId}' has missing or empty doseGroupId`,
          errorCode: ERROR_CODES.MISSING_GROUP_ASSIGNMENT,
        });
      }
    }
  }

  // Deterministic sorting
  unmatchedMatrixSamples.sort((a, b) => a.localeCompare(b));
  unmatchedDesignSamples.sort((a, b) => a.localeCompare(b));
  samplesMissingGroup.sort((a, b) => a.localeCompare(b));

  // --- Per-sample detail ---
  const allSampleIds = Array.from(
    new Set([...matrixSampleIds, ...designSamples.map((s) => s.sampleId)]),
  ).sort((a, b) => a.localeCompare(b));

  const samples: SampleCoverageDetail[] = allSampleIds.map((sampleId) => {
    const designEntry = designSampleMap.get(sampleId);
    const presentInMatrix = matrixSampleSet.has(sampleId);
    const presentInDesign = designEntry !== undefined;
    const doseGroupId = designEntry?.doseGroupId;
    const hasGroupAssignment =
      doseGroupId !== undefined &&
      doseGroupId !== null &&
      doseGroupId.trim() !== "";

    return {
      sampleId,
      presentInDesign,
      presentInMatrix,
      doseGroupId,
      hasGroupAssignment,
    };
  });

  const matchedSamples = samples.filter(
    (s) => s.presentInDesign && s.presentInMatrix,
  ).length;

  const coverageComplete =
    unmatchedMatrixSamples.length === 0 &&
    unmatchedDesignSamples.length === 0 &&
    samplesMissingGroup.length === 0 &&
    duplicateDesignSamples.length === 0 &&
    duplicateMatrixSamples.length === 0;

  const valid = coverageComplete;
  const blocksDownstream = !valid;

  return SampleCoverageValidationResultSchema.parse({
    valid,
    coverageComplete,
    designSamples: designSamples.length,
    matrixSamples: matrixSampleIds.length,
    matchedSamples,
    unmatchedMatrixSamples,
    unmatchedDesignSamples,
    samplesMissingGroup,
    duplicateDesignSamples,
    duplicateMatrixSamples,
    samples,
    discrepancies,
    blocksDownstream,
  });
}
