|Attribute|Description|
|--:|:--|
|Domain > Expert|Toxicology and Functional Genomics > Epigenomics-focused NGRA Scientific Software Architect|
|Keywords|epigenomics, DNA methylation, ATAC-seq, provenance, feature qualification, dose-response|
|Goal|Deliver a decision-grade scope, boundary, and architecture recommendation for Epigenomics MCP within ToxMCP; comprehensive detail |
|Assumptions|Epigenomics MCP is regulator-facing, auditable, modular, and downstream of raw assay processing but upstream of PoD modelling and regulatory synthesis |
|Methodology|Boundary-first platform design, processed-feature intake analysis, standards/resource review, assay-specific failure-mode analysis, and provenance-centric MCP architecture synthesis |

# Decision-grade scope and architecture for Epigenomics MCP

## Executive recommendation

Epigenomics MCP should be built as a **processed-feature evidence qualification layer**, not as a universal epigenomics workbench. Its job is to ingest already-processed epigenomic feature evidence, verify provenance and assay context, normalise identifiers and coordinates, apply assay-specific quality and interpretation guardrails, and emit **qualified, annotation-aware, dose-response-ready feature-response packets** for downstream use by Bioactivity-PoD MCP. It should **not** own raw FASTQ or IDAT processing, bisulfite alignment, peak calling, chromatin-state modelling, PoD/BMD fitting, or final regulatory interpretation. That boundary is the cleanest fit with the realities of public archives, where GEO and SRA span both array- and sequence-based submissions, and with ENCODE-style pipeline ecosystems that already treat upstream processing as a distinct reproducibility problem. citeturn42search9turn42search1turn41search1turn41search6

The practical implication is that **v0.1 should start from processed feature tables**, with strict schema contracts and provenance requirements, plus optional adapters for common upstream outputs. That design is more auditable, easier to validate, easier to explain to regulators, and substantially lower-risk than embedding a heterogeneous raw-omics workflow engine inside the MCP. It also aligns with the still-evolving regulatory status of epigenetic evidence, where agencies and expert reviews recognise the promise of epigenomics but still emphasise unresolved interpretation questions, especially around adversity, persistence, heritability, and causal linkage. citeturn33search13turn36search2turn35search11turn33search20

My recommendation is therefore:

- **v0.1**: build **Option B implemented in an Option E shell** — a core epigenomic evidence-qualification MCP with optional, tightly-scoped adapters for processed upstream outputs.
- **v0.2**: add richer adapter coverage, context-aware region-to-gene linking, curated external evidence augmentation, and controlled pseudobulk single-cell intake.
- **v1.0**: expand to a mature processed-feature platform with benchmark suites, frozen resource snapshots, and multi-assay packet schemas — but still **do not** turn it into a raw sequencing or chromatin-analysis platform. citeturn41search1turn42search0turn43search7turn28search13

## Strategic role and boundaries

Epigenomics MCP should own the narrow but high-value stretch of the pipeline between **“processed assay output exists”** and **“downstream PoD modelling can consume a scientifically qualified packet.”** In concrete terms, it should own five responsibilities: intake validation; coordinate/build normalisation; assay-specific feature QC and warnings; cautious biological annotation; and packetisation for Bioactivity-PoD. It should not own upstream primitive generation, nor downstream causal or regulatory interpretation. That split is scientifically defensible because upstream assay computation is highly pipeline-dependent, while downstream adverse-outcome interpretation remains contextual and unresolved in many epigenetic settings. citeturn42search1turn41search1turn35search11turn33search13

### Recommended ownership boundary

| Module | What it should own | What Epigenomics MCP should do instead |
|:--|:--|:--|
| Transcriptomics MCP | mRNA/standard gene-expression evidence, transcript-level abundance, DEG workflows | Only consume transcript-linked context when needed; do not become a transcriptomics engine |
| Proteomics MCP | protein abundance/PTM evidence | Stay at epigenomic feature qualification only |
| Metabolomics MCP | metabolite-level perturbation evidence | Provide context tags only if linked downstream |
| Phenotypic / Imaging Bioactivity MCP | morphology, cell-state, high-content imaging | Remain locus/region/feature-centric, not phenotype-centric |
| Bioactivity-PoD MCP | BMD/BEP/PoD fitting, feature prioritisation, candidate derivation | Hand off qualified packets; do not fit PoDs |
| Annotation/Ontology MCP | canonical identifiers, ontologies, term mapping, frozen vocabularies | Consume annotation services; do not become the ontology source of truth |
| Evidence Registry MCP | accession tracking, file manifests, checksums, provenance graph | Register every intake/output, but do not own registry semantics |
| AOP MCP | event networks, KEs/KERs, AOP mapping | Provide cautious evidence links, not mechanistic claims |
| IVIVE/BER MCP | in vitro-to-in vivo translation, bioactivity exposure ratios | Route via Bioactivity-PoD packets |
| WoE/NGRA Synthesis MCP | cross-evidence interpretation and regulator-facing narrative | Provide structured evidence, not synthesis conclusions |
| Benchmark/Validation MCP | challenge datasets, acceptance criteria, performance reports | Emit auditable QC traces for benchmarking |
| Single-Cell / Spatial Omics MCP | cell-state decomposition, neighbourhood/spatial context | Accept only later-stage pseudobulk/context adapters, not native single-cell logic |
| Multiomics Summary MCP | cross-layer aggregation and consensus story | Remain single-layer and feature-granular |

