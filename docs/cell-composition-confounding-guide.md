# Cell-Composition Confounding Guide

**Document status:** Regulator-facing confounding policy  
**Product version:** 0.2.0
**Date:** 2026-07-27

---

## 1. Principle

Bulk epigenomic signals (especially DNA methylation and chromatin accessibility) can be dominated by shifts in cell-type composition across dose groups. Epigenomics MCP treats cell-composition context as a **first-class machine-readable object** that influences qualification. Missing context generates warnings; dominant confounding blocks handoff.

> **Invariant:** Cell-composition and cytotoxicity context are represented either as data or as explicit missing-context warnings.

---

## 2. Confounding Status Levels

Cell-composition confounding is classified into one of six ordered statuses:

| Status | Ordinal | Meaning | Default downstream effect |
|--------|---------|---------|---------------------------|
| `no_context_available` | 0 | No composition data supplied | Allow with warning |
| `unlikely_confounding` | 1 | Pure/same-type samples, no shifts detected | Accept |
| `possible_confounding` | 2 | Mixed unknown fractions, or small shifts detected | Accept with warning |
| `likely_confounding` | 3 | Moderate shifts (> 0.3 max delta) | Review required |
| `dominant_confounding` | 4 | Large shifts (> 0.5 max delta) | Block handoff |
| `review_required` | 5 | Conflicting or invalid evidence | Block handoff |

---

## 3. Evidence Sources

The service accepts the following sources of cell-composition evidence:

| Source | Description | Reliability |
|--------|-------------|-------------|
| `measured_flow_cytometry` | Experimentally measured cell fractions by flow cytometry | High |
| `measured_sorting` | Experimentally measured by cell sorting or magnetic separation | High |
| `externally_estimated` | Estimated by an external deconvolution tool (e.g., EpiDISH, Houseman) | Medium |
| `declared_pure` | Declared as a pure cell type without measurement | Medium (trusts caller) |
| `declared_mixed_unknown_fractions` | Declared as mixed but fractions unknown | Low |
| `not_declared` | No composition information provided | None |

---

## 4. Classification Rules

### 4.1 Deterministic classification logic

The classification engine applies rules in fixed priority order:

1. **No context available** — If no samples have composition data (and no `declared_mixed_unknown_fractions`), status = `no_context_available`.
2. **Review required** — Triggered by any of:
   - Fraction sums outside tolerance (invalid internal consistency).
   - Mixed `not_declared` and declared samples in the same dataset.
   - Mixed `declared_mixed_unknown_fractions` and reliable sources.
   - Conflicting `declared_pure` cell types across samples.
3. **Dominant confounding** — Max fraction delta across dose groups > `dominantThreshold` (default 0.5).
4. **Likely confounding** — Max fraction delta > `likelyThreshold` (default 0.3).
5. **Possible confounding** — Max fraction delta > `possibleThreshold` (default 0.1).
6. **Unlikely confounding** — All samples pure/same-type, valid fractions, no group shifts detected.

### 4.2 Group shift detection

When an experimental design is supplied, the engine compares mean cell-type fractions in each dose group against the control group:

```
maxFractionDelta = max(|mean_fraction_group - mean_fraction_control|)
```

A shift is detected when `maxFractionDelta > shiftThreshold` (default 0.1).

---

## 5. Policy Configuration

Default policy thresholds (version `0.1.0`):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `possibleThreshold` | 0.1 | Delta above which confounding is "possible" |
| `likelyThreshold` | 0.3 | Delta above which confounding is "likely" |
| `dominantThreshold` | 0.5 | Delta above which confounding is "dominant" |
| `shiftThreshold` | 0.1 | Delta threshold for group-shift detection |
| `fractionTolerance` | 0.05 | Tolerance for fraction-sum validation |
| `cellCompositionBlockLevel` | `dominant_confounding` | Level at which handoff is blocked |
| `blockOnMissingContext` | `false` | Whether missing context blocks handoff |

A regulator may tighten the policy (e.g., set `blockOnMissingContext = true`) and re-run qualification; the engine will then block accordingly.

---

## 6. Warnings

| Warning code | Condition | Severity |
|--------------|-----------|----------|
| `EPIW001_CELL_COMPOSITION_CONTEXT_MISSING` | No composition context available | warning |
| `EPIW002_CELL_TYPE_SHIFT_POSSIBLE` | Shift-based confounding detected | warning |
| `CC_FRACTION_SUM_MISMATCH` | Fraction sums outside tolerance | error |
| `CC_MIXED_DECLARATIONS` | Mixed declaration types in dataset | warning |
| `CC_CONFLICTING_PURE_TYPES` | Conflicting pure cell-type declarations | warning |
| `CC_GROUP_SHIFT` | Group-level shift detected relative to control | warning |
| `CC_NOT_DECLARED` | Individual sample has no declaration | warning |

---

## 7. Fail-Closed Behaviours

| Scenario | Behaviour | Traceability |
|----------|-----------|--------------|
| Missing cell-composition context with `blockOnMissingContext = true` | Block handoff | `EPI007_MISSING_CONFOUNDING_CONTEXT` |
| Dominant confounding detected | Downgrade to `exploratory_only` or block | `EPI007_CELL_COMPOSITION_BLOCKING` |
| Invalid fraction sums | Review required | `CC_FRACTION_SUM_MISMATCH` |
| Mixed declared and not-declared samples | Review required | `CC_MIXED_DECLARATIONS` |

---

## 8. What v0.2 Does Not Do

1. **No default deconvolution** — The service does not run `EpiDISH`, `Houseman`, or any other deconvolution algorithm by default. Deconvolution is behind the `enableCellDeconvolution` feature flag (default `false`).
2. **No inference from epigenomic signal** — Cell composition is never inferred from methylation or accessibility patterns alone.
3. **No batch correction** — Batch-effect modelling is behind the `enableBatchEffectModeling` feature flag (default `false`).
4. **No differentiation-drift modelling** — Differentiation drift is accepted as declared context only.

---

## 9. What Is Not Inferred

1. A pure cell-type declaration is accepted at face value; the service does not verify purity experimentally.
2. Missing context means "cannot assess," not "no confounding."
3. A small fraction delta does not prove absence of confounding; it only means the detected shift is below the threshold.

---

*See also: [cytotoxicity-context-guide.md](cytotoxicity-context-guide.md) for cytotoxicity confounding, [interpretation-limits.md](interpretation-limits.md) for claim boundaries.*
