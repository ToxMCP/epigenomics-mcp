# Product Requirements Document: Epigenomics MCP v0.1

**Document status:** Implementation-ready draft  
**Generated:** 2026-05-05T16:01:54.539Z  
**Product:** Epigenomics MCP for ToxMCP  
**Primary release target:** v0.1 processed-feature evidence qualification core  
**Primary downstream consumer:** Bioactivity-PoD MCP  
**Primary upstream dependencies:** upstream epigenomics preprocessing workflows, Evidence Registry MCP, Annotation/Ontology MCP  

---

## 1. Executive summary

Epigenomics MCP shall be implemented as a **contract-first, Python-first, processed-feature evidence qualification service** for regulator-facing NGRA workflows. Its job is to convert processed epigenomic assay outputs into **qualified, annotation-aware, provenance-rich, interpretation-limited feature-response packets** that downstream Bioactivity-PoD MCP can consume for quantitative modelling.

Epigenomics MCP is **not** a raw sequencing workbench, not an IDAT normalisation platform, not a peak caller, not a chromatin-state learner, not an enhancer oracle, not a miRNA target-prediction engine, not a PoD/BMD modeller, and not a regulatory-conclusion generator.

The strongest product boundary is:

> Epigenomics MCP is the qualification and packetisation layer between upstream epigenomic preprocessing and downstream quantitative bioactivity modelling.

The v0.1 release shall accept processed feature tables plus sample/design/provenance metadata, validate design integrity, validate coordinate/build/platform semantics, classify measured feature types, quantify deterministic QC profiles, model confounding context, apply fail-closed qualification rules, and emit a validated **EpigenomicsFeatureResponsePacket** / **BioactivityPoDHandoffPacket**.

A deliberate reconciliation is made across the source findings: v0.1 shall ship a **generic coordinate-bearing region table path** capable of handling ATAC/ChIP-like processed peak tables when assay semantics are explicitly declared. Full specialised ATAC/ChIP/miRNA/ncRNA adapters and richer external-resource augmentation are reserved for v0.2 unless the implementation team explicitly promotes them behind feature flags.

---

## 2. Problem statement

Epigenomic evidence is increasingly relevant to toxicology, NGRA, and mechanistic risk assessment, but it is difficult to use safely in downstream decision workflows because:

1. processed epigenomic outputs are heterogeneous across assays and pipelines;
2. genomic coordinates are easy to misinterpret when genome build or coordinate convention is missing;
3. region-to-gene mapping can silently overstate causal target assignment;
4. bulk methylation and chromatin signals can be dominated by cell-composition shifts, cytotoxicity, differentiation drift, or batch effects;
5. public datasets often contain useful evidence but incomplete provenance;
6. downstream dose-response engines need numeric feature-response structures, not prose-level biological interpretation;
7. regulator-facing systems require transparent audit trails, deterministic validation, and explicit interpretation limits.

Without Epigenomics MCP, downstream Bioactivity-PoD MCP would have to re-litigate foundational QC, assay semantics, coordinate validity, platform provenance, mapping confidence, and confounding status for every epigenomic table. That would duplicate logic, weaken auditability, and increase the risk of false mechanistic claims.

---

## 3. Product thesis

Epigenomics MCP shall make epigenomic evidence **portable, auditable, schema-stable, and safe for downstream quantitative use** by enforcing a conservative boundary:

- qualify **measured epigenomic responses**;
- preserve provenance and uncertainty;
- separate measured features from inferred biological mappings;
- block unsupported causal, heritable, persistent, or regulatory claims;
- hand off only qualified numeric feature-response evidence to Bioactivity-PoD MCP.

The product should prefer explicit warnings, review flags, and exclusions over silent rescue. If evidence is ambiguous, Epigenomics MCP must fail closed or downgrade the output rather than manufacturing apparent precision.

---

## 4. Users and jobs to be done

| User / consumer | Job to be done | Product implication |
|---|---|---|
| Computational toxicologist | Determine whether processed epigenomic evidence is fit for quantitative downstream use | Provide clear qualification statuses, warnings, exclusions, and QC summaries |
| Bioinformatics developer | Integrate processed assay outputs into ToxMCP without rewriting validation logic | Provide stable Pydantic contracts, JSON Schemas, CLI commands, and MCP tools |
| Regulatory scientist / reviewer | Understand what the service did, refused to infer, and why | Provide deterministic QC reports, provenance traces, and interpretation limits |
| Bioactivity-PoD MCP | Consume feature-response evidence for dose-response modelling | Emit numeric, dose-structured, schema-valid handoff packets |
| Annotation/Ontology MCP | Provide authoritative identifier, build, gene, pathway, cell-type, and species normalisation | Keep annotation requests narrow and release-pinned |
| Evidence Registry MCP | Track source files, accessions, checksums, and packet lineage | Register source and output provenance consistently |
| Benchmark/Validation MCP | Validate deterministic behaviour against fixtures | Emit benchmarkable outputs and golden packet structures |

---

