import { z } from "zod";
import type { ExperimentalDesign } from "../contracts/design.js";
import type { ReplicatePolicy } from "../qualification/policy.js";

/**
 * Per-dose-group breakdown of replicate counts by type.
 *
 * Scientific assumptions visible in outputs:
 * - biological: counts fully toward minimums.
 * - technical: does NOT count toward biological minimums.
 * - pooled: counts as one biological replicate but flagged with a
 *   pooled-sample caveat (independent biological variance is lost).
 * - pseudobulk: counts as one biological replicate but flagged with a
 *   pseudobulk caveat (cell-composition aggregation).
 * - effectiveBiological: biological + pooled + pseudobulk (the count used
 *   for policy enforcement).
 * - undefinedReplicateType samples are treated as biological (backward
 *   compatibility with designs that pre-date explicit replicate typing).
 */
export const ReplicateGroupCountsSchema = z
  .object({
    doseGroupId: z.string().min(1),
    biological: z.number().int().nonnegative(),
    technical: z.number().int().nonnegative(),
    pooled: z.number().int().nonnegative(),
    pseudobulk: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    effectiveBiological: z.number().int().nonnegative(),
  })
  .strict();

export type ReplicateGroupCounts = z.infer<typeof ReplicateGroupCountsSchema>;

/**
 * Replicate-validation status for a single group.
 *
 * Uses a 4-state ontology derived from the 9-status qualification ontology
 * but scoped specifically to replicate adequacy:
 * - accepted: meets minimum biological replicate count (≥ min).
 * - preferred: meets or exceeds preferred count (≥ preferred).
 * - review_required: n=1 biological replicate and policy is review_required.
 * - excluded: below minimum biological replicate count.
 */
export const ReplicateGroupStatusSchema = z.enum([
  "accepted",
  "preferred",
  "review_required",
  "excluded",
]);

export type ReplicateGroupStatus = z.infer<typeof ReplicateGroupStatusSchema>;

/**
 * Structured warning emitted when a group has non-biological replicates
 * that may affect downstream variance estimation.
 */
export const ReplicateGroupWarningSchema = z
  .object({
    warningCode: z.string().min(1),
    message: z.string().min(1),
    category: z.enum([
      "technical_replicate_only",
      "pooled_sample",
      "pseudobulk_sample",
      "mixed_replicate_types",
    ]),
  })
  .strict();

export type ReplicateGroupWarning = z.infer<typeof ReplicateGroupWarningSchema>;

/**
 * Per-group replicate validation result.
 */
export const ReplicateGroupResultSchema = z
  .object({
    doseGroupId: z.string().min(1),
    doseValue: z.number().finite(),
    counts: ReplicateGroupCountsSchema,
    status: ReplicateGroupStatusSchema,
    blocksDownstream: z.boolean(),
    warnings: z.array(ReplicateGroupWarningSchema),
  })
  .strict();

export type ReplicateGroupResult = z.infer<typeof ReplicateGroupResultSchema>;

/**
 * Overall replicate validation result.
 */
export const ReplicateValidationResultSchema = z
  .object({
    valid: z.boolean(),
    overallStatus: ReplicateGroupStatusSchema,
    groups: z.array(ReplicateGroupResultSchema),
    minEffectiveBiological: z.number().int().nonnegative(),
    groupsBlocked: z.number().int().nonnegative(),
    groupsUnderPreferred: z.number().int().nonnegative(),
  })
  .strict();

export type ReplicateValidationResult = z.infer<
  typeof ReplicateValidationResultSchema
>;

const WARNING_CODES = {
  TECHNICAL_ONLY: "EPIR001_TECHNICAL_REPLICATE_ONLY",
  POOLED_SAMPLE: "EPIR002_POOLED_SAMPLE",
  PSEUDOBULK_SAMPLE: "EPIR003_PSEUDOBULK_SAMPLE",
  MIXED_REPLICATES: "EPIR004_MIXED_REPLICATE_TYPES",
} as const;

