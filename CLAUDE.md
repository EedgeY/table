# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

`tarbo-table` is a zero-dependency, high-performance headless table library plus a Supabase-style React UI adapter. Three publishable packages, monorepo via pnpm workspaces:

- `@tarbo-table/core` (`packages/core`) — headless logic (filter AST, multi-sort, pagination, selection, grouping, aggregation, virtualization, CSV/TSV export, CLI query DSL). **Runtime deps: zero.**
- `@tarbo-table/ui` (`packages/ui`) — React 19 + Tailwind v4 + Radix-based components. Depends only on `@tarbo-table/core` at runtime (+ Radix/lucide for chrome).
- `@tarbo-table/core-rs` (`packages/core-rs`) — optional Rust → WebAssembly engine (filter, sort, pagination) plugged in through `createTable({ engine })`.
- `examples/vanilla-1m` — 1M-row vanilla DOM demo (consumes core directly).
- `examples/react-supabase` — Supabase-style React demo (consumes ui).

## Commands

All scripts run through pnpm. Node ≥ 20 required; the flake.nix dev shell pins Node 22 + pnpm 10.

```bash
pnpm install            # installs all workspaces (preinstall enforces pnpm only)
pnpm build              # tsdown build of every package
pnpm typecheck          # tsgo --noEmit across packages (uses @typescript/native-preview)
pnpm test               # vitest run, TZ=UTC, across packages/* (root vitest.config.ts)
pnpm test path/to/file  # single-file run
pnpm lint               # parallel: oxfmt --check, eslint at root, per-package eslint
pnpm format             # oxfmt . (in-place)
pnpm dev:vanilla        # vite dev server for examples/vanilla-1m (1M-row demo)
pnpm dev:react          # vite dev server for examples/react-supabase
pnpm release            # bumpp -r (per-package version bump)
```

Per-package:

```bash
pnpm --filter @tarbo-table/core build
pnpm --filter @tarbo-table/core test
pnpm --filter @tarbo-table/ui build
```

Lefthook is installed via `prepare` and runs `oxfmt` + targeted eslint on staged files at pre-commit, and full lint + `vitest related` on pre-push.

## Architecture

### Headless core: the pipeline

`packages/core/src/_pipeline.ts` is the single mutable hot spot in an otherwise frozen public surface. It owns a scratch `Uint32Array` of row indices and runs a dirty-flag-driven **filter → sort → page** pipeline. State is held as index arrays (`filtered`, `sorted`, `paged`), never as copies of row data; rows are dereferenced lazily through column accessors.

- `_setData` / `_setPredicate` / `_setSort` / `_setPagination` mark only the affected dirty flags downstream. Calling `setPagination` does not re-filter.
- `_filter-engine.ts` _compiles_ a `Predicate` AST into a `CompiledNode` once per (predicate, columns) pair. The compiled form caches accessors, lowercased string targets, parsed numeric targets, and tags ops as integers (`OP_TAGS` in `_types.ts`) so the per-row inner loop avoids string compares.
- Sort uses a precomputed comparator (`_sort-engine.ts`) over column accessors, stable, with nulls-first/last handling in `_utils._cmpAny`.
- `getVirtualRange` (in `virtual.ts`) is a DOM-independent pure function — the UI layer is responsible for translating it to scroll/transform.

### Public surface composition

`create-table.ts` (`createTable`) is the only constructor users call. It:

1. Flattens `ColumnNode[]` (which can include `ColumnGroupDef` for multi-level headers) into the flat `ColumnDef[]` the pipeline operates on. The tree is preserved separately for `getColumnTree()` → header rendering.
2. Owns frozen `TableState` and a `Set<Listener>`; setters create a new frozen state and `notify()` synchronously.
3. Exposes `subscribe` and `subscribeWithSelector` — the latter is what the React `useTable` hook in `@tarbo-table/ui` consumes via `useSyncExternalStore`.
4. `groupBy` + `aggregations` live _outside_ `TableState` (separate refs) because they don't participate in the index pipeline; they're recomputed on demand in `getGroupedRows` / `getOverallAggregates` from the already-sorted indices.

### Query DSL

`query.ts` → `_query-lexer.ts` → `_query-parser.ts` parse a CLI-like string (e.g. `salary>=50000 name~"田中" by -age, name`) into `{ predicate, sort }`. Errors return a `Result` with `{ message, position, token }` so the `<CommandLineInput />` UI can underline the offending span. Keywords are case-insensitive; column ids must resolve against the provided `columns`. See README "CLI クエリ DSL" for the full grammar.

### UI adapter

`packages/ui` is consumer-facing React. `DataTable` composes `Toolbar` + `FilterBar` + a virtual-scroll body + `StatusBar`, all driven from a single `TableInstance` prop. State subscriptions flow through `useTable(table)`. Headers auto-detect multi-level mode when `ColumnGroupDef` is present in the tree, and `MultiHeader` consumes `buildHeaderMatrix` from core. The package's only sideeffect entry is `./styles.css` (Tailwind v4).

## Conventions specific to this repo

