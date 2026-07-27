# bm_insufficient_replicates

Benchmark for insufficient biological replicates.

## Contents

- `feature_table.json` — 1 valid CpG feature.
- `design.json` — 3 dose groups with only 1 replicate each.
- `metadata.json` — Minimal provenance.
- `expected_policy.json` — Expected outcome: `excluded_qc_failure` because replicates fall below the policy minimum of 2.

## Scenario

Single-replicate designs cannot support variance estimation for dose-response modelling. The default policy minimum is 2 biological replicates per group. This fixture tests that the qualification engine correctly excludes datasets that do not meet replicate thresholds.