/**
 * Count replicates per dose group, distinguishing all four types.
 *
 * Samples with an undefined replicateType are treated as biological
 * for backward compatibility.
 */
export function countReplicatesByType(
  design: ExperimentalDesign,
): ReplicateGroupCounts[] {
  const groupMap = new Map<
    string,
    {
      doseGroupId: string;
      biological: number;
      technical: number;
      pooled: number;
      pseudobulk: number;
    }
  >();

  for (const sample of design.samples) {
    const entry = groupMap.get(sample.doseGroupId) ?? {
      doseGroupId: sample.doseGroupId,
      biological: 0,
      technical: 0,
      pooled: 0,
      pseudobulk: 0,
    };

    const rType = sample.replicateType;
    if (rType === "technical") {
      entry.technical += 1;
    } else if (rType === "pooled") {
      entry.pooled += 1;
    } else if (rType === "pseudobulk") {
      entry.pseudobulk += 1;
    } else {
      // undefined or explicit "biological"
      entry.biological += 1;
    }

    groupMap.set(sample.doseGroupId, entry);
  }

  // Ensure every declared dose group appears (even if zero samples)
  for (const dg of design.doseGroups) {
    if (!groupMap.has(dg.doseGroupId)) {
      groupMap.set(dg.doseGroupId, {
        doseGroupId: dg.doseGroupId,
        biological: 0,
        technical: 0,
        pooled: 0,
        pseudobulk: 0,
      });
    }
  }

  const results: ReplicateGroupCounts[] = [];
  for (const entry of groupMap.values()) {
    const total =
      entry.biological + entry.technical + entry.pooled + entry.pseudobulk;
    const effectiveBiological = entry.biological + entry.pooled + entry.pseudobulk;
    results.push({
      doseGroupId: entry.doseGroupId,
      biological: entry.biological,
      technical: entry.technical,
      pooled: entry.pooled,
      pseudobulk: entry.pseudobulk,
      total,
      effectiveBiological,
    });
  }

  return results;
}

/**
 * Determine the replicate-validation status for a single group given
 * its effective biological count and the current policy.
 *
 * Fail-closed: ambiguous inputs default to the most restrictive status.
 */
function determineGroupStatus(
  effectiveBiological: number,
  policy: ReplicatePolicy,
): { status: ReplicateGroupStatus; blocksDownstream: boolean } {
  if (effectiveBiological >= policy.preferredBiologicalReplicatesPerGroup) {
    return { status: "preferred", blocksDownstream: false };
  }
  if (effectiveBiological >= policy.minBiologicalReplicatesPerGroup) {
    return { status: "accepted", blocksDownstream: false };
  }
  if (
    effectiveBiological === 1 &&
    policy.n1BiologicalReplicatePolicy === "review_required"
  ) {
    return { status: "review_required", blocksDownstream: false };
  }
  // Below minimum (including n=1 when policy is "excluded")
  return { status: "excluded", blocksDownstream: true };
}

/**
 * Build per-group warnings based on replicate-type composition.
 */
