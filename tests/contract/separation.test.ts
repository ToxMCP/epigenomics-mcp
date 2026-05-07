import { describe, it, expect } from "vitest";
import { EpigenomicFeatureSchema } from "../../src/contracts/features.js";
import { RegionToGeneMappingSchema, ExternalDatabaseMappingSchema, MappingPayloadsSchema } from "../../src/contracts/mapping.js";
import {
  EpigenomicsFeatureResponsePacketSchema,
  BioactivityPoDHandoffPacketSchema,
} from "../../src/contracts/packets.js";
import {
  validCpGFeature,
  validRegionFeature,
  validGenomicRegion,
  validRegionToGeneMapping,
  validExternalDatabaseMapping,
  validEpigenomicsFeatureResponsePacket,
  validBioactivityPoDHandoffPacket,
  validExperimentalDesign,
  validDatasetProvenance,
  validQualificationSummary,
  validDateTime,
  validUuid,
} from "./fixtures.js";

/**
 * Measured-feature vs inferred-mapping separation tests.
 *
 * The architecture deliberately keeps measured feature payloads separate
 * from region-to-gene mappings.  These tests ensure the schemas enforce
 * that separation so downstream consumers cannot accidentally collapse
 * measurement and inference.
 */

describe("measured features and inferred mappings must not collapse", () => {
  describe("EpigenomicFeature rejects mapping fields", () => {
    it("rejects geneIds on a CpG feature", () => {
      const invalid = { ...validCpGFeature, geneIds: ["BRCA1"] };
      expect(() => EpigenomicFeatureSchema.parse(invalid)).toThrow();
    });

    it("rejects geneIds on a region feature", () => {
      const invalid = { ...validRegionFeature, geneIds: ["BRCA1"] };
      expect(() => EpigenomicFeatureSchema.parse(invalid)).toThrow();
    });

    it("rejects method on a feature", () => {
      const invalid = { ...validCpGFeature, method: "nearest_gene" };
      expect(() => EpigenomicFeatureSchema.parse(invalid)).toThrow();
    });

    it("rejects confidence on a feature", () => {
      const invalid = { ...validCpGFeature, confidence: "high" };
      expect(() => EpigenomicFeatureSchema.parse(invalid)).toThrow();
    });

    it("rejects pathwayRollupAllowed on a feature", () => {
      const invalid = { ...validCpGFeature, pathwayRollupAllowed: true };
      expect(() => EpigenomicFeatureSchema.parse(invalid)).toThrow();
    });

    it("rejects distanceBp on a feature", () => {
      const invalid = { ...validCpGFeature, distanceBp: 500 };
      expect(() => EpigenomicFeatureSchema.parse(invalid)).toThrow();
    });
  });

  describe("RegionToGeneMapping rejects measurement fields", () => {
    it("rejects values on a mapping", () => {
      const invalid = { ...validRegionToGeneMapping, values: { "sample-1": 1.23 } };
      expect(() => RegionToGeneMappingSchema.parse(invalid)).toThrow();
    });

    it("rejects signalMetric on a mapping", () => {
      const invalid = { ...validRegionToGeneMapping, signalMetric: "beta_value" };
      expect(() => RegionToGeneMappingSchema.parse(invalid)).toThrow();
    });

    it("rejects modality on a mapping", () => {
      const invalid = { ...validRegionToGeneMapping, modality: "atac_seq" };
      expect(() => RegionToGeneMappingSchema.parse(invalid)).toThrow();
    });

    it("rejects featureClass on a mapping", () => {
      const invalid = { ...validRegionToGeneMapping, featureClass: "atac_peak" };
      expect(() => RegionToGeneMappingSchema.parse(invalid)).toThrow();
    });
  });

  describe("ExternalDatabaseMapping rejects measurement fields", () => {
    it("rejects values on an external database mapping", () => {
      const invalid = { ...validExternalDatabaseMapping, values: { "sample-1": 1.23 } };
      expect(() => ExternalDatabaseMappingSchema.parse(invalid)).toThrow();
    });

    it("rejects signalMetric on an external database mapping", () => {
      const invalid = { ...validExternalDatabaseMapping, signalMetric: "beta_value" };
      expect(() => ExternalDatabaseMappingSchema.parse(invalid)).toThrow();
    });
  });

  describe("MappingPayloads keeps mappings separate", () => {
    it("accepts payloads with only regionToGeneMappings", () => {
      const payloads = {
        regionToGeneMappings: [validRegionToGeneMapping],
      };
      const parsed = MappingPayloadsSchema.parse(payloads);
      expect(parsed.regionToGeneMappings).toHaveLength(1);
      expect(parsed.externalDatabaseMappings).toEqual([]);
    });

    it("accepts payloads with only externalDatabaseMappings", () => {
      const payloads = {
        externalDatabaseMappings: [validExternalDatabaseMapping],
      };
      const parsed = MappingPayloadsSchema.parse(payloads);
      expect(parsed.externalDatabaseMappings).toHaveLength(1);
      expect(parsed.regionToGeneMappings).toEqual([]);
    });

    it("rejects mixing feature objects into regionToGeneMappings", () => {
      const payloads = {
        regionToGeneMappings: [
          { ...validCpGFeature, geneIds: ["BRCA1"], method: "nearest_gene", confidence: "low" },
        ],
      };
      expect(() => MappingPayloadsSchema.parse(payloads)).toThrow();
    });
  });

  describe("EpigenomicsFeatureResponsePacket keeps features and mappings separate", () => {
    it("accepts packet with mappingPayloads", () => {
      const packet = {
        ...validEpigenomicsFeatureResponsePacket,
        mappingPayloads: {
          regionToGeneMappings: [validRegionToGeneMapping],
          externalDatabaseMappings: [validExternalDatabaseMapping],
        },
      };
      const parsed = EpigenomicsFeatureResponsePacketSchema.parse(packet);
      expect(parsed.mappingPayloads?.regionToGeneMappings).toHaveLength(1);
      expect(parsed.mappingPayloads?.externalDatabaseMappings).toHaveLength(1);
    });

    it("features array does not contain mapping fields", () => {
      const packet = {
        ...validEpigenomicsFeatureResponsePacket,
        features: [
          {
            ...validCpGFeature,
            geneIds: ["BRCA1"],
          },
        ],
      };
      expect(() => EpigenomicsFeatureResponsePacketSchema.parse(packet)).toThrow();
    });
  });

  describe("BioactivityPoDHandoffPacket doseResponseReadySubset references features, not mappings", () => {
    it("accepts handoff with feature IDs in doseResponseReadySubset", () => {
      const parsed = BioactivityPoDHandoffPacketSchema.parse(validBioactivityPoDHandoffPacket);
      expect(parsed.doseResponseReadySubset).toContain("cg00000001");
    });

    it("rejects empty doseResponseReadySubset", () => {
      const invalid = {
        ...validBioactivityPoDHandoffPacket,
        doseResponseReadySubset: [],
      };
      expect(() => BioactivityPoDHandoffPacketSchema.parse(invalid)).toThrow();
    });
  });
});
