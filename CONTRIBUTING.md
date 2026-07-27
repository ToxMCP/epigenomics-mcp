# Contributing

Epigenomics MCP is fail-closed scientific infrastructure. Changes should keep
measured evidence separate from inferred interpretation and must not broaden
the documented product boundary implicitly.

## Local checks

Use Node.js 20 or newer:

```bash
npm ci
npm run lint
npm test
npm run smoke:mcp
npm run test:release-gates
```

The optional Python compatibility-package checks require Python 3.11 or newer:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
pytest tests/python
```

Add or update unit tests for behavior changes. Contract or golden-output
changes require a changelog entry and explicit scientific review. Do not
regenerate golden outputs merely to make a failing comparison pass.
After that review, regenerate with `npm run benchmark:update` and inspect the
complete diff before committing.

## Release evidence

Release evidence must be generated from a clean, committed source tree:

```bash
npm run release:evidence
npm run verify:evidence
```

Commit the refreshed `release-evidence/` bundle separately or with the release
commit so its source commit and checksums remain reviewable.
