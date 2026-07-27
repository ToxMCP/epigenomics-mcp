"""Metadata compatibility package for the TypeScript Epigenomics MCP server.

The production server and scientific implementation live in the Node.js
package. This distribution intentionally exports only the matching version for
Python-based suite tooling. Historical analysis dependencies remain available
through the ``analysis-compat`` extra; installing this package alone does not
provide a second MCP implementation.
"""

from epigenomics_mcp.version import __version__

__all__ = ["__version__"]
