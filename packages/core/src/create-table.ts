import type {
	CellValue,
	ColumnDef,
	ColumnNode,
	ColumnPinning,
	ColumnPinningState,
	ColumnSizingState,
	ColumnVisibilityState,
} from './column.ts';
import { flattenColumns } from './column.ts';
import type { DataSource } from './data-source.ts';
import type { RelationSource } from './relation-source.ts';
import type { Predicate } from './filter.ts';
import type { PaginationDerived, PaginationState } from './pagination.ts';
import type { SelectionMode, SelectionState } from './selection.ts';
import type { SortKey, SortSpec } from './sort.ts';
import { _clearSelection, _selectOne, _toggle } from './_selection.ts';
import type { RowId } from './_types.ts';
import { _shallowEq } from './_utils.ts';
import { _filterVisible, _initialVisibility } from './_visibility.ts';
import type { EngineDriverFactory } from './_engine-driver.ts';
import { _createPipeline, _disposePipeline, _setColumns } from './_pipeline.ts';
import type { ComputedColumnSpec } from './query.ts';
import { compileComputedColumns } from './computed.ts';
import type { ServerState } from './_server-store.ts';
import {
	_createClientRowProvider,
	_createServerRowProvider,
	type RowEvent,
	type RowProvider,
	type RowProviderQuery,
} from './_row-provider.ts';

export type VisibleRow<TRow> = {
	readonly id: RowId;
	readonly index: number;
	readonly row: TRow;
};

export type TableState = Readonly<{
	predicate: Predicate | null;
	sort: SortSpec;
	selection: SelectionState;
	pagination: PaginationState;
	columnSizing: ColumnSizingState;
	columnVisibility: ColumnVisibilityState;
	columnPinning: ColumnPinningState;
}>;

export type TableMode = 'client' | 'server';

export type CreateTableOptions<TRow> = {
	/**
	 * client モードでの行データ。server モードでは無視され、初期は空配列でよい
	 * (fetch 結果で逐次差し替わる)。
	 */
	data?: ReadonlyArray<TRow>;
	/**
	 * 列定義。フラットな ColumnDef[] のほか、`ColumnGroupDef` を含むネスト構造で
	 * マルチレベルヘッダーを表現できる。pipeline には葉ノードだけが flatten されて渡る。
	 */
	columns: ReadonlyArray<ColumnNode<TRow>>;
	getRowId?: (row: TRow, index: number) => string;
	initialState?: Partial<TableState>;
	pageSize?: number;
	selectionMode?: SelectionMode;
	/**
	 * 'client' (default): 渡された data に対して in-process pipeline を回す。
	 * 'server': pipeline を bypass し、state 変更ごとに dataSource.fetch を呼ぶ。
	 * server を選ぶ場合は dataSource.fetch が必須。
	 */
	mode?: TableMode;
	/**
	 * 編集 / fetch / realtime 用のデータバックエンド。
	 * - mode='server' では fetch が必須
	 * - withEdit を併用する場合 updateCell / bulkUpdate を実装
	 * - realtime push を反映する場合 subscribe を実装
	 */
	dataSource?: DataSource<TRow>;
	/**
	 * server モードの fetch debounce。連続する setPredicate / setSort / setPagination
	 * を 1 回の fetch にまとめる。既定 50ms。
	 */
	serverDebounceMs?: number;
	/**
	 * Pipeline backend. Default is the in-process TypeScript engine. Pass a
	 * factory (e.g. `rsDriverFactory` from `@tarbo-table/core-rs/node`) to
	 * route filter/sort through Rust+WebAssembly without changing any other
	 * call site.
	 */
	engine?: EngineDriverFactory<TRow>;
	/**
	 * 別テーブルへのリレーション解決バックエンド。'relation' / 'relation-many'
	 * 型の列を描画する UI 層、およびサブテーブル展開機能から参照される。
	 * 未指定なら null が返り、リレーション機能は無効。
	 */
	relations?: RelationSource;
};

export type Listener = () => void;

export const _INTERNAL: unique symbol = Symbol.for('@tarbo-table/core/internal') as never;

/**
 * `TableInstance` に attach される内部アクセサ。
 * 拡張関数は `(table as unknown as { [_INTERNAL]: TableInternal<TRow> })[_INTERNAL]` で取り出す。
 */
