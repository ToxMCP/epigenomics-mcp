#!/usr/bin/env node

/**
 * End-to-end performance gate for the real qualification engine.
 *
 * The timed region includes packet validation, missingness profiling,
 * fail-closed qualification, claim guards, and explainability generation.
 */

import { performance } from "node:perf_hooks";
import { qualifyFeatures } from "../dist/qualification/engine.js";

function integerArg(raw, fallback, name, minimum = 1) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return value;
}

function numberArg(raw, fallback, name) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function parseArgs(argv) {
  const values = new Map();
  let json = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    values.set(arg, value);
    index++;
  }

  return {
    features: integerArg(values.get("--features"), 10_000, "--features"),
    replicates: integerArg(values.get("--replicates"), 6, "--replicates", 4),
    maxSeconds: numberArg(values.get("--max-seconds"), 20, "--max-seconds"),
    maxRssMib: numberArg(values.get("--max-rss-mib"), 512, "--max-rss-mib"),
    json,
  };
}

function createPacket(featureCount, replicateCount) {
  const controlCount = Math.floor(replicateCount / 2);
  const samples = Array.from({ length: replicateCount }, (_, index) => {
    const control = index < controlCount;
    return {
      sampleId: `sample-${index + 1}`,
      doseGroupId: control ? "control" : "treated",
      species: "Homo sapiens",
      ...(control ? { controlFlag: true } : {}),
    };
  });

  const features = Array.from({ length: featureCount }, (_, featureIndex) => {
    const featureId = `cg${String(featureIndex).padStart(8, "0")}`;
    const values = Object.fromEntries(
      samples.map((sample, sampleIndex) => [
        sample.sampleId,
        featureIndex % 10 === 0 && sampleIndex < 2
          ? null
          : ((featureIndex + sampleIndex) % 100) / 100,
      ]),
    );
    return {
      featureId,
      featureClass: "cpg_methylation",
      modality: "dna_methylation_array",
      measuredIdentifier: featureId,
      signalMetric: "beta_value",
      values,
    };
  });

  return {
    schemaVersion: "0.1.0",
    schemaName: "EpigenomicsFeatureResponsePacket",
    packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    datasetMetadataRef: "performance-dataset",
    designRef: "performance-design",
    features,
    design: {
      designId: "performance-design",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "control", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "treated", doseValue: 1, doseUnit: "µM" },
      ],
      samples,
      hasControls: true,
      minReplicatesPerGroup: 2,
    },
    provenance: {
      datasetId: "performance-dataset",
      upstreamSteps: [
        {
          stepName: "normalization",
          toolName: "benchmark-fixture",
          toolVersion: "0.2.1",
          parameters: { generated: true },
        },
      ],
    },
    qualificationSummary: {
      acceptedCount: 0,
      excludedCount: 0,
      exploratoryCount: 0,
      caveatCount: 0,
    },
    qcReportRef: "performance-qc",
    warnings: [],
    generatedAt: "2026-07-27T00:00:00.000Z",
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const packet = createPacket(options.features, options.replicates);
  globalThis.gc?.();
  const rssBefore = process.memoryUsage().rss;
  const startedAt = performance.now();
  const result = qualifyFeatures(packet);
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const rssAfter = process.memoryUsage().rss;
  const rssIncreaseMib = Math.max(0, rssAfter - rssBefore) / (1024 * 1024);
  const expectedExcluded = Math.ceil(options.features / 10);
  const expectedQualified = options.features - expectedExcluded;

  const checks = {
    countsCorrect:
      result.qualifiedCount === expectedQualified &&
      result.excludedCount === expectedExcluded,
    withinTimeBudget: elapsedSeconds <= options.maxSeconds,
    withinMemoryBudget: rssIncreaseMib <= options.maxRssMib,
  };
  const passed = Object.values(checks).every(Boolean);
  const report = {
    passed,
    workload: {
      features: options.features,
      samples: options.replicates,
      responseValues: options.features * options.replicates,
    },
    result: {
      qualified: result.qualifiedCount,
      excluded: result.excludedCount,
    },
    performance: {
      elapsedSeconds,
      featuresPerSecond: options.features / elapsedSeconds,
      rssIncreaseMib,
    },
    budgets: {
      maxSeconds: options.maxSeconds,
      maxRssMib: options.maxRssMib,
    },
    checks,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    console.log(
      `Real qualification engine: ${options.features} features × ${options.replicates} samples`,
    );
    console.log(
      `Qualified/excluded: ${result.qualifiedCount}/${result.excludedCount}`,
    );
    console.log(`Elapsed: ${elapsedSeconds.toFixed(3)} s`);
    console.log(
      `Throughput: ${report.performance.featuresPerSecond.toFixed(0)} features/s`,
    );
    console.log(`RSS increase: ${rssIncreaseMib.toFixed(1)} MiB`);
    console.log(`Gate: ${passed ? "PASS" : "FAIL"}`);
  }

  if (!passed) {
    process.exitCode = 1;
  }
}

main();
