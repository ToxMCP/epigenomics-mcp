# Input Format Guide

**Document status:** Implementation reference  
**Product version:** 0.2.1
**Date:** 2026-07-27

---

## 1. Overview

Epigenomics MCP accepts **processed epigenomic feature tables** plus mandatory metadata. This document describes the supported file formats, required columns, coordinate conventions, and metadata requirements.

**What is accepted:** CSV/TSV feature tables in long or wide format, plus JSON/YAML metadata.  
**What is rejected:** Raw FASTQ, BAM, IDAT, or unprocessed instrument outputs.

---

## 2. Processed Feature Tables

### 2.1 Long format

Each row is one `feature × sample` observation.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `feature_id` | string | Yes | Stable feature identifier (probe ID, region ID, etc.) |
| `sample_id` | string | Yes | Sample identifier resolvable against design metadata |
| `response_value` | number | Yes | Numeric measurement (beta, M-value, signal, etc.) |
| `chrom` | string | Conditional | Chromosome identifier (required for coordinate-bearing features) |
| `start` | integer | Conditional | Start coordinate (required for coordinate-bearing features) |
| `end` | integer | Conditional | End coordinate (required for coordinate-bearing features) |
| `strand` | string | No | Strand orientation (`+`, `-`, or `.`) |

**Example:**

```csv
feature_id,sample_id,response_value,chrom,start,end
chr1_1000500_1000600,S001,0.82,chr1,1000500,1000600
chr1_1000500_1000600,S002,0.79,chr1,1000500,1000600
chr1_2000300_2000400,S001,0.91,chr1,2000300,2000400
```

### 2.2 Wide format

Each row is one feature; sample measurements are columns.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `feature_id` | string | Yes | Stable feature identifier |
| `<sample_id_1>` | number | Yes | Measurement for sample 1 |
| `<sample_id_2>` | number | Yes | Measurement for sample 2 |
| `chrom` | string | Conditional | Chromosome identifier |
| `start` | integer | Conditional | Start coordinate |
| `end` | integer | Conditional | End coordinate |

**Example:**

```csv
feature_id,S001,S002,chrom,start,end
chr1_1000500_1000600,0.82,0.79,chr1,1000500,1000600
chr1_2000300_2000400,0.91,0.88,chr1,2000300,2000400
```

### 2.3 Summary-response (contrast-only) format

Each row is a pre-computed contrast or effect summary. These are **not** dose-response ready by default.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `feature_id` | string | Yes | Feature identifier |
| `effect_size` | number | Yes | Summary statistic (logFC, delta beta, etc.) |
| `p_value` | number | No | Nominal p-value |
| `q_value` | number | No | Adjusted p-value |

**Qualification outcome:** `exploratory_only` unless per-sample dose-group structure is also supplied.

---

## 3. Metadata Requirements

Every ingestion must be accompanied by three metadata objects:

### 3.1 Dataset provenance

```json
{
  "datasetId": "DS_2024_001",
  "assayType": "dna_methylation_array",
  "sourceAccession": "GSE123456",
  "upstreamProcessing": {
    "pipeline": "minfi_1.46.0",
    "normalisation": "noob",
    "probeFiltering": "p<0.01_detection"
  }
}
```

### 3.2 Experimental design

```json
{
  "studyType": "dose_response",
  "species": "Homo sapiens",
  "doseGroups": [
    { "doseGroupId": "D0", "doseValue": 0, "doseUnit": "µM", "controlFlag": true },
    { "doseGroupId": "D1", "doseValue": 1, "doseUnit": "µM" },
    { "doseGroupId": "D10", "doseValue": 10, "doseUnit": "µM" }
  ],
  "samples": [
    { "sampleId": "S001", "doseGroupId": "D0", "replicateType": "biological" },
    { "sampleId": "S002", "doseGroupId": "D0", "replicateType": "biological" },
    { "sampleId": "S003", "doseGroupId": "D1", "replicateType": "biological" },
    { "sampleId": "S004", "doseGroupId": "D1", "replicateType": "biological" },
    { "sampleId": "S005", "doseGroupId": "D10", "replicateType": "biological" },
    { "sampleId": "S006", "doseGroupId": "D10", "replicateType": "biological" }
  ]
}
```

