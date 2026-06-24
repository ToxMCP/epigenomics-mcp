"""Adversarial self-tests for the Track-B scientific-invariants gate.

The pattern for each is clean -> fault (each test mutates a deep copy, never the
on-disk corpus). These PROVE the gate bites on real epigenomics-handoff regressions
and does not false-block the pristine corpus.

  (A)  domain anti-overclaim injection (risk/regulatory/adversity downstream use, or
       a surviving heritable/transgenerational claim) -> BIOACTIVITY_POD_NOT_RISK_OR_
       REGULATORY_READY; a pre-authorized bioactivity->adversity claim transition ->
       BIOACTIVITY_NOT_ADVERSITY.
  (A') a cytotoxicity/batch/control-confounded pod-ready feature -> CYTOTOXICITY_
       CONFOUNDS_POD / BATCH_EFFECT_NOT_BOUND / CONTROL_FAILURE_BLOCKS_HANDOFF, all
       from STRUCTURED warning categories + booleans.
  (A'')applicability: an out-of-domain status -> POD_OUTSIDE_APPLICABILITY_DOMAIN; a
       disguised free-text applicability value cannot forge an 'inside' pass ->
       POD_APPLICABILITY_STATUS_REQUIRED.
  (B)  AI-provenance gap (FORWARD): a producing AssessmentRun relabeled AI-assisted
       with no domain review -> AI_GENERATED_POD_REQUIRES_DOMAIN_REVIEW / etc.
  (C)  the DISGUISE BATTERY: None/empty/placeholder/Unicode-dash/combining-diacritic/
       HOMOGLYPH/leetspeak/zero-width on the non-claim boundary ALL mint NO ceiling
       ref BY CONSTRUCTION -> readiness BLOCKS with POD_READINESS_REQUIRES_CONFIDENCE_
       CEILING.
  (D)  fail-closed: engine-down / unrecognized-schema / digest-tamper / hollow.
  (E)  pristine corpus -> ALL PASS (no false block).

These require Node on PATH (the bridge shells to the vendored engine).
"""

from __future__ import annotations

import copy
import importlib.util
import json
import shutil
import sys
from pathlib import Path
from typing import Any

import pytest

