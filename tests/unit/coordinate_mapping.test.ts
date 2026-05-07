import { describe, it, expect } from "vitest";
import {
  normaliseToCanonical,
  convertFromCanonical,
  normalizeCoordinateRecord,
  normalizeCoordinateRecords,
} from "../../src/coordinate_mapping/normalise.js";
import { SourceCoordinateSystem } from "../../src/validators/coordinate_validator.js";
import {
  CoordinateConversionInputSchema,
  NormalizedCoordinateRecordSchema,
  CoordinateConversionResultSchema,
  BatchCoordinateConversionResultSchema,
} from "../../src/contracts/coordinate_conversion.js";

describe("normaliseToCanonical", () => {
  it("leaves ucsc_bed_0based_half_open unchanged", () => {
    const result = normaliseToCanonical("chr1", 1000, 2000, "ucsc_bed_0based_half_open");
    expect(result.chrom).toBe("chr1");
    expect(result.start).toBe(1000);
    expect(result.end).toBe(2000);
    expect(result.sourceSystem).toBe("ucsc_bed_0based_half_open");
  });

  it("converts gff_gtf_1based_closed by shifting start -1", () => {
    const result = normaliseToCanonical("chr1", 1001, 2000, "gff_gtf_1based_closed");
    expect(result.chrom).toBe("chr1");
    expect(result.start).toBe(1000);
    expect(result.end).toBe(2000);
    expect(result.sourceSystem).toBe("gff_gtf_1based_closed");
  });

  it("passes platform_native_probe through unchanged", () => {
    const result = normaliseToCanonical("chr1", 1000, 2000, "platform_native_probe");
    expect(result.chrom).toBe("chr1");
    expect(result.start).toBe(1000);
    expect(result.end).toBe(2000);
    expect(result.sourceSystem).toBe("platform_native_probe");
  });

  it("throws for no_coordinates_feature_id_only", () => {
    expect(() =>
      normaliseToCanonical("chr1", 1000, 2000, "no_coordinates_feature_id_only"),
    ).toThrow(/no_coordinates_feature_id_only/);
  });
});

describe("convertFromCanonical", () => {
  it("leaves ucsc_bed_0based_half_open unchanged", () => {
    const region = { chrom: "chr1", start: 1000, end: 2000, sourceSystem: "ucsc_bed_0based_half_open" as SourceCoordinateSystem };
    const result = convertFromCanonical(region, "ucsc_bed_0based_half_open");
    expect(result.chrom).toBe("chr1");
    expect(result.start).toBe(1000);
    expect(result.end).toBe(2000);
  });

  it("converts to gff_gtf_1based_closed by shifting start +1", () => {
    const region = { chrom: "chr1", start: 1000, end: 2000, sourceSystem: "ucsc_bed_0based_half_open" as SourceCoordinateSystem };
    const result = convertFromCanonical(region, "gff_gtf_1based_closed");
    expect(result.chrom).toBe("chr1");
    expect(result.start).toBe(1001);
    expect(result.end).toBe(2000);
  });

  it("passes platform_native_probe through unchanged", () => {
    const region = { chrom: "chr1", start: 1000, end: 2000, sourceSystem: "gff_gtf_1based_closed" as SourceCoordinateSystem };
    const result = convertFromCanonical(region, "platform_native_probe");
    expect(result.chrom).toBe("chr1");
    expect(result.start).toBe(1000);
    expect(result.end).toBe(2000);
  });

  it("throws for no_coordinates_feature_id_only", () => {
    const region = { chrom: "chr1", start: 1000, end: 2000, sourceSystem: "ucsc_bed_0based_half_open" as SourceCoordinateSystem };
    expect(() => convertFromCanonical(region, "no_coordinates_feature_id_only")).toThrow(
      /no_coordinates_feature_id_only/,
    );
  });
});

