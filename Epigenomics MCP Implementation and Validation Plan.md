# Epigenomics MCP Implementation and Validation Plan

|Attribute|Description|
|--:|:--|
|Domain > Expert|Computational toxicology and bioinformatics > scientific software architect for regulator-facing omics infrastructure|
|Keywords|epigenomics, MCP, JSON Schema, provenance, genomic coordinates, benchmark validation|
|Goal|Deliver a decision-grade implementation and validation plan for Epigenomics MCP from v0.1 to v1.0, with implementation-ready structures and explicit validation gates|
|Assumptions|v0.1 starts from processed feature tables; Bioactivity-PoD MCP is the sole PoD/BMD engine; Annotation/Ontology MCP is the authority for gene, region, pathway, species, and cell-type normalisation|
|Methodology|Contract-first design, deterministic validation, provenance-by-default, fail-closed qualification, benchmark-driven release gating, OECD-aligned reporting structure|

## Executive recommendation

Build Epigenomics MCP as a **Python-first, contract-first evidence qualification service**, not as a raw sequencing workbench and not as a PoD modeller. The v0.1 product should accept processed epigenomic feature tables plus design metadata, normalise them into canonical internal objects, validate dose/replicate/build/coordinate integrity, preserve platform and mapping provenance, assess cell-composition and cytotoxicity context, and emit a **QualifiedBioactivityFeatureResponse** packet that Bioactivity-PoD MCP can trust without needing to re-litigate foundational QC. This positioning is scientifically defensible, operationally maintainable, and aligned with the way regulatory omics reporting is moving toward transparent reporting modules rather than opaque monolithic pipelines. citeturn23search0turn23search1turn26view1turn27view0

The strongest implementation choice is a **hybrid processed-feature MCP with optional adapters**. Concretely, that means:  
- **v0.1**: direct support for CSV/TSV processed tables, deterministic validation, qualification, and handoff.  
- **v0.2**: direct support for processed ATAC/ChIP peak tables, miRNA/ncRNA expression tables, and read-only adapters to curated public resources.  
- **v1.0**: richer external adapters, stronger enhancer–promoter evidence integration, single-cell pseudobulk handoff, and broader benchmark suites—but still not a default FASTQ/IDAT/alignment/peak-calling platform.  

That recommendation fits the official Python MCP ecosystem well: the official Python SDK is Tier 1, supports tools/resources/prompts and both local and remote transports, while FastMCP exposes typed Python functions as MCP tools with low implementation friction. The protocol itself standardises JSON-RPC messaging over stdio and Streamable HTTP, which is exactly the right shape for an auditable scientific microservice. citeturn26view1turn26view0turn26view2turn26view3

The most important strategic constraint is **fail-closed qualification**. Epigenomics MCP should never upgrade ambiguous biology into apparently precise mechanistic evidence. Distal regulatory regions can act over large distances, skip the nearest gene, and map many-to-many to promoters; methylation arrays can contain cross-reactive and polymorphic probes; cell-composition shifts can explain large portions of DNA methylation variability; and batch correction can itself induce artefacts if applied incautiously. Therefore, v0.1 should prefer explicit provenance, explicit warnings, and explicit exclusion statuses over silent imputation or silent “best effort” rescue. citeturn21search1turn20search5turn20search1turn20search22turn20search2turn21search23

A concise positioning statement for the product is:

> **Epigenomics MCP is the qualification, provenance, and handoff layer for processed epigenomic feature evidence in NGRA. It is not the raw processing layer, not the causal inference layer, and not the PoD modelling layer.** citeturn23search0turn26view2

## Technology stack and repository layout

### Pragmatic v0.1 stack

The recommended v0.1 implementation stack is:

|Component|Decision|Why this is the right default|
|:--|:--|:--|
|Runtime|CPython 3.11+|Keeps modern typing, packaging, and async ergonomics while clearing the Python ≥3.10 requirement documented for the Python MCP SDK citeturn26view0|
|Schema layer|Pydantic v2|Use Pydantic models as the canonical contracts and export JSON Schema Draft 2020-12 via `model_json_schema()` for MCP tool contracts, fixture validation, and inter-module handoff snapshots citeturn27view0|
|MCP server|Official Python MCP SDK + FastMCP|Typed tool definitions, low boilerplate, good fit for a tool-oriented scientific service, and direct alignment with the MCP spec citeturn26view1turn26view0turn26view2|
|Primary tabular engine|Pandas|Best compatibility for CSV/TSV ingestion, long/wide reshaping, existing scientific ecosystem, and easiest regulator-readable debugging citeturn27view1turn27view4|
|Optional tabular accelerator|Polars|Use only behind adapters or for very large interval tables; its `scan_csv`/`LazyFrame` model is useful, but it should not become the canonical public API in v0.1 citeturn27view2turn27view3|
|Coordinate operations|bioframe primary, PyRanges optional|bioframe is pandas-native and explicit about BedFrame conventions; PyRanges is strong for overlap operations and format conversion, but introduces another object model. Use PyRanges only where scale needs it citeturn27view4turn15view3turn15view2|
|External genome algebra|pybedtools deferred|It is powerful, but wraps BEDTools and increases operational complexity; defer until there is a demonstrated need beyond pandas-native interval work citeturn27view5|
|Intermediate analytical cache|DuckDB|DuckDB can query CSV, JSON, Parquet, Pandas, Polars, and Arrow directly; it is ideal for benchmark fixtures, QC snapshots, and reproducible export tables. SQLite is still useful for a tiny manifest/audit ledger if needed citeturn27view3turn27view9|
|Stats/QC|SciPy + statsmodels|Enough for deterministic summary statistics, simple regressions, confidence intervals, and transparent QC without turning the service into a modelling lab citeturn27view6turn29view0|
|HTTP client|httpx|Sync/async support, HTTP/2, type annotations, and a clean fit for calling Annotation/Ontology MCP or other services citeturn27view8|
|CLI|Typer|Type-hint-driven CLI commands, automatic help, subcommands, and shell completion; good parity target for MCP tools citeturn30view0|

The practical decision on Pandas vs Polars is simple: **Pandas in the public core, Polars behind performance-sensitive adapters**. v0.1 will spend most of its time validating messy real-world CSV/TSV inputs and joining them to design metadata, not scanning terabyte-scale peak catalogues. Pandas has the lowest friction for those jobs. Polars becomes valuable later for large processed-peak imports and batch exports, especially when paired with DuckDB. citeturn27view1turn27view2turn27view3

