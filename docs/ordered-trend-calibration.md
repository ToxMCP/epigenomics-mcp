# Ordered-Trend Simulation Calibration

This document defines the deterministic simulation-calibration protocol for
`assess_ordered_trends`. The protocol is a release regression gate for the
implemented Jonckheere–Terpstra permutation path. It is not a claim of
universal statistical, biological, or regulatory validity.

The design follows the ADEMP structure recommended by
[Morris, White, and Crowther](https://doi.org/10.1002/sim.8086): aims,
data-generating mechanisms, estimands, methods, and performance measures are
declared before the results.

## Aims

1. Check exact enumeration against fixed, analytically verifiable cases.
2. Check that the two-sided test does not exceed its nominal 0.05 rejection
   rate across a bounded set of exchangeable null distributions.
3. Establish a declared sensitivity floor for strong increasing and
   decreasing ordered location shifts.
4. Compare seeded Monte Carlo p-values with the exact p-values from the same
   production inference core.
5. Characterize pointwise percentile-bootstrap interval coverage on two
   normal-data mechanisms.
6. Expose weak-signal, non-monotonic, heteroscedastic, and sample-imbalance
   behavior without converting assumption violations into validity claims.

## Data-generating mechanisms

All simulations use the independent `mulberry32_box_muller_v1` generator with
recorded seeds. Each exact-test scenario uses three ordered groups and the
two-sided 0.05 decision rule.

| Scenario | Group sizes | Location / scale | Role |
| --- | --- | --- | --- |
| Normal exchangeable null | 3/3/3 | 0/0/0; SD 1 | Type-I gate |
| Normal exchangeable null, imbalanced | 2/3/4 | 0/0/0; SD 1 | Type-I gate |
| Centered-lognormal exchangeable null | 3/3/3 | Identical distributions | Skewed-null gate |
| Symmetric discrete exchangeable null | 3/3/3 | Identical -1/0/1 distributions | Tie-null gate |
| Strong increasing / decreasing | 3/3/3 | Adjacent means separated by 2 SD | Power gate |
| Weak increasing | 3/3/3 | Adjacent means separated by 0.5 SD | Diagnostic |
| Inverted U | 3/3/3 | Means 0/3/0; SD 1 | Non-monotonic specificity gate |
| Heteroscedastic | 3/3/3 | Equal means; SD 1/2/4 | Assumption-stress diagnostic |
| Heteroscedastic inverse imbalance | 5/3/2 | Equal means; SD 1/2/4 | Assumption-stress diagnostic |

The heteroscedastic mechanisms do not satisfy the test's exchangeable-
distribution null. They are retained because permutation tests can miscontrol
type-I error when group distributions differ; this limitation is discussed by
[Xie et al.](https://doi.org/10.1093/bioinformatics/btl383). Their results are
reported, but they are not counted as proof of calibration.

## Estimands and methods

- Type-I error and power are the proportion of simulated datasets with
  `pValueTwoSided <= 0.05`.
- The ordered-pair effect is `2 × P(higher-dose value exceeds lower-dose
  value, with half credit for ties) - 1`.
- Exact cases enumerate every distinct allocation of dose labels. Random
  permutations use the plus-one correction of
  [Phipson and Smyth](https://doi.org/10.2202/1544-6115.1585), so a Monte Carlo
  p-value cannot be zero.
- Coverage is the proportion of 95% pointwise percentile-bootstrap intervals
  containing the known population ordered-pair effect. The calibration uses
  300 datasets and 499 bootstrap resamples per dataset.
- The simulation calls the same inference and interval cores used by the MCP
  packet assessment. No parallel reimplementation supplies the reported
  p-values.

## Performance measures and acceptance rules

Null rejection counts must remain at or below the one-sided 99% binomial
predictive bound under the declared reference rate. Reported rejection and
coverage proportions also carry 99% Wilson score intervals, based on
[Wilson's interval](https://doi.org/10.1080/01621459.1927.10502953).

The strong-signal scenarios pass only when the lower endpoint of the 99%
Wilson interval is at least 0.80. Monte Carlo agreement requires a root-mean-
square standardized error no greater than 1.5 and a maximum standardized error
no greater than 4.5 across 32 exact-versus-4,999-permutation comparisons. The
bootstrap coverage checks use a deliberately bounded safety floor: the 99%
Wilson lower endpoint must be at least 0.80. This is a catastrophic-
undercoverage guard, not a claim that the exploratory percentile interval has
exact 95% coverage.

## Current deterministic result

The committed `0.1.0` calibration report passes all 13 gated checks.

| Scenario | Observed rate | 99% Wilson interval | Interpretation |
| --- | ---: | ---: | --- |
| Normal null, balanced | 0.045 | 0.031–0.065 | Pass |
| Normal null, imbalanced | 0.019 | 0.011–0.034 | Pass; conservative |
| Centered-lognormal null | 0.040 | 0.027–0.059 | Pass |
| Discrete tied null | 0.013 | 0.006–0.026 | Pass; conservative |
| Strong increasing | 0.960 | 0.931–0.977 | Pass |
| Strong decreasing | 0.952 | 0.921–0.971 | Pass |
| Weak increasing | 0.170 | 0.131–0.218 | Diagnostic; limited small-sample sensitivity |
| Inverted U | 0.000 | 0.000–0.013 | Pass for declared specificity target |
| Heteroscedastic, balanced | 0.048 | 0.029–0.079 | Diagnostic only |
| Heteroscedastic inverse imbalance | 0.084 | 0.057–0.122 | Diagnostic only; exchangeability warning is material |

The exact-versus-Monte Carlo comparison has mean absolute p-value error
0.00321, root-mean-square standardized error 0.785, and maximum standardized
error 1.893. Pointwise bootstrap coverage is 0.937 for the zero-effect normal
mechanism and 0.900 for the moderate ordered-effect mechanism. These results
support the tool's existing exploratory boundary; they do not justify
removing it.

## Reproduction and change control

```bash
npm run calibrate:trend
npm run benchmark:ci
```

The fresh report is written to
`benchmark-results/ordered-trend-calibration.json`. The release gate compares
it byte-for-byte after JSON parsing with
`benchmarks/expected/ordered_trend_calibration/report.json`. A deliberate
method or protocol change requires scientific review of the diff, a changelog
entry, and then:

```bash
npm run calibrate:trend:update -- --confirm
```

The generated release-evidence bundle captures the fresh report and its
SHA-256 checksum. Passing this finite grid does not establish performance for
dependent observations, arbitrary assay distributions, genome-wide multiple
testing, weak biological effects, BMD estimation, or regulatory decisions.
