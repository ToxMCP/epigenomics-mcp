import { describe, it, expect } from "vitest";
import {
  StudyTypeSchema,
  AssayFamilySchema,
  DoseUnitSchema,
  BiosampleContextSchema,
  EpigenomicsDatasetMetadataSchema,
} from "../../src/contracts/dataset.js";
import {
  EpigenomicsSampleMetadataSchema,
  EpigenomicsExperimentalDesignSchema,
  DoseGroupSchema,
  ReplicateTypeSchema,
} from "../../src/contracts/design.js";
import {
  ContextStatusSchema,
  CellCompositionContextSchema,
  CytotoxicityContextSchema,
  CellTypeFractionSchema,
  CytotoxicityMeasurementSchema,
} from "../../src/contracts/context.js";

describe("dataset metadata contracts", () => {
  it("accepts valid dataset metadata", () => {
    const meta = EpigenomicsDatasetMetadataSchema.parse({
      datasetId: "ds-001",
      datasetName: "Methylation array test",
      studyId: "study-001",
      studyType: "in_vitro",
      assayFamily: "dna_methylation",
      modality: "dna_methylation_array",
      species: "Homo sapiens",
      genomeBuild: "hg38",
      description: "Test dataset",
      createdAt: "2026-05-05T00:00:00Z",
    });
    expect(meta.datasetId).toBe("ds-001");
    expect(meta.studyType).toBe("in_vitro");
    expect(meta.assayFamily).toBe("dna_methylation");
  });

  it("accepts minimal dataset metadata", () => {
    const meta = EpigenomicsDatasetMetadataSchema.parse({
      datasetId: "ds-002",
      studyType: "unknown",
      assayFamily: "unknown",
      modality: "atac_seq",
      species: "Mus musculus",
      createdAt: "2026-05-05T00:00:00Z",
    });
    expect(meta.datasetName).toBeUndefined();
    expect(meta.genomeBuild).toBeUndefined();
  });

  it("rejects invalid study type", () => {
    expect(() =>
      StudyTypeSchema.parse("invalid_study"),
    ).toThrow();
  });

  it("rejects invalid assay family", () => {
    expect(() =>
      AssayFamilySchema.parse("rna_seq"),
    ).toThrow();
  });

  it("rejects invalid dose unit", () => {
    expect(() =>
      DoseUnitSchema.parse("litres"),
    ).toThrow();
  });

  it("accepts valid dose units", () => {
    expect(DoseUnitSchema.parse("µM")).toBe("µM");
    expect(DoseUnitSchema.parse("mg/kg")).toBe("mg/kg");
    expect(DoseUnitSchema.parse("other")).toBe("other");
  });

  it("rejects invalid biosample context", () => {
    expect(() =>
      BiosampleContextSchema.parse("synthetic"),
    ).toThrow();
  });

  it("rejects dataset metadata with extra fields", () => {
    expect(() =>
      EpigenomicsDatasetMetadataSchema.parse({
        datasetId: "ds-003",
        studyType: "in_vivo",
        assayFamily: "chip_seq",
        modality: "chip_seq",
        species: "Homo sapiens",
        createdAt: "2026-05-05T00:00:00Z",
        extraField: "bad",
      }),
    ).toThrow();
  });
});

describe("epigenomics sample metadata contracts", () => {
  it("accepts valid epigenomics sample metadata", () => {
    const sample = EpigenomicsSampleMetadataSchema.parse({
      sampleId: "s1",
      doseGroupId: "ctrl",
      species: "Homo sapiens",
      replicateType: "biological",
      biosampleContext: "cell_line",
      batchId: "b1",
    });
    expect(sample.sampleId).toBe("s1");
    expect(sample.replicateType).toBe("biological");
    expect(sample.biosampleContext).toBe("cell_line");
  });

  it("accepts minimal epigenomics sample metadata", () => {
    const sample = EpigenomicsSampleMetadataSchema.parse({
      sampleId: "s2",
      doseGroupId: "low",
      species: "Homo sapiens",
    });
    expect(sample.replicateIndex).toBe(0);
    expect(sample.controlFlag).toBe(false);
    expect(sample.replicateType).toBeUndefined();
    expect(sample.biosampleContext).toBeUndefined();
  });

  it("rejects invalid replicate type", () => {
    expect(() =>
      ReplicateTypeSchema.parse("invalid_type"),
    ).toThrow();
  });

  it("accepts valid replicate types", () => {
    expect(ReplicateTypeSchema.parse("biological")).toBe("biological");
    expect(ReplicateTypeSchema.parse("technical")).toBe("technical");
    expect(ReplicateTypeSchema.parse("pooled")).toBe("pooled");
    expect(ReplicateTypeSchema.parse("pseudobulk")).toBe("pseudobulk");
  });

  it("rejects sample metadata with extra fields", () => {
    expect(() =>
      EpigenomicsSampleMetadataSchema.parse({
        sampleId: "s3",
        doseGroupId: "ctrl",
        species: "Homo sapiens",
        extraField: "bad",
      }),
    ).toThrow();
  });
});

