import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  BenchmarkManifest,
  Benchmark,
  BenchmarkStep,
} from "./manifest.js";
import { compareObjects, formatCompareResult, type CompareResult } from "./compare.js";
import { validateDesign } from "../validators/design.js";
import { profileQc } from "../qc/profiler.js";
import { profileMissingness } from "../qc/missingness.js";
import { qualifyFeatures } from "../qualification/engine.js";
import { buildHandoffPacket } from "../handoff/builder.js";
import { BioactivityPoDHandoffPacketSchema } from "../contracts/packets.js";
import type { EpigenomicFeature } from "../contracts/features.js";
import type { ExperimentalDesign } from "../contracts/design.js";
import {
  CellCompositionProfileSchema,
  ingestCellComposition,
} from "../qc/cell_composition.js";
import {
  CytotoxicityProfileSchema,
  ingestCytotoxicity,
} from "../qc/cytotoxicity.js";
import {
  qualificationContextFromProfiles,
  type QualificationContext,
} from "../qualification/context.js";

export interface StepResult {
  stepName: string;
  tool: string;
  outputFile: string;
  passed: boolean;
  compareResult: CompareResult;
  error?: string;
}

export interface BenchmarkResult {
  benchmarkName: string;
  passed: boolean;
  steps: StepResult[];
}

export interface RunnerResult {
  passed: boolean;
  benchmarks: BenchmarkResult[];
}

function loadJson(path: string): unknown {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as unknown;
}

export function buildBenchmarkPacket(
  fixturePath: string,
  fixtureName: string,
  normalization: BenchmarkManifest["normalization"],
): unknown {
  const featureTable = existsSync(join(fixturePath, "feature_table.json"))
    ? (loadJson(join(fixturePath, "feature_table.json")) as unknown[])
    : [];
  const design = loadJson(join(fixturePath, "design.json"));
  const metadata = existsSync(join(fixturePath, "metadata.json"))
    ? (loadJson(join(fixturePath, "metadata.json")) as Record<string, unknown>)
    : null;

  const datasetId =
    (metadata?.datasetId as string) ?? `${fixtureName}-ds-001`;
  const provenance =
    (metadata?.provenance as Record<string, unknown>) ?? {
      datasetId,
      upstreamSteps: [
        {
          stepName: "normalisation",
          toolName: "minfi",
          toolVersion: "1.44.0",
          parameters: {},
        },
      ],
    };
  const mappingPayloads = metadata?.mappingPayloads;

  return {
    schemaVersion: "0.1.0",
    schemaName: "EpigenomicsFeatureResponsePacket",
    packetId: normalization.deterministicPacketId,
    datasetMetadataRef: datasetId,
    designRef:
      (design as Record<string, unknown> | null)?.designId ??
      `${fixtureName}-design-001`,
    features: featureTable,
    design,
    provenance,
    qualificationSummary: {
      acceptedCount: featureTable.length,
      excludedCount: 0,
      exploratoryCount: 0,
      caveatCount: 0,
    },
    qcReportRef: "qc-report-001",
    warnings: [],
    generatedAt: normalization.deterministicTimestamp,
    ...(mappingPayloads ? { mappingPayloads } : {}),
  };
}

export function loadBenchmarkQualificationContext(
  fixturePath: string,
): QualificationContext {
  const metadataPath = join(fixturePath, "metadata.json");
  if (!existsSync(metadataPath)) {
    return {};
  }

  const metadata = loadJson(metadataPath) as Record<string, unknown>;
  const design = loadJson(join(fixturePath, "design.json")) as ExperimentalDesign;
  const datasetId =
    typeof metadata.datasetId === "string"
      ? metadata.datasetId
      : "benchmark-dataset";
  const hasCellComposition = Object.prototype.hasOwnProperty.call(
    metadata,
    "cellComposition",
  );
  const hasCytotoxicity = Object.prototype.hasOwnProperty.call(
    metadata,
    "cytotoxicity",
  );
  const cellCompositionProfile = hasCellComposition
    ? metadata.cellComposition === null
      ? ingestCellComposition(datasetId, [], design)
      : CellCompositionProfileSchema.parse(metadata.cellComposition)
    : undefined;
  const cytotoxicityProfile = hasCytotoxicity
    ? metadata.cytotoxicity === null
      ? ingestCytotoxicity(datasetId, [], design)
      : CytotoxicityProfileSchema.parse(metadata.cytotoxicity)
    : undefined;

  return qualificationContextFromProfiles({
    cellCompositionProfile,
    cytotoxicityProfile,
  });
}

/**
 * Run all benchmarks defined in the manifest and compare outputs against
 * golden expected files.
 */
export function runBenchmarks(manifest: BenchmarkManifest): RunnerResult {
  const benchmarkResults: BenchmarkResult[] = [];

  for (const benchmark of manifest.benchmarks) {
    const result = runBenchmark(benchmark, manifest);
    benchmarkResults.push(result);
  }

  const allPassed = benchmarkResults.every((b) => b.passed);
  return { passed: allPassed, benchmarks: benchmarkResults };
}

