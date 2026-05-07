import { z } from "zod";
import {
  classifyMethylationFeatureClass,
} from "./methylation_classifier.js";
import {
  classifyRegionFeatureClass,
} from "./region_feature_classifier.js";
import {
  analyzeMixedFeatures,
  MixedFeatureDetectionConfigSchema,
  type MixedFeatureAnalysisResult,
} from "./mixed_feature_handler.js";
import { AssayFamilySchema } from "../contracts/dataset.js";
import { ModalitySchema } from "../contracts/features.js";
import { MeasurementSemanticsSchema } from "../contracts/measurement_semantics.js";
import { FeatureFlagsSchema } from "../qualification/policy.js";
import { TableShapeSchema } from "./format_detection.js";

/**
 * All detectable feature classes including summary and gene-linked types.
 */
export const DetectableFeatureClassSchema = z.enum([
  "cpg_methylation",
  "dmr",
  "differential_methylated_region",
  "generic_region_feature",
  "atac_peak",
  "chip_peak_narrow",
  "chip_peak_broad",
  "histone_mark_peak",
  "chromatin_interaction",
  "ncrna_expression",
  "mirna_expression",
  "gene_linked_feature",
  "summary_only",
  "unclassified",
]);

export type DetectableFeatureClass = z.infer<typeof DetectableFeatureClassSchema>;

/**
 * Confidence levels for feature classification.
 */
export const ClassificationConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
  "override",
]);

export type ClassificationConfidence = z.infer<
  typeof ClassificationConfidenceSchema
>;

/**
 * Options for unified feature type classification.
 */
export const FeatureTypeClassificationOptionsSchema = z
  .object({
    assayFamily: AssayFamilySchema,
    modality: ModalitySchema,
    headers: z.array(z.string()),
    detectedShape: TableShapeSchema,
    featureValueSemantics: MeasurementSemanticsSchema,
    featureFlags: FeatureFlagsSchema.optional(),
    explicitFeatureClass: DetectableFeatureClassSchema.exclude([
      "unclassified",
    ]).optional(),
  })
  .strict();

export type FeatureTypeClassificationOptions = z.infer<
  typeof FeatureTypeClassificationOptionsSchema
>;

/**
 * Result of a single feature type classification.
 */
export const FeatureTypeClassificationResultSchema = z
  .object({
    featureClass: DetectableFeatureClassSchema,
    confidence: ClassificationConfidenceSchema,
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    probeIdColumn: z.string().optional(),
    regionColumns: z
      .object({
        chrom: z.string(),
        start: z.string(),
        end: z.string(),
      })
      .optional(),
    geneIdColumn: z.string().optional(),
    isSummaryOnly: z.boolean().describe("Whether the table is summary-only"),
  })
  .strict();

export type FeatureTypeClassificationResult = z.infer<
  typeof FeatureTypeClassificationResultSchema
>;

/**
 * Classification report emitted for ambiguous or mixed tables.
 */
export const FeatureClassificationReportSchema = z
  .object({
    reportId: z.string().min(1).describe("Stable report identifier"),
    tableAnalysed: z.boolean().describe("Whether a table was analysed"),
    primaryClassification: FeatureTypeClassificationResultSchema.describe(
      "Primary classification result",
    ),
    mixedFeatureAnalysis: z
      .object({
        isMixed: z.boolean(),
        isBlocked: z.boolean(),
        dominantClass: z.string().optional(),
        detectedClasses: z.array(z.string()),
        classCounts: z.record(z.string(), z.number().int().nonnegative()),
      })
      .optional()
      .describe("Summary of mixed-feature analysis if applicable"),
    advisoryNotes: z
      .array(z.string())
      .describe("Non-blocking advisory notes about the classification"),
    blockingErrors: z
      .array(z.string())
      .describe("Blocking errors that prevent downstream use"),
    reservedClassesDetected: z
      .array(z.string())
      .describe("Reserved classes detected but blocked by feature flags"),
    recommendedAction: z
      .enum([
        "proceed",
        "review_required",
        "split_table",
        "provide_explicit_class",
        "blocked",
      ])
      .describe("Recommended downstream action"),
  })
  .strict();

export type FeatureClassificationReport = z.infer<
  typeof FeatureClassificationReportSchema
>;

// ---------------------------------------------------------------------------
// Column name normalisation
// ---------------------------------------------------------------------------

function normaliseColumnName(name: string): string {
  return name.toLowerCase().replace(/[_\s-]/g, "").trim();
}

