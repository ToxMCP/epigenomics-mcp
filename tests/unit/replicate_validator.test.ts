import { describe, it, expect } from "vitest";
import {
  countReplicatesByType,
  validateReplicates,
  ReplicateGroupCountsSchema,
  ReplicateGroupResultSchema,
  ReplicateValidationResultSchema,
  ReplicateGroupStatusSchema,
} from "../../src/validators/replicate_validator.js";
import type { ExperimentalDesign } from "../../src/contracts/design.js";
import type { ReplicatePolicy } from "../../src/qualification/policy.js";

function makePolicy(overrides?: Partial<ReplicatePolicy>): ReplicatePolicy {
  return {
    minBiologicalReplicatesPerGroup: 2,
    preferredBiologicalReplicatesPerGroup: 3,
    n1BiologicalReplicatePolicy: "excluded",
    ...overrides,
  };
}

function makeDesign(
  samples: ExperimentalDesign["samples"],
  doseGroups?: ExperimentalDesign["doseGroups"],
): ExperimentalDesign {
  return {
    designId: "d-001",
    species: "Homo sapiens",
    doseGroups: doseGroups ?? [
      { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
    ],
    samples,
    hasControls: true,
    minReplicatesPerGroup: 2,
  };
}

// ── countReplicatesByType ──

describe("countReplicatesByType", () => {
  it("counts biological replicates correctly", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-l2", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
    ]);

    const counts = countReplicatesByType(design);
    const ctrl = counts.find((c) => c.doseGroupId === "ctrl")!;
    expect(ctrl.biological).toBe(2);
    expect(ctrl.technical).toBe(0);
    expect(ctrl.pooled).toBe(0);
    expect(ctrl.pseudobulk).toBe(0);
    expect(ctrl.effectiveBiological).toBe(2);
  });

  it("counts technical replicates separately and excludes them from effective biological", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c1-tech", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "technical" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-l1-tech", doseGroupId: "low", species: "Homo sapiens", replicateType: "technical" },
    ]);

    const counts = countReplicatesByType(design);
    const ctrl = counts.find((c) => c.doseGroupId === "ctrl")!;
    expect(ctrl.biological).toBe(1);
    expect(ctrl.technical).toBe(1);
    expect(ctrl.effectiveBiological).toBe(1);
    expect(ctrl.total).toBe(2);
  });

  it("counts pooled samples as effective biological", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "pooled" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "pooled" },
    ]);

    const counts = countReplicatesByType(design);
    const ctrl = counts.find((c) => c.doseGroupId === "ctrl")!;
    expect(ctrl.pooled).toBe(2);
    expect(ctrl.biological).toBe(0);
    expect(ctrl.effectiveBiological).toBe(2);
  });

  it("counts pseudobulk samples as effective biological", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "pseudobulk" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "pseudobulk" },
    ]);

    const counts = countReplicatesByType(design);
    const ctrl = counts.find((c) => c.doseGroupId === "ctrl")!;
    expect(ctrl.pseudobulk).toBe(2);
    expect(ctrl.biological).toBe(0);
    expect(ctrl.effectiveBiological).toBe(2);
  });

  it("treats undefined replicateType as biological (backward compatibility)", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
    ]);

    const counts = countReplicatesByType(design);
    const ctrl = counts.find((c) => c.doseGroupId === "ctrl")!;
    expect(ctrl.biological).toBe(2);
    expect(ctrl.technical).toBe(0);
    expect(ctrl.effectiveBiological).toBe(2);
  });

  it("includes empty groups with zero counts", () => {
    const design = makeDesign(
      [
        { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true },
      ],
      [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "empty", doseValue: 99, doseUnit: "µM" },
      ],
    );

    const counts = countReplicatesByType(design);
    const empty = counts.find((c) => c.doseGroupId === "empty")!;
    expect(empty.biological).toBe(0);
    expect(empty.technical).toBe(0);
    expect(empty.pooled).toBe(0);
    expect(empty.pseudobulk).toBe(0);
    expect(empty.effectiveBiological).toBe(0);
  });

  it("validates ReplicateGroupCountsSchema for all generated counts", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c1-tech", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "technical" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "pooled" },
      { sampleId: "s-c3", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "pseudobulk" },
    ]);

    const counts = countReplicatesByType(design);
    for (const c of counts) {
      expect(() => ReplicateGroupCountsSchema.parse(c)).not.toThrow();
    }
  });
});

