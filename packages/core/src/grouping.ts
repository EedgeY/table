import type { CellValue, ColumnDef } from './column.ts';
import { _buildGroupTree, _flattenGroupTree } from './_grouping.ts';
import { _INTERNAL, createTable, type TableInstance, type TableInternal } from './create-table.ts';
import {
	_AGGREGATE_STATE,
	type AggregateMixin,
	type AggregateState,
	withAggregate,
} from './aggregate.ts';
import type { RowId } from './_types.ts';

/**
 * グループ階層 1 ノード。葉/非葉の区別は children.length で判別。
 * indices は元データの行インデックス (`pipeline.sorted` 由来) を含む。
 * aggregates はそのグループ範囲で計算済みの集約値。
 */
export type RowGroupNode = {
	readonly key: CellValue;
	/** ルートからこのノードまでのキー列。深さに応じて長さが伸びる。 */
	readonly path: ReadonlyArray<CellValue>;
	readonly depth: number;
	readonly indices: Uint32Array;
	readonly children: ReadonlyArray<RowGroupNode>;
	readonly aggregates: Readonly<Record<string, number | null>>;
};

/** トップレベルから始まるノードの配列。groupBy が空配列なら空 tree。 */
export type RowGroupTree = ReadonlyArray<RowGroupNode>;

/**
 * Flat 化されたグループ行。`getFlatGroupedRows()` の戻り値要素。
 * tbody を 1 次元配列としてレンダリングし、virtualization をそのまま使えるようにする。
 */
export type FlatGroupRow<TRow> =
	| {
			readonly kind: 'group';
			readonly node: RowGroupNode;
	  }
	| {
			readonly kind: 'row';
			readonly id: RowId;
			readonly row: TRow;
			readonly index: number;
			/** インデント表示用。groupBy の深さに等しい (= groupBy.length)。 */
			readonly depth: number;
	  };

/**
 * `withGrouping(t)` で attach される mixin の公開シェイプ。
 */
export type GroupingMixin<TRow> = {
	setGroupBy: (columnIds: ReadonlyArray<string>) => void;
	/** 折り畳まれているグループの path id (`JSON.stringify(node.path)`) 集合を一括設定。 */
	setCollapsedGroups: (pathIds: Iterable<string>) => void;
	/** 1 つの group の折り畳み状態を反転。 */
	toggleCollapsed: (pathId: string) => void;
	getGroupBy: () => ReadonlyArray<string>;
	getCollapsedGroups: () => ReadonlySet<string>;
	/** groupBy 階層を含むグループツリー。groupBy 未設定なら空配列。 */
	getGroupedRows: () => RowGroupTree;
	/**
	 * グループツリーを 1 次元 (group header + leaf row が混在) に flatten した配列。
	 * tbody を平坦に描画して virtualization をそのまま使えるようにするためのもの。
	 * groupBy 未設定なら空配列。
	 */
	getFlatGroupedRows: () => ReadonlyArray<FlatGroupRow<TRow>>;
};

const _GROUPING_ATTACHED: unique symbol = Symbol.for(
	'@tarbo-table/core/grouping-attached',
) as never;

/**
 * `TableInstance` にグルーピング機能を attach する。冪等: 既に attach 済みなら同じ参照を返す。
 *
 * 内部で `withAggregate(t)` を呼ぶ (idempotent) ので、`AggregateMixin` の API も同時に生える。
 * グループツリーの各ノードに集約値を載せるため、集約 spec を共有する必要がある。
 *
 * 注意: groupBy/collapsed は `TableState` の外側のクロージャ状態に持つ。
 * `subscribeWithSelector` では観測できないため、UI は plain `subscribe` を使うこと。
 */
