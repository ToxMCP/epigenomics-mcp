# Genome Build and Coordinate Guide

**Document status:** Regulator-facing coordinate policy  
**Product version:** 0.1.0  
**Date:** 2026-05-06

---

## 1. Principle

Every coordinate-bearing feature in Epigenomics MCP must carry an **explicit, validated genome build and coordinate system**. The service fails closed when either is missing, ambiguous, or contradictory. Silent liftover, silent coordinate-system guessing, and mixed builds within a single packet are all prohibited.

> **Invariant:** Every coordinate-bearing feature carries `genome_build`, `coordinate_system`, `chromosome`, `start`, and `end`.

---

## 2. Supported Genome Builds

| Build | Species | Support level |
|-------|---------|---------------|
| `GRCh37` | Human (Homo sapiens) | Full |
| `GRCh38` | Human (Homo sapiens) | Full |
| `hg19` | Human (Homo sapiens) | Alias for GRCh37 |
| `hg38` | Human (Homo sapiens) | Alias for GRCh38 |
| `mm9` | Mouse (Mus musculus) | Supported |
| `mm10` | Mouse (Mus musculus) | Full |
| `mm39` | Mouse (Mus musculus) | Full |
| `rn6` | Rat (Rattus norvegicus) | Supported |
| `rn7` | Rat (Rattus norvegicus) | Supported |

**Rules:**

- Mixed builds in a single dataset hard-fail.
- Unrecognised builds emit `excluded_missing_genome_build` or `excluded_invalid_coordinates`.
- Build aliases (`hg19` → `GRCh37`, `hg38` → `GRCh38`) are resolved at ingestion and preserved in provenance.

---

## 3. Coordinate Systems

### 3.1 Internal canonical representation

All coordinates are stored internally as **0-based, half-open intervals**:

- `start` is inclusive.
- `end` is exclusive.
- A single-base feature at position 1000 is represented as `start=1000, end=1001`.

### 3.2 Accepted source coordinate systems

| Source system | Description | Conversion to internal |
|---------------|-------------|------------------------|
| `0-based-half-open` | UCSC BED-style | Identity (no change) |
| `1-based-closed` | GFF/GTF/Ensembl-style | `start = source_start - 1`, `end = source_end` |
| `platform_native_probe` | Array probe coordinates (platform-specific) | Converted according to platform manifest |
| `no_coordinates_feature_id_only` | Probe ID or abstract feature with no genomic location | No coordinate stored; mapping blocked unless externally resolved |

### 3.3 Conversion examples

| Source system | Original | Internal (0-based half-open) |
|---------------|----------|------------------------------|
| 1-based closed | `chr1:1000-1000` | `chr1:999-1000` |
| 1-based closed | `chr1:1-100` | `chr1:0-100` |
| 0-based half-open | `chr1:999-1000` | `chr1:999-1000` |

### 3.4 Provenance of conversion

Every conversion produces a `CoordinateConversionProvenance` record:

```json
{
  "originalCoordinateText": "chr1:1000-1000",
  "originalSystem": "1-based-closed",
  "convertedAt": "2026-05-06T10:00:00Z",
  "conversionOperation": "1-based-closed to 0-based-half-open: start-1, end unchanged"
}
```

The original text and original system are preserved for full auditability.

---

## 4. Validation Rules

### 4.1 Chromosome validation

Chromosome identifiers must match the pattern:

```
^(chr[0-9XYM]+|[0-9XYM]+)$
```

Accepted: `chr1`, `chrX`, `chrY`, `chrM`, `1`, `X`  
Rejected: `chr1_random`, `chrUn`, `MT`, `contig_123`

### 4.2 Interval validation

| Rule | Error code | Effect |
|------|-----------|--------|
| `end <= start` | `EPI003_INVALID_COORDINATE` | Feature excluded |
| Negative `start` or `end` | `EPI003_INVALID_COORDINATE` | Feature excluded |
| `start` or `end` not an integer | `EPI003_INVALID_COORDINATE` | Feature excluded |
| Interval exceeds chromosome length for declared build | `EPI003_INVALID_COORDINATE` | Feature excluded |

### 4.3 Mixed build detection

If any two features in a dataset declare different genome builds (after alias resolution), the entire dataset receives:

- Status: `excluded_invalid_coordinates`
- Error: `EPI005_MIXED_GENOME_BUILDS`
- Effect: Hard fail (all features blocked)

---

## 5. Platform Annotation Provenance

Array-derived methylation features require platform annotation provenance:

| Field | Required | Example |
|-------|----------|---------|
| `platform` | Yes | `Illumina_EPIC_v1` |
| `manifestVersion` | Yes | `B4` |
| `annotationRelease` | Yes | `20a1h` |
| `manifestHash` | Recommended | SHA-256 of manifest file |

**Rule:** Absence of platform annotation provenance blocks gene/pathway interpretation for array-derived features. The feature itself may still be accepted as a measured coordinate, but automated target mapping is disallowed.

---

## 6. Fail-Closed Behaviours

| Scenario | Behaviour | Traceability |
|----------|-----------|--------------|
| Missing genome build for coordinate-bearing feature | Exclude feature | `EPI004_MISSING_GENOME_BUILD` |
| Missing coordinate system for region-bearing feature | Hard fail | `EPI002_COORDINATE_SYSTEM_UNDECLARED` |
| Mixed builds in one dataset | Hard fail | `EPI005_MIXED_GENOME_BUILDS` |
| Invalid interval (end ≤ start) | Exclude feature | `EPI003_INVALID_COORDINATE` |
| Unrecognised chromosome | Exclude feature | `EPI003_INVALID_COORDINATE` |
| Silent liftover requested | Rejected | `EPI004_SILENT_LIFTOVER_DISALLOWED` |

---

## 7. What Is Not Inferred

1. **No default genome build** — The service does not assume `GRCh38` or any other build.
2. **No silent liftover** — Converting coordinates between builds requires explicit annotation trace and is deferred to Annotation/Ontology MCP integration.
3. **No coordinate-system guessing** — A GFF-style file must declare `1-based-closed`; it is not inferred from file extension.
4. **No chromosome name normalisation beyond the allowed pattern** — Non-standard contigs are rejected, not mapped to the nearest chromosome.

---

*See also: [input-format-guide.md](input-format-guide.md) for file format details, [region-to-gene-mapping-guide.md](region-to-gene-mapping-guide.md) for mapping policies.*
