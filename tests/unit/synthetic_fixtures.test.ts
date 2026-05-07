import { describe, it, expect } from "vitest";
import {
  discoverSyntheticFixtures,
  loadSyntheticFixture,
  verifyFixtureFiles,
  SYNTHETIC_FIXTURE_NAMES,
} from "../../benchmarks/fixtures/synthetic/index.js";
import { EpigenomicFeatureSchema } from "../../src/contracts/features.js";
import { ExperimentalDesignSchema } from "../../src/contracts/design.js";
import { BioactivityPoDHandoffPacketSchema } from "../../src/contracts/packets.js";
import { qualifyFeatures } from "../../src/qualification/engine.js";
import { buildHandoffPacket, createHandoffPacket } from "../../src/handoff/builder.js";
import { exportHandoffPacket } from "../../src/integrations/bioactivity_pod_client.js";

describe("synthetic fixture discovery", () => {
  it("discovers all 12 synthetic fixtures", () => {
    const fixtures = discoverSyntheticFixtures();
    expect(fixtures).toHaveLength(SYNTHETIC_FIXTURE_NAMES.length);
    const names = fixtures.map((f) => f.name).sort();
    expect(names).toEqual([...SYNTHETIC_FIXTURE_NAMES].sort());
  });

  it("every fixture has required files", () => {
    for (const name of SYNTHETIC_FIXTURE_NAMES) {
      const result = verifyFixtureFiles(name);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    }
  });

  it("every fixture has a non-empty README", () => {
    for (const name of SYNTHETIC_FIXTURE_NAMES) {
      const fixture = loadSyntheticFixture(name);
      expect(fixture.readme.length).toBeGreaterThan(0);
      expect(fixture.readme).toContain("#");
    }
  });

  it("every fixture has an expected_policy with required fields", () => {
    for (const name of SYNTHETIC_FIXTURE_NAMES) {
      const fixture = loadSyntheticFixture(name);
      expect(fixture.expectedPolicy.fixtureName).toBe(name);
      expect(typeof fixture.expectedPolicy.expectedSchemaValid).toBe("boolean");
      expect(typeof fixture.expectedPolicy.expectedBlocksDownstream).toBe("boolean");
      expect(typeof fixture.expectedPolicy.expectedHandoffReady).toBe("boolean");
    }
  });
});

