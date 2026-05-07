import { z } from "zod";
import { GenomeBuildSchema } from "./coordinates.js";

/**
 * Upstream processing provenance record.
 */
export const ProvenanceRecordSchema = z
  .object({
    stepName: z.string().min(1).describe("Processing step name"),
    toolName: z.string().min(1).describe("Tool or pipeline name"),
    toolVersion: z.string().min(1).describe("Tool version"),
    parameters: z.record(z.string(), z.unknown()).default({}),
    timestamp: z.string().datetime().optional(),
    inputFiles: z.array(z.string()).default([]),
    outputFiles: z.array(z.string()).default([]),
  })
  .strict();

export type ProvenanceRecord = z.infer<typeof ProvenanceRecordSchema>;

/**
 * Dataset-level provenance bundle.
 */
export const DatasetProvenanceSchema = z
  .object({
    datasetId: z.string().min(1),
    upstreamSteps: z
      .array(ProvenanceRecordSchema)
      .min(1)
      .describe("Ordered upstream processing steps; at least one step is required for auditability"),
    normalisationMethod: z.string().optional(),
    batchCorrectionMethod: z.string().optional(),
    probeManifestVersion: z.string().optional(),
    annotationVersion: z.string().optional(),
    sourceArchive: z.string().optional(),
    sourceAccession: z.string().optional(),
  })
  .strict();

export type DatasetProvenance = z.infer<typeof DatasetProvenanceSchema>;

/**
 * Epigenomic annotation trace.
 *
 * Tracks the source resource, version, and genome build used for
 * annotation-driven mappings or coordinate validations.
 */
export const EpigenomicAnnotationTraceSchema = z
  .object({
    traceId: z.string().min(1).describe("Stable trace identifier"),
    sourceResource: z
      .string()
      .min(1)
      .describe("Annotation resource name (e.g., Ensembl, GENCODE)"),
    sourceVersion: z
      .string()
      .min(1)
      .describe("Annotation release version"),
    releaseDate: z
      .string()
      .datetime()
      .optional()
      .describe("Release timestamp"),
    genomeBuild: GenomeBuildSchema.describe("Genome build for the annotation"),
  })
  .strict();

export type EpigenomicAnnotationTrace = z.infer<
  typeof EpigenomicAnnotationTraceSchema
>;

/**
 * Platform annotation provenance.
 *
 * Required for array-derived or platform-specific features to
 * support reproducible interpretation and gene/pathway linkage.
 */
export const PlatformAnnotationProvenanceSchema = z
  .object({
    platform: z.string().min(1).describe("Platform name (e.g., EPIC, 450K)"),
    manifestVersion: z
      .string()
      .min(1)
      .describe("Manifest or probe set version"),
    annotationVersion: z
      .string()
      .min(1)
      .optional()
      .describe("Annotation release version"),
    annotationHash: z
      .string()
      .min(1)
      .optional()
      .describe("Checksum or hash of the annotation file"),
  })
  .strict();

export type PlatformAnnotationProvenance = z.infer<
  typeof PlatformAnnotationProvenanceSchema
>;

/**
 * Upstream epigenomics processing provenance.
 *
 * Pipeline-level provenance capturing the full upstream processing
 * history for an epigenomics dataset.
 */
export const UpstreamEpigenomicsProvenanceSchema = z
  .object({
    provenanceId: z.string().min(1).describe("Stable provenance identifier"),
    pipelineName: z.string().min(1).describe("Pipeline name"),
    pipelineVersion: z.string().min(1).describe("Pipeline version"),
    steps: z
      .array(ProvenanceRecordSchema)
      .min(1)
      .describe("Ordered processing steps"),
    normalisationMethod: z.string().optional(),
    batchCorrectionMethod: z.string().optional(),
    sourceArchive: z.string().optional(),
    sourceAccession: z.string().optional(),
  })
  .strict();

export type UpstreamEpigenomicsProvenance = z.infer<
  typeof UpstreamEpigenomicsProvenanceSchema
>;
