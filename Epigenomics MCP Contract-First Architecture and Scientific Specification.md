# Epigenomics MCP Contract-First Architecture and Scientific Specification

|Attribute|Description|
|--:|:--|
|Domain > Expert|Computational Toxicology and Bioinformatics > Epigenomics MCP / NGRA Systems Architect|
|Keywords|epigenomics, JSON Schema, provenance, genome build, region-to-gene mapping, confounding|
|Goal|Produce an implementation-ready PRD and contract-first specification for a regulator-facing, auditable Epigenomics MCP at V=5 detail|
|Assumptions|The MCP is part of ToxMCP; upstream workflows can produce processed epigenomic feature tables; Bioactivity-PoD MCP performs dose-response modelling; Annotation/Ontology MCP remains the authority for controlled vocabularies and identifier normalisation|
|Methodology|Decision-grade architecture analysis, standards review, fail-closed contract design, schema-first modelling, explicit separation of measured features from inferred mappings, warning/error taxonomies, and benchmark-oriented validation|

## Executive recommendation

Epigenomics MCP should be implemented as a **processed-feature evidence qualification service**, not as a universal raw epigenomics workbench. The right product identity is **architecture E: a hybrid processed-feature MCP with optional adapters**, operationalised in v0.1 as **architecture B: an epigenomic evidence qualification MCP**. In practice, that means the service ingests **processed feature tables plus design and provenance metadata**, validates coordinate/build/platform meaning, qualifies features for downstream quantitative use, and exports **QualifiedBioactivityFeatureResponse** packets to Bioactivity-PoD MCP. It should **not** own FASTQ/IDAT ingestion, alignment, methylation calling, peak calling, chromatin-state learning, target prediction, or BMD/PoD modelling. That boundary is scientifically stronger, far easier to validate, and more regulator-readable than a raw-data platform, because assay-specific QC is heterogeneous, ENCODE itself treats QC as multi-metric and context-dependent, and public archives require rich processed-data and metadata layers in addition to raw files. citeturn24view3turn25view0turn19view5turn19view6turn15search2

The single most important design rule is this: **Epigenomics MCP may qualify a measured epigenomic response, but it must never convert genomic proximity into causality.** Chromatin accessibility does not reliably predict nearby gene-expression change; enhancer-to-gene assignment by nearest gene is often inaccurate; histone-mark meaning is context-dependent; miRNA target prediction remains uncertain and non-canonical interactions are common. The MCP therefore has to preserve a hard distinction between **measured feature**, **mapped target**, and **interpretive roll-up**. citeturn36search2turn36search20turn36search21turn36search9turn10search15turn37search3turn37search6

The second design rule is that **coordinate semantics are first-class**. For peak-oriented inputs, coordinate system errors are an avoidable major source of silent failure because UCSC BED/narrowPeak/broadPeak conventions are 0-based, half-open, whereas many assay-derived tables and spreadsheet exports are 1-based. Illumina methylation manifests also embed build-specific annotation, and GENCODE/Ensembl releases are assembly-coupled. If build, coordinate system, or platform annotation version is absent or inconsistent, the MCP should fail closed. citeturn17view1turn16search19turn16search5turn19view7turn6search8turn6search3

The third design rule is that **confounding must be modelled explicitly**. DNA methylation is highly cell-type-specific, and bulk measurements can be confounded by shifts in cellular composition; toxicology datasets add cytotoxicity, stress signalling, differentiation drift, and time-dependence as additional interpretation hazards. Those should not be handled as prose-only caveats. They should be first-class machine-readable warning and review objects that directly govern whether downstream Bioactivity-PoD use is allowed. citeturn10search0turn10search4turn21search21turn11search9turn33search15

### Architecture decision

|Option|Scientific robustness|Auditability|Validation burden|Deployment complexity|Fit with ToxMCP|Decision|
|---|---|---:|---:|---:|---|---|
|A. Lightweight epigenomic table normaliser|Too weak; normalises syntax but not evidentiary meaning|High|Low|Low|Insufficient by itself|Use only as an internal ingest layer|
|B. Epigenomic evidence qualification MCP|Strong for v0.1 because it owns evidence quality, provenance, confounders, and handoff readiness|Very high|Moderate|Moderate|Excellent|**Core v0.1 recommendation**|
|C. Full raw epigenomics processing MCP|Scientifically broad but validation-heavy and assay-fragmented; poor regulator readability for an early platform|Lower than expected because pipeline heterogeneity explodes provenance surface|Very high|High|Poor early fit|Do not pursue as core architecture|
|D. Adapter gateway to external pipelines|Useful for interoperability but too passive if used alone|Moderate|Moderate|Moderate|Good adjunct|Keep as optional extension only|
|E. Hybrid processed-feature MCP with optional adapters|Best long-term balance: processed-feature core plus validated adapters for selected upstream outputs|Very high|Moderate|Moderate|Excellent|**v0.2/v1.0 target architecture**|

## Product scope, module boundaries, and non-goals

### Exact responsibilities of Epigenomics MCP

Epigenomics MCP should own the following responsibilities:

- ingestion of **processed epigenomic feature tables**
- ingestion of **experimental design**, **dose metadata**, **sample metadata**, and **upstream processing provenance**
- validation of **replicate / control / dose-group structure**
- validation of **species**, **genome build**, **coordinate system**, and **platform annotation version**
- classification of feature rows into explicit feature classes
- preservation of **measured coordinates** and **measured identifiers**
- cautious **region-to-gene** and **feature-to-pathway** mapping via Annotation/Ontology MCP
- profiling of **missingness**, **variance**, **replicate consistency**, and **design adequacy**
- modelling of **cell-composition**, **cytotoxicity**, **stress**, **differentiation**, and **timepoint** context
- assignment of **qualification status** for downstream Bioactivity-PoD use
- generation of **QC / review packets**
- export of **Bioactivity-PoD-compatible handoff packets**

This recommendation aligns with public archive expectations that processed data, feature annotation, sample design, and protocol metadata are essential for reuse, while ENCODE-style metadata organisation demonstrates that assay, biosample, file, and computational analysis provenance are distinct typed objects rather than a single flat table. citeturn19view5turn19view6turn25view0turn15search2

### Explicit non-responsibilities

Epigenomics MCP should **not** own, in v0.1, and should remain cautious even later about:

- raw FASTQ processing
- raw IDAT preprocessing
- bisulphite alignment
- methylation calling from raw reads
- peak calling
- chromatin-state modelling
- enhancer-gene causal inference
- miRNA target prediction as a primary algorithm
- PoD/BMD modelling
- regulatory conclusion generation
- persistence, heritability, or transgenerational-effect claims unless directly supported by study design

This is not only a product simplification; it is a scientific control. ENCODE pipelines and archive standards show that upstream raw-data processing is assay-specific and QC-rich, while toxicoepigenetics remains under-integrated into risk assessment precisely because interpretation layers are still easy to overclaim. citeturn24view1turn24view2turn24view0turn40search22turn11search9

### Module boundary map