describe("synthetic fixture schema validation", () => {
  it("bm_beta_manifest_complete passes all schema checks", () => {
    const f = loadSyntheticFixture("bm_beta_manifest_complete");
    expect(f.featureTable).not.toBeNull();
    expect(f.design).not.toBeNull();
    for (const feat of f.featureTable!) {
      expect(EpigenomicFeatureSchema.safeParse(feat).success).toBe(true);
    }
    expect(ExperimentalDesignSchema.safeParse(f.design).success).toBe(true);
  });

  it("bm_dmr_nearest_gene_only passes schema checks", () => {
    const f = loadSyntheticFixture("bm_dmr_nearest_gene_only");
    for (const feat of f.featureTable!) {
      expect(EpigenomicFeatureSchema.safeParse(feat).success).toBe(true);
    }
    expect(ExperimentalDesignSchema.safeParse(f.design).success).toBe(true);
  });

  it("bm_build_missing fails feature schema due to missing build", () => {
    const f = loadSyntheticFixture("bm_build_missing");
    expect(f.expectedPolicy.expectedSchemaValid).toBe(false);
    // First feature is valid
    expect(EpigenomicFeatureSchema.safeParse(f.featureTable![0]).success).toBe(true);
    // Second feature is missing build
    expect(EpigenomicFeatureSchema.safeParse(f.featureTable![1]).success).toBe(false);
  });

  it("bm_invalid_coordinate_format fails feature schema due to coordinate errors", () => {
    const f = loadSyntheticFixture("bm_invalid_coordinate_format");
    expect(f.expectedPolicy.expectedSchemaValid).toBe(false);
    // First feature has end < start
    expect(EpigenomicFeatureSchema.safeParse(f.featureTable![0]).success).toBe(false);
    // Second feature has malformed chrom
    expect(EpigenomicFeatureSchema.safeParse(f.featureTable![1]).success).toBe(false);
  });

  it("bm_missing_cell_context passes schema checks", () => {
    const f = loadSyntheticFixture("bm_missing_cell_context");
    expect(EpigenomicFeatureSchema.safeParse(f.featureTable![0]).success).toBe(true);
    expect(ExperimentalDesignSchema.safeParse(f.design).success).toBe(true);
  });

  it("bm_missing_cytotoxicity_context passes schema checks", () => {
    const f = loadSyntheticFixture("bm_missing_cytotoxicity_context");
    expect(EpigenomicFeatureSchema.safeParse(f.featureTable![0]).success).toBe(true);
    expect(ExperimentalDesignSchema.safeParse(f.design).success).toBe(true);
  });

  it("bm_dominant_cytotoxicity passes schema checks", () => {
    const f = loadSyntheticFixture("bm_dominant_cytotoxicity");
    expect(EpigenomicFeatureSchema.safeParse(f.featureTable![0]).success).toBe(true);
    expect(ExperimentalDesignSchema.safeParse(f.design).success).toBe(true);
  });

  it("bm_insufficient_replicates passes schema checks", () => {
    const f = loadSyntheticFixture("bm_insufficient_replicates");
    expect(EpigenomicFeatureSchema.safeParse(f.featureTable![0]).success).toBe(true);
    expect(ExperimentalDesignSchema.safeParse(f.design).success).toBe(true);
  });

  it("bm_high_missingness passes schema checks", () => {
    const f = loadSyntheticFixture("bm_high_missingness");
    for (const feat of f.featureTable!) {
      expect(EpigenomicFeatureSchema.safeParse(feat).success).toBe(true);
    }
    expect(ExperimentalDesignSchema.safeParse(f.design).success).toBe(true);
  });

  it("bm_summary_contrast_only passes schema checks", () => {
    const f = loadSyntheticFixture("bm_summary_contrast_only");
    for (const feat of f.featureTable!) {
      expect(EpigenomicFeatureSchema.safeParse(feat).success).toBe(true);
    }
    expect(ExperimentalDesignSchema.safeParse(f.design).success).toBe(true);
  });

  it("bm_handoff_schema_valid passes handoff schema", () => {
    const f = loadSyntheticFixture("bm_handoff_schema_valid");
    expect(f.handoff).not.toBeNull();
    expect(BioactivityPoDHandoffPacketSchema.safeParse(f.handoff).success).toBe(true);
  });

  it("bm_handoff_schema_invalid fails handoff schema", () => {
    const f = loadSyntheticFixture("bm_handoff_schema_invalid");
    expect(f.handoff).not.toBeNull();
    expect(BioactivityPoDHandoffPacketSchema.safeParse(f.handoff).success).toBe(false);
  });
});

describe("synthetic fixture qualification outcomes", () => {
  function makePacket(fixture: ReturnType<typeof loadSyntheticFixture>) {
    return {
      schemaVersion: "0.1.0" as const,
      schemaName: "EpigenomicsFeatureResponsePacket" as const,
      packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      datasetMetadataRef: "dataset-001",
      designRef: "design-001",
      features: fixture.featureTable ?? [],
      design: fixture.design,
      provenance: {
        datasetId: "dataset-001",
        upstreamSteps: [
          { stepName: "norm", toolName: "minfi", toolVersion: "1.44.0", parameters: {} },
        ],
      },
      qualificationSummary: {
        acceptedCount: (fixture.featureTable ?? []).length,
        excludedCount: 0,
        exploratoryCount: 0,
        caveatCount: 0,
      },
      qcReportRef: "qc-001",
      warnings: [],
      generatedAt: "2026-05-05T00:00:00Z",
    };
  }

  it("bm_beta_manifest_complete qualifies all features", () => {
    const f = loadSyntheticFixture("bm_beta_manifest_complete");
    const packet = makePacket(f);
    const result = qualifyFeatures(packet);
    expect(result.qualifiedCount).toBe(3);
    expect(result.excludedCount).toBe(0);
    const handoff = buildHandoffPacket(packet);
    expect(handoff.readyForPod).toBe(true);
  });

  it("bm_high_missingness excludes the high-missingness feature", () => {
    const f = loadSyntheticFixture("bm_high_missingness");
    const packet = {
      ...makePacket(f),
      qualificationSummary: {
        acceptedCount: 1,
        excludedCount: 1,
        exploratoryCount: 0,
        caveatCount: 0,
      },
    };
    const result = qualifyFeatures(packet);
    expect(result.excludedCount).toBeGreaterThanOrEqual(1);
    const handoff = buildHandoffPacket(packet);
    // The non-missing feature is accepted_with_caveats, so handoff is ready
    expect(handoff.readyForPod).toBe(true);
    expect(handoff.qualifiedFeatureCount).toBeLessThan((f.featureTable ?? []).length);
  });

  it("bm_invalid_coordinate_format produces zero qualified features because packet schema fails", () => {
    // The packet as constructed will still have valid features because we don't
    // re-validate at the feature level inside the packet schema parse in the
    // current engine. However, the fixture's expected_policy says schema invalid.
    // We test that the handoff builder correctly handles an invalid packet.
    const f = loadSyntheticFixture("bm_invalid_coordinate_format");
    const packet = makePacket(f);
    // Force-invalid: replace first feature with the invalid one to ensure packet parse may fail
    // Actually, the packet schema parses features via EpigenomicFeatureSchema, so if we include
    // the invalid feature, the packet parse should fail.
    const invalidPacket = {
      ...packet,
      features: f.featureTable,
    };
    const result = qualifyFeatures(invalidPacket);
    // If packet schema fails, qualifyFeatures returns 0 qualified and 0 excluded
    expect(result.qualifiedCount).toBe(0);
    expect(result.excludedCount).toBe(0);
    expect(result.warnings[0].blocksDownstream).toBe(true);
  });

  it("bm_handoff_schema_valid builds a ready handoff", () => {
    const f = loadSyntheticFixture("bm_handoff_schema_valid");
    const handoff = BioactivityPoDHandoffPacketSchema.parse(f.handoff);
    expect(handoff.doseResponseReadySubset.length).toBeGreaterThan(0);
    expect(handoff.qualifiedFeatures.length).toBeGreaterThan(0);
  });

  it("bm_handoff_schema_invalid rejects the handoff", () => {
    const f = loadSyntheticFixture("bm_handoff_schema_invalid");
    expect(BioactivityPoDHandoffPacketSchema.safeParse(f.handoff).success).toBe(false);
  });
});

