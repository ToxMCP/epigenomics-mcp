# Epigenomics MCP — Tool Reference & Usage Examples

**Document status:** Implementation reference  
**Product version:** 0.2.0
**Date:** 2026-07-27

---

## 1. Tool Index

All tools are registered on the MCP server via `registerTools()`. The same operations are also exposed through the `epimcp` CLI.

| Tool name | CLI command | Description |
|-----------|-------------|-------------|
| `health` | — | Return server health status |
| `ingest_dataset` | `ingest-features` | Ingest a processed epigenomic feature table |
| `validate_design` | `validate-design` | Validate experimental design for dose-response readiness |
| `qualify_features` | `qualify` | Qualify epigenomic features for downstream Bioactivity-PoD use |
| `generate_handoff` | `build-packet` | Generate a Bioactivity-PoD handoff packet summary |
| `validate_coordinates` | `validate-coordinates` | Validate coordinate system declarations |
| `profile_qc` | — | Compute deterministic QC profile |
| `profile_missingness` | `qc-missingness` | Compute missingness profile |
| `ingest_cell_composition` | `assess-cell-context` | Ingest cell-composition evidence |
| `ingest_cytotoxicity` | `assess-cytotox` | Ingest cytotoxicity context |
| `summarize_by_group` | — | Summarize feature responses by dose group |
| `read_table` | — | Read a delimited table file |
| `read_design` | `ingest-design` | Read a design table |
| `generate_qc_report` | `qc-report` | Generate a regulator-readable QC report |
| `convert_coordinates` | — | Normalize coordinate records to 0-based half-open |

---

## 2. Common Patterns

### 2.1 Running the MCP server

```bash
# stdio transport (default)
npx epimcp serve

# local Streamable HTTP transport
EPIMCP_MCP_PORT=8000 npx epimcp-http

# With custom config
npx epimcp serve --config ./epimcp.config.json
```

HTTP binds to `127.0.0.1` by default. A non-loopback bind requires both
`EPIMCP_ALLOWED_HOSTS` and `EPIMCP_AUTH_TOKEN`; use
`EPIMCP_ALLOWED_ORIGINS` for browser clients and terminate TLS at a trusted
reverse proxy. Request bodies and per-client request rates are bounded.

### 2.2 JSON output convention

All CLI commands emit JSON to `stdout`. Use `--json` to force JSON even when a TTY is detected. Use `--report <path>` to write the same JSON to a file.

```bash
npx epimcp validate-design design.json --json --report ./validation_report.json
```

### 2.3 MCP payload envelope

MCP tools are registered with `registerTool(...)` and expose input schemas,
output schemas, and read-only/idempotent annotations to clients. Successful
tool calls return `structuredContent` for machine validation plus a JSON text
content item for compatibility:

```json
{
  "structuredContent": {
    "status": "ok",
    "version": "0.2.0",
    "timestamp": "2026-05-07T00:00:00.000Z"
  },
  "content": [
    {
      "type": "text",
      "text": "{\"status\":\"ok\",\"version\":\"0.2.0\",\"timestamp\":\"2026-05-07T00:00:00.000Z\"}"
    }
  ]
}
```

Validation failures are returned as schema-valid structured content where the
tool contract defines a failure shape. Unexpected handler failures return
`isError: true` with a concise JSON error body.

### 2.4 MCP audit resources

The server also exposes stable read-only resources so audit clients can inspect
contracts and evidence without filesystem-specific tools. These resources are
resolved relative to the installed package root, so they remain available when
the MCP server is launched from another working directory.

