import type { CellValue, ColumnDef } from './column.ts';
import type { AggregateFn } from './_aggregate.ts';
import { _aggregateMany, _aggregateOne } from './_aggregate.ts';
import { _INTERNAL, createTable, type TableInstance, type TableInternal } from './create-table.ts';

export type { AggregateFn };

/** 単一列+関数の組。setAggregations で渡す形。 */
export type AggregationSpec = {
	readonly columnId: string;
	readonly fn: AggregateFn;
};

/** 集約結果1バケツ。groupBy なしなら 1 要素配列で key=null。 */
export type AggregateBucket = {
	readonly key: CellValue | null;
	readonly count: number;
	readonly values: Readonly<Record<string, number | null>>;
};

export type AggregateOptions = {
	/** グループ化列 (1段)。未指定なら全体集計。 */
	readonly groupBy?: string;
	/** 集約対象列 → 関数のマップ。 */
	readonly columns: Readonly<Record<string, AggregateFn>>;
};

/**
 * 行配列を 1 段の groupBy で集約。チャート向けの shape。
 *
 * - `groupBy` 未指定: 全行を 1 バケツに集約し key=null。
 * - `groupBy` 指定: バケツの順番は最初に出現したキーの順 (Map の挿入順) を保つ。
 * - count: 行数 (null 値を含む)。
 */
export function aggregate<TRow>(
	rows: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
	opts: AggregateOptions,
): ReadonlyArray<AggregateBucket> {
	const groupColId = opts.groupBy;
	const valueColIds = Object.keys(opts.columns);

	const buckets = new Map<CellValue | null, number[]>();
	if (groupColId === undefined) {
		const all: number[] = new Array(rows.length);
		for (let i = 0; i < rows.length; i++) {
			all[i] = i;
		}
		buckets.set(null, all);
	} else {
		const groupCol = columns.find((c) => c.id === groupColId);
		if (!groupCol) {
			return [];
		}
		for (let i = 0; i < rows.length; i++) {
			const k = groupCol.accessor(rows[i]!);
			const norm = k === undefined ? null : k;
			let arr = buckets.get(norm);
			if (!arr) {
				arr = [];
				buckets.set(norm, arr);
			}
			arr.push(i);
		}
	}

	const out: AggregateBucket[] = [];
	for (const [key, idxArr] of buckets) {
		const indices = new Uint32Array(idxArr);
		const values: Record<string, number | null> = {};
		for (const id of valueColIds) {
			const fn = opts.columns[id]!;
			const col = columns.find((c) => c.id === id);
			values[id] = col ? _aggregateOne(rows, indices, col, fn) : null;
		}
		out.push(
			Object.freeze({
				key,
				count: indices.length,
				values: Object.freeze(values),
			}),
		);
	}
	return Object.freeze(out);
}

/**
 * `withAggregate(t)` で attach される mixin の公開シェイプ。
 *
 * - `setAggregations` は集約 spec を入れ替えて再描画通知
 * - `getOverallAggregates` は filter+sort 後の全行に対する集約値 (footer 用)
 */
export type AggregateMixin = {
	setAggregations: (specs: ReadonlyArray<AggregationSpec>) => void;
	getAggregations: () => ReadonlyArray<AggregationSpec>;
	getOverallAggregates: () => Readonly<Record<string, number | null>>;
};

export const _AGGREGATE_STATE: unique symbol = Symbol.for(
	'@tarbo-table/core/aggregate-state',
) as never;

export type AggregateState = {
	readonly getAggSpecsMap: () => Readonly<Record<string, AggregateFn>>;
};

/**
 * `TableInstance` に集約機能を attach する。冪等: 既に attach 済みなら何もしない。
 *
 * `getOverallAggregates()` は filter+sort 反映後の indices で計算される
 * (内部アクセサ経由で pipeline を見るため)。
 *
 * 注意: 集約 spec は `TableState` の外側のクロージャ状態に持つ。
 * `subscribeWithSelector` では観測できないため、UI は plain `subscribe` を使うこと。
 */
