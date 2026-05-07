"""Smoke tests for Python package import and basic structure."""

from __future__ import annotations

from pathlib import Path

import epigenomics_mcp


def test_package_version() -> None:
    """Package exports a semantic version string."""
    assert hasattr(epigenomics_mcp, "__version__")
    assert isinstance(epigenomics_mcp.__version__, str)
    parts = epigenomics_mcp.__version__.split(".")
    assert len(parts) == 3
    assert all(p.isdigit() for p in parts)


def test_expected_directories_exist() -> None:
    """Required repository directories are present."""
    repo_root = Path(__file__).resolve().parents[2]
    required_dirs = [
        "src/epigenomics_mcp",
        "tests",
        "schemas",
        "examples",
        "benchmarks",
        "docs",
    ]
    for rel_dir in required_dirs:
        assert (repo_root / rel_dir).is_dir(), f"Missing directory: {rel_dir}"


def test_expected_files_exist() -> None:
    """Required repository files are present."""
    repo_root = Path(__file__).resolve().parents[2]
    required_files = [
        "pyproject.toml",
        "README.md",
        "toxmcp.manifest.yaml",
        "Dockerfile",
    ]
    for rel_file in required_files:
        assert (repo_root / rel_file).is_file(), f"Missing file: {rel_file}"


def test_schemas_directory_populated() -> None:
    """Schemas directory contains at least one JSON schema file."""
    repo_root = Path(__file__).resolve().parents[2]
    schemas_dir = repo_root / "schemas" / "current"
    assert schemas_dir.is_dir()
    json_files = list(schemas_dir.glob("*.json"))
    assert len(json_files) >= 1


def test_examples_directory_populated() -> None:
    """Examples directory contains at least one example file."""
    repo_root = Path(__file__).resolve().parents[2]
    examples_dir = repo_root / "examples"
    assert examples_dir.is_dir()
    example_files = list(examples_dir.iterdir())
    assert len(example_files) >= 1


def test_benchmarks_directory_populated() -> None:
    """Benchmarks directory contains at least one benchmark file."""
    repo_root = Path(__file__).resolve().parents[2]
    benchmarks_dir = repo_root / "benchmarks"
    assert benchmarks_dir.is_dir()
    benchmark_files = list(benchmarks_dir.iterdir())
    assert len(benchmark_files) >= 1