function buildGroupWarnings(counts: ReplicateGroupCounts): ReplicateGroupWarning[] {
  const warnings: ReplicateGroupWarning[] = [];

  const hasBiological = counts.biological > 0;
  const hasTechnical = counts.technical > 0;
  const hasPooled = counts.pooled > 0;
  const hasPseudobulk = counts.pseudobulk > 0;

  if (!hasBiological && hasTechnical && !hasPooled && !hasPseudobulk) {
    warnings.push({
      warningCode: WARNING_CODES.TECHNICAL_ONLY,
      message: `Group ${counts.doseGroupId} contains only technical replicates; no independent biological variance estimable`,
      category: "technical_replicate_only",
    });
  }

  if (hasPooled) {
    warnings.push({
      warningCode: WARNING_CODES.POOLED_SAMPLE,
      message: `Group ${counts.doseGroupId} contains pooled samples; individual-level biological variance is not estimable`,
      category: "pooled_sample",
    });
  }

  if (hasPseudobulk) {
    warnings.push({
      warningCode: WARNING_CODES.PSEUDOBULK_SAMPLE,
      message: `Group ${counts.doseGroupId} contains pseudobulk samples; cell-composition aggregation may mask individual-level variance`,
      category: "pseudobulk_sample",
    });
  }

  const typeCount = [
    hasBiological,
    hasTechnical,
    hasPooled,
    hasPseudobulk,
  ].filter(Boolean).length;
  if (typeCount > 1) {
    warnings.push({
      warningCode: WARNING_CODES.MIXED_REPLICATES,
      message: `Group ${counts.doseGroupId} contains mixed replicate types (biological=${counts.biological}, technical=${counts.technical}, pooled=${counts.pooled}, pseudobulk=${counts.pseudobulk})`,
      category: "mixed_replicate_types",
    });
  }

  return warnings;
}

/**
 * Validate replicate counts across all dose groups against policy.
 *
 * Enforces:
 * - Technical replicates do NOT count toward biological minimum.
 * - Pooled and pseudobulk samples count as biological replicates but
 *   generate appropriate warnings.
 * - Configurable minimums with defaults: n=2 accepted, n=3 preferred,
 *   n=1 excluded or review_required depending on policy.
 *
 * Returns a per-group breakdown and an overall status.  The overall
 * status is the most restrictive of any group (fail-closed).
 */
export function validateReplicates(
  design: ExperimentalDesign,
  policy: ReplicatePolicy,
): ReplicateValidationResult {
  const groupCounts = countReplicatesByType(design);
  const groupResults: ReplicateGroupResult[] = [];

  let minEffectiveBiological = Infinity;
  let groupsBlocked = 0;
  let groupsUnderPreferred = 0;

  for (const counts of groupCounts) {
    const doseGroup = design.doseGroups.find(
      (g) => g.doseGroupId === counts.doseGroupId,
    );
    const doseValue = doseGroup?.doseValue ?? NaN;

    const { status, blocksDownstream } = determineGroupStatus(
      counts.effectiveBiological,
      policy,
    );

    const warnings = buildGroupWarnings(counts);

    if (counts.effectiveBiological < minEffectiveBiological) {
      minEffectiveBiological = counts.effectiveBiological;
    }
    if (blocksDownstream) {
      groupsBlocked += 1;
    }
    if (counts.effectiveBiological < policy.preferredBiologicalReplicatesPerGroup) {
      groupsUnderPreferred += 1;
    }

    groupResults.push({
      doseGroupId: counts.doseGroupId,
      doseValue,
      counts,
      status,
      blocksDownstream,
      warnings,
    });
  }

  // Deterministic ordering: doseValue ascending, then doseGroupId
  groupResults.sort((a, b) => {
    if (a.doseValue !== b.doseValue) {
      return a.doseValue - b.doseValue;
    }
    return a.doseGroupId.localeCompare(b.doseGroupId);
  });

  // Overall status is the most restrictive of any group
  const statusPriority: Record<ReplicateGroupStatus, number> = {
    excluded: 0,
    review_required: 1,
    accepted: 2,
    preferred: 3,
  };

  const overallStatus = groupResults.reduce((mostRestrictive, group) => {
    return statusPriority[group.status] < statusPriority[mostRestrictive]
      ? group.status
      : mostRestrictive;
  }, "preferred" as ReplicateGroupStatus);

  if (minEffectiveBiological === Infinity) {
    minEffectiveBiological = 0;
  }

  const valid = overallStatus !== "excluded";

  return ReplicateValidationResultSchema.parse({
    valid,
    overallStatus,
    groups: groupResults,
    minEffectiveBiological,
    groupsBlocked,
    groupsUnderPreferred,
  });
}
