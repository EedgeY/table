/**
 * @fileoverview Node entry point — synchronous wasm load via wasm-pack's
 * `--target nodejs` artifact.
 *
 * Two public APIs:
 *   - `rsDriverFactory` (recommended): pass to `createTable({ engine: ... })`
 *     so the core's filter/sort runs on Rust+WASM transparently.
 *   - `createNodeEngine` (low-level): manual `filter`/`sort`/`page` calls;
 *     bypasses `createTable` entirely. Useful for batch / non-React contexts.
 *
 * @module @tarbo-table/core-rs/node
 */

import * as wasm from '../pkg-node/tarbo_table_core_rs.js';
import type { ColumnDef, EngineDriver } from '@tarbo-table/core';
import { createEngine, type Engine } from './_engine.ts';
import { createRsDriverAdapter } from './_driver-adapter.ts';
import type { ColumnBinding, WasmSurface } from './_types.ts';

const surface = wasm as unknown as WasmSurface;

/**
 * Drop-in engine factory for `createTable({ engine: rsDriverFactory })`.
 *
 * Generic over `TRow` so it satisfies `EngineDriverFactory<TRow>` for any
 * row type at the call site.
 *
 * @example
 * ```ts
 * import { createTable } from '@tarbo-table/core';
 * import { rsDriverFactory } from '@tarbo-table/core-rs/node';
 * const t = createTable({ data, columns, engine: rsDriverFactory });
 * ```
 */
export function rsDriverFactory<TRow>(
	data: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
): EngineDriver<TRow> {
	return createRsDriverAdapter(surface, data, columns);
}

/** Build a Rust-backed standalone engine (no `createTable` involvement). */
export function createNodeEngine<TRow>(
	rows: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnBinding<TRow>>,
): Engine<TRow> {
	return createEngine(surface, rows, columns);
}

export type { Engine };
export type {
	ColumnBinding,
	ExtractedColumn,
	PaginationState,
	Predicate,
	SortKey,
	SortSpec,
} from './_types.ts';