For MCP transport, **ship stdio first**. The MCP specification explicitly defines stdio and Streamable HTTP; stdio is operationally simplest, avoids accidental network exposure, and matches scientific desktop/local-pipeline deployment well. If remote transport is added later, Streamable HTTP must come with origin validation, localhost binding by default, and real authentication, because the MCP spec explicitly warns about rebinding and related attack paths. citeturn26view3turn26view2

### Repository structure

The repository should separate **contracts**, **core logic**, **integration adapters**, and **benchmarks**. A concrete tree:

```text
epigenomics-mcp/
├─ pyproject.toml
├─ README.md
├─ toxmcp.manifest.yaml
├─ Dockerfile
├─ LICENSE
├─ .github/
│  └─ workflows/
│     ├─ ci.yml
│     ├─ schemas.yml
│     ├─ benchmarks.yml
│     ├─ handoff-validation.yml
│     ├─ docker.yml
│     └─ release-readiness.yml
├─ docs/
│  ├─ scientific-scope.md
│  ├─ non-goals.md
│  ├─ input-format-guide.md
│  ├─ genome-build-and-coordinate-guide.md
│  ├─ region-to-gene-mapping-guide.md
│  ├─ cell-composition-conflounding-guide.md
│  ├─ cytotoxicity-context-guide.md
│  ├─ interpretation-limits.md
│  ├─ bioactivity-pod-handoff-guide.md
│  ├─ benchmark-report.md
│  └─ validation-statement.md
├─ examples/
│  ├─ methylation_beta_valid/
│  ├─ dmr_nearest_gene_warning/
│  ├─ invalid_build_mismatch/
│  └─ bioactivity_pod_handoff_valid/
├─ benchmarks/
│  ├─ fixtures/
│  │  ├─ synthetic/
│  │  └─ frozen_public/
│  ├─ expected/
│  └─ benchmark_manifest.yaml
├─ schemas/
│  ├─ current/
│  └─ archive/
├─ src/
│  └─ epigenomics_mcp/
│     ├─ __init__.py
│     ├─ version.py
│     ├─ config.py
│     ├─ server.py
│     ├─ cli.py
│     ├─ tool_registry.py
│     ├─ errors.py
│     ├─ warnings.py
│     ├─ provenance.py
│     ├─ contracts/
│     │  ├─ dataset.py
│     │  ├─ design.py
│     │  ├─ coordinates.py
│     │  ├─ features.py
│     │  ├─ qualification.py
│     │  ├─ qc_report.py
│     │  └─ handoff.py
│     ├─ ingestion/
│     │  ├─ csv_reader.py
│     │  ├─ format_detection.py
│     │  ├─ long_format.py
│     │  ├─ wide_format.py
│     │  └─ table_adapters.py
│     ├─ validators/
│     │  ├─ design_validator.py
│     │  ├─ build_validator.py
│     │  ├─ coordinate_validator.py
│     │  ├─ matrix_validator.py
│     │  ├─ provenance_validator.py
│     │  └─ handoff_validator.py
│     ├─ qc/
│     │  ├─ missingness.py
│     │  ├─ variance.py
│     │  ├─ cell_composition.py
│     │  ├─ cytotoxicity.py
│     │  └─ report_builder.py
│     ├─ coordinate_mapping/
│     │  ├─ normalise.py
│     │  ├─ overlap.py
│     │  ├─ region_to_gene.py
│     │  └─ pathway_mapping.py
│     ├─ qualification/
│     │  ├─ policy.py
│     │  ├─ rules.py
│     │  └─ packet_builder.py
│     ├─ integrations/
│     │  ├─ annotation_client.py
│     │  ├─ evidence_registry_client.py
│     │  ├─ bioactivity_pod_client.py
│     │  └─ benchmark_validation_client.py
│     ├─ reports/
│     │  ├─ json_report.py
│     │  └─ markdown_report.py
│     └─ adapters/
│        ├─ encode_processed.py
│        ├─ geobiosamples_processed.py
│        ├─ mirbase_lookup.py
│        └─ chipatlas_lookup.py
└─ tests/
   ├─ unit/
   ├─ integration/
   ├─ contract/
   ├─ benchmarks/
   └─ golden/
```

That structure keeps the public contracts and benchmark fixtures visible, versionable, and reviewable. It also makes it straightforward to generate JSON Schemas from Pydantic, commit them into `schemas/current`, and archive them per release. citeturn27view0turn19search5turn19search7turn19search11

## Ingestion model and canonical objects

### Core ingestion principle

Every importer should reduce incoming data to one of only **two canonical measurement shapes**:

- **Matrix shape**: measured feature × sample values, with sample metadata joined later.
- **Summary-response shape**: feature × dose-group summaries, where the upstream source already aggregated samples.

That distinction is critical. A matrix is usually strong enough for qualification toward downstream dose-response modelling. A summary table may or may not be. If a table contains only one contrast-level statistic per feature—such as one adjusted p-value and one log fold-change across “treated vs control”—it is **not** PoD-ready. It may still be valuable for evidence registry and exploratory interpretation, but it should be labelled `exploratory_only` at the qualification layer. This is the single biggest way to prevent Epigenomics MCP from overpromising on underspecified upstream evidence.

### Coordinate handling policy

Internally, all coordinate-bearing features should be normalised to **0-based, half-open intervals**, while preserving the original interval, original coordinate system, and original row text in provenance. This is the least ambiguous option because BED and many interval libraries operate that way, whereas Ensembl uses one-based coordinates. The importer must therefore require an explicit `source_coordinate_system` and never guess. citeturn15view0turn15view1turn15view2turn15view3

Accepted input coordinate systems should be:

- `ucsc_bed_0based_half_open`
- `gff_gtf_1based_closed`
- `platform_native_probe`
- `no_coordinates_feature_id_only`

If the source system is missing for any region-based table, v0.1 should hard-fail with `EPI002_COORDINATE_SYSTEM_UNDECLARED`.

### Input support matrix