from epigenomics_mcp.governance import project_to_spine as projector
from epigenomics_mcp.governance import spine_bridge as bridge
from epigenomics_mcp.governance.errors import (
    ENGINE_UNAVAILABLE,
    UNRECOGNIZED_SPINE_SCHEMA_ID,
    VENDOR_DIGEST_MISMATCH,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
ACCEPTED = REPO_ROOT / "examples" / "bioactivity_pod_handoff_valid" / "accepted.json"
GOLDEN_PASS = REPO_ROOT / "tests" / "fixtures" / "governance" / "golden_pass_handoff.json"

_node_required = pytest.mark.skipif(
    shutil.which("node") is None, reason="Node not available; the bridge requires it."
)


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def _reset_bridge_cache() -> None:
    bridge.recognized_schema_ids.cache_clear()


# --- (A) domain anti-overclaim (bioactivity != adversity / risk / regulatory) -


@pytest.mark.parametrize(
    "overclaim_use",
    [
        "risk_assessment",
        "regulatory_translation",
        "adversity_classification",
        "safety_decision",
        "adi_derivation",
        "reference_dose_setting",
        "derived_no_effect_level_handoff",
    ],
)
@_node_required
def test_a_pod_overclaim_blocks(overclaim_use: str) -> None:
    """A PoD authorizing a risk/regulatory/adversity downstream use BLOCKS."""
    src = copy.deepcopy(_load(ACCEPTED))
    pod = projector.project_pod_record(src, pod_id="adversarial-A", extra_allowed_uses=[overclaim_use])
    assert overclaim_use in pod["allowedDownstreamUses"], (
        "faithful projection must pass the source's overclaim through verbatim."
    )
    result = bridge.validate_object(pod)
    assert not result.valid
    assert "BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY" in result.blocking_codes


@pytest.mark.parametrize("claim", ["heritable", "transgenerational"])
@_node_required
def test_a_heritability_overclaim_blocks(claim: str) -> None:
    """A surviving heritable/transgenerational claim surfaces as a blocked downstream
    use -> BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["heritabilityClaim"] = claim
    pod = projector.project_pod_record(src, pod_id="adversarial-Aherit")
    assert any("adversity_claim" in u for u in pod["allowedDownstreamUses"])
    result = bridge.validate_object(pod)
    assert not result.valid
    assert "BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY" in result.blocking_codes


@_node_required
def test_a_pristine_pod_passes_overclaim_arm() -> None:
    """The pristine accepted packet's PoD passes the anti-overclaim arm."""
    pod = projector.project_pod_record(_load(ACCEPTED), pod_id="pristine-A")
    assert bridge.validate_object(pod).valid


# --- (A) bioactivity -> adversity claim transition ----------------------------


@_node_required
def test_a_claim_transition_to_adversity_blocks() -> None:
    """A pre-authorized bioactivity->adversity claim transition BLOCKS."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["claimTransition"] = {
        "sourceClaimClass": "bioactivity",
        "targetClaimClass": "adversity",
        "transitionStatus": "allowed",
        "requiredEvidenceRefs": ["evidence:1"],
        "requiredReviewState": "human_review_required",
    }
    ctp = projector.project_claim_transition_policy(src)
    assert ctp["transitionStatus"] == "allowed"
    result = bridge.validate_object(ctp)
    assert not result.valid
    assert "BIOACTIVITY_NOT_ADVERSITY" in result.blocking_codes


@_node_required
def test_a_pristine_claim_transition_is_blocked_and_passes() -> None:
    """A pristine feeder's claim transition is BLOCKED (passes the engine)."""
    ctp = projector.project_claim_transition_policy(_load(ACCEPTED))
    assert ctp["transitionStatus"] == "blocked"
    assert bridge.validate_object(ctp).valid


@pytest.mark.parametrize(
    "disguise",
    ["allowed-trust-me", "ALLOWED", "yes-allowed", "n/a", ""],
)
@_node_required
def test_a_disguised_transition_status_cannot_forge_escalation(disguise: str) -> None:
    """POSITIVE-EVIDENCE: a disguised transitionStatus is not a recognized enum, so
    it leaves the transition BLOCKED (passes) — a string cannot forge an escalation."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["claimTransition"] = {"transitionStatus": disguise}
    ctp = projector.project_claim_transition_policy(src)
    assert ctp["transitionStatus"] == "blocked"
    assert bridge.validate_object(ctp).valid


# --- (A') cytotoxicity / batch / control (STRUCTURED warning categories) -------


def _feature_with_warning(category: str, *, blocks: bool, feature_id: str = "cg_accepted_001") -> dict[str, Any]:
    return {
        "warningCode": f"EPI_{category.upper()}",
        "severity": "error" if blocks else "warning",
        "message": "structured warning",
        "category": category,
        "featureIds": [feature_id],
        "blocksDownstream": blocks,
    }


@_node_required
def test_aprime_cytotoxicity_confounds_pod_ready_blocks() -> None:
    src = copy.deepcopy(_load(ACCEPTED))
    src["qualifiedFeatures"][0]["warnings"] = [_feature_with_warning("cytotoxicity", blocks=False)]
    ccd = projector.project_concentration_response_design(src)
    assert ccd["cytotoxicityConfounding"] == "possible"
    assert "CYTOTOXICITY_CONFOUNDS_POD" in bridge.validate_object(ccd).blocking_codes
    obs = projector.project_bioactivity_observation(src)
    assert "CYTOTOXICITY_CONFOUNDS_POD" in bridge.validate_object(obs).blocking_codes


@_node_required
def test_aprime_batch_effect_not_bound_blocks() -> None:
    src = copy.deepcopy(_load(ACCEPTED))
    src["qualifiedFeatures"][0]["warnings"] = [_feature_with_warning("batch_effect", blocks=False)]
    obs = projector.project_bioactivity_observation(src)
    assert obs["batchEffectAssessment"] == "unresolved"
    assert "BATCH_EFFECT_NOT_BOUND" in bridge.validate_object(obs).blocking_codes


@_node_required
def test_aprime_control_failure_blocks() -> None:
    src = copy.deepcopy(_load(ACCEPTED))
    src["qualifiedFeatures"][0]["warnings"] = [_feature_with_warning("cell_composition", blocks=True)]
    ccd = projector.project_concentration_response_design(src)
    assert ccd["controlStatus"] == "failed"
    assert "CONTROL_FAILURE_BLOCKS_HANDOFF" in bridge.validate_object(ccd).blocking_codes
    obs = projector.project_bioactivity_observation(src)
    assert obs["controls"]["vehicle"] == "failed"
    assert "CONTROL_FAILURE_BLOCKS_HANDOFF" in bridge.validate_object(obs).blocking_codes


@_node_required
def test_aprime_pristine_pod_ready_passes_adequacy_arm() -> None:
    """The pristine accepted (pod-ready) feature passes the cytotox/batch/control arm."""
    src = _load(ACCEPTED)
    for proj in (
        projector.project_bioactivity_observation(src),
        projector.project_concentration_response_design(src),
    ):
        assert bridge.validate_object(proj).valid, proj["schemaId"]


@pytest.mark.parametrize(
    "field_message",
    [
        "this feature has cytotoxicity confounding",  # free-text in message, not category
        "batch effect detected",
        "controls failed",
    ],
)
@_node_required
def test_aprime_free_text_message_cannot_forge_confounding(field_message: str) -> None:
    """POSITIVE-EVIDENCE: a free-text message naming cytotoxicity/batch/controls in a
    NON-category field (here, a coordinate_semantics-category warning whose message
    merely mentions the words) supplies no recognized confounding category, so the
    pod-ready feature still PASSES the adequacy arm — only the structured `category`
    enum drives a block."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["qualifiedFeatures"][0]["warnings"] = [
        {
            "warningCode": "EPI_NOISE",
            "severity": "warning",
            "message": field_message,
            "category": "coordinate_semantics",
            "featureIds": ["cg_accepted_001"],
            "blocksDownstream": False,
        }
    ]
    obs = projector.project_bioactivity_observation(src)
    ccd = projector.project_concentration_response_design(src)
    assert obs["cytotoxicityConfounding"] == "ruled_out"
    assert obs["batchEffectAssessment"] == "not_detected"
    assert ccd["controlStatus"] == "passed"
    assert bridge.validate_object(obs).valid
    assert bridge.validate_object(ccd).valid


