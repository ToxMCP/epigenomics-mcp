import { z } from "zod";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { VERSION } from "./version.js";
import { ConfigSchema, type Config } from "./config.js";
import { validateDesign } from "../validators/design.js";
import { qualifyFeatures } from "../qualification/engine.js";
import { buildHandoffPacket } from "../handoff/builder.js";
import { validateCoordinateSystemDeclarations } from "../validators/coordinate_validator.js";
import { profileQc } from "../qc/profiler.js";
import {
  profileMissingness,
  MissingnessPolicySchema,
} from "../qc/missingness.js";
import {
  ingestCellComposition,
  CellCompositionProfileSchema,
} from "../qc/cell_composition.js";
import {
  ingestCytotoxicity,
  CytotoxicityProfileSchema,
} from "../qc/cytotoxicity.js";


import { summarizeByGroup } from "../summarization/group_summary.js";
import { readTableFile, ReadTableResultSchema } from "../ingestion/csv_reader.js";
import { readDesignTable, ReadDesignResultSchema } from "../ingestion/design_reader.js";
import { ingestFeatureTable } from "../ingestion/feature_table.js";
import { generateQcReport } from "../reports/qc_report.js";
import { EpigenomicsFeatureResponsePacketSchema } from "../contracts/packets.js";
import { ExperimentalDesignSchema } from "../contracts/design.js";
import { QcProfileSchema } from "../contracts/qc.js";
import { QualificationWarningSchema } from "../contracts/qualification.js";
import { DatasetProvenanceSchema } from "../contracts/provenance.js";
import {
  BatchCoordinateConversionResultSchema,
} from "../contracts/coordinate_conversion.js";
import {
  normalizeCoordinateRecords,
} from "../coordinate_mapping/normalise.js";

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

export const HealthResultSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  timestamp: z.string().datetime(),
});

export const IngestDatasetOptionsSchema = z.object({
  datasetId: z.string().min(1),
  modality: z.string().min(1),
  featuresPath: z.string().min(1),
  designPath: z.string().min(1),
  provenancePath: z.string().min(1),
});

