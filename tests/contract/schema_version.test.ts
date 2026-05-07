import { describe, it, expect } from "vitest";
import {
  EpigenomicsFeatureResponsePacketSchema,
  BioactivityPoDHandoffPacketSchema,
} from "../../src/contracts/packets.js";
import { EpigenomicsQCReportSchema } from "../../src/contracts/qc.js";
import {
  EpigenomicsWarningSchema,
  EpigenomicsErrorSchema,
  EpigenomicsFeatureQualificationSchema,
} from "../../src/contracts/qualification.js";
import {
  validEpigenomicsFeatureResponsePacket,
  validBioactivityPoDHandoffPacket,
  validEpigenomicsQCReport,
  validDateTime,
} from "./fixtures.js";

/**
 * Schema version behaviour tests.
 *
 * Locks down literal version constraints so that version bumps are
 * explicit and consumers can rely on schemaVersion for dispatch.
 */

describe("schema version behaviour", () => {
  describe("EpigenomicsFeatureResponsePacket", () => {
    it("accepts the exact literal version 0.1.0", () => {
      const parsed = EpigenomicsFeatureResponsePacketSchema.parse(
        validEpigenomicsFeatureResponsePacket,
      );
      expect(parsed.schemaVersion).toBe("0.1.0");
    });

    it("rejects version 0.2.0", () => {
      const invalid = { ...validEpigenomicsFeatureResponsePacket, schemaVersion: "0.2.0" };
      expect(() => EpigenomicsFeatureResponsePacketSchema.parse(invalid)).toThrow();
    });

    it("rejects version 0.1.1", () => {
      const invalid = { ...validEpigenomicsFeatureResponsePacket, schemaVersion: "0.1.1" };
      expect(() => EpigenomicsFeatureResponsePacketSchema.parse(invalid)).toThrow();
    });

    it("rejects missing schemaVersion", () => {
      const { schemaVersion: _, ...invalid } = validEpigenomicsFeatureResponsePacket;
      expect(() => EpigenomicsFeatureResponsePacketSchema.parse(invalid)).toThrow();
    });

    it("rejects wrong schemaName", () => {
      const invalid = { ...validEpigenomicsFeatureResponsePacket, schemaName: "WrongPacket" };
      expect(() => EpigenomicsFeatureResponsePacketSchema.parse(invalid)).toThrow();
    });
  });

  describe("BioactivityPoDHandoffPacket", () => {
    it("accepts the exact literal version 0.1.0", () => {
      const parsed = BioactivityPoDHandoffPacketSchema.parse(validBioactivityPoDHandoffPacket);
      expect(parsed.schemaVersion).toBe("0.1.0");
    });

    it("rejects version 0.2.0", () => {
      const invalid = { ...validBioactivityPoDHandoffPacket, schemaVersion: "0.2.0" };
      expect(() => BioactivityPoDHandoffPacketSchema.parse(invalid)).toThrow();
    });

    it("rejects wrong schemaName", () => {
      const invalid = { ...validBioactivityPoDHandoffPacket, schemaName: "WrongPacket" };
      expect(() => BioactivityPoDHandoffPacketSchema.parse(invalid)).toThrow();
    });
  });

  describe("EpigenomicsQCReport", () => {
    it("accepts schemaName literal EpigenomicsQCReport", () => {
      const parsed = EpigenomicsQCReportSchema.parse(validEpigenomicsQCReport);
      expect(parsed.schemaName).toBe("EpigenomicsQCReport");
    });

    it("rejects wrong schemaName", () => {
      const invalid = { ...validEpigenomicsQCReport, schemaName: "WrongReport" };
      expect(() => EpigenomicsQCReportSchema.parse(invalid)).toThrow();
    });
  });

  describe("EpigenomicsWarning", () => {
    it("accepts correct schemaName literal", () => {
      const warning = {
        schemaName: "EpigenomicsWarning" as const,
        schemaVersion: "0.1.0",
        warningCode: "EPIW001",
        severity: "caution" as const,
        scope: "dataset" as const,
        message: "Test warning",
        downstreamUseRule: "allow" as const,
      };
      const parsed = EpigenomicsWarningSchema.parse(warning);
      expect(parsed.schemaName).toBe("EpigenomicsWarning");
    });

    it("rejects wrong schemaName", () => {
      const warning = {
        schemaName: "WrongWarning" as const,
        schemaVersion: "0.1.0",
        warningCode: "EPIW001",
        severity: "caution" as const,
        scope: "dataset" as const,
        message: "Test warning",
        downstreamUseRule: "allow" as const,
      };
      expect(() => EpigenomicsWarningSchema.parse(warning)).toThrow();
    });
  });

  describe("EpigenomicsError", () => {
    it("accepts correct schemaName literal", () => {
      const error = {
        schemaName: "EpigenomicsError" as const,
        schemaVersion: "0.1.0",
        errorCode: "EPIE001",
        severity: "fatal" as const,
        scope: "dataset" as const,
        message: "Test error",
      };
      const parsed = EpigenomicsErrorSchema.parse(error);
      expect(parsed.schemaName).toBe("EpigenomicsError");
    });

    it("rejects wrong schemaName", () => {
      const error = {
        schemaName: "WrongError" as const,
        schemaVersion: "0.1.0",
        errorCode: "EPIE001",
        severity: "fatal" as const,
        scope: "dataset" as const,
        message: "Test error",
      };
      expect(() => EpigenomicsErrorSchema.parse(error)).toThrow();
    });
  });

  describe("EpigenomicsFeatureQualification", () => {
    it("accepts correct schemaName literal", () => {
      const qual = {
        schemaName: "EpigenomicsFeatureQualification" as const,
        schemaVersion: "0.1.0",
        featureId: "feat-1",
        qualificationStatus: "accepted_for_pod" as const,
        qualificationReasons: ["OK"],
      };
      const parsed = EpigenomicsFeatureQualificationSchema.parse(qual);
      expect(parsed.schemaName).toBe("EpigenomicsFeatureQualification");
    });

    it("rejects wrong schemaName", () => {
      const qual = {
        schemaName: "WrongQualification" as const,
        schemaVersion: "0.1.0",
        featureId: "feat-1",
        qualificationStatus: "accepted_for_pod" as const,
        qualificationReasons: ["OK"],
      };
      expect(() => EpigenomicsFeatureQualificationSchema.parse(qual)).toThrow();
    });
  });
});