const GENE_ID_INDICATORS = new Set([
  "gene_id",
  "geneid",
  "ensembl_id",
  "ensemblid",
  "entrez_id",
  "entrezid",
  "symbol",
  "gene_symbol",
  "genesymbol",
  "hgnc_id",
  "hgncid",
  "linked_gene",
  "linkedgene",
  "target_gene",
  "targetgene",
]);

const SUMMARY_STAT_INDICATORS = new Set([
  "effect_size",
  "effectsize",
  "effect",
  "p_value",
  "pvalue",
  "pval",
  "q_value",
  "qvalue",
  "qval",
  "fdr",
  "adjusted_p",
  "adjustedp",
  "logfc",
  "log2fc",
  "fold_change",
  "foldchange",
  "fc",
]);

const CHROMOSOME_COLUMN_INDICATORS = new Set(["chr", "chrom", "chromosome"]);
const START_COLUMN_INDICATORS = new Set(["start", "chromstart"]);
const END_COLUMN_INDICATORS = new Set(["end", "chromend"]);

function hasCoordinateColumns(headers: string[]): boolean {
  const normalised = headers.map((h) => normaliseColumnName(h));
  return (
    normalised.some((h) => CHROMOSOME_COLUMN_INDICATORS.has(h)) &&
    normalised.some((h) => START_COLUMN_INDICATORS.has(h)) &&
    normalised.some((h) => END_COLUMN_INDICATORS.has(h))
  );
}

// ---------------------------------------------------------------------------
// Helper: detect gene-linked columns
// ---------------------------------------------------------------------------

