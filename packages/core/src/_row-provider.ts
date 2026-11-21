import type { VisibleRow } from './create-table.ts';
import type { DataSource } from './data-source.ts';
import type { Predicate } from './filter.ts';
import type { PaginationDerived, PaginationState } from './pagination.ts';
import type { SortSpec } from './sort.ts';
import type { RowId } from './_types.ts';
import { _derivePagination } from './_pagination.ts';
import type { ColumnDef } from './column.ts';
import type { Pipeline } from './_pipeline.ts';
import {
	_createPipeline,
	_runPage,
	_setData,
	_setPagination,
	_setPredicate,
	_setSort,
} from './_pipeline.ts';
import {
	_createServerStore,
	type ServerState,
	type ServerStatus,
	type ServerStore,
} from './_server-store.ts';

export type RowProviderQuery = {
	readonly predicate: Predicate | null;
	readonly sort: SortSpec;
	readonly pagination: PaginationState;
};

export type RowEvent<TRow> =
	| { kind: 'insert'; row: TRow }
	| { kind: 'update'; rowId: RowId; row: TRow }
	| { kind: 'delete'; rowId: RowId };

export type RowCounts = { total: number; visible: number; paged: number };

export type RowProvider<TRow> = {
	readonly applyQuery: (q: RowProviderQuery) => PaginationState;
	readonly resultIndices: () => Uint32Array;
	readonly pageIndices: () => Uint32Array;
	readonly resultRows: () => ReadonlyArray<VisibleRow<TRow>>;
	readonly pageRows: () => ReadonlyArray<VisibleRow<TRow>>;
	readonly derivePagination: (pagination: PaginationState) => PaginationDerived;
	readonly rowCount: () => RowCounts;
	readonly getData: () => ReadonlyArray<TRow>;
	readonly replaceData: (data: ReadonlyArray<TRow>) => void;
	readonly applyRowEvent: (event: RowEvent<TRow>) => void;
	readonly serverState: () => ServerState<TRow>;
	readonly refresh: (q: RowProviderQuery) => Promise<void>;
	readonly fetchMore: (q: RowProviderQuery) => Promise<void>;
	readonly dispose: () => void;
};

const _degenerateIndices = (len: number): Uint32Array => {
	const out = new Uint32Array(len);
	for (let i = 0; i < len; i++) out[i] = i;
	return out;
};

const _buildRowsFromArray = <TRow>(
	rows: ReadonlyArray<TRow>,
	getRowId: (row: TRow, index: number) => RowId,
): ReadonlyArray<VisibleRow<TRow>> => {
	const out: VisibleRow<TRow>[] = new Array(rows.length);
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]!;
		out[i] = { id: getRowId(row, i), index: i, row };
	}
	return out;
};

export function _createClientRowProvider<TRow>(
	pipeline: Pipeline<TRow>,
	getRowId: (row: TRow, index: number) => RowId,
): RowProvider<TRow> {
	let last: RowProviderQuery | null = null;

	const buildRows = (indices: Uint32Array): ReadonlyArray<VisibleRow<TRow>> => {
		const data = pipeline.data;
		const out: VisibleRow<TRow>[] = new Array(indices.length);
		for (let i = 0; i < indices.length; i++) {
			const idx = indices[i]!;
			const row = data[idx]!;
			out[i] = { id: getRowId(row, idx), index: idx, row };
		}
		return out;
	};

	const FROZEN_EMPTY_SERVER_STATE: ServerState<TRow> = Object.freeze({
		rows: Object.freeze([]) as ReadonlyArray<TRow>,
		totalCount: 0,
		status: 'idle' as ServerStatus,
		error: null,
		nextCursor: null,
	});

	const applyRowEvent = (event: RowEvent<TRow>): void => {
		const cur = pipeline.data;
		let nextRows: ReadonlyArray<TRow>;
		switch (event.kind) {
			case 'insert': {
				nextRows = [...cur, event.row];
				break;
			}
			case 'update': {
				nextRows = cur.map((r, i) => (getRowId(r, i) === event.rowId ? event.row : r));
				break;
			}
			case 'delete': {
				nextRows = cur.filter((r, i) => getRowId(r, i) !== event.rowId);
				break;
			}
		}
		_setData(pipeline, nextRows);
	};

	return {
		applyQuery(q) {
			if (last === null || !Object.is(last.predicate, q.predicate)) {
				_setPredicate(pipeline, q.predicate);
			}
			if (last === null || !Object.is(last.sort, q.sort)) {
				_setSort(pipeline, q.sort);
			}
			if (last === null || !Object.is(last.pagination, q.pagination)) {
				_setPagination(pipeline, q.pagination);
			}
			last = q;
			return _runPage(pipeline).clamped;
		},
		resultIndices() {
			_runPage(pipeline);
			return pipeline.sorted;
		},
		pageIndices() {
			_runPage(pipeline);
			return pipeline.paged;
		},
		resultRows() {
			_runPage(pipeline);
			return buildRows(pipeline.sorted);
		},
		pageRows() {
			_runPage(pipeline);
			return buildRows(pipeline.paged);
		},
		derivePagination(pagination) {
			_runPage(pipeline);
			return _derivePagination(pagination, pipeline.sorted.length);
		},
		rowCount() {
			_runPage(pipeline);
			return {
				total: pipeline.data.length,
				visible: pipeline.sorted.length,
				paged: pipeline.paged.length,
			};
		},
		getData: () => pipeline.data,
		replaceData(data) {
			_setData(pipeline, data);
		},
		applyRowEvent,
		serverState: () => FROZEN_EMPTY_SERVER_STATE,
		refresh: () => Promise.resolve(),
		fetchMore: () => Promise.resolve(),
		dispose: () => {},
	};
}

