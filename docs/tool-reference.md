# Epigenomics MCP — Tool Reference & Usage Examples

**Document status:** Implementation reference  
**Product version:** 0.2.1
**Date:** 2026-07-27

---

## 1. Tool Index

All tools are registered on the MCP server via `registerTools()`. The same operations are also exposed through the `epimcp` CLI.

| Tool name | CLI command | Description |
|-----------|-------------|-------------|
| `health` | — | Return server health status |
| `ingest_dataset` | `ingest-features` | Ingest a processed table and report analysis readiness separately |
| `validate_design` | `validate-design` | Report structural, comparison, and dose-response readiness |
| `qualify_features` | `qualify` | Qualify epigenomic features for downstream Bioactivity-PoD use |
| `generate_handoff` | `build-packet` | Generate a Bioactivity-PoD handoff packet summary |
| `validate_coordinates` | `validate-coordinates` | Validate coordinate system declarations |
| `profile_qc` | — | Compute deterministic QC profile |
| `profile_missingness` | `qc-missingness` | Compute missingness profile |
| `ingest_cell_composition` | `assess-cell-context` | Ingest cell-composition evidence |
| `ingest_cytotoxicity` | `assess-cytotox` | Ingest cytotoxicity context |
| `summarize_by_group` | — | Summarize feature responses by dose group |
| `assess_response_patterns` | — | Classify bounded observed dose-level mean patterns without fitting a model |
| `assess_ordered_trends` | — | Assess exploratory ordered trends with replicate-level uncertainty and bounded-family multiplicity control |
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
    "version": "0.2.1",
    "timestamp": "2026-05-07T00:00:00.000Z"
  },
  "content": [
    {
      "type": "text",
      "text": "{\"status\":\"ok\",\"version\":\"0.2.1\",\"timestamp\":\"2026-05-07T00:00:00.000Z\"}"
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

`qualify_features`, `generate_handoff`, `summarize_by_group`,
`assess_response_patterns`, and `assess_ordered_trends` accept exactly one of
an inline `packet` or a JSON
`packetPath`. A path is resolved through the same allowed-root and maximum-size
policy as the table readers. Supplying both, or neither, is rejected.

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
    "explicitShape": "wide",
    "featureIdColumn": "PROBE_ID",
    "sampleIdColumns": ["562919", "562954", "563005", "563033", "563268", "563365"]
  }
}
```

Bounded mode is the default and retains the server's configured row and file
limits. For an explicitly authorized complete delimited file, set
`executionMode` to `streaming`. Streaming mode does not retain the complete
matrix: it decompresses, hashes, and canonicalizes batches of at most 5,000
rows while retaining bounded error detail.

```json
{
  "datasetId": "GSE67005-low-dose-full",
  "modality": "dna_methylation_array",
  "featuresPath": "/authorized/cache/GSE67005_T5_LD_ratios.txt.gz",
  "designPath": "benchmarks/fixtures/frozen_public/gse67005/design.json",
  "provenancePath": "benchmarks/public_validation/gse67005/provenance.json",
  "executionMode": "streaming",
  "tableOptions": {
    "featureClass": "generic_region_feature",
    "signalMetric": "declared_other",
    "declaredOtherDescription": "centered log2 MeDIP/Input ratio",
    "explicitShape": "wide",
    "featureIdColumn": "PROBE_ID",
    "sampleIdColumns": ["562919", "562954", "563005", "563033", "563268", "563365"]
  },
  "streamingOptions": {
    "compression": "gzip",
    "delimiter": "\t",
    "hasHeader": true,
    "batchSize": 2000,
    "maxErrorDetails": 20
  }
}
```

The source path still must be under `EPIMCP_ALLOWED_FILE_ROOTS`, and
`EPIMCP_MAX_FILE_BYTES` must explicitly authorize its compressed size.
Explicit `sampleIdColumns` are authoritative; numeric annotation columns are
not silently promoted to biological samples. Streaming results include row,
batch, sample, byte, compressed-source SHA-256, decompressed-content SHA-256,
and bounded error/warning evidence.

### 2.8 Design-readiness states

`validate_design` and `ingest_dataset` do not use ingestion success as a
proxy for dose-response suitability. They report four progressively stricter
states:

| State | Meaning |
| --- | --- |
| `structural_only` | The design is contract-valid and ingestible, but does not support an automatic treated-versus-control comparison. |
| `comparison_only` | At least one distinct non-zero level and the minimum effective biological replication support a comparison, but not project dose-response policy. |
| `dose_response_minimum` | The default policy minimum is met: control, at least two distinct non-zero dose levels, and at least two effective biological replicates per group. |
| `dose_response_preferred` | At least four distinct total dose levels and at least three effective biological replicates per group meet the preferred project threshold. |

Technical replicates do not count toward biological-replication thresholds.
Dose-group labels at the same numeric dose do not count as separate dose
levels. Dose–batch confounding and unsplit multi-timepoint designs block
automatic comparison and dose-response readiness. These thresholds are
versioned project policy; endpoint response behavior must still be evaluated
before fitting a BMD or selecting a PoD.

Both `validate_design` and `qualify_features` return machine-readable
`comparisonBlockers` and `doseResponseBlockers`. Codes distinguish structural
failure, missing treated doses, insufficient distinct dose levels,
insufficient biological replication, perfect dose–batch confounding, and
multi-timepoint designs requiring a split. `qualify_features` computes this
assessment once for the dataset and applies it to every feature. A
comparison-only design can therefore be ingested and compared, but it cannot
emit `accepted_for_pod` or a ready handoff.

The separation follows the scientific distinction in U.S. EPA BMD guidance:
studies with more dose groups and graded responses are generally more useful
for modelling, while a study with only one responding treated dose may not
support a BMD analysis. The exact numeric thresholds above remain Epigenomics
MCP policy, not a claim of universal regulatory sufficiency.

### 2.9 Observed response-pattern assessment

`assess_response_patterns` provides a bounded page of descriptive,
feature-level assessments. It collapses dose-group labels sharing one numeric
dose, orders the resulting levels, reports mean, sample SD, missingness, and
control differences, then classifies the observed means as:

- `flat_within_tolerance`
- `monotonic_nondecreasing`
- `monotonic_nonincreasing`
- `non_monotonic`

The default absolute tolerance is exactly zero. A non-zero tolerance must be
supplied by the caller in the feature signal metric's units, is echoed in the
output, and is explicitly not treated as biological significance. Patterns are
not assessed when there is no zero-dose control, a negative dose, fewer than
three distinct numeric doses, an entirely missing dose level, a non-finite
value, a structurally invalid design, mixed dose units, or an aggregate
multi-timepoint design.

Design readiness is returned independently. A mathematical pattern can be
described even when replication or batch structure prevents automatic
dose-response readiness. Conversely, a dose-response-ready design does not
make an endpoint statistically significant or BMD-suitable. Every result
therefore records:

```json
{
  "scientificScope": {
    "interpretationBoundary": "descriptive_group_mean_pattern_only",
    "trendSignificance": "not_assessed",
    "biologicalSignificance": "not_assessed",
    "bmdSuitability": "not_assessed",
    "monotonicityRequiredForQualification": false
  }
}
```

This boundary reflects current BMD guidance: response-pattern inspection is
useful, but model selection, fit, benchmark-response choice, and uncertainty
remain separate analytical decisions. Non-monotonic patterns are retained for
scientific review rather than automatically discarded.

### 2.10 Exploratory ordered-trend assessment

`assess_ordered_trends` tests independent biological replicate values with the
Jonckheere–Terpstra statistic. It uses only the numeric dose ordering, not the
distance between dose values. The reported ordered-pair probability gives half
credit to ties; `orderedPairEffect = 2p - 1` centres that quantity on zero and
ranges from -1 to 1.

The tool enumerates every unique dose-label allocation when the allocation
space is within the exact limit, no larger than the requested random
permutation budget, and within the global work cap. Otherwise it uses seeded
Monte Carlo permutations. Random-permutation p-values use the plus-one
correction and therefore cannot be zero. Both directional p-values are
reported, while the two-sided p-value is used for multiplicity adjustment.
A seeded, within-dose percentile bootstrap supplies a pointwise exploratory
interval for the ordered-pair effect; it is not a simultaneous confidence
band or a replacement for the permutation test.

Adjustment applies to the successfully tested features in one bounded packet
slice (`offset`, `limit`, maximum 100). Benjamini–Yekutieli is the conservative
default because epigenomic features can be dependent; Benjamini–Hochberg is
available only as an explicit caller choice. A partial slice carries a warning
that its adjusted p-values are neither packet-wide nor genome-wide.

The test fails closed for a structurally invalid design, no zero-dose control,
negative doses, fewer than three distinct doses, mixed units, unsplit
timepoints, multiple batches, missing or non-finite values, fewer than two
observations at any dose, or any replicate not explicitly declared
`biological`. Sample independence and null exchangeability cannot be proven
from the packet metadata and remain recorded assumptions.

```json
{
  "packetPath": "benchmarks/fixtures/frozen_public/gse152749/response_packet.json",
  "offset": 0,
  "limit": 10,
  "permutationResamples": 4999,
  "bootstrapResamples": 1999,
  "confidenceLevel": 0.95,
  "seed": 20260727,
  "pAdjustmentMethod": "benjamini_yekutieli",
  "fdrThreshold": 0.05
}
```

Every result records that this is exploratory ordered-trend evidence only.
Biological significance, causal inference, BMD suitability, and feature
qualification remain unchanged. The implementation follows the original
[Jonckheere ordered-alternative test](https://doi.org/10.1093/biomet/41.1-2.133),
the never-zero random-permutation correction of
[Phipson and Smyth](https://pubmed.ncbi.nlm.nih.gov/21044043/), and the
[Benjamini–Yekutieli dependence correction](https://doi.org/10.1214/aos/1013699998).

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
  "designValidation": {
    "structurallyValid": true,
    "comparisonReady": true,
    "doseResponseReady": true,
    "readinessStatus": "dose_response_minimum",
    "comparisonBlockers": [],
    "doseResponseBlockers": []
  },
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
- [U.S. EPA Benchmark Dose Technical Guidance](https://www.epa.gov/risk/benchmark-dose-technical-guidance)
- [EFSA Guidance on the use of the benchmark dose approach in risk assessment (2022)](https://efsa.onlinelibrary.wiley.com/doi/10.2903/j.efsa.2022.7584)
- [BMDExpress 2 transcriptomic dose-response workflow](https://pmc.ncbi.nlm.nih.gov/articles/PMC6513160/)
