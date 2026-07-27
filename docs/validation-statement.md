# Epigenomics MCP v0.2 — Validation Statement

**Document status:** Regulator-facing benchmark coverage statement  
**Product version:** 0.2.1
**Schema and policy version:** 0.1.0
**Date:** 2026-07-27
**Scope:** Golden benchmarks, frozen-public fixture integrity, complete-file public-data validation, real-engine performance, deterministic behavior, transport/security smoke coverage, release evidence, and explicit limitations

---

## 1. What this statement covers

This document explains the validation suite that gates the v0.2 release of Epigenomics MCP. It describes:

- The **fixture scope** — what synthetic and frozen-public inputs are used and why
- The **performance scope** — what real implementation path and workload are gated
- **Deterministic behaviours** that are tested and guaranteed
- **Explicit limitations** — what the benchmarks do not prove
- **Release evidence** — which generated artifacts carry audit checksums
- **Non-goals** — product boundaries that remain outside v0.2 validation
- **Traceability** from each benchmark case to the Product Requirements Document (PRD)

This statement is intended for regulator-facing reviewers, downstream Bioactivity-PoD MCP consumers, and audit teams who need to understand what "benchmark pass" means in terms of evidence quality and safety.

---

## 2. Benchmark manifest overview

The v0.2 release retains **12 golden release benchmarks** declared in `benchmark_manifest.yaml`:

| # | Benchmark name | Type | PRD linkage |
|---|----------------|------|-------------|
| 1 | `bm_beta_manifest_complete` | feature | §2.1 — happy-path processed-feature ingestion |
| 2 | `bm_dmr_nearest_gene_only` | feature | §2.3 — mapping-proximity causality guard |
| 3 | `bm_build_missing` | feature | §2.2 — coordinate/build semantics validation |
| 4 | `bm_invalid_coordinate_format` | feature | §2.2 — fail-closed coordinate rejection |
| 5 | `bm_missing_cell_context` | feature | §2.4 — confounding-context flagging |
| 6 | `bm_missing_cytotoxicity_context` | feature | §2.4 — cytotoxicity context warning |
| 7 | `bm_dominant_cytotoxicity` | feature | §2.4 — dominant-confounding detection |
| 8 | `bm_insufficient_replicates` | feature | §2.1 — design-integrity validation |
| 9 | `bm_high_missingness` | feature | §2.5 — QC missingness threshold |
| 10 | `bm_summary_contrast_only` | feature | §2.6 — contrast-vs-per-sample distinction |
| 11 | `bm_handoff_schema_valid` | handoff | §2.7 — normative packet schema compliance |
| 12 | `bm_handoff_schema_invalid` | handoff | §2.7 — fail-closed schema rejection |

Each feature benchmark executes six deterministic steps:

1. `validateDesign` — experimental design integrity
2. `profileQc` — deterministic QC metric computation
3. `profileMissingness` — per-feature / per-sample / per-group missingness
4. `qualifyFeatures` — fail-closed qualification rule engine
5. `buildHandoffPacket` — BioactivityPoDHandoffPacket construction
6. `buildPacket` — EpigenomicsFeatureResponsePacket snapshot

Each handoff benchmark executes two steps:

1. `validateHandoffSchema` — Zod schema strict validation
2. `passthrough` — raw handoff snapshot comparison

All golden outputs are deterministic: timestamps, UUIDs, and random seeds are normalised via `benchmark_manifest.yaml` normalization block.

The release gate is materialised by `npm run benchmark:gate`, which writes a
machine-readable `benchmark-results/release-gate.json` and a human-readable
`benchmark-results/release-gate.txt`. The audit bundle is generated separately
with `npm run release:evidence`; it captures a fresh passing release gate,
checksums the committed schemas, golden benchmark outputs, benchmark manifest,
validation documents, and npm pack dry-run metadata, then writes the bundle
under `release-evidence/`. `npm run verify:evidence` verifies the committed
bundle against the current source lineage, checksum file, MCP audit resources,
and npm package dry-run coverage.

The same gate also runs `benchmarks/qualification_engine_benchmark.mjs`
against the actual compiled qualification engine with 10,000 features and six
samples (60,000 response values). It checks expected accepted/excluded counts,
a 20-second wall-clock budget, and a 512 MiB RSS-increase budget. These broad
budgets catch regressions and accidental algorithmic blow-ups; they are not
capacity-planning guarantees.

