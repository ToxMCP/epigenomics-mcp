/**
 * Epigenomics MCP – public contract layer.
 *
 * All Zod schemas and inferred types for domain objects used across the
 * service.  Import from this index for stable public API access.
 */

// Base envelopes and shared fields
export {
  BaseEnvelopeSchema,
  ConfidenceLevelSchema,
  EnvelopeErrorSchema,
  ReviewFlagSchema,
} from "./base.js";
export type {
  BaseEnvelope,
  ConfidenceLevel,
  EnvelopeError,
  ReviewFlag,
} from "./base.js";

// Coordinates and genome builds
export {
  GenomeBuildSchema,
  CoordinateSystemSchema,
  GenomicRegionSchema,
  GenomicCoordinateSchema,
} from "./coordinates.js";
export type {
  GenomeBuild,
  CoordinateSystem,
  GenomicRegion,
  GenomicCoordinate,
} from "./coordinates.js";

// Coordinate conversion
export {
  CoordinateConversionInputSchema,
  CoordinateConversionProvenanceSchema,
  NormalizedCoordinateRecordSchema,
  CoordinateConversionResultSchema,
  BatchCoordinateConversionResultSchema,
} from "./coordinate_conversion.js";
export type {
  CoordinateConversionInput,
  CoordinateConversionProvenance,
  NormalizedCoordinateRecord,
  CoordinateConversionResult,
  BatchCoordinateConversionResult,
} from "./coordinate_conversion.js";

// Experimental design
export {
  DoseGroupSchema,
  ReplicateTypeSchema,
  SampleMetadataSchema,
  ExperimentalDesignSchema,
  EpigenomicsSampleMetadataSchema,
  EpigenomicsExperimentalDesignSchema,
  PersistenceStatusSchema,
  ReversibilityStatusSchema,
  HeritabilityClaimSchema,
} from "./design.js";
export type {
  DoseGroup,
  ReplicateType,
  SampleMetadata,
  ExperimentalDesign,
  EpigenomicsSampleMetadata,
  EpigenomicsExperimentalDesign,
  PersistenceStatus,
  ReversibilityStatus,
  HeritabilityClaim,
} from "./design.js";

// Epigenomic features
export {
  ModalitySchema,
  FeatureClassSchema,
  EpigenomicFeatureSchema,
  EpigenomicFeatureMatrixSchema,
  CpGMethylationFeatureSchema,
  DifferentialMethylatedRegionFeatureSchema,
  GenericRegionFeatureSchema,
  ChromatinAccessibilityFeatureSchema,
  HistoneMarkFeatureSchema,
  MiRNAFeatureSchema,
  GeneLinkedFeatureSchema,
  SummaryResponseRowSchema,
  SummaryResponseTableSchema,
} from "./features.js";
export type {
  Modality,
  FeatureClass,
  EpigenomicFeature,
  EpigenomicFeatureMatrix,
  CpGMethylationFeature,
  DifferentialMethylatedRegionFeature,
  GenericRegionFeature,
  ChromatinAccessibilityFeature,
  HistoneMarkFeature,
  MiRNAFeature,
  GeneLinkedFeature,
  SummaryResponseRow,
  SummaryResponseTable,
} from "./features.js";

// Measurement semantics
export {
  MeasurementSemanticsSchema,
  FEATURE_CLASS_SEMANTICS_COMPATIBILITY,
  isMeasurementSemanticsCompatible,
  MeasurementSemanticsCompatibilityError,
} from "./measurement_semantics.js";
export type { MeasurementSemantics } from "./measurement_semantics.js";

// Region-to-gene mapping
export {
  MappingConfidenceSchema,
  MappingTypeSchema,
  RegionToGeneMappingSchema,
  PATHWAY_ROLLUP_ALLOWED_MAPPING_TYPES,
  BiosampleContextMatchSchema,
  DownstreamUseRuleSchema,
  ExternalDatabaseMappingMethodSchema,
  ExternalDatabaseMappingSchema,
  MappingPayloadsSchema,
} from "./mapping.js";
export type {
  MappingConfidence,
  MappingType,
  RegionToGeneMapping,
  BiosampleContextMatch,
  DownstreamUseRule,
  ExternalDatabaseMappingMethod,
  ExternalDatabaseMapping,
  MappingPayloads,
} from "./mapping.js";