## 5. Goals and non-goals

### 5.1 v0.1 goals

1. Accept processed epigenomic feature tables in CSV/TSV long or wide formats.
2. Accept sample metadata, dose design, replicate metadata, assay metadata, and upstream provenance.
3. Normalise feature measurements into canonical matrix or summary-response internal objects.
4. Validate dose axis, controls, biological replicates, sample coverage, timepoint, and dose units.
5. Validate coordinate-bearing features using explicit genome build and coordinate system declarations.
6. Require platform annotation provenance for array/probe-derived methylation interpretation.
7. Preserve original feature identifiers, original coordinates, original coordinate system, and original row-level provenance.
8. Classify measured features into explicit epigenomic feature classes.
9. Profile missingness, variance, and basic replicate stability deterministically.
10. Attach cell-composition and cytotoxicity context as first-class machine-readable objects.
11. Attach gene/pathway mappings only through typed, provenance-labelled mapping objects.
12. Prevent nearest-gene or inferred-target mappings from driving automated pathway or causal claims.
13. Apply qualification policies to assign feature-level and dataset-level statuses.
14. Generate QC reports and validated handoff packets for Bioactivity-PoD MCP.
15. Expose MCP tools and matching CLI commands with parity.
16. Ship synthetic benchmark fixtures, golden outputs, schema snapshots, and release gates.

### 5.2 v0.1 non-goals

Epigenomics MCP v0.1 shall not implement:

- raw FASTQ ingestion or processing;
- raw IDAT preprocessing or array normalisation;
- bisulfite alignment;
- methylation calling from raw reads;
- ATAC/ChIP/CUT&Tag/CUT&RUN peak calling;
- chromatin-state modelling;
- enhancer-gene causal inference;
- miRNA target prediction as a primary algorithm;
- single-cell or spatial native analysis;
- PoD/BMD fitting;
- IVIVE or BER modelling;
- final regulatory interpretation;
- persistence, reversibility, heritability, or transgenerational claims unless directly supported by explicit study design evidence.

### 5.3 v0.1 / v0.2 boundary resolution

The source materials differ slightly on whether ATAC/ChIP/miRNA should be direct v0.1 support or v0.2 expansion. This PRD resolves that tension as follows:

| Capability | v0.1 requirement | v0.2 expansion |
|---|---|---|
| DNA methylation beta/M matrix support | Direct support | richer platform adapters |
| DMC / DMR processed table support | Direct support | broader BS-seq adapters |
| Generic coordinate-bearing region table support | Direct support when feature semantics, build, coordinate system, and metric are declared | specialised ATAC/ChIP/CUT&Tag/CUT&RUN adapters |
| ATAC/ChIP feature classes | Reserved in contracts; may be feature-flagged | direct assay-specific interpretation and benchmarks |
| miRNA measured-feature support | Optional feature flag only if identifier/provenance contracts are stable | direct support plus validated-target mapping guardrails |
| lncRNA/ncRNA expression support | Deferred; boundary with Transcriptomics MCP documented | adapter support with explicit measured-feature semantics |
| Raw workflows | Out of scope | still out of core scope; optional external gateway only |

---

## 6. Scientific and product principles

### 6.1 Normative invariants

Every emitted decision-grade object shall satisfy these rules:

1. Every coordinate-bearing feature carries `genome_build`, `coordinate_system`, `chromosome`, `start`, and `end`.
2. Every array-derived methylation feature carries `platform_annotation_provenance`.
3. Every gene or pathway interpretation carries `region_to_gene_mapping_provenance` or equivalent feature-to-target provenance.
4. Measured features and inferred target mappings are stored in separate fields and never collapsed.
5. Every handoff-eligible feature carries a `qualification_status`, `qualification_reasons`, and machine-readable warnings.
6. Every handoff packet preserves sample/dose/replicate structure and does not rely only on one contrast statistic.
7. Cell-composition and cytotoxicity context are represented either as data or as explicit missing-context warnings.
8. No packet may claim persistence, reversibility, heritability, transgenerational effect, adversity, or causality unless those claims are explicitly supported by study design and represented as separate evidence types.

### 6.2 Fail-closed policy

Epigenomics MCP shall fail closed when foundational semantics are missing or contradictory. Examples:

- missing coordinate system for region-bearing data;
- missing genome build for coordinate-bearing data;
- mixed genome builds in one packet;
- non-numeric response values in model-ready fields;
- no explicit control group for dose-response qualification;
- insufficient biological replicates;
- invalid or negative coordinates;
- requested gene/pathway roll-up without mapping provenance;
- dominant cell-composition or cytotoxicity confounding;
- unsupported heritability/transgenerational claims.

---

## 7. Functional requirements

### 7.1 FR-001: Repository and runtime foundation

**Requirement.** Create a Python package `epigenomics_mcp` using CPython 3.11+, Pydantic v2, the official MCP Python SDK / FastMCP, Pandas, optional Polars adapters, bioframe for coordinate work, DuckDB for benchmark/cache queries, SciPy/statsmodels for transparent QC statistics, httpx for integration clients, and Typer for CLI parity.

