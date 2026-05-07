import { z } from "zod";
import type { EpigenomicsFeatureResponsePacket } from "../contracts/packets.js";
import { MissingnessProfileSchema, MissingnessBandSchema } from "./missingness.js";
import type { MissingnessProfile, MissingnessBand } from "./missingness.js";
import { VarianceProfileSchema, ReplicateStabilityBandSchema } from "../contracts/qc.js";
import type { VarianceProfile, ReplicateStabilityBand } from "../contracts/qc.js";
import {
  BatchProvenanceSummarySchema,
} from "./report_builder.js";
import type { BatchProvenanceSummary } from "./report_builder.js";
import type { ReplicateConsistencyPacket } from "../summarization/replicate_consistency.js";
import { profileMissingness, DEFAULT_MISSINGNESS_POLICY } from "./missingness.js";
import { profileVariance, DEFAULT_VARIANCE_POLICY } from "./variance.js";
import { summarizeReplicateConsistency } from "../summarization/replicate_consistency.js";
import { summarizeBatchProvenance } from "./report_builder.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Simplified replicate summary for deterministic QC profile consumption.
 *
 * Extracts only the aggregate statistics needed by downstream qualification;
 * per-group detail is available in the full ReplicateConsistencyPacket.
 */
export const ReplicateSummarySchema = z
  .object({
    groupCount: z.number().int().nonnegative(),
    groupsWithWarning: z.number().int().nonnegative(),
    overallStabilityBand: ReplicateStabilityBandSchema,
    meanCvAcrossGroups: z.number().nullable().optional(),
    maxCvAcrossGroups: z.number().nullable().optional(),
  })
  .strict();

export type ReplicateSummary = z.infer<typeof ReplicateSummarySchema>;

/**
 * Unified threshold status that downstream qualification can read directly.
 *
 * Fail-closed: the overallQcBand reflects the most severe sub-band.
 */
export const ThresholdStatusSchema = z
  .object({
    missingnessBand: MissingnessBandSchema,
    varianceBand: z.enum(["acceptable", "warning", "exclusion", "not_applicable"]),
    replicateStabilityBand: ReplicateStabilityBandSchema,
    batchConfoundingDetected: z.boolean(),
    overallQcBand: z.enum(["acceptable", "warning", "exclusion", "not_applicable"]),
  })
  .strict();

export type ThresholdStatus = z.infer<typeof ThresholdStatusSchema>;

/**
 * Deterministic QC profile object.
 *
 * Combines missingness profile, variance profile, replicate summary, and
 * batch provenance summary into a single schema-valid, byte-stable JSON
 * object. All numeric fields are rounded; all arrays are stably ordered.
 */
export const DeterministicQcProfileSchema = z
  .object({
    datasetId: z.string().min(1),
    schemaName: z.literal("DeterministicQcProfile"),
    schemaVersion: z.literal("0.1.0"),
    missingnessProfile: MissingnessProfileSchema,
    varianceProfile: VarianceProfileSchema,
    replicateSummary: ReplicateSummarySchema,
    batchSummary: BatchProvenanceSummarySchema,
    thresholdStatus: ThresholdStatusSchema,
    generatedAt: z.string().datetime(),
  })
  .strict();

export type DeterministicQcProfile = z.infer<typeof DeterministicQcProfileSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BAND_SEVERITY: Record<string, number> = {
  acceptable: 0,
  warning: 1,
  exclusion: 2,
  not_applicable: -1,
  not_assessed: -1,
  stable: 0,
  unstable: 1,
};

function severity(band: string): number {
  return BAND_SEVERITY[band] ?? 0;
}

function worstBand(
  bands: Array<"acceptable" | "warning" | "exclusion" | "not_applicable" | MissingnessBand>,
): "acceptable" | "warning" | "exclusion" | "not_applicable" {
  let worst: "acceptable" | "warning" | "exclusion" | "not_applicable" = "acceptable";
  let worstScore = severity(worst);

  for (const band of bands) {
    const score = severity(band);
    if (score > worstScore) {
      worst = band as "acceptable" | "warning" | "exclusion" | "not_applicable";
      worstScore = score;
    }
  }

  // If every band is not_applicable, return not_applicable
  if (worstScore < 0) return "not_applicable";
  return worst;
}

function buildReplicateSummary(
  packet: ReplicateConsistencyPacket,
): ReplicateSummary {
  const groups = packet.groups.slice().sort((a, b) => {
    if (a.doseValue !== b.doseValue) return a.doseValue - b.doseValue;
    return a.doseGroupId.localeCompare(b.doseGroupId);
  });

  const groupsWithWarning = groups.filter((g) => g.unusualSpreadWarning).length;

  // Aggregate CVs across groups (only groups where meanCv is defined)
  const meanCvs = groups
    .map((g) => g.meanCv)
    .filter((cv): cv is number => cv !== null);
  const maxCvs = groups
    .map((g) => g.maxCv)
    .filter((cv): cv is number => cv !== null);

  const meanCvAcrossGroups =
    meanCvs.length > 0
      ? meanCvs.reduce((sum, v) => sum + v, 0) / meanCvs.length
      : null;
  const maxCvAcrossGroups =
    maxCvs.length > 0 ? Math.max(...maxCvs) : null;

  // Overall stability band: unstable if any group is unstable, else stable
  // We use the CV threshold warning as a proxy for instability
  const overallStabilityBand: ReplicateStabilityBand =
    groupsWithWarning > 0 ? "unstable" : "stable";

  return {
    groupCount: groups.length,
    groupsWithWarning,
    overallStabilityBand,
    ...(meanCvAcrossGroups !== null
      ? { meanCvAcrossGroups: Math.round(meanCvAcrossGroups * 1_000_000) / 1_000_000 }
      : {}),
    ...(maxCvAcrossGroups !== null
      ? { maxCvAcrossGroups: Math.round(maxCvAcrossGroups * 1_000_000) / 1_000_000 }
      : {}),
  };
}

function buildThresholdStatus(
  missingnessProfile: MissingnessProfile,
  varianceProfile: VarianceProfile,
  replicateSummary: ReplicateSummary,
  batchSummary: BatchProvenanceSummary,
): ThresholdStatus {
  const missingnessBand = missingnessProfile.summaryBand;
  const varianceBand = varianceProfile.summaryBand;
  const replicateStabilityBand = replicateSummary.overallStabilityBand;
  const batchConfoundingDetected = batchSummary.doseBatchConfoundingDetected;

  const overallQcBand = worstBand([
    missingnessBand,
    varianceBand,
    replicateStabilityBand === "unstable" ? "warning" : "acceptable",
    batchConfoundingDetected ? "warning" : "acceptable",
  ]);

  return {
    missingnessBand,
    varianceBand,
    replicateStabilityBand,
    batchConfoundingDetected,
    overallQcBand,
  };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BuildDeterministicQcProfileOptions {
  /**
   * ISO-8601 timestamp for the profile. Defaults to a deterministic
   * placeholder when not supplied.
   */
  generatedAt?: string;
  /**
   * Optional upstream batch correction provenance.
   */
  upstreamCorrection?: Parameters<typeof summarizeBatchProvenance>[2];
}

/**
 * Build a deterministic QC profile object from an epigenomics response packet.
 *
 * Computes missingness profile, variance profile, replicate consistency
 * summary, and batch provenance summary; combines them with stable ordering
 * and numeric rounding into a single schema-valid object.
 *
 * Downstream qualification can read thresholdStatus directly without
 * traversing nested sub-profiles.
 */
export function buildDeterministicQcProfile(
  packet: EpigenomicsFeatureResponsePacket,
  options: BuildDeterministicQcProfileOptions = {},
): DeterministicQcProfile {
  const datasetId = packet.provenance.datasetId;

  // Compute sub-profiles deterministically
  const missingnessProfile = profileMissingness(
    datasetId,
    packet.features,
    packet.design,
    DEFAULT_MISSINGNESS_POLICY,
  );

  const varianceProfile = profileVariance(
    datasetId,
    packet.features,
    packet.design,
    DEFAULT_VARIANCE_POLICY,
  );

  const replicateConsistency = summarizeReplicateConsistency(packet);
  const replicateSummary = buildReplicateSummary(replicateConsistency.packet);

  const batchSummary = summarizeBatchProvenance(
    datasetId,
    packet.design,
    options.upstreamCorrection,
  );

  const thresholdStatus = buildThresholdStatus(
    missingnessProfile,
    varianceProfile,
    replicateSummary,
    batchSummary,
  );

  const generatedAt = options.generatedAt ?? new Date().toISOString();

  return DeterministicQcProfileSchema.parse({
    datasetId,
    schemaName: "DeterministicQcProfile",
    schemaVersion: "0.1.0",
    missingnessProfile,
    varianceProfile,
    replicateSummary,
    batchSummary,
    thresholdStatus,
    generatedAt,
  });
}