export type ServerRowProviderOptions<TRow> = {
	readonly dataSource: DataSource<TRow>;
	readonly onChange: () => void;
	readonly debounceMs?: number;
	readonly getRowId: (row: TRow, index: number) => RowId;
};

export function _createServerRowProvider<TRow>(
	opts: ServerRowProviderOptions<TRow>,
): RowProvider<TRow> {
	const store: ServerStore<TRow> = _createServerStore<TRow>({
		dataSource: opts.dataSource,
		onChange: opts.onChange,
		debounceMs: opts.debounceMs,
	});
	const getRowId = opts.getRowId;
	let last: RowProviderQuery | null = null;

	const rows = () => store.getState().rows;

	return {
		applyQuery(q) {
			const changed =
				last === null ||
				!Object.is(last.predicate, q.predicate) ||
				!Object.is(last.sort, q.sort) ||
				!Object.is(last.pagination, q.pagination);
			if (changed) {
				last = q;
				void store.invalidate({ predicate: q.predicate, sort: q.sort, pagination: q.pagination });
			}
			return q.pagination;
		},
		resultIndices: () => _degenerateIndices(rows().length),
		pageIndices: () => _degenerateIndices(rows().length),
		resultRows: () => _buildRowsFromArray(rows(), getRowId),
		pageRows: () => _buildRowsFromArray(rows(), getRowId),
		derivePagination: (pagination) => _derivePagination(pagination, store.getState().totalCount),
		rowCount() {
			const s = store.getState();
			return { total: s.totalCount, visible: s.totalCount, paged: s.rows.length };
		},
		getData: () => store.getState().rows,
		replaceData(data) {
			store.mutate({ rows: data });
		},
		applyRowEvent(event) {
			const cur = store.getState();
			let nextRows: TRow[] = [...cur.rows];
			let totalCount = cur.totalCount;
			switch (event.kind) {
				case 'insert': {
					nextRows.push(event.row);
					totalCount++;
					break;
				}
				case 'update': {
					nextRows = nextRows.map((r, i) => (getRowId(r, i) === event.rowId ? event.row : r));
					break;
				}
				case 'delete': {
					const before = nextRows.length;
					nextRows = nextRows.filter((r, i) => getRowId(r, i) !== event.rowId);
					totalCount -= before - nextRows.length;
					break;
				}
			}
			store.mutate({ rows: nextRows, totalCount });
		},
		serverState: () => store.getState(),
		refresh: (q) =>
			store.invalidate({ predicate: q.predicate, sort: q.sort, pagination: q.pagination }),
		fetchMore(q) {
			const cur = store.getState();
			return store.fetchMore({
				predicate: q.predicate,
				sort: q.sort,
				pagination: q.pagination,
				extra: cur.nextCursor !== null ? { cursor: cur.nextCursor } : undefined,
			});
		},
		dispose() {
			store.dispose();
		},
	};
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	type Row = { id: number; v: number };
	const cols: ColumnDef<Row>[] = [
		{ id: 'id', accessor: (r) => r.id, type: 'number' },
		{ id: 'v', accessor: (r) => r.v, type: 'number' },
	];
	const rows: Row[] = [
		{ id: 1, v: 30 },
		{ id: 2, v: 10 },
		{ id: 3, v: 20 },
	];
	const getRowId = (r: Row): RowId => String(r.id) as RowId;
	const pageOf = (pageIndex: number, pageSize: number): PaginationState =>
		Object.freeze({ pageIndex, pageSize });
	const flush = () => new Promise<void>((r) => setTimeout(r, 0));

	describe('_createClientRowProvider (no fetch)', () => {
		it('applyQuery が予算外の pageIndex を Result Set に合わせて clamp する', () => {
			const p = _createPipeline<Row>(rows, cols, null, [], pageOf(0, 2));
			const provider = _createClientRowProvider(p, getRowId);
			const clamped = provider.applyQuery({ predicate: null, sort: [], pagination: pageOf(5, 2) });
			expect(clamped.pageIndex).toBe(1);
			expect(provider.pageRows()).toHaveLength(1);
			expect(provider.resultRows()).toHaveLength(3);
		});

		it('sort が Result Set の並びへ反映される', () => {
			const p = _createPipeline<Row>(rows, cols, null, [], pageOf(0, 10));
			const provider = _createClientRowProvider(p, getRowId);
			provider.applyQuery({
				predicate: null,
				sort: [{ columnId: 'v', dir: 'asc' }],
				pagination: pageOf(0, 10),
			});
			expect(provider.resultRows().map((r) => r.row.v)).toEqual([10, 20, 30]);
		});

		it('applyRowEvent が data ref を更新する (insert/delete)', () => {
			const p = _createPipeline<Row>(rows, cols, null, [], pageOf(0, 10));
			const provider = _createClientRowProvider(p, getRowId);
			provider.applyRowEvent({ kind: 'insert', row: { id: 4, v: 99 } });
			expect(provider.getData()).toHaveLength(4);
			provider.applyRowEvent({ kind: 'delete', rowId: '4' as RowId });
			expect(provider.getData()).toHaveLength(3);
		});

		it('server 専用 API は無害な既定値を返す', async () => {
			const p = _createPipeline<Row>(rows, cols, null, [], pageOf(0, 10));
			const provider = _createClientRowProvider(p, getRowId);
			expect(provider.serverState().status).toBe('idle');
			await expect(
				provider.refresh({ predicate: null, sort: [], pagination: pageOf(0, 10) }),
			).resolves.toBeUndefined();
		});
	});

	describe('_createServerRowProvider (no pipeline)', () => {
		const makeProvider = () => {
			let calls = 0;
			const provider = _createServerRowProvider<Row>({
				dataSource: {
					fetch: async () => {
						calls++;
						return { rows, totalCount: 1000 };
					},
				},
				onChange: () => {},
				debounceMs: 0,
				getRowId,
			});
			return { provider, calls: () => calls };
		};

		it('applyQuery はクエリが変わったときだけ fetch する', async () => {
			const { provider, calls } = makeProvider();
			const sort: SortSpec = [];
			const pagination = pageOf(0, 10);
			provider.applyQuery({ predicate: null, sort, pagination });
			await flush();
			expect(calls()).toBe(1);
			provider.applyQuery({ predicate: null, sort, pagination });
			await flush();
			expect(calls()).toBe(1);
			provider.applyQuery({
				predicate: { kind: 'leaf', columnId: 'v', op: '>=', value: 20 },
				sort,
				pagination,
			});
			await flush();
			expect(calls()).toBe(2);
		});

		it('refresh は同一クエリでも常に fetch する', async () => {
			const { provider, calls } = makeProvider();
			const q = { predicate: null, sort: [] as SortSpec, pagination: pageOf(0, 10) };
			provider.applyQuery(q);
			await flush();
			expect(calls()).toBe(1);
			await provider.refresh(q);
			expect(calls()).toBe(2);
		});

		it('fetch 結果を rows / count / 退化インデックスとして公開する', async () => {
			const { provider } = makeProvider();
			await provider.refresh({ predicate: null, sort: [], pagination: pageOf(0, 10) });
			expect(provider.pageRows().map((r) => r.row.id)).toEqual([1, 2, 3]);
			expect(provider.rowCount()).toEqual({ total: 1000, visible: 1000, paged: 3 });
			expect(Array.from(provider.resultIndices())).toEqual([0, 1, 2]);
			expect(provider.derivePagination(pageOf(0, 10)).pageCount).toBe(100);
		});

		it('applyRowEvent が fetch 済み rows を realtime 更新する', async () => {
			const { provider } = makeProvider();
			await provider.refresh({ predicate: null, sort: [], pagination: pageOf(0, 10) });
			provider.applyRowEvent({ kind: 'update', rowId: '1' as RowId, row: { id: 1, v: 999 } });
			expect(provider.getData()[0]).toEqual({ id: 1, v: 999 });
		});
	});
}
