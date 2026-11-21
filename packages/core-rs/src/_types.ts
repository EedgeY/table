export type CellValue = string | number | boolean | null | undefined;

export type ColumnKind = 'number' | 'string' | 'boolean';

/** A column extracted into typed-array form, ready for the wasm engine. */
export type ExtractedColumn =
	| {
			readonly id: string;
			readonly kind: 'number';
			readonly values: Float64Array;
			readonly mask: Uint8Array;
	  }
	| {
			readonly id: string;
			readonly kind: 'string';
			readonly codes: Uint32Array;
			readonly dict: ReadonlyArray<string>;
	  }
	| { readonly id: string; readonly kind: 'boolean'; readonly values: Uint8Array };

/** Caller-supplied accessor binding per column, as TS core already has. */
export type ColumnBinding<TRow> = {
	readonly id: string;
	readonly accessor: (row: TRow) => CellValue;
	readonly type?: ColumnKind;
};

export type WasmSurface = {
	readonly WasmTable: new () => WasmTableHandle;
	readonly wasm_filter: (table: WasmTableHandle, predicate_json: string) => Uint32Array;
	readonly wasm_sort: (
		table: WasmTableHandle,
		indices: Uint32Array,
		spec_json: string,
	) => Uint32Array;
	readonly wasm_page: (
		indices: Uint32Array,
		page_index: number,
		page_size: number,
		page_size_is_infinite: number,
	) => Uint32Array;
};

export interface WasmTableHandle {
	add_num_column: (id: string, values: Float64Array, mask: Uint8Array) => void;
	add_str_column: (id: string, codes: Uint32Array, dict_json: string) => void;
	add_bool_column: (id: string, values: Uint8Array) => void;
	finalize: () => void;
	free: () => void;
	readonly n_rows: number;
	readonly n_columns: number;
}

export type FilterOp =
	| '='
	| '!='
	| '>'
	| '<'
	| '>='
	| '<='
	| 'like'
	| 'startsWith'
	| 'endsWith'
	| 'isNull'
	| 'isNotNull'
	| 'in';

export type Combinator = 'and' | 'or';

export type Predicate =
	| {
			readonly kind: 'leaf';
			readonly columnId: string;
			readonly op: FilterOp;
			readonly value?: CellValue | ReadonlyArray<CellValue>;
			readonly caseSensitive?: boolean;
	  }
	| {
			readonly kind: 'group';
			readonly combinator: Combinator;
			readonly children: ReadonlyArray<Predicate>;
			readonly negate?: boolean;
	  };

export type SortDir = 'asc' | 'desc';
export type SortKey = {
	readonly columnId: string;
	readonly dir: SortDir;
	readonly nulls?: 'first' | 'last';
};
export type SortSpec = ReadonlyArray<SortKey>;

export type PaginationState = {
	readonly pageIndex: number;
	readonly pageSize: number;
};
