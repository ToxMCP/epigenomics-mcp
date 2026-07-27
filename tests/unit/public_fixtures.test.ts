import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  discoverPublicFixturePlaceholders,
  isPublicFixtureAvailable,
  validatePublicFixtureChecksums,
} from "../../src/benchmarks/public_fixtures.js";

const fixtureRoot = resolve(
  process.cwd(),
  "benchmarks/fixtures/frozen_public",
);

describe("frozen public fixtures", () => {
  it("ships one verified, locally available public-data excerpt", () => {
    const fixtures = discoverPublicFixturePlaceholders(fixtureRoot);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]).toMatchObject({
      accession: "GSE67005",
      curationStatus: "validated",
      availability: "available",
      expectedFeatureCount: 10,
      expectedSampleCount: 6,
    });
    expect(
      isPublicFixtureAvailable(
        fixtures[0],
        resolve(fixtureRoot, "gse67005"),
      ),
    ).toBe(true);
    expect(validatePublicFixtureChecksums(fixtures[0], fixtureRoot)).toEqual({
      valid: true,
      errors: [],
    });
  });
});
