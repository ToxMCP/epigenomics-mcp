# Epigenomics MCP v0.1 — Validation Statement

**Document status:** Regulator-facing benchmark coverage statement  
**Product version:** 0.1.0  
**Date:** 2026-05-07  
**Scope:** Benchmark manifest, synthetic fixture coverage, deterministic behaviour guarantees, release evidence, explicit limitations

---

## 1. What this statement covers

This document explains the benchmark suite that gates the v0.1 release of Epigenomics MCP. It describes:

- The **fixture scope** — what synthetic datasets are used and why
- **Deterministic behaviours** that are tested and guaranteed
- **Explicit limitations** — what the benchmarks do not prove
- **Release evidence** — which generated artifacts carry audit checksums
- **Non-goals** — product boundaries that remain outside v0.1 validation
- **Traceability** from each benchmark case to the Product Requirements Document (PRD)

This statement is intended for regulator-facing reviewers, downstream Bioactivity-PoD MCP consumers, and audit teams who need to understand what "benchmark pass" means in terms of evidence quality and safety.

---

## 2. Benchmark manifest overview

The v0.1 release is gated by **12 release benchmarks** declared in `benchmark_manifest.yaml`:

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
under `release-evidence/`.

---

## 3. Fixture scope and scientific intent

### 3.1 Happy path — `bm_beta_manifest_complete`

**Fixture contents:** Three CpG methylation features from an Illumina EPIC array, complete beta-value matrix, valid GRCh38 coordinates, 2 biological replicates per dose group (3 dose groups: 0, 1, 10 µM), declared cell-composition context, concurrent cytotoxicity data, low missingness.

**What it tests:**
- Schema validation accepts well-formed features and design.
- QC profiler computes deterministic summary statistics (mean, variance, range).
- Missingness profiler reports zero exclusion-band features.
- Qualification engine assigns `accepted_for_pod` to all features.
- Handoff builder marks the packet `readyForPod = true`.

**Expected outcome:** `schemaValid = true`, `qualificationStatus = accepted_for_pod`, `handoffReady = true`, no warnings.

### 3.2 Coordinate semantics — `bm_build_missing` and `bm_invalid_coordinate_format`

These two benchmarks test the **fail-closed coordinate validator** (PRD §2.2).

| Benchmark | Defect | Expected outcome |
|-----------|--------|-----------------|
| `bm_build_missing` | One feature omits `measuredRegion.build` | `excluded_coordinate_ambiguity`, warning `EPIW001_COORDINATE_SYSTEM_NONSTANDARD` |
| `bm_invalid_coordinate_format` | `end <= start` and malformed chromosome | `excluded_coordinate_ambiguity`, schema invalid |

**Scientific rationale:** Genomic coordinates are meaningless without an explicit genome build. The engine rejects ambiguous or malformed coordinates rather than silently defaulting to a build.

### 3.3 Design integrity — `bm_insufficient_replicates`

**Fixture contents:** Single replicate per dose group (3 groups).

**What it tests:** The default qualification policy requires `minBiologicalReplicatesPerGroup = 2`. Although the design schema permits `minReplicatesPerGroup = 1`, the policy engine excludes the dataset because it falls below the biological-replicate threshold.

**Expected outcome:** `excluded_insufficient_design`, `handoffReady = false`.

### 3.4 QC missingness — `bm_high_missingness`

**Fixture contents:** One feature with 75 % missing values (3 of 4 samples null).

**What it tests:** The default policy has `missingness.exclusionThreshold = 0.2`. Any feature exceeding 20 % missingness is excluded.

**Expected outcome:** `excluded_qc_failure`, warning `EPIE002_EXCESSIVE_MISSINGNESS`, `handoffReady = false`.

### 3.5 Confounding context — `bm_missing_cell_context`, `bm_missing_cytotoxicity_context`, `bm_dominant_cytotoxicity`

These three benchmarks cover the **confounding-context model** (PRD §2.4).

