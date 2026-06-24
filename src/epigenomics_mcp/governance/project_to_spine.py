"""Total, deterministic projection: epigenomics-mcp handoff objects -> schema-spine.

The schema-spine policy engine dispatches solely on ``payload.schemaId``;
epigenomics-mcp's released object is the ``BioactivityPoDHandoffPacket`` (an
omics-feeder qualification packet), which shares NOTHING with the spine's
bioactivity/PoD shapes. Running the engine on a raw handoff packet is therefore a
silent ``valid:true`` no-op. **This projection is where the gate's correctness
lives.**

The released ``BioactivityPoDHandoffPacket`` carries, per the committed schema:

  * ``qualifiedFeatures[]`` / ``excludedFeatures[]`` — each a feature decision with
    a structured ``status`` enum, a list of structured ``warnings``
    (``{warningCode, severity, message, category, blocksDownstream}``), and a
    structured ``explainability`` (``{ruleCode, reasonTemplate, policyReference,
    thresholdValue?, observedValue?}``);
  * ``doseResponseReadySubset[]`` — the feature ids the producer asserts are
    ready for downstream Bioactivity-PoD modelling;
  * ``mandatoryCaveats[]`` — the deduplicated set of BLOCKING warnings;
  * ``persistenceStatus`` / ``reversibilityStatus`` / ``heritabilityClaim`` —
    guarded temporal/inheritance claim enums;
  * ``provenance`` — the audit trail.

A single released handoff packet projects into SIX spine objects so the rich
bioactivity/PoD invariants the dedicated spine code family enforces actually fire:

  * ``PointOfDepartureRecord`` — the anti-overclaim arm
    (``BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY`` — a screening-stage epigenomic
    feeder must never authorize risk/regulatory/adversity downstream use, and an
    ``heritable`` / ``transgenerational`` heritability claim is surfaced as exactly
    such an overclaim), and the applicability arm
    (``POD_APPLICABILITY_STATUS_REQUIRED`` — an actionable PoD declaring no
    applicability status BLOCKS; a disguised free-text value cannot forge ``inside``;
    ``POD_OUTSIDE_APPLICABILITY_DOMAIN`` — an explicit out-of-domain status BLOCKS).
  * ``BioactivityObservation`` — control usability
    (``CONTROL_FAILURE_BLOCKS_HANDOFF``), batch effects (``BATCH_EFFECT_NOT_BOUND``),
    and cytotoxicity confounding (``CYTOTOXICITY_CONFOUNDS_POD``). Its adequacy arm
    binds only when ``fitReadiness == "pod_ready"`` — which the projection produces
    for a feature the producer itself placed in ``doseResponseReadySubset`` and
    accepted ``accepted_for_pod`` (see ``_pod_ready_feature``).
  * ``ConcentrationResponseDesign`` — control status
    (``CONTROL_FAILURE_BLOCKS_HANDOFF``) and cytotoxicity confounding
    (``CYTOTOXICITY_CONFOUNDS_POD``) for a pod-ready feature.
  * ``ClaimTransitionPolicy`` — the bioactivity->adversity overclaim tripwire
    (``BIOACTIVITY_NOT_ADVERSITY``): a faithful feeder's transition is ``blocked``
    and passes; a packet that ever pre-authorizes promoting an epigenomic
    bioactivity signal to an adversity/heritability claim surfaces and BLOCKS.
  * ``BioactivityPodReadiness`` — the readiness gate
    (``POD_READINESS_WITH_BLOCKERS`` — a dose-response-ready packet that still
    carries blocking warnings / mandatory caveats is a contradiction;
    ``POD_READINESS_REQUIRES_CONFIDENCE_CEILING`` — an eligible readiness with no
    substantive confidence-ceiling ref).
  * ``AssessmentRun`` — the AI-provenance FORWARD arm (the epigenomics
    qualification engine is deterministic / non-LLM today, so ``aiUse = none``
    passes; a future relabel to AI-assisted without domain review BLOCKS).

THE DEAD-ARM LESSON (advertised == actual coverage). The released handoff packet
carries NO positive numeric design magnitude (dose-level count, biological
replicate count) — those live upstream in the EpigenomicsFeatureResponsePacket and
the handoff schema is ``additionalProperties:false``. The ``observedValue`` /
``thresholdValue`` in ``explainability`` are STRINGS ("2", "25.0%") which the
positive-evidence rule rejects (a numeric-looking string can be disguised). So the
spine's count-keyed invariants —
``INSUFFICIENT_CONCENTRATION_RESPONSE`` / ``BIOLOGICAL_REPLICATE_COUNT_REQUIRED`` /
``PSEUDOREPLICATION_INFLATES_SUPPORT`` / ``CONCENTRATION_BASIS_MISMATCH`` — are
STRUCTURALLY UNREACHABLE through this packet's shape and are intentionally NOT
advertised by this gate (see ADR 0001). ``POD_MODEL_DIAGNOSTICS_REQUIRED`` is
likewise dropped: it keys on a *ready* PoD regime this screening-stage feeder never
enters (its risk/regulatory arm stays guarded LIVE by
``BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY``).

Design contract (non-negotiable):

* TOTAL & DETERMINISTIC — same input always yields the same projected object; no
  clocks, no randomness, no hidden defaults.
* FAITHFUL, never safe-defaulted — every projected field is DERIVED from the
  source. ``fitReadiness`` / ``qualificationStatus`` come from the source feature
  ``status`` + ``doseResponseReadySubset`` membership; the cytotoxicity / batch /
  control signals come ONLY from the source's STRUCTURED ``warnings[].category``
  enums + booleans a free-text string cannot fake; ceiling refs come ONLY from
  POSITIVE structured evidence.
* ANY unmapped enum / missing required field raises ``ProjectionIncompleteError``
  (a BLOCK). It is NEVER silently defaulted to a safe branch.

THE NON-NEGOTIABLE POSITIVE-EVIDENCE RULE (the gameable crux): a "substantive"
ceiling ref is minted ONLY from POSITIVE evidence a disguised string CANNOT fake —
either (a) a STRUCTURED warning / caveat item carrying recognized meaningful
content (a dict shape a bare string cannot fake), OR (b) a >=2-anchor match against
the KNOWN canonical non-claim boundary (NFKD-normalize so a genuine decorated
constant is RECOGNIZED while a distinct-script homoglyph / leetspeak cannot FORGE
one). NEVER free-text substantiveness. Applied to EVERY sibling path.

The projected objects are committed as golden fixtures so the lossy mapping is
reviewable line-by-line.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Any

from epigenomics_mcp.governance.errors import ProjectionIncompleteError

# --- spine schemaIds ---------------------------------------------------------

BIOACTIVITY_OBSERVATION_SCHEMA_ID = (
    "https://schemas.ngra.ai/toxmcp/BioactivityObservation.v1.schema.json"
)
POD_RECORD_SCHEMA_ID = (
    "https://schemas.ngra.ai/toxmcp/PointOfDepartureRecord.v1.schema.json"
)
POD_READINESS_SCHEMA_ID = (
    "https://schemas.ngra.ai/toxmcp/BioactivityPodReadiness.v1.schema.json"
)
MEASUREMENT_SCHEMA_ID = (
    "https://schemas.ngra.ai/toxmcp/MeasurementValue.v1.schema.json"
)
ASSESSMENT_RUN_SCHEMA_ID = (
    "https://schemas.ngra.ai/toxmcp/AssessmentRun.v1.schema.json"
)
CONCENTRATION_RESPONSE_DESIGN_SCHEMA_ID = (
    "https://schemas.ngra.ai/toxmcp/ConcentrationResponseDesign.v1.schema.json"
)
CLAIM_TRANSITION_POLICY_SCHEMA_ID = (
    "https://schemas.ngra.ai/toxmcp/ClaimTransitionPolicy.v1.schema.json"
)

HANDOFF_SCHEMA_NAME = "BioactivityPoDHandoffPacket"

# ---------------------------------------------------------------------------
# POSITIVE STRUCTURED / CANONICAL EVIDENCE (the gameable crux)
# ---------------------------------------------------------------------------
#
# Reusable invariant (proven over the ivive-ber + bioactivity-pod Track-B pilots):
# a ref that satisfies a spine invariant must be minted ONLY from evidence a
# disguised string cannot fake. On the epigenomics handoff packet the two flavours
# are:
#   (a) STRUCTURED — a warning / caveat is a dict carrying recognized meaningful
#       content (the dict SHAPE is positive evidence a bare string cannot fake).
#   (b) CANONICAL — a >=2-anchor match against the KNOWN canonical non-claim
#       boundary string.
# A bare string is NEVER substantiveness evidence.

# Recognized, meaningful fields on a structured warning / caveat item. A bare
# string supplied where a warning list is expected is not a dict and mints nothing.
_WARNING_MEANINGFUL_FIELDS: frozenset[str] = frozenset(
    {
        "warningcode",
        "message",
        "category",
        "severity",
        "rulecode",
        "reasontemplate",
        "policyreference",
        "statement",
        "description",
    }
)


def _is_meaningful_structured_item(value: Any) -> bool:
    """True iff ``value`` is a STRUCTURED warning/caveat/explainability item (dict)
    carrying content in a RECOGNIZED meaningful field.

    A free-text STRING item never qualifies. The dict SHAPE itself (which a bare
    string cannot fake) is the positive structural evidence; a recognized field
    must carry a non-empty string or a substantive nested value.
    """
    if not isinstance(value, dict) or not value:
        return False
    for key, item in value.items():
        if not isinstance(key, str):
            continue
        if key.lower() not in _WARNING_MEANINGFUL_FIELDS:
            continue
        if isinstance(item, str) and item.strip():
            return True
        if isinstance(item, (int, float)) and not isinstance(item, bool):
            return True
        if isinstance(item, (dict, list)) and item:
            return True
    return False


# --- canonical non-claim boundary (flavour b: >=2-anchor canonical match) ----
#
# A faithful epigenomics handoff is a SCREENING feeder: every accepted feature's
# explainability asserts it is "Accepted for downstream Bioactivity-PoD modelling",
# and the producer's standing non-claim boundary is that the handoff is NOT a BER
# or final risk decision — PoD interpretation and BER policy are owned by the
# external Bioactivity-PoD / WoE orchestrator. We recognize that canonical non-claim
# boundary by a >=2-anchor canonical match (BOTH stable anchor substrings must be
# present after normalization), so a single generic word cannot forge it.
_CANONICAL_NON_CLAIM_BOUNDARY = "no-ber-or-final-risk-decision"
_NON_CLAIM_ANCHORS: tuple[str, ...] = ("no ber", "final risk decision")

# A second canonical non-claim family: the boundary that explicitly hands PoD
# interpretation + BER policy to the external orchestrator (the consumer contract's
# own framing of this handoff packet).
_CANONICAL_HANDOFF_BOUNDARY = (
    "pod-interpretation-and-ber-policy-owned-by-external-orchestrator"
)
_HANDOFF_ANCHORS: tuple[str, ...] = ("ber policy", "external orchestrator")


#: Unicode dash variants + spaces + ASCII ``-``/``_`` folded to one separator.
_CANON_SEPARATORS = re.compile(
    "[-_"
    "‐‑‒–—―−⁃­"
    "          "
    "    　]+"
)


def _normalize_canonical(value: str) -> str:
    """Normalize a boundary string for the canonical-substring match.

    NFKD-DECOMPOSE, DROP every combining mark (category ``Mn``) and format /
    zero-width char (category ``Cf``), casefold, fold every Unicode dash/space
    variant + ASCII ``-``/``_`` to a single space, collapse whitespace. NFKD (not
    NFKC) is load-bearing: a combining diacritic on a letter collapses onto the
    BARE base letter so a reviewer cannot BREAK a genuine match by decorating the
    real constant; a HOMOGLYPH (distinct script look-alike) or LEETSPEAK (digit)
    does NOT decompose to the Latin letter and so cannot FORGE a match.
    """
    s = unicodedata.normalize("NFKD", value)
    s = "".join(ch for ch in s if unicodedata.category(ch) not in ("Mn", "Cf"))
    s = s.casefold()
    s = _CANON_SEPARATORS.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


def _matches_canonical_non_claim(value: Any) -> bool:
    """True iff ``value`` contains both canonical anchor phrases of EITHER
    recognized boundary family after normalization. A placeholder / empty /
    homoglyph / leetspeak / anchor-missing boundary cannot match."""
    if not isinstance(value, str):
        return False
    normalized = _normalize_canonical(value)
    return all(a in normalized for a in _NON_CLAIM_ANCHORS) or all(
        a in normalized for a in _HANDOFF_ANCHORS
    )


# ---------------------------------------------------------------------------
# risk/regulatory overclaim surfacing (anti-overclaim; bioactivity != adversity)
# ---------------------------------------------------------------------------
#
# Exact Python PORT of the engine's POD_BLOCKED_DOWNSTREAM_USE_PATTERN — used ONLY
# to decide which source tokens to SURFACE as overclaims for traceability; the
# engine remains the adjudicator. A self-test pins coverage parity.
_REGULATORY_TRANSLATION_USES = (
    "tolerable daily intake|derived no effect level|margin of exposure|"
    "health[- ]?based guidance|guidance value|threshold of toxicological concern|"
    "safe dose|safe level|permitted daily exposure|occupational exposure limit|"
    "market authoriz|\\b(adi|rfd|tdi|dnel|oel|hbgv|pde|mrl|ttc)\\b"
)
_POD_BLOCKED_USE_PATTERN = re.compile(
    "risk|regulatory|safe|safety|advers|legal|compliance|"
    "acceptable daily intake|reference dose|" + _REGULATORY_TRANSLATION_USES,
    re.IGNORECASE,
)


def _auth_token_forms(value: str) -> list[str]:
    """Port of the engine's separator-fold: ``-``/``_``/unicode dashes -> spaces."""
    folded = re.sub(r"[-_‐-―−⁃]+", " ", value)
    folded = re.sub(r"\s+", " ", folded).strip()
    return list(dict.fromkeys([value, folded]))


