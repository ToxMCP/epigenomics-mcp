#!/usr/bin/env node
/**
 * Validate benchmark handoff fixtures against the BioactivityPoDHandoffPacket
 * schema and semantic rules.
 *
 * Usage:
 *   node scripts/validate-handoffs.mjs
 *
 * Exit codes:
 *   0 – all fixtures matched expected policy
 *   1 – one or more fixtures did not match expected policy
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateHandoffPacket } from "../dist/validators/handoff.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(process.cwd(), "benchmarks", "fixtures", "synthetic");

const HANDOFF_FIXTURES = [
  "bm_handoff_schema_valid",
  "bm_handoff_schema_invalid",
];

function loadJson(path) {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw);
}

let failed = false;

console.log("=== Handoff Validation ===\n");

for (const fixtureName of HANDOFF_FIXTURES) {
  const fixturePath = join(FIXTURES_DIR, fixtureName);
  const handoffPath = join(fixturePath, "handoff.json");
  const policyPath = join(fixturePath, "expected_policy.json");

  if (!existsSync(handoffPath)) {
    console.error(`[FAIL] ${fixtureName}: handoff.json not found`);
    failed = true;
    continue;
  }

  if (!existsSync(policyPath)) {
    console.error(`[FAIL] ${fixtureName}: expected_policy.json not found`);
    failed = true;
    continue;
  }

  const handoff = loadJson(handoffPath);
  const policy = loadJson(policyPath);
  const result = validateHandoffPacket(handoff);

  const schemaMatches = result.schemaValid === policy.expectedSchemaValid;
  const handoffReadyMatches = result.valid === policy.expectedHandoffReady;
  const blocksDownstreamMatches =
    !result.valid === policy.expectedBlocksDownstream;

  const allMatch = schemaMatches && handoffReadyMatches && blocksDownstreamMatches;

  if (allMatch) {
    console.log(`[PASS] ${fixtureName}`);
    if (result.errors.length > 0) {
      console.log(`       Expected errors:`);
      for (const err of result.errors) {
        console.log(`       - ${err}`);
      }
    }
  } else {
    failed = true;
    console.log(`[FAIL] ${fixtureName}`);
    console.log(`       expectedSchemaValid=${policy.expectedSchemaValid}, actual=${result.schemaValid}`);
    console.log(`       expectedHandoffReady=${policy.expectedHandoffReady}, actual=${result.valid}`);
    console.log(`       expectedBlocksDownstream=${policy.expectedBlocksDownstream}, actual=${!result.valid}`);
    if (result.errorCode) {
      console.log(`       errorCode=${result.errorCode}`);
    }
    if (result.errors.length > 0) {
      console.log(`       errors:`);
      for (const err of result.errors) {
        console.log(`       - ${err}`);
      }
    }
    if (result.warnings.length > 0) {
      console.log(`       warnings:`);
      for (const warn of result.warnings) {
        console.log(`       - ${warn}`);
      }
    }
  }
  console.log();
}

if (failed) {
  console.error("=== Handoff validation FAILED ===");
  process.exit(1);
} else {
  console.log("=== Handoff validation PASSED ===");
  process.exit(0);
}