**Acceptance criteria.**

- Repository contains `pyproject.toml`, `README.md`, `src/epigenomics_mcp`, `tests`, `schemas`, `examples`, `benchmarks`, and `docs`.
- Package imports successfully.
- CLI executable `epimcp` starts.
- MCP server can start in stdio mode.
- Unit test, type check, lint, and schema-generation commands are documented.

### 7.2 FR-010: Contract-first schema layer

**Requirement.** Implement Pydantic contracts and generated JSON Schemas for all public input, output, QC, warning, error, qualification, and handoff objects.

**Core schemas.**

| Schema | Purpose |
|---|---|
| `EpigenomicsDatasetMetadata` | dataset identity, assay, source accession, upstream processing level |
| `EpigenomicsExperimentalDesign` | study type, controls, dose groups, timepoints, replicate policy |
| `EpigenomicsSampleMetadata` | sample-to-dose-to-batch-to-replicate mapping |
| `DoseGroup` | dose value, dose unit, control flags, nominal/measured status |
| `GenomicCoordinate` | build, coordinate system, chromosome, start, end, strand |
| `PlatformAnnotationProvenance` | platform, manifest, annotation release, hash |
| `UpstreamEpigenomicsProvenance` | pipeline, software versions, parameters, input files |
| `EpigenomicFeatureMatrix` | canonical feature x sample or long-form feature responses |
| `CpGMethylationFeature` | array or site-level methylation feature |
| `DifferentialMethylatedRegionFeature` | DMR coordinate and effect summary |
| `GenericRegionFeature` | coordinate-bearing region with declared metric semantics |
| `ChromatinAccessibilityFeature` | reserved/feature-flagged ATAC-like peak object |
| `HistoneMarkFeature` | reserved/feature-flagged ChIP/CUT&Tag-like object |
| `MiRNAFeature` | optional/feature-flagged measured miRNA object |
| `RegionToGeneMapping` | typed mapping between region and target gene |
| `CellCompositionContext` | composition-confounding status and evidence |
| `CytotoxicityContext` | viability/stress confounding status and evidence |
| `MissingnessProfile` | missingness by feature/sample/group |
| `VarianceProfile` | variance and low-dynamic-range flags |
| `EpigenomicsWarning` | machine-readable warning |
| `EpigenomicsError` | machine-readable error |
| `EpigenomicsFeatureQualification` | feature-level downstream eligibility |
| `EpigenomicsQCReport` | review-facing deterministic QC output |
| `EpigenomicsFeatureResponsePacket` | primary qualified packet |
| `BioactivityPoDHandoffPacket` | downstream handoff to Bioactivity-PoD MCP |

**Acceptance criteria.**

- All schemas use `additionalProperties=false` where practical.
- All objects carry `schema_name`, `schema_version`, object identifiers, provenance, review flags, and extension fields where appropriate.
- JSON Schemas are exported into `schemas/current` and archived by release.
- Contract tests validate representative valid and invalid fixtures.

### 7.3 FR-020: Processed feature table ingestion

**Requirement.** Implement ingestion for processed CSV/TSV feature tables in long and wide formats. The service shall reduce incoming data into two canonical measurement shapes:

1. **Matrix shape:** feature × sample numeric values.
2. **Summary-response shape:** feature × dose-group summaries when upstream data are already aggregated.

**Rules.**

- Long format requires `feature_id`, `sample_id`, and numeric `response_value` unless declared as summary-response.
- Wide format requires `feature_id` and sample columns resolvable against design metadata.
- Duplicate `feature_id × sample_id` keys hard-fail.
- Non-numeric response values are excluded or fail according to scope.
- Original row content and source file checksum are preserved in provenance.
- The importer never guesses response metric semantics; `feature_value_semantics` is mandatory.

**Acceptance criteria.**

- Valid long and wide fixtures ingest into identical canonical internal structures.
- Invalid duplicate, unmatched sample, missing required column, and non-numeric fixtures emit deterministic error codes.
- Summary contrast-only tables are retained as `exploratory_only` unless dose-group numeric structure is available.

### 7.4 FR-030: Experimental design validation

**Requirement.** Validate control groups, dose groups, dose units, ordered dose axis, timepoints, replicate type, batch metadata, and sample coverage.

**Rules.**

- Require explicit `control_group_id`.
- Require declared `dose_unit`.
- Reject mixed dose units unless upstream normalisation provenance is declared.
- v0.1 packets support one timepoint per packet; multi-timepoint studies must be split.
- Technical replicates do not count toward biological replicate minimums.
- Control plus at least two non-zero dose groups is the minimum for dose-response readiness.
- Biological replicate expectations are configurable, with conservative defaults.

**Default thresholds.**

| Rule | Default |
|---|---|
| Accepted for PoD | control + at least 3 treated dose groups preferred |
| Minimum non-zero dose groups | 2 |
| Minimum biological replicates per group | 2 for accepted; 3 preferred |
| Single biological replicate in any modelled group | exclude or review according to policy |
| Dose perfectly confounded with batch | block handoff |