|Input form|v0.1 support|Required columns|Important validation rules|Internal representation|Failure mode|
|:--|:--|:--|:--|:--|:--|
|Generic long-format feature table|Direct|`dataset_id`, `sample_id`, `feature_id`, `response_value`|One row per `feature_id × sample_id`; response numeric; `sample_id` present in design table|`EpigenomicsDataset` + long measurement frame|Hard fail on duplicate keys or non-numeric response|
|Generic wide-format feature matrix|Direct|`feature_id` plus sample columns|All sample columns must resolve to design metadata; melt to long before validation|Same as above after canonical melt|Hard fail on unmatched sample columns|
|DNA methylation beta-value table|Direct|`feature_id` or probe ID, sample columns|Metric explicitly declared as beta; platform annotation provenance required for array data|`CpGFeature` / `MethylationFeature`|Warning if manifest version missing; exclude if platform absent and coordinate/gene interpretation requested|
|DNA methylation M-value table|Direct|Same as beta table|Metric declared as M-value; do not silently back-convert|Same canonical model with `reported_metric="m_value"`|Same as above|
|Differentially methylated CpG table|Direct, but often exploratory|`feature_id` or coordinate, `effect_size`, statistical columns, dose/contrast metadata|PoD eligibility only if the table preserves dose-group granularity or per-group summaries across ordered doses|`SummaryFeatureResponse`|`exploratory_only` if only one contrast statistic per feature|
|DMR table|Direct|`chrom`, `start`, `end`, effect/summary columns, build|Coordinate system/build mandatory; region length > 0; mapping provenance required for gene/pathway use|`DMRFeature`|Hard fail on invalid coordinates; warning/exclusion on ambiguous mapping|
|ATAC-seq processed peak table|v0.2 direct|`chrom`, `start`, `end`, sample or group values, build|BED-like validation, peak signal metric declared, no unqualified gene inference|`ChromatinAccessibilityFeature`|Deferred in v0.1 unless ingested via adapter as exploratory|
|ChIP-seq histone-mark region table|v0.2 direct|`chrom`, `start`, `end`, mark label, values, build|Histone mark mandatory; interpretation warning mandatory because mark meaning is context dependent|`HistoneMarkFeature`|Deferred in v0.1 direct path|
|miRNA expression table|v0.2 direct, optional late v0.1 if high priority|`feature_id`, sample or group values, species|miRNA identifiers normalised separately from target genes; no target-prediction rollup by default|`MiRNAFeature`|Exploratory only for target-gene/pathway interpretation absent validated mappings|
|ncRNA expression table|v0.2 direct|`feature_id`, sample/group values, species|Identifier namespace and transcript version preserved|`NcRNAFeature`|Review required if annotation namespace unresolved|
|Sample/dose metadata table|Direct|`sample_id`, `dose_value`, `dose_unit`, `group_id`, `replicate_type`|All sample-linked tables require complete sample coverage; ordered dose axis; control group explicit|`DoseDesign` + `SampleMetadata`|Hard fail on missing sample IDs or mixed dose units|

Where public archives are concerned, the most useful processed-source pathways for v0.1/v0.2 are: processed tables from GEO, BioStudies/ArrayExpress, and ENCODE analysis outputs—not their raw sequencing archives. GEO explicitly distributes processed and raw high-throughput functional genomics data, while high-throughput sequencing raw data are stored in SRA; BioStudies now hosts ArrayExpress functional-genomics content and preserves metadata, processed data, and links to raw sequence data in ENA; ENCODE exposes processed analyses, quality metrics, audits, and metadata via JSON. citeturn25search6turn25search18turn25search9turn37view1turn24search4turn37view2turn37view3

### Internal canonical objects

These are the minimum internal objects I would implement in v0.1.

|Object|Required fields|Key relationships|
|:--|:--|:--|
|`EpigenomicsDataset`|`dataset_id`, `schema_version`, `modality`, `assay_type`, `species`, `source_files`, `provenance`|Owns features, sample metadata, design, QC, qualification results|
|`SampleMetadata`|`sample_id`, `group_id`, `dose_value`, `dose_unit`, `replicate_type`, `batch_id`|Linked many-to-one to `EpigenomicsDataset`|
|`DoseDesign`|`control_group_id`, `dose_axis`, `dose_groups`, `timepoint`, `exposure_route?`|Used by qualification and handoff build|
|`GenomicCoordinate`|`genome_build`, `chrom`, `start`, `end`, `strand?`, `coordinate_system`, `source_coordinate`|Embedded into region-bearing features|
|`EpigenomicFeature`|`feature_id`, `feature_class`, `reported_metric`, `direct_measurement`, `response_records`|Parent type for all features|
|`CpGFeature`|Above + `probe_id?`, `cpg_id?`, `coordinate?`, `platform_annotation`|Specialised methylation feature|
|`DMRFeature`|Above + `coordinate`, `region_summary_method?`|Maps to genes cautiously|
|`ChromatinAccessibilityFeature`|Above + `coordinate`, `peak_score?`|Later v0.2 direct support|
|`HistoneMarkFeature`|Above + `coordinate`, `histone_mark`|Always carries interpretation warning|
|`MiRNAFeature`|Above + `mirbase_id?`, `species`, `coordinate?`|Target links separated from measured feature|
|`RegionToGeneMapping`|`mapping_type`, `gene_id`, `confidence`, `provenance_source`, `distance_to_tss?`|Attached to region-bearing features; never conflated with direct measurement|
|`CellCompositionContext`|`status`, `basis`, `measured_fractions?`, `notes`, `warnings`|Dataset-level plus optional group-specific context|
|`CytotoxicityContext`|`status`, `basis`, `assay_type?`, `viability_values?`, `stress_flags?`, `warnings`|Dataset-level plus optional group-specific context|
|`MissingnessProfile`|`feature_missing_fraction`, `group_missing_fraction`, `sample_missing_fraction`|Used by qualification rules|
|`PlatformAnnotationRecord`|`platform_name`, `platform_version`, `manifest_id`, `manifest_sha256`, `annotation_release_date?`|Required for array/probe-based interpretation|
|`QualificationResult`|`qualification_status`, `reasons`, `warnings`, `errors`, `review_flags`|Attached feature-wise and dataset-wise|
|`HandoffPacket`|`packet_id`, `schema_version`, `modality`, `features`, `dose_axis`, `biological_context`, `provenance`|Export contract to Bioactivity-PoD MCP|

### MCP tools and CLI parity

Each MCP tool should map one-to-one to a CLI command and one core Python service function. That prevents “spec drift” between local scripting, server execution, and tests.

