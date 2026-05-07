import { z } from "zod";
import {
  StudyTypeSchema,
  AssayFamilySchema,
  BiosampleContextSchema,
} from "./dataset.js";

/**
 * Dose group definition.
 */
export const DoseGroupSchema = z
  .object({
    doseGroupId: z.string().min(1),
    doseValue: z.number().finite().describe("Numeric dose level"),
    doseUnit: z.string().min(1).describe("Dose unit (e.g., µM, mg/kg)"),
    timepointHours: z.number().finite().optional().describe("Time point"),
  })
  .strict();

export type DoseGroup = z.infer<typeof DoseGroupSchema>;

/**
 * Replicate type for a sample.
 *
 * Scientific assumptions visible in outputs:
 * - biological: independent biological units; counts fully toward replicate minimum.
 * - technical: repeated measurements from the same biological unit; must NOT count
 *   toward biological replicate minimum.
 * - pooled: mixture of multiple biological units into one measurement; counts as
 *   one biological replicate but with an independent-variance caveat.
 * - pseudobulk: aggregated single-cell measurements from one biological unit;
 *   counts as one biological replicate but with a cell-composition caveat.
 */
export const ReplicateTypeSchema = z.enum([
  "biological",
  "technical",
  "pooled",
  "pseudobulk",
]);

export type ReplicateType = z.infer<typeof ReplicateTypeSchema>;

/**
 * Sample metadata entry.
 */
export const SampleMetadataSchema = z
  .object({
    sampleId: z.string().min(1),
    doseGroupId: z.string().min(1),
    replicateIndex: z.number().int().nonnegative().default(0),
    replicateType: ReplicateTypeSchema.optional().describe(
      "Type of replicate (biological or technical)",
    ),
    cellType: z.string().optional(),
    tissue: z.string().optional(),
    species: z.string().min(1),
    batchId: z.string().optional(),
    controlFlag: z.boolean().default(false),
    treatment: z.string().optional().describe("Treatment or compound name"),
  })
  .strict();

export type SampleMetadata = z.infer<typeof SampleMetadataSchema>;

/**
 * Temporal and inheritance claim status for a study design.
 */
export const PersistenceStatusSchema = z.enum([
  "persistent",
  "transient",
  "not_assessed",
]);
export type PersistenceStatus = z.infer<typeof PersistenceStatusSchema>;

export const ReversibilityStatusSchema = z.enum([
  "reversible",
  "irreversible",
  "not_assessed",
]);
export type ReversibilityStatus = z.infer<typeof ReversibilityStatusSchema>;

export const HeritabilityClaimSchema = z.enum([
  "heritable",
  "transgenerational",
  "none",
]);
export type HeritabilityClaim = z.infer<typeof HeritabilityClaimSchema>;

/**
 * Experimental design for an epigenomics dataset.
 */
export const ExperimentalDesignSchema = z
  .object({
    designId: z.string().min(1),
    studyId: z.string().min(1).optional(),
    species: z.string().min(1),
    doseGroups: z.array(DoseGroupSchema).min(1),
    samples: z.array(SampleMetadataSchema).min(1),
    hasControls: z.boolean().describe("Whether control samples are present"),
    minReplicatesPerGroup: z
      .number()
      .int()
      .nonnegative()
      .describe("Minimum replicate count across dose groups"),
    persistenceStatus: PersistenceStatusSchema.optional().describe(
      "Claimed persistence status of observed epigenomic changes",
    ),
    reversibilityStatus: ReversibilityStatusSchema.optional().describe(
      "Claimed reversibility status of observed epigenomic changes",
    ),
    heritabilityClaim: HeritabilityClaimSchema.optional().describe(
      "Claimed heritability or transgenerational inheritance",
    ),
    multigenerationalDesign: z
      .boolean()
      .optional()
      .describe(
        "Whether the study design explicitly includes germline or multigenerational assessment",
      ),
  })
  .strict()
  .refine(
    (d) =>
      d.hasControls || d.doseGroups.some((g) => g.doseValue === 0),
    {
      message:
        "Design must declare controls or include a zero-dose group",
      path: ["hasControls"],
    },
  );

export type ExperimentalDesign = z.infer<typeof ExperimentalDesignSchema>;

/**
 * Epigenomics sample metadata with extended biosample context.
 */
export const EpigenomicsSampleMetadataSchema = z
  .object({
    sampleId: z.string().min(1),
    doseGroupId: z.string().min(1),
    replicateIndex: z.number().int().nonnegative().default(0),
    replicateType: ReplicateTypeSchema.optional(),
    species: z.string().min(1),
    cellType: z.string().optional(),
    tissue: z.string().optional(),
    batchId: z.string().optional(),
    controlFlag: z.boolean().default(false),
    treatment: z.string().optional(),
    biosampleContext: BiosampleContextSchema.optional(),
  })
  .strict();

export type EpigenomicsSampleMetadata = z.infer<
  typeof EpigenomicsSampleMetadataSchema
>;

/**
 * Extended experimental design for epigenomics datasets.
 */
export const EpigenomicsExperimentalDesignSchema = z
  .object({
    designId: z.string().min(1),
    studyId: z.string().min(1).optional(),
    studyType: StudyTypeSchema.optional(),
    assayFamily: AssayFamilySchema.optional(),
    species: z.string().min(1),
    doseGroups: z.array(DoseGroupSchema).min(1),
    samples: z.array(EpigenomicsSampleMetadataSchema).min(1),
    hasControls: z.boolean(),
    minReplicatesPerGroup: z.number().int().nonnegative(),
    batchId: z.string().optional(),
    persistenceStatus: PersistenceStatusSchema.optional(),
    reversibilityStatus: ReversibilityStatusSchema.optional(),
    heritabilityClaim: HeritabilityClaimSchema.optional(),
    multigenerationalDesign: z.boolean().optional(),
  })
  .strict()
  .refine(
    (d) => d.hasControls || d.doseGroups.some((g) => g.doseValue === 0),
    {
      message:
        "Design must declare controls or include a zero-dose group",
      path: ["hasControls"],
    },
  )
  .refine(
    (d) => {
      const ids = d.samples.map((s) => s.sampleId);
      return new Set(ids).size === ids.length;
    },
    {
      message: "Duplicate sample IDs detected",
      path: ["samples"],
    },
  );

export type EpigenomicsExperimentalDesign = z.infer<
  typeof EpigenomicsExperimentalDesignSchema
>;

/**
 * Dose-axis group with replicate count and sample references.
 *
 * Derived from the experimental design to provide a deterministic,
 * ordered view of the dose axis for downstream consumers.
 */
export const DoseAxisGroupSchema = z
  .object({
    doseGroupId: z.string().min(1),
    doseValue: z.number().finite(),
    doseUnit: z.string().min(1),
    timepointHours: z.number().finite().optional(),
    replicateCount: z.number().int().nonnegative(),
    sampleIds: z.array(z.string().min(1)),
  })
  .strict();

export type DoseAxisGroup = z.infer<typeof DoseAxisGroupSchema>;

/**
 * Dose axis summary.
 *
 * Ordered dose groups with replicate counts, control group
 * identification, and unit declaration.
 */
export const DoseAxisSchema = z
  .object({
    orderedGroups: z.array(DoseAxisGroupSchema).min(1),
    controlGroupId: z.string().min(1).optional(),
    unit: z.string().min(1).optional(),
  })
  .strict();

export type DoseAxis = z.infer<typeof DoseAxisSchema>;