**Acceptance criteria.**

- Design validator emits deterministic statuses for happy path, missing control, mixed dose units, insufficient dose groups, insufficient replicates, and batch-confounded fixtures.

### 7.5 FR-040: Coordinate, genome build, and platform validation

**Requirement.** Validate coordinate-bearing features and platform-derived features before qualification.

**Rules.**

- Region-bearing features require explicit source coordinate system.
- Internal coordinate representation is 0-based half-open.
- Accepted source coordinate systems include `ucsc_bed_0based_half_open`, `gff_gtf_1based_closed`, `platform_native_probe`, and `no_coordinates_feature_id_only`.
- Supported v0.1 genome builds are `GRCh37`, `GRCh38`, `mm10`, and `mm39` unless configured otherwise.
- The service never performs silent liftover.
- Mixed builds hard-fail.
- Chromosome names must validate against declared build via Annotation/Ontology MCP or frozen local chromsizes.
- Array/probe-based methylation interpretation requires platform name, manifest/annotation version, and preferably SHA-256 digest.

**Acceptance criteria.**

- Invalid coordinate fixtures emit row-specific errors.
- Missing build emits `excluded_missing_genome_build` / blocking error as appropriate.
- 1-based closed intervals convert exactly once into internal 0-based half-open intervals with original coordinates preserved.
- Probe-platform provenance absence blocks gene/pathway interpretation.

### 7.6 FR-050: Feature classification and measurement semantics

**Requirement.** Classify input rows into explicit measured feature classes without collapsing measured features into inferred targets.

**Required v0.1 classes.**

- `cpg_methylation_feature`
- `dmr_feature`
- `generic_region_feature`
- `summary_feature_response`
- `gene_linked_epigenomic_feature`

**Reserved or feature-flagged classes.**

- `chromatin_accessibility_feature`
- `histone_mark_feature`
- `mirna_expression_feature`
- `ncrna_expression_feature`
- `chromatin_state_context`

**Rules.**

- `value_type` / `reported_metric` is mandatory.
- Beta values, M-values, percent methylation, delta beta, delta M, accessibility signal, peak score, and q-value/effect statistics must not be silently interchanged.
- Mixed feature classes in one table require either split output or review warning.

**Acceptance criteria.**

- Classifier deterministically assigns feature classes for CpG, DMR, generic BED-like region, and summary-only fixtures.
- Ambiguous mixed inputs emit warnings and review flags.

### 7.7 FR-060: Deterministic QC profiling

**Requirement.** Implement deterministic, transparent QC profiling for model-readiness without performing opaque rescue operations.

**QC profiles.**

- Missingness by feature, group, and sample.
- Variance or MAD by feature and group.
- Zero or near-zero variance flags.
- Sample coverage by design group.
- Optional simple replicate consistency metrics.
- Batch metadata presence and dose-batch confounding flags.

**Rules.**

- Missingness thresholds are configurable and versioned.
- Default matrix threshold: `accepted_for_pod` at ≤0.10 missingness in all modelled groups; warning at >0.10 and ≤0.20; exclusion at >0.20 or complete absence in a modelled group.
- No imputation is performed silently.
- Outliers are never removed without trace.

**Acceptance criteria.**

- QC outputs are deterministic and exactly match golden snapshots for synthetic fixtures.
- High missingness, zero variance, and missing batch metadata generate expected warnings/statuses.

### 7.8 FR-070: Annotation and region-to-gene mapping

**Requirement.** Integrate with Annotation/Ontology MCP and/or frozen snapshots to attach cautious gene, pathway, species, build, cell-type, and ontology mappings.

**Mapping model.**

| Mapping type | Downstream rule |
|---|---|
| `direct_promoter_overlap` | allow contextual gene linkage and pathway roll-up |
| `gene_body_overlap` | allow with warning; review for directional claims |
| `enhancer_target_from_database` | allow with warning if provenance and context are declared |
| `chromatin_interaction_supported` | allow when source, build, and context match |
| `nearest_gene` | context only; exploratory for pathway use by default |
| `inferred_target_gene` | exploratory only; block automatic pathway roll-up |
| `unknown_target_gene` | allow measured region only; block gene/pathway roll-up |

**Rules.**

- The service never converts genomic proximity into causality.
- Region-to-gene mapping is represented as a separate object from the measured feature.
- Pathway roll-up is blocked when mapping provenance is insufficient.
- Nearest-gene labels may appear in human-readable QC reports but are suppressed from machine-actionable pathway evidence by default.

**Acceptance criteria.**

- Nearest-gene-only fixtures produce region evidence but block pathway roll-up.
- Promoter-overlap fixtures allow pathway roll-up with release-pinned annotation trace.
- Mapping objects include method, release, source resource, confidence, and downstream use rule.

### 7.9 FR-080: Cell-composition and cytotoxicity context