### Raw-data decision

**No — Epigenomics MCP should not process raw FASTQ or array IDAT files in v0.1.** SRA exists specifically to archive raw sequencing and alignment data, while GEO accepts both raw and processed functional genomics data, and ENCODE’s own infrastructure separates assay pipelines, software versions, and metadata-driven analysis objects. For a regulator-facing MCP, duplicating that entire raw-processing burden inside Epigenomics MCP would sharply increase maintenance and validation load with limited architectural benefit. citeturn42search1turn42search9turn41search1turn41search0

### Explicit non-goals for v0.1

The following should be **explicit non-goals** in the v0.1 charter:

- raw FASTQ processing
- bisulfite alignment
- IDAT preprocessing
- peak calling
- chromatin-state modelling
- miRNA target prediction as a primary algorithm
- causal epigenetic inference
- transgenerational/heritable-effect claims
- PoD/BMD modelling
- regulatory interpretation

Those exclusions are not just scope control; they are scientific risk control. Raw-processing and peak-calling choices are highly workflow-sensitive; chromatin-state models add another inference layer with non-trivial confidence issues; and transgenerational or regulatory claims remain especially fragile in current toxicoepigenetics and risk-assessment discourse. citeturn41search1turn24search8turn23search23turn33search20turn33search13

### What the core output should be

The main product of Epigenomics MCP should be a **Feature-Response Packet**, not a biological verdict. At minimum, each packet should carry:

| Packet field | Required content |
|:--|:--|
| `packet_id` | immutable ID plus content hash |
| `feature_descriptor` | CpG/DMR/peak/region/miRNA identifier, feature type, coordinates, genome build |
| `assay_context` | assay, platform, upstream pipeline/tool versions, normalisation state |
| `biosample_context` | species, strain, sex, life stage, tissue, cell type, model system |
| `exposure_context` | chemical ID, dose, dose unit, schedule, time point, vehicle, exposure route or in vitro concentration framework |
| `response_payload` | per-feature measurements or summary statistics across doses/time points, with effect direction and simple trend descriptors |
| `annotation_payload` | gene links with confidence and method, pathway/process tags, regulatory-feature labels |
| `qc_payload` | assay-specific QC metrics, filters, blacklist flags, coverage metrics, warning/error codes |
| `policy_payload` | `allow`, `allow_with_warnings`, or `block_for_pod` |
| `provenance_payload` | source accession(s), file checksums, manifest version, annotation snapshot IDs, processing lineage |

The important principle is that the packet must remain **model-ready but not model-opinionated**: enough structure for Bioactivity-PoD to fit dose-response, but no premature PoD or adversity conclusion inside Epigenomics MCP itself.

## Input landscape and supporting resources

Processed epigenomic data already appear in public archives and reference ecosystems in several recurring forms: methylation-array tables, bisulfite-derived methylation summaries, ATAC/ChIP-style peak matrices, generic BED-derived region tables, and curated metadata-rich resources such as ENCODE, GEO, SRA, BioStudies, UCSC, Ensembl, GENCODE, HGNC, GO, and Reactome. Peak-based assays commonly move through BED-family formats, while methylation-array interpretation depends on vendor manifests and probe annotations. That makes a **processed-table-first MCP** realistic immediately. Key external standards and services come from entity["organization","ENCODE","genomics consortium"], entity["organization","NCBI","nih database center"], entity["organization","EMBL-EBI","ebi institute"], entity["company","Illumina","sequencing vendor"], entity["organization","UCSC","genome browser project"], entity["organization","Ensembl","genome annotation project"], entity["organization","HGNC","gene naming authority"], and entity["organization","Reactome","pathway database project"]. citeturn42search9turn42search1turn11search3turn43search1turn43search7turn25search5turn27search8turn28search15

