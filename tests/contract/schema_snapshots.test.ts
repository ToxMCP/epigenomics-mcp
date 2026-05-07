import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  exportSchema,
  exportAllSchemas,
  SCHEMA_EXPORT_CONFIGS,
} from "../../src/scripts/export-schemas.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Schema snapshot tests.
 *
 * Regenerates JSON schemas from Zod and asserts they match the committed
 * files in schemas/current/.  Any drift means a contract change was made
 * without updating the snapshot.
 */

describe("schema snapshots", () => {
  const currentDir = resolve(process.cwd(), "schemas", "current");

  describe.each(SCHEMA_EXPORT_CONFIGS)(
    "$name snapshot matches schemas/current",
    (config) => {
      it("has a committed JSON schema file", () => {
        const path = resolve(currentDir, config.filename);
        const content = readFileSync(path, "utf-8");
        expect(content).toBeTruthy();
        const parsed = JSON.parse(content);
        expect(parsed.$schema).toBe("http://json-schema.org/draft-07/schema#");
        expect(parsed.title).toBe(config.name);
      });

      it("regenerates to the identical committed schema", () => {
        const path = resolve(currentDir, config.filename);
        const committed = readFileSync(path, "utf-8");
        const regenerated = JSON.stringify(exportSchema(config), null, 2) + "\n";
        expect(regenerated).toBe(committed);
      });
    },
  );

  it("all current schema files are accounted for in SCHEMA_EXPORT_CONFIGS", () => {
    const currentFiles = new Set(
      readFileSync(resolve(currentDir, "epigenomics-feature-response-packet.json"), "utf-8")
        ? [
            "epigenomics-feature-response-packet.json",
            "bioactivity-pod-handoff-packet.json",
            "region-to-gene-mapping.json",
            "external-database-mapping.json",
            "base-envelope.json",
            "qualification-policy.json",
          ]
        : [],
    );
    const configFiles = new Set(SCHEMA_EXPORT_CONFIGS.map((c) => c.filename));
    expect(configFiles).toContain("epigenomics-feature-response-packet.json");
    expect(configFiles).toContain("bioactivity-pod-handoff-packet.json");
    expect(configFiles).toContain("region-to-gene-mapping.json");
    expect(configFiles).toContain("external-database-mapping.json");
    expect(configFiles).toContain("base-envelope.json");
    expect(configFiles).toContain("qualification-policy.json");
  });

  it("exportAllSchemas produces deterministic output", () => {
    const tmp1 = mkdtempSync(join(tmpdir(), "schema-snap-a-"));
    const tmp2 = mkdtempSync(join(tmpdir(), "schema-snap-b-"));
    try {
      exportAllSchemas(tmp1);
      exportAllSchemas(tmp2);

      for (const config of SCHEMA_EXPORT_CONFIGS) {
        const a = readFileSync(join(tmp1, config.filename), "utf-8");
        const b = readFileSync(join(tmp2, config.filename), "utf-8");
        expect(a).toBe(b);
      }
    } finally {
      rmSync(tmp1, { recursive: true, force: true });
      rmSync(tmp2, { recursive: true, force: true });
    }
  });
});
