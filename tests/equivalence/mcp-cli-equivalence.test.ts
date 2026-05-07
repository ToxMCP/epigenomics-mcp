import { describe, it, expect } from "vitest";
import { qualifyFeatures } from "../../src/qualification/engine.js";
import { buildHandoffPacket } from "../../src/handoff/builder.js";
import { validateDesign } from "../../src/validators/design.js";
import { validateCoordinateSystemDeclarations } from "../../src/validators/coordinate_validator.js";
import { profileMissingness } from "../../src/qc/missingness.js";
import { generateQcReport } from "../../src/reports/qc_report.js";
import {
  runEquivalence,
  assertEquivalent,
  stripFields,
} from "../helpers/equivalence.js";
import type { SyntheticFixtureName } from "../../benchmarks/fixtures/synthetic/index.js";

describe("MCP / CLI / Service output equivalence", () => {
  // -------------------------------------------------------------------------
  // qualify_features ↔ qualify
  // -------------------------------------------------------------------------
  describe("qualify", () => {
    const fixtures: SyntheticFixtureName[] = [
      "bm_beta_manifest_complete",
      "bm_build_missing",
      "bm_dmr_nearest_gene_only",
      "bm_high_missingness",
      "bm_dominant_cytotoxicity",
    ];

    for (const fixture of fixtures) {
      it(`${fixture} produces identical output across all pathways`, async () => {
        const results = await runEquivalence(qualifyFeatures, {
          mcpToolName: "qualify_features",
          cliCommand: "qualify",
          buildMcpArgs: (packet) => ({ packet }),
          buildCliArgs: (path) => `qualify ${path}`,
        }, fixture);

        assertEquivalent(results, { context: fixture });
      });
    }
  });

  // -------------------------------------------------------------------------
  // generate_handoff ↔ build-packet
  // -------------------------------------------------------------------------
  describe("build-packet", () => {
    const fixtures: SyntheticFixtureName[] = [
      "bm_beta_manifest_complete",
      "bm_build_missing",
      "bm_dmr_nearest_gene_only",
      "bm_high_missingness",
      "bm_dominant_cytotoxicity",
    ];

    for (const fixture of fixtures) {
      it(`${fixture} produces identical output across all pathways`, async () => {
        const results = await runEquivalence(buildHandoffPacket, {
          mcpToolName: "generate_handoff",
          cliCommand: "build-packet",
          buildMcpArgs: (packet) => ({ packet }),
          buildCliArgs: (path) => `build-packet ${path}`,
          normalize: (value) =>
            stripFields(value, ["handoffId"]),
        }, fixture);

        assertEquivalent(results, { context: fixture });
      });
    }
  });

  // -------------------------------------------------------------------------
  // validate_design ↔ validate-design
  // -------------------------------------------------------------------------
  describe("validate-design", () => {
    const fixtures: SyntheticFixtureName[] = [
      "bm_beta_manifest_complete",
      "bm_build_missing",
      "bm_dmr_nearest_gene_only",
      "bm_high_missingness",
      "bm_dominant_cytotoxicity",
    ];

    for (const fixture of fixtures) {
      it(`${fixture} produces identical output across all pathways`, async () => {
        const { loadSyntheticFixture } = await import(
          "../../benchmarks/fixtures/synthetic/index.js"
        );
        const f = loadSyntheticFixture(fixture);
        const design = f.design;

        // Service
        const serviceResult = validateDesign(design);

        // MCP
        const { TOOL_DEFINITIONS } = await import(
          "../../src/epimcp/tool_registry.js"
        );
        const tool = TOOL_DEFINITIONS.find((t) => t.name === "validate_design");
        expect(tool).toBeDefined();
        const mcpRaw = await tool!.handler({ design });
        const mcpResult = JSON.parse(mcpRaw.content[0].text);

        // CLI
        const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        const { execSync } = await import("node:child_process");

        const tmpDir = mkdtempSync(join(tmpdir(), "epimcp-equiv-design-"));
        const designPath = join(tmpDir, "design.json");
        writeFileSync(designPath, JSON.stringify(design, null, 2));

        let cliResult: unknown;
        try {
          const stdout = execSync(
            `npx tsx src/epimcp/cli.ts validate-design ${designPath}`,
            {
              encoding: "utf-8",
              cwd: process.cwd(),
              stdio: "pipe",
            },
          );
          cliResult = JSON.parse(stdout);
        } catch (err) {
          const execErr = err as { stdout?: string };
          cliResult = execErr.stdout ? JSON.parse(execErr.stdout) : {};
        } finally {
          rmSync(tmpDir, { recursive: true, force: true });
        }

        assertEquivalent(
          {
            service: serviceResult,
            mcp: mcpResult,
            cli: cliResult,
          },
          { context: `${fixture} validate-design` },
        );
      });
    }
  });

  // -------------------------------------------------------------------------
  // validate_coordinates ↔ validate-coordinates
  // -------------------------------------------------------------------------
  describe("validate-coordinates", () => {
    it("produces identical output across all pathways", async () => {
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

      // Service
      const serviceResult = validateCoordinateSystemDeclarations(declarations);

      // MCP
      const { TOOL_DEFINITIONS } = await import(
        "../../src/epimcp/tool_registry.js"
      );
      const tool = TOOL_DEFINITIONS.find(
        (t) => t.name === "validate_coordinates",
      );
      expect(tool).toBeDefined();
      const mcpRaw = await tool!.handler({ declarations });
      const mcpResult = JSON.parse(mcpRaw.content[0].text);

      // CLI
      const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const { execSync } = await import("node:child_process");

      const tmpDir = mkdtempSync(join(tmpdir(), "epimcp-equiv-coords-"));
      const path = join(tmpDir, "coords.json");
      writeFileSync(path, JSON.stringify(declarations, null, 2));

      let cliResult: unknown;
      try {
        const stdout = execSync(
          `npx tsx src/epimcp/cli.ts validate-coordinates ${path}`,
          {
            encoding: "utf-8",
            cwd: process.cwd(),
            stdio: "pipe",
          },
        );
        cliResult = JSON.parse(stdout);
      } catch (err) {
        const execErr = err as { stdout?: string };
        cliResult = execErr.stdout ? JSON.parse(execErr.stdout) : {};
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }

      assertEquivalent(
        { service: serviceResult, mcp: mcpResult, cli: cliResult },
        { context: "validate-coordinates" },
      );
    });
  });

  // -------------------------------------------------------------------------
  // profile_missingness ↔ qc-missingness
  // -------------------------------------------------------------------------
  describe("qc-missingness", () => {
    const fixtures: SyntheticFixtureName[] = [
      "bm_beta_manifest_complete",
      "bm_build_missing",
      "bm_dmr_nearest_gene_only",
      "bm_high_missingness",
      "bm_dominant_cytotoxicity",
    ];

    for (const fixture of fixtures) {
      it(`${fixture} produces identical output across all pathways`, async () => {
        const { loadSyntheticFixture } = await import(
          "../../benchmarks/fixtures/synthetic/index.js"
        );
        const f = loadSyntheticFixture(fixture);
        const features = f.featureTable ?? [];
        const design = f.design as Record<string, unknown> | null;
        const datasetId =
          (design?.designId as string) ?? `${fixture}-design-001`;

        // Service
        const serviceResult = profileMissingness(
          datasetId,
          features as Parameters<typeof profileMissingness>[1],
          design as Parameters<typeof profileMissingness>[2],
        );

        // MCP
        const { TOOL_DEFINITIONS } = await import(
          "../../src/epimcp/tool_registry.js"
        );
        const tool = TOOL_DEFINITIONS.find(
          (t) => t.name === "profile_missingness",
        );
        expect(tool).toBeDefined();
        const mcpRaw = await tool!.handler({
          datasetId,
          features,
          design,
        });
        const mcpResult = JSON.parse(mcpRaw.content[0].text);

        // CLI
        const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        const { execSync } = await import("node:child_process");

        const tmpDir = mkdtempSync(join(tmpdir(), "epimcp-equiv-miss-"));
        const featuresPath = join(tmpDir, "features.json");
        const designPath = join(tmpDir, "design.json");
        writeFileSync(featuresPath, JSON.stringify(features, null, 2));
        writeFileSync(designPath, JSON.stringify(design, null, 2));

        let cliResult: unknown;
        try {
          const stdout = execSync(
            `npx tsx src/epimcp/cli.ts qc-missingness ${featuresPath} ${designPath}`,
            {
              encoding: "utf-8",
              cwd: process.cwd(),
              stdio: "pipe",
            },
          );
          cliResult = JSON.parse(stdout);
        } catch (err) {
          const execErr = err as { stdout?: string };
          cliResult = execErr.stdout ? JSON.parse(execErr.stdout) : {};
        } finally {
          rmSync(tmpDir, { recursive: true, force: true });
        }

        assertEquivalent(
          { service: serviceResult, mcp: mcpResult, cli: cliResult },
          { context: `${fixture} qc-missingness` },
        );
      });
    }
  });

  // -------------------------------------------------------------------------
  // generate_qc_report ↔ qc-report
  // -------------------------------------------------------------------------
  describe("qc-report", () => {
    it("produces identical output across all pathways", async () => {
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
      const warnings: unknown[] = [];

      // Service
      const serviceResult = generateQcReport(
        "DS1",
        profile as Parameters<typeof generateQcReport>[1],
        warnings as Parameters<typeof generateQcReport>[2],
      );

      // MCP
      const { TOOL_DEFINITIONS } = await import(
        "../../src/epimcp/tool_registry.js"
      );
      const tool = TOOL_DEFINITIONS.find(
        (t) => t.name === "generate_qc_report",
      );
      expect(tool).toBeDefined();
      const mcpRaw = await tool!.handler({
        datasetId: "DS1",
        profile,
        warnings,
      });
      const mcpResult = JSON.parse(mcpRaw.content[0].text);

      // CLI
      const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const { execSync } = await import("node:child_process");

      const tmpDir = mkdtempSync(join(tmpdir(), "epimcp-equiv-qc-"));
      const profilePath = join(tmpDir, "profile.json");
      writeFileSync(profilePath, JSON.stringify(profile, null, 2));

      let cliResult: unknown;
      try {
        const stdout = execSync(
          `npx tsx src/epimcp/cli.ts qc-report ${profilePath}`,
          {
            encoding: "utf-8",
            cwd: process.cwd(),
            stdio: "pipe",
          },
        );
        cliResult = JSON.parse(stdout);
      } catch (err) {
        const execErr = err as { stdout?: string };
        cliResult = execErr.stdout ? JSON.parse(execErr.stdout) : {};
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }

      const normalize = (value: unknown) =>
        stripFields(value, ["reportId", "generatedAt"]);

      assertEquivalent(
        {
          service: normalize(serviceResult),
          mcp: normalize(mcpResult),
          cli: normalize(cliResult),
        },
        { context: "qc-report" },
      );
    });
  });
});
