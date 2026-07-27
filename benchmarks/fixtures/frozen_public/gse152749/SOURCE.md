# GSE152749 frozen public response-pattern fixture

This fixture is derived from the 12 deposited blacklist-filtered ATAC-seq
`narrowPeak.gz` files for matched MCF-7 cells exposed for 72 hours to ethanol
vehicle or 50, 200, or 400 nM retinoic acid. Each condition has three
biological replicates at the same deposited starting cell density (100%).

- Series: <https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE152749>
- BioProject: PRJNA640339
- Publication: PMID 33284110
- Source file URLs and compressed/decompressed SHA-256 values:
  [`source_files.json`](source_files.json)

## Bounded derivation

The fixture uses the first five autosomes as a fixed, outcome-independent
bounded panel. For each source sample and chromosome it records:

1. the number of deposited blacklist-filtered narrowPeak rows; and
2. the sum of the deposited narrowPeak `signalValue` field.

No peak coordinates are changed, but individual peaks are not redistributed.
The derived chromosome summaries are stored as ten explicitly declared
`generic_region_feature` records in
[`response_packet.json`](response_packet.json). The derivation applies no
additional normalization, statistical testing, peak matching, or biological
selection.

To reproduce, download the 12 exact files listed in `source_files.json`, save
each as `<GSM accession>.narrowPeak.gz`, then run:

```bash
node derive_fixture.mjs --source-dir /path/to/files --verify
```

The script verifies source byte counts, row counts, compressed SHA-256 values,
decompressed SHA-256 values, and exact equality with the committed packet.

## Interpretation boundary

This fixture validates source identity, design handling, deterministic
aggregation, and observed-pattern computation on deposited measurements. It
does not establish differential accessibility, statistical significance,
biological significance, causal regulation, BMD suitability, or a biological
truth label. Chromosome-wide peak counts and signal sums can reflect library,
peak-calling, and other assay-level effects; their observed shapes must not be
interpreted as locus-level mechanisms.

All ten bounded summary features are non-monotonic under exact comparison of
the four group means. That is a test of transparent pattern preservation, not
an adverse-effect or modelability conclusion. Independent external
domain-expert sign-off remains deferred.
