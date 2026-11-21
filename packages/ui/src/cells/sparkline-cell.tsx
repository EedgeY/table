import type { CellMeta } from '@tarbo-table/core';
import { useMemo, type ReactNode } from 'react';
import { cn } from '../_utils.ts';

export type SparklineCellProps = {
	readonly meta: Extract<CellMeta, { kind: 'sparkline' }>;
	readonly height?: number;
	readonly className?: string;
};

const VIEW_W = 100;
const VIEW_H = 24;
const PAD_Y = 2;

type Computed = {
	readonly pathPoints: string;
	readonly lastX: number;
	readonly lastY: number;
	readonly baselineY: number | null;
};

function _compute(values: ReadonlyArray<number>, baseline: number | undefined): Computed | null {
	if (values.length === 0) return null;
	let min = Infinity;
	let max = -Infinity;
	for (const v of values) {
		if (v < min) min = v;
		if (v > max) max = v;
	}
	if (baseline !== undefined) {
		if (baseline < min) min = baseline;
		if (baseline > max) max = baseline;
	}
	const range = max - min;
	const usableH = VIEW_H - PAD_Y * 2;
	const norm = (v: number): number =>
		range === 0 ? VIEW_H / 2 : PAD_Y + (1 - (v - min) / range) * usableH;
	const n = values.length;
	const step = n === 1 ? 0 : VIEW_W / (n - 1);
	const pts: string[] = [];
	for (let i = 0; i < n; i++) {
		const x = n === 1 ? VIEW_W / 2 : i * step;
		const y = norm(values[i]!);
		pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
	}
	const lastIdx = n - 1;
	const lastX = n === 1 ? VIEW_W / 2 : lastIdx * step;
	const lastY = norm(values[lastIdx]!);
	const baselineY = baseline === undefined ? null : norm(baseline);
	return { pathPoints: pts.join(' '), lastX, lastY, baselineY };
}

export function SparklineCell(props: SparklineCellProps): ReactNode {
	const { meta, height = 22, className } = props;
	const computed = useMemo(
		() => _compute(meta.values, meta.baseline),
		[meta.values, meta.baseline],
	);

	if (computed === null) return null;

	const color = meta.color ?? 'currentColor';

	return (
		<svg
			viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
			preserveAspectRatio="none"
			width="100%"
			height={height}
			aria-hidden="true"
			className={cn('block align-middle', className)}
			style={{ color }}
		>
			{computed.baselineY !== null && (
				<line
					x1={0}
					x2={VIEW_W}
					y1={computed.baselineY}
					y2={computed.baselineY}
					stroke="currentColor"
					strokeOpacity={0.2}
					strokeDasharray="2 2"
					strokeWidth={0.5}
					vectorEffect="non-scaling-stroke"
				/>
			)}
			<polyline
				points={computed.pathPoints}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.25}
				strokeLinejoin="round"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
			<circle
				cx={computed.lastX}
				cy={computed.lastY}
				r={1.6}
				fill="currentColor"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('SparklineCell._compute', () => {
		it('空配列は null', () => {
			expect(_compute([], undefined)).toBe(null);
		});
		it('単一値は中心に置かれる', () => {
			const c = _compute([5], undefined);
			expect(c).not.toBeNull();
			expect(c!.lastX).toBe(VIEW_W / 2);
		});
		it('単調増加で最終点が最も上 (Y 小)', () => {
			const c = _compute([1, 2, 3, 4], undefined);
			expect(c).not.toBeNull();
			expect(c!.lastY).toBeLessThan(VIEW_H / 2);
		});
		it('単調減少で最終点が最も下 (Y 大)', () => {
			const c = _compute([4, 3, 2, 1], undefined);
			expect(c).not.toBeNull();
			expect(c!.lastY).toBeGreaterThan(VIEW_H / 2);
		});
		it('baseline 指定で baselineY が返る', () => {
			const c = _compute([1, 2, 3], 2);
			expect(c).not.toBeNull();
			expect(c!.baselineY).not.toBeNull();
		});
		it('全値同一は中央線', () => {
			const c = _compute([5, 5, 5], undefined);
			expect(c).not.toBeNull();
			expect(c!.lastY).toBe(VIEW_H / 2);
		});
	});
}
