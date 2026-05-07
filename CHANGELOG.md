# Changelog

All notable changes to the Epigenomics MCP schema contracts will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-05

### Added
- Initial schema contracts for `EpigenomicsFeatureResponsePacket` and `BioactivityPoDHandoffPacket`.
- JSON Schema exports under `schemas/current/`.
- Schema drift detection workflow to block unintentional contract changes.
- Benchmark release gate integrating schema drift, golden drift, missing-output detection, and nondeterminism checks into CI.

### Golden Output Change Policy
Any change to benchmark golden expected outputs (`benchmarks/expected/`) must be accompanied by:
1. An explicit entry in this CHANGELOG under the relevant version section describing the reason for the change (e.g., contract evolution, bug fix, qualification rule update).
2. Regeneration via `node benchmarks/scripts/generate-golden.mjs` after a clean build.
3. A manual review confirming the diff is intentional and scientifically justified.
4. Verification that the benchmark release gate (`npm run benchmark:gate`) passes with the updated golden files.
