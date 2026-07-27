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

Add a **blocking** Track-B scientific-invariants gate:

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
   `BioactivityPoDHandoffPacket` projects into five spine objects —
   `PointOfDepartureRecord`, `BioactivityObservation`,
   `ConcentrationResponseDesign`, `ClaimTransitionPolicy`,
   `BioactivityPodReadiness`. (No `AssessmentRun` / AI-provenance arm is
   projected — see the dead-arm discipline below.) Every projected field is DERIVED
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
     in the `doseResponseReadySubset`. (The applicability codes themselves are now
     DROPPED as dead arms — see below — because their *override* trigger
     `applicabilityDomainStatus` is an undeclared root field the strict contract
     rejects; the `inside`-earning logic remains as the contract-valid default.)

5. **Fail-closed SOURCE-CONTRACT validation, BEFORE projection**
   (`src/epigenomics_mcp/governance/source_contract.py`,
   `SOURCE_CONTRACT_VIOLATION`). At the TOP of `run_gate`, before projecting each
   corpus/source packet, the raw packet is validated against the producer's STRICT
   emission contract — the `additionalProperties:false` JSON schema
   `schemas/current/bioactivity-pod-handoff-packet.json` (the `.strict()` Zod mirror
   `BioactivityPoDHandoffPacketSchema`). A packet that FAILS the contract — including
   ANY undeclared / schema-forbidden root or nested field — is a
   `SOURCE_CONTRACT_VIOLATION` that BLOCKS (exit 1) and is **never projected /
   safe-defaulted**. The validator is a self-contained, dependency-free Draft-07
   *subset* checker (the schema's `$schema`) covering exactly the keywords the
   emission schema uses; a schema it cannot fully enforce is itself a hard block (it
   refuses to under-validate). This guard is the structural fix for the
   producer-emission-contract DEAD-ARM class (below): a "fault" that could only fire a
   scientific code by carrying a schema-forbidden field is caught here as a contract
   violation, so the dead-arm class cannot silently return. It is an advertised meta
   fail-closed code alongside `ENGINE_UNAVAILABLE` /
   `UNRECOGNIZED_SPINE_SCHEMA_ID` / `VENDOR_DIGEST_MISMATCH` / `PROJECTION_INCOMPLETE`.

6. **Blocking CI job** (`.github/workflows/scientific-invariants.yml`, Node 20+22 ×
   Python 3.12): `vendor:verify` first, then the gate on the pristine corpus, then
   the adversarial self-tests. The public repository ruleset requires both matrix
   checks on `main`; local and release-evidence generation also fail closed.

## Advertised == actual coverage (the dead-arm discipline)

For **every** advertised public-release-blocking code, the projection emits the
shape the engine dispatches that code on, and a self-test proves it BITES on a fault
packet that is itself **VALID against the producer's strict emission contract** (a
real producer-emittable packet — Ajv/jsonschema VALID against the
`additionalProperties:false` schema), injected on a **DECLARED** source field:
clean → inject-real-declared-field → attributed red → revert → green. The advertised
blocking set is the six LIVE codes:

| code | dispatched shape | DECLARED source field the contract-valid fault uses |
| --- | --- | --- |
| `BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY` | PointOfDepartureRecord | a surviving `heritabilityClaim: heritable`/`transgenerational` (declared root enum) surfaced into `allowedDownstreamUses` |
| `BIOACTIVITY_NOT_ADVERSITY` | ClaimTransitionPolicy | a surviving `heritabilityClaim: heritable`/`transgenerational` (declared root enum) → `allowed_with_review` transition |
| `CYTOTOXICITY_CONFOUNDS_POD` | ConcentrationResponseDesign + BioactivityObservation | declared nested `qualifiedFeatures[].warnings[].category: cytotoxicity` on a dose-response-ready feature |
| `BATCH_EFFECT_NOT_BOUND` | BioactivityObservation | declared nested `qualifiedFeatures[].warnings[].category: batch_effect` |
| `CONTROL_FAILURE_BLOCKS_HANDOFF` | ConcentrationResponseDesign + BioactivityObservation | declared nested blocking `cell_composition`/`stress_response`-category warning (`blocksDownstream: true`) |
| `POD_READINESS_WITH_BLOCKERS` | BioactivityPodReadiness | declared nested blocking warning on the dose-response-ready feature itself |

Every advertised code BITES end-to-end from a **real, producer-contract-VALID
source-packet** mutation on a DECLARED field (not a projected-object mutation, not a
schema-forbidden field injection). No advertised code is structurally unreachable.

### DROPPED — producer-emission-contract DEAD ARMS (the defect fixed here)

The original gate advertised three codes whose only source trigger is a **root field
the producer's STRICT emission contract cannot carry**, so each bit only on a
hand-crafted, schema-INVALID fixture and NEVER on a packet the real producer emits —
a producer-emission-contract DEAD ARM. The `.strict()` Zod object / root
`additionalProperties:false` JSON schema reject these fields, so the new
SOURCE-CONTRACT guard catches any packet carrying them as `SOURCE_CONTRACT_VIOLATION`
*before* projection. We DROP all three from `BLOCKING_SCIENTIFIC_CODES`:

