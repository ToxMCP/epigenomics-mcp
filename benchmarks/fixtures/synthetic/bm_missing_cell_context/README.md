# bm_missing_cell_context

Benchmark for missing cell-composition context.

## Contents

- `feature_table.json` — 1 valid CpG feature.
- `design.json` — 2 dose groups with 2 replicates each.
- `metadata.json` — Provenance and cytotoxicity data present, but `cellComposition` is null.
- `expected_policy.json` — Expected outcome: accepted with a cell-composition warning; handoff remains ready under default policy.

## Scenario

Cell-composition shifts are a major confounder in bulk epigenomics. When context is missing, the default policy warns but does not block (blockOnMissingContext=false). This fixture tests that the warning is emitted and that the policy default is respected.
