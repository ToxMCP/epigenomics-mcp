import { describe, it, expect } from "vitest";
import {
  ingestCellComposition,
  CellCompositionProfileSchema,
  CellCompositionSourceSchema,
  SampleCellCompositionSchema,
  CellTypeFractionSchema,
  GroupCellCompositionShiftSchema,
  classifyCellCompositionConfounding,
  CellCompositionConfoundingStatusSchema,
  CellCompositionConfoundingResultSchema,
} from "../../src/qc/cell_composition.js";
import type { ExperimentalDesign } from "../../src/contracts/design.js";

function makeDesign(overrides?: Partial<ExperimentalDesign>): ExperimentalDesign {
  return {
    designId: "design-001",
    species: "Homo sapiens",
    doseGroups: [
      { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
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

describe("ingestCellComposition", () => {
  it("accepts complete measured fractions", () => {
    const samples = [
      {
        sampleId: "s-ctrl-1",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.8 },
          { cellType: "kupffer", fraction: 0.2 },
        ],
      },
      {
        sampleId: "s-ctrl-2",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.79 },
          { cellType: "kupffer", fraction: 0.21 },
        ],
      },
    ];

    const result = ingestCellComposition("ds-001", samples);

    expect(result.fractionSumValid).toBe(true);
    expect(result.hasAnyCompositionData).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("accepts mixed population without fractions", () => {
    const samples = [
      {
        sampleId: "s-ctrl-1",
        source: "declared_mixed_unknown_fractions" as const,
        notes: "Whole liver homogenate",
      },
      {
        sampleId: "s-ctrl-2",
        source: "declared_mixed_unknown_fractions" as const,
      },
    ];

    const result = ingestCellComposition("ds-002", samples);

    expect(result.fractionSumValid).toBe(true);
    expect(result.hasAnyCompositionData).toBe(false);
    expect(result.warnings).toHaveLength(0);
    expect(result.samples[0].fractions).toBeUndefined();
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("accepts purified sample declaration with auto-filled fractions", () => {
    const samples = [
      {
        sampleId: "s-pure-1",
        source: "declared_pure" as const,
        declaredCellType: "hepatocyte",
      },
    ];

    const result = ingestCellComposition("ds-003", samples);

    expect(result.fractionSumValid).toBe(true);
    expect(result.hasAnyCompositionData).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.samples[0].fractions).toEqual([
      { cellType: "hepatocyte", fraction: 1.0 },
    ]);
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("accepts purified sample declaration with explicit fractions", () => {
    const samples = [
      {
        sampleId: "s-pure-1",
        source: "declared_pure" as const,
        fractions: [{ cellType: "hepatocyte", fraction: 1.0 }],
      },
    ];

    const result = ingestCellComposition("ds-003b", samples);

    expect(result.fractionSumValid).toBe(true);
    expect(result.hasAnyCompositionData).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("emits warnings for missing context (not_declared)", () => {
    const samples = [
      {
        sampleId: "s-ctrl-1",
        source: "not_declared" as const,
      },
    ];

    const result = ingestCellComposition("ds-004", samples);

    expect(result.hasAnyCompositionData).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("CC_NOT_DECLARED");
    expect(result.warnings[0].severity).toBe("warning");
    expect(result.warnings[0].blocksDownstream).toBe(false);
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("emits error warning for malformed fraction sums", () => {
    const samples = [
      {
        sampleId: "s-ctrl-1",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.5 },
          { cellType: "kupffer", fraction: 0.3 },
          // sum = 0.8, outside default tolerance 0.05
        ],
      },
    ];

    const result = ingestCellComposition("ds-005", samples);

    expect(result.fractionSumValid).toBe(false);
    expect(result.hasAnyCompositionData).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("CC_FRACTION_SUM_MISMATCH");
    expect(result.warnings[0].severity).toBe("error");
    expect(result.warnings[0].blocksDownstream).toBe(true);
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("accepts fraction sums within custom tolerance", () => {
    const samples = [
      {
        sampleId: "s-ctrl-1",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.5 },
          { cellType: "kupffer", fraction: 0.3 },
          // sum = 0.8, within tolerance 0.25
        ],
      },
    ];

    const result = ingestCellComposition("ds-006", samples, undefined, {
      fractionTolerance: 0.25,
    });

    expect(result.fractionSumValid).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("warns when measured source lacks fractions", () => {
    const samples = [
      {
        sampleId: "s-ctrl-1",
        source: "measured_flow_cytometry" as const,
      },
    ];

    const result = ingestCellComposition("ds-007", samples);

    expect(result.hasAnyCompositionData).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("CC_MISSING_FRACTIONS");
    expect(result.warnings[0].severity).toBe("warning");
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("warns when externally_estimated source lacks fractions", () => {
    const samples = [
      {
        sampleId: "s-ctrl-1",
        source: "externally_estimated" as const,
      },
    ];

    const result = ingestCellComposition("ds-008", samples);

    expect(result.hasAnyCompositionData).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("CC_MISSING_FRACTIONS");
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("detects group-level shifts when design is provided", () => {
    const design = makeDesign();
    const samples = [
      // Control group: 80% hepatocyte, 20% kupffer
      {
        sampleId: "s-ctrl-1",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.8 },
          { cellType: "kupffer", fraction: 0.2 },
        ],
      },
      {
        sampleId: "s-ctrl-2",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.8 },
          { cellType: "kupffer", fraction: 0.2 },
        ],
      },
      // Low group: 70% hepatocyte, 30% kupffer (delta 0.1, at threshold)
      {
        sampleId: "s-low-1",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.7 },
          { cellType: "kupffer", fraction: 0.3 },
        ],
      },
      {
        sampleId: "s-low-2",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.7 },
          { cellType: "kupffer", fraction: 0.3 },
        ],
      },
      // High group: 50% hepatocyte, 50% kupffer (delta 0.3 > threshold)
      {
        sampleId: "s-high-1",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.5 },
          { cellType: "kupffer", fraction: 0.5 },
        ],
      },
      {
        sampleId: "s-high-2",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.5 },
          { cellType: "kupffer", fraction: 0.5 },
        ],
      },
    ];

    const result = ingestCellComposition("ds-009", samples, design);

    expect(result.groupShifts).toHaveLength(3);

    const ctrlShift = result.groupShifts.find((g) => g.doseGroupId === "ctrl");
    expect(ctrlShift?.shiftDetected).toBe(false);
    expect(ctrlShift?.maxFractionDelta).toBe(0);

    const lowShift = result.groupShifts.find((g) => g.doseGroupId === "low");
    expect(lowShift?.shiftDetected).toBe(false);
    expect(lowShift?.maxFractionDelta).toBe(0.1);

    const highShift = result.groupShifts.find((g) => g.doseGroupId === "high");
    expect(highShift?.shiftDetected).toBe(true);
    expect(highShift?.maxFractionDelta).toBe(0.3);
    expect(highShift?.shiftedCellTypes).toContain("hepatocyte");
    expect(highShift?.shiftedCellTypes).toContain("kupffer");

    // One CC_GROUP_SHIFT warning should be present
    const groupShiftWarnings = result.warnings.filter(
      (w) => w.warningCode === "CC_GROUP_SHIFT",
    );
    expect(groupShiftWarnings).toHaveLength(1);
    expect(groupShiftWarnings[0].severity).toBe("warning");

    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("does not detect shifts when no design is provided", () => {
    const samples = [
      {
        sampleId: "s-ctrl-1",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.8 },
          { cellType: "kupffer", fraction: 0.2 },
        ],
      },
    ];

    const result = ingestCellComposition("ds-010", samples);

    expect(result.groupShifts).toHaveLength(0);
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("does not detect shifts when no composition data is present", () => {
    const design = makeDesign();
    const samples = [
      {
        sampleId: "s-ctrl-1",
        source: "declared_mixed_unknown_fractions" as const,
      },
      {
        sampleId: "s-ctrl-2",
        source: "declared_mixed_unknown_fractions" as const,
      },
    ];

    const result = ingestCellComposition("ds-011", samples, design);

    expect(result.groupShifts).toHaveLength(0);
    expect(result.hasAnyCompositionData).toBe(false);
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("validates source enum values", () => {
    expect(() =>
      SampleCellCompositionSchema.parse({
        sampleId: "s-1",
        source: "invalid_source",
      }),
    ).toThrow();
  });

  it("validates fraction ranges", () => {
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

  it("validates group shift schema", () => {
    const shift = {
      doseGroupId: "low",
      shiftDetected: true,
      maxFractionDelta: 0.25,
      shiftedCellTypes: ["hepatocyte"],
    };
    expect(GroupCellCompositionShiftSchema.safeParse(shift).success).toBe(true);
  });

  it("accepts externally estimated fractions", () => {
    const samples = [
      {
        sampleId: "s-ctrl-1",
        source: "externally_estimated" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.75 },
          { cellType: "kupffer", fraction: 0.25 },
        ],
      },
    ];

    const result = ingestCellComposition("ds-012", samples);

    expect(result.fractionSumValid).toBe(true);
    expect(result.hasAnyCompositionData).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("handles empty sample array", () => {
    const result = ingestCellComposition("ds-013", []);

    expect(result.samples).toHaveLength(0);
    expect(result.hasAnyCompositionData).toBe(false);
    expect(result.fractionSumValid).toBe(true);
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });

  it("handles multiple warning types in one dataset", () => {
    const samples = [
      {
        sampleId: "s-ctrl-1",
        source: "not_declared" as const,
      },
      {
        sampleId: "s-ctrl-2",
        source: "measured_flow_cytometry" as const,
        fractions: [
          { cellType: "hepatocyte", fraction: 0.5 },
          { cellType: "kupffer", fraction: 0.3 },
        ],
      },
    ];

    const result = ingestCellComposition("ds-014", samples);

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.some((w) => w.warningCode === "CC_NOT_DECLARED")).toBe(true);
    expect(result.warnings.some((w) => w.warningCode === "CC_FRACTION_SUM_MISMATCH")).toBe(true);
    expect(CellCompositionProfileSchema.safeParse(result).success).toBe(true);
  });
});


describe("classifyCellCompositionConfounding", () => {
  it("classifies purified samples as unlikely_confounding", () => {
    const profile = ingestCellComposition("ds-pure", [
      {
        sampleId: "s-1",
        source: "declared_pure",
        declaredCellType: "hepatocyte",
      },
      {
        sampleId: "s-2",
        source: "declared_pure",
        declaredCellType: "hepatocyte",
      },
    ]);

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("unlikely_confounding");
    expect(result.blocksDownstream).toBe(false);
    expect(result.warnings).toHaveLength(0);
    expect(result.rationale).toContain("declared pure");
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies mixed unknown fractions as possible_confounding", () => {
    const profile = ingestCellComposition("ds-mixed", [
      {
        sampleId: "s-1",
        source: "declared_mixed_unknown_fractions",
      },
      {
        sampleId: "s-2",
        source: "declared_mixed_unknown_fractions",
      },
    ]);

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("possible_confounding");
    expect(result.blocksDownstream).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW002_CELL_TYPE_SHIFT_POSSIBLE");
    expect(result.rationale).toContain("unknown fractions");
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies no context as no_context_available and emits EPIW001", () => {
    const profile = ingestCellComposition("ds-none", [
      {
        sampleId: "s-1",
        source: "not_declared",
      },
    ]);

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("no_context_available");
    expect(result.blocksDownstream).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW001_CELL_COMPOSITION_CONTEXT_MISSING");
    expect(result.warnings[0].severity).toBe("warning");
    expect(result.rationale).toContain("No cell-composition context");
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies empty samples as no_context_available", () => {
    const profile = ingestCellComposition("ds-empty", []);

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("no_context_available");
    expect(result.warnings[0].warningCode).toBe("EPIW001_CELL_COMPOSITION_CONTEXT_MISSING");
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies dominant group shift as dominant_confounding and emits EPIW002", () => {
    const design = makeDesign();
    const profile = ingestCellComposition(
      "ds-dom-shift",
      [
        // Control: 90% hepatocyte
        {
          sampleId: "s-ctrl-1",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.9 },
            { cellType: "kupffer", fraction: 0.1 },
          ],
        },
        {
          sampleId: "s-ctrl-2",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.9 },
            { cellType: "kupffer", fraction: 0.1 },
          ],
        },
        // Low: unchanged
        {
          sampleId: "s-low-1",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.9 },
            { cellType: "kupffer", fraction: 0.1 },
          ],
        },
        {
          sampleId: "s-low-2",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.9 },
            { cellType: "kupffer", fraction: 0.1 },
          ],
        },
        // High: 30% hepatocyte, 70% kupffer → delta 0.6
        {
          sampleId: "s-high-1",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.3 },
            { cellType: "kupffer", fraction: 0.7 },
          ],
        },
        {
          sampleId: "s-high-2",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.3 },
            { cellType: "kupffer", fraction: 0.7 },
          ],
        },
      ],
      design,
    );

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("dominant_confounding");
    expect(result.blocksDownstream).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW002_CELL_TYPE_SHIFT_POSSIBLE");
    expect(result.maxFractionDelta).toBe(0.6);
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies likely group shift as likely_confounding", () => {
    const design = makeDesign();
    const profile = ingestCellComposition(
      "ds-likely-shift",
      [
        // Control: 80% hepatocyte
        {
          sampleId: "s-ctrl-1",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.8 },
            { cellType: "kupffer", fraction: 0.2 },
          ],
        },
        {
          sampleId: "s-ctrl-2",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.8 },
            { cellType: "kupffer", fraction: 0.2 },
          ],
        },
        // High: 40% hepatocyte, 60% kupffer → delta 0.4
        {
          sampleId: "s-high-1",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.4 },
            { cellType: "kupffer", fraction: 0.6 },
          ],
        },
        {
          sampleId: "s-high-2",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.4 },
            { cellType: "kupffer", fraction: 0.6 },
          ],
        },
      ],
      design,
    );

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("likely_confounding");
    expect(result.warnings[0].warningCode).toBe("EPIW002_CELL_TYPE_SHIFT_POSSIBLE");
    expect(result.maxFractionDelta).toBe(0.4);
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies possible group shift as possible_confounding", () => {
    const design = makeDesign();
    const profile = ingestCellComposition(
      "ds-possible-shift",
      [
        // Control: 80% hepatocyte
        {
          sampleId: "s-ctrl-1",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.8 },
            { cellType: "kupffer", fraction: 0.2 },
          ],
        },
        {
          sampleId: "s-ctrl-2",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.8 },
            { cellType: "kupffer", fraction: 0.2 },
          ],
        },
        // High: 65% hepatocyte, 35% kupffer → delta 0.15
        {
          sampleId: "s-high-1",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.65 },
            { cellType: "kupffer", fraction: 0.35 },
          ],
        },
        {
          sampleId: "s-high-2",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.65 },
            { cellType: "kupffer", fraction: 0.35 },
          ],
        },
      ],
      design,
    );

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("possible_confounding");
    expect(result.warnings[0].warningCode).toBe("EPIW002_CELL_TYPE_SHIFT_POSSIBLE");
    expect(result.maxFractionDelta).toBe(0.15);
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies conflicting evidence as review_required", () => {
    const profile = ingestCellComposition("ds-conflict", [
      {
        sampleId: "s-1",
        source: "declared_pure",
        declaredCellType: "hepatocyte",
      },
      {
        sampleId: "s-2",
        source: "declared_mixed_unknown_fractions",
      },
    ]);

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("review_required");
    expect(result.blocksDownstream).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("CC_MIXED_DECLARATIONS");
    expect(result.rationale).toContain("inconsistent");
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies conflicting pure types as review_required", () => {
    const profile = ingestCellComposition("ds-pure-conflict", [
      {
        sampleId: "s-1",
        source: "declared_pure",
        declaredCellType: "hepatocyte",
      },
      {
        sampleId: "s-2",
        source: "declared_pure",
        declaredCellType: "kupffer",
      },
    ]);

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("review_required");
    expect(result.warnings[0].warningCode).toBe("CC_CONFLICTING_PURE_TYPES");
    expect(result.rationale).toContain("Conflicting");
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies invalid fraction sums as review_required", () => {
    const profile = ingestCellComposition("ds-bad-fractions", [
      {
        sampleId: "s-1",
        source: "measured_flow_cytometry",
        fractions: [
          { cellType: "hepatocyte", fraction: 0.5 },
          { cellType: "kupffer", fraction: 0.3 },
        ],
      },
    ]);

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("review_required");
    expect(result.blocksDownstream).toBe(true);
    expect(result.warnings[0].warningCode).toBe("CC_FRACTION_SUM_MISMATCH");
    expect(result.warnings[0].severity).toBe("error");
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies measured without design as possible_confounding", () => {
    const profile = ingestCellComposition("ds-measured-no-design", [
      {
        sampleId: "s-1",
        source: "measured_flow_cytometry",
        fractions: [
          { cellType: "hepatocyte", fraction: 0.8 },
          { cellType: "kupffer", fraction: 0.2 },
        ],
      },
      {
        sampleId: "s-2",
        source: "measured_flow_cytometry",
        fractions: [
          { cellType: "hepatocyte", fraction: 0.79 },
          { cellType: "kupffer", fraction: 0.21 },
        ],
      },
    ]);

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("possible_confounding");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].warningCode).toBe("EPIW002_CELL_TYPE_SHIFT_POSSIBLE");
    expect(result.rationale).toContain("no experimental design provided");
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("classifies reliable sources with design and no shifts as unlikely_confounding", () => {
    const design = makeDesign();
    const profile = ingestCellComposition(
      "ds-reliable-no-shift",
      [
        {
          sampleId: "s-ctrl-1",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.8 },
            { cellType: "kupffer", fraction: 0.2 },
          ],
        },
        {
          sampleId: "s-ctrl-2",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.8 },
            { cellType: "kupffer", fraction: 0.2 },
          ],
        },
        {
          sampleId: "s-low-1",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.81 },
            { cellType: "kupffer", fraction: 0.19 },
          ],
        },
        {
          sampleId: "s-low-2",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.79 },
            { cellType: "kupffer", fraction: 0.21 },
          ],
        },
      ],
      design,
    );

    const result = classifyCellCompositionConfounding(profile);

    expect(result.status).toBe("unlikely_confounding");
    expect(result.warnings).toHaveLength(0);
    expect(result.rationale).toContain("no group-level shifts");
    expect(CellCompositionConfoundingResultSchema.safeParse(result).success).toBe(true);
  });

  it("respects custom thresholds for shift classification", () => {
    const design = makeDesign();
    const profile = ingestCellComposition(
      "ds-custom-threshold",
      [
        // Control: 80% hepatocyte
        {
          sampleId: "s-ctrl-1",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.8 },
            { cellType: "kupffer", fraction: 0.2 },
          ],
        },
        {
          sampleId: "s-ctrl-2",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.8 },
            { cellType: "kupffer", fraction: 0.2 },
          ],
        },
        // High: 55% hepatocyte, 45% kupffer → delta 0.25
        {
          sampleId: "s-high-1",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.55 },
            { cellType: "kupffer", fraction: 0.45 },
          ],
        },
        {
          sampleId: "s-high-2",
          source: "measured_flow_cytometry",
          fractions: [
            { cellType: "hepatocyte", fraction: 0.55 },
            { cellType: "kupffer", fraction: 0.45 },
          ],
        },
      ],
      design,
    );

    // Default: likelyThreshold=0.3, so 0.25 is possible
    const resultDefault = classifyCellCompositionConfounding(profile);
    expect(resultDefault.status).toBe("possible_confounding");

    // Custom: likelyThreshold=0.2, so 0.25 is likely
    const resultCustom = classifyCellCompositionConfounding(profile, {
      likelyThreshold: 0.2,
    });
    expect(resultCustom.status).toBe("likely_confounding");
    expect(CellCompositionConfoundingResultSchema.safeParse(resultCustom).success).toBe(true);
  });

  it("validates confounding status enum", () => {
    expect(CellCompositionConfoundingStatusSchema.parse("no_context_available")).toBe("no_context_available");
    expect(CellCompositionConfoundingStatusSchema.parse("unlikely_confounding")).toBe("unlikely_confounding");
    expect(CellCompositionConfoundingStatusSchema.parse("possible_confounding")).toBe("possible_confounding");
    expect(CellCompositionConfoundingStatusSchema.parse("likely_confounding")).toBe("likely_confounding");
    expect(CellCompositionConfoundingStatusSchema.parse("dominant_confounding")).toBe("dominant_confounding");
    expect(CellCompositionConfoundingStatusSchema.parse("review_required")).toBe("review_required");
    expect(() => CellCompositionConfoundingStatusSchema.parse("invalid")).toThrow();
  });
});
