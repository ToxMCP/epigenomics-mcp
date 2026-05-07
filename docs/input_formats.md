# Input Formats

## Processed Feature Tables

Epigenomics MCP accepts processed feature tables in the following forms:

### DNA Methylation

- **Array-based**: Beta-value or M-value matrices with probe IDs as row labels.
- **BS-seq-based**: Differential methylation results with genomic coordinates and effect sizes.

### Chromatin Accessibility / Binding

- **ATAC-seq**: Peak tables with coordinates, signal values (RPM, counts, or normalised signal), and optionally differential statistics.
- **ChIP-seq**: Narrow or broad peak tables with coordinates, signal values, and optionally q-values.

### Chromatin Interactions

- **Hi-C**: Interaction matrices or loop calls with anchor coordinates and interaction scores.

## Metadata Requirements

Every ingestion must be accompanied by:

1. **Dataset provenance** – Source, pipeline, version, contact/publication.
2. **Experimental design** – Study type, species, treatment groups, replicate layout.
3. **Platform annotation** – Platform name, genome build, coordinate system.

## File Formats

- CSV/TSV tabular files
- Parquet (recommended for large datasets)
- JSON or YAML for metadata

## Coordinate Conventions

All coordinate-bearing features must declare:

- Genome build (e.g., `hg38`, `mm10`)
- Coordinate system (`0-based-half-open` or `1-based-closed`)

Mixed builds or ambiguous coordinate systems within a single dataset are rejected.
