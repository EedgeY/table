import type { CellValue, ColumnDef } from './column.ts';
import type { AggregateFn } from './_aggregate.ts';
import { _aggregateOne } from './_aggregate.ts';

export type PivotValueSpec = {
	readonly columnId: string;
	readonly fn: AggregateFn;
};

export type PivotConfig = {
	readonly rows: ReadonlyArray<string>;
	readonly cols: ReadonlyArray<string>;
	readonly values: ReadonlyArray<PivotValueSpec>;
};

/** 軸ヘッダーの 1 ノード。階層を path で表す。 */
export type AxisNode = {
	readonly key: CellValue;
	readonly path: ReadonlyArray<CellValue>;
	readonly children: ReadonlyArray<AxisNode>;
	/** この軸ノードの葉ノードに対応する leaf index (matrix の行/列番号)。葉でない場合は -1。 */
	readonly leafIndex: number;
};

export type PivotResult = {
	/** rowAxis の葉数 × (colAxis の葉数 × values.length) の 2 次元配列。null = 該当なし。 */
	readonly matrix: ReadonlyArray<ReadonlyArray<number | null>>;
	readonly rowAxis: ReadonlyArray<AxisNode>;
	readonly colAxis: ReadonlyArray<AxisNode>;
	readonly values: ReadonlyArray<PivotValueSpec>;
};

function _buildAxis<TRow>(
	data: ReadonlyArray<TRow>,
	indices: ReadonlyArray<number>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
	axisColIds: ReadonlyArray<string>,
): { tree: AxisNode[]; leafCount: number; leafBuckets: number[][] } {
	if (axisColIds.length === 0) {
		return {
			tree: [],
			leafCount: 1,
			leafBuckets: [[...indices]],
		};
	}
	const cols = axisColIds.map((id) => columns.find((c) => c.id === id) ?? null);
	for (let i = 0; i < cols.length; i++) {
		if (cols[i] === null) {
			return { tree: [], leafCount: 0, leafBuckets: [] };
		}
	}

	let leafCount = 0;
	const leafBuckets: number[][] = [];

	const build = (idxList: ReadonlyArray<number>, depth: number, path: CellValue[]): AxisNode[] => {
		if (depth >= cols.length) return [];
		const col = cols[depth]!;
		const buckets = new Map<CellValue | null, number[]>();
		for (const i of idxList) {
			const k = col.accessor(data[i]!);
			const norm = k === undefined ? null : k;
			let arr = buckets.get(norm);
			if (!arr) {
				arr = [];
				buckets.set(norm, arr);
			}
			arr.push(i);
		}
		const out: AxisNode[] = [];
		for (const [key, idxArr] of buckets) {
			const nextPath = [...path, key as CellValue];
			if (depth === cols.length - 1) {
				const leafIdx = leafCount++;
				leafBuckets.push(idxArr);
				out.push(
					Object.freeze({
						key: key as CellValue,
						path: Object.freeze(nextPath),
						children: Object.freeze([]),
						leafIndex: leafIdx,
					}),
				);
			} else {
				out.push(
					Object.freeze({
						key: key as CellValue,
						path: Object.freeze(nextPath),
						children: Object.freeze(build(idxArr, depth + 1, nextPath)),
						leafIndex: -1,
					}),
				);
			}
		}
		return out;
	};

	const tree = build(idxList(indices), 0, []);
	return { tree, leafCount, leafBuckets };
}

function idxList(indices: ReadonlyArray<number>): number[] {
	return Array.isArray(indices) ? (indices as number[]) : Array.from(indices);
}

/**
 * 純関数: 行配列 + 列定義 + PivotConfig からピボット結果を計算。
 * 既存の `_aggregateOne` を 1 セルごとに呼ぶ。
 */
