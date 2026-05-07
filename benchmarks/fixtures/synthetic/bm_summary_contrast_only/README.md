# bm_summary_contrast_only

Benchmark for summary-contrast-only feature tables.

## Contents

- `feature_table.json` — 2 differentially-methylated-region features with contrast-level effect_size and q_value entries instead of per-sample beta values.
- `design.json` — 3 dose groups with 2 replicates each.
- `metadata.json` — DMR-seq provenance with a note about contrast-level values.
- `expected_policy.json` — Expected outcome: `exploratory_only` because per-sample dose-response data is absent.

## Scenario

Many published epigenomic datasets provide only summary statistics (effect sizes, q-values) from differential analyses. While these are biologically informative, they cannot drive per-sample dose-response modelling. This fixture tests that such data is classified as exploratory-only rather than accepted for PoD handoff.
