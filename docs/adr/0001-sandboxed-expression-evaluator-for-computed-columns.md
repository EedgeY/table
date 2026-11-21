# Sandboxed, hand-written expression evaluator for Computed Columns

Computed Columns let users define per-row calculations (e.g. `age * amount`) that travel in the URL query, like a filter. Because the expression text comes from an untrusted URL (shared links would otherwise become arbitrary code execution) and the core package is zero-dependency by charter and runs in a 1M-row hot path, we evaluate expressions with a hand-written, compile-once parser and evaluator — the same lexer→parser→compiled-node shape as the existing query DSL — and **never** with `eval` / `new Function` or an external expression library.

## Considered Options

- **`eval` / `new Function`** — rejected: untrusted URL input → XSS-class arbitrary code execution; breaks CSP.
- **An expression library (mathjs, expr-eval, …)** — rejected: violates the zero-dependency core charter and adds bundle weight.
- **Hand-written sandboxed grammar (chosen)** — bounded scope (arithmetic, a fixed function set, conditionals, string concat), per-row only, compiled once per expression like `_compilePredicate`.

## Consequences

The grammar is a compatibility surface once expressions appear in shared URLs; widening it later is easy, narrowing it is not. The fixed function set and per-row restriction are deliberate scope boundaries — cross-row aggregates stay in the separate aggregation feature.