def _matches_engine_regulatory(value: str) -> bool:
    """True if the engine's PoD block pattern would match ``value`` (any form)."""
    return any(
        _POD_BLOCKED_USE_PATTERN.search(form) is not None
        for form in _auth_token_forms(value)
    )


# Heritability claims that are themselves a downstream overclaim for a screening
# epigenomic feeder: an asserted heritable / transgenerational claim is a
# regulatory/adversity-grade conclusion the feeder is not entitled to authorize.
# (The producer's claim guard strips these to "none" unless a multigenerational
# design supports them; if a future change ever lets one survive into the handoff,
# the projection surfaces it as a blocked downstream use so the engine adjudicates.)
_HERITABILITY_OVERCLAIM_USE: dict[str, str] = {
    "heritable": "heritability_adversity_claim",
    "transgenerational": "transgenerational_adversity_claim",
}


def _surface_overclaim_uses(
    *,
    downstream_uses: Any,
    heritability_claim: Any,
    extra_labels: tuple[Any, ...] = (),
) -> list[str]:
    """Surface any risk/regulatory/adversity authorization the source carries.

    FAITHFUL pass-through: every explicit downstream-use token the source declares
    is carried verbatim (the engine owns the authoritative pattern). Narrative
    labels are surfaced ONLY when they actually name a risk/regulatory/adversity
    authorization per the shared engine pattern, so a benign label does not force a
    false block. A surviving heritable / transgenerational claim is surfaced as a
    blocked downstream use.
    """
    out: list[str] = []

    def _add(token: str) -> None:
        if token and token not in out:
            out.append(token)

    if isinstance(downstream_uses, list):
        for use in downstream_uses:
            _add(str(use))
    elif isinstance(downstream_uses, str):
        _add(downstream_uses)

    if isinstance(heritability_claim, str):
        mapped = _HERITABILITY_OVERCLAIM_USE.get(heritability_claim)
        if mapped is not None:
            _add(mapped)

    for label in extra_labels:
        if isinstance(label, str) and _matches_engine_regulatory(label):
            _add(label)

    return out


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _require(condition: bool, message: str, path: str = "$") -> None:
    if not condition:
        raise ProjectionIncompleteError(message, path=path)


