# ADR 0001 — Track-B scientific-invariants gate (vendored schema-spine)

Status: Accepted
Date: 2026-06-24

## Context

epigenomics-mcp is an S2 omics feeder: it qualifies processed epigenomic features
(DNA-methylation arrays, etc.) and emits a `BioactivityPoDHandoffPacket` — a
dose-response-ready handoff for the downstream Bioactivity-PoD / WoE orchestrator.
The repo already validates that handoff packet against its committed JSON Schema
(the `handoff-validation` and `conformance` workflows). Schema validation proves
the packet is *well-formed*; it does not prove the packet is *scientifically
non-overclaiming*.

The ToxMCP schema-spine carries a dedicated bioactivity/PoD policy code family
(anti-overclaim, control/batch/cytotoxicity adequacy, applicability, readiness,
AI-provenance). That engine dispatches **solely on `payload.schemaId`**. Our
released object is keyed `schemaName: "BioactivityPoDHandoffPacket"` and shares
nothing with the spine's bioactivity/PoD shapes, so running the engine on a raw
handoff packet is a silent `valid:true` no-op. The gate's correctness therefore
lives in a faithful **projection** from our packet onto the spine shapes.

This is the third repo on the proven Track-B pattern (after ivive-ber and
bioactivity-pod-mcp).

## Decision

Add an **advisory** Track-B scientific-invariants gate:

1. **Vendor** the schema-spine policy engine, digest-pinned at
   `gitSha e0a6a05` (the same pin all Track-B pilots used), under
   `vendor/schema-spine/` with a `VENDORED_FROM.json` sha256 manifest.
   `scripts/vendor_verify.py` (npm `vendor:verify`) recomputes every digest and
   hard-fails on tamper / drift / untracked file.

