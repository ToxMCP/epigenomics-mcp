#!/usr/bin/env node
/**
 * Generate deterministic golden expected outputs for all synthetic fixtures.
 *
 * Usage:
 *   node benchmarks/scripts/generate-golden.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { validateDesign } from "../../dist/validators/design.js";
import { profileQc } from "../../dist/qc/profiler.js";
import { profileMissingness } from "../../dist/qc/missingness.js";
import { qualifyFeatures } from "../../dist/qualification/engine.js";
import { buildHandoffPacket } from "../../dist/handoff/builder.js";
import { BioactivityPoDHandoffPacketSchema } from "../../dist/contracts/packets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_BASE = join(__dirname, "..", "fixtures", "synthetic");
const EXPECTED_BASE = join(__dirname, "..", "expected");

const DETERMINISTIC_PACKET_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const DETERMINISTIC_HANDOFF_ID = "b2c3d4e5-f6a7-8901-bcde-f23456789012";
const DETERMINISTIC_TIMESTAMP = "2026-05-05T00:00:00Z";

const FIXTURE_NAMES = [
  "bm_beta_manifest_complete",
  "bm_dmr_nearest_gene_only",
  "bm_build_missing",
  "bm_invalid_coordinate_format",
  "bm_missing_cell_context",
  "bm_missing_cytotoxicity_context",
  "bm_dominant_cytotoxicity",
  "bm_insufficient_replicates",
  "bm_high_missingness",
  "bm_summary_contrast_only",
  "bm_handoff_schema_valid",
  "bm_handoff_schema_invalid",
];

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function buildPacket(fixtureName, featureTable, design, metadata) {
  const datasetId = metadata?.datasetId ?? `${fixtureName}-ds-001`;
  const provenance = metadata?.provenance ?? {
    datasetId,
    upstreamSteps: [
      { stepName: "normalisation", toolName: "minfi", toolVersion: "1.44.0", parameters: {} },
    ],
  };

  const features = featureTable ?? [];

  return {
    schemaVersion: "0.1.0",
    schemaName: "EpigenomicsFeatureResponsePacket",
    packetId: DETERMINISTIC_PACKET_ID,
    datasetMetadataRef: datasetId,
    designRef: design?.designId ?? `${fixtureName}-design-001`,
    features,
    design,
    provenance,
    qualificationSummary: {
      acceptedCount: features.length,
      excludedCount: 0,
      exploratoryCount: 0,
      caveatCount: 0,
    },
    qcReportRef: "qc-report-001",
    warnings: [],
    generatedAt: DETERMINISTIC_TIMESTAMP,
  };
}

function runFeatureFixture(fixtureName) {
  const base = join(FIXTURE_BASE, fixtureName);
  const outDir = join(EXPECTED_BASE, fixtureName);
  mkdirSync(outDir, { recursive: true });

  const featureTable = loadJson(join(base, "feature_table.json"));
  const design = loadJson(join(base, "design.json"));
  const metadata = existsSync(join(base, "metadata.json"))
    ? loadJson(join(base, "metadata.json"))
    : null;

  const packet = buildPacket(fixtureName, featureTable, design, metadata);

  // 1. Design validation
  const designValidation = validateDesign(design);
  writeJson(join(outDir, "design_validation.json"), designValidation);

  // 2. QC profile
  const qcResult = profileQc(
    metadata?.datasetId ?? `${fixtureName}-ds-001`,
    featureTable,
    design,
  );
  writeJson(join(outDir, "qc_profile.json"), qcResult);

  // 3. Missingness profile
  const missingnessProfile = profileMissingness(
    metadata?.datasetId ?? `${fixtureName}-ds-001`,
    featureTable,
    design,
  );
  writeJson(join(outDir, "missingness_profile.json"), missingnessProfile);

  // 4. Qualification result
  const qualificationResult = qualifyFeatures(packet);
  writeJson(join(outDir, "qualification_result.json"), qualificationResult);

  // 5. Handoff result (deterministic)
  const handoffResult = buildHandoffPacket(packet, {
    handoffId: DETERMINISTIC_HANDOFF_ID,
    generatedAt: DETERMINISTIC_TIMESTAMP,
  });
  writeJson(join(outDir, "handoff_result.json"), handoffResult);

  // 6. Packet snapshot (for reference)
  writeJson(join(outDir, "packet.json"), packet);

  console.log(`  ${fixtureName}: wrote ${outDir}`);
}

function runHandoffFixture(fixtureName) {
  const base = join(FIXTURE_BASE, fixtureName);
  const outDir = join(EXPECTED_BASE, fixtureName);
  mkdirSync(outDir, { recursive: true });

  const handoff = loadJson(join(base, "handoff.json"));

  const parseResult = BioactivityPoDHandoffPacketSchema.safeParse(handoff);

  const handoffValidation = {
    schemaValid: parseResult.success,
    errors: parseResult.success
      ? []
      : parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };

  writeJson(join(outDir, "handoff_validation.json"), handoffValidation);
  writeJson(join(outDir, "handoff.json"), handoff);

  console.log(`  ${fixtureName}: wrote ${outDir}`);
}

function main() {
  console.log("Generating golden expected outputs...");
  mkdirSync(EXPECTED_BASE, { recursive: true });

  for (const name of FIXTURE_NAMES) {
    if (name.startsWith("bm_handoff_")) {
      runHandoffFixture(name);
    } else {
      runFeatureFixture(name);
    }
  }

  console.log("Done.");
}

main();