| dropped code | dead source trigger (UNDECLARED root field) | deterministic N/A reason |
| --- | --- | --- |
| `POD_OUTSIDE_APPLICABILITY_DOMAIN` | `applicabilityDomainStatus` | not in the emission schema; `.strict()` rejects it. On a contract-valid packet the projected `applicabilityDomainStatus` is only ever `inside` (earned from an accepted, dose-response-ready feature `status`) or ABSENT-with-no-actionable-PoD — never `outside`. |
| `POD_APPLICABILITY_STATUS_REQUIRED` | `applicabilityDomainStatus` (disguised) | same field; a disguised value could only be supplied by declaring the forbidden root field. A contract-valid actionable PoD always earns `inside`. |
| `POD_READINESS_REQUIRES_CONFIDENCE_CEILING` | `decisionBoundary` | not in the emission schema; `.strict()` rejects it. The only way to empty `confidenceCeilingRefs` is to declare a disguised `decisionBoundary` that suppresses the standing canonical non-claim boundary ref. A contract-valid packet always carries that canonical ref, so the code can never fire. |

A self-test pins their absence from the advertised set, and a regression test proves
the SOURCE-CONTRACT guard REJECTS a forbidden-field packet (root *and* nested)
fail-closed, so the dead-arm class cannot silently return.

**Re-introduction path:** if a future release adds a GENUINE declared
`applicabilityDomainStatus` / `decisionBoundary` field to the emission schema + Zod
(`.strict()`) contract, re-derive the projection FROM that declared field and
re-advertise the code — only then will it bite on a producer-contract-valid fault.

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
- **The AI-provenance code family** — `AI_GENERATED_POD_REQUIRES_DOMAIN_REVIEW`,
  `AI_MODEL_IDENTITY_REQUIRED`, `AI_UNKNOWN_WITH_PUBLIC_RELEASE`,
  `HUMAN_REVIEW_REQUIRED_FOR_PUBLIC_AI_ASSESSMENT`, `USABLE_HUMAN_REVIEW_REQUIRED`,
  `AI_USE_NONE_WITH_MODEL_TRACE`, `AI_RECORD_FREE_TEXT_OVERCLAIM`,
  `MODEL_IDENTITY_IS_NOT_VALIDATION`. **epigenomics-mcp is deterministic / non-LLM**
  (rule-based feature qualification; no model inference anywhere in `src/`), and the
  released `BioactivityPoDHandoffPacket` carries **NO AI / model-use / LLM /
  provenance-of-generation field** — the schema is `additionalProperties:false` at
  the root and in `provenance`, whose only audit fields are deterministic pipeline
  steps (`toolName`/`toolVersion`/…). An `AssessmentRun` projection would therefore
  have to **hardcode `aiUse:"none"`**: no real source field could ever set it
  otherwise, so the spine AI codes could only "fire" by mutating the *projected
  object*, never on a real source fault. **That is a dead arm.** These codes were
  previously advertised-but-dead (the bioactivity-pod dead-arm lesson recurring); we
  HONEST-DROP the whole AI arm — the codes are removed from
  `BLOCKING_SCIENTIFIC_CODES`, the `project_assessment_run` projection is deleted, and
  no `AssessmentRun` golden fixtures are emitted. A test pins both their absence from
  the advertised set and the structural fact that the schema cannot carry an
  AI/model-use field. **Re-introduction path:** if a future release ever emits a
  genuine AI/model-use field in the handoff packet, re-add `project_assessment_run`
  deriving `aiUse`/`modelUseRecords`/`humanReviewRecords` *from that source field* and
  re-advertise the AI codes — only then will they bite on a real source fault.

## Consequences

- The gate is GREEN on the pristine corpus (the four committed
  `bioactivity_pod_handoff_valid/*.json` examples + the authored golden PASS
  fixture; 25 projected objects). Every corpus packet is now also VALID against the
  producer's strict emission contract — the authored golden PASS fixture, which
  previously carried the now-forbidden `applicabilityDomainStatus` / `decisionBoundary`
  root fields (the symptom of the dead arm), was corrected to a real
  producer-emittable packet; its projection is byte-identical (those fields never
  affected the contract-valid projection). It BLOCKS only on a real regression.
- The source-contract guard, like the rest of the gate, uses only the Python
  standard library (the dependency-free Draft-07 subset validator), so the advisory
  CI job still does not need the heavy `epigenomics_mcp` runtime dependency stack.
- Faithful blocker scoping: a blocking caveat about an *excluded* feature does NOT
  block the readiness of the qualified dose-response-ready subset (proven by the
  `excluded.json` / `exploratory_only.json` fixtures passing).
- The gate uses only the Python standard library + the vendored Node engine, so the
  CI job does not need the heavy `epigenomics_mcp` runtime dependency stack.
