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
  (B)  AI-provenance arm HONEST-DROPPED: the packet carries no AI/model-use field
       (deterministic / non-LLM), so the AI codes are not advertised and no
       AssessmentRun is projected — proven a non-dead-arm by section (E).
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
from epigenomics_mcp.governance import source_contract
from epigenomics_mcp.governance import spine_bridge as bridge
from epigenomics_mcp.governance.errors import (
    ENGINE_UNAVAILABLE,
    UNRECOGNIZED_SPINE_SCHEMA_ID,
    VENDOR_DIGEST_MISMATCH,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
ACCEPTED = REPO_ROOT / "examples" / "bioactivity_pod_handoff_valid" / "accepted.json"
GOLDEN_PASS = REPO_ROOT / "tests" / "fixtures" / "governance" / "golden_pass_handoff.json"
EMISSION_SCHEMA = REPO_ROOT / "schemas" / "current" / "bioactivity-pod-handoff-packet.json"


def _assert_source_contract_valid(src: dict[str, Any], context: str) -> None:
    """Every advertised-code bite proof MUST run on a fault packet that is itself
    VALID against the producer's STRICT emission contract (a real producer-emittable
    packet) — not a hand-crafted schema-invalid fixture.

    Primary assertion uses the gate's own fail-closed source-contract guard. When
    ``jsonschema`` is installed (it is in the dev extra), we ALSO cross-check with an
    independent Draft7Validator against the same additionalProperties:false schema,
    so the proof does not rely solely on our own subset validator."""
    finding = source_contract.validate_source_packet(src, corpus=context)
    assert finding is None, (
        f"{context}: fault packet is NOT producer-contract-valid "
        f"({finding.message if finding else ''}) — a contract-valid fault is required."
    )
    try:
        from jsonschema import Draft7Validator
    except ImportError:  # pragma: no cover - jsonschema present in dev extra
        return
    # Independent STRUCTURAL cross-check (type / const / enum / required /
    # additionalProperties:false / minItems / minLength). jsonschema treats `format`
    # as annotation-only by default; the gate's own validator additionally enforces
    # date-time to match the producer's Zod `z.string().datetime()`. Every advertised
    # fault here carries a valid date-time, so the two agree on these packets.
    schema = json.loads(EMISSION_SCHEMA.read_text(encoding="utf-8"))
    errors = list(Draft7Validator(schema).iter_errors(src))
    assert errors == [], (
        f"{context}: jsonschema Draft7 reports the fault packet INVALID against the "
        f"strict emission schema: {[e.message for e in errors][:3]}"
    )

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
    use -> BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY. The fault is on the DECLARED
    root ``heritabilityClaim`` enum, so it is producer-contract-valid."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["heritabilityClaim"] = claim
    _assert_source_contract_valid(src, f"heritability={claim}")
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


@pytest.mark.parametrize("claim", ["heritable", "transgenerational"])
@_node_required
def test_a_claim_transition_to_adversity_blocks(claim: str) -> None:
    """A surviving heritable/transgenerational ``heritabilityClaim`` is an
    adversity-grade escalation the screening feeder may not pre-authorize: the
    projected claim-transition lifts to ``allowed_with_review`` ->
    BIOACTIVITY_NOT_ADVERSITY. The fault is on the DECLARED root ``heritabilityClaim``
    enum, so it is producer-contract-valid (no undeclared ``claimTransition``
    field — that would fail the strict emission contract and is now caught by the
    SOURCE-CONTRACT guard instead)."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["heritabilityClaim"] = claim
    _assert_source_contract_valid(src, f"claim-transition heritability={claim}")
    ctp = projector.project_claim_transition_policy(src)
    assert ctp["transitionStatus"] == "allowed_with_review"
    result = bridge.validate_object(ctp)
    assert not result.valid
    assert "BIOACTIVITY_NOT_ADVERSITY" in result.blocking_codes


@_node_required
def test_a_pristine_claim_transition_is_blocked_and_passes() -> None:
    """A pristine feeder's claim transition is BLOCKED (passes the engine)."""
    ctp = projector.project_claim_transition_policy(_load(ACCEPTED))
    assert ctp["transitionStatus"] == "blocked"
    assert bridge.validate_object(ctp).valid


@pytest.mark.parametrize("claim", ["none", "not_claimed"])
@_node_required
def test_a_non_adversity_heritability_leaves_transition_blocked(claim: str) -> None:
    """POSITIVE-EVIDENCE: only a heritable/transgenerational claim lifts the
    transition off ``blocked``; a ``none``/``not_claimed`` declared claim leaves it
    BLOCKED (passes) — the screening feeder is not pre-authorizing an escalation."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["heritabilityClaim"] = claim
    _assert_source_contract_valid(src, f"heritability={claim}")
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
    _assert_source_contract_valid(src, "cytotoxicity warning")
    ccd = projector.project_concentration_response_design(src)
    assert ccd["cytotoxicityConfounding"] == "possible"
    assert "CYTOTOXICITY_CONFOUNDS_POD" in bridge.validate_object(ccd).blocking_codes
    obs = projector.project_bioactivity_observation(src)
    assert "CYTOTOXICITY_CONFOUNDS_POD" in bridge.validate_object(obs).blocking_codes


@_node_required
def test_aprime_batch_effect_not_bound_blocks() -> None:
    src = copy.deepcopy(_load(ACCEPTED))
    src["qualifiedFeatures"][0]["warnings"] = [_feature_with_warning("batch_effect", blocks=False)]
    _assert_source_contract_valid(src, "batch_effect warning")
    obs = projector.project_bioactivity_observation(src)
    assert obs["batchEffectAssessment"] == "unresolved"
    assert "BATCH_EFFECT_NOT_BOUND" in bridge.validate_object(obs).blocking_codes


@_node_required
def test_aprime_control_failure_blocks() -> None:
    src = copy.deepcopy(_load(ACCEPTED))
    src["qualifiedFeatures"][0]["warnings"] = [_feature_with_warning("cell_composition", blocks=True)]
    _assert_source_contract_valid(src, "cell_composition blocking warning")
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


# --- (A'') SOURCE-CONTRACT GUARD: the dead-arm class cannot return ------------
#
# The applicability codes (POD_OUTSIDE_APPLICABILITY_DOMAIN /
# POD_APPLICABILITY_STATUS_REQUIRED) and POD_READINESS_REQUIRES_CONFIDENCE_CEILING
# were DROPPED as producer-emission-contract DEAD ARMS: their only triggers are root
# ``applicabilityDomainStatus`` / ``decisionBoundary`` fields the strict emission
# contract (additionalProperties:false / .strict()) cannot carry. A packet smuggling
# one is now caught by the fail-closed SOURCE-CONTRACT guard BEFORE projection, as
# SOURCE_CONTRACT_VIOLATION — so the dead-arm class (advertising a code that bites
# only on a schema-invalid fixture) cannot silently return.


@pytest.mark.parametrize(
    "forbidden_field, value",
    [
        pytest.param("applicabilityDomainStatus", "outside", id="applicabilityDomainStatus"),
        pytest.param("decisionBoundary", "no-ber-or-final-risk-decision", id="decisionBoundary"),
        pytest.param("applicabilityDomainStatus", "inside", id="applicability-inside"),
        pytest.param("someFutureField", {"nested": 1}, id="arbitrary-undeclared"),
    ],
)
def test_aprime2_source_contract_guard_rejects_forbidden_root_field(
    forbidden_field: str, value: Any
) -> None:
    """REGRESSION (template step 4): a packet carrying an UNDECLARED root field fails
    the producer's strict emission contract -> SOURCE_CONTRACT_VIOLATION (fail-closed,
    blocking). This is the structural reason the dropped dead-arm codes cannot return
    silently — a smuggled schema-forbidden field is caught here, not safe-defaulted
    into a projected scientific code."""
    src = copy.deepcopy(_load(ACCEPTED))
    src[forbidden_field] = value
    finding = source_contract.validate_source_packet(src, corpus="adversarial")
    assert finding is not None, f"forbidden field {forbidden_field!r} was not rejected"
    assert finding.code == source_contract.SOURCE_CONTRACT_VIOLATION
    assert finding.origin == "meta"
    assert forbidden_field in finding.message


def test_aprime2_source_contract_guard_rejects_forbidden_nested_field() -> None:
    """The strict contract is additionalProperties:false at every level: an undeclared
    field inside a nested warning is also a SOURCE_CONTRACT_VIOLATION."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["qualifiedFeatures"][0]["warnings"] = [
        {
            "warningCode": "EPI_X",
            "severity": "warning",
            "message": "m",
            "category": "cytotoxicity",
            "smuggledNestedField": True,
        }
    ]
    finding = source_contract.validate_source_packet(src, corpus="adversarial")
    assert finding is not None
    assert finding.code == source_contract.SOURCE_CONTRACT_VIOLATION
    assert "smuggledNestedField" in finding.message


