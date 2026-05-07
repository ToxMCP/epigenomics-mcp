import { describe, it, expect } from "vitest";
import { GenomeBuildSchema, CoordinateSystemSchema, GenomicRegionSchema, GenomicCoordinateSchema } from "../../src/contracts/coordinates.js";
import {
  EpigenomicFeatureSchema,
  ModalitySchema,
  FeatureClassSchema,
  EpigenomicFeatureMatrixSchema,
  CpGMethylationFeatureSchema,
  DifferentialMethylatedRegionFeatureSchema,
  GenericRegionFeatureSchema,
  ChromatinAccessibilityFeatureSchema,
  HistoneMarkFeatureSchema,
  MiRNAFeatureSchema,
} from "../../src/contracts/features.js";
import { ExperimentalDesignSchema, SampleMetadataSchema, DoseGroupSchema } from "../../src/contracts/design.js";
import {
  DatasetProvenanceSchema,
  ProvenanceRecordSchema,
  EpigenomicAnnotationTraceSchema,
  PlatformAnnotationProvenanceSchema,
  UpstreamEpigenomicsProvenanceSchema,
} from "../../src/contracts/provenance.js";
import { QualificationStatusSchema, FeatureQualificationSchema, QualificationWarningSchema } from "../../src/contracts/qualification.js";
import { QcProfileSchema } from "../../src/contracts/qc.js";
import { EpigenomicsFeatureResponsePacketSchema, BioactivityPoDHandoffPacketSchema } from "../../src/contracts/packets.js";
import {
  RegionToGeneMappingSchema,
  MappingConfidenceSchema,
  MappingTypeSchema,
  BiosampleContextMatchSchema,
  DownstreamUseRuleSchema,
  ExternalDatabaseMappingMethodSchema,
  ExternalDatabaseMappingSchema,
} from "../../src/contracts/mapping.js";

describe("coordinate contracts", () => {
  it("accepts valid genome builds", () => {
    expect(GenomeBuildSchema.parse("hg38")).toBe("hg38");
    expect(GenomeBuildSchema.parse("mm10")).toBe("mm10");
  });

  it("rejects invalid genome builds", () => {
    expect(() => GenomeBuildSchema.parse("hg99")).toThrow();
  });

  it("accepts valid coordinate systems", () => {
    expect(CoordinateSystemSchema.parse("0-based-half-open")).toBe("0-based-half-open");
    expect(CoordinateSystemSchema.parse("1-based-closed")).toBe("1-based-closed");
  });

  it("rejects invalid coordinate systems", () => {
    expect(() => CoordinateSystemSchema.parse("unknown")).toThrow();
  });

  it("accepts valid genomic regions", () => {
    const region = GenomicRegionSchema.parse({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      build: "hg38",
      coordinateSystem: "0-based-half-open",
    });
    expect(region.chrom).toBe("chr1");
    expect(region.start).toBe(1000);
    expect(region.end).toBe(2000);
  });

  it("rejects regions where end <= start", () => {
    expect(() =>
      GenomicRegionSchema.parse({
        chrom: "chr1",
        start: 2000,
        end: 1000,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      }),
    ).toThrow();
  });

  it("rejects invalid chromosome names", () => {
    expect(() =>
      GenomicRegionSchema.parse({
        chrom: "invalid",
        start: 1000,
        end: 2000,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      }),
    ).toThrow();
  });
});

describe("feature contracts", () => {
  it("accepts a valid CpG methylation feature", () => {
    const feature = EpigenomicFeatureSchema.parse({
      featureId: "cg00000001",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      measuredIdentifier: "cg00000001",
      signalMetric: "beta_value",
      values: { "sample-1": 0.82 },
    });
    expect(feature.featureId).toBe("cg00000001");
  });

  it("accepts a valid region-bearing feature", () => {
    const feature = EpigenomicFeatureSchema.parse({
      featureId: "peak-001",
      featureClass: "atac_peak",
      modality: "atac_seq",
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      },
      signalMetric: "accessibility_signal",
      values: { "sample-1": 1.23 },
    });
    expect(feature.featureId).toBe("peak-001");
    expect(feature.measuredRegion?.chrom).toBe("chr1");
  });

  it("rejects feature without region or identifier", () => {
    expect(() =>
      EpigenomicFeatureSchema.parse({
        featureId: "feat-1",
        featureClass: "atac_peak",
        modality: "atac_seq",
        signalMetric: "read_count",
        values: {},
      }),
    ).toThrow();
  });

  it("rejects incompatible signalMetric for featureClass", () => {
    expect(() =>
      EpigenomicFeatureSchema.parse({
        featureId: "feat-1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000001",
        signalMetric: "accessibility_signal",
        values: { "sample-1": 0.82 },
      }),
    ).toThrow();
  });

  it("requires declaredOtherDescription when signalMetric is declared_other", () => {
    expect(() =>
      EpigenomicFeatureSchema.parse({
        featureId: "feat-1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000001",
        signalMetric: "declared_other",
        values: { "sample-1": 0.82 },
      }),
    ).toThrow();
  });

  it("accepts declared_other with description", () => {
    const feature = EpigenomicFeatureSchema.parse({
      featureId: "feat-1",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      measuredIdentifier: "cg00000001",
      signalMetric: "declared_other",
      declaredOtherDescription: "custom metric",
      values: { "sample-1": 0.82 },
    });
    expect(feature.declaredOtherDescription).toBe("custom metric");
  });

  it("accepts valid modalities", () => {
    expect(ModalitySchema.parse("dna_methylation_array")).toBe("dna_methylation_array");
    expect(ModalitySchema.parse("atac_seq")).toBe("atac_seq");
    expect(ModalitySchema.parse("chip_seq")).toBe("chip_seq");
  });

  it("rejects invalid modalities", () => {
    expect(() => ModalitySchema.parse("rna_seq")).toThrow();
  });

  it("accepts valid feature classes", () => {
    expect(FeatureClassSchema.parse("cpg_methylation")).toBe("cpg_methylation");
    expect(FeatureClassSchema.parse("dmr")).toBe("dmr");
  });

  it("rejects invalid feature classes", () => {
    expect(() => FeatureClassSchema.parse("snp")).toThrow();
  });
});