**Requirement.** Represent cell-composition, cytotoxicity, stress, differentiation, and timepoint context as first-class machine-readable objects that influence qualification.

**Cell-composition statuses.**

- `no_context_available`
- `unlikely_confounding`
- `possible_confounding`
- `likely_confounding`
- `dominant_confounding`
- `review_required`

**Cytotoxicity statuses.**

- `no_context_available`
- `unlikely_confounding`
- `possible_confounding`
- `likely_confounding`
- `dominant_confounding`
- `review_required`

**Rules.**

- v0.1 does not perform full deconvolution from processed epigenomic data by default.
- The service ingests externally measured or estimated cell fractions when supplied.
- Missing context emits warnings, not silent assumptions.
- Dominant confounding blocks handoff.
- Cytotoxicity is never inferred from epigenomic features alone.

**Acceptance criteria.**

- Missing cell-composition and cytotoxicity context generates expected warnings.
- Dominant confounding fixture is blocked from PoD handoff.
- Mixed-cell fixture with no fraction estimates is `accepted_with_warnings` or `review_required` depending on policy.

### 7.10 FR-090: Qualification policy engine

**Requirement.** Implement a versioned policy engine that combines design validation, coordinate validation, platform provenance, feature semantics, QC profiles, mapping confidence, and confounding context into feature-level and dataset-level qualification decisions.

**Qualification statuses.**

- `accepted_for_pod`
- `accepted_with_warnings`
- `review_required`
- `exploratory_only`
- `excluded_insufficient_design`
- `excluded_invalid_coordinates`
- `excluded_missing_genome_build`
- `excluded_high_missingness`
- `excluded_mapping_ambiguous`
- `excluded_non_numeric_response`
- `excluded_confounding_dominant`

**Default logic.**

```text
if coordinate_bearing and genome_build missing:
    excluded_missing_genome_build
elif coordinate_bearing and coordinates invalid:
    excluded_invalid_coordinates
elif total_dose_groups < 3 or non_zero_dose_groups < 2:
    excluded_insufficient_design
elif biological_replicates_per_group < 2:
    review_required
elif missingness_fraction > policy.max_missingness:
    excluded_high_missingness
elif response_metric not declared or non_numeric:
    excluded_non_numeric_response
elif dominant_confounding:
    excluded_confounding_dominant
elif gene_or_pathway_interpretation_requested and mapping_provenance_missing:
    excluded_mapping_ambiguous
elif major_warnings_present:
    accepted_with_warnings
else:
    accepted_for_pod
```

**Acceptance criteria.**

- Policy decisions are deterministic and explainable.
- Every decision includes reasons, warnings, and review flags.
- Policy thresholds are versioned and configurable.
- Golden outputs cover all qualification statuses.

### 7.11 FR-100: Feature-response packet and Bioactivity-PoD handoff

**Requirement.** Generate an `EpigenomicsFeatureResponsePacket` and validate/export a `BioactivityPoDHandoffPacket` containing only qualified model-ready evidence and mandatory caveats.

**Packet requirements.**

- immutable packet ID and content hash;
- schema version;
- dataset metadata reference;
- design reference;
- chemical/exposure context when available;
- biological context;
- dose axis with ordered groups and replicate counts;
- measured epigenomic feature payload;
- response-by-group numeric summaries or sample-level matrix references;
- mapping payloads kept separate from measured feature payloads;
- qualification summary;
- QC report reference;
- warnings and mandatory caveats;
- annotation trace;
- provenance payload.

**Handoff invariants.**

Bioactivity-PoD MCP may trust that:

- response values are numeric;
- dose groups are explicit and ordered;
- replicate counts are explicit;
- coordinate-bearing features have a declared genome build;
- original and internal coordinate systems are preserved;
- region-to-gene mappings are typed and provenance-labelled;
- warnings and exclusions have already been computed;
- unsupported nearest-gene pathway claims are suppressed;
- persistence, heritability, and causality claims are absent unless supported.

**Acceptance criteria.**

- Valid packet fixture passes JSON Schema validation.
- Exploratory-only and excluded features are not exported as default dose-response-ready subsets.
- Mandatory warnings propagate into the handoff packet.

### 7.12 FR-110: MCP tools and CLI parity

**Requirement.** Expose every core service as both an MCP tool and a Typer CLI command.

**MCP tool catalogue.**

- `ingest_epigenomic_feature_table`
- `ingest_epigenomics_design_table`
- `validate_epigenomics_experiment_design`
- `validate_genomic_coordinate_system`
- `classify_epigenomic_feature_type`
- `profile_epigenomics_missingness`
- `profile_epigenomics_variance`
- `map_regions_to_genes`
- `map_epigenomic_features_to_pathways`
- `assess_cell_composition_context`
- `assess_cytotoxicity_context`
- `qualify_epigenomic_features_for_pod`
- `create_epigenomics_feature_response_packet`
- `generate_epigenomics_qc_report`
- `validate_epigenomics_handoff_packet`
- `export_to_bioactivity_pod`

**CLI commands.**