|Other MCP|What it owns|What Epigenomics MCP owns instead|Exchanged object|
|---|---|---|---|
|Transcriptomics MCP|gene/transcript abundance, DE, module/pathway responses from RNA assays|epigenomic features whose measured substrate is methylation, chromatin accessibility, histone occupancy, or explicitly curated regulatory ncRNA evidence|`GeneLinkedEvidenceReference`, `JointEvidenceLink`|
|Proteomics MCP|protein abundance, PTMs, peptide/protein QC|none beyond cross-link references|`OrthogonalEvidencePointer`|
|Metabolomics MCP|metabolite features and pathway chemistry|none beyond cross-link references|`OrthogonalEvidencePointer`|
|Phenotypic / Imaging Bioactivity MCP|morphology and cell-state phenotypes|none beyond confounder cross-talk|`ContextEvidencePointer`|
|Bioactivity-PoD MCP|dose-response fitting, BMD/BMC, PoD candidate selection|qualification of epigenomic feature-response evidence before modelling|`QualifiedBioactivityFeatureResponse`, `BioactivityPoDHandoffPacket`|
|Annotation/Ontology MCP|authoritative identifier mapping and ontology normalisation|retention of raw feature semantics and requests for mapping, not ontology ownership|`AnnotationRequest`, `AnnotationTrace`|
|Evidence Registry MCP|study registry, accessioning, evidence lineage|epigenomic packet generation|`EvidenceRecordRef`|
|AOP MCP|AOP elements, key events, network curation|cautious tagged links only; no causal KE assignment from proximity alone|`AOPContextLink`|
|IVIVE/BER MCP|kinetic extrapolation and exposure conversion|none directly; only via Bioactivity-PoD|`PoDReference`|
|WoE/NGRA Synthesis MCP|cross-stream integration and decision narrative|structured caveats, warnings, qualification status, and QC evidence|`EvidenceSummaryBlock`|
|Benchmark/Validation MCP|gold fixtures, reference outputs, acceptance tests|emission of deterministic QC and handoff packets to be benchmarked|`BenchmarkFixture`, `ExpectedPacket`|
|Single-Cell / Spatial Omics MCP|cell-resolved and spatially resolved upstream analysis|later acceptance of pseudobulk products only, with aggregation provenance|`PseudobulkEpigenomicFeatureTable`|
|Multiomics Summary MCP|cross-omics aggregation|preservation of epigenomic evidence granularity until post-qualification|`QualifiedEpigenomicsSummary`|

### Epigenomic input source matrix

The right v0.1 stance is to support only inputs that already carry **stable feature semantics** and can be validated with explicit build/platform provenance.

|Input type|What it contains|v0.1 stance|Required metadata|Primary ambiguity / failure modes|
|---|---|---|---|---|
|DNA methylation array beta-value tables|Per-probe methylation ratios between 0 and 1|**Direct support**|array type, manifest version, genome build, probe ID, normalisation method, sample map|probe annotation drift, cross-reactive probes, SNP-affected probes, hidden cell-mixture effects citeturn38search1turn16search19turn10search5turn10search17|
|DNA methylation array M-value tables|Log-ratio methylation values better suited to differential statistics|**Direct support** if response metric declared|same as beta tables plus transform declaration|loss of interpretability if transformed metric is not declared alongside effect scale citeturn38search2turn38search20|
|Differentially methylated CpG tables|Per-CpG effect size, significance, contrast|**Direct support**|probe/CpG ID, build, contrast, effect metric, adjusted P, sample counts|can lose sample-level dose information; unsuitable for PoD handoff unless joined back to numeric response tables|
|Differentially methylated region tables|Aggregated regional methylation effects with coordinates|**Direct support**|chrom, start, end, build, region-calling method, constituent CpGs or coverage summary|region-calling method differences; ambiguous gene assignment; build mismatch|
|Processed bisulphite-seq methylation tables|Per-site or per-region methylation percentages with coverage|**Direct support**|build, coordinate system, methylation context, coverage, strand handling, caller provenance|low coverage, sparse matrices, CpG versus CHH/CHG mixing without declaration citeturn24view0|
|ATAC-seq peak accessibility tables|Peak coordinates plus accessibility signal and significance|**Direct support**|build, coordinate system, peak format, peak caller provenance, signal metric, replicate structure|0-based/1-based errors; accessibility interpreted as expression; nearest-gene overclaim citeturn24view1turn17view1turn36search2turn36search21|
|ChIP-seq / histone mark peak tables|Peak regions for histone marks or chromatin-associated proteins|**Direct support**|mark, antibody metadata, build, coordinate system, peak format, control provenance|mark-specific biological meaning differs; broadPeak/narrowPeak confusion; antibody specificity issues citeturn24view2turn17view1turn10search15|
|CUT&Tag / CUT&RUN processed peak tables|Peak-like outputs analogous to ChIP|**Adapter support**|same as ChIP plus assay method and processing pipeline|cross-method comparability and peak-calibration differences; use same downstream packet only if semantics are explicit|
|miRNA expression tables|Measured mature miRNA abundance changes|**Direct support** as measured features only|miRNA naming authority/version, assay platform, normalisation, sample map|identifier versioning, target overclaim, non-canonical targeting uncertainty citeturn27search3turn31view0turn37search3turn37search6|
|long non-coding RNA expression tables|Measured lncRNA abundance changes|**Adapter support** and shared boundary with Transcriptomics MCP|reference annotation release, gene model source, stable IDs|this is usually transcript abundance, not direct chromatin evidence; interpretation has to stay modest|
|chromatin state segmentation outputs|Model-derived labels such as promoter/enhancer/repressed states|**Deferred** except as annotation-only context|model name, training marks, state dictionary, source release|not directly measured; highly model-dependent; inappropriate as a primary PoD feature in v0.1 citeturn39search0turn39search14turn39search17|
|genomic-region feature tables|Generic coordinate-bearing epigenomic regions with scores|**Direct support** if semantics are declared|feature type, score meaning, build, coordinate system|score semantics often underspecified; must not be silently coerced into “peak” or “enhancer”|
|gene-linked epigenomic feature tables|Features already mapped to genes upstream|**Direct support** only if mapping provenance is explicit|original coordinates or resolvable stable IDs, mapping method, annotation release|loss of original coordinates; impossible audit of region-to-gene assumptions|
|single-cell ATAC-seq pseudobulk outputs|Aggregated cell-group accessibility profiles|**Deferred to v0.2**|aggregation unit, donor/sample mapping, cell-type labels, pseudobulk method|single-cell DA practice is still evolving; pseudobulk assumptions and cell aggregation need a separate contract citeturn13search0turn13search15|

### Recommended v0.1 non-goals

For v0.1, the following should be explicit, documented non-goals in the PRD:

- raw FASTQ processing
- bisulphite alignment
- IDAT preprocessing
- peak calling
- chromatin-state modelling
- miRNA target prediction as a primary function
- causal epigenetic inference
- persistence claims without repeated-timepoint support
- transgenerational / heritable-effect claims without germline-generational design
- PoD / BMD modelling
- regulatory interpretation

## Contract-first MCP specification

### Normative contract invariants

Every object emitted by Epigenomics MCP should satisfy these platform rules:

1. **Every coordinate-bearing feature carries `genome_build`, `coordinate_system`, `chromosome`, `start`, `end`.**
2. **Every array-derived methylation feature carries `platform_annotation_provenance`.**
3. **Every gene or pathway interpretation carries `region_to_gene_mapping_provenance`.**
4. **Measured features and inferred target mappings are stored in different fields and never collapsed.**
5. **All handoff-eligible features carry a `qualification_status` plus machine-readable warnings.**
6. **All packets preserve sample/dose/replicate structure and do not only store summary contrasts.**
7. **Cell-composition and cytotoxicity context are required either as data or as explicit missing-context warnings.**
8. **No packet may claim persistence, heritability, or causality unless these are externally evidenced in study design and represented as separate evidence types.**

These invariants are justified by the structure of archive metadata standards, by assay-specific QC heterogeneity, and by the known interpretive limits of epigenomic mapping. citeturn15search2turn24view3turn36search21turn36search2

### Tool catalogue

