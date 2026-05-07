import { z } from "zod";
import type {
  SummaryResponseTable,
  EpigenomicFeature,
} from "../contracts/features.js";
import type { ExperimentalDesign } from "../contracts/design.js";
import {
  FeatureQualificationSchema,
  QualificationWarningSchema,
} from "../contracts/qualification.js";
import type { FeatureQualification, QualificationWarning } from "../contracts/qualification.js";

/**
 * Numeric summary for a single dose group within an adapted summary feature.
 *
 * Scientific assumptions visible in outputs:
 * - Dose value is optional because summary tables may not declare dose metadata.
 * - SD and n are optional because published summaries often omit them.
 * - All numeric fields are preserved as-is from upstream; no transformation is applied.
 */
export const GroupNumericSummarySchema = z
  .object({
    groupId: z.string().min(1).describe("Dose group or contrast group identifier"),
    doseValue: z.number().finite().optional().describe("Numeric dose level when available"),
    mean: z.number().finite().optional().describe("Group mean"),
    sd: z.number().finite().optional().describe("Group standard deviation"),
    n: z.number().int().nonnegative().optional().describe("Group sample count"),
  })
  .strict();

export type GroupNumericSummary = z.infer<typeof GroupNumericSummarySchema>;

/**
 * Adapted summary feature preserving upstream aggregated statistics.
 *
 * Carries explicit dose-response readiness metadata so that downstream
 * consumers can distinguish exploratory contrasts from modelling-ready
 * group-level summaries.
 */
export const AdaptedSummaryFeatureSchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    featureClass: z.string().optional().describe("Feature class when known"),
    effectSize: z.number().finite().optional().describe("Effect size estimate"),
    statistic: z.number().finite().optional().describe("Test statistic"),
    qValue: z.number().min(0).max(1).optional().describe("Adjusted p-value"),
    pValue: z.number().min(0).max(1).optional().describe("Raw p-value"),
    contrast: z.string().optional().describe("Contrast description"),
    logFoldChange: z.number().finite().optional().describe("Log-fold change"),
    standardError: z.number().finite().optional().describe("Standard error"),
    ciLower: z.number().finite().optional().describe("CI lower bound"),
    ciUpper: z.number().finite().optional().describe("CI upper bound"),
    groupSummaries: z
      .array(GroupNumericSummarySchema)
      .default([])
      .describe("Dose-group numeric summaries when present"),
    supportsDoseResponse: z
      .boolean()
      .describe("Whether group summaries enable dose-response modelling"),
    qualificationStatus: z
      .enum(["exploratory_only", "accepted_for_pod", "excluded_insufficient_design"])
      .describe("Derived qualification status"),
    warnings: z
      .array(QualificationWarningSchema)
      .default([])
      .describe("Qualification warnings"),
  })
  .strict();

export type AdaptedSummaryFeature = z.infer<typeof AdaptedSummaryFeatureSchema>;

/**
 * Result of adapting a summary-response table.
 */
export const SummaryAdaptationResultSchema = z
  .object({
    tableId: z.string().min(1).describe("Source table identifier"),
    features: z.array(AdaptedSummaryFeatureSchema).describe("Adapted summary features"),
    hasGroupSummaries: z
      .boolean()
      .describe("Whether any feature carries dose-group numeric summaries"),
    hasMultipleContrasts: z.boolean().describe("Whether multiple contrasts are present"),
    overallSupportsDoseResponse: z
      .boolean()
      .describe("Whether the table as a whole supports dose-response modelling"),
    warnings: z.array(z.string()).describe("Reviewable warnings"),
    errors: z.array(z.string()).describe("Blocking errors"),
  })
  .strict();

export type SummaryAdaptationResult = z.infer<typeof SummaryAdaptationResultSchema>;

// ── Internal helpers ──

const CONTRAST_INDICATORS = ["contrast", "vs", "versus", "comparison", "diff", "change"];

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[_\s-]/g, "");
}

function looksLikeContrastKey(key: string): boolean {
  const n = normaliseKey(key);
  return CONTRAST_INDICATORS.some((ind) => n.includes(ind));
}

function looksLikeGroupSummaryKey(key: string): {
  isGroupSummary: boolean;
  groupId?: string;
  metric?: "mean" | "sd" | "n" | "median" | "se";
} {
  const n = normaliseKey(key);

  // Pattern: {group}_mean, {group}_sd, {group}_n
  const suffixMatch = n.match(/^(.*?)(mean|sd|se|stderr|n|median)$/);
  if (suffixMatch) {
    const groupPart = suffixMatch[1];
    const metricPart = suffixMatch[2];
    if (groupPart.length > 0) {
      const metricMap: Record<string, "mean" | "sd" | "n" | "median" | "se"> = {
        mean: "mean",
        sd: "sd",
        se: "se",
        stderr: "se",
        n: "n",
        median: "median",
      };
      return {
        isGroupSummary: true,
        groupId: groupPart,
        metric: metricMap[metricPart],
      };
    }
  }

  return { isGroupSummary: false };
}

