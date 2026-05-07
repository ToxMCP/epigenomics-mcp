import { z } from "zod";
import { BiosampleContextSchema } from "./dataset.js";

/**
 * Context status for confounding-context entries.
 *
 * Used to signal whether a specific confounding factor has
 * been evaluated, detected, or flagged for review.
 */
export const ContextStatusSchema = z.enum([
  "detected",
  "not_detected",
  "unknown",
  "flagged",
  "not_evaluated",
]);

export type ContextStatus = z.infer<typeof ContextStatusSchema>;

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
 * Cell-composition context for a single sample.
 *
 * Declares measured or estimated cell-type proportions,
 * purity declarations, or missing-data status.
 */
export const CellCompositionContextSchema = z
  .object({
    contextId: z.string().min(1).describe("Unique context record identifier"),
    sampleId: z.string().min(1).describe("Sample identifier"),
    source: z
      .enum([
        "measured_flow_cytometry",
        "measured_sorting",
        "externally_estimated",
        "declared_pure",
        "declared_mixed_unknown_fractions",
        "not_declared",
      ])
      .describe("Source of composition evidence"),
    declaredCellType: z
      .string()
      .min(1)
      .optional()
      .describe("Declared dominant cell type"),
    fractions: z
      .array(CellTypeFractionSchema)
      .optional()
      .describe("Cell-type fraction breakdown"),
    contextStatus: ContextStatusSchema.default("unknown").describe(
      "Evaluation status of this context entry",
    ),
    notes: z.string().optional().describe("Free-text notes"),
  })
  .strict();

export type CellCompositionContext = z.infer<
  typeof CellCompositionContextSchema
>;

/**
 * Single cytotoxicity-related measurement.
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
 * Cytotoxicity context for a dataset or assay entry.
 *
 * Captures companion-assay viability, stress, morphology,
 * or apoptosis/necrosis measurements together with their
 * evaluation status.
 */
export const CytotoxicityContextSchema = z
  .object({
    contextId: z.string().min(1).describe("Unique context record identifier"),
    assayType: z
      .enum([
        "viability",
        "stress",
        "morphology",
        "apoptosis_necrosis",
        "companion_assay",
      ])
      .describe("Type of cytotoxicity assay"),
    evidenceSource: z
      .enum([
        "measured_concurrent",
        "measured_separate_experiment",
        "literature",
        "declared",
        "not_available",
      ])
      .describe("Source of cytotoxicity evidence"),
    measurements: z
      .array(CytotoxicityMeasurementSchema)
      .min(1)
      .describe("Cytotoxicity measurements"),
    contextStatus: ContextStatusSchema.default("unknown").describe(
      "Evaluation status of this context entry",
    ),
    stressFlags: z
      .array(z.string().min(1))
      .optional()
      .describe("Detected stress-response flags"),
    notes: z.string().optional().describe("Free-text notes"),
  })
  .strict();

export type CytotoxicityContext = z.infer<typeof CytotoxicityContextSchema>;

/**
 * Chemical / exposure context for an epigenomics dataset.
 *
 * Captures the compound, dose, and exposure conditions under
 * which epigenomic measurements were made.
 */
export const ChemicalExposureContextSchema = z
  .object({
    compoundName: z
      .string()
      .min(1)
      .describe("Primary chemical or compound name"),
    casrn: z
      .string()
      .optional()
      .describe("Chemical Abstracts Service Registry Number"),
    doseValue: z
      .number()
      .finite()
      .optional()
      .describe("Nominal dose value"),
    doseUnit: z
      .string()
      .min(1)
      .optional()
      .describe("Dose unit (e.g., µM, mg/kg)"),
    exposureDurationHours: z
      .number()
      .finite()
      .optional()
      .describe("Duration of exposure in hours"),
    vehicle: z
      .string()
      .optional()
      .describe("Vehicle or solvent used"),
    routeOfAdministration: z
      .string()
      .optional()
      .describe("Route of administration (e.g., oral, dermal, in vitro)"),
  })
  .strict();

export type ChemicalExposureContext = z.infer<
  typeof ChemicalExposureContextSchema
>;

/**
 * Biological context for an epigenomics dataset.
 *
 * Summarises species, tissue, cell type, and biosample
 * classification to support downstream interpretation.
 */
export const BiologicalContextSchema = z
  .object({
    species: z.string().min(1).describe("Species name"),
    tissue: z.string().optional().describe("Tissue type"),
    cellType: z.string().optional().describe("Cell type or line"),
    biosampleContext: BiosampleContextSchema.optional().describe(
      "Biosample context classification",
    ),
    sex: z
      .string()
      .optional()
      .describe("Sex or gender (e.g., male, female, mixed)"),
    lifeStage: z
      .string()
      .optional()
      .describe("Life stage (e.g., adult, juvenile, embryo)"),
  })
  .strict();

export type BiologicalContext = z.infer<typeof BiologicalContextSchema>;