| Resource URI | Contents |
|--------------|----------|
| `epimcp://schemas/epigenomics-feature-response-packet` | Current response-packet JSON Schema |
| `epimcp://schemas/bioactivity-pod-handoff-packet` | Current Bioactivity-PoD handoff JSON Schema |
| `epimcp://schemas/region-to-gene-mapping` | Region-to-gene mapping JSON Schema |
| `epimcp://schemas/external-database-mapping` | External annotation mapping JSON Schema |
| `epimcp://schemas/base-envelope` | Shared envelope JSON Schema |
| `epimcp://schemas/qualification-policy` | Qualification policy JSON Schema |
| `epimcp://docs/validation-statement` | Regulator-facing validation statement |
| `epimcp://docs/tool-reference` | This tool reference |
| `epimcp://benchmarks/manifest` | Release benchmark manifest |
| `epimcp://release-evidence/manifest` | Latest generated release evidence manifest |
| `epimcp://release-evidence/checksums` | Latest generated SHA-256 checksum file |
| `epimcp://release-evidence/release-gate-json` | Latest captured release-gate JSON report |
| `epimcp://release-evidence/release-gate-report` | Latest captured release-gate text report |
| `epimcp://release-evidence/scientific-invariants` | Latest checksummed schema-spine scientific-invariants result |

Generate or refresh the release evidence bundle with:

```bash
npm run release:evidence
npm run verify:evidence
```

For release evidence, commit source changes first, generate the bundle from a
clean tree, then commit the refreshed `release-evidence/` files. The package
dry-run is verified to include every file backing the registered audit
resources.

### 2.5 File access and table pagination

MCP file-reading tools are workspace-bound by default. The file access policy
can be configured with `EPIMCP_ALLOWED_FILE_ROOTS`, `EPIMCP_MAX_FILE_BYTES`,
`EPIMCP_DEFAULT_ROW_LIMIT`, and `EPIMCP_MAX_ROW_LIMIT`.

`read_table` accepts `options.offset` and `options.limit`. Results include
`totalDataRowCount`, `hasMore`, and `nextOffset` so callers can page through
large tables without requesting an unbounded response.

### 2.6 File-backed packet workflows

`qualify_features`, `generate_handoff`, and `summarize_by_group` accept exactly
one of an inline `packet` or a JSON `packetPath`. A path is resolved through the
same allowed-root and maximum-size policy as the table readers. Supplying both,
or neither, is rejected.

`qualify_features` and `generate_handoff` also accept the optional
`cellCompositionProfile` and `cytotoxicityProfile` objects returned by the two
context-ingestion tools. When supplied, the profiles are deterministically
classified and applied to every feature; dominant confounding can make a
handoff not ready. Omitted profiles are not silently treated as measured
evidence.

### 2.7 Explicit ingestion semantics

`ingest_dataset` requires a `tableOptions` object. Callers must declare feature
class, signal metric, table shape or sufficient sample columns, identifier
columns, and coordinate semantics instead of relying on biological inference
from column names.

```json
{
  "datasetId": "GSE67005-low-dose-excerpt",
  "modality": "dna_methylation_array",
  "featuresPath": "benchmarks/fixtures/frozen_public/gse67005/raw_excerpt.tsv",
  "designPath": "benchmarks/fixtures/frozen_public/gse67005/design.json",
  "provenancePath": "benchmarks/fixtures/frozen_public/gse67005/provenance.json",
  "tableOptions": {
    "featureClass": "generic_region_feature",
    "signalMetric": "declared_other",
    "declaredOtherDescription": "centered log2 MeDIP/Input ratio",
    "explicitShape": "wide_matrix",
    "featureIdColumn": "PROBE_ID",
    "sampleIdColumns": ["562919", "562954", "563005", "563033", "563268", "563365"]
  }
}
```

---

## 3. Example 1 — Methylation Matrix Ingestion & Qualification

**Scenario:** You have an Illumina EPIC methylation array dataset with three dose groups (0, 1, 10 µM) and biological triplicates. You want to ingest the feature table, validate the design, qualify features, and generate a Bioactivity-PoD handoff.

### 3.1 Input files

**Feature table** (`examples/methylation_matrix/feature_table.json`):

