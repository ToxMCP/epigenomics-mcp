import { z } from "zod";
import { GenomicRegionSchema } from "./coordinates.js";
import {
  MeasurementSemanticsSchema,
  isMeasurementSemanticsCompatible,
} from "./measurement_semantics.js";
import { PlatformAnnotationProvenanceSchema } from "./provenance.js";

/**
 * Epigenomic assay modalities supported in v0.1.
 */
export const ModalitySchema = z.enum([
  "dna_methylation_array",
  "dna_methylation_bsseq",
  "atac_seq",
  "chip_seq",
  "hic",
  "mirna_expression",
]);

export type Modality = z.infer<typeof ModalitySchema>;

/**
 * Feature class for a measured epigenomic feature.
 */
export const FeatureClassSchema = z.enum([
  "cpg_methylation",
  "dmr",
  "differential_methylated_region",
  "generic_region_feature",
  "atac_peak",
  "chip_peak_narrow",
  "chip_peak_broad",
  "histone_mark_peak",
  "chromatin_interaction",
  "ncrna_expression",
  "mirna_expression",
  "gene_linked_feature",
]);

export type FeatureClass = z.infer<typeof FeatureClassSchema>;

/**
 * A single measured epigenomic feature.
 */
export const EpigenomicFeatureSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    featureClass: FeatureClassSchema.describe("Class of the feature"),
    modality: ModalitySchema.describe("Assay modality"),
    measuredRegion: GenomicRegionSchema.optional().describe(
      "Genomic coordinates of the feature, if applicable",
    ),
    measuredIdentifier: z
      .string()
      .optional()
      .describe(
        "Platform-specific identifier (e.g., probe ID, gene ID, peak ID)",
      ),
    signalMetric: MeasurementSemanticsSchema.describe(
      "Metric used for the signal value",
    ),
    declaredOtherDescription: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Required description when signalMetric is 'declared_other'",
      ),
    values: z
      .record(z.string().min(1), z.number().or(z.null()))
      .describe("Sample identifier -> numeric response map (null for missing)"),
  })
  .strict()
  .refine(
    (f) =>
      f.measuredRegion !== undefined || f.measuredIdentifier !== undefined,
    {
      message:
        "At least one of measuredRegion or measuredIdentifier must be present",
      path: ["measuredRegion"],
    },
  )
  .refine(
    (f) => {
      if (f.signalMetric === "declared_other") {
        return (
          f.declaredOtherDescription !== undefined &&
          f.declaredOtherDescription.length > 0
        );
      }
      return true;
    },
    {
      message:
        "declaredOtherDescription is required when signalMetric is 'declared_other'",
      path: ["declaredOtherDescription"],
    },
  )
  .refine(
    (f) => isMeasurementSemanticsCompatible(f.featureClass, f.signalMetric),
    {
      message: "signalMetric is incompatible with featureClass",
      path: ["signalMetric"],
    },
  );

export type EpigenomicFeature = z.infer<typeof EpigenomicFeatureSchema>;

/**
 * Canonical epigenomic feature matrix.
 *
 * Represents feature × sample numeric values in either wide
 * (featureId → sampleId → value) or long-form (array of rows).
 */
export const EpigenomicFeatureMatrixSchema = z
  .object({
    matrixId: z.string().min(1).describe("Stable matrix identifier"),
    featureIds: z
      .array(z.string().min(1))
      .min(1)
      .describe("Ordered feature identifiers"),
    sampleIds: z
      .array(z.string().min(1))
      .min(1)
      .describe("Ordered sample identifiers"),
    wideValues: z
      .record(
        z.string().min(1),
        z.record(z.string().min(1), z.number().or(z.null())),
      )
      .optional()
      .describe("Wide-format feature × sample map"),
    longValues: z
      .array(
        z.object({
          featureId: z.string().min(1),
          sampleId: z.string().min(1),
          value: z.number().or(z.null()),
        }),
      )
      .optional()
      .describe("Long-format row array"),
  })
  .strict()
  .refine(
    (m) => m.wideValues !== undefined || m.longValues !== undefined,
    {
      message: "At least one of wideValues or longValues must be present",
      path: ["wideValues"],
    },
  );

