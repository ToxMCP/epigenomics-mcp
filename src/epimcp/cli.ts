#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { loadConfig, type Config } from "./config.js";
import { startServer } from "./server.js";
import { VERSION } from "./version.js";
import { validateDesign } from "../validators/design.js";
import { qualifyFeatures } from "../qualification/engine.js";
import { buildHandoffPacket, createHandoffPacket } from "../handoff/builder.js";
import { validateHandoffPacket, validateHandoffWithSource } from "../validators/handoff.js";
import { exportAllSchemas, archiveAllSchemas, getDefaultOutputDir } from "../scripts/export-schemas.js";
import { validateCoordinateSystemDeclarations } from "../validators/coordinate_validator.js";
import { profileMissingness, DEFAULT_MISSINGNESS_POLICY, type MissingnessPolicy } from "../qc/missingness.js";
import { profileVariance, DEFAULT_VARIANCE_POLICY, type VariancePolicy } from "../qc/variance.js";
import { ingestCellComposition, classifyCellCompositionConfounding, type SampleCellComposition } from "../qc/cell_composition.js";
import { ingestCytotoxicity, classifyCytotoxicityConfounding, type CytotoxicityContextEntry } from "../qc/cytotoxicity.js";
import { classifyRegionFeatureClass } from "../ingestion/region_feature_classifier.js";
import { mapRegionToNearestGene } from "../mapping/region_to_gene.js";
import { mapEpigenomicFeaturesToPathways } from "../mapping/pathway.js";
import { generateQcReport } from "../reports/qc_report.js";
import { readTableFile } from "../ingestion/csv_reader.js";
import { readDesignTable } from "../ingestion/design_reader.js";
import { canonicalizeFeatureTable } from "../ingestion/feature_table.js";
import { ExperimentalDesignSchema } from "../contracts/design.js";
import { QcProfileSchema } from "../contracts/qc.js";

// ---------------------------------------------------------------------------
// CLI option schema
// ---------------------------------------------------------------------------

const CliOptionsSchema = z.object({
  config: z.string().optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
  help: z.boolean().default(false),
  version: z.boolean().default(false),
  archive: z.boolean().default(false),
  json: z.boolean().default(false),
  report: z.string().optional(),
  policy: z.string().optional(),
  "dry-run": z.boolean().default(false),
  dryRun: z.boolean().default(false),
});

type CliOptions = z.infer<typeof CliOptionsSchema>;

interface ParsedCli {
  command: string | null;
  options: CliOptions;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedCli {
  const options: Record<string, unknown> = { help: false, version: false, json: false, archive: false, "dry-run": false, dryRun: false };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      const value = eq >= 0 ? arg.slice(eq + 1) : argv[++i];
      if (key === "help") {
        options.help = value === "true" || value === undefined;
      } else if (key === "version") {
        options.version = value === "true" || value === undefined;
      } else if (key === "archive") {
        options.archive = value === "true" || value === undefined;
      } else if (key === "json") {
        options.json = value === "true" || value === undefined;
      } else if (key === "dry-run") {
        options["dry-run"] = value === "true" || value === undefined;
      } else {
        options[key] = value;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      const value = argv[++i];
      options[key] = value;
    } else {
      positional.push(arg);
    }
  }

  const parsed = CliOptionsSchema.parse(options);
  const command = positional[0] ?? null;

