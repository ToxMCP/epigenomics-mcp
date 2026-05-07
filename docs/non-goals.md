# Non-Goals

**Document status:** Regulator-facing boundary statement  
**Product version:** 0.1.0  
**Date:** 2026-05-06

---

## 1. Purpose of this Document

This document lists capabilities that Epigenomics MCP v0.1 **explicitly does not implement**. The exclusions are deliberate product-boundary decisions, not technical debt. Keeping these out of scope preserves a clear contract with downstream consumers and prevents the MCP from overreaching into domains where specialised tools already exist.

The v0.1 release is intentionally narrow: **qualify what you have, packetise it cleanly, and hand it off**.

---

## 2. Raw Data Processing (Out of Scope)

Epigenomics MCP accepts **processed feature tables only**. It does not perform any step that converts raw instrument output into a feature table.

| Capability | Why it is excluded | Where it belongs |
|------------|-------------------|------------------|
| Raw FASTQ ingestion or processing | Requires alignment, quality trimming, and demultiplexing pipelines | Upstream sequencing core or nf-core workflows |
| Raw IDAT preprocessing or array normalisation | Requires background correction, dye-bias adjustment, and probe-type normalisation | Upstream `minfi`, `Sesame`, or `ChAMP` pipelines |
| Bisulphite alignment | Requires reference genome indexing and methylation-aware aligner | Upstream `Bismark`, `bwa-meth`, or `BSMAP` |
| Methylation calling from raw reads | Requires CpG-level coverage and beta computation from aligned BAM | Upstream `MethylDackel`, `Bismark` methylation extractor |
| ATAC/ChIP/CUT&Tag/CUT&RUN peak calling | Requires BAM filtering, shift correction, and model-based peak detection | Upstream `MACS2/3`, `Genrich`, `HOMER` |
| Chromatin-state modelling | Requires segmentation or hidden-Markov modelling across the genome | Specialist `ChromHMM`, `Segway` workflows |

---

## 3. Advanced Modelling (Out of Scope)

Epigenomics MCP computes **deterministic QC profiles** (missingness, variance, replicate consistency). It does not perform statistical modelling that requires distributional assumptions or biological parameter estimation.

| Capability | Why it is excluded | Where it belongs |
|------------|-------------------|------------------|
| PoD / BMD modelling | Requires dose-response curve fitting and benchmark-dose algorithms | Downstream Bioactivity-PoD MCP |
| IVIVE or BER modelling | Requires in-vitro to in-vivo extrapolation or biologically effective dose translation | Downstream exposure-kinetics workflows |
| Enhancer-gene causal inference | Requires 3D chromatin interaction data, eQTL linking, or CRISPR validation | Specialist enhancer-gene inference pipelines |
| miRNA target prediction as a primary algorithm | Requires seed-matching, thermodynamic modelling, or experimental target validation | Specialist target-prediction tools (TargetScan, miRDB) |
| Single-cell native analysis | Requires cell clustering, trajectory inference, or pseudotime modelling | Single-cell specialist tools (Seurat, Scanpy) |
| Spatial transcriptomics / epigenomics | Requires spatial barcode resolution and neighbourhood modelling | Spatial omics specialist platforms |

---

## 4. Claims Beyond Evidence (Blocked or Stripped)

Epigenomics MCP v0.1 contains **claim guards** that strip or block the following unsupported claims before they reach any downstream packet.

| Claim type | Guard behaviour | Rationale |
|------------|-----------------|-----------|
| Persistence | Defaulted to `not_assessed` unless repeated/recovery timepoints present | Single timepoint cannot demonstrate persistence |
| Reversibility | Defaulted to `not_assessed` unless repeated/recovery timepoints present | Recovery observation required |
| Heritability / transgenerational effect | Stripped to `none` unless `multigenerationalDesign === true` | Germline transmission requires explicit study design |
| Causality | Never emitted; proximity ≠ causality in all mapping outputs | Correlation-only designs cannot support causal claims |
| Adversity | Never emitted; biological change ≠ adverse effect | Adversity determination requires apical endpoint integration |
| Regulatory conclusion | Never emitted | Regulatory conclusions require weight-of-evidence synthesis beyond any single omics layer |

---

## 5. v0.1 / v0.2 Boundary

Some capabilities are reserved for v0.2 or require explicit feature flags in v0.1.

| Capability | v0.1 | v0.2 |
|------------|------|------|
| Direct ATAC/ChIP/CUT&Tag/CUT&RUN adapters | Generic region table only | Assay-specific peak parsers and metric semantics |
| Processed BS-seq coverage-aware adapters | DMR tables only | Coverage-depth and CpG-density aware ingestion |
| miRNA measured-feature support | Feature-flagged only | Direct support with validated-target guardrails |
| lncRNA/ncRNA expression adapters | Deferred | Adapter support with Transcriptomics MCP boundary rules |
| ENCODE/GEO/BioStudies study adapters | Not implemented | Processed study ingestion with provenance trace |
| Controlled pseudobulk single-cell ATAC | Not implemented | Aggregation-provenance-aware ingestion |

---

## 6. Rationale Summary

Keeping the above capabilities out of scope:

1. **Preserves auditability** — A narrow boundary means every output is traceable to a small, well-defined set of operations.
2. **Prevents false precision** — The MCP does not manufacture biological interpretation from insufficient data.
3. **Avoids duplication** — Raw processing, statistical modelling, and regulatory synthesis are already handled by specialised tools.
4. **Enables deterministic validation** — Synthetic benchmarks can cover the full v0.1 scope because the scope is small and explicit.

---

*For what is in scope, see [scientific-scope.md](scientific-scope.md).*