|Tool|Purpose|Required input|Output|Warning / error behaviour|Must not do|
|---|---|---|---|---|---|
|`ingest_epigenomic_feature_table`|Register a processed feature matrix or long table|feature table, dataset metadata, assay family|`EpigenomicFeatureMatrix`|fail if feature semantics absent|must not normalise raw reads or call peaks|
|`ingest_epigenomics_design_table`|Register sample/design metadata|sample metadata, dose groups, controls, replicates|`EpigenomicsExperimentalDesign`|warn on incomplete fields; fail on duplicate sample IDs|must not infer untreated controls|
|`validate_epigenomics_experiment_design`|Check dose/replicate/control adequacy|design object|`DesignValidationReport`|fail closed on no control or incoherent replicate map|must not fit dose-response models|
|`validate_genomic_coordinate_system`|Validate build and coordinate conventions|feature matrix|`CoordinateValidationReport`|fail on missing build or mixed coordinate systems|must not liftover silently|
|`classify_epigenomic_feature_type`|Assign explicit feature classes|feature matrix, assay metadata|typed feature objects|warn when mixed feature classes detected|must not relabel ambiguous rows without flags|
|`map_regions_to_genes`|Create cautious region-to-gene links|feature object, annotation request|`RegionToGeneMapping[]`|warn or block on nearest-gene-only mappings|must not claim causal target assignment|
|`map_epigenomic_features_to_pathways`|Roll up to pathways when justified|features + mapping provenance|`EpigenomicsPathwayCoverage`|block pathway roll-up if mapping provenance is insufficient|must not use nearest gene as causal evidence|
|`profile_epigenomics_missingness`|Quantify NA/sparsity and feature dropout|numeric matrix|`MissingnessProfile`|exclude on configured high missingness|must not impute silently|
|`profile_epigenomics_variance`|Assess variance and replicate stability|feature matrix + design|`VarianceProfile`|warn on low dynamic range / unstable replicates|must not remove outliers without trace|
|`assess_cell_composition_context`|Attach cell-mixture interpretation context|sample metadata, optional deconvolution info|`CellCompositionContext`|emit missing-context or likely-confounding warnings|must not perform deconvolution from raw data in v0.1|
|`assess_cytotoxicity_context`|Attach viability/stress context|cytotoxicity metrics, morphology, stress markers|`CytotoxicityContext`|emit dominant-confounding exclusion when needed|must not derive cytotoxicity from epigenomic features alone|
|`qualify_epigenomic_features_for_pod`|Assign downstream eligibility status|typed features + QC contexts|`EpigenomicsFeatureQualification[]`|fail closed on inadequate design/build/provenance|must not derive PoDs|
|`create_epigenomics_feature_response_packet`|Build the normative packet|qualified features + contexts + provenance|`EpigenomicsFeatureResponsePacket`|fail if qualification absent|must not collapse mapped and measured features|
|`generate_epigenomics_qc_report`|Emit review-facing QC packet|all validation objects|`EpigenomicsQCReport`|always include warnings and review flags|must not rewrite primary data|
|`validate_epigenomics_handoff_packet`|Check Bioactivity-PoD compatibility|feature-response packet|`HandoffValidationReport`|fail on schema or semantic incompatibility|must not auto-fix disallowed packets|
|`export_to_bioactivity_pod`|Create handoff object|validated packet|`BioactivityPoDHandoffPacket`|block export for excluded or exploratory-only packets|must not call Bioactivity-PoD models directly|

### Example tool call

```json
{
  "tool": "ingest_epigenomic_feature_table",
  "input": {
    "dataset_metadata_ref": "epi_ds_001",
    "design_ref": "epi_design_001",
    "feature_table_format": "long",
    "assay_family": "dna_methylation_array",
    "feature_value_semantics": "beta_value",
    "features": [
      {
        "feature_id": "cg00000029",
        "sample_id": "S01",
        "value": 0.8123
      }
    ],
    "platform_annotation_provenance": {
      "platform_vendor": "Illumina",
      "platform_name": "Infinium MethylationEPIC",
      "annotation_release": "ilm10b4.hg19",
      "manifest_identifier": "MethylationEPIC_v1"
    }
  }
}
```

```json
{
  "tool": "qualify_epigenomic_features_for_pod",
  "input": {
    "feature_matrix_ref": "epi_matrix_001",
    "coordinate_validation_ref": "coord_val_001",
    "missingness_profile_ref": "miss_001",
    "variance_profile_ref": "var_001",
    "cell_composition_context_ref": "cellctx_001",
    "cytotoxicity_context_ref": "cytoctx_001",
    "qualification_policy": {
      "minimum_total_dose_groups": 3,
      "minimum_biological_replicates_per_group": 2,
      "max_feature_missingness_fraction": 0.2
    }
  }
}
```

### Schema conventions

All schemas should share a common envelope:

- `schema_name`
- `schema_version`
- `object_id`
- `object_version`
- `created_at`
- `created_by`
- `source_mcp`
- `provenance`
- `confidence`
- `review_flags`
- `extensions`

Every schema should be **immutable once emitted**; any amendment creates a new `object_version`.

### Core schema catalogue

#### Study, design, and context objects

|Schema|Required fields|Key enums / notes|
|---|---|---|
|`EpigenomicsDatasetMetadata`|`dataset_id`, `title`, `species`, `assay_family`, `source_repository`, `source_accession`, `upstream_processing_level`, `upstream_provenance_ref`|`assay_family`: `dna_methylation_array`, `bisulfite_seq`, `atac_seq`, `chip_seq_histone`, `chip_seq_tf`, `cutandtag`, `cutandrun`, `mirna_expression`, `ncrna_expression`, `chromatin_state`, `generic_region_feature`|
|`EpigenomicsExperimentalDesign`|`design_id`, `study_type`, `control_definition`, `dose_groups`, `timepoints`, `replicate_policy`, `sample_metadata_refs`|`study_type`: `dose_response`, `time_series`, `factorial`, `case_control`, `benchmark_fixture`|
|`EpigenomicsSampleMetadata`|`sample_id`, `biosample_type`, `biological_system`, `treatment`, `dose_group_id`, `timepoint`, `replicate_type`, `batch_id`|`replicate_type`: `biological`, `technical`, `pooled`, `pseudobulk`|
|`DoseGroup`|`dose_group_id`, `dose_value`, `dose_unit`, `is_control`, `nominal_or_measured`|support `vehicle_control` and `untreated_control` flags|
|`CellCompositionContext`|`status`, `biosample_purity_declared`, `mixed_population`, `cell_type_context_source`|status model defined below|
|`CytotoxicityContext`|`status`, `assay_available`, `cytotoxicity_measures`, `stress_marker_evidence`, `timepoint_alignment`|status model defined below|

#### Coordinate, feature, mapping, and provenance objects

