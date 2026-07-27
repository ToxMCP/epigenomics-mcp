import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  discoverPublicFixturePlaceholders,
  isPublicFixtureAvailable,
  validatePublicFixtureChecksums,
} from "../../src/benchmarks/public_fixtures.js";
import { EpigenomicsFeatureResponsePacketSchema } from "../../src/contracts/packets.js";
import { assessResponsePatterns } from "../../src/response_pattern/assessment.js";
import { assessOrderedTrends } from "../../src/trend/ordered_trend.js";

const fixtureRoot = resolve(
  process.cwd(),
  "benchmarks/fixtures/frozen_public",
);

describe("frozen public fixtures", () => {
  it("ships two verified, locally available public-data fixtures", () => {
    const fixtures = discoverPublicFixturePlaceholders(fixtureRoot);
    expect(fixtures).toHaveLength(2);
    const methylationFixture = fixtures.find(
      (fixture) => fixture.accession === "GSE67005",
    )!;
    const doseSeriesFixture = fixtures.find(
      (fixture) => fixture.accession === "GSE152749",
    )!;

    expect(methylationFixture).toMatchObject({
      accession: "GSE67005",
      curationStatus: "validated",
      availability: "available",
      expectedFeatureCount: 10,
      expectedSampleCount: 6,
    });
    expect(doseSeriesFixture).toMatchObject({
      accession: "GSE152749",
      assayModality: "atac_seq",
      curationStatus: "validated",
      availability: "available",
      expectedFeatureCount: 10,
      expectedSampleCount: 12,
    });

    for (const fixture of fixtures) {
      expect(
        isPublicFixtureAvailable(
          fixture,
          resolve(fixtureRoot, fixture.accession.toLowerCase()),
        ),
      ).toBe(true);
      expect(validatePublicFixtureChecksums(fixture, fixtureRoot)).toEqual({
        valid: true,
        errors: [],
      });
    }
  });

  it("assesses deposited multi-dose ATAC summaries without a model claim", () => {
    const packet = EpigenomicsFeatureResponsePacketSchema.parse(
      JSON.parse(
        readFileSync(
          resolve(
            fixtureRoot,
            "gse152749",
            "response_packet.json",
          ),
          "utf-8",
        ),
      ),
    );
    const sourceFiles = JSON.parse(
      readFileSync(
        resolve(fixtureRoot, "gse152749", "source_files.json"),
        "utf-8",
      ),
    ) as {
      files: Array<{
        sampleAccession: string;
        doseNm: number;
        sourceChecksumSha256: string;
        contentChecksumSha256: string;
      }>;
    };
    const result = assessResponsePatterns(packet);

    expect(sourceFiles.files).toHaveLength(12);
    expect(new Set(sourceFiles.files.map((source) => source.sampleAccession)).size).toBe(
      12,
    );
    expect(new Set(sourceFiles.files.map((source) => source.doseNm))).toEqual(
      new Set([0, 50, 200, 400]),
    );
    for (const source of sourceFiles.files) {
      expect(source.sourceChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.contentChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
    }

    expect(result.designValidation.readinessStatus).toBe(
      "dose_response_preferred",
    );
    expect(result.features).toHaveLength(10);
    expect(
      result.features.every(
        (feature) =>
          feature.assessmentStatus === "assessed" &&
          feature.observedPattern === "non_monotonic",
      ),
    ).toBe(true);
    expect(
      result.features.filter(
        (feature) => feature.directionFromControl === "decreasing",
      ),
    ).toHaveLength(5);
    expect(
      result.features.filter(
        (feature) => feature.directionFromControl === "mixed",
      ),
    ).toHaveLength(5);
    expect(result.scientificScope).toMatchObject({
      trendSignificance: "not_assessed",
      biologicalSignificance: "not_assessed",
      bmdSuitability: "not_assessed",
      monotonicityRequiredForQualification: false,
    });
  });

  it("runs bounded uncertainty-aware trend screening on the public dose series", () => {
    const packet = EpigenomicsFeatureResponsePacketSchema.parse(
      JSON.parse(
        readFileSync(
          resolve(
            fixtureRoot,
            "gse152749",
            "response_packet.json",
          ),
          "utf-8",
        ),
      ),
    );
    const result = assessOrderedTrends(packet);

    expect(result.multiplicity).toMatchObject({
      method: "benjamini_yekutieli",
      packetFeatureCount: 10,
      selectedFeatureCount: 10,
      testedFeatureCount: 10,
      coversEntirePacket: true,
      scopeWarning: null,
    });
    expect(
      result.features.every(
        (feature) =>
          feature.assessmentStatus === "assessed" &&
          feature.test?.permutation.mode === "monte_carlo" &&
          feature.test.adjustedPValueTwoSided === 1 &&
          feature.test.passesFdrThreshold === false,
      ),
    ).toBe(true);
    expect(
      result.features.map((feature) => feature.test?.pValueTwoSided),
    ).toEqual([
      0.7168, 0.63, 0.5248, 0.9432, 0.1044, 0.945, 0.2934, 0.9452,
      0.4308, 1,
    ]);
    expect(
      result.features.filter(
        (feature) => feature.test?.direction === "increasing",
      ),
    ).toHaveLength(7);
    expect(
      result.features.filter(
        (feature) => feature.test?.direction === "decreasing",
      ),
    ).toHaveLength(2);
    expect(
      result.features.filter(
        (feature) => feature.test?.direction === "no_ordered_direction",
      ),
    ).toHaveLength(1);
    expect(result.scientificScope).toMatchObject({
      interpretationBoundary: "exploratory_ordered_trend_evidence_only",
      biologicalSignificance: "not_assessed",
      causalInference: "not_assessed",
      bmdSuitability: "not_assessed",
      featureQualificationChanged: false,
    });
  });
});