| Benchmark | Condition | Policy default | Expected outcome |
|-----------|-----------|---------------|------------------|
| `bm_missing_cell_context` | No cell-composition declared | `blockOnMissingContext = false` | `accepted_for_pod`, warning `CC_NOT_DECLARED`, `handoffReady = true` |
| `bm_missing_cytotoxicity_context` | No cytotoxicity data | `blockOnMissingContext = false` | `accepted_for_pod`, warning `CTX_MISSING_CONTEXT`, `handoffReady = true` |
| `bm_dominant_cytotoxicity` | Viability < 0.8 + stress flags | `cytotoxicityBlockLevel = dominant_confounding` | `accepted_for_pod`, warnings `CTX_CYTOTOXICITY_DETECTED` + `CTX_STRESS_FLAG`, `handoffReady = true` |

**Limitation note:** The v0.1 engine detects and warns on dominant cytotoxicity but does **not** yet block handoff for it (see §7.2). This is a deliberate v0.1 limitation; blocking logic is reserved for v0.2 unless promoted behind a feature flag.

### 3.6 Mapping causality guard — `bm_dmr_nearest_gene_only`

**Fixture contents:** DMR features mapped by nearest-gene only, no direct promoter overlap.

**What it tests:** The qualification engine warns that `nearest_gene` does not imply causality (`EPIW003_PROXIMITY_NOT_CAUSALITY`). Because `blockNearestGenePathwayByDefault = true`, the handoff is blocked even though features are `accepted_with_caveats`.

**Expected outcome:** `accepted_with_caveats`, `handoffReady = false`.

### 3.7 Contrast-only data — `bm_summary_contrast_only`

**Fixture contents:** Feature values are summary contrasts (e.g., log2 fold-change) rather than per-sample measurements.

**What it tests:** Schema validation passes because values are non-null numbers, but the qualification engine classifies the data as `exploratory_only` because it is not dose-response ready.

**Expected outcome:** `exploratory_only`, `handoffReady = false`.

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
3. `RULE_003_INSUFFICIENT_DESIGN` — exclude if dose groups or replicates below minimum
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
- Excluded features are listed in `excludedFeatures` with their exclusion reason.
- `readyForPod` is `true` only when the packet is schema-valid and at least one feature is dose-response ready.
- Fail-closed: zero eligible features yields `readyForPod = false` (or `null` handoff in the export client).

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
| Ingestion | `csv_reader.test.ts`, `format_detection.test.ts`, `feature_table.test.ts`, `long_format.test.ts`, `wide_format.test.ts` | CSV parsing, format auto-detection, feature table construction |
| Benchmark infra | `benchmark_runner.test.ts`, `golden_outputs.test.ts`, `synthetic_fixtures.test.ts`, `manifest.test.ts` | Golden-output stability, drift detection, fixture completeness |
| Release evidence | `release_evidence.test.ts`, `release_gate.test.ts`, `benchmark_cli.test.ts` | Audit manifest schema, checksums, output isolation |
| Smoke | `server-smoke.test.ts`, `cli-help.test.ts`, `makefile-commands.test.ts` | CLI availability, MCP server start-up, resource exposure, build commands |

All tests run under **Vitest** with deterministic ordering and no external network dependencies during the benchmark path.

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

When the working directory has no Git metadata, the evidence manifest records
`git.available = false` instead of failing. This preserves reproducibility in
exported source directories and local validation bundles.

---

## 7. Explicit limitations

### 7.1 What v0.1 benchmarks do not cover

| Limitation | Explanation |
|------------|-------------|
| **Real biological datasets** | All benchmarks use synthetic fixtures. No validation against public GEO, ArrayExpress, or EGA data is performed in the v0.1 gate. |
| **Statistical modelling** | The benchmarks verify deterministic profiling and rule-based qualification, not statistical power, false-discovery rate, or effect-size significance. |
| **Batch-effect correction** | Batch-effect modelling is behind the `enableBatchEffectModeling` feature flag (default `false`). No benchmark exercises it. |
| **Cell deconvolution** | Reference-based cell-composition deconvolution is behind `enableCellDeconvolution` (default `false`). Only declared-context flagging is tested. |
| **Chromatin-state context** | ChromHMM / Segway integration is behind `enableChromatinStateContext` (default `false`). |
| **miRNA / ncRNA expression** | Dedicated miRNA and ncRNA classifiers are behind feature flags (default `false`). Generic region tables are tested instead. |
| **Liftover** | Silent genome-build liftover is disallowed by default (`silentLiftoverAllowed = false`). No liftover benchmark exists. |

