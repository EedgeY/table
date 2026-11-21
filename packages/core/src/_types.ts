import type { CellValue, ColumnDef } from './column.ts';
import type { FilterOp } from './filter.ts';

declare const RowIdBrand: unique symbol;
export type RowId = string & { readonly [RowIdBrand]: true };

export const OP_TAGS = {
	'=': 0,
	'!=': 1,
	'>': 2,
	'<': 3,
	'>=': 4,
	'<=': 5,
	like: 6,
	startsWith: 7,
	endsWith: 8,
	isNull: 9,
	isNotNull: 10,
	in: 11,
} as const satisfies Record<FilterOp, number>;

export type OpTag = (typeof OP_TAGS)[FilterOp];

export type AccessorFn<TRow = unknown> = (row: TRow) => CellValue;

export type CompiledLeaf = {
	readonly kind: 0;
	readonly accessor: AccessorFn;
	readonly op: OpTag;
	readonly numTarget: number;
	readonly isNumTarget: boolean;
	readonly targetLower: string;
	readonly caseSensitive: boolean;
	readonly inSet: ReadonlySet<string> | null;
	readonly inNumSet: ReadonlySet<number> | null;
};

export type CompiledGroup = {
	readonly kind: 1;
	readonly combinator: 0 | 1;
	readonly negate: boolean;
	readonly children: ReadonlyArray<CompiledNode>;
};

export type CompiledNode = CompiledLeaf | CompiledGroup;

export type DirtyFlags = {
	filter: boolean;
	sort: boolean;
	page: boolean;
};

export type ResolvedColumn<TRow> = {
	readonly def: ColumnDef<TRow>;
	readonly accessor: AccessorFn<TRow>;
};
