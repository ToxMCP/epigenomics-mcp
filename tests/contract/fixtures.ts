/**
 * Contract test fixtures – valid and invalid objects for every major schema.
 *
 * These fixtures are the ground-truth for semantic contract tests.
 * Intentionally malformed objects are named with the `invalid` prefix
 * and must cause parse failures.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const validUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
export const validUuidB = "b2c3d4e5-f6a7-8901-bcde-f23456789012";
export const validDateTime = "2026-05-05T00:00:00Z";

export function expectValid<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export function expectInvalid<T>(schema: z.ZodType<T>, value: unknown): void {
  expect(() => schema.parse(value)).toThrow();
}

// ---------------------------------------------------------------------------
// Valid fixtures
// ---------------------------------------------------------------------------

export const validGenomicRegion = {
  chrom: "chr1",
  start: 1000,
  end: 2000,
  build: "hg38",
  coordinateSystem: "0-based-half-open" as const,
};

export const validExperimentalDesign = {
  designId: "design-001",
  species: "Homo sapiens",
  doseGroups: [
    { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" as const },
    { doseGroupId: "low", doseValue: 1, doseUnit: "µM" as const },
  ],
  samples: [
    { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
    { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
  ],
  hasControls: true,
  minReplicatesPerGroup: 1,
};

export const validProvenanceRecord = {
  stepName: "normalisation",
  toolName: "minfi",
  toolVersion: "1.44.0",
  parameters: { method: "SWAN" },
  timestamp: validDateTime,
  inputFiles: ["raw.idat"],
  outputFiles: ["norm.csv"],
};

export const validDatasetProvenance = {
  datasetId: "dataset-001",
  upstreamSteps: [validProvenanceRecord],
  normalisationMethod: "SWAN",
  probeManifestVersion: "EPIC v2",
};

export const validCpGFeature = {
  featureId: "cg00000001",
  featureClass: "cpg_methylation" as const,
  modality: "dna_methylation_array" as const,
  measuredIdentifier: "cg00000001",
  signalMetric: "beta_value" as const,
  values: { "sample-1": 0.82 },
};

export const validCpGMethylationFeatureWithPlatform = {
  featureId: "cg00000001",
  featureClass: "cpg_methylation" as const,
  modality: "dna_methylation_array" as const,
  measuredIdentifier: "cg00000001",
  platformAnnotationProvenance: {
    platform: "EPIC" as const,
    manifestVersion: "EPIC v2",
    annotationVersion: "ilm10b4.hg38",
  },
  signalMetric: "beta_value" as const,
  values: { "sample-1": 0.82 },
};

export const validRegionFeature = {
  featureId: "peak-001",
  featureClass: "atac_peak" as const,
  modality: "atac_seq" as const,
  measuredRegion: validGenomicRegion,
  signalMetric: "accessibility_signal" as const,
  values: { "sample-1": 1.23 },
};

export const validQualificationSummary = {
  acceptedCount: 1,
  excludedCount: 0,
  exploratoryCount: 0,
  caveatCount: 0,
};

export const validEpigenomicsFeatureResponsePacket = {
  schemaVersion: "0.1.0" as const,
  schemaName: "EpigenomicsFeatureResponsePacket" as const,
  packetId: validUuid,
  datasetMetadataRef: "dataset-001",
  designRef: "design-001",
  features: [validCpGFeature],
  design: validExperimentalDesign,
  provenance: validDatasetProvenance,
  qualificationSummary: validQualificationSummary,
  qcReportRef: "qc-001",
  warnings: [],
  generatedAt: validDateTime,
};

export const validFeatureQualification = {
  featureId: "cg00000001",
  status: "accepted_for_pod" as const,
  warnings: [],
};

export const validBioactivityPoDHandoffPacket = {
  schemaVersion: "0.1.0" as const,
  schemaName: "BioactivityPoDHandoffPacket" as const,
  handoffId: validUuidB,
  sourcePacketRef: validUuid,
  qualifiedFeatures: [validFeatureQualification],
  excludedFeatures: [],
  doseResponseReadySubset: ["cg00000001"],
  mandatoryCaveats: [],
  generatedAt: validDateTime,
};

export const validRegionToGeneMapping = {
  featureId: "peak-001",
  geneIds: ["BRCA1"],
  method: "nearest_gene" as const,
  confidence: "low" as const,
};

export const validExternalDatabaseMapping = {
  featureId: "peak-001",
  geneIds: ["ENSG00000141510"],
  method: "enhancer_target_from_database" as const,
  confidence: "high" as const,
  sourceResource: "GeneHancer",
  annotationRelease: "v4.7",
  biosampleContextMatch: "exact" as const,
  downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup" as const,
};

export const validEpigenomicsQCReport = {
  reportId: "qc-report-001",
  schemaName: "EpigenomicsQCReport" as const,
  schemaVersion: "0.1.0",
  datasetId: "ds-001",
  designValidation: { valid: true, errors: [] },
  coordinateValidation: { valid: true, errors: [] },
  missingnessProfile: {
    datasetId: "ds-001",
    policyVersion: "v1.0.0",
    overallFeatureMissingFraction: 0,
    perFeatureMissingness: [],
    perSampleMissingness: [],
    perGroupMissingness: [],
    featuresWithCompleteGroupDropout: [],
    summaryBand: "acceptable" as const,
  },
  varianceProfile: {
    datasetId: "ds-001",
    policyVersion: "v1.0.0",
    perFeatureVariance: [],
    summaryBand: "acceptable" as const,
  },
  confoundingSummary: {
    cellCompositionStatus: "unlikely_confounding",
    cytotoxicityStatus: "not_evaluated",
  },
  reviewFlags: [],
  acceptedCount: 10,
  excludedCount: 0,
  warningCount: 1,
  generatedAt: validDateTime,
};

export const validBaseEnvelope = {
  schemaName: "TestEnvelope",
  schemaVersion: "0.1.0",
  objectId: validUuid,
  createdAt: validDateTime,
  createdBy: "test-suite",
  sourceMcp: "epigenomics-mcp",
};

// ---------------------------------------------------------------------------
// Invalid fixtures – each must fail parse with its target schema
// ---------------------------------------------------------------------------

export const invalidMissingSchemaVersion = {
  schemaName: "EpigenomicsFeatureResponsePacket",
  packetId: validUuid,
  datasetMetadataRef: "dataset-001",
  designRef: "design-001",
  features: [validCpGFeature],
  design: validExperimentalDesign,
  provenance: validDatasetProvenance,
  qualificationSummary: validQualificationSummary,
  qcReportRef: "qc-001",
  warnings: [],
  generatedAt: validDateTime,
};

export const invalidWrongSchemaVersion = {
  ...validEpigenomicsFeatureResponsePacket,
  schemaVersion: "0.2.0",
};

export const invalidExtraFieldFeature = {
  ...validCpGFeature,
  geneIds: ["BRCA1"],
};

export const invalidMissingRequiredField = {
  ...validEpigenomicsFeatureResponsePacket,
  packetId: undefined,
};

export const invalidEmptyFeaturesArray = {
  ...validEpigenomicsFeatureResponsePacket,
  features: [],
};

export const invalidNegativeCoordinate = {
  ...validGenomicRegion,
  start: -1,
};

export const invalidEndBeforeStart = {
  ...validGenomicRegion,
  start: 5000,
  end: 1000,
};

export const invalidMissingnessRateTooHigh = {
  ...validEpigenomicsQCReport,
  missingnessProfile: {
    ...validEpigenomicsQCReport.missingnessProfile,
    overallFeatureMissingFraction: 1.5,
  },
};

export const invalidMappingWithValues = {
  ...validRegionToGeneMapping,
  values: { "sample-1": 1.23 },
};

export const invalidHandoffMissingQualifiedFeatures = {
  ...validBioactivityPoDHandoffPacket,
  qualifiedFeatures: [],
};

export const invalidHandoffMissingDoseResponseReadySubset = {
  ...validBioactivityPoDHandoffPacket,
  doseResponseReadySubset: [],
};
