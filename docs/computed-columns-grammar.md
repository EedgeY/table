# Computed Columns — v1 expression grammar & function set (spec)

> Status: **proposed**, awaiting maintainer sign-off. Resolves issue #7 (the HITL gate that unblocks #8).
>
> Ratifies the decisions in ADR-0001 (sandboxed evaluator), ADR-0002 (IEEE-754 + cleanup), and ADR-0003 (`let … ;` clause) into a concrete, testable surface.
>
> **Why this is a gate:** the moment a `let …;` definition ships inside a shared `ttq` URL, this grammar becomes a backward-compatibility surface. Widening it later (new functions, looser coercion) is cheap; narrowing it (removing a function, tightening coercion) breaks existing links. v1 is therefore **deliberately small** — start minimal, add on demand.

Everything below marked **[D]** is a decision that needs explicit sign-off. The defaults proposed are the recommended answers.

---

## 1. Where it fits in the DSL

A query string is, in order:

```
[ let-clause ]*  [ predicate ]  [ "by" sort ]  [ "chart" chart ]
```

`let` clauses come **first**, before the filter predicate (ADR-0003). Each defines one computed column. Example:

```
let total = amount * quantity; let tax = round(total * 0.1, 2); tax > 1000 by -total
```

This parses to: two computed columns (`total`, `tax`), a predicate `tax > 1000`, and a sort `-total`. Once registered, `total` and `tax` are ordinary columns — filterable, sortable, rendered, exported, and round-tripped through the URL.

---

## 2. New lexer tokens

These extend `_query-lexer.ts`. None of them are prefixes/suffixes of existing operators, and none appear in any currently-valid filter string, so **adding them changes no existing query's meaning.**

| Token    | Text  | Role                                  |
| -------- | ----- | ------------------------------------- |
| `KW_LET` | `let` | introduces a definition clause        |
| `SEMI`   | `;`   | terminates a definition clause        |
| `PLUS`   | `+`   | numeric addition (expression context) |
| `STAR`   | `*`   | multiplication                        |
| `SLASH`  | `/`   | division                              |
| `AMP`    | `&`   | string concatenation                  |

Reused as-is in expression context: `MINUS` (`-`, binary subtract / unary negate), `LPAREN` `RPAREN` `COMMA`, and the comparison operators `=` `!=` `>` `<` `>=` `<=` (already lexed as `OP`). The `~` / `~^` / `~$` / `~i` operators are **filter-only** and are not valid inside an expression.

**[D] `let` becomes a reserved word.** A column literally named `let` must be quoted (`"let"`) to be used as a filter column — same rule that already applies to `by`, `or`, `and`, etc. Accepted.

---

## 3. Grammar (EBNF)

```ebnf
query        = { letClause } [ predicate ] [ "by" sortList ] [ "chart" chart ] ;

letClause    = "let" IDENT "=" expr ";" ;

(* precedence low → high, see §4 *)
expr         = compare ;
compare      = concat [ ("=" | "!=" | ">" | "<" | ">=" | "<=") concat ] ;  (* non-associative *)
concat       = additive { "&" additive } ;
additive     = multiplicative { ("+" | "-") multiplicative } ;
multiplicative = unary { ("*" | "/") unary } ;
unary        = "-" unary | primary ;
primary      = NUMBER
             | STRING
             | columnRef
             | funcCall
             | "(" expr ")" ;

columnRef    = IDENT | STRING ;           (* resolves to a real or earlier computed column *)
funcCall     = IDENT "(" [ expr { "," expr } ] ")" ;
```

`predicate`, `sortList`, and `chart` are unchanged from the existing grammar.

---

## 4. Operator precedence

Excel/spreadsheet convention (ADR-0003), from **highest** binding to **lowest**:

| Level | Operators        | Associativity       |
| ----- | ---------------- | ------------------- |
| 1     | unary `-`        | right               |
| 2     | `*` `/`          | left                |
| 3     | binary `+` `-`   | left                |
| 4     | `&` (concat)     | left                |
| 5     | `= != > < >= <=` | **non-associative** |

**[D] Comparison is non-associative.** `a < b < c` is a parse error, not `(a<b)<c`. Avoids the surprising "compare a boolean to a number" trap. Accepted.

---

## 5. The fixed function set (v1)

Function names are **case-insensitive** (consistent with DSL keywords): `IF`, `if`, `If` all work. Canonical/serialized form is documented per function.

**[D] v1 function set** — minimal and defensible. Everything else is deferred (see below); adding later is non-breaking.

