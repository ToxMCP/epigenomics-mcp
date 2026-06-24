#!/usr/bin/env python3
"""Track-B scientific-invariants gate (vendored schema-spine engine).

Projects each RELEASED epigenomics-mcp ``BioactivityPoDHandoffPacket`` onto its
canonical ToxMCP schema-spine bioactivity/PoD shapes, runs the vendored,
digest-pinned spine policy engine over the projection via a fail-closed Node
bridge, aggregates every blocking finding, and EXITS NON-ZERO if any
public-release-blocking code fires.

epigenomics-mcp is deterministic, non-LLM, and emits a screening-only,
"no-BER-or-final-risk-decision" feature-qualification handoff, so on the PRISTINE
corpus this gate is GREEN. Its job is to BLOCK if a future change ever lets one of
these regressions into a released handoff packet:

Before projecting each packet, the gate validates the raw source against the
producer's STRICT emission contract (the additionalProperties:false JSON schema /
.strict() Zod) and BLOCKS a contract-violating packet as SOURCE_CONTRACT_VIOLATION
WITHOUT projecting it — every advertised scientific code is therefore proven to bite
on a fault that is itself VALID against that strict contract (a real producer-
emittable packet), never on a hand-crafted schema-invalid fixture.

  Scientific (from the engine, the dedicated bioactivity/PoD code family — each
  triggered by a DECLARED field the strict emission contract can carry):
    BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY  (bioactivity != adversity / risk /
        regulatory; a surviving heritable/transgenerational claim — declared root
        ``heritabilityClaim`` enum — surfaces here)
    BIOACTIVITY_NOT_ADVERSITY                     (a surviving heritable/
        transgenerational ``heritabilityClaim`` is an adversity-grade escalation the
        feeder may not pre-authorize -> allowed_with_review transition)
    CYTOTOXICITY_CONFOUNDS_POD                    (declared nested
        ``qualifiedFeatures[].warnings[].category == cytotoxicity`` on a
        dose-response-ready feature)
    BATCH_EFFECT_NOT_BOUND                        (declared ``...warnings[].category
        == batch_effect``)
    CONTROL_FAILURE_BLOCKS_HANDOFF                (declared blocking control-context
        warning, ``...warnings[].blocksDownstream == true``)
    POD_READINESS_WITH_BLOCKERS                   (declared blocking nested warning on
        a dose-response-ready feature)

  DROPPED — producer-emission-contract DEAD ARMS (ADR 0001):
    POD_OUTSIDE_APPLICABILITY_DOMAIN, POD_APPLICABILITY_STATUS_REQUIRED — could only
        fire from a root ``applicabilityDomainStatus`` field; and
    POD_READINESS_REQUIRES_CONFIDENCE_CEILING — could only fire by emptying the
        ceiling refs via a root ``decisionBoundary`` field. The handoff schema is
        additionalProperties:false at root, so .strict() rejects BOTH fields — the
        producer never emits them, so these codes bit only on a schema-INVALID
        fixture, never on a real packet. They are now subsumed by the upstream
        SOURCE_CONTRACT_VIOLATION guard (a smuggled undeclared root field fails the
        emission contract before projection). Re-introduce only if a future release
        adds a GENUINE declared field to the emission schema + Zod.

  Intentionally NOT advertised (see ADR 0001, "advertised == actual coverage"):
    INSUFFICIENT_CONCENTRATION_RESPONSE, BIOLOGICAL_REPLICATE_COUNT_REQUIRED,
    PSEUDOREPLICATION_INFLATES_SUPPORT, CONCENTRATION_BASIS_MISMATCH
        — these key on a POSITIVE NUMERIC dose-level / replicate count. The released
        handoff packet carries no such numeric magnitude (it lives upstream in the
        EpigenomicsFeatureResponsePacket; the handoff schema is
        additionalProperties:false and its only numeric-ish fields are free-text
        observedValue/thresholdValue strings the positive-evidence rule rejects).
        They are structurally unreachable through this packet shape.
    POD_MODEL_DIAGNOSTICS_REQUIRED — keys on a *ready* PoD regime this screening
        feeder never enters (its risk/regulatory arm stays guarded LIVE by
        BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY).
    The AI-provenance codes (AI_GENERATED_POD_REQUIRES_DOMAIN_REVIEW,
        AI_MODEL_IDENTITY_REQUIRED, AI_UNKNOWN_WITH_PUBLIC_RELEASE,
        HUMAN_REVIEW_REQUIRED_FOR_PUBLIC_AI_ASSESSMENT, USABLE_HUMAN_REVIEW_REQUIRED,
        AI_USE_NONE_WITH_MODEL_TRACE, AI_RECORD_FREE_TEXT_OVERCLAIM,
        MODEL_IDENTITY_IS_NOT_VALIDATION) — DROPPED. epigenomics-mcp is
        deterministic / non-LLM and the released BioactivityPoDHandoffPacket
        (additionalProperties:false) carries NO AI / model-use / LLM / provenance-of-
        generation field, so no real source fault can ever make the AI arm dispatch:
        aiUse was hardcoded "none". An AI code that can only "fire" by mutating the
        PROJECTED object (not a real source packet) is a DEAD ARM and is not
        advertised. The AssessmentRun projection is dropped with it (see ADR 0001).

  Meta fail-closed (synthesized by the source-contract guard / bridge / projection):
    SOURCE_CONTRACT_VIOLATION, ENGINE_UNAVAILABLE, UNRECOGNIZED_SPINE_SCHEMA_ID,
    VENDOR_DIGEST_MISMATCH, PROJECTION_INCOMPLETE

This gate is ADVISORY on the free-plan private repo (no required-status-checks on
private repos). PROMOTE-TO-BLOCKING PATH: when the repo moves to a plan with branch
protection / rulesets (Team/Pro or public), mark the ``scientific-invariants`` CI
job a required status check — the gate already exits non-zero on any blocking code,
so no script change is needed.

Exit codes:
    0 — every projected object passed the engine (no blocking code fired)
    1 — at least one blocking code fired (release-blocking regression)
    2 — usage / corpus-loading error
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "src"))

from epigenomics_mcp.governance import project_to_spine as projector  # noqa: E402
from epigenomics_mcp.governance import source_contract  # noqa: E402
from epigenomics_mcp.governance import spine_bridge as bridge  # noqa: E402
from epigenomics_mcp.governance.errors import (  # noqa: E402
    PROJECTION_INCOMPLETE,
    BlockingFinding,
    ProjectionIncompleteError,
)

# The released-object corpus: committed handoff examples + authored golden
# fixtures (relative to repo root).
DEFAULT_CORPUS: tuple[str, ...] = (
    "examples/bioactivity_pod_handoff_valid/accepted.json",
    "examples/bioactivity_pod_handoff_valid/accepted_with_warnings.json",
    "examples/bioactivity_pod_handoff_valid/excluded.json",
    "examples/bioactivity_pod_handoff_valid/exploratory_only.json",
    "tests/fixtures/governance/golden_pass_handoff.json",
)

# The public-release-blocking scientific codes this gate asserts on. (Meta codes
# from errors.META_FAIL_CLOSED_CODES — including SOURCE_CONTRACT_VIOLATION — are
# ALWAYS blocking and need no listing.)
#
# RULE: advertise a scientific code ONLY when its trigger is a field the producer's
# STRICT emission contract (additionalProperties:false JSON schema / .strict() Zod)
# CAN carry, so the code bites on a PRODUCER-CONTRACT-VALID fault — not merely on a
# hand-crafted schema-INVALID fixture. Every code below is proven to bite end-to-end
# from a real, schema-VALID source mutation on a DECLARED field (see the adversarial
# suite, each asserted Ajv/jsonschema-VALID against the strict emission schema).
#
# DROPPED in this commit (producer-emission-contract DEAD ARMS — see ADR 0001):
#   POD_OUTSIDE_APPLICABILITY_DOMAIN, POD_APPLICABILITY_STATUS_REQUIRED
#       — both can only fire from a root ``applicabilityDomainStatus`` field;
#   POD_READINESS_REQUIRES_CONFIDENCE_CEILING
#       — can only fire by emptying the confidenceCeilingRefs, which on a
#         producer-emitted packet always carry the standing canonical non-claim
#         boundary ref; the only way to suppress it is a root ``decisionBoundary``
#         field.
#   The handoff schema is additionalProperties:false at root, so NEITHER
#   ``applicabilityDomainStatus`` NOR ``decisionBoundary`` can appear on a packet the
#   producer emits (.strict() rejects them). These three codes therefore bit only on
#   a schema-INVALID fixture and NEVER on a real producer-emitted packet — DEAD ARMS.
#   They are now caught upstream as SOURCE_CONTRACT_VIOLATION (a smuggled undeclared
#   root field fails the emission contract before any projection). Deterministic N/A.
#   RE-INTRODUCTION PATH: if a future release adds a GENUINE declared
#   ``applicabilityDomainStatus`` / ``decisionBoundary`` field to the emission schema
#   + Zod, re-derive the projection FROM that declared field and re-advertise the
#   code — only then will it bite on a contract-valid fault.
BLOCKING_SCIENTIFIC_CODES: frozenset[str] = frozenset(
    {
        # anti-overclaim — bioactivity != adversity / risk / regulatory
        # (declared root ``heritabilityClaim`` enum surfaces the overclaim)
        "BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY",
        "BIOACTIVITY_NOT_ADVERSITY",
        # control / batch / cytotoxicity (declared nested
        # ``qualifiedFeatures[].warnings[].category`` + ``blocksDownstream``)
        "CONTROL_FAILURE_BLOCKS_HANDOFF",
        "BATCH_EFFECT_NOT_BOUND",
        "CYTOTOXICITY_CONFOUNDS_POD",
        # readiness (declared nested blocking warnings on a ready feature)
        "POD_READINESS_WITH_BLOCKERS",
    }
)


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _project_objects(
    source: dict[str, Any], rel_path: str
) -> list[tuple[str, dict[str, Any]]]:
    """Project one released handoff packet into its spine objects.

    A BioactivityPoDHandoffPacket projects to its PointOfDepartureRecord +
    BioactivityObservation + ConcentrationResponseDesign + ClaimTransitionPolicy +
    BioactivityPodReadiness. Returns (label, projected_object) pairs.

    No AssessmentRun is projected: the released packet carries no AI / model-use /
    provenance-of-generation field (additionalProperties:false), so the spine's
    AI-provenance arm is N/A here and is not advertised (ADR 0001).
    """
    if source.get("schemaName") != projector.HANDOFF_SCHEMA_NAME:
        raise ProjectionIncompleteError(
            f"Unsupported released schemaName {source.get('schemaName')!r} in corpus item.",
        )
    pid = projector._packet_id(source)
    obs_ref = f"epigenomics:obs:{pid}"
    pod_ref = f"epigenomics:pod:{pid}"
    return [
        (f"{rel_path}#pod", projector.project_pod_record(source, pod_id=pod_ref, source_observation_ref=obs_ref)),
        (f"{rel_path}#observation", projector.project_bioactivity_observation(source, obs_id=obs_ref)),
        (
            f"{rel_path}#concentrationResponseDesign",
            projector.project_concentration_response_design(source, observation_ref=obs_ref),
        ),
        (f"{rel_path}#claimTransitionPolicy", projector.project_claim_transition_policy(source)),
        (
            f"{rel_path}#readiness",
            projector.project_pod_readiness(source, pod_ref=pod_ref, observation_ref=obs_ref),
        ),
    ]


def run_gate(corpus: list[str], *, emit_json: bool = False) -> int:
    findings: list[tuple[str, BlockingFinding]] = []
    checked = 0
    for rel in corpus:
        path = REPO_ROOT / rel
        if not path.exists():
            print(f"[scientific-invariants] FAIL: corpus file missing: {rel}", file=sys.stderr)
            return 2
        source = _load(path)

        # FAIL-CLOSED SOURCE-CONTRACT VALIDATION (template step 1): validate the raw
        # packet against the producer's STRICT emission contract BEFORE projecting.
        # A packet that fails the contract — including any undeclared / schema-
        # forbidden root field (the schema is additionalProperties:false) — is a
        # SOURCE_CONTRACT_VIOLATION that BLOCKS and is NEVER projected / safe-
        # defaulted. This closes the producer-emission-contract dead-arm class: a
        # "fault" that could only fire a scientific code by smuggling a schema-
        # forbidden field is caught here as a contract violation instead.
        contract_finding = source_contract.validate_source_packet(source, corpus=rel)
        if contract_finding is not None:
            findings.append((rel, contract_finding))
            continue

        try:
            projected = _project_objects(source, rel)
        except ProjectionIncompleteError as exc:
            findings.append(
                (
                    rel,
                    BlockingFinding.meta(
                        PROJECTION_INCOMPLETE, exc.message, path=exc.path, corpus=rel
                    ),
                )
            )
            continue

        for label, obj in projected:
            checked += 1
            result = bridge.validate_object(obj)
            for finding in result.findings:
                findings.append((label, finding))

    blocking = [
        (label, f)
        for (label, f) in findings
        if f.origin == "meta" or f.code in BLOCKING_SCIENTIFIC_CODES
    ]

    if emit_json:
        print(
            json.dumps(
                {
                    "checkedObjects": checked,
                    "blocking": [
                        {"object": label, **f.as_dict()} for (label, f) in blocking
                    ],
                    "allFindings": [
                        {"object": label, **f.as_dict()} for (label, f) in findings
                    ],
                },
                indent=2,
            )
        )

    if blocking:
        print(
            f"[scientific-invariants] BLOCK — {len(blocking)} release-blocking "
            f"finding(s) across {checked} projected object(s):",
            file=sys.stderr,
        )
        for label, f in blocking:
            print(f"  - [{f.origin}] {f.code} @ {label} {f.path}: {f.message}", file=sys.stderr)
        return 1

    print(
        f"[scientific-invariants] OK — {checked} projected object(s) passed the "
        f"vendored spine policy engine (no release-blocking code fired).",
        file=sys.stderr,
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--corpus",
        nargs="*",
        default=list(DEFAULT_CORPUS),
        help="Released handoff JSON files to project + validate (default: the standard corpus).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit a machine-readable JSON report to stdout.",
    )
    args = parser.parse_args(argv)
    return run_gate(args.corpus, emit_json=args.json)


if __name__ == "__main__":
    raise SystemExit(main())
