# Scientific Scope

## What Epigenomics MCP Does

Epigenomics MCP is the qualification and packetisation layer between upstream epigenomic preprocessing and downstream quantitative bioactivity modelling.

### Core Responsibilities

1. **Ingest processed epigenomic feature tables** – Accept tabular outputs from upstream pipelines (e.g., methylation beta matrices, differential methylation results, ATAC/ChIP peak tables).

2. **Validate experimental design** – Verify that the study structure supports dose-response or time-series inference.

3. **Validate genome build and coordinates** – Ensure every coordinate-bearing feature declares its genome build and coordinate system unambiguously.

4. **Classify measured features** – Map raw platform identifiers or region types onto explicit feature classes (CpG, DMR, peak, interaction, etc.).

5. **Profile QC deterministically** – Compute missingness, variance, replicate consistency, and design adequacy metrics.

6. **Model confounding context** – Flag or quantify cell-composition shifts, cytotoxicity, stress, differentiation drift, and batch effects.

7. **Apply fail-closed qualification rules** – Features that fail explicit rules are excluded, not silently passed through.

8. **Preserve measured coordinates separately from mapped targets** – Never conflate "this region changed" with "this gene is regulated."

9. **Export normative packets** – Emit `EpigenomicsFeatureResponsePacket` and `BioactivityPoDHandoffPacket` with full provenance.

## Assay Modalities Supported in v0.1

- DNA methylation (array and bisulphite-seq)
- ATAC-seq (processed peak tables)
- ChIP-seq (narrow and broad peaks, histone marks)
- Hi-C (chromatin interactions)

## Out of Scope

See [non_goals.md](non_goals.md).