|Schema|Required fields|Key enums / notes|
|---|---|---|
|`GenomicCoordinate`|`genome_build`, `coordinate_system`, `chromosome`, `start`, `end`|`coordinate_system`: `zero_based_half_open`, `one_based_closed`|
|`GenomeBuild`|`species`, `assembly_name`, `assembly_alias`, `source_authority`|examples: `GRCh37/hg19`, `GRCh38/hg38`, `GRCm38/mm10`, `GRCm39/mm39`|
|`EpigenomicFeatureMatrix`|`feature_matrix_id`, `feature_class`, `value_type`, `samples`, `features`, `value_units`|`value_type` is mandatory and never inferred|
|`CpGMethylationFeature`|`feature_id`, `probe_or_site_id`, `measured_coordinate`, `measurement_semantics`|`measurement_semantics`: `beta_value`, `m_value`, `percent_methylation`, `delta_beta`, `delta_m`|
|`DifferentialMethylatedRegionFeature`|`feature_id`, `region_coordinate`, `effect_metric`, `supports_dose_response`|must preserve region caller provenance and constituent evidence summary|
|`ChromatinAccessibilityFeature`|`feature_id`, `region_coordinate`, `accessibility_metric`, `peak_format`|`peak_format`: `bed`, `narrowPeak`, `broadPeak`, `gappedPeak`, `other_declared`|
|`HistoneMarkFeature`|`feature_id`, `region_coordinate`, `mark_name`, `signal_metric`, `antibody_ref`|`mark_name` examples: `H3K27ac`, `H3K4me3`, `H3K27me3`, `H3K36me3`|
|`MiRNAFeature`|`feature_id`, `mirna_id`, `mirbase_version`, `measurement_semantics`|must separate measured miRNA from target mappings|
|`NcRNAFeature`|`feature_id`, `gene_or_transcript_id`, `annotation_release`, `measurement_semantics`|applies to lncRNA or related ncRNA features|
|`RegionToGeneMapping`|`mapping_id`, `mapping_type`, `input_feature_id`, `target_gene_id_or_null`, `mapping_confidence`, `mapping_provenance`|normative mapping model defined below|
|`EpigenomicAnnotationTrace`|`trace_id`, `annotation_requests`, `annotation_responses`, `release_versions`|used for fully auditable identifier normalisation|
|`PlatformAnnotationProvenance`|`platform_vendor`, `platform_name`, `annotation_release`, `manifest_identifier`, `original_measurement_space`|mandatory for array/probe features|
|`UpstreamEpigenomicsProvenance`|`pipeline_name`, `pipeline_version`, `software_components`, `parameters_digest`, `input_files`, `processing_level`|mandatory whenever upstream processing occurred|

#### Qualification, QC, and packet objects

|Schema|Required fields|Key enums / notes|
|---|---|---|
|`EpigenomicsFeatureQualification`|`feature_id`, `qualification_status`, `qualification_reasons`, `warning_refs`|status model defined below|
|`EpigenomicsPathwayCoverage`|`pathway_id`, `pathway_source`, `supporting_features`, `mapping_evidence_classes`, `coverage_confidence`|automatic only when mapping provenance is adequate|
|`EpigenomicsQCReport`|`report_id`, `design_validation`, `coordinate_validation`, `missingness_profile`, `variance_profile`, `confounding_summary`, `review_flags`|deterministic and benchmarkable|
|`EpigenomicsFeatureResponsePacket`|`packet_id`, `dataset_metadata_ref`, `design_ref`, `feature_payload`, `qualification_summary`, `qc_report_ref`, `provenance`|primary normative export from this MCP|
|`BioactivityPoDHandoffPacket`|`handoff_id`, `source_packet_ref`, `qualified_features`, `excluded_features`, `dose_response_ready_subset`, `mandatory_caveats`|must be accepted by a separate validator before export|
|`EpigenomicsWarning`|`warning_code`, `severity`, `scope`, `message`, `downstream_use_rule`|warning taxonomy below|
|`EpigenomicsError`|`error_code`, `severity`, `scope`, `message`, `remediation_hint`|fatal errors block packet creation|

### Critical JSON schema fragments

#### `GenomicCoordinate`

```json
{
  "$id": "https://schemas.toxmcp.org/epigenomics/GenomicCoordinate.json",
  "title": "GenomicCoordinate",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_name",
    "schema_version",
    "genome_build",
    "coordinate_system",
    "chromosome",
    "start",
    "end"
  ],
  "properties": {
    "schema_name": { "const": "GenomicCoordinate" },
    "schema_version": { "type": "string" },
    "genome_build": {
      "type": "object",
      "required": ["species", "assembly_name", "assembly_alias", "source_authority"],
      "properties": {
        "species": { "type": "string" },
        "assembly_name": { "type": "string" },
        "assembly_alias": { "type": "string" },
        "source_authority": { "enum": ["NCBI", "UCSC", "Ensembl", "DeclaredOther"] }
      }
    },
    "coordinate_system": {
      "enum": ["zero_based_half_open", "one_based_closed"]
    },
    "chromosome": { "type": "string" },
    "start": { "type": "integer", "minimum": 0 },
    "end": { "type": "integer", "minimum": 1 },
    "strand": { "enum": ["+", "-", ".", null] },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "review_flags": { "type": "array", "items": { "type": "string" } }
  }
}
```

#### `RegionToGeneMapping`

```json
{
  "$id": "https://schemas.toxmcp.org/epigenomics/RegionToGeneMapping.json",
  "title": "RegionToGeneMapping",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_name",
    "schema_version",
    "mapping_id",
    "input_feature_id",
    "mapping_type",
    "mapping_confidence",
    "mapping_provenance"
  ],
  "properties": {
    "schema_name": { "const": "RegionToGeneMapping" },
    "schema_version": { "type": "string" },
    "mapping_id": { "type": "string" },
    "input_feature_id": { "type": "string" },
    "mapping_type": {
      "enum": [
        "direct_promoter_overlap",
        "gene_body_overlap",
        "nearest_gene",
        "enhancer_target_from_database",
        "chromatin_interaction_supported",
        "inferred_target_gene",
        "unknown_target_gene"
      ]
    },
    "target_gene_id": { "type": ["string", "null"] },
    "target_gene_symbol": { "type": ["string", "null"] },
    "distance_to_tss_bp": { "type": ["integer", "null"] },
    "mapping_confidence": {
      "enum": ["high", "moderate", "low", "unknown"]
    },
    "pathway_rollup_allowed": { "type": "boolean" },
    "downstream_use_rule": {
      "enum": [
        "allow",
        "allow_with_warning",
        "review_required",
        "exploratory_only",
        "block"
      ]
    },
    "mapping_provenance": {
      "type": "object",
      "required": ["method", "annotation_release", "source_resource"],
      "properties": {
        "method": { "type": "string" },
        "annotation_release": { "type": "string" },
        "source_resource": { "type": "string" },
        "source_accession": { "type": ["string", "null"] },
        "biosample_context_match": {
          "enum": ["matched", "related", "generic", "unknown"]
        }
      }
    },
    "review_flags": { "type": "array", "items": { "type": "string" } }
  }
}
```

#### `EpigenomicsFeatureQualification`

```json
{
  "$id": "https://schemas.toxmcp.org/epigenomics/EpigenomicsFeatureQualification.json",
  "title": "EpigenomicsFeatureQualification",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_name",
    "schema_version",
    "feature_id",
    "qualification_status",
    "qualification_reasons"
  ],
  "properties": {
    "schema_name": { "const": "EpigenomicsFeatureQualification" },
    "schema_version": { "type": "string" },
    "feature_id": { "type": "string" },
    "qualification_status": {
      "enum": [
        "accepted_for_pod",
        "accepted_with_warnings",
        "review_required",
        "exploratory_only",
        "excluded_insufficient_design",
        "excluded_invalid_coordinates",
        "excluded_missing_genome_build",
        "excluded_high_missingness",
        "excluded_mapping_ambiguous",
        "excluded_non_numeric_response",
        "excluded_confounding_dominant"
      ]
    },
    "qualification_reasons": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1
    },
    "warning_refs": {
      "type": "array",
      "items": { "type": "string" }
    },
    "human_review_required": { "type": "boolean" }
  }
}
```

#### `EpigenomicsWarning`

```json
{
  "$id": "https://schemas.toxmcp.org/epigenomics/EpigenomicsWarning.json",
  "title": "EpigenomicsWarning",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_name",
    "schema_version",
    "warning_code",
    "severity",
    "scope",
    "message",
    "downstream_use_rule"
  ],
  "properties": {
    "schema_name": { "const": "EpigenomicsWarning" },
    "schema_version": { "type": "string" },
    "warning_code": { "type": "string" },
    "severity": { "enum": ["info", "caution", "major", "critical"] },
    "scope": { "enum": ["dataset", "sample", "feature", "mapping", "handoff"] },
    "message": { "type": "string" },
    "downstream_use_rule": {
      "enum": ["allow", "allow_with_warning", "review_required", "exploratory_only", "block"]
    },
    "evidence_refs": { "type": "array", "items": { "type": "string" } }
  }
}
```