describe("end-to-end handoff export", () => {
  function makePacket(fixture: ReturnType<typeof loadSyntheticFixture>) {
    return {
      schemaVersion: "0.1.0" as const,
      schemaName: "EpigenomicsFeatureResponsePacket" as const,
      packetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      datasetMetadataRef: "dataset-001",
      designRef: "design-001",
      features: fixture.featureTable ?? [],
      design: fixture.design,
      provenance: {
        datasetId: "dataset-001",
        upstreamSteps: [
          { stepName: "norm", toolName: "minfi", toolVersion: "1.44.0", parameters: {} },
        ],
      },
      qualificationSummary: {
        acceptedCount: (fixture.featureTable ?? []).length,
        excludedCount: 0,
        exploratoryCount: 0,
        caveatCount: 0,
      },
      qcReportRef: "qc-001",
      warnings: [],
      generatedAt: "2026-05-05T00:00:00Z",
    };
  }

  it("exportHandoffPacket produces a valid BioactivityPoDHandoffPacket", () => {
    const f = loadSyntheticFixture("bm_beta_manifest_complete");
    const packet = makePacket(f);
    const handoff = exportHandoffPacket(packet);

    expect(handoff).not.toBeNull();
    expect(handoff!.schemaVersion).toBe("0.1.0");
    expect(handoff!.schemaName).toBe("BioactivityPoDHandoffPacket");
    expect(handoff!.sourcePacketRef).toBe(packet.packetId);
    expect(handoff!.provenance).toBeDefined();
    expect(handoff!.provenance!.datasetId).toBe("dataset-001");
  });

  it("only accepted and accepted_with_caveats features appear in doseResponseReadySubset", () => {
    const f = loadSyntheticFixture("bm_high_missingness");
    const packet = makePacket(f);
    const handoff = exportHandoffPacket(packet);

    expect(handoff).not.toBeNull();

    const subsetStatuses = new Set<string>();
    for (const featureId of handoff!.doseResponseReadySubset) {
      const q = handoff!.qualifiedFeatures.find((qf) => qf.featureId === featureId);
      expect(q).toBeDefined();
      subsetStatuses.add(q!.status);
    }

    for (const status of subsetStatuses) {
      expect(status === "accepted_for_pod" || status === "accepted_with_caveats").toBe(true);
    }

    // Excluded features must not be in the subset
    for (const ef of handoff!.excludedFeatures) {
      expect(handoff!.doseResponseReadySubset).not.toContain(ef.featureId);
    }
  });

  it("bm_insufficient_replicates produces no handoff because all features are excluded", () => {
    const f = loadSyntheticFixture("bm_insufficient_replicates");
    const packet = makePacket(f);
    const handoff = exportHandoffPacket(packet);

    // Fail-closed: no eligible features means no handoff packet
    expect(handoff).toBeNull();
  });
});
