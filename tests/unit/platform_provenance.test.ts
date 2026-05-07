import { describe, it, expect } from "vitest";
import {
  isPlatformDerivedFeature,
  validatePlatformProvenance,
} from "../../src/validators/platform_provenance.js";

describe("isPlatformDerivedFeature", () => {
  it("returns true for dna_methylation_array modality", () => {
    expect(
      isPlatformDerivedFeature({ modality: "dna_methylation_array" }),
    ).toBe(true);
  });

  it("returns true for cpg_methylation with measuredIdentifier", () => {
    expect(
      isPlatformDerivedFeature({
        featureClass: "cpg_methylation",
        measuredIdentifier: "cg000001",
      }),
    ).toBe(true);
  });

  it("returns false for cpg_methylation without measuredIdentifier", () => {
    expect(
      isPlatformDerivedFeature({
        featureClass: "cpg_methylation",
      }),
    ).toBe(false);
  });

  it("returns false for bsseq modality", () => {
    expect(
      isPlatformDerivedFeature({ modality: "dna_methylation_bsseq" }),
    ).toBe(false);
  });

  it("returns false for atac_peak", () => {
    expect(
      isPlatformDerivedFeature({ featureClass: "atac_peak" }),
    ).toBe(false);
  });
});

describe("validatePlatformProvenance – valid cases", () => {
  it("passes for non-platform-derived features without provenance", () => {
    const result = validatePlatformProvenance([
      {
        featureId: "f1",
        featureClass: "atac_peak",
        modality: "atac_seq",
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.blocksInterpretation).toBe(false);
  });

  it("passes for array-derived feature with complete provenance", () => {
    const result = validatePlatformProvenance([
      {
        featureId: "f1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg000001",
        platformAnnotationProvenance: {
          platform: "Illumina EPIC",
          manifestVersion: "EPICv2",
          annotationVersion: "2024-01",
          annotationHash: "sha256:abc123",
        },
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.blocksInterpretation).toBe(false);
  });

  it("passes for platform-native probe feature with provenance", () => {
    const result = validatePlatformProvenance([
      {
        featureId: "f1",
        featureClass: "cpg_methylation",
        measuredIdentifier: "probe_001",
        platformAnnotationProvenance: {
          platform: "450K",
          manifestVersion: "1.0",
        },
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.blocksInterpretation).toBe(false);
  });
});

describe("validatePlatformProvenance – missing provenance", () => {
  it("emits EPI010 when array-derived feature lacks provenance", () => {
    const result = validatePlatformProvenance([
      {
        featureId: "f1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg000001",
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/EPI010/);
    expect(result.errors[0]).toMatch(/f1/);
    expect(result.errors[0]).toMatch(/missing platformAnnotationProvenance/);
    expect(result.blocksInterpretation).toBe(true);
  });

  it("emits EPI010 when probe-derived feature lacks provenance", () => {
    const result = validatePlatformProvenance([
      {
        featureId: "probe-feat",
        featureClass: "cpg_methylation",
        measuredIdentifier: "cg123",
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI010/);
    expect(result.errors[0]).toMatch(/probe-feat/);
  });

  it("warns instead of erroring when requirePlatformProvenance is false", () => {
    const result = validatePlatformProvenance(
      [
        {
          featureId: "f1",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg000001",
        },
      ],
      { requirePlatformProvenance: false },
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/EPI010/);
    expect(result.blocksInterpretation).toBe(true);
  });

  it("does not block interpretation when blockGenePathwayWithoutProvenance is false", () => {
    const result = validatePlatformProvenance(
      [
        {
          featureId: "f1",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg000001",
        },
      ],
      {
        requirePlatformProvenance: false,
        blockGenePathwayWithoutProvenance: false,
      },
    );
    expect(result.blocksInterpretation).toBe(false);
  });
});

describe("validatePlatformProvenance – invalid provenance", () => {
  it("emits EPI010 for provenance missing required platform field", () => {
    const result = validatePlatformProvenance([
      {
        featureId: "f1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg000001",
        platformAnnotationProvenance: {
          manifestVersion: "1.0",
        },
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI010/);
    expect(result.errors[0]).toMatch(/platform/);
  });

  it("emits EPI010 for provenance missing required manifestVersion field", () => {
    const result = validatePlatformProvenance([
      {
        featureId: "f1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg000001",
        platformAnnotationProvenance: {
          platform: "EPIC",
        },
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/EPI010/);
    expect(result.errors[0]).toMatch(/manifestVersion/);
  });

  it("warns when annotationHash is missing and requireAnnotationHash is true", () => {
    const result = validatePlatformProvenance(
      [
        {
          featureId: "f1",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg000001",
          platformAnnotationProvenance: {
            platform: "EPIC",
            manifestVersion: "1.0",
          },
        },
      ],
      { requireAnnotationHash: true },
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/EPI010/);
    expect(result.warnings[0]).toMatch(/annotationHash/);
    expect(result.blocksInterpretation).toBe(true);
  });

  it("does not warn about annotationHash when requireAnnotationHash is false", () => {
    const result = validatePlatformProvenance([
      {
        featureId: "f1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg000001",
        platformAnnotationProvenance: {
          platform: "EPIC",
          manifestVersion: "1.0",
        },
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("validatePlatformProvenance – batch handling", () => {
  it("reports multiple missing provenance errors independently", () => {
    const result = validatePlatformProvenance([
      {
        featureId: "f1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg000001",
      },
      {
        featureId: "f2",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg000002",
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatch(/f1/);
    expect(result.errors[1]).toMatch(/f2/);
  });

  it("reports mixed valid and invalid features", () => {
    const result = validatePlatformProvenance([
      {
        featureId: "f1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg000001",
        platformAnnotationProvenance: {
          platform: "EPIC",
          manifestVersion: "1.0",
        },
      },
      {
        featureId: "f2",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg000002",
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/f2/);
  });

  it("ignores unparseable feature objects", () => {
    const result = validatePlatformProvenance([
      "not-a-feature",
      42,
      null,
      { featureId: "", featureClass: "cpg_methylation" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("passes for empty feature array", () => {
    const result = validatePlatformProvenance([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
