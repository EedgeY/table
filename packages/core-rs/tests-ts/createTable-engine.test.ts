import { describe, expect, it } from 'vitest';
import { type ColumnDef, createTable, f, type SortSpec } from '@tarbo-table/core';
import { rsDriverFactory } from '../src/node.ts';

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

const DATA: Employee[] = [
	{ id: 1, name: 'Tanaka', salary: 50000, dept: 'eng' },
	{ id: 2, name: 'Yamada', salary: 100000, dept: 'sales' },
	{ id: 3, name: 'tan', salary: null, dept: 'eng' },
	{ id: 4, name: 'TANG', salary: 75000, dept: 'eng' },
	{ id: 5, name: 'Suzuki', salary: 90000, dept: 'sales' },
];

function asArray(u: Uint32Array): number[] {
	return Array.from(u);
}

describe('createTable({ engine: rsDriverFactory })', () => {
	it('paged indices match the default JS engine', () => {
		const js = createTable<Employee>({ data: DATA, columns: COLUMNS });
		const rs = createTable<Employee>({ data: DATA, columns: COLUMNS, engine: rsDriverFactory });
		try {
			expect(asArray(rs.getPagedIndices())).toEqual(asArray(js.getPagedIndices()));
		} finally {
			rs.dispose();
		}
	});

	it('setPredicate produces identical indices', () => {
		const pred = f.and(f.leaf('dept', '=', 'eng'), f.leaf('salary', '>=', 60000));
		const js = createTable<Employee>({ data: DATA, columns: COLUMNS });
		const rs = createTable<Employee>({ data: DATA, columns: COLUMNS, engine: rsDriverFactory });
		try {
			js.setPredicate(pred);
			rs.setPredicate(pred);
			expect(asArray(rs.getPagedIndices())).toEqual(asArray(js.getPagedIndices()));
		} finally {
			rs.dispose();
		}
	});

	it('setSort produces identical indices', () => {
		const sort: SortSpec = [
			{ columnId: 'dept', dir: 'asc' },
			{ columnId: 'salary', dir: 'desc' },
		];
		const js = createTable<Employee>({ data: DATA, columns: COLUMNS });
		const rs = createTable<Employee>({ data: DATA, columns: COLUMNS, engine: rsDriverFactory });
		try {
			js.setSort(sort);
			rs.setSort(sort);
			expect(asArray(rs.getPagedIndices())).toEqual(asArray(js.getPagedIndices()));
		} finally {
			rs.dispose();
		}
	});

	it('full pipeline (filter→sort→page) yields identical paged rows', () => {
		const pred = f.leaf('dept', '=', 'eng');
		const sort: SortSpec = [{ columnId: 'salary', dir: 'asc' }];
		const js = createTable<Employee>({
			data: DATA,
			columns: COLUMNS,
			pageSize: 2,
		});
		const rs = createTable<Employee>({
			data: DATA,
			columns: COLUMNS,
			pageSize: 2,
			engine: rsDriverFactory,
		});
		try {
			js.setPredicate(pred);
			js.setSort(sort);
			rs.setPredicate(pred);
			rs.setSort(sort);
			expect(asArray(rs.getPagedIndices())).toEqual(asArray(js.getPagedIndices()));
			expect(rs.getPagedRows().map((r) => r.row)).toEqual(js.getPagedRows().map((r) => r.row));
		} finally {
			rs.dispose();
		}
	});

	it('setData rebuilds the wasm table without changing observable state shape', () => {
		const rs = createTable<Employee>({
			data: DATA.slice(0, 2),
			columns: COLUMNS,
			engine: rsDriverFactory,
		});
		try {
			expect(rs.getRowCount().total).toBe(2);
			rs.setData(DATA);
			expect(rs.getRowCount().total).toBe(5);
		} finally {
			rs.dispose();
		}
	});

	it('subscribeWithSelector behaves identically to JS engine', () => {
		const rs = createTable<Employee>({ data: DATA, columns: COLUMNS, engine: rsDriverFactory });
		try {
			let calls = 0;
			rs.subscribeWithSelector(
				(s) => s.sort,
				() => {
					calls++;
				},
			);
			rs.setSort([{ columnId: 'salary', dir: 'asc' }]);
			expect(calls).toBe(1);
			rs.setColumnWidth('id', 200);
			expect(calls).toBe(1);
		} finally {
			rs.dispose();
		}
	});
});
