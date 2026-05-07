import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { EpigenomicsFeatureResponsePacket } from "../contracts/packets.js";

/**
 * Replicate consistency summary for a single dose group.
 *
 * Scientific assumptions visible in outputs:
 * - CV is undefined (excluded) when |mean| < 1e-12 (near-zero mean would
 *   produce numerically unstable or arbitrarily large CV).
 * - SD is 0 when n < 2 (undefined sample standard deviation pinned to zero).
 * - Per-feature CVs are aggregated only across features where CV is defined.
 * - Unusual spread warning is triggered when >25 % of evaluable features
 *   exceed the configurable CV threshold.
 */
export const ReplicateConsistencyGroupSchema = z
  .object({
    doseGroupId: z.string().min(1).describe("Dose group identifier"),
    doseValue: z.number().finite().describe("Numeric dose level"),
    featureCount: z.number().int().nonnegative().describe("Number of features evaluated"),
    totalReplicates: z.number().int().nonnegative().describe("Total samples in group"),
    biologicalReplicates: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of biological replicates in group"),
    technicalReplicates: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of technical replicates in group"),
    pooledReplicates: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of pooled samples in group"),
    pseudobulkReplicates: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of pseudobulk samples in group"),
    meanOfFeatureMeans: z
      .number()
      .nullable()
      .describe("Mean of per-feature means; null when all features have no present values"),
    meanOfFeatureSds: z
      .number()
      .describe("Mean of per-feature sample SDs (0 when all features have n < 2)"),
    medianFeatureSd: z
      .number()
      .describe("Median of per-feature sample SDs"),
    pooledSd: z
      .number()
      .describe("Pooled SD across all present values in group (0 when < 2 total values)"),
    meanCv: z.number().nullable().describe("Mean coefficient of variation across evaluable features"),
    medianCv: z
      .number()
      .nullable()
      .describe("Median coefficient of variation across evaluable features"),
    maxCv: z.number().nullable().describe("Maximum coefficient of variation across evaluable features"),
    cvThreshold: z.number().positive().describe("CV threshold used for warning flagging"),
    featuresExceedingCvThreshold: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of features with CV exceeding threshold"),
    evaluableFeatureCount: z
      .number()
      .int()
      .nonnegative()
      .describe("Features where CV could be computed"),
    unusualSpreadWarning: z
      .boolean()
      .describe("True when >25 % of evaluable features exceed CV threshold"),
  })
  .strict();

export type ReplicateConsistencyGroup = z.infer<typeof ReplicateConsistencyGroupSchema>;

/**
 * Packet summarizing replicate consistency across all dose groups.
 *
 * Deterministic descriptive-statistics packet.  No outlier removal,
 * no dose-response modelling.
 */
export const ReplicateConsistencyPacketSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    schemaName: z.literal("ReplicateConsistencyPacket"),
    packetId: z.string().uuid(),
    sourcePacketRef: z.string().min(1).describe("Source response packet ID"),
    groups: z.array(ReplicateConsistencyGroupSchema).min(1),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type ReplicateConsistencyPacket = z.infer<typeof ReplicateConsistencyPacketSchema>;

export interface SummarizeReplicateConsistencyResult {
  packet: ReplicateConsistencyPacket;
  groupCount: number;
  groupsWithWarning: number;
}

const NEAR_ZERO = 1e-12;

function isMissing(value: number | null | undefined): boolean {
  return value === null || value === undefined || Number.isNaN(value);
}

function computeMean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  return sum / values.length;
}

function computeSampleSd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = computeMean(values) as number;
  let sqDiffSum = 0;
  for (const v of values) {
    const diff = v - mean;
    sqDiffSum += diff * diff;
  }
  return Math.sqrt(sqDiffSum / (values.length - 1));
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function computeCv(sd: number, mean: number): number | null {
  if (Math.abs(mean) < NEAR_ZERO) return null;
  return sd / Math.abs(mean);
}

/**
 * Summarize replicate consistency across dose groups.
 *
 * For every dose group, computes aggregate statistics describing how
 * consistently replicates agree across features.  Per-feature means and
 * SDs are first computed within the group; these are then summarized
 * into group-level statistics (mean of SDs, median SD, pooled SD,
 * mean/median/max CV).
 *
 * Fail-closed: groups with no samples emit zeros/nulls and no warning.
 * No outlier removal.  No dose-response modelling.
 */
