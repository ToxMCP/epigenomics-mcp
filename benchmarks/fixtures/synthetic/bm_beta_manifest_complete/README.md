# bm_beta_manifest_complete

Happy-path synthetic benchmark for a complete DNA-methylation array (beta-value) dataset.

## Contents

- `feature_table.json` — 3 CpG methylation features with full per-sample beta values, valid hg38 coordinates, and zero missingness.
- `design.json` — 3 dose groups (0, 1, 10 µM) with 3 biological replicates each.
- `metadata.json` — Full provenance (minfi → SWAN normalisation), declared-pure HepaRG cell composition, and concurrent viability measurements showing no cytotoxicity.
- `expected_policy.json` — Expected outcome: `accepted_for_pod`, no warnings, handoff-ready.

## Scenario

This fixture represents an ideal regulator-facing submission: every required field is present, coordinate semantics are explicit, replicate counts exceed minimums, confounding contexts are measured and benign, and missingness is negligible.
