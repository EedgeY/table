import type { ChartCategoryData } from '@tarbo-table/core';
import type { ReactNode } from 'react';
import { CHART_LAYOUT, colorAt, formatCategoryKey, formatNumber } from './_chart-scales.ts';

function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
	return {
		x: cx + r * Math.sin(angle),
		y: cy - r * Math.cos(angle),
	};
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
	const p0 = polar(cx, cy, r, a0);
	const p1 = polar(cx, cy, r, a1);
	const large = a1 - a0 > Math.PI ? 1 : 0;
	return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`;
}

export function renderPie(data: ChartCategoryData): ReactNode {
	const w = CHART_LAYOUT.width;
	const h = CHART_LAYOUT.height - CHART_LAYOUT.legendHeight;
	const cx = w / 2;
	const cy = h / 2;
	const r = Math.min(w, h) / 2 - 30;

	const slices = data.categories
		.map((c) => ({
			key: c.key,
			value:
				c.values[0] !== null && c.values[0] !== undefined && isFinite(c.values[0])
					? c.values[0]
					: 0,
		}))
		.filter((s) => s.value > 0);
	const total = slices.reduce((acc, s) => acc + s.value, 0);

	if (total === 0) {
		return (
			<text x={cx} y={cy} textAnchor="middle" fill="currentColor" opacity={0.6} fontSize={14}>
				データがありません
			</text>
		);
	}

	let acc = 0;
	return (
		<g>
			{slices.map((s, i) => {
				const a0 = (acc / total) * Math.PI * 2;
				acc += s.value;
				const a1 = (acc / total) * Math.PI * 2;
				const mid = (a0 + a1) / 2;
				const lp = polar(cx, cy, r * 0.65, mid);
				const pct = (s.value / total) * 100;
				return (
					<g key={`slice-${formatCategoryKey(s.key)}`}>
						<path d={arcPath(cx, cy, r, a0, a1)} fill={colorAt(i)} stroke="white" strokeWidth={1} />
						{pct >= 5 && (
							<text
								x={lp.x}
								y={lp.y}
								textAnchor="middle"
								dominantBaseline="central"
								fontSize={11}
								fill="white"
								fontWeight={500}
							>
								{formatCategoryKey(s.key)} ({pct.toFixed(0)}%)
							</text>
						)}
					</g>
				);
			})}
			<text x={cx} y={h + 12} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.6}>
				合計: {formatNumber(total)}
			</text>
		</g>
	);
}