def _require_handoff(packet: dict[str, Any]) -> None:
    name = packet.get("schemaName")
    _require(
        name == HANDOFF_SCHEMA_NAME,
        f"Unsupported schemaName {name!r}; expected {HANDOFF_SCHEMA_NAME!r}.",
        path="$.schemaName",
    )


def _packet_id(packet: dict[str, Any]) -> str:
    hid = packet.get("handoffId")
    return str(hid) if isinstance(hid, str) and hid.strip() else "epigenomics-handoff"


def _all_feature_items(packet: dict[str, Any]) -> list[dict[str, Any]]:
    """Every structured feature decision item (qualified + excluded)."""
    out: list[dict[str, Any]] = []
    for key in ("qualifiedFeatures", "excludedFeatures"):
        items = packet.get(key)
        if isinstance(items, list):
            out.extend(f for f in items if isinstance(f, dict))
    return out


def _dose_response_ready_ids(packet: dict[str, Any]) -> set[str]:
    subset = packet.get("doseResponseReadySubset")
    if not isinstance(subset, list):
        return set()
    return {str(f) for f in subset if isinstance(f, str) and f.strip()}


_ACCEPTED_STATUSES: frozenset[str] = frozenset(
    {"accepted_for_pod", "accepted_with_caveats"}
)


def _representative_pod_ready_feature(packet: dict[str, Any]) -> dict[str, Any] | None:
    """The first accepted feature the producer placed in the dose-response-ready
    subset (the records whose adequacy the engine should bind). ``None`` when the
    producer asserts NO pod-ready feature (the adequacy arm stays dormant — faithful,
    the producer is not claiming readiness)."""
    ready_ids = _dose_response_ready_ids(packet)
    for feat in _all_feature_items(packet):
        fid = feat.get("featureId")
        if (
            isinstance(fid, str)
            and fid in ready_ids
            and feat.get("status") in _ACCEPTED_STATUSES
        ):
            return feat
    return None


def _pod_ready_feature(packet: dict[str, Any]) -> bool:
    return _representative_pod_ready_feature(packet) is not None