- **Underscore prefix = internal.** Files like `_pipeline.ts`, `_filter-engine.ts`, `_types.ts`, `_utils.ts` are not exported from `index.ts` and are excluded from the tsdown entry (`!./src/_*.ts`). Public surface lives in non-prefixed files.
- **In-source tests.** Vitest runs with `includeSource: ['src/**/*.{ts,tsx}']`. Tests live inside `if (import.meta.vitest) { ... }` blocks at the bottom of each source file. tsdown strips them via `define: { 'import.meta.vitest': 'undefined' }`. Do not move tests to separate `*.test.ts` files unless there is a strong reason.
- **`.ts` extensions on internal imports** (`import { _runPage } from './_pipeline.ts'`) — required by `allowImportingTsExtensions` + `verbatimModuleSyntax`.
- **Type-only imports must use `import type`** — enforced by eslint `consistent-type-imports`.
- **No formatting rules in eslint.** oxfmt owns all formatting (tabs, single quotes — see `oxfmt.config.ts`). Don't fight it.
- **Dependency versions live in `pnpm-workspace.yaml` catalogs.** `package.json` files reference them with `"catalog:<group>"` (e.g. `"react": "catalog:react"`). `catalogMode: strict` means workspace packages may not declare bare version strings. Add new deps to a catalog group first, then reference.
- **Supply-chain hardening is on**: `minimumReleaseAge: 2880` (48h), `strictDepBuilds: true`, `blockExoticSubdeps: true`, `trustPolicy: no-downgrade`. Never bypass with `--safe-chain-skip-minimum-package-age`.
- **TypeScript via `@typescript/native-preview` (`tsgo`)** — not `tsc`. `pnpm typecheck` uses the native preview compiler.
- **No `any`.** `@typescript-eslint/no-explicit-any` is `error`. `noUncheckedIndexedAccess: true` is on — array/map reads are `T | undefined`; expect `!` or guards.
- **Console.** `console.log` is banned by eslint; `console.warn`/`error` are allowed. UI package has its own `_logger.ts`.
- **Frozen state.** `TableState` is `Readonly<...>` and `Object.freeze`-d on every transition. When changing setters, always produce a new frozen object — never mutate.

### Rule table

| Rule                                                                                                             | Enforced by                                       |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| No `console.log` (only `warn`/`error`; `_logger.ts` exempt)                                                      | eslint `no-console`                               |
| No `any`                                                                                                         | eslint `@typescript-eslint/no-explicit-any`       |
| No `eslint-disable` comments; exceptions are file overrides in `eslint.config.js`                                | eslint `linterOptions.noInlineConfig`             |
| `import type` for type-only imports                                                                              | eslint `consistent-type-imports`                  |
| No `Math.random()` in `.tsx`; use `useId()` for DOM ids                                                          | eslint `no-restricted-properties`                 |
| Deps via catalogs; supply-chain settings                                                                         | pnpm `catalogMode: strict`, `pnpm-workspace.yaml` |
| UI completion scans the DSL the same way as core's lexer (case-insensitive keywords, `\"` escapes)               | tests in `packages/ui/src/_command-completion.ts` |
| `!` only where the value is provably present; values from `_cleanNumber` / token peeks can be `null`/`undefined` | review only                                       |
| In-source tests, frozen `TableState`, `.ts` import extensions                                                    | review only                                       |

## When extending the pipeline

If you add a new operation (e.g. a transformation between sort and page, or a new column-level computation), follow the existing pattern:

- A dirty flag in `Pipeline.dirty`.
- A `_setX` helper that marks downstream stages dirty.
- A `_runX` that early-exits when its own flag is clean, and triggers `_runPrevious()` for the upstream stage.
- Expose via `create-table.ts` getters that call `ensurePagedUpToDate()` (or a narrower equivalent) before returning.

Avoid copying row data; operate on `Uint32Array` indices over `pipeline.data`.

## Working style (Karpathy guidelines)

Behavioral guardrails against common LLM coding mistakes. Bias toward caution over speed; use judgment on trivial edits.

- **Think before coding.** State assumptions explicitly; if multiple interpretations exist, surface them instead of silently picking one. If something is unclear, stop and ask. Push back when a simpler approach exists — e.g. this is a zero-dependency core, so reach for a new dependency only after exhausting plain code.
- **Simplicity first.** Write the minimum code that solves the problem — no speculative features, no abstractions for single-use code, no configurability that wasn't requested. The hot path (`_pipeline.ts`, `_filter-engine.ts`) rewards tight, allocation-free code over flexible-but-slow code. If 200 lines could be 50, rewrite it.
- **Surgical changes.** Touch only what the request requires. Don't "improve" adjacent code, don't refactor what isn't broken, and match the existing style (tabs, `.ts` import extensions, in-source tests) even if you'd do it differently. oxfmt owns formatting — never hand-reformat. Remove imports/vars your change orphaned; leave pre-existing dead code alone but mention it.
- **Goal-driven execution.** Turn tasks into verifiable goals before looping: "fix the bug" → write a failing test that reproduces it (in the source file's `import.meta.vitest` block), then make it pass. For multi-step work, state a short plan with a verify check per step, then run `pnpm test` / `pnpm typecheck` to confirm — don't mark work done until it's proven.
