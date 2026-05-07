import { describe, it, expect } from "vitest";
import {
  detectTableFormat,
  TableShapeSchema,
  DetectionConfidenceSchema,
  FormatDetectionOptionsSchema,
  DetectedFormatSchema,
} from "../../src/ingestion/format_detection.js";

describe("detectTableFormat", () => {
  // --- Long-form detection ---

  it("detects a classic long table with high confidence", () => {
    const result = detectTableFormat(
      ["feature_id", "sample_id", "value"],
      { featureValueSemantics: "beta_value" },
    );

    expect(result.shape).toBe("long");
    expect(result.confidence).toBe("high");
    expect(result.featureValueSemantics).toBe("beta_value");
    expect(result.detectedLongColumns).toContain("feature_id");
    expect(result.detectedLongColumns).toContain("sample_id");
    expect(result.detectedLongColumns).toContain("value");
    expect(result.errors).toHaveLength(0);
  });

  it("detects long table with response_value alias", () => {
    const result = detectTableFormat(
      ["featureId", "sampleId", "response_value"],
      { featureValueSemantics: "m_value" },
    );

    expect(result.shape).toBe("long");
    expect(result.confidence).toBe("high");
  });

  it("detects long table with probe_id and signal", () => {
    const result = detectTableFormat(
      ["probe_id", "sample", "signal"],
      { featureValueSemantics: "beta_value" },
    );

    expect(result.shape).toBe("long");
    expect(result.confidence).toBe("high");
  });

  // --- Wide-form detection ---

  it("detects a wide matrix by feature_id plus sample columns", () => {
    const result = detectTableFormat(
      ["feature_id", "sample_A", "sample_B", "sample_C"],
      { featureValueSemantics: "beta_value" },
    );

    expect(result.shape).toBe("wide");
    expect(result.confidence).toBe("high");
    expect(result.detectedSampleColumns).toEqual([
      "sample_A",
      "sample_B",
      "sample_C",
    ]);
    expect(result.errors).toHaveLength(0);
  });

  it("detects wide matrix with coordinate columns without pollution", () => {
    const result = detectTableFormat(
      ["feature_id", "chr", "start", "end", "s1", "s2", "s3"],
      { featureValueSemantics: "accessibility_signal" },
    );

    expect(result.shape).toBe("wide");
    expect(result.detectedSampleColumns).toEqual(["s1", "s2", "s3"]);
    expect(result.errors).toHaveLength(0);
  });

  it("uses user-supplied sampleIdColumns for wide detection", () => {
    const result = detectTableFormat(
      ["feature_id", "donor_1", "donor_2", "donor_3"],
      {
        featureValueSemantics: "normalized_signal",
        sampleIdColumns: ["donor_1", "donor_2", "donor_3"],
      },
    );

    expect(result.shape).toBe("wide");
    expect(result.detectedSampleColumns).toEqual([
      "donor_1",
      "donor_2",
      "donor_3",
    ]);
  });

  it("rejects wide when too few sample-like columns remain", () => {
    const result = detectTableFormat(
      ["feature_id", "chr", "start"],
      { featureValueSemantics: "beta_value" },
    );

    // Not enough for wide, no long indicators beyond feature_id
    expect(result.shape).toBe("ambiguous");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // --- Summary-form detection ---

  it("detects a summary table with effect and p-value columns", () => {
    const result = detectTableFormat(
      ["feature_id", "group", "effect_size", "p_value"],
      { featureValueSemantics: "effect_size" },
    );

    expect(result.shape).toBe("summary");
    expect(result.confidence).toBe("high");
    expect(result.detectedSummaryColumns).toContain("group");
    expect(result.detectedSummaryColumns).toContain("effect_size");
    expect(result.detectedSummaryColumns).toContain("p_value");
    expect(result.errors).toHaveLength(0);
  });

  it("detects summary table with log_fc and q_value", () => {
    const result = detectTableFormat(
      ["featureId", "contrast", "log2fc", "qval"],
      { featureValueSemantics: "effect_size" },
    );

    expect(result.shape).toBe("summary");
    expect(result.confidence).toBe("high");
  });

  it("detects summary table with fold_change, se, and ci columns", () => {
    const result = detectTableFormat(
      ["feature_id", "fold_change", "se", "ci_lower", "ci_upper"],
      { featureValueSemantics: "effect_size" },
    );

    expect(result.shape).toBe("summary");
    expect(result.confidence).toBe("high");
  });

  // --- Ambiguous detection ---

  it("returns ambiguous when headers match no known pattern", () => {
    const result = detectTableFormat(
      ["a", "b", "c"],
      { featureValueSemantics: "beta_value" },
    );

    expect(result.shape).toBe("ambiguous");
    expect(result.confidence).toBe("low");
    expect(result.errors).toContain(
      "Table shape is ambiguous. Provide explicitShape override to proceed.",
    );
    expect(result.warnings).toContain(
      "No recognizable table shape detected from headers; manual review required",
    );
  });

  it("returns ambiguous when multiple shapes tie", () => {
    // feature_id + value suggests long, but many sample-like columns also suggest wide
    const result = detectTableFormat(
      ["feature_id", "value", "s1", "s2", "s3", "s4"],
      { featureValueSemantics: "beta_value" },
    );

    expect(result.shape).toBe("ambiguous");
    expect(result.confidence).toBe("low");
    expect(result.errors).toContain(
      "Table shape is ambiguous. Provide explicitShape override to proceed.",
    );
    expect(
      result.warnings.some((w) => w.includes("Ambiguous table shape")),
    ).toBe(true);
  });

  // --- Explicit override ---

  it("honours explicit shape override", () => {
    const result = detectTableFormat(
      ["feature_id", "sample_id", "value"],
      {
        explicitShape: "wide",
        featureValueSemantics: "beta_value",
      },
    );

    expect(result.shape).toBe("wide");
    expect(result.confidence).toBe("override");
    expect(
      result.warnings.some((w) =>
        w.includes('Explicit shape override "wide" differs from detected shape'),
      ),
    ).toBe(true);
  });

  it("allows explicit override without mismatch warning when already detected", () => {
    const result = detectTableFormat(
      ["feature_id", "sample_id", "value"],
      {
        explicitShape: "long",
        featureValueSemantics: "beta_value",
      },
    );

    expect(result.shape).toBe("long");
    expect(result.confidence).toBe("override");
    expect(
      result.warnings.some((w) => w.includes("differs from detected shape")),
    ).toBe(false);
  });

  it("resolves ambiguous detection via explicit override", () => {
    const result = detectTableFormat(
      ["a", "b", "c"],
      {
        explicitShape: "long",
        featureValueSemantics: "beta_value",
      },
    );

    expect(result.shape).toBe("long");
    expect(result.confidence).toBe("override");
    expect(
      result.errors.some((e) => e.includes("ambiguous")),
    ).toBe(false);
  });

  // --- Options validation ---

  it("fails closed on invalid featureValueSemantics", () => {
    const result = detectTableFormat(
      ["feature_id", "sample_id", "value"],
      {
        // @ts-expect-error testing invalid semantics
        featureValueSemantics: "not_a_semantic",
      },
    );

    expect(result.shape).toBe("ambiguous");
    expect(result.confidence).toBe("low");
    expect(
      result.errors.some((e) =>
        e.includes("options.featureValueSemantics"),
      ),
    ).toBe(true);
  });

  it("fails closed on invalid explicitShape", () => {
    const result = detectTableFormat(
      ["feature_id", "sample_id", "value"],
      {
        // @ts-expect-error testing invalid shape
        explicitShape: "not_a_shape",
        featureValueSemantics: "beta_value",
      },
    );

    expect(result.shape).toBe("ambiguous");
    expect(
      result.errors.some((e) => e.includes("options.explicitShape")),
    ).toBe(true);
  });

  it("requires explicit featureValueSemantics (schema enforced)", () => {
    const parseResult = FormatDetectionOptionsSchema.safeParse({});
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const paths = parseResult.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("featureValueSemantics");
    }
  });

  // --- Schema round-trip ---

  it("produces output valid against DetectedFormatSchema for all shapes", () => {
    const longResult = detectTableFormat(
      ["feature_id", "sample_id", "value"],
      { featureValueSemantics: "beta_value" },
    );
    expect(() => DetectedFormatSchema.parse(longResult)).not.toThrow();

    const wideResult = detectTableFormat(
      ["feature_id", "s1", "s2", "s3"],
      { featureValueSemantics: "beta_value" },
    );
    expect(() => DetectedFormatSchema.parse(wideResult)).not.toThrow();

    const summaryResult = detectTableFormat(
      ["feature_id", "group", "p_value", "effect_size"],
      { featureValueSemantics: "effect_size" },
    );
    expect(() => DetectedFormatSchema.parse(summaryResult)).not.toThrow();

    const ambiguousResult = detectTableFormat(
      ["a", "b", "c"],
      { featureValueSemantics: "beta_value" },
    );
    expect(() => DetectedFormatSchema.parse(ambiguousResult)).not.toThrow();
  });

  // --- Edge cases ---

  it("handles empty header array as ambiguous", () => {
    const result = detectTableFormat([], {
      featureValueSemantics: "beta_value",
    });

    expect(result.shape).toBe("ambiguous");
    expect(result.errors).toContain(
      "Table shape is ambiguous. Provide explicitShape override to proceed.",
    );
  });

  it("detects summary even with single summary stat if no competing shape", () => {
    const result = detectTableFormat(
      ["feature_id", "p_value"],
      { featureValueSemantics: "q_value" },
    );

    // feature_id + p_value = 2 summary score, no wide score, no long score
    // Could be summary or ambiguous depending on scores
    expect(result.shape).toBe("summary");
    expect(result.confidence).toBe("low");
  });

  it("does not infer semantics from column names", () => {
    const result = detectTableFormat(
      ["feature_id", "sample_id", "beta_value"],
      { featureValueSemantics: "m_value" },
    );

    // The column is called "beta_value" but semantics is explicitly m_value
    expect(result.shape).toBe("long");
    expect(result.featureValueSemantics).toBe("m_value");
  });
});

describe("TableShapeSchema", () => {
  it("accepts valid shapes", () => {
    expect(TableShapeSchema.parse("long")).toBe("long");
    expect(TableShapeSchema.parse("wide")).toBe("wide");
    expect(TableShapeSchema.parse("summary")).toBe("summary");
    expect(TableShapeSchema.parse("ambiguous")).toBe("ambiguous");
  });

  it("rejects invalid shapes", () => {
    expect(() => TableShapeSchema.parse("unknown")).toThrow();
  });
});

describe("DetectionConfidenceSchema", () => {
  it("accepts valid confidence levels", () => {
    expect(DetectionConfidenceSchema.parse("high")).toBe("high");
    expect(DetectionConfidenceSchema.parse("medium")).toBe("medium");
    expect(DetectionConfidenceSchema.parse("low")).toBe("low");
    expect(DetectionConfidenceSchema.parse("override")).toBe("override");
  });

  it("rejects invalid confidence levels", () => {
    expect(() => DetectionConfidenceSchema.parse("maybe")).toThrow();
  });
});
