# bm_high_missingness

Benchmark for excessive missingness in feature values.

## Contents

- `feature_table.json` — 2 CpG features; the first has 4/6 values missing (66.7%).
- `design.json` — control plus 2 treated dose levels with 2 replicates each.
- `metadata.json` — Minimal provenance.
- `expected_policy.json` — Expected outcome: `excluded_qc_failure` for the high-missingness feature.

## Scenario

Missingness above the 20% exclusion threshold renders a feature unreliable for dose-response modelling. The qualification engine must flag such features with EPIE002_EXCESSIVE_MISSINGNESS and exclude them from the handoff subset.