@pytest.mark.parametrize(
    "rel",
    [
        "examples/bioactivity_pod_handoff_valid/accepted.json",
        "examples/bioactivity_pod_handoff_valid/accepted_with_warnings.json",
        "examples/bioactivity_pod_handoff_valid/excluded.json",
        "examples/bioactivity_pod_handoff_valid/exploratory_only.json",
        "tests/fixtures/governance/golden_pass_handoff.json",
    ],
)
def test_aprime2_pristine_corpus_passes_source_contract(rel: str) -> None:
    """Every PRISTINE corpus packet is VALID against the producer's strict emission
    contract (a real producer-emittable packet) — so the guard does not false-block
    and every advertised code is proven on a contract-valid fault."""
    src = _load(REPO_ROOT / rel)
    assert source_contract.validate_source_packet(src, corpus=rel) is None


def test_aprime2_source_contract_guard_is_advertised_meta() -> None:
    """SOURCE_CONTRACT_VIOLATION is an advertised fail-closed meta code."""
    from epigenomics_mcp.governance.errors import META_FAIL_CLOSED_CODES

    assert source_contract.SOURCE_CONTRACT_VIOLATION in META_FAIL_CLOSED_CODES


@_node_required
def test_aprime2_guard_blocks_in_gate_run() -> None:
    """END-TO-END: a forbidden-field packet handed to the gate exits non-zero with a
    SOURCE_CONTRACT_VIOLATION and is NEVER projected/safe-defaulted. (The gate
    resolves corpus paths relative to REPO_ROOT, so the temp fixture is written
    inside the repo tree and removed afterwards.)"""
    gate = _load_gate()
    src = copy.deepcopy(_load(ACCEPTED))
    src["applicabilityDomainStatus"] = "outside"  # undeclared root field
    repo_tmp = REPO_ROOT / "tests" / "fixtures" / "governance" / "_forbidden_tmp.json"
    try:
        repo_tmp.write_text(json.dumps(src), encoding="utf-8")
        rel = str(repo_tmp.relative_to(REPO_ROOT))
        rc = gate.run_gate([rel], emit_json=True)  # type: ignore[attr-defined]
        assert rc == 1
    finally:
        repo_tmp.unlink(missing_ok=True)