# --- (A'') applicability ------------------------------------------------------


@_node_required
def test_aprime2_out_of_domain_applicability_blocks() -> None:
    src = copy.deepcopy(_load(ACCEPTED))
    src["applicabilityDomainStatus"] = "outside"
    pod = projector.project_pod_record(src)
    assert pod.get("applicabilityDomainStatus") == "outside"
    assert "POD_OUTSIDE_APPLICABILITY_DOMAIN" in bridge.validate_object(pod).blocking_codes


@pytest.mark.parametrize(
    "disguise",
    [
        pytest.param("inside-trust-me", id="suffixed"),
        pytest.param("INSIDE", id="wrong-case"),
        pytest.param("definitely-inside", id="prefixed"),
        pytest.param("n/a", id="placeholder"),
        pytest.param("", id="empty"),
        pytest.param("   ", id="whitespace"),
    ],
)
@_node_required
def test_aprime2_disguised_applicability_cannot_forge_inside_pass(disguise: str) -> None:
    """POSITIVE-EVIDENCE: a disguised free-text applicability value is not a
    recognized enum, so it is treated as a refusal-to-declare (ABSENT) and an
    actionable PoD fires POD_APPLICABILITY_STATUS_REQUIRED."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["applicabilityDomainStatus"] = disguise
    pod = projector.project_pod_record(src)
    assert "applicabilityDomainStatus" not in pod
    res = bridge.validate_object(pod)
    assert not res.valid
    assert "POD_APPLICABILITY_STATUS_REQUIRED" in res.blocking_codes


@_node_required
def test_aprime2_accepted_feature_status_earns_inside() -> None:
    """A genuine accepted, dose-response-ready feature status earns 'inside' (positive
    structured evidence the `status` enum carries) -> the pristine PoD passes."""
    pod = projector.project_pod_record(_load(ACCEPTED))
    assert pod.get("applicabilityDomainStatus") == "inside"
    assert bridge.validate_object(pod).valid


# --- (B) AI-provenance gap (FORWARD tripwire) --------------------------------


@_node_required
def test_b_ai_assisted_run_without_domain_review_blocks() -> None:
    src = copy.deepcopy(_load(ACCEPTED))
    run = projector.project_assessment_run(src, run_id="adversarial-B")
    run["aiUse"] = "generated"
    run["humanReviewRecords"] = []
    result = bridge.validate_object(run)
    assert not result.valid
    assert any(
        code in result.blocking_codes
        for code in (
            "AI_GENERATED_POD_REQUIRES_DOMAIN_REVIEW",
            "HUMAN_REVIEW_REQUIRED_FOR_PUBLIC_AI_ASSESSMENT",
            "AI_MODEL_IDENTITY_REQUIRED",
        )
    )


@_node_required
def test_b_pristine_run_passes_ai_arm() -> None:
    run = projector.project_assessment_run(_load(ACCEPTED), run_id="pristine-B")
    assert run["aiUse"] == "none"
    assert bridge.validate_object(run).valid


# --- (B') readiness with blockers --------------------------------------------


@_node_required
def test_bprime_readiness_with_blocker_on_ready_feature_blocks() -> None:
    """A dose-response-ready feature that ALSO carries a blocking warning is a
    contradiction -> POD_READINESS_WITH_BLOCKERS."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["qualifiedFeatures"][0]["warnings"] = [_feature_with_warning("missing_metadata", blocks=True)]
    rdy = projector.project_pod_readiness(src)
    assert rdy["readinessStatus"] == "eligible"
    assert rdy["blockers"]
    assert "POD_READINESS_WITH_BLOCKERS" in bridge.validate_object(rdy).blocking_codes


