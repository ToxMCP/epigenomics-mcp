# Non-Goals

Epigenomics MCP explicitly does **not** perform the following functions.

## Raw Data Processing

- Raw FASTQ processing
- Raw IDAT preprocessing
- Bisulphite alignment
- Methylation calling from raw reads
- Peak calling from BAM files

## Advanced Modelling

- Chromatin-state modelling (e.g., ChromHMM, Segway)
- Enhancer-gene causal inference
- miRNA target prediction as a primary algorithm
- PoD/BMD modelling (downstream Bioactivity-PoD MCP responsibility)
- Regulatory conclusion generation

## Claims Beyond Evidence

- Persistence, heritability, or transgenerational-effect claims
- Direct causal statements from correlation-only designs

## Rationale

Keeping these out of scope preserves a clear product boundary and prevents the MCP from overreaching into domains where specialised tools already exist. The v0.1 release is intentionally narrow: **qualify what you have, packetise it cleanly, and hand it off**.