- `epimcp ingest-features`
- `epimcp ingest-design`
- `epimcp validate-design`
- `epimcp validate-coordinates`
- `epimcp classify-features`
- `epimcp qc-missingness`
- `epimcp qc-variance`
- `epimcp map-regions`
- `epimcp map-pathways`
- `epimcp assess-cell-context`
- `epimcp assess-cytotox`
- `epimcp qualify`
- `epimcp build-packet`
- `epimcp qc-report`
- `epimcp validate-handoff`
- `epimcp export-pod`

**Acceptance criteria.**

- MCP and CLI outputs are identical for equivalent inputs.
- Every tool has typed Pydantic input/output models.
- Stdio transport works by default.
- Remote Streamable HTTP is deferred unless authentication and origin-validation requirements are implemented.

### 7.13 FR-120: QC reporting and documentation outputs

**Requirement.** Generate machine-readable JSON reports and regulator-readable Markdown reports.

**Report contents.**

- dataset and assay metadata;
- design validation;
- coordinate/build validation;
- platform provenance status;
- feature classification summary;
- missingness and variance summaries;
- mapping confidence distribution;
- cell-composition and cytotoxicity context;
- qualification counts;
- warnings and errors;
- excluded feature counts and reasons;
- explicit interpretation limits and non-inferences.

**Acceptance criteria.**

- Markdown and JSON reports are generated from the same source object.
- Reports include mandatory caveats for missing context, nearest-gene-only mapping, and unsupported persistence/heredity claims.

### 7.14 FR-130: Benchmark suite and golden outputs

**Requirement.** Ship deterministic benchmark fixtures and expected outputs.

**Minimum fixtures.**

| Fixture | Expected outcome |
|---|---|
| `bm_beta_manifest_complete` | accepted subset and valid handoff |
| `bm_dmr_nearest_gene_only` | measured region retained; pathway roll-up blocked |
| `bm_build_missing` | hard fail / excluded missing genome build |
| `bm_invalid_coordinate_format` | excluded invalid coordinates with row-level errors |
| `bm_missing_cell_context` | accepted with warnings or review |
| `bm_missing_cytotoxicity_context` | accepted with warnings |
| `bm_dominant_cytotoxicity` | excluded confounding dominant |
| `bm_insufficient_replicates` | excluded or review according to policy |
| `bm_high_missingness` | excluded high missingness |
| `bm_summary_contrast_only` | exploratory only |
| `bm_handoff_schema_valid` | handoff validation pass |
| `bm_handoff_schema_invalid` | handoff validation fail |

**Acceptance criteria.**

- Benchmark suite is deterministic.
- Golden outputs diff cleanly.
- Release is blocked on benchmark failure or unreviewed golden-output drift.

### 7.15 FR-140: CI/CD and release readiness

**Requirement.** Implement GitHub Actions workflows and release gates.

**Workflows.**

- `ci.yml`: lint, type checks, unit tests.
- `schemas.yml`: regenerate schemas and fail on unexpected drift.
- `benchmarks.yml`: run fixtures and compare golden outputs.
- `handoff-validation.yml`: validate Bioactivity-PoD packet compatibility.
- `docker.yml`: build and smoke-test container.
- `release-readiness.yml`: aggregate readiness gates.

**Release gates.**

1. All unit and integration tests pass.
2. All benchmark fixtures pass.
3. Schema drift requires a schema-version bump.
4. Golden-output drift requires reviewed changelog entry.
5. Handoff packet validation passes.
6. Documentation for scope, non-goals, coordinates, mapping, confounding, interpretation limits, and handoff is present.
7. `toxmcp.manifest.yaml` validates.
8. Docker image starts in stdio mode.

---

## 8. Warning and error taxonomy

### 8.1 Core errors

| Code | Meaning | Default effect |
|---|---|---|
| `EPI001_REQUIRED_COLUMN_MISSING` | mandatory input column absent | hard fail |
| `EPI002_COORDINATE_SYSTEM_UNDECLARED` | coordinate system missing | hard fail |
| `EPI003_INVALID_COORDINATE` | malformed interval | hard fail or feature exclusion |
| `EPI004_MISSING_GENOME_BUILD` | build missing for coordinate feature | exclude/block |
| `EPI005_MIXED_GENOME_BUILDS` | multiple builds in one packet | hard fail |
| `EPI006_NON_NUMERIC_RESPONSE` | model response not numeric | exclude |
| `EPI007_INSUFFICIENT_DOSE_GROUPS` | dose groups inadequate | exclude |
| `EPI008_INSUFFICIENT_REPLICATES` | biological replicates inadequate | exclude/review |
| `EPI009_SPECIES_MISMATCH` | species conflict | hard fail |
| `EPI010_HANDOFF_SCHEMA_INVALID` | export packet invalid | hard fail |
| `EPI011_BATCH_CONFOUNDED_WITH_DOSE` | batch perfectly tracks dose | block handoff |
| `EPI012_PLATFORM_PROVENANCE_MISSING` | platform/probe annotation missing when required | block interpretation |

