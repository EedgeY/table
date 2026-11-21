# IEEE-754 with representation-error cleanup for Computed Column numbers

Computed Columns must give "practically correct" results for monetary calculations (e.g. `amount * quantity ::total`, `total * 0.1 ::tax`) and must not let floating-point noise corrupt comparisons (`0.000000000001 > 0` should be `false`). We compute in native IEEE-754 doubles and **clean** every numeric result — round to ~15 significant digits and snap values within an epsilon of zero to exactly `0` — then run comparisons on the cleaned value. Authors use the `round(value, places)` function for explicit monetary rounding. We deliberately do **not** implement exact decimal arithmetic.

## Considered Options

- **Raw IEEE-754** — rejected: surfaces `59.97000000000001` and wrongly-`true` comparisons; unacceptable for money.
- **Exact decimal / fixed-point arithmetic** — rejected: a true mathematical guarantee, but heavy to implement, materially slower per row at 1M rows, and complicated by JS number range (BigInt). Disproportionate for a headless table library.
- **IEEE-754 + cleanup + `round()` (chosen)** — fast, zero-dependency, and correct for all realistic business magnitudes.

## Consequences

This is "correct for realistic data," **not** a strict mathematical guarantee at the ~15th significant digit. If a future requirement demands certified exactness (regulatory rounding, currencies with unusual minor units), this decision must be revisited — likely an opt-in decimal mode isolated in the evaluator.
