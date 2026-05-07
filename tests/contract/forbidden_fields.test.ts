import { describe, it, expect } from "vitest";
import {
  EpigenomicsFeatureResponsePacketSchema,
  BioactivityPoDHandoffPacketSchema,
} from "../../src/contracts/packets.js";
import { EpigenomicFeatureSchema } from "../../src/contracts/features.js";
import { GenomicRegionSchema } from "../../src/contracts/coordinates.js";
import { ExperimentalDesignSchema } from "../../src/contracts/design.js";
import { ProvenanceRecordSchema, DatasetProvenanceSchema } from "../../src/contracts/provenance.js";
import { RegionToGeneMappingSchema, ExternalDatabaseMappingSchema } from "../../src/contracts/mapping.js";
import { EpigenomicsQCReportSchema } from "../../src/contracts/qc.js";
import { BaseEnvelopeSchema } from "../../src/contracts/base.js";
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
  validBaseEnvelope,
} from "./fixtures.js";

/**
 * Forbidden field tests.
 *
 * All contract schemas use .strict() mode.  Any unexpected key must cause
 * a parse failure so that contract drift is caught early.
 */

describe("forbidden fields (strict mode)", () => {
  describe("EpigenomicsFeatureResponsePacket", () => {
    it("rejects unknown top-level field", () => {
      const invalid = { ...validEpigenomicsFeatureResponsePacket, extraField: "bad" };
      expect(() => EpigenomicsFeatureResponsePacketSchema.parse(invalid)).toThrow();
    });

    it("rejects nested unknown field in qualificationSummary", () => {
      const invalid = {
        ...validEpigenomicsFeatureResponsePacket,
        qualificationSummary: {
          ...validEpigenomicsFeatureResponsePacket.qualificationSummary,
          extra: 1,
        },
      };
      expect(() => EpigenomicsFeatureResponsePacketSchema.parse(invalid)).toThrow();
    });
  });

  describe("BioactivityPoDHandoffPacket", () => {
    it("rejects unknown top-level field", () => {
      const invalid = { ...validBioactivityPoDHandoffPacket, extraField: "bad" };
      expect(() => BioactivityPoDHandoffPacketSchema.parse(invalid)).toThrow();
    });
  });

  describe("EpigenomicFeature", () => {
    it("rejects unknown field", () => {
      const invalid = { ...validCpGFeature, unknownMetric: 42 };
      expect(() => EpigenomicFeatureSchema.parse(invalid)).toThrow();
    });
  });

  describe("GenomicRegion", () => {
    it("rejects unknown field", () => {
      const invalid = { ...validGenomicRegion, unknownField: true };
      expect(() => GenomicRegionSchema.parse(invalid)).toThrow();
    });
  });

  describe("ExperimentalDesign", () => {
    it("rejects unknown top-level field", () => {
      const invalid = { ...validExperimentalDesign, unknownField: true };
      expect(() => ExperimentalDesignSchema.parse(invalid)).toThrow();
    });
  });

  describe("ProvenanceRecord", () => {
    it("rejects unknown field", () => {
      const invalid = { ...validProvenanceRecord, unknownField: true };
      expect(() => ProvenanceRecordSchema.parse(invalid)).toThrow();
    });
  });

  describe("DatasetProvenance", () => {
    it("rejects unknown field", () => {
      const invalid = { ...validDatasetProvenance, unknownField: true };
      expect(() => DatasetProvenanceSchema.parse(invalid)).toThrow();
    });
  });

  describe("RegionToGeneMapping", () => {
    it("rejects unknown field", () => {
      const invalid = { ...validRegionToGeneMapping, unknownField: true };
      expect(() => RegionToGeneMappingSchema.parse(invalid)).toThrow();
    });
  });

  describe("ExternalDatabaseMapping", () => {
    it("rejects unknown field", () => {
      const invalid = { ...validExternalDatabaseMapping, unknownField: true };
      expect(() => ExternalDatabaseMappingSchema.parse(invalid)).toThrow();
    });
  });

  describe("EpigenomicsQCReport", () => {
    it("rejects unknown top-level field", () => {
      const invalid = { ...validEpigenomicsQCReport, unknownField: true };
      expect(() => EpigenomicsQCReportSchema.parse(invalid)).toThrow();
    });
  });

  describe("BaseEnvelope", () => {
    it("rejects unknown field", () => {
      const invalid = { ...validBaseEnvelope, unknownField: true };
      expect(() => BaseEnvelopeSchema.parse(invalid)).toThrow();
    });
  });
});