### Epigenomics input source matrix

| Input type | What it contains | v0.1 stance | Metadata minimum | Main ambiguity / failure mode |
|:--|:--|:--|:--|:--|
| DNA methylation array beta-value tables | bounded methylation proportion per CpG/site | **Direct** | array manifest version, probe IDs, genome build, normalisation method, sample sheet | intuitive but variance-compressed near 0/1; probe blacklist issues |
| DNA methylation M-value tables | log-ratio methylated/unmethylated signal per CpG | **Direct** | same as beta tables, plus transform provenance | often better for modelling, but less intuitive; cannot interpret without platform context citeturn23search20turn23search24 |
| Differentially methylated CpG tables | locus-level effect size and statistics for contrasts | **Direct** | contrast definition, covariates, multiple-testing method, blacklist filters | easy to overread single CpGs without coverage/replication context |
| Differentially methylated region tables | region coordinates, effect sizes, statistics, sometimes linked genes | **Direct** | region caller, merge rules, build, statistics, covariates | region definitions vary strongly by caller and thresholds |
| Bisulfite-seq processed methylation tables | per-CpG/region methylation fraction plus coverage | **Adapter-first** | coverage, strand conventions, build, caller, smoothing/tile rules | low coverage and incompatible table shapes across pipelines |
| ATAC-seq peak accessibility tables | counts or scores per consensus open-chromatin peak | **Direct** | consensus peak set, peak caller, counts/scoring units, build | accessibility is not equivalent to transcriptional activation |
| ChIP-seq / histone-mark peak tables | mark-specific peaks or signal summaries by region | **Direct** | mark, antibody, peak type, build, caller, replicate logic | mark interpretation is context-dependent |
| CUT&Tag / CUT&RUN processed peak tables | lower-background peak or signal tables | **Direct** via ChIP-like schema | assay type, mark/target, caller, build, consensus peak set | cross-assay comparability to ChIP is imperfect |
| miRNA expression tables | small-RNA abundance/counts/normalised expression | **Adapter only** | assay type, identifier namespace, normalisation, biosample context | boundary with Transcriptomics MCP; target interpretation uncertain |
| long non-coding RNA expression tables | lncRNA abundance/counts | **Adapter only** | transcript/gene annotation release, normalisation, assay method | should usually live in Transcriptomics MCP unless explicitly framed as epigenetic-regulator evidence |
| chromatin state segmentation outputs | genome segmented into inferred states | **Deferred** | model name, number of states, training inputs, build | inference-on-inference problem; not trivial to audit at v0.1 |
| genomic-region feature tables | generic BED-like region score tables | **Direct** | coordinates, build, value semantics, feature class | semantically under-specified unless controlled by schema |
| gene-linked epigenomic feature tables | upstream-linked CpGs/DMRs/peaks with gene mapping | **Direct** but preserve upstream mapping confidence | mapping method, distance rules, enhancer-link method | nearest-gene overinterpretation |
| single-cell ATAC-seq pseudobulk outputs | grouped accessibility summaries across cell states | **Deferred to v0.2 adapter** | pseudobulk recipe, cell-state definitions, donor aggregation, build | cell-state composition and pseudobulk construction can dominate signal |

The common metadata denominator across all supported types should include: study/accession IDs, file checksum, exposure design, dose units, time point, biological replicate mapping, species/strain/sex/life stage, tissue and cell type, model system, genome build, platform/panel version, normalisation state, and upstream software provenance. ENCODE’s metadata-rich model, GEO’s MIAME-oriented submission regime, and public archive download/programmatic interfaces make that provenance requirement feasible in practice. citeturn41search0turn42search9turn42search8turn42search0

### Standards and resource matrix

