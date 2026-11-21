import type { CellValue, ColumnDef } from './column.ts';
import type { SortSpec } from './sort.ts';
import { SORT_SAMPLE_SIZE } from './_consts.ts';
import { _cmpAny } from './_utils.ts';

type CompiledKey<TRow> = {
	readonly accessor: (row: TRow) => CellValue;
	readonly mult: 1 | -1;
	readonly nullsLast: boolean;
	readonly isNumeric: boolean;
};

export function _buildComparator<TRow>(
	data: ReadonlyArray<TRow>,
	spec: SortSpec,
	columns: ReadonlyArray<ColumnDef<TRow>>,
	visible: Uint32Array,
): (a: number, b: number) => number {
	const colMap = new Map<string, ColumnDef<TRow>>();
	for (const c of columns) {
		colMap.set(c.id, c);
	}

	const keys: CompiledKey<TRow>[] = [];
	for (const k of spec) {
		const col = colMap.get(k.columnId);
		if (col == null) {
			continue;
		}
		const accessor = col.accessor;
		const isNumeric = col.type === 'number' || sampleIsNumeric(data, accessor, visible);
		keys.push({
			accessor,
			mult: k.dir === 'desc' ? -1 : 1,
			nullsLast: k.nulls !== 'first',
			isNumeric,
		});
	}

	if (keys.length === 0) {
		return (a, b) => a - b;
	}

	return (a, b) => {
		const ra = data[a]!;
		const rb = data[b]!;
		for (let i = 0; i < keys.length; i++) {
			const k = keys[i]!;
			const va = k.accessor(ra);
			const vb = k.accessor(rb);
			let cmp: number;
			if (k.isNumeric) {
				const aNull = va == null;
				const bNull = vb == null;
				if (aNull && bNull) {
					cmp = 0;
				} else if (aNull) {
					cmp = k.nullsLast ? 1 : -1;
				} else if (bNull) {
					cmp = k.nullsLast ? -1 : 1;
				} else if (typeof va === 'number' && typeof vb === 'number') {
					cmp = va - vb;
				} else {
					cmp = _cmpAny(va, vb, k.nullsLast);
				}
			} else {
				cmp = _cmpAny(va, vb, k.nullsLast);
			}
			if (cmp !== 0) {
				return cmp * k.mult;
			}
		}
		return a - b;
	};
}

function sampleIsNumeric<TRow>(
	data: ReadonlyArray<TRow>,
	accessor: (row: TRow) => CellValue,
	visible: Uint32Array,
): boolean {
	const n = Math.min(SORT_SAMPLE_SIZE, visible.length);
	let seen = 0;
	for (let i = 0; i < n; i++) {
		const idx = visible[i]!;
		const v = accessor(data[idx]!);
		if (v == null) {
			continue;
		}
		if (typeof v !== 'number') {
			return false;
		}
		seen++;
	}
	return seen > 0;
}

export function _sortIndices(
	indices: Uint32Array,
	cmp: (a: number, b: number) => number,
): Uint32Array {
	const arr = Array.from(indices);
	arr.sort(cmp);
	return new Uint32Array(arr);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	type Row = { id: number; dept: string; salary: number };
	const cols: ColumnDef<Row>[] = [
		{ id: 'id', accessor: (r) => r.id, type: 'number' },
		{ id: 'dept', accessor: (r) => r.dept },
		{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
	];
	const data: Row[] = [
		{ id: 1, dept: 'eng', salary: 100 },
		{ id: 2, dept: 'sales', salary: 80 },
		{ id: 3, dept: 'eng', salary: 120 },
		{ id: 4, dept: 'eng', salary: 100 },
		{ id: 5, dept: 'sales', salary: 90 },
	];
	const allIdx = new Uint32Array(data.map((_, i) => i));

	const sortBy = (spec: SortSpec): number[] => {
		const cmp = _buildComparator(data, spec, cols, allIdx);
		const out = _sortIndices(allIdx, cmp);
		return Array.from(out);
	};

	describe('_sort-engine', () => {
		it('single asc on numeric column', () => {
			expect(sortBy([{ columnId: 'salary', dir: 'asc' }])).toEqual([1, 4, 0, 3, 2]);
		});

		it('single desc on numeric column', () => {
			expect(sortBy([{ columnId: 'salary', dir: 'desc' }])).toEqual([2, 0, 3, 4, 1]);
		});

		it('multi: dept ASC then salary DESC is stable across equal departments', () => {
			expect(
				sortBy([
					{ columnId: 'dept', dir: 'asc' },
					{ columnId: 'salary', dir: 'desc' },
				]),
			).toEqual([2, 0, 3, 4, 1]);
		});

		it('ties break by original index when no further key disambiguates', () => {
			expect(sortBy([{ columnId: 'dept', dir: 'asc' }])).toEqual([0, 2, 3, 1, 4]);
		});

		it('empty spec yields stable order (input untouched)', () => {
			expect(sortBy([])).toEqual([0, 1, 2, 3, 4]);
		});
	});
}