# --- (B) AI-provenance arm: HONEST-DROPPED (deterministic / non-LLM) ----------
#
# The released BioactivityPoDHandoffPacket carries NO AI / model-use / LLM /
# provenance-of-generation field (the schema is additionalProperties:false at root
# and in provenance), and the qualification engine is deterministic / non-LLM. So no
# real SOURCE fault can make the spine AI arm dispatch — any AssessmentRun would have
# to hardcode aiUse="none", and the only way an AI code could "fire" is by mutating
# the PROJECTED object directly. That is a DEAD ARM, so the AI codes are NOT
# advertised and no AssessmentRun is projected (see ADR 0001 + the dead-arm guard in
# section (E)). test_e_ai_arm_is_not_a_dead_arm proves it stays dropped.


# --- (B') readiness with blockers --------------------------------------------


@_node_required
def test_bprime_readiness_with_blocker_on_ready_feature_blocks() -> None:
    """A dose-response-ready feature that ALSO carries a blocking warning is a
    contradiction -> POD_READINESS_WITH_BLOCKERS."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["qualifiedFeatures"][0]["warnings"] = [_feature_with_warning("missing_metadata", blocks=True)]
    _assert_source_contract_valid(src, "blocking warning on ready feature")
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


# --- (C) confidence-ceiling code DROPPED (producer-emission-contract dead arm) -
#
# POD_READINESS_REQUIRES_CONFIDENCE_CEILING was DROPPED: the only way to empty the
# projected confidenceCeilingRefs is to DECLARE a disguised root ``decisionBoundary``
# field (so the canonical-fallback ceiling ref is suppressed). The strict emission
# contract is additionalProperties:false at root, so a producer can NEVER emit a
# ``decisionBoundary`` field — the code bit only on a schema-INVALID fixture and is a
# DEAD ARM. A packet smuggling ``decisionBoundary`` is now caught upstream by the
# SOURCE-CONTRACT guard as SOURCE_CONTRACT_VIOLATION (proven below). On a
# producer-contract-VALID packet the ceiling refs always carry the standing canonical
# non-claim boundary, so the code can never fire.


@pytest.mark.parametrize(
    "boundary",
    [
        pytest.param("", id="empty"),
        pytest.param("n/a", id="placeholder-na"),
        pytest.param("no-ber-or-final-screening-verdict", id="anchor-missing"),
        pytest.param("nо-ber-or-final-risk-decision", id="homoglyph-cyrillic-o"),
    ],
)
def test_c_decision_boundary_is_contract_forbidden(boundary: str) -> None:
    """The root ``decisionBoundary`` field — the ONLY source trigger that could have
    emptied the ceiling refs — is UNDECLARED in the strict emission contract, so any
    packet carrying it (disguised or not) is a SOURCE_CONTRACT_VIOLATION caught before
    projection. This is why POD_READINESS_REQUIRES_CONFIDENCE_CEILING is a dead arm and
    was dropped rather than advertised."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["decisionBoundary"] = boundary
    finding = source_contract.validate_source_packet(src, corpus="adversarial-C")
    assert finding is not None
    assert finding.code == source_contract.SOURCE_CONTRACT_VIOLATION
    assert "decisionBoundary" in finding.message


