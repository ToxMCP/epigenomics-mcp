# bm_dominant_cytotoxicity

Benchmark for dominant cytotoxicity confounding.

## Contents

- `feature_table.json` — 1 valid CpG feature.
- `design.json` — 2 dose groups with 2 replicates each.
- `metadata.json` — Provenance, cell composition, and cytotoxicity data showing viability dropping to ~0.53 with stress flags.
- `expected_policy.json` — Expected outcome: accepted with cytotoxicity and stress-response warnings.

## Scenario

At low dose, viability collapses below the 0.8 threshold and stress flags are present. This represents a dominant-confounding scenario. The fixture tests that cytotoxicity detection and stress-flag warnings are both emitted. Under v0.1, handoff is not yet blocked (policy block level is dominant_confounding but engine implementation is warning-only).