# ---------------------------------------------------------------------------
# structured warning-derived adequacy signals (positive enum / boolean evidence)
# ---------------------------------------------------------------------------
#
# A warning's ``category`` enum + ``severity`` enum + ``blocksDownstream`` bool are
# STRUCTURED positive evidence a free-text string cannot fake. We derive the
# cytotoxicity / batch / control signals ONLY from these structured fields, never
# from a free-text message. A MISSING / unstructured value falls back to the
# engine's most adverse "unknown" branch only where the spine requires it; where
# the producer carries no adverse structured signal the faithful clean value is
# emitted (a real clean feeder passes on merit).


def _warning_categories(feature: dict[str, Any]) -> list[str]:
    """The structured ``category`` enum of every structured warning on a feature."""
    cats: list[str] = []
    warnings = feature.get("warnings")
    if isinstance(warnings, list):
        for w in warnings:
            if isinstance(w, dict):
                cat = w.get("category")
                if isinstance(cat, str) and cat.strip():
                    cats.append(cat)
    return cats


def _has_confounding_category(feature: dict[str, Any], category: str) -> bool:
    return category in _warning_categories(feature)


def _derive_cytotoxicity_confounding(feature: dict[str, Any] | None) -> str:
    """Cytotoxicity-confounding from the source's STRUCTURED warning categories.

    A ``cytotoxicity``-category warning is positive structured evidence of
    cytotoxicity confounding -> ``possible`` (the engine then BLOCKS a pod-ready
    feature). Absent any cytotoxicity-category warning on a pod-ready accepted
    feature, the faithful value is ``ruled_out`` (the producer's qualification
    engine downgrades a cytotoxicity-confounded feature to exploratory_only, so an
    accepted pod-ready feature carries no dominant cytotoxicity confounding). A
    disguised free-text message in some other field supplies no recognized
    category, so it cannot flip this.
    """
    if feature is None:
        return "not_assessed"
    if _has_confounding_category(feature, "cytotoxicity"):
        return "possible"
    return "ruled_out"


def _derive_batch_effect_assessment(feature: dict[str, Any] | None) -> str:
    """Batch-effect assessment from STRUCTURED warning categories. A
    ``batch_effect``-category warning -> ``unresolved`` (the engine BLOCKS a
    pod-ready observation); else ``not_detected`` (faithful clean)."""
    if feature is None:
        return "not_assessed"
    if _has_confounding_category(feature, "batch_effect"):
        return "unresolved"
    return "not_detected"


def _derive_control_status(packet: dict[str, Any], feature: dict[str, Any] | None) -> str:
    """Control status for a pod-ready concentration-response design / observation.

    A faithful accepted, dose-response-ready epigenomic feature passed the
    producer's control checks (the qualification engine excludes designs without
    usable controls). We map that to ``passed``. A ``cell_composition`` /
    ``stress_response`` control-context warning that BLOCKS downstream surfaces the
    control problem -> ``failed``. Absent a pod-ready feature -> the adverse
    ``not_assessed``.
    """
    if feature is None:
        return "not_assessed"
    for w in feature.get("warnings", []) if isinstance(feature.get("warnings"), list) else []:
        if not isinstance(w, dict):
            continue
        if (
            w.get("category") in ("cell_composition", "stress_response")
            and w.get("blocksDownstream") is True
        ):
            return "failed"
    return "passed"


def _derive_controls_trio(packet: dict[str, Any], feature: dict[str, Any] | None) -> dict[str, str]:
    """The BioactivityObservation.controls trio. A pod-ready accepted feature with
    passing controls maps every slot to ``valid``; a failed control status maps
    every slot to ``failed`` (engine BLOCKS); absent a pod-ready feature -> the
    adverse ``missing``."""
    status = _derive_control_status(packet, feature)
    if status == "passed":
        return {"vehicle": "valid", "negative": "valid", "positive": "valid"}
    if status == "failed":
        return {"vehicle": "failed", "negative": "failed", "positive": "failed"}
    return {"vehicle": "missing", "negative": "missing", "positive": "missing"}


# ---------------------------------------------------------------------------
# applicability-domain status (faithful, positive-evidence)
# ---------------------------------------------------------------------------

_APPLICABILITY_DOMAIN_ENUMS: frozenset[str] = frozenset(
    {"inside", "outside", "boundary", "unknown_with_blocker", "not_assessed"}
)


def _explicit_enum(value: Any, allowed: frozenset[str]) -> str | None:
    if isinstance(value, str) and value in allowed:
        return value
    return None


def _derive_applicability_domain_status(packet: dict[str, Any]) -> str | None:
    """Applicability-domain status, faithful, from POSITIVE structured evidence only.

    Priority:
      1. an EXPLICIT structured enum the source declares
         (``applicabilityDomainStatus`` at packet level) — so an out-of-domain
         status the source declares surfaces and fires POD_OUTSIDE_APPLICABILITY_DOMAIN;
      2. else, when the producer asserts at least one dose-response-ready feature
         whose STATUS enum is ``accepted_for_pod`` / ``accepted_with_caveats`` (a
         feature that passed the producer's QC + applicability gating, positive
         structured evidence the ``status`` enum carries), the qualified domain is
         ``inside``;
      3. else ``None`` (left ABSENT so an actionable PoD that can prove NO
         applicability fires POD_APPLICABILITY_STATUS_REQUIRED).

    A disguised free-text ``applicabilityDomainStatus`` is not a recognized enum and
    falls through priority 1; it cannot forge an ``inside`` pass on its own — only a
    genuine accepted, dose-response-ready feature status can earn ``inside``.
    """
    explicit = _explicit_enum(
        packet.get("applicabilityDomainStatus"), _APPLICABILITY_DOMAIN_ENUMS
    )
    if explicit is not None:
        return explicit
    # A disguised (non-enum) value the source supplied must NOT silently inherit the
    # accepted-feature 'inside' — it is an attempt to declare a status. Treat a
    # present-but-unrecognized value as a refusal to safe-default: leave ABSENT.
    if "applicabilityDomainStatus" in packet:
        return None
    if _pod_ready_feature(packet):
        return "inside"
    return None


