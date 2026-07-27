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
import {
  BioactivityPoDHandoffPacketSchema,
  EpigenomicsFeatureResponsePacketSchema,
} from "../../src/contracts/packets.js";
import {
  buildBenchmarkPacket,
  loadBenchmarkQualificationContext,
} from "../../src/benchmarks/runner.js";

const EXPECTED_BASE = join(process.cwd(), "benchmarks", "expected");

const DETERMINISTIC_PACKET_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const DETERMINISTIC_HANDOFF_ID = "b2c3d4e5-f6a7-8901-bcde-f23456789012";
const DETERMINISTIC_TIMESTAMP = "2026-05-05T00:00:00Z";

function loadExpected(fixtureName: string, filename: string): unknown {
  const path = join(EXPECTED_BASE, fixtureName, filename);
  return JSON.parse(readFileSync(path, "utf-8"));
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
      const fixturePath = join(
        process.cwd(),
        "benchmarks",
        "fixtures",
        "synthetic",
        fixtureName,
      );
      const packet = buildBenchmarkPacket(fixturePath, fixtureName, {
        deterministicPacketId: DETERMINISTIC_PACKET_ID,
        deterministicHandoffId: DETERMINISTIC_HANDOFF_ID,
        deterministicTimestamp: DETERMINISTIC_TIMESTAMP,
      });
      const qualificationContext =
        loadBenchmarkQualificationContext(fixturePath);

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
        const actual = qualifyFeatures(packet, qualificationContext);
        const expected = loadExpected(fixtureName, "qualification_result.json");
        expect(actual).toEqual(expected);
      });

      it("matches golden handoff_result.json", () => {
        const actual = buildHandoffPacket(packet, {
          handoffId: DETERMINISTIC_HANDOFF_ID,
          generatedAt: DETERMINISTIC_TIMESTAMP,
          qualificationContext,
        });
        const expected = loadExpected(fixtureName, "handoff_result.json");
        expect(actual).toEqual(expected);
      });

      it("matches golden packet.json", () => {
        const expected = loadExpected(fixtureName, "packet.json");
        expect(packet).toEqual(expected);
      });

      it("matches the human-readable expected policy declaration", () => {
        const qualification = qualifyFeatures(packet, qualificationContext);
        const handoff = buildHandoffPacket(packet, {
          handoffId: DETERMINISTIC_HANDOFF_ID,
          generatedAt: DETERMINISTIC_TIMESTAMP,
          qualificationContext,
        });
        const allWarnings = [
          ...qualification.warnings,
          ...(qualification.qualifications ?? []).flatMap(
            (item) => item.warnings,
          ),
        ];
        const actualWarningCodes = new Set(
          allWarnings.map((warning) => warning.warningCode),
        );

        expect(
          EpigenomicsFeatureResponsePacketSchema.safeParse(packet).success,
        ).toBe(fixture.expectedPolicy.expectedSchemaValid);
        if (fixture.expectedPolicy.expectedQualificationStatus) {
          if (
            fixture.expectedPolicy.expectedQualificationStatus ===
            "packet_schema_invalid"
          ) {
            expect(qualification.warnings[0]?.warningCode).toBe(
              "EPI001_PACKET_SCHEMA_INVALID",
            );
          } else {
            expect(
              qualification.qualifications?.some(
                (item) =>
                  item.status ===
                  fixture.expectedPolicy.expectedQualificationStatus,
              ),
            ).toBe(true);
          }
        }
        for (const warningCode of fixture.expectedPolicy.expectedWarnings ?? []) {
          expect(actualWarningCodes.has(warningCode)).toBe(true);
        }
        expect(
          allWarnings.some((warning) => warning.blocksDownstream),
        ).toBe(fixture.expectedPolicy.expectedBlocksDownstream);
        expect(handoff.readyForPod).toBe(
          fixture.expectedPolicy.expectedHandoffReady,
        );
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
