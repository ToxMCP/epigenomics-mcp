import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  exportSchema,
  exportAllSchemas,
  transformSchema,
  archiveAllSchemas,
  getArchiveDir,
  SCHEMA_EXPORT_CONFIGS,
} from "../../src/scripts/export-schemas.js";

describe("schema export", () => {
  describe("exportSchema", () => {
    it("produces a valid JSON Schema for EpigenomicsFeatureResponsePacket", () => {
      const config = SCHEMA_EXPORT_CONFIGS.find(
        (c) => c.name === "EpigenomicsFeatureResponsePacket",
      )!;
      const schema = exportSchema(config);

      expect(schema).toBeDefined();
      expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
      expect(schema.$id).toBe(config.id);
      expect(schema.title).toBe(config.name);
      expect(schema.description).toBe(config.description);
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties).toBeDefined();
      expect(schema.required).toContain("schemaVersion");
      expect(schema.required).toContain("packetId");
    });

    it("produces a valid JSON Schema for BioactivityPoDHandoffPacket", () => {
      const config = SCHEMA_EXPORT_CONFIGS.find(
        (c) => c.name === "BioactivityPoDHandoffPacket",
      )!;
      const schema = exportSchema(config);

      expect(schema).toBeDefined();
      expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
      expect(schema.$id).toBe(config.id);
      expect(schema.title).toBe(config.name);
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toContain("handoffId");
      expect(schema.required).toContain("doseResponseReadySubset");
    });
  });

  describe("transformSchema", () => {
    it("hoists the named definition to root and drops definitions key", () => {
      const raw = {
        definitions: {
          TestSchema: {
            type: "object",
            properties: {
              id: { type: "string" },
            },
          },
          OtherSchema: {
            type: "string",
          },
        },
      };

      const config: (typeof SCHEMA_EXPORT_CONFIGS)[0] = {
        name: "TestSchema",
        schema: {} as unknown as (typeof SCHEMA_EXPORT_CONFIGS)[0]["schema"],
        description: "Test description",
        filename: "test.json",
        id: "https://example.com/test",
      };

      const result = transformSchema(raw, config);

      expect(result.$schema).toBe("http://json-schema.org/draft-07/schema#");
      expect(result.$id).toBe(config.id);
      expect(result.title).toBe("TestSchema");
      expect(result.description).toBe("Test description");
      expect(result.type).toBe("object");
      expect(result.properties).toBeDefined();
      expect(result.definitions).toBeUndefined();
      expect(result.$defs).toBeDefined();
      expect(result.$defs).toHaveProperty("OtherSchema");
      expect(result.$defs).not.toHaveProperty("TestSchema");
    });

    it("omits $defs when no other definitions exist", () => {
      const raw = {
        definitions: {
          TestSchema: {
            type: "object",
          },
        },
      };

      const config: (typeof SCHEMA_EXPORT_CONFIGS)[0] = {
        name: "TestSchema",
        schema: {} as unknown as (typeof SCHEMA_EXPORT_CONFIGS)[0]["schema"],
        description: "Test",
        filename: "test.json",
        id: "https://example.com/test",
      };

      const result = transformSchema(raw, config);
      expect(result.$defs).toBeUndefined();
    });

    it("throws when the named definition is missing", () => {
      const raw = {
        definitions: {
          OtherSchema: { type: "string" },
        },
      };

      const config: (typeof SCHEMA_EXPORT_CONFIGS)[0] = {
        name: "MissingSchema",
        schema: {} as unknown as (typeof SCHEMA_EXPORT_CONFIGS)[0]["schema"],
        description: "Test",
        filename: "test.json",
        id: "https://example.com/test",
      };

      expect(() => transformSchema(raw, config)).toThrow(
        "Missing definition for MissingSchema",
      );
    });
  });

  describe("exportAllSchemas", () => {
    it("writes all schema files to the output directory", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "schema-export-test-"));

      try {
        exportAllSchemas(tmpDir);

        const epiPath = join(tmpDir, "epigenomics-feature-response-packet.json");
        const bioPath = join(tmpDir, "bioactivity-pod-handoff-packet.json");
        const mappingPath = join(tmpDir, "region-to-gene-mapping.json");
        const envelopePath = join(tmpDir, "base-envelope.json");
        const policyPath = join(tmpDir, "qualification-policy.json");

        const epi = JSON.parse(readFileSync(epiPath, "utf-8"));
        const bio = JSON.parse(readFileSync(bioPath, "utf-8"));
        const mapping = JSON.parse(readFileSync(mappingPath, "utf-8"));
        const envelope = JSON.parse(readFileSync(envelopePath, "utf-8"));
        const policy = JSON.parse(readFileSync(policyPath, "utf-8"));

        expect(epi.title).toBe("EpigenomicsFeatureResponsePacket");
        expect(bio.title).toBe("BioactivityPoDHandoffPacket");
        expect(mapping.title).toBe("RegionToGeneMapping");
        expect(envelope.title).toBe("BaseEnvelope");
        expect(policy.title).toBe("QualificationPolicy");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("produces deterministic output when run twice", () => {
      const tmpDir1 = mkdtempSync(join(tmpdir(), "schema-export-test-a-"));
      const tmpDir2 = mkdtempSync(join(tmpdir(), "schema-export-test-b-"));

      try {
        exportAllSchemas(tmpDir1);
        exportAllSchemas(tmpDir2);

        const files1 = readFileSync(join(tmpDir1, "epigenomics-feature-response-packet.json"), "utf-8");
        const files2 = readFileSync(join(tmpDir2, "epigenomics-feature-response-packet.json"), "utf-8");

        expect(files1).toBe(files2);

        const bio1 = readFileSync(join(tmpDir1, "bioactivity-pod-handoff-packet.json"), "utf-8");
        const bio2 = readFileSync(join(tmpDir2, "bioactivity-pod-handoff-packet.json"), "utf-8");

        expect(bio1).toBe(bio2);
      } finally {
        rmSync(tmpDir1, { recursive: true, force: true });
        rmSync(tmpDir2, { recursive: true, force: true });
      }
    });
  });

  describe("schemaName constraints", () => {
    it("includes schemaName const constraint in EpigenomicsFeatureResponsePacket", () => {
      const config = SCHEMA_EXPORT_CONFIGS.find(
        (c) => c.name === "EpigenomicsFeatureResponsePacket",
      )!;
      const schema = exportSchema(config);
      const props = schema.properties as Record<string, unknown>;
      expect(props).toBeDefined();
      expect(props.schemaName).toBeDefined();
      const schemaNameProp = props.schemaName as Record<string, unknown>;
      expect(schemaNameProp.const).toBe("EpigenomicsFeatureResponsePacket");
    });

    it("includes schemaName const constraint in BioactivityPoDHandoffPacket", () => {
      const config = SCHEMA_EXPORT_CONFIGS.find(
        (c) => c.name === "BioactivityPoDHandoffPacket",
      )!;
      const schema = exportSchema(config);
      const props = schema.properties as Record<string, unknown>;
      expect(props).toBeDefined();
      expect(props.schemaName).toBeDefined();
      const schemaNameProp = props.schemaName as Record<string, unknown>;
      expect(schemaNameProp.const).toBe("BioactivityPoDHandoffPacket");
    });

    it("includes schemaName const constraint in BaseEnvelope", () => {
      const config = SCHEMA_EXPORT_CONFIGS.find(
        (c) => c.name === "BaseEnvelope",
      )!;
      const schema = exportSchema(config);
      const props = schema.properties as Record<string, unknown>;
      expect(props).toBeDefined();
      expect(props.schemaName).toBeDefined();
      const schemaNameProp = props.schemaName as Record<string, unknown>;
      expect(schemaNameProp.type).toBe("string");
      expect(schemaNameProp.minLength).toBe(1);
    });
  });

  describe("archiveAllSchemas", () => {
    it("copies current schemas to an archive version directory", () => {
      const currentDir = mkdtempSync(join(tmpdir(), "schema-current-"));
      const archiveRoot = mkdtempSync(join(tmpdir(), "schema-archive-root-"));
      const version = "0.1.0-test";

      try {
        exportAllSchemas(currentDir);
        archiveAllSchemas(version, currentDir, archiveRoot);

        const archiveDir = getArchiveDir(version, archiveRoot);
        const archivedFiles = [
          "epigenomics-feature-response-packet.json",
          "bioactivity-pod-handoff-packet.json",
          "region-to-gene-mapping.json",
          "external-database-mapping.json",
          "base-envelope.json",
          "qualification-policy.json",
        ];

        for (const file of archivedFiles) {
          const currentPath = join(currentDir, file);
          const archivePath = join(archiveDir, file);
          const currentContent = readFileSync(currentPath, "utf-8");
          const archiveContent = readFileSync(archivePath, "utf-8");
          expect(archiveContent).toBe(currentContent);
        }
      } finally {
        rmSync(currentDir, { recursive: true, force: true });
        rmSync(archiveRoot, { recursive: true, force: true });
      }
    });
  });
});
