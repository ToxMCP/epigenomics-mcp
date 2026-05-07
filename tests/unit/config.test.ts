import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  loadConfig,
  loadConfigFromEnv,
  loadConfigFromFile,
  ConfigSchema,
  CoordinateDefaultsSchema,
  MissingnessThresholdsSchema,
  ReplicateThresholdsSchema,
  LocalSnapshotPathsSchema,
} from "../../src/epimcp/config.js";

describe("config defaults", () => {
  it("returns deterministic default values", () => {
    const config = ConfigSchema.parse({});

    expect(config.name).toBe("epigenomics-mcp");
    expect(config.version).toBe("0.1.0");
    expect(config.logLevel).toBe("info");
    expect(config.port).toBe(3000);
    expect(config.host).toBe("127.0.0.1");
    expect(config.schemaVersion).toBe("0.1.0");
    expect(config.policyVersion).toBe("0.1.0");
    expect(config.supportedGenomeBuilds).toEqual([
      "GRCh37",
      "GRCh38",
      "hg19",
      "hg38",
      "mm9",
      "mm10",
      "mm39",
      "rn6",
      "rn7",
    ]);
  });

  it("returns deterministic coordinate defaults", () => {
    const config = ConfigSchema.parse({});

    expect(config.coordinateDefaults.defaultGenomeBuild).toBe("GRCh38");
    expect(config.coordinateDefaults.defaultCoordinateSystem).toBe(
      "ucsc_bed_0based_half_open",
    );
    expect(config.coordinateDefaults.defaultChromosomeNaming).toBe("ucsc");
  });

  it("returns deterministic missingness thresholds", () => {
    const config = ConfigSchema.parse({});

    expect(config.missingnessThresholds.probeLevelWarning).toBe(0.05);
    expect(config.missingnessThresholds.probeLevelExclusion).toBe(0.2);
    expect(config.missingnessThresholds.sampleLevelWarning).toBe(0.1);
    expect(config.missingnessThresholds.sampleLevelExclusion).toBe(0.3);
    expect(config.missingnessThresholds.groupLevelWarning).toBe(0.1);
    expect(config.missingnessThresholds.groupLevelExclusion).toBe(0.2);
  });

  it("returns deterministic replicate thresholds", () => {
    const config = ConfigSchema.parse({});

    expect(config.replicateThresholds.minBiologicalReplicatesPerGroup).toBe(2);
    expect(config.replicateThresholds.preferredBiologicalReplicatesPerGroup).toBe(
      3,
    );
    expect(config.replicateThresholds.maxCvThreshold).toBe(0.3);
  });

  it("returns all feature flags disabled by default", () => {
    const config = ConfigSchema.parse({});

    expect(config.featureFlags.enableChromatinAccessibility).toBe(false);
    expect(config.featureFlags.enableHistoneMark).toBe(false);
    expect(config.featureFlags.enableMirnaExpression).toBe(false);
    expect(config.featureFlags.enableNcrnaExpression).toBe(false);
    expect(config.featureFlags.enableChromatinStateContext).toBe(false);
    expect(config.featureFlags.enableBatchEffectModeling).toBe(false);
    expect(config.featureFlags.enableCellDeconvolution).toBe(false);
  });

  it("returns deterministic local snapshot paths", () => {
    const config = ConfigSchema.parse({});

    expect(config.localSnapshotPaths.annotationSnapshot).toBe(
      "./snapshots/annotations",
    );
    expect(config.localSnapshotPaths.referenceGenomeCache).toBe(
      "./snapshots/reference",
    );
    expect(config.localSnapshotPaths.geneMappingCache).toBe(
      "./snapshots/mappings",
    );
    expect(config.localSnapshotPaths.policySnapshot).toBe(
      "./snapshots/policies",
    );
  });

  it("returns deterministic MCP file-access defaults", () => {
    const config = ConfigSchema.parse({});

    expect(config.fileAccess.allowedRoots).toEqual([process.cwd()]);
    expect(config.fileAccess.maxFileBytes).toBe(25 * 1024 * 1024);
    expect(config.fileAccess.defaultRowLimit).toBe(1000);
    expect(config.fileAccess.maxRowLimit).toBe(5000);
  });

  it("exposes policy version aligned with schema version", () => {
    const config = ConfigSchema.parse({});
    expect(config.policyVersion).toBe("0.1.0");
    expect(config.schemaVersion).toBe("0.1.0");
  });
});