#### `EpigenomicsFeatureResponsePacket`

```json
{
  "$id": "https://schemas.toxmcp.org/epigenomics/EpigenomicsFeatureResponsePacket.json",
  "title": "EpigenomicsFeatureResponsePacket",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_name",
    "schema_version",
    "packet_id",
    "dataset_metadata_ref",
    "design_ref",
    "feature_payload",
    "qualification_summary",
    "qc_report_ref",
    "provenance"
  ],
  "properties": {
    "schema_name": { "const": "EpigenomicsFeatureResponsePacket" },
    "schema_version": { "type": "string" },
    "packet_id": { "type": "string" },
    "dataset_metadata_ref": { "type": "string" },
    "design_ref": { "type": "string" },
    "feature_payload": {
      "type": "array",
      "items": { "type": "object" }
    },
    "qualification_summary": {
      "type": "object",
      "required": ["accepted_count", "warning_count", "excluded_count"],
      "properties": {
        "accepted_count": { "type": "integer", "minimum": 0 },
        "warning_count": { "type": "integer", "minimum": 0 },
        "excluded_count": { "type": "integer", "minimum": 0 }
      }
    },
    "qc_report_ref": { "type": "string" },
    "provenance": { "type": "object" },
    "review_flags": { "type": "array", "items": { "type": "string" } }
  }
}
```

## Region-to-gene mapping, qualification logic, and confounding model

### Formal region-to-gene mapping model

Because enhancer assignment is often not equivalent to the nearest gene and many chromatin changes do not track nearby transcription, the mapping layer must be formal and rule-governed, not free text. citeturn36search21turn36search9turn36search2

|Mapping type|Definition|Default confidence|Downstream rule|Pathway roll-up rule|Review requirement|
|---|---|---|---|---|---|
|`direct_promoter_overlap`|Region overlaps configured promoter window around a reference TSS on a declared build and annotation release|High|Allow|Allow|No, unless multiple promoters collide|
|`gene_body_overlap`|Region overlaps gene body of declared transcript/gene model|Moderate|Allow with warning|Allow with warning|Yes if interpretation claims regulation direction|
|`nearest_gene`|Closest TSS assigned with exact distance recorded|Low|Allow with warning for context only|Exploratory only by default|Yes|
|`enhancer_target_from_database`|Target assignment imported from curated external resource with release and biosample-context match|Moderate to high|Allow with warning|Allow if resource and context declared|Yes if biosample mismatch|
|`chromatin_interaction_supported`|Target assignment supported by explicit chromatin-interaction evidence|High|Allow|Allow|No if interaction source is declared and build-matched|
|`inferred_target_gene`|Algorithmic or user-supplied inferred target unsupported by curated database or interaction evidence|Low|Exploratory only|Block automatic pathway roll-up|Yes|
|`unknown_target_gene`|No reliable target assignment available|Unknown|Allow measured region only|Block|No, unless user tries gene/pathway interpretation|

#### JSON example

```json
{
  "mapping_id": "map_00021",
  "input_feature_id": "peak_chr8_128736_129108",
  "mapping_type": "nearest_gene",
  "target_gene_id": "HGNC:1097",
  "target_gene_symbol": "MYC",
  "distance_to_tss_bp": 147233,
  "mapping_confidence": "low",
  "pathway_rollup_allowed": false,
  "downstream_use_rule": "exploratory_only",
  "mapping_provenance": {
    "method": "nearest_tss",
    "annotation_release": "GENCODE_48_GRCh38",
    "source_resource": "internal_mapping_request",
    "biosample_context_match": "generic"
  },
  "review_flags": ["nearest_gene_only", "distal_mapping_uncertain"]
}
```

### Cell-composition and confounding status model

Bulk epigenomic measurements can be driven by biology of interest, by shifting proportions of constituent cells, or by overt toxicity and differentiation drift. DNA methylation atlases and deconvolution studies show that methylation is highly cell-type-specific; in toxicology settings, concentration and time also materially change observed omics responses. citeturn10search0turn10search4turn21search21turn33search15

|Status|Rule of assignment|Effect on downstream use|
|---|---|---|
|`no_context_available`|No cell-composition or cytotoxicity evidence provided|Allow with warning only|
|`unlikely_confounding`|Purified or stable cell system; no viability or composition alarm|Allow|
|`possible_confounding`|Mixed population or incomplete viability/context data|Allow with warning|
|`likely_confounding`|Independent evidence of changing proportions, stress-state drift, or substantial viability decline|Review required|
|`dominant_confounding`|Confounder likely dominates feature signal|Block handoff|
|`review_required`|Conflicting context evidence or unresolved ambiguity|Review required|

### Warning logic

The MCP should emit, at minimum, the following deterministic warnings:

|Warning code|Trigger|Consequence|Default downstream rule|
|---|---|---|---|
|`cell_composition_context_missing`|No purity/deconvolution/cell-mixture metadata|bulk-signal interpretation weakened|`allow_with_warning`|
|`mixed_cell_population`|bulk mixed tissue or mixed culture declared|feature may reflect composition shifts|`allow_with_warning`|
|`cell_type_proportion_shift_possible`|design or orthogonal data suggest composition change|dose-response may be indirect|`review_required`|
|`cytotoxicity_context_missing`|no viability/stress data near exposure window|cannot separate adaptive from failing-cell responses|`allow_with_warning`|
|`cytotoxicity_confounding_possible`|viability or morphology concern present|features may track injury rather than pathway perturbation|`review_required`|
|`differentiation_state_shift_possible`|differentiation status unstable or treatment changes maturity state|baseline and response non-comparable|`review_required`|
|`stress_response_confounding_possible`|stress markers dominate same doses/timepoints|mechanistic specificity reduced|`review_required`|
|`timepoint_persistence_not_assessed`|single timepoint or no recovery sampling|cannot claim persistence or reversibility|`allow_with_warning`|

### Failure-mode and guardrail matrix

The table below is the recommended normative policy layer. It is grounded in known EWAS confounders, array artefacts, chromatin interpretation limits, and epigenetic inheritance controversies. citeturn10search5turn10search17turn36search21turn36search2turn10search15turn37search6turn35search3turn35search12