Recommended v0.1 core tool set:

- `ingest_epigenomic_feature_table`
- `ingest_epigenomics_design_table`
- `validate_epigenomics_experiment_design`
- `validate_genomic_coordinate_system`
- `classify_epigenomic_feature_type`
- `profile_epigenomics_missingness`
- `profile_epigenomics_variance`
- `map_regions_to_genes`
- `assess_cell_composition_context`
- `assess_cytotoxicity_context`
- `qualify_epigenomic_features_for_pod`
- `create_epigenomics_feature_response_packet`
- `generate_epigenomics_qc_report`
- `validate_epigenomics_handoff_packet`
- `export_to_bioactivity_pod`

Recommended matching CLI surface:

```text
epimcp ingest-features ...
epimcp ingest-design ...
epimcp validate-design ...
epimcp validate-coordinates ...
epimcp classify-features ...
epimcp qc-missingness ...
epimcp qc-variance ...
epimcp map-regions ...
epimcp assess-cell-context ...
epimcp assess-cytotox ...
epimcp qualify ...
epimcp build-packet ...
epimcp qc-report ...
epimcp validate-handoff ...
epimcp export-pod ...
```

Typer is a strong fit for this because the subcommand model, automatic help, and type-hint-driven argument parsing keep the CLI thin and consistent with the underlying Python contracts. citeturn30view0

## Deterministic validation and qualification logic

### Validation philosophy

The QC layer should stay deliberately conservative and deliberately simple. v0.1 is not the place to add opaque rescue logic, automated batch correction, deconvolution-by-default, or probabilistic enhancer assignment. It should instead do three things well:

- detect structural defects,
- preserve interpretation limits,
- declare downstream eligibility explicitly.

That is especially important for epigenomics. Cell-composition heterogeneity can dominate observed methylation signals; array probe design artefacts can generate spurious findings; regional regulatory assignments are intrinsically uncertain; and post hoc batch correction can create false positives if used incautiously. citeturn21search1turn21search0turn20search5turn20search1turn21search23

### Deterministic QC algorithms

#### Dose axis validation

Rules:

- Require a declared `dose_unit` and explicit `control_group_id`.
- Reject mixed numeric units within a dataset unless an upstream normalisation step is declared in provenance.
- Require ordered dose values after unit-normalisation.
- Distinguish `nominal_dose_value` from `measured_concentration` if both exist.
- Require one timepoint per packet in v0.1. Multi-timepoint studies can be split into separate packets.

Default thresholds:

- `accepted_for_pod`: control + at least 3 treated dose groups.
- `accepted_with_warnings`: control + 2 treated dose groups.
- `excluded_insufficient_design`: fewer than 3 total groups.

#### Replicate validation

Rules:

- Distinguish `biological`, `technical`, and `pooled` replicates.
- Technical replicates do not count toward the biological minimum.
- Default minimum for `accepted_for_pod`: at least 3 biological replicates in control and at least 2 treated groups, and no dose group with `n=1`.
- `review_required` if any modelled group has only 2 biological replicates.
- `excluded_insufficient_design` if any modelled group has a single biological replicate.

#### Genome build validation

Rules:

- For coordinate-bearing features, build is mandatory.
- Allowlist initial builds: `GRCh37`, `GRCh38`, `mm10`, `mm39`.
- Validate chromosome names against the declared build through Annotation/Ontology MCP or a frozen chromsizes snapshot.
- Hard-fail on mixed builds inside one dataset unless the source explicitly split analyses by build.
- Never auto-lift coordinates in v0.1; if lift-over is needed, it must be an upstream transformation with its own provenance.

This is not optional: UCSC BED semantics and Ensembl coordinate semantics differ, and assembly versions are not interchangeable. citeturn15view0turn15view1turn14search2turn14search4turn17search2turn17search4

#### Coordinate format validation

Rules:

- `chrom` non-empty.
- `start >= 0`.
- `end > start`.
- Interval length below a configurable maximum for the feature type.
- Strand restricted to `+`, `-`, or `.` where applicable.
- Original coordinate system preserved in provenance.
- Imported 1-based closed intervals converted once, immutably, to internal 0-based half-open.

#### Missingness profiling

Rules:

- Compute feature-level missing fraction across all samples and by dose group.
- Default thresholds for matrix-type features:
  - `accepted_for_pod`: missingness ≤ 0.10 in all groups
  - `accepted_with_warnings`: >0.10 and ≤0.20
  - `excluded_high_missingness`: >0.20 overall or complete absence in any modelled group
- Summary-response tables record missingness as `not_applicable` where there are no sample-level measures.

#### Variance profiling

Rules:

- Compute per-feature variance/MAD across groups.
- Flag zero-variance or near-zero-variance features as `exploratory_only`.
- Do not remove them silently; retain them with QC annotation.

#### Region-to-gene mapping

This is the most important biological guardrail area. Use a strictly typed mapping model:

|Mapping type|Downstream rule|
|:--|:--|
|`direct_promoter_overlap`|Allowed for contextual gene linkage and pathway rollup|
|`gene_body_overlap`|Allowed for contextual linkage; pathway rollup allowed with warning if promoter not overlapped|
|`enhancer_target_from_database`|Allowed only if provenance names the database/release and confidence class|
|`chromatin_interaction_supported`|Allowed in v1.0 if source and cell context are explicit|
|`nearest_gene`|Context only; not allowed to drive pathway rollup or mechanistic claims in v0.1|
|`inferred_target_gene`|Exploratory only; not allowed in PoD handoff packet as target-level evidence|
|`unknown_target_gene`|Feature may still be PoD-eligible as a region-based response, but with no gene/pathway rollup|

This conservatism is justified: enhancer–promoter regulation is not nearest-gene by default, can skip intervening genes, and is frequently many-to-many. citeturn20search22turn20search2

#### Gene/pathway mapping confidence

Rules:

- Direct gene-linked features can proceed to pathway mapping after identifier normalisation.
- Region-based features can only proceed to pathway rollups if mapping type is `direct_promoter_overlap`, `gene_body_overlap`, or `enhancer_target_from_database`.
- `nearest_gene` can appear in the human-readable QC report but is suppressed from machine-actionable pathway evidence by default.

#### Cell-composition context assessment