export function withAggregate<TRow>(
	table: TableInstance<TRow>,
): TableInstance<TRow> & AggregateMixin {
	const existing = (table as unknown as { [_AGGREGATE_STATE]?: AggregateState })[_AGGREGATE_STATE];
	if (existing !== undefined) {
		return table as TableInstance<TRow> & AggregateMixin;
	}

	const internal = (table as unknown as { [_INTERNAL]: TableInternal<TRow> })[_INTERNAL];
	let aggregations: ReadonlyArray<AggregationSpec> = Object.freeze([]);

	const getAggSpecsMap = (): Readonly<Record<string, AggregateFn>> => {
		const out: Record<string, AggregateFn> = {};
		for (const s of aggregations) {
			out[s.columnId] = s.fn;
		}
		return out;
	};

	const mixin: AggregateMixin = {
		setAggregations(specs) {
			aggregations = Object.freeze([...specs]);
			internal.notify();
		},
		getAggregations: () => aggregations,
		getOverallAggregates() {
			return _aggregateMany(
				internal.getData(),
				internal.getSortedIndices(),
				internal.getColumns(),
				getAggSpecsMap(),
			);
		},
	};

	Object.assign(table, mixin);
	Object.defineProperty(table, _AGGREGATE_STATE, {
		value: Object.freeze({ getAggSpecsMap }),
		enumerable: false,
		writable: false,
		configurable: false,
	});
	return table as TableInstance<TRow> & AggregateMixin;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	type Row = { dept: string; salary: number };
	const cols: ColumnDef<Row>[] = [
		{ id: 'dept', accessor: (r) => r.dept },
		{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
	];
	const data: Row[] = [
		{ dept: 'eng', salary: 100 },
		{ dept: 'eng', salary: 200 },
		{ dept: 'sales', salary: 300 },
		{ dept: 'sales', salary: 100 },
	];

	describe('aggregate', () => {
		it('groupBy なしは全体集計', () => {
			const r = aggregate(data, cols, { columns: { salary: 'sum' } });
			expect(r).toHaveLength(1);
			expect(r[0]).toMatchObject({ key: null, count: 4, values: { salary: 700 } });
		});

		it('groupBy ありは部門別', () => {
			const r = aggregate(data, cols, { groupBy: 'dept', columns: { salary: 'avg' } });
			expect(r).toHaveLength(2);
			expect(r[0]).toMatchObject({ key: 'eng', count: 2, values: { salary: 150 } });
			expect(r[1]).toMatchObject({ key: 'sales', count: 2, values: { salary: 200 } });
		});

		it('複数集約関数', () => {
			const r = aggregate(data, cols, {
				groupBy: 'dept',
				columns: { salary: 'min' },
			});
			expect(r[0]!.values.salary).toBe(100);
			expect(r[1]!.values.salary).toBe(100);
		});

		it('未知の groupBy 列は空配列', () => {
			const r = aggregate(data, cols, { groupBy: 'unknown', columns: { salary: 'sum' } });
			expect(r).toEqual([]);
		});

		it('count は行数', () => {
			const r = aggregate(data, cols, { groupBy: 'dept', columns: {} });
			expect(r.map((b) => b.count)).toEqual([2, 2]);
		});
	});

	describe('withAggregate', () => {
		it('attach 後に setAggregations/getAggregations/getOverallAggregates が生える', () => {
			const t = withAggregate(createTable<Row>({ data, columns: cols }));
			expect(typeof t.setAggregations).toBe('function');
			expect(typeof t.getAggregations).toBe('function');
			expect(typeof t.getOverallAggregates).toBe('function');
			t.setAggregations([{ columnId: 'salary', fn: 'sum' }]);
			expect(t.getAggregations()).toEqual([{ columnId: 'salary', fn: 'sum' }]);
			expect(t.getOverallAggregates()).toEqual({ salary: 700 });
		});

		it('冪等: 2回呼んでも同じ table', () => {
			const base = createTable<Row>({ data, columns: cols });
			const a = withAggregate(base);
			const b = withAggregate(a);
			expect(a).toBe(b);
		});

		it('setAggregations が subscribe を発火させる', () => {
			const t = withAggregate(createTable<Row>({ data, columns: cols }));
			let calls = 0;
			t.subscribe(() => {
				calls++;
			});
			t.setAggregations([{ columnId: 'salary', fn: 'avg' }]);
			expect(calls).toBe(1);
		});
	});
}