A separate checksummed public-data excerpt under
`benchmarks/fixtures/frozen_public/gse67005/` exercises file paging, design
reading, and canonicalized ingestion against deposited GEO values. Its YAML
record and local files are checksum-validated in unit tests. The public excerpt
does not participate in golden biological outcome assertions.

### 2.1 Complete-file public-data panel

An optional panel declared in `benchmarks/public_validation/manifest.json`
launches the MCP stdio server through the official client and calls
`ingest_dataset` in explicit streaming mode.

| Public case | Complete rows | Source checks | Expected result |
| --- | ---: | --- | --- |
| GEO GSE67005 low-dose MeDIP matrix | 2,077,859 | Compressed bytes/SHA-256 and decompressed SHA-256 | Ingested; comparison-ready; not dose-response-ready |
| GEO GSE84189 five-day VPA MeDIP matrix | 384,368 | Compressed bytes/SHA-256 and decompressed SHA-256 | Ingested; comparison-ready; not dose-response-ready |
| ENCODE ENCFF205CPH replicated A549 ATAC peaks | 171,471 | Compressed bytes/SHA-256 and decompressed SHA-256 | Ingested structurally; neither comparison- nor dose-response-ready |

The third case verifies the boundary between ingestion and analytical
readiness: ENCODE reports replicated peaks, but the aggregate file has no
treated dose level. The valid peak file is ingested without being described as
comparison-ready or PoD-ready input.

Source files are downloaded to an ignored cache and are not redistributed.
Expected outcomes are source-anchored and internally reviewed; independent
external domain-expert sign-off is deferred to a later stage.

### 2.2 Multi-dose response-pattern realism

The frozen-public fixture under
`benchmarks/fixtures/frozen_public/gse152749/` uses the deposited GSE152749
ATAC-seq dose series: matched MCF-7 ethanol vehicle plus 50, 200, and 400 nM
retinoic acid at 72 hours, with three biological replicates per condition.
Compressed and decompressed SHA-256 values are recorded for all 12 complete
blacklist-filtered narrowPeak files.

To keep the committed fixture bounded and redistribution-conscious, a
checksum-verifying script derives two transparent assay summaries for each of
the first five autosomes: deposited peak count and deposited `signalValue`
sum. The resulting ten features exercise the complete response-pattern
contract. Under exact comparison, all ten have non-monotonic group-mean
sequences; five remain below control at every treated dose and five cross the
control mean. The expected labels are deterministic software assertions, not
claims of differential accessibility or biological ground truth.

This fixture verifies that a preferred-depth real design and non-monotonic
deposited measurements remain representable without automatic exclusion.
Trend significance, biological significance, BMD suitability, and expert
interpretation remain explicitly unassessed.

---

## 3. Fixture scope and scientific intent

### 3.1 Happy path — `bm_beta_manifest_complete`

**Fixture contents:** Three CpG methylation features from an Illumina EPIC
array, complete beta-value matrix, valid GRCh38 coordinates, 3 biological
replicates per dose group (3 dose groups: 0, 1, 10 µM), declared
cell-composition context, concurrent cytotoxicity data, and low missingness.

**What it tests:**
- Schema validation accepts well-formed features and design.
- QC profiler computes deterministic summary statistics (mean, variance, range).
- Missingness profiler reports zero exclusion-band features.
- Qualification engine assigns `accepted_with_caveats` because three dose
  groups are below the policy preference of four.
- Handoff builder marks the packet `readyForPod = true`.

**Expected outcome:** `schemaValid = true`,
`qualificationStatus = accepted_with_caveats`,
`EPIW005_BELOW_PREFERRED_DOSE_GROUPS`, `handoffReady = true`.

### 3.2 Coordinate semantics — `bm_build_missing` and `bm_invalid_coordinate_format`

These two benchmarks test the **fail-closed coordinate validator** (PRD §2.2).

| Benchmark | Defect | Expected outcome |
|-----------|--------|-----------------|
| `bm_build_missing` | One feature omits `measuredRegion.build` | packet schema invalid, `EPI001_PACKET_SCHEMA_INVALID`, no handoff |
| `bm_invalid_coordinate_format` | `end <= start` and malformed chromosome | packet schema invalid, `EPI001_PACKET_SCHEMA_INVALID`, no handoff |

