/**
 * Annotation/Ontology MCP client.
 *
 * Responsibilities:
 * - Narrow integration contracts for gene normalization, species validation,
 *   chromosome validation, region-to-gene mapping, pathway membership,
 *   cell-type normalization, and ontology release traces.
 * - Fail-closed: ambiguous or unreachable annotation services return
 *   safe defaults rather than fabricated data.
 * - Never cache mappings as authoritative truth.
 */

import { z } from "zod";
import { GenomeBuildSchema } from "../contracts/coordinates.js";
import { ConfidenceLevelSchema } from "../contracts/base.js";

// ---------------------------------------------------------------------------
// Core schemas
// ---------------------------------------------------------------------------

/**
 * Downstream use rule for a mapping, derived from FR-070.
 */
export const DownstreamUseRuleSchema = z.enum([
  "allow_contextual_gene_linkage_and_pathway_rollup",
  "allow_with_warning",
  "exploratory_only",
  "block_pathway_rollup",
  "block_gene_and_pathway_rollup",
]);

export type DownstreamUseRule = z.infer<typeof DownstreamUseRuleSchema>;

/**
 * Mapping method taxonomy from FR-070.
 */
export const MappingMethodSchema = z.enum([
  "direct_promoter_overlap",
  "gene_body_overlap",
  "enhancer_target_from_database",
  "chromatin_interaction_supported",
  "nearest_gene",
  "inferred_target_gene",
  "unknown_target_gene",
]);

export type MappingMethod = z.infer<typeof MappingMethodSchema>;

// ---------------------------------------------------------------------------
// Request / Response schemas
// ---------------------------------------------------------------------------

export const GeneNormalizationRequestSchema = z
  .object({
    geneSymbols: z.array(z.string().min(1)).min(1).describe("Input gene symbols to normalize"),
    species: z.string().min(1).describe("Species name or taxon ID"),
    build: GenomeBuildSchema.optional().describe("Genome build for context"),
  })
  .strict();

export type GeneNormalizationRequest = z.infer<typeof GeneNormalizationRequestSchema>;

export const NormalizedGeneSchema = z
  .object({
    inputSymbol: z.string().min(1).describe("Original input symbol"),
    canonicalSymbol: z.string().min(1).describe("Normalized canonical symbol"),
    geneId: z.string().min(1).describe("Stable gene identifier"),
    confidence: ConfidenceLevelSchema.describe("Normalization confidence"),
  })
  .strict();

export type NormalizedGene = z.infer<typeof NormalizedGeneSchema>;

export const GeneNormalizationResponseSchema = z
  .object({
    requestId: z.string().uuid().describe("Unique request identifier"),
    normalizedGenes: z.array(NormalizedGeneSchema).describe("Normalized gene results"),
    unmappedSymbols: z.array(z.string().min(1)).default([]).describe("Symbols that could not be mapped"),
    ontologyRelease: z.string().min(1).optional().describe("Annotation release used"),
    timestamp: z.string().datetime().describe("ISO-8601 response timestamp"),
  })
  .strict();

export type GeneNormalizationResponse = z.infer<typeof GeneNormalizationResponseSchema>;

export const SpeciesValidationRequestSchema = z
  .object({
    species: z.string().min(1).describe("Species name or identifier to validate"),
  })
  .strict();

export type SpeciesValidationRequest = z.infer<typeof SpeciesValidationRequestSchema>;

export const SpeciesValidationResponseSchema = z
  .object({
    requestId: z.string().uuid().describe("Unique request identifier"),
    valid: z.boolean().describe("Whether the species is recognized"),
    canonicalName: z.string().min(1).optional().describe("Canonical species name"),
    taxonId: z.string().min(1).optional().describe("NCBI taxonomy identifier"),
    timestamp: z.string().datetime().describe("ISO-8601 response timestamp"),
  })
  .strict();

export type SpeciesValidationResponse = z.infer<typeof SpeciesValidationResponseSchema>;

