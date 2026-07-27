# Handoff to Bioactivity-PoD MCP

## Overview

The `BioactivityPoDHandoffPacket` is the canonical interface between Epigenomics MCP and Bioactivity-PoD MCP.

## Packet Contents

| Field | Description |
|-------|-------------|
| `handoffId` | UUID for this handoff |
| `sourcePacketRef` | Reference to the originating `EpigenomicsFeatureResponsePacket` |
| `qualifiedFeatures` | All features with their qualification status |
| `excludedFeatures` | Features that were excluded and why |
| `doseResponseReadySubset` | Feature IDs deemed ready for dose-response modelling |
| `mandatoryCaveats` | Warnings that must be displayed to downstream consumers |

## Qualification Status

- **accepted** – Feature passed all explicit qualification rules.
- **exploratory** – Feature is interesting but has known caveats (e.g., high variance, borderline replicate consistency).
- **excluded** – Feature failed one or more fail-closed rules.

## Dose-Response Readiness

A feature is considered dose-response ready when:

1. The design is structurally valid and contains a control plus at least two
   distinct non-zero dose levels under the default policy.
2. Each group has at least two effective biological replicates; technical
   replicates do not satisfy this threshold.
3. Dose is not confounded with batch and multi-timepoint data have been
   evaluated as single-timepoint subsets.
4. It has numeric signal values across the qualifying dose levels.
5. No critical QC flags are attached.
6. The signal metric is on a scale interpretable by downstream modellers (e.g., beta value, log2 fold change, normalised signal).

The preferred project design has four distinct total dose levels (control plus
three treated levels) and at least three effective biological replicates per
group. Design readiness is necessary but not sufficient for BMD/PoD use:
observed response trend, model fit, uncertainty, and endpoint interpretation
remain downstream responsibilities.

## Caveats

Downstream consumers must display all `mandatoryCaveats` in any regulator-facing output. Caveats cannot be suppressed or filtered out by the consumer.
