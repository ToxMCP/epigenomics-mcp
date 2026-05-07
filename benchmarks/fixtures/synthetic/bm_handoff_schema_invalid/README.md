# bm_handoff_schema_invalid

Benchmark for an invalid BioactivityPoDHandoffPacket.

## Contents

- `handoff.json` — Invalid handoff packet with schema violations: non-UUID handoffId, empty sourcePacketRef, empty qualifiedFeatures, empty doseResponseReadySubset, and malformed generatedAt timestamp.
- `expected_policy.json` — Expected outcome: schema invalid; handoff must be rejected.

## Scenario

Downstream consumers depend on strict schema compliance. This fixture tests that the validation layer correctly rejects malformed handoff packets rather than passing ambiguous data to Bioactivity-PoD MCP.
