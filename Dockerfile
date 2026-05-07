# Multi-stage build for Epigenomics MCP
# Stage 1: TypeScript build
FROM node:20-slim AS ts-build

WORKDIR /build
COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

# Stage 2: Python environment
FROM python:3.12-slim AS python-env

WORKDIR /app

# Install Python dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]"

# Copy Python source
COPY src/epigenomics_mcp/ ./src/epigenomics_mcp/
RUN pip install --no-cache-dir -e .

# Stage 3: Runtime
FROM python:3.12-slim AS runtime

WORKDIR /app

# Install Node.js for MCP server runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts
COPY --from=ts-build /build/dist ./dist
COPY --from=ts-build /build/node_modules ./node_modules
COPY --from=ts-build /build/package*.json ./
COPY --from=python-env /app/src/epigenomics_mcp ./src/epigenomics_mcp
COPY --from=python-env /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages

# Copy schemas and docs
COPY schemas/ ./schemas/
COPY docs/ ./docs/
COPY toxmcp.manifest.yaml ./

# Verify installation
RUN python -c "import epigenomics_mcp; print(epigenomics_mcp.__version__)" \
    && node -e "import('./dist/epimcp/index.js').then(m => console.log(m.VERSION))"

ENV NODE_ENV=production

# No network transport exposed by default; MCP server uses stdio only.

ENTRYPOINT ["node", "dist/epimcp/cli.js"]
CMD ["serve"]
