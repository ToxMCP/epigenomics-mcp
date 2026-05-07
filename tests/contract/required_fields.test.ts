import { describe, it, expect } from "vitest";
import {
  EpigenomicsFeatureResponsePacketSchema,
  BioactivityPoDHandoffPacketSchema,
} from "../../src/contracts/packets.js";
import { EpigenomicFeatureSchema } from "../../src/contracts/features.js";
import { GenomicRegionSchema, GenomicCoordinateSchema } from "../../src/contracts/coordinates.js";
import { ExperimentalDesignSchema, SampleMetadataSchema, DoseGroupSchema } from "../../src/contracts/design.js";
import { DatasetProvenanceSchema, ProvenanceRecordSchema } from "../../src/contracts/provenance.js";
import { RegionToGeneMappingSchema, ExternalDatabaseMappingSchema } from "../../src/contracts/mapping.js";
import { EpigenomicsQCReportSchema } from "../../src/contracts/qc.js";
import {
  validEpigenomicsFeatureResponsePacket,
  validBioactivityPoDHandoffPacket,
  validCpGFeature,
  validGenomicRegion,
  validExperimentalDesign,
  validDatasetProvenance,
  validProvenanceRecord,
  validRegionToGeneMapping,
  validExternalDatabaseMapping,
  validEpigenomicsQCReport,
  validDateTime,
} from "./fixtures.js";

/**
 * Required field tests.
 *
 * Verifies that omitting a required field causes parse failure.
 */

