import { z } from "zod";

export const ReleaseEvidenceChecksumSchema = z
  .object({
    path: z.string().min(1),
    sha256: z.string().length(64),
    bytes: z.number().int().nonnegative(),
  })
  .strict();

export const ReleaseEvidenceSchema = z
  .object({
    schemaName: z.literal("EpigenomicsMcpReleaseEvidence"),
    schemaVersion: z.literal("0.1.0"),
    package: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
      })
      .strict(),
    config: z
      .object({
        schemaVersion: z.string().min(1),
        policyVersion: z.string().min(1),
      })
      .strict(),
    generatedAt: z.string().datetime(),
    command: z
      .object({
        name: z.string().min(1),
        startedAt: z.string().datetime(),
        finishedAt: z.string().datetime(),
      })
      .strict(),
    environment: z
      .object({
        nodeVersion: z.string().min(1),
        npmVersion: z.string().min(1),
        platform: z.string().min(1),
        arch: z.string().min(1),
      })
      .strict(),
    git: z
      .object({
        available: z.boolean(),
        commit: z.string().min(1).optional(),
        dirty: z.boolean().optional(),
      })
      .strict(),
    releaseGate: z
      .object({
        ready: z.boolean(),
        checks: z.array(
          z
            .object({
              name: z.string().min(1),
              passed: z.boolean(),
              details: z.string(),
            })
            .strict(),
        ),
        benchmarkSummary: z
          .object({
            totalBenchmarks: z.number().int().nonnegative(),
            passedBenchmarks: z.number().int().nonnegative(),
            failedBenchmarks: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    npmPackDryRun: z.array(z.record(z.string(), z.unknown())).min(1),
    artifactChecksums: z.array(ReleaseEvidenceChecksumSchema).min(1),
  })
  .strict();

export type ReleaseEvidenceChecksum = z.infer<
  typeof ReleaseEvidenceChecksumSchema
>;

export type ReleaseEvidence = z.infer<typeof ReleaseEvidenceSchema>;
