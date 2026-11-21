import type { CellValue, ColumnDef } from './column.ts';
import { aggregate } from './aggregate.ts';
import type { ChartConfig } from './query.ts';

export type ChartCategoryData = {
	readonly type: 'bar' | 'line' | 'pie' | 'combo';
	/** カテゴリ (groupBy キー) ごとに、メトリクス並び順の値配列。 */
	readonly categories: ReadonlyArray<{
		readonly key: CellValue | null;
		readonly values: ReadonlyArray<number | null>;
	}>;
	/** メトリクスのラベル ("sum(salary)" 形式)。凡例 / 軸ラベル用。 */
	readonly metricLabels: ReadonlyArray<string>;
};

export type ChartBubbleData = {
	readonly type: 'bubble';
	readonly points: ReadonlyArray<{
		readonly key: CellValue | null;
		readonly x: number | null;
		readonly y: number | null;
		readonly r: number | null;
	}>;
	readonly axisLabels: { readonly x: string; readonly y: string; readonly r: string };
};

export type ChartData = ChartCategoryData | ChartBubbleData;

function metricLabel(fn: string, columnId: string): string {
	return `${fn}(${columnId})`;
}

/**
 * 行配列 + ChartConfig からチャート用データを構築。
 * `rows` は通常 `table.getVisibleRows()` の row のみ (filter + sort 済み) を渡す想定。
 */
export function buildChartData<TRow>(
	rows: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
	config: ChartConfig,
): ChartData {
	const perMetric = config.metrics.map((m) =>
		aggregate(rows, columns, {
			groupBy: config.groupBy,
			columns: { [m.columnId]: m.fn },
		}),
	);

	const keyOrder: Array<CellValue | null> = [];
	const seen = new Set<string>();
	const values = new Map<string, Array<number | null>>();
	const keyId = (k: CellValue | null): string => JSON.stringify(k);

	for (let mi = 0; mi < perMetric.length; mi++) {
		const buckets = perMetric[mi]!;
		const colId = config.metrics[mi]!.columnId;
		for (const b of buckets) {
			const id = keyId(b.key);
			if (!seen.has(id)) {
				seen.add(id);
				keyOrder.push(b.key);
				values.set(id, new Array(config.metrics.length).fill(null));
			}
			values.get(id)![mi] = b.values[colId] ?? null;
		}
	}

	if (config.type === 'bubble') {
		const [mx, my, mr] = config.metrics;
		return Object.freeze({
			type: 'bubble',
			points: Object.freeze(
				keyOrder.map((key) => {
					const v = values.get(keyId(key))!;
					return Object.freeze({
						key,
						x: v[0] ?? null,
						y: v[1] ?? null,
						r: v[2] ?? null,
					});
				}),
			),
			axisLabels: Object.freeze({
				x: mx ? metricLabel(mx.fn, mx.columnId) : '',
				y: my ? metricLabel(my.fn, my.columnId) : '',
				r: mr ? metricLabel(mr.fn, mr.columnId) : '',
			}),
		});
	}

	const metricLabels = config.metrics.map((m) => metricLabel(m.fn, m.columnId));
	return Object.freeze({
		type: config.type,
		categories: Object.freeze(
			keyOrder.map((key) =>
				Object.freeze({
					key,
					values: Object.freeze([...values.get(keyId(key))!]),
				}),
			),
		),
		metricLabels: Object.freeze(metricLabels),
	});
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	type Row = { dept: string; salary: number; age: number };
	const cols: ColumnDef<Row>[] = [
		{ id: 'dept', accessor: (r) => r.dept },
		{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
		{ id: 'age', accessor: (r) => r.age, type: 'number' },
	];
	const data: Row[] = [
		{ dept: 'eng', salary: 100, age: 25 },
		{ dept: 'eng', salary: 200, age: 30 },
		{ dept: 'sales', salary: 300, age: 35 },
		{ dept: 'sales', salary: 100, age: 40 },
	];

	describe('buildChartData', () => {
		it('bar 1 メトリクス', () => {
			const d = buildChartData(data, cols, {
				type: 'bar',
				groupBy: 'dept',
				metrics: [{ fn: 'sum', columnId: 'salary' }],
			});
			expect(d.type).toBe('bar');
			if (d.type !== 'bubble') {
				expect(d.metricLabels).toEqual(['sum(salary)']);
				expect(d.categories).toHaveLength(2);
				expect(d.categories[0]).toMatchObject({ key: 'eng', values: [300] });
				expect(d.categories[1]).toMatchObject({ key: 'sales', values: [400] });
			}
		});

		it('combo 2 メトリクス', () => {
			const d = buildChartData(data, cols, {
				type: 'combo',
				groupBy: 'dept',
				metrics: [
					{ fn: 'sum', columnId: 'salary' },
					{ fn: 'avg', columnId: 'age' },
				],
			});
			if (d.type !== 'bubble') {
				expect(d.metricLabels).toEqual(['sum(salary)', 'avg(age)']);
				expect(d.categories[0]!.values).toEqual([300, 27.5]);
			}
		});

		it('pie は first metric を使う前提で値を返す', () => {
			const d = buildChartData(data, cols, {
				type: 'pie',
				groupBy: 'dept',
				metrics: [{ fn: 'sum', columnId: 'salary' }],
			});
			if (d.type !== 'bubble') {
				expect(d.categories.map((c) => c.values[0])).toEqual([300, 400]);
			}
		});

		it('bubble は x/y/r を分解', () => {
			const d = buildChartData(data, cols, {
				type: 'bubble',
				groupBy: 'dept',
				metrics: [
					{ fn: 'sum', columnId: 'salary' },
					{ fn: 'avg', columnId: 'age' },
					{ fn: 'count', columnId: 'salary' },
				],
			});
			expect(d.type).toBe('bubble');
			if (d.type === 'bubble') {
				expect(d.points).toHaveLength(2);
				expect(d.points[0]).toMatchObject({ key: 'eng', x: 300, y: 27.5, r: 2 });
				expect(d.axisLabels).toEqual({
					x: 'sum(salary)',
					y: 'avg(age)',
					r: 'count(salary)',
				});
			}
		});
	});
}
