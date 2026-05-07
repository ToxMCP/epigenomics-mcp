# bm_invalid_coordinate_format

Benchmark for invalid genomic coordinate formats.

## Contents

- `feature_table.json` — 2 features with coordinate errors: (1) end < start, (2) malformed chromosome string "1q".
- `design.json` — 2 dose groups with 2 replicates each.
- `metadata.json` — Minimal provenance.
- `expected_policy.json` — Expected outcome: schema invalid due to coordinate validation failures.

## Scenario

Coordinate integrity is a hard requirement. Both end <= start and non-matching chromosome patterns must be rejected at schema-validation time.
