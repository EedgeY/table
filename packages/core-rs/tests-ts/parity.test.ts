import { describe, expect, it } from 'vitest';
import { type ColumnDef, createTable, f } from '@tarbo-table/core';
import { createNodeEngine } from '../src/node.ts';
import type {
	ColumnBinding,
	Predicate as RsPredicate,
	SortSpec as RsSortSpec,
} from '../src/_types.ts';

type Employee = {
	id: number;
	name: string;
	salary: number | null;
	dept: string;
};

const COLUMNS: ColumnDef<Employee>[] = [
	{ id: 'id', accessor: (r) => r.id, type: 'number' },
	{ id: 'name', accessor: (r) => r.name },
	{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
	{ id: 'dept', accessor: (r) => r.dept },
];

const RS_COLUMNS: ColumnBinding<Employee>[] = COLUMNS.map((c) => ({
	id: c.id,
	accessor: c.accessor,
	type:
		c.type === 'string'
			? 'string'
			: c.type === 'boolean'
				? 'boolean'
				: c.type === 'number'
					? 'number'
					: undefined,
}));

const DATA: Employee[] = [
	{ id: 1, name: 'Tanaka', salary: 50000, dept: 'eng' },
	{ id: 2, name: 'Yamada', salary: 100000, dept: 'sales' },
	{ id: 3, name: 'tan', salary: null, dept: 'eng' },
	{ id: 4, name: 'TANG', salary: 75000, dept: 'eng' },
	{ id: 5, name: 'Suzuki', salary: 90000, dept: 'sales' },
];

import type { Predicate, SortSpec } from '@tarbo-table/core';

function jsRun(pred: Predicate | null, sort: SortSpec): Uint32Array {
	const t = createTable<Employee>({
		data: DATA,
		columns: COLUMNS,
		initialState: {
			sort,
			pagination: { pageIndex: 0, pageSize: Number.POSITIVE_INFINITY },
		},
	});
	if (pred) t.setPredicate(pred);
	return new Uint32Array(t.getPagedIndices());
}

function rsRun(pred: RsPredicate | null, sort: RsSortSpec): Uint32Array {
	const engine = createNodeEngine(DATA, RS_COLUMNS);
	try {
		const filtered = engine.filter(pred);
		return engine.sort(filtered, sort);
	} finally {
		engine.dispose();
	}
}

describe('parity: js pipeline ↔ rust wasm engine', () => {
	it('null predicate keeps everything (same order)', () => {
		const js = jsRun(null, []);
		const rs = rsRun(null, []);
		expect(Array.from(rs)).toEqual(Array.from(js));
	});

	it("leaf '=' on numeric column", () => {
		const pred = f.leaf('id', '=', 2);
		expect(Array.from(rsRun(pred, []))).toEqual(Array.from(jsRun(pred, [])));
	});

	it("leaf 'like' on string column is case-insensitive by default", () => {
		const pred = f.leaf('name', 'like', 'tan');
		expect(Array.from(rsRun(pred, []))).toEqual(Array.from(jsRun(pred, [])));
	});

	it("leaf 'isNull' on nullable numeric", () => {
		const pred = f.leaf('salary', 'isNull');
		expect(Array.from(rsRun(pred, []))).toEqual(Array.from(jsRun(pred, [])));
	});

	it('AND combinator', () => {
		const pred = f.and(f.leaf('dept', '=', 'eng'), f.leaf('salary', '>=', 60000));
		expect(Array.from(rsRun(pred, []))).toEqual(Array.from(jsRun(pred, [])));
	});

	it('OR combinator + nested AND short-circuit semantics', () => {
		const pred = f.or(
			f.and(f.leaf('id', '>', 10), f.leaf('name', 'like', 'tan')),
			f.leaf('salary', '>=', 100000),
		);
		expect(Array.from(rsRun(pred, []))).toEqual(Array.from(jsRun(pred, [])));
	});

	it("'in' with mixed values", () => {
		const pred = f.leaf('id', 'in', [1, 3]);
		expect(Array.from(rsRun(pred, []))).toEqual(Array.from(jsRun(pred, [])));
	});

	it('NOT group inverts result', () => {
		const pred = f.not(f.leaf('id', '<', 3));
		expect(Array.from(rsRun(pred, []))).toEqual(Array.from(jsRun(pred, [])));
	});

	it('single asc numeric sort', () => {
		const sort: SortSpec = [{ columnId: 'salary', dir: 'asc' }];
		expect(Array.from(rsRun(null, sort))).toEqual(Array.from(jsRun(null, sort)));
	});

	it('single desc numeric sort', () => {
		const sort: SortSpec = [{ columnId: 'salary', dir: 'desc' }];
		expect(Array.from(rsRun(null, sort))).toEqual(Array.from(jsRun(null, sort)));
	});

	it('multi-key sort: dept ASC then salary DESC', () => {
		const sort: SortSpec = [
			{ columnId: 'dept', dir: 'asc' },
			{ columnId: 'salary', dir: 'desc' },
		];
		expect(Array.from(rsRun(null, sort))).toEqual(Array.from(jsRun(null, sort)));
	});

	it('filter + sort combined', () => {
		const pred = f.leaf('dept', '=', 'eng');
		const sort: SortSpec = [{ columnId: 'salary', dir: 'asc' }];
		expect(Array.from(rsRun(pred, sort))).toEqual(Array.from(jsRun(pred, sort)));
	});
});
