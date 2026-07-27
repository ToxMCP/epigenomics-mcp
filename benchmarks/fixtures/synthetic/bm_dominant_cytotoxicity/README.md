# bm_dominant_cytotoxicity

Benchmark for dominant cytotoxicity confounding.

## Contents

- `feature_table.json` — 1 valid CpG feature.
- `design.json` — control plus 2 treated dose levels with 2 replicates each.
- `metadata.json` — Provenance, cell composition, and cytotoxicity data showing viability dropping to ~0.53 with stress flags.
- `expected_policy.json` — Expected outcome: `exploratory_only` with blocking cytotoxicity and stress-response warnings.

## Scenario

Across treated doses, viability collapses and a stress flag is present. The deterministic
classifier elevates the profile to `dominant_confounding`, which meets the
default block level, downgrades the feature to exploratory-only, and prevents a
ready handoff.