describe("normalizeCoordinateRecord", () => {
  it("passes through ucsc_bed_0based_half_open unchanged", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      sourceSystem: "ucsc_bed_0based_half_open",
      originalCoordinateText: "chr1:1000-2000",
    });
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalizedRecord!.start).toBe(1000);
    expect(result.normalizedRecord!.end).toBe(2000);
    expect(result.normalizedRecord!.provenance.conversionOperation).toBe(
      "pass-through (already 0-based half-open)",
    );
  });

  it("converts gff_gtf_1based_closed by shifting start -1", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 1001,
      end: 2000,
      sourceSystem: "gff_gtf_1based_closed",
      originalCoordinateText: "chr1:1001-2000",
    });
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalizedRecord!.start).toBe(1000);
    expect(result.normalizedRecord!.end).toBe(2000);
    expect(result.normalizedRecord!.provenance.conversionOperation).toBe(
      "start shifted by -1 (1-based closed → 0-based half-open)",
    );
  });

  it("converts single-base 1-based feature to 0-based half-open", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 1,
      end: 1,
      sourceSystem: "gff_gtf_1based_closed",
      originalCoordinateText: "chr1:1-1",
    });
    expect(result.success).toBe(true);
    expect(result.normalizedRecord!.start).toBe(0);
    expect(result.normalizedRecord!.end).toBe(1);
  });

  it("passes platform_native_probe through unchanged", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      sourceSystem: "platform_native_probe",
      originalCoordinateText: "chr1:1000-2000",
    });
    expect(result.success).toBe(true);
    expect(result.normalizedRecord!.start).toBe(1000);
    expect(result.normalizedRecord!.end).toBe(2000);
  });

  it("preserves original coordinate text and source system", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 1001,
      end: 2000,
      sourceSystem: "gff_gtf_1based_closed",
      originalCoordinateText: "chr1:1001-2000",
    });
    expect(result.success).toBe(true);
    expect(result.normalizedRecord!.originalCoordinateText).toBe("chr1:1001-2000");
    expect(result.normalizedRecord!.sourceSystem).toBe("gff_gtf_1based_closed");
  });

  it("preserves build when provided", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      sourceSystem: "ucsc_bed_0based_half_open",
      originalCoordinateText: "chr1:1000-2000",
      build: "hg38",
    });
    expect(result.success).toBe(true);
    expect(result.normalizedRecord!.build).toBe("hg38");
  });

  it("includes provenance with timestamp and operation", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 1001,
      end: 2000,
      sourceSystem: "gff_gtf_1based_closed",
      originalCoordinateText: "chr1:1001-2000",
    });
    expect(result.success).toBe(true);
    expect(result.normalizedRecord!.provenance.originalCoordinateText).toBe(
      "chr1:1001-2000",
    );
    expect(result.normalizedRecord!.provenance.originalSystem).toBe(
      "gff_gtf_1based_closed",
    );
    expect(result.normalizedRecord!.provenance.convertedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(result.normalizedRecord!.provenance.conversionOperation).toContain(
      "shifted by -1",
    );
  });

  it("rejects negative start coordinate", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: -1,
      end: 100,
      sourceSystem: "ucsc_bed_0based_half_open",
      originalCoordinateText: "chr1:-1-100",
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/EPI003/);
    expect(result.errors[0]).toMatch(/start coordinate -1 is negative/);
  });

  it("rejects negative end coordinate", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 0,
      end: -5,
      sourceSystem: "ucsc_bed_0based_half_open",
      originalCoordinateText: "chr1:0--5",
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/EPI003/);
    expect(result.errors[0]).toMatch(/end coordinate -5 is negative/);
  });

  it("rejects zero-length interval in 0-based system (end === start)", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 100,
      end: 100,
      sourceSystem: "ucsc_bed_0based_half_open",
      originalCoordinateText: "chr1:100-100",
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/EPI003/);
    expect(result.errors[0]).toMatch(/normalized end \(100\) must be greater than normalized start \(100\)/);
  });

  it("rejects inverted interval in 0-based system (end < start)", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 200,
      end: 100,
      sourceSystem: "ucsc_bed_0based_half_open",
      originalCoordinateText: "chr1:200-100",
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/EPI003/);
    expect(result.errors[0]).toMatch(/normalized end \(100\) must be greater than normalized start \(200\)/);
  });

  it("rejects negative normalized start after 1-based conversion", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 0,
      end: 100,
      sourceSystem: "gff_gtf_1based_closed",
      originalCoordinateText: "chr1:0-100",
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/EPI003/);
    expect(result.errors[0]).toMatch(/normalized start coordinate -1 is negative/);
  });

  it("accepts single-base 1-based feature and converts to valid 0-based half-open", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 1,
      end: 1,
      sourceSystem: "gff_gtf_1based_closed",
      originalCoordinateText: "chr1:1-1",
    });
    expect(result.success).toBe(true);
    expect(result.normalizedRecord!.start).toBe(0);
    expect(result.normalizedRecord!.end).toBe(1);
  });

  it("fails for no_coordinates_feature_id_only", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      sourceSystem: "no_coordinates_feature_id_only",
      originalCoordinateText: "feature_001",
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/EPI003/);
    expect(result.errors[0]).toMatch(/no_coordinates_feature_id_only/);
  });

  it("fails for invalid input schema", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: "not_a_number",
      end: 2000,
      sourceSystem: "ucsc_bed_0based_half_open",
      originalCoordinateText: "chr1:1000-2000",
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/start:/);
    expect(result.errors[0]).toMatch(/Expected number/);
  });

  it("preserves original coordinate text in error messages", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 200,
      end: 100,
      sourceSystem: "ucsc_bed_0based_half_open",
      originalCoordinateText: "chr1:200-100",
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("chr1:200-100");
  });
});

