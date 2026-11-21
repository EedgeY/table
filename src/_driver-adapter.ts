import type {
	ColumnDef,
	EngineDriver,
	Predicate as CorePredicate,
	SortSpec as CoreSortSpec,
} from '@tarbo-table/core';
import { extractColumns } from './_extract.ts';
import type { ColumnBinding, ColumnKind, WasmSurface, WasmTableHandle } from './_types.ts';

type AnyAccessor<TRow> = (row: TRow) => unknown;

const _SCALAR_KINDS: ReadonlySet<string> = new Set(['number', 'string', 'boolean']);

function _normalizeKind(t: ColumnDef<unknown>['type']): ColumnKind | undefined {
	if (t !== undefined && _SCALAR_KINDS.has(t)) return t as ColumnKind;
	return undefined;
}

function toBindings<TRow>(
	columns: ReadonlyArray<ColumnDef<TRow>>,
): ReadonlyArray<ColumnBinding<TRow>> {
	return columns.map((c) => ({
		id: c.id,
		accessor: c.accessor as AnyAccessor<TRow> as ColumnBinding<TRow>['accessor'],
		type: _normalizeKind(c.type as ColumnDef<unknown>['type']),
	}));
}

function buildHandle<TRow>(
	surface: WasmSurface,
	rows: ReadonlyArray<TRow>,
	bindings: ReadonlyArray<ColumnBinding<TRow>>,
): WasmTableHandle {
	const extracted = extractColumns(rows, bindings);
	const handle = new surface.WasmTable();
	for (const col of extracted) {
		if (col.kind === 'number') {
			handle.add_num_column(col.id, col.values, col.mask);
		} else if (col.kind === 'string') {
			handle.add_str_column(col.id, col.codes, JSON.stringify(col.dict));
		} else {
			handle.add_bool_column(col.id, col.values);
		}
	}
	handle.finalize();
	return handle;
}

export function createRsDriverAdapter<TRow>(
	surface: WasmSurface,
	initialData: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
): EngineDriver<TRow> {
	const bindings = toBindings(columns);
	let handle = buildHandle(surface, initialData, bindings);
	let predicateJson = '';

	return {
		setData(next: ReadonlyArray<TRow>) {
			handle.free();
			handle = buildHandle(surface, next, bindings);
		},
		setPredicate(p: CorePredicate | null) {
			predicateJson = p == null ? '' : JSON.stringify(p);
		},
		runFilter(_scratch: Uint32Array): Uint32Array {
			return surface.wasm_filter(handle, predicateJson);
		},
		runSort(filtered: Uint32Array, spec: CoreSortSpec): Uint32Array {
			if (spec.length === 0) return filtered;
			return surface.wasm_sort(handle, filtered, JSON.stringify(spec));
		},
		dispose() {
			handle.free();
		},
	};
}
