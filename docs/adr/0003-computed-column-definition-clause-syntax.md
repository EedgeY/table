# Computed Column definitions use a `let name = expr;` clause in the query DSL

Computed Columns are defined inline in the existing query DSL string (the URL `ttq` param) using a `let <name> = <expression>;` clause — e.g. `let total = amount * quantity; let tax = ROUND(total * 0.1, 2)` — before any filter/sort clauses. The expression body follows spreadsheet/Excel conventions (`IF(c, a, b)`, `&` for string concat, uppercase function names, columns referenced by name). We chose `let … ;` specifically to avoid token collisions with the existing DSL, where `=` already means filter equality and `|` already means OR.

## Considered Options

- **Reuse `=` for assignment and `|` as a separator** — rejected: ambiguous against the existing equality (`=`) and OR (`|`) operators in the same string.
- **`expression :: name` postfix (the user's first sketch)** — viable and spreadsheet-flavoured, but the expression's end is harder to parse than a keyword-introduced clause.
- **A separate URL param for definitions** — rejected earlier: avoids collisions but splits parsing/serialization into two systems.
- **`let name = expr;` (chosen)** — the `let` keyword makes the following `=` unambiguously assignment, and `;` separates definitions without colliding with `|`. The primary authoring surface is a GUI for non-engineers; this string is the generated, shareable transport form.

## Consequences

Once shared URLs contain `let …;` definitions, the clause grammar is a compatibility surface. Safety does not depend on the syntax: regardless of what the string contains, only the sandboxed grammar from ADR-0001 is ever evaluated — JS-looking input simply fails to parse.