export type EpigenomicFeatureMatrix = z.infer<
  typeof EpigenomicFeatureMatrixSchema
>;

/**
 * CpG methylation feature.
 *
 * Array or bisulfite-sequencing derived CpG-level methylation
 * measurement. Array-derived features require platform annotation
 * provenance.
 */
export const CpGMethylationFeatureSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    featureClass: z.literal("cpg_methylation"),
    modality: z.enum(["dna_methylation_array", "dna_methylation_bsseq"]),
    measuredRegion: GenomicRegionSchema.optional().describe(
      "Genomic coordinates, if available",
    ),
    measuredIdentifier: z
      .string()
      .min(1)
      .optional()
      .describe("Platform identifier (e.g., probe ID)"),
    platformAnnotationProvenance: PlatformAnnotationProvenanceSchema.optional().describe(
      "Platform annotation provenance (required for array-derived features)",
    ),
    signalMetric: MeasurementSemanticsSchema.describe(
      "Metric used for the signal value",
    ),
    declaredOtherDescription: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Required description when signalMetric is 'declared_other'",
      ),
    values: z
      .record(z.string().min(1), z.number().or(z.null()))
      .describe("Sample identifier -> numeric response map"),
  })
  .strict()
  .refine(
    (f) =>
      f.measuredRegion !== undefined || f.measuredIdentifier !== undefined,
    {
      message:
        "At least one of measuredRegion or measuredIdentifier must be present",
      path: ["measuredRegion"],
    },
  )
  .refine(
    (f) => {
      if (f.signalMetric === "declared_other") {
        return (
          f.declaredOtherDescription !== undefined &&
          f.declaredOtherDescription.length > 0
        );
      }
      return true;
    },
    {
      message:
        "declaredOtherDescription is required when signalMetric is 'declared_other'",
      path: ["declaredOtherDescription"],
    },
  )
  .refine(
    (f) => isMeasurementSemanticsCompatible(f.featureClass, f.signalMetric),
    {
      message: "signalMetric is incompatible with featureClass",
      path: ["signalMetric"],
    },
  )
  .refine(
    (f) => {
      if (
        f.modality === "dna_methylation_array" &&
        f.platformAnnotationProvenance === undefined
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "platformAnnotationProvenance is required for array-derived CpG methylation features",
      path: ["platformAnnotationProvenance"],
    },
  );

export type CpGMethylationFeature = z.infer<
  typeof CpGMethylationFeatureSchema
>;

/**
 * Differential methylated region (DMR) feature.
 *
 * Coordinate-bearing feature that summarises differential
 * methylation across a genomic interval. measuredRegion is
 * mandatory.
 */
export const DifferentialMethylatedRegionFeatureSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    featureClass: z.enum(["differential_methylated_region", "dmr"]),
    modality: z.enum(["dna_methylation_array", "dna_methylation_bsseq"]),
    measuredRegion: GenomicRegionSchema.describe(
      "Genomic coordinates of the DMR (required)",
    ),
    measuredIdentifier: z
      .string()
      .min(1)
      .optional()
      .describe("Platform identifier"),
    signalMetric: MeasurementSemanticsSchema.describe(
      "Metric used for the signal value",
    ),
    declaredOtherDescription: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Required description when signalMetric is 'declared_other'",
      ),
    effectSize: z.number().optional().describe("Effect size estimate"),
    qValue: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Adjusted p-value"),
    pValue: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Raw p-value"),
    values: z
      .record(z.string().min(1), z.number().or(z.null()))
      .describe("Sample identifier -> numeric response map"),
  })
  .strict()
  .refine(
    (f) => {
      if (f.signalMetric === "declared_other") {
        return (
          f.declaredOtherDescription !== undefined &&
          f.declaredOtherDescription.length > 0
        );
      }
      return true;
    },
    {
      message:
        "declaredOtherDescription is required when signalMetric is 'declared_other'",
      path: ["declaredOtherDescription"],
    },
  )
  .refine(
    (f) => isMeasurementSemanticsCompatible(f.featureClass, f.signalMetric),
    {
      message: "signalMetric is incompatible with featureClass",
      path: ["signalMetric"],
    },
  );