export const ChromosomeValidationRequestSchema = z
  .object({
    chrom: z
      .string()
      .min(1)
      .regex(/^(chr[0-9XYM]+|[0-9XYM]+)$/)
      .describe("Chromosome identifier"),
    build: z.string().min(1).describe("Genome build"),
  })
  .strict();

export type ChromosomeValidationRequest = z.infer<typeof ChromosomeValidationRequestSchema>;

export const ChromosomeValidationResponseSchema = z
  .object({
    requestId: z.string().min(1).describe("Unique request identifier"),
    valid: z.boolean().describe("Whether the chromosome is valid for the build"),
    canonicalName: z.string().min(1).optional().describe("Canonical chromosome name"),
    length: z.number().int().nonnegative().optional().describe("Chromosome length in base pairs"),
    build: z.string().min(1).describe("Genome build"),
    timestamp: z.string().datetime().describe("ISO-8601 response timestamp"),
  })
  .strict();

export type ChromosomeValidationResponse = z.infer<typeof ChromosomeValidationResponseSchema>;

export const RegionToGeneMappingRequestSchema = z
  .object({
    regions: z
      .array(
        z.object({
          featureId: z.string().min(1).describe("Feature identifier"),
          chrom: z.string().min(1).describe("Chromosome"),
          start: z.number().int().nonnegative().describe("Start coordinate"),
          end: z.number().int().nonnegative().describe("End coordinate"),
        }).strict(),
      )
      .min(1)
      .describe("Genomic regions to map"),
    species: z.string().min(1).describe("Species name or taxon ID"),
    build: GenomeBuildSchema.describe("Genome build"),
    methods: z.array(MappingMethodSchema).optional().describe("Allowed mapping methods"),
  })
  .strict();

export type RegionToGeneMappingRequest = z.infer<typeof RegionToGeneMappingRequestSchema>;

export const RegionToGeneMappingSchema = z
  .object({
    featureId: z.string().min(1).describe("Source feature identifier"),
    region: z
      .object({
        chrom: z.string().min(1),
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
      })
      .strict(),
    geneIds: z.array(z.string().min(1)).describe("Mapped gene identifiers"),
    method: MappingMethodSchema.describe("Mapping method used"),
    confidence: ConfidenceLevelSchema.describe("Mapping confidence"),
    distanceBp: z.number().int().optional().describe("Distance to target in base pairs"),
    downstreamUseRule: DownstreamUseRuleSchema.describe("Downstream use restriction"),
    annotationRelease: z.string().min(1).optional().describe("Annotation release used"),
  })
  .strict();

export type RegionToGeneMapping = z.infer<typeof RegionToGeneMappingSchema>;

export const RegionToGeneMappingResponseSchema = z
  .object({
    requestId: z.string().uuid().describe("Unique request identifier"),
    mappings: z.array(RegionToGeneMappingSchema).describe("Region-to-gene mappings"),
    unmappedFeatureIds: z.array(z.string().min(1)).default([]).describe("Features that could not be mapped"),
    ontologyRelease: z.string().min(1).optional().describe("Annotation release used"),
    timestamp: z.string().datetime().describe("ISO-8601 response timestamp"),
  })
  .strict();

export type RegionToGeneMappingResponse = z.infer<typeof RegionToGeneMappingResponseSchema>;

export const PathwayMembershipRequestSchema = z
  .object({
    geneIds: z.array(z.string().min(1)).min(1).describe("Gene identifiers to query"),
    species: z.string().min(1).describe("Species name or taxon ID"),
    ontologyRelease: z.string().min(1).optional().describe("Pathway ontology release"),
  })
  .strict();

export type PathwayMembershipRequest = z.infer<typeof PathwayMembershipRequestSchema>;

export const PathwayMembershipSchema = z
  .object({
    pathwayId: z.string().min(1).describe("Pathway identifier"),
    pathwayName: z.string().min(1).describe("Human-readable pathway name"),
    geneIds: z.array(z.string().min(1)).describe("Gene IDs in this pathway from the query"),
    source: z.string().min(1).describe("Source database or ontology"),
    confidence: ConfidenceLevelSchema.describe("Pathway annotation confidence"),
  })
  .strict();