// ── validateReplicates ──

describe("validateReplicates", () => {
  it("returns preferred when all groups have ≥3 biological replicates", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c3", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-l2", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-l3", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-h1", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-h2", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-h3", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
    ]);

    const result = validateReplicates(design, makePolicy());
    expect(result.valid).toBe(true);
    expect(result.overallStatus).toBe("preferred");
    expect(result.minEffectiveBiological).toBe(3);
    expect(result.groupsBlocked).toBe(0);
    expect(result.groupsUnderPreferred).toBe(0);

    for (const g of result.groups) {
      expect(g.status).toBe("preferred");
      expect(g.blocksDownstream).toBe(false);
    }

    expect(() => ReplicateValidationResultSchema.parse(result)).not.toThrow();
  });

  it("returns accepted when all groups have ≥2 but <3 biological replicates", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-l2", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-h1", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-h2", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
    ]);

    const result = validateReplicates(design, makePolicy());
    expect(result.valid).toBe(true);
    expect(result.overallStatus).toBe("accepted");
    expect(result.minEffectiveBiological).toBe(2);
    expect(result.groupsBlocked).toBe(0);
    expect(result.groupsUnderPreferred).toBe(3);

    for (const g of result.groups) {
      expect(g.status).toBe("accepted");
    }
  });

  it("excludes groups with n=1 biological replicates under default policy", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-h1", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
    ]);

    const result = validateReplicates(design, makePolicy());
    expect(result.valid).toBe(false);
    expect(result.overallStatus).toBe("excluded");
    expect(result.minEffectiveBiological).toBe(1);
    expect(result.groupsBlocked).toBe(3);

    for (const g of result.groups) {
      expect(g.status).toBe("excluded");
      expect(g.blocksDownstream).toBe(true);
    }
  });

  it("returns review_required for n=1 when policy is review_required", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-h1", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
    ]);

    const result = validateReplicates(
      design,
      makePolicy({ n1BiologicalReplicatePolicy: "review_required" }),
    );
    expect(result.valid).toBe(true);
    expect(result.overallStatus).toBe("review_required");
    expect(result.groupsBlocked).toBe(0);

    for (const g of result.groups) {
      expect(g.status).toBe("review_required");
      expect(g.blocksDownstream).toBe(false);
    }
  });

  it("excludes technical-only replicate groups", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "technical" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "technical" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "technical" },
      { sampleId: "s-h1", doseGroupId: "high", species: "Homo sapiens", replicateType: "technical" },
    ]);

    const result = validateReplicates(design, makePolicy());
    expect(result.valid).toBe(false);
    expect(result.overallStatus).toBe("excluded");
    expect(result.minEffectiveBiological).toBe(0);

    const ctrl = result.groups.find((g) => g.doseGroupId === "ctrl")!;
    expect(ctrl.status).toBe("excluded");
    expect(ctrl.counts.technical).toBe(2);
    expect(ctrl.counts.effectiveBiological).toBe(0);

    const techWarning = ctrl.warnings.find(
      (w) => w.warningCode === "EPIR001_TECHNICAL_REPLICATE_ONLY",
    );
    expect(techWarning).toBeDefined();
    expect(techWarning?.category).toBe("technical_replicate_only");
  });

  it("does not count technical replicates toward biological minimum", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c1-tech", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "technical" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-l1-tech", doseGroupId: "low", species: "Homo sapiens", replicateType: "technical" },
      { sampleId: "s-l2", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-h1", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-h1-tech", doseGroupId: "high", species: "Homo sapiens", replicateType: "technical" },
    ]);

    const result = validateReplicates(design, makePolicy());
    expect(result.valid).toBe(false);
    expect(result.overallStatus).toBe("excluded");

    const ctrl = result.groups.find((g) => g.doseGroupId === "ctrl")!;
    expect(ctrl.counts.biological).toBe(1);
    expect(ctrl.counts.technical).toBe(1);
    expect(ctrl.status).toBe("excluded");

    const low = result.groups.find((g) => g.doseGroupId === "low")!;
    expect(low.counts.biological).toBe(2);
    expect(low.counts.technical).toBe(1);
    expect(low.status).toBe("accepted");
  });

  it("accepts groups with pooled samples and emits pooled warning", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "pooled" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "pooled" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "pooled" },
      { sampleId: "s-l2", doseGroupId: "low", species: "Homo sapiens", replicateType: "pooled" },
    ], [
      { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
    ]);

    const result = validateReplicates(design, makePolicy());
    expect(result.valid).toBe(true);
    expect(result.overallStatus).toBe("accepted");

    const ctrl = result.groups.find((g) => g.doseGroupId === "ctrl")!;
    expect(ctrl.counts.pooled).toBe(2);
    expect(ctrl.counts.effectiveBiological).toBe(2);
    expect(ctrl.status).toBe("accepted");

    const pooledWarning = ctrl.warnings.find(
      (w) => w.warningCode === "EPIR002_POOLED_SAMPLE",
    );
    expect(pooledWarning).toBeDefined();
    expect(pooledWarning?.category).toBe("pooled_sample");
  });

  it("accepts groups with pseudobulk samples and emits pseudobulk warning", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "pseudobulk" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "pseudobulk" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "pseudobulk" },
      { sampleId: "s-l2", doseGroupId: "low", species: "Homo sapiens", replicateType: "pseudobulk" },
    ], [
      { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
    ]);

    const result = validateReplicates(design, makePolicy());
    expect(result.valid).toBe(true);
    expect(result.overallStatus).toBe("accepted");

    const ctrl = result.groups.find((g) => g.doseGroupId === "ctrl")!;
    expect(ctrl.counts.pseudobulk).toBe(2);
    expect(ctrl.counts.effectiveBiological).toBe(2);

    const pseudobulkWarning = ctrl.warnings.find(
      (w) => w.warningCode === "EPIR003_PSEUDOBULK_SAMPLE",
    );
    expect(pseudobulkWarning).toBeDefined();
    expect(pseudobulkWarning?.category).toBe("pseudobulk_sample");
  });

  it("emits mixed-replicate-type warning when multiple types are present", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c1-tech", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "technical" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "pooled" },
    ]);

    const result = validateReplicates(design, makePolicy());
    const ctrl = result.groups.find((g) => g.doseGroupId === "ctrl")!;
    const mixedWarning = ctrl.warnings.find(
      (w) => w.warningCode === "EPIR004_MIXED_REPLICATE_TYPES",
    );
    expect(mixedWarning).toBeDefined();
    expect(mixedWarning?.category).toBe("mixed_replicate_types");
  });

  it("excludes when one group is below minimum even if others are preferred", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c3", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-h1", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
    ]);

    const result = validateReplicates(design, makePolicy());
    expect(result.valid).toBe(false);
    expect(result.overallStatus).toBe("excluded");
    expect(result.groupsBlocked).toBe(2);

    const ctrl = result.groups.find((g) => g.doseGroupId === "ctrl")!;
    expect(ctrl.status).toBe("preferred");

    const low = result.groups.find((g) => g.doseGroupId === "low")!;
    expect(low.status).toBe("excluded");
  });

  it("supports policy override with lower minimum", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
    ], [
      { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
    ]);

    const result = validateReplicates(
      design,
      makePolicy({ minBiologicalReplicatesPerGroup: 1 }),
    );
    expect(result.valid).toBe(true);
    expect(result.overallStatus).toBe("accepted");
  });

  it("supports policy override with higher preferred threshold", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      { sampleId: "s-l2", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
    ], [
      { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
      { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
    ]);

    const result = validateReplicates(
      design,
      makePolicy({ preferredBiologicalReplicatesPerGroup: 4 }),
    );
    expect(result.valid).toBe(true);
    expect(result.overallStatus).toBe("accepted");
    expect(result.groupsUnderPreferred).toBe(2);
  });

  it("validates ReplicateGroupResultSchema for all generated groups", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-c1-tech", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "technical" },
    ]);

    const result = validateReplicates(design, makePolicy());
    for (const g of result.groups) {
      expect(() => ReplicateGroupResultSchema.parse(g)).not.toThrow();
    }
  });

  it("sorts groups deterministically by doseValue then doseGroupId", () => {
    const design = makeDesign(
      [
        { sampleId: "s-mid", doseGroupId: "mid", species: "Homo sapiens", replicateType: "biological" },
        { sampleId: "s-high", doseGroupId: "high", species: "Homo sapiens", replicateType: "biological" },
        { sampleId: "s-ctrl", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
        { sampleId: "s-low", doseGroupId: "low", species: "Homo sapiens", replicateType: "biological" },
      ],
      [
        { doseGroupId: "mid", doseValue: 5, doseUnit: "µM" },
        { doseGroupId: "high", doseValue: 10, doseUnit: "µM" },
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "low", doseValue: 1, doseUnit: "µM" },
      ],
    );

    const result = validateReplicates(design, makePolicy());
    const groupIds = result.groups.map((g) => g.doseGroupId);
    expect(groupIds).toEqual(["ctrl", "low", "mid", "high"]);
  });

  it("handles zero-sample groups as excluded", () => {
    const design = makeDesign(
      [
        { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
        { sampleId: "s-c2", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      ],
      [
        { doseGroupId: "ctrl", doseValue: 0, doseUnit: "µM" },
        { doseGroupId: "empty", doseValue: 99, doseUnit: "µM" },
      ],
    );

    const result = validateReplicates(design, makePolicy());
    expect(result.valid).toBe(false);
    expect(result.overallStatus).toBe("excluded");

    const empty = result.groups.find((g) => g.doseGroupId === "empty")!;
    expect(empty.status).toBe("excluded");
    expect(empty.counts.effectiveBiological).toBe(0);
    expect(empty.blocksDownstream).toBe(true);
  });

  it("is deterministic: same inputs produce identical outputs", () => {
    const design = makeDesign([
      { sampleId: "s-c1", doseGroupId: "ctrl", species: "Homo sapiens", controlFlag: true, replicateType: "biological" },
      { sampleId: "s-l1", doseGroupId: "low", species: "Homo sapiens", replicateType: "technical" },
    ]);

    const r1 = validateReplicates(design, makePolicy());
    const r2 = validateReplicates(design, makePolicy());
    expect(r1).toEqual(r2);
  });
});

// ── Schema validation ──

describe("ReplicateGroupStatusSchema", () => {
  it("accepts all valid statuses", () => {
    expect(ReplicateGroupStatusSchema.parse("accepted")).toBe("accepted");
    expect(ReplicateGroupStatusSchema.parse("preferred")).toBe("preferred");
    expect(ReplicateGroupStatusSchema.parse("review_required")).toBe("review_required");
    expect(ReplicateGroupStatusSchema.parse("excluded")).toBe("excluded");
  });

  it("rejects invalid statuses", () => {
    expect(() => ReplicateGroupStatusSchema.parse("unknown")).toThrow();
    expect(() => ReplicateGroupStatusSchema.parse("")).toThrow();
  });
});