export type DifferentialMethylatedRegionFeature = z.infer<
  typeof DifferentialMethylatedRegionFeatureSchema
>;

/**
 * Generic coordinate-bearing region feature.
 *
 * Used for ATAC, ChIP, or other region-level assays when
 * specialised adapters are not yet active. measuredRegion is
 * mandatory.
 */
export const GenericRegionFeatureSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    featureClass: z.enum([
      "generic_region_feature",
      "atac_peak",
      "chip_peak_narrow",
      "chip_peak_broad",
      "histone_mark_peak",
      "chromatin_interaction",
    ]),
    modality: ModalitySchema.describe("Assay modality"),
    measuredRegion: GenomicRegionSchema.describe(
      "Genomic coordinates of the region (required)",
    ),
    measuredIdentifier: z
      .string()
      .min(1)
      .optional()
      .describe("Platform identifier"),
    signalMetric: MeasurementSemanticsSchema.describe(
      "Metric used for the signal value",
    ),
    declaredOtherDescription: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Required description when signalMetric is 'declared_other'",
      ),
    values: z
      .record(z.string().min(1), z.number().or(z.null()))
      .describe("Sample identifier -> numeric response map"),
  })
  .strict()
  .refine(
    (f) => {
      if (f.signalMetric === "declared_other") {
        return (
          f.declaredOtherDescription !== undefined &&
          f.declaredOtherDescription.length > 0
        );
      }
      return true;
    },
    {
      message:
        "declaredOtherDescription is required when signalMetric is 'declared_other'",
      path: ["declaredOtherDescription"],
    },
  )
  .refine(
    (f) => isMeasurementSemanticsCompatible(f.featureClass, f.signalMetric),
    {
      message: "signalMetric is incompatible with featureClass",
      path: ["signalMetric"],
    },
  );

export type GenericRegionFeature = z.infer<typeof GenericRegionFeatureSchema>;

/**
 * Chromatin accessibility feature (reserved for v0.2).
 *
 * ATAC-seq derived accessibility peak. measuredRegion is
 * mandatory.
 */
export const ChromatinAccessibilityFeatureSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    featureClass: z.literal("atac_peak"),
    modality: z.literal("atac_seq"),
    measuredRegion: GenomicRegionSchema.describe(
      "Genomic coordinates of the peak (required)",
    ),
    measuredIdentifier: z
      .string()
      .min(1)
      .optional()
      .describe("Peak identifier"),
    peakFormat: z
      .enum(["narrowPeak", "broadPeak", "bed", "macs2", "homer", "custom"])
      .describe("Peak file format or caller convention"),
    signalMetric: MeasurementSemanticsSchema.describe(
      "Metric used for the signal value",
    ),
    declaredOtherDescription: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Required description when signalMetric is 'declared_other'",
      ),
    values: z
      .record(z.string().min(1), z.number().or(z.null()))
      .describe("Sample identifier -> numeric response map"),
  })
  .strict()
  .refine(
    (f) => {
      if (f.signalMetric === "declared_other") {
        return (
          f.declaredOtherDescription !== undefined &&
          f.declaredOtherDescription.length > 0
        );
      }
      return true;
    },
    {
      message:
        "declaredOtherDescription is required when signalMetric is 'declared_other'",
      path: ["declaredOtherDescription"],
    },
  )
  .refine(
    (f) => isMeasurementSemanticsCompatible(f.featureClass, f.signalMetric),
    {
      message: "signalMetric is incompatible with featureClass",
      path: ["signalMetric"],
    },
  );

export type ChromatinAccessibilityFeature = z.infer<
  typeof ChromatinAccessibilityFeatureSchema
>;

/**
 * Histone mark feature (reserved for v0.2).
 *
 * ChIP-seq or CUT&Tag derived histone mark peak.
 * measuredRegion is mandatory.
 */