/**
 * Extract group numeric summaries from raw summary values.
 */
function extractGroupSummaries(
  rawValues: Record<string, string>,
  design?: ExperimentalDesign,
): GroupNumericSummary[] {
  const byGroup = new Map<
    string,
    { mean?: number; sd?: number; n?: number; doseValue?: number }
  >();

  for (const [key, val] of Object.entries(rawValues)) {
    const parsed = looksLikeGroupSummaryKey(key);
    if (!parsed.isGroupSummary || !parsed.groupId) continue;

    const num = Number(val.trim());
    if (!Number.isFinite(num)) continue;

    const existing = byGroup.get(parsed.groupId) ?? {};
    if (parsed.metric === "mean") existing.mean = num;
    if (parsed.metric === "sd") existing.sd = num;
    if (parsed.metric === "n") existing.n = Math.floor(num);
    byGroup.set(parsed.groupId, existing);
  }

  // Also try to match design group IDs directly
  if (design) {
    for (const group of design.doseGroups) {
      const groupIdNorm = normaliseKey(group.doseGroupId);
      for (const [key, val] of Object.entries(rawValues)) {
        const keyNorm = normaliseKey(key);
        if (keyNorm === groupIdNorm || keyNorm.startsWith(groupIdNorm)) {
          const num = Number(val.trim());
          if (Number.isFinite(num)) {
            const existing = byGroup.get(group.doseGroupId) ?? {};
            if (existing.doseValue === undefined) existing.doseValue = group.doseValue;
            byGroup.set(group.doseGroupId, existing);
          }
        }
      }
    }
  }

  const summaries: GroupNumericSummary[] = [];
  for (const [groupId, data] of byGroup) {
    const doseValue =
      data.doseValue ??
      design?.doseGroups.find((g) => normaliseKey(g.doseGroupId) === normaliseKey(groupId))?.doseValue;

    summaries.push({
      groupId,
      ...(doseValue !== undefined ? { doseValue } : {}),
      ...(data.mean !== undefined ? { mean: data.mean } : {}),
      ...(data.sd !== undefined ? { sd: data.sd } : {}),
      ...(data.n !== undefined ? { n: data.n } : {}),
    });
  }

  return summaries;
}

/**
 * Determine whether dose-group numeric summaries enable dose-response modelling.
 *
 * Requires at least two groups with mean values and, when design is supplied,
 * coverage of at least one non-zero dose group.
 */
function determineSupportsDoseResponse(
  groupSummaries: GroupNumericSummary[],
  design?: ExperimentalDesign,
): boolean {
  const groupsWithMean = groupSummaries.filter((g) => g.mean !== undefined);
  if (groupsWithMean.length < 2) return false;

  if (design) {
    const nonZeroGroupIds = new Set(
      design.doseGroups.filter((g) => g.doseValue !== 0).map((g) => g.doseGroupId),
    );
    const coveredNonZero = groupSummaries.filter(
      (g) => g.mean !== undefined && nonZeroGroupIds.has(g.groupId),
    );
    if (coveredNonZero.length < 1) return false;
  }

  return true;
}

/**
 * Determine qualification status for a summary feature.
 *
 * Fail-closed: missing dose metadata or single-contrast-only evidence
 * without group summaries is marked exploratory_only.
 */
function determineQualificationStatus(
  supportsDoseResponse: boolean,
  hasGroupSummaries: boolean,
  hasContrast: boolean,
  design?: ExperimentalDesign,
): "exploratory_only" | "accepted_for_pod" | "excluded_insufficient_design" {
  if (!design) {
    // Missing dose metadata: cannot validate dose-response structure
    return "exploratory_only";
  }

  if (!hasGroupSummaries && hasContrast) {
    // Single-contrast-only evidence without dose-group numeric summaries
    return "exploratory_only";
  }

  if (supportsDoseResponse) {
    return "accepted_for_pod";
  }

  // Group summaries present but insufficient for dose-response
  return "exploratory_only";
}

// ── Public API ──

/**
 * Check whether an EpigenomicFeature contains contrast-style values
 * rather than per-sample measurements.
 *
 * Contrast detection heuristics:
 * - Value keys contain contrast indicators ("contrast", "vs", etc.)
 * - Value keys do not match any design sample IDs
 * - Value keys look like group IDs rather than sample IDs
 */