|Failure mode|Scientific consequence|Guardrail|Machine-readable code|Bioactivity-PoD use|
|---|---|---|---|---|
|cell-composition confounding|false mechanistic attribution in bulk tissue|require cell context object or emit strong warning|`EPI_CONF_CELL_COMPOSITION`|allow with warning / review|
|differentiation-state confounding|baseline shifts masquerade as response|store culture maturity / passage / differentiation metadata|`EPI_CONF_DIFFERENTIATION`|review|
|cytotoxicity / stress confounding|dominant injury signals obscure specific biology|require time-matched viability/stress context|`EPI_CONF_CYTOTOXICITY`|review or block|
|batch effects|spurious dose or group patterns|require batch metadata and batch-aware QC summary|`EPI_BATCH_EFFECT_POSSIBLE`|review|
|genome-build mismatch|misplaced features and false mappings|hard fail unless reconciled upstream|`EPI_COORD_BUILD_MISMATCH`|block|
|coordinate-system mismatch|silent shifted peaks / regions|hard fail on mixed or undeclared conventions|`EPI_COORD_SYSTEM_INVALID`|block|
|probe cross-reactivity|false methylation signal at unintended loci|blacklist or mark affected probes|`EPI_ARRAY_PROBE_CROSS_REACTIVE`|exclude feature|
|SNP-affected methylation probe|genotype-driven rather than methylation-driven signal|blacklist or review based on manifest/annotation|`EPI_ARRAY_PROBE_SNP_AFFECTED`|exclude or review|
|low CpG coverage|unstable site estimates|coverage threshold in qualification policy|`EPI_WGBS_LOW_COVERAGE`|exclude feature|
|region-to-gene ambiguity|misassigned biology|mapping class required; no silent gene label|`EPI_MAPPING_AMBIGUOUS`|review or exploratory only|
|enhancer-promoter uncertainty|false target-gene implication|block causal wording; require provenance class|`EPI_MAPPING_ENHANCER_UNCERTAIN`|exploratory only unless stronger evidence|
|nearest-gene overinterpretation|incorrect pathway attribution|nearest-gene mappings cannot auto-drive pathway roll-up|`EPI_MAPPING_NEAREST_GENE_ONLY`|exploratory only|
|accessibility ≠ expression|incorrect downstream interpretation|store as accessibility evidence, not expression proxy|`EPI_INTERPRET_ACCESSIBILITY_NOT_EXPRESSION`|allow measured feature only|
|histone-mark context dependence|wrong directional interpretation|mark-specific warning dictionary|`EPI_INTERPRET_MARK_CONTEXT_DEPENDENT`|allow with warning|
|miRNA target prediction uncertainty|inflated false target/pathway links|predicted targets blocked from automatic roll-up|`EPI_MIRNA_TARGET_PREDICTION_ONLY`|measured feature yes; target-based no|
|persistent effect not demonstrated|overclaim of durable biology|require repeat/recovery timepoints for persistence field|`EPI_PERSISTENCE_NOT_DEMONSTRATED`|allow with warning|
|reversibility not assessed|cannot distinguish adaptive from durable effect|explicit reversibility field defaults to unknown|`EPI_REVERSIBILITY_NOT_ASSESSED`|allow with warning|
|transgenerational / heritable overreach|unsupported hereditary claim|hard block unless germline / multigenerational design metadata present|`EPI_HERITABILITY_OVERCLAIM`|block claim; measured packet may remain|
|tissue specificity|reference-track mismatch and misannotation|require biosample context and species/tissue metadata|`EPI_TISSUE_SPECIFICITY_LIMIT`|allow with warning|
|timepoint dependence|response direction may reverse over time|timepoint mandatory in design schema|`EPI_TIMEPOINT_DEPENDENT`|allow with warning|
|low replication|unstable feature estimates|minimum replicate policy in qualification|`EPI_DESIGN_LOW_REPLICATION`|review or exclude|
|mixture / cell-population heterogeneity|non-identifiability of source cell state|explicit mixed-population status|`EPI_HETEROGENEITY_HIGH`|review|

### Feature qualification model

For **dose-response-ready** handoff, features should be classified with the following policy:

- **minimum total dose groups**: `>= 3` including control
- **minimum non-zero dose groups**: `>= 2`
- **minimum biological replicates per group**: `>= 2` for accepted status
- **valid build**: mandatory for coordinate-bearing features
- **valid coordinates or stable assay ID**: mandatory
- **numeric response declared**: mandatory
- **platform annotation provenance**: mandatory for probe/array-derived features
- **region-to-gene mapping provenance**: mandatory if any gene/pathway interpretation is exported
- **cell-composition and cytotoxicity context**: either present or explicit warnings emitted
- **persistence / heritability / transgenerational flags**: default to `not_assessed` unless study design proves otherwise

#### Qualification statuses

|Status|Meaning|
|---|---|
|`accepted_for_pod`|ready for downstream modelling as feature-response evidence|
|`accepted_with_warnings`|usable, but caveated|
|`review_required`|human adjudication needed before handoff|
|`exploratory_only`|retain in QC packet, exclude from default handoff subset|
|`excluded_insufficient_design`|design not fit for dose-response readiness|
|`excluded_invalid_coordinates`|coordinates malformed or incoherent|
|`excluded_missing_genome_build`|build absent where needed|
|`excluded_high_missingness`|feature missingness too high|
|`excluded_mapping_ambiguous`|mapping too uncertain for intended interpretation|
|`excluded_non_numeric_response`|values not fit for quantitative downstream use|
|`excluded_confounding_dominant`|context indicates likely dominant confounding|

#### Qualification pseudocode

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

## Standards, resources, and integration contracts

### Standards and resource matrix

The most suitable v0.1 resources are the ones with stable identifiers, explicit releases, machine-accessible endpoints, and tractable licensing. That strongly favours processed public reference resources and identifier authorities over opaque dynamic prediction services. citeturn17view3turn18view6turn19view0turn18view8

|Resource|Role in Epigenomics MCP|Access / API|Licensing / update cadence|Auditable suitability|Stage|
|---|---|---|---|---|---|
|entity["organization","ENCODE Project Consortium","functional genomics consortium"]|reference assay metadata, file semantics, QC exemplars, processed peak and methylation outputs|portal + REST JSON API + typed metadata objects|external users may freely download, analyse and publish; active portal and standards pages|excellent for reference annotation and benchmark fixtures, but not a toxicity-specific truth source citeturn17view3turn15search2turn7search16turn24view3|v0.1|
|Roadmap Epigenomics|reference chromatin states and tissue-context tracks|static consortium portal; metadata searchable through ENCODE integration|programme completed; 111 reference maps, effectively static|excellent contextual resource; poor as a live dependency because updates are limited citeturn22search4turn22search2turn22search8|v0.2|
|GEO / SRA at entity["organization","NCBI","us biomedical database center"]|public source of processed toxicology and epigenomics datasets|web, FTP, programmatic access; GEO brokers raw data to SRA|public archive; active submission and curation|excellent as upstream evidence source and benchmark fixture registry citeturn25view0turn25view2turn25view3|v0.1|
|BioStudies / former ArrayExpress|functional-genomics study records and processed files, especially EBI-side archives|BioStudies studies endpoint / API; ArrayExpress accessions preserved|ArrayExpress interface retired in 2022; migrated to BioStudies|good for public dataset retrieval; keep accession and collection metadata in provenance citeturn26search8turn26search2turn19view3turn19view4|v0.1|
|entity["company","Illumina","genomics instruments"] methylation manifests and annotation packages|authoritative probe IDs, build-linked manifest columns, platform versioning|vendor manifests; Bioconductor annotation/manifest packages widely used|manifest content build-specific; EPIC manifests reference hg19 unless stated; versioning essential|critical for array provenance; mandatory in v0.1 citeturn16search5turn16search19turn16search1|v0.1|
|entity["organization","UCSC Genome Browser","genome annotation browser"] resources|coordinate conventions, BED semantics, liftOver context, browser tracks|browser, downloads, REST/API ecosystem, Table Browser|data broadly reusable, but browser software/local installs have commercial licence caveats|excellent for coordinate semantics and liftover provenance, but use with explicit release tracking citeturn17view1turn18view0turn18view1turn6search9|v0.1|
|entity["organization","Ensembl","genome annotation platform"] regulatory build|regulatory features and activity context, species-aware annotations|browser, FTP, BioMart; old funcgen Perl API deprecated|software under Apache 2.0; release-coupled annotation|excellent for auditable release-based annotation; prefer FTP/BioMart/browser over deprecated funcgen API citeturn23view1turn23view3turn18view3|v0.1|
|entity["organization","GENCODE","reference gene annotation project"]|human/mouse gene models for TSSs, promoters, gene bodies, lncRNAs|website + FTP releases|open access; releases coincide with Ensembl; GRCh38 primary, GRCh37 liftover also provided|excellent as the canonical gene-model release to store in provenance citeturn18view5turn19view2turn19view7|v0.1|
|entity["organization","HUGO Gene Nomenclature Committee","gene nomenclature authority"]|stable human gene symbols and IDs|REST API with JSON/XML and service `lastModified`|active curated authority|excellent identifier authority for gene symbols in packets citeturn18view6|v0.1|
|entity["organization","Gene Ontology Consortium","biomedical ontology consortium"]|biological-process roll-ups via Annotation/Ontology MCP|ontology downloads in OBO, OWL, JSON|CC BY 4.0; release dates should be cited explicitly|excellent; store exact GO release in provenance citeturn18view7turn19view0|v0.1|
|entity["organization","Reactome","pathway knowledgebase"]|pathway roll-up and pathway coverage objects|Content Service REST API; quarterly Zenodo releases|mixed licensing model; annotation files have CC0 history, other software/web-service content remains CC BY 4.0|excellent if release and licence class are stored in provenance citeturn17view4turn18view8turn19view1|v0.1|
|EpiFactors|curated epigenetic factor / complex / lncRNA context|CSV/XLSX downloads and web tables|CC BY 4.0; current version 2.1 dated 2024-09-10|good for annotation context, not for primary evidence scoring citeturn20view0turn18view9|v0.2|
|miRBase|naming authority and sequence archive for miRNAs|search, downloads, FTP, previous releases|public domain; current release shown as 22.1, a minor 2019 update|good as naming/version authority, but biologically stale as a sole knowledge base citeturn27search3turn27search4turn18view10|v0.1|
|miRTarBase|experimentally validated miRNA-target interactions|public web resource described in NAR updates|publicly accessible and actively updated to 10.0; licence should be manually reviewed before mirroring|very useful for **validated** target support; use by accession/reference rather than as a silent embedded truth source citeturn31view0turn31view1turn31view3|v0.2|
|ChIP-Atlas|secondary resource for curated ChIP/ATAC/Bisulfite integration and experiment-level QC views|web tools, API, GitHub docs; open-source web server|active 2025 update; free, no login|good for enrichment/context and benchmark cases, but keep primary provenance to original archives citeturn20view4turn32view1|v0.2|
|ReMap|secondary transcriptional-regulator and binding-region catalogue|web downloads, UCSC/Ensembl tracks|public site reviewed shows 2022 catalogue; recent update cadence limited|useful as contextual evidence, but not ideal as a fast-moving core dependency citeturn20view5turn32view1|deferred / v0.2|
|BED / narrowPeak / broadPeak formats|peak table semantics for region features|plain text formats documented by UCSC|stable formats|mandatory for parser and validator support in v0.1 citeturn17view1|v0.1|
|Genome builds `GRCh37/38`, `mm10/mm39`|assembly identity for all coordinates|NCBI/UCSC/Ensembl reference pages|assembly-stable but not interchangeable|mandatory first-class contract fields citeturn6search0turn6search8turn6search3turn6search2|v0.1|