| Function                  | Arity        | Returns | Notes                                                                            |
| ------------------------- | ------------ | ------- | -------------------------------------------------------------------------------- |
| `IF(cond, then, else)`    | 3            | any     | lazy: only the taken branch is evaluated (§8). ADR-0003.                         |
| `round(value [, places])` | 1–2          | number  | half-away-from-zero; `places` defaults to `0`; negative allowed (§10). ADR-0002. |
| `abs(value)`              | 1            | number  | null-propagating                                                                 |
| `floor(value)`            | 1            | number  | toward −∞                                                                        |
| `ceil(value)`             | 1            | number  | toward +∞                                                                        |
| `min(a, b, …)`            | ≥1, variadic | number  | ignores null operands; all-null → null                                           |
| `max(a, b, …)`            | ≥1, variadic | number  | ignores null operands; all-null → null                                           |
| `coalesce(a, b, …)`       | ≥1, variadic | any     | first non-null / non-undefined operand; pairs with null-propagation              |
| `lower(text)`             | 1            | string  | Unicode lower-case; null → `""`                                                  |
| `upper(text)`             | 1            | string  | Unicode upper-case; null → `""`                                                  |

Unknown function name, or wrong arity, is a parse-time `ParseError` (`{ message, position, token }`).

**Deferred (NOT in v1; add on request, non-breaking):** `sqrt`, `pow`, `mod`, `trunc`, `sign`, `len`, `trim`, `left`, `right`, `mid`, `substitute`, `contains`, any date/time functions. **Cross-row aggregates (`sum`, `avg`, …) are explicitly excluded** and remain in the separate aggregation feature (ADR-0001 scope boundary).

---

## 6. Value & type model

Cell and intermediate values are `CellValue = string | number | boolean | null | undefined`. Coercion mirrors the existing `_coerceNumber` / `_cmpAny` conventions so computed columns behave like hand-written accessors.

### 6.1 Coerce-to-number (arithmetic operands, numeric functions)

Same rules as `_coerceNumber`:

| Input                        | → number     |
| ---------------------------- | ------------ |
| number (finite)              | itself       |
| `true` / `false`             | `1` / `0`    |
| numeric string               | parsed value |
| `""` / non-numeric string    | **null**     |
| `null` / `undefined` / `NaN` | **null**     |

### 6.2 Coerce-to-string (operands of `&`, `lower`/`upper`)

| Input                | → string                                                               |
| -------------------- | ---------------------------------------------------------------------- |
| string               | itself                                                                 |
| number               | cleaned-number minimal decimal (§9), e.g. `0.3` not `0.30000000000004` |
| `true` / `false`     | `"true"` / `"false"`                                                   |
| `null` / `undefined` | `""` (empty string)                                                    |

---

## 7. Operator semantics

### Arithmetic — `+` `-` `*` `/`, unary `-`

- **`+` is strictly numeric addition.** String joining is `&` only (Excel semantics). **[D]** Accepted — avoids the JS `"1"+"2"==="12"` footgun in shared URLs.
- Each operand is coerced to number (§6.1).
- **[D] Null propagation:** if any operand coerces to `null`, the result is `null`. (We do **not** treat a blank/missing cell as `0`. A computed cell over missing data is itself blank, which is the defensible default for a data table.) Accepted.
- **[D] Division by zero → `null`** (never `Infinity`/`NaN`). Accepted.
- The final stored value is cleaned (§9).

### Concatenation — `&`

- Operands coerced to string (§6.2). Result is **always a string, never null** (`null & "x"` → `"x"`). **[D]** Accepted.

### Comparison — `= != > < >= <=`

- Returns a **boolean**.
- Both operands are cleaned (§9) when numeric, **before** comparing (ADR-0002: "run comparisons on the cleaned value").
- `=` / `!=`: if both coerce to numbers, compare numerically on cleaned values; otherwise compare as strings (case-sensitive). `null`/`undefined` are equal only to `null`/`undefined`.
- `> < >= <=`: numeric if both numeric, else lexicographic string (the `_cmpAny` convention). **[D] Any ordering comparison with a `null`/`undefined` operand yields `false`** (SQL-like; keeps `IF` conditions predictable). Accepted.

---

## 8. Truthiness (the `IF` condition)

`IF(cond, then, else)` evaluates `cond`, then **lazily** evaluates only the taken branch (so `IF(qty = 0, 0, total / qty)` never needs the divide-by-zero path).

**[D] Falsy:** `false`, `0` (after cleanup, including `-0` and snapped-to-zero), `""`, `null`, `undefined`, `NaN`. **Everything else is truthy** — note the spreadsheet-flavored consequence that the non-empty string `"false"` is **truthy**. Accepted.

---

## 9. Numeric cleanup contract (ADR-0002)

`cleanNumber(x)`:

1. If `x` is not finite (`NaN`, `±Infinity`) → **`null`** (non-finite never surfaces in a cell). **[D]** Accepted.
2. Round to **15 significant digits**: `r = Number(x.toPrecision(15))`.
3. Snap to zero: if `Math.abs(r) < EPSILON_ZERO` → `0`.
4. Return `r`.

**[D] `EPSILON_ZERO = 1e-9`.** Must exceed the ADR-0002 worked example (`0.000000000001 = 1e-12` must snap to `0` so `… > 0` is `false`); `1e-9` clears it with margin while staying far below any realistic business magnitude. Accepted.

**Application points** (where cleanup runs — chosen to fix representation bugs without taxing the 1M-row hot path):

- **(a)** the final numeric value assigned to a computed column;
- **(b)** each numeric operand of a comparison operator, immediately before comparing;
- **(c)** inside `round()` (§10).

