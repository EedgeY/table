/**
 * @fileoverview Web entry point — async wasm load.
 *
 * The wasm artifact loads once; subsequent `loadRsDriverFactory()` calls
 * return the cached resolved factory.
 *
 * @example
 * ```ts
 * import { createTable } from '@tarbo-table/core';
 * import { loadRsDriverFactory } from '@tarbo-table/core-rs/web';
 *
 * const rsDriverFactory = await loadRsDriverFactory();
 * const t = createTable({ data, columns, engine: rsDriverFactory });
 * ```
 *
 * @module @tarbo-table/core-rs/web
 */

import init, * as wasm from '../pkg-web/tarbo_table_core_rs.js';
import type { ColumnDef, EngineDriver } from '@tarbo-table/core';
import { createEngine, type Engine } from './_engine.ts';
import { createRsDriverAdapter } from './_driver-adapter.ts';
import type { ColumnBinding, WasmSurface } from './_types.ts';

let surfacePromise: Promise<WasmSurface> | null = null;

async function ensureLoaded(): Promise<WasmSurface> {
	if (surfacePromise === null) {
		surfacePromise = init().then(() => wasm as unknown as WasmSurface);
	}
	return surfacePromise;
}

/** Eagerly initialize the wasm module. Optional — `loadRsDriverFactory` does this lazily. */
export async function initWasm(): Promise<void> {
	await ensureLoaded();
}

/** Generic factory function returned by `loadRsDriverFactory`. */
export type RsDriverFactory = <TRow>(
	data: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
) => EngineDriver<TRow>;

/**
 * Resolves to an engine factory ready to pass into `createTable`. Loads the
 * wasm module on first call and caches the resolved surface.
 */
export async function loadRsDriverFactory(): Promise<RsDriverFactory> {
	const surface = await ensureLoaded();
	return <TRow>(
		data: ReadonlyArray<TRow>,
		columns: ReadonlyArray<ColumnDef<TRow>>,
	): EngineDriver<TRow> => createRsDriverAdapter(surface, data, columns);
}

/** Low-level standalone engine (bypasses `createTable`). */
export async function createWebEngine<TRow>(
	rows: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnBinding<TRow>>,
): Promise<Engine<TRow>> {
	const surface = await ensureLoaded();
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
