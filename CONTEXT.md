# tarbo-table

Domain glossary for the tarbo-table headless table library and its UI adapter. This file is a glossary only — no implementation details. It exists so agents and humans share precise language when extending the table's query, filtering, and computation features.

## Language

### Columns

**Column**:
A vertical field in the table, defined by a `ColumnDef` with an `accessor` that reads a value from a row. Once defined, a column can be sorted, filtered, and aggregated.
_Avoid_: Field, attribute (use **Column**).

**Computed Column**:
A first-class **Column** whose value is derived by evaluating an **Expression** over other columns of the same row (e.g. `age * amount`), rather than read directly from the row. It is defined dynamically (carried in the URL query, like a filter), can be placed at any position in the layout, and participates in sort / filter / aggregation exactly like a non-computed column. A Computed Column's Expression may reference Computed Columns defined **before** it (definition order is evaluation order); a forward reference is a parse error, which makes reference cycles impossible by construction. A Computed Column's name is its id and must be unique across all columns (source and computed); a name collision is a positioned parse error — Computed Columns never shadow or overwrite a source column.
_Avoid_: Formula column, virtual column, derived field, calculated field (use **Computed Column**).

**Expression**:
The calculation that produces a **Computed Column**'s value for a single row. Written in a bounded, sandboxed grammar that the library parses and evaluates itself (never `eval`): arithmetic (`+ - * / %`, parentheses), a fixed set of functions (e.g. `round`, `abs`, `min`, `max`, `coalesce`), conditionals (ternary), and string concatenation. `%` is **modulo** (remainder); there is no percent literal — write percentages as decimals (`0.1`). An Expression is strictly **per-row**: it references other columns of the same row by id and never reaches across rows (cross-row totals stay in the separate aggregation feature). The result type (number / string / boolean) is inferred statically from the expression's shape, falling back to the existing value-sampling path when inference is inconclusive. An Expression never throws: when an operand is missing, empty, non-numeric, or otherwise uncomputable for a given row (including division by zero), that row's value is `null` (an empty cell), which sorts via the existing nulls-first/last rules and is skipped by `sum`/`avg`/etc. Numeric results are **cleaned** of floating-point representation error (rounded to ~15 significant digits, with values within an epsilon of zero snapped to exactly `0`), and comparisons (`>`, `=`, …) operate on the cleaned value — so float noise such as `0.0000000001` is treated as `0`. Genuine small values (`0.001`) are preserved. For exact monetary rounding, the Expression author uses the `round(value, places)` function.
_Avoid_: Formula, computation, calc (use **Expression**).

### Rows

**Result Set**:
The rows that satisfy the current filter, in current sort order — the full matched set, independent of pagination. A **Page** is a slice of it.
_Avoid_: Visible rows (overloaded — see Flagged ambiguities), filtered rows, matched rows.

**Page**:
The contiguous slice of the **Result Set** bounded by the current pagination (page index × page size) — the rows one page shows. When page size is unbounded the Page equals the Result Set.
_Avoid_: Paged rows, window, viewport.

### Mode

**Mode** (client / server):
Where filter / sort / pagination run. In **client mode** they run in-process over the rows held in memory, so the **Result Set** is computed locally. In **server mode** they are delegated to the data source on each query-affecting change; the **Result Set** and **Page** are whatever the data source returns for the current query, the page index is not clamped locally, and row positions carry no stable meaning.
_Avoid_: local/remote, online/offline.

## Flagged ambiguities

**"Visible"** is overloaded and should be qualified:

- For **rows**, "visible" has historically meant the whole **Result Set** (everything passing the filter), _not_ the rows on screen. Prefer **Result Set**; the rows actually on screen are the **Page**.
- For **columns**, "visible" means _not hidden_ (a column the user has not toggled off). This sense is unrelated to rows.