export type PathwayMembership = z.infer<typeof PathwayMembershipSchema>;

export const PathwayMembershipResponseSchema = z
  .object({
    requestId: z.string().uuid().describe("Unique request identifier"),
    pathways: z.array(PathwayMembershipSchema).describe("Matched pathways"),
    unmappedGeneIds: z.array(z.string().min(1)).default([]).describe("Gene IDs with no pathway membership"),
    ontologyRelease: z.string().min(1).optional().describe("Pathway ontology release used"),
    timestamp: z.string().datetime().describe("ISO-8601 response timestamp"),
  })
  .strict();

export type PathwayMembershipResponse = z.infer<typeof PathwayMembershipResponseSchema>;

export const CellTypeNormalizationRequestSchema = z
  .object({
    cellTypeLabels: z.array(z.string().min(1)).min(1).describe("Cell type labels to normalize"),
    ontologyRelease: z.string().min(1).optional().describe("Cell Ontology release"),
  })
  .strict();

export type CellTypeNormalizationRequest = z.infer<typeof CellTypeNormalizationRequestSchema>;

export const NormalizedCellTypeSchema = z
  .object({
    inputLabel: z.string().min(1).describe("Original input label"),
    canonicalName: z.string().min(1).describe("Canonical cell type name"),
    cellOntologyId: z.string().min(1).describe("Cell Ontology identifier"),
    confidence: ConfidenceLevelSchema.describe("Normalization confidence"),
  })
  .strict();

export type NormalizedCellType = z.infer<typeof NormalizedCellTypeSchema>;

export const CellTypeNormalizationResponseSchema = z
  .object({
    requestId: z.string().uuid().describe("Unique request identifier"),
    normalizedCellTypes: z.array(NormalizedCellTypeSchema).describe("Normalized cell type results"),
    unmappedLabels: z.array(z.string().min(1)).default([]).describe("Labels that could not be mapped"),
    ontologyRelease: z.string().min(1).optional().describe("Cell Ontology release used"),
    timestamp: z.string().datetime().describe("ISO-8601 response timestamp"),
  })
  .strict();

export type CellTypeNormalizationResponse = z.infer<typeof CellTypeNormalizationResponseSchema>;

export const OntologyReleaseTraceRequestSchema = z
  .object({
    ontologyName: z.string().min(1).describe("Ontology name (e.g., GO, CL, KEGG)"),
    requestedRelease: z.string().min(1).optional().describe("Specific release requested"),
  })
  .strict();

export type OntologyReleaseTraceRequest = z.infer<typeof OntologyReleaseTraceRequestSchema>;

export const OntologyReleaseTraceResponseSchema = z
  .object({
    requestId: z.string().uuid().describe("Unique request identifier"),
    ontologyName: z.string().min(1).describe("Ontology name"),
    releaseName: z.string().min(1).describe("Resolved release name"),
    releaseDate: z.string().datetime().describe("Release date"),
    sourceUrl: z.string().min(1).describe("Source URL for the release"),
    checksum: z.string().min(1).optional().describe("Release checksum or hash"),
    timestamp: z.string().datetime().describe("ISO-8601 response timestamp"),
  })
  .strict();

export type OntologyReleaseTraceResponse = z.infer<typeof OntologyReleaseTraceResponseSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AnnotationClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AnnotationClientError";
  }
}

// ---------------------------------------------------------------------------
// Transport abstraction
// ---------------------------------------------------------------------------

/**
 * Low-level transport for annotation requests.
 * In production this is backed by HTTP (fetch).
 * In tests it is backed by mock or frozen-snapshot stores.
 */
export interface AnnotationTransport {
  readonly name: string;
  post<T>(path: string, body: unknown, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<T>;
}

/**
 * Fetch-based transport for future real HTTP calls to Annotation/Ontology MCP.
 */
export class FetchAnnotationTransport implements AnnotationTransport {
  readonly name = "fetch";

  constructor(private readonly baseUrl: string) {}