describe("epigenomics experimental design contracts", () => {
  it("accepts a valid epigenomics experimental design", () => {
    const design = EpigenomicsExperimentalDesignSchema.parse({
      designId: "design-001",
      studyId: "study-001",
      studyType: "in_vitro",
      assayFamily: "dna_methylation",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 1,
      batchId: "batch-1",
    });
    expect(design.designId).toBe("design-001");
    expect(design.studyType).toBe("in_vitro");
    expect(design.batchId).toBe("batch-1");
  });

  it("rejects design missing controls and zero-dose group", () => {
    expect(() =>
      EpigenomicsExperimentalDesignSchema.parse({
        designId: "design-bad",
        species: "Homo sapiens",
        doseGroups: [
          { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        ],
        samples: [
          { sampleId: "s1", doseGroupId: "low", species: "Homo sapiens" },
        ],
        hasControls: false,
        minReplicatesPerGroup: 1,
      }),
    ).toThrow(/controls|zero-dose/i);
  });

  it("rejects design with duplicate sample IDs", () => {
    expect(() =>
      EpigenomicsExperimentalDesignSchema.parse({
        designId: "design-dup",
        species: "Homo sapiens",
        doseGroups: [
          { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
          { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
        ],
        samples: [
          { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
          { sampleId: "s1", doseGroupId: "low", species: "Homo sapiens" },
        ],
        hasControls: true,
        minReplicatesPerGroup: 1,
      }),
    ).toThrow(/duplicate sample IDs/i);
  });

  it("accepts design with zero-dose group and hasControls false", () => {
    const design = EpigenomicsExperimentalDesignSchema.parse({
      designId: "design-zero",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
      samples: [
        { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens" },
        { sampleId: "s2", doseGroupId: "low", species: "Homo sapiens" },
      ],
      hasControls: false,
      minReplicatesPerGroup: 1,
    });
    expect(design.hasControls).toBe(false);
  });

  it("rejects design with extra fields", () => {
    expect(() =>
      EpigenomicsExperimentalDesignSchema.parse({
        designId: "design-extra",
        species: "Homo sapiens",
        doseGroups: [
          { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        ],
        samples: [
          { sampleId: "s1", doseGroupId: "ctrl", species: "Homo sapiens" },
        ],
        hasControls: true,
        minReplicatesPerGroup: 1,
        extraField: "bad",
      }),
    ).toThrow();
  });
});

describe("dose group contracts", () => {
  it("accepts valid dose group", () => {
    const group = DoseGroupSchema.parse({
      doseGroupId: "low",
      doseValue: 1.5,
      doseUnit: "µM",
      timepointHours: 24,
    });
    expect(group.doseValue).toBe(1.5);
    expect(group.timepointHours).toBe(24);
  });

  it("rejects dose group with missing doseUnit", () => {
    expect(() =>
      DoseGroupSchema.parse({
        doseGroupId: "low",
        doseValue: 1.5,
      }),
    ).toThrow();
  });

  it("rejects dose group with empty doseUnit", () => {
    expect(() =>
      DoseGroupSchema.parse({
        doseGroupId: "low",
        doseValue: 1.5,
        doseUnit: "",
      }),
    ).toThrow();
  });
});

describe("context status contracts", () => {
  it("accepts valid context statuses", () => {
    expect(ContextStatusSchema.parse("detected")).toBe("detected");
    expect(ContextStatusSchema.parse("not_detected")).toBe("not_detected");
    expect(ContextStatusSchema.parse("unknown")).toBe("unknown");
    expect(ContextStatusSchema.parse("flagged")).toBe("flagged");
    expect(ContextStatusSchema.parse("not_evaluated")).toBe("not_evaluated");
  });

  it("rejects invalid context status", () => {
    expect(() =>
      ContextStatusSchema.parse("maybe"),
    ).toThrow();
  });

  it("serializes context status correctly", () => {
    const status = ContextStatusSchema.parse("flagged");
    expect(JSON.stringify(status)).toBe('"flagged"');
    expect(ContextStatusSchema.parse(JSON.parse('"not_detected"'))).toBe(
      "not_detected",
    );
  });
});

describe("cell composition context contracts", () => {
  it("accepts valid cell composition context", () => {
    const ctx = CellCompositionContextSchema.parse({
      contextId: "cc-001",
      sampleId: "s1",
      source: "measured_flow_cytometry",
      declaredCellType: "hepatocyte",
      fractions: [
        { cellType: "hepatocyte", fraction: 0.8 },
        { cellType: "kupffer", fraction: 0.2 },
      ],
      contextStatus: "detected",
      notes: "Pure population",
    });
    expect(ctx.contextId).toBe("cc-001");
    expect(ctx.contextStatus).toBe("detected");
  });

  it("applies default contextStatus", () => {
    const ctx = CellCompositionContextSchema.parse({
      contextId: "cc-002",
      sampleId: "s2",
      source: "not_declared",
    });
    expect(ctx.contextStatus).toBe("unknown");
  });

  it("rejects invalid fraction values", () => {
    expect(() =>
      CellTypeFractionSchema.parse({
        cellType: "hepatocyte",
        fraction: 1.5,
      }),
    ).toThrow();

    expect(() =>
      CellTypeFractionSchema.parse({
        cellType: "hepatocyte",
        fraction: -0.1,
      }),
    ).toThrow();
  });

  it("rejects cell composition context with extra fields", () => {
    expect(() =>
      CellCompositionContextSchema.parse({
        contextId: "cc-003",
        sampleId: "s3",
        source: "declared_pure",
        extraField: "bad",
      }),
    ).toThrow();
  });
});

describe("cytotoxicity context contracts", () => {
  it("accepts valid cytotoxicity context", () => {
    const ctx = CytotoxicityContextSchema.parse({
      contextId: "ctx-001",
      assayType: "viability",
      evidenceSource: "measured_concurrent",
      measurements: [
        {
          sampleId: "s1",
          doseValue: 0,
          timepointHours: 24,
          value: 0.95,
          unit: "fraction",
          metric: "cell_viability",
        },
      ],
      contextStatus: "not_detected",
      stressFlags: ["oxidative_stress"],
      notes: "No cytotoxicity observed",
    });
    expect(ctx.contextId).toBe("ctx-001");
    expect(ctx.contextStatus).toBe("not_detected");
  });

  it("applies default contextStatus", () => {
    const ctx = CytotoxicityContextSchema.parse({
      contextId: "ctx-002",
      assayType: "stress",
      evidenceSource: "not_available",
      measurements: [
        {
          sampleId: "s1",
          value: 1.0,
          unit: "fold_change",
          metric: "hsp70",
        },
      ],
    });
    expect(ctx.contextStatus).toBe("unknown");
  });

  it("rejects cytotoxicity context without measurements", () => {
    expect(() =>
      CytotoxicityContextSchema.parse({
        contextId: "ctx-003",
        assayType: "viability",
        evidenceSource: "measured_concurrent",
        measurements: [],
      }),
    ).toThrow();
  });

  it("rejects measurement without sample/dose reference", () => {
    expect(() =>
      CytotoxicityMeasurementSchema.parse({
        value: 0.95,
        unit: "fraction",
        metric: "cell_viability",
      }),
    ).toThrow();
  });

  it("rejects cytotoxicity context with extra fields", () => {
    expect(() =>
      CytotoxicityContextSchema.parse({
        contextId: "ctx-004",
        assayType: "morphology",
        evidenceSource: "declared",
        measurements: [
          {
            sampleId: "s1",
            value: 0.0,
            unit: "score",
            metric: "morphology",
          },
        ],
        extraField: "bad",
      }),
    ).toThrow();
  });
});