export const HistoneMarkFeatureSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    featureClass: z.literal("histone_mark_peak"),
    modality: z.literal("chip_seq"),
    histoneMark: z
      .string()
      .min(1)
      .describe("Histone mark name (e.g., H3K27ac)"),
    measuredRegion: GenomicRegionSchema.describe(
      "Genomic coordinates of the peak (required)",
    ),
    measuredIdentifier: z
      .string()
      .min(1)
      .optional()
      .describe("Peak identifier"),
    signalMetric: MeasurementSemanticsSchema.describe(
      "Metric used for the signal value",
    ),
    declaredOtherDescription: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Required description when signalMetric is 'declared_other'",
      ),
    values: z
      .record(z.string().min(1), z.number().or(z.null()))
      .describe("Sample identifier -> numeric response map"),
  })
  .strict()
  .refine(
    (f) => {
      if (f.signalMetric === "declared_other") {
        return (
          f.declaredOtherDescription !== undefined &&
          f.declaredOtherDescription.length > 0
        );
      }
      return true;
    },
    {
      message:
        "declaredOtherDescription is required when signalMetric is 'declared_other'",
      path: ["declaredOtherDescription"],
    },
  )
  .refine(
    (f) => isMeasurementSemanticsCompatible(f.featureClass, f.signalMetric),
    {
      message: "signalMetric is incompatible with featureClass",
      path: ["signalMetric"],
    },
  );

export type HistoneMarkFeature = z.infer<typeof HistoneMarkFeatureSchema>;

/**
 * miRNA expression/feature feature (optional / feature-flagged).
 *
 * Measured miRNA feature. Coordinates are optional.
 */
export const MiRNAFeatureSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    featureClass: z.literal("mirna_expression"),
    modality: z.literal("mirna_expression"),
    measuredRegion: GenomicRegionSchema.optional().describe(
      "Genomic coordinates, if available",
    ),
    measuredIdentifier: z
      .string()
      .min(1)
      .optional()
      .describe("miRNA identifier (e.g., mature miRNA accession)"),
    signalMetric: MeasurementSemanticsSchema.describe(
      "Metric used for the signal value",
    ),
    declaredOtherDescription: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Required description when signalMetric is 'declared_other'",
      ),
    values: z
      .record(z.string().min(1), z.number().or(z.null()))
      .describe("Sample identifier -> numeric response map"),
  })
  .strict()
  .refine(
    (f) =>
      f.measuredRegion !== undefined || f.measuredIdentifier !== undefined,
    {
      message:
        "At least one of measuredRegion or measuredIdentifier must be present",
      path: ["measuredRegion"],
    },
  )
  .refine(
    (f) => {
      if (f.signalMetric === "declared_other") {
        return (
          f.declaredOtherDescription !== undefined &&
          f.declaredOtherDescription.length > 0
        );
      }
      return true;
    },
    {
      message:
        "declaredOtherDescription is required when signalMetric is 'declared_other'",
      path: ["declaredOtherDescription"],
    },
  )
  .refine(
    (f) => isMeasurementSemanticsCompatible(f.featureClass, f.signalMetric),
    {
      message: "signalMetric is incompatible with featureClass",
      path: ["signalMetric"],
    },
  );

export type MiRNAFeature = z.infer<typeof MiRNAFeatureSchema>;

/**
 * Gene-linked feature.
 *
 * A measured epigenomic feature that is explicitly linked to one or more
 * genes via a supported mapping method (e.g., promoter overlap, enhancer
 * target from database).  The link is declared upstream, not inferred by
 * Epigenomics MCP.  measuredRegion is optional; measuredIdentifier or
 * featureId must be present.
 */
