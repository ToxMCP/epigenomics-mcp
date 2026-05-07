import { describe, it, expect } from "vitest";
import {
  ModalitySchema,
  FeatureClassSchema,
} from "../../src/contracts/features.js";
import {
  MappingTypeSchema,
  ExternalDatabaseMappingMethodSchema,
  DownstreamUseRuleSchema,
  BiosampleContextMatchSchema,
  MappingConfidenceSchema,
} from "../../src/contracts/mapping.js";
import {
  QualificationStatusSchema,
  EpigenomicsQualificationStatusSchema,
} from "../../src/contracts/qualification.js";
import {
  StudyTypeSchema,
  AssayFamilySchema,
  DoseUnitSchema,
  BiosampleContextSchema,
} from "../../src/contracts/dataset.js";
import {
  GenomeBuildSchema,
  CoordinateSystemSchema,
} from "../../src/contracts/coordinates.js";
import {
  DynamicRangeBandSchema,
  ReplicateStabilityBandSchema,
} from "../../src/contracts/qc.js";

/**
 * Enum compatibility tests.
 *
 * Ensures that related enums across contracts remain compatible and that
 * every enum value round-trips through its schema.
 */

describe("enum compatibility", () => {
  describe("Modality vs FeatureClass compatibility", () => {
    it("dna_methylation_array and dna_methylation_bsseq modalities exist", () => {
      expect(ModalitySchema.parse("dna_methylation_array")).toBe("dna_methylation_array");
      expect(ModalitySchema.parse("dna_methylation_bsseq")).toBe("dna_methylation_bsseq");
    });

    it("atac_seq and chip_seq modalities exist", () => {
      expect(ModalitySchema.parse("atac_seq")).toBe("atac_seq");
      expect(ModalitySchema.parse("chip_seq")).toBe("chip_seq");
    });

    it("rejects modality not in the enum", () => {
      expect(() => ModalitySchema.parse("rna_seq")).toThrow();
    });

    it("rejects feature class not in the enum", () => {
      expect(() => FeatureClassSchema.parse("snp")).toThrow();
    });

    it("all modality values are unique", () => {
      const values = ModalitySchema.options;
      expect(new Set(values).size).toBe(values.length);
    });

    it("all feature class values are unique", () => {
      const values = FeatureClassSchema.options;
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe("Mapping confidence compatibility", () => {
    it("accepts all confidence levels", () => {
      const levels = MappingConfidenceSchema.options;
      for (const level of levels) {
        expect(MappingConfidenceSchema.parse(level)).toBe(level);
      }
    });
  });

  describe("MappingType vs ExternalDatabaseMappingMethod compatibility", () => {
    it("shared methods are accepted by both enums", () => {
      const shared = ["enhancer_target_from_database", "chromatin_interaction_supported"];
      for (const method of shared) {
        expect(MappingTypeSchema.parse(method)).toBe(method);
        expect(ExternalDatabaseMappingMethodSchema.parse(method)).toBe(method);
      }
    });

    it("nearest_gene is only in MappingType", () => {
      expect(MappingTypeSchema.parse("nearest_gene")).toBe("nearest_gene");
      expect(() => ExternalDatabaseMappingMethodSchema.parse("nearest_gene")).toThrow();
    });
  });

  describe("QualificationStatus vs EpigenomicsQualificationStatus compatibility", () => {
    it("shared statuses are accepted by both enums", () => {
      const shared = ["accepted_for_pod", "exploratory_only", "excluded_insufficient_design"];
      for (const status of shared) {
        expect(QualificationStatusSchema.parse(status)).toBe(status);
        expect(EpigenomicsQualificationStatusSchema.parse(status)).toBe(status);
      }
    });

    it("granular epigenomics statuses are not in base QualificationStatus", () => {
      const granular = [
        "excluded_invalid_coordinates",
        "excluded_missing_genome_build",
        "excluded_high_missingness",
        "excluded_mapping_ambiguous",
        "excluded_non_numeric_response",
        "excluded_confounding_dominant",
      ];
      for (const status of granular) {
        expect(EpigenomicsQualificationStatusSchema.parse(status)).toBe(status);
        expect(() => QualificationStatusSchema.parse(status)).toThrow();
      }
    });
  });

  describe("Dataset metadata enums", () => {
    it("accepts all study types", () => {
      for (const value of StudyTypeSchema.options) {
        expect(StudyTypeSchema.parse(value)).toBe(value);
      }
    });

    it("accepts all assay families", () => {
      for (const value of AssayFamilySchema.options) {
        expect(AssayFamilySchema.parse(value)).toBe(value);
      }
    });

    it("accepts all dose units", () => {
      for (const value of DoseUnitSchema.options) {
        expect(DoseUnitSchema.parse(value)).toBe(value);
      }
    });

    it("accepts all biosample contexts", () => {
      for (const value of BiosampleContextSchema.options) {
        expect(BiosampleContextSchema.parse(value)).toBe(value);
      }
    });
  });

  describe("Coordinate enums", () => {
    it("accepts all genome builds", () => {
      for (const value of GenomeBuildSchema.options) {
        expect(GenomeBuildSchema.parse(value)).toBe(value);
      }
    });

    it("accepts all coordinate systems", () => {
      for (const value of CoordinateSystemSchema.options) {
        expect(CoordinateSystemSchema.parse(value)).toBe(value);
      }
    });
  });

  describe("QC band enums", () => {
    it("accepts all dynamic range bands", () => {
      for (const value of DynamicRangeBandSchema.options) {
        expect(DynamicRangeBandSchema.parse(value)).toBe(value);
      }
    });

    it("accepts all replicate stability bands", () => {
      for (const value of ReplicateStabilityBandSchema.options) {
        expect(ReplicateStabilityBandSchema.parse(value)).toBe(value);
      }
    });
  });

  describe("DownstreamUseRule enum", () => {
    it("accepts all downstream use rules", () => {
      for (const value of DownstreamUseRuleSchema.options) {
        expect(DownstreamUseRuleSchema.parse(value)).toBe(value);
      }
    });
  });

  describe("BiosampleContextMatch enum", () => {
    it("accepts all biosample context match values", () => {
      for (const value of BiosampleContextMatchSchema.options) {
        expect(BiosampleContextMatchSchema.parse(value)).toBe(value);
      }
    });
  });
});