export function pivot<TRow>(
	rows: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
	indices: ReadonlyArray<number>,
	config: PivotConfig,
): PivotResult {
	const valueCols = config.values.map((v) => ({
		spec: v,
		col: columns.find((c) => c.id === v.columnId) ?? null,
	}));

	const rowAxis = _buildAxis(rows, indices, columns, config.rows);
	const colAxis = _buildAxis(rows, indices, columns, config.cols);
	const valueWidth = config.values.length;
	const matrix: (number | null)[][] = new Array(Math.max(1, rowAxis.leafCount));
	for (let r = 0; r < matrix.length; r++) {
		const row = new Array<number | null>(Math.max(1, colAxis.leafCount) * valueWidth).fill(null);
		matrix[r] = row;
	}

	for (let r = 0; r < Math.max(1, rowAxis.leafCount); r++) {
		const rowIndices = rowAxis.leafBuckets[r] ?? [];
		for (let c = 0; c < Math.max(1, colAxis.leafCount); c++) {
			const colIndices = colAxis.leafBuckets[c] ?? [];
			const rowSet = new Set(rowIndices);
			const cellIndices: number[] = [];
			for (const i of colIndices) {
				if (rowSet.has(i)) cellIndices.push(i);
			}
			for (let v = 0; v < valueWidth; v++) {
				const { spec, col } = valueCols[v]!;
				if (col === null || cellIndices.length === 0) {
					matrix[r]![c * valueWidth + v] = null;
				} else {
					matrix[r]![c * valueWidth + v] = _aggregateOne(rows, cellIndices, col, spec.fn);
				}
			}
		}
	}

	return Object.freeze({
		matrix: Object.freeze(matrix.map((r) => Object.freeze(r))),
		rowAxis: Object.freeze(rowAxis.tree),
		colAxis: Object.freeze(colAxis.tree),
		values: Object.freeze([...config.values]),
	});
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	type Sale = { country: string; city: string; product: string; amount: number };
	const cols: ColumnDef<Sale>[] = [
		{ id: 'country', accessor: (r) => r.country },
		{ id: 'city', accessor: (r) => r.city },
		{ id: 'product', accessor: (r) => r.product },
		{ id: 'amount', accessor: (r) => r.amount, type: 'number' },
	];

	const data: Sale[] = [
		{ country: 'JP', city: 'Tokyo', product: 'A', amount: 100 },
		{ country: 'JP', city: 'Tokyo', product: 'B', amount: 200 },
		{ country: 'JP', city: 'Osaka', product: 'A', amount: 150 },
		{ country: 'US', city: 'NY', product: 'A', amount: 300 },
		{ country: 'US', city: 'NY', product: 'B', amount: 250 },
	];

	const allIdx = data.map((_, i) => i);

	describe('pivot', () => {
		it('rows のみ (集計合計)', () => {
			const r = pivot(data, cols, allIdx, {
				rows: ['country'],
				cols: [],
				values: [{ columnId: 'amount', fn: 'sum' }],
			});
			expect(r.rowAxis.map((n) => n.key)).toEqual(['JP', 'US']);
			expect(r.matrix.map((row) => row[0])).toEqual([450, 550]);
		});

		it('rows × cols', () => {
			const r = pivot(data, cols, allIdx, {
				rows: ['country'],
				cols: ['product'],
				values: [{ columnId: 'amount', fn: 'sum' }],
			});
			const rowKeys = r.rowAxis.map((n) => n.key);
			const colKeys = r.colAxis.map((n) => n.key);
			expect(rowKeys).toEqual(['JP', 'US']);
			expect(colKeys).toEqual(['A', 'B']);
			expect(r.matrix[0]).toEqual([250, 200]);
			expect(r.matrix[1]).toEqual([300, 250]);
		});

		it('複数 values (sum + count)', () => {
			const r = pivot(data, cols, allIdx, {
				rows: ['country'],
				cols: [],
				values: [
					{ columnId: 'amount', fn: 'sum' },
					{ columnId: 'amount', fn: 'count' },
				],
			});
			expect(r.matrix[0]).toEqual([450, 3]);
			expect(r.matrix[1]).toEqual([550, 2]);
		});

		it('多段 rows (country > city)', () => {
			const r = pivot(data, cols, allIdx, {
				rows: ['country', 'city'],
				cols: [],
				values: [{ columnId: 'amount', fn: 'sum' }],
			});
			expect(r.matrix.length).toBe(3);
			expect(r.matrix.map((row) => row[0])).toEqual([300, 150, 550]);
		});

		it('該当データなしのセルは null', () => {
			const sparse = data.filter((d) => !(d.country === 'JP' && d.product === 'B'));
			const r2 = pivot(
				sparse,
				cols,
				sparse.map((_, i) => i),
				{
					rows: ['country'],
					cols: ['product'],
					values: [{ columnId: 'amount', fn: 'sum' }],
				},
			);
			const jp = r2.rowAxis.findIndex((n) => n.key === 'JP');
			const bIdx = r2.colAxis.findIndex((n) => n.key === 'B');
			expect(r2.matrix[jp]![bIdx]).toBe(null);
		});

		it('rows / cols 両方なしは 1x1', () => {
			const r = pivot(data, cols, allIdx, {
				rows: [],
				cols: [],
				values: [{ columnId: 'amount', fn: 'sum' }],
			});
			expect(r.matrix).toEqual([[1000]]);
		});

		it('未知の axis 列は空ピボット', () => {
			const r = pivot(data, cols, allIdx, {
				rows: ['unknown'],
				cols: [],
				values: [{ columnId: 'amount', fn: 'sum' }],
			});
			expect(r.rowAxis).toHaveLength(0);
		});

		it('多段 cols (country > product)', () => {
			const r = pivot(data, cols, allIdx, {
				rows: ['city'],
				cols: ['country', 'product'],
				values: [{ columnId: 'amount', fn: 'sum' }],
			});
			expect(r.colAxis).toHaveLength(2);
			expect(r.colAxis[0]?.children.map((c) => c.key)).toEqual(['A', 'B']);
			expect(r.colAxis[1]?.children.map((c) => c.key)).toEqual(['A', 'B']);
		});

		it('median 集計でも動く', () => {
			const r = pivot(data, cols, allIdx, {
				rows: ['country'],
				cols: [],
				values: [{ columnId: 'amount', fn: 'median' }],
			});
			expect(r.matrix[0]![0]).toBe(150);
			expect(r.matrix[1]![0]).toBe(275);
		});
	});
}