2. **Fail-closed bridge** (`src/epigenomics_mcp/governance/spine_bridge.py`): shells
   to the vendored Node CLI and turns every failure mode into a BLOCKING synthetic
   finding — missing `node` / non-zero exit / empty-or-unparseable stdout / timeout
   → `ENGINE_UNAVAILABLE`; vendored-file digest mismatch → `VENDOR_DIGEST_MISMATCH`
   (checked *before* the engine runs); an unrecognized projected `schemaId` →
   `UNRECOGNIZED_SPINE_SCHEMA_ID` (closing the engine's silent `valid:true` no-op).

3. **Total, deterministic projection**
   (`src/epigenomics_mcp/governance/project_to_spine.py`): one
   `BioactivityPoDHandoffPacket` projects into six spine objects —
   `PointOfDepartureRecord`, `BioactivityObservation`,
   `ConcentrationResponseDesign`, `ClaimTransitionPolicy`,
   `BioactivityPodReadiness`, `AssessmentRun`. Every projected field is DERIVED
   from the source; an unmapped enum / unsupported schemaName raises
   `ProjectionIncompleteError` (a BLOCK). The projected objects are committed as
   golden fixtures (`tests/fixtures/governance/spine_projection/`) so the lossy
   mapping is reviewable line-by-line; a regression test asserts byte-for-byte
   match, and `scripts/generate_spine_projection_golden.py` regenerates them.

4. **The non-negotiable positive-evidence rule.** A "substantive" ceiling /
   applicability / confounding ref is minted ONLY from evidence a disguised string
   cannot fake:
   - **STRUCTURED** — a warning / caveat is a `dict` carrying recognized meaningful
     content (the dict SHAPE is positive evidence a bare string cannot fake); the
     cytotoxicity / batch / control signals are derived ONLY from the structured
     `warnings[].category` enum + `severity` / `blocksDownstream` booleans, never
     from a free-text `message`;
   - **CANONICAL** — the non-claim decision boundary mints a ceiling ref only on a
     `>=2`-anchor canonical match, NFKD-normalized so a genuinely decorated constant
     (combining diacritics / Unicode dashes / zero-width) is still RECOGNIZED while
     a distinct-script HOMOGLYPH or LEETSPEAK cannot FORGE one;
   - the applicability `inside` status is earned ONLY from a genuine
     `accepted_for_pod` / `accepted_with_caveats` feature `status` enum that is also
     in the `doseResponseReadySubset` — a disguised free-text
     `applicabilityDomainStatus` value is treated as a refusal-to-declare (left
     ABSENT) and cannot forge an `inside` pass.

5. **Advisory CI job** (`.github/workflows/scientific-invariants.yml`, Node 20+22 ×
   Python 3.12): `vendor:verify` first, then the gate on the pristine corpus, then
   the adversarial self-tests. Advisory because the ToxMCP org is on the GitHub
   Free plan (branch-protection / rulesets 403 on private repos). Promote-to-blocking
   path: mark the job a required status check once the repo moves to Team/Pro or
   public — the gate already exits non-zero on any blocking code.

## Advertised == actual coverage (the dead-arm discipline)

For **every** advertised public-release-blocking code, the projection emits the
shape the engine dispatches that code on, and a self-test proves it BITES on a real
structured fault (clean → inject → attributed red → revert → green). The advertised
blocking set is:

| code | dispatched shape | fault that bites |
| --- | --- | --- |
| `BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY` | PointOfDepartureRecord | a risk/regulatory/adversity downstream-use token, or a surviving `heritable`/`transgenerational` claim, surfaced into `allowedDownstreamUses` |
| `BIOACTIVITY_NOT_ADVERSITY` | ClaimTransitionPolicy | a structured `claimTransition` authorizing bioactivity→adversity (`allowed`), or a surviving heritability claim (`allowed_with_review`) |
| `CYTOTOXICITY_CONFOUNDS_POD` | ConcentrationResponseDesign + BioactivityObservation | a `cytotoxicity`-category warning on a dose-response-ready feature |
| `BATCH_EFFECT_NOT_BOUND` | BioactivityObservation | a `batch_effect`-category warning |
| `CONTROL_FAILURE_BLOCKS_HANDOFF` | ConcentrationResponseDesign + BioactivityObservation | a blocking `cell_composition`/`stress_response`-category warning |
| `POD_OUTSIDE_APPLICABILITY_DOMAIN` | PointOfDepartureRecord | a declared `applicabilityDomainStatus: outside` |
| `POD_APPLICABILITY_STATUS_REQUIRED` | PointOfDepartureRecord | a disguised (non-enum) applicability value → field left ABSENT |
| `POD_READINESS_WITH_BLOCKERS` | BioactivityPodReadiness | a blocking warning on the dose-response-ready feature itself |
| `POD_READINESS_REQUIRES_CONFIDENCE_CEILING` | BioactivityPodReadiness | a disguised non-claim boundary → no ceiling ref (the disguise battery) |
| `AI_GENERATED_POD_REQUIRES_DOMAIN_REVIEW` (+ AI family) | AssessmentRun | a FORWARD relabel to `aiUse: generated` with no domain review |

### Intentionally NOT advertised (structurally unreachable)

- `INSUFFICIENT_CONCENTRATION_RESPONSE`, `BIOLOGICAL_REPLICATE_COUNT_REQUIRED`,
  `PSEUDOREPLICATION_INFLATES_SUPPORT`, `CONCENTRATION_BASIS_MISMATCH` — these key on
  a **positive numeric** dose-level / replicate count. The released
  `BioactivityPoDHandoffPacket` carries no such numeric magnitude: the design counts
  live upstream in the `EpigenomicsFeatureResponsePacket`, the handoff schema is
  `additionalProperties:false`, and its only numeric-ish fields are the free-text
  `observedValue` / `thresholdValue` strings in `explainability` (which the
  positive-evidence rule rejects — a numeric-looking string can be disguised). The
  projection therefore floors `concentrationLevels`/`biologicalReplicates`/
  `concentrationBasis` at the engine's NON-firing branch and does NOT advertise these
  codes. Advertising a code the projection can never make the engine dispatch would be
  a DEAD ARM. A test pins their absence from the advertised set.
- `POD_MODEL_DIAGNOSTICS_REQUIRED` — keys on a *ready* PoD regime
  (`fit_for_prioritization` / risk/regulatory-ready / `decision_support`) this
  screening-stage feeder never enters by design; its risk/regulatory arm stays
  guarded LIVE by `BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY`.

## Consequences

- The gate is GREEN on the pristine corpus (the four committed
  `bioactivity_pod_handoff_valid/*.json` examples + the authored golden PASS
  fixture; 30 projected objects). It BLOCKS only on a real regression.
- Faithful blocker scoping: a blocking caveat about an *excluded* feature does NOT
  block the readiness of the qualified dose-response-ready subset (proven by the
  `excluded.json` / `exploratory_only.json` fixtures passing).
- The gate uses only the Python standard library + the vendored Node engine, so the
  CI job does not need the heavy `epigenomics_mcp` runtime dependency stack.
