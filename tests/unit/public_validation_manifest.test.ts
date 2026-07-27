import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ExperimentalDesignSchema } from "../../src/contracts/design.js";
import { DatasetProvenanceSchema } from "../../src/contracts/provenance.js";

type PublicValidationDataset = {
  datasetId: string;
  source: {
    accession: string;
    recordUrl: string;
    downloadUrl: string;
    fileBytes: number;
    sourceChecksumSha256: string;
    contentChecksumSha256: string;
  };
  designPath: string;
  provenancePath: string;
  expectedOutput: {
    designValid: boolean;
    sourceFileBytes: number;
    sourceChecksumSha256: string;
    contentChecksumSha256: string;
  };
  review: {
    status: string;
    assertions: string[];
  };
};

describe("public-data validation manifest", () => {
  const repositoryRoot = process.cwd();
  const manifest = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "benchmarks/public_validation/manifest.json"),
      "utf-8",
    ),
  ) as {
    version: string;
    reviewStatus: string;
    datasets: PublicValidationDataset[];
  };

  it("declares three unique, source-anchored public datasets", () => {
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.reviewStatus).toBe(
      "source_anchored_pending_external_expert_signoff",
    );
    expect(manifest.datasets).toHaveLength(3);
    expect(new Set(manifest.datasets.map((dataset) => dataset.datasetId)).size).toBe(3);

    for (const dataset of manifest.datasets) {
      expect(dataset.source.recordUrl).toMatch(/^https:\/\//);
      expect(dataset.source.downloadUrl).toMatch(/^https:\/\//);
      expect(dataset.source.fileBytes).toBeGreaterThan(0);
      expect(dataset.source.sourceChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(dataset.source.contentChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(dataset.expectedOutput.sourceFileBytes).toBe(
        dataset.source.fileBytes,
      );
      expect(dataset.expectedOutput.sourceChecksumSha256).toBe(
        dataset.source.sourceChecksumSha256,
      );
      expect(dataset.expectedOutput.contentChecksumSha256).toBe(
        dataset.source.contentChecksumSha256,
      );
      expect(dataset.review.status).toBe("source_anchored_internal_review");
      expect(dataset.review.assertions.length).toBeGreaterThan(0);
    }
  });

  it("ships schema-valid design and provenance evidence for every case", () => {
    for (const dataset of manifest.datasets) {
      const designPath = resolve(repositoryRoot, dataset.designPath);
      const provenancePath = resolve(repositoryRoot, dataset.provenancePath);
      expect(existsSync(designPath)).toBe(true);
      expect(existsSync(provenancePath)).toBe(true);

      const design = ExperimentalDesignSchema.parse(
        JSON.parse(readFileSync(designPath, "utf-8")),
      );
      const provenance = DatasetProvenanceSchema.parse(
        JSON.parse(readFileSync(provenancePath, "utf-8")),
      );

      expect(provenance.datasetId).toBe(dataset.datasetId);
      expect(design.samples.length).toBeGreaterThan(0);
    }
  });

  it("includes two admissible designs and one intentional fail-closed case", () => {
    expect(
      manifest.datasets.map((dataset) => ({
        accession: dataset.source.accession,
        designValid: dataset.expectedOutput.designValid,
      })),
    ).toEqual([
      { accession: "GSE67005", designValid: true },
      { accession: "GSE84189", designValid: true },
      { accession: "ENCFF205CPH", designValid: false },
    ]);
  });
});