export function withGrouping<TRow>(
	table: TableInstance<TRow>,
): TableInstance<TRow> & GroupingMixin<TRow> & AggregateMixin {
	const flagged = (table as unknown as { [_GROUPING_ATTACHED]?: true })[_GROUPING_ATTACHED];
	if (flagged === true) {
		return table as TableInstance<TRow> & GroupingMixin<TRow> & AggregateMixin;
	}

	withAggregate(table);
	const internal = (table as unknown as { [_INTERNAL]: TableInternal<TRow> })[_INTERNAL];
	const aggState = (table as unknown as { [_AGGREGATE_STATE]: AggregateState })[_AGGREGATE_STATE];

	let groupBy: ReadonlyArray<string> = Object.freeze([]);
	let collapsed: ReadonlySet<string> = Object.freeze(new Set<string>());

	const resolveGroupCols = (): ColumnDef<TRow>[] | null => {
		if (groupBy.length === 0) {
			return null;
		}
		const columns = internal.getColumns();
		const groupCols: ColumnDef<TRow>[] = [];
		for (const id of groupBy) {
			const col = columns.find((c) => c.id === id);
			if (col) {
				groupCols.push(col);
			}
		}
		return groupCols.length === 0 ? null : groupCols;
	};

	const mixin: GroupingMixin<TRow> = {
		setGroupBy(columnIds) {
			groupBy = Object.freeze([...columnIds]);
			collapsed = Object.freeze(new Set<string>());
			internal.notify();
		},
		setCollapsedGroups(pathIds) {
			collapsed = Object.freeze(new Set<string>(pathIds));
			internal.notify();
		},
		toggleCollapsed(pathId) {
			const next = new Set<string>(collapsed);
			if (next.has(pathId)) {
				next.delete(pathId);
			} else {
				next.add(pathId);
			}
			collapsed = Object.freeze(next);
			internal.notify();
		},
		getGroupBy: () => groupBy,
		getCollapsedGroups: () => collapsed,
		getGroupedRows() {
			const groupCols = resolveGroupCols();
			if (groupCols === null) {
				return [];
			}
			return _buildGroupTree(
				internal.getData(),
				internal.getSortedIndices(),
				groupCols,
				internal.getColumns(),
				aggState.getAggSpecsMap(),
			);
		},
		getFlatGroupedRows() {
			const groupCols = resolveGroupCols();
			if (groupCols === null) {
				return [];
			}
			const tree = _buildGroupTree(
				internal.getData(),
				internal.getSortedIndices(),
				groupCols,
				internal.getColumns(),
				aggState.getAggSpecsMap(),
			);
			return _flattenGroupTree(
				tree,
				internal.getData(),
				groupCols.length,
				internal.getRowId,
				collapsed,
			);
		},
	};

	Object.assign(table, mixin);
	Object.defineProperty(table, _GROUPING_ATTACHED, {
		value: true,
		enumerable: false,
		writable: false,
		configurable: false,
	});
	return table as TableInstance<TRow> & GroupingMixin<TRow> & AggregateMixin;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	type Emp = { dept: string; city: string; salary: number };
	const empCols: ColumnDef<Emp>[] = [
		{ id: 'dept', accessor: (r) => r.dept },
		{ id: 'city', accessor: (r) => r.city },
		{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
	];
	const emps: Emp[] = [
		{ dept: 'eng', city: 'tokyo', salary: 100 },
		{ dept: 'eng', city: 'osaka', salary: 200 },
		{ dept: 'sales', city: 'tokyo', salary: 300 },
		{ dept: 'sales', city: 'tokyo', salary: 100 },
	];

	describe('withGrouping', () => {
		it('setGroupBy + getGroupedRows で部門別の集約が出る', () => {
			const t = withGrouping(createTable<Emp>({ data: emps, columns: empCols }));
			t.setAggregations([{ columnId: 'salary', fn: 'sum' }]);
			t.setGroupBy(['dept']);
			const tree = t.getGroupedRows();
			expect(tree).toHaveLength(2);
			expect(tree[0]).toMatchObject({ key: 'eng', aggregates: { salary: 300 } });
			expect(tree[1]).toMatchObject({ key: 'sales', aggregates: { salary: 400 } });
		});

		it('groupBy 未設定なら getGroupedRows は空配列', () => {
			const t = withGrouping(createTable<Emp>({ data: emps, columns: empCols }));
			expect(t.getGroupedRows()).toEqual([]);
		});

		it('getOverallAggregates も AggregateMixin から使える', () => {
			const t = withGrouping(createTable<Emp>({ data: emps, columns: empCols }));
			t.setAggregations([{ columnId: 'salary', fn: 'sum' }]);
			expect(t.getOverallAggregates()).toEqual({ salary: 700 });
		});

		it('2段 groupBy で階層ツリーが出る', () => {
			const t = withGrouping(createTable<Emp>({ data: emps, columns: empCols }));
			t.setGroupBy(['dept', 'city']);
			const tree = t.getGroupedRows();
			expect(tree).toHaveLength(2);
			expect(tree[0]!.children.map((c) => c.key)).toEqual(['tokyo', 'osaka']);
			expect(tree[1]!.children.map((c) => c.key)).toEqual(['tokyo']);
		});

		it('getFlatGroupedRows で group header + row が交互に並ぶ', () => {
			const t = withGrouping(createTable<Emp>({ data: emps, columns: empCols }));
			t.setGroupBy(['dept']);
			const flat = t.getFlatGroupedRows();
			const kinds = flat.map((f) => f.kind);
			expect(kinds[0]).toBe('group');
			expect(kinds.filter((k) => k === 'group')).toHaveLength(2);
			expect(kinds.filter((k) => k === 'row')).toHaveLength(4);
		});

		it('toggleCollapsed で折り畳むと leaf row が出力されない', () => {
			const t = withGrouping(createTable<Emp>({ data: emps, columns: empCols }));
			t.setGroupBy(['dept']);
			const tree = t.getGroupedRows();
			const engPath = JSON.stringify(tree[0]!.path);
			t.toggleCollapsed(engPath);
			const flat = t.getFlatGroupedRows();
			const engRows = flat.filter((f) => f.kind === 'row' && emps[f.index]!.dept === 'eng');
			expect(engRows).toHaveLength(0);
		});

		it('冪等: withGrouping を 2 回呼んでも同じ参照', () => {
			const base = createTable<Emp>({ data: emps, columns: empCols });
			const a = withGrouping(base);
			const b = withGrouping(a);
			expect(a).toBe(b);
		});

		it('setGroupBy が subscribe を発火させる', () => {
			const t = withGrouping(createTable<Emp>({ data: emps, columns: empCols }));
			let calls = 0;
			t.subscribe(() => {
				calls++;
			});
			t.setGroupBy(['dept']);
			expect(calls).toBe(1);
		});

		it('filter 後に getGroupedRows が新しい indices で再計算される', () => {
			const t = withGrouping(createTable<Emp>({ data: emps, columns: empCols }));
			t.setAggregations([{ columnId: 'salary', fn: 'sum' }]);
			t.setGroupBy(['dept']);
			t.setPredicate({ kind: 'leaf', columnId: 'salary', op: '>=', value: 200 });
			const tree = t.getGroupedRows();
			expect(tree[0]).toMatchObject({ key: 'eng', aggregates: { salary: 200 } });
			expect(tree[1]).toMatchObject({ key: 'sales', aggregates: { salary: 300 } });
		});
	});
}