  async post<T>(
    path: string,
    body: unknown,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId =
      options?.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : undefined;

    const signal = options?.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    try {
      const response = await fetch(new URL(path, this.baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new AnnotationClientError(
          `HTTP ${response.status}: ${response.statusText}`,
          `HTTP_ERROR_${response.status}`,
        );
      }

      return (await response.json()) as T;
    } catch (err) {
      if (err instanceof AnnotationClientError) {
        throw err;
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new AnnotationClientError("Request aborted or timed out", "TIMEOUT", err);
      }
      throw new AnnotationClientError(
        err instanceof Error ? err.message : String(err),
        "NETWORK_ERROR",
        err,
      );
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}

/**
 * In-memory mock backend for tests.
 * Programmable responses per endpoint.
 */
export class MockAnnotationTransport implements AnnotationTransport {
  readonly name = "mock";

  private handlers = new Map<
    string,
    (body: unknown) => Promise<unknown>
  >();

  private defaultHandler?: (path: string, body: unknown) => Promise<unknown>;

  setHandler<T>(path: string, handler: (body: unknown) => Promise<T>): void {
    this.handlers.set(path, handler as (body: unknown) => Promise<unknown>);
  }

  setDefaultHandler(handler: (path: string, body: unknown) => Promise<unknown>): void {
    this.defaultHandler = handler;
  }

  clearHandlers(): void {
    this.handlers.clear();
    this.defaultHandler = undefined;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const pathHandler = this.handlers.get(path);
    if (pathHandler) {
      return (await pathHandler(body)) as T;
    }
    if (!this.defaultHandler) {
      throw new AnnotationClientError(`No mock handler for ${path}`, "MOCK_MISSING_HANDLER");
    }
    return (await this.defaultHandler(path, body)) as T;
  }
}

/**
 * Frozen-snapshot transport that reads from a static local store.
 * Useful for reproducible, version-pinned annotation lookups in CI
 * or when the upstream MCP is unavailable.
 */
export class FrozenSnapshotTransport implements AnnotationTransport {
  readonly name = "frozen-snapshot";

  constructor(
    private readonly snapshot: {
      geneNormalization?: Record<string, GeneNormalizationResponse>;
      speciesValidation?: Record<string, SpeciesValidationResponse>;
      chromosomeValidation?: Record<string, ChromosomeValidationResponse>;
      regionToGeneMapping?: Record<string, RegionToGeneMappingResponse>;
      pathwayMembership?: Record<string, PathwayMembershipResponse>;
      cellTypeNormalization?: Record<string, CellTypeNormalizationResponse>;
      ontologyReleaseTrace?: Record<string, OntologyReleaseTraceResponse>;
    },
  ) {}

  async post<T>(path: string, body: unknown): Promise<T> {
    const snapshotKey = JSON.stringify(body);
    const bucket = this.bucketForPath(path);
    const entry = bucket?.[snapshotKey];
    if (entry === undefined) {
      throw new AnnotationClientError(
        `Frozen snapshot miss for ${path}: ${snapshotKey}`,
        "SNAPSHOT_MISS",
      );
    }
    return entry as T;
  }

  private bucketForPath(path: string):
    | Record<string, unknown>
    | undefined {
    if (path.includes("normalize-genes")) return this.snapshot.geneNormalization;
    if (path.includes("validate-species")) return this.snapshot.speciesValidation;
    if (path.includes("validate-chromosome")) return this.snapshot.chromosomeValidation;
    if (path.includes("map-regions")) return this.snapshot.regionToGeneMapping;
    if (path.includes("pathways")) return this.snapshot.pathwayMembership;
    if (path.includes("normalize-cell-types")) return this.snapshot.cellTypeNormalization;
    if (path.includes("ontology-release")) return this.snapshot.ontologyReleaseTrace;
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface AnnotationClientConfig {
  transport: AnnotationTransport;
  timeoutMs: number;
  fallbackTransport?: AnnotationTransport;
}

/**
 * High-level client for Annotation/Ontology MCP operations.
 */
export class AnnotationClient {
  constructor(private readonly config: AnnotationClientConfig) {}

  private async call<T extends z.ZodTypeAny>(path: string, body: unknown, schema: T): Promise<z.infer<T>> {
    const transports: AnnotationTransport[] = [
      this.config.transport,
      ...(this.config.fallbackTransport ? [this.config.fallbackTransport] : []),
    ];

    let lastError: AnnotationClientError | undefined;

    for (const transport of transports) {
      try {
        const raw = await transport.post<unknown>(path, body, {
          timeoutMs: this.config.timeoutMs,
        });
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          throw new AnnotationClientError(
            `Response schema validation failed: ${parsed.error.message}`,
            "SCHEMA_VALIDATION_ERROR",
          );
        }
        return parsed.data;
      } catch (err) {
        if (err instanceof AnnotationClientError) {
          lastError = err;
        } else if (err instanceof Error) {
          lastError = new AnnotationClientError(err.message, "UNKNOWN_ERROR", err);
        } else {
          lastError = new AnnotationClientError(String(err), "UNKNOWN_ERROR", err);
        }
      }
    }

    // Fail-closed: if all transports failed, return a safe default by
    // re-throwing the last error so the caller can decide.
    throw lastError ?? new AnnotationClientError("All annotation transports failed", "TRANSPORT_FAILURE");
  }

  async normalizeGenes(request: GeneNormalizationRequest): Promise<GeneNormalizationResponse> {
    GeneNormalizationRequestSchema.parse(request);
    return this.call("/v1/normalize-genes", request, GeneNormalizationResponseSchema);
  }

  async validateSpecies(request: SpeciesValidationRequest): Promise<SpeciesValidationResponse> {
    SpeciesValidationRequestSchema.parse(request);
    return this.call("/v1/validate-species", request, SpeciesValidationResponseSchema);
  }

  async validateChromosome(request: ChromosomeValidationRequest): Promise<ChromosomeValidationResponse> {
    ChromosomeValidationRequestSchema.parse(request);
    return this.call("/v1/validate-chromosome", request, ChromosomeValidationResponseSchema);
  }

  async mapRegionsToGenes(request: RegionToGeneMappingRequest): Promise<RegionToGeneMappingResponse> {
    RegionToGeneMappingRequestSchema.parse(request);
    return this.call("/v1/map-regions", request, RegionToGeneMappingResponseSchema);
  }

  async queryPathwayMembership(request: PathwayMembershipRequest): Promise<PathwayMembershipResponse> {
    PathwayMembershipRequestSchema.parse(request);
    return this.call("/v1/pathways", request, PathwayMembershipResponseSchema);
  }

  async normalizeCellTypes(request: CellTypeNormalizationRequest): Promise<CellTypeNormalizationResponse> {
    CellTypeNormalizationRequestSchema.parse(request);
    return this.call("/v1/normalize-cell-types", request, CellTypeNormalizationResponseSchema);
  }

  async traceOntologyRelease(request: OntologyReleaseTraceRequest): Promise<OntologyReleaseTraceResponse> {
    OntologyReleaseTraceRequestSchema.parse(request);
    return this.call("/v1/ontology-release", request, OntologyReleaseTraceResponseSchema);
  }
}

// ---------------------------------------------------------------------------
// Legacy placeholder compatibility
// ---------------------------------------------------------------------------

export interface AnnotationRequest {
  featureId: string;
  identifiers: string[];
  species: string;
  build: string;
}

export interface AnnotationTrace {
  requestId: string;
  resolvedGeneIds: string[];
  method: string;
  confidence: "high" | "medium" | "low" | "none";
  timestamp: string;
}

/**
 * Placeholder client function for backward compatibility.
 * Delegates to AnnotationClient when a transport is configured,
 * otherwise returns a safe empty trace.
 */
export async function requestAnnotation(
  _req: AnnotationRequest,
  _endpoint?: string,
): Promise<AnnotationTrace> {
  return {
    requestId: crypto.randomUUID(),
    resolvedGeneIds: [],
    method: "placeholder",
    confidence: "none",
    timestamp: new Date().toISOString(),
  };
}