v0.1 should **not** attempt full deconvolution from processed epigenomic values as a default service capability. Houseman-style cell-mixture estimation and later EWAS deconvolution methods show why cell composition matters, but implementing those methods in a cross-assay standardiser would drag the MCP into assay-specific modelling. Instead, v0.1 should ingest measured or externally estimated cell fractions and apply a rule-based context classifier. citeturn21search0turn21search1

Recommended statuses:

- `unlikely_confounding`: purified or single-cell-derived homogeneous material; or externally measured fractions show no material shift.
- `possible_confounding`: mixed population without fraction estimates; modest morphology or marker evidence of shift.
- `likely_confounding`: mixed population plus known differentiation or composition change across dose groups.
- `dominant_confounding`: the biology of interest is plausibly overwhelmed by composition change; exclude from PoD.
- `no_context_available`: no evidence either way; warning mandatory.

#### Cytotoxicity context assessment

v0.1 should not infer cytotoxicity from epigenomic features alone. It should ingest explicit viability, membrane integrity, apoptosis/necrosis, morphology, or high-level stress-response flags from upstream assays or companion MCPs. If those data are missing, the system should warn; if they indicate strong cell injury aligned with the epigenomic signal, the packet should be downgraded or excluded.

Recommended statuses:

- `unlikely_confounding`
- `possible_confounding`
- `likely_confounding`
- `dominant_confounding`
- `no_context_available`

#### Batch/platform provenance checks

Rules:

- Require `platform_name`, `platform_annotation_version`, and, where possible, a manifest hash or frozen annotation file hash for array/probe platforms.
- Record whether upstream batch correction was applied, by which method, and with which parameters.
- Warn on any corrected dataset lacking the pre-correction batch structure in provenance.
- Do **not** perform batch correction in v0.1. Record-only.

That last point matters because methylation-array batch correction can introduce systematic false positives when used without care. citeturn21search23turn23search0

### Qualification statuses

Recommended feature/dataset qualification statuses:

|Status|Meaning|
|:--|:--|
|`accepted_for_pod`|Structurally complete and sufficiently qualified for downstream Bioactivity-PoD modelling|
|`accepted_with_warnings`|Usable, but warnings must propagate downstream|
|`review_required`|Not safe for automated PoD use without human review|
|`exploratory_only`|Useful for evidence or interpretation, but not for PoD derivation|
|`excluded_insufficient_design`|Dose/replicate structure inadequate|
|`excluded_invalid_coordinates`|Coordinate syntax/system invalid|
|`excluded_missing_genome_build`|Coordinate-bearing feature lacks assembly declaration|
|`excluded_high_missingness`|Missingness above threshold|
|`excluded_mapping_ambiguous`|Requested target/pathway interpretation not supportable|
|`excluded_non_numeric_response`|Response not model-consumable|
|`excluded_confounding_dominant`|Cell composition or cytotoxicity likely dominates observed response|

### Warning/error taxonomy

A compact, implementation-ready code set:

|Code|Type|Meaning|Default downstream effect|
|:--|:--|:--|:--|
|`EPI001_REQUIRED_COLUMN_MISSING`|Error|Mandatory input column absent|Hard fail|
|`EPI002_COORDINATE_SYSTEM_UNDECLARED`|Error|No source coordinate system supplied|Hard fail|
|`EPI003_INVALID_COORDINATE`|Error|Malformed interval or negative coordinate|Hard fail|
|`EPI004_MISSING_GENOME_BUILD`|Error|Region-bearing feature lacks build|Exclude|
|`EPI005_MIXED_GENOME_BUILDS`|Error|Multiple assemblies in one packet|Hard fail|
|`EPI006_NON_NUMERIC_RESPONSE`|Error|Response values not numeric|Exclude|
|`EPI007_INSUFFICIENT_DOSE_GROUPS`|Error|Too few ordered groups for qualification|Exclude|
|`EPI008_INSUFFICIENT_REPLICATES`|Error|Too few biological replicates|Exclude or review|
|`EPI009_SPECIES_MISMATCH`|Error|Feature/design/annotation species conflict|Hard fail|
|`EPI010_HANDOFF_SCHEMA_INVALID`|Error|Export packet fails contract validation|Hard fail|
|`EPIW001_CELL_COMPOSITION_CONTEXT_MISSING`|Warning|No composition context available|Propagate warning|
|`EPIW002_CELL_TYPE_SHIFT_POSSIBLE`|Warning|Potential composition drift across doses|Review or downgrade|
|`EPIW003_CYTOTOXICITY_CONTEXT_MISSING`|Warning|No cytotoxicity context supplied|Propagate warning|
|`EPIW004_CYTOTOXICITY_CONFOUNDING_POSSIBLE`|Warning|Observed response may reflect overt injury/stress|Review or exclude if dominant|
|`EPIW005_BATCH_METADATA_MISSING`|Warning|No batch structure declared|Propagate warning|
|`EPIW006_PLATFORM_ANNOTATION_VERSION_MISSING`|Warning|Array/probe annotation not version-pinned|No gene/pathway interpretation until fixed|
|`EPIW007_NEAREST_GENE_ONLY`|Warning|Target gene link is contextual only|Suppress pathway rollup|
|`EPIW008_INDIRECT_REGION_TO_GENE_MAPPING`|Warning|Database-supported but indirect mapping|Propagate warning|
|`EPIW009_PERSISTENCE_NOT_ASSESSED`|Warning|No time-course or recovery design|Block persistence claims|
|`EPIW010_HERITABILITY_CLAIM_FORBIDDEN`|Warning|Source narrative overclaims inheritance/transgenerational effect|Strip claim; keep evidence only|
|`EPIW011_HIGH_MISSINGNESS_WARNING`|Warning|Missingness in warning band|Propagate warning|
|`EPIW012_ARRAY_PROBE_ARTIFACT_RISK`|Warning|Relevant for older array probe sets or missing blacklist metadata|Review platform provenance|

Cross-reactive and polymorphic methylation probes are sufficiently well documented that array-provenance fields should be treated as core—not optional presentation metadata. citeturn20search5turn20search1

## Integration contracts and external reference strategy

### Integration with Annotation/Ontology MCP

The contract with Annotation/Ontology MCP should be explicit and narrow.

#### Required calls