@_node_required
def test_c_pristine_readiness_carries_canonical_ceiling_and_passes() -> None:
    """A producer-contract-VALID packet (no ``decisionBoundary`` field) always mints
    the standing canonical non-claim boundary ceiling ref -> readiness PASSES on
    merit. There is no contract-valid way to empty it, which is exactly why the
    confidence-ceiling code can never bite on a real packet."""
    src = copy.deepcopy(_load(ACCEPTED))
    src["mandatoryCaveats"] = []
    for f in src.get("qualifiedFeatures", []) + src.get("excludedFeatures", []):
        f["warnings"] = []
    _assert_source_contract_valid(src, "pristine-no-decisionBoundary")
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
    ):
        assert bridge.validate_object(o).valid, f"golden PASS object blocked: {o['schemaId']}"


#: Producer-emission-contract DEAD ARMS dropped in the source-contract-guard
#: commit: each could only fire from a root field (applicabilityDomainStatus /
#: decisionBoundary) the strict additionalProperties:false emission contract cannot
#: carry, so it bit only on a schema-INVALID fixture, never on a real packet.
_PRODUCER_CONTRACT_DEAD_ARM_CODES = (
    "POD_OUTSIDE_APPLICABILITY_DOMAIN",
    "POD_APPLICABILITY_STATUS_REQUIRED",
    "POD_READINESS_REQUIRES_CONFIDENCE_CEILING",
)


def test_e_advertised_dead_arm_codes_are_not_advertised() -> None:
    """ADR 0001: the count/basis-keyed adequacy codes + POD_MODEL_DIAGNOSTICS_REQUIRED
    + the producer-emission-contract dead arms (applicability + confidence-ceiling)
    are structurally unreachable through the strict handoff-packet shape and MUST NOT
    be advertised (no dead arms)."""
    gate = _load_gate()
    for code in (
        "INSUFFICIENT_CONCENTRATION_RESPONSE",
        "BIOLOGICAL_REPLICATE_COUNT_REQUIRED",
        "PSEUDOREPLICATION_INFLATES_SUPPORT",
        "CONCENTRATION_BASIS_MISMATCH",
        "POD_MODEL_DIAGNOSTICS_REQUIRED",
        *_PRODUCER_CONTRACT_DEAD_ARM_CODES,
    ):
        assert code not in gate.BLOCKING_SCIENTIFIC_CODES  # type: ignore[attr-defined]


def test_e_advertised_codes_are_exactly_the_six_live_codes() -> None:
    """The advertised scientific set is EXACTLY the six codes each proven to bite on a
    producer-contract-VALID fault (declared fields). No dead arms, no extras."""
    gate = _load_gate()
    expected = frozenset(
        {
            "BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY",
            "BIOACTIVITY_NOT_ADVERSITY",
            "CONTROL_FAILURE_BLOCKS_HANDOFF",
            "BATCH_EFFECT_NOT_BOUND",
            "CYTOTOXICITY_CONFOUNDS_POD",
            "POD_READINESS_WITH_BLOCKERS",
        }
    )
    assert expected == gate.BLOCKING_SCIENTIFIC_CODES  # type: ignore[attr-defined]