  return { command, options: parsed, positional };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonFile<T>(path: string): T {
  const content = readFileSync(resolve(path), "utf-8");
  return JSON.parse(content) as T;
}

function writeJsonFile(path: string, data: unknown): void {
  writeFileSync(resolve(path), JSON.stringify(data, null, 2), "utf-8");
}

function isDryRun(options: CliOptions): boolean {
  return options["dry-run"] || options.dryRun;
}

function outputResult(result: unknown, options: CliOptions, exitCode: number = 0): void {
  const text = JSON.stringify(result, null, 2);
  if (options.report) {
    writeJsonFile(options.report, result);
    console.log(`Report written to ${options.report}`);
  }
  console.log(text);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

function requireArg(positional: string[], index: number, name: string): string {
  const value = positional[index];
  if (!value) {
    console.error(`Error: ${name} required`);
    process.exit(1);
  }
  return value;
}

function loadPolicy<T>(path: string | undefined, defaultPolicy: T): T {
  if (!path) return defaultPolicy;
  try {
    return readJsonFile<T>(path);
  } catch {
    console.error(`Error: unable to read policy file ${path}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
epimcp – Epigenomics MCP CLI

USAGE:
  epimcp [COMMAND] [OPTIONS]

COMMANDS:
  serve                     Start the MCP stdio server
  ingest-features <path>    Ingest a processed feature table file
  ingest-design <path>      Read a design table file
  validate-design <path>    Validate an experimental design file
  validate-coordinates <path>  Validate coordinate system declarations
  classify-features <path>  Classify region features from a table
  qc-missingness <features> <design>  Compute missingness profile
  qc-variance <features> <design>     Compute variance profile
  map-regions <path>        Map regions to nearest gene
  map-pathways <features> <mappings>  Map features to pathway roll-up eligibility
  assess-cell-context <path>   Assess cell-composition confounding
  assess-cytotox <path>     Assess cytotoxicity confounding
  qualify <path>            Qualify features from a response packet
  build-packet <path>       Build a Bioactivity-PoD handoff packet
  export-pod <path>         Export full Bioactivity-PoD handoff packet JSON
  qc-report <path>          Generate a regulator-readable QC report
  validate-handoff <path>   Validate a handoff packet
  export-schemas            Export JSON schemas to disk

OPTIONS:
  -h, --help                Show this help message
  -v, --version             Show version
  --config <path>           Path to configuration file
  --logLevel <level>        debug | info | warn | error
  --json                    Force JSON output
  --report <path>           Write output report to file
  --policy <path>           Path to policy JSON file
  --dry-run                 Run without side effects where supported

EXAMPLES:
  epimcp --help
  epimcp serve
  epimcp validate-design design.json
  epimcp qualify packet.json --json
  epimcp export-schemas --archive
`);
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function cmdServe(config: Config): Promise<void> {
  await startServer(config);
}

async function cmdIngestFeatures(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const filePath = requireArg(positional, 1, "features file path");
  if (isDryRun(options)) {
    outputResult({ dryRun: true, filePath, action: "would ingest feature table" }, options);
    return;
  }

  const tableResult = readTableFile(filePath);
  if (!tableResult.success) {
    outputResult({ success: false, errors: tableResult.errors }, options, 1);
    return;
  }

  // Default to generic ingestion; caller can override via --config or future flags
  const result = canonicalizeFeatureTable(filePath, {
    tableId: `cli-${Date.now()}`,
    featureClass: "generic_region_feature",
    modality: "dna_methylation_array",
    signalMetric: "beta_value",
  });

  outputResult(result, options, result.success ? 0 : 1);
}

async function cmdIngestDesign(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const filePath = requireArg(positional, 1, "design file path");
  if (isDryRun(options)) {
    outputResult({ dryRun: true, filePath, action: "would ingest design table" }, options);
    return;
  }

  const result = readDesignTable(filePath, {
    designId: `cli-design-${Date.now()}`,
    species: "Homo sapiens",
  });

  outputResult(result, options, result.success ? 0 : 1);
}

async function cmdValidateDesign(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const designPath = requireArg(positional, 1, "design file path");
  const design = readJsonFile<unknown>(designPath);
  const result = validateDesign(design);
  outputResult(result, options, result.valid ? 0 : 1);
}

async function cmdValidateCoordinates(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const path = requireArg(positional, 1, "declarations file path");
  const declarations = readJsonFile<unknown[]>(path);
  const result = validateCoordinateSystemDeclarations(declarations);
  outputResult(result, options, result.valid ? 0 : 1);
}

async function cmdClassifyFeatures(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const path = requireArg(positional, 1, "features file path");
  const tableResult = readTableFile(path);
  if (!tableResult.success) {
    outputResult({ success: false, errors: tableResult.errors }, options, 1);
    return;
  }

  const headers = tableResult.headers;
  const result = classifyRegionFeatureClass({
    assayFamily: "epigenomic",
    modality: "dna_methylation_array",
    headers,
    detectedShape: "wide",
    featureValueSemantics: "beta_value",
  });

  outputResult(result, options, result.errors.length > 0 ? 1 : 0);
}

async function cmdQcMissingness(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const featuresPath = requireArg(positional, 1, "features file path");
  const designPath = requireArg(positional, 2, "design file path");

  const features = readJsonFile<Parameters<typeof profileMissingness>[1]>(featuresPath);
  const design = ExperimentalDesignSchema.parse(readJsonFile<unknown>(designPath));
  const policy = loadPolicy<MissingnessPolicy>(options.policy, DEFAULT_MISSINGNESS_POLICY);

  const result = profileMissingness(design.designId, features, design, policy);
  const exitCode = result.summaryBand === "exclusion" ? 1 : 0;
  outputResult(result, options, exitCode);
}

async function cmdQcVariance(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const featuresPath = requireArg(positional, 1, "features file path");
  const designPath = requireArg(positional, 2, "design file path");

  const features = readJsonFile<Parameters<typeof profileVariance>[1]>(featuresPath);
  const design = ExperimentalDesignSchema.parse(readJsonFile<unknown>(designPath));
  const policy = loadPolicy<VariancePolicy>(options.policy, DEFAULT_VARIANCE_POLICY);

  const result = profileVariance(design.designId, features, design, policy);
  const exitCode = result.summaryBand === "exclusion" ? 1 : 0;
  outputResult(result, options, exitCode);
}

async function cmdMapRegions(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const path = requireArg(positional, 1, "regions file path");
  const { featureId, chrom, start, end, snapshot } = readJsonFile<{
    featureId: string;
    chrom: string;
    start: number;
    end: number;
    snapshot: Parameters<typeof mapRegionToNearestGene>[4];
  }>(path);

  const result = mapRegionToNearestGene(featureId, chrom, start, end, snapshot);
  outputResult(result, options);
}

async function cmdMapPathways(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const featuresPath = requireArg(positional, 1, "features file path");
  const mappingsPath = requireArg(positional, 2, "mappings file path");

  const features = readJsonFile<Parameters<typeof mapEpigenomicFeaturesToPathways>[0]>(featuresPath);
  const mappings = readJsonFile<Parameters<typeof mapEpigenomicFeaturesToPathways>[1]>(mappingsPath);

  const result = mapEpigenomicFeaturesToPathways(features, mappings);
  outputResult(result, options);
}

async function cmdAssessCellContext(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const path = requireArg(positional, 1, "cell composition file path");
  const { samples, design } = readJsonFile<{
    samples: SampleCellComposition[];
    design?: unknown;
  }>(path);

  const designParsed = design ? ExperimentalDesignSchema.parse(design) : undefined;
  const profile = ingestCellComposition(`cli-${Date.now()}`, samples, designParsed);
  const result = classifyCellCompositionConfounding(profile);

  outputResult(result, options, result.blocksDownstream ? 1 : 0);
}

async function cmdAssessCytotox(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const path = requireArg(positional, 1, "cytotoxicity file path");
  const { entries, design } = readJsonFile<{
    entries: CytotoxicityContextEntry[];
    design?: unknown;
  }>(path);

  const designParsed = design ? ExperimentalDesignSchema.parse(design) : undefined;
  const profile = ingestCytotoxicity(`cli-${Date.now()}`, entries, designParsed);
  const result = classifyCytotoxicityConfounding(profile);

  outputResult(result, options, result.blocksDownstream ? 1 : 0);
}

async function cmdQualify(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const packetPath = requireArg(positional, 1, "packet file path");
  const packet = readJsonFile<unknown>(packetPath);
  const result = qualifyFeatures(packet);

  const hasBlocking = result.warnings.some((w) => w.blocksDownstream);
  const exitCode = hasBlocking ? 1 : 0;
  outputResult(result, options, exitCode);
}

async function cmdBuildPacket(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const packetPath = requireArg(positional, 1, "packet file path");
  const packet = readJsonFile<unknown>(packetPath);

  if (isDryRun(options)) {
    const summary = buildHandoffPacket(packet);
    outputResult({ dryRun: true, ...summary }, options);
    return;
  }

  const result = buildHandoffPacket(packet);
  outputResult(result, options, result.readyForPod ? 0 : 1);
}

async function cmdExportPod(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const packetPath = requireArg(positional, 1, "packet file path");
  const packet = readJsonFile<unknown>(packetPath);

  if (isDryRun(options)) {
    outputResult({ dryRun: true, action: "would export full handoff packet" }, options);
    return;
  }

  const handoff = createHandoffPacket(packet);
  if (!handoff) {
    outputResult({ error: "Handoff packet creation failed" }, options, 1);
    return;
  }
  outputResult(handoff, options);
}

async function cmdQcReport(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const profilePath = requireArg(positional, 1, "profile file path");
  const profile = QcProfileSchema.parse(readJsonFile<unknown>(profilePath));
  const warnings: Parameters<typeof generateQcReport>[2] = [];

  const result = generateQcReport(profile.datasetId, profile, warnings);
  outputResult(result, options);
}

async function cmdValidateHandoff(
  _config: Config,
  positional: string[],
  options: CliOptions,
): Promise<void> {
  const handoffPath = requireArg(positional, 1, "handoff file path");
  const handoff = readJsonFile<unknown>(handoffPath);
  const sourcePath = positional[2];

  const result = sourcePath
    ? validateHandoffWithSource(handoff, readJsonFile<unknown>(sourcePath))
    : validateHandoffPacket(handoff);

  outputResult(result, options, result.valid ? 0 : 1);
}

async function cmdExportSchemas(options: CliOptions): Promise<void> {
  const outputDir = getDefaultOutputDir();
  exportAllSchemas(outputDir);
  console.log(`Schemas exported to ${outputDir}`);

  if (options.archive) {
    archiveAllSchemas(VERSION, outputDir);
    console.log(`Schemas archived to schemas/archive/${VERSION}`);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { command, options, positional } = parseArgs(process.argv.slice(2));

  if (options.version) {
    console.log(VERSION);
    process.exit(0);
  }

  if (options.help || (!command && !options.version)) {
    printHelp();
    process.exit(0);
  }

  const config = loadConfig(
    options.config
      ? { filePath: options.config }
      : undefined,
  );

  switch (command) {
    case "serve":
      await cmdServe(config);
      break;
    case "ingest-features":
      await cmdIngestFeatures(config, positional, options);
      break;
    case "ingest-design":
      await cmdIngestDesign(config, positional, options);
      break;
    case "validate-design":
    case "validate":
      await cmdValidateDesign(config, positional, options);
      break;
    case "validate-coordinates":
      await cmdValidateCoordinates(config, positional, options);
      break;
    case "classify-features":
      await cmdClassifyFeatures(config, positional, options);
      break;
    case "qc-missingness":
      await cmdQcMissingness(config, positional, options);
      break;
    case "qc-variance":
      await cmdQcVariance(config, positional, options);
      break;
    case "map-regions":
      await cmdMapRegions(config, positional, options);
      break;
    case "map-pathways":
      await cmdMapPathways(config, positional, options);
      break;
    case "assess-cell-context":
      await cmdAssessCellContext(config, positional, options);
      break;
    case "assess-cytotox":
      await cmdAssessCytotox(config, positional, options);
      break;
    case "qualify":
      await cmdQualify(config, positional, options);
      break;
    case "build-packet":
    case "handoff":
      await cmdBuildPacket(config, positional, options);
      break;
    case "export-pod":
      await cmdExportPod(config, positional, options);
      break;
    case "qc-report":
      await cmdQcReport(config, positional, options);
      break;
    case "validate-handoff":
      await cmdValidateHandoff(config, positional, options);
      break;
    case "export-schemas":
      await cmdExportSchemas(options);
      break;
    default:
      console.log(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
