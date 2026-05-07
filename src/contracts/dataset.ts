import { z } from "zod";
import { ModalitySchema } from "./features.js";

/**
 * Study type for an epigenomics dataset.
 */
export const StudyTypeSchema = z.enum([
  "in_vivo",
  "in_vitro",
  "ex_vivo",
  "clinical",
  "epidemiological",
  "unknown",
]);

export type StudyType = z.infer<typeof StudyTypeSchema>;

/**
 * Assay family classification.
 */
export const AssayFamilySchema = z.enum([
  "dna_methylation",
  "chromatin_accessibility",
  "chip_seq",
  "histone_modification",
  "chromatin_interaction",
  "mirna_expression",
  "ncrna_expression",
  "epigenomic",
  "unknown",
]);

export type AssayFamily = z.infer<typeof AssayFamilySchema>;

/**
 * Standardised dose units for epigenomics experiments.
 */
export const DoseUnitSchema = z.enum([
  "µM",
  "nM",
  "mM",
  "M",
  "mg/kg",
  "µg/kg",
  "ng/kg",
  "ppm",
  "ppb",
  "percent",
  "fraction",
  "mg/mL",
  "µg/mL",
  "ng/mL",
  "other",
]);

export type DoseUnit = z.infer<typeof DoseUnitSchema>;

/**
 * Biosample context classification.
 */
export const BiosampleContextSchema = z.enum([
  "cell_line",
  "primary_cell",
  "tissue",
  "organoid",
  "whole_organism",
  "biofluid",
  "unknown",
]);

export type BiosampleContext = z.infer<typeof BiosampleContextSchema>;

/**
 * Epigenomics dataset metadata.
 *
 * Captures study-level, assay-level, and biological-context
 * information required for downstream qualification and
 * Bioactivity-PoD handoff.
 */
export const EpigenomicsDatasetMetadataSchema = z
  .object({
    datasetId: z.string().min(1).describe("Unique dataset identifier"),
    datasetName: z
      .string()
      .min(1)
      .optional()
      .describe("Human-readable dataset name"),
    studyId: z
      .string()
      .min(1)
      .optional()
      .describe("Parent study identifier"),
    studyType: StudyTypeSchema.describe("Type of study"),
    assayFamily: AssayFamilySchema.describe("Assay family classification"),
    modality: ModalitySchema.describe("Assay modality"),
    species: z.string().min(1).describe("Species name"),
    genomeBuild: z
      .string()
      .min(1)
      .optional()
      .describe("Reference genome build"),
    description: z.string().optional().describe("Dataset description"),
    createdAt: z
      .string()
      .datetime()
      .describe("ISO-8601 creation timestamp"),
  })
  .strict();

export type EpigenomicsDatasetMetadata = z.infer<
  typeof EpigenomicsDatasetMetadataSchema
>;
