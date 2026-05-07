import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * All synthetic benchmark fixture names.
 */
export const SYNTHETIC_FIXTURE_NAMES = [
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
] as const;

export type SyntheticFixtureName = (typeof SYNTHETIC_FIXTURE_NAMES)[number];

/**
 * Expected policy outcome for a synthetic fixture.
 */
export interface ExpectedPolicy {
  fixtureName: string;
  description: string;
  expectedSchemaValid: boolean;
  expectedQualificationStatus?: string;
  expectedWarnings?: string[];
  expectedBlocksDownstream: boolean;
  expectedHandoffReady: boolean;
  note?: string;
}

/**
 * Synthetic fixture descriptor.
 */
export interface SyntheticFixture {
  name: SyntheticFixtureName;
  featureTable: unknown[] | null;
  design: unknown | null;
  metadata: unknown | null;
  handoff: unknown | null;
  expectedPolicy: ExpectedPolicy;
  readme: string;
}

function loadJsonSafe(path: string): unknown | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as unknown;
}

function loadTextSafe(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

/**
 * Load a single synthetic fixture by name.
 */
export function loadSyntheticFixture(name: SyntheticFixtureName): SyntheticFixture {
  const base = join(__dirname, name);

  const featureTable = loadJsonSafe(join(base, "feature_table.json")) as unknown[] | null;
  const design = loadJsonSafe(join(base, "design.json"));
  const metadata = loadJsonSafe(join(base, "metadata.json"));
  const handoff = loadJsonSafe(join(base, "handoff.json"));
  const expectedPolicy = loadJsonSafe(join(base, "expected_policy.json")) as ExpectedPolicy;
  const readme = loadTextSafe(join(base, "README.md")) ?? "";

  if (!expectedPolicy) {
    throw new Error(`Fixture ${name} is missing expected_policy.json`);
  }

  return {
    name,
    featureTable,
    design,
    metadata,
    handoff,
    expectedPolicy,
    readme,
  };
}

/**
 * Discover and load all synthetic fixtures.
 */
export function discoverSyntheticFixtures(): SyntheticFixture[] {
  return SYNTHETIC_FIXTURE_NAMES.map(loadSyntheticFixture);
}

/**
 * Verify that a fixture directory contains the required files.
 *
 * Handoff fixtures require: handoff.json, expected_policy.json, README.md
 * Feature fixtures require: feature_table.json, design.json, metadata.json, expected_policy.json, README.md
 */
export function verifyFixtureFiles(name: SyntheticFixtureName): { valid: boolean; missing: string[] } {
  const base = join(__dirname, name);
  const required: string[] = ["expected_policy.json", "README.md"];

  const isHandoffFixture = name.startsWith("bm_handoff_");
  if (isHandoffFixture) {
    required.push("handoff.json");
  } else {
    required.push("feature_table.json", "design.json", "metadata.json");
  }

  const missing = required.filter((f) => !existsSync(join(base, f)));
  return { valid: missing.length === 0, missing };
}
