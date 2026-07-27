#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildBenchmarkPacket,
  executeBenchmarkStep,
  loadBenchmarkQualificationContext,
} from "../dist/benchmarks/runner.js";
import { loadBenchmarkManifest } from "../dist/benchmarks/manifest.js";

function parseArgs(argv) {
  let confirmed = false;
  let manifestPath = resolve("benchmark_manifest.yaml");
  let outputRoot;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--confirm") {
      confirmed = true;
    } else if (arg === "--manifest") {
      const value = argv[index + 1];
      if (!value) throw new Error("--manifest requires a file path");
      manifestPath = resolve(value);
      index++;
    } else if (arg === "--out-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error("--out-dir requires a directory path");
      outputRoot = resolve(value);
      index++;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!confirmed) {
    throw new Error(
      "Refusing to update golden outputs without --confirm; review scientific behavior before regeneration.",
    );
  }
  return { manifestPath, outputRoot };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function main() {
  const { manifestPath, outputRoot } = parseArgs(process.argv.slice(2));
  const manifest = loadBenchmarkManifest(manifestPath);
  let fileCount = 0;

  for (const benchmark of manifest.benchmarks) {
    const fixturePath = resolve(benchmark.fixture);
    const expectedPath = outputRoot
      ? join(outputRoot, benchmark.name)
      : resolve(benchmark.expected);
    const qualificationContext =
      benchmark.type === "feature"
        ? loadBenchmarkQualificationContext(fixturePath)
        : {};
    const needsPacket =
      benchmark.type === "feature" &&
      benchmark.steps.some((step) =>
        ["qualifyFeatures", "buildHandoffPacket", "buildPacket"].includes(
          step.tool,
        ),
      );
    const packet = needsPacket
      ? buildBenchmarkPacket(
          fixturePath,
          benchmark.name,
          manifest.normalization,
        )
      : undefined;

    for (const step of benchmark.steps) {
      const actual = executeBenchmarkStep(
        step,
        fixturePath,
        packet,
        manifest.normalization,
        qualificationContext,
      );
      writeJson(join(expectedPath, step.output), actual);
      fileCount++;
    }
  }

  console.log(`Wrote ${fileCount} reviewed manifest golden output file(s).`);
}

main();