describe("normalizeCoordinateRecords (batch)", () => {
  it("converts multiple records and reports overall success", () => {
    const result = normalizeCoordinateRecords([
      {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        sourceSystem: "ucsc_bed_0based_half_open",
        originalCoordinateText: "chr1:1000-2000",
      },
      {
        chrom: "chr1",
        start: 1001,
        end: 2000,
        sourceSystem: "gff_gtf_1based_closed",
        originalCoordinateText: "chr1:1001-2000",
      },
    ]);
    expect(result.overallSuccess).toBe(true);
    expect(result.convertedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].normalizedRecord!.start).toBe(1000);
    expect(result.results[1].normalizedRecord!.start).toBe(1000);
  });

  it("reports overall failure when any record fails", () => {
    const result = normalizeCoordinateRecords([
      {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        sourceSystem: "ucsc_bed_0based_half_open",
        originalCoordinateText: "chr1:1000-2000",
      },
      {
        chrom: "chr1",
        start: 200,
        end: 100,
        sourceSystem: "ucsc_bed_0based_half_open",
        originalCoordinateText: "chr1:200-100",
      },
    ]);
    expect(result.overallSuccess).toBe(false);
    expect(result.convertedCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });

  it("returns empty result for empty input", () => {
    const result = normalizeCoordinateRecords([]);
    expect(result.overallSuccess).toBe(true);
    expect(result.convertedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});

describe("CoordinateConversion schemas", () => {
  it("accepts valid CoordinateConversionInput", () => {
    const input = {
      chrom: "chr1",
      start: 1000,
      end: 2000,
      sourceSystem: "ucsc_bed_0based_half_open",
      originalCoordinateText: "chr1:1000-2000",
    };
    expect(CoordinateConversionInputSchema.parse(input)).toEqual(input);
  });

  it("rejects CoordinateConversionInput with missing originalCoordinateText", () => {
    expect(() =>
      CoordinateConversionInputSchema.parse({
        chrom: "chr1",
        start: 1000,
        end: 2000,
        sourceSystem: "ucsc_bed_0based_half_open",
      }),
    ).toThrow();
  });

  it("rejects NormalizedCoordinateRecord with end <= start", () => {
    expect(() =>
      NormalizedCoordinateRecordSchema.parse({
        chrom: "chr1",
        start: 100,
        end: 100,
        sourceSystem: "ucsc_bed_0based_half_open",
        originalCoordinateText: "chr1:100-100",
        provenance: {
          originalCoordinateText: "chr1:100-100",
          originalSystem: "ucsc_bed_0based_half_open",
          convertedAt: "2024-01-01T00:00:00Z",
          conversionOperation: "pass-through",
        },
      }),
    ).toThrow(/end must be greater than start/);
  });

  it("rejects NormalizedCoordinateRecord with negative start", () => {
    expect(() =>
      NormalizedCoordinateRecordSchema.parse({
        chrom: "chr1",
        start: -1,
        end: 100,
        sourceSystem: "gff_gtf_1based_closed",
        originalCoordinateText: "chr1:0-100",
        provenance: {
          originalCoordinateText: "chr1:0-100",
          originalSystem: "gff_gtf_1based_closed",
          convertedAt: "2024-01-01T00:00:00Z",
          conversionOperation: "shift -1",
        },
      }),
    ).toThrow();
  });

  it("accepts valid CoordinateConversionResult on success", () => {
    const result = {
      success: true,
      normalizedRecord: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        sourceSystem: "ucsc_bed_0based_half_open",
        originalCoordinateText: "chr1:1000-2000",
        provenance: {
          originalCoordinateText: "chr1:1000-2000",
          originalSystem: "ucsc_bed_0based_half_open",
          convertedAt: "2024-01-01T00:00:00Z",
          conversionOperation: "pass-through",
        },
      },
      errors: [],
    };
    expect(CoordinateConversionResultSchema.parse(result)).toEqual(result);
  });

  it("accepts valid CoordinateConversionResult on failure", () => {
    const result = {
      success: false,
      errors: ["EPI003: start coordinate -1 is negative"],
    };
    expect(CoordinateConversionResultSchema.parse(result)).toEqual(result);
  });

  it("accepts valid BatchCoordinateConversionResult", () => {
    const result = {
      overallSuccess: true,
      results: [
        {
          success: true,
          normalizedRecord: {
            chrom: "chr1",
            start: 1000,
            end: 2000,
            sourceSystem: "ucsc_bed_0based_half_open",
            originalCoordinateText: "chr1:1000-2000",
            provenance: {
              originalCoordinateText: "chr1:1000-2000",
              originalSystem: "ucsc_bed_0based_half_open",
              convertedAt: "2024-01-01T00:00:00Z",
              conversionOperation: "pass-through",
            },
          },
          errors: [],
        },
      ],
      convertedCount: 1,
      failedCount: 0,
    };
    expect(BatchCoordinateConversionResultSchema.parse(result)).toEqual(result);
  });
});

describe("edge case conversion math", () => {
  it("handles large coordinates correctly", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 249250621,
      end: 249250622,
      sourceSystem: "gff_gtf_1based_closed",
      originalCoordinateText: "chr1:249250621-249250622",
    });
    expect(result.success).toBe(true);
    expect(result.normalizedRecord!.start).toBe(249250620);
    expect(result.normalizedRecord!.end).toBe(249250622);
  });

  it("handles chromosome X correctly", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chrX",
      start: 1,
      end: 1000,
      sourceSystem: "gff_gtf_1based_closed",
      originalCoordinateText: "chrX:1-1000",
    });
    expect(result.success).toBe(true);
    expect(result.normalizedRecord!.chrom).toBe("chrX");
    expect(result.normalizedRecord!.start).toBe(0);
    expect(result.normalizedRecord!.end).toBe(1000);
  });

  it("handles chromosome M correctly", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chrM",
      start: 1,
      end: 16569,
      sourceSystem: "gff_gtf_1based_closed",
      originalCoordinateText: "chrM:1-16569",
    });
    expect(result.success).toBe(true);
    expect(result.normalizedRecord!.start).toBe(0);
    expect(result.normalizedRecord!.end).toBe(16569);
  });

  it("rejects start=0 in 1-based system because it normalizes to -1", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 0,
      end: 100,
      sourceSystem: "gff_gtf_1based_closed",
      originalCoordinateText: "chr1:0-100",
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/normalized start coordinate -1 is negative/);
  });

  it("accepts start=0 in 0-based system", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 0,
      end: 100,
      sourceSystem: "ucsc_bed_0based_half_open",
      originalCoordinateText: "chr1:0-100",
    });
    expect(result.success).toBe(true);
    expect(result.normalizedRecord!.start).toBe(0);
    expect(result.normalizedRecord!.end).toBe(100);
  });

  it("rejects end=0 in 0-based system (zero-length)", () => {
    const result = normalizeCoordinateRecord({
      chrom: "chr1",
      start: 0,
      end: 0,
      sourceSystem: "ucsc_bed_0based_half_open",
      originalCoordinateText: "chr1:0-0",
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/normalized end \(0\) must be greater than normalized start \(0\)/);
  });
});