- **Gene identifier normalisation**: normalise HGNC/Ensembl/other gene identifiers to canonical IDs and symbol snapshots.
- **Genome build / chromosome validation**: verify species, chromosome aliases, and build-specific coordinate bounds.
- **Region-to-gene mapping provenance**: return mapping type, source database, release, method, and confidence.
- **Pathway membership**: return pathway IDs, namespace, release, and evidence basis.
- **Species/taxon validation**: ensure dataset species, feature species, and annotation species match.
- **Cell type / assay type normalisation**: map source metadata to controlled vocabulary identifiers.

#### Failure behaviour

If Annotation/Ontology MCP is unavailable:

- Direct measured features **may still proceed** if they do not require gene/pathway interpretation and all structural QC passes.
- Coordinate-bearing features **may still proceed** if build and coordinate checks can be completed locally against a frozen snapshot.
- Gene/pathway interpretation must be omitted and the packet marked `accepted_with_warnings` or `review_required`.
- If build validation or species validation depends on Annotation/Ontology MCP and no local snapshot exists, fail closed.

### External reference strategy

For v0.1, use only a small number of frozen, well-documented external resources in the core path. Everything else should be adapter-only until licensing and provenance are clean.

|Resource|Role in Epigenomics MCP|Access / update notes|Licensing / audit note|Stage|
|:--|:--|:--|:--|:--|
|HGNC via entity["organization","HUGO Gene Nomenclature Committee","gene nomenclature authority"]|Human gene symbol normalisation|REST API, JSON/TSV downloads, updated Tue/Fri, monthly/quarterly archives citeturn33view0turn33view2|CC0, excellent for frozen snapshots citeturn33view3|v0.1 core|
|Ensembl / GENCODE at entity["organization","European Bioinformatics Institute","Hinxton, Cambridgeshire, UK"]|Gene annotations, GRCh37/GRCh38 mapping, regulatory features, release pinning|REST API; GRCh37 REST remains separate; GENCODE files accessible through Ensembl/FTP; current documented releases include Ensembl 115 and GENCODE human 49 / mouse M38 citeturn32search1turn32search3turn11search12turn17search1turn17search2turn17search4|Strong auditability if release pinned|v0.1 core|
|UCSC resources from entity["organization","University of California, Santa Cruz","Santa Cruz, CA, US"]|BED semantics, lift-over metadata, public API, Table Browser, mirror data|REST/API, Table Browser, public MySQL; BED semantics clearly documented citeturn15view0turn31search9turn31search2|Web/API/data broadly open, but command-line/browser local-install licensing has nuances for commercial settings citeturn31search0turn31search3turn31search7|v0.1 core for reference data, v0.2 optional lift-over adapter|
|GO from entity["organization","Gene Ontology Consortium","biomedical ontology project"]|Pathway/functional rollup with release-traceable ontology and annotation evidence|APIs plus downloadable releases; release date/DOI should be recorded for reproducibility citeturn35view1turn35view0|CC BY 4.0; requires attribution and release pinning citeturn35view0|v0.1 core|
|Reactome|Curated pathway rollup and versioned pathway membership|Content Service API; quarterly release pattern and downloadable snapshots/Zenodo per release citeturn34view0turn34view1turn34view3|Data are CC0; software Apache 2.0; good fit for auditable snapshots citeturn34view2|v0.1 core|
|ENCODE processed analyses|Reference processed peak/WGBS examples, metadata-rich realism fixtures, future adapters|REST API JSON, quality metrics, audits, uniformly processed analyses, 10 GET/s guidance citeturn37view2turn37view3|Freely downloadable with no restriction; strong metadata model citeturn37view2|v0.2 adapter / frozen benchmark inputs|
|GEO / BioStudies / ArrayExpress|Processed public study ingestion and benchmark realism|GEO distributes processed data; HTS raw goes to SRA; BioStudies hosts ArrayExpress study metadata/processed data and links raw reads to ENA citeturn25search2turn25search18turn37view1turn24search4|Good for ingestion realism, but curate fixtures aggressively|v0.2 adapter / frozen benchmark inputs|
|miRBase|miRNA identifier and coordinate reference|Downloads include sequence files and species GFF3 coordinate sets citeturn38view2turn8search6|Useful reference; freeze release locally|v0.2 core for miRNA support|
|ChIP-Atlas|Read-only query adapter for public ChIP/ATAC/Bisulfite experiments|HTTP API and even its own MCP server with read-only tools; useful as an external adapter, not a mirrored dependency citeturn38view0|Treat as adapter/external evidence source, not core truth store|v0.2 adapter|
|ReMap|Curated TF-binding catalogue for benchmarking and contextual region annotation|Downloadable catalogues for human/mouse/fly/Arabidopsis; curated from GEO/ENCODE/ENA citeturn38view1|CC BY-NC 4.0 for catalogues, so keep out of unrestricted redistributed core snapshots unless licensing is acceptable for your distribution model citeturn38view1|v0.2 reference-only / optional adapter|

This split keeps the auditable core small: HGNC, Ensembl/GENCODE, UCSC reference semantics, GO, Reactome, and frozen local assembly snapshots. Everything else enhances realism or convenience, but should not be required for successful qualification.

### Bioactivity-PoD handoff contract

Bioactivity-PoD MCP should receive an object that is already structurally trustworthy. A minimal, implementation-ready packet shape:

