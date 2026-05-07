# bm_handoff_schema_valid

Happy-path benchmark for a valid BioactivityPoDHandoffPacket.

## Contents

- `handoff.json` — Valid handoff packet with 2 qualified features, empty exclusions, and a non-empty doseResponseReadySubset.
- `expected_policy.json` — Expected outcome: schema valid, handoff ready.

## Scenario

This fixture represents the ideal output of the qualification and handoff builder: all features pass QC, mapping is high-confidence, and the packet is ready for downstream Bioactivity-PoD MCP consumption.
