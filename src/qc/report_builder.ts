import { z } from "zod";
import type { ExperimentalDesign } from "../contracts/design.js";
import { QualificationWarningSchema } from "../contracts/qualification.js";
import type { QualificationWarning } from "../contracts/qualification.js";

/**
 * Upstream batch correction declaration.
 *
 * Records the method, parameters, and availability of pre-correction
 * batch structure.  Epigenomics MCP does not perform correction;
 * it only validates and summarizes the declared provenance.
 */
export const BatchCorrectionProvenanceSchema = z
  .object({
    method: z.string().min(1).describe("Batch correction method name"),
    parameters: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Correction parameters"),
    preCorrectionBatchStructureAvailable: z
      .boolean()
      .describe("Whether pre-correction batch structure is available"),
  })
  .strict();

export type BatchCorrectionProvenance = z.infer<
  typeof BatchCorrectionProvenanceSchema
>;

/**
 * Batch provenance summary for a dataset.
 *
 * Encapsulates batch metadata completeness, dose-batch confounding
 * assessment, and upstream correction provenance in a single
 * regulator-facing record.
 */
export const BatchProvenanceSummarySchema = z
  .object({
    datasetId: z.string().min(1),
    batchIdCompleteness: z
      .number()
      .min(0)
      .max(1)
      .describe("Fraction of samples with non-empty batchId"),
    totalSamples: z.number().int().nonnegative(),
    samplesWithBatchId: z.number().int().nonnegative(),
    doseBatchConfoundingDetected: z.boolean(),
    confoundedDoseGroups: z.array(z.string().min(1)),
    upstreamCorrection: BatchCorrectionProvenanceSchema.optional(),
    warnings: z.array(QualificationWarningSchema),
  })
  .strict();

export type BatchProvenanceSummary = z.infer<
  typeof BatchProvenanceSummarySchema
>;

function buildWarning(
  warningCode: string,
  message: string,
  severity: "info" | "warning" | "error",
  category: QualificationWarning["category"] = "batch_effect",
  blocksDownstream: boolean = false,
): QualificationWarning {
  return {
    warningCode,
    severity,
    message,
    category,
    blocksDownstream,
  };
}

/**
 * Detect dose-batch confounding in an experimental design.
 *
 * A dose group is flagged as confounded when all samples with batch
 * metadata in that group belong to a single batch, and the overall
 * design contains more than one distinct batch.  This captures the
 * most common fail-closed scenario: dose groups nested entirely
 * within separate batches.
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
 * Summarize batch metadata and upstream correction provenance.
 *
 * Computes batch_id completeness, detects dose-batch confounding,
 * and validates upstream correction declarations.  Does NOT perform
 * batch correction.
 *
 * Fail-closed behaviour:
 * - Missing batch metadata emits a missing_metadata warning.
 * - Partial batch metadata emits a missing_metadata warning.
 * - Dose-batch confounding emits a batch_effect warning.
 * - Upstream correction without parameters emits a batch_effect warning.
 * - Correction declared without pre-correction structure emits a batch_effect warning.
 */
export function summarizeBatchProvenance(
  datasetId: string,
  design: ExperimentalDesign,
  upstreamCorrection?: {
    method: string;
    parameters?: Record<string, unknown>;
    preCorrectionBatchStructureAvailable?: boolean;
  },
): BatchProvenanceSummary {
  const totalSamples = design.samples.length;
  const samplesWithBatchId = design.samples.filter(
    (s) => s.batchId !== undefined && s.batchId.trim() !== "",
  ).length;

  const batchIdCompleteness =
    totalSamples > 0 ? samplesWithBatchId / totalSamples : 0;

  const warnings: QualificationWarning[] = [];

  if (samplesWithBatchId === 0) {
    warnings.push(
      buildWarning(
        "BATCH_MISSING_METADATA",
        "Missing batch metadata; batch structure is unknown",
        "warning",
        "missing_metadata",
      ),
    );
  } else if (samplesWithBatchId < totalSamples) {
    warnings.push(
      buildWarning(
        "BATCH_PARTIAL_METADATA",
        `Partial batch metadata; ${totalSamples - samplesWithBatchId} of ${totalSamples} samples lack batchId`,
        "warning",
        "missing_metadata",
      ),
    );
  }

  const {
    detected: doseBatchConfoundingDetected,
    confoundedGroups: confoundedDoseGroups,
  } = detectDoseBatchConfounding(design);

  if (doseBatchConfoundingDetected) {
    warnings.push(
      buildWarning(
        "BATCH_DOSE_CONFOUNDING",
        `Dose-batch confounding detected in dose group(s): ${confoundedDoseGroups.join(", ")}`,
        "warning",
        "batch_effect",
      ),
    );
  }

  let parsedCorrection: BatchCorrectionProvenance | undefined;

  if (upstreamCorrection !== undefined) {
    parsedCorrection = BatchCorrectionProvenanceSchema.parse({
      method: upstreamCorrection.method,
      parameters: upstreamCorrection.parameters,
      preCorrectionBatchStructureAvailable:
        upstreamCorrection.preCorrectionBatchStructureAvailable ?? false,
    });

    if (
      upstreamCorrection.parameters === undefined ||
      Object.keys(upstreamCorrection.parameters).length === 0
    ) {
      warnings.push(
        buildWarning(
          "BATCH_CORRECTION_NO_PARAMS",
          `Upstream batch correction method '${upstreamCorrection.method}' declared without parameters`,
          "warning",
          "batch_effect",
        ),
      );
    }

    if (!parsedCorrection.preCorrectionBatchStructureAvailable) {
      warnings.push(
        buildWarning(
          "BATCH_CORRECTION_NO_PRE_STRUCTURE",
          "Upstream batch correction declared but pre-correction batch structure is unavailable",
          "warning",
          "batch_effect",
        ),
      );
    }
  }

  return BatchProvenanceSummarySchema.parse({
    datasetId,
    batchIdCompleteness,
    totalSamples,
    samplesWithBatchId,
    doseBatchConfoundingDetected,
    confoundedDoseGroups,
    ...(parsedCorrection ? { upstreamCorrection: parsedCorrection } : {}),
    warnings,
  });
}
