"""Fail-closed PRODUCER EMISSION-CONTRACT validation for the Track-B gate.

Before projecting a released ``BioactivityPoDHandoffPacket`` onto the spine, the
gate MUST validate the raw source packet against the producer's STRICT emission
contract — the ``additionalProperties:false`` JSON schema at
``schemas/current/bioactivity-pod-handoff-packet.json`` (and the ``.strict()`` Zod
mirror ``BioactivityPoDHandoffPacketSchema`` in ``src/contracts/packets.ts``).

WHY THIS GUARD EXISTS (the dead-arm root cause it closes)
---------------------------------------------------------
A gate that projects FIRST and validates never (or validates a projected object,
not the source packet) can "advertise" public-release-blocking codes whose only
trigger is a SOURCE field the producer's own strict contract cannot carry. Such a
code bites only on a hand-crafted, schema-INVALID fixture (one carrying an
undeclared root field) and NEVER on a packet the real producer emits — a DEAD ARM.

This module is the structural fix: every source/corpus packet is validated against
the strict emission schema at the TOP of ``run_gate`` BEFORE any projection. A
packet that FAILS the producer contract is a ``SOURCE_CONTRACT_VIOLATION`` meta
finding that BLOCKS (exit 1) and is NEVER projected / safe-defaulted. An undeclared
root field (e.g. a smuggled ``applicabilityDomainStatus`` / ``decisionBoundary``)
is rejected here, so the dead-arm class cannot silently return: a "fault" that only
fires a scientific code by carrying a schema-forbidden field is caught as a contract
violation instead.

FAIL-CLOSED / DEPENDENCY-FREE
-----------------------------
The validator is a small, self-contained Draft-07 *subset* checker covering exactly
the keywords the emission schema uses (``type``, ``properties``, ``required``,
``enum``, ``const``, ``additionalProperties``, ``items``, ``minItems``,
``minLength``, ``format: date-time``). It depends on nothing outside the standard
library, so the guard can never be silently skipped because an optional dependency
is missing. A schema we cannot load, or a keyword we do not recognise appearing in
the schema, is itself treated as a hard block (we refuse to under-validate).
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from epigenomics_mcp.governance.errors import (
    SOURCE_CONTRACT_VIOLATION,
    BlockingFinding,
)

# --- the advertised meta fail-closed code -----------------------------------
#
# ``SOURCE_CONTRACT_VIOLATION`` (re-exported from ``errors``): the raw source packet
# failed the producer's STRICT emission contract (additionalProperties:false JSON
# schema / .strict() Zod). BLOCKS; the packet is never projected. This is the guard
# that closes the producer-emission-contract dead-arm class.
__all__ = ["SOURCE_CONTRACT_VIOLATION", "validate_source_packet"]

# .../src/epigenomics_mcp/governance/source_contract.py -> repo root is parents[3].
_REPO_ROOT = Path(__file__).resolve().parents[3]
_EMISSION_SCHEMA_PATH = (
    _REPO_ROOT / "schemas" / "current" / "bioactivity-pod-handoff-packet.json"
)

# The exact, bounded set of Draft-07 keywords the emission schema uses. If the
# schema ever grows a keyword outside this set, the loader REFUSES it (fail-closed:
# we will not silently under-validate a contract we cannot fully enforce).
_SUPPORTED_KEYWORDS: frozenset[str] = frozenset(
    {
        "$schema",
        "$id",
        "title",
        "description",
        "type",
        "properties",
        "required",
        "enum",
        "const",
        "additionalProperties",
        "items",
        "minItems",
        "minLength",
        "format",
        "default",
    }
)

# RFC3339 date-time (the only ``format`` the schema uses). Mirrors what a strict
# producer emits; tolerant of an offset or a ``Z`` zone, requires a real T-separated
# time. A non-conforming string is a contract violation.
_DATE_TIME_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$"
)


class SchemaUnsupportedError(Exception):
    """The emission schema uses a keyword the validator does not enforce.

    Raised at load time so the gate fails closed rather than under-validating.
    """


def _assert_supported(node: Any, where: str) -> None:
    """Recursively confirm every schema node uses only enforced keywords.

    Structure-aware: ``properties`` maps property NAMES (arbitrary, not keywords) to
    subschemas, so we recurse into its VALUES only; ``items`` is itself a subschema;
    ``enum`` / ``const`` / ``required`` carry data values (not subschemas), so they
    are NOT recursed into. A subschema using any keyword outside ``_SUPPORTED_KEYWORDS``
    is a hard fail (we refuse to under-validate).
    """
    if not isinstance(node, dict):
        return
    for key in node:
        if key not in _SUPPORTED_KEYWORDS:
            raise SchemaUnsupportedError(
                f"Emission schema uses unsupported keyword {key!r} at {where}; "
                "the source-contract validator refuses to under-validate."
            )
    props = node.get("properties")
    if isinstance(props, dict):
        for pname, subschema in props.items():
            _assert_supported(subschema, f"{where}.properties.{pname}")
    items = node.get("items")
    if isinstance(items, dict):
        _assert_supported(items, f"{where}.items")


@lru_cache(maxsize=1)
def _emission_schema() -> dict[str, Any]:
    schema = json.loads(_EMISSION_SCHEMA_PATH.read_text(encoding="utf-8"))
    if not isinstance(schema, dict):
        raise SchemaUnsupportedError("Emission schema root is not an object.")
    _assert_supported(schema, "$")
    return schema


def _type_ok(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    # Defensive: an unrecognised type keyword should fail closed at load time, but
    # if one slips through, treat the instance as non-conforming.
    return False


def _validate(node: dict[str, Any], value: Any, path: str, errors: list[str]) -> None:
    """Validate ``value`` against schema ``node`` (Draft-07 subset), appending every
    violation message to ``errors``."""
    expected_type = node.get("type")
    if isinstance(expected_type, str) and not _type_ok(value, expected_type):
        errors.append(f"{path}: expected type {expected_type!r}")
        return  # type mismatch makes deeper checks meaningless

    if "const" in node and value != node["const"]:
        errors.append(f"{path}: expected const {node['const']!r}")

    if "enum" in node and value not in node["enum"]:
        errors.append(f"{path}: value {value!r} not in enum {node['enum']!r}")

    if isinstance(value, str):
        min_len = node.get("minLength")
        if isinstance(min_len, int) and len(value) < min_len:
            errors.append(f"{path}: shorter than minLength {min_len}")
        if node.get("format") == "date-time" and not _DATE_TIME_RE.match(value):
            errors.append(f"{path}: not an RFC3339 date-time")

    if isinstance(value, dict):
        props: dict[str, Any] = node.get("properties", {}) or {}
        for req in node.get("required", []) or []:
            if req not in value:
                errors.append(f"{path}: missing required property {req!r}")
        # additionalProperties:false is the load-bearing strict guard — an
        # undeclared root (or nested) field is a contract violation here, which is
        # exactly what closes the dead-arm class.
        if node.get("additionalProperties") is False:
            for key in value:
                if key not in props:
                    errors.append(
                        f"{path}: additional property {key!r} is not permitted "
                        "(producer emission contract is additionalProperties:false)"
                    )
        for key, subschema in props.items():
            if key in value and isinstance(subschema, dict):
                _validate(subschema, value[key], f"{path}.{key}", errors)

    if isinstance(value, list):
        min_items = node.get("minItems")
        if isinstance(min_items, int) and len(value) < min_items:
            errors.append(f"{path}: fewer than minItems {min_items}")
        item_schema = node.get("items")
        if isinstance(item_schema, dict):
            for idx, item in enumerate(value):
                _validate(item_schema, item, f"{path}[{idx}]", errors)


def validate_source_packet(
    source: Any, *, corpus: str
) -> BlockingFinding | None:
    """Validate one raw source packet against the producer's STRICT emission schema.

    Returns a ``SOURCE_CONTRACT_VIOLATION`` blocking meta finding if the packet
    fails the contract (including any undeclared / schema-forbidden field, since the
    schema is ``additionalProperties:false``), else ``None``.

    A schema we cannot load / fully enforce is itself a hard block (fail-closed).
    """
    try:
        schema = _emission_schema()
    except (OSError, json.JSONDecodeError, SchemaUnsupportedError) as exc:
        return BlockingFinding.meta(
            SOURCE_CONTRACT_VIOLATION,
            f"Producer emission schema could not be loaded/enforced: {exc}",
            path="$",
            corpus=corpus,
        )

    errors: list[str] = []
    _validate(schema, source, "$", errors)
    if errors:
        return BlockingFinding.meta(
            SOURCE_CONTRACT_VIOLATION,
            "Source packet violates the producer's strict emission contract "
            f"({_EMISSION_SCHEMA_PATH.name}): " + "; ".join(errors[:8]),
            path=errors[0].split(":", 1)[0] if errors else "$",
            corpus=corpus,
        )
    return None