**[D] Intermediate arithmetic results are NOT cleaned per step.** Cleaning at (a) and (b) is sufficient to prevent the wrong-`true` comparison and the `59.97000000000001` display bugs, and avoids a `toPrecision` call per arithmetic op per row. Accepted.

Worked checks (testable):

- `0.1 + 0.2` stored → `0.3` (cleaned at point a).
- `0.000000000001 > 0` → `false` (LHS snaps to `0` at point b).
- `59.99 * 1.0` stored → `59.99`, not `59.99000000000001`.

---

## 10. `round(value, places)` (ADR-0002)

Explicit monetary rounding, distinct from the automatic cleanup.

- `value` coerced to number (§6.1); `null` → `null`.
- `places` coerced to number then **truncated to an integer** toward zero; **[D]** defaults to `0` when omitted; negative values allowed (round to tens/hundreds). Accepted.
- **[D] Rounding mode: half away from zero** (the money convention), not JS `Math.round`'s half-toward-+∞. Accepted.

Algorithm (representation-safe — leans on cleanup so `round(2.345, 2)` is robust):

```
v = cleanNumber(value);            if v === null → return null
f = 10 ** places
s = cleanNumber(v * f)
r = sign(s) * Math.round(Math.abs(s))   // half away from zero
return cleanNumber(r / f)
```

Testable examples:

| Call                                       | Result |
| ------------------------------------------ | ------ |
| `round(2.5)`                               | `3`    |
| `round(-2.5)`                              | `-3`   |
| `round(2.345, 2)`                          | `2.35` |
| `round(2.344, 2)`                          | `2.34` |
| `round(1234, -2)`                          | `1200` |
| `round(total*0.1, 2)` where `total=999.99` | `100`  |

---

## 11. Identifiers & collisions

- **Column references** inside an expression: bare `IDENT` (alphanumeric, `_`, or non-ASCII e.g. Japanese), or a quoted `STRING` for names with spaces/punctuation — identical to how the filter grammar accepts column ids.
- **Definition name** (`let <name>`): **[D] must be a bare `IDENT`** (no quoted/spaced names for definitions in v1 — keeps the generated, shareable string simple). Accepted.
- **Collision rules** (all are parse-time `ParseError`):
  - name equals an existing real column id → error (no shadowing);
  - name duplicates an earlier `let` name in the same string → error.
- **Resolution & ordering:** an expression may reference real columns **and** computed columns defined **earlier** in the same string (ADR-0003 example: `tax` uses `total`). A reference to a not-yet-defined name (forward reference or self-reference) is an "unknown column" error. Left-to-right ordering makes cycles impossible.

---

## 12. Parse output & round-trip

- The DSL parse result gains an ordered list of computed-column definitions alongside `predicate` / `sort`. Each definition carries its name and a compiled-once expression (the exact TS shape is implementation, issue #8); ordering is preserved so registration can resolve earlier-defined references.
- `stringifyQuery` emits `let <name> = <expr>;` clauses first, in definition order, before the predicate/sort. The existing round-trip guarantee extends to computed definitions:

  ```
  parseQuery(stringifyQuery(x))  ≡  x        (structurally, including computed columns)
  ```

- **Safety (ADR-0001):** whatever the string contains, only this grammar is ever evaluated. JS-looking input (`eval(...)`, `a => b`, `${x}`) simply fails to parse — it is never executed.

---

## 13. Worked examples (acceptance fixtures)

```
let total = amount * quantity
  → numeric computed column; null if amount or quantity is blank

let tax = round(total * 0.1, 2)
  → references the earlier `total`; monetary-rounded

let label = first & " " & last
  → string column; blank parts contribute ""

let band = IF(salary >= 50000, "high", "low")
  → string column from a per-row condition

let net = IF(qty = 0, 0, round(total / qty, 2))
  → lazy branch avoids the divide path when qty is 0
```

---

## 14. Sign-off checklist (maps to issue #7 acceptance criteria)

- [ ] **Operators & precedence** enumerated (§2–§4), including how `&` binds vs arithmetic and that comparison is non-associative.
- [ ] **Complete fixed function set** pinned (§5), with the deferred list and the aggregate exclusion.
- [ ] **Type-coercion & truthiness** written for every operator and for `IF` (§6–§8).
- [ ] **Numeric cleanup contract** precise enough to test: 15 sig-digit rounding, `EPSILON_ZERO = 1e-9`, application points (a)/(b)/(c) (§9).
- [ ] **`round()` semantics** — half-away-from-zero, default/negative places, representation-safe algorithm (§10).
- [ ] **Identifier & collision rules** for references and `let` names (§11).
- [ ] **Maintainer reviewed and signed off** → unblocks #8.

Open decisions to confirm are every **[D]** above. The ones most worth a second look: **null-propagation vs blank-as-zero in arithmetic (§7)**, **`EPSILON_ZERO = 1e-9` (§9)**, and **the exact v1 function set (§5)** — these three are the hardest to change once URLs are in the wild.

```

```