| Resource | Role in Epigenomics MCP | Access / API | Licence / audit note | Recommendation |
|:--|:--|:--|:--|:--|
| ENCODE | assay metadata model, QC exemplars, processed peak/methylome outputs, cross-reference context citeturn41search6turn41search1 | portal API, software/version objects; programmatic limit documented at 10 GET/s citeturn41search0 | highly auditable if accessions, software versions, and released files are snapshotted citeturn41search1turn41search0 | **v0.1** |
| Roadmap Epigenomics | legacy reference chromatin states, methylomes, enhancer context; especially useful as background biology, not primary truth | public reference maps/portal and major landmark reference-map paper citeturn17search1turn17search2 | valuable but older and heavily hg19-era; use only with explicit snapshot/versioning | **v0.2** |
| GEO / SRA | public source discovery, accession-driven provenance, raw/processed handoff points citeturn42search9turn42search1 | GEO FTP, E-utilities, Construct-a-URL, SRA Toolkit/cloud access citeturn42search0turn42search8turn42search4turn42search19 | core for auditable provenance; heterogeneous assay quality means MCP must qualify, not trust blindly | **v0.1** |
| BioStudies / ArrayExpress | secondary archive/discovery path, especially for historical ArrayExpress studies citeturn11search3turn11search4 | BioStudies web/API-style access and downloads; ArrayExpress records migrated to BioStudies citeturn11search4turn11search5 | useful for accession harmonisation; snapshot records to avoid archive drift | **v0.1** |
| Illumina methylation array annotations | essential manifest/probe annotation layer for array CpGs | manifests/annotation files via support pages and product ecosystem | operationally essential, but vendor terms and redistribution posture should be reviewed before mirroring broadly | **v0.1** |
| UCSC Genome Browser resources | genome coordinate reconciliation, tracks, liftOver support, public APIs, blacklist/annotation context citeturn43search1turn43search9 | public API and MySQL/website access documented citeturn43search0turn43search1 | website/API/public MySQL are broadly usable; local commercial installs and some command-line tools have separate licence requirements citeturn43search4turn43search8turn43search12 | **v0.1** |
| Ensembl regulatory build / gene annotation | regulatory feature and gene/transcript context; stable release-oriented annotations | REST server plus separate GRCh37 REST server; release-based API surface citeturn43search3turn43search7turn43search10 | strong fit for frozen-release annotation; never treat as definitive causal enhancer truth | **v0.1** |
| GENCODE | high-quality human/mouse gene and lncRNA models for mapping and transcript-aware context citeturn25search0turn25search1 | website + FTP downloads; release history explicit citeturn25search4turn25search5 | releases generally track Ensembl and may skip releases when unchanged; excellent for frozen snapshots citeturn25search7 | **v0.1** |
| HGNC | stable human gene symbols and IDs for human-facing packets | TSV/JSON downloads, archives, regular update cadence citeturn27search1turn27search8turn27search6 | strong auditability because HGNC IDs are stable even if symbols change citeturn27search12 | **v0.1** |
| Gene Ontology | cautious process/function summarisation for linked genes | monthly archives, OWL/OBO/JSON, SPARQL-friendly resources citeturn28search0turn28search2turn28search5 | good for standardised enrichment context, but snapshot ontology and annotation date | **v0.1** |
| Reactome | pathway/context enrichment for linked genes, audit-friendly release IDs | Content Service and Analysis Service APIs; quarterly Zenodo snapshots from v89 onward citeturn28search15turn28search13 | free/open, curated, peer reviewed, CoreTrustSeal-certified knowledgebase citeturn28search3turn28search17turn28search9 | **v0.1** |
| EpiFactors | curated catalogue of epigenetic regulators for histone/chromatin actor labeling | public database | useful, but not core to packet qualification; update/API review in this pass was limited | **v0.2** |
| miRBase | identifier registry and sequence/coordinate reference for miRNAs | downloads, FTP, GFF3, searchable registry citeturn29search0turn30search3 | public domain; current public release remains 22.1, which underscores slow update cadence citeturn30search1turn30search5turn29search1 | **v0.2** |
| miRTarBase | validated miRNA-target context if later needed | public website/database and literature-backed releases | potentially valuable, but API/licence posture was not clear enough in this review for v0.1 dependency | **Deferred / v0.2 after legal+tech review** |
| ChIP-Atlas | contextual TF/histone/accessibility evidence augmentation and query support | explicit MCP/HTTP API for agents, dataset search, browser, enrichment tools citeturn24search0turn24search1turn24search9 | useful augmenting layer, not primary truth source for regulator-facing qualification | **v0.2** |
| ReMap | curated TF regulator peak context and downloadable BEDs | web catalogues, BED downloads, annotation pages citeturn24search14turn24search15 | catalogue under CC BY-NC 4.0, which is a real downstream commercial-use constraint citeturn24search2 | **v0.2 or deferred in commercial contexts** |
| BED / narrowPeak / broadPeak | canonical processed-region interchange formats | widely supported by UCSC/ENCODE-style ecosystems citeturn43search1turn24search14 | excellent for MCP intake contracts if coupled to explicit schema validation | **v0.1** |
| GRCh37 / GRCh38 / mm10 / mm39 | core supported build set | use build-explicit contracts and controlled liftOver only when necessary | build ambiguity is a blocking failure, not a soft warning | **v0.1** |

