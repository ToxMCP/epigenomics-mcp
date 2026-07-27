/**
 * Ingestion layer for processed epigenomic feature tables.
 *
 * Responsibilities:
 * - Parse generic feature tables (CSV, TSV, JSON)
 * - Attach design metadata and provenance
 * - Emit canonical EpigenomicFeature arrays
 */

export { ingestFeatureTable } from "./feature_table.js";
export {
  canonicalizeFeatureTable,
  canonicalizeFeatureTableRows,
  IngestFeatureTableOptionsSchema,
  FeatureTableCanonicalizationResultSchema,
  RowProvenanceSchema,
  CoordinateColumnMappingSchema,
} from "./feature_table.js";
export type {
  IngestFeatureTableOptions,
  FeatureTableCanonicalizationResult,
  RowProvenance,
  CoordinateColumnMapping,
} from "./feature_table.js";
export { readTableFile } from "./csv_reader.js";
export type { ReadTableOptions, ReadTableResult, TableEncoding } from "./csv_reader.js";
export { readDesignTable } from "./design_reader.js";
export type { ReadDesignOptions, ReadDesignResult, DesignColumnMapping } from "./design_reader.js";
export {
  streamIngestFeatureTableFile,
  StreamingIngestOptionsSchema,
  StreamingIngestResultSchema,
} from "./streaming_ingest.js";
export type {
  StreamingIngestOptions,
  StreamingIngestResult,
} from "./streaming_ingest.js";
export { detectTableFormat } from "./format_detection.js";
export type { FormatDetectionOptions, DetectedFormat, TableShape, DetectionConfidence } from "./format_detection.js";
export { TableShapeSchema, DetectionConfidenceSchema, FormatDetectionOptionsSchema, DetectedFormatSchema } from "./format_detection.js";
export {
  classifyMethylationFeatureClass,
  buildMethylationFeatures,
  MethylationFeatureClassSchema,
  ClassificationConfidenceSchema,
  MethylationClassificationOptionsSchema,
  MethylationClassificationResultSchema,
  MethylationFeatureBuildOptionsSchema,
} from "./methylation_classifier.js";
export type {
  MethylationFeatureClass,
  ClassificationConfidence,
  MethylationClassificationOptions,
  MethylationClassificationResult,
  MethylationFeatureBuildOptions,
  MethylationFeatureBuildResult,
} from "./methylation_classifier.js";

export {
  classifyRegionFeatureClass,
  buildRegionFeatures,
  RegionFeatureClassSchema,
  RegionClassificationOptionsSchema,
  RegionClassificationResultSchema,
  RegionFeatureBuildOptionsSchema,
} from "./region_feature_classifier.js";
export type {
  RegionFeatureClass,
  RegionClassificationOptions,
  RegionClassificationResult,
  RegionFeatureBuildOptions,
  RegionFeatureBuildResult,
} from "./region_feature_classifier.js";

export {
  meltWideToLong,
  canonicalizeWideFileToLong,
  WideToLongOptionsSchema,
  WideToLongResultSchema,
  LongResponseRecordSchema,
  WideToLongProvenanceSchema,
} from "./wide_format.js";
export type {
  WideToLongOptions,
  WideToLongResult,
  LongResponseRecord,
  WideToLongProvenance,
} from "./wide_format.js";

export {
  canonicalizeLongRows,
  canonicalizeLongFile,
  LongFormatOptionsSchema,
  LongFormatResultSchema,
  LongFormatProvenanceSchema,
} from "./long_format.js";
export type {
  LongFormatOptions,
  LongFormatResult,
  LongFormatProvenance,
} from "./long_format.js";

export {
  adaptSummaryResponseTable,
  adaptContrastFeatures,
  buildFeatureQualifications,
  isContrastOnlyFeature,
  detectSummaryEvidenceType,
  GroupNumericSummarySchema,
  AdaptedSummaryFeatureSchema,
  SummaryAdaptationResultSchema,
} from "./table_adapters.js";
export type {
  GroupNumericSummary,
  AdaptedSummaryFeature,
  SummaryAdaptationResult,
} from "./table_adapters.js";

export {
  analyzeMixedFeatures,
  buildSplitFeatureMatrices,
  MixedFeatureHandlingPolicySchema,
  MixedFeatureDetectionConfigSchema,
  PerRowFeatureClassSchema,
  RowClassificationResultSchema,
  MixedFeatureAnalysisResultSchema,
  SplitMatrixBuildOptionsSchema,
  SplitFeatureMatrixSchema,
  perRowClassToFeatureClass,
} from "./mixed_feature_handler.js";
export type {
  MixedFeatureHandlingPolicy,
  MixedFeatureDetectionConfig,
  PerRowFeatureClass,
  RowClassificationResult,
  MixedFeatureAnalysisResult,
  SplitMatrixBuildOptions,
  SplitFeatureMatrix,
} from "./mixed_feature_handler.js";

export {
  classifyFeatureType,
  classifyFeatureTable,
  buildFeatureClassificationReport,
  DetectableFeatureClassSchema,
  FeatureTypeClassificationOptionsSchema,
  FeatureTypeClassificationResultSchema,
  FeatureClassificationReportSchema,
} from "./feature_type_classifier.js";
export type {
  DetectableFeatureClass,
  FeatureTypeClassificationOptions,
  FeatureTypeClassificationResult,
  FeatureClassificationReport,
} from "./feature_type_classifier.js";
