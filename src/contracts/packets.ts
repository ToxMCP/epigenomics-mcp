import { z } from "zod";
import { EpigenomicFeatureSchema } from "./features.js";
import {
  ExperimentalDesignSchema,
  DoseAxisSchema,
} from "./design.js";
import {
  DatasetProvenanceSchema,
  EpigenomicAnnotationTraceSchema,
} from "./provenance.js";
import { FeatureQualificationSchema, QualificationWarningSchema } from "./qualification.js";
import {
  ChemicalExposureContextSchema,
  BiologicalContextSchema,
} from "./context.js";
import { MappingPayloadsSchema } from "./mapping.js";

/**
 * EpigenomicsFeatureResponsePacket – primary normative export from this MCP.
 */
export const EpigenomicsFeatureResponsePacketSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    schemaName: z.literal("EpigenomicsFeatureResponsePacket"),
    packetId: z.string().uuid(),
    datasetMetadataRef: z.string().min(1),
    designRef: z.string().min(1),
    features: z.array(EpigenomicFeatureSchema).min(1),
    design: ExperimentalDesignSchema,
    provenance: DatasetProvenanceSchema,
    qualificationSummary: z
      .object({
        acceptedCount: z.number().int().nonnegative(),
        excludedCount: z.number().int().nonnegative(),
        exploratoryCount: z.number().int().nonnegative(),
        caveatCount: z.number().int().nonnegative(),
      })
      .strict(),
    qcReportRef: z.string().min(1),
    warnings: z.array(QualificationWarningSchema).default([]),
    generatedAt: z.string().datetime(),
    chemicalExposureContext: ChemicalExposureContextSchema.optional().describe(
      "Chemical / exposure context when available",
    ),
    biologicalContext: BiologicalContextSchema.optional().describe(
      "Biological context (species, tissue, cell type)",
    ),
    doseAxis: DoseAxisSchema.optional().describe(
      "Ordered dose axis with replicate counts",
    ),
    mappingPayloads: MappingPayloadsSchema.optional().describe(
      "Region-to-gene and external database mappings kept separate from features",
    ),
    annotationTrace: z
      .array(EpigenomicAnnotationTraceSchema)
      .optional()
      .describe("Annotation traces used for coordinate or mapping validation"),
  })
  .strict();

export type EpigenomicsFeatureResponsePacket = z.infer<
  typeof EpigenomicsFeatureResponsePacketSchema
>;

/**
 * BioactivityPoDHandoffPacket – consumer contract for Bioactivity-PoD MCP.
 */
export const BioactivityPoDHandoffPacketSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    schemaName: z.literal("BioactivityPoDHandoffPacket"),
    handoffId: z.string().min(1),
    handoffName: z.string().min(1).optional(),
    sourcePacketRef: z.string().min(1),
    qualifiedFeatures: z.array(FeatureQualificationSchema).min(1),
    excludedFeatures: z.array(FeatureQualificationSchema).default([]),
    doseResponseReadySubset: z.array(z.string().min(1)).min(1),
    mandatoryCaveats: z.array(QualificationWarningSchema).default([]),
    generatedAt: z.string().datetime(),
    persistenceStatus: z
      .enum(["persistent", "transient", "not_assessed", "unknown"])
      .optional()
      .describe("Guarded persistence status stripped from handoff if unsupported"),
    reversibilityStatus: z
      .enum(["reversible", "irreversible", "not_assessed", "unknown"])
      .optional()
      .describe("Guarded reversibility status stripped from handoff if unsupported"),
    heritabilityClaim: z
      .enum(["heritable", "transgenerational", "none", "not_claimed"])
      .optional()
      .describe("Guarded heritability claim stripped from handoff if unsupported"),
    provenance: DatasetProvenanceSchema.optional().describe(
      "Source packet provenance for audit trail",
    ),
  })
  .strict();

export type BioactivityPoDHandoffPacket = z.infer<
  typeof BioactivityPoDHandoffPacketSchema
>;