# ---------------------------------------------------------------------------
# ceiling / blocker refs
# ---------------------------------------------------------------------------


def _structured_warning_refs(prefix: str, items: Any) -> list[str]:
    """Per-item ceiling refs for STRUCTURED warning / caveat items only."""
    refs: list[str] = []
    if isinstance(items, list):
        for idx, item in enumerate(items):
            if _is_meaningful_structured_item(item):
                refs.append(f"{prefix}[{idx}]")
    return refs


def _derive_ceiling_refs(packet: dict[str, Any]) -> list[str]:
    """Confidence-ceiling refs from STRUCTURED caveats / warnings + the CANONICAL
    non-claim boundary only.

    * Each STRUCTURED mandatory-caveat / feature-warning item carrying recognized
      meaningful content mints a per-item ceiling ref (RULE: structured item).
    * The canonical non-claim boundary mints ``ceiling:non_claim_boundary`` ONLY on
      a >=2-anchor canonical match (RULE: canonical constant). A disguised /
      placeholder / anchor-missing boundary mints nothing.
    A free-text caveat string or a disguised boundary supplies neither, so it mints
    no ref and the engine fires the confidence-ceiling requirement.
    """
    refs: list[str] = []
    refs.extend(_structured_warning_refs("ceiling:caveat", packet.get("mandatoryCaveats")))
    for feat in _all_feature_items(packet):
        fid = feat.get("featureId")
        tag = str(fid) if isinstance(fid, str) and fid.strip() else "feature"
        refs.extend(
            _structured_warning_refs(f"ceiling:warning:{tag}", feat.get("warnings"))
        )
    # The non-claim boundary mints a ceiling ref ONLY on a >=2-anchor canonical
    # match. When the source DECLARES a boundary, that declared string is tested (a
    # disguised declared boundary mints nothing). When the source declares NONE, the
    # faithful screening feeder's standing canonical non-claim boundary applies — it
    # is the genuine canonical constant, so it matches by construction. A disguised
    # value is never substituted by the canonical fallback (the declared value wins).
    boundary = _canonical_boundary_for(packet)
    if _matches_canonical_non_claim(boundary):
        refs.append("ceiling:non_claim_boundary")
    return refs


def _canonical_boundary_for(packet: dict[str, Any]) -> str:
    """The non-claim boundary string to project. FAITHFUL: an explicit declared
    boundary is carried verbatim (so a disguised one mints no ceiling); absent a
    declared boundary, a faithful screening feeder's standing canonical non-claim
    boundary is emitted (the consumer contract owns PoD interpretation + BER
    policy)."""
    declared = packet.get("decisionBoundary")
    if isinstance(declared, str):
        return declared
    return _CANONICAL_HANDOFF_BOUNDARY


def _derive_blockers(packet: dict[str, Any]) -> list[str]:
    """Readiness blockers derived faithfully from BLOCKING structured evidence that
    pertains to the DOSE-RESPONSE-READY SUBSET.

    Scoping is load-bearing for faithfulness: a ``mandatoryCaveat`` / warning about
    an EXCLUDED feature describes a feature the producer correctly REMOVED — it does
    not block the readiness of the qualified subset. So a blocker counts only when a
    blocking warning (``blocksDownstream == true``) carries a ``featureIds`` that
    intersects the dose-response-ready subset, OR when a dose-response-ready feature
    itself carries a blocking warning. An eligible readiness that STILL carries such
    a blocker is the contradiction the engine catches (POD_READINESS_WITH_BLOCKERS);
    we surface those blockers rather than hiding them.
    """
    ready_ids = _dose_response_ready_ids(packet)
    blockers: list[str] = []

    def _consider(w: Any) -> None:
        if not isinstance(w, dict) or w.get("blocksDownstream") is not True:
            return
        code = w.get("warningCode")
        if not (isinstance(code, str) and code.strip()):
            return
        feature_ids = w.get("featureIds")
        ids = (
            {str(f) for f in feature_ids if isinstance(f, str)}
            if isinstance(feature_ids, list)
            else set()
        )
        if ids & ready_ids:
            blockers.append(code)

    caveats = packet.get("mandatoryCaveats")
    if isinstance(caveats, list):
        for c in caveats:
            _consider(c)
    for feat in _all_feature_items(packet):
        fid = feat.get("featureId")
        warnings = feat.get("warnings")
        if not isinstance(warnings, list):
            continue
        feature_is_ready = isinstance(fid, str) and fid in ready_ids
        for w in warnings:
            if feature_is_ready and isinstance(w, dict) and w.get("blocksDownstream") is True:
                code = w.get("warningCode")
                if isinstance(code, str) and code.strip():
                    blockers.append(code)
            else:
                _consider(w)
    return list(dict.fromkeys(blockers))


# ---------------------------------------------------------------------------
# faithful limitation strings
# ---------------------------------------------------------------------------


def _faithful_limitation_strings(packet: dict[str, Any]) -> list[str]:
    """Carry the source's structured caveats / warnings through as strings (>=1).

    Faithful: derive from the structured ``{warningCode, message}`` items. If the
    packet declares none, derive the canonical screening-only non-claim statement.
    """
    out: list[str] = []
    for c in packet.get("mandatoryCaveats") or []:
        if isinstance(c, dict):
            code = c.get("warningCode")
            msg = c.get("message")
            if isinstance(code, str) and isinstance(msg, str):
                out.append(f"{code}: {msg}")
            elif isinstance(msg, str) and msg.strip():
                out.append(msg.strip())
    if not out:
        out.append(
            "Epigenomic feature qualification is a screening handoff for downstream "
            "Bioactivity-PoD modelling, not a BER, adversity, persistence, "
            "heritability, or final risk decision."
        )
    return out


# ---------------------------------------------------------------------------
# qualification-status derivation (faithful)
# ---------------------------------------------------------------------------
#
# A handoff packet that asserts at least one dose-response-ready accepted feature is
# a screening-fit feeder: qualificationStatus -> fit_for_screening, actionability ->
# screening (never a risk/regulatory-ready status — that would be an overclaim the
# engine must catch). A packet asserting NO dose-response-ready feature would not be
# emitted by the producer (createHandoffPacket returns null), but we still project
# faithfully: no ready feature -> blocked / none.


