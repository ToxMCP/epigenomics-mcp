# Region-to-Gene Mapping Guide

**Document status:** Regulator-facing mapping policy  
**Product version:** 0.2.1
**Date:** 2026-07-27

---

## 1. Principle

Epigenomics MCP treats **measured epigenomic regions** and **inferred gene targets** as separate, traceable objects. Proximity between a region and a gene is **never** treated as evidence of causality, regulation, or adversity.

> **Invariant:** Measured features and inferred target mappings are stored in separate fields and never collapsed.

---

## 2. Mapping Types

The service recognises seven mapping types, each with a default downstream-use rule:

| Mapping type | Description | Downstream use rule |
|--------------|-------------|---------------------|
| `direct_promoter_overlap` | Region directly overlaps a known promoter | Allow contextual gene linkage and pathway roll-up |
| `gene_body_overlap` | Region overlaps the gene body (exon or intron) | Allow with warning; review for directional claims |
| `enhancer_target_from_database` | Enhancer-to-gene link from a curated database | Allow with warning if provenance and context are declared |
| `chromatin_interaction_supported` | 3D interaction (Hi-C, ChIA-PET, etc.) supports the link | Allow when source, build, and context match |
| `nearest_gene` | Gene is the nearest transcription start site | Context only; exploratory for pathway use by default |
| `inferred_target_gene` | Target inferred by algorithmic prediction | Exploratory only; block automatic pathway roll-up |
| `unknown_target_gene` | No reliable gene link available | Allow measured region only; block gene/pathway roll-up |

---

## 3. Pathway Roll-Up Rules

Pathway roll-up is **blocked** when mapping provenance is insufficient.

| Mapping type | Pathway roll-up allowed? | Condition |
|--------------|-------------------------|-----------|
| `direct_promoter_overlap` | Yes | With release-pinned annotation trace |
| `gene_body_overlap` | Yes | With warning; directional claims require review |
| `enhancer_target_from_database` | Yes | If `biosample_context_match` is `exact` or `close` |
| `chromatin_interaction_supported` | Yes | If source build and biosample context match query |
| `nearest_gene` | **No** (default) | Suppressed from machine-actionable pathway evidence |
| `inferred_target_gene` | **No** | Blocked automatically |
| `unknown_target_gene` | **No** | Blocked automatically |

**Rule:** `pathwayRollupAllowed` is validated at schema level. A mapping that sets `pathwayRollupAllowed = true` for a `nearest_gene` or `inferred_target_gene` method fails schema validation.

---

## 4. Confidence Levels

| Confidence | Meaning | Typical sources |
|------------|---------|-----------------|
| `high` | Multiple independent lines of evidence | Promoter overlap + interaction data + database curation |
| `medium` | One strong line or multiple weak lines | Gene body overlap + nearest-gene concordance |
| `low` | Single weak line | Nearest-gene only, or distant database match |
| `none` | No mapping available | Intergenic region with no annotated feature nearby |

---

## 5. External Database Mappings

When an external resource supports a mapping, the following provenance is required:

```json
{
  "featureId": "chr1_1000500_1000600",
  "geneIds": ["ENSG00000139618"],
  "method": "enhancer_target_from_database",
  "confidence": "medium",
  "sourceResource": "GeneHancer",
  "annotationRelease": "v4.7",
  "biosampleContextMatch": "close",
  "downstreamUseRule": "allow_with_warning"
}
```

**Fields:**

- `sourceResource` — Name of the external database (e.g., ENCODE, GeneHancer, FANTOM5).
- `annotationRelease` — Version of the database or annotation release used.
- `biosampleContextMatch` — Quality of match between the query biosample and the database record (`exact`, `close`, `distant`, `unknown`).

**Rule:** A `distant` or `unknown` biosample context match triggers a review warning but does not automatically block the mapping.

---

## 6. Mapping Payload Structure

Mappings are stored in a `MappingPayloads` object that is separate from the `EpigenomicFeature` array:

```json
{
  "mappingPayloads": {
    "regionToGeneMappings": [
      {
        "featureId": "chr1_1000500_1000600",
        "geneIds": ["ENSG00000139618"],
        "method": "direct_promoter_overlap",
        "confidence": "high",
        "distanceBp": 0,
        "pathwayRollupAllowed": true,
        "downstreamUseRule": "allow_contextual_gene_linkage_and_pathway_rollup",
        "annotationTrace": { ... }
      }
    ],
    "externalDatabaseMappings": [ ... ]
  }
}
```

This separation ensures that downstream consumers can:

1. Use measured region evidence without any gene mapping.
2. Apply mapping-aware qualification rules (e.g., block pathway roll-up from nearest-gene-only links).
3. Audit the provenance of every mapping independently.

---

## 7. Nearest-Gene Guardrails

Nearest-gene mapping is the most common and most dangerous default in epigenomic analysis. Epigenomics MCP applies the following guardrails:

1. **Warning generation** — Every nearest-gene mapping emits `EPIW007_NEAREST_GENE_ONLY`.
2. **Pathway suppression** — `pathwayRollupAllowed` defaults to `false` for `nearest_gene`.
3. **Human-readable labels** — Nearest-gene labels may appear in QC reports for reviewer context.
4. **No causal language** — The mapping object never uses words like "regulates," "drives," or "activates."

---

## 8. Fail-Closed Behaviours

| Scenario | Behaviour | Traceability |
|----------|-----------|--------------|
| Gene/pathway interpretation requested without mapping provenance | Exclude feature from pathway roll-up | `EPI012_PLATFORM_PROVENANCE_MISSING` |
| Ambiguous mapping (multiple high-confidence genes at equal distance) | Exclude feature | `EPI008_MAPPING_AMBIGUITY` |
| Nearest-gene-only mapping with `blockNearestGenePathwayByDefault = true` | Block pathway roll-up | `EPIW007_NEAREST_GENE_ONLY` |
| `pathwayRollupAllowed = true` for unsupported mapping type | Schema validation fail | `EPI010_HANDOFF_SCHEMA_INVALID` |

---

## 9. What Is Not Inferred

1. **Proximity is not causality** — The distance between a region and a TSS is never converted into a regulatory claim.
2. **Overlap is not function** — A promoter overlap does not mean the region functionally regulates the gene.
3. **Database curation is not ground truth** — External database entries are treated as contextual evidence with their own provenance, not as authoritative biological facts.
4. **No automated AOP mapping** — Adverse outcome pathway linkage requires human review and is never automated from epigenomic mapping alone.

---

*See also: [genome-build-and-coordinate-guide.md](genome-build-and-coordinate-guide.md) for coordinate requirements, [interpretation-limits.md](interpretation-limits.md) for claim boundaries.*