export function summarizeReplicateConsistency(
  packet: EpigenomicsFeatureResponsePacket,
  opts?: { cvThreshold?: number },
): SummarizeReplicateConsistencyResult {
  const cvThreshold = opts?.cvThreshold ?? 0.3;
  const groups: ReplicateConsistencyGroup[] = [];

  // Build sample lookup maps once
  const groupSamples = new Map<
    string,
    { sampleId: string; replicateType: "biological" | "technical" | "pooled" | "pseudobulk" | undefined }[]
  >();

  for (const sample of packet.design.samples) {
    const list = groupSamples.get(sample.doseGroupId) ?? [];
    list.push({
      sampleId: sample.sampleId,
      replicateType: sample.replicateType,
    });
    groupSamples.set(sample.doseGroupId, list);
  }

  for (const doseGroup of packet.design.doseGroups) {
    const samples = groupSamples.get(doseGroup.doseGroupId) ?? [];
    const totalReplicates = samples.length;
    const biologicalReplicates = samples.filter(
      (s) => s.replicateType === "biological" || s.replicateType === undefined,
    ).length;
    const technicalReplicates = samples.filter((s) => s.replicateType === "technical").length;
    const pooledReplicates = samples.filter((s) => s.replicateType === "pooled").length;
    const pseudobulkReplicates = samples.filter((s) => s.replicateType === "pseudobulk").length;

    const featureMeans: number[] = [];
    const featureSds: number[] = [];
    const cvs: number[] = [];
    let allPresentValues: number[] = [];
    let featuresExceedingCvThreshold = 0;

    for (const feature of packet.features) {
      const presentValues: number[] = [];

      for (const { sampleId } of samples) {
        const raw = feature.values[sampleId];
        if (!isMissing(raw)) {
          presentValues.push(raw as number);
        }
      }

      const mean = computeMean(presentValues);
      const sd = computeSampleSd(presentValues);

      if (mean !== null) {
        featureMeans.push(mean);
      }
      featureSds.push(sd);
      allPresentValues = allPresentValues.concat(presentValues);

      const cv = mean !== null ? computeCv(sd, mean) : null;
      if (cv !== null) {
        cvs.push(cv);
        if (cv > cvThreshold) {
          featuresExceedingCvThreshold++;
        }
      }
    }

    const meanOfFeatureMeans = computeMean(featureMeans);
    const meanOfFeatureSds = computeMean(featureSds) ?? 0;
    const medianFeatureSd = computeMedian(featureSds);

    // Pooled SD: sqrt( sum((n_i-1)*sd_i^2) / sum(n_i-1) )
    // We recompute this directly from all present values for the group.
    const pooledSd = computeSampleSd(allPresentValues);

    const meanCv = computeMean(cvs);
    const medianCv = cvs.length > 0 ? computeMedian(cvs) : null;
    const maxCv = cvs.length > 0 ? Math.max(...cvs) : null;

    const evaluableFeatureCount = cvs.length;
    const unusualSpreadWarning =
      evaluableFeatureCount > 0 && featuresExceedingCvThreshold / evaluableFeatureCount > 0.25;

    const groupSummary: ReplicateConsistencyGroup = {
      doseGroupId: doseGroup.doseGroupId,
      doseValue: doseGroup.doseValue,
      featureCount: packet.features.length,
      totalReplicates,
      biologicalReplicates,
      technicalReplicates,
      pooledReplicates,
      pseudobulkReplicates,
      meanOfFeatureMeans,
      meanOfFeatureSds,
      medianFeatureSd,
      pooledSd,
      meanCv,
      medianCv,
      maxCv,
      cvThreshold,
      featuresExceedingCvThreshold,
      evaluableFeatureCount,
      unusualSpreadWarning,
    };

    groups.push(groupSummary);
  }

  const packetId = randomUUID();
  const consistencyPacket: ReplicateConsistencyPacket = ReplicateConsistencyPacketSchema.parse({
    schemaVersion: "0.1.0",
    schemaName: "ReplicateConsistencyPacket",
    packetId,
    sourcePacketRef: packet.packetId,
    groups,
    generatedAt: new Date().toISOString(),
  });

  return {
    packet: consistencyPacket,
    groupCount: groups.length,
    groupsWithWarning: groups.filter((g) => g.unusualSpreadWarning).length,
  };
}