```json
[
  {
    "featureId": "cg00000001",
    "featureClass": "cpg_methylation",
    "modality": "dna_methylation_array",
    "measuredIdentifier": "cg00000001",
    "measuredRegion": {
      "chrom": "chr1",
      "start": 1000000,
      "end": 1000001,
      "build": "hg38",
      "coordinateSystem": "0-based-half-open"
    },
    "signalMetric": "beta_value",
    "values": {
      "sample-ctrl-1": 0.82,
      "sample-ctrl-2": 0.85,
      "sample-ctrl-3": 0.84,
      "sample-low-1": 0.78,
      "sample-low-2": 0.79,
      "sample-low-3": 0.77,
      "sample-high-1": 0.45,
      "sample-high-2": 0.48,
      "sample-high-3": 0.46
    }
  },
  {
    "featureId": "cg00000002",
    "featureClass": "cpg_methylation",
    "modality": "dna_methylation_array",
    "measuredIdentifier": "cg00000002",
    "measuredRegion": {
      "chrom": "chr1",
      "start": 2050000,
      "end": 2050001,
      "build": "hg38",
      "coordinateSystem": "0-based-half-open"
    },
    "signalMetric": "beta_value",
    "values": {
      "sample-ctrl-1": 0.12,
      "sample-ctrl-2": 0.14,
      "sample-ctrl-3": 0.13,
      "sample-low-1": 0.22,
      "sample-low-2": 0.25,
      "sample-low-3": 0.23,
      "sample-high-1": 0.55,
      "sample-high-2": 0.58,
      "sample-high-3": 0.56
    }
  }
]
```

**Design** (`examples/methylation_matrix/design.json`):

```json
{
  "designId": "demo-methylation-design-001",
  "studyId": "demo-methylation-study-001",
  "species": "Homo sapiens",
  "doseGroups": [
    { "doseGroupId": "ctrl", "doseValue": 0, "doseUnit": "µM", "timepointHours": 24 },
    { "doseGroupId": "low", "doseValue": 1, "doseUnit": "µM", "timepointHours": 24 },
    { "doseGroupId": "high", "doseValue": 10, "doseUnit": "µM", "timepointHours": 24 }
  ],
  "samples": [
    { "sampleId": "sample-ctrl-1", "doseGroupId": "ctrl", "replicateIndex": 1, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A", "controlFlag": true },
    { "sampleId": "sample-ctrl-2", "doseGroupId": "ctrl", "replicateIndex": 2, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A", "controlFlag": true },
    { "sampleId": "sample-ctrl-3", "doseGroupId": "ctrl", "replicateIndex": 3, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A", "controlFlag": true },
    { "sampleId": "sample-low-1", "doseGroupId": "low", "replicateIndex": 1, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" },
    { "sampleId": "sample-low-2", "doseGroupId": "low", "replicateIndex": 2, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" },
    { "sampleId": "sample-low-3", "doseGroupId": "low", "replicateIndex": 3, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" },
    { "sampleId": "sample-high-1", "doseGroupId": "high", "replicateIndex": 1, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" },
    { "sampleId": "sample-high-2", "doseGroupId": "high", "replicateIndex": 2, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" },
    { "sampleId": "sample-high-3", "doseGroupId": "high", "replicateIndex": 3, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" }
  ],
  "hasControls": true,
  "minReplicatesPerGroup": 3
}
```

**Provenance** (`examples/methylation_matrix/provenance.json`):

```json
{
  "datasetId": "demo-methylation-ds-001",
  "upstreamSteps": [
    {
      "stepName": "idat_to_intensities",
      "toolName": "minfi",
      "toolVersion": "1.44.0",
      "parameters": { "preprocessMethod": "noob" },
      "timestamp": "2026-04-01T10:00:00Z",
      "inputFiles": ["sample_001.idat", "sample_002.idat"],
      "outputFiles": ["intensities.rds"]
    },
    {
      "stepName": "normalisation",
      "toolName": "minfi",
      "toolVersion": "1.44.0",
      "parameters": { "method": "SWAN" },
      "timestamp": "2026-04-01T11:00:00Z",
      "inputFiles": ["intensities.rds"],
      "outputFiles": ["beta_values.csv"]
    }
  ],
  "normalisationMethod": "SWAN",
  "batchCorrectionMethod": "ComBat",
  "probeManifestVersion": "Illumina EPIC v2.0",
  "annotationVersion": "hg38"
}
```

