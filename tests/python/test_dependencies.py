"""Packaging checks for the metadata-only Python compatibility distribution."""

from __future__ import annotations

import tomllib
from pathlib import Path


def _project() -> dict[str, object]:
    repo_root = Path(__file__).resolve().parents[2]
    with (repo_root / "pyproject.toml").open("rb") as handle:
        parsed = tomllib.load(handle)
    return parsed["project"]


def test_core_install_has_no_runtime_dependencies() -> None:
    """Installing the compatibility package must not pull a second runtime."""
    assert _project()["dependencies"] == []


def test_analysis_compat_dependencies_are_explicitly_optional() -> None:
    """Historical analysis dependencies remain available only by opt-in."""
    optional = _project()["optional-dependencies"]
    analysis = optional["analysis-compat"]

    expected_prefixes = {
        "pydantic",
        "pyyaml",
        "pandas",
        "bioframe",
        "duckdb",
        "scipy",
        "statsmodels",
        "httpx",
        "typer",
        "mcp",
    }
    declared = {dependency.split(">", maxsplit=1)[0] for dependency in analysis}
    assert declared == expected_prefixes
    assert "mcp>=1.0,<2.0.0" in analysis


def test_specialized_extras_remain_separate() -> None:
    """Large-table and adapter dependencies require their own opt-in extras."""
    optional = _project()["optional-dependencies"]
    assert optional["large-intervals"] == ["polars>=1.0", "pyarrow>=15"]
    assert optional["adapters"] == ["biopython>=1.80"]
