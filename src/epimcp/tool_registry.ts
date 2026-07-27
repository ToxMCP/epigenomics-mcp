import { z } from "zod";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { VERSION } from "./version.js";
import { ConfigSchema, type Config } from "./config.js";
import {
  DesignValidationResultSchema,
  validateDesign,
} from "../validators/design.js";
import { DesignReadinessStatusSchema } from "../validators/design_validation_report.js";
import { qualifyFeatures } from "../qualification/engine.js";
import { buildHandoffPacket } from "../handoff/builder.js";
import { validateCoordinateSystemDeclarations } from "../validators/coordinate_validator.js";
import { profileQc } from "../qc/profiler.js";
import {
  profileMissingness,
  MissingnessPolicySchema,
  MissingnessProfileSchema,
} from "../qc/missingness.js";
import {
  ingestCellComposition,
  CellCompositionProfileSchema,
  SampleCellCompositionSchema,
} from "../qc/cell_composition.js";
import {
  ingestCytotoxicity,
  CytotoxicityContextEntrySchema,
  CytotoxicityProfileSchema,
} from "../qc/cytotoxicity.js";
import { qualificationContextFromProfiles } from "../qualification/context.js";
import {
  GroupSummaryPacketSchema,
  summarizeByGroup,
} from "../summarization/group_summary.js";
import { readTableFile, ReadTableResultSchema } from "../ingestion/csv_reader.js";
import { readDesignTable, ReadDesignResultSchema } from "../ingestion/design_reader.js";
import {
  ingestFeatureTable,
  IngestFeatureTableOptionsObjectSchema,
} from "../ingestion/feature_table.js";
import {
  streamIngestFeatureTableFile,
  StreamingIngestOptionsSchema,
} from "../ingestion/streaming_ingest.js";
import { generateQcReport } from "../reports/qc_report.js";
import { EpigenomicsFeatureResponsePacketSchema } from "../contracts/packets.js";
import { ExperimentalDesignSchema } from "../contracts/design.js";
import { QcProfileSchema } from "../contracts/qc.js";
import {
  FeatureQualificationSchema,
  QualificationWarningSchema,
} from "../contracts/qualification.js";
import { DatasetProvenanceSchema } from "../contracts/provenance.js";
import {
  BatchCoordinateConversionResultSchema,
  CoordinateConversionInputSchema,
} from "../contracts/coordinate_conversion.js";
import { normalizeCoordinateRecords } from "../coordinate_mapping/normalise.js";
import { CoordinateSystemDeclarationSchema } from "../validators/coordinate_validator.js";

/** Backward-compatible tool-registry export. */
export const ValidateDesignResultSchema = DesignValidationResultSchema;

