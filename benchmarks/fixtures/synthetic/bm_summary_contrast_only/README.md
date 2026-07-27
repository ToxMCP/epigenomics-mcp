# bm_summary_contrast_only

Benchmark for summary-contrast-only feature tables.

## Contents

- `feature_table.json` — 2 differentially-methylated-region features with contrast-level effect_size and q_value entries instead of per-sample beta values.
- `design.json` — 3 dose groups with 2 replicates each.
- `metadata.json` — DMR-seq provenance with a note about contrast-level values.
- `expected_policy.json` — Expected outcome: `excluded_qc_failure` because no contrast key matches a declared design sample.

## Scenario

Many published epigenomic datasets provide only summary statistics (effect
sizes, q-values) from differential analyses. While these can be biologically
informative, they cannot drive per-sample dose-response modelling. The
fail-closed missingness calculation evaluates the declared design samples,
finds zero per-sample coverage, and excludes both features from PoD handoff.
