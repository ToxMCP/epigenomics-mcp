"""Epigenomics MCP – Model Context Protocol server for processed epigenomic feature evidence qualification.

This package provides the core domain logic for converting processed epigenomic assay outputs
into qualified, annotation-aware, provenance-rich feature-response packets that downstream
Bioactivity-PoD MCP can consume for quantitative modelling.

The package is deliberately bounded:
- It is NOT a raw sequencing workbench
- It is NOT a peak caller
- It is NOT a chromatin-state learner
- It is NOT a PoD/BMD modeller
- It IS the qualification and packetisation layer between upstream epigenomic preprocessing
  and downstream quantitative bioactivity modelling.
"""

from epigenomics_mcp.version import __version__

__all__ = ["__version__"]
