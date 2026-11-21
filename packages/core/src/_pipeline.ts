import type { CellValue, ColumnDef } from './column.ts';
import type { Predicate } from './filter.ts';
import type { PaginationState } from './pagination.ts';
import type { SortSpec } from './sort.ts';
import type { EngineDriver, EngineDriverFactory } from './_engine-driver.ts';
import { _createJsEngineDriver } from './_engine-driver.ts';
import { _clampPagination, _derivePagination, _slicePage } from './_pagination.ts';

export type Pipeline<TRow> = {
	scratch: Uint32Array;
	filtered: Uint32Array;
	sorted: Uint32Array;
	paged: Uint32Array;
	dirty: { filter: boolean; sort: boolean; page: boolean };
	data: ReadonlyArray<TRow>;
	columns: ReadonlyArray<ColumnDef<TRow>>;
	predicate: Predicate | null;
	sort: SortSpec;
	pagination: PaginationState;
	driver: EngineDriver<TRow>;
	factory: EngineDriverFactory<TRow>;
};

export function _createPipeline<TRow>(
	data: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
	predicate: Predicate | null,
	sort: SortSpec,
	pagination: PaginationState,
	engineFactory?: EngineDriverFactory<TRow>,
): Pipeline<TRow> {
	const factory = engineFactory ?? _createJsEngineDriver;
	const driver = factory(data, columns);
	if (predicate !== null) {
		driver.setPredicate(predicate);
	}
	return {
		scratch: new Uint32Array(data.length),
		filtered: new Uint32Array(0),
		sorted: new Uint32Array(0),
		paged: new Uint32Array(0),
		dirty: { filter: true, sort: true, page: true },
		data,
		columns,
		predicate,
		sort,
		pagination,
		driver,
		factory,
	};
}

export function _setColumns<TRow>(
	p: Pipeline<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
): void {
	p.columns = columns;
	p.driver.dispose?.();
	p.driver = p.factory(p.data, columns);
	if (p.predicate !== null) {
		p.driver.setPredicate(p.predicate);
	}
	p.dirty.filter = true;
	p.dirty.sort = true;
	p.dirty.page = true;
}

export function _setData<TRow>(p: Pipeline<TRow>, data: ReadonlyArray<TRow>): void {
	p.data = data;
	if (p.scratch.length < data.length) {
		p.scratch = new Uint32Array(data.length);
	}
	p.driver.setData(data);
	p.dirty.filter = true;
	p.dirty.sort = true;
	p.dirty.page = true;
}

export function _setPredicate<TRow>(p: Pipeline<TRow>, predicate: Predicate | null): void {
	p.predicate = predicate;
	p.driver.setPredicate(predicate);
	p.dirty.filter = true;
	p.dirty.sort = true;
	p.dirty.page = true;
}

export function _setSort<TRow>(p: Pipeline<TRow>, sort: SortSpec): void {
	p.sort = sort;
	p.dirty.sort = true;
	p.dirty.page = true;
}

export function _setPagination<TRow>(p: Pipeline<TRow>, pagination: PaginationState): void {
	p.pagination = pagination;
	p.dirty.page = true;
}

export function _disposePipeline<TRow>(p: Pipeline<TRow>): void {
	p.driver.dispose?.();
}

export function _runFilter<TRow>(p: Pipeline<TRow>): Uint32Array {
	if (!p.dirty.filter) {
		return p.filtered;
	}
	p.filtered = p.driver.runFilter(p.scratch);
	p.dirty.filter = false;
	return p.filtered;
}

export function _runSort<TRow>(p: Pipeline<TRow>): Uint32Array {
	const filtered = _runFilter(p);
	if (!p.dirty.sort) {
		return p.sorted;
	}
	p.sorted = p.driver.runSort(filtered, p.sort);
	p.dirty.sort = false;
	return p.sorted;
}

export function _runPage<TRow>(p: Pipeline<TRow>): {
	indices: Uint32Array;
	clamped: PaginationState;
} {
	const sorted = _runSort(p);
	const clamped = _clampPagination(p.pagination, sorted.length);
	if (clamped !== p.pagination) {
		p.pagination = clamped;
		p.dirty.page = true;
	}
	if (!p.dirty.page) {
		return { indices: p.paged, clamped };
	}
	const size = p.pagination.pageSize;
	if (!Number.isFinite(size) || size <= 0 || size >= sorted.length) {
		p.paged = sorted;
	} else {
		const d = _derivePagination(p.pagination, sorted.length);
		p.paged = _slicePage(sorted, d);
	}
	p.dirty.page = false;
	return { indices: p.paged, clamped };
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	type Row = { id: number; v: number };
	const cols: ColumnDef<Row>[] = [
		{ id: 'id', accessor: (r) => r.id, type: 'number' },
		{ id: 'v', accessor: (r) => r.v as CellValue, type: 'number' },
	];
	const data: Row[] = Array.from({ length: 10 }, (_, i) => ({ id: i, v: 100 - i }));

	describe('_pipeline', () => {
		it('runs filter → sort → page in order', () => {
			const p = _createPipeline(
				data,
				cols,
				{ kind: 'leaf', columnId: 'id', op: '>=', value: 5 },
				[{ columnId: 'v', dir: 'asc' }],
				{ pageIndex: 0, pageSize: 3 },
			);
			const { indices } = _runPage(p);
			expect(Array.from(indices)).toEqual([9, 8, 7]);
		});

		it('subsequent reads do not redo work (dirty flags clear)', () => {
			const p = _createPipeline(data, cols, null, [], {
				pageIndex: 0,
				pageSize: Number.POSITIVE_INFINITY,
			});
			_runPage(p);
			expect(p.dirty).toEqual({ filter: false, sort: false, page: false });
			_runPage(p);
			expect(p.dirty).toEqual({ filter: false, sort: false, page: false });
		});

		it('setSort dirties sort + page only (filter stays cached)', () => {
			const p = _createPipeline(data, cols, null, [], {
				pageIndex: 0,
				pageSize: Number.POSITIVE_INFINITY,
			});
			_runPage(p);
			_setSort(p, [{ columnId: 'v', dir: 'asc' }]);
			expect(p.dirty).toEqual({ filter: false, sort: true, page: true });
		});

		it('setPagination dirties page only', () => {
			const p = _createPipeline(data, cols, null, [], { pageIndex: 0, pageSize: 5 });
			_runPage(p);
			_setPagination(p, { pageIndex: 1, pageSize: 5 });
			expect(p.dirty).toEqual({ filter: false, sort: false, page: true });
		});

		it('setColumns で追加した列を後続 filter が参照できる (driver 再構築)', () => {
			const p = _createPipeline(data, cols, null, [], {
				pageIndex: 0,
				pageSize: Number.POSITIVE_INFINITY,
			});
			_runPage(p);
			const augmented: ColumnDef<Row>[] = [
				...cols,
				{ id: 'id10', accessor: (r) => r.id * 10, type: 'number' },
			];
			_setColumns(p, augmented);
			expect(p.dirty).toEqual({ filter: true, sort: true, page: true });
			_setPredicate(p, { kind: 'leaf', columnId: 'id10', op: '>=', value: 70 });
			const { indices } = _runPage(p);
			expect(Array.from(indices).map((i) => data[i]!.id)).toEqual([7, 8, 9]);
		});
	});
}
