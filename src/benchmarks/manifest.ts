import { readFileSync } from "node:fs";
import { z } from "zod";
import yaml from "js-yaml";

export const BenchmarkStepSchema = z.object({
  name: z.string(),
  tool: z.enum([
    "validateDesign",
    "profileQc",
    "profileMissingness",
    "qualifyFeatures",
    "buildHandoffPacket",
    "buildPacket",
    "validateHandoffSchema",
    "passthrough",
  ]),
  output: z.string(),
});

export const BenchmarkSchema = z.object({
  name: z.string(),
  type: z.enum(["feature", "handoff"]),
  fixture: z.string(),
  expected: z.string(),
  steps: z.array(BenchmarkStepSchema),
  fixtureType: z.enum(["synthetic", "public"]).default("synthetic"),
});

export const BenchmarkManifestSchema = z.object({
  version: z.string(),
  description: z.string(),
  normalization: z.object({
    deterministicPacketId: z.string(),
    deterministicHandoffId: z.string(),
    deterministicTimestamp: z.string(),
  }),
  benchmarks: z.array(BenchmarkSchema),
});

export type BenchmarkManifest = z.infer<typeof BenchmarkManifestSchema>;
export type Benchmark = z.infer<typeof BenchmarkSchema>;
export type BenchmarkStep = z.infer<typeof BenchmarkStepSchema>;

/**
 * Load and validate a benchmark manifest from a YAML file path.
 */
export function loadBenchmarkManifest(path: string): BenchmarkManifest {
  const raw = readFileSync(path, "utf-8");
  const parsed = yaml.load(raw);
  return BenchmarkManifestSchema.parse(parsed);
}
