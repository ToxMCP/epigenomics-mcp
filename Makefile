# Epigenomics MCP — Developer command runner
# Supports both TypeScript/Node and Python toolchains

PYTHON := .venv/bin/python
PYTEST := .venv/bin/pytest
RUFF := .venv/bin/ruff
MYPY := .venv/bin/mypy
COVERAGE := .venv/bin/coverage

# ---------------------------------------------------------------------------
# Default target
# ---------------------------------------------------------------------------
.PHONY: all
all: lint typecheck test

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
.PHONY: help
help:
	@echo "Epigenomics MCP developer commands"
	@echo ""
	@echo "  make lint              Run linters (ruff + tsc --noEmit)"
	@echo "  make typecheck         Run type checkers (mypy + tsc --noEmit)"
	@echo "  make test              Run full test suite (Vitest + pytest)"
	@echo "  make test-contract     Run contract/schema tests only"
	@echo "  make test-python       Run Python tests with coverage"
	@echo "  make test-ts           Run TypeScript tests"
	@echo "  make export-schemas    Export JSON schemas from TypeScript contracts"
	@echo "  make run-benchmarks    Run performance benchmarks"
	@echo "  make validate-handoff  Validate benchmark handoff fixtures"
	@echo "  make docker-smoke      Build Docker image and run smoke test"
	@echo "  make smoke             Run the default command set smoke test"
	@echo "  make clean             Remove build artifacts and caches"
	@echo ""

# ---------------------------------------------------------------------------
# Lint
# ---------------------------------------------------------------------------
.PHONY: lint
lint:
	@echo "=== Python lint (ruff) ==="
	$(RUFF) check src/epigenomics_mcp/ tests/python/
	@echo "=== TypeScript lint (tsc --noEmit) ==="
	npm run typecheck

# ---------------------------------------------------------------------------
# Typecheck
# ---------------------------------------------------------------------------
.PHONY: typecheck
typecheck:
	@echo "=== Python typecheck (mypy) ==="
	$(MYPY) src/epigenomics_mcp/
	@echo "=== TypeScript typecheck ==="
	npm run typecheck

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
.PHONY: test
test: test-ts test-python

.PHONY: test-ts
test-ts:
	@echo "=== TypeScript tests (vitest) ==="
	npm run test

.PHONY: test-python
test-python:
	@echo "=== Python tests (pytest + coverage) ==="
	$(PYTEST) tests/python/ -v --cov=src/epigenomics_mcp --cov-report=term-missing --cov-report=html:htmlcov --cov-report=json:coverage.json

.PHONY: test-contract
test-contract:
	@echo "=== TypeScript contract tests ==="
	npx vitest run \
		tests/unit/contracts.test.ts \
		tests/unit/schema_drift.test.ts \
		tests/unit/schema_drift_integration.test.ts \
		tests/unit/schema_export.test.ts \
		tests/unit/handoff.test.ts \
		tests/unit/handoff_validator.test.ts

# ---------------------------------------------------------------------------
# Schema export
# ---------------------------------------------------------------------------
.PHONY: export-schemas
export-schemas:
	npm run export:schemas

# ---------------------------------------------------------------------------
# Benchmarks
# ---------------------------------------------------------------------------
.PHONY: run-benchmarks
run-benchmarks:
	@echo "=== Python qualification benchmark ==="
	$(PYTHON) benchmarks/qualification_engine_benchmark.py --features 10000 --replicates 6

# ---------------------------------------------------------------------------
# Handoff validation
# ---------------------------------------------------------------------------
.PHONY: validate-handoff
validate-handoff:
	@echo "=== Validating handoff fixtures ==="
	node scripts/validate-handoffs.mjs

# ---------------------------------------------------------------------------
# Docker smoke test
# ---------------------------------------------------------------------------
.PHONY: docker-smoke
docker-smoke:
	@echo "=== Building Docker image ==="
	docker build -t epigenomics-mcp:smoke .
	@echo "=== Docker CLI help smoke test ==="
	docker run --rm epigenomics-mcp:smoke --help
	@echo "=== Docker smoke test completed ==="

# ---------------------------------------------------------------------------
# Default command set smoke test
# ---------------------------------------------------------------------------
.PHONY: smoke
smoke: lint typecheck export-schemas validate-handoff run-benchmarks
	@echo ""
	@echo "=== Default command set smoke test PASSED ==="
	@echo "All default commands executed successfully."

# ---------------------------------------------------------------------------
# Clean build artifacts
# ---------------------------------------------------------------------------
.PHONY: clean
clean:
	rm -rf dist/
	rm -rf .coverage/
	rm -rf .pytest_cache/
	rm -rf .ruff_cache/
	rm -rf node_modules/.vitest/
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name '*.pyc' -delete 2>/dev/null || true