export type TableInternal<TRow> = {
	/** Result Set のインデックス (filter+sort 反映済み)。server モードでは退化した 0..n-1。 */
	readonly getSortedIndices: () => Uint32Array;
	readonly getData: () => ReadonlyArray<TRow>;
	readonly getColumns: () => ReadonlyArray<ColumnDef<TRow>>;
	readonly getRowId: (row: TRow, index: number) => RowId;
	/** 既存 listeners Set を一斉に呼ぶ。拡張側 setter から再描画をトリガーするのに使う。 */
	readonly notify: () => void;
	/** 現在の data ref を差し替える。withEdit / realtime push 用。 */
	readonly replaceData: (data: ReadonlyArray<TRow>) => void;
	/** 利用中の DataSource (未指定なら null)。withEdit から参照する。 */
	readonly getDataSource: () => DataSource<TRow> | null;
	/** 'client' | 'server'。withEdit が挙動を切り替えるのに使う。 */
	readonly getMode: () => TableMode;
};

export type TableInstance<TRow> = {
	setData: (data: ReadonlyArray<TRow>) => void;
	/** Release pipeline-backend resources (e.g. WASM linear memory). No-op for the default JS engine. */
	dispose: () => void;
	/**
	 * `parseQuery` の `let …;` 句 (computed column) を有効列として登録/差し替える。
	 * 土台列 (opts.columns) の上に specs を順にコンパイルして重ね、以後 filter / sort /
	 * 描画 / export が computed column を参照できる。空配列で computed をすべて解除。
	 */
	setComputedColumns: (specs: ReadonlyArray<ComputedColumnSpec>) => void;
	setPredicate: (predicate: Predicate | null) => void;
	setSort: (spec: SortSpec) => void;
	toggleSort: (columnId: string, additive: boolean) => void;
	setPagination: (patch: Partial<PaginationState>) => void;
	setColumnWidth: (columnId: string, px: number) => void;
	setColumnVisibility: (columnId: string, visible: boolean) => void;
	toggleColumnVisibility: (columnId: string) => void;
	setColumnPinning: (columnId: string, pin: ColumnPinning | null) => void;
	getPinnedColumns: () => {
		readonly left: ReadonlyArray<ColumnDef<TRow>>;
		readonly center: ReadonlyArray<ColumnDef<TRow>>;
		readonly right: ReadonlyArray<ColumnDef<TRow>>;
	};
	selectRow: (id: RowId) => void;
	toggleRow: (id: RowId) => void;
	clearSelection: () => void;

	getState: () => TableState;
	/** ネスト構造のまま返す。マルチレベルヘッダー描画用。 */
	getColumnTree: () => ReadonlyArray<ColumnNode<TRow>>;
	/** 葉ノードのみを順序保ったまま返す。computed column 登録後はそれらも含む。 */
	getColumns: () => ReadonlyArray<ColumnDef<TRow>>;
	/**
	 * computed column を除いた土台列 (opts.columns の葉) を返す。
	 * `let …;` 句を parse する際の列スキーマとして使う (computed 名の衝突を避ける)。
	 */
	getBaseColumns: () => ReadonlyArray<ColumnDef<TRow>>;
	getVisibleColumns: () => ReadonlyArray<ColumnDef<TRow>>;
	getRowId: (row: TRow, index: number) => RowId;
	getColumnWidth: (columnId: string) => number;
	getVisibleRows: () => ReadonlyArray<VisibleRow<TRow>>;
	getPagedRows: () => ReadonlyArray<VisibleRow<TRow>>;
	/** リレーション解決バックエンド。`createTable({ relations })` 未指定なら null。 */
	getRelationSource: () => RelationSource | null;
	getVisibleIndices: () => Uint32Array;
	getPagedIndices: () => Uint32Array;
	getPagination: () => PaginationDerived;
	getRowCount: () => { total: number; visible: number; paged: number };

	subscribe: (listener: Listener) => () => void;
	subscribeWithSelector: <T>(
		select: (state: TableState) => T,
		listener: (next: T, prev: T) => void,
		equals?: (a: T, b: T) => boolean,
	) => () => void;

	/** 'client' | 'server'。 */
	getMode: () => TableMode;
	/** server モードのフェッチ状態。client モードでは status='idle' / rows=[] が返る。 */
	getServerState: () => ServerState<TRow>;
	/** 現在の state で fetch を再発火 (refresh / retry 用)。client モードでは no-op。 */
	refresh: () => Promise<void>;
	/**
	 * Infinite scroll 用: 既存 rows を保ったまま次ページを取得して append。
	 * dataSource.fetch が cursor / offset を扱うように実装されている前提。
	 * 末端 (nextCursor=null) の場合は no-op。client モードでも no-op。
	 */
	fetchMore: () => Promise<void>;
	/** Realtime 用: in-memory data に対して行を差分更新 (insert / update / delete)。 */
	applyRowEvent: (
		event:
			| { kind: 'insert'; row: TRow }
			| { kind: 'update'; rowId: RowId; row: TRow }
			| { kind: 'delete'; rowId: RowId },
	) => void;
};