The key design principle here is that **annotation resources should be snapshotted and version-pinned**, never resolved “live” during decision-grade runs unless the exact release identifier is captured into provenance. That matters especially for gene models, HGNC symbols, GO/Reactome annotations, and liftOver-based region transformations. citeturn27search8turn28search0turn28search13turn43search9

## Failure modes and guardrails

Epigenomics has a distinctive failure pattern: signal is highly contextual, often cell-composition-sensitive, and especially vulnerable to over-interpretation at the region-to-gene and persistence/heredity layers. Public methylation-array literature documents cross-reactive and SNP-affected probes; enhancer literature warns against naive nearest-gene linking; accessibility and expression can diverge substantially; histone marks are informative but not self-sufficient causal readouts; and toxicoepigenetics reviews repeatedly emphasise unresolved adversity, persistence, and heritability interpretation. citeturn32search3turn32search31turn32search2turn32search6turn32search13turn32search25turn32search4turn32search12turn35search11turn33search20

### Failure-mode and guardrail matrix

| Failure mode | Scientific consequence | Guardrail | Machine-readable code | PoD handoff |
|:--|:--|:--|:--|:--|
| Cell-composition confounding | apparent methylation/accessibility shifts may reflect cell mixture change rather than within-cell response | require declared bulk vs purified model; capture composition estimates if available; flag blood/tissue mixtures without deconvolution plan | `EPI-W-CELLCOMP_UNMODELLED` | **Conditional** |
| Differentiation-state confounding | epigenomic state may reflect maturation state, not toxicant effect | require passage/differentiation metadata and matched controls; block cross-state comparisons without design support | `EPI-W-DIFFSTATE_MISMATCH` | **Conditional** |
| Cytotoxicity / stress confounding | strong stress/apoptosis signals can masquerade as mechanistic epigenomic response | require viability/stress metadata where available; down-rank or block packets near overt cytotoxicity | `EPI-B-CYTOTOX_PROXIMAL` | **Block** if severe |
| Batch effects | technical grouping can dominate signal | require batch fields and replicate structure; reject “dose perfectly confounded with batch” designs | `EPI-B-BATCH_CONFUNDED` | **Block** |
| Genome-build mismatch | coordinate annotations become invalid or misleading | build must be explicit; if lifted, store original build, chain file, tool, and transformation loss stats | `EPI-B-GENOMEBUILD_UNKNOWN` / `EPI-W-LIFTOVER_APPLIED` | **Block** if unknown |
| Probe cross-reactivity | false methylation signal on off-target loci | mandatory blacklist filter for affected array probes | `EPI-B-PROBE_CROSSREACTIVE` | **Block at feature level** |
| SNP-affected methylation probes | genotype can masquerade as methylation effect | mandatory SNP-affected probe screening and flagging | `EPI-B-PROBE_SNP_AFFECTED` | **Block at feature level** |
| Low CpG coverage | unstable WGBS/BS-seq methylation estimates | require minimum coverage thresholds and exposure-group coverage summaries | `EPI-W-COVERAGE_LOW` | **Conditional** |
| Region-to-gene mapping ambiguity | wrong gene attribution cascades into wrong pathway/AOP story | store mapping method and confidence; allow multi-gene links; never silently coerce to one gene | `EPI-W-REGION_GENE_AMBIG` | **Conditional** |
| Enhancer-promoter uncertainty / nearest-gene overinterpretation | distal regulation may be assigned to the wrong target gene | separate `nearest_gene` from `supported_gene_link`; do not collapse them | `EPI-W-ENHANCER_LINK_LOWCONF` | **Conditional** |
| Accessibility not equal to gene expression | open chromatin can be non-productive or not reflected in RNA | keep accessibility evidence independent unless transcript support exists | `EPI-W-ACCESS_EXPR_DISCORD` | **Allow with warning** |
| Histone-mark context dependence | H3K27ac/H3K4me1/etc. do not by themselves prove enhancer activity or adversity | preserve mark-specific semantics and avoid single-mark causal labels | `EPI-W-HISTONE_CONTEXT_DEP` | **Allow with warning** |
| miRNA target prediction uncertainty | functional interpretation becomes dominated by weak target inference | do not run primary target-prediction algorithms in v0.1; only attach validated/context registries later | `EPI-W-MIRNA_TARGET_UNQUALIFIED` | **Conditional** |
| Persistent effect not demonstrated | single-time-point changes can be adaptive or transient | require repeated time points for persistence claims; otherwise prohibit “persistent” labels | `EPI-W-PERSISTENCE_UNPROVEN` | **Allow with warning** |
| Reversibility not assessed | cannot distinguish reversible adaptation from stable reprogramming | introduce explicit `reversibility_status` field and default to `unknown` | `EPI-W-REVERSIBILITY_UNKNOWN` | **Allow with warning** |
| Transgenerational / heritable claim overreach | major interpretive overstatement with regulatory implications | prohibit such labels unless study design explicitly supports multigenerational separation | `EPI-B-HERITABLE_CLAIM_UNSUPPORTED` | **Block** |
| Tissue specificity | features may not generalise beyond one tissue/cell model | always bind packets to tissue/cell context; no silent extrapolation | `EPI-W-TISSUE_SPECIFIC` | **Conditional** |
| Time-point dependence | epigenomic responses can reverse or switch direction over time | require time field; single time-point packets cannot support temporal narratives | `EPI-W-TIMEPOINT_LIMITED` | **Conditional** |
| Low replication | unstable contrasts and inflated false findings | set assay-specific minimum replicate rules; treat n=1/n=2 exploratory sets as non-decision-grade | `EPI-B-REPLICATION_INADEQUATE` | **Block** |
| Mixture / cell-population heterogeneity | effect may be driven by rare subpopulation shifts | require explicit bulk-homogeneity statement or deconvolution note | `EPI-W-POPULATION_HETEROGENEITY` | **Conditional** |