@_node_required
def test_bprime_excluded_feature_caveat_does_not_block_ready_subset() -> None:
    """FAITHFUL SCOPING: a blocking caveat about an EXCLUDED feature does not block
    the readiness of the qualified dose-response-ready subset (the excluded.json
    pristine fixture passes)."""
    src = _load(REPO_ROOT / "examples" / "bioactivity_pod_handoff_valid" / "excluded.json")
    rdy = projector.project_pod_readiness(src)
    assert rdy["readinessStatus"] == "eligible"
    assert rdy["blockers"] == []
    assert bridge.validate_object(rdy).valid


# --- (C) the DISGUISE BATTERY (closed by construction) -----------------------

_DISGUISE_BOUNDARIES = [
    pytest.param("", id="empty"),
    pytest.param("   ", id="whitespace"),
    pytest.param("n/a", id="placeholder-na"),
    pytest.param("tbd", id="placeholder-tbd"),
    pytest.param("placeholder", id="placeholder-word"),
    pytest.param("nо-ber-or-final-risk-decision", id="homoglyph-cyrillic-o"),
    pytest.param("n0-b3r-0r-f1nal-r1sk-dec1s10n", id="leetspeak"),
    pytest.param("no-ber-or-final-screening-verdict", id="anchor-missing"),
    pytest.param("NoBerOrFinalRiskDecision", id="despaced-camelcase"),
    pytest.param("final risk decision authorized", id="single-anchor-only"),
    pytest.param("screening only context", id="unrelated-text"),
]