function defaultGetRowId<TRow>(_row: TRow, index: number): RowId {
	return String(index) as RowId;
}

export function createTable<TRow>(opts: CreateTableOptions<TRow>): TableInstance<TRow> {
	const baseTree = opts.columns;
	const baseColumns = flattenColumns(baseTree);
	let columnTree: ReadonlyArray<ColumnNode<TRow>> = baseTree;
	let columns = baseColumns;
	const getRowId = (opts.getRowId ?? defaultGetRowId) as (row: TRow, index: number) => RowId;
	const mode: TableMode = opts.mode ?? 'client';
	const initialData = opts.data ?? Object.freeze([]);
	if (mode === 'server' && (!opts.dataSource || !opts.dataSource.fetch)) {
		throw new Error('createTable: mode=server requires dataSource.fetch');
	}

	let state: TableState = Object.freeze({
		predicate: opts.initialState?.predicate ?? null,
		sort: opts.initialState?.sort ?? [],
		selection:
			opts.initialState?.selection ??
			Object.freeze({
				mode: opts.selectionMode ?? 'none',
				ids: new Set<RowId>() as ReadonlySet<RowId>,
			}),
		pagination:
			opts.initialState?.pagination ??
			Object.freeze({
				pageIndex: 0,
				pageSize: opts.pageSize ?? Number.POSITIVE_INFINITY,
			}),
		columnSizing: opts.initialState?.columnSizing ?? Object.freeze({}),
		columnVisibility: _initialVisibility(columns, opts.initialState?.columnVisibility),
		columnPinning: opts.initialState?.columnPinning ?? Object.freeze({}),
	});

	const pipeline = _createPipeline(
		initialData,
		columns,
		state.predicate,
		state.sort,
		state.pagination,
		opts.engine,
	);

	const listeners = new Set<Listener>();

	const notify = (): void => {
		for (const l of listeners) {
			l();
		}
	};

	const provider: RowProvider<TRow> =
		mode === 'server' && opts.dataSource
			? _createServerRowProvider<TRow>({
					dataSource: opts.dataSource,
					onChange: notify,
					debounceMs: opts.serverDebounceMs,
					getRowId,
				})
			: _createClientRowProvider<TRow>(pipeline, getRowId);

	const currentQuery = (): RowProviderQuery => ({
		predicate: state.predicate,
		sort: state.sort,
		pagination: state.pagination,
	});

	const setState = (next: TableState): void => {
		state = next;
		notify();
	};

	state = Object.freeze({ ...state, pagination: provider.applyQuery(currentQuery()) });

	const commitQuery = (next: TableState): void => {
		const clamped = provider.applyQuery({
			predicate: next.predicate,
			sort: next.sort,
			pagination: next.pagination,
		});
		setState(clamped === next.pagination ? next : Object.freeze({ ...next, pagination: clamped }));
	};

	const colDefaultWidth = (col: ColumnDef<TRow>): number => col.defaultWidth ?? 120;

	const instance: TableInstance<TRow> = {
		setData(data) {
			provider.replaceData(data);
			commitQuery(state);
		},
		dispose() {
			_disposePipeline(pipeline);
			provider.dispose();
		},
		setComputedColumns(specs) {
			const computedCols = specs.length > 0 ? compileComputedColumns(specs, baseColumns) : [];
			columns = computedCols.length > 0 ? [...baseColumns, ...computedCols] : baseColumns;
			columnTree = computedCols.length > 0 ? [...baseTree, ...computedCols] : baseTree;
			_setColumns(pipeline, columns);
			commitQuery(
				Object.freeze({
					...state,
					columnVisibility: _initialVisibility(columns, state.columnVisibility),
				}),
			);
		},
		setPredicate(predicate) {
			commitQuery(Object.freeze({ ...state, predicate }));
		},
		setSort(spec) {
			commitQuery(Object.freeze({ ...state, sort: spec }));
		},
		toggleSort(columnId, additive) {
			const current = state.sort;
			const existing = current.findIndex((k) => k.columnId === columnId);
			let nextSpec: SortKey[];
			if (existing === -1) {
				const newKey: SortKey = { columnId, dir: 'asc' };
				nextSpec = additive ? [...current, newKey] : [newKey];
			} else {
				const cur = current[existing]!;
				if (cur.dir === 'asc') {
					const flipped: SortKey = { columnId, dir: 'desc' };
					nextSpec = additive ? current.map((k, i) => (i === existing ? flipped : k)) : [flipped];
				} else {
					nextSpec = additive ? current.filter((_, i) => i !== existing) : [];
				}
			}
			commitQuery(Object.freeze({ ...state, sort: nextSpec }));
		},
		setPagination(patch) {
			const merged: PaginationState = Object.freeze({
				pageIndex: patch.pageIndex ?? state.pagination.pageIndex,
				pageSize: patch.pageSize ?? state.pagination.pageSize,
			});
			commitQuery(Object.freeze({ ...state, pagination: merged }));
		},
		setColumnWidth(columnId, px) {
			const col = columns.find((c) => c.id === columnId);
			const min = col?.minWidth ?? 32;
			const max = col?.maxWidth ?? Number.POSITIVE_INFINITY;
			const clamped = Math.min(max, Math.max(min, px));
			if (state.columnSizing[columnId] === clamped) {
				return;
			}
			const nextSizing: ColumnSizingState = Object.freeze({
				...state.columnSizing,
				[columnId]: clamped,
			});
			setState(Object.freeze({ ...state, columnSizing: nextSizing }));
		},
		setColumnVisibility(columnId, visible) {
			if (state.columnVisibility[columnId] === visible) {
				return;
			}
			const nextVis: ColumnVisibilityState = Object.freeze({
				...state.columnVisibility,
				[columnId]: visible,
			});
			setState(Object.freeze({ ...state, columnVisibility: nextVis }));
		},
		toggleColumnVisibility(columnId) {
			const current = state.columnVisibility[columnId] !== false;
			const nextVis: ColumnVisibilityState = Object.freeze({
				...state.columnVisibility,
				[columnId]: !current,
			});
			setState(Object.freeze({ ...state, columnVisibility: nextVis }));
		},
		setColumnPinning(columnId, pin) {
			const cur = state.columnPinning[columnId];
			if (cur === pin || (cur === undefined && pin === null)) return;
			const next: Record<string, ColumnPinning> = { ...state.columnPinning };
			if (pin === null) {
				delete next[columnId];
			} else {
				next[columnId] = pin;
			}
			setState(Object.freeze({ ...state, columnPinning: Object.freeze(next) }));
		},
		getPinnedColumns() {
			const visible = _filterVisible(columns, state.columnVisibility);
			const left: ColumnDef<TRow>[] = [];
			const center: ColumnDef<TRow>[] = [];
			const right: ColumnDef<TRow>[] = [];
			for (const c of visible) {
				const p = state.columnPinning[c.id];
				if (p === 'left') left.push(c);
				else if (p === 'right') right.push(c);
				else center.push(c);
			}
			return { left, center, right };
		},
		selectRow(id) {
			const next = _selectOne(state.selection, id);
			if (next === state.selection) {
				return;
			}
			setState(Object.freeze({ ...state, selection: next }));
		},
		toggleRow(id) {
			const next = _toggle(state.selection, id);
			if (next === state.selection) {
				return;
			}
			setState(Object.freeze({ ...state, selection: next }));
		},
		clearSelection() {
			const next = _clearSelection(state.selection);
			if (next === state.selection) {
				return;
			}
			setState(Object.freeze({ ...state, selection: next }));
		},

		getState: () => state,
		getColumnTree: () => columnTree,
		getColumns: () => columns,
		getBaseColumns: () => baseColumns,
		getVisibleColumns: () => _filterVisible(columns, state.columnVisibility),
		getRowId,
		getColumnWidth(columnId) {
			const w = state.columnSizing[columnId];
			if (typeof w === 'number') {
				return w;
			}
			const col = columns.find((c) => c.id === columnId);
			return col ? colDefaultWidth(col) : 120;
		},

		getVisibleIndices: () => provider.resultIndices(),
		getPagedIndices: () => provider.pageIndices(),
		getVisibleRows: () => provider.resultRows(),
		getPagedRows: () => provider.pageRows(),
		getPagination: () => provider.derivePagination(state.pagination),
		getRowCount: () => provider.rowCount(),

		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		subscribeWithSelector(select, listener, equals = Object.is) {
			let last = select(state);
			const inner: Listener = () => {
				const next = select(state);
				if (!equals(last, next)) {
					const prev = last;
					last = next;
					listener(next, prev);
				}
			};
			listeners.add(inner);
			return () => {
				listeners.delete(inner);
			};
		},

		getMode: () => mode,
		getServerState: () => provider.serverState(),
		getRelationSource: () => opts.relations ?? null,
		refresh: () => provider.refresh(currentQuery()),
		fetchMore: () => provider.fetchMore(currentQuery()),
		applyRowEvent(event: RowEvent<TRow>) {
			provider.applyRowEvent(event);
			commitQuery(state);
		},
	};

	const internal: TableInternal<TRow> = {
		getSortedIndices: () => provider.resultIndices(),
		getData: () => provider.getData(),
		getColumns: () => columns,
		getRowId,
		notify,
		replaceData(data) {
			provider.replaceData(data);
			commitQuery(state);
		},
		getDataSource: () => opts.dataSource ?? null,
		getMode: () => mode,
	};
	Object.defineProperty(instance, _INTERNAL, {
		value: internal,
		enumerable: false,
		writable: false,
		configurable: false,
	});
	return instance;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	type Row = { id: number; name: string; salary: number };
	const cols: ColumnDef<Row>[] = [
		{ id: 'id', accessor: (r) => r.id as CellValue, type: 'number' },
		{ id: 'name', accessor: (r) => r.name },
		{ id: 'salary', accessor: (r) => r.salary as CellValue, type: 'number' },
	];
	const data: Row[] = [
		{ id: 1, name: 'Tanaka', salary: 50000 },
		{ id: 2, name: 'Yamada', salary: 100000 },
		{ id: 3, name: 'Suzuki', salary: 75000 },
	];

	describe('createTable', () => {
		it('predicate → sort → page combines correctly', () => {
			const t = createTable<Row>({
				data,
				columns: cols,
				pageSize: 10,
				getRowId: (r) => String(r.id),
			});
			t.setPredicate({ kind: 'leaf', columnId: 'salary', op: '>=', value: 60000 });
			t.setSort([{ columnId: 'salary', dir: 'asc' }]);
			expect(t.getPagedRows().map((r) => r.row.name)).toEqual(['Suzuki', 'Yamada']);
		});

		it('toggleSort cycles asc → desc → off (non-additive)', () => {
			const t = createTable<Row>({ data, columns: cols });
			t.toggleSort('salary', false);
			expect(t.getState().sort).toEqual([{ columnId: 'salary', dir: 'asc' }]);
			t.toggleSort('salary', false);
			expect(t.getState().sort).toEqual([{ columnId: 'salary', dir: 'desc' }]);
			t.toggleSort('salary', false);
			expect(t.getState().sort).toEqual([]);
		});

		it('toggleSort additive accumulates multiple keys', () => {
			const t = createTable<Row>({ data, columns: cols });
			t.toggleSort('name', true);
			t.toggleSort('salary', true);
			expect(t.getState().sort).toEqual([
				{ columnId: 'name', dir: 'asc' },
				{ columnId: 'salary', dir: 'asc' },
			]);
		});

		it('selection survives a filter change that hides the selected row', () => {
			const t = createTable<Row>({
				data,
				columns: cols,
				selectionMode: 'multi',
				getRowId: (r) => String(r.id),
			});
			t.toggleRow('2' as RowId);
			t.setPredicate({ kind: 'leaf', columnId: 'salary', op: '<', value: 60000 });
			expect(t.getPagedRows()).toHaveLength(1);
			expect(t.getState().selection.ids.has('2' as RowId)).toBe(true);
			t.setPredicate(null);
			expect(t.getState().selection.ids.has('2' as RowId)).toBe(true);
		});

		it('subscribeWithSelector fires only when selected slice changes', () => {
			const t = createTable<Row>({ data, columns: cols });
			let calls = 0;
			t.subscribeWithSelector(
				(s) => s.sort,
				() => {
					calls++;
				},
			);
			t.setColumnWidth('id', 200);
			expect(calls).toBe(0);
			t.toggleSort('id', false);
			expect(calls).toBe(1);
		});

		it('setColumnWidth clamps to min/max from column def', () => {
			const t = createTable<Row>({
				data,
				columns: [{ id: 'id', accessor: (r) => r.id, minWidth: 50, maxWidth: 300 }],
			});
			t.setColumnWidth('id', 10);
			expect(t.getColumnWidth('id')).toBe(50);
			t.setColumnWidth('id', 500);
			expect(t.getColumnWidth('id')).toBe(300);
		});

		it('setData resets pagination clamp when total shrinks', () => {
			const t = createTable<Row>({ data, columns: cols, pageSize: 2 });
			t.setPagination({ pageIndex: 1 });
			expect(t.getState().pagination.pageIndex).toBe(1);
			t.setData([data[0]!]);
			expect(t.getState().pagination.pageIndex).toBe(0);
		});

		it('ColumnDef.hidden:true は初期で非表示', () => {
			const t = createTable<Row>({
				data,
				columns: [
					{ id: 'id', accessor: (r) => r.id, hidden: true },
					{ id: 'name', accessor: (r) => r.name },
				],
			});
			expect(t.getState().columnVisibility).toEqual({ id: false, name: true });
			expect(t.getVisibleColumns().map((c) => c.id)).toEqual(['name']);
		});

		it('toggleColumnVisibility で表示/非表示が切り替わる', () => {
			const t = createTable<Row>({ data, columns: cols });
			expect(t.getVisibleColumns()).toHaveLength(3);
			t.toggleColumnVisibility('name');
			expect(t.getVisibleColumns().map((c) => c.id)).toEqual(['id', 'salary']);
			t.toggleColumnVisibility('name');
			expect(t.getVisibleColumns()).toHaveLength(3);
		});

		it('setColumnVisibility(false) で非表示化', () => {
			const t = createTable<Row>({ data, columns: cols });
			t.setColumnVisibility('salary', false);
			expect(t.getState().columnVisibility.salary).toBe(false);
			expect(t.getVisibleColumns().map((c) => c.id)).toEqual(['id', 'name']);
		});

		it('subscribeWithSelector で columnVisibility の変更を検知', () => {
			const t = createTable<Row>({ data, columns: cols });
			let calls = 0;
			t.subscribeWithSelector(
				(s) => s.columnVisibility,
				() => {
					calls++;
				},
			);
			t.toggleColumnVisibility('id');
			expect(calls).toBe(1);
			t.setColumnVisibility('id', false);
			expect(calls).toBe(1);
		});

		it('ColumnGroupDef を含む columns は葉だけが flatten されて pipeline で機能', () => {
			const t = createTable<Row>({
				data,
				columns: [
					{ id: 'id', accessor: (r) => r.id },
					{
						kind: 'group',
						id: 'profile',
						header: 'profile',
						children: [
							{ id: 'name', accessor: (r) => r.name },
							{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
						],
					},
				],
				pageSize: 10,
			});
			expect(t.getColumns().map((c) => c.id)).toEqual(['id', 'name', 'salary']);
			expect(t.getColumnTree()).toHaveLength(2);
			t.setSort([{ columnId: 'salary', dir: 'asc' }]);
			expect(t.getPagedRows().map((r) => r.row.salary)).toEqual([50000, 75000, 100000]);
		});

		it('setComputedColumns は flat 列とツリー(ヘッダー)の両方へ leaf を追加する', () => {
			const t = createTable<Row>({
				data,
				columns: [
					{ id: 'id', accessor: (r) => r.id },
					{
						kind: 'group',
						id: 'profile',
						header: 'profile',
						children: [
							{ id: 'name', accessor: (r) => r.name },
							{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
						],
					},
				],
			});
			t.setComputedColumns([{ name: 'bonus', expr: { kind: 'col', name: 'salary' } }]);
			expect(t.getColumns().map((c) => c.id)).toContain('bonus');
			const tree = t.getColumnTree();
			expect(tree).toHaveLength(3);
			expect(tree.some((n) => 'id' in n && n.id === 'bonus')).toBe(true);
			t.setComputedColumns([]);
			expect(t.getColumnTree()).toHaveLength(2);
			expect(t.getColumns().map((c) => c.id)).not.toContain('bonus');
		});

		it('mode のデフォルトは client', () => {
			const t = createTable<Row>({ data, columns: cols });
			expect(t.getMode()).toBe('client');
			expect(t.getServerState().status).toBe('idle');
		});

		it('mode=server で dataSource.fetch なしは throw', () => {
			expect(() => createTable<Row>({ columns: cols, mode: 'server' })).toThrow();
		});

		it('applyRowEvent (client mode): insert/update/delete が pipeline に反映', () => {
			const t = createTable<Row>({
				data,
				columns: cols,
				getRowId: (r) => String(r.id),
			});
			expect(t.getRowCount().total).toBe(3);
			t.applyRowEvent({ kind: 'insert', row: { id: 4, name: 'X', salary: 1 } });
			expect(t.getRowCount().total).toBe(4);
			t.applyRowEvent({
				kind: 'update',
				rowId: '1' as RowId,
				row: { id: 1, name: 'Tanaka2', salary: 50000 },
			});
			const r1 = t.getPagedRows().find((r) => r.id === ('1' as RowId));
			expect(r1?.row.name).toBe('Tanaka2');
			t.applyRowEvent({ kind: 'delete', rowId: '4' as RowId });
			expect(t.getRowCount().total).toBe(3);
		});

		it('mode=server で setPredicate/setSort/setPagination が fetch を呼ぶ', async () => {
			let calls = 0;
			const t = createTable<Row>({
				columns: cols,
				mode: 'server',
				serverDebounceMs: 0,
				dataSource: {
					fetch: async () => {
						calls++;
						return { rows: data, totalCount: 1000 };
					},
				},
			});
			await t.refresh();
			expect(calls).toBeGreaterThanOrEqual(1);
			const before = calls;
			t.setPredicate({ kind: 'leaf', columnId: 'salary', op: '>=', value: 50000 });
			await t.refresh();
			expect(calls).toBeGreaterThan(before);
		});

		it('mode=server: getPagedRows は serverStore.rows を返す', async () => {
			const t = createTable<Row>({
				columns: cols,
				mode: 'server',
				serverDebounceMs: 0,
				dataSource: {
					fetch: async () => ({ rows: data, totalCount: 3 }),
				},
				getRowId: (r) => String(r.id),
			});
			await t.refresh();
			const rows = t.getPagedRows();
			expect(rows).toHaveLength(3);
			expect(rows[0]!.row.id).toBe(1);
			expect(t.getRowCount().total).toBe(3);
		});

		it('mode=server: 非クエリ setter (width/visibility/pinning/selection) は refetch しない', async () => {
			let calls = 0;
			const t = createTable<Row>({
				columns: cols,
				mode: 'server',
				serverDebounceMs: 0,
				selectionMode: 'multi',
				dataSource: {
					fetch: async () => {
						calls++;
						return { rows: data, totalCount: 3 };
					},
				},
				getRowId: (r) => String(r.id),
			});
			await t.refresh();
			const before = calls;
			t.setColumnWidth('salary', 200);
			t.toggleColumnVisibility('name');
			t.setColumnPinning('id', 'left');
			t.selectRow('2' as RowId);
			await new Promise((r) => setTimeout(r, 0));
			expect(calls).toBe(before);
		});

		it('mode=server: applyRowEvent で realtime push を反映', async () => {
			const t = createTable<Row>({
				columns: cols,
				mode: 'server',
				serverDebounceMs: 0,
				dataSource: {
					fetch: async () => ({ rows: data, totalCount: 3 }),
				},
				getRowId: (r) => String(r.id),
			});
			await t.refresh();
			t.applyRowEvent({
				kind: 'update',
				rowId: '1' as RowId,
				row: { id: 1, name: 'Updated', salary: 50000 },
			});
			const rows = t.getPagedRows();
			expect(rows[0]!.row.name).toBe('Updated');
		});
	});
}
