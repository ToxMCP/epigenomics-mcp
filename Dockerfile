# Multi-stage Node.js build for Epigenomics MCP.
FROM node:20-slim AS ts-build

WORKDIR /build
COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

FROM node:20-slim AS runtime

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=ts-build /build/dist ./dist
COPY schemas/ ./schemas/
COPY docs/ ./docs/
COPY scripts/ ./scripts/
COPY benchmarks/expected/ ./benchmarks/expected/
COPY benchmarks/fixtures/synthetic/ ./benchmarks/fixtures/synthetic/
COPY benchmarks/fixtures/frozen_public/ ./benchmarks/fixtures/frozen_public/
COPY release-evidence/ ./release-evidence/
COPY benchmark_manifest.yaml toxmcp.manifest.yaml evaluation.xml README.md CHANGELOG.md SECURITY.md CONTRIBUTING.md CITATION.cff LICENSE ./

RUN node -e "import('./dist/epimcp/index.js').then(m => console.log(m.VERSION))"

ENV NODE_ENV=production

# stdio remains the default. Streamable HTTP is opt-in and has no implicit
# EXPOSE; non-loopback binding additionally requires an allowlist and token.
USER node
ENTRYPOINT ["node", "dist/epimcp/cli.js"]
CMD ["serve"]