export function isContrastOnlyFeature(
  feature: EpigenomicFeature,
  design?: ExperimentalDesign,
): boolean {
  const valueKeys = Object.keys(feature.values);
  if (valueKeys.length === 0) return false;

  // If design is provided, check whether keys match sample IDs
  if (design) {
    const sampleIds = new Set(design.samples.map((s) => s.sampleId));
    const sampleMatches = valueKeys.filter((k) => sampleIds.has(k));
    if (sampleMatches.length / valueKeys.length > 0.5) return false;
  }

  // Contrast indicator heuristics
  const contrastMatches = valueKeys.filter(looksLikeContrastKey);
  if (contrastMatches.length / valueKeys.length > 0.5) return true;

  // If all keys look like simple group labels rather than sample IDs
  const groupLikePattern = /^(ctrl|control|low|mid|high|dose|treatment|group)/i;
  const allGroupLike = valueKeys.every((k) => groupLikePattern.test(k) || looksLikeContrastKey(k));
  if (allGroupLike) return true;

  return false;
}

/**
 * Detect the summary evidence type for a set of EpigenomicFeature objects.
 *
 * Returns:
 * - "per_sample": value keys match design sample IDs
 * - "group_summary": value keys match design dose group IDs
 * - "contrast_summary": value keys look like contrasts
 * - "ambiguous": cannot determine
 */
export function detectSummaryEvidenceType(
  features: EpigenomicFeature[],
  design?: ExperimentalDesign,
): "per_sample" | "contrast_summary" | "group_summary" | "ambiguous" {
  if (features.length === 0) return "ambiguous";

  const contrastCount = features.filter((f) => isContrastOnlyFeature(f, design)).length;
  if (contrastCount / features.length > 0.5) return "contrast_summary";

  if (design) {
    const groupIds = new Set(design.doseGroups.map((g) => g.doseGroupId));
    const groupLikeCount = features.filter((f) => {
      const keys = Object.keys(f.values);
      return keys.length > 0 && keys.every((k) => groupIds.has(k));
    }).length;
    if (groupLikeCount / features.length > 0.5) return "group_summary";

    const sampleIds = new Set(design.samples.map((s) => s.sampleId));
    const sampleLikeCount = features.filter((f) => {
      const keys = Object.keys(f.values);
      return keys.length > 0 && keys.every((k) => sampleIds.has(k));
    }).length;
    if (sampleLikeCount / features.length > 0.5) return "per_sample";
  }

  return "ambiguous";
}

/**
 * Adapt a SummaryResponseTable into qualified summary features.
 *
 * Preserves effect_size, statistic, q_value, contrast, and group summaries.
 * Sets supports_dose_response based on the presence of dose-group numeric summaries.
 * Marks single-contrast-only evidence as exploratory_only unless group summaries are present.
 */
export function adaptSummaryResponseTable(
  table: SummaryResponseTable,
  design?: ExperimentalDesign,
): SummaryAdaptationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const features: AdaptedSummaryFeature[] = [];

  if (!table.summaryRows || table.summaryRows.length === 0) {
    errors.push("Summary table contains no rows");
    return {
      tableId: table.tableId,
      features: [],
      hasGroupSummaries: false,
      hasMultipleContrasts: false,
      overallSupportsDoseResponse: false,
      warnings,
      errors,
    };
  }

  // Track contrasts to detect single-contrast vs multi-contrast
  const contrastSet = new Set<string>();

  for (const row of table.summaryRows) {
    const groupSummaries = extractGroupSummaries(row.rawValues ?? {}, design);
    const hasGroupSummaries = groupSummaries.length > 0;
    const hasContrast = row.contrast !== undefined && row.contrast !== "";
    if (hasContrast) contrastSet.add(row.contrast as string);


    const supportsDoseResponse = determineSupportsDoseResponse(groupSummaries, design);
    const qualificationStatus = determineQualificationStatus(
      supportsDoseResponse,
      hasGroupSummaries,
      hasContrast,
      design,
    );

    const adaptedWarnings: QualificationWarning[] = [];
    if (qualificationStatus === "exploratory_only") {
      adaptedWarnings.push({
        warningCode: "EPIW007_SUMMARY_CONTRAST_ONLY",
        severity: "warning",
        message: `Feature ${row.featureId} is summary contrast evidence without dose-group numeric summaries; marked exploratory_only`,
        category: "missing_metadata",
        blocksDownstream: false,
        featureIds: [row.featureId],
      });
    }

    features.push({
      featureId: row.featureId,
      effectSize: row.effectSize,
      statistic: row.statistic,
      qValue: row.qValue,
      pValue: row.pValue,
      contrast: row.contrast,
      logFoldChange: row.logFoldChange,
      standardError: row.standardError,
      ciLower: row.ciLower,
      ciUpper: row.ciUpper,
      groupSummaries,
      supportsDoseResponse,
      qualificationStatus,
      warnings: adaptedWarnings,
    });
  }

  const hasGroupSummaries = features.some((f) => f.groupSummaries.length > 0);
  const hasMultipleContrasts = contrastSet.size > 1;
  const overallSupportsDoseResponse =
    hasGroupSummaries && features.some((f) => f.supportsDoseResponse);

  if (!design) {
    warnings.push("No experimental design provided; cannot validate dose-response structure");
  }

  if (!hasGroupSummaries && features.some((f) => f.contrast)) {
    warnings.push(
      "Summary table contains contrast-only evidence without dose-group numeric summaries; PoD readiness blocked",
    );
  }

  return {
    tableId: table.tableId,
    features,
    hasGroupSummaries,
    hasMultipleContrasts,
    overallSupportsDoseResponse,
    warnings,
    errors,
  };
}