// Provenance
export {
  ProvenanceRecordSchema,
  DatasetProvenanceSchema,
  EpigenomicAnnotationTraceSchema,
  PlatformAnnotationProvenanceSchema,
  UpstreamEpigenomicsProvenanceSchema,
} from "./provenance.js";
export type {
  ProvenanceRecord,
  DatasetProvenance,
  EpigenomicAnnotationTrace,
  PlatformAnnotationProvenance,
  UpstreamEpigenomicsProvenance,
} from "./provenance.js";

// Missingness profile (defined in qc module; re-exported for contract stability)
export { MissingnessProfileSchema } from "../qc/missingness.js";
export type { MissingnessProfile } from "../qc/missingness.js";

// Variance profile (defined in qc module; re-exported for contract stability)
export { VariancePolicySchema, DEFAULT_VARIANCE_POLICY } from "../qc/variance.js";
export type { VariancePolicy } from "../qc/variance.js";

// Deterministic QC profile (defined in qc module; re-exported for contract stability)
export {
  DeterministicQcProfileSchema,
  ReplicateSummarySchema,
  ThresholdStatusSchema,
} from "../qc/deterministic_profile.js";
export type {
  DeterministicQcProfile,
  ReplicateSummary,
  ThresholdStatus,
  BuildDeterministicQcProfileOptions,
} from "../qc/deterministic_profile.js";

// QC profiles
export {
  QcProfileSchema,
  DynamicRangeBandSchema,
  ReplicateStabilityBandSchema,
  FeatureVarianceSchema,
  VarianceProfileSchema,
  ConfoundingSummarySchema,
  EpigenomicsQCReportSchema,
} from "./qc.js";
export type {
  QcProfile,
  DynamicRangeBand,
  ReplicateStabilityBand,
  FeatureVariance,
  VarianceProfile,
  ConfoundingSummary,
  EpigenomicsQCReport,
} from "./qc.js";

// Qualification
export {
  QualificationStatusSchema,
  EpigenomicsQualificationStatusSchema,
  QualificationWarningSchema,
  EpigenomicsWarningSchema,
  EpigenomicsErrorSchema,
  FeatureQualificationSchema,
  EpigenomicsFeatureQualificationSchema,
  DatasetQualificationSummarySchema,
} from "./qualification.js";
export type {
  QualificationStatus,
  EpigenomicsQualificationStatus,
  QualificationWarning,
  EpigenomicsWarning,
  EpigenomicsError,
  FeatureQualification,
  EpigenomicsFeatureQualification,
  DatasetQualificationSummary,
} from "./qualification.js";

// Dataset metadata
export {
  StudyTypeSchema,
  AssayFamilySchema,
  DoseUnitSchema,
  BiosampleContextSchema,
  EpigenomicsDatasetMetadataSchema,
} from "./dataset.js";
export type {
  StudyType,
  AssayFamily,
  DoseUnit,
  BiosampleContext,
  EpigenomicsDatasetMetadata,
} from "./dataset.js";

// Context models
export {
  ContextStatusSchema,
  CellTypeFractionSchema,
  CellCompositionContextSchema,
  CytotoxicityMeasurementSchema,
  CytotoxicityContextSchema,
} from "./context.js";
export type {
  ContextStatus,
  CellTypeFraction,
  CellCompositionContext,
  CytotoxicityMeasurement,
  CytotoxicityContext,
} from "./context.js";

// Packets
export {
  EpigenomicsFeatureResponsePacketSchema,
  BioactivityPoDHandoffPacketSchema,
} from "./packets.js";
export type {
  EpigenomicsFeatureResponsePacket,
  BioactivityPoDHandoffPacket,
} from "./packets.js";
