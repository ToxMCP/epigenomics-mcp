import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Track-A core gate: schema-drift (validation arm).
 *
 * This gate is COMPLEMENTARY to the existing "Schema Drift Guard" workflow and
 * tests/contract/schema_snapshots.test.ts. Those check that the committed JSON
 * Schemas still byte-match what zod-to-json-schema regenerates (a code->artifact
 * consistency check). This gate instead asserts the committed artifacts are
 * themselves well-formed and that the committed example fixtures still validate
 * against them:
 *
 *   1. Ajv compile-all — every committed JSON Schema under schemas/current/
 *      compiles cleanly. A metaschema-invalid schema, a dangling $ref, or a
 *      bogus keyword fails compilation here even if it byte-matches the Zod
 *      export (e.g. a hand edit to a committed schema, or a Zod->JSON-Schema
 *      transform that emits an invalid construct).
 *
 *   2. Fixture validation (strict) — every committed example packet under
 *      examples/ validates against its committed schema. Adding a bogus
 *      `required` field to a schema, or breaking a fixture, fails here with
 *      attributed Ajv errors.
 *
 * The committed schemas declare the JSON Schema draft-07 dialect, so Ajv is
 * configured for draft-07 (Ajv 8's default meta-schema). strict mode is enabled
 * so unknown keywords / malformed schemas are hard errors, not silent passes.
 *
 * MAINTAINER NOTE: SCHEMA_FILES is derived from the contents of schemas/current/.
 * FIXTURE_CASES is a hand-maintained map of example fixture -> committed schema.
 * When you add a new committed schema or a new example fixture, extend
 * FIXTURE_CASES so the new artifact is exercised by this gate.
 */

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCHEMA_DIR = resolve(REPO_ROOT, "schemas", "current");

function loadJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
}

const SCHEMA_FILES = readdirSync(SCHEMA_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

// Hand-maintained fixture -> schema map. See MAINTAINER NOTE above.
const FIXTURE_CASES: ReadonlyArray<{ schema: string; fixture: string }> = [
  {
    schema: "epigenomics-feature-response-packet.json",
    fixture: "examples/methylation_matrix/packet.json",
  },
  {
    schema: "epigenomics-feature-response-packet.json",
    fixture: "examples/dmr_nearest_gene_warning/packet.json",
  },
  {
    schema: "bioactivity-pod-handoff-packet.json",
    fixture: "examples/bioactivity_pod_handoff_valid/accepted.json",
  },
  {
    schema: "bioactivity-pod-handoff-packet.json",
    fixture: "examples/bioactivity_pod_handoff_valid/accepted_with_warnings.json",
  },
  {
    schema: "bioactivity-pod-handoff-packet.json",
    fixture: "examples/bioactivity_pod_handoff_valid/excluded.json",
  },
  {
    schema: "bioactivity-pod-handoff-packet.json",
    fixture: "examples/bioactivity_pod_handoff_valid/exploratory_only.json",
  },
];

function makeAjv(): Ajv {
  // strict: true makes unknown keywords and malformed schemas hard errors.
  // allErrors gives complete, attributable validation failures.
  // Per-schema $id values collide across this set's $defs, so we disable the
  // schema-id-cache to compile each schema independently.
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  return ajv;
}

describe("committed JSON Schemas compile under Ajv (draft-07, strict)", () => {
  it("finds committed schema artifacts to validate", () => {
    expect(SCHEMA_FILES.length).toBeGreaterThan(0);
  });

  it.each(SCHEMA_FILES)("compiles %s", (filename) => {
    const ajv = makeAjv();
    const schema = loadJson(join(SCHEMA_DIR, filename));
    expect(
      () => ajv.compile(schema),
      `Committed schema schemas/current/${filename} failed to compile under Ajv.`,
    ).not.toThrow();
  });
});

describe("committed example fixtures validate against their committed schema", () => {
  it.each(FIXTURE_CASES)(
    "$fixture validates against $schema",
    ({ schema, fixture }) => {
      const ajv = makeAjv();
      const validate = ajv.compile(loadJson(join(SCHEMA_DIR, schema)));
      const data = loadJson(resolve(REPO_ROOT, fixture));
      const valid = validate(data);
      expect(
        valid,
        `Fixture ${fixture} did not validate against schemas/current/${schema}:\n` +
          JSON.stringify(validate.errors, null, 2),
      ).toBe(true);
    },
  );
});