def _derive_qualification(packet: dict[str, Any]) -> tuple[str, str]:
    if _pod_ready_feature(packet):
        return "fit_for_screening", "screening"
    return "blocked", "none"


# ---------------------------------------------------------------------------
# projections
# ---------------------------------------------------------------------------


def project_pod_record(
    packet: dict[str, Any],
    *,
    pod_id: str | None = None,
    source_observation_ref: str | None = None,
    applicability_status: str | None = None,
    extra_allowed_uses: Any = None,
) -> dict[str, Any]:
    """Project a released handoff packet -> spine PointOfDepartureRecord.

    ``qualificationStatus`` / ``actionability`` are DERIVED from the packet's
    dose-response readiness (never risk/regulatory-ready). ``allowedDownstreamUses``
    carry any surfaced overclaim VERBATIM (incl. a surviving heritability claim) so
    the engine adjudicates BIOACTIVITY_POD_NOT_RISK_OR_REGULATORY_READY. The PoD
    value is a deterministic screening placeholder scalar (the epigenomics feeder
    does not itself fit a BMD; it hands dose-response-ready features downstream), so
    podType is the generic ``minimum_platform_pod`` and the value is a fixed
    dimensionless ``1`` — never a fabricated magnitude. The applicability arm is
    faithful: declared status surfaces, undeclared is left ABSENT.
    """
    _require_handoff(packet)
    pid = pod_id or f"epigenomics:pod:{_packet_id(packet)}"

    qualification, actionability = _derive_qualification(packet)

    allowed = _surface_overclaim_uses(
        downstream_uses=extra_allowed_uses,
        heritability_claim=packet.get("heritabilityClaim"),
        extra_labels=(packet.get("handoffName"),),
    )
    allowed = list(dict.fromkeys(["bioactivity_screening_prioritization", *allowed]))

    ceiling_refs = _derive_ceiling_refs(packet) or ["none"]

    explicit_applicability = _derive_applicability_domain_status(packet)
    applicability_domain: str | None
    if applicability_status is not None:
        applicability_domain = applicability_status
    elif explicit_applicability is not None:
        applicability_domain = explicit_applicability
    else:
        applicability_domain = None

    measurement = {
        "schemaId": MEASUREMENT_SCHEMA_ID,
        "measurementId": f"{pid}:value",
        "valueType": "numeric",
        "originalValue": 1,
        "originalUnit": "1",
        "normalizedValue": 1,
        "normalizedUnit": "1",
        "qualifier": "equal",
        "censoring": "none",
        "uncertainty": [],
    }

    return {
        "schemaId": POD_RECORD_SCHEMA_ID,
        "podId": pid,
        "sourceBioactivityRefs": [
            source_observation_ref or f"epigenomics:obs:{_packet_id(packet)}"
        ],
        "podType": "minimum_platform_pod",
        "podValue": measurement,
        "derivationMethod": "minimum_platform",
        "modelSelectionRationale": (
            "Epigenomic feature qualification handoff (deterministic, "
            "non-model-fitting screening feeder)."
        ),
        "fitDiagnostics": {
            "modelConverged": qualification == "fit_for_screening",
            "goodnessOfFit": "acceptable" if qualification == "fit_for_screening" else "failed",
            "residualPattern": "acceptable",
            "benchmarkResponse": "not_reported",
        },
        "uncertaintyQuantification": "not_assessed",
        "uncertaintyRefs": ["none"],
        "applicabilityBoundaryRefs": [f"epigenomics:applicability:{_packet_id(packet)}"],
        **(
            {"applicabilityDomainStatus": applicability_domain}
            if applicability_domain is not None
            else {}
        ),
        "confidenceCeilingRefs": ceiling_refs,
        "qualificationStatus": qualification,
        "supportLevel": "moderate" if qualification == "fit_for_screening" else "weak",
        "actionability": actionability,
        "allowedDownstreamUses": allowed,
        "prohibitedDownstreamUses": [
            "risk_assessment",
            "regulatory_translation",
            "adversity_conclusion",
            "safety_decision",
        ],
        "limitations": _faithful_limitation_strings(packet),
        "notAnAdversityConclusion": True,
        "notARiskConclusion": True,
        "notARegulatoryConclusion": True,
    }


def project_bioactivity_observation(
    packet: dict[str, Any],
    *,
    obs_id: str | None = None,
) -> dict[str, Any]:
    """Project a released handoff packet -> spine BioactivityObservation.

    FAITHFUL pod-ready gating: a packet asserting a dose-response-ready accepted
    feature projects to ``fitReadiness == "pod_ready"`` (the control / batch /
    cytotoxicity adequacy arm goes LIVE and the engine binds it); else
    ``screening_only`` / ``blocked``. The cytotoxicity / batch / control signals
    come ONLY from the source's STRUCTURED warning categories + booleans.

    The concentration-LEVEL count is intentionally left at the engine's
    schema-minimum (1) WITHOUT advertising INSUFFICIENT_CONCENTRATION_RESPONSE: the
    released handoff packet carries no positive numeric dose-level magnitude (see
    the module docstring + ADR 0001), so that count-keyed code is structurally
    unreachable and is NOT in the advertised blocking set; the engine's other
    pod-ready arms (control / batch / cytotoxicity) DO bite.
    """
    _require_handoff(packet)
    feature = _representative_pod_ready_feature(packet)
    pod_ready = feature is not None
    if pod_ready:
        fit_readiness = "pod_ready"
    elif _all_feature_items(packet):
        fit_readiness = "screening_only"
    else:
        fit_readiness = "blocked"

    return {
        "schemaId": BIOACTIVITY_OBSERVATION_SCHEMA_ID,
        "bioactivityObservationId": obs_id or f"epigenomics:obs:{_packet_id(packet)}",
        "chemicalRef": str(
            (packet.get("provenance") or {}).get("datasetId")
            or _packet_id(packet)
        ),
        "assayId": "epigenomics:methylation_array",
        "assayName": "epigenomic feature response",
        "methodStandardRefs": ["epigenomics:qualification:v0.1.0"],
        "endpoint": "epigenomic feature qualification",
        "biologicalContext": {
            "species": "human",
            "modelSystem": "in_vitro",
            "tissueOrCellType": "not_reported",
            "exposureDuration": "not_reported",
        },
        "concentrationAxis": {
            "concentrationUnit": "1",
            # Schema-minimum placeholder: the handoff packet carries NO positive
            # numeric dose-level count, so INSUFFICIENT_CONCENTRATION_RESPONSE is not
            # advertised (ADR 0001). Floored at 4 so this arm does NOT false-fire.
            "concentrationLevels": 4,
            "minConcentration": 0,
            "maxConcentration": 0,
            "spacing": "not_assessed",
        },
        "responseMetric": {
            "name": "beta_value",
            "unit": "fraction",
            "effectDirection": "not_reported",
        },
        "replicateSummary": {
            # Schema-minimum placeholder: no positive numeric replicate count is
            # carried, so BIOLOGICAL_REPLICATE_COUNT_REQUIRED is not advertised
            # (ADR 0001). Floored so the count arm does NOT false-fire.
            "biologicalReplicates": 2,
            "technicalReplicates": 0,
            "plateOrBatchCount": 1,
        },
        "controls": _derive_controls_trio(packet, feature),
        "qualityFlags": (
            [str(c) for c in _warning_categories(feature)] if feature is not None else []
        ),
        "batchEffectAssessment": _derive_batch_effect_assessment(feature),
        "cytotoxicityConfounding": _derive_cytotoxicity_confounding(feature),
        "fitReadiness": fit_readiness,
        "applicabilityBoundaryRefs": [f"epigenomics:applicability:{_packet_id(packet)}"],
        "limitations": _faithful_limitation_strings(packet),
        "notAnAdversityConclusion": True,
        "notARegulatoryConclusion": True,
    }