### 3.2 Build the response packet

```bash
npx epimcp qualify examples/methylation_matrix/packet.json --json
```

**MCP equivalent:**

```json
{
  "name": "qualify_features",
  "arguments": {
    "packet": {
      "schemaVersion": "0.1.0",
      "schemaName": "EpigenomicsFeatureResponsePacket",
      "packetId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "datasetMetadataRef": "demo-methylation-ds-001",
      "designRef": "demo-methylation-design-001",
      "features": [ /* feature table array */ ],
      "design": { /* design object */ },
      "provenance": { /* provenance object */ },
      "qualificationSummary": {
        "acceptedCount": 2,
        "excludedCount": 0,
        "exploratoryCount": 0,
        "caveatCount": 2
      },
      "qcReportRef": "qc-report-001",
      "warnings": [],
      "generatedAt": "2026-05-05T00:00:00Z"
    }
  }
}
```

### 3.3 Expected output

The `qualify` command returns a qualification result:

```json
{
  "qualifiedCount": 2,
  "excludedCount": 0,
  "warnings": [],
  "qualifications": [
    {
      "featureId": "cg00000001",
      "status": "accepted_with_caveats",
      "warnings": [
        {
          "warningCode": "EPIW005_BELOW_PREFERRED_DOSE_GROUPS",
          "severity": "warning",
          "message": "Design has 3 dose groups; preferred is 4",
          "category": "missing_metadata",
          "blocksDownstream": false,
          "featureIds": ["cg00000001"]
        }
      ],
      "mappedGeneIds": [],
      "mappingConfidence": "none",
      "mappingMethod": "unknown",
      "explainability": { /* rule trace */ }
    },
    {
      "featureId": "cg00000002",
      "status": "accepted_with_caveats",
      "warnings": [
        {
          "warningCode": "EPIW005_BELOW_PREFERRED_DOSE_GROUPS",
          "severity": "warning",
          "message": "Design has 3 dose groups; preferred is 4",
          "category": "missing_metadata",
          "blocksDownstream": false,
          "featureIds": ["cg00000002"]
        }
      ],
      "mappedGeneIds": [],
      "mappingConfidence": "none",
      "mappingMethod": "unknown",
      "explainability": { /* rule trace */ }
    }
  ],
  "claimGuardResult": {
    "persistenceStatus": "not_assessed",
    "reversibilityStatus": "not_assessed",
    "heritabilityClaim": "none"
  },
  "explainabilitySummary": {
    "uniqueRuleCodes": ["RULE_009_MAJOR_WARNINGS"],
    "ruleCodeCounts": { "RULE_009_MAJOR_WARNINGS": 2 },
    "reviewRequiredCount": 0,
    "featuresWithRemediation": 2
  }
}
```

### 3.4 Generate Bioactivity-PoD handoff

```bash
npx epimcp build-packet examples/methylation_matrix/packet.json --json
```

**Expected output:**

```json
{
  "handoffId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "qualifiedFeatureCount": 2,
  "readyForPod": true
}
```

---

## 4. Example 2 — DMR Nearest-Gene Warning

**Scenario:** You have differentially methylated regions (DMRs) called from BS-seq data. The regions were mapped to genes using `bedtools closest` (nearest-gene only). You want to qualify these features and see the proximity-not-causality warning.

### 4.1 Input

**Feature table** (`examples/dmr_nearest_gene_warning/feature_table.json`):

```json
[
  {
    "featureId": "dmr_chr1_1000000_1000500",
    "featureClass": "dmr",
    "modality": "dna_methylation_bsseq",
    "measuredRegion": {
      "chrom": "chr1",
      "start": 1000000,
      "end": 1000500,
      "build": "hg38",
      "coordinateSystem": "0-based-half-open"
    },
    "signalMetric": "delta_beta",
    "values": {
      "sample-ctrl-1": -0.02,
      "sample-ctrl-2": -0.01,
      "sample-ctrl-3": -0.03,
      "sample-low-1": 0.08,
      "sample-low-2": 0.09,
      "sample-low-3": 0.07,
      "sample-high-1": 0.25,
      "sample-high-2": 0.27,
      "sample-high-3": 0.24
    }
  },
  {
    "featureId": "dmr_chr2_500000_500600",
    "featureClass": "dmr",
    "modality": "dna_methylation_bsseq",
    "measuredRegion": {
      "chrom": "chr2",
      "start": 500000,
      "end": 500600,
      "build": "hg38",
      "coordinateSystem": "0-based-half-open"
    },
    "signalMetric": "delta_beta",
    "values": {
      "sample-ctrl-1": 0.01,
      "sample-ctrl-2": 0.02,
      "sample-ctrl-3": 0.00,
      "sample-low-1": 0.05,
      "sample-low-2": 0.06,
      "sample-low-3": 0.04,
      "sample-high-1": 0.15,
      "sample-high-2": 0.14,
      "sample-high-3": 0.16
    }
  }
]
```

### 4.2 Qualify with nearest-gene mapping metadata

When the packet includes `mappingPayloads.regionToGeneMappings` entries using
`method: "nearest_gene"`, the qualification engine preserves the mapped gene
IDs and emits a warning because proximity is low-confidence context and does
not imply causality.

```bash
npx epimcp qualify examples/dmr_nearest_gene_warning/packet.json --json
```

### 4.3 Expected output

```json
{
  "qualifiedCount": 2,
  "excludedCount": 0,
  "warnings": [],
  "qualifications": [
    {
      "featureId": "dmr_chr1_1000000_1000500",
      "status": "accepted_with_caveats",
      "warnings": [
        { "warningCode": "EPIW005_BELOW_PREFERRED_DOSE_GROUPS" },
        { "warningCode": "EPIW007_NEAREST_GENE_ONLY" }
      ],
      "mappedGeneIds": ["ENSG_DEMO_001"],
      "mappingConfidence": "low",
      "mappingMethod": "nearest_gene"
    },
    {
      "featureId": "dmr_chr2_500000_500600",
      "status": "accepted_with_caveats",
      "warnings": [
        { "warningCode": "EPIW005_BELOW_PREFERRED_DOSE_GROUPS" },
        { "warningCode": "EPIW007_NEAREST_GENE_ONLY" }
      ],
      "mappedGeneIds": ["ENSG_DEMO_002"],
      "mappingConfidence": "low",
      "mappingMethod": "nearest_gene"
    }
  ],
  "explainabilitySummary": {
    "uniqueRuleCodes": ["RULE_009_MAJOR_WARNINGS"],
    "ruleCodeCounts": { "RULE_009_MAJOR_WARNINGS": 2 },
    "reviewRequiredCount": 0,
    "featuresWithRemediation": 2
  }
}
```

**Important:** Because `blockNearestGenePathwayByDefault` is `true` in the default policy, the handoff may still be blocked from pathway rollup even though the features are `accepted_with_caveats`.

---

## 5. Example 3 — Invalid Build Mismatch

**Scenario:** Features in one dataset declare different genome builds. The
fail-closed qualification engine rejects the mixed-build dataset rather than
silently lifting or partially accepting coordinates.

### 5.1 Input

**Feature table** (`examples/invalid_build_mismatch/feature_table.json`):

```json
[
  {
    "featureId": "cg_hg38_001",
    "featureClass": "cpg_methylation",
    "modality": "dna_methylation_array",
    "measuredIdentifier": "cg_hg38_001",
    "measuredRegion": {
      "chrom": "chr1",
      "start": 1000000,
      "end": 1000001,
      "build": "hg38",
      "coordinateSystem": "0-based-half-open"
    },
    "signalMetric": "beta_value",
    "values": {
      "sample-ctrl-1": 0.82,
      "sample-ctrl-2": 0.85,
      "sample-low-1": 0.78,
      "sample-low-2": 0.80
    }
  },
  {
    "featureId": "cg_mm10_001",
    "featureClass": "cpg_methylation",
    "modality": "dna_methylation_array",
    "measuredIdentifier": "cg_mm10_001",
    "measuredRegion": {
      "chrom": "chr1",
      "start": 2000000,
      "end": 2000001,
      "build": "mm10",
      "coordinateSystem": "0-based-half-open"
    },
    "signalMetric": "beta_value",
    "values": {
      "sample-ctrl-1": 0.12,
      "sample-ctrl-2": 0.14,
      "sample-low-1": 0.22,
      "sample-low-2": 0.25
    }
  }
]
```

The packet mixes `hg38` and `mm10` without a declared, provenance-backed
coordinate conversion.

### 5.2 Qualify

```bash
npx epimcp qualify examples/invalid_build_mismatch/packet.json --json
```

### 5.3 Expected output

```json
{
  "qualifiedCount": 0,
  "excludedCount": 2,
  "warnings": [
    {
      "warningCode": "EPI004_BUILD_VALIDATION_FAILED",
      "severity": "error",
      "message": "EPI004: Mixed genome builds detected in dataset (hg38, mm10); split upstream or use a single assembly",
      "category": "coordinate_semantics",
      "blocksDownstream": true
    }
  ],
  "qualifications": [
    {
      "featureId": "cg_hg38_001",
      "status": "excluded_coordinate_ambiguity",
      "warnings": [
        { "warningCode": "EPI004_BUILD_VALIDATION_FAILED" }
      ]
    },
    {
      "featureId": "cg_mm10_001",
      "status": "excluded_coordinate_ambiguity",
      "warnings": [
        { "warningCode": "EPI004_BUILD_VALIDATION_FAILED" }
      ]
    }
  ],
  "explainabilitySummary": {
    "uniqueRuleCodes": ["RULE_002_INVALID_COORDINATES"],
    "ruleCodeCounts": { "RULE_002_INVALID_COORDINATES": 2 },
    "reviewRequiredCount": 2,
    "featuresWithRemediation": 2
  }
}
```

Both features are excluded because coordinate interpretation is a
dataset-level invariant. The handoff is therefore not ready for PoD.

---

## 6. Example 4 — Bioactivity-PoD Handoff

**Scenario:** You have a fully qualified `EpigenomicsFeatureResponsePacket` and want to generate the `BioactivityPoDHandoffPacket` that downstream modelling can consume.

### 6.1 Input

**Packet** (`examples/bioactivity_pod_handoff/packet.json`):

```json
{
  "schemaVersion": "0.1.0",
  "schemaName": "EpigenomicsFeatureResponsePacket",
  "packetId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "datasetMetadataRef": "demo-methylation-ds-001",
  "designRef": "demo-methylation-design-001",
  "features": [
    {
      "featureId": "cg00000001",
      "featureClass": "cpg_methylation",
      "modality": "dna_methylation_array",
      "measuredIdentifier": "cg00000001",
      "measuredRegion": {
        "chrom": "chr1",
        "start": 1000000,
        "end": 1000001,
        "build": "hg38",
        "coordinateSystem": "0-based-half-open"
      },
      "signalMetric": "beta_value",
      "values": {
        "sample-ctrl-1": 0.82,
        "sample-ctrl-2": 0.85,
        "sample-ctrl-3": 0.84,
        "sample-low-1": 0.78,
        "sample-low-2": 0.79,
        "sample-low-3": 0.77,
        "sample-high-1": 0.45,
        "sample-high-2": 0.48,
        "sample-high-3": 0.46
      }
    },
    {
      "featureId": "cg00000002",
      "featureClass": "cpg_methylation",
      "modality": "dna_methylation_array",
      "measuredIdentifier": "cg00000002",
      "measuredRegion": {
        "chrom": "chr1",
        "start": 2050000,
        "end": 2050001,
        "build": "hg38",
        "coordinateSystem": "0-based-half-open"
      },
      "signalMetric": "beta_value",
      "values": {
        "sample-ctrl-1": 0.12,
        "sample-ctrl-2": 0.14,
        "sample-ctrl-3": 0.13,
        "sample-low-1": 0.22,
        "sample-low-2": 0.25,
        "sample-low-3": 0.23,
        "sample-high-1": 0.55,
        "sample-high-2": 0.58,
        "sample-high-3": 0.56
      }
    }
  ],
  "design": {
    "designId": "demo-methylation-design-001",
    "studyId": "demo-methylation-study-001",
    "species": "Homo sapiens",
    "doseGroups": [
      { "doseGroupId": "ctrl", "doseValue": 0, "doseUnit": "µM", "timepointHours": 24 },
      { "doseGroupId": "low", "doseValue": 1, "doseUnit": "µM", "timepointHours": 24 },
      { "doseGroupId": "high", "doseValue": 10, "doseUnit": "µM", "timepointHours": 24 }
    ],
    "samples": [
      { "sampleId": "sample-ctrl-1", "doseGroupId": "ctrl", "replicateIndex": 1, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A", "controlFlag": true },
      { "sampleId": "sample-ctrl-2", "doseGroupId": "ctrl", "replicateIndex": 2, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A", "controlFlag": true },
      { "sampleId": "sample-ctrl-3", "doseGroupId": "ctrl", "replicateIndex": 3, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A", "controlFlag": true },
      { "sampleId": "sample-low-1", "doseGroupId": "low", "replicateIndex": 1, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" },
      { "sampleId": "sample-low-2", "doseGroupId": "low", "replicateIndex": 2, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" },
      { "sampleId": "sample-low-3", "doseGroupId": "low", "replicateIndex": 3, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" },
      { "sampleId": "sample-high-1", "doseGroupId": "high", "replicateIndex": 1, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" },
      { "sampleId": "sample-high-2", "doseGroupId": "high", "replicateIndex": 2, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" },
      { "sampleId": "sample-high-3", "doseGroupId": "high", "replicateIndex": 3, "replicateType": "biological", "cellType": "HepaRG", "species": "Homo sapiens", "batchId": "batch-A" }
    ],
    "hasControls": true,
    "minReplicatesPerGroup": 3
  },
  "provenance": {
    "datasetId": "demo-methylation-ds-001",
    "upstreamSteps": [
      {
        "stepName": "normalisation",
        "toolName": "minfi",
        "toolVersion": "1.44.0",
        "parameters": {},
        "timestamp": "2026-04-01T10:00:00Z"
      }
    ]
  },
  "qualificationSummary": {
    "acceptedCount": 2,
    "excludedCount": 0,
    "exploratoryCount": 0,
    "caveatCount": 2
  },
  "qcReportRef": "qc-report-001",
  "warnings": [],
  "generatedAt": "2026-05-05T00:00:00Z"
}
```

### 6.2 Build handoff (summary)

```bash
npx epimcp build-packet examples/bioactivity_pod_handoff/packet.json --json
```

**Expected output:**

```json
{
  "handoffId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "qualifiedFeatureCount": 2,
  "readyForPod": true
}
```

### 6.3 Export full handoff packet

To obtain the complete `BioactivityPoDHandoffPacket` (not just the summary):

```bash
npx epimcp export-pod examples/bioactivity_pod_handoff/packet.json --json
```

**Expected output:**

```json
{
  "schemaVersion": "0.1.0",
  "schemaName": "BioactivityPoDHandoffPacket",
  "handoffId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "sourcePacketRef": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "qualifiedFeatures": [
    {
      "featureId": "cg00000001",
      "status": "accepted_with_caveats",
      "warnings": [
        { "warningCode": "EPIW005_BELOW_PREFERRED_DOSE_GROUPS" }
      ],
      "mappedGeneIds": [],
      "mappingConfidence": "none",
      "mappingMethod": "unknown"
    },
    {
      "featureId": "cg00000002",
      "status": "accepted_with_caveats",
      "warnings": [
        { "warningCode": "EPIW005_BELOW_PREFERRED_DOSE_GROUPS" }
      ],
      "mappedGeneIds": [],
      "mappingConfidence": "none",
      "mappingMethod": "unknown"
    }
  ],
  "excludedFeatures": [],
  "doseResponseReadySubset": ["cg00000001", "cg00000002"],
  "mandatoryCaveats": [],
  "generatedAt": "2026-05-05T00:00:00Z",
  "persistenceStatus": "not_assessed",
  "reversibilityStatus": "not_assessed",
  "heritabilityClaim": "none",
  "provenance": {
    "datasetId": "demo-methylation-ds-001",
    "upstreamSteps": [
      {
        "stepName": "normalisation",
        "toolName": "minfi",
        "toolVersion": "1.44.0",
        "parameters": {},
        "timestamp": "2026-04-01T10:00:00Z"
      }
    ]
  }
}
```

### 6.4 MCP equivalent

**Summary (generate_handoff):**

```json
{
  "name": "generate_handoff",
  "arguments": {
    "packet": { /* EpigenomicsFeatureResponsePacket */ }
  }
}
```

**Full packet is not exposed as a separate MCP tool; use the service layer `createHandoffPacket()` if needed.**

---

## 7. Additional Workflows

### 7.1 Validate coordinate declarations

```bash
npx epimcp validate-coordinates declarations.json --json
```

**MCP equivalent:**

```json
{
  "name": "validate_coordinates",
  "arguments": {
    "declarations": [
      {
        "featureId": "F1",
        "featureClass": "atac_peak",
        "declaredSystem": "ucsc_bed_0based_half_open"
      },
      {
        "featureId": "F2",
        "featureClass": "atac_peak",
        "declaredSystem": "no_coordinates_feature_id_only"
      }
    ]
  }
}
```

### 7.2 Profile missingness

```bash
npx epimcp qc-missingness features.json design.json --json
```

**MCP equivalent:**

```json
{
  "name": "profile_missingness",
  "arguments": {
    "datasetId": "DS1",
    "features": [ /* feature array */ ],
    "design": { /* design object */ },
    "policy": {
      "version": "0.1.0",
      "warningThreshold": 0.05,
      "exclusionThreshold": 0.20
    }
  }
}
```

### 7.3 Assess cell-composition confounding

```bash
npx epimcp assess-cell-context cell_composition.json --json
```

### 7.4 Assess cytotoxicity confounding

```bash
npx epimcp assess-cytotox cytotoxicity.json --json
```

### 7.5 Generate QC report

```bash
npx epimcp qc-report profile.json --json --report ./qc_report.json
```

### 7.6 Validate handoff packet

```bash
npx epimcp validate-handoff handoff.json --json

# With source packet for cross-check
npx epimcp validate-handoff handoff.json packet.json --json
```

---

## 8. Error Codes & Exit Status

| Exit code | Meaning |
|-----------|---------|
| 0 | Success / validation passed |
| 1 | Validation failure / blocking warning / schema error |

CLI commands that produce blocking warnings (e.g. `qualify` when `blocksDownstream` is true, or `qc-missingness` when `summaryBand === "exclusion"`) exit with code `1` even though JSON output is still emitted.

---

## 9. References

- [Input Format Guide](input-format-guide.md)
- [Genome Build & Coordinate Guide](genome-build-and-coordinate-guide.md)
- [Handoff Specification](handoff.md)
- [Region-to-Gene Mapping Guide](region-to-gene-mapping-guide.md)
