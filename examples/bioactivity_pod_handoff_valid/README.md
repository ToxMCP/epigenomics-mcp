# Bioactivity-PoD Handoff Valid Examples

Stable golden fixtures for `BioactivityPoDHandoffPacket` release gating.

Each JSON file demonstrates a different qualification outcome that downstream
Bioactivity-PoD MCP consumers may encounter.

## Files

| File | Status demonstrated | Description |
|------|---------------------|-------------|
| `accepted.json` | `accepted_for_pod` | All features pass policy thresholds with no blocking warnings. |
| `accepted_with_warnings.json` | `accepted_with_caveats` | Features pass blocking rules but carry non-blocking warnings (e.g., below-preferred dose groups or replicates). |
| `exploratory_only.json` | `exploratory_only` | Mixed handoff: one feature is downgraded to exploratory-only due to dominant confounding; one feature is accepted. |
| `excluded.json` | `excluded_qc_failure` | Mixed handoff: one feature excluded due to high missingness; one feature is accepted. |

## Corresponding source packets

The `EpigenomicsFeatureResponsePacket` sources that produce (or would produce)
these handoffs are stored in:

```
benchmarks/expected/golden_handoff_examples/
  accepted/packet.json
  accepted_with_warnings/packet.json
  exploratory_only/packet.json
  excluded/packet.json
```

## Schema validation

All handoff examples are validated against the Zod schema
`BioactivityPoDHandoffPacketSchema` and the semantic validator
`validateHandoffPacket` in the test suite.
