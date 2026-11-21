import type { CellValue, ColumnDef } from './column.ts';
import { _coerceNumber } from './_utils.ts';

/**
 * - count: null/undefined を除いた非欠損数
 * - countDistinct: ユニークな非 null 値の数
 * - sum/avg/min/max: 数値化できた値のみ対象
 * - median: 中央値
 * - p25 / p75 / p90 / p95 / p99: 線形補間で分位数
 * - stddev / variance: 母分散・母標準偏差
 */
export type AggregateFn =
	| 'count'
	| 'countDistinct'
	| 'sum'
	| 'avg'
	| 'min'
	| 'max'
	| 'median'
	| 'p25'
	| 'p75'
	| 'p90'
	| 'p95'
	| 'p99'
	| 'stddev'
	| 'variance';

const PERCENTILE_FNS: Readonly<Record<string, number>> = Object.freeze({
	median: 0.5,
	p25: 0.25,
	p75: 0.75,
	p90: 0.9,
	p95: 0.95,
	p99: 0.99,
});

function _percentile(sorted: number[], q: number): number {
	const n = sorted.length;
	if (n === 0) return Number.NaN;
	if (n === 1) return sorted[0]!;
	const pos = (n - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	if (lo === hi) return sorted[lo]!;
	const frac = pos - lo;
	return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

export function _aggregateOne<TRow>(
	data: ReadonlyArray<TRow>,
	indices: ArrayLike<number> & Iterable<number>,
	column: ColumnDef<TRow>,
	fn: AggregateFn,
): number | null {
	if (fn === 'count') {
		let n = 0;
		for (const i of indices) {
			const v = column.accessor(data[i]!);
			if (v !== null && v !== undefined) {
				n++;
			}
		}
		return n;
	}

	if (fn === 'countDistinct') {
		const seen = new Set<CellValue>();
		for (const i of indices) {
			const v = column.accessor(data[i]!);
			if (v !== null && v !== undefined) {
				seen.add(v);
			}
		}
		return seen.size;
	}

	if (fn in PERCENTILE_FNS) {
		const values: number[] = [];
		for (const i of indices) {
			const n = _coerceNumber(column.accessor(data[i]!));
			if (n !== null) values.push(n);
		}
		if (values.length === 0) return null;
		values.sort((a, b) => a - b);
		return _percentile(values, PERCENTILE_FNS[fn]!);
	}

	let count = 0;
	let sum = 0;
	let sumSq = 0;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;

	for (const i of indices) {
		const raw = column.accessor(data[i]!);
		const n = _coerceNumber(raw);
		if (n === null) {
			continue;
		}
		count++;
		sum += n;
		sumSq += n * n;
		if (n < min) {
			min = n;
		}
		if (n > max) {
			max = n;
		}
	}

	if (count === 0) {
		return null;
	}

	switch (fn) {
		case 'sum': {
			return sum;
		}
		case 'avg': {
			return sum / count;
		}
		case 'min': {
			return min;
		}
		case 'max': {
			return max;
		}
		case 'variance': {
			const mean = sum / count;
			return sumSq / count - mean * mean;
		}
		case 'stddev': {
			const mean = sum / count;
			const v = sumSq / count - mean * mean;
			return Math.sqrt(Math.max(0, v));
		}
		default: {
			return null;
		}
	}
}

export function _aggregateMany<TRow>(
	data: ReadonlyArray<TRow>,
	indices: Uint32Array,
	columns: ReadonlyArray<ColumnDef<TRow>>,
	specs: Readonly<Record<string, AggregateFn>>,
): Readonly<Record<string, number | null>> {
	const out: Record<string, number | null> = {};
	for (const id of Object.keys(specs)) {
		const fn = specs[id]!;
		const col = columns.find((c) => c.id === id);
		if (!col) {
			out[id] = null;
			continue;
		}
		out[id] = _aggregateOne(data, indices, col, fn);
	}
	return Object.freeze(out);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	type Row = { v: number | null };
	const data: Row[] = [{ v: 1 }, { v: 2 }, { v: null }, { v: 3 }];
	const col: ColumnDef<Row> = { id: 'v', accessor: (r) => r.v as CellValue, type: 'number' };
	const idx = new Uint32Array([0, 1, 2, 3]);

	describe('_aggregateOne', () => {
		it('sum は null を無視', () => {
			expect(_aggregateOne(data, idx, col, 'sum')).toBe(6);
		});
		it('avg は非null件で割る', () => {
			expect(_aggregateOne(data, idx, col, 'avg')).toBeCloseTo(2);
		});
		it('min / max', () => {
			expect(_aggregateOne(data, idx, col, 'min')).toBe(1);
			expect(_aggregateOne(data, idx, col, 'max')).toBe(3);
		});
		it('count は非null件', () => {
			expect(_aggregateOne(data, idx, col, 'count')).toBe(3);
		});
		it('全 null は count 以外で null', () => {
			const allNull: Row[] = [{ v: null }, { v: null }];
			const i2 = new Uint32Array([0, 1]);
			expect(_aggregateOne(allNull, i2, col, 'sum')).toBeNull();
			expect(_aggregateOne(allNull, i2, col, 'count')).toBe(0);
		});

		it('countDistinct はユニークな非 null 値の数', () => {
			const dup: Row[] = [{ v: 1 }, { v: 1 }, { v: 2 }, { v: null }, { v: 2 }, { v: 3 }];
			const idx = new Uint32Array([0, 1, 2, 3, 4, 5]);
			expect(_aggregateOne(dup, idx, col, 'countDistinct')).toBe(3);
		});

		it('median は線形補間 (奇数件)', () => {
			const d: Row[] = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }];
			const idx = new Uint32Array([0, 1, 2, 3, 4]);
			expect(_aggregateOne(d, idx, col, 'median')).toBe(3);
		});

		it('median は線形補間 (偶数件)', () => {
			const d: Row[] = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }];
			const idx = new Uint32Array([0, 1, 2, 3]);
			expect(_aggregateOne(d, idx, col, 'median')).toBe(2.5);
		});

		it('p25 / p75 / p90 / p95 / p99', () => {
			const d: Row[] = Array.from({ length: 100 }, (_, i) => ({ v: i + 1 }));
			const idx = new Uint32Array(d.map((_, i) => i));
			expect(_aggregateOne(d, idx, col, 'p25')).toBeCloseTo(25.75, 1);
			expect(_aggregateOne(d, idx, col, 'p75')).toBeCloseTo(75.25, 1);
			expect(_aggregateOne(d, idx, col, 'p99')).toBeCloseTo(99.01, 1);
		});

		it('stddev / variance', () => {
			const d: Row[] = [
				{ v: 2 },
				{ v: 4 },
				{ v: 4 },
				{ v: 4 },
				{ v: 5 },
				{ v: 5 },
				{ v: 7 },
				{ v: 9 },
			];
			const idx = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7]);
			expect(_aggregateOne(d, idx, col, 'variance')).toBeCloseTo(4, 4);
			expect(_aggregateOne(d, idx, col, 'stddev')).toBeCloseTo(2, 4);
		});

		it('分位数の全 null は null', () => {
			const allNull: Row[] = [{ v: null }, { v: null }];
			const idx = new Uint32Array([0, 1]);
			expect(_aggregateOne(allNull, idx, col, 'median')).toBeNull();
			expect(_aggregateOne(allNull, idx, col, 'p95')).toBeNull();
		});
	});

	describe('_aggregateMany', () => {
		it('複数列を一括集約', () => {
			const cols: ColumnDef<Row>[] = [col];
			const out = _aggregateMany(data, idx, cols, { v: 'sum' });
			expect(out).toEqual({ v: 6 });
		});
		it('存在しない列は null', () => {
			const out = _aggregateMany(data, idx, [col], { missing: 'sum' });
			expect(out).toEqual({ missing: null });
		});
	});
}
