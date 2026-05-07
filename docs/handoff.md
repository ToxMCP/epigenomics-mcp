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

1. It has numeric signal values across ≥3 dose groups or time points.
2. Replicate consistency within groups is above the configured threshold.
3. No critical QC flags are attached.
4. The signal metric is on a scale interpretable by downstream modellers (e.g., beta value, log2 fold change, normalised signal).

## Caveats

Downstream consumers must display all `mandatoryCaveats` in any regulator-facing output. Caveats cannot be suppressed or filtered out by the consumer.