describe("config overrides", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clone environment so we can mutate safely
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("applies explicit object overrides", () => {
    const config = ConfigSchema.parse({
      name: "custom-mcp",
      port: 8080,
      schemaVersion: "0.2.0",
      policyVersion: "0.2.0",
      supportedGenomeBuilds: ["GRCh38"],
    });

    expect(config.name).toBe("custom-mcp");
    expect(config.port).toBe(8080);
    expect(config.schemaVersion).toBe("0.2.0");
    expect(config.policyVersion).toBe("0.2.0");
    expect(config.supportedGenomeBuilds).toEqual(["GRCh38"]);
  });

  it("applies nested object overrides while preserving sibling defaults", () => {
    const config = ConfigSchema.parse({
      coordinateDefaults: {
        defaultGenomeBuild: "mm10",
      },
    });

    expect(config.coordinateDefaults.defaultGenomeBuild).toBe("mm10");
    expect(config.coordinateDefaults.defaultCoordinateSystem).toBe(
      "ucsc_bed_0based_half_open",
    );
    expect(config.coordinateDefaults.defaultChromosomeNaming).toBe("ucsc");
  });

  it("applies environment variable overrides via loadConfigFromEnv", () => {
    process.env.EPIMCP_NAME = "env-mcp";
    process.env.EPIMCP_PORT = "9000";
    process.env.EPIMCP_SCHEMA_VERSION = "0.3.0";
    process.env.EPIMCP_POLICY_VERSION = "0.3.0";
    process.env.EPIMCP_SUPPORTED_GENOME_BUILDS = "GRCh38,mm10";
    process.env.EPIMCP_DEFAULT_GENOME_BUILD = "mm39";
    process.env.EPIMCP_PROBE_LEVEL_WARNING = "0.02";
    process.env.EPIMCP_MIN_BIOLOGICAL_REPLICATES = "4";
    process.env.EPIMCP_ENABLE_CHROMATIN_ACCESSIBILITY = "true";
    process.env.EPIMCP_ANNOTATION_SNAPSHOT_PATH = "/custom/annotations";
    process.env.EPIMCP_ALLOWED_FILE_ROOTS = "/tmp/epimcp-a,/tmp/epimcp-b";
    process.env.EPIMCP_MAX_FILE_BYTES = "12345";
    process.env.EPIMCP_DEFAULT_ROW_LIMIT = "25";
    process.env.EPIMCP_MAX_ROW_LIMIT = "250";

    const config = loadConfigFromEnv();

    expect(config.name).toBe("env-mcp");
    expect(config.port).toBe(9000);
    expect(config.schemaVersion).toBe("0.3.0");
    expect(config.policyVersion).toBe("0.3.0");
    expect(config.supportedGenomeBuilds).toEqual(["GRCh38", "mm10"]);
    expect(config.coordinateDefaults.defaultGenomeBuild).toBe("mm39");
    expect(config.missingnessThresholds.probeLevelWarning).toBe(0.02);
    expect(config.replicateThresholds.minBiologicalReplicatesPerGroup).toBe(4);
    expect(config.featureFlags.enableChromatinAccessibility).toBe(true);
    expect(config.localSnapshotPaths.annotationSnapshot).toBe("/custom/annotations");
    expect(config.fileAccess.allowedRoots).toEqual([
      resolve("/tmp/epimcp-a"),
      resolve("/tmp/epimcp-b"),
    ]);
    expect(config.fileAccess.maxFileBytes).toBe(12345);
    expect(config.fileAccess.defaultRowLimit).toBe(25);
    expect(config.fileAccess.maxRowLimit).toBe(250);

    // Sibling defaults preserved
    expect(config.coordinateDefaults.defaultCoordinateSystem).toBe(
      "ucsc_bed_0based_half_open",
    );
    expect(config.featureFlags.enableHistoneMark).toBe(false);
  });

  it("ignores unsupported environment variable values", () => {
    process.env.EPIMCP_PORT = "not-a-number";
    process.env.EPIMCP_PROBE_LEVEL_WARNING = "invalid";
    process.env.EPIMCP_ENABLE_HISTONE_MARK = "maybe";

    const config = loadConfigFromEnv();

    expect(config.port).toBe(3000);
    expect(config.missingnessThresholds.probeLevelWarning).toBe(0.05);
    expect(config.featureFlags.enableHistoneMark).toBe(false);
  });

  it("applies boolean env overrides for false values", () => {
    process.env.EPIMCP_ENABLE_CHROMATIN_ACCESSIBILITY = "false";
    process.env.EPIMCP_ENABLE_HISTONE_MARK = "0";

    const config = loadConfigFromEnv();

    expect(config.featureFlags.enableChromatinAccessibility).toBe(false);
    expect(config.featureFlags.enableHistoneMark).toBe(false);
  });

  it("loads configuration from a YAML file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "config-test-"));
    const configPath = join(tmpDir, "config.yaml");

    writeFileSync(
      configPath,
      `
name: file-mcp
port: 7000
schemaVersion: "0.4.0"
policyVersion: "0.4.0"
coordinateDefaults:
  defaultGenomeBuild: GRCh37
missingnessThresholds:
  probeLevelWarning: 0.01
featureFlags:
  enableBatchEffectModeling: true
localSnapshotPaths:
  geneMappingCache: /cache/mappings
`,
      "utf-8",
    );

    try {
      const config = loadConfigFromFile(configPath);

      expect(config.name).toBe("file-mcp");
      expect(config.port).toBe(7000);
      expect(config.schemaVersion).toBe("0.4.0");
      expect(config.policyVersion).toBe("0.4.0");
      expect(config.coordinateDefaults.defaultGenomeBuild).toBe("GRCh37");
      expect(config.missingnessThresholds.probeLevelWarning).toBe(0.01);
      expect(config.featureFlags.enableBatchEffectModeling).toBe(true);
      expect(config.localSnapshotPaths.geneMappingCache).toBe("/cache/mappings");

      // Defaults preserved for unspecified fields
      expect(config.coordinateDefaults.defaultCoordinateSystem).toBe(
        "ucsc_bed_0based_half_open",
      );
      expect(config.missingnessThresholds.sampleLevelWarning).toBe(0.1);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("gives overrides highest priority over file and env", () => {
    process.env.EPIMCP_NAME = "env-mcp";
    process.env.EPIMCP_PORT = "9000";

    const tmpDir = mkdtempSync(join(tmpdir(), "config-test-"));
    const configPath = join(tmpDir, "config.yaml");

    writeFileSync(
      configPath,
      `
name: file-mcp
port: 7000
`,
      "utf-8",
    );

    try {
      const config = loadConfig({
        filePath: configPath,
        overrides: { name: "override-mcp", port: 5000 },
      });

      expect(config.name).toBe("override-mcp");
      expect(config.port).toBe(5000);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("gives file priority over environment variables", () => {
    process.env.EPIMCP_NAME = "env-mcp";
    process.env.EPIMCP_PORT = "9000";

    const tmpDir = mkdtempSync(join(tmpdir(), "config-test-"));
    const configPath = join(tmpDir, "config.yaml");

    writeFileSync(
      configPath,
      `
name: file-mcp
port: 7000
`,
      "utf-8",
    );

    try {
      const config = loadConfig({ filePath: configPath });

      expect(config.name).toBe("file-mcp");
      expect(config.port).toBe(7000);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("config validation", () => {
  it("rejects invalid port numbers", () => {
    expect(() => ConfigSchema.parse({ port: 0 })).toThrow();
    expect(() => ConfigSchema.parse({ port: 70000 })).toThrow();
    expect(() => ConfigSchema.parse({ port: -1 })).toThrow();
  });

  it("rejects invalid log levels", () => {
    expect(() => ConfigSchema.parse({ logLevel: "verbose" })).toThrow();
  });

  it("rejects empty supported genome builds array", () => {
    expect(() => ConfigSchema.parse({ supportedGenomeBuilds: [] })).toThrow();
  });

  it("rejects invalid coordinate defaults", () => {
    expect(() =>
      CoordinateDefaultsSchema.parse({
        defaultCoordinateSystem: "invalid_system",
      }),
    ).toThrow();
  });

  it("rejects missingness thresholds outside [0,1]", () => {
    expect(() =>
      MissingnessThresholdsSchema.parse({
        probeLevelWarning: -0.1,
      }),
    ).toThrow();
    expect(() =>
      MissingnessThresholdsSchema.parse({
        probeLevelExclusion: 1.5,
      }),
    ).toThrow();
  });

  it("rejects when probeLevelExclusion < probeLevelWarning", () => {
    expect(() =>
      MissingnessThresholdsSchema.parse({
        probeLevelWarning: 0.3,
        probeLevelExclusion: 0.2,
      }),
    ).toThrow();
  });

  it("rejects when sampleLevelExclusion < sampleLevelWarning", () => {
    expect(() =>
      MissingnessThresholdsSchema.parse({
        sampleLevelWarning: 0.4,
        sampleLevelExclusion: 0.3,
      }),
    ).toThrow();
  });

  it("rejects when groupLevelExclusion < groupLevelWarning", () => {
    expect(() =>
      MissingnessThresholdsSchema.parse({
        groupLevelWarning: 0.25,
        groupLevelExclusion: 0.15,
      }),
    ).toThrow();
  });

  it("rejects invalid replicate thresholds", () => {
    expect(() =>
      ReplicateThresholdsSchema.parse({
        minBiologicalReplicatesPerGroup: 3,
        preferredBiologicalReplicatesPerGroup: 2,
      }),
    ).toThrow();
  });

  it("rejects negative replicate counts", () => {
    expect(() =>
      ReplicateThresholdsSchema.parse({
        minBiologicalReplicatesPerGroup: 0,
      }),
    ).toThrow();
  });

  it("rejects negative CV threshold", () => {
    expect(() =>
      ReplicateThresholdsSchema.parse({
        maxCvThreshold: -0.1,
      }),
    ).toThrow();
  });
});

describe("policy version exposure", () => {
  it("exposes default policy version through config", () => {
    const config = ConfigSchema.parse({});
    expect(config.policyVersion).toBe("0.1.0");
    expect(typeof config.policyVersion).toBe("string");
  });

  it("allows policy version override via env", () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, EPIMCP_POLICY_VERSION: "0.2.0" };

    try {
      const config = loadConfigFromEnv();
      expect(config.policyVersion).toBe("0.2.0");
    } finally {
      process.env = originalEnv;
    }
  });

  it("allows policy version override via explicit object", () => {
    const config = ConfigSchema.parse({ policyVersion: "0.5.0" });
    expect(config.policyVersion).toBe("0.5.0");
  });
});

describe("loadConfig with no arguments", () => {
  it("falls back to defaults when no env, file, or overrides provided", () => {
    const config = loadConfig();

    expect(config.name).toBe("epigenomics-mcp");
    expect(config.port).toBe(3000);
    expect(config.schemaVersion).toBe("0.1.0");
    expect(config.policyVersion).toBe("0.1.0");
  });
});
