# bm_dmr_nearest_gene_only

Benchmark for DMR features where the only available mapping method is nearest-gene.

## Contents

- `feature_table.json` — 2 DMR features with delta-beta values and valid hg38 coordinates.
- `design.json` — 3 dose groups with 3 biological replicates each.
- `metadata.json` — BS-seq provenance and mapping metadata declaring nearest-gene as the sole mapping method.
- `expected_policy.json` — Expected outcome: `accepted_with_caveats` with mapping-proximity warnings; handoff blocked for pathway roll-up.

## Scenario

Nearest-gene mapping is common in DMR pipelines but regulator-facing policy treats it as a caveat because proximity does not establish causality. This fixture tests that the qualification engine surfaces the correct warning and blocks automatic downstream pathway analysis while still permitting dose-response modelling on the features themselves.