export const IngestDatasetResultSchema = z.object({
  datasetId: z.string(),
  ingested: z.boolean(),
  featureCount: z.number().int(),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export const ValidateDesignOptionsSchema = z.object({
  design: z.record(z.string(), z.unknown()),
});

export const ValidateDesignResultSchema = z.object({
  valid: z.boolean(),
  schemaValid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const QualifyFeaturesOptionsSchema = z.object({
  packet: z.record(z.string(), z.unknown()),
});

export const QualifyFeaturesResultSchema = z.record(z.string(), z.unknown());

export const GenerateHandoffOptionsSchema = z.object({
  packet: z.record(z.string(), z.unknown()),
});

export const GenerateHandoffResultSchema = z.object({
  handoffId: z.string(),
  qualifiedFeatureCount: z.number().int(),
  readyForPod: z.boolean(),
});

export const ValidateCoordinatesOptionsSchema = z.object({
  declarations: z.array(z.record(z.string(), z.unknown())),
});

export const ValidateCoordinatesResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const ProfileQcOptionsSchema = z.object({
  datasetId: z.string().min(1),
  features: z.array(z.record(z.string(), z.unknown())),
  design: z.record(z.string(), z.unknown()),
});

export const ProfileQcResultSchema = z.object({
  profile: QcProfileSchema,
  pass: z.boolean(),
});

export const ProfileMissingnessOptionsSchema = z.object({
  datasetId: z.string().min(1),
  features: z.array(z.record(z.string(), z.unknown())),
  design: z.record(z.string(), z.unknown()),
  policy: MissingnessPolicySchema.optional(),
});

export const IngestCellCompositionOptionsSchema = z.object({
  datasetId: z.string().min(1),
  samples: z.array(z.record(z.string(), z.unknown())),
  design: z.record(z.string(), z.unknown()).optional(),
  options: z
    .object({
      fractionTolerance: z.number().optional(),
      shiftThreshold: z.number().optional(),
    })
    .optional(),
});

export const IngestCytotoxicityOptionsSchema = z.object({
  datasetId: z.string().min(1),
  entries: z.array(z.record(z.string(), z.unknown())),
  design: z.record(z.string(), z.unknown()).optional(),
  options: z
    .object({
      viabilityThreshold: z.number().optional(),
      requireMeasurements: z.boolean().optional(),
    })
    .optional(),
});

export const SummarizeByGroupOptionsSchema = z.object({
  packet: z.record(z.string(), z.unknown()),
  includeSampleRefs: z.boolean().optional(),
});

export const SummarizeByGroupResultSchema = z.object({
  packet: z.record(z.string(), z.unknown()),
  featureCount: z.number().int(),
  groupCount: z.number().int(),
  totalSummaries: z.number().int(),
});

export const ReadTableMcpOptionsSchema = z.object({
  filePath: z.string().min(1),
  options: z
    .object({
      delimiter: z.enum([",", "\t", ";", "|"]).optional(),
      encoding: z.enum(["utf-8", "utf-16le", "latin1", "ascii"]).optional(),
      fallbackEncodings: z.array(z.enum(["utf-8", "utf-16le", "latin1", "ascii"])).optional(),
      headerRowIndex: z.number().int().nonnegative().optional(),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().positive().optional(),
    })
    .optional(),
});

export const ReadDesignOptionsSchema = z.object({
  filePath: z.string().min(1),
  options: z.object({
    designId: z.string().min(1),
    studyId: z.string().min(1).optional(),
    species: z.string().min(1),
    columnMapping: z.record(z.string(), z.string()).optional(),
    readTableOptions: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const GenerateQcReportOptionsSchema = z.object({
  datasetId: z.string().min(1),
  profile: z.record(z.string(), z.unknown()),
  warnings: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const GenerateQcReportResultSchema = z.object({
  reportId: z.string(),
  datasetId: z.string(),
  generatedAt: z.string().datetime(),
  profile: z.record(z.string(), z.unknown()),
  warnings: z.array(z.record(z.string(), z.unknown())),
  conclusion: z.string(),
});

export const ConvertCoordinatesOptionsSchema = z.object({
  records: z.array(z.record(z.string(), z.unknown())),
});

export const ConvertCoordinatesResultSchema = BatchCoordinateConversionResultSchema;

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
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
    description: "Return server health status",
    inputSchema: z.object({}),
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
    description: "Ingest a processed epigenomic feature table with design and provenance",
    inputSchema: IngestDatasetOptionsSchema,
    outputSchema: IngestDatasetResultSchema,
    handler: async (args, context) => {
      const config = context?.config ?? ConfigSchema.parse({});
      const typedArgs = IngestDatasetOptionsSchema.parse(args);
      const errors: string[] = [];
      const warnings: string[] = [];

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
        }
      }

      if (!featuresAccess.ok) {
        const result = IngestDatasetResultSchema.parse({
          datasetId: typedArgs.datasetId,
          ingested: false,
          featureCount: 0,
          errors,
          warnings,
        });
        return jsonResult(result);
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
        });
        return jsonResult(result);
      }
      if (tableResult.hasMore) {
        errors.push(
          `features: table exceeds maximum row limit of ${config.fileAccess.maxRowLimit}`,
        );
      }
      const ingestResult = ingestFeatureTable(tableResult.rows);
      errors.push(...ingestResult.parseErrors.map((e) => `features: ${e}`));
      const result = IngestDatasetResultSchema.parse({
        datasetId: typedArgs.datasetId,
        ingested: errors.length === 0 && design !== undefined,
        featureCount: ingestResult.features.length,
        errors,
        warnings,
      });
      return jsonResult(result);
    },
  },
  {
    name: "validate_design",
    description: "Validate experimental design for dose-response readiness",
    inputSchema: ValidateDesignOptionsSchema,
    outputSchema: ValidateDesignResultSchema,
    handler: async (args) => {
      const typedArgs = ValidateDesignOptionsSchema.parse(args);
      const validation = validateDesign(typedArgs.design);
      const result = ValidateDesignResultSchema.parse({
        valid: validation.valid,
        schemaValid: validation.schemaValid,
        errors: validation.errors,
        warnings: validation.warnings,
      });
      return jsonResult(result);
    },
  },
  {
    name: "qualify_features",
    description: "Qualify epigenomic features for downstream Bioactivity-PoD use",
    inputSchema: QualifyFeaturesOptionsSchema,
    outputSchema: QualifyFeaturesResultSchema,
    handler: async (args) => {
      const typedArgs = QualifyFeaturesOptionsSchema.parse(args);
      const result = qualifyFeatures(typedArgs.packet);
      return jsonResult(QualifyFeaturesResultSchema.parse(result));
    },
  },
  {
    name: "generate_handoff",
    description: "Generate a Bioactivity-PoD handoff packet from a qualified response packet",
    inputSchema: GenerateHandoffOptionsSchema,
    outputSchema: GenerateHandoffResultSchema,
    handler: async (args) => {
      const typedArgs = GenerateHandoffOptionsSchema.parse(args);
      const handoff = buildHandoffPacket(typedArgs.packet);
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
    description: "Validate coordinate system declarations for region-bearing features",
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
    description: "Compute deterministic QC profile for an epigenomics dataset",
    inputSchema: ProfileQcOptionsSchema,
    outputSchema: ProfileQcResultSchema,
    handler: async (args) => {
      const typedArgs = ProfileQcOptionsSchema.parse(args);
      const designParse = ExperimentalDesignSchema.safeParse(typedArgs.design);
      if (!designParse.success) {
        return jsonResult({
          profile: null,
          pass: false,
          errors: designParse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }
      // Features are passed as raw objects; profileQc expects typed EpigenomicFeature[]
      // We rely on the contract being satisfied by the caller for v0.1
      const result = profileQc(
        typedArgs.datasetId,
        typedArgs.features as Parameters<typeof profileQc>[1],
        designParse.data,
      );
      return jsonResult(ProfileQcResultSchema.parse(result));
    },
  },
  {
    name: "profile_missingness",
    description: "Compute deterministic missingness profile for an epigenomics dataset",
    inputSchema: ProfileMissingnessOptionsSchema,
    outputSchema: z.record(z.string(), z.unknown()),
    handler: async (args) => {
      const typedArgs = ProfileMissingnessOptionsSchema.parse(args);
      const designParse = ExperimentalDesignSchema.safeParse(typedArgs.design);
      if (!designParse.success) {
        return jsonResult({
          errors: designParse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }
      const result = profileMissingness(
        typedArgs.datasetId,
        typedArgs.features as Parameters<typeof profileMissingness>[1],
        designParse.data,
        typedArgs.policy,
      );
      return jsonResult(result);
    },
  },
  {
    name: "ingest_cell_composition",
    description: "Ingest and validate cell-composition evidence for a dataset",
    inputSchema: IngestCellCompositionOptionsSchema,
    outputSchema: CellCompositionProfileSchema,
    handler: async (args) => {
      const typedArgs = IngestCellCompositionOptionsSchema.parse(args);
      const design = typedArgs.design
        ? ExperimentalDesignSchema.parse(typedArgs.design)
        : undefined;
      const result = ingestCellComposition(
        typedArgs.datasetId,
        typedArgs.samples as Parameters<typeof ingestCellComposition>[1],
        design,
        typedArgs.options,
      );
      return jsonResult(CellCompositionProfileSchema.parse(result));
    },
  },
  {
    name: "ingest_cytotoxicity",
    description: "Ingest and validate cytotoxicity context for a dataset",
    inputSchema: IngestCytotoxicityOptionsSchema,
    outputSchema: CytotoxicityProfileSchema,
    handler: async (args) => {
      const typedArgs = IngestCytotoxicityOptionsSchema.parse(args);
      const design = typedArgs.design
        ? ExperimentalDesignSchema.parse(typedArgs.design)
        : undefined;
      const result = ingestCytotoxicity(
        typedArgs.datasetId,
        typedArgs.entries as Parameters<typeof ingestCytotoxicity>[1],
        design,
        typedArgs.options,
      );
      return jsonResult(CytotoxicityProfileSchema.parse(result));
    },
  },
  {
    name: "summarize_by_group",
    description: "Summarize epigenomic feature responses by dose group",
    inputSchema: SummarizeByGroupOptionsSchema,
    outputSchema: SummarizeByGroupResultSchema,
    handler: async (args) => {
      const typedArgs = SummarizeByGroupOptionsSchema.parse(args);
      const packetParse = EpigenomicsFeatureResponsePacketSchema.safeParse(typedArgs.packet);
      if (!packetParse.success) {
        return jsonResult({
          errors: packetParse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
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
    description: "Read a delimited table file with deterministic parsing",
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
    description: "Read a design table and convert it to an ExperimentalDesign contract",
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
    description: "Generate a regulator-readable QC report",
    inputSchema: GenerateQcReportOptionsSchema,
    outputSchema: GenerateQcReportResultSchema,
    handler: async (args) => {
      const typedArgs = GenerateQcReportOptionsSchema.parse(args);
      const profileParse = QcProfileSchema.safeParse(typedArgs.profile);
      if (!profileParse.success) {
        return jsonResult({
          errors: profileParse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
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
    description: "Normalize coordinate-bearing records to internal 0-based half-open intervals",
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
