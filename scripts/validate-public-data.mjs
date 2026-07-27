#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DEFAULT_MANIFEST = "benchmarks/public_validation/manifest.json";
const DEFAULT_CACHE = "benchmark-cache/public-data";
const DEFAULT_OUTPUT = "benchmark-results/public-data";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function validateManifest(manifest) {
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    !Array.isArray(manifest.datasets) ||
    manifest.datasets.length === 0
  ) {
    throw new Error("Public-data manifest must declare at least one dataset");
  }
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("Public-data manifest version is required");
  }
  const datasetIds = new Set();
  for (const dataset of manifest.datasets) {
    if (
      dataset === null ||
      typeof dataset !== "object" ||
      typeof dataset.datasetId !== "string" ||
      dataset.datasetId.length === 0
    ) {
      throw new Error("Every public-data case requires a datasetId");
    }
    if (datasetIds.has(dataset.datasetId)) {
      throw new Error(`Duplicate public-data datasetId: ${dataset.datasetId}`);
    }
    datasetIds.add(dataset.datasetId);

    const source = dataset.source;
    if (source === null || typeof source !== "object") {
      throw new Error(`${dataset.datasetId}: source metadata is required`);
    }
    if (
      typeof source.fileName !== "string" ||
      source.fileName.length === 0 ||
      basename(source.fileName) !== source.fileName
    ) {
      throw new Error(
        `${dataset.datasetId}: source fileName must be a plain file name`,
      );
    }
    if (!Number.isSafeInteger(source.fileBytes) || source.fileBytes <= 0) {
      throw new Error(
        `${dataset.datasetId}: source fileBytes must be a positive safe integer`,
      );
    }
    for (const field of [
      "sourceChecksumSha256",
      "contentChecksumSha256",
    ]) {
      if (
        typeof source[field] !== "string" ||
        !SHA256_PATTERN.test(source[field])
      ) {
        throw new Error(`${dataset.datasetId}: source ${field} is invalid`);
      }
    }
    for (const field of ["recordUrl", "downloadUrl"]) {
      if (
        typeof source[field] !== "string" ||
        new URL(source[field]).protocol !== "https:"
      ) {
        throw new Error(`${dataset.datasetId}: source ${field} must use HTTPS`);
      }
    }
    if (
      typeof dataset.designPath !== "string" ||
      typeof dataset.provenancePath !== "string" ||
      dataset.mcpArguments === null ||
      typeof dataset.mcpArguments !== "object" ||
      dataset.expectedOutput === null ||
      typeof dataset.expectedOutput !== "object"
    ) {
      throw new Error(`${dataset.datasetId}: MCP evidence paths and expectations are required`);
    }
  }
  return manifest;
}

function parseArguments(argv) {
  const options = {
    manifestPath: resolve(DEFAULT_MANIFEST),
    cacheDirectory: resolve(
      process.env.EPIMCP_PUBLIC_DATA_CACHE ?? DEFAULT_CACHE,
    ),
    outputDirectory: resolve(DEFAULT_OUTPUT),
    offline: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--manifest") {
      options.manifestPath = resolve(argv[++index]);
    } else if (argument === "--cache-dir") {
      options.cacheDirectory = resolve(argv[++index]);
    } else if (argument === "--out-dir") {
      options.outputDirectory = resolve(argv[++index]);
    } else if (argument === "--offline") {
      options.offline = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function validateCachedSource(path, source) {
  if (!existsSync(path)) return false;
  if (statSync(path).size !== source.fileBytes) return false;
  return (await sha256File(path)) === source.sourceChecksumSha256;
}

async function ensureSource(source, cacheDirectory, offline) {
  const path = join(cacheDirectory, source.fileName);
  if (await validateCachedSource(path, source)) return path;
  if (existsSync(path)) {
    throw new Error(
      `Cached source failed size or checksum validation: ${path}`,
    );
  }
  if (offline) {
    throw new Error(`Offline source is not available in cache: ${path}`);
  }

  console.log(`Downloading ${source.accession} from ${source.archive}...`);
  const response = await fetch(source.downloadUrl, {
    headers: { "user-agent": "epigenomics-mcp-public-validation/0.1" },
    redirect: "follow",
    signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok || response.body === null) {
    throw new Error(
      `Download failed for ${source.accession}: HTTP ${response.status}`,
    );
  }
  const temporaryPath = `${path}.part`;
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(temporaryPath, { flags: "w" }),
  );
  if (!(await validateCachedSource(temporaryPath, source))) {
    throw new Error(
      `Downloaded source failed size or checksum validation: ${source.accession}`,
    );
  }
  renameSync(temporaryPath, path);
  return path;
}

function compareExpected(actual, expected) {
  const differences = [];
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[field];
    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      differences.push({
        field,
        expected: expectedValue,
        actual: actualValue,
      });
    }
  }
  return differences;
}