**Scientific rationale:** Genomic coordinates are meaningless without an explicit genome build. The engine rejects ambiguous or malformed coordinates rather than silently defaulting to a build.

### 3.3 Design integrity — `bm_insufficient_replicates`

**Fixture contents:** Single replicate per dose group (3 groups).

**What it tests:** The default qualification policy requires `minBiologicalReplicatesPerGroup = 2`. Although the design schema permits `minReplicatesPerGroup = 1`, the policy engine excludes the dataset because it falls below the biological-replicate threshold.

**Expected outcome:** `excluded_qc_failure`,
`EPI006_INSUFFICIENT_REPLICATES`, `handoffReady = false`.

### 3.4 QC missingness — `bm_high_missingness`

**Fixture contents:** One feature with 75 % missing values (3 of 4 samples
null) plus one complete feature.

**What it tests:** The default policy has `missingness.exclusionThreshold = 0.2`. Any feature exceeding 20 % missingness is excluded.

**Expected outcome:** The incomplete feature is `excluded_qc_failure` with
`EPIE002_EXCESSIVE_MISSINGNESS`; the complete feature remains usable, so
`handoffReady = true`.

### 3.5 Confounding context — `bm_missing_cell_context`, `bm_missing_cytotoxicity_context`, `bm_dominant_cytotoxicity`

These three benchmarks cover the **confounding-context model** (PRD §2.4).

| Benchmark | Condition | Policy default | Expected outcome |
|-----------|-----------|---------------|------------------|
| `bm_missing_cell_context` | No cell-composition declared | `blockOnMissingContext = false` | `accepted_with_caveats`, `EPIW001_CELL_COMPOSITION_CONTEXT_MISSING`, `handoffReady = true` |
| `bm_missing_cytotoxicity_context` | No cytotoxicity data | `blockOnMissingContext = false` | `accepted_with_caveats`, `CTX_MISSING_CONTEXT`, `handoffReady = true` |
| `bm_dominant_cytotoxicity` | Severe viability loss plus a stress flag | `cytotoxicityBlockLevel = dominant_confounding` | `exploratory_only`, `RULE_007_DOMINANT_CONFOUNDING`, `handoffReady = false` |

The same profile objects emitted by `ingest_cell_composition` and
`ingest_cytotoxicity` can be supplied to `qualify_features` and
`generate_handoff`; qualification classifies them before applying the
confounding thresholds.

### 3.6 Mapping causality guard — `bm_dmr_nearest_gene_only`

**Fixture contents:** DMR features mapped by nearest-gene only, no direct promoter overlap.

**What it tests:** The packet carries separated
`mappingPayloads.regionToGeneMappings`; qualification preserves the gene IDs
and low confidence, and warns that `nearest_gene` does not imply causality
(`EPIW007_NEAREST_GENE_ONLY`). The mapping payload blocks automatic pathway
roll-up, while the feature handoff remains usable with caveats.

**Expected outcome:** `accepted_with_caveats`, `handoffReady = true`,
`mappingMethod = nearest_gene`, `mappingConfidence = low`.

### 3.7 Contrast-only data — `bm_summary_contrast_only`

**Fixture contents:** Feature values are summary contrasts (e.g., log2 fold-change) rather than per-sample measurements.

**What it tests:** Schema validation passes because the contrast values are
numeric, but their keys do not match any design sample IDs. Missingness is
therefore 100% over the declared samples and the fail-closed QC rule excludes
both features.

**Expected outcome:** `excluded_qc_failure`,
`RULE_005_HIGH_MISSINGNESS`, `handoffReady = false`.

### 3.8 Handoff schema — `bm_handoff_schema_valid` and `bm_handoff_schema_invalid`

| Benchmark | Condition | Expected outcome |
|-----------|-----------|-----------------|
| `bm_handoff_schema_valid` | Fully valid `BioactivityPoDHandoffPacket` | `schemaValid = true`, `handoffReady = true` |
| `bm_handoff_schema_invalid` | Invalid UUID, empty `sourcePacketRef`, empty arrays, bad datetime | `schemaValid = false`, `handoffReady = false` |

**Scientific rationale:** Downstream Bioactivity-PoD MCP depends on schema-guaranteed fields. Invalid handoffs are rejected fail-closed.