### 8.2 Core warnings

| Code | Meaning | Default downstream effect |
|---|---|---|
| `EPIW001_CELL_COMPOSITION_CONTEXT_MISSING` | no composition context available | allow with warning |
| `EPIW002_CELL_TYPE_SHIFT_POSSIBLE` | potential composition drift across doses | review/downgrade |
| `EPIW003_CYTOTOXICITY_CONTEXT_MISSING` | no cytotoxicity context supplied | allow with warning |
| `EPIW004_CYTOTOXICITY_CONFOUNDING_POSSIBLE` | response may reflect injury/stress | review or exclude if dominant |
| `EPIW005_BATCH_METADATA_MISSING` | batch fields absent | allow with warning / review |
| `EPIW006_PLATFORM_ANNOTATION_VERSION_MISSING` | annotation not version-pinned | block interpretation until fixed |
| `EPIW007_NEAREST_GENE_ONLY` | target gene link is contextual only | suppress pathway roll-up |
| `EPIW008_INDIRECT_REGION_TO_GENE_MAPPING` | mapping indirect but provenance-supported | allow with warning |
| `EPIW009_PERSISTENCE_NOT_ASSESSED` | no repeated/recovery timepoints | block persistence claims |
| `EPIW010_HERITABILITY_CLAIM_FORBIDDEN` | unsupported inheritance claim | strip/block claim |
| `EPIW011_HIGH_MISSINGNESS_WARNING` | missingness in warning band | propagate warning |
| `EPIW012_ARRAY_PROBE_ARTIFACT_RISK` | probe artefact risk | review/exclude affected features |
| `EPIW013_ACCESSIBILITY_NOT_EXPRESSION` | accessibility is not expression proxy | preserve measured evidence only |
| `EPIW014_HISTONE_MARK_CONTEXT_DEPENDENT` | mark interpretation is context-dependent | allow with warning |
| `EPIW015_MIRNA_TARGET_PREDICTION_ONLY` | predicted targets only | block target/pathway roll-up |

---

## 9. Non-functional requirements

| Category | Requirement |
|---|---|
| Determinism | Same input and same policy version produce identical outputs |
| Auditability | Every emitted object has provenance, schema version, and traceable warnings/errors |
| Schema stability | Public schemas are semver-versioned and archived |
| Security | Stdio transport ships first; HTTP requires auth, origin validation, and safe binding |
| Reliability | Invalid inputs fail with structured errors, not stack traces |
| Performance | v0.1 handles typical processed tables on a workstation; large interval acceleration may use Polars/PyRanges behind adapters |
| Maintainability | Core logic is separated from MCP transport and CLI wrappers |
| Interoperability | JSON Schemas and handoff packets are compatible with downstream ToxMCP modules |
| Reproducibility | Reference snapshots, annotation releases, and manifests are version-pinned |
| Regulator readability | Reports explain what was computed, what was not inferred, and why |

---

## 10. Reference architecture

### 10.1 Repository layout

```text
epigenomics-mcp/
├─ pyproject.toml
├─ README.md
├─ toxmcp.manifest.yaml
├─ Dockerfile
├─ .github/workflows/
├─ docs/
├─ examples/
├─ benchmarks/
│  ├─ fixtures/
│  ├─ expected/
│  └─ benchmark_manifest.yaml
├─ schemas/
│  ├─ current/
│  └─ archive/
├─ src/epigenomics_mcp/
│  ├─ server.py
│  ├─ cli.py
│  ├─ tool_registry.py
│  ├─ contracts/
│  ├─ ingestion/
│  ├─ validators/
│  ├─ qc/
│  ├─ coordinate_mapping/
│  ├─ qualification/
│  ├─ integrations/
│  ├─ reports/
│  └─ adapters/
└─ tests/
   ├─ unit/
   ├─ integration/
   ├─ contract/
   ├─ benchmarks/
   └─ golden/
```

### 10.2 Service decomposition

| Service | Responsibility |
|---|---|
| Contract service | Pydantic models, schema export, validation envelopes |
| Intake service | CSV/TSV parsing, format detection, wide-to-long canonicalisation |
| Design validation service | dose/control/replicate/timepoint/batch checks |
| Coordinate validation service | coordinate system conversion, build validation, chrom bounds |
| Feature classification service | measured feature classes and metric semantics |
| QC service | missingness, variance, replicate/batch summaries |
| Annotation client | controlled calls to Annotation/Ontology MCP or frozen snapshots |
| Mapping service | typed region-to-gene and pathway mapping rules |
| Context service | cell-composition and cytotoxicity context classification |
| Qualification service | versioned fail-closed policy decisions |
| Packet service | QC report and Bioactivity-PoD handoff generation |
| MCP/CLI layer | typed tools and parity commands |

---

## 11. Integration contracts

