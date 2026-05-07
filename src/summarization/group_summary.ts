import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { EpigenomicsFeatureResponsePacket } from "../contracts/packets.js";

/**
 * Numeric summary for a single feature within a single dose group.
 *
 * Scientific assumptions visible in outputs:
 * - SD is 0 when n < 2 (undefined sample standard deviation for single
 *   observations is pragmatically pinned to zero for downstream handoff).
 * - mean is NaN when all values in the group are missing; downstream consumers
 *   must guard on missingFraction.
 */
export const FeatureGroupSummarySchema = z
  .object({
    featureId: z.string().min(1).describe("Stable feature identifier"),
    doseGroupId: z.string().min(1).describe("Dose group identifier"),
    doseValue: z.number().finite().describe("Numeric dose level"),
    mean: z.number().nullable().describe("Arithmetic mean of non-missing values; null when all values in group are missing"),
    sd: z.number().describe("Sample standard deviation (0 when n < 2)"),
    n: z.number().int().nonnegative().describe("Count of non-missing values"),
    missingCount: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of missing/null values in group"),
    missingFraction: z
      .number()
      .min(0)
      .max(1)
      .describe("Fraction of missing values in group"),
    sampleRefs: z
      .record(z.string().min(1), z.number().or(z.null()))
      .optional()
      .describe("Optional per-sample value references within the group"),
  })
  .strict();

export type FeatureGroupSummary = z.infer<typeof FeatureGroupSummarySchema>;

/**
 * Group-level summary packet emitted for downstream Bioactivity-PoD handoff.
 *
 * This is a deterministic descriptive-statistics packet.  No dose-response
 * modelling (PoD, BMD, etc.) is performed here.
 */
export const GroupSummaryPacketSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    schemaName: z.literal("GroupSummaryPacket"),
    packetId: z.string().uuid(),
    sourcePacketRef: z.string().min(1).describe("Source response packet ID"),
    summaries: z.array(FeatureGroupSummarySchema).min(1),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type GroupSummaryPacket = z.infer<typeof GroupSummaryPacketSchema>;

export interface SummarizeByGroupResult {
  packet: GroupSummaryPacket;
  featureCount: number;
  groupCount: number;
  totalSummaries: number;
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
  const mean = computeMean(values);
  // values.length >= 2 guarantees mean is non-null
  const meanValue = mean as number;
  let sqDiffSum = 0;
  for (const v of values) {
    const diff = v - meanValue;
    sqDiffSum += diff * diff;
  }
  return Math.sqrt(sqDiffSum / (values.length - 1));
}

function isMissing(value: number | null | undefined): boolean {
  return value === null || value === undefined || Number.isNaN(value);
}

/**
 * Summarize epigenomic feature responses by dose group.
 *
 * For every feature and every dose group defined in the experimental design,
 * computes mean, SD, n, missingness, and optionally preserves sample-level
 * references.  Fail-closed: features or groups with 100% missingness emit
 * NaN mean and zero SD so that downstream consumers can detect them via
 * missingFraction.
 *
 * No dose-response modelling (PoD, BMD, trend tests, etc.) is performed.
 */
export function summarizeByGroup(
  packet: EpigenomicsFeatureResponsePacket,
  opts?: { includeSampleRefs?: boolean },
): SummarizeByGroupResult {
  const includeSampleRefs = opts?.includeSampleRefs ?? true;
  const summaries: FeatureGroupSummary[] = [];

  const groupCount = packet.design.doseGroups.length;

  for (const feature of packet.features) {
    const groupSamples = new Map<string, string[]>();
    for (const sample of packet.design.samples) {
      const list = groupSamples.get(sample.doseGroupId) ?? [];
      list.push(sample.sampleId);
      groupSamples.set(sample.doseGroupId, list);
    }

    for (const doseGroup of packet.design.doseGroups) {
      const sampleIds = groupSamples.get(doseGroup.doseGroupId) ?? [];
      const presentValues: number[] = [];
      let missingCount = 0;
      const sampleRefs: Record<string, number | null> = {};

      for (const sampleId of sampleIds) {
        const raw = feature.values[sampleId];
        if (isMissing(raw)) {
          missingCount++;
          if (includeSampleRefs) {
            sampleRefs[sampleId] = null;
          }
        } else {
          presentValues.push(raw as number);
          if (includeSampleRefs) {
            sampleRefs[sampleId] = raw as number;
          }
        }
      }

      const totalInGroup = sampleIds.length;
      const missingFraction = totalInGroup === 0 ? 0 : missingCount / totalInGroup;
      const mean = computeMean(presentValues);
      const sd = computeSampleSd(presentValues);

      const summary: FeatureGroupSummary = {
        featureId: feature.featureId,
        doseGroupId: doseGroup.doseGroupId,
        doseValue: doseGroup.doseValue,
        mean,
        sd,
        n: presentValues.length,
        missingCount,
        missingFraction,
        ...(includeSampleRefs && totalInGroup > 0 ? { sampleRefs } : {}),
      };

      summaries.push(summary);
    }
  }

  const packetId = randomUUID();
  const groupPacket: GroupSummaryPacket = GroupSummaryPacketSchema.parse({
    schemaVersion: "0.1.0",
    schemaName: "GroupSummaryPacket",
    packetId,
    sourcePacketRef: packet.packetId,
    summaries,
    generatedAt: new Date().toISOString(),
  });

  return {
    packet: groupPacket,
    featureCount: packet.features.length,
    groupCount,
    totalSummaries: summaries.length,
  };
}