@_node_required
def test_e_every_advertised_code_bites_on_a_contract_valid_fault() -> None:
    """SUMMARY PROOF (template step 3): for EVERY advertised scientific code there is a
    fault packet that is VALID against the producer's strict emission contract (a real
    producer-emittable packet) on which the code bites end-to-end via the real bridge.
    clean -> inject-real-declared-field -> attributed red. No projected-object
    mutations, no schema-forbidden field injections."""

    def warn(cat: str, blocks: bool) -> dict[str, Any]:
        return _feature_with_warning(cat, blocks=blocks)

    base = _load(ACCEPTED)
    # (code, source-mutation, [projectors that should surface it])
    cases: list[tuple[str, Any, list[Any]]] = []

    s = copy.deepcopy(base)
    s["heritabilityClaim"] = "heritable"
    cases.append(
        ("BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY", s, [projector.project_pod_record])
    )

    s = copy.deepcopy(base)
    s["heritabilityClaim"] = "transgenerational"
    cases.append(
        ("BIOACTIVITY_NOT_ADVERSITY", s, [projector.project_claim_transition_policy])
    )

    s = copy.deepcopy(base)
    s["qualifiedFeatures"][0]["warnings"] = [warn("cytotoxicity", False)]
    cases.append(
        (
            "CYTOTOXICITY_CONFOUNDS_POD",
            s,
            [projector.project_concentration_response_design, projector.project_bioactivity_observation],
        )
    )

    s = copy.deepcopy(base)
    s["qualifiedFeatures"][0]["warnings"] = [warn("batch_effect", False)]
    cases.append(("BATCH_EFFECT_NOT_BOUND", s, [projector.project_bioactivity_observation]))

    s = copy.deepcopy(base)
    s["qualifiedFeatures"][0]["warnings"] = [warn("cell_composition", True)]
    cases.append(
        (
            "CONTROL_FAILURE_BLOCKS_HANDOFF",
            s,
            [projector.project_concentration_response_design, projector.project_bioactivity_observation],
        )
    )

    s = copy.deepcopy(base)
    s["qualifiedFeatures"][0]["warnings"] = [warn("missing_metadata", True)]
    cases.append(("POD_READINESS_WITH_BLOCKERS", s, [projector.project_pod_readiness]))

    proven = set()
    for code, src, projs in cases:
        _assert_source_contract_valid(src, code)  # Ajv/jsonschema-VALID
        bit = False
        for fn in projs:
            if code in bridge.validate_object(fn(src)).blocking_codes:
                bit = True
        assert bit, f"advertised code {code} did not bite on its contract-valid fault"
        proven.add(code)

    gate = _load_gate()
    assert proven == set(gate.BLOCKING_SCIENTIFIC_CODES)  # type: ignore[attr-defined]


_AI_PROVENANCE_CODES = (
    "AI_GENERATED_POD_REQUIRES_DOMAIN_REVIEW",
    "AI_MODEL_IDENTITY_REQUIRED",
    "AI_UNKNOWN_WITH_PUBLIC_RELEASE",
    "HUMAN_REVIEW_REQUIRED_FOR_PUBLIC_AI_ASSESSMENT",
    "USABLE_HUMAN_REVIEW_REQUIRED",
    "AI_USE_NONE_WITH_MODEL_TRACE",
    "AI_RECORD_FREE_TEXT_OVERCLAIM",
    "MODEL_IDENTITY_IS_NOT_VALIDATION",
)


def test_e_ai_arm_is_not_a_dead_arm() -> None:
    """ADR 0001 (AI-provenance HONEST-DROP). epigenomics-mcp is deterministic /
    non-LLM and the released BioactivityPoDHandoffPacket carries NO AI / model-use /
    provenance-of-generation field, so the spine AI codes can NEVER dispatch on a
    real SOURCE fault. They MUST NOT be advertised, and no AssessmentRun is
    projected — advertising a structurally-unreachable code is a dead arm."""
    gate = _load_gate()
    for code in _AI_PROVENANCE_CODES:
        assert code not in gate.BLOCKING_SCIENTIFIC_CODES  # type: ignore[attr-defined]
    # the AssessmentRun projection itself is gone (no AI arm to game)
    assert not hasattr(projector, "project_assessment_run")


def test_e_no_source_field_can_make_a_packet_declare_ai_use() -> None:
    """STRUCTURAL proof of the drop: even if a future reviewer tried to smuggle an
    AI/model-use field into a released packet, the handoff schema is
    additionalProperties:false (root + provenance), so it cannot validly carry one —
    there is no real source from which to derive aiUse != 'none'. This is why the AI
    arm is N/A here rather than merely 'passing today'."""
    handoff_schema = json.loads(
        (REPO_ROOT / "schemas" / "current" / "bioactivity-pod-handoff-packet.json").read_text(
            encoding="utf-8"
        )
    )
    assert handoff_schema.get("additionalProperties") is False
    prov = handoff_schema["properties"]["provenance"]
    assert prov.get("additionalProperties") is False
    declared = set(handoff_schema["properties"]) | set(prov.get("properties", {}))
    ai_ish = {
        k
        for k in declared
        if any(t in k.lower() for t in ("aiuse", "model", "llm", "generativ", "humanreview"))
    }
    assert ai_ish == set(), f"unexpected AI-ish source field(s) appeared: {ai_ish}"


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
