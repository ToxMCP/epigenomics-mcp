import { z } from "zod";
import { ProvenanceRecordSchema } from "./provenance.js";
import { QualificationWarningSchema } from "./qualification.js";

/**
 * Confidence level assigned to an object or assertion.
 */
export const ConfidenceLevelSchema = z.enum([
  "high",
  "medium",
  "low",
  "none",
]);

export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

/**
 * Review flag for regulatory or scientific review tracking.
 */
export const ReviewFlagSchema = z
  .object({
    flagCode: z.string().min(1).describe("Structured flag code"),
    message: z.string().min(1).describe("Human-readable message"),
    severity: z
      .enum(["info", "warning", "critical"])
      .default("info")
      .describe("Flag severity"),
    reviewer: z.string().optional().describe("Reviewer identifier"),
    flaggedAt: z.string().datetime().optional().describe("Flag timestamp"),
  })
  .strict();

export type ReviewFlag = z.infer<typeof ReviewFlagSchema>;

/**
 * Structured error entry for envelope-level error reporting.
 */
export const EnvelopeErrorSchema = z
  .object({
    errorCode: z.string().min(1).describe("Structured error code"),
    message: z.string().min(1).describe("Human-readable message"),
    path: z.string().optional().describe("JSON path or field reference"),
  })
  .strict();

export type EnvelopeError = z.infer<typeof EnvelopeErrorSchema>;

/**
 * Shared base envelope used by all emitted objects.
 *
 * Enforces strict field validation (no additional properties) to ensure
 * contract stability in regulator-facing workflows.  Extension data must
 * be placed inside the explicit `extensions` record.
 */
export const BaseEnvelopeSchema = z
  .object({
    schemaName: z
      .string()
      .min(1)
      .describe("Normative schema name for the object"),
    schemaVersion: z
      .string()
      .min(1)
      .describe("Semver-compatible schema version"),
    objectId: z
      .string()
      .uuid()
      .describe("Globally unique object identifier"),
    objectVersion: z
      .string()
      .min(1)
      .default("1.0.0")
      .describe("Object revision version"),
    createdAt: z
      .string()
      .datetime()
      .describe("ISO-8601 creation timestamp"),
    createdBy: z
      .string()
      .min(1)
      .describe("Entity (service or user) that created the object"),
    sourceMcp: z
      .string()
      .min(1)
      .describe("Source MCP identifier (e.g. epigenomics-mcp)"),
    provenance: z
      .array(ProvenanceRecordSchema)
      .default([])
      .describe("Upstream processing provenance"),
    confidence: ConfidenceLevelSchema.default("none").describe(
      "Overall confidence assessment",
    ),
    reviewFlags: z
      .array(ReviewFlagSchema)
      .default([])
      .describe("Review flags attached to the object"),
    warnings: z
      .array(QualificationWarningSchema)
      .default([])
      .describe("Qualification warnings"),
    errors: z
      .array(EnvelopeErrorSchema)
      .default([])
      .describe("Envelope-level errors"),
    extensions: z
      .record(z.string(), z.unknown())
      .default({})
      .describe("Extension key-value store for forward compatibility"),
  })
  .strict();

export type BaseEnvelope = z.infer<typeof BaseEnvelopeSchema>;
