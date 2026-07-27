# Scientific Scope

**Document status:** Regulator-facing product boundary statement  
**Product version:** 0.2.1
**Date:** 2026-07-27

---

## 1. What Epigenomics MCP Does

Epigenomics MCP is the **qualification and packetisation layer** between upstream epigenomic preprocessing and downstream quantitative bioactivity modelling. It does not generate biological conclusions; it converts processed assay outputs into qualified, provenance-rich, interpretation-limited feature-response packets that downstream systems can model safely.

### 1.1 Core responsibilities

| # | Responsibility | What it means |
|---|----------------|---------------|
| 1 | Ingest processed feature tables | Accept tabular outputs from upstream pipelines (methylation beta matrices, differential methylation results, ATAC/ChIP peak tables). Reject raw FASTQ, IDAT, or BAM inputs. |
| 2 | Validate experimental design | Verify control groups, dose axis ordering, replicate layout, timepoint structure, and batch metadata. Report structural ingestion, comparison, and dose-response readiness as separate states. |
| 3 | Validate genome build and coordinates | Require explicit `genome_build` and `coordinate_system` for every coordinate-bearing feature. Reject mixed builds, malformed intervals, and silent coordinate guessing. |
| 4 | Classify measured features | Map platform identifiers or region types onto explicit feature classes (`cpg_methylation_feature`, `dmr_feature`, `generic_region_feature`, etc.). Never guess metric semantics. |
| 5 | Profile QC deterministically | Compute missingness, variance, replicate consistency, and design adequacy using transparent, versioned algorithms. No opaque rescue operations. |
| 6 | Model confounding context | Ingest and classify cell-composition shifts, cytotoxicity, stress, differentiation drift, and batch effects as first-class machine-readable objects. |
| 7 | Apply fail-closed qualification rules | Features that fail explicit rules are excluded, downgraded, or blocked—not silently passed through. `accepted_for_pod` additionally requires the canonical dataset design assessment to be dose-response-ready. |
| 8 | Preserve measured coordinates separately from mapped targets | Store region-to-gene mappings in a separate payload. Never conflate "this region changed" with "this gene is regulated." |
| 9 | Export normative packets | Emit `EpigenomicsFeatureResponsePacket` and `BioactivityPoDHandoffPacket` with full provenance, warnings, and mandatory caveats. |
| 10 | Assess bounded exploratory ordered trends | Use independent biological replicate values to report permutation p-values, pointwise bootstrap effect intervals, and an explicit bounded-family multiplicity adjustment without changing qualification or fitting a BMD model. |

### 1.2 The product boundary

> Epigenomics MCP is the qualification and packetisation layer between upstream epigenomic preprocessing and downstream quantitative bioactivity modelling.

Everything on the **upstream** side of this boundary (raw sequencing, alignment, normalisation, peak calling) is out of scope. Everything on the **downstream** side (PoD/BMD modelling, IVIVE, regulatory conclusion) is also out of scope.

---

## 2. Assay Modalities Supported in v0.2

### 2.1 Direct support (no feature flags)

| Modality | Input form | Feature class | Key requirements |
|----------|-----------|---------------|------------------|
| DNA methylation (array) | Beta-value or M-value matrix with probe IDs | `cpg_methylation_feature` | Platform annotation provenance mandatory |
| DNA methylation (BS-seq) | Differential methylation table with coordinates | `dmr_feature` | Genome build and coordinate system mandatory |
| Generic coordinate-bearing regions | BED-like peak or region table | `generic_region_feature` | Explicit `feature_value_semantics` declaration mandatory |
| Summary contrasts | Log-fold-change or effect-size tables | `summary_feature_response` | Marked `exploratory_only` by default |

### 2.2 Reserved / feature-flagged support

| Modality | Feature class | v0.2 status |
|----------|--------------|-------------|
| ATAC-seq | `chromatin_accessibility_feature` | Reserved in contracts; generic region table path usable with explicit semantics |
| ChIP-seq / CUT&Tag / CUT&RUN | `histone_mark_feature` | Reserved in contracts; generic region table path usable with explicit semantics |
| miRNA expression | `mirna_expression_feature` | Behind feature flag; generic region table path preferred in v0.2 |
| lncRNA / ncRNA expression | `ncrna_expression_feature` | Deferred; boundary with Transcriptomics MCP documented |

### 2.3 What "generic region table path" means

v0.2 ships a single ingestion path for any coordinate-bearing processed table **when** the caller explicitly declares:

- `feature_value_semantics` — what the numeric column means (e.g., `rpm`, `normalised_signal`, `peak_score`)
- `genome_build` — e.g., `GRCh38`, `mm10`
- `coordinate_system` — `0-based-half-open` or `1-based-closed`
- `feature_class` — `generic_region_feature`

This path is intentionally generic to avoid premature specialisation. Assay-specific adapters (ATAC peak-caller outputs, ChIP broadPeak/narrowPeak, miRNA identifier mapping) are not part of v0.2.

---

## 3. What Is Not Inferred

Epigenomics MCP v0.2 makes **no inference** about the following:

1. **Causality** — Correlation between an epigenomic change and a phenotype is preserved as measured evidence only.
2. **Regulatory conclusion** — The service does not decide whether a change is adverse, beneficial, or irrelevant.
3. **Heritability / transgenerational effect** — Claims are stripped to `none` unless `multigenerationalDesign === true`.
4. **Persistence / reversibility** — Claims are defaulted to `not_assessed` unless repeated or recovery timepoints are present.
5. **Cell-type deconvolution** — The service ingests externally supplied cell fractions; it does not deconvolve bulk epigenomic data by default.
6. **Cytotoxicity from epigenomic signal** — Cytotoxicity must be supplied by companion assay; it is never inferred from methylation or accessibility patterns alone.
7. **Gene regulation** — A region-to-gene mapping is a contextual linkage, not a claim that the gene is regulated.
8. **Biological significance from response shape or trend evidence** — The
   descriptive pattern tool does not test a trend. The separate ordered-trend
   tool can report exploratory statistical evidence, but neither an adjusted
   p-value nor a bootstrap interval establishes biological importance,
   adversity, or regulatory relevance.
9. **BMD suitability from response shape alone** — Monotonic, flat, or
   non-monotonic labels do not establish model adequacy, select a benchmark
   response, or determine whether a feature is suitable for BMD modelling.
   Non-monotonicity is preserved for review and is not an automatic
   qualification exclusion.
10. **Confirmatory inference from metadata alone** — Ordered-trend testing
    requires independent, exchangeable biological units. The tool fails closed
    on declared multi-batch, non-biological, incomplete, or multi-timepoint
    inputs, but packet metadata cannot prove independence or exclude every
    confounder.

---

## 4. Downstream Consumers

| Consumer | What they receive | What they must not assume |
|----------|-------------------|---------------------------|
| Bioactivity-PoD MCP | `BioactivityPoDHandoffPacket` with qualified numeric features | That all features are biologically causal |
| Evidence Registry MCP | Provenance traces, checksums, packet lineage | That the registry validates scientific content |
| Annotation/Ontology MCP | Narrow, release-pinned annotation requests | That annotation is automatically correct for all contexts |
| WoE/NGRA Synthesis MCP | Evidence summaries with warnings/exclusions | That excluded features are biologically irrelevant |

---

## 5. Version and traceability

- Schema version: `0.1.0`
- Policy version: `0.1.0`
- Benchmark manifest: `benchmark_manifest.yaml`
- Full PRD: `epigenomics_mcp_prd.md`

See [non-goals.md](non-goals.md) for the explicit exclusion list.
