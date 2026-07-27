import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const fixtureRoot = new URL(".", import.meta.url);
const sourceManifest = JSON.parse(
  readFileSync(new URL("source_files.json", fixtureRoot), "utf-8"),
);
const sourceDirArgument = process.argv.indexOf("--source-dir");
const sourceDir =
  sourceDirArgument >= 0
    ? resolve(process.argv[sourceDirArgument + 1] ?? "")
    : undefined;
const verify = process.argv.includes("--verify");
const chromosomes = ["chr1", "chr2", "chr3", "chr4", "chr5"];

if (!sourceDir) {
  throw new Error(
    "Provide --source-dir containing the 12 downloaded narrowPeak.gz files",
  );
}

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const aggregateByChromosome = (source) => {
  const path = resolve(sourceDir, `${source.sampleAccession}.narrowPeak.gz`);
  if (!existsSync(path)) {
    throw new Error(`Missing source file: ${path}`);
  }
  const compressed = readFileSync(path);
  if (compressed.length !== source.fileBytes) {
    throw new Error(`${source.sampleAccession}: compressed byte count mismatch`);
  }
  if (sha256(compressed) !== source.sourceChecksumSha256) {
    throw new Error(`${source.sampleAccession}: compressed SHA-256 mismatch`);
  }

  const content = gunzipSync(compressed);
  if (sha256(content) !== source.contentChecksumSha256) {
    throw new Error(`${source.sampleAccession}: content SHA-256 mismatch`);
  }

  const stats = Object.fromEntries(
    chromosomes.map((chromosome) => [
      chromosome,
      { peakCount: 0, sumSignalValue: 0 },
    ]),
  );
  const lines = content.toString("utf-8").trimEnd().split("\n");
  if (lines.length !== source.rowCount) {
    throw new Error(`${source.sampleAccession}: row count mismatch`);
  }
  for (const line of lines) {
    const columns = line.split("\t");
    const chromosomeStats = stats[columns[0]];
    if (!chromosomeStats) continue;
    chromosomeStats.peakCount++;
    chromosomeStats.sumSignalValue += Number(columns[6]);
  }
  for (const chromosome of chromosomes) {
    stats[chromosome].sumSignalValue = Number(
      stats[chromosome].sumSignalValue.toFixed(5),
    );
  }
  return stats;
};

const sourceStats = Object.fromEntries(
  sourceManifest.files.map((source) => [
    source.sampleAccession,
    aggregateByChromosome(source),
  ]),
);

const valuesFor = (chromosome, field) =>
  Object.fromEntries(
    sourceManifest.files.map((source) => [
      source.sampleAccession,
      sourceStats[source.sampleAccession][chromosome][field],
    ]),
  );

const features = chromosomes.flatMap((chromosome) => [
  {
    featureId: `${chromosome}-blacklist-filtered-peak-count`,
    featureClass: "generic_region_feature",
    modality: "atac_seq",
    measuredIdentifier: `${chromosome}:blacklist-filtered-peak-count`,
    signalMetric: "declared_other",
    declaredOtherDescription:
      "Count of deposited blacklist-filtered narrowPeak rows on the chromosome",
    values: valuesFor(chromosome, "peakCount"),
  },
  {
    featureId: `${chromosome}-deposited-signal-value-sum`,
    featureClass: "generic_region_feature",
    modality: "atac_seq",
    measuredIdentifier: `${chromosome}:deposited-signal-value-sum`,
    signalMetric: "declared_other",
    declaredOtherDescription:
      "Sum of the deposited narrowPeak signalValue field on the chromosome",
    values: valuesFor(chromosome, "sumSignalValue"),
  },
]);

const doseGroups = [
  { doseGroupId: "vehicle", doseValue: 0, doseUnit: "nM", timepointHours: 72 },
  { doseGroupId: "ra-50", doseValue: 50, doseUnit: "nM", timepointHours: 72 },
  { doseGroupId: "ra-200", doseValue: 200, doseUnit: "nM", timepointHours: 72 },
  { doseGroupId: "ra-400", doseValue: 400, doseUnit: "nM", timepointHours: 72 },
];
const groupIdForDose = new Map(
  doseGroups.map((group) => [group.doseValue, group.doseGroupId]),
);
const samples = sourceManifest.files.map((source) => ({
  sampleId: source.sampleAccession,
  doseGroupId: groupIdForDose.get(source.doseNm),
  replicateIndex: source.replicate,
  replicateType: "biological",
  cellType: "MCF-7",
  species: "Homo sapiens",
  controlFlag: source.doseNm === 0,
  treatment:
    source.doseNm === 0 ? "ethanol vehicle" : "retinoic acid",
}));

const packet = {
  schemaVersion: "0.1.0",
  schemaName: "EpigenomicsFeatureResponsePacket",
  packetId: "15274900-0000-4000-8000-000000000001",
  datasetMetadataRef: "GSE152749-source-files",
  designRef: "GSE152749-ra-dose-design",
  features,
  design: {
    designId: "GSE152749-ra-dose-design",
    studyId: "GSE152749",
    species: "Homo sapiens",
    doseGroups,
    samples,
    hasControls: true,
    minReplicatesPerGroup: 3,
  },
  provenance: {
    datasetId: "GSE152749-ra-atac-derived",
    upstreamSteps: [
      {
        stepName: "source_processing",
        toolName: "MACS2",
        toolVersion: "not reported",
        parameters: {
          sourceFormat: "blacklist-filtered narrowPeak",
          genomeBuild: "GRCh38",
          sourceFiles: 12,
        },
        inputFiles: [],
        outputFiles: sourceManifest.files.map((source) => source.fileName),
      },
      {
        stepName: "fixture_derivation",
        toolName: "derive_fixture.mjs",
        toolVersion: "0.1.0",
        parameters: {
          chromosomes,
          metrics: ["peakCount", "sumSignalValue"],
          transformation: "none beyond chromosome aggregation",
        },
        inputFiles: sourceManifest.files.map((source) => source.fileName),
        outputFiles: ["response_packet.json"],
      },
    ],
    normalisationMethod:
      "Deposited MACS2 narrowPeak signalValue retained without additional normalization",
    annotationVersion: "GRCh38 declared by the GEO sample records",
    sourceArchive: "NCBI GEO",
    sourceAccession: "GSE152749",
  },
  qualificationSummary: {
    acceptedCount: 0,
    excludedCount: 0,
    exploratoryCount: features.length,
    caveatCount: features.length,
  },
  qcReportRef: "not-generated-public-response-pattern-fixture",
  warnings: [],
  generatedAt: "2026-07-27T00:00:00.000Z",
};

const serialized = `${JSON.stringify(packet, null, 2)}\n`;
if (verify) {
  const committed = readFileSync(
    new URL("response_packet.json", fixtureRoot),
    "utf-8",
  );
  if (serialized !== committed) {
    throw new Error("Committed response_packet.json does not match derivation");
  }
  console.log("GSE152749 derived fixture verified");
} else {
  process.stdout.write(serialized);
}