```json
{
  "schema_version": "0.1.0",
  "packet_id": "epi_pkt_000123",
  "modality": "epigenomics",
  "feature_table_type": "cpg_methylation_matrix",
  "qualification_status": "accepted_with_warnings",
  "dataset_metadata": {
    "dataset_id": "study_abc",
    "assay_type": "dna_methylation_array",
    "species": "Homo sapiens",
    "taxon_id": 9606,
    "timepoint": "24h"
  },
  "chemical_context": {
    "chemical_id": "CHEM:example",
    "chemical_name": "example_chemical"
  },
  "biological_context": {
    "system_type": "in_vitro",
    "cell_system": "primary_hepatocytes",
    "tissue": "liver",
    "developmental_stage": "adult"
  },
  "dose_axis": {
    "dose_unit": "uM",
    "control_group_id": "g0",
    "groups": [
      {"group_id": "g0", "dose_value": 0.0, "replicate_count": 4},
      {"group_id": "g1", "dose_value": 0.1, "replicate_count": 4},
      {"group_id": "g2", "dose_value": 1.0, "replicate_count": 4},
      {"group_id": "g3", "dose_value": 10.0, "replicate_count": 4}
    ]
  },
  "epigenomic_context": {
    "feature_class": "cpg_methylation_feature",
    "reported_metric": "beta_value",
    "genome_build": "GRCh38",
    "internal_coordinate_system": "0based_half_open",
    "platform_name": "Illumina_EPIC",
    "platform_annotation_version": "manifest_vX",
    "platform_annotation_sha256": "..."
  },
  "features": [
    {
      "feature_id": "cg00000029",
      "direct_measurement": true,
      "coordinate": {
        "chrom": "chr16",
        "start": 53434200,
        "end": 53434201,
        "strand": "."
      },
      "response_by_group": [
        {"group_id": "g0", "mean": 0.80, "sd": 0.03, "n": 4},
        {"group_id": "g1", "mean": 0.78, "sd": 0.04, "n": 4},
        {"group_id": "g2", "mean": 0.70, "sd": 0.05, "n": 4},
        {"group_id": "g3", "mean": 0.52, "sd": 0.06, "n": 4}
      ],
      "region_to_gene_mappings": [
        {
          "mapping_type": "direct_promoter_overlap",
          "gene_id": "ENSG000001...",
          "gene_symbol": "GENE1",
          "confidence": "high",
          "provenance_source": "annotation_mcp"
        }
      ],
      "qualification_status": "accepted_for_pod",
      "warnings": []
    }
  ],
  "dataset_warnings": [
    {
      "code": "EPIW003_CYTOTOXICITY_CONTEXT_MISSING",
      "severity": "warning"
    }
  ],
  "annotation_trace": {
    "gene_snapshot": "ensembl_115_gencode_49",
    "pathway_snapshot": "reactome_release_xx",
    "ontology_snapshot": "go_release_yyyy_mm_dd"
  },
  "provenance": {
    "source_files": ["features.tsv", "design.tsv"],
    "upstream_analysis": {
      "pipeline_name": "external_preprocessing",
      "pipeline_version": "1.2.3"
    }
  }
}
```

Bioactivity-PoD can safely trust the following invariants:

- response values are numeric,
- dose groups are explicit and ordered,
- replicate counts are explicit,
- coordinate-bearing features have a declared genome build,
- original coordinate system and transformed coordinate system are both preserved,
- region-to-gene mappings are typed and provenance-labelled,
- warnings and exclusions have already been computed,
- target-gene/pathway claims derived only from `nearest_gene` are not machine-actionable evidence,
- persistence, heritability, or transgenerational claims are not encoded unless explicitly supported.

### Alignment with reporting frameworks

The documentation and QC-report structure should intentionally echo the OECD Omics Reporting Framework: study metadata, assay metadata, processing/provenance, QC, interpretation boundaries, and application-specific conclusions. That will make the service more legible to regulators and easier to connect to future reporting templates and evidence registries. citeturn23search0turn23search1turn23search16

## Benchmark suite, CI/CD, and documentation

### Initial benchmark cases

Day one needs **small, frozen, deterministic fixtures**. Public-data realism can come after the synthetic core is stable.

|Benchmark case|Fixture type|Expected result|Acceptance criteria|
|:--|:--|:--|:--|
|Valid methylation beta-value table|Synthetic wide matrix + design TSV|`accepted_for_pod`|All schemas validate; no errors; handoff packet valid|
|Valid DMR table|Synthetic BED-like summary table with hg38 build|`accepted_with_warnings` or `accepted_for_pod` depending on design richness|Coordinates normalised correctly; mapping provenance preserved|
|Missing genome build|Synthetic DMR table|`excluded_missing_genome_build`|Hard error emitted; no packet export|
|Invalid coordinate format|Synthetic region table with malformed intervals|`excluded_invalid_coordinates`|Line-specific error locations emitted|
|Nearest-gene-only mapping warning|Synthetic ATAC/DMR region near multiple genes|`review_required` or `exploratory_only` for pathway use|Nearest-gene label present but pathway rollup suppressed|
|Ambiguous gene mapping|Synthetic region with many plausible targets|`excluded_mapping_ambiguous` for target-based use|Feature may persist as coordinate-only evidence|
|Missing cell-composition context|Synthetic mixed-cell methylation matrix|`accepted_with_warnings`|Warning propagated into QC report and handoff|
|Missing cytotoxicity context|Synthetic injury-prone design with no viability data|`accepted_with_warnings`|Warning propagated; no silent assumption|
|Insufficient replicates|Matrix with one treated replicate|`excluded_insufficient_design`|Hard exclusion|
|High missingness|Matrix with >20% feature missingness|`excluded_high_missingness`|Threshold logic deterministic and documented|
|Transgenerational claim forbidden|Fixture includes unsupported narrative metadata|Warning/error stripping unsupported claim|Packet retains data, removes overclaim from machine-interpretable layer|
|Bioactivity-PoD handoff schema validation|Golden JSON packet|Pass/fail against schema snapshot|Consumer-compatible contract guaranteed|

These should all be represented by **golden expected outputs** in `benchmarks/expected/`, so that release branches can diff not only pass/fail status but the exact warning/error payloads.

### CI/CD and release workflow

Use entity["company","GitHub","developer platform"] Actions as the default CI/CD surface. GitHub Actions workflows are YAML-defined, support event triggers such as push and pull request, and expose matrix contexts for multi-environment testing. That is enough for a disciplined scientific release process without adding unnecessary platform complexity. citeturn19search3turn19search5turn19search7turn19search9turn19search11

Recommended workflows:

- **`ci.yml`**: lint, import sorting, type checking, unit tests.
- **`schemas.yml`**: regenerate JSON Schemas from Pydantic and fail if committed snapshots differ unexpectedly.
- **`benchmarks.yml`**: run synthetic fixture suite and golden-output comparisons.
- **`handoff-validation.yml`**: validate example handoff packets against current Bioactivity-PoD schema.
- **`docker.yml`**: build container image.
- **`release-readiness.yml`**: aggregate benchmark pass status, schema stability, docs presence, manifest validity, and handoff compatibility.

Recommended v0.1 release gates:

1. 100% pass on benchmark suite.  
2. Zero schema drift without an intentional schema-version bump.  
3. Zero golden-output drift without a reviewed changelog entry.  
4. Handoff packet validation passes against Bioactivity-PoD consumer schemas.  
5. Documentation pages for scope, non-goals, coordinates, region mapping, confounding, and interpretation limits are present.  
6. `toxmcp.manifest.yaml` validates.  
7. Docker image builds and starts in stdio mode.