describe("design contracts", () => {
  it("accepts a valid experimental design", () => {
    const design = ExperimentalDesignSchema.parse({
      designId: "design-001",
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
    });
    expect(design.designId).toBe("design-001");
  });

  it("rejects design without controls or zero dose", () => {
    expect(() =>
      ExperimentalDesignSchema.parse({
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
    ).toThrow();
  });

  it("accepts design with zero-dose group and hasControls false", () => {
    const design = ExperimentalDesignSchema.parse({
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

  it("accepts valid sample metadata", () => {
    const sample = SampleMetadataSchema.parse({
      sampleId: "s1",
      doseGroupId: "ctrl",
      species: "Homo sapiens",
      replicateIndex: 1,
      replicateType: "biological",
      batchId: "batch-1",
    });
    expect(sample.sampleId).toBe("s1");
    expect(sample.replicateType).toBe("biological");
  });

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
});

describe("provenance contracts", () => {
  it("accepts a valid provenance record", () => {
    const record = ProvenanceRecordSchema.parse({
      stepName: "normalisation",
      toolName: "minfi",
      toolVersion: "1.44.0",
      parameters: { method: "SWAN" },
      timestamp: "2026-04-01T10:00:00Z",
      inputFiles: ["raw.idat"],
      outputFiles: ["norm.csv"],
    });
    expect(record.stepName).toBe("normalisation");
    expect(record.inputFiles).toEqual(["raw.idat"]);
  });

  it("accepts minimal provenance record", () => {
    const record = ProvenanceRecordSchema.parse({
      stepName: "import",
      toolName: "custom",
      toolVersion: "1.0.0",
    });
    expect(record.parameters).toEqual({});
    expect(record.inputFiles).toEqual([]);
    expect(record.outputFiles).toEqual([]);
  });

  it("rejects provenance record with extra fields", () => {
    expect(() =>
      ProvenanceRecordSchema.parse({
        stepName: "import",
        toolName: "custom",
        toolVersion: "1.0.0",
        unknownField: "bad",
      }),
    ).toThrow();
  });

  it("accepts valid dataset provenance", () => {
    const provenance = DatasetProvenanceSchema.parse({
      datasetId: "ds-001",
      upstreamSteps: [
        {
          stepName: "normalisation",
          toolName: "minfi",
          toolVersion: "1.44.0",
          parameters: {},
        },
      ],
      normalisationMethod: "SWAN",
      probeManifestVersion: "EPIC v2",
    });
    expect(provenance.datasetId).toBe("ds-001");
    expect(provenance.normalisationMethod).toBe("SWAN");
  });

  it("rejects dataset provenance without upstream steps", () => {
    expect(() =>
      DatasetProvenanceSchema.parse({
        datasetId: "ds-001",
        upstreamSteps: [],
      }),
    ).toThrow();
  });
});

describe("QC contracts", () => {
  it("accepts a valid QC profile", () => {
    const profile = QcProfileSchema.parse({
      datasetId: "ds-001",
      totalFeatures: 1000,
      featuresWithMissingValues: 50,
      missingnessRate: 0.05,
      meanReplicateCorrelation: 0.95,
      minReplicateCorrelation: 0.88,
      varianceAcrossDoses: 0.12,
      designAdequacyFlags: {
        sufficientReplicates: true,
        doseRangeDeclared: true,
        controlsPresent: true,
        batchStructureKnown: false,
        speciesBuildDeclared: true,
      },
    });
    expect(profile.datasetId).toBe("ds-001");
    expect(profile.missingnessRate).toBe(0.05);
  });

  it("rejects QC profile with missingnessRate > 1", () => {
    expect(() =>
      QcProfileSchema.parse({
        datasetId: "ds-001",
        totalFeatures: 1000,
        featuresWithMissingValues: 50,
        missingnessRate: 1.5,
        designAdequacyFlags: {
          sufficientReplicates: true,
          doseRangeDeclared: true,
          controlsPresent: true,
          batchStructureKnown: false,
          speciesBuildDeclared: true,
        },
      }),
    ).toThrow();
  });

  it("rejects QC profile with correlation outside [-1, 1]", () => {
    expect(() =>
      QcProfileSchema.parse({
        datasetId: "ds-001",
        totalFeatures: 1000,
        featuresWithMissingValues: 50,
        missingnessRate: 0.05,
        meanReplicateCorrelation: 1.5,
        designAdequacyFlags: {
          sufficientReplicates: true,
          doseRangeDeclared: true,
          controlsPresent: true,
          batchStructureKnown: false,
          speciesBuildDeclared: true,
        },
      }),
    ).toThrow();
  });
});

describe("qualification contracts", () => {
  it("accepts valid qualification statuses", () => {
    expect(QualificationStatusSchema.parse("accepted_for_pod")).toBe("accepted_for_pod");
    expect(QualificationStatusSchema.parse("excluded_qc_failure")).toBe("excluded_qc_failure");
    expect(QualificationStatusSchema.parse("exploratory_only")).toBe("exploratory_only");
  });

  it("rejects invalid qualification status", () => {
    expect(() => QualificationStatusSchema.parse("accepted")).toThrow();
  });

  it("accepts a valid qualification warning", () => {
    const warning = QualificationWarningSchema.parse({
      warningCode: "EPIW001",
      severity: "warning",
      message: "Batch effect detected",
      category: "batch_effect",
      featureIds: ["feat-1", "feat-2"],
      blocksDownstream: false,
    });
    expect(warning.warningCode).toBe("EPIW001");
    expect(warning.blocksDownstream).toBe(false);
  });

  it("applies default blocksDownstream to false", () => {
    const warning = QualificationWarningSchema.parse({
      warningCode: "EPIW001",
      severity: "info",
      message: "Note",
      category: "missing_metadata",
    });
    expect(warning.blocksDownstream).toBe(false);
  });

  it("rejects qualification warning with extra fields", () => {
    expect(() =>
      QualificationWarningSchema.parse({
        warningCode: "EPIW001",
        severity: "warning",
        message: "Note",
        category: "batch_effect",
        extraField: "bad",
      }),
    ).toThrow();
  });

  it("accepts a valid feature qualification", () => {
    const qual = FeatureQualificationSchema.parse({
      featureId: "feat-1",
      status: "accepted_for_pod",
      warnings: [],
      mappedGeneIds: ["BRCA1"],
      mappingConfidence: "medium",
      mappingMethod: "nearest_gene",
    });
    expect(qual.featureId).toBe("feat-1");
    expect(qual.mappingConfidence).toBe("medium");
  });

  it("accepts minimal feature qualification", () => {
    const qual = FeatureQualificationSchema.parse({
      featureId: "feat-1",
      status: "excluded_qc_failure",
    });
    expect(qual.warnings).toEqual([]);
    expect(qual.mappedGeneIds).toBeUndefined();
  });
});

describe("mapping contracts", () => {
  it("accepts valid mapping confidence levels", () => {
    expect(MappingConfidenceSchema.parse("high")).toBe("high");
    expect(MappingConfidenceSchema.parse("none")).toBe("none");
  });

  it("rejects invalid mapping confidence", () => {
    expect(() => MappingConfidenceSchema.parse("very_high")).toThrow();
  });

  it("accepts a valid region-to-gene mapping", () => {
    const mapping = RegionToGeneMappingSchema.parse({
      featureId: "peak-001",
      geneIds: ["BRCA1", "BRCA2"],
      method: "direct_promoter_overlap",
      confidence: "high",
      distanceBp: 500,
    });
    expect(mapping.featureId).toBe("peak-001");
    expect(mapping.geneIds).toEqual(["BRCA1", "BRCA2"]);
    expect(mapping.distanceBp).toBe(500);
  });

  it("accepts mapping without distance", () => {
    const mapping = RegionToGeneMappingSchema.parse({
      featureId: "peak-001",
      geneIds: ["BRCA1"],
      method: "nearest_gene",
      confidence: "low",
    });
    expect(mapping.distanceBp).toBeUndefined();
  });

  it("rejects mapping with empty geneIds array", () => {
    const mapping = RegionToGeneMappingSchema.parse({
      featureId: "peak-001",
      geneIds: [],
      method: "nearest_gene",
      confidence: "none",
    });
    expect(mapping.geneIds).toEqual([]);
  });

  it("rejects mapping with extra fields", () => {
    expect(() =>
      RegionToGeneMappingSchema.parse({
        featureId: "peak-001",
        geneIds: ["BRCA1"],
        method: "nearest_gene",
        confidence: "low",
        extraField: "bad",
      }),
    ).toThrow();
  });

  it("rejects negative distance", () => {
    expect(() =>
      RegionToGeneMappingSchema.parse({
        featureId: "peak-001",
        geneIds: ["BRCA1"],
        method: "nearest_gene",
        confidence: "low",
        distanceBp: -100,
      }),
    ).toThrow();
  });
});

describe("packet contracts", () => {
  it("accepts a valid EpigenomicsFeatureResponsePacket", () => {
    const packet = EpigenomicsFeatureResponsePacketSchema.parse({
      schemaVersion: "0.1.0",
      schemaName: "EpigenomicsFeatureResponsePacket",
      packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      datasetMetadataRef: "dataset-001",
      designRef: "design-001",
      features: [
        {
          featureId: "cg00000001",
          featureClass: "cpg_methylation",
          modality: "dna_methylation_array",
          measuredIdentifier: "cg00000001",
          signalMetric: "beta_value",
          values: { "sample-1": 0.82 },
        },
      ],
      design: {
        designId: "design-001",
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
      },
      provenance: {
        datasetId: "dataset-001",
        upstreamSteps: [
          {
            stepName: "normalisation",
            toolName: "minfi",
            toolVersion: "1.44.0",
            parameters: {},
          },
        ],
      },
      qualificationSummary: {
        acceptedCount: 1,
        excludedCount: 0,
        exploratoryCount: 0,
        caveatCount: 0,
      },
      qcReportRef: "qc-001",
      warnings: [],
      generatedAt: "2026-05-05T00:00:00Z",
    });
    expect(packet.schemaVersion).toBe("0.1.0");
  });

  it("accepts a valid BioactivityPoDHandoffPacket", () => {
    const handoff = BioactivityPoDHandoffPacketSchema.parse({
      schemaVersion: "0.1.0",
      schemaName: "BioactivityPoDHandoffPacket",
      handoffId: "b2c3d4e5-f6a7-8901-bcde-f23456789012",
      sourcePacketRef: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      qualifiedFeatures: [
        {
          featureId: "cg00000001",
          status: "accepted_for_pod",
          warnings: [],
        },
      ],
      excludedFeatures: [],
      doseResponseReadySubset: ["cg00000001"],
      mandatoryCaveats: [],
      generatedAt: "2026-05-05T00:00:00Z",
    });
    expect(handoff.handoffId).toBe("b2c3d4e5-f6a7-8901-bcde-f23456789012");
  });

  it("rejects packet with wrong schemaVersion", () => {
    expect(() =>
      EpigenomicsFeatureResponsePacketSchema.parse({
        schemaVersion: "0.2.0",
        schemaName: "EpigenomicsFeatureResponsePacket",
        packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        datasetMetadataRef: "dataset-001",
        designRef: "design-001",
        features: [
          {
            featureId: "cg00000001",
            featureClass: "cpg_methylation",
            modality: "dna_methylation_array",
            measuredIdentifier: "cg00000001",
            signalMetric: "beta_value",
            values: { "sample-1": 0.82 },
          },
        ],
        design: {
          designId: "design-001",
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
        },
        provenance: {
          datasetId: "dataset-001",
          upstreamSteps: [
            { stepName: "norm", toolName: "minfi", toolVersion: "1.44.0", parameters: {} },
          ],
        },
        qualificationSummary: {
          acceptedCount: 1,
          excludedCount: 0,
          exploratoryCount: 0,
          caveatCount: 0,
        },
        qcReportRef: "qc-001",
        warnings: [],
        generatedAt: "2026-05-05T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("genomic coordinate contract", () => {
  it("accepts a valid genomic coordinate with strand", () => {
    const coord = GenomicCoordinateSchema.parse({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      build: "hg38",
      coordinateSystem: "0-based-half-open",
      strand: "+",
    });
    expect(coord.chrom).toBe("chr1");
    expect(coord.strand).toBe("+");
  });

  it("defaults strand to '.' when omitted", () => {
    const coord = GenomicCoordinateSchema.parse({
      chrom: "chr1",
      start: 1000,
      end: 2000,
      build: "hg38",
      coordinateSystem: "0-based-half-open",
    });
    expect(coord.strand).toBe(".");
  });

  it("rejects coordinates where end <= start", () => {
    expect(() =>
      GenomicCoordinateSchema.parse({
        chrom: "chr1",
        start: 2000,
        end: 1000,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      }),
    ).toThrow();
  });

  it("rejects negative start coordinate", () => {
    expect(() =>
      GenomicCoordinateSchema.parse({
        chrom: "chr1",
        start: -1,
        end: 1000,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      }),
    ).toThrow();
  });
});

describe("epigenomic feature matrix contract", () => {
  it("accepts a valid wide-format matrix", () => {
    const matrix = EpigenomicFeatureMatrixSchema.parse({
      matrixId: "matrix-001",
      featureIds: ["feat-1", "feat-2"],
      sampleIds: ["s1", "s2"],
      wideValues: {
        "feat-1": { s1: 0.5, s2: 0.6 },
        "feat-2": { s1: 1.2, s2: null },
      },
    });
    expect(matrix.matrixId).toBe("matrix-001");
    expect(matrix.wideValues?.["feat-1"].s1).toBe(0.5);
  });

  it("accepts a valid long-format matrix", () => {
    const matrix = EpigenomicFeatureMatrixSchema.parse({
      matrixId: "matrix-002",
      featureIds: ["feat-1"],
      sampleIds: ["s1"],
      longValues: [{ featureId: "feat-1", sampleId: "s1", value: 0.5 }],
    });
    expect(matrix.longValues).toHaveLength(1);
  });

  it("rejects matrix without wide or long values", () => {
    expect(() =>
      EpigenomicFeatureMatrixSchema.parse({
        matrixId: "matrix-003",
        featureIds: ["feat-1"],
        sampleIds: ["s1"],
      }),
    ).toThrow();
  });
});

describe("CpG methylation feature contract", () => {
  it("accepts a valid array-derived CpG feature with platform provenance", () => {
    const feature = CpGMethylationFeatureSchema.parse({
      featureId: "cg00000001",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      measuredIdentifier: "cg00000001",
      platformAnnotationProvenance: {
        platform: "EPIC",
        manifestVersion: "EPIC v2",
        annotationVersion: "ilm10b4.hg38",
      },
      signalMetric: "beta_value",
      values: { "sample-1": 0.82 },
    });
    expect(feature.featureId).toBe("cg00000001");
    expect(feature.platformAnnotationProvenance?.platform).toBe("EPIC");
  });

  it("accepts a valid BS-seq derived CpG feature without platform provenance", () => {
    const feature = CpGMethylationFeatureSchema.parse({
      featureId: "cpg-chr1-1000",
      featureClass: "cpg_methylation",
      modality: "dna_methylation_bsseq",
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 1001,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      },
      signalMetric: "percent_methylation",
      values: { "sample-1": 0.82 },
    });
    expect(feature.modality).toBe("dna_methylation_bsseq");
  });

  it("rejects array-derived CpG feature without platform provenance", () => {
    expect(() =>
      CpGMethylationFeatureSchema.parse({
        featureId: "cg00000001",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000001",
        signalMetric: "beta_value",
        values: { "sample-1": 0.82 },
      }),
    ).toThrow();
  });
});

describe("differential methylated region feature contract", () => {
  it("accepts a valid DMR feature with required coordinates", () => {
    const feature = DifferentialMethylatedRegionFeatureSchema.parse({
      featureId: "dmr-001",
      featureClass: "differential_methylated_region",
      modality: "dna_methylation_bsseq",
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      },
      signalMetric: "delta_beta",
      effectSize: -0.15,
      qValue: 0.01,
      values: { "sample-1": -0.15 },
    });
    expect(feature.measuredRegion.build).toBe("hg38");
    expect(feature.effectSize).toBe(-0.15);
  });

  it("rejects DMR feature without measuredRegion", () => {
    expect(() =>
      DifferentialMethylatedRegionFeatureSchema.parse({
        featureId: "dmr-002",
        featureClass: "dmr",
        modality: "dna_methylation_array",
        measuredIdentifier: "dmr-002",
        signalMetric: "delta_beta",
        values: { "sample-1": -0.1 },
      }),
    ).toThrow();
  });

  it("rejects DMR feature with qValue outside [0, 1]", () => {
    expect(() =>
      DifferentialMethylatedRegionFeatureSchema.parse({
        featureId: "dmr-003",
        featureClass: "differential_methylated_region",
        modality: "dna_methylation_bsseq",
        measuredRegion: {
          chrom: "chr1",
          start: 1000,
          end: 2000,
          build: "hg38",
          coordinateSystem: "0-based-half-open",
        },
        signalMetric: "delta_beta",
        qValue: 1.5,
        values: { "sample-1": -0.1 },
      }),
    ).toThrow();
  });
});

describe("generic region feature contract", () => {
  it("accepts a valid generic region feature", () => {
    const feature = GenericRegionFeatureSchema.parse({
      featureId: "region-001",
      featureClass: "atac_peak",
      modality: "atac_seq",
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      },
      signalMetric: "accessibility_signal",
      values: { "sample-1": 1.23 },
    });
    expect(feature.featureClass).toBe("atac_peak");
  });

  it("accepts generic_region_feature class", () => {
    const feature = GenericRegionFeatureSchema.parse({
      featureId: "region-generic-001",
      featureClass: "generic_region_feature",
      modality: "atac_seq",
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      },
      signalMetric: "read_count",
      values: { "sample-1": 42 },
    });
    expect(feature.featureClass).toBe("generic_region_feature");
    expect(feature.measuredRegion?.build).toBe("hg38");
  });

  it("rejects generic region feature without measuredRegion", () => {
    expect(() =>
      GenericRegionFeatureSchema.parse({
        featureId: "region-002",
        featureClass: "chip_peak_narrow",
        modality: "chip_seq",
        measuredIdentifier: "peak-002",
        signalMetric: "peak_score",
        values: { "sample-1": 5.0 },
      }),
    ).toThrow();
  });
});

describe("chromatin accessibility feature contract", () => {
  it("accepts a valid ATAC feature with required coordinates", () => {
    const feature = ChromatinAccessibilityFeatureSchema.parse({
      featureId: "atac-001",
      featureClass: "atac_peak",
      modality: "atac_seq",
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      },
      peakFormat: "narrowPeak",
      signalMetric: "accessibility_signal",
      values: { "sample-1": 2.5 },
    });
    expect(feature.modality).toBe("atac_seq");
    expect(feature.peakFormat).toBe("narrowPeak");
  });

  it("rejects ATAC feature without measuredRegion", () => {
    expect(() =>
      ChromatinAccessibilityFeatureSchema.parse({
        featureId: "atac-002",
        featureClass: "atac_peak",
        modality: "atac_seq",
        measuredIdentifier: "atac-002",
        peakFormat: "narrowPeak",
        signalMetric: "accessibility_signal",
        values: { "sample-1": 2.5 },
      }),
    ).toThrow();
  });

  it("rejects ATAC feature without peakFormat", () => {
    expect(() =>
      ChromatinAccessibilityFeatureSchema.parse({
        featureId: "atac-003",
        featureClass: "atac_peak",
        modality: "atac_seq",
        measuredRegion: {
          chrom: "chr1",
          start: 1000,
          end: 2000,
          build: "hg38",
          coordinateSystem: "0-based-half-open",
        },
        signalMetric: "accessibility_signal",
        values: { "sample-1": 2.5 },
      }),
    ).toThrow();
  });
});

describe("histone mark feature contract", () => {
  it("accepts a valid histone mark feature with required coordinates", () => {
    const feature = HistoneMarkFeatureSchema.parse({
      featureId: "h3k27ac-001",
      featureClass: "histone_mark_peak",
      modality: "chip_seq",
      histoneMark: "H3K27ac",
      measuredRegion: {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      },
      signalMetric: "peak_score",
      values: { "sample-1": 15.2 },
    });
    expect(feature.histoneMark).toBe("H3K27ac");
  });

  it("rejects histone mark feature without histoneMark", () => {
    expect(() =>
      HistoneMarkFeatureSchema.parse({
        featureId: "h3k27ac-002",
        featureClass: "histone_mark_peak",
        modality: "chip_seq",
        measuredRegion: {
          chrom: "chr1",
          start: 1000,
          end: 2000,
          build: "hg38",
          coordinateSystem: "0-based-half-open",
        },
        signalMetric: "peak_score",
        values: { "sample-1": 15.2 },
      }),
    ).toThrow();
  });
});

describe("miRNA feature contract", () => {
  it("accepts a valid miRNA feature", () => {
    const feature = MiRNAFeatureSchema.parse({
      featureId: "hsa-miR-21-5p",
      featureClass: "mirna_expression",
      modality: "mirna_expression",
      measuredIdentifier: "MIMAT0000076",
      signalMetric: "normalized_signal",
      values: { "sample-1": 12.3 },
    });
    expect(feature.featureClass).toBe("mirna_expression");
  });

  it("accepts miRNA feature with optional coordinates", () => {
    const feature = MiRNAFeatureSchema.parse({
      featureId: "hsa-miR-21-5p",
      featureClass: "mirna_expression",
      modality: "mirna_expression",
      measuredRegion: {
        chrom: "chr17",
        start: 5000,
        end: 5100,
        build: "hg38",
        coordinateSystem: "0-based-half-open",
      },
      signalMetric: "read_count",
      values: { "sample-1": 100 },
    });
    expect(feature.measuredRegion?.chrom).toBe("chr17");
  });

  it("rejects miRNA feature without region or identifier", () => {
    expect(() =>
      MiRNAFeatureSchema.parse({
        featureId: "hsa-miR-21-5p",
        featureClass: "mirna_expression",
        modality: "mirna_expression",
        signalMetric: "normalized_signal",
        values: { "sample-1": 12.3 },
      }),
    ).toThrow();
  });
});

describe("mapping type contract", () => {
  it("accepts valid mapping types", () => {
    expect(MappingTypeSchema.parse("direct_promoter_overlap")).toBe("direct_promoter_overlap");
    expect(MappingTypeSchema.parse("nearest_gene")).toBe("nearest_gene");
    expect(MappingTypeSchema.parse("unknown_target_gene")).toBe("unknown_target_gene");
  });

  it("rejects invalid mapping types", () => {
    expect(() => MappingTypeSchema.parse("random_guess")).toThrow();
  });
});

describe("region-to-gene mapping pathway rollup rules", () => {
  it("allows pathwayRollupAllowed for direct_promoter_overlap", () => {
    const mapping = RegionToGeneMappingSchema.parse({
      featureId: "peak-001",
      geneIds: ["BRCA1"],
      method: "direct_promoter_overlap",
      confidence: "high",
      pathwayRollupAllowed: true,
    });
    expect(mapping.pathwayRollupAllowed).toBe(true);
  });

  it("allows pathwayRollupAllowed for chromatin_interaction_supported", () => {
    const mapping = RegionToGeneMappingSchema.parse({
      featureId: "peak-002",
      geneIds: ["BRCA2"],
      method: "chromatin_interaction_supported",
      confidence: "medium",
      pathwayRollupAllowed: true,
    });
    expect(mapping.pathwayRollupAllowed).toBe(true);
  });

  it("defaults pathwayRollupAllowed to false", () => {
    const mapping = RegionToGeneMappingSchema.parse({
      featureId: "peak-003",
      geneIds: ["TP53"],
      method: "nearest_gene",
      confidence: "low",
    });
    expect(mapping.pathwayRollupAllowed).toBe(false);
  });

  it("rejects pathwayRollupAllowed for nearest_gene", () => {
    expect(() =>
      RegionToGeneMappingSchema.parse({
        featureId: "peak-004",
        geneIds: ["TP53"],
        method: "nearest_gene",
        confidence: "low",
        pathwayRollupAllowed: true,
      }),
    ).toThrow();
  });

  it("rejects pathwayRollupAllowed for inferred_target_gene", () => {
    expect(() =>
      RegionToGeneMappingSchema.parse({
        featureId: "peak-005",
        geneIds: ["MYC"],
        method: "inferred_target_gene",
        confidence: "low",
        pathwayRollupAllowed: true,
      }),
    ).toThrow();
  });

  it("rejects pathwayRollupAllowed for unknown_target_gene", () => {
    expect(() =>
      RegionToGeneMappingSchema.parse({
        featureId: "peak-006",
        geneIds: ["EGFR"],
        method: "unknown_target_gene",
        confidence: "none",
        pathwayRollupAllowed: true,
      }),
    ).toThrow();
  });

  it("accepts mapping with annotationTrace", () => {
    const mapping = RegionToGeneMappingSchema.parse({
      featureId: "peak-007",
      geneIds: ["BRCA1"],
      method: "direct_promoter_overlap",
      confidence: "high",
      annotationTrace: {
        traceId: "trace-001",
        sourceResource: "Ensembl",
        sourceVersion: "110",
        genomeBuild: "hg38",
      },
    });
    expect(mapping.annotationTrace?.sourceResource).toBe("Ensembl");
  });
});

describe("external database mapping contracts", () => {
  it("accepts valid biosample context match values", () => {
    expect(BiosampleContextMatchSchema.parse("exact")).toBe("exact");
    expect(BiosampleContextMatchSchema.parse("close")).toBe("close");
    expect(BiosampleContextMatchSchema.parse("distant")).toBe("distant");
    expect(BiosampleContextMatchSchema.parse("unknown")).toBe("unknown");
  });

  it("rejects invalid biosample context match values", () => {
    expect(() => BiosampleContextMatchSchema.parse("partial")).toThrow();
  });

  it("accepts valid downstream use rule values", () => {
    expect(DownstreamUseRuleSchema.parse("allow_contextual_gene_linkage_and_pathway_rollup")).toBe(
      "allow_contextual_gene_linkage_and_pathway_rollup",
    );
    expect(DownstreamUseRuleSchema.parse("exploratory_only")).toBe("exploratory_only");
    expect(DownstreamUseRuleSchema.parse("block_pathway_rollup")).toBe("block_pathway_rollup");
  });

  it("rejects invalid downstream use rule values", () => {
    expect(() => DownstreamUseRuleSchema.parse("allow_everything")).toThrow();
  });

  it("accepts valid external database mapping method values", () => {
    expect(ExternalDatabaseMappingMethodSchema.parse("enhancer_target_from_database")).toBe(
      "enhancer_target_from_database",
    );
    expect(ExternalDatabaseMappingMethodSchema.parse("chromatin_interaction_supported")).toBe(
      "chromatin_interaction_supported",
    );
  });

  it("rejects invalid external database mapping method values", () => {
    expect(() => ExternalDatabaseMappingMethodSchema.parse("nearest_gene")).toThrow();
  });

  it("accepts a complete enhancer_target_from_database mapping", () => {
    const mapping = ExternalDatabaseMappingSchema.parse({
      featureId: "peak-001",
      geneIds: ["ENSG00000141510"],
      method: "enhancer_target_from_database",
      confidence: "high",
      sourceResource: "GeneHancer",
      annotationRelease: "v4.7",
      biosampleContextMatch: "exact",
      downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
    });
    expect(mapping.sourceResource).toBe("GeneHancer");
    expect(mapping.annotationRelease).toBe("v4.7");
    expect(mapping.warnings).toEqual([]);
  });

  it("accepts a complete chromatin_interaction_supported mapping", () => {
    const mapping = ExternalDatabaseMappingSchema.parse({
      featureId: "peak-002",
      geneIds: ["ENSG00000139618"],
      method: "chromatin_interaction_supported",
      confidence: "medium",
      sourceResource: "ENCODE",
      annotationRelease: "v3.0",
      biosampleContextMatch: "close",
      downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
      annotationTrace: {
        traceId: "trace-002",
        sourceResource: "ENCODE",
        sourceVersion: "v3.0",
        genomeBuild: "hg38",
      },
    });
    expect(mapping.annotationTrace).toBeDefined();
    expect(mapping.annotationTrace!.genomeBuild).toBe("hg38");
  });

  it("rejects mapping without sourceResource", () => {
    expect(() =>
      ExternalDatabaseMappingSchema.parse({
        featureId: "peak-003",
        geneIds: ["ENSG00000141510"],
        method: "enhancer_target_from_database",
        confidence: "high",
        annotationRelease: "v4.7",
        biosampleContextMatch: "exact",
        downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
      }),
    ).toThrow();
  });

  it("rejects mapping without annotationRelease", () => {
    expect(() =>
      ExternalDatabaseMappingSchema.parse({
        featureId: "peak-004",
        geneIds: ["ENSG00000141510"],
        method: "enhancer_target_from_database",
        confidence: "high",
        sourceResource: "GeneHancer",
        biosampleContextMatch: "exact",
        downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
      }),
    ).toThrow();
  });

  it("rejects mapping with extra fields", () => {
    expect(() =>
      ExternalDatabaseMappingSchema.parse({
        featureId: "peak-005",
        geneIds: ["ENSG00000141510"],
        method: "enhancer_target_from_database",
        confidence: "high",
        sourceResource: "GeneHancer",
        annotationRelease: "v4.7",
        biosampleContextMatch: "exact",
        downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
        extraField: "bad",
      }),
    ).toThrow();
  });

  it("rejects mapping with invalid method", () => {
    expect(() =>
      ExternalDatabaseMappingSchema.parse({
        featureId: "peak-006",
        geneIds: ["ENSG00000141510"],
        method: "nearest_gene",
        confidence: "high",
        sourceResource: "GeneHancer",
        annotationRelease: "v4.7",
        biosampleContextMatch: "exact",
        downstreamUseRule: "allow_contextual_gene_linkage_and_pathway_rollup",
      }),
    ).toThrow();
  });
});

describe("epigenomic annotation trace contract", () => {
  it("accepts a valid annotation trace", () => {
    const trace = EpigenomicAnnotationTraceSchema.parse({
      traceId: "trace-001",
      sourceResource: "GENCODE",
      sourceVersion: "v44",
      releaseDate: "2024-01-15T00:00:00Z",
      genomeBuild: "hg38",
    });
    expect(trace.genomeBuild).toBe("hg38");
  });

  it("rejects annotation trace with invalid genome build", () => {
    expect(() =>
      EpigenomicAnnotationTraceSchema.parse({
        traceId: "trace-002",
        sourceResource: "Ensembl",
        sourceVersion: "110",
        genomeBuild: "hg99",
      }),
    ).toThrow();
  });
});

describe("platform annotation provenance contract", () => {
  it("accepts valid platform annotation provenance", () => {
    const prov = PlatformAnnotationProvenanceSchema.parse({
      platform: "EPIC",
      manifestVersion: "EPIC v2",
      annotationVersion: "ilm10b4.hg38",
      annotationHash: "sha256:abc123",
    });
    expect(prov.platform).toBe("EPIC");
    expect(prov.annotationHash).toBe("sha256:abc123");
  });

  it("accepts minimal platform annotation provenance", () => {
    const prov = PlatformAnnotationProvenanceSchema.parse({
      platform: "450K",
      manifestVersion: "HumanMethylation450_15017482_v1.2",
    });
    expect(prov.platform).toBe("450K");
    expect(prov.annotationVersion).toBeUndefined();
  });

  it("rejects platform annotation provenance with extra fields", () => {
    expect(() =>
      PlatformAnnotationProvenanceSchema.parse({
        platform: "EPIC",
        manifestVersion: "EPIC v2",
        extraField: "bad",
      }),
    ).toThrow();
  });
});

describe("upstream epigenomics provenance contract", () => {
  it("accepts valid upstream epigenomics provenance", () => {
    const prov = UpstreamEpigenomicsProvenanceSchema.parse({
      provenanceId: "prov-001",
      pipelineName: "nf-core-methylseq",
      pipelineVersion: "2.6.0",
      steps: [
        {
          stepName: "alignment",
          toolName: "bismark",
          toolVersion: "0.24.0",
        },
      ],
      normalisationMethod: "SWAN",
      sourceAccession: "GSE123456",
    });
    expect(prov.pipelineName).toBe("nf-core-methylseq");
    expect(prov.steps).toHaveLength(1);
  });

  it("rejects upstream provenance without steps", () => {
    expect(() =>
      UpstreamEpigenomicsProvenanceSchema.parse({
        provenanceId: "prov-002",
        pipelineName: "custom",
        pipelineVersion: "1.0.0",
        steps: [],
      }),
    ).toThrow();
  });
});

describe("measured-feature versus mapping separation", () => {
  it("feature schema does not accept geneIds", () => {
    expect(() =>
      EpigenomicFeatureSchema.parse({
        featureId: "feat-1",
        featureClass: "cpg_methylation",
        modality: "dna_methylation_array",
        measuredIdentifier: "cg00000001",
        signalMetric: "beta_value",
        values: { "sample-1": 0.82 },
        geneIds: ["BRCA1"],
      }),
    ).toThrow();
  });

  it("mapping schema does not accept values", () => {
    expect(() =>
      RegionToGeneMappingSchema.parse({
        featureId: "peak-001",
        geneIds: ["BRCA1"],
        method: "nearest_gene",
        confidence: "low",
        values: { "sample-1": 1.23 },
      }),
    ).toThrow();
  });
});
