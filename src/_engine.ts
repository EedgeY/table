import { extractColumns } from './_extract.ts';
import type {
	ColumnBinding,
	ExtractedColumn,
	PaginationState,
	Predicate,
	SortSpec,
	WasmSurface,
	WasmTableHandle,
} from './_types.ts';

export type Engine<TRow> = {
	readonly nRows: number;
	filter: (predicate: Predicate | null) => Uint32Array;
	sort: (indices: Uint32Array, spec: SortSpec) => Uint32Array;
	page: (indices: Uint32Array, state: PaginationState) => Uint32Array;
	/** Rebuild the columns from a new data set. */
	setData: (rows: ReadonlyArray<TRow>) => void;
	dispose: () => void;
};

export function createEngine<TRow>(
	surface: WasmSurface,
	rows: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnBinding<TRow>>,
): Engine<TRow> {
	let table = build(surface, rows, columns);

	function setData(next: ReadonlyArray<TRow>): void {
		table.handle.free();
		table = build(surface, next, columns);
	}

	function filter(predicate: Predicate | null): Uint32Array {
		const json = predicate == null ? '' : JSON.stringify(predicate);
		return surface.wasm_filter(table.handle, json);
	}

	function sort(indices: Uint32Array, spec: SortSpec): Uint32Array {
		if (spec.length === 0) return indices;
		return surface.wasm_sort(table.handle, indices, JSON.stringify(spec));
	}

	function page(indices: Uint32Array, state: PaginationState): Uint32Array {
		const inf = Number.isFinite(state.pageSize) ? 0 : 1;
		const size = inf ? 0 : state.pageSize;
		return surface.wasm_page(indices, state.pageIndex, size, inf);
	}

	function dispose(): void {
		table.handle.free();
	}

	return {
		get nRows() {
			return table.nRows;
		},
		filter,
		sort,
		page,
		setData,
		dispose,
	};
}

type BuiltTable = {
	readonly handle: WasmTableHandle;
	readonly nRows: number;
	readonly extracted: ReadonlyArray<ExtractedColumn>;
};

function build<TRow>(
	surface: WasmSurface,
	rows: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnBinding<TRow>>,
): BuiltTable {
	const extracted = extractColumns(rows, columns);
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
	return { handle, nRows: rows.length, extracted };
}