/**
 * Adapt EpigenomicFeature objects that contain contrast-style values.
 *
 * Used when upstream data has already been parsed into EpigenomicFeature
 * shape but value keys are contrasts rather than sample IDs.
 */
export function adaptContrastFeatures(
  features: EpigenomicFeature[],
  design?: ExperimentalDesign,
): SummaryAdaptationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const adaptedFeatures: AdaptedSummaryFeature[] = [];

  if (features.length === 0) {
    errors.push("No features provided");
    return {
      tableId: "contrast-adapted",
      features: [],
      hasGroupSummaries: false,
      hasMultipleContrasts: false,
      overallSupportsDoseResponse: false,
      warnings,
      errors,
    };
  }

  const contrastSet = new Set<string>();

  for (const feature of features) {
    const valueKeys = Object.keys(feature.values);
    valueKeys.filter(looksLikeContrastKey);

    // Extract effect size and q-value from contrast values if available
    let effectSize: number | undefined;
    let qValue: number | undefined;
    let contrast: string | undefined;

    for (const key of valueKeys) {
      const val = feature.values[key];
      if (val === null || val === undefined) continue;
      if (!Number.isFinite(val)) continue;

      if (looksLikeContrastKey(key)) {
        contrast = key;
        contrastSet.add(key);
        // Heuristic: values between 0 and 1 that are small are likely q-values;
        // others are likely effect sizes.  This is intentionally coarse.
        if (val >= 0 && val <= 1 && val < 0.5) {
          if (qValue === undefined) qValue = val;
        } else {
          if (effectSize === undefined) effectSize = val;
        }
      }
    }

    // No group summaries possible from contrast-only features
    const groupSummaries: GroupNumericSummary[] = [];
    const hasGroupSummaries = false;
    const hasContrast = contrast !== undefined;

    const supportsDoseResponse = determineSupportsDoseResponse(groupSummaries, design);
    const qualificationStatus = determineQualificationStatus(
      supportsDoseResponse,
      hasGroupSummaries,
      hasContrast,
      design,
    );

    const adaptedWarnings: QualificationWarning[] = [];
    if (qualificationStatus === "exploratory_only") {
      adaptedWarnings.push({
        warningCode: "EPIW007_CONTRAST_ONLY_VALUES",
        severity: "warning",
        message: `Feature ${feature.featureId} contains contrast-level values without per-sample dose-group structure; marked exploratory_only`,
        category: "missing_metadata",
        blocksDownstream: false,
        featureIds: [feature.featureId],
      });
    }

    adaptedFeatures.push({
      featureId: feature.featureId,
      featureClass: feature.featureClass,
      effectSize,
      statistic: undefined,
      qValue,
      pValue: undefined,
      contrast,
      logFoldChange: undefined,
      standardError: undefined,
      ciLower: undefined,
      ciUpper: undefined,
      groupSummaries,
      supportsDoseResponse,
      qualificationStatus,
      warnings: adaptedWarnings,
    });
  }

  const hasGroupSummaries = false;
  const hasMultipleContrasts = contrastSet.size > 1;
  const overallSupportsDoseResponse = false;

  if (!design) {
    warnings.push("No experimental design provided; cannot validate dose-response structure");
  }

  warnings.push(
    "Features contain contrast-only values without dose-group numeric summaries; PoD readiness blocked",
  );

  return {
    tableId: "contrast-adapted",
    features: adaptedFeatures,
    hasGroupSummaries,
    hasMultipleContrasts,
    overallSupportsDoseResponse,
    warnings,
    errors,
  };
}

/**
 * Build FeatureQualification objects from adapted summary features.
 *
 * These qualifications can be fed into the handoff builder or
 * Bioactivity-PoD downstream consumer.
 */
export function buildFeatureQualifications(
  adaptedFeatures: AdaptedSummaryFeature[],
): FeatureQualification[] {
  return adaptedFeatures.map((af) =>
    FeatureQualificationSchema.parse({
      featureId: af.featureId,
      status: af.qualificationStatus,
      warnings: af.warnings,
      mappedGeneIds: [],
      mappingConfidence: "none",
      mappingMethod: "unknown",
    }),
  );
}
