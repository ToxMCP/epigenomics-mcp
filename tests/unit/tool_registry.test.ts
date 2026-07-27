import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { ConfigSchema } from "../../src/epimcp/config.js";
import {
  registerTools,
  getRegisteredToolNames,
  TOOL_DEFINITIONS,
} from "../../src/epimcp/tool_registry.js";

describe("tool registry", () => {
  it("lists all expected core tool names", () => {
    const names = getRegisteredToolNames();
    const expected = [
      "health",
      "ingest_dataset",
      "validate_design",
      "qualify_features",
      "generate_handoff",
      "validate_coordinates",
      "profile_qc",
      "profile_missingness",
      "ingest_cell_composition",
      "ingest_cytotoxicity",
      "summarize_by_group",
      "read_table",
      "read_design",
      "generate_qc_report",
      "convert_coordinates",
    ];
    expect(names).toEqual(expected);
  });

  it("registers all tools on an McpServer without error", () => {
    const server = new McpServer({
      name: "test-server",
      version: "0.0.1",
    });
    expect(() => registerTools(server)).not.toThrow();
  });

  it("has exactly one definition per tool name", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("gives every tool an explicit title, description, schema, and annotations", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.title.trim().length).toBeGreaterThan(0);
      expect(tool.description.trim().length).toBeGreaterThan(20);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations ?? {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it("health tool returns ok status", async () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "health");
    expect(tool).toBeDefined();
    const result = await tool!.handler({});
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.version).toBeDefined();
    expect(parsed.timestamp).toBeDefined();
  });

  it("validate_design tool calls core service", async () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "validate_design");
    expect(tool).toBeDefined();
    const design = {
      designId: "D001",
      species: "Homo sapiens",
      doseGroups: [
        { doseGroupId: "CTRL", doseValue: 0, doseUnit: "mg/kg" },
        { doseGroupId: "LOW", doseValue: 10, doseUnit: "mg/kg" },
      ],
      samples: [
        { sampleId: "S1", doseGroupId: "CTRL", replicateIndex: 0, species: "Homo sapiens" },
        { sampleId: "S2", doseGroupId: "CTRL", replicateIndex: 1, species: "Homo sapiens" },
        { sampleId: "S3", doseGroupId: "LOW", replicateIndex: 0, species: "Homo sapiens" },
        { sampleId: "S4", doseGroupId: "LOW", replicateIndex: 1, species: "Homo sapiens" },
      ],
      hasControls: true,
      minReplicatesPerGroup: 2,
    };
    const result = await tool!.handler({ design });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.valid).toBe(true);
    expect(parsed.errors).toEqual([]);
  });

  it("validate_coordinates tool calls core service", async () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "validate_coordinates");
    expect(tool).toBeDefined();
    const declarations = [
      {
        featureId: "F1",
        featureClass: "atac_peak",
        declaredSystem: "ucsc_bed_0based_half_open",
      },
      {
        featureId: "F2",
        featureClass: "atac_peak",
        declaredSystem: "no_coordinates_feature_id_only",
      },
    ];
    const result = await tool!.handler({ declarations });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it("read_table tool calls core service", async () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "read_table");
    expect(tool).toBeDefined();
    const result = await tool!.handler({
      filePath: "tests/fixtures/valid_packet.json",
    });
    const parsed = JSON.parse(result.content[0].text);
    // JSON is not a valid delimited table, so this should fail gracefully
    expect(parsed.success).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it("read_table blocks files outside configured MCP roots", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "epimcp-read-guard-"));
    try {
      const allowedRoot = join(tmp, "allowed");
      mkdirSync(allowedRoot);
      const outsidePath = join(tmp, "outside.csv");
      writeFileSync(outsidePath, "a,b\n1,2\n", "utf-8");
      const config = ConfigSchema.parse({
        fileAccess: {
          allowedRoots: [allowedRoot],
          maxFileBytes: 1024,
          defaultRowLimit: 1000,
          maxRowLimit: 5000,
        },
      });

      const tool = TOOL_DEFINITIONS.find((t) => t.name === "read_table")!;
      const result = await tool.handler({ filePath: outsidePath }, { config });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.errors[0]).toContain("outside allowed roots");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("read_table enforces size limits and paginates rows", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "epimcp-read-limit-"));
    try {
      const tablePath = join(tmp, "table.csv");
      writeFileSync(tablePath, "a,b\n1,2\n3,4\n5,6\n", "utf-8");
      const tool = TOOL_DEFINITIONS.find((t) => t.name === "read_table")!;

      const tinyConfig = ConfigSchema.parse({
        fileAccess: {
          allowedRoots: [tmp],
          maxFileBytes: 4,
          defaultRowLimit: 1000,
          maxRowLimit: 5000,
        },
      });
      const tooLarge = await tool.handler({ filePath: tablePath }, { config: tinyConfig });
      const tooLargeParsed = JSON.parse(tooLarge.content[0].text);
      expect(tooLargeParsed.success).toBe(false);
      expect(tooLargeParsed.errors[0]).toContain("maximum allowed size");

      const pagedConfig = ConfigSchema.parse({
        fileAccess: {
          allowedRoots: [tmp],
          maxFileBytes: 1024,
          defaultRowLimit: 2,
          maxRowLimit: 2,
        },
      });
      const paged = await tool.handler({ filePath: tablePath }, { config: pagedConfig });
      const pagedParsed = JSON.parse(paged.content[0].text);
      expect(pagedParsed.success).toBe(true);
      expect(pagedParsed.dataRowCount).toBe(2);
      expect(pagedParsed.totalDataRowCount).toBe(3);
      expect(pagedParsed.hasMore).toBe(true);
      expect(pagedParsed.nextOffset).toBe(2);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("ingest_dataset rejects invalid design and provenance evidence", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "epimcp-ingest-evidence-"));
    try {
      const featuresPath = join(tmp, "features.csv");
      const designPath = join(tmp, "design.json");
      const provenancePath = join(tmp, "provenance.json");
      writeFileSync(featuresPath, "feature_id,sample_id,value\ncg001,s1,0.5\n", "utf-8");
      writeFileSync(designPath, JSON.stringify({ designId: "bad" }), "utf-8");
      writeFileSync(provenancePath, JSON.stringify({ datasetId: "ds1" }), "utf-8");
      const config = ConfigSchema.parse({
        fileAccess: {
          allowedRoots: [tmp],
          maxFileBytes: 1024,
          defaultRowLimit: 1000,
          maxRowLimit: 5000,
        },
      });

      const tool = TOOL_DEFINITIONS.find((t) => t.name === "ingest_dataset")!;
      const result = await tool.handler(
        {
          datasetId: "ds1",
          modality: "dna_methylation_array",
          tableOptions: {
            featureClass: "cpg_methylation",
            signalMetric: "beta_value",
            explicitShape: "long",
          },
          featuresPath,
          designPath,
          provenancePath,
        },
        { config },
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ingested).toBe(false);
      expect(parsed.errors.some((e: string) => e.startsWith("design:"))).toBe(true);
      expect(parsed.errors.some((e: string) => e.startsWith("provenance:"))).toBe(true);
      expect(parsed.errorCount).toBe(parsed.errors.length);
      expect(parsed.designValid).toBe(false);
      expect(parsed.provenanceValid).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("ingest_dataset canonicalizes a valid delimited feature table", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "epimcp-ingest-valid-"));
    try {
      const featuresPath = join(tmp, "features.csv");
      const designPath = join(tmp, "design.json");
      const provenancePath = join(tmp, "provenance.json");
      writeFileSync(
        featuresPath,
        [
          "feature_id,sample_id,value",
          "cg001,control-1,0.5",
          "cg001,control-2,0.6",
          "cg001,treated-1,0.7",
          "cg001,treated-2,0.8",
        ].join("\n"),
        "utf-8",
      );
      writeFileSync(
        designPath,
        JSON.stringify({
          designId: "design-1",
          species: "Homo sapiens",
          doseGroups: [
            { doseGroupId: "control", doseValue: 0, doseUnit: "µM" },
            { doseGroupId: "treated", doseValue: 1, doseUnit: "µM" },
          ],
          samples: [
            { sampleId: "control-1", doseGroupId: "control", species: "Homo sapiens", controlFlag: true },
            { sampleId: "control-2", doseGroupId: "control", species: "Homo sapiens", controlFlag: true },
            { sampleId: "treated-1", doseGroupId: "treated", species: "Homo sapiens" },
            { sampleId: "treated-2", doseGroupId: "treated", species: "Homo sapiens" },
          ],
          hasControls: true,
          minReplicatesPerGroup: 2,
        }),
        "utf-8",
      );
      writeFileSync(
        provenancePath,
        JSON.stringify({
          datasetId: "ds1",
          upstreamSteps: [
            {
              stepName: "normalization",
              toolName: "fixture",
              toolVersion: "1.0.0",
              parameters: {},
            },
          ],
        }),
        "utf-8",
      );
      const config = ConfigSchema.parse({
        fileAccess: {
          allowedRoots: [tmp],
          maxFileBytes: 4096,
          defaultRowLimit: 1000,
          maxRowLimit: 5000,
        },
      });
      const tool = TOOL_DEFINITIONS.find((t) => t.name === "ingest_dataset")!;
      const result = await tool.handler(
        {
          datasetId: "ds1",
          modality: "dna_methylation_array",
          tableOptions: {
            featureClass: "cpg_methylation",
            signalMetric: "beta_value",
            explicitShape: "long",
          },
          featuresPath,
          designPath,
          provenancePath,
        },
        { config },
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toMatchObject({
        datasetId: "ds1",
        ingested: true,
        featureCount: 1,
        errors: [],
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("ingest_dataset streams an explicitly authorized gzip table", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "epimcp-ingest-streaming-"));
    try {
      const featuresPath = join(tmp, "features.tsv.gz");
      const designPath = join(tmp, "design.json");
      const provenancePath = join(tmp, "provenance.json");
      writeFileSync(
        featuresPath,
        gzipSync(
          [
            "feature_id\tcontrol-1\tcontrol-2\ttreated-1\ttreated-2",
            "cg001\t0.1\t0.2\t0.3\t0.4",
            "cg002\t0.2\t0.3\t0.4\t0.5",
            "cg003\t0.3\t0.4\t0.5\t0.6",
          ].join("\n"),
        ),
      );
      writeFileSync(
        designPath,
        JSON.stringify({
          designId: "design-streaming",
          species: "Homo sapiens",
          doseGroups: [
            { doseGroupId: "control", doseValue: 0, doseUnit: "µM" },
            { doseGroupId: "treated", doseValue: 1, doseUnit: "µM" },
          ],
          samples: [
            { sampleId: "control-1", doseGroupId: "control", species: "Homo sapiens", controlFlag: true },
            { sampleId: "control-2", doseGroupId: "control", species: "Homo sapiens", controlFlag: true },
            { sampleId: "treated-1", doseGroupId: "treated", species: "Homo sapiens" },
            { sampleId: "treated-2", doseGroupId: "treated", species: "Homo sapiens" },
          ],
          hasControls: true,
          minReplicatesPerGroup: 2,
        }),
        "utf-8",
      );
      writeFileSync(
        provenancePath,
        JSON.stringify({
          datasetId: "ds-streaming",
          upstreamSteps: [
            {
              stepName: "normalization",
              toolName: "fixture",
              toolVersion: "1.0.0",
              parameters: {},
            },
          ],
        }),
        "utf-8",
      );
      const config = ConfigSchema.parse({
        fileAccess: {
          allowedRoots: [tmp],
          maxFileBytes: 4096,
          defaultRowLimit: 1,
          maxRowLimit: 1,
        },
      });
      const tool = TOOL_DEFINITIONS.find((t) => t.name === "ingest_dataset")!;
      const result = await tool.handler(
        {
          datasetId: "ds-streaming",
          modality: "dna_methylation_array",
          tableOptions: {
            featureClass: "cpg_methylation",
            signalMetric: "beta_value",
            explicitShape: "wide",
            sampleIdColumns: [
              "control-1",
              "control-2",
              "treated-1",
              "treated-2",
            ],
            featureIdColumn: "feature_id",
          },
          featuresPath,
          designPath,
          provenancePath,
          executionMode: "streaming",
          streamingOptions: {
            compression: "gzip",
            delimiter: "\t",
            hasHeader: true,
            batchSize: 2,
          },
        },
        { config },
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toMatchObject({
        datasetId: "ds-streaming",
        ingested: true,
        dataValid: true,
        designValid: true,
        provenanceValid: true,
        executionMode: "streaming",
        featureCount: 3,
        dataRowCount: 3,
        batchCount: 2,
        errorCount: 0,
        warningCount: 0,
        errors: [],
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("generate_qc_report tool calls core service", async () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "generate_qc_report");
    expect(tool).toBeDefined();
    const profile = {
      datasetId: "DS1",
      totalFeatures: 100,
      featuresWithMissingValues: 5,
      missingnessRate: 0.05,
      designAdequacyFlags: {
        sufficientReplicates: true,
        doseRangeDeclared: true,
        controlsPresent: true,
        batchStructureKnown: false,
        speciesBuildDeclared: true,
      },
    };
    const result = await tool!.handler({
      datasetId: "DS1",
      profile,
      warnings: [],
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.reportId).toBeDefined();
    expect(parsed.datasetId).toBe("DS1");
    expect(parsed.conclusion).toBeDefined();
  });

  it("qualify_features tool calls core service with invalid packet", async () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "qualify_features");
    expect(tool).toBeDefined();
    const result = await tool!.handler({ packet: { invalid: true } });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.qualifiedCount).toBe(0);
    expect(parsed.excludedCount).toBe(0);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("qualification and handoff tools can read packet JSON under allowed roots", async () => {
    const packetPath = resolve(process.cwd(), "examples/methylation_matrix/packet.json");
    const qualify = TOOL_DEFINITIONS.find((t) => t.name === "qualify_features")!;
    const handoff = TOOL_DEFINITIONS.find((t) => t.name === "generate_handoff")!;

    const qualificationResult = await qualify.handler({ packetPath });
    const qualification = JSON.parse(qualificationResult.content[0].text);
    expect(qualification.qualifiedCount).toBeGreaterThan(0);

    const handoffResult = await handoff.handler({ packetPath });
    const handoffSummary = JSON.parse(handoffResult.content[0].text);
    expect(handoffSummary.readyForPod).toBe(true);
  });

  it("qualification and handoff tools apply supplied cytotoxicity profiles", async () => {
    const fixtureRoot = resolve(
      process.cwd(),
      "benchmarks/fixtures/synthetic/bm_dominant_cytotoxicity",
    );
    const packet = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "benchmarks/expected/bm_dominant_cytotoxicity/packet.json",
        ),
        "utf-8",
      ),
    );
    const metadata = JSON.parse(
      readFileSync(resolve(fixtureRoot, "metadata.json"), "utf-8"),
    );
    const qualify = TOOL_DEFINITIONS.find((t) => t.name === "qualify_features")!;
    const handoff = TOOL_DEFINITIONS.find((t) => t.name === "generate_handoff")!;

    const qualificationResult = await qualify.handler({
      packet,
      cytotoxicityProfile: metadata.cytotoxicity,
    });
    const qualification = JSON.parse(qualificationResult.content[0].text);
    expect(qualification.qualifiedCount).toBe(0);
    expect(qualification.qualifications[0].status).toBe("exploratory_only");
    expect(qualification.explainabilitySummary.uniqueRuleCodes).toEqual([
      "RULE_007_DOMINANT_CONFOUNDING",
    ]);

    const handoffResult = await handoff.handler({
      packet,
      cytotoxicityProfile: metadata.cytotoxicity,
    });
    const handoffSummary = JSON.parse(handoffResult.content[0].text);
    expect(handoffSummary.readyForPod).toBe(false);
  });

  it("packet tools reject ambiguous inline-and-file input", async () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "qualify_features")!;
    const result = await tool.handler({
      packet: {},
      packetPath: "examples/methylation_matrix/packet.json",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("exactly one");
  });

  it("generate_handoff tool calls core service with invalid packet", async () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "generate_handoff");
    expect(tool).toBeDefined();
    const result = await tool!.handler({ packet: { invalid: true } });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.readyForPod).toBe(false);
    expect(parsed.qualifiedFeatureCount).toBe(0);
  });

  it("ingest_cytotoxicity tool calls core service", async () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "ingest_cytotoxicity");
    expect(tool).toBeDefined();
    const entries = [
      {
        assayType: "viability",
        evidenceSource: "measured_concurrent",
        measurements: [
          { sampleId: "S1", value: 0.95, unit: "fraction", metric: "viability" },
        ],
      },
    ];
    const result = await tool!.handler({
      datasetId: "DS1",
      entries,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.datasetId).toBe("DS1");
    expect(parsed.hasCytotoxicityData).toBe(true);
  });

  it("ingest_cell_composition tool calls core service", async () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "ingest_cell_composition");
    expect(tool).toBeDefined();
    const samples = [
      {
        sampleId: "S1",
        source: "declared_pure",
        declaredCellType: "HepG2",
      },
    ];
    const result = await tool!.handler({
      datasetId: "DS1",
      samples,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.datasetId).toBe("DS1");
    expect(parsed.fractionSumValid).toBe(true);
  });

  it("convert_coordinates tool calls core service", async () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "convert_coordinates");
    expect(tool).toBeDefined();
    const records = [
      {
        chrom: "chr1",
        start: 1001,
        end: 2000,
        sourceSystem: "gff_gtf_1based_closed",
        originalCoordinateText: "chr1:1001-2000",
      },
      {
        chrom: "chr1",
        start: 1000,
        end: 2000,
        sourceSystem: "ucsc_bed_0based_half_open",
        originalCoordinateText: "chr1:1000-2000",
      },
    ];
    const result = await tool!.handler({ records });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.overallSuccess).toBe(true);
    expect(parsed.convertedCount).toBe(2);
    expect(parsed.failedCount).toBe(0);
    expect(parsed.results[0].normalizedRecord.start).toBe(1000);
    expect(parsed.results[1].normalizedRecord.start).toBe(1000);
  });
});