---

## 4. Deterministic behaviours tested

The following behaviours are verified by the combined unit-test and benchmark suite and are guaranteed to be **deterministic** (same inputs always produce same outputs):

### 4.1 Schema validation
- Zod schemas enforce strict mode (`strict()`) — extra fields are rejected.
- Genome build must be from an allow-list (`hg38`, `hg19`, `GRCh37`, `GRCh38`, `mm10`, `mm39`).
- Coordinate systems must be explicitly declared (`0-based-half-open` or `1-based-closed`).
- Genomic regions with `end <= start` or malformed chromosome identifiers fail schema validation.

### 4.2 Qualification rule engine
The rule engine applies rules in fixed priority order:

1. `RULE_001_MISSING_BUILD` — exclude if build absent
2. `RULE_002_INVALID_COORDINATES` — exclude if build invalid or mixed builds detected
3. `RULE_003_INSUFFICIENT_DESIGN` — exclude if canonical dose-response readiness has a non-replication blocker, including insufficient distinct doses, structural failure, dose–batch confounding, or an unsplit multi-timepoint design
4. `RULE_004_INSUFFICIENT_REPLICATES` — exclude if per-group replicates below threshold
5. `RULE_005_HIGH_MISSINGNESS` — exclude if missingness above exclusion threshold
6. `RULE_006_NON_NUMERIC_RESPONSE` — exclude if values contain `Infinity`, `-Infinity`, or non-numeric
7. `RULE_007_DOMINANT_CONFOUNDING` — downgrade to `exploratory_only` if dominant confounding detected
8. `RULE_008_MAPPING_AMBIGUITY` — exclude if mapping is ambiguous
9. `RULE_009_MAJOR_WARNINGS` — accept with caveats for peak-type features or nearest-gene-only mapping
10. `RULE_010_ACCEPTED` — default acceptance

**Determinism guarantee:** For any given feature, design, policy, and context, the triggered rule and resulting status are always the same.

### 4.3 QC profiling
- Missingness fractions are computed as exact ratios of null vs. total values.
- Per-sample, per-group, and per-feature missingness bands (`ok`, `warning`, `exclusion`) are derived from policy thresholds.
- Replicate consistency metrics are computed deterministically from within-group variance.

### 4.4 Policy engine
- Default policy version is `0.1.0`.
- Policy overrides are validated schema-first; invalid overrides are rejected.
- Override provenance is immutable and audited.
- Confounding block logic uses a 5-level ordinal comparison (`unlikely_confounding` < `possible_confounding` < `likely_confounding` < `dominant_confounding` < `review_required`).

### 4.5 Claim guards
- Persistence and reversibility claims are stripped to `not_assessed` unless repeated/recovery timepoints are present in the design.
- Heritability and transgenerational claims are stripped to `none` unless `multigenerationalDesign = true`.
- These guards prevent unsupported causal statements from reaching downstream consumers.

### 4.6 Handoff construction
- Only features with status `accepted_for_pod` or `accepted_with_caveats` enter `doseResponseReadySubset`.
- Those accepted statuses are reachable only when the shared dataset-level
  design assessment is `dose_response_minimum` or
  `dose_response_preferred`; comparison-only designs remain ingestible but
  cannot produce a PoD handoff.
- Excluded features are listed in `excludedFeatures` with their exclusion reason.
- `readyForPod` is `true` only when the packet is schema-valid and at least one feature is dose-response ready.
- Fail-closed: zero eligible features yields `readyForPod = false` (or `null` handoff in the export client).

### 4.7 Observed response-pattern assessment

- Dose-group labels sharing a numeric dose are pooled before group means are
  compared.
- Numeric dose levels are ordered ascending and bounded feature pagination is
  deterministic.
- Adjacent mean differences are classified with exact comparison by default
  or an explicit caller-supplied absolute tolerance.
- A caller tolerance is reported in signal-metric units and is never promoted
  to a biological-significance threshold.
- Structurally invalid designs, negative doses, missing dose levels, non-finite
  values, mixed units, and aggregate multi-timepoint designs prevent pattern
  classification.
- Non-monotonic patterns remain descriptive observations and do not change
  qualification.
- Trend significance, biological significance, and BMD suitability are always
  reported as `not_assessed`.

---