export const GeneLinkedFeatureSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    featureClass: z.literal("gene_linked_feature"),
    modality: ModalitySchema.describe("Assay modality"),
    measuredRegion: GenomicRegionSchema.optional().describe(
      "Genomic coordinates, if available",
    ),
    measuredIdentifier: z
      .string()
      .min(1)
      .optional()
      .describe("Platform identifier"),
    linkedGeneIds: z
      .array(z.string().min(1))
      .min(1)
      .describe("Gene identifiers linked to this feature"),
    mappingMethod: z
      .enum([
        "direct_promoter_overlap",
        "gene_body_overlap",
        "enhancer_target_from_database",
        "chromatin_interaction_supported",
        "nearest_gene",
        "inferred_target_gene",
        "unknown_target_gene",
      ])
      .describe("Method used to link the feature to the gene(s)"),
    mappingProvenance: z
      .string()
      .min(1)
      .optional()
      .describe("Provenance of the gene link (e.g., database version, tool)"),
    signalMetric: MeasurementSemanticsSchema.describe(
      "Metric used for the signal value",
    ),
    declaredOtherDescription: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Required description when signalMetric is 'declared_other'",
      ),
    values: z
      .record(z.string().min(1), z.number().or(z.null()))
      .describe("Sample identifier -> numeric response map"),
  })
  .strict()
  .refine(
    (f) =>
      f.measuredRegion !== undefined || f.measuredIdentifier !== undefined,
    {
      message:
        "At least one of measuredRegion or measuredIdentifier must be present",
      path: ["measuredRegion"],
    },
  )
  .refine(
    (f) => {
      if (f.signalMetric === "declared_other") {
        return (
          f.declaredOtherDescription !== undefined &&
          f.declaredOtherDescription.length > 0
        );
      }
      return true;
    },
    {
      message:
        "declaredOtherDescription is required when signalMetric is 'declared_other'",
      path: ["declaredOtherDescription"],
    },
  )
  .refine(
    (f) => isMeasurementSemanticsCompatible(f.featureClass, f.signalMetric),
    {
      message: "signalMetric is incompatible with featureClass",
      path: ["signalMetric"],
    },
  );

export type GeneLinkedFeature = z.infer<typeof GeneLinkedFeatureSchema>;

/**
 * Summary-response row for contrast or group-level statistics.
 *
 * Represents a single feature's summary statistics from a differential
 * analysis or group comparison.  These rows do NOT contain per-sample
 * numeric responses and are therefore NOT PoD-ready on their own.
 */
export const SummaryResponseRowSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    groupId: z.string().optional().describe("Group or contrast identifier"),
    contrast: z.string().optional().describe("Contrast description"),
    effectSize: z.number().optional().describe("Effect size estimate"),
    pValue: z.number().min(0).max(1).optional().describe("Raw p-value"),
    qValue: z.number().min(0).max(1).optional().describe("Adjusted p-value"),
    logFoldChange: z.number().optional().describe("Log-fold change"),
    standardError: z.number().optional().describe("Standard error"),
    ciLower: z.number().optional().describe("Confidence interval lower bound"),
    ciUpper: z.number().optional().describe("Confidence interval upper bound"),
    statistic: z.number().optional().describe("Test statistic"),
    rawValues: z
      .record(z.string(), z.string())
      .optional()
      .describe("Original raw values from the source row"),
  })
  .strict();

export type SummaryResponseRow = z.infer<typeof SummaryResponseRowSchema>;

/**
 * Summary-response table for contrast or group-level statistics.
 *
 * Deliberately marked as not PoD-ready because it lacks per-sample
 * dose-group numeric structure required by downstream Bioactivity-PoD
 * modelling.
 */
export const SummaryResponseTableSchema = z
  .object({
    tableId: z.string().min(1).describe("Stable table identifier"),
    featureIds: z
      .array(z.string().min(1))
      .min(1)
      .describe("Ordered feature identifiers"),
    summaryRows: z
      .array(SummaryResponseRowSchema)
      .min(1)
      .describe("Summary statistic rows"),
    isPoDReady: z
      .literal(false)
      .describe("Summary tables are never PoD-ready"),
    podReadinessReason: z
      .string()
      .min(1)
      .describe("Explanation for PoD-readiness status"),
    detectedSummaryColumns: z
      .array(z.string())
      .describe("Columns detected as summary statistics"),
  })
  .strict();

export type SummaryResponseTable = z.infer<typeof SummaryResponseTableSchema>;