@pytest.mark.parametrize("boundary", _DISGUISE_BOUNDARIES)
def test_c_disguised_boundary_mints_no_ceiling_ref(boundary: Any) -> None:
    """Pure-Python: a DECLARED disguised non-claim boundary mints NO ceiling ref (the
    declared value wins over the canonical fallback, and it is neither structured nor
    a >=2-anchor canonical match). Strip all structured warnings/caveats first."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["decisionBoundary"] = boundary
    src["mandatoryCaveats"] = []
    for f in src.get("qualifiedFeatures", []) + src.get("excludedFeatures", []):
        f["warnings"] = []
    refs = projector._derive_ceiling_refs(src)
    assert refs == [], f"disguised boundary {boundary!r} fabricated ceiling ref {refs!r}"


@pytest.mark.parametrize("boundary", _DISGUISE_BOUNDARIES)
@_node_required
def test_c_disguised_boundary_blocks_readiness_end_to_end(boundary: Any) -> None:
    src = copy.deepcopy(_load(ACCEPTED))
    src["decisionBoundary"] = boundary
    src["mandatoryCaveats"] = []
    for f in src.get("qualifiedFeatures", []) + src.get("excludedFeatures", []):
        f["warnings"] = []
    rdy = projector.project_pod_readiness(src, readiness_id="adversarial-C")
    assert rdy["confidenceCeilingRefs"] == []
    result = bridge.validate_object(rdy)
    assert not result.valid
    assert "POD_READINESS_REQUIRES_CONFIDENCE_CEILING" in result.blocking_codes


@_node_required
def test_c_canonical_boundary_passes_readiness() -> None:
    """The REAL canonical boundary (declared OR the standing screening-feeder default)
    mints a ceiling ref and PASSES on merit."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["mandatoryCaveats"] = []
    for f in src.get("qualifiedFeatures", []) + src.get("excludedFeatures", []):
        f["warnings"] = []
    rdy = projector.project_pod_readiness(src, readiness_id="canonical-C")
    assert "ceiling:non_claim_boundary" in rdy["confidenceCeilingRefs"]
    assert bridge.validate_object(rdy).valid


def test_c_canonical_constant_matches_both_anchor_families() -> None:
    assert projector._matches_canonical_non_claim(projector._CANONICAL_NON_CLAIM_BOUNDARY)
    assert projector._matches_canonical_non_claim(projector._CANONICAL_HANDOFF_BOUNDARY)
    assert not projector._matches_canonical_non_claim("no-ber-or-final-screening-verdict")
    assert not projector._matches_canonical_non_claim("ber policy")
    assert not projector._matches_canonical_non_claim("nо-ber-or-final-risk-decision")  # cyrillic о
    assert not projector._matches_canonical_non_claim("n0-b3r-0r-f1nal-r1sk-dec1s10n")


def test_c_invisible_chars_in_genuine_constant_still_match() -> None:
    """PRINCIPLED robustness: a reviewer cannot BREAK a genuine canonical match by
    smuggling zero-width / NB-hyphen characters INTO the real constant."""
    zwsp = "no​-ber-or-final-risk-decision"
    nbhyphen = "no‑ber‑or‑final‑risk‑decision"
    assert projector._matches_canonical_non_claim(zwsp)
    assert projector._matches_canonical_non_claim(nbhyphen)


# --- (D) fail-closed ---------------------------------------------------------


def test_d_missing_node_blocks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bridge.shutil, "which", lambda _name: None)
    bridge.recognized_schema_ids.cache_clear()
    good = projector.project_pod_record(_load(ACCEPTED), pod_id="adversarial-D")
    result = bridge.validate_object(good)
    assert not result.valid
    assert ENGINE_UNAVAILABLE in result.blocking_codes


@_node_required
def test_d_unrecognized_schema_id_blocks() -> None:
    good = projector.project_pod_record(_load(ACCEPTED), pod_id="adversarial-D2")
    good["schemaId"] = "https://epigenomics-mcp/schemas/bioactivity-pod-handoff-packet.json"
    result = bridge.validate_object(good)
    assert not result.valid
    assert UNRECOGNIZED_SPINE_SCHEMA_ID in result.blocking_codes