## 5. Unit-test coverage supporting the benchmarks

The benchmark suite is underpinned by the TypeScript and Python test suites.
Key coverage areas:

| Area | Test files | What is verified |
|------|-----------|------------------|
| Contracts | `contracts.test.ts`, `epigenomics_contracts.test.ts`, `schema_drift*.test.ts` | Zod schema round-trips, strict-mode rejection, schema-export stability |
| Coordinates | `coordinate_validator.test.ts`, `feature_coordinate_validator.test.ts`, `genome_build_validator.test.ts`, `chromosome_bounds.test.ts` | Build validation, coordinate sanity checks, mixed-build detection |
| Design | `design_validator.test.ts`, `design_reader.test.ts`, `study_design_context.test.ts` | Dose-group integrity, replicate layout, species consistency |
| QC | `missingness.test.ts`, `qc_report_builder.test.ts`, `replicate_consistency.test.ts`, `replicate_validator.test.ts` | Missingness profiling, replicate variance, group dropout detection |
| Confounding | `cell_composition.test.ts`, `cytotoxicity.test.ts` | Cell-composition flagging, cytotoxicity detection, stress flags |
| Mapping | `region_to_gene.test.ts`, `coordinate_mapping.test.ts`, `external_mapping.test.ts` | Nearest-gene mapping, promoter overlap, mapping confidence |
| Qualification | `qualification_rules.test.ts`, `qualification_policy.test.ts`, `qualification.test.ts`, `claim_guards.test.ts` | Rule priority, policy validation, claim stripping, status assignment |
| Handoff | `handoff.test.ts`, `handoff_validator.test.ts` | Packet construction, schema validation, subset correctness |
| Ingestion | `csv_reader.test.ts`, `format_detection.test.ts`, `feature_table.test.ts`, `streaming_ingest.test.ts`, `long_format.test.ts`, `wide_format.test.ts` | CSV parsing, format auto-detection, feature construction, gzip streaming, bounded batching, and explicit sample-column authority |
| Response patterns | `response_pattern_assessment.test.ts` | Dose-label collapsing, ordered means, tolerance handling, monotonic and non-monotonic labels, incomplete/multi-timepoint blocking, explicit non-assessment of significance and BMD suitability, and bounded pagination |
| Benchmark infra | `benchmark_runner.test.ts`, `golden_outputs.test.ts`, `synthetic_fixtures.test.ts`, `public_fixtures.test.ts`, `public_validation_manifest.test.ts`, `manifest.test.ts` | Golden-output stability, drift detection, fixture completeness, frozen-public checksums, and full-public manifest integrity |
| Release evidence | `release_evidence.test.ts`, `release_gate.test.ts`, `benchmark_cli.test.ts` | Audit manifest schema, checksums, output isolation |
| MCP and transport | `tool_registry.test.ts`, `transport_equivalence.test.ts`, protocol smoke scripts | Tool schema quality, service/MCP/CLI equivalence, stdio and Streamable HTTP initialization |
| HTTP security | `http.test.ts`, `smoke_mcp_http.mjs` | Loopback defaults, Host/Origin checks, bearer auth, body limit, request rate |
| Performance | `qualification_engine_benchmark.mjs` | Real schema validation, missingness, qualification, and explainability at 10,000 features |
| Evaluation | `evaluation.xml`, `validate-evaluation.mjs` | Ten stable, read-only, multi-tool user workflows |

Tests run under **Vitest** with deterministic ordering and no external network
dependency during required CI. The checked-in public excerpt is frozen; normal
CI never fetches an upstream public file. The complete-file panel is isolated
in a manually dispatched workflow because it depends on external archives.

---

## 6. Release evidence artifacts

`npm run release:evidence` writes:

| Artifact | Purpose |
|----------|---------|
| `release-evidence/release-evidence.json` | Schema-validated manifest with package/config versions, environment details, git availability, release-gate summary, npm pack dry-run metadata, and checksums |
| `release-evidence/checksums.sha256` | SHA-256 checksum list for audit inputs and captured release reports |
| `release-evidence/release-gate.json` | Captured machine-readable release-gate report |
| `release-evidence/release-gate.txt` | Captured human-readable release-gate report |
| `release-evidence/npm-pack-dry-run.json` | npm package dry-run metadata used as release packaging evidence |

Release evidence is generated from a clean source tree. The intended release
sequence is: commit code/docs/config changes, run `npm run release:evidence`,
then commit the refreshed `release-evidence/` bundle. The npm package includes
the schemas, validation docs, benchmark manifest, synthetic and frozen-public
inputs, golden benchmark outputs, evaluation set, and release-evidence files
backing the registered MCP audit resources.

When the working directory has no Git metadata, the evidence manifest records
`git.available = false` instead of failing. This preserves reproducibility in
exported source directories and local validation bundles.

---

## 7. Explicit limitations

### 7.1 What v0.2 validation does not cover

| Limitation | Explanation |
|------------|-------------|
| **Biological ground truth** | Three complete public files establish ingestion realism and fail-closed design handling, while the GSE152749-derived fixture establishes real multi-dose pattern handling. No biological truth label, differential-methylation/accessibility conclusion, or predictive accuracy is asserted. Golden qualification outcomes remain synthetic. |
| **Statistical modelling** | The benchmarks verify deterministic profiling, response-shape description, and rule-based qualification, not statistical power, false-discovery rate, trend significance, effect-size significance, model fit, or BMD suitability. |
| **Batch-effect correction** | Batch-effect modelling is behind the `enableBatchEffectModeling` feature flag (default `false`). No benchmark exercises it. |
| **Cell deconvolution** | Reference-based cell-composition deconvolution is behind `enableCellDeconvolution` (default `false`). Declared/measured profile ingestion and deterministic confounding classification are tested instead. |
| **Chromatin-state context** | ChromHMM / Segway integration is behind `enableChromatinStateContext` (default `false`). |
| **miRNA / ncRNA expression** | Dedicated miRNA and ncRNA classifiers are behind feature flags (default `false`). Generic region tables are tested instead. |
| **Liftover** | Silent genome-build liftover is disallowed by default (`silentLiftoverAllowed = false`). No liftover benchmark exists. |

### 7.2 Behaviors that warn but do not block by default

The v0.2 engine emits warnings for the following conditions but, under the default policy, may still produce a handoff:

- **Missing confounding context** —
  `EPIW001_CELL_COMPOSITION_CONTEXT_MISSING` or `CTX_MISSING_CONTEXT` is
  emitted, but because `blockOnMissingContext = false`, handoff can proceed
  when features otherwise qualify.
- **Below-preferred design depth** — three distinct dose levels or two biological
  replicates can meet minimum thresholds while producing
  `EPIW005_BELOW_PREFERRED_DOSE_GROUPS` or
  `EPIW006_BELOW_PREFERRED_REPLICATES`.

Dominant cytotoxicity is not in this category: at the default
`cytotoxicityBlockLevel = dominant_confounding`, it downgrades features to
`exploratory_only` and prevents a ready handoff.

### 7.3 What benchmark success does not prove

**Benchmark pass does NOT prove:**

1. **Biological correctness** — The golden fixtures contain plausible but invented data, while the public files have no ground-truth outcome labels used by this panel. Validation proves source identity, ingestion, and contract behavior, not biological truth.
2. **Regulatory acceptance** — Passing benchmarks demonstrates conformance to the v0.2 product boundary and v0.1 schema/policy contracts, not endorsement by any regulatory authority.
3. **Downstream model validity** — The benchmarks verify that handoff packets are schema-valid and contain the correct feature subsets. They do not verify that Bioactivity-PoD MCP will produce accurate PoD / BMD estimates.
4. **Production capacity** — Complete files of up to 2,077,859 rows validate bounded streaming on one process, but sustained concurrency, latency service levels, and infrastructure capacity are not certified.
5. **Complete security assurance** — Production dependency auditing and HTTP controls are tested, but no independent penetration test, identity-provider integration, or centralized audit-log certification has been performed.
6. **External service availability** — Annotation/Ontology and Evidence Registry transports are planned and are not part of the active tool workflow.

---

## 8. Non-goals reaffirmed

Epigenomics MCP v0.2 explicitly does **not** benchmark, test, or guarantee:

- Raw FASTQ / IDAT preprocessing
- Bisulphite alignment or methylation calling from raw reads
- Peak calling from BAM files
- Chromatin-state modelling (ChromHMM, Segway)
- Enhancer-gene causal inference
- miRNA target prediction as a primary algorithm
- PoD / BMD modelling (downstream Bioactivity-PoD MCP responsibility)
- Regulatory conclusion generation
- Persistence, heritability, or transgenerational-effect claims without multi-timepoint / multigenerational design evidence