describe("required fields", () => {
  describe("EpigenomicsFeatureResponsePacket", () => {
    it.each([
      ["schemaVersion", (p: unknown) => ({ ...(p as object), schemaVersion: undefined })],
      ["schemaName", (p: unknown) => ({ ...(p as object), schemaName: undefined })],
      ["packetId", (p: unknown) => ({ ...(p as object), packetId: undefined })],
      ["datasetMetadataRef", (p: unknown) => ({ ...(p as object), datasetMetadataRef: undefined })],
      ["designRef", (p: unknown) => ({ ...(p as object), designRef: undefined })],
      ["features", (p: unknown) => ({ ...(p as object), features: undefined })],
      ["design", (p: unknown) => ({ ...(p as object), design: undefined })],
      ["provenance", (p: unknown) => ({ ...(p as object), provenance: undefined })],
      ["qualificationSummary", (p: unknown) => ({ ...(p as object), qualificationSummary: undefined })],
      ["qcReportRef", (p: unknown) => ({ ...(p as object), qcReportRef: undefined })],
      ["generatedAt", (p: unknown) => ({ ...(p as object), generatedAt: undefined })],
    ] as const)("rejects when %s is missing", (_name, transform) => {
      const invalid = transform(validEpigenomicsFeatureResponsePacket);
      expect(() => EpigenomicsFeatureResponsePacketSchema.parse(invalid)).toThrow();
    });

    it("rejects empty features array", () => {
      const invalid = { ...validEpigenomicsFeatureResponsePacket, features: [] };
      expect(() => EpigenomicsFeatureResponsePacketSchema.parse(invalid)).toThrow();
    });
  });

  describe("BioactivityPoDHandoffPacket", () => {
    it.each([
      ["schemaVersion", (p: unknown) => ({ ...(p as object), schemaVersion: undefined })],
      ["schemaName", (p: unknown) => ({ ...(p as object), schemaName: undefined })],
      ["handoffId", (p: unknown) => ({ ...(p as object), handoffId: undefined })],
      ["sourcePacketRef", (p: unknown) => ({ ...(p as object), sourcePacketRef: undefined })],
      ["qualifiedFeatures", (p: unknown) => ({ ...(p as object), qualifiedFeatures: undefined })],
      ["doseResponseReadySubset", (p: unknown) => ({ ...(p as object), doseResponseReadySubset: undefined })],
      ["generatedAt", (p: unknown) => ({ ...(p as object), generatedAt: undefined })],
    ] as const)("rejects when %s is missing", (_name, transform) => {
      const invalid = transform(validBioactivityPoDHandoffPacket);
      expect(() => BioactivityPoDHandoffPacketSchema.parse(invalid)).toThrow();
    });

    it("rejects empty qualifiedFeatures array", () => {
      const invalid = { ...validBioactivityPoDHandoffPacket, qualifiedFeatures: [] };
      expect(() => BioactivityPoDHandoffPacketSchema.parse(invalid)).toThrow();
    });

    it("rejects empty doseResponseReadySubset array", () => {
      const invalid = { ...validBioactivityPoDHandoffPacket, doseResponseReadySubset: [] };
      expect(() => BioactivityPoDHandoffPacketSchema.parse(invalid)).toThrow();
    });
  });

  describe("EpigenomicFeature", () => {
    it.each([
      ["featureId", (f: unknown) => ({ ...(f as object), featureId: undefined })],
      ["featureClass", (f: unknown) => ({ ...(f as object), featureClass: undefined })],
      ["modality", (f: unknown) => ({ ...(f as object), modality: undefined })],
      ["signalMetric", (f: unknown) => ({ ...(f as object), signalMetric: undefined })],
      ["values", (f: unknown) => ({ ...(f as object), values: undefined })],
    ] as const)("rejects when %s is missing", (_name, transform) => {
      const invalid = transform(validCpGFeature);
      expect(() => EpigenomicFeatureSchema.parse(invalid)).toThrow();
    });

    it("rejects when both measuredRegion and measuredIdentifier are missing", () => {
      const invalid = { ...validCpGFeature, measuredIdentifier: undefined };
      expect(() => EpigenomicFeatureSchema.parse(invalid)).toThrow();
    });
  });

  describe("GenomicRegion", () => {
    it.each([
      ["chrom", (r: unknown) => ({ ...(r as object), chrom: undefined })],
      ["start", (r: unknown) => ({ ...(r as object), start: undefined })],
      ["end", (r: unknown) => ({ ...(r as object), end: undefined })],
      ["build", (r: unknown) => ({ ...(r as object), build: undefined })],
      ["coordinateSystem", (r: unknown) => ({ ...(r as object), coordinateSystem: undefined })],
    ] as const)("rejects when %s is missing", (_name, transform) => {
      const invalid = transform(validGenomicRegion);
      expect(() => GenomicRegionSchema.parse(invalid)).toThrow();
    });
  });

  describe("ExperimentalDesign", () => {
    it.each([
      ["designId", (d: unknown) => ({ ...(d as object), designId: undefined })],
      ["species", (d: unknown) => ({ ...(d as object), species: undefined })],
      ["doseGroups", (d: unknown) => ({ ...(d as object), doseGroups: undefined })],
      ["samples", (d: unknown) => ({ ...(d as object), samples: undefined })],
      ["hasControls", (d: unknown) => ({ ...(d as object), hasControls: undefined })],
      ["minReplicatesPerGroup", (d: unknown) => ({ ...(d as object), minReplicatesPerGroup: undefined })],
    ] as const)("rejects when %s is missing", (_name, transform) => {
      const invalid = transform(validExperimentalDesign);
      expect(() => ExperimentalDesignSchema.parse(invalid)).toThrow();
    });
  });

  describe("DatasetProvenance", () => {
    it("rejects when upstreamSteps is missing", () => {
      const invalid = { ...validDatasetProvenance, upstreamSteps: undefined };
      expect(() => DatasetProvenanceSchema.parse(invalid)).toThrow();
    });

    it("rejects empty upstreamSteps array", () => {
      const invalid = { ...validDatasetProvenance, upstreamSteps: [] };
      expect(() => DatasetProvenanceSchema.parse(invalid)).toThrow();
    });
  });

  describe("ProvenanceRecord", () => {
    it.each([
      ["stepName", (r: unknown) => ({ ...(r as object), stepName: undefined })],
      ["toolName", (r: unknown) => ({ ...(r as object), toolName: undefined })],
      ["toolVersion", (r: unknown) => ({ ...(r as object), toolVersion: undefined })],
    ] as const)("rejects when %s is missing", (_name, transform) => {
      const invalid = transform(validProvenanceRecord);
      expect(() => ProvenanceRecordSchema.parse(invalid)).toThrow();
    });
  });

  describe("RegionToGeneMapping", () => {
    it.each([
      ["featureId", (m: unknown) => ({ ...(m as object), featureId: undefined })],
      ["geneIds", (m: unknown) => ({ ...(m as object), geneIds: undefined })],
      ["method", (m: unknown) => ({ ...(m as object), method: undefined })],
      ["confidence", (m: unknown) => ({ ...(m as object), confidence: undefined })],
    ] as const)("rejects when %s is missing", (_name, transform) => {
      const invalid = transform(validRegionToGeneMapping);
      expect(() => RegionToGeneMappingSchema.parse(invalid)).toThrow();
    });
  });

  describe("ExternalDatabaseMapping", () => {
    it.each([
      ["featureId", (m: unknown) => ({ ...(m as object), featureId: undefined })],
      ["geneIds", (m: unknown) => ({ ...(m as object), geneIds: undefined })],
      ["method", (m: unknown) => ({ ...(m as object), method: undefined })],
      ["confidence", (m: unknown) => ({ ...(m as object), confidence: undefined })],
      ["sourceResource", (m: unknown) => ({ ...(m as object), sourceResource: undefined })],
      ["annotationRelease", (m: unknown) => ({ ...(m as object), annotationRelease: undefined })],
      ["biosampleContextMatch", (m: unknown) => ({ ...(m as object), biosampleContextMatch: undefined })],
      ["downstreamUseRule", (m: unknown) => ({ ...(m as object), downstreamUseRule: undefined })],
    ] as const)("rejects when %s is missing", (_name, transform) => {
      const invalid = transform(validExternalDatabaseMapping);
      expect(() => ExternalDatabaseMappingSchema.parse(invalid)).toThrow();
    });
  });

  describe("EpigenomicsQCReport", () => {
    it.each([
      ["reportId", (r: unknown) => ({ ...(r as object), reportId: undefined })],
      ["schemaName", (r: unknown) => ({ ...(r as object), schemaName: undefined })],
      ["schemaVersion", (r: unknown) => ({ ...(r as object), schemaVersion: undefined })],
      ["datasetId", (r: unknown) => ({ ...(r as object), datasetId: undefined })],
      ["designValidation", (r: unknown) => ({ ...(r as object), designValidation: undefined })],
      ["coordinateValidation", (r: unknown) => ({ ...(r as object), coordinateValidation: undefined })],
      ["missingnessProfile", (r: unknown) => ({ ...(r as object), missingnessProfile: undefined })],
      ["varianceProfile", (r: unknown) => ({ ...(r as object), varianceProfile: undefined })],
      ["confoundingSummary", (r: unknown) => ({ ...(r as object), confoundingSummary: undefined })],
      ["acceptedCount", (r: unknown) => ({ ...(r as object), acceptedCount: undefined })],
      ["excludedCount", (r: unknown) => ({ ...(r as object), excludedCount: undefined })],
      ["warningCount", (r: unknown) => ({ ...(r as object), warningCount: undefined })],
      ["generatedAt", (r: unknown) => ({ ...(r as object), generatedAt: undefined })],
    ] as const)("rejects when %s is missing", (_name, transform) => {
      const invalid = transform(validEpigenomicsQCReport);
      expect(() => EpigenomicsQCReportSchema.parse(invalid)).toThrow();
    });
  });
});
