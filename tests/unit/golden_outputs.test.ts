import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  loadSyntheticFixture,
  SYNTHETIC_FIXTURE_NAMES,
} from "../../benchmarks/fixtures/synthetic/index.js";
import { validateDesign } from "../../src/validators/design.js";
import { profileQc } from "../../src/qc/profiler.js";
import { profileMissingness } from "../../src/qc/missingness.js";
import { qualifyFeatures } from "../../src/qualification/engine.js";
import { buildHandoffPacket } from "../../src/handoff/builder.js";
import { BioactivityPoDHandoffPacketSchema } from "../../src/contracts/packets.js";

const EXPECTED_BASE = join(process.cwd(), "benchmarks", "expected");

const DETERMINISTIC_PACKET_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const DETERMINISTIC_HANDOFF_ID = "b2c3d4e5-f6a7-8901-bcde-f23456789012";
const DETERMINISTIC_TIMESTAMP = "2026-05-05T00:00:00Z";

function loadExpected(fixtureName: string, filename: string): unknown {
  const path = join(EXPECTED_BASE, fixtureName, filename);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function buildPacket(
  fixtureName: string,
  featureTable: unknown[] | null,
  design: unknown | null,
  metadata: unknown | null,
) {
  const meta = metadata as Record<string, unknown> | null;
  const datasetId =
    (meta?.datasetId as string) ?? `${fixtureName}-ds-001`;
  const provenance =
    (meta?.provenance as Record<string, unknown>) ?? {
      datasetId,
      upstreamSteps: [
        {
          stepName: "normalisation",
          toolName: "minfi",
          toolVersion: "1.44.0",
          parameters: {},
        },
      ],
    };

  const features = featureTable ?? [];

  return {
    schemaVersion: "0.1.0" as const,
    schemaName: "EpigenomicsFeatureResponsePacket" as const,
    packetId: DETERMINISTIC_PACKET_ID,
    datasetMetadataRef: datasetId,
    designRef: (design as Record<string, unknown> | null)?.designId ?? `${fixtureName}-design-001`,
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

describe("golden expected outputs", () => {
  for (const fixtureName of SYNTHETIC_FIXTURE_NAMES) {
    const fixture = loadSyntheticFixture(fixtureName);

    if (fixtureName.startsWith("bm_handoff_")) {
      describe(`${fixtureName} handoff validation`, () => {
        it("matches golden handoff_validation.json", () => {
          const handoff = fixture.handoff;
          const parseResult = BioactivityPoDHandoffPacketSchema.safeParse(handoff);
          const actual = {
            schemaValid: parseResult.success,
            errors: parseResult.success
              ? []
              : parseResult.error.issues.map(
                  (i) => `${i.path.join(".")}: ${i.message}`,
                ),
          };
          const expected = loadExpected(fixtureName, "handoff_validation.json");
          expect(actual).toEqual(expected);
        });

        it("matches golden handoff.json", () => {
          const expected = loadExpected(fixtureName, "handoff.json");
          expect(fixture.handoff).toEqual(expected);
        });
      });

      continue;
    }

    describe(`${fixtureName} full workflow`, () => {
      const featureTable = fixture.featureTable ?? [];
      const design = fixture.design;
      const metadata = fixture.metadata;
      const packet = buildPacket(fixtureName, featureTable, design, metadata);

      it("matches golden design_validation.json", () => {
        const actual = validateDesign(design);
        const expected = loadExpected(fixtureName, "design_validation.json");
        expect(actual).toEqual(expected);
      });

      it("matches golden qc_profile.json", () => {
        const datasetId =
          (metadata as Record<string, unknown> | null)?.datasetId ??
          `${fixtureName}-ds-001`;
        const actual = profileQc(
          datasetId,
          featureTable as import("../../src/contracts/features.js").EpigenomicFeature[],
          design as import("../../src/contracts/design.js").ExperimentalDesign,
        );
        const expected = loadExpected(fixtureName, "qc_profile.json");
        expect(actual).toEqual(expected);
      });

      it("matches golden missingness_profile.json", () => {
        const datasetId =
          (metadata as Record<string, unknown> | null)?.datasetId ??
          `${fixtureName}-ds-001`;
        const actual = profileMissingness(
          datasetId,
          featureTable as import("../../src/contracts/features.js").EpigenomicFeature[],
          design as import("../../src/contracts/design.js").ExperimentalDesign,
        );
        const expected = loadExpected(fixtureName, "missingness_profile.json");
        expect(actual).toEqual(expected);
      });

      it("matches golden qualification_result.json", () => {
        const actual = qualifyFeatures(packet);
        const expected = loadExpected(fixtureName, "qualification_result.json");
        expect(actual).toEqual(expected);
      });

      it("matches golden handoff_result.json", () => {
        const actual = buildHandoffPacket(packet, {
          handoffId: DETERMINISTIC_HANDOFF_ID,
          generatedAt: DETERMINISTIC_TIMESTAMP,
        });
        const expected = loadExpected(fixtureName, "handoff_result.json");
        expect(actual).toEqual(expected);
      });

      it("matches golden packet.json", () => {
        const expected = loadExpected(fixtureName, "packet.json");
        expect(packet).toEqual(expected);
      });
    });
  }
});

describe("golden output stability", () => {
  it("all expected fixture directories exist", () => {
    for (const name of SYNTHETIC_FIXTURE_NAMES) {
      const dir = join(EXPECTED_BASE, name);
      expect(existsSync(dir)).toBe(true);
    }
  });

  it("all feature fixtures have the required golden files", () => {
    const requiredFiles = [
      "design_validation.json",
      "qc_profile.json",
      "missingness_profile.json",
      "qualification_result.json",
      "handoff_result.json",
      "packet.json",
    ];

    for (const name of SYNTHETIC_FIXTURE_NAMES) {
      if (name.startsWith("bm_handoff_")) continue;
      for (const file of requiredFiles) {
        const path = join(EXPECTED_BASE, name, file);
        expect(existsSync(path)).toBe(true);
      }
    }
  });

  it("all handoff fixtures have the required golden files", () => {
    for (const name of SYNTHETIC_FIXTURE_NAMES) {
      if (!name.startsWith("bm_handoff_")) continue;
      expect(existsSync(join(EXPECTED_BASE, name, "handoff_validation.json"))).toBe(true);
      expect(existsSync(join(EXPECTED_BASE, name, "handoff.json"))).toBe(true);
    }
  });
});