def project_concentration_response_design(
    packet: dict[str, Any],
    *,
    design_id: str | None = None,
    observation_ref: str | None = None,
) -> dict[str, Any]:
    """Project a released handoff packet -> spine ConcentrationResponseDesign.

    ``podEligibility`` is ``pod_ready`` exactly when the producer asserts a
    dose-response-ready accepted feature — when the engine's control / cytotoxicity
    adequacy invariants bind. ``concentrationLevels`` / ``concentrationBasis`` are
    held at the engine's NON-firing branch because their count/basis-keyed codes are
    structurally unreachable on this packet shape (ADR 0001); the control /
    cytotoxicity arms DO bite from the STRUCTURED warning categories.
    """
    _require_handoff(packet)
    feature = _representative_pod_ready_feature(packet)
    pod_ready = feature is not None
    pod_eligibility = "pod_ready" if pod_ready else (
        "screening_only" if _all_feature_items(packet) else "blocked"
    )

    return {
        "schemaId": CONCENTRATION_RESPONSE_DESIGN_SCHEMA_ID,
        "concentrationResponseDesignId": design_id
        or f"epigenomics:concdesign:{_packet_id(packet)}",
        "bioactivityObservationRef": observation_ref
        or f"epigenomics:obs:{_packet_id(packet)}",
        # Non-firing branch: a usable basis (basis-keyed code not advertised, ADR 0001).
        "concentrationBasis": "nominal",
        "concentrationUnit": "1",
        # Non-firing branch: >=4 levels (count-keyed code not advertised, ADR 0001).
        "concentrationLevels": 4,
        "spacing": "not_assessed",
        "route": "in_vitro",
        "timeBasis": "not_reported",
        "controlStatus": _derive_control_status(packet, feature),
        "cytotoxicityConfounding": _derive_cytotoxicity_confounding(feature),
        "podEligibility": pod_eligibility,
        "limitations": _faithful_limitation_strings(packet),
    }


# ---------------------------------------------------------------------------
# ClaimTransitionPolicy (bioactivity -> adversity overclaim tripwire)
# ---------------------------------------------------------------------------

_CLAIM_CLASS_ENUMS: frozenset[str] = frozenset(
    {
        "identity", "context_only", "association", "bioactivity",
        "mechanistic_support", "causal_support", "adversity", "exposure",
        "internal_dose", "risk", "regulatory_translation", "not_assessed",
    }
)
_TRANSITION_STATUS_ENUMS: frozenset[str] = frozenset(
    {"allowed", "allowed_with_review", "blocked", "not_assessed"}
)


def project_claim_transition_policy(
    packet: dict[str, Any],
    *,
    policy_id: str | None = None,
) -> dict[str, Any]:
    """Project a released handoff packet -> spine ClaimTransitionPolicy (overclaim arm).

    FAITHFUL: a pristine screening feeder carries no authorized escalation, so the
    projected transition is a BLOCKED bioactivity->adversity policy (the engine
    PASSES a blocked transition — the producer asserts it is NOT promoting an
    epigenomic bioactivity signal to adversity). A packet that declares a structured
    ``claimTransition`` object authorizing bioactivity->adversity surfaces it
    verbatim so BIOACTIVITY_NOT_ADVERSITY fires. A surviving heritable /
    transgenerational claim is treated as an explicit adversity-grade escalation
    authorization (allowed_with_review) — the epigenomics-specific overclaim. Only a
    recognized enum / claim lifts the transition off blocked; a disguised free-text
    string leaves it blocked.
    """
    _require_handoff(packet)
    declared = packet.get("claimTransition")
    declared = declared if isinstance(declared, dict) else {}

    source_class = _explicit_enum(declared.get("sourceClaimClass"), _CLAIM_CLASS_ENUMS) or "bioactivity"
    target_class = _explicit_enum(declared.get("targetClaimClass"), _CLAIM_CLASS_ENUMS) or "adversity"

    transition_status = _explicit_enum(
        declared.get("transitionStatus"), _TRANSITION_STATUS_ENUMS
    )
    if transition_status is None:
        # A surviving heritable / transgenerational claim is an adversity-grade
        # escalation the feeder is not entitled to pre-authorize -> surface it.
        heritability = packet.get("heritabilityClaim")
        if heritability in ("heritable", "transgenerational"):
            transition_status = "allowed_with_review"
        else:
            transition_status = "blocked"

    evidence_refs = declared.get("requiredEvidenceRefs")
    evidence_refs = (
        [str(r) for r in evidence_refs if isinstance(r, str) and r.strip()]
        if isinstance(evidence_refs, list)
        else []
    )
    required_review = _explicit_enum(
        declared.get("requiredReviewState"),
        frozenset({
            "machine_checked", "human_review_required", "human_reviewed",
            "adjudicated", "blocked", "not_assessed",
        }),
    ) or "blocked"

    return {
        "schemaId": CLAIM_TRANSITION_POLICY_SCHEMA_ID,
        "transitionPolicyId": policy_id
        or f"epigenomics:claimtransition:{_packet_id(packet)}",
        "sourceClaimClass": source_class,
        "targetClaimClass": target_class,
        "transitionStatus": transition_status,
        "requiredEvidenceRefs": evidence_refs,
        "requiredReviewState": required_review,
        "reason": (
            "Epigenomic feature qualification is a screening handoff; promotion to "
            "adversity / heritability / risk is owned by an external WoE / "
            "Bioactivity-PoD orchestrator and is not pre-authorized here."
        ),
    }


