# bm_build_missing

Benchmark for missing genome build in coordinate-bearing features.

## Contents

- `feature_table.json` — 2 CpG features; the second omits the `build` field in `measuredRegion`.
- `design.json` — 2 dose groups with 2 replicates each.
- `metadata.json` — Minimal provenance.
- `expected_policy.json` — Expected outcome: schema invalid due to missing required `build` field.

## Scenario

Genome build is mandatory for coordinate-bearing features. Omitting it makes coordinates uninterpretable and should trigger schema-level rejection.