### Documentation set

The minimum v0.1 documentation set should include:

- `README.md`
- scientific scope
- non-goals
- input format guide
- genome build and coordinate guide
- region-to-gene mapping guide
- cell-composition confounding guide
- cytotoxicity context guide
- epigenomic interpretation limits
- Bioactivity-PoD handoff guide
- examples
- benchmark report
- validation statement

Several of these are not “nice to have”; they are part of the product. For regulator-facing infrastructure, the explanation of what the service **refuses to infer** is as important as the explanation of what it computes.

## Roadmap, task breakdown, and open questions

### Taskmaster-ready v0.1 work packages

A clean v0.1 backlog can be created from these twelve work packages.

#### Schema and contracts
- Implement Pydantic contracts for dataset metadata, design, coordinates, feature classes, qualification results, QC report, and handoff packet.
- Add schema export and schema version archiving.
- Add semantic-versioned contract tests.

#### Ingestion
- Build generic CSV/TSV reader with dialect detection.
- Implement wide-to-long canonicalisation.
- Implement input-type detection and explicit format selection override.
- Add column-level validators and row-level provenance capture.

#### Coordinate validation
- Implement coordinate-system declaration and conversion.
- Add genome-build allowlist and chrom validation.
- Add per-row coordinate error reporting.

#### Feature type classification
- Implement deterministic classification rules:
  - `cpg_methylation_feature`
  - `dmr_feature`
  - `gene_linked_epigenomic_feature`
  - `summary_feature_response`
- Reserve ATAC/ChIP classes behind feature flags.

#### Region-to-gene mapping
- Implement mapping object types and suppression rules.
- Integrate Annotation/Ontology MCP.
- Block pathway rollup from `nearest_gene` in automated mode.

#### Cell-composition context model
- Implement rule-based context ingestion and classification.
- Support measured fractions or externally estimated fractions as payloads.
- Add warnings for missing context and likely composition shift.

#### Cytotoxicity context model
- Implement viability/stress payload ingestion.
- Add deterministic status classifier and downgrade rules.
- Encode “missing context” vs “dominant confounding” separately.

#### Feature qualification
- Implement qualification policy engine with thresholds, reasons, and review flags.
- Make thresholds versioned and configurable.
- Emit both feature-level and dataset-level decisions.

#### Handoff packet
- Build `QualifiedBioactivityFeatureResponse` packet generator.
- Add handoff validator against committed consumer schema.
- Add golden packet fixtures.

#### MCP tools
- Implement v0.1 tool set in FastMCP.
- Ensure every tool has a Pydantic input and output model.
- Ensure tool outputs are serialisable, schema-stable, and benchmarked.

#### CLI
- Mirror the MCP tools with Typer subcommands.
- Add `--json` and `--report` outputs.
- Add dry-run validation mode.

#### Benchmarks, docs, CI
- Create synthetic fixtures and expected outputs.
- Write validation statement and interpretation-limits doc.
- Add GitHub Actions workflows and release-readiness report.

### v0.2 roadmap

v0.2 should broaden **processed-feature coverage**, not move into raw-data reconstruction.

Recommended v0.2 additions:

- Direct support for processed ATAC-seq peak accessibility tables.
- Direct support for processed histone-mark region tables.
- Direct support for miRNA and selected ncRNA expression tables, with a strict separation between measured feature IDs and inferred targets.
- An **IDAT/array annotation adapter** only if it remains read-only and metadata/probe-annotation-focused. It may extract manifest context or sample sheet metadata from upstream-preprocessed outputs, but should not perform IDAT normalisation.
- Read-only adapters to ENCODE processed analyses, BioStudies/ArrayExpress processed studies, and selected GEO processed tables.
- Optional bioframe→PyRanges acceleration layer for large interval joins.
- First realism benchmarks built from frozen public processed datasets.
- Optional adapter to ChIP-Atlas rather than mirroring its catalogue, since it already exposes HTTP and MCP interfaces. citeturn38view0turn37view3turn37view2

### v1.0 roadmap

v1.0 should focus on **maturity and interoperability**, not on collapsing module boundaries.

Recommended v1.0 additions:

- Stronger enhancer–promoter mapping integration through Annotation/Ontology MCP, with provenance-aware support for database-backed or interaction-backed links.
- Explicit single-cell ATAC pseudobulk handoff support, still with bulk-like qualification rules after pseudobulk creation upstream.
- Multiomics Summary MCP integration via cross-modal packet registry, not by embedding transcriptomics/proteomics logic into Epigenomics MCP.
- Optional Streamable HTTP transport with origin validation and authentication.
- Richer public benchmark suite:
  - batch/platform provenance cases,
  - multi-build/multi-species rejection cases,
  - region-mapping ambiguity stress tests,
  - mixed-cell and overt-cytotoxicity edge cases.
- Signed schema snapshots, signed golden benchmark manifests, and release attestation.
- Optional external pipeline adapters for standardised upstream outputs—but still not bundled raw FASTQ/IDAT, bisulfite alignment, or peak calling as the default service path. citeturn26view3turn23search0

### Open questions and limitations

A few design decisions still need explicit governance before implementation is locked:

- **Promoter window definition**: choose a single default promoter window policy and version it, because promoter overlap is only reproducible if the window definition is fixed.
- **Borderline design thresholds**: decide whether `n=2` biological replicates in all groups should ever be `accepted_with_warnings` or always `review_required`.
- **Public-data licensing policy**: decide whether any non-CC0/non-commercial dataset snapshots will ever be redistributed inside benchmark fixtures, or only referenced externally.
- **Consumer schema freeze**: the Bioactivity-PoD handoff contract should be frozen early, because otherwise qualification logic will drift.
- **Local snapshot governance**: decide whether build/chromsize/gene/pathway snapshots are versioned per Epigenomics MCP release or centrally governed by Annotation/Ontology MCP.

The implementation direction itself is not ambiguous, however: **v0.1 should be a strict, auditable, processed-feature qualification MCP with typed warnings, hard exclusions, frozen reference snapshots, and a narrow trusted handoff to Bioactivity-PoD.** That is the design most likely to remain scientifically defensible, maintainable, and regulator-readable as the ToxMCP ecosystem grows.