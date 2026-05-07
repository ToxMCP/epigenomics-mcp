import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  BaseEnvelopeSchema,
  ReviewFlagSchema,
  EnvelopeErrorSchema,
  ConfidenceLevelSchema,
  type BaseEnvelope,
} from "../../src/contracts/base.js";

describe("BaseEnvelopeSchema", () => {
  const minimalValidEnvelope = {
    schemaName: "EpigenomicsFeatureResponsePacket",
    schemaVersion: "0.1.0",
    objectId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    createdAt: "2026-05-05T00:00:00Z",
    createdBy: "epigenomics-mcp",
    sourceMcp: "epigenomics-mcp",
  };

  it("accepts a valid minimal envelope", () => {
    const envelope = BaseEnvelopeSchema.parse(minimalValidEnvelope);
    expect(envelope.schemaName).toBe("EpigenomicsFeatureResponsePacket");
    expect(envelope.schemaVersion).toBe("0.1.0");
    expect(envelope.objectVersion).toBe("1.0.0");
    expect(envelope.confidence).toBe("none");
    expect(envelope.provenance).toEqual([]);
    expect(envelope.reviewFlags).toEqual([]);
    expect(envelope.warnings).toEqual([]);
    expect(envelope.errors).toEqual([]);
    expect(envelope.extensions).toEqual({});
  });

  it("accepts a fully populated envelope", () => {
    const envelope = BaseEnvelopeSchema.parse({
      ...minimalValidEnvelope,
      objectVersion: "2.1.0",
      provenance: [
        {
          stepName: "normalisation",
          toolName: "minfi",
          toolVersion: "1.44.0",
          parameters: {},
          timestamp: "2026-05-04T00:00:00Z",
          inputFiles: ["raw.idat"],
          outputFiles: ["norm.csv"],
        },
      ],
      confidence: "high",
      reviewFlags: [
        {
          flagCode: "MANUAL_REVIEW",
          message: "Requires expert review",
          severity: "warning",
          reviewer: "jdoe",
          flaggedAt: "2026-05-05T12:00:00Z",
        },
      ],
      warnings: [
        {
          warningCode: "BATCH_EFFECT",
          severity: "warning",
          message: "Detected batch effect",
          category: "batch_effect",
          featureIds: ["feat-1"],
          blocksDownstream: false,
        },
      ],
      errors: [
        {
          errorCode: "COORDINATE_MISMATCH",
          message: "Build mismatch detected",
          path: "features[0].measuredRegion.build",
        },
      ],
      extensions: {
        customField: 42,
        nested: { key: "value" },
      },
    });
    expect(envelope.objectVersion).toBe("2.1.0");
    expect(envelope.confidence).toBe("high");
    expect(envelope.provenance).toHaveLength(1);
    expect(envelope.reviewFlags).toHaveLength(1);
    expect(envelope.warnings).toHaveLength(1);
    expect(envelope.errors).toHaveLength(1);
    expect(envelope.extensions).toEqual({
      customField: 42,
      nested: { key: "value" },
    });
  });

  it("rejects envelope missing required fields", () => {
    expect(() =>
      BaseEnvelopeSchema.parse({
        schemaVersion: "0.1.0",
        objectId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        createdAt: "2026-05-05T00:00:00Z",
        createdBy: "epigenomics-mcp",
        sourceMcp: "epigenomics-mcp",
      }),
    ).toThrow();

    expect(() =>
      BaseEnvelopeSchema.parse({
        schemaName: "Test",
        objectId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        createdAt: "2026-05-05T00:00:00Z",
        createdBy: "epigenomics-mcp",
        sourceMcp: "epigenomics-mcp",
      }),
    ).toThrow();

    expect(() =>
      BaseEnvelopeSchema.parse({
        schemaName: "Test",
        schemaVersion: "0.1.0",
        createdAt: "2026-05-05T00:00:00Z",
        createdBy: "epigenomics-mcp",
        sourceMcp: "epigenomics-mcp",
      }),
    ).toThrow();
  });

  it("rejects envelope with invalid objectId", () => {
    expect(() =>
      BaseEnvelopeSchema.parse({
        ...minimalValidEnvelope,
        objectId: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("rejects envelope with invalid datetime", () => {
    expect(() =>
      BaseEnvelopeSchema.parse({
        ...minimalValidEnvelope,
        createdAt: "not-a-datetime",
      }),
    ).toThrow();
  });

  it("rejects envelope with unknown extra fields (strict mode)", () => {
    expect(() =>
      BaseEnvelopeSchema.parse({
        ...minimalValidEnvelope,
        unexpectedField: "should fail",
      }),
    ).toThrow();
  });

  it("rejects nested extensions with extra fields in strict sub-schemas", () => {
    expect(() =>
      BaseEnvelopeSchema.parse({
        ...minimalValidEnvelope,
        reviewFlags: [
          {
            flagCode: "OK",
            message: "Looks good",
            unknownNestedField: "bad",
          },
        ],
      }),
    ).toThrow();
  });

  it("serializes to and deserializes from JSON", () => {
    const envelope: BaseEnvelope = BaseEnvelopeSchema.parse({
      ...minimalValidEnvelope,
      confidence: "medium",
      extensions: { myKey: [1, 2, 3] },
    });

    const json = JSON.stringify(envelope);
    const parsed = JSON.parse(json) as unknown;
    const roundTripped = BaseEnvelopeSchema.parse(parsed);

    expect(roundTripped.schemaName).toBe(envelope.schemaName);
    expect(roundTripped.confidence).toBe("medium");
    expect(roundTripped.extensions).toEqual({ myKey: [1, 2, 3] });
  });

  it("exports a valid JSON Schema with additionalProperties false", () => {
    const jsonSchema = zodToJsonSchema(BaseEnvelopeSchema, {
      name: "BaseEnvelope",
      $refStrategy: "none",
    });

    expect(jsonSchema).toBeDefined();
    expect(jsonSchema).toHaveProperty("$schema");
    expect(jsonSchema).toHaveProperty("definitions");

    const definitions = (jsonSchema as Record<string, unknown>)
      .definitions as Record<string, unknown> | undefined;
    expect(definitions).toBeDefined();

    const baseEnvelope = definitions?.BaseEnvelope as
      | Record<string, unknown>
      | undefined;
    expect(baseEnvelope).toBeDefined();

    const properties = baseEnvelope?.properties as
      | Record<string, unknown>
      | undefined;
    expect(properties).toBeDefined();
    expect(properties).toHaveProperty("schemaName");
    expect(properties).toHaveProperty("schemaVersion");
    expect(properties).toHaveProperty("objectId");
    expect(properties).toHaveProperty("objectVersion");
    expect(properties).toHaveProperty("createdAt");
    expect(properties).toHaveProperty("createdBy");
    expect(properties).toHaveProperty("sourceMcp");
    expect(properties).toHaveProperty("provenance");
    expect(properties).toHaveProperty("confidence");
    expect(properties).toHaveProperty("reviewFlags");
    expect(properties).toHaveProperty("warnings");
    expect(properties).toHaveProperty("errors");
    expect(properties).toHaveProperty("extensions");

    expect(baseEnvelope?.additionalProperties).toBe(false);
  });
});

describe("ConfidenceLevelSchema", () => {
  it("accepts valid confidence levels", () => {
    expect(ConfidenceLevelSchema.parse("high")).toBe("high");
    expect(ConfidenceLevelSchema.parse("medium")).toBe("medium");
    expect(ConfidenceLevelSchema.parse("low")).toBe("low");
    expect(ConfidenceLevelSchema.parse("none")).toBe("none");
  });

  it("rejects invalid confidence levels", () => {
    expect(() => ConfidenceLevelSchema.parse("very_high")).toThrow();
  });
});

describe("ReviewFlagSchema", () => {
  it("accepts a valid review flag", () => {
    const flag = ReviewFlagSchema.parse({
      flagCode: "NEEDS_REVIEW",
      message: "Manual review required",
      severity: "critical",
      reviewer: "jdoe",
      flaggedAt: "2026-05-05T12:00:00Z",
    });
    expect(flag.flagCode).toBe("NEEDS_REVIEW");
    expect(flag.severity).toBe("critical");
  });

  it("applies default severity", () => {
    const flag = ReviewFlagSchema.parse({
      flagCode: "OK",
      message: "No issues",
    });
    expect(flag.severity).toBe("info");
  });

  it("rejects extra fields", () => {
    expect(() =>
      ReviewFlagSchema.parse({
        flagCode: "OK",
        message: "No issues",
        extra: "field",
      }),
    ).toThrow();
  });
});

describe("EnvelopeErrorSchema", () => {
  it("accepts a valid error", () => {
    const error = EnvelopeErrorSchema.parse({
      errorCode: "VALIDATION_FAILED",
      message: "Field missing",
      path: "design.doseGroups",
    });
    expect(error.errorCode).toBe("VALIDATION_FAILED");
    expect(error.path).toBe("design.doseGroups");
  });

  it("accepts error without optional path", () => {
    const error = EnvelopeErrorSchema.parse({
      errorCode: "UNKNOWN",
      message: "Something went wrong",
    });
    expect(error.path).toBeUndefined();
  });

  it("rejects extra fields", () => {
    expect(() =>
      EnvelopeErrorSchema.parse({
        errorCode: "E1",
        message: "msg",
        stackTrace: "...",
      }),
    ).toThrow();
  });
});
