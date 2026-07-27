# Epigenomics MCP

[![CI](https://github.com/ToxMCP/epigenomics-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ToxMCP/epigenomics-mcp/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Status](https://img.shields.io/badge/Status-Audit--Ready%20Core-2E8B57)](./docs/validation-statement.md)
[![Node](https://img.shields.io/badge/Node-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![MCP](https://img.shields.io/badge/MCP-JSON--RPC-informational)](https://modelcontextprotocol.io/)

> Part of **ToxMCP** Suite -> https://github.com/ToxMCP/toxmcp

**Public MCP server for processed epigenomic feature evidence qualification, coordinate/design validation, provenance-preserving packetization, and Bioactivity-PoD-ready handoff packaging.**
It turns already-processed methylation, chromatin accessibility, histone mark, region-level, and summary epigenomic evidence into auditable qualification results and warning-bearing downstream packets without taking over raw FASTQ/IDAT preprocessing, peak calling, causal enhancer inference, PoD/BMD modelling, or regulatory conclusion generation.

> Processed evidence in; qualified, warning-bearing, PoD-ready epigenomics packet out.

---

## Architecture

```mermaid
flowchart LR
    subgraph Clients["Clients and Orchestrators"]
        Codex["Codex CLI / Desktop"]
        Scripts["Scripts / notebooks"]
        Hosts["MCP-aware hosts"]
    end

    subgraph MCP["TypeScript MCP Server"]
        Stdio["stdio JSON-RPC runtime"]
        Http["Stateless Streamable HTTP\nPOST /mcp"]
        Tools["Read-only tool registry"]
        Resources["Audit resources\nschemas, docs, evidence"]
    end

    subgraph Engine["Epigenomics Qualification Layer"]
        Ingestion["Processed feature ingestion"]
        Design["Design and coordinate validation"]
        QC["QC, missingness,\nreplicate profiling"]
        Qualification["Policy-versioned\nqualification rules"]
    end

    subgraph Handoff["Downstream Contracts"]
        Packet["EpigenomicsFeatureResponsePacket"]
        Pod["BioactivityPoDHandoffPacket"]
        Evidence["Release evidence\nand checksums"]
    end

    Clients --> Stdio
    Clients --> Http
    Stdio --> Tools
    Stdio --> Resources
    Http --> Tools
    Http --> Resources
    Tools --> Ingestion
    Tools --> Design
    Tools --> QC
    Tools --> Qualification
    Qualification --> Packet
    Packet --> Pod
    Resources --> Evidence
```

The released surface is intentionally bounded:

- this MCP owns processed-feature qualification, not raw assay preprocessing
- coordinates, genome build, design adequacy, missingness, and provenance are validated fail-closed
- warnings preserve scientific caveats instead of converting proximity or context into causal claims
- release readiness is backed by schema drift checks, golden benchmark comparisons, nondeterminism checks, and checksummed release evidence

## Feature snapshot

| Capability | Description |
| --- | --- |
| `🧬 Processed epigenomic evidence` | Reads already-processed methylation, chromatin-accessibility, histone-mark, region-level, and summary feature evidence with explicit experimental designs. |
| `🗺️ Coordinate and build validation` | Validates genome build, coordinate system, chromosome bounds, and feature-coordinate semantics before qualification. |
| `📊 QC and replicate profiling` | Profiles deterministic quality control, missingness, variance, and replicate adequacy without inventing unavailable measurements. |
| `🧫 Biological-context review` | Assesses cell-composition and cytotoxicity context while preserving uncertainty and avoiding silent causal overclaims. |
| `🧭 Explainable qualification` | Applies policy-versioned qualification rules with reviewable rule traces, warnings, and fit-for-purpose boundaries. |
| `📦 Governed handoff packaging` | Builds `EpigenomicsFeatureResponsePacket` and `BioactivityPoDHandoffPacket` outputs for downstream suite workflows. |
| `🔌 MCP-native discovery` | Exposes strict tool schemas, structured content, annotations, and read-only audit resources over stdio and Streamable HTTP. |
| `🧾 Checksummed release evidence` | Generates SHA-256 evidence for schemas, golden outputs, benchmark manifests, validation documents, scientific invariants, and package contents. |
| `🌍 Full public-data validation` | Replays two complete GEO MeDIP matrices and one complete ENCODE replicated-peak file through the MCP with exact source and decompressed-content hashes. |
| `🚦 Performance and release gates` | Exercises the real packet-validation and qualification engine at 10,000-feature scale alongside protocol, security, conformance, and nondeterminism checks. |

## Release gates

The `0.2.1` release surface uses these deterministic gates for the bounded
processed-evidence qualification scope:

- `npm run lint` and `npm test` cover source quality and behavior
- `npm run smoke:mcp` exercises both transports through the official MCP client
- `npm run security:audit` requires zero production dependency vulnerabilities
- `npm run eval:validate` checks the committed 10-case MCP evaluation set
- `npm run benchmark:ci` checks golden outputs and the qualification performance budget
- `npm run verify:evidence` verifies the post-commit release-evidence bundle
- `.venv/bin/pytest tests/python -q` checks the dependency-light Python governance and compatibility layer
- `npm run verify:release` composes the release gates

These are product-level readiness checks for this MCP boundary, not claims of biological truth, regulatory acceptance, or downstream PoD/BMD validity.

## Full public-data validation

The optional networked validation panel runs three complete public files through
the official MCP stdio client:

| Source | Rows checked | Expected result |
| --- | ---: | --- |
| NCBI GEO GSE67005 low-dose MeDIP | 2,077,859 | Data, design, and provenance valid |
| NCBI GEO GSE84189 five-day VPA MeDIP | 384,368 | Data, design, and provenance valid |
| ENCODE ENCFF205CPH replicated ATAC peaks | 171,471 | Structurally valid data; baseline-only design rejected for dose response |

```bash
npm run validate:public-data
# Reuse the verified local cache without network access:
npm run validate:public-data -- --offline
```

The source files are checksummed, cached outside the package, decompressed and
canonicalized in bounded batches, and compared with the source-anchored
expectations in
[`benchmarks/public_validation/`](./benchmarks/public_validation/README.md).
This establishes complete-file ingestion and fail-closed design handling, not
biological ground truth or statistical validity. External domain-expert
sign-off of the expectations remains pending.

A separate frozen-public realism fixture derives ten bounded chromosome-level
summaries from all 12 deposited GSE152749 ATAC-seq peak files: matched vehicle,
50, 200, and 400 nM retinoic-acid groups with three biological replicates
each. The fixture and reproducible checksum-verifying derivation are under
[`benchmarks/fixtures/frozen_public/gse152749/`](./benchmarks/fixtures/frozen_public/gse152749/SOURCE.md).
It verifies real multi-dose response-pattern handling while explicitly making
no differential-accessibility, biological-significance, or BMD-suitability
claim.

## Quickstart TL;DR

```bash
npm ci
npm run build
npm run smoke:mcp
npm run benchmark:ci
npx epimcp serve
```

For local Streamable HTTP:

```bash
EPIMCP_MCP_PORT=8000 npm run mcp:serve:http
# MCP endpoint: http://127.0.0.1:8000/mcp
# Health endpoint: http://127.0.0.1:8000/health
```

The Python distribution is a dependency-light governance and compatibility
package. It contains the fail-closed schema-spine projection gate, but it is not
a second MCP server implementation:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e .[dev]
.venv/bin/pytest tests/python -q
```

## MCP public tools

Over stdio or Streamable HTTP, the public tool surface includes:

| Tool | Description |
|------|-------------|
| `health` | Return server health status |
| `ingest_dataset` | Validate the evidence chain and separately report ingestion and analysis readiness |
| `validate_design` | Report structural, comparison, minimum dose-response, and preferred dose-response states |
| `qualify_features` | Qualify features using the canonical dataset design-readiness gate and feature-level QC |
| `generate_handoff` | Generate a Bioactivity-PoD handoff only for a dose-response-ready design |
| `validate_coordinates` | Validate coordinate system declarations |
| `profile_qc` | Compute deterministic QC profile |
| `profile_missingness` | Compute missingness profile |
| `ingest_cell_composition` | Ingest cell-composition evidence |
| `ingest_cytotoxicity` | Ingest cytotoxicity context |
| `summarize_by_group` | Summarize feature responses by dose group |
| `assess_response_patterns` | Classify bounded observed dose-level mean patterns without fitting a model |
| `read_table` | Read a delimited table with file guardrails and pagination |
| `read_design` | Read a design table into the design contract |
| `generate_qc_report` | Generate a regulator-readable QC report |
| `convert_coordinates` | Normalize coordinate records to 0-based half-open coordinates |

All tools are registered with `registerTool(...)`, strict input schemas, output schemas, read-only/idempotent annotations, and `structuredContent` plus JSON text content for compatibility.

## MCP audit resources

Read-only MCP resources expose contracts and evidence directly to clients:

| Resource URI | Contents |
|--------------|----------|
| `epimcp://schemas/epigenomics-feature-response-packet` | Current response-packet JSON Schema |
| `epimcp://schemas/bioactivity-pod-handoff-packet` | Current Bioactivity-PoD handoff JSON Schema |
| `epimcp://schemas/region-to-gene-mapping` | Region-to-gene mapping JSON Schema |
| `epimcp://schemas/external-database-mapping` | External annotation mapping JSON Schema |
| `epimcp://schemas/base-envelope` | Shared envelope JSON Schema |
| `epimcp://schemas/qualification-policy` | Qualification policy JSON Schema |
| `epimcp://docs/validation-statement` | Regulator-facing validation statement |
| `epimcp://docs/tool-reference` | Tool and usage reference |
| `epimcp://benchmarks/manifest` | Release benchmark manifest |
| `epimcp://release-evidence/manifest` | Latest generated release evidence manifest |
| `epimcp://release-evidence/checksums` | Latest generated checksum list |
| `epimcp://release-evidence/release-gate-json` | Latest captured release-gate JSON |
| `epimcp://release-evidence/release-gate-report` | Latest captured release-gate report |
| `epimcp://release-evidence/scientific-invariants` | Latest checksummed schema-spine scientific-invariants result |

## Release evidence

Generate the release evidence bundle:

```bash
npm run release:evidence
```

This writes:

- `release-evidence/release-evidence.json`
- `release-evidence/checksums.sha256`
- `release-evidence/release-gate.json`
- `release-evidence/release-gate.txt`
- `release-evidence/npm-pack-dry-run.json`

The evidence manifest records package/config versions, environment details, Git availability, release-gate status, npm pack dry-run metadata, and checksums for the committed audit inputs.
Release evidence is generated from a clean source tree. For release commits, commit code/docs/config changes first, run `npm run release:evidence`, then commit the refreshed `release-evidence/` bundle.
An evidence bundle generated for an older source revision or product version is
intentionally rejected by `npm run verify:evidence`.

The npm package includes the files backing all registered audit resources,
including current schemas, validation docs, synthetic and frozen-public
benchmark inputs, the full-public-validation manifest and metadata, golden
outputs, the evaluation set, and the latest release evidence bundle.

## Public verification

Public audit verification should check both local commands and GitHub evidence:

- run `npm run verify:evidence` to prove the committed bundle is schema-valid, checksum-valid, package-visible, and tied to the current source lineage
- run `npm run verify:release` for the full local release gate
- confirm GitHub CI, Docker Build and Smoke, Benchmarks, Schema Drift Guard, and Handoff Validation are green
- download the `ci-release-evidence` Actions artifact from the successful Node 20 CI run when independent CI-generated evidence is needed

## ToxMCP suite fit

| Module | Role in the suite | Relationship to this repo |
|--------|-------------------|---------------------------|
| `Epigenomics MCP` | Processed epigenomic evidence qualification and handoff | This repo |
| `Bioactivity-PoD MCP` | Point-of-departure and dose-response modelling | Downstream handoff consumer |
| `Evidence Ingestion Study Registry MCP` | Evidence intake, provenance, and study packaging | Planned upstream integration; no active connector is claimed in `0.2.1` |
| `Annotation/Ontology MCP` | Identifier, ontology, and mapping context | Planned enrichment integration; local mapping contracts are active |
| `ToxMCP Hub` | Suite control plane and contract index | Suite-level orchestration context |

## Project boundary

This MCP is intentionally conservative about what it does not claim.

It is **not**:

- a raw FASTQ, BAM, or IDAT processing system
- a bisulfite alignment or methylation-calling engine
- a peak caller
- a chromatin-state learner
- an enhancer-gene causal inference engine
- a miRNA target-prediction engine
- a PoD/BMD modeller
- a regulatory conclusion generator

It **does**:

- preserve measured identifiers and coordinates separately from mapped targets
- fail closed on missing or malformed coordinate/build semantics
- surface confounding and interpretation warnings
- preserve provenance with required upstream processing steps
- provide machine-verifiable schemas, benchmarks, and release evidence

See [docs/validation-statement.md](./docs/validation-statement.md), [docs/tool-reference.md](./docs/tool-reference.md), and [toxmcp.manifest.yaml](./toxmcp.manifest.yaml) for the detailed contract and audit surface.

## Repository layout

- `src/epimcp/`: TypeScript MCP server, CLI, tool registry, resources, and config
- `src/contracts/`: Zod contracts for packets, provenance, design, features, QC, mapping, and policy
- `src/ingestion/`: Processed table readers and feature-table canonicalization
- `src/qualification/`: Policy, rule engine, explainability, and claim guards
- `src/qc/`: QC, missingness, variance, and confounding profilers
- `schemas/current/`: Committed JSON Schema exports
- `benchmarks/fixtures/synthetic/`: Synthetic release benchmark inputs
- `benchmarks/fixtures/frozen_public/`: Checksummed, source-linked public-data excerpts
- `benchmarks/public_validation/`: Complete-file public-source manifest, design, provenance, and reviewed expectations
- `benchmarks/expected/`: Golden benchmark outputs
- `benchmark-results/`: Latest benchmark and release-gate reports
- `evaluation.xml`: Ten stable, independently answerable MCP evaluation cases
- `release-evidence/`: Latest checksummed audit evidence bundle
- `docs/`: Boundary, validation, format, coordinate, confounding, and tool references
- `tests/`: Vitest, contract, smoke, equivalence, and Python tests

## Development

```bash
npm run typecheck
npm test
npm run build
npm run smoke:mcp
npm run benchmark:gate
npm run validate:public-data
npm run release:evidence
npm run verify:evidence
.venv/bin/pytest tests/python -q
npm run verify:release
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `schemaVersion` | `0.1.0` | Schema version for response packets |
| `policyVersion` | `0.1.0` | Default qualification policy version |
| `EPIMCP_ALLOWED_FILE_ROOTS` | current working directory | Comma-separated MCP file-read allowlist roots |
| `EPIMCP_MAX_FILE_BYTES` | `26214400` | Maximum file size for MCP file reads |
| `EPIMCP_DEFAULT_ROW_LIMIT` | `1000` | Default `read_table` row page size |
| `EPIMCP_MAX_ROW_LIMIT` | `5000` | Maximum `read_table` row page size |
| `EPIMCP_MCP_HOST` | `127.0.0.1` | Streamable HTTP bind host |
| `EPIMCP_MCP_PORT` | `8000` | Streamable HTTP port |
| `EPIMCP_ALLOWED_HOSTS` | loopback hosts | Comma-separated accepted HTTP Host names; required for non-loopback binds |
| `EPIMCP_ALLOWED_ORIGINS` | loopback origins | Comma-separated accepted browser Origin values |
| `EPIMCP_AUTH_TOKEN` | unset | Bearer token; required for non-loopback binds |
| `EPIMCP_MAX_HTTP_BODY_BYTES` | `1048576` | Maximum Streamable HTTP request body |
| `EPIMCP_RATE_LIMIT_PER_MINUTE` | `120` | Per-client request limit |

Remote HTTP binding is deliberately explicit. Set a non-loopback
`EPIMCP_MCP_HOST`, a narrow `EPIMCP_ALLOWED_HOSTS` list, and
`EPIMCP_AUTH_TOKEN`; terminate TLS at a trusted reverse proxy.

## Version and compatibility

- Package version: `0.2.1`
- Schema version: `0.1.0`
- Policy version: `0.1.0`
- Node.js: `>=20`
- Python: `>=3.11`
- Downstream contract: Bioactivity-PoD handoff packet `0.1.0`

## License

Apache License 2.0.
