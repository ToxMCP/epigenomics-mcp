"""Import smoke tests for v0.1 runtime dependencies.

These tests verify that the core dependency set declared in pyproject.toml
is resolvable and importable in the target environment. They do NOT test
functional correctness — only that the packages are present and expose a
version attribute where expected.
"""

from __future__ import annotations

import importlib

import pytest

DEPENDENCIES = [
    ("pydantic", "pydantic"),
    ("pandas", "pandas"),
    ("bioframe", "bioframe"),
    ("duckdb", "duckdb"),
    ("scipy", "scipy"),
    ("statsmodels", "statsmodels"),
    ("httpx", "httpx"),
    ("typer", "typer"),
    ("mcp", "mcp"),
]

OPTIONAL_DEPENDENCIES = [
    ("polars", "polars"),
    ("pyarrow", "pyarrow"),
    ("biopython", "Bio"),
]


def _has_version(module: object) -> bool:
    """Check whether a module exposes a __version__ attribute."""
    return hasattr(module, "__version__")


# Some packages (e.g. the official mcp SDK) do not expose __version__ at the
# top-level module.  We still verify they are importable and healthy.
_NO_VERSION_ATTR = {"mcp"}


@pytest.mark.parametrize("package_name,module_name", DEPENDENCIES)
def test_core_dependency_importable(package_name: str, module_name: str) -> None:
    """Each core dependency can be imported and exposes a version."""
    try:
        mod = importlib.import_module(module_name)
    except ImportError as exc:
        pytest.fail(f"Failed to import {module_name} ({package_name}): {exc}")

    if module_name not in _NO_VERSION_ATTR:
        assert _has_version(mod), f"{module_name} does not expose __version__"
        assert isinstance(mod.__version__, str), f"{module_name}.__version__ is not a str"
        assert len(mod.__version__.split(".")) >= 2, f"{module_name}.__version__ looks malformed"


@pytest.mark.parametrize("package_name,module_name", OPTIONAL_DEPENDENCIES)
def test_optional_dependency_importable(package_name: str, module_name: str) -> None:
    """Optional extras are present in this test environment."""
    try:
        mod = importlib.import_module(module_name)
    except ImportError as exc:
        pytest.fail(f"Failed to import optional {module_name} ({package_name}): {exc}")

    assert _has_version(mod), f"{module_name} does not expose __version__"


def test_pydantic_major_version() -> None:
    """Pydantic is v2 or later (required by contract schemas)."""
    import pydantic

    major = int(pydantic.__version__.split(".")[0])
    assert major >= 2, f"Expected pydantic>=2, got {pydantic.__version__}"


def test_pandas_dataframe_api() -> None:
    """Pandas exposes the DataFrame constructor used by ingestion pipelines."""
    import pandas as pd

    assert hasattr(pd, "DataFrame")
    assert hasattr(pd, "read_csv")


def test_bioframe_has_expected_api() -> None:
    """Bioframe exposes interval operations used by coordinate validation."""
    import bioframe

    assert hasattr(bioframe, "overlap")
    assert hasattr(bioframe, "from_any")


def test_duckdb_has_connect() -> None:
    """DuckDB exposes the connect function used for local analytics."""
    import duckdb

    assert hasattr(duckdb, "connect")


def test_httpx_has_client() -> None:
    """HTTPX exposes the AsyncClient used by integration clients."""
    import httpx

    assert hasattr(httpx, "AsyncClient")
    assert hasattr(httpx, "Client")


def test_typer_has_typer_api() -> None:
    """Typer exposes the main Typer class used by CLI entry points."""
    import typer

    assert hasattr(typer, "Typer")


def test_mcp_has_fastmcp() -> None:
    """The official MCP package exposes FastMCP for server construction."""
    import mcp.server.fastmcp

    assert hasattr(mcp.server.fastmcp, "FastMCP")
