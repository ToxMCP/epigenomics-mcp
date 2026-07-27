# bm_missing_cytotoxicity_context

Benchmark for missing cytotoxicity context.

## Contents

- `feature_table.json` — 1 valid CpG feature.
- `design.json` — control plus 2 treated dose levels with 2 replicates each.
- `metadata.json` — Provenance and cell composition present, but `cytotoxicity` is null.
- `expected_policy.json` — Expected outcome: accepted with a CTX_MISSING_CONTEXT warning; handoff remains ready.

## Scenario

Cytotoxicity confounding can dominate epigenomic signals. Without companion data, the system must warn but, under default policy, still permit handoff so that the absence is auditable.