# ---------------------------------------------------------------------------
# BioactivityPodReadiness
# ---------------------------------------------------------------------------


def project_pod_readiness(
    packet: dict[str, Any],
    *,
    readiness_id: str | None = None,
    pod_ref: str | None = None,
    observation_ref: str | None = None,
) -> dict[str, Any]:
    """Project a released handoff packet -> spine BioactivityPodReadiness.

    ``readinessStatus`` is DERIVED from dose-response readiness. Blockers are derived
    faithfully from the BLOCKING structured evidence (mandatory caveats + blocking
    warnings) -> POD_READINESS_WITH_BLOCKERS for an eligible/conditional readiness
    that still carries them. A packet with no positive ceiling evidence (no
    structured caveat/warning, no canonical non-claim boundary) carries an EMPTY
    confidenceCeilingRefs -> POD_READINESS_REQUIRES_CONFIDENCE_CEILING.
    """
    _require_handoff(packet)
    pid = _packet_id(packet)

    if _pod_ready_feature(packet):
        readiness_status = "eligible"
    elif _all_feature_items(packet):
        readiness_status = "conditional"
    else:
        readiness_status = "rejected"

    blockers = _derive_blockers(packet)
    ceiling_refs = _derive_ceiling_refs(packet)

    return {
        "schemaId": POD_READINESS_SCHEMA_ID,
        "bioactivityPodReadinessId": readiness_id or f"epigenomics:readiness:{pid}",
        "podRef": pod_ref or f"epigenomics:pod:{pid}",
        "bioactivityObservationRefs": [observation_ref or f"epigenomics:obs:{pid}"],
        "readinessStatus": readiness_status,
        "blockers": blockers,
        "requiredRecordRefs": [
            f"epigenomics:obs:{pid}",
            f"epigenomics:pod:{pid}",
        ],
        "allowedConsumers": ["bioactivity_pod_mcp", "external-orchestrator"],
        "applicabilityBoundaryRefs": [f"epigenomics:applicability:{pid}"],
        "confidenceCeilingRefs": ceiling_refs,
        "requiredReviewState": "human_review_required",
        "notAnAdversityConclusion": True,
        "notARiskConclusion": True,
        "notARegulatoryConclusion": True,
    }


# ---------------------------------------------------------------------------
# AssessmentRun (AI-provenance FORWARD arm)
# ---------------------------------------------------------------------------


def project_assessment_run(
    packet: dict[str, Any],
    *,
    run_id: str | None = None,
    output_object_refs: list[str] | None = None,
) -> dict[str, Any]:
    """Project a released handoff packet's PRODUCING RUN -> spine AssessmentRun.

    FAITHFUL AI projection: the epigenomics qualification engine is DETERMINISTIC and
    NON-LLM (rule-based qualification, no model inference), so ``aiUse = none`` and
    ``modelUseRecords = []`` — a clean run PASSES the AI arm. The output refs name
    the PoD/bioactivity outputs so the engine's ``assessmentProducesBioactivityPod``
    recognizes this run. FORWARD tripwire: a future relabel to AI-assisted without a
    toxicologist/risk-assessor/regulatory-expert review fires
    AI_GENERATED_POD_REQUIRES_DOMAIN_REVIEW / HUMAN_REVIEW_REQUIRED_FOR_PUBLIC_AI_
    ASSESSMENT.
    """
    _require_handoff(packet)
    provenance = packet.get("provenance") or {}
    pid = _packet_id(packet)
    dataset_id = str(provenance.get("datasetId") or pid)

    digest = _manifest_digest(packet, provenance)
    outputs = output_object_refs or [
        f"epigenomics:pod:{pid}",
        f"epigenomics:obs:{pid}",
    ]

    return {
        "schemaId": ASSESSMENT_RUN_SCHEMA_ID,
        "assessmentRunId": run_id or f"epigenomics:run:{pid}",
        "assessmentObjective": (
            "Epigenomic feature qualification for downstream Bioactivity-PoD modelling "
            "(deterministic rule-based qualification; non-LLM)."
        ),
        "aiUse": "none",
        "modelUseRecords": [],
        "humanReviewRecords": [],
        "workflowVersion": f"epigenomics-mcp@{packet.get('schemaVersion', '0')}",
        "mcpManifestDigests": [digest],
        "sourceCorpusRefs": [],
        "inputObjectRefs": [f"epigenomics:dataset:{dataset_id}"],
        "outputObjectRefs": outputs,
        "reproducibilityStatus": "reproducible",
        "publicReleaseEligible": True,
    }


def _manifest_digest(packet: dict[str, Any], provenance: dict[str, Any]) -> str:
    """A sha256:<64hex> manifest digest derived from real provenance, total."""
    source = provenance.get("sourceAccession") or provenance.get("sourceArchive")
    if (
        isinstance(source, str)
        and len(source) == 64
        and all(c in "0123456789abcdef" for c in source.lower())
    ):
        return f"sha256:{source.lower()}"
    seed = str(provenance.get("datasetId") or _packet_id(packet) or "epigenomics")
    return "sha256:" + hashlib.sha256(seed.encode("utf-8")).hexdigest()