function formatMarkdown(report) {
  const lines = [
    "# Public-data validation report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Manifest: ${report.manifestVersion}`,
    `- Overall: **${report.passed ? "PASS" : "FAIL"}**`,
    "",
    "| Dataset | Source | Features | Data | Ingest | Comparison | Dose-response | Overall |",
    "|---|---|---:|---|---|---|---|---|",
  ];
  for (const dataset of report.datasets) {
    lines.push(
      `| ${dataset.datasetId} | ${dataset.sourceAccession} | ${dataset.actual.featureCount ?? 0} | ${dataset.actual.dataValid ? "PASS" : "FAIL"} | ${dataset.actual.ingested ? "PASS" : "FAIL"} | ${dataset.actual.comparisonReady ? "READY" : "NOT READY"} | ${dataset.actual.doseResponseReady ? "READY" : "NOT READY"} | ${dataset.passed ? "PASS" : "FAIL"} |`,
    );
  }
  lines.push("", "## Review boundary", "");
  lines.push(
    "These checks establish source identity, complete-file structural ingestion, and explicit comparison/dose-response readiness classification. They do not establish differential-methylation truth, a fitted dose-response relationship, causal interpretation, endpoint-specific statistical power, regulatory validity, or external expert sign-off.",
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = validateManifest(
    JSON.parse(readFileSync(options.manifestPath, "utf-8")),
  );
  mkdirSync(options.cacheDirectory, { recursive: true });
  mkdirSync(options.outputDirectory, { recursive: true });

  const resolvedDatasets = [];
  for (const dataset of manifest.datasets) {
    const featuresPath = await ensureSource(
      dataset.source,
      options.cacheDirectory,
      options.offline,
    );
    resolvedDatasets.push({ ...dataset, featuresPath });
  }

  const maximumSourceBytes = Math.max(
    ...resolvedDatasets.map((dataset) => dataset.source.fileBytes),
  );
  const serverPath = resolve("dist/epimcp/cli.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath, "serve"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      EPIMCP_ALLOWED_FILE_ROOTS: [
        options.cacheDirectory,
        process.cwd(),
      ].join(","),
      EPIMCP_MAX_FILE_BYTES: String(maximumSourceBytes),
      EPIMCP_MAX_ROW_LIMIT: "5000",
    },
    stderr: "pipe",
  });
  const client = new Client({
    name: "epimcp-public-data-validation",
    version: manifest.version,
  });

  const datasetReports = [];
  try {
    await client.connect(transport);
    for (const dataset of resolvedDatasets) {
      console.log(`Validating ${dataset.label}...`);
      const response = await client.callTool({
        name: "ingest_dataset",
        arguments: {
          datasetId: dataset.datasetId,
          ...dataset.mcpArguments,
          featuresPath: dataset.featuresPath,
          designPath: resolve(dataset.designPath),
          provenancePath: resolve(dataset.provenancePath),
          executionMode: "streaming",
        },
      });
      if (response.isError === true) {
        throw new Error(
          `${dataset.datasetId}: MCP tool error: ${response.content[0]?.text ?? "unknown error"}`,
        );
      }
      const actual = response.structuredContent ?? {};
      const differences = compareExpected(actual, dataset.expectedOutput);
      for (const prefix of dataset.expectedErrorPrefixes ?? []) {
        if (
          !Array.isArray(actual.errors) ||
          !actual.errors.some(
            (error) => typeof error === "string" && error.startsWith(prefix),
          )
        ) {
          differences.push({
            field: "errors",
            expected: `an error beginning with ${prefix}`,
            actual: actual.errors,
          });
        }
      }
      for (const prefix of dataset.expectedWarningPrefixes ?? []) {
        if (
          !Array.isArray(actual.warnings) ||
          !actual.warnings.some(
            (warning) =>
              typeof warning === "string" && warning.startsWith(prefix),
          )
        ) {
          differences.push({
            field: "warnings",
            expected: `a warning beginning with ${prefix}`,
            actual: actual.warnings,
          });
        }
      }
      datasetReports.push({
        datasetId: dataset.datasetId,
        label: dataset.label,
        sourceAccession: dataset.source.accession,
        reviewStatus: dataset.review.status,
        passed: differences.length === 0,
        differences,
        actual,
      });
    }
  } finally {
    await client.close().catch(() => undefined);
  }

  const report = {
    schemaVersion: "0.2.0",
    generatedAt: new Date().toISOString(),
    manifestVersion: manifest.version,
    reviewStatus: manifest.reviewStatus,
    passed: datasetReports.every((dataset) => dataset.passed),
    datasets: datasetReports,
  };
  writeFileSync(
    join(options.outputDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf-8",
  );
  writeFileSync(
    join(options.outputDirectory, "report.md"),
    formatMarkdown(report),
    "utf-8",
  );
  console.log(formatMarkdown(report));
  if (!report.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
