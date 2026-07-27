# Changelog

All notable changes to the Epigenomics MCP schema contracts will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-07-27

### Added

- Stateless MCP Streamable HTTP transport with loopback-safe defaults, Host and Origin validation, bearer authentication for non-loopback binds, request-size limits, and rate limiting.
- Protocol-level stdio and HTTP smoke tests using the official MCP client.
- Descriptive, strict tool schemas and explicit tool titles and annotations.
- Production dependency audit and release-security gate.
- A checksummed, source-linked GEO GSE67005 ingestion excerpt, a 10-case MCP evaluation set, and a real-engine 10,000-feature performance gate.
- Reviewed golden-output regeneration command with an explicit confirmation guard.
- Digest-pinned ToxMCP schema-spine projection, conformance tests, and a fail-closed scientific-invariants release gate.

### Changed

- Python distribution is now a dependency-light governance and compatibility package; historical analysis dependencies require the `analysis-compat` extra.
- Docker runtime is Node-only, installs production dependencies only, and runs as an unprivileged user.
- Manifest, CLI declarations, integrations, and documentation now reflect implemented behavior.
- Qualification and handoff tools can consume cell-composition and cytotoxicity profiles emitted by the companion ingestion tools.
- Region-to-gene mapping payloads now flow into mapping-aware qualification rules.

### Fixed

- Stateless HTTP request lifecycle and cross-client request-ID collisions.
- Domain-error tool responses that previously violated declared output schemas.
- Test nondeterminism caused by on-demand `tsx` installation and JSON key-order comparison.
- Misleading placeholder integration receipts that implied external writes had occurred.
- Missing design sample keys that were previously treated as observed values.
- Golden fixtures whose declared scientific expectations were not connected to the executed benchmark path.

## [0.1.0] - 2026-05-05

### Added
- Initial schema contracts for `EpigenomicsFeatureResponsePacket` and `BioactivityPoDHandoffPacket`.
- JSON Schema exports under `schemas/current/`.
- Schema drift detection workflow to block unintentional contract changes.
- Benchmark release gate integrating schema drift, golden drift, missing-output detection, and nondeterminism checks into CI.

### Golden Output Change Policy
Any change to benchmark golden expected outputs (`benchmarks/expected/`) must be accompanied by:
1. An explicit entry in this CHANGELOG under the relevant version section describing the reason for the change (e.g., contract evolution, bug fix, qualification rule update).
2. Regeneration via `npm run benchmark:update` after a clean build.
3. A manual review confirming the diff is intentional and scientifically justified.
4. Verification that the benchmark release gate (`npm run benchmark:gate`) passes with the updated golden files.
