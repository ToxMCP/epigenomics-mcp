import { describe, it, expect } from "vitest";
import {
  validateHandoffPacket,
  validateHandoffWithSource,
} from "../../src/validators/handoff.js";
import {
  loadSyntheticFixture,
  SYNTHETIC_FIXTURE_NAMES,
} from "../../benchmarks/fixtures/synthetic/index.js";

function makeValidHandoff(): Record<string, unknown> {
  return {
    schemaVersion: "0.1.0",
    schemaName: "BioactivityPoDHandoffPacket",
    handoffId: "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    sourcePacketRef: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    qualifiedFeatures: [
      {
        featureId: "cg00000001",
        status: "accepted_for_pod",
        warnings: [],
        mappedGeneIds: ["BRCA1"],
        mappingConfidence: "high",
        mappingMethod: "direct_promoter_overlap",
      },
      {
        featureId: "cg00000002",
        status: "accepted_with_caveats",
        warnings: [
          {
            warningCode: "EPIW001",
            severity: "warning",
            message: "Caveat",
            category: "missing_metadata",
            blocksDownstream: false,
          },
        ],
        mappedGeneIds: ["TP53"],
        mappingConfidence: "high",
        mappingMethod: "direct_promoter_overlap",
      },
    ],
    excludedFeatures: [
      {
        featureId: "cg00000003",
        status: "excluded_qc_failure",
        warnings: [
          {
            warningCode: "EPIE002",
            severity: "error",
            message: "Too much missingness",
            category: "platform_specific",
            blocksDownstream: true,
            featureIds: ["cg00000003"],
          },
        ],
        mappedGeneIds: [],
        mappingConfidence: "none",
        mappingMethod: "unknown",
      },
    ],
    doseResponseReadySubset: ["cg00000001", "cg00000002"],
    mandatoryCaveats: [],
    generatedAt: "2026-05-05T00:00:00Z",
  };
}

