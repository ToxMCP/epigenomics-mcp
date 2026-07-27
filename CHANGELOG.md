# Changelog

All notable changes to the Epigenomics MCP schema contracts will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Explicit bounded-batch streaming ingestion for authorized complete and
  gzip-compressed feature tables, with compressed-source and
  decompressed-content SHA-256 evidence.
- A reproducible three-source public-data panel covering full GEO GSE67005 and
  GSE84189 MeDIP matrices plus an ENCODE replicated-peak structural-ingestion
  case.
- A manually dispatched public-data validation workflow with cached,
  reviewable reports.
- Explicit structural, comparison-only, minimum dose-response, and preferred
  dose-response readiness states in design-validation and ingestion outputs.

### Changed

- Design readiness now uses distinct numeric dose levels and observed
  effective biological replicates. Technical replicates do not satisfy the
  biological minimum.
- The public-data report now distinguishes file ingestion from comparison and
  dose-response readiness. Baseline-only ENCODE peaks ingest successfully
  without being promoted to comparison or PoD use.
- Design-validation golden outputs were intentionally regenerated to record
  the new readiness fields and corrected blocking behavior.

### Fixed

- Explicit wide-form sample columns are now authoritative, preventing numeric
  annotations such as probe position, peak score, or q-value from being
  misclassified as biological samples.
- Dose-group labels sharing the same numeric dose no longer inflate
  qualification eligibility.
- Dose–batch confounding and insufficient observed biological replication now
  block comparison and dose-response readiness.
- Undeclared sample-to-group references now return structural validation
  errors instead of allowing replicate assessment to throw.

## [0.2.1] - 2026-07-27

### Changed

- Restyled the capability snapshot with the emoji-led convention used by newer ToxMCP module repositories.
- Relicensed this and future distributions from MIT to Apache License 2.0. The already-published `v0.2.0` artifacts retain the MIT license included in those immutable artifacts.

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
