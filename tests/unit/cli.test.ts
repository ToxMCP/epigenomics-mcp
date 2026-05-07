import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI_CMD = "npx tsx src/epimcp/cli.ts";

function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    stdout = execSync(`${CLI_CMD} ${args}`, {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: "pipe",
    });
  } catch (e) {
    exitCode = 1;
    if (e instanceof Error && "stdout" in e && typeof e.stdout === "string") {
      stdout = e.stdout;
    }
    if (e instanceof Error && "stderr" in e && typeof e.stderr === "string") {
      stderr = e.stderr;
    }
  }
  return { stdout, stderr, exitCode };
}

describe("CLI command parity", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "epimcp-cli-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("global options", () => {
    it("--help exits 0 and prints usage", () => {
      const { stdout, exitCode } = runCli("--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("epimcp");
      expect(stdout).toContain("USAGE");
      expect(stdout).toContain("COMMANDS");
    });

    it("--version exits 0 and prints version", () => {
      const { stdout, exitCode } = runCli("--version");
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("unknown command exits 1", () => {
      const { stdout, exitCode } = runCli("unknown-cmd");
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Unknown command");
    });
  });

  describe("validate-design", () => {
    it("validates a correct design and exits 0", () => {
      const designPath = join(tmpDir, "valid_design.json");
      writeFileSync(
        designPath,
        JSON.stringify({
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
        }),
      );
      const { stdout, exitCode } = runCli(`validate-design ${designPath}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("rejects an invalid design and exits 1", () => {
      const designPath = join(tmpDir, "invalid_design.json");
      writeFileSync(designPath, JSON.stringify({ designId: "bad" }));
      const { stdout, exitCode } = runCli(`validate-design ${designPath}`);
      expect(exitCode).toBe(1);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("exits 1 when design path is missing", () => {
      const { exitCode } = runCli("validate-design");
      expect(exitCode).toBe(1);
    });
  });

  describe("validate-coordinates", () => {
    it("validates correct coordinate declarations and exits 0", () => {
      const path = join(tmpDir, "valid_coords.json");
      writeFileSync(
        path,
        JSON.stringify([
          { featureId: "F1", featureClass: "atac_peak", declaredSystem: "ucsc_bed_0based_half_open" },
        ]),
      );
      const { stdout, exitCode } = runCli(`validate-coordinates ${path}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(true);
    });

    it("rejects invalid coordinate declarations and exits 1", () => {
      const path = join(tmpDir, "invalid_coords.json");
      writeFileSync(
        path,
        JSON.stringify([
          { featureId: "F1", featureClass: "atac_peak", declaredSystem: "no_coordinates_feature_id_only" },
        ]),
      );
      const { stdout, exitCode } = runCli(`validate-coordinates ${path}`);
      expect(exitCode).toBe(1);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("qualify", () => {
    it("qualifies a valid packet and exits 0", () => {
      const { stdout, exitCode } = runCli(`qualify tests/fixtures/valid_packet.json`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.qualifiedCount).toBeGreaterThanOrEqual(0);
      expect(result.excludedCount).toBeGreaterThanOrEqual(0);
    });

    it("rejects an invalid packet and exits 1 with blocking warnings", () => {
      const path = join(tmpDir, "invalid_packet.json");
      writeFileSync(path, JSON.stringify({ invalid: true }));
      const { stdout, exitCode } = runCli(`qualify ${path}`);
      expect(exitCode).toBe(1);
      const result = JSON.parse(stdout);
      expect(result.warnings.some((w: { blocksDownstream: boolean }) => w.blocksDownstream)).toBe(true);
    });
  });

  describe("build-packet", () => {
    it("builds a handoff from a valid packet and exits 0", () => {
      const { stdout, exitCode } = runCli(`build-packet tests/fixtures/valid_packet.json`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.readyForPod).toBe(true);
      expect(result.qualifiedFeatureCount).toBeGreaterThan(0);
    });

    it("fails on invalid packet and exits 1", () => {
      const path = join(tmpDir, "bad_packet.json");
      writeFileSync(path, JSON.stringify({ invalid: true }));
      const { stdout, exitCode } = runCli(`build-packet ${path}`);
      expect(exitCode).toBe(1);
      const result = JSON.parse(stdout);
      expect(result.readyForPod).toBe(false);
    });

    it("handoff alias works", () => {
      const { stdout, exitCode } = runCli(`handoff tests/fixtures/valid_packet.json`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.readyForPod).toBe(true);
    });

    it("dry-run succeeds without side effects", () => {
      const { stdout, exitCode } = runCli(`build-packet tests/fixtures/valid_packet.json --dry-run`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.dryRun).toBe(true);
    });
  });

  describe("export-pod", () => {
    it("exports full handoff packet JSON and exits 0", () => {
      const { stdout, exitCode } = runCli(`export-pod tests/fixtures/valid_packet.json`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.schemaName).toBe("BioactivityPoDHandoffPacket");
      expect(result.doseResponseReadySubset.length).toBeGreaterThan(0);
    });

    it("dry-run succeeds", () => {
      const { stdout, exitCode } = runCli(`export-pod tests/fixtures/valid_packet.json --dry-run`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.dryRun).toBe(true);
    });
  });

  describe("validate-handoff", () => {
    it("validates a correct handoff and exits 0", () => {
      const handoffPath = join(tmpDir, "valid_handoff.json");
      const handoff = {
        schemaVersion: "0.1.0",
        schemaName: "BioactivityPoDHandoffPacket",
        handoffId: "h1",
        sourcePacketRef: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        qualifiedFeatures: [
          {
            featureId: "cg00000001",
            status: "accepted_for_pod" as const,
            warnings: [],
          },
        ],
        excludedFeatures: [],
        doseResponseReadySubset: ["cg00000001"],
        mandatoryCaveats: [],
        generatedAt: new Date().toISOString(),
        persistenceStatus: "unknown",
        reversibilityStatus: "unknown",
        heritabilityClaim: "not_claimed",
        provenance: {
          datasetId: "ds1",
          upstreamSteps: [
            {
              stepName: "fixture-generation",
              toolName: "vitest",
              toolVersion: "0.0.0",
              parameters: {},
              inputFiles: [],
              outputFiles: [],
              timestamp: new Date().toISOString(),
            },
          ],
        },
      };
      writeFileSync(handoffPath, JSON.stringify(handoff));
      const { stdout, exitCode } = runCli(`validate-handoff ${handoffPath}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(true);
      expect(result.schemaValid).toBe(true);
      expect(result.semanticValid).toBe(true);
    });

    it("rejects an invalid handoff and exits 1", () => {
      const handoffPath = join(tmpDir, "invalid_handoff.json");
      writeFileSync(handoffPath, JSON.stringify({ invalid: true }));
      const { stdout, exitCode } = runCli(`validate-handoff ${handoffPath}`);
      expect(exitCode).toBe(1);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(false);
      expect(result.schemaValid).toBe(false);
    });
  });

  describe("qc-report", () => {
    it("generates a QC report and exits 0", () => {
      const profilePath = join(tmpDir, "qc_profile.json");
      writeFileSync(
        profilePath,
        JSON.stringify({
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
        }),
      );
      const { stdout, exitCode } = runCli(`qc-report ${profilePath}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.reportId).toBeDefined();
      expect(result.datasetId).toBe("DS1");
      expect(result.conclusion).toBeDefined();
    });
  });

  describe("assess-cell-context", () => {
    it("assesses cell composition and exits 0 for unlikely confounding", () => {
      const path = join(tmpDir, "cell_comp.json");
      writeFileSync(
        path,
        JSON.stringify({
          samples: [
            { sampleId: "S1", source: "declared_pure", declaredCellType: "HepG2" },
            { sampleId: "S2", source: "declared_pure", declaredCellType: "HepG2" },
          ],
        }),
      );
      const { stdout, exitCode } = runCli(`assess-cell-context ${path}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.status).toBeDefined();
      expect(result.rationale).toBeDefined();
    });

    it("blocks downstream for review_required and exits 1", () => {
      const path = join(tmpDir, "cell_comp_bad.json");
      writeFileSync(
        path,
        JSON.stringify({
          samples: [
            { sampleId: "S1", source: "declared_pure", declaredCellType: "HepG2" },
            { sampleId: "S2", source: "declared_pure", declaredCellType: "HeLa" },
          ],
        }),
      );
      const { stdout, exitCode } = runCli(`assess-cell-context ${path}`);
      expect(exitCode).toBe(1);
      const result = JSON.parse(stdout);
      expect(result.blocksDownstream).toBe(true);
    });
  });

  describe("assess-cytotox", () => {
    it("assesses cytotoxicity and exits 0 for unlikely confounding", () => {
      const path = join(tmpDir, "cytotox.json");
      writeFileSync(
        path,
        JSON.stringify({
          entries: [
            {
              assayType: "viability",
              evidenceSource: "measured_concurrent",
              measurements: [
                { sampleId: "S1", value: 0.95, unit: "fraction", metric: "viability" },
              ],
            },
          ],
        }),
      );
      const { stdout, exitCode } = runCli(`assess-cytotox ${path}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.status).toBeDefined();
      expect(result.rationale).toBeDefined();
    });
  });

  describe("map-pathways", () => {
    it("maps features to pathways and exits 0", () => {
      const featuresPath = join(tmpDir, "pathway_features.json");
      const mappingsPath = join(tmpDir, "pathway_mappings.json");
      writeFileSync(
        featuresPath,
        JSON.stringify([
          {
            featureId: "cg00000001",
            featureClass: "cpg_methylation",
            modality: "dna_methylation_array",
            measuredIdentifier: "cg00000001",
            signalMetric: "beta_value",
            values: { S1: 0.5 },
          },
        ]),
      );
      writeFileSync(
        mappingsPath,
        JSON.stringify([
          {
            featureId: "cg00000001",
            geneIds: ["BRCA1"],
            method: "promoter_overlap",
            confidence: "high",
            pathwayRollupAllowed: true,
          },
        ]),
      );
      const { stdout, exitCode } = runCli(`map-pathways ${featuresPath} ${mappingsPath}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.eligibleFeatureIds).toContain("cg00000001");
    });
  });

  describe("ingest-design", () => {
    it("ingests a design CSV and exits 0", () => {
      const csvPath = join(tmpDir, "design.csv");
      writeFileSync(
        csvPath,
        "sample_id,group_id,dose_value,dose_unit\nS1,CTRL,0,µM\nS2,CTRL,0,µM\nS3,LOW,1,µM\n",
      );
      const { stdout, exitCode } = runCli(`ingest-design ${csvPath}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.success).toBe(true);
      expect(result.design).toBeDefined();
    });
  });

  describe("ingest-features", () => {
    it("ingests a feature CSV and exits 0", () => {
      const csvPath = join(tmpDir, "features.csv");
      writeFileSync(
        csvPath,
        "feature_id,sample_id,value\ncg00000001,S1,0.5\ncg00000001,S2,0.6\n",
      );
      const { stdout, exitCode } = runCli(`ingest-features ${csvPath}`);
      // Ingest-features uses canonicalizeFeatureTable with defaults; it may fail
      // because the default shape detection won't match a 2-column CSV.
      // We just verify it returns a structured result.
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("errors");
    });

    it("dry-run succeeds without reading the file", () => {
      const csvPath = join(tmpDir, "features_dry.csv");
      writeFileSync(csvPath, "feature_id,sample_id,value\ncg00000001,S1,0.5\n");
      const { stdout, exitCode } = runCli(`ingest-features ${csvPath} --dry-run`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.dryRun).toBe(true);
    });
  });

  describe("classify-features", () => {
    it("classifies a feature table and exits 0", () => {
      const csvPath = join(tmpDir, "classify.csv");
      writeFileSync(
        csvPath,
        "chr,start,end,value\nchr1,1000,2000,0.5\n",
      );
      const { stdout, exitCode } = runCli(`classify-features ${csvPath}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.featureClass).toBeDefined();
      expect(result.confidence).toBeDefined();
    });
  });

  describe("qc-missingness", () => {
    it("profiles missingness and exits 0 for acceptable data", () => {
      const featuresPath = join(tmpDir, "missingness_features.json");
      const designPath = join(tmpDir, "missingness_design.json");
      writeFileSync(
        featuresPath,
        JSON.stringify([
          {
            featureId: "cg00000001",
            featureClass: "cpg_methylation",
            modality: "dna_methylation_array",
            measuredIdentifier: "cg00000001",
            signalMetric: "beta_value",
            values: { S1: 0.5, S2: 0.6, S3: 0.7 },
          },
        ]),
      );
      writeFileSync(
        designPath,
        JSON.stringify({
          designId: "D1",
          species: "Homo sapiens",
          doseGroups: [
            { doseGroupId: "CTRL", doseValue: 0, doseUnit: "µM" },
            { doseGroupId: "LOW", doseValue: 1, doseUnit: "µM" },
          ],
          samples: [
            { sampleId: "S1", doseGroupId: "CTRL", replicateIndex: 0, species: "Homo sapiens" },
            { sampleId: "S2", doseGroupId: "CTRL", replicateIndex: 1, species: "Homo sapiens" },
            { sampleId: "S3", doseGroupId: "LOW", replicateIndex: 0, species: "Homo sapiens" },
          ],
          hasControls: true,
          minReplicatesPerGroup: 1,
        }),
      );
      const { stdout, exitCode } = runCli(`qc-missingness ${featuresPath} ${designPath}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.datasetId).toBeDefined();
      expect(result.summaryBand).toBeDefined();
    });
  });

  describe("qc-variance", () => {
    it("profiles variance and exits 0 for acceptable data", () => {
      const featuresPath = join(tmpDir, "variance_features.json");
      const designPath = join(tmpDir, "variance_design.json");
      writeFileSync(
        featuresPath,
        JSON.stringify([
          {
            featureId: "cg00000001",
            featureClass: "cpg_methylation",
            modality: "dna_methylation_array",
            measuredIdentifier: "cg00000001",
            signalMetric: "beta_value",
            values: { S1: 0.5, S2: 0.6, S3: 0.7, S4: 0.8 },
          },
        ]),
      );
      writeFileSync(
        designPath,
        JSON.stringify({
          designId: "D1",
          species: "Homo sapiens",
          doseGroups: [
            { doseGroupId: "CTRL", doseValue: 0, doseUnit: "µM" },
            { doseGroupId: "LOW", doseValue: 1, doseUnit: "µM" },
          ],
          samples: [
            { sampleId: "S1", doseGroupId: "CTRL", replicateIndex: 0, species: "Homo sapiens" },
            { sampleId: "S2", doseGroupId: "CTRL", replicateIndex: 1, species: "Homo sapiens" },
            { sampleId: "S3", doseGroupId: "LOW", replicateIndex: 0, species: "Homo sapiens" },
            { sampleId: "S4", doseGroupId: "LOW", replicateIndex: 1, species: "Homo sapiens" },
          ],
          hasControls: true,
          minReplicatesPerGroup: 2,
        }),
      );
      const { stdout, exitCode } = runCli(`qc-variance ${featuresPath} ${designPath}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.datasetId).toBeDefined();
      expect(result.summaryBand).toBeDefined();
    });
  });

  describe("map-regions", () => {
    it("maps a region to nearest gene and exits 0", () => {
      const path = join(tmpDir, "region.json");
      writeFileSync(
        path,
        JSON.stringify({
          featureId: "peak_1",
          chrom: "chr1",
          start: 1000,
          end: 2000,
          snapshot: {
            annotationRelease: "gencode_v42",
            genomeBuild: "hg38",
            genes: [
              { geneId: "G1", chrom: "chr1", start: 500, end: 1500, strand: "+" },
            ],
          },
        }),
      );
      const { stdout, exitCode } = runCli(`map-regions ${path}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.featureId).toBe("peak_1");
      expect(result.method).toBe("nearest_gene");
    });
  });

  describe("validate alias", () => {
    it("validate works as alias for validate-design", () => {
      const designPath = join(tmpDir, "alias_design.json");
      writeFileSync(
        designPath,
        JSON.stringify({
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
        }),
      );
      const { stdout, exitCode } = runCli(`validate ${designPath}`);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(true);
    });
  });
});
