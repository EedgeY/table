import type { CellValue } from '@tarbo-table/core';

export type LinearScale = {
	(v: number): number;
	readonly domain: readonly [number, number];
	readonly range: readonly [number, number];
};

export type BandScale = {
	(key: CellValue | null): number;
	readonly bandwidth: number;
	readonly step: number;
};

const _keyId = (k: CellValue | null): string => JSON.stringify(k);

export function bandScale(
	keys: ReadonlyArray<CellValue | null>,
	range: readonly [number, number],
	paddingInner = 0.2,
): BandScale {
	const n = keys.length;
	const total = range[1] - range[0];
	const step = n === 0 ? 0 : total / n;
	const bandwidth = step * (1 - paddingInner);
	const idx = new Map<string, number>();
	for (let i = 0; i < keys.length; i++) {
		idx.set(_keyId(keys[i] ?? null), i);
	}
	const fn = ((key: CellValue | null): number => {
		const i = idx.get(_keyId(key));
		if (i === undefined) return range[0];
		return range[0] + i * step + (step - bandwidth) / 2;
	}) as BandScale;
	(fn as { bandwidth: number }).bandwidth = bandwidth;
	(fn as { step: number }).step = step;
	return fn;
}

export function linearScale(
	domain: readonly [number, number],
	range: readonly [number, number],
): LinearScale {
	const [d0, d1] = domain;
	const [r0, r1] = range;
	const span = d1 - d0;
	const fn = ((v: number): number => {
		if (span === 0) return (r0 + r1) / 2;
		const t = (v - d0) / span;
		return r0 + t * (r1 - r0);
	}) as LinearScale;
	(fn as { domain: readonly [number, number] }).domain = domain;
	(fn as { range: readonly [number, number] }).range = range;
	return fn;
}

export function niceTicks(maxValue: number, tickCount = 5): { ticks: number[]; max: number } {
	if (!isFinite(maxValue) || maxValue <= 0) {
		return { ticks: [0], max: 1 };
	}
	const rawStep = maxValue / tickCount;
	const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
	const norm = rawStep / mag;
	let step: number;
	if (norm <= 1) step = 1 * mag;
	else if (norm <= 2) step = 2 * mag;
	else if (norm <= 5) step = 5 * mag;
	else step = 10 * mag;
	const max = Math.ceil(maxValue / step) * step;
	const ticks: number[] = [];
	for (let v = 0; v <= max + step / 2; v += step) {
		ticks.push(Number(v.toFixed(10)));
	}
	return { ticks, max };
}

const _fmt = new Intl.NumberFormat();
export function formatNumber(v: number | null | undefined): string {
	if (v === null || v === undefined) return '';
	return _fmt.format(v);
}

export const PALETTE: readonly string[] = [
	'#3b82f6',
	'#10b981',
	'#f59e0b',
	'#ef4444',
	'#8b5cf6',
	'#06b6d4',
] as const;

export function colorAt(i: number): string {
	return PALETTE[i % PALETTE.length]!;
}

export const CHART_LAYOUT = {
	width: 800,
	height: 400,
	margin: { top: 20, right: 70, bottom: 60, left: 70 },
	legendHeight: 24,
} as const;

export function plotArea(layout: typeof CHART_LAYOUT = CHART_LAYOUT) {
	const w = layout.width - layout.margin.left - layout.margin.right;
	const h = layout.height - layout.margin.top - layout.margin.bottom;
	return {
		x0: layout.margin.left,
		y0: layout.margin.top,
		x1: layout.margin.left + w,
		y1: layout.margin.top + h,
		width: w,
		height: h,
	};
}

export function formatCategoryKey(k: CellValue | null): string {
	if (k === null || k === undefined) return '(なし)';
	return String(k);
}