@_node_required
def test_d_tampered_vendor_file_blocks(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    fake_vendor = tmp_path / "schema-spine"
    shutil.copytree(bridge._VENDOR_ROOT, fake_vendor)
    policy = fake_vendor / "policy-validator.mjs"
    policy.write_text(policy.read_text(encoding="utf-8") + "\n// tamper\n", encoding="utf-8")
    monkeypatch.setattr(bridge, "_VENDOR_ROOT", fake_vendor)
    monkeypatch.setattr(bridge, "_RUN_POLICY_CLI", fake_vendor / "run-policy.mjs")
    monkeypatch.setattr(bridge, "_INDEX_MJS", fake_vendor / "index.mjs")
    monkeypatch.setattr(bridge, "_VENDORED_FROM", fake_vendor / "VENDORED_FROM.json")
    bridge.recognized_schema_ids.cache_clear()
    good = projector.project_pod_record(_load(ACCEPTED), pod_id="adversarial-D3")
    result = bridge.validate_object(good)
    assert not result.valid
    assert VENDOR_DIGEST_MISMATCH in result.blocking_codes


@_node_required
def test_d_broken_engine_file_blocks(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    fake_vendor = tmp_path / "schema-spine"
    shutil.copytree(bridge._VENDOR_ROOT, fake_vendor)
    (fake_vendor / "run-policy.mjs").write_text("not valid javascript (((\n", encoding="utf-8")
    (fake_vendor / "VENDORED_FROM.json").unlink()
    monkeypatch.setattr(bridge, "_VENDOR_ROOT", fake_vendor)
    monkeypatch.setattr(bridge, "_RUN_POLICY_CLI", fake_vendor / "run-policy.mjs")
    monkeypatch.setattr(bridge, "_INDEX_MJS", fake_vendor / "index.mjs")
    monkeypatch.setattr(bridge, "_VENDORED_FROM", fake_vendor / "VENDORED_FROM.json")
    bridge.recognized_schema_ids.cache_clear()
    good = projector.project_pod_record(_load(ACCEPTED), pod_id="adversarial-D4")
    result = bridge.validate_object(good)
    assert not result.valid
    assert any(c in result.blocking_codes for c in (ENGINE_UNAVAILABLE, VENDOR_DIGEST_MISMATCH))


def test_d_unsupported_schema_name_raises_projection_incomplete() -> None:
    from epigenomics_mcp.governance.errors import ProjectionIncompleteError

    src = copy.deepcopy(_load(ACCEPTED))
    src["schemaName"] = "SomethingElsePacket"
    with pytest.raises(ProjectionIncompleteError):
        projector.project_pod_record(src, pod_id="adversarial-D5")


# --- (E) pristine corpus passes + golden projection match --------------------


def _load_gate() -> object:
    if str(REPO_ROOT / "src") not in sys.path:
        sys.path.insert(0, str(REPO_ROOT / "src"))
    spec = importlib.util.spec_from_file_location(
        "scientific_invariants_gate",
        REPO_ROOT / "scripts" / "scientific_invariants_gate.py",
    )
    assert spec and spec.loader
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    return gate


@_node_required
def test_e_pristine_corpus_all_pass() -> None:
    gate = _load_gate()
    assert gate.run_gate(list(gate.DEFAULT_CORPUS)) == 0  # type: ignore[attr-defined]


@_node_required
def test_e_golden_pass_fixture_passes() -> None:
    src = _load(GOLDEN_PASS)
    for o in (
        projector.project_pod_record(src),
        projector.project_bioactivity_observation(src),
        projector.project_concentration_response_design(src),
        projector.project_claim_transition_policy(src),
        projector.project_pod_readiness(src),
        projector.project_assessment_run(src),
    ):
        assert bridge.validate_object(o).valid, f"golden PASS object blocked: {o['schemaId']}"


def test_e_advertised_dead_arm_codes_are_not_advertised() -> None:
    """ADR 0001: the count/basis-keyed adequacy codes + POD_MODEL_DIAGNOSTICS_REQUIRED
    are structurally unreachable through the handoff-packet shape and MUST NOT be
    advertised (no dead arms)."""
    gate = _load_gate()
    for code in (
        "INSUFFICIENT_CONCENTRATION_RESPONSE",
        "BIOLOGICAL_REPLICATE_COUNT_REQUIRED",
        "PSEUDOREPLICATION_INFLATES_SUPPORT",
        "CONCENTRATION_BASIS_MISMATCH",
        "POD_MODEL_DIAGNOSTICS_REQUIRED",
    ):
        assert code not in gate.BLOCKING_SCIENTIFIC_CODES  # type: ignore[attr-defined]


def test_e_golden_projection_matches_committed_fixtures() -> None:
    """The live projection still matches the committed golden projection fixtures
    byte-for-byte (regenerate with scripts/generate_spine_projection_golden.py)."""
    out_dir = REPO_ROOT / "tests" / "fixtures" / "governance" / "spine_projection"
    corpus = {
        "accepted": "examples/bioactivity_pod_handoff_valid/accepted.json",
        "accepted_with_warnings": "examples/bioactivity_pod_handoff_valid/accepted_with_warnings.json",
        "excluded": "examples/bioactivity_pod_handoff_valid/excluded.json",
        "exploratory_only": "examples/bioactivity_pod_handoff_valid/exploratory_only.json",
        "golden_pass_handoff": "tests/fixtures/governance/golden_pass_handoff.json",
    }
    projections = {
        "pod": projector.project_pod_record,
        "observation": projector.project_bioactivity_observation,
        "concentrationResponseDesign": projector.project_concentration_response_design,
        "claimTransitionPolicy": projector.project_claim_transition_policy,
        "readiness": projector.project_pod_readiness,
        "assessmentRun": projector.project_assessment_run,
    }
    for stem, rel in corpus.items():
        packet = _load(REPO_ROOT / rel)
        for label, fn in projections.items():
            committed = (out_dir / f"{stem}__{label}.json").read_text(encoding="utf-8")
            live = json.dumps(fn(packet), indent=2, sort_keys=True) + "\n"
            assert live == committed, (
                f"projection drift for {stem}__{label}; regenerate golden fixtures."
            )


# --- coverage parity: projection port == engine pattern ----------------------

_ENGINE_BLOCKED_USE_TOKENS = [
    "risk_assessment",
    "regulatory_translation",
    "safe_for_use",
    "safety_decision",
    "adversity_classification",
    "legal_compliance_determination",
    "acceptable_daily_intake_setting",
    "reference_dose_setting",
    "tolerable_daily_intake",
    "derived_no_effect_level",
    "margin_of_exposure",
    "occupational_exposure_limit",
    "market_authorization",
    "adi_derivation",
    "rfd_setting",
    "dnel_derivation",
]


def test_projection_surfaces_every_engine_blocked_token() -> None:
    for token in _ENGINE_BLOCKED_USE_TOKENS:
        assert projector._matches_engine_regulatory(token), (
            f"projection port fails to flag engine-blocked token {token!r}."
        )
        pod = projector.project_pod_record(_load(ACCEPTED), pod_id="parity", extra_allowed_uses=[token])
        assert token in pod["allowedDownstreamUses"]


@_node_required
def test_engine_blocks_every_surfaced_token_end_to_end() -> None:
    base = _load(ACCEPTED)
    for token in _ENGINE_BLOCKED_USE_TOKENS:
        pod = projector.project_pod_record(copy.deepcopy(base), pod_id="parity2", extra_allowed_uses=[token])
        result = bridge.validate_object(pod)
        assert not result.valid, f"engine did not block token {token!r}"
        assert "BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY" in result.blocking_codes