function runBenchmark(
  benchmark: Benchmark,
  manifest: BenchmarkManifest,
): BenchmarkResult {
  const fixturePath = join(process.cwd(), benchmark.fixture);
  const expectedPath = join(process.cwd(), benchmark.expected);
  const stepResults: StepResult[] = [];
  const qualificationContext =
    benchmark.type === "feature"
      ? loadBenchmarkQualificationContext(fixturePath)
      : {};

  // Pre-build packet for feature benchmarks when any step needs it
  let packet: unknown | undefined;
  if (benchmark.type === "feature") {
    const needsPacket = benchmark.steps.some(
      (s) =>
        s.tool === "qualifyFeatures" ||
        s.tool === "buildHandoffPacket" ||
        s.tool === "buildPacket",
    );
    if (needsPacket) {
      packet = buildBenchmarkPacket(
        fixturePath,
        benchmark.name,
        manifest.normalization,
      );
    }
  }

  for (const step of benchmark.steps) {
    let actual: unknown;
    let error: string | undefined;

    try {
      actual = executeBenchmarkStep(
        step,
        fixturePath,
        packet,
        manifest.normalization,
        qualificationContext,
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      stepResults.push({
        stepName: step.name,
        tool: step.tool,
        outputFile: step.output,
        passed: false,
        compareResult: { match: false, diffs: [] },
        error,
      });
      continue;
    }

    const expectedFilePath = join(expectedPath, step.output);
    let expected: unknown;
    try {
      expected = loadJson(expectedFilePath);
    } catch (err) {
      error = `Failed to load expected output ${expectedFilePath}: ${err instanceof Error ? err.message : String(err)}`;
      stepResults.push({
        stepName: step.name,
        tool: step.tool,
        outputFile: step.output,
        passed: false,
        compareResult: { match: false, diffs: [] },
        error,
      });
      continue;
    }

    const compareResult = compareObjects(expected, actual);
    stepResults.push({
      stepName: step.name,
      tool: step.tool,
      outputFile: step.output,
      passed: compareResult.match,
      compareResult,
    });
  }

  const allPassed = stepResults.every((s) => s.passed);
  return { benchmarkName: benchmark.name, passed: allPassed, steps: stepResults };
}

export function executeBenchmarkStep(
  step: BenchmarkStep,
  fixturePath: string,
  packet: unknown | undefined,
  normalization: BenchmarkManifest["normalization"],
  qualificationContext: QualificationContext,
): unknown {
  switch (step.tool) {
    case "validateDesign": {
      const design = loadJson(join(fixturePath, "design.json"));
      return validateDesign(design);
    }
    case "profileQc": {
      const featureTable = loadJson(
        join(fixturePath, "feature_table.json"),
      ) as EpigenomicFeature[];
      const design = loadJson(
        join(fixturePath, "design.json"),
      ) as ExperimentalDesign;
      const metadata = existsSync(join(fixturePath, "metadata.json"))
        ? (loadJson(join(fixturePath, "metadata.json")) as Record<string, unknown>)
        : null;
      const datasetId =
        (metadata?.datasetId as string) ?? `${step.name}-ds-001`;
      return profileQc(datasetId, featureTable, design);
    }
    case "profileMissingness": {
      const featureTable = loadJson(
        join(fixturePath, "feature_table.json"),
      ) as EpigenomicFeature[];
      const design = loadJson(
        join(fixturePath, "design.json"),
      ) as ExperimentalDesign;
      const metadata = existsSync(join(fixturePath, "metadata.json"))
        ? (loadJson(join(fixturePath, "metadata.json")) as Record<string, unknown>)
        : null;
      const datasetId =
        (metadata?.datasetId as string) ?? `${step.name}-ds-001`;
      return profileMissingness(datasetId, featureTable, design);
    }
    case "qualifyFeatures": {
      if (!packet) {
        throw new Error("Packet not built for qualifyFeatures step");
      }
      return qualifyFeatures(packet, qualificationContext);
    }
    case "buildHandoffPacket": {
      if (!packet) {
        throw new Error("Packet not built for buildHandoffPacket step");
      }
      return buildHandoffPacket(packet, {
        handoffId: normalization.deterministicHandoffId,
        generatedAt: normalization.deterministicTimestamp,
        qualificationContext,
      });
    }
    case "buildPacket": {
      if (!packet) {
        throw new Error("Packet not built for buildPacket step");
      }
      return packet;
    }
    case "validateHandoffSchema": {
      const handoff = loadJson(join(fixturePath, "handoff.json"));
      const parseResult = BioactivityPoDHandoffPacketSchema.safeParse(handoff);
      return {
        schemaValid: parseResult.success,
        errors: parseResult.success
          ? []
          : parseResult.error.issues.map(
              (i) => `${i.path.join(".")}: ${i.message}`,
            ),
      };
    }
    case "passthrough": {
      return loadJson(join(fixturePath, step.output));
    }
    default: {
      // Exhaustive check – TypeScript should flag missing cases at compile time
      const _exhaustive: never = step.tool;
      throw new Error(`Unknown tool: ${_exhaustive}`);
    }
  }
}

/**
 * Format runner results as an actionable human-readable report.
 */
export function formatRunnerReport(result: RunnerResult): string {
  const lines: string[] = [];
  lines.push("=== Benchmark Runner Report ===\n");

  for (const benchmark of result.benchmarks) {
    const status = benchmark.passed ? "PASS" : "FAIL";
    lines.push(`[${status}] ${benchmark.benchmarkName}`);

    for (const step of benchmark.steps) {
      const stepStatus = step.passed ? "PASS" : "FAIL";
      lines.push(`  [${stepStatus}] ${step.stepName} (${step.tool}) -> ${step.outputFile}`);
      if (step.error) {
        lines.push(`    ERROR: ${step.error}`);
      }
      if (!step.passed && !step.error && step.compareResult.diffs.length > 0) {
        lines.push(`    DIFF:\n${formatCompareResult(step.compareResult).split("\n").map((l) => "      " + l).join("\n")}`);
      }
    }
    lines.push("");
  }

  const overall = result.passed ? "PASSED" : "FAILED";
  lines.push(`=== Overall: ${overall} ===`);
  return lines.join("\n");
}
