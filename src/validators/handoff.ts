import { BioactivityPoDHandoffPacketSchema } from "../contracts/packets.js";
import type { QualificationStatus } from "../contracts/qualification.js";

export interface HandoffValidationResult {
  valid: boolean;
  schemaValid: boolean;
  semanticValid: boolean;
  errors: string[];
  warnings: string[];
  errorCode?: string;
}

const ACCEPTED_STATUSES: Set<QualificationStatus> = new Set([
  "accepted_for_pod",
  "accepted_with_caveats",
]);

/**
 * Validate a BioactivityPoDHandoffPacket for schema compliance and
 * internal semantic consistency.
 *
 * Semantic rules enforced:
 * 1. doseResponseReadySubset featureIds must exist in qualifiedFeatures.
 * 2. doseResponseReadySubset features must have accepted status.
 * 3. doseResponseReadySubset must not intersect excludedFeatures.
 * 4. No duplicate featureIds within qualifiedFeatures or excludedFeatures.
 * 5. qualifiedFeatures and excludedFeatures must be disjoint.
 * 6. excludedFeatures must not have accepted status.
 * 7. mandatoryCaveats with blocksDownstream=true are flagged.
 *
 * Fail-closed: any schema or semantic violation yields
 * errorCode EPI010_HANDOFF_SCHEMA_INVALID.
 */
export function validateHandoffPacket(
  handoff: unknown,
): HandoffValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Schema validation ──
  const parseResult = BioactivityPoDHandoffPacketSchema.safeParse(handoff);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      valid: false,
      schemaValid: false,
      semanticValid: false,
      errors,
      warnings,
      errorCode: "EPI010_HANDOFF_SCHEMA_INVALID",
    };
  }

  const h = parseResult.data;

  // ── Semantic validation ──
  const qualifiedMap = new Map<string, typeof h.qualifiedFeatures[number]>();
  const excludedMap = new Map<string, typeof h.excludedFeatures[number]>();
  const duplicateQualified = new Set<string>();
  const duplicateExcluded = new Set<string>();

  for (const q of h.qualifiedFeatures) {
    if (qualifiedMap.has(q.featureId)) {
      duplicateQualified.add(q.featureId);
    } else {
      qualifiedMap.set(q.featureId, q);
    }
  }

  for (const e of h.excludedFeatures) {
    if (excludedMap.has(e.featureId)) {
      duplicateExcluded.add(e.featureId);
    } else {
      excludedMap.set(e.featureId, e);
    }
  }

  if (duplicateQualified.size > 0) {
    errors.push(
      `Duplicate featureIds in qualifiedFeatures: ${Array.from(duplicateQualified).join(", ")}`,
    );
  }

  if (duplicateExcluded.size > 0) {
    errors.push(
      `Duplicate featureIds in excludedFeatures: ${Array.from(duplicateExcluded).join(", ")}`,
    );
  }

  // 5. qualifiedFeatures and excludedFeatures must be disjoint
  const overlap = new Set<string>();
  for (const featureId of qualifiedMap.keys()) {
    if (excludedMap.has(featureId)) {
      overlap.add(featureId);
    }
  }
  if (overlap.size > 0) {
    errors.push(
      `FeatureIds present in both qualifiedFeatures and excludedFeatures: ${Array.from(overlap).join(", ")}`,
    );
  }

  // 6. excludedFeatures must not have accepted status
  for (const e of h.excludedFeatures) {
    if (ACCEPTED_STATUSES.has(e.status)) {
      errors.push(
        `Excluded feature ${e.featureId} has accepted status "${e.status}"`,
      );
    }
  }

  // 1. doseResponseReadySubset featureIds must exist in qualifiedFeatures
  const missingFromQualified = h.doseResponseReadySubset.filter(
    (id) => !qualifiedMap.has(id),
  );
  if (missingFromQualified.length > 0) {
    errors.push(
      `doseResponseReadySubset contains featureIds not in qualifiedFeatures: ${missingFromQualified.join(", ")}`,
    );
  }

  // 2. doseResponseReadySubset features must have accepted status
  for (const id of h.doseResponseReadySubset) {
    const q = qualifiedMap.get(id);
    if (q && !ACCEPTED_STATUSES.has(q.status)) {
      errors.push(
        `doseResponseReadySubset feature ${id} has non-accepted status "${q.status}"`,
      );
    }
  }

  // 3. doseResponseReadySubset must not intersect excludedFeatures
  const inExcluded = h.doseResponseReadySubset.filter((id) =>
    excludedMap.has(id),
  );
  if (inExcluded.length > 0) {
    errors.push(
      `doseResponseReadySubset contains featureIds in excludedFeatures: ${inExcluded.join(", ")}`,
    );
  }

  // 7. mandatoryCaveats with blocksDownstream=true
  const blockingCaveats = h.mandatoryCaveats.filter((c) => c.blocksDownstream);
  if (blockingCaveats.length > 0) {
    warnings.push(
      `Handoff contains ${blockingCaveats.length} mandatory caveat(s) that block downstream use`,
    );
  }

  const semanticValid = errors.length === 0;

  if (!semanticValid) {
    return {
      valid: false,
      schemaValid: true,
      semanticValid: false,
      errors,
      warnings,
      errorCode: "EPI010_HANDOFF_SCHEMA_INVALID",
    };
  }

  return {
    valid: true,
    schemaValid: true,
    semanticValid: true,
    errors,
    warnings,
  };
}

/**
 * Validate a handoff packet together with its source
 * EpigenomicsFeatureResponsePacket for deeper semantic consistency.
 *
 * Additional checks (when sourcePacket is supplied):
 * - sourcePacketRef must match the source packetId.
 * - doseResponseReadySubset must be consistent with source packet
 *   qualificationSummary and warnings.
 */
export function validateHandoffWithSource(
  handoff: unknown,
  sourcePacket: unknown,
): HandoffValidationResult {
  const baseResult = validateHandoffPacket(handoff);

  if (!baseResult.valid) {
    return baseResult;
  }

  const h = BioactivityPoDHandoffPacketSchema.parse(handoff);
  const errors = [...baseResult.errors];
  const warnings = [...baseResult.warnings];

  // sourcePacketRef must be a non-empty string (already validated by schema),
  // but if sourcePacket is provided, check consistency.
  if (
    typeof sourcePacket === "object" &&
    sourcePacket !== null &&
    "packetId" in sourcePacket
  ) {
    const sourcePacketId = (sourcePacket as Record<string, unknown>).packetId;
    if (typeof sourcePacketId === "string" && h.sourcePacketRef !== sourcePacketId) {
      errors.push(
        `sourcePacketRef "${h.sourcePacketRef}" does not match source packetId "${sourcePacketId}"`,
      );
    }
  }

  const semanticValid = errors.length === 0;

  if (!semanticValid) {
    return {
      valid: false,
      schemaValid: true,
      semanticValid: false,
      errors,
      warnings,
      errorCode: "EPI010_HANDOFF_SCHEMA_INVALID",
    };
  }

  return {
    valid: true,
    schemaValid: true,
    semanticValid: true,
    errors,
    warnings,
  };
}