### Integration contracts

|Integration target|Exchanged object|Required fields|Failure modes|Guardrails|
|---|---|---|---|---|
|Annotation/Ontology MCP|`AnnotationRequest`, `EpigenomicAnnotationTrace`|species, build, raw feature ID, requested target namespace, release preference|stale release, cross-species mis-map, missing stable ID|Epigenomics MCP never invents ontology mappings locally; all mapped IDs recorded with release and source|
|Evidence Registry MCP|`EvidenceRecordRef`, `EvidenceLineageBlock`|repository accession, submitter/source, publication refs, dataset hash, packet ID|unresolvable accession, changed upstream file, duplicated evidence|store source hash and upstream provenance digest|
|Bioactivity-PoD MCP|`BioactivityPoDHandoffPacket`|dose matrix, feature class, qualification status, QC refs, mandatory caveats, mapping provenance|packet semantically incomplete, exploratory-only features slipped through|separate `validate_epigenomics_handoff_packet` gate required|
|AOP MCP|`AOPContextLink`|feature ID, mapping type, target gene/pathway, confidence, caveat flags|false causal interpretation from proximity|only cautious links; no direct KE assignment from nearest-gene logic|
|IVIVE/BER MCP|`PoDReference` from Bioactivity-PoD, not direct epigenomics packet|PoD object ID, assay system, exposure context|direct bypass of Bioactivity-PoD|hard contract prohibition on direct export from Epigenomics MCP|
|WoE/NGRA Synthesis MCP|`EvidenceSummaryBlock`|qualification counts, warnings, exclusions, context metadata|summary without caveats, double counting mapped genes|summaries must retain measured-feature counts separately from mapped-gene counts|
|Benchmark/Validation MCP|`BenchmarkFixture`, `ExpectedPacket`, `AcceptanceCriteria`|frozen inputs, expected warnings, expected statuses, schema version|non-deterministic tool outputs|all validation tools must be deterministic on same inputs|
|ToxMCP Hub|tool discovery metadata and schema registry entries|tool name, version, schema ids, capability flags|version drift|semantic versioning and strict schema compatibility checks|
|Single-Cell / Spatial Omics MCP later|`PseudobulkEpigenomicFeatureTable`|aggregation unit, donor IDs, cell labels, pseudobulk recipe, build|pseudoreplication, donor/cell misassignment|not before v0.2; require explicit aggregation provenance|
|Multiomics Summary MCP later|`QualifiedEpigenomicsSummary`|feature totals, mapping-class distributions, shared sample axes, caveat set|loss of modality-specific limits|must keep modality-specific warnings in joined object|

## Workflows, benchmark cases, and validation fixtures

### Beta-value methylation to Bioactivity-PoD handoff

**Input example.** EPIC beta matrix with probe IDs, sample columns, complete dose design, `ilm10b4.hg19` manifest provenance, and expressed genome build. Beta values are biologically intuitive, while M-values are often statistically preferable upstream; the packet must therefore carry `response_metric_declared` explicitly rather than guessing from value range. citeturn38search2turn16search19turn16search1

**Tool path.**
`ingest_epigenomic_feature_table` → `ingest_epigenomics_design_table` → `validate_epigenomics_experiment_design` → `classify_epigenomic_feature_type` → `profile_epigenomics_missingness` → `profile_epigenomics_variance` → `assess_cell_composition_context` → `assess_cytotoxicity_context` → `qualify_epigenomic_features_for_pod` → `create_epigenomics_feature_response_packet` → `validate_epigenomics_handoff_packet` → `export_to_bioactivity_pod`

**Expected output.** `EpigenomicsFeatureResponsePacket` containing `cpg_methylation_feature` rows, each with measured probe ID, declared build, platform provenance, dose-group values, qualification status, and warning refs.

**Mandatory warnings.** `cell_composition_context_missing` if no cell-mixture evidence; `EPI_ARRAY_PROBE_SNP_AFFECTED` or `EPI_ARRAY_PROBE_CROSS_REACTIVE` when applicable.

**Human review point.** Any attempt to summarise CpGs to genes or pathways without explicit mapping provenance.

### DMR table with genomic coordinates and nearest-gene mapping

**Input example.** Long table of DMRs: `chrom`, `start`, `end`, `delta_methylation`, `q_value`, `nearest_gene_symbol`, `build=GRCh38`.

**Tool path.**
`ingest_epigenomic_feature_table` → `validate_genomic_coordinate_system` → `classify_epigenomic_feature_type` → `map_regions_to_genes`

**Expected output.** `dmr_feature` objects plus a separate `RegionToGeneMapping` object of type `nearest_gene`.

**Mandatory warnings.** `EPI_MAPPING_NEAREST_GENE_ONLY`, `EPI_MAPPING_ENHANCER_UNCERTAIN`.

**Human review point.** Whether gene-level roll-up is permitted. Default answer: **no automatic pathway roll-up** from `nearest_gene` alone. citeturn36search21turn36search9