See [`docs/non-goals.md`](non-goals.md) for the complete non-goals list.

---

## 9. Traceability matrix

| PRD requirement | Benchmark(s) | Unit-test support |
|-----------------|--------------|-------------------|
| Ingest processed feature tables | `bm_beta_manifest_complete` | `feature_table.test.ts`, `csv_reader.test.ts`, `format_detection.test.ts` |
| Validate experimental design | All feature benchmarks | `design_validator.test.ts`, `replicate_validator.test.ts` |
| Validate genome build & coordinates | `bm_build_missing`, `bm_invalid_coordinate_format` | `genome_build_validator.test.ts`, `coordinate_validator.test.ts`, `chromosome_bounds.test.ts` |
| Classify measured features | `bm_beta_manifest_complete` | `methylation_classifier.test.ts`, `region_feature_classifier.test.ts` |
| Profile QC deterministically | All feature benchmarks | `missingness.test.ts`, `qc_report_builder.test.ts`, `replicate_consistency.test.ts` |
| Model confounding context | `bm_missing_cell_context`, `bm_missing_cytotoxicity_context`, `bm_dominant_cytotoxicity` | `cell_composition.test.ts`, `cytotoxicity.test.ts` |
| Apply fail-closed qualification | All feature benchmarks | `qualification_rules.test.ts`, `qualification_policy.test.ts` |
| Preserve measured coordinates | `bm_dmr_nearest_gene_only` | `region_to_gene.test.ts`, `mapping/region_to_gene.test.ts` |
| Export normative packets | `bm_handoff_schema_valid`, `bm_handoff_schema_invalid` | `handoff.test.ts`, `handoff_validator.test.ts` |
| Claim guards | Implicit in all feature benchmarks | `claim_guards.test.ts` |

---

## 10. How to reproduce

```bash
# Run all unit and integration tests
npm test

# Run contract-schema tests only
npm run test:contract

# Run benchmark golden-output comparison
npm run benchmark:ci

# Validate all synthetic fixture files are present
npm test -- --run tests/unit/synthetic_fixtures.test.ts

# Validate the frozen-public fixture, MCP evaluation set, and transports
npx vitest run tests/unit/public_fixtures.test.ts
npm run eval:validate
npm run smoke:mcp

# Download, checksum, and validate all three complete public files
npm run validate:public-data

# Repeat from an already verified local cache without network access
npm run validate:public-data -- --offline
```

All benchmark golden outputs are stored in `benchmarks/expected/<benchmark_name>/`. The benchmark runner (`src/benchmarks/runner.ts`) performs deep equality comparison and emits actionable diffs on drift.

---

## 11. Sign-off summary

| Property | v0.2 state |
|----------|-----------|
| Benchmark count | 12 (10 feature + 2 handoff) |
| Synthetic fixtures | 12 |
| Frozen-public inputs | 1 checksummed 10-probe GSE67005 excerpt |
| Complete-file public panel | 3 sources; 2,633,698 total rows |
| Golden output files | 68 |
| MCP evaluation questions | 10 independent read-only workflows |
| Real-engine performance gate | 10,000 features × 6 samples |
| Deterministic output guarantee | Yes (normalised timestamps, UUIDs, seeds) |
| Fail-closed on schema invalidity | Yes |
| Fail-closed on ambiguous coordinates | Yes |
| Fail-closed on insufficient design | Yes |
| Coverage of real biological data ingestion | Three complete public files with source/content hashes; no ground truth |
| Coverage of statistical power / FDR | No |
| Coverage of production-scale performance | Regression gate only; no capacity certification |

**Conclusion:** The v0.2 validation suite demonstrates that Epigenomics MCP
ingests bounded processed tables and complete files by explicit bounded-batch
streaming, validates design and coordinate semantics, computes deterministic
QC, applies fail-closed qualification, emits schema-valid handoffs, operates
over stdio and guarded Streamable HTTP, and processes a 10,000-feature
qualification workload within broad regression budgets. It does **not**
demonstrate biological ground-truth accuracy, regulatory acceptance,
statistical validity, or production capacity.

---

*End of validation statement*
