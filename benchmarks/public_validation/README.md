# Full public-data validation panel

This panel exercises `ingest_dataset` through the official MCP stdio client
against complete, checksummed files from public archives. Source files are
downloaded into the ignored `benchmark-cache/public-data/` directory and are
not redistributed in the npm package.

| Case | Public source | Complete rows | Expected MCP outcome |
| --- | --- | ---: | --- |
| GSE67005 low-dose MeDIP | NCBI GEO | 2,077,859 | Data, design, and provenance valid |
| GSE84189 five-day VPA MeDIP | NCBI GEO | 384,368 | Data, design, and provenance valid |
| ENCSR220ASC / ENCFF205CPH replicated ATAC peaks | ENCODE | 171,471 | Data and provenance valid; baseline-only design rejected |

Run the panel with:

```bash
npm run validate:public-data
```

After a successful online run, reproduce it without network access from the
verified local cache:

```bash
npm run validate:public-data -- --offline
```

The runner verifies the compressed byte count and SHA-256 digest before
starting the server. The MCP then streams, canonicalizes, and hashes the
decompressed content in batches no larger than 5,000 rows. Results are written
to the ignored `benchmark-results/public-data/` directory.

The manifest and expected results are source-anchored and internally reviewed.
External domain-expert sign-off remains pending. A pass proves source identity,
complete-file structural ingestion, declared design handling, and fail-closed
behavior. It does not prove biological ground truth, differential methylation,
statistical power, false-discovery control, causal interpretation, or
regulatory validity.