// ---------------------------------------------------------------------------
// Shared output envelope
// ---------------------------------------------------------------------------

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function toStructuredObject(result: unknown): Record<string, unknown> {
  if (result !== null && typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return { result };
}

function jsonResult(result: unknown): CallToolResult {
  return {
    structuredContent: toStructuredObject(result),
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
}

function errorResult(message: string): CallToolResult {
  const result = { error: message, errors: [message] };
  return {
    isError: true,
    structuredContent: result,
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
}

function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

function realpathIfPossible(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isWithinRoot(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function resolveMcpReadableFile(
  filePath: string,
  config: Config,
): { ok: true; path: string } | { ok: false; error: string } {
  const resolvedPath = realpathIfPossible(resolve(filePath));
  const allowedRoots = config.fileAccess.allowedRoots.map((root) =>
    realpathIfPossible(resolve(root)),
  );

  if (!allowedRoots.some((root) => isWithinRoot(resolvedPath, root))) {
    return {
      ok: false,
      error: `File path is outside allowed roots: ${filePath}`,
    };
  }

  try {
    const stat = statSync(resolvedPath);
    if (!stat.isFile()) {
      return { ok: false, error: `Path is not a regular file: ${filePath}` };
    }
    if (stat.size > config.fileAccess.maxFileBytes) {
      return {
        ok: false,
        error: `File exceeds maximum allowed size: ${stat.size} bytes > ${config.fileAccess.maxFileBytes} bytes`,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `File is not readable: ${message}` };
  }

  return { ok: true, path: resolvedPath };
}

function readMcpJsonFile(
  filePath: string,
  config: Config,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const access = resolveMcpReadableFile(filePath, config);
  if (!access.ok) return access;
  try {
    return { ok: true, value: JSON.parse(readFileSync(access.path, "utf-8")) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to parse JSON file ${filePath}: ${message}` };
  }
}

function effectiveReadOptions(
  options: z.infer<typeof ReadTableMcpOptionsSchema>["options"] | undefined,
  config: Config,
): z.infer<typeof ReadTableMcpOptionsSchema>["options"] & { maxFileBytes: number } {
  const requestedLimit = options?.limit ?? config.fileAccess.defaultRowLimit;
  const limit = Math.min(requestedLimit, config.fileAccess.maxRowLimit);
  return {
    ...options,
    limit,
    offset: options?.offset ?? 0,
    maxFileBytes: config.fileAccess.maxFileBytes,
  };
}

function readTableFailureResult(error: string): z.infer<typeof ReadTableResultSchema> {
  return {
    success: false,
    headers: [],
    rows: [],
    rowCount: 0,
    dataRowCount: 0,
    totalDataRowCount: 0,
    hasMore: false,
    nextOffset: null,
    checksumSha256: "0".repeat(64),
    delimiterUsed: ",",
    encodingUsed: "utf-8",
    errors: [error],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Tool I/O schemas
// ---------------------------------------------------------------------------

export const HealthResultSchema = z
  .object({
    status: z.literal("ok").describe("Current server health state"),
    version: z.string().describe("Epigenomics MCP package version"),
    timestamp: z.string().datetime().describe("UTC health-check timestamp"),
  })
  .strict();

export const IngestDatasetOptionsSchema = z
  .object({
    datasetId: z.string().min(1).describe("Stable identifier for the input dataset"),
    modality: IngestFeatureTableOptionsObjectSchema.shape.modality
      .describe("Epigenomic assay modality, for example dna_methylation_array"),
    tableOptions: IngestFeatureTableOptionsObjectSchema.omit({
      tableId: true,
      modality: true,
      designSampleIds: true,
      readTableOptions: true,
    }).describe(
      "Explicit feature class, signal semantics, table shape, sample columns, and coordinate mappings used to canonicalize the table",
    ),
    featuresPath: z
      .string()
      .min(1)
      .describe("CSV or TSV feature table path under an allowed file root"),
    designPath: z
      .string()
      .min(1)
      .describe("ExperimentalDesign JSON path under an allowed file root"),
    provenancePath: z
      .string()
      .min(1)
      .describe("DatasetProvenance JSON path under an allowed file root"),
    executionMode: z
      .enum(["bounded", "streaming"])
      .default("bounded")
      .describe(
        "bounded applies the configured row cap; streaming canonicalizes an explicitly authorized large file in bounded batches",
      ),
    streamingOptions: StreamingIngestOptionsSchema.optional().describe(
      "Compression, delimiter, header, and batch controls used only in streaming mode",
    ),
  })
  .strict();

export const IngestDatasetResultSchema = z
  .object({
    datasetId: z.string().describe("Dataset identifier supplied by the caller"),
    ingested: z.boolean().describe("True when all input evidence passed ingestion checks"),
    featureCount: z.number().int().nonnegative().describe("Parsed feature count"),
    errors: z.array(z.string()).default([]).describe("Blocking ingestion errors"),
    warnings: z.array(z.string()).default([]).describe("Non-blocking ingestion warnings"),
    executionMode: z.enum(["bounded", "streaming"]).optional(),
    dataValid: z.boolean().optional(),
    designValid: z
      .boolean()
      .optional()
      .describe("Backward-compatible alias for designStructurallyValid"),
    designStructurallyValid: z
      .boolean()
      .optional()
      .describe("True when the design is valid for ingestion"),
    comparisonReady: z
      .boolean()
      .optional()
      .describe("True when treatment-versus-control comparison is supported"),
    doseResponseReady: z
      .boolean()
      .optional()
      .describe("True when minimum project dose-response thresholds are met"),
    preferredForDoseResponse: z
      .boolean()
      .optional()
      .describe("True when preferred project dose-response thresholds are met"),
    designReadinessStatus: DesignReadinessStatusSchema.optional(),
    provenanceValid: z.boolean().optional(),
    dataRowCount: z.number().int().nonnegative().optional(),
    batchCount: z.number().int().nonnegative().optional(),
    sampleCount: z.number().int().nonnegative().optional(),
    firstFeatureId: z.string().nullable().optional(),
    lastFeatureId: z.string().nullable().optional(),
    sourceFileBytes: z.number().int().nonnegative().optional(),
    sourceChecksumSha256: z.string().length(64).optional(),
    contentChecksumSha256: z.string().length(64).optional(),
    errorCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Total blocking errors across feature, design, and provenance checks"),
    warningCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Total non-blocking warnings across feature, design, and provenance checks"),
  })
  .strict();

export const ValidateDesignOptionsSchema = z
  .object({
    design: z
      .record(z.string(), z.unknown())
      .describe("Candidate ExperimentalDesign object to validate"),
  })
  .strict();

export const QualifyFeaturesOptionsSchema = z
  .object({
    packet: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("EpigenomicsFeatureResponsePacket candidate to qualify"),
    packetPath: z
      .string()
      .min(1)
      .optional()
      .describe("JSON packet path under an allowed file root; use instead of packet"),
    cellCompositionProfile: CellCompositionProfileSchema.optional().describe(
      "Optional output from ingest_cell_composition to include in qualification",
    ),
    cytotoxicityProfile: CytotoxicityProfileSchema.optional().describe(
      "Optional output from ingest_cytotoxicity to include in qualification",
    ),
  })
  .strict();

export const QualifyFeaturesResultSchema = z
  .object({
    qualifiedCount: z.number().int().nonnegative().describe("Features accepted for PoD use"),
    excludedCount: z.number().int().nonnegative().describe("Features excluded from PoD use"),
    warnings: z.array(QualificationWarningSchema).describe("Dataset-level qualification warnings"),
    qualifications: z
      .array(FeatureQualificationSchema)
      .optional()
      .describe("Per-feature qualification decisions for a valid packet"),
    claimGuardResult: z
      .object({
        persistenceStatus: z.enum(["persistent", "transient", "not_assessed", "unknown"]),
        reversibilityStatus: z.enum(["reversible", "irreversible", "not_assessed", "unknown"]),
        heritabilityClaim: z.enum(["heritable", "transgenerational", "none", "not_claimed"]),
      })
      .strict()
      .optional()
      .describe("Guarded temporal and inheritance claims"),
    explainabilitySummary: z
      .object({
        uniqueRuleCodes: z.array(z.string()),
        ruleCodeCounts: z.record(z.string(), z.number().int().nonnegative()),
        reviewRequiredCount: z.number().int().nonnegative(),
        featuresWithRemediation: z.number().int().nonnegative(),
      })
      .strict()
      .optional()
      .describe("Aggregate rule and remediation counts"),
  })
  .strict();

export const GenerateHandoffOptionsSchema = z
  .object({
    packet: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Qualified EpigenomicsFeatureResponsePacket candidate"),
    packetPath: z
      .string()
      .min(1)
      .optional()
      .describe("JSON packet path under an allowed file root; use instead of packet"),
    cellCompositionProfile: CellCompositionProfileSchema.optional().describe(
      "Optional output from ingest_cell_composition to include in handoff qualification",
    ),
    cytotoxicityProfile: CytotoxicityProfileSchema.optional().describe(
      "Optional output from ingest_cytotoxicity to include in handoff qualification",
    ),
  })
  .strict();

export const GenerateHandoffResultSchema = z
  .object({
    handoffId: z.string().describe("Generated Bioactivity-PoD handoff identifier"),
    qualifiedFeatureCount: z.number().int().nonnegative(),
    readyForPod: z.boolean().describe("Whether the handoff has a usable qualified subset"),
  })
  .strict();

export const ValidateCoordinatesOptionsSchema = z
  .object({
    declarations: z
      .array(CoordinateSystemDeclarationSchema)
      .describe("Feature coordinate-system declarations to validate"),
  })
  .strict();

export const ValidateCoordinatesResultSchema = z
  .object({
    valid: z.boolean().describe("True when every declaration is acceptable"),
    errors: z.array(z.string()).describe("Blocking coordinate-semantics errors"),
    warnings: z.array(z.string()).describe("Non-blocking coordinate warnings"),
  })
  .strict();

const QcFeatureInputSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    values: z
      .record(z.string().min(1), z.number().or(z.null()))
      .describe("Sample identifier to numeric value; null denotes missingness"),
  })
  .passthrough()
  .describe("Feature fields required by QC profiling; other feature metadata is preserved");

export const ProfileQcOptionsSchema = z
  .object({
    datasetId: z.string().min(1).describe("Dataset identifier"),
    features: z
      .array(QcFeatureInputSchema)
      .describe("Epigenomic features containing featureId and sample-value mappings"),
    design: ExperimentalDesignSchema.describe("Validated experimental design"),
  })
  .strict();

export const ProfileQcResultSchema = z
  .object({
    profile: QcProfileSchema,
    pass: z.boolean().describe("Whether the deterministic QC profile passed"),
  })
  .strict();

export const ProfileMissingnessOptionsSchema = z
  .object({
    datasetId: z.string().min(1).describe("Dataset identifier"),
    features: z
      .array(QcFeatureInputSchema)
      .describe("Epigenomic features containing featureId and sample-value mappings"),
    design: ExperimentalDesignSchema.describe("Validated experimental design"),
    policy: MissingnessPolicySchema.optional().describe("Optional threshold policy override"),
  })
  .strict();

export const IngestCellCompositionOptionsSchema = z
  .object({
    datasetId: z.string().min(1).describe("Dataset identifier"),
    samples: z
      .array(SampleCellCompositionSchema)
      .describe("Per-sample cell-composition evidence"),
    design: ExperimentalDesignSchema.optional().describe(
      "Design used to detect dose-group composition shifts",
    ),
    options: z
      .object({
        fractionTolerance: z.number().min(0).max(1).optional(),
        shiftThreshold: z.number().min(0).max(1).optional(),
      })
      .strict()
      .optional()
      .describe("Optional fraction validation and shift thresholds"),
  })
  .strict();

export const IngestCytotoxicityOptionsSchema = z
  .object({
    datasetId: z.string().min(1).describe("Dataset identifier"),
    entries: z
      .array(CytotoxicityContextEntrySchema)
      .describe("Cytotoxicity or companion-assay evidence"),
    design: ExperimentalDesignSchema.optional().describe(
      "Design used to assess dose and timepoint alignment",
    ),
    options: z
      .object({
        viabilityThreshold: z.number().min(0).optional(),
        requireMeasurements: z.boolean().optional(),
      })
      .strict()
      .optional()
      .describe("Optional cytotoxicity ingestion policy"),
  })
  .strict();

export const SummarizeByGroupOptionsSchema = z
  .object({
    packet: EpigenomicsFeatureResponsePacketSchema.optional().describe(
      "Validated packet whose feature values will be summarized by dose group",
    ),
    packetPath: z
      .string()
      .min(1)
      .optional()
      .describe("JSON packet path under an allowed file root; use instead of packet"),
    includeSampleRefs: z
      .boolean()
      .default(false)
      .describe("Include contributing sample identifiers in summaries"),
  })
  .strict();

function resolvePacketInput(
  packet: unknown,
  packetPath: string | undefined,
  config: Config,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if ((packet === undefined) === (packetPath === undefined)) {
    return {
      ok: false,
      error: "Provide exactly one of packet or packetPath",
    };
  }
  if (packetPath !== undefined) {
    const loaded = readMcpJsonFile(packetPath, config);
    return loaded.ok
      ? { ok: true, value: loaded.value }
      : { ok: false, error: loaded.error };
  }
  return { ok: true, value: packet };
}

export const SummarizeByGroupResultSchema = z
  .object({
    packet: GroupSummaryPacketSchema,
    featureCount: z.number().int().nonnegative(),
    groupCount: z.number().int().nonnegative(),
    totalSummaries: z.number().int().nonnegative(),
  })
  .strict();

const TextEncodingSchema = z.enum(["utf-8", "utf-16le", "latin1", "ascii"]);

export const ReadTableMcpOptionsSchema = z
  .object({
    filePath: z
      .string()
      .min(1)
      .describe("Delimited text file path under an allowed file root"),
    options: z
      .object({
        delimiter: z.enum([",", "\t", ";", "|"]).optional(),
        encoding: TextEncodingSchema.optional(),
        fallbackEncodings: z.array(TextEncodingSchema).optional(),
        headerRowIndex: z.number().int().nonnegative().optional(),
        offset: z.number().int().nonnegative().default(0).describe("Rows to skip"),
        limit: z.number().int().positive().optional().describe("Maximum rows to return"),
      })
      .strict()
      .optional()
      .describe("Parsing and pagination options"),
  })
  .strict();

export const ReadDesignOptionsSchema = z
  .object({
    filePath: z
      .string()
      .min(1)
      .describe("Delimited design table path under an allowed file root"),
    options: z
      .object({
        designId: z.string().min(1).describe("Stable output design identifier"),
        studyId: z.string().min(1).optional(),
        species: z.string().min(1).describe("Species name applied to design samples"),
        columnMapping: z
          .record(z.string(), z.string())
          .optional()
          .describe("Source-to-contract column name mapping"),
        readTableOptions: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Low-level delimited-table reader options"),
      })
      .strict(),
  })
  .strict();

export const GenerateQcReportOptionsSchema = z
  .object({
    datasetId: z.string().min(1).describe("Dataset identifier"),
    profile: QcProfileSchema.describe("Validated deterministic QC profile"),
    warnings: z
      .array(QualificationWarningSchema)
      .default([])
      .describe("Qualification warnings to include"),
  })
  .strict();

export const GenerateQcReportResultSchema = z
  .object({
    reportId: z.string().describe("Generated QC report identifier"),
    datasetId: z.string(),
    generatedAt: z.string().datetime(),
    profile: QcProfileSchema,
    warnings: z.array(QualificationWarningSchema),
    conclusion: z.string().describe("Human-readable QC conclusion"),
  })
  .strict();

export const ConvertCoordinatesOptionsSchema = z
  .object({
    records: z
      .array(CoordinateConversionInputSchema)
      .describe("Coordinate records to normalize to 0-based half-open intervals"),
  })
  .strict();

export const ConvertCoordinatesResultSchema = BatchCoordinateConversionResultSchema;

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.AnyZodObject;
  outputSchema: z.ZodTypeAny;
  annotations?: ToolAnnotations;
  handler: (
    args: Record<string, unknown>,
    context?: { config: Config },
  ) => Promise<CallToolResult>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "health",
    title: "Check Epigenomics MCP Health",
    description: "Return the running Epigenomics MCP version and a UTC health timestamp.",
    inputSchema: z.object({}).strict(),
    outputSchema: HealthResultSchema,
    handler: async () => {
      const result = HealthResultSchema.parse({
        status: "ok",
        version: VERSION,
        timestamp: new Date().toISOString(),
      });
      return jsonResult(result);
    },
  },
  {
    name: "ingest_dataset",
    title: "Ingest Epigenomics Dataset",
    description:
      "Validate and ingest a processed feature table together with design and provenance JSON evidence. Ingestion success is reported separately from comparison and dose-response readiness. Bounded mode enforces the configured row cap; explicit streaming mode supports authorized large or gzip-compressed tables in bounded batches. All paths remain subject to the server file policy.",
    inputSchema: IngestDatasetOptionsSchema,
    outputSchema: IngestDatasetResultSchema,
    handler: async (args, context) => {
      const config = context?.config ?? ConfigSchema.parse({});
      const typedArgs = IngestDatasetOptionsSchema.parse(args);
      const errors: string[] = [];
      const warnings: string[] = [];
      let designValid = false;
      let comparisonReady = false;
      let doseResponseReady = false;
      let preferredForDoseResponse = false;
      let designReadinessStatus: z.infer<
        typeof DesignReadinessStatusSchema
      > = "invalid";
      let provenanceValid = false;
      const designReadinessFields = () => ({
        designValid,
        designStructurallyValid: designValid,
        comparisonReady,
        doseResponseReady,
        preferredForDoseResponse,
        designReadinessStatus,
      });

      const featuresAccess = resolveMcpReadableFile(typedArgs.featuresPath, config);
      if (!featuresAccess.ok) {
        errors.push(`features: ${featuresAccess.error}`);
      }

      const designJson = readMcpJsonFile(typedArgs.designPath, config);
      let design: z.infer<typeof ExperimentalDesignSchema> | undefined;
      if (!designJson.ok) {
        errors.push(`design: ${designJson.error}`);
      } else {
        const designParse = ExperimentalDesignSchema.safeParse(designJson.value);
        if (!designParse.success) {
          errors.push(...zodIssues(designParse.error).map((e) => `design: ${e}`));
        } else {
          design = designParse.data;
          const designValidation = validateDesign(design);
          errors.push(...designValidation.errors.map((e) => `design: ${e}`));
          warnings.push(...designValidation.warnings.map((w) => `design: ${w}`));
          designValid = designValidation.structurallyValid;
          comparisonReady = designValidation.comparisonReady;
          doseResponseReady = designValidation.doseResponseReady;
          preferredForDoseResponse =
            designValidation.preferredForDoseResponse;
          designReadinessStatus = designValidation.readinessStatus;
        }
      }

      const provenanceJson = readMcpJsonFile(typedArgs.provenancePath, config);
      if (!provenanceJson.ok) {
        errors.push(`provenance: ${provenanceJson.error}`);
      } else {
        const provenanceParse = DatasetProvenanceSchema.safeParse(provenanceJson.value);
        if (!provenanceParse.success) {
          errors.push(...zodIssues(provenanceParse.error).map((e) => `provenance: ${e}`));
        } else if (provenanceParse.data.datasetId !== typedArgs.datasetId) {
          errors.push(
            `provenance: datasetId "${provenanceParse.data.datasetId}" does not match requested datasetId "${typedArgs.datasetId}"`,
          );
        } else {
          provenanceValid = true;
        }
      }

      if (!featuresAccess.ok) {
        const result = IngestDatasetResultSchema.parse({
          datasetId: typedArgs.datasetId,
          ingested: false,
          featureCount: 0,
          errors,
          warnings,
          executionMode: typedArgs.executionMode,
          dataValid: false,
          ...designReadinessFields(),
          provenanceValid,
          errorCount: errors.length,
          warningCount: warnings.length,
        });
        return jsonResult(result);
      }

      if (typedArgs.executionMode === "streaming") {
        try {
          const streamResult = await streamIngestFeatureTableFile(
            featuresAccess.path,
            {
              ...typedArgs.tableOptions,
              tableId: typedArgs.datasetId,
              modality: typedArgs.modality,
              designSampleIds: design?.samples.map((sample) => sample.sampleId),
              sampleIdColumns:
                typedArgs.tableOptions.sampleIdColumns ??
                design?.samples.map((sample) => sample.sampleId),
            },
            typedArgs.streamingOptions,
          );
          errors.push(...streamResult.errors.map((e) => `features: ${e}`));
          warnings.push(...streamResult.warnings.map((w) => `features: ${w}`));
          const result = IngestDatasetResultSchema.parse({
            datasetId: typedArgs.datasetId,
            ingested:
              streamResult.ingestionCompatible &&
              designValid &&
              provenanceValid,
            featureCount: streamResult.featureCount,
            errors,
            warnings,
            executionMode: typedArgs.executionMode,
            dataValid: streamResult.ingestionCompatible,
            ...designReadinessFields(),
            provenanceValid,
            dataRowCount: streamResult.dataRowCount,
            batchCount: streamResult.batchCount,
            sampleCount: streamResult.sampleCount,
            firstFeatureId: streamResult.firstFeatureId,
            lastFeatureId: streamResult.lastFeatureId,
            sourceFileBytes: streamResult.sourceFileBytes,
            sourceChecksumSha256: streamResult.sourceChecksumSha256,
            contentChecksumSha256: streamResult.contentChecksumSha256,
            errorCount: errors.length,
            warningCount: warnings.length,
          });
          return jsonResult(result);
        } catch (error) {
          errors.push(
            `features: streaming ingestion failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          const result = IngestDatasetResultSchema.parse({
            datasetId: typedArgs.datasetId,
            ingested: false,
            featureCount: 0,
            errors,
            warnings,
            executionMode: typedArgs.executionMode,
            dataValid: false,
            ...designReadinessFields(),
            provenanceValid,
            errorCount: errors.length,
            warningCount: warnings.length,
          });
          return jsonResult(result);
        }
      }

      const tableResult = readTableFile(featuresAccess.path, {
        maxFileBytes: config.fileAccess.maxFileBytes,
        offset: 0,
        limit: config.fileAccess.maxRowLimit,
      });
      if (!tableResult.success) {
        errors.push(...tableResult.errors.map((e) => `features: ${e}`));
        const result = IngestDatasetResultSchema.parse({
          datasetId: typedArgs.datasetId,
          ingested: false,
          featureCount: 0,
          errors,
          warnings,
          executionMode: typedArgs.executionMode,
          dataValid: false,
          ...designReadinessFields(),
          provenanceValid,
          errorCount: errors.length,
          warningCount: warnings.length,
        });
        return jsonResult(result);
      }
      if (tableResult.hasMore) {
        errors.push(
          `features: table exceeds maximum row limit of ${config.fileAccess.maxRowLimit}`,
        );
      }
      const ingestResult = ingestFeatureTable(tableResult.rows, {
        ...typedArgs.tableOptions,
        tableId: typedArgs.datasetId,
        modality: typedArgs.modality,
        designSampleIds: design?.samples.map((sample) => sample.sampleId),
        sampleIdColumns:
          typedArgs.tableOptions.sampleIdColumns ??
          design?.samples.map((sample) => sample.sampleId),
      });
      errors.push(...ingestResult.parseErrors.map((e) => `features: ${e}`));
      const result = IngestDatasetResultSchema.parse({
        datasetId: typedArgs.datasetId,
        ingested: errors.length === 0 && design !== undefined,
        featureCount: ingestResult.features.length,
        errors,
        warnings,
        executionMode: typedArgs.executionMode,
        dataValid: ingestResult.parseErrors.length === 0 && !tableResult.hasMore,
        ...designReadinessFields(),
        provenanceValid,
        dataRowCount: tableResult.totalDataRowCount,
        batchCount: 1,
        sampleCount:
          typedArgs.tableOptions.sampleIdColumns?.length ??
          design?.samples.length ??
          0,
        firstFeatureId: ingestResult.features[0]?.featureId ?? null,
        lastFeatureId:
          ingestResult.features[ingestResult.features.length - 1]?.featureId ??
          null,
        sourceFileBytes: statSync(featuresAccess.path).size,
        sourceChecksumSha256: tableResult.checksumSha256,
        contentChecksumSha256: tableResult.checksumSha256,
        errorCount: errors.length,
        warningCount: warnings.length,
      });
      return jsonResult(result);
    },
  },
  {
    name: "validate_design",
    title: "Validate Experimental Design",
    description:
      "Validate schema and structural integrity, then separately report control-comparison, minimum dose-response, and preferred dose-response readiness using distinct dose levels and effective biological replicates.",
    inputSchema: ValidateDesignOptionsSchema,
    outputSchema: ValidateDesignResultSchema,
    handler: async (args) => {
      const typedArgs = ValidateDesignOptionsSchema.parse(args);
      const validation = validateDesign(typedArgs.design);
      const result = ValidateDesignResultSchema.parse(validation);
      return jsonResult(result);
    },
  },
  {
    name: "qualify_features",
    title: "Qualify Epigenomic Features",
    description:
      "Apply deterministic, fail-closed qualification policy to an EpigenomicsFeatureResponsePacket and return per-feature eligibility, warnings, and rule summaries.",
    inputSchema: QualifyFeaturesOptionsSchema,
    outputSchema: QualifyFeaturesResultSchema,
    handler: async (args, context) => {
      const config = context?.config ?? ConfigSchema.parse({});
      const typedArgs = QualifyFeaturesOptionsSchema.parse(args);
      const packet = resolvePacketInput(
        typedArgs.packet,
        typedArgs.packetPath,
        config,
      );
      if (!packet.ok) {
        return errorResult(packet.error);
      }
      const result = qualifyFeatures(
        packet.value,
        qualificationContextFromProfiles({
          cellCompositionProfile: typedArgs.cellCompositionProfile,
          cytotoxicityProfile: typedArgs.cytotoxicityProfile,
        }),
      );
      return jsonResult(QualifyFeaturesResultSchema.parse(result));
    },
  },
  {
    name: "generate_handoff",
    title: "Generate Bioactivity-PoD Handoff",
    description:
      "Build a Bioactivity-PoD handoff summary from a qualified epigenomics response packet using deterministic qualification decisions.",
    inputSchema: GenerateHandoffOptionsSchema,
    outputSchema: GenerateHandoffResultSchema,
    handler: async (args, context) => {
      const config = context?.config ?? ConfigSchema.parse({});
      const typedArgs = GenerateHandoffOptionsSchema.parse(args);
      const packet = resolvePacketInput(
        typedArgs.packet,
        typedArgs.packetPath,
        config,
      );
      if (!packet.ok) {
        return errorResult(packet.error);
      }
      const handoff = buildHandoffPacket(packet.value, {
        qualificationContext: qualificationContextFromProfiles({
          cellCompositionProfile: typedArgs.cellCompositionProfile,
          cytotoxicityProfile: typedArgs.cytotoxicityProfile,
        }),
      });
      const result = GenerateHandoffResultSchema.parse({
        handoffId: handoff.handoffId,
        qualifiedFeatureCount: handoff.qualifiedFeatureCount,
        readyForPod: handoff.readyForPod,
      });
      return jsonResult(result);
    },
  },
  {
    name: "validate_coordinates",
    title: "Validate Coordinate Declarations",
    description:
      "Validate coordinate-system declarations for region-bearing features and return actionable EPI002 errors.",
    inputSchema: ValidateCoordinatesOptionsSchema,
    outputSchema: ValidateCoordinatesResultSchema,
    handler: async (args) => {
      const typedArgs = ValidateCoordinatesOptionsSchema.parse(args);
      const validation = validateCoordinateSystemDeclarations(typedArgs.declarations);
      const result = ValidateCoordinatesResultSchema.parse({
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      });
      return jsonResult(result);
    },
  },
  {
    name: "profile_qc",
    title: "Profile Dataset QC",
    description:
      "Compute a deterministic quality-control profile from validated epigenomic features and an experimental design.",
    inputSchema: ProfileQcOptionsSchema,
    outputSchema: ProfileQcResultSchema,
    handler: async (args) => {
      const typedArgs = ProfileQcOptionsSchema.parse(args);
      const designParse = ExperimentalDesignSchema.safeParse(typedArgs.design);
      if (!designParse.success) {
        return errorResult(
          `Invalid experimental design: ${zodIssues(designParse.error).join("; ")}`,
        );
      }
      const result = profileQc(
        typedArgs.datasetId,
        typedArgs.features,
        designParse.data,
      );
      return jsonResult(ProfileQcResultSchema.parse(result));
    },
  },
  {
    name: "profile_missingness",
    title: "Profile Dataset Missingness",
    description:
      "Measure missingness by feature, sample, and dose group using a versioned threshold policy.",
    inputSchema: ProfileMissingnessOptionsSchema,
    outputSchema: MissingnessProfileSchema,
    handler: async (args) => {
      const typedArgs = ProfileMissingnessOptionsSchema.parse(args);
      const designParse = ExperimentalDesignSchema.safeParse(typedArgs.design);
      if (!designParse.success) {
        return errorResult(
          `Invalid experimental design: ${zodIssues(designParse.error).join("; ")}`,
        );
      }
      const result = profileMissingness(
        typedArgs.datasetId,
        typedArgs.features,
        designParse.data,
        typedArgs.policy,
      );
      return jsonResult(result);
    },
  },
  {
    name: "ingest_cell_composition",
    title: "Ingest Cell-Composition Evidence",
    description:
      "Validate per-sample cell-composition evidence and detect dose-group shifts when a design is supplied.",
    inputSchema: IngestCellCompositionOptionsSchema,
    outputSchema: CellCompositionProfileSchema,
    handler: async (args) => {
      const typedArgs = IngestCellCompositionOptionsSchema.parse(args);
      const design = typedArgs.design
        ? ExperimentalDesignSchema.parse(typedArgs.design)
        : undefined;
      const result = ingestCellComposition(
        typedArgs.datasetId,
        typedArgs.samples,
        design,
        typedArgs.options,
      );
      return jsonResult(CellCompositionProfileSchema.parse(result));
    },
  },
  {
    name: "ingest_cytotoxicity",
    title: "Ingest Cytotoxicity Evidence",
    description:
      "Validate cytotoxicity or companion-assay context and assess dose and timepoint alignment.",
    inputSchema: IngestCytotoxicityOptionsSchema,
    outputSchema: CytotoxicityProfileSchema,
    handler: async (args) => {
      const typedArgs = IngestCytotoxicityOptionsSchema.parse(args);
      const design = typedArgs.design
        ? ExperimentalDesignSchema.parse(typedArgs.design)
        : undefined;
      const result = ingestCytotoxicity(
        typedArgs.datasetId,
        typedArgs.entries,
        design,
        typedArgs.options,
      );
      return jsonResult(CytotoxicityProfileSchema.parse(result));
    },
  },
  {
    name: "summarize_by_group",
    title: "Summarize Features by Dose Group",
    description:
      "Aggregate validated feature responses by experimental dose group while preserving the response-packet contract.",
    inputSchema: SummarizeByGroupOptionsSchema,
    outputSchema: SummarizeByGroupResultSchema,
    handler: async (args, context) => {
      const config = context?.config ?? ConfigSchema.parse({});
      const typedArgs = SummarizeByGroupOptionsSchema.parse(args);
      const packet = resolvePacketInput(
        typedArgs.packet,
        typedArgs.packetPath,
        config,
      );
      if (!packet.ok) {
        return errorResult(packet.error);
      }
      const packetParse = EpigenomicsFeatureResponsePacketSchema.safeParse(packet.value);
      if (!packetParse.success) {
        return errorResult(
          `Invalid response packet: ${zodIssues(packetParse.error).join("; ")}`,
        );
      }
      const result = summarizeByGroup(packetParse.data, {
        includeSampleRefs: typedArgs.includeSampleRefs,
      });
      return jsonResult(
        SummarizeByGroupResultSchema.parse({
          packet: result.packet,
          featureCount: result.featureCount,
          groupCount: result.groupCount,
          totalSummaries: result.totalSummaries,
        }),
      );
    },
  },
  {
    name: "read_table",
    title: "Read Delimited Table",
    description:
      "Read a bounded page of a CSV or TSV file under an allowed root with deterministic encoding, delimiter, and checksum reporting.",
    inputSchema: ReadTableMcpOptionsSchema,
    outputSchema: ReadTableResultSchema,
    handler: async (args, context) => {
      const config = context?.config ?? ConfigSchema.parse({});
      const typedArgs = ReadTableMcpOptionsSchema.parse(args);
      const access = resolveMcpReadableFile(typedArgs.filePath, config);
      if (!access.ok) {
        return jsonResult(ReadTableResultSchema.parse(readTableFailureResult(access.error)));
      }
      const result = readTableFile(
        access.path,
        effectiveReadOptions(typedArgs.options, config),
      );
      return jsonResult(ReadTableResultSchema.parse(result));
    },
  },
  {
    name: "read_design",
    title: "Read Experimental Design Table",
    description:
      "Read a delimited design table under an allowed root and convert it to the ExperimentalDesign contract.",
    inputSchema: ReadDesignOptionsSchema,
    outputSchema: ReadDesignResultSchema,
    handler: async (args, context) => {
      const config = context?.config ?? ConfigSchema.parse({});
      const typedArgs = ReadDesignOptionsSchema.parse(args);
      const access = resolveMcpReadableFile(typedArgs.filePath, config);
      if (!access.ok) {
        return jsonResult(ReadDesignResultSchema.parse({
          success: false,
          errors: [access.error],
          warnings: [],
        }));
      }
      const result = readDesignTable(
        access.path,
        {
          ...typedArgs.options,
          readTableOptions: {
            ...(typedArgs.options.readTableOptions ?? {}),
            ...effectiveReadOptions(undefined, config),
          },
        } as Parameters<typeof readDesignTable>[1],
      );
      return jsonResult(ReadDesignResultSchema.parse(result));
    },
  },
  {
    name: "generate_qc_report",
    title: "Generate QC Report",
    description:
      "Generate a regulator-readable JSON QC report from a validated profile and qualification warnings.",
    inputSchema: GenerateQcReportOptionsSchema,
    outputSchema: GenerateQcReportResultSchema,
    handler: async (args) => {
      const typedArgs = GenerateQcReportOptionsSchema.parse(args);
      const profileParse = QcProfileSchema.safeParse(typedArgs.profile);
      if (!profileParse.success) {
        return errorResult(
          `Invalid QC profile: ${zodIssues(profileParse.error).join("; ")}`,
        );
      }
      const warnings = (typedArgs.warnings ?? []).map((w) =>
        QualificationWarningSchema.parse(w),
      );
      const result = generateQcReport(
        typedArgs.datasetId,
        profileParse.data,
        warnings,
      );
      return jsonResult(
        GenerateQcReportResultSchema.parse({
          reportId: result.reportId,
          datasetId: result.datasetId,
          generatedAt: result.generatedAt,
          profile: result.profile,
          warnings: result.warnings,
          conclusion: result.conclusion,
        }),
      );
    },
  },
  {
    name: "convert_coordinates",
    title: "Convert Genomic Coordinates",
    description:
      "Normalize declared genomic coordinates to the internal 0-based half-open convention while retaining conversion provenance.",
    inputSchema: ConvertCoordinatesOptionsSchema,
    outputSchema: ConvertCoordinatesResultSchema,
    handler: async (args) => {
      const typedArgs = ConvertCoordinatesOptionsSchema.parse(args);
      const batchResult = normalizeCoordinateRecords(typedArgs.records);
      const result = ConvertCoordinatesResultSchema.parse({
        overallSuccess: batchResult.overallSuccess,
        results: batchResult.results,
        convertedCount: batchResult.convertedCount,
        failedCount: batchResult.failedCount,
      });
      return jsonResult(result);
    },
  },
];

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

/**
 * Register all core tools on an McpServer instance.
 */
export function registerTools(
  server: McpServer,
  config: Config = ConfigSchema.parse({}),
): void {
  for (const tool of TOOL_DEFINITIONS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations ?? READ_ONLY_ANNOTATIONS,
      },
      async (args) => {
        try {
          return await tool.handler(args as Record<string, unknown>, { config });
        } catch (err) {
          if (err instanceof z.ZodError) {
            return errorResult(`Invalid tool arguments or result: ${zodIssues(err).join("; ")}`);
          }
          const message = err instanceof Error ? err.message : String(err);
          return errorResult(`Unexpected tool failure: ${message}`);
        }
      },
    );
  }
}

/**
 * Retrieve a list of all registered tool names.
 */
export function getRegisteredToolNames(): string[] {
  return TOOL_DEFINITIONS.map((t) => t.name);
}