### ATAC-seq peak accessibility table with indirect gene mapping

**Input example.** `narrowPeak`-derived table with `chrom`, `chromStart`, `chromEnd`, `signalValue`, `qValue`, `peak`, build, and processing provenance.

**Tool path.**
`ingest_epigenomic_feature_table` → `validate_genomic_coordinate_system` → `classify_epigenomic_feature_type` → `map_regions_to_genes` → `qualify_epigenomic_features_for_pod`

**Expected output.** `chromatin_accessibility_peak` features with preserved 0-based half-open coordinates and mapping objects.

**Mandatory warnings.** `EPI_INTERPRET_ACCESSIBILITY_NOT_EXPRESSION`, `EPI_MAPPING_NEAREST_GENE_ONLY` where relevant. UCSC/ENCODE coordinate semantics must be preserved exactly. citeturn17view1turn24view1turn36search2

**Human review point.** Whether a distal peak is promoted to gene-level interpretation.

### Histone-mark region table with mark-specific interpretation warning

**Input example.** `broadPeak` table for `H3K27me3` or `H3K36me3`, with antibody and control provenance.

**Tool path.**
`ingest_epigenomic_feature_table` → `classify_epigenomic_feature_type` → `generate_epigenomics_qc_report`

**Expected output.** `histone_mark_region` features preserving mark identity and assay context.

**Mandatory warnings.** `EPI_INTERPRET_MARK_CONTEXT_DEPENDENT`; for broad marks, retain mark-specific semantics and do not assign transcription direction automatically. ENCODE distinguishes narrow and broad histone contexts explicitly, and histone marks differ substantially in biological meaning. citeturn24view2turn10search15turn10search7

**Human review point.** Directional claims such as “activation” or “repression” without orthogonal support.

### miRNA expression table with target-overclaim prevention

**Input example.** Mature miRNA expression matrix aligned to miRBase 22.1 identifiers.

**Tool path.**
`ingest_epigenomic_feature_table` → `classify_epigenomic_feature_type` → `map_epigenomic_features_to_pathways`

**Expected output.** `mirna_expression_feature` objects. If validated targets from miRTarBase are supplied, they appear as separate mapping objects with evidence class. If only computational targets are supplied, they are stored as `inferred_target_gene` and blocked from automatic pathway roll-up.

**Mandatory warnings.** `EPI_MIRNA_TARGET_PREDICTION_ONLY`, `timepoint_persistence_not_assessed` when appropriate. miRBase is appropriate as an identifier authority, but its current public release is old; validated interaction resources should therefore be versioned separately. citeturn27search3turn27search4turn31view0turn37search3turn37search6

**Human review point.** Any causal language linking a changed miRNA to a downstream gene without validation evidence.

### Feature rejected due to genome-build mismatch

**Input example.** Region table declares `GRCh37`, but coordinates correspond to `GRCh38` annotation release or mixed contig naming.

**Tool path.**
`validate_genomic_coordinate_system`

**Expected output.** Fatal error object:

```json
{
  "error_code": "EPI_COORD_BUILD_MISMATCH",
  "severity": "critical",
  "scope": "dataset",
  "message": "Declared assembly and coordinate payload are inconsistent.",
  "remediation_hint": "Re-export the processed feature table with correct build metadata or explicit liftover provenance."
}
```

**Human review point.** None before remediation. Build ambiguity is a hard stop.

### Epigenomics plus transcriptomics multiomics handoff later

**Input example.** Qualified epigenomic packet plus a qualified transcriptomics packet sharing sample IDs and dose groups.

**Tool path.**
Epigenomics MCP export → Transcriptomics MCP export → Multiomics Summary MCP

**Expected output.** Joined object that preserves modality-specific caveats and never collapses accessibility, methylation, histone, and expression evidence into a single undifferentiated “gene effect”.

**Mandatory warnings.** If the epigenomic side used low-confidence mappings, the join must retain them as low-confidence and avoid causal arrows.

### Recommended benchmark cases

The Benchmark/Validation MCP should include the following frozen fixtures from day one:

|Benchmark fixture|Purpose|Expected outcome|
|---|---|---|
|`bm_beta_manifest_complete`|happy-path EPIC beta matrix with full manifest provenance|`accepted_for_pod` subset plus deterministic QC report|
|`bm_beta_probe_blacklist`|cross-reactive and SNP-affected probes present|flag or exclude affected features|
|`bm_dmr_nearest_gene_only`|region-level evidence with only nearest-gene mapping|accepted region features; gene/pathway roll-up blocked|
|`bm_atac_zero_based`|correct peak coordinates in narrowPeak semantics|accepted after coordinate validation|
|`bm_atac_one_based_wrong`|silent coordinate shift hazard|hard fail with coordinate-system error|
|`bm_histone_mark_context`|mixed narrow and broad histone marks|mark-specific warnings emitted|
|`bm_mirna_prediction_only`|miRNA expressions with computational targets only|measured features accepted; target roll-up blocked|
|`bm_build_missing`|build absent everywhere|hard fail with `excluded_missing_genome_build`|
|`bm_bulk_mixed_population`|bulk methylation with no cell composition evidence|accepted with warnings or review|
|`bm_dominant_cytotoxicity`|overt toxicity at responsive doses|`excluded_confounding_dominant` for affected feature set|
|`bm_chromatin_state_context_only`|ChromHMM state table|annotation-only or deferred status, not PoD-ready feature export|
|`bm_scatac_pseudobulk_deferred`|future pseudobulk contract case|rejected in v0.1; accepted only after v0.2 schema extension|

## Roadmap and final positioning

### Recommended roadmap

#### v0.1

Ship **the evidence-qualification core**:

- processed-feature ingestion only
- DNA methylation beta/M/CpG/DMR support
- ATAC/ChIP/CUT&Tag/CUT&RUN processed peak-table support
- miRNA measured-feature support
- build / coordinate / platform validation
- mapping provenance model
- cell-composition and cytotoxicity warnings
- qualification and handoff packet generation
- benchmark fixtures and deterministic QC reports

This stage is immediately useful and compatible with archive realities, public format conventions, and release-versioned annotation resources. citeturn19view5turn17view1turn16search19turn18view6turn19view0turn18view8

#### v0.2

Add **validated adapters and richer context**:

- adapters for common processed outputs from established upstream pipelines
- lncRNA / generic ncRNA support with clearer boundary rules against Transcriptomics MCP
- validated-target miRNA mapping via miRTarBase reference integration
- contextual annotation from EpiFactors, ChIP-Atlas, Roadmap
- pseudobulk single-cell ATAC support only after explicit aggregation provenance contract
- release-aware cached annotation services

#### v1.0

Add **selective interoperability, not raw-workbench sprawl**:

- optional external-pipeline gateway for raw-data workflows that remain external to the core MCP
- signed provenance digests for upstream pipeline runs
- richer cross-omics integration contracts
- benchmark suite expansion with community fixtures and red-team tests
- regulator-facing evidence narratives generated from QC and caveat objects, not from hidden heuristics

### Final positioning statement

Epigenomics MCP should be positioned as **the contract boundary between upstream epigenomic preprocessing and downstream quantitative bioactivity modelling**. Its job is to take processed epigenomic evidence and turn it into **qualified, annotation-aware, provenance-rich, interpretation-limited feature-response packets**. It is **not** a read aligner, caller, enhancer oracle, or PoD engine. That narrower scope is a strength, not a concession: it maximises auditability, reduces validation burden, keeps scientific claims inside defensible bounds, and directly addresses a central current problem in toxicoepigenetics — the gap between rich epigenomic data generation and regulator-usable evidentiary infrastructure. citeturn24view3turn40search22turn11search9