import { describe, it, expect } from "vitest";
import {
  SourceCoordinateSystemSchema,
  isRegionBearingFeatureClass,
  validateCoordinateSystemDeclarations,
} from "../../src/validators/coordinate_validator.js";

describe("SourceCoordinateSystemSchema", () => {
  it("accepts ucsc_bed_0based_half_open", () => {
    const result = SourceCoordinateSystemSchema.safeParse("ucsc_bed_0based_half_open");
    expect(result.success).toBe(true);
  });

  it("accepts gff_gtf_1based_closed", () => {
    const result = SourceCoordinateSystemSchema.safeParse("gff_gtf_1based_closed");
    expect(result.success).toBe(true);
  });

  it("accepts platform_native_probe", () => {
    const result = SourceCoordinateSystemSchema.safeParse("platform_native_probe");
    expect(result.success).toBe(true);
  });

  it("accepts no_coordinates_feature_id_only", () => {
    const result = SourceCoordinateSystemSchema.safeParse("no_coordinates_feature_id_only");
    expect(result.success).toBe(true);
  });

  it("rejects unsupported coordinate system values", () => {
    const result = SourceCoordinateSystemSchema.safeParse("unsupported_system");
    expect(result.success).toBe(false);
  });
});

describe("isRegionBearingFeatureClass", () => {
  it("returns true for atac_peak", () => {
    expect(isRegionBearingFeatureClass("atac_peak")).toBe(true);
  });

  it("returns true for chip_peak_narrow", () => {
    expect(isRegionBearingFeatureClass("chip_peak_narrow")).toBe(true);
  });

  it("returns true for chip_peak_broad", () => {
    expect(isRegionBearingFeatureClass("chip_peak_broad")).toBe(true);
  });

  it("returns true for histone_mark_peak", () => {
    expect(isRegionBearingFeatureClass("histone_mark_peak")).toBe(true);
  });

  it("returns true for chromatin_interaction", () => {
    expect(isRegionBearingFeatureClass("chromatin_interaction")).toBe(true);
  });

  it("returns true for dmr", () => {
    expect(isRegionBearingFeatureClass("dmr")).toBe(true);
  });

  it("returns true for differential_methylated_region", () => {
    expect(isRegionBearingFeatureClass("differential_methylated_region")).toBe(true);
  });

  it("returns false for cpg_methylation", () => {
    expect(isRegionBearingFeatureClass("cpg_methylation")).toBe(false);
  });

  it("returns false for ncrna_expression", () => {
    expect(isRegionBearingFeatureClass("ncrna_expression")).toBe(false);
  });
});

describe("validateCoordinateSystemDeclarations", () => {
  it("passes when region-bearing features declare a valid system", () => {
    const result = validateCoordinateSystemDeclarations([
      { featureId: "f1", featureClass: "atac_peak", declaredSystem: "ucsc_bed_0based_half_open" },
      { featureId: "f2", featureClass: "chip_peak_narrow", declaredSystem: "gff_gtf_1based_closed" },
      { featureId: "f3", featureClass: "dmr", declaredSystem: "platform_native_probe" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("emits EPI002 when region-bearing feature has no declaration", () => {
    const result = validateCoordinateSystemDeclarations([
      { featureId: "f1", featureClass: "atac_peak" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/EPI002/);
    expect(result.errors[0]).toMatch(/f1/);
    expect(result.errors[0]).toMatch(/atac_peak/);
  });

  it("emits EPI002 when region-bearing feature declares no_coordinates_feature_id_only", () => {
    const result = validateCoordinateSystemDeclarations([
      { featureId: "f1", featureClass: "atac_peak", declaredSystem: "no_coordinates_feature_id_only" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/EPI002/);
    expect(result.errors[0]).toMatch(/no_coordinates_feature_id_only/);
  });

  it("passes for feature-id-only inputs with no_coordinates_feature_id_only", () => {
    const result = validateCoordinateSystemDeclarations([
      { featureId: "f1", featureClass: "cpg_methylation", declaredSystem: "no_coordinates_feature_id_only" },
      { featureId: "f2", featureClass: "ncrna_expression", declaredSystem: "no_coordinates_feature_id_only" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("passes for feature-id-only inputs without any declared system", () => {
    const result = validateCoordinateSystemDeclarations([
      { featureId: "f1", featureClass: "cpg_methylation" },
      { featureId: "f2", featureClass: "ncrna_expression" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("emits EPI002 for unsupported declared system values", () => {
    const result = validateCoordinateSystemDeclarations([
      { featureId: "f1", featureClass: "atac_peak", declaredSystem: "unsupported_system" as unknown as "ucsc_bed_0based_half_open" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/EPI002/);
    expect(result.errors[0]).toMatch(/unsupported_system/);
  });

  it("reports multiple errors independently", () => {
    const result = validateCoordinateSystemDeclarations([
      { featureId: "f1", featureClass: "atac_peak" },
      { featureId: "f2", featureClass: "chip_peak_broad", declaredSystem: "no_coordinates_feature_id_only" },
      { featureId: "f3", featureClass: "atac_peak", declaredSystem: "bad_system" as unknown as "ucsc_bed_0based_half_open" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toMatch(/f1/);
    expect(result.errors[1]).toMatch(/f2/);
    expect(result.errors[2]).toMatch(/f3/);
  });

  it("catches schema-level errors in declarations", () => {
    const result = validateCoordinateSystemDeclarations([
      { featureId: "", featureClass: "atac_peak" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