describe("validateHandoffPacket", () => {
  it("passes for a fully valid handoff", () => {
    const result = validateHandoffPacket(makeValidHandoff());
    expect(result.valid).toBe(true);
    expect(result.schemaValid).toBe(true);
    expect(result.semanticValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.errorCode).toBeUndefined();
  });

  it("fails for invalid schema with EPI010", () => {
    const result = validateHandoffPacket({ bad: true });
    expect(result.valid).toBe(false);
    expect(result.schemaValid).toBe(false);
    expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("fails when doseResponseReadySubset contains featureId not in qualifiedFeatures", () => {
    const handoff = makeValidHandoff();
    handoff.doseResponseReadySubset = ["cg00000001", "missing-id"];
    const result = validateHandoffPacket(handoff);
    expect(result.valid).toBe(false);
    expect(result.semanticValid).toBe(false);
    expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
    expect(result.errors.some((e) => e.includes("missing-id"))).toBe(true);
  });

  it("fails when doseResponseReadySubset contains feature with non-accepted status", () => {
    const handoff = makeValidHandoff();
    (handoff.qualifiedFeatures as Record<string, unknown>[])[0].status =
      "excluded_qc_failure";
    const result = validateHandoffPacket(handoff);
    expect(result.valid).toBe(false);
    expect(result.semanticValid).toBe(false);
    expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
    expect(
      result.errors.some((e) =>
        e.includes("cg00000001") && e.includes("non-accepted"),
      ),
    ).toBe(true);
  });

  it("fails when doseResponseReadySubset intersects excludedFeatures", () => {
    const handoff = makeValidHandoff();
    handoff.doseResponseReadySubset = ["cg00000001", "cg00000003"];
    const result = validateHandoffPacket(handoff);
    expect(result.valid).toBe(false);
    expect(result.semanticValid).toBe(false);
    expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
    expect(result.errors.some((e) => e.includes("cg00000003"))).toBe(true);
  });

  it("fails when qualifiedFeatures contains duplicate featureIds", () => {
    const handoff = makeValidHandoff();
    handoff.qualifiedFeatures = [
      ...(handoff.qualifiedFeatures as Record<string, unknown>[]),
      {
        featureId: "cg00000001",
        status: "accepted_for_pod",
        warnings: [],
      },
    ];
    const result = validateHandoffPacket(handoff);
    expect(result.valid).toBe(false);
    expect(result.semanticValid).toBe(false);
    expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("fails when excludedFeatures contains duplicate featureIds", () => {
    const handoff = makeValidHandoff();
    handoff.excludedFeatures = [
      ...(handoff.excludedFeatures as Record<string, unknown>[]),
      {
        featureId: "cg00000003",
        status: "excluded_qc_failure",
        warnings: [],
      },
    ];
    const result = validateHandoffPacket(handoff);
    expect(result.valid).toBe(false);
    expect(result.semanticValid).toBe(false);
    expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("fails when a featureId appears in both qualifiedFeatures and excludedFeatures", () => {
    const handoff = makeValidHandoff();
    handoff.excludedFeatures = [
      ...(handoff.excludedFeatures as Record<string, unknown>[]),
      {
        featureId: "cg00000001",
        status: "excluded_qc_failure",
        warnings: [],
      },
    ];
    const result = validateHandoffPacket(handoff);
    expect(result.valid).toBe(false);
    expect(result.semanticValid).toBe(false);
    expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
    expect(
      result.errors.some((e) =>
        e.includes("cg00000001") && e.includes("both"),
      ),
    ).toBe(true);
  });

  it("fails when an excludedFeature has accepted status", () => {
    const handoff = makeValidHandoff();
    (handoff.excludedFeatures as Record<string, unknown>[])[0].status =
      "accepted_for_pod";
    const result = validateHandoffPacket(handoff);
    expect(result.valid).toBe(false);
    expect(result.semanticValid).toBe(false);
    expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
    expect(
      result.errors.some(
        (e) => e.includes("cg00000003") && e.includes("accepted status"),
      ),
    ).toBe(true);
  });

  it("warns when mandatoryCaveats contain blocksDownstream=true", () => {
    const handoff = makeValidHandoff();
    handoff.mandatoryCaveats = [
      {
        warningCode: "EPI007",
        severity: "error",
        message: "Blocking caveat",
        category: "cytotoxicity",
        blocksDownstream: true,
      },
    ];
    const result = validateHandoffPacket(handoff);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("mandatory caveat"))).toBe(
      true,
    );
  });

  it("fails for exploratory_only status in doseResponseReadySubset", () => {
    const handoff = makeValidHandoff();
    (handoff.qualifiedFeatures as Record<string, unknown>[])[1].status =
      "exploratory_only";
    const result = validateHandoffPacket(handoff);
    expect(result.valid).toBe(false);
    expect(result.semanticValid).toBe(false);
    expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
    expect(
      result.errors.some(
        (e) => e.includes("cg00000002") && e.includes("exploratory_only"),
      ),
    ).toBe(true);
  });

  describe("benchmark fixtures", () => {
    const handoffFixtures = SYNTHETIC_FIXTURE_NAMES.filter((name) =>
      name.startsWith("bm_handoff_"),
    );

    it.each(handoffFixtures)(
      "%s matches expected policy",
      (fixtureName) => {
        const fixture = loadSyntheticFixture(fixtureName);
        const result = validateHandoffPacket(fixture.handoff);
        const policy = fixture.expectedPolicy;

        if (policy.expectedSchemaValid) {
          expect(result.schemaValid).toBe(true);
        } else {
          expect(result.schemaValid).toBe(false);
        }

        if (policy.expectedBlocksDownstream) {
          expect(result.valid).toBe(false);
          expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
        }

        if (policy.expectedHandoffReady) {
          expect(result.valid).toBe(true);
          expect(result.errorCode).toBeUndefined();
        } else {
          expect(result.valid).toBe(false);
        }
      },
    );
  });
});

describe("validateHandoffWithSource", () => {
  it("passes when source packetId matches sourcePacketRef", () => {
    const handoff = makeValidHandoff();
    const sourcePacket = {
      packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    };
    const result = validateHandoffWithSource(handoff, sourcePacket);
    expect(result.valid).toBe(true);
  });

  it("fails when source packetId does not match sourcePacketRef", () => {
    const handoff = makeValidHandoff();
    const sourcePacket = {
      packetId: "different-id",
    };
    const result = validateHandoffWithSource(handoff, sourcePacket);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
    expect(
      result.errors.some((e) => e.includes("does not match")),
    ).toBe(true);
  });

  it("returns base validation errors when handoff is schema-invalid", () => {
    const result = validateHandoffWithSource({ bad: true }, {});
    expect(result.valid).toBe(false);
    expect(result.schemaValid).toBe(false);
    expect(result.errorCode).toBe("EPI010_HANDOFF_SCHEMA_INVALID");
  });
});