| Integration target | Contract | Failure behaviour |
|---|---|---|
| Annotation/Ontology MCP | species/build/gene/pathway/cell-type normalisation and region mapping | omit interpretation or fail closed if required validation cannot be performed |
| Evidence Registry MCP | source accession, file hashes, output packet registration | block decision-grade packet if provenance registration is required and unavailable |
| Bioactivity-PoD MCP | `BioactivityPoDHandoffPacket` | export only accepted or accepted-with-warning subsets; block exploratory/excluded features |
| Benchmark/Validation MCP | fixtures, expected outputs, schema snapshots | fail release gate on drift or nondeterminism |
| WoE/NGRA Synthesis MCP | evidence summary with warnings/exclusions | preserve caveats; do not collapse measured features into mapped gene counts |
| Multiomics Summary MCP | qualified packet references | preserve modality-specific warnings and mapping confidence |

---

## 12. Acceptance criteria for v0.1 release

The release is complete when:

1. Supported input formats ingest successfully into canonical objects.
2. Invalid fixtures emit deterministic structured errors.
3. All core schemas export and validate.
4. Coordinate/build/platform checks block unsafe interpretation.
5. Missingness and variance profiles match golden outputs.
6. Region-to-gene mapping rules suppress nearest-gene pathway roll-up.
7. Missing cell-composition and cytotoxicity context produce mandatory warnings.
8. Dominant confounding blocks handoff.
9. Qualification statuses are deterministic across all benchmark fixtures.
10. Valid feature-response packets pass schema validation.
11. Bioactivity-PoD handoff packets include only eligible feature subsets.
12. MCP tool and CLI outputs are equivalent.
13. CI, schema, benchmark, handoff, Docker, and release-readiness workflows pass.
14. Documentation explains scope, non-goals, coordinate policy, mapping guardrails, confounding rules, handoff, benchmarks, and interpretation limits.

---

## 13. Roadmap

### v0.1: evidence-qualification core

- Contract-first schemas.
- Processed CSV/TSV ingestion.
- DNA methylation and DMR support.
- Generic coordinate-bearing region support.
- Deterministic validation and QC.
- Mapping guardrails.
- Confounding context.
- Qualification policy.
- QC report and Bioactivity-PoD handoff.
- MCP/CLI parity.
- Synthetic benchmarks and release gates.

### v0.2: richer adapters and context

- Direct ATAC/ChIP/CUT&Tag/CUT&RUN processed peak adapters.
- Processed bisulfite-seq coverage-aware adapters.
- miRNA measured-feature support with validated-target integration only.
- lncRNA/ncRNA adapters with Transcriptomics MCP boundary rules.
- ENCODE/GEO/BioStudies processed study adapters.
- ChIP-Atlas / Roadmap / EpiFactors contextual adapters where licensing permits.
- Controlled pseudobulk single-cell ATAC intake with aggregation provenance.

### v1.0: mature interoperability

- Signed schema and benchmark snapshots.
- Release attestation.
- Expanded public benchmark suite.
- Optional authenticated Streamable HTTP transport.
- Stronger cross-omics integration contracts.
- Regulator-facing evidence narratives generated from QC objects, not hidden heuristics.

---

## 14. Major risks and mitigations

| Risk | Consequence | Mitigation |
|---|---|---|
| Scope creep into raw processing | validation burden explodes | keep raw workflows out of core; use external adapters only |
| Nearest-gene overinterpretation | false pathway/AOP claims | separate mapping objects; block pathway roll-up from nearest-gene-only links |
| Missing coordinate/build provenance | false mappings | fail closed for coordinate-bearing features |
| Array probe artefacts | false methylation evidence | require platform provenance and probe-risk flags |
| Cell-composition confounding | wrong biological attribution | first-class context objects and warnings |
| Cytotoxicity/stress confounding | injury signal treated as mechanism | ingest viability/stress context; block dominant confounding |
| Schema drift | downstream incompatibility | semver schema snapshots and CI drift detection |
| Benchmark incompleteness | false readiness | synthetic edge-case fixtures from day one, public realism later |
| Licensing ambiguity | redistribution or deployment risk | keep secondary resources adapter-only until legal review |

---

## 15. Open decisions

1. Choose a default promoter window policy and version it.
2. Decide whether `n=2` biological replicates can ever be `accepted_with_warnings` or should always be `review_required`.
3. Freeze the exact Bioactivity-PoD handoff schema early.
4. Decide whether reference snapshots are governed by Epigenomics MCP releases or centrally by Annotation/Ontology MCP.
5. Decide which ATAC/ChIP/miRNA feature-flag capabilities, if any, are promoted into v0.1 rather than v0.2.
6. Decide whether non-CC0 or non-commercial benchmark resources can be redistributed or only referenced externally.

---

## 16. Definition of done

A v0.1 release candidate is done only when it can ingest a valid methylation/DMR/generic-region processed dataset, validate design and coordinates, emit deterministic QC and qualification outputs, block unsafe mapping/confounding cases, generate a schema-valid Bioactivity-PoD handoff packet, and pass all contract, benchmark, schema-drift, CLI/MCP parity, and release-readiness tests.
