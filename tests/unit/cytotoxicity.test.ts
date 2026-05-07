import { describe, it, expect } from "vitest";
import {
  ingestCytotoxicity,
  CytotoxicityProfileSchema,
  CytotoxicityAssayTypeSchema,
  CytotoxicityEvidenceSourceSchema,
  CytotoxicityMeasurementSchema,
  CytotoxicityContextEntrySchema,
  classifyCytotoxicityConfounding,
  CytotoxicityConfoundingStatusSchema,
  CytotoxicityConfoundingResultSchema,
} from "../../src/qc/cytotoxicity.js";
import type { ExperimentalDesign } from "../../src/contracts/design.js";

function makeDesign(overrides?: Partial<ExperimentalDesign>): ExperimentalDesign {
  return {
    designId: "design-001",
    species: "Homo sapiens",
    doseGroups: [
      { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM", timepointHours: 24 },
      { doseGroupId: "low", doseValue: 1, doseUnit: "µM", timepointHours: 24 },
      { doseGroupId: "high", doseValue: 10, doseUnit: "µM", timepointHours: 24 },
    ],
    samples: [
      { sampleId: "s-ctrl-1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      { sampleId: "s-ctrl-2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      { sampleId: "s-low-1", doseGroupId: "low", species: "Homo sapiens" },
      { sampleId: "s-low-2", doseGroupId: "low", species: "Homo sapiens" },
      { sampleId: "s-high-1", doseGroupId: "high", species: "Homo sapiens" },
      { sampleId: "s-high-2", doseGroupId: "high", species: "Homo sapiens" },
    ],
    hasControls: true,
    minReplicatesPerGroup: 2,
    ...overrides,
  } as ExperimentalDesign;
}

describe("ingestCytotoxicity", () => {
  it("accepts complete viability data with aligned doses and timepoints", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-ctrl-2", doseValue: 0, timepointHours: 24, value: 0.96, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-low-1", doseValue: 1, timepointHours: 24, value: 0.92, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-low-2", doseValue: 1, timepointHours: 24, value: 0.91, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-high-1", doseValue: 10, timepointHours: 24, value: 0.85, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-high-2", doseValue: 10, timepointHours: 24, value: 0.87, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const design = makeDesign();
    const result = ingestCytotoxicity("ds-001", entries, design);

    expect(result.hasCytotoxicityData).toBe(true);
    expect(result.cytotoxicityDetected).toBe(false);
    expect(result.timepointAligned).toBe(true);
    expect(result.doseAligned).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("emits warning for missing cytotoxicity context", () => {
    const result = ingestCytotoxicity("ds-002", []);

    expect(result.hasCytotoxicityData).toBe(false);
    expect(result.cytotoxicityDetected).toBe(false);
    expect(result.timepointAligned).toBe(true);
    expect(result.doseAligned).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("CTX_MISSING_CONTEXT");
    expect(result.warnings[0].severity).toBe("warning");
    expect(result.warnings[0].blocksDownstream).toBe(false);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("emits warning for timepoint mismatch", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 48, value: 0.95, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const design = makeDesign();
    const result = ingestCytotoxicity("ds-003", entries, design);

    expect(result.timepointAligned).toBe(false);
    expect(result.doseAligned).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("CTX_TIMEPOINT_MISMATCH");
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("emits warning for dose mismatch", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 99, timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const design = makeDesign();
    const result = ingestCytotoxicity("ds-004", entries, design);

    expect(result.doseAligned).toBe(false);
    expect(result.timepointAligned).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("CTX_DOSE_MISMATCH");
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("detects cytotoxicity when viability drops below threshold", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-high-1", doseValue: 10, timepointHours: 24, value: 0.65, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const design = makeDesign();
    const result = ingestCytotoxicity("ds-005", entries, design);

    expect(result.cytotoxicityDetected).toBe(true);
    expect(result.warnings.some((w) => w.warningCode === "CTX_CYTOTOXICITY_DETECTED")).toBe(true);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("detects cytotoxicity from stress flags", () => {
    const entries = [
      {
        assayType: "stress" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 1.0, unit: "fold_change", metric: "hsp70" },
        ],
        stressFlags: ["oxidative_stress", "er_stress"],
      },
    ];

    const design = makeDesign();
    const result = ingestCytotoxicity("ds-006", entries, design);

    expect(result.cytotoxicityDetected).toBe(true);
    expect(result.warnings.some((w) => w.warningCode === "CTX_STRESS_FLAG")).toBe(true);
    expect(
      result.warnings.some(
        (w) => w.warningCode === "CTX_STRESS_FLAG" && w.category === "stress_response",
      ),
    ).toBe(true);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("emits error warning for negative measurement values", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: -0.1, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const result = ingestCytotoxicity("ds-007", entries);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("CTX_MALFORMED_VALUE");
    expect(result.warnings[0].severity).toBe("error");
    expect(result.warnings[0].blocksDownstream).toBe(true);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("accepts companion assay context", () => {
    const entries = [
      {
        assayType: "companion_assay" as const,
        evidenceSource: "measured_separate_experiment" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 100, unit: "percent", metric: "confluence" },
        ],
        notes: "Run in parallel on sister plates",
      },
    ];

    const design = makeDesign();
    const result = ingestCytotoxicity("ds-008", entries, design);

    expect(result.hasCytotoxicityData).toBe(true);
    expect(result.cytotoxicityDetected).toBe(false);
    expect(result.warnings).toHaveLength(0);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("aligns doses by doseGroupId when doseValue is absent", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseGroupId: "ctrl", timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-high-1", doseGroupId: "high", timepointHours: 24, value: 0.85, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const design = makeDesign();
    const result = ingestCytotoxicity("ds-009", entries, design);

    expect(result.doseAligned).toBe(true);
    expect(result.timepointAligned).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("skips alignment checks when no design is provided", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "not_available" as const,
        measurements: [
          { sampleId: "s-ctrl-1", value: 0.95, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const result = ingestCytotoxicity("ds-010", entries);

    expect(result.timepointAligned).toBe(true);
    expect(result.doseAligned).toBe(true);
    expect(result.hasCytotoxicityData).toBe(true);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("accepts custom viability threshold", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.75, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const design = makeDesign();
    // With default threshold 0.8, this would be detected
    const resultDefault = ingestCytotoxicity("ds-011a", entries, design);
    expect(resultDefault.cytotoxicityDetected).toBe(true);

    // With custom threshold 0.7, this should NOT be detected
    const resultCustom = ingestCytotoxicity("ds-011b", entries, design, {
      viabilityThreshold: 0.7,
    });
    expect(resultCustom.cytotoxicityDetected).toBe(false);
    expect(CytotoxicityProfileSchema.safeParse(resultCustom).success).toBe(true);
  });

  it("handles apoptosis_necrosis assay type", () => {
    const entries = [
      {
        assayType: "apoptosis_necrosis" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.05, unit: "fraction", metric: "caspase3_positive" },
        ],
      },
    ];

    const design = makeDesign();
    const result = ingestCytotoxicity("ds-012", entries, design);

    expect(result.hasCytotoxicityData).toBe(true);
    expect(result.cytotoxicityDetected).toBe(false);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("handles morphology assay type", () => {
    const entries = [
      {
        assayType: "morphology" as const,
        evidenceSource: "declared" as const,
        measurements: [],
        notes: "No morphological changes observed",
      },
    ];

    const result = ingestCytotoxicity("ds-013", entries);

    expect(result.hasCytotoxicityData).toBe(true);
    expect(result.cytotoxicityDetected).toBe(false);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("validates assay type enum", () => {
    expect(() =>
      CytotoxicityAssayTypeSchema.parse("invalid_assay"),
    ).toThrow();
  });

  it("validates evidence source enum", () => {
    expect(() =>
      CytotoxicityEvidenceSourceSchema.parse("invalid_source"),
    ).toThrow();
  });

  it("validates measurement requires at least one dose/sample reference", () => {
    expect(() =>
      CytotoxicityMeasurementSchema.parse({
        value: 0.95,
        unit: "fraction",
        metric: "cell_viability",
      }),
    ).toThrow();
  });

  it("validates measurement with only doseGroupId is acceptable", () => {
    const m = CytotoxicityMeasurementSchema.parse({
      doseGroupId: "ctrl",
      value: 0.95,
      unit: "fraction",
      metric: "cell_viability",
    });
    expect(m.doseGroupId).toBe("ctrl");
  });

  it("warns when entry has empty measurements and requireMeasurements is true", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "not_available" as const,
        measurements: [],
      },
    ];

    const result = ingestCytotoxicity("ds-014", entries);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("CTX_EMPTY_MEASUREMENTS");
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("does not warn on empty measurements when requireMeasurements is false", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "not_available" as const,
        measurements: [],
      },
    ];

    const result = ingestCytotoxicity("ds-015", entries, undefined, {
      requireMeasurements: false,
    });

    expect(result.warnings).toHaveLength(0);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("handles multiple entries with mixed flags", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
        ],
      },
      {
        assayType: "stress" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 2.5, unit: "fold_change", metric: "hsp70" },
        ],
        stressFlags: ["dna_damage"],
      },
    ];

    const design = makeDesign();
    const result = ingestCytotoxicity("ds-016", entries, design);

    expect(result.cytotoxicityDetected).toBe(true);
    expect(result.entries).toHaveLength(2);
    expect(result.warnings.some((w) => w.warningCode === "CTX_STRESS_FLAG")).toBe(true);
    expect(result.warnings.some((w) => w.warningCode === "CTX_CYTOTOXICITY_DETECTED")).toBe(true);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("detects cytotoxicity from declared notes", () => {
    const entries = [
      {
        assayType: "morphology" as const,
        evidenceSource: "declared" as const,
        measurements: [],
        notes: "Significant cytotoxicity observed at high dose",
      },
    ];

    const result = ingestCytotoxicity("ds-017", entries);

    expect(result.cytotoxicityDetected).toBe(true);
    expect(result.warnings.some((w) => w.warningCode === "CTX_CYTOTOXICITY_DETECTED")).toBe(true);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("does not detect cytotoxicity from non-declared notes", () => {
    const entries = [
      {
        assayType: "morphology" as const,
        evidenceSource: "literature" as const,
        measurements: [],
        notes: "Significant cytotoxicity observed at high dose",
      },
    ];

    const result = ingestCytotoxicity("ds-018", entries);

    // Only "declared" source triggers cytotoxicity detection from notes
    expect(result.cytotoxicityDetected).toBe(false);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("handles design with no timepoints gracefully", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const design = makeDesign({
      doseGroups: [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
    });
    const result = ingestCytotoxicity("ds-019", entries, design);

    // No design timepoints means timepoint alignment is skipped
    expect(result.timepointAligned).toBe(true);
    expect(CytotoxicityProfileSchema.safeParse(result).success).toBe(true);
  });

  it("validates context entry schema", () => {
    const entry = {
      assayType: "viability",
      evidenceSource: "measured_concurrent",
      measurements: [
        { sampleId: "s-1", value: 0.9, unit: "fraction", metric: "viability" },
      ],
    };
    expect(CytotoxicityContextEntrySchema.safeParse(entry).success).toBe(true);
  });
});

describe("classifyCytotoxicityConfounding", () => {
  it("classifies no context as no_context_available", () => {
    const profile = ingestCytotoxicity("ds-no-ctx", []);

    const result = classifyCytotoxicityConfounding(profile);

    expect(result.status).toBe("no_context_available");
    expect(result.blocksDownstream).toBe(false);
    expect(result.warnings).toHaveLength(0);
    expect(result.rationale).toContain("No cytotoxicity context");
    expect(CytotoxicityConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies clean viability as unlikely_confounding", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-low-1", doseValue: 1, timepointHours: 24, value: 0.92, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const profile = ingestCytotoxicity("ds-clean", entries);
    const result = classifyCytotoxicityConfounding(profile);

    expect(result.status).toBe("unlikely_confounding");
    expect(result.blocksDownstream).toBe(false);
    expect(result.warnings).toHaveLength(0);
    expect(result.rationale).toContain("unlikely");
    expect(result.minViability).toBe(0.92);
    expect(CytotoxicityConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies possible stress as possible_confounding", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-low-1", doseValue: 1, timepointHours: 24, value: 0.85, unit: "fraction", metric: "cell_viability" },
        ],
        stressFlags: ["oxidative_stress"],
      },
    ];

    const profile = ingestCytotoxicity("ds-stress", entries);
    const result = classifyCytotoxicityConfounding(profile);

    expect(result.status).toBe("possible_confounding");
    expect(result.blocksDownstream).toBe(false);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.some((w) => w.warningCode === "EPIW003_CYTOXICITY_CONFOUNDING")).toBe(true);
    expect(result.warnings.some((w) => w.warningCode === "EPIW004_STRESS_CONFOUNDING")).toBe(true);
    expect(result.warnings.find((w) => w.warningCode === "EPIW003_CYTOXICITY_CONFOUNDING")?.severity).toBe("warning");
    expect(CytotoxicityConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies likely injury as likely_confounding", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-low-1", doseValue: 1, timepointHours: 24, value: 0.60, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const profile = ingestCytotoxicity("ds-likely", entries);
    const result = classifyCytotoxicityConfounding(profile);

    expect(result.status).toBe("likely_confounding");
    expect(result.blocksDownstream).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW003_CYTOXICITY_CONFOUNDING");
    expect(result.warnings[0].severity).toBe("warning");
    expect(result.minViability).toBe(0.6);
    expect(CytotoxicityConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies dominant cytotoxicity as dominant_confounding and blocks downstream", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-low-1", doseValue: 1, timepointHours: 24, value: 0.45, unit: "fraction", metric: "cell_viability" },
        ],
        stressFlags: ["membrane_damage", "dna_damage"],
      },
    ];

    const profile = ingestCytotoxicity("ds-dominant", entries);
    const result = classifyCytotoxicityConfounding(profile);

    expect(result.status).toBe("dominant_confounding");
    expect(result.blocksDownstream).toBe(true);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.some((w) => w.warningCode === "EPIW003_CYTOXICITY_CONFOUNDING")).toBe(true);
    expect(result.warnings.some((w) => w.warningCode === "EPIW004_STRESS_CONFOUNDING")).toBe(true);
    const epiw3 = result.warnings.find((w) => w.warningCode === "EPIW003_CYTOXICITY_CONFOUNDING");
    expect(epiw3?.severity).toBe("error");
    expect(epiw3?.blocksDownstream).toBe(true);
    expect(result.minViability).toBe(0.45);
    expect(CytotoxicityConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies review_required for malformed values and blocks downstream", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: -0.1, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const profile = ingestCytotoxicity("ds-malformed", entries);
    const result = classifyCytotoxicityConfounding(profile);

    expect(result.status).toBe("review_required");
    expect(result.blocksDownstream).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].severity).toBe("error");
    expect(result.warnings[0].blocksDownstream).toBe(true);
    expect(CytotoxicityConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("respects custom threshold overrides", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
          { sampleId: "s-low-1", doseValue: 1, timepointHours: 24, value: 0.45, unit: "fraction", metric: "cell_viability" },
        ],
      },
    ];

    const profile = ingestCytotoxicity("ds-threshold", entries);

    // Default: 0.45 < 0.5 (dominantThreshold) → dominant
    const resultDefault = classifyCytotoxicityConfounding(profile);
    expect(resultDefault.status).toBe("dominant_confounding");
    expect(resultDefault.blocksDownstream).toBe(true);

    // Custom dominantThreshold=0.4: 0.45 >= 0.4, 0.45 < 0.7 → likely
    const resultCustom = classifyCytotoxicityConfounding(profile, {
      dominantThreshold: 0.4,
    });
    expect(resultCustom.status).toBe("likely_confounding");
    expect(resultCustom.blocksDownstream).toBe(false);
    expect(CytotoxicityConfoundingResultSchema.safeParse(resultCustom).success).toBe(true);
  });

  it("elevates unlikely to possible when stress flags are present", () => {
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.95, unit: "fraction", metric: "cell_viability" },
        ],
        stressFlags: ["er_stress"],
      },
    ];

    const profile = ingestCytotoxicity("ds-stress-only", entries);
    const result = classifyCytotoxicityConfounding(profile);

    expect(result.status).toBe("possible_confounding");
    expect(result.warnings.some((w) => w.warningCode === "EPIW004_STRESS_CONFOUNDING")).toBe(true);
    expect(CytotoxicityConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("elevates possible to likely when declared cytotoxicity is present", () => {
    const entries = [
      {
        assayType: "morphology" as const,
        evidenceSource: "declared" as const,
        measurements: [],
        notes: "Significant cytotoxicity observed at high dose",
      },
    ];

    const profile = ingestCytotoxicity("ds-declared", entries);
    const result = classifyCytotoxicityConfounding(profile);

    expect(result.status).toBe("likely_confounding");
    expect(result.warnings.some((w) => w.warningCode === "EPIW003_CYTOXICITY_CONFOUNDING")).toBe(true);
    expect(CytotoxicityConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies apoptosis/necrosis elevation as possible_confounding", () => {
    const entries = [
      {
        assayType: "apoptosis_necrosis" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "s-ctrl-1", doseValue: 0, timepointHours: 24, value: 0.05, unit: "fraction", metric: "caspase3_positive" },
          { sampleId: "s-high-1", doseValue: 10, timepointHours: 24, value: 0.35, unit: "fraction", metric: "caspase3_positive" },
        ],
      },
    ];

    const profile = ingestCytotoxicity("ds-apoptosis", entries);
    const result = classifyCytotoxicityConfounding(profile);

    expect(result.status).toBe("possible_confounding");
    expect(result.warnings.some((w) => w.warningCode === "EPIW003_CYTOXICITY_CONFOUNDING")).toBe(true);
    expect(CytotoxicityConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("validates confounding status enum", () => {
    expect(CytotoxicityConfoundingStatusSchema.parse("no_context_available")).toBe("no_context_available");
    expect(CytotoxicityConfoundingStatusSchema.parse("unlikely_confounding")).toBe("unlikely_confounding");
    expect(CytotoxicityConfoundingStatusSchema.parse("possible_confounding")).toBe("possible_confounding");
    expect(CytotoxicityConfoundingStatusSchema.parse("likely_confounding")).toBe("likely_confounding");
    expect(CytotoxicityConfoundingStatusSchema.parse("dominant_confounding")).toBe("dominant_confounding");
    expect(CytotoxicityConfoundingStatusSchema.parse("review_required")).toBe("review_required");
    expect(() => CytotoxicityConfoundingStatusSchema.parse("invalid")).toThrow();
  });

  it("classifies benchmark dominant fixture as dominant_confounding via stress elevation", () => {
    // Replicate the bm_dominant_cytotoxicity fixture data
    const entries = [
      {
        assayType: "viability" as const,
        evidenceSource: "measured_concurrent" as const,
        measurements: [
          { sampleId: "sample-ctrl-1", doseValue: 0, value: 0.95, unit: "fraction", metric: "cell_viability" },
          { sampleId: "sample-ctrl-2", doseValue: 0, value: 0.96, unit: "fraction", metric: "cell_viability" },
          { sampleId: "sample-low-1", doseValue: 1, value: 0.55, unit: "fraction", metric: "cell_viability" },
          { sampleId: "sample-low-2", doseValue: 1, value: 0.52, unit: "fraction", metric: "cell_viability" },
        ],
        stressFlags: ["membrane_damage"],
      },
    ];

    const profile = ingestCytotoxicity("bm-cyto-dom", entries);
    const result = classifyCytotoxicityConfounding(profile);

    // Viability 0.52-0.55 gives base=likely (between 0.5 and 0.7);
    // stress flags elevate to dominant.
    expect(result.status).toBe("dominant_confounding");
    expect(result.blocksDownstream).toBe(true);
    expect(result.minViability).toBe(0.52);
    expect(CytotoxicityConfoundingResultSchema.safeParse(result).success).toBe(true);
  });
});