function detectGeneIdColumn(headers: string[]): string | undefined {
  const normalised = headers.map((h) => normaliseColumnName(h));
  for (let i = 0; i < headers.length; i++) {
    if (GENE_ID_INDICATORS.has(normalised[i])) {
      return headers[i];
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Helper: detect summary-only tables
// ---------------------------------------------------------------------------

function isSummaryOnlyTable(
  headers: string[],
  detectedShape: z.infer<typeof TableShapeSchema>,
): boolean {
  if (hasCoordinateColumns(headers)) return false;

  const normalised = headers.map((h) => normaliseColumnName(h));
  const summaryCols = normalised.filter((h) =>
    SUMMARY_STAT_INDICATORS.has(h),
  );
  // If more than half the columns look like summary stats, treat as summary-only
  return (
    (detectedShape === "summary" && summaryCols.length > 0) ||
    (summaryCols.length > 0 && summaryCols.length >= headers.length / 2)
  );
}

// ---------------------------------------------------------------------------
// Unified classification engine
// ---------------------------------------------------------------------------

/**
 * Classify a processed feature table into a v0.1 feature class.
 *
 * Responsibilities:
 * - Detect gene-linked features via gene ID columns
 * - Detect summary-only tables
 * - Delegate to methylation classifier for DNA methylation families
 * - Delegate to region classifier for coordinate-bearing region families
 * - Apply feature flags for reserved classes (ATAC, ChIP, miRNA)
 * - Emit fail-closed unclassified for ambiguous inputs
 *
 * Rules:
 * - explicitFeatureClass overrides all heuristics
 * - gene_id / ensembl_id / symbol columns strongly indicate gene_linked_feature
 * - summary-only shape takes precedence for summary classification
 * - Methylation family tables delegate to classifyMethylationFeatureClass
 * - Region-level tables delegate to classifyRegionFeatureClass
 * - Fail-closed: ambiguous or under-specified inputs return "unclassified"
 */
export function classifyFeatureType(
  options: FeatureTypeClassificationOptions,
): FeatureTypeClassificationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const optionsResult =
    FeatureTypeClassificationOptionsSchema.safeParse(options);
  if (!optionsResult.success) {
    for (const issue of optionsResult.error.issues) {
      errors.push(`options.${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      featureClass: "unclassified",
      confidence: "low",
      warnings,
      errors,
      isSummaryOnly: false,
    };
  }

  const opts = optionsResult.data;
  const geneIdColumn = detectGeneIdColumn(opts.headers);
  const summaryOnly = isSummaryOnlyTable(opts.headers, opts.detectedShape);

  // Explicit override short-circuit
  if (opts.explicitFeatureClass !== undefined) {
    const explicitClass = opts.explicitFeatureClass;

    // Feature-flag gates for reserved classes
    const featureFlags = opts.featureFlags ?? {
      enableChromatinAccessibility: false,
      enableHistoneMark: false,
      enableMirnaExpression: false,
      enableNcrnaExpression: false,
      enableChromatinStateContext: false,
      enableBatchEffectModeling: false,
      enableCellDeconvolution: false,
    };

    if (
      explicitClass === "atac_peak" &&
      !featureFlags.enableChromatinAccessibility
    ) {
      errors.push(
        `Feature class "atac_peak" is reserved behind the enableChromatinAccessibility feature flag`,
      );
      return {
        featureClass: "unclassified",
        confidence: "low",
        warnings,
        errors,
        isSummaryOnly: summaryOnly,
      };
    }
    if (
      (explicitClass === "histone_mark_peak" ||
        explicitClass === "chip_peak_narrow" ||
        explicitClass === "chip_peak_broad") &&
      !featureFlags.enableHistoneMark
    ) {
      errors.push(
        `Feature class "${explicitClass}" is reserved behind the enableHistoneMark feature flag`,
      );
      return {
        featureClass: "unclassified",
        confidence: "low",
        warnings,
        errors,
        isSummaryOnly: summaryOnly,
      };
    }
    if (
      explicitClass === "mirna_expression" &&
      !featureFlags.enableMirnaExpression
    ) {
      errors.push(
        `Feature class "mirna_expression" is reserved behind the enableMirnaExpression feature flag`,
      );
      return {
        featureClass: "unclassified",
        confidence: "low",
        warnings,
        errors,
        isSummaryOnly: summaryOnly,
      };
    }
    if (
      explicitClass === "ncrna_expression" &&
      !featureFlags.enableNcrnaExpression
    ) {
      errors.push(
        `Feature class "ncrna_expression" is reserved behind the enableNcrnaExpression feature flag`,
      );
      return {
        featureClass: "unclassified",
        confidence: "low",
        warnings,
        errors,
        isSummaryOnly: summaryOnly,
      };
    }

    return {
      featureClass: explicitClass,
      confidence: "override",
      warnings,
      errors,
      geneIdColumn,
      isSummaryOnly: summaryOnly,
    };
  }

  if (geneIdColumn) {
    return {
      featureClass: "gene_linked_feature",
      confidence: "high",
      warnings: [
        `Gene identifier column detected ('${geneIdColumn}'); classifying as gene_linked_feature. Verify that gene links are declared upstream, not inferred.`,
      ],
      errors,
      geneIdColumn,
      isSummaryOnly: summaryOnly,
    };
  }

  if (summaryOnly) {
    return {
      featureClass: "summary_only",
      confidence: "high",
      warnings: [
        "Table detected as summary-only (effect sizes, p-values, q-values). Summary tables are not PoD-ready on their own.",
      ],
      errors,
      isSummaryOnly: true,
    };
  }

  // Delegate to family-specific classifiers first
  let familyResult: FeatureTypeClassificationResult | undefined;

  if (opts.assayFamily === "dna_methylation") {
    const methylationResult = classifyMethylationFeatureClass({
      assayFamily: opts.assayFamily,
      modality: opts.modality,
      headers: opts.headers,
      detectedShape: opts.detectedShape,
      featureValueSemantics: opts.featureValueSemantics,
      explicitFeatureClass: undefined,
    });

    const mappedClass: DetectableFeatureClass =
      methylationResult.featureClass === "unclassified"
        ? "unclassified"
        : (methylationResult.featureClass as DetectableFeatureClass);

    familyResult = {
      featureClass: mappedClass,
      confidence: methylationResult.confidence,
      warnings: [...warnings, ...methylationResult.warnings],
      errors: [...errors, ...methylationResult.errors],
      probeIdColumn: methylationResult.probeIdColumn,
      regionColumns: methylationResult.regionColumns,
      isSummaryOnly: false,
    };
  } else {
    // For all other families, delegate to region classifier
    const regionResult = classifyRegionFeatureClass({
      assayFamily: opts.assayFamily,
      modality: opts.modality,
      headers: opts.headers,
      detectedShape: opts.detectedShape,
      featureValueSemantics: opts.featureValueSemantics,
      featureFlags: opts.featureFlags,
      explicitFeatureClass: undefined,
    });

    const mappedClass: DetectableFeatureClass =
      regionResult.featureClass === "unclassified"
        ? "unclassified"
        : (regionResult.featureClass as DetectableFeatureClass);

    familyResult = {
      featureClass: mappedClass,
      confidence: regionResult.confidence,
      warnings: [...warnings, ...regionResult.warnings],
      errors: [...errors, ...regionResult.errors],
      regionColumns: regionResult.regionColumns,
      isSummaryOnly: false,
    };
  }

  // Return family-specific classification (may be unclassified)
  return familyResult;
}

// ---------------------------------------------------------------------------
// Classification report builder
// ---------------------------------------------------------------------------

/**
 * Build a classification report for a feature table.
 *
 * Emits a structured report that includes:
 * - Primary classification result
 * - Mixed-feature analysis summary if applicable
 * - Advisory notes about ambiguous or reserved classes
 * - Recommended downstream action
 */
export function buildFeatureClassificationReport(
  reportId: string,
  rows: Record<string, string>[],
  _headers: string[],
  classification: FeatureTypeClassificationResult,
  _assayFamily: string,
  _modality: string,
  mixedAnalysis?: MixedFeatureAnalysisResult,
): FeatureClassificationReport {
  const advisoryNotes: string[] = [];
  const blockingErrors: string[] = [...classification.errors];
  const reservedClassesDetected: string[] = [];

  // Build mixed-feature summary if provided
  let mixedSummary:
    | {
        isMixed: boolean;
        isBlocked: boolean;
        dominantClass?: string;
        detectedClasses: string[];
        classCounts: Record<string, number>;
      }
    | undefined;

  if (mixedAnalysis) {
    mixedSummary = {
      isMixed: mixedAnalysis.isMixed,
      isBlocked: mixedAnalysis.isBlocked,
      dominantClass: mixedAnalysis.dominantClass,
      detectedClasses: mixedAnalysis.detectedClasses,
      classCounts: mixedAnalysis.classCounts,
    };

    if (mixedAnalysis.isMixed) {
      advisoryNotes.push(
        `Mixed feature classes detected: ${mixedAnalysis.detectedClasses.join(", ")}.`,
      );
    }
    if (mixedAnalysis.isBlocked) {
      blockingErrors.push("Table blocked by mixed-feature policy");
    }
  }

  // Advisory for summary-only
  if (classification.isSummaryOnly) {
    advisoryNotes.push(
      "Summary-only table: lacks per-sample dose-group numeric structure required for PoD modelling",
    );
  }

  // Advisory for gene-linked
  if (classification.featureClass === "gene_linked_feature") {
    advisoryNotes.push(
      "Gene-linked features carry upstream-declared gene assignments. Epigenomics MCP does not infer causal target relationships.",
    );
  }

  // Advisory for reserved classes
  const reservedClasses = [
    "atac_peak",
    "histone_mark_peak",
    "chip_peak_narrow",
    "chip_peak_broad",
    "mirna_expression",
    "ncrna_expression",
  ];
  if (reservedClasses.includes(classification.featureClass)) {
    reservedClassesDetected.push(classification.featureClass);
    advisoryNotes.push(
      `Reserved feature class "${classification.featureClass}" is active. Verify downstream consumer compatibility.`,
    );
  }

  // Determine recommended action
  let recommendedAction: FeatureClassificationReport["recommendedAction"] =
    "proceed";

  if (blockingErrors.length > 0) {
    recommendedAction = "blocked";
  } else if (mixedSummary?.isMixed) {
    recommendedAction = mixedSummary.isBlocked
      ? "blocked"
      : "split_table";
  } else if (classification.featureClass === "unclassified") {
    recommendedAction = "provide_explicit_class";
  } else if (
    classification.confidence === "low" ||
    classification.confidence === "medium"
  ) {
    recommendedAction = "review_required";
  }

  return {
    reportId,
    tableAnalysed: rows.length > 0,
    primaryClassification: classification,
    mixedFeatureAnalysis: mixedSummary,
    advisoryNotes,
    blockingErrors,
    reservedClassesDetected,
    recommendedAction,
  };
}

// ---------------------------------------------------------------------------
// Convenience: classify with mixed-feature analysis
// ---------------------------------------------------------------------------

/**
 * Classify a feature table and optionally run mixed-feature analysis.
 *
 * Returns both the primary classification and a full classification report.
 */
export function classifyFeatureTable(
  rows: Record<string, string>[],
  headers: string[],
  options: FeatureTypeClassificationOptions,
  mixedConfig?: z.input<typeof MixedFeatureDetectionConfigSchema>,
): {
  classification: FeatureTypeClassificationResult;
  report: FeatureClassificationReport;
  mixedAnalysis?: MixedFeatureAnalysisResult;
} {
  const classification = classifyFeatureType(options);

  let mixedAnalysis: MixedFeatureAnalysisResult | undefined;
  if (mixedConfig !== undefined && rows.length > 0) {
    mixedAnalysis = analyzeMixedFeatures(
      rows,
      headers,
      options.assayFamily,
      options.modality,
      mixedConfig,
    );
  }

  const report = buildFeatureClassificationReport(
    `report-${Date.now()}`,
    rows,
    headers,
    classification,
    options.assayFamily,
    options.modality,
    mixedAnalysis,
  );

  return { classification, report, mixedAnalysis };
}