### 7.2 Behours that warn but do not yet block

The v0.1 engine emits warnings for the following conditions but, under the default policy, may still produce a handoff:

- **Dominant cytotoxicity** — `CTX_CYTOTOXICITY_DETECTED` and `CTX_STRESS_FLAG` are emitted. The default `cytotoxicityBlockLevel = dominant_confounding`, but the current engine warns rather than blocks (see fixture `bm_dominant_cytotoxicity`).
- **Missing confounding context** — `CC_NOT_DECLARED` and `CTX_MISSING_CONTEXT` are emitted, but because `blockOnMissingContext = false`, handoff proceeds.

These are **deliberate v0.1 limitations** documented in the fixture `expected_policy.json` files. A regulator may tighten the policy (e.g., set `blockOnMissingContext = true`) and re-run qualification; the engine will then block accordingly.

### 7.3 What benchmark success does not prove

**Benchmark pass does NOT prove:**

1. **Biological correctness** — The synthetic fixtures contain plausible but invented data. Benchmarks verify algorithmic correctness, not biological ground truth.
2. **Regulatory acceptance** — Passing benchmarks demonstrates conformance to the v0.1 specification, not endorsement by any regulatory authority.
3. **Downstream model validity** — The benchmarks verify that handoff packets are schema-valid and contain the correct feature subsets. They do not verify that Bioactivity-PoD MCP will produce accurate PoD / BMD estimates.
4. **Production robustness at scale** — Benchmark fixtures are small (≤ 10 features). Performance, memory, or concurrency at genome-scale is not gated by v0.1 benchmarks.
5. **Security or access control** — Authentication, authorisation, and audit-logging are outside the v0.1 benchmark scope.
6. **External service availability** — Annotation / Ontology MCP integration is mocked or omitted in the benchmark path.

---

## 8. Non-goals reaffirmed

Epigenomics MCP v0.1 explicitly does **not** benchmark, test, or guarantee:

- Raw FASTQ / IDAT preprocessing
- Bisulphite alignment or methylation calling from raw reads
- Peak calling from BAM files
- Chromatin-state modelling (ChromHMM, Segway)
- Enhancer-gene causal inference
- miRNA target prediction as a primary algorithm
- PoD / BMD modelling (downstream Bioactivity-PoD MCP responsibility)
- Regulatory conclusion generation
- Persistence, heritability, or transgenerational-effect claims without multi-timepoint / multigenerational design evidence

See `docs/non_goals.md` for the complete non-goals list.

---

## 8. Traceability matrix

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

## 9. How to reproduce

```bash
# Run all unit and integration tests
npm test

# Run contract-schema tests only
npm run test:contract

# Run benchmark golden-output comparison
npm test -- --run tests/unit/benchmark_runner.test.ts

# Validate all synthetic fixture files are present
npm test -- --run tests/unit/synthetic_fixtures.test.ts
```

All benchmark golden outputs are stored in `benchmarks/expected/<benchmark_name>/`. The benchmark runner (`src/benchmarks/runner.ts`) performs deep equality comparison and emits actionable diffs on drift.

---

## 10. Sign-off summary

| Property | v0.1 state |
|----------|-----------|
| Benchmark count | 12 (10 feature + 2 handoff) |
| Synthetic fixtures | 12 |
| Golden output files | 68 |
| Unit / integration tests | ~1,280 |
| Deterministic output guarantee | Yes (normalised timestamps, UUIDs, seeds) |
| Fail-closed on schema invalidity | Yes |
| Fail-closed on ambiguous coordinates | Yes |
| Fail-closed on insufficient design | Yes |
| Coverage of real biological datasets | No |
| Coverage of statistical power / FDR | No |
| Coverage of production-scale performance | No |

**Conclusion:** The v0.1 benchmark suite demonstrates that Epigenomics MCP correctly ingests processed epigenomic feature tables, validates design integrity and coordinate semantics, classifies features, computes deterministic QC profiles, flags confounding context, applies fail-closed qualification rules, and emits schema-valid handoff packets under controlled synthetic conditions. It does **not** demonstrate biological ground-truth accuracy, regulatory acceptance, or production-scale robustness.

---

*End of validation statement*