The simplest downstream policy is also the best one: **Bioactivity-PoD should only receive packets marked `allow` or `allow_with_warnings`, and should log every warning it propagates.** Anything with unknown build, hard batch confounding, gross cytotoxicity, unsupported heritability claims, or inadequate replication should be blocked before PoD modelling.

## NGRA use cases and handoff objects

In NGRA, the point of Epigenomics MCP is not to prove adversity directly. It is to turn epigenomic evidence into a structured and uncertainty-aware substrate that can contribute to PoD derivation, AOP context, and later WoE synthesis without overclaiming. Public examples such as chromium-induced chromatin-accessibility changes and toxicant-associated miRNA responses show that epigenomics can be dose-responsive and mechanistically informative, but those same literatures also show why interpretation must remain cautious. citeturn35search1turn35search4turn35search3turn36search2turn33search13

### Use-case matrix

| Use case | Required input | Output object | Limits | Review flags |
|:--|:--|:--|:--|:--|
| DNA methylation dose-response evidence | beta/M tables or processed CpG methylation summaries across doses | `feature_response_packet(feature_type="cpg")` | no PoD fitting here; CpG-to-gene relation may be weak | cell composition, probe blacklist, build |
| DMR-level dose-response evidence | DMR tables or region-aggregated BS-seq summaries | `feature_response_packet(feature_type="dmr")` | region caller dependence; gene links often ambiguous | region-caller provenance, multi-gene ambiguity |
| Chromatin accessibility dose-response evidence | ATAC consensus peak tables across doses | `feature_response_packet(feature_type="accessible_peak")` | accessibility alone is not transcription/adversity | accessibility-expression discordance |
| Histone-mark dose-response evidence | ChIP/CUT&Tag/CUT&RUN processed peak tables by mark | `feature_response_packet(feature_type="histone_mark_peak")` | mark-specific semantics are context-dependent | antibody/target metadata, mark-context warning |
| miRNA / ncRNA dose-response evidence | processed miRNA/lncRNA tables plus annotation release | `adapter_packet -> feature_response_packet(feature_type="regulatory_rna")` | should not become target-prediction engine | identifier namespace, target-evidence strength |
| Developmental toxicity context | life-stage, developmental tissue, time-resolved epigenomic data | `contextual_feature_packet(context="devtox")` | developmental epigenomes are highly stage-specific | life stage, maternal/fetal separation, cell-state confounding |
| Endocrine disruption context | endocrine-relevant tissue/cell model plus receptor/pathway context | `contextual_feature_packet(context="endocrine")` | epigenetic shift is not itself proof of endocrine adversity | receptor competence, hormone media conditions |
| Carcinogenicity context | repeated-dose or chronic-context epigenomic evidence | `contextual_feature_packet(context="carcino")` | persistence, clonality, and genotoxic confounding matter | chronicity, proliferation, DNA-damage context |
| Persistent vs adaptive response context | multi-time-point or recovery-design evidence | `temporal_feature_packet` | single-time-point packets cannot support persistence claims | reversibility unknown, recovery absent |
| AOP context mapping | qualified packets plus conservative KE mapping rules | `aop_linked_packet` | mapping should be evidence-link only, not KE proof | low-confidence AOP link, mechanistic ambiguity |
| Model applicability / biological competence | tissue, cell type, species, receptor/pathway competence metadata | `competence_qualified_packet` | poor biological competence can invalidate interpretation | competence missing, tissue mismatch |
| Bioactivity-PoD candidate derivation | any `allow*` packet with dose/time series | **handoff only** to Bioactivity-PoD | Epigenomics MCP never ranks final PoD candidates alone | propagated warnings mandatory |
| IVIVE/BER handoff through Bioactivity-PoD | PoD-linked-ready packet plus exposure metadata | **no direct handoff**; route through Bioactivity-PoD | exposure translation is downstream | not applicable |
| WoE/NGRA synthesis | qualified packet plus full provenance and flags | `woe_evidence_bundle` | no final narrative judgement here | all warnings retained |
| Later multiomics summary | packet IDs from multiple omics MCPs | `cross_layer_reference_bundle` | summary logic belongs elsewhere | cross-layer concordance not assumed |

The important design choice is that **all these use cases should share one packet family**, with context modules layered on top. That keeps the platform modular and auditable: one qualification core, many downstream interpretations.

## Recommended architecture and roadmap

The architecture options are not equally attractive. A raw-processing MCP is the least regulator-friendly option because it pushes Epigenomics MCP into the noisiest and most validation-heavy part of the stack. By contrast, a qualification-centric design leverages the existence of public archives, standard file conventions, and external upstream workflows while keeping the MCP responsible for exactly the stage that matters most for NGRA interoperability: **whether processed evidence is fit for downstream dose-response use.** citeturn42search1turn41search1turn24search0turn42search0

### Architecture comparison

Scoring is relative, from **1 = poor** to **5 = strong**.

| Option | Scientific robustness | Auditability | Maintainability | Validation burden | Regulator readability | Deployment complexity | Fit with ToxMCP | Verdict |
|:--|--:|--:|--:|--:|--:|--:|--:|:--|
| A. Lightweight epigenomic table normaliser | 2 | 4 | 5 | 4 | 3 | 5 | 3 | too thin; useful component, not full product |
| B. Epigenomic evidence qualification MCP | 5 | 5 | 4 | 4 | 5 | 4 | 5 | **best core architecture** |
| C. Full raw epigenomics processing MCP | 2 | 2 | 1 | 1 | 2 | 1 | 1 | non-recommended |
| D. Adapter-based gateway to external pipelines | 4 | 4 | 4 | 4 | 4 | 4 | 4 | very good shell |
| E. Hybrid processed-feature MCP with optional adapters | 5 | 5 | 4 | 4 | 5 | 4 | 5 | **best product shape** |

### Recommended v0.1 architecture

**Recommendation: Option B as the core, delivered operationally as Option E.**

The v0.1 system should have six services:

| Service | Function |
|:--|:--|
| Intake service | accept supported processed tables and manifest metadata |
| Schema/validation service | validate assay-specific fields, identifiers, builds, units, replicate structure |
| Qualification service | run assay-specific QC, blacklist checks, warning/error issuance |
| Annotation service | attach genes, transcripts, pathways, regulatory labels, and confidence metadata via frozen snapshots |
| Packetisation service | emit Feature-Response Packets and register them in Evidence Registry |
| Provenance service | store accession lineage, checksums, software/panel versions, annotation snapshot IDs |

In v0.1, adapters should be limited to **format harmonisation**, not embedded heavy computation. Good adapters are things like: “Illumina methylation differential table adapter”, “Bismark/BS-seq processed methylation summary adapter”, “consensus ATAC peak matrix adapter”, and “ENCODE processed peak import adapter”. Bad adapters are full upstream controllers for alignment, IDAT normalisation, peak calling, ChromHMM, or miRNA target prediction.

### Roadmap

| Stage | Scope |
|:--|:--|
| **v0.1** | direct support for array methylation tables, DMC/DMR tables, ATAC peak tables, histone/CUT&Tag/CUT&RUN processed peak tables, generic region tables; frozen annotation snapshots; warning/error taxonomy; Bioactivity-PoD handoff |
| **v0.2** | richer adapters for BS-seq processed outputs; miRNA/lncRNA adapter pathway; external evidence augmentation via ChIP-Atlas/ReMap-like context; explicit competence model; controlled pseudobulk scATAC intake |
| **v1.0** | benchmark suite integration; versioned packet schema registry; advanced region-link confidence models; multi-assay support profiles; regulator-facing trace reports |

The long-term shape should still remain **processed-feature-first**. Even at v1.0, the MCP should resist pressure to absorb raw workflow execution, because that would erode the clarity of the ToxMCP modular contract.

## Integration map, benchmark cases, and final positioning

### Integration map with the rest of ToxMCP

| Upstream / downstream module | Integration contract |
|:--|:--|
| Evidence Registry MCP | every intake file, snapshot, checksum, and output packet is registered here |
| Annotation/Ontology MCP | source of frozen vocabularies, IDs, term mappings, and ontology snapshots |
| Transcriptomics / Proteomics / Metabolomics MCPs | separate omics layers; linked later by packet IDs, not merged inside Epigenomics MCP |
| Phenotypic / Imaging Bioactivity MCP | orthogonal phenotype evidence; correlated downstream, not within layer qualification |
| Bioactivity-PoD MCP | primary downstream consumer of `allow*` packets; owns feature ranking and PoD/BMD modelling |
| IVIVE/BER MCP | receives only PoD-linked outputs from Bioactivity-PoD |
| AOP MCP | receives cautious evidence links and KE candidates, never unqualified causal assertions |
| WoE/NGRA Synthesis MCP | consumes packet bundles with full warning propagation and provenance |
| Benchmark/Validation MCP | tests ingestion, qualification, warning issuance, packet stability, and benchmark case behaviour |
| Single-Cell / Spatial Omics MCP | remains the native home of cell-state/spatial reasoning; Epigenomics only ingests pseudobulk later |
| Multiomics Summary MCP | aggregates packet-level summaries across modules after each layer has qualified itself |

### Benchmark case recommendations

The strongest benchmark portfolio is **mixed**, with both technical and biological challenge cases.

| Benchmark case | Why it is valuable | Recommended stage |
|:--|:--|:--|
| EPIC / methylation-array technical validation datasets and manifests | validates probe handling, blacklist logic, manifest versioning, coordinate/build normalisation, replicate handling; public validation activity around EPIC platforms is well established citeturn34search0turn36search4 | **v0.1** |
| Rat liver WGBS, lead exposure, GEO GSE89919 | validates processed BS-seq/WGBS ingestion, sequence-based methylation provenance, and coverage-aware packetisation; includes explicit SRA and processed supplementary files citeturn38view0 | **v0.1** |
| Hexavalent chromium ATAC/ChIP/MNase triad, GEO GSE104563/GSE104564/GSE104565 | ideal for cross-assay region harmonisation and for testing the warning that accessibility/CTCF/histone context should not be over-interpreted causally; dataset descriptions explicitly note dose-dependent chromatin accessibility changes and matched orthogonal assays citeturn37view1 | **v0.1–v0.2** |
| Furan liver miRNA toxicogenomics, GEO GSE62807 plus associated dose-response literature | useful for ncRNA adapter testing and for challenging the MCP to preserve uncertainty when miRNA evidence is mechanistically informative but limited as a standalone PoD signal citeturn39view0turn35search3 | **v0.2** |
| ToxiTaRGET / TaRGET-style toxicant multi-omics resource | excellent future benchmark environment for cross-tissue, sex-, life-stage-, ATAC-, methylation-, and transcript-level integration, but best used after v0.1 qualification logic is already stable citeturn35search2turn35search5turn35search20 | **v1.0** |

### Final positioning statement

Epigenomics MCP should be positioned as **the ToxMCP layer that turns processed epigenomic evidence into qualified mechanistic measurement objects**. Its value is not that it “does all epigenomics”; its value is that it makes epigenomic evidence **portable, auditable, annotation-aware, uncertainty-tagged, and usable for downstream dose-response reasoning** without pretending that epigenetic perturbation alone establishes adversity, persistence, causality, or heritability. That positioning is both more scientifically honest and more regulator-readable. citeturn36search2turn35search11turn33search13turn33search20

In one sentence: **Epigenomics MCP should be the qualification and packetisation engine for processed epigenomic features within NGRA, not the place where raw epigenomics, PoD fitting, or regulatory interpretation happens.**

## Open questions and limitations

A few items remain deliberately conservative in this recommendation. First, public-facing licensing/API clarity for some secondary resources — especially miRTarBase and the practical deployment posture of EpiFactors — was not as clean as for ENCODE, GEO/SRA, UCSC, Ensembl, GENCODE, HGNC, GO, Reactome, miRBase, ChIP-Atlas, and ReMap, so I would not make them hard dependencies until legal and technical review is completed. Second, public benchmark datasets are uneven: many toxicant studies are informative but not perfectly balanced dose-series with strong replication, so v0.1 validation should focus on **schema/QC correctness and warning behaviour**, not on finding one “perfect” canonical toxicology dataset. Third, the regulatory place of epigenetic evidence is still evolving, which strengthens rather than weakens the case for a conservative qualification-first architecture. citeturn33search13turn35search11turn24search2turn30search1