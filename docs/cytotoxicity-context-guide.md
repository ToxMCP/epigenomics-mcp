# Cytotoxicity Context Guide

**Document status:** Regulator-facing confounding policy  
**Product version:** 0.2.0
**Date:** 2026-07-27

---

## 1. Principle

Cytotoxicity and cellular stress can produce epigenomic changes that reflect injury rather than specific mechanistic perturbation. Epigenomics MCP ingests cytotoxicity context from companion assays and classifies it using deterministic rules. The service **never infers cytotoxicity from epigenomic features alone**.

> **Invariant:** Cytotoxicity is never inferred from epigenomic features alone.

---

## 2. Confounding Status Levels

Cytotoxicity confounding uses the same six-level ordinal scale as cell-composition confounding:

| Status | Ordinal | Meaning | Default downstream effect |
|--------|---------|---------|---------------------------|
| `no_context_available` | 0 | No cytotoxicity data supplied | Allow with warning |
| `unlikely_confounding` | 1 | All viability ≥ threshold, no stress flags | Accept |
| `possible_confounding` | 2 | Minor viability drop, or stress flags without severe viability loss | Accept with warning |
| `likely_confounding` | 3 | Moderate viability drop, or declared cytotoxicity | Review required |
| `dominant_confounding` | 4 | Severe viability drop (< 0.5), or stress flags + significant viability reduction | Block handoff |
| `review_required` | 5 | Malformed measurement values prevent assessment | Block handoff |

---

## 3. Evidence Sources and Assay Types

The service accepts cytotoxicity evidence from the following assay types:

| Assay type | Typical measurement | Unit examples |
|------------|---------------------|---------------|
| `viability` | Cell viability or relative cell number | fraction (0–1), percent |
| `stress` | Stress marker expression or assay readout | fold-change, MFI |
| `morphology` | Morphological change score | arbitrary score, percent affected |
| `apoptosis_necrosis` | Apoptotic or necrotic cell fraction | fraction (0–1) |
| `companion_assay` | Any other concurrent toxicity assay | assay-specific |

Evidence sources:

| Source | Description |
|--------|-------------|
| `measured_concurrent` | Measured in the same experiment, same plates/wells |
| `measured_separate_experiment` | Measured in a separate but concurrent experiment |
| `literature` | Published value for comparable conditions |
| `declared` | Declared by the data submitter without direct measurement |
| `not_available` | No cytotoxicity information provided |

---

## 4. Classification Rules

### 4.1 Base classification from viability

| Minimum viability | Base status |
|-------------------|-------------|
| ≥ 0.8 (default threshold) | `unlikely_confounding` |
| 0.7 – 0.8 | `possible_confounding` |
| 0.5 – 0.7 | `likely_confounding` |
| < 0.5 | `dominant_confounding` |

### 4.2 Elevation rules

The base classification is elevated under the following conditions:

| Condition | Elevation |
|-----------|-----------|
| Declared cytotoxicity present | Floor raised to `likely_confounding` |
| Elevated apoptosis/necrosis (> 0.2) | Floor raised to `possible_confounding` |
| Stress flags present | Raise by one level (e.g., unlikely → possible) |

### 4.3 Example classifications

| Scenario | Base | Elevation | Final status |
|----------|------|-----------|--------------|
| Viability 0.85, no stress | unlikely | — | unlikely |
| Viability 0.75, stress flags | possible | +1 level | likely |
| Viability 0.85, stress flags | unlikely | +1 level | possible |
| Viability 0.45, declared cytotoxic | dominant | — | dominant |
| Viability 0.60, stress flags, apoptosis 0.25 | likely | +1 level | dominant |

---

## 5. Alignment Checks

When an experimental design is supplied, the engine validates that cytotoxicity measurements align with the design:

- **Dose alignment** — Every measurement must match a design dose value or dose group ID.
- **Timepoint alignment** — Every measurement timepoint must match a design timepoint (if design declares timepoints).

Misalignment emits warnings but does not automatically block classification.

---

## 6. Policy Configuration

Default policy thresholds (version `0.1.0`):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `viabilityThreshold` | 0.8 | Below this value, cytotoxicity is flagged |
| `possibleThreshold` | 0.8 | Viability floor for "possible" (same as threshold) |
| `likelyThreshold` | 0.7 | Viability floor for "likely" |
| `dominantThreshold` | 0.5 | Viability floor for "dominant" |
| `cytotoxicityBlockLevel` | `dominant_confounding` | Level at which handoff is blocked |
| `blockOnMissingContext` | `false` | Whether missing context blocks handoff |

---

## 7. Warnings

| Warning code | Condition | Severity |
|--------------|-----------|----------|
| `CTX_MISSING_CONTEXT` | No cytotoxicity context provided | warning |
| `CTX_CYTOTOXICITY_DETECTED` | Cytotoxicity detected in measurements | info |
| `CTX_STRESS_FLAG` | Stress flags present | warning |
| `CTX_MALFORMED_VALUE` | Negative or NaN measurement value | error |
| `CTX_TIMEPOINT_MISMATCH` | Timepoints do not align with design | warning |
| `CTX_DOSE_MISMATCH` | Doses do not align with design | warning |
| `EPIW003_CYTOXICITY_CONFOUNDING` | Confounding at possible/likely/dominant level | warning/error |
| `EPIW004_STRESS_CONFOUNDING` | Stress-response confounding detected | warning |

---

## 8. Fail-Closed Behaviours

| Scenario | Behaviour | Traceability |
|----------|-----------|--------------|
| Malformed measurement values | Review required | `CTX_MALFORMED_VALUE` |
| Dominant cytotoxicity with `cytotoxicityBlockLevel = dominant_confounding` | Block handoff | `EPIW003_CYTOXICITY_CONFOUNDING` (error) |
| Missing cytotoxicity context with `blockOnMissingContext = true` | Block handoff | `EPI007_MISSING_CONFOUNDING_CONTEXT` |
| Negative viability values | Review required | `CTX_MALFORMED_VALUE` |

**v0.2 limitation note:** Under the default policy, dominant cytotoxicity emits warnings but may still produce a handoff. A regulator may tighten the policy (e.g., set `cytotoxicityBlockLevel = likely_confounding`) and re-run qualification; the engine will then block accordingly.

---

## 9. What v0.2 Does Not Do

1. **No inference from epigenomic signal** — Cytotoxicity is never inferred from methylation patterns, accessibility changes, or expression shifts.
2. **No dose-response modelling of viability** — The service classifies confounding; it does not fit viability dose-response curves.
3. **No cell-death mechanism dissection** — Apoptosis vs. necrosis is recorded but not mechanistically interpreted.
4. **No integration with apical endpoints** — Adversity determination requires external toxicological data.

---

## 10. What Is Not Inferred

1. A viability of 0.85 does not prove absence of cytotoxicity; it means the measured viability assay did not detect it.
2. Stress flags are contextual markers, not proof of a specific stress pathway activation.
3. Missing context means "cannot assess," not "no cytotoxicity."
4. Concurrent measurement is preferred but does not guarantee the same cells experienced the same stress.

---

*See also: [cell-composition-confounding-guide.md](cell-composition-confounding-guide.md) for cell-composition confounding, [interpretation-limits.md](interpretation-limits.md) for claim boundaries.*