### 3.3 Platform annotation

For array-derived methylation data:

```json
{
  "platform": "Illumina_EPIC_v1",
  "manifestVersion": "B4",
  "annotationRelease": "20a1h",
  "genomeBuild": "GRCh38",
  "coordinateSystem": "0-based-half-open"
}
```

For coordinate-bearing region data:

```json
{
  "genomeBuild": "GRCh38",
  "coordinateSystem": "0-based-half-open",
  "featureValueSemantics": "rpm"
}
```

---

## 4. Validation Rules

### 4.1 Hard failures (blocking)

| Condition | Error code | Effect |
|-----------|-----------|--------|
| Duplicate `feature_id × sample_id` keys | `EPI001_DUPLICATE_KEYS` | Hard fail |
| Missing required column | `EPI001_REQUIRED_COLUMN_MISSING` | Hard fail |
| Non-numeric response values in model-ready fields | `EPI006_NON_NUMERIC_RESPONSE` | Feature excluded |
| `feature_id` contains whitespace or control characters | `EPI001_MALFORMED_FEATURE_ID` | Hard fail |

### 4.2 Warnings (non-blocking)

| Condition | Warning code | Effect |
|-----------|-------------|--------|
| Unmatched sample column in wide format | `EPIW001_UNMATCHED_SAMPLE` | Values ignored with warning |
| Empty rows or all-null features | `EPIW002_EMPTY_FEATURE` | Feature excluded |
| Mixed feature classes in one table | `EPIW003_MIXED_FEATURE_CLASSES` | Review flag |

---

## 5. Feature Value Semantics

The `feature_value_semantics` field is **mandatory** and must be one of the following:

| Semantics | Applicable assay | Interpretation |
|-----------|-----------------|----------------|
| `beta_value` | Methylation array | 0–1 methylation proportion |
| `m_value` | Methylation array | Logit-transformed beta |
| `percent_methylation` | BS-seq | 0–100 methylation percentage |
| `delta_beta` | Differential methylation | Change in beta between groups |
| `delta_m` | Differential methylation | Change in M-value between groups |
| `rpm` | ATAC/ChIP | Reads per million |
| `normalised_signal` | ATAC/ChIP | Library-size or spike-in normalised signal |
| `peak_score` | ATAC/ChIP | Caller-specific score (e.g., MACS `-log10(qvalue)`) |
| `log2_fold_change` | Any contrast | Log2 group ratio |
| `q_value` | Any contrast | Adjusted p-value (not a primary response metric) |

**Rule:** Beta values, M-values, percent methylation, delta beta, delta M, accessibility signal, peak score, and q-value/effect statistics must **not** be silently interchanged.

---

## 6. File Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| CSV | `.csv` | Standard comma-separated |
| TSV | `.tsv`, `.txt` | Tab-separated; preferred for bioinformatics |
| JSON | `.json` | Metadata only |
| YAML | `.yaml`, `.yml` | Metadata only |

Parquet is not accepted by the current file-reading tools. Convert it to CSV
or TSV before ingestion; the server does not silently infer a decoder from the
file extension.

---

## 7. What Is Not Inferred

1. The ingestion service **never guesses** the response metric semantics. If `feature_value_semantics` is missing, the ingestion fails.
2. The ingestion service **never imputes** missing values silently.
3. The ingestion service **never rescales** values (e.g., beta to M) unless explicitly requested via a declared normalisation pipeline.
4. The ingestion service **never assigns** a default genome build or coordinate system.

---

*See also: [genome-build-and-coordinate-guide.md](genome-build-and-coordinate-guide.md) for coordinate conventions, [scientific-scope.md](scientific-scope.md) for supported assay modalities.*
