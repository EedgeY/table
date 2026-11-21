import type { ChartCategoryData } from '@tarbo-table/core';
import type { ReactNode } from 'react';
import {
	bandScale,
	colorAt,
	formatCategoryKey,
	formatNumber,
	linearScale,
	niceTicks,
	plotArea,
} from './_chart-scales.ts';

export function renderLine(data: ChartCategoryData): ReactNode {
	const area = plotArea();
	const keys = data.categories.map((c) => c.key);
	const xScale = bandScale(keys, [area.x0, area.x1]);
	const cx = (k: (typeof keys)[number]): number => xScale(k) + xScale.bandwidth / 2;

	const allValues = data.categories.flatMap((c) =>
		c.values.filter((v): v is number => v !== null && isFinite(v)),
	);
	const maxV = allValues.length === 0 ? 1 : Math.max(...allValues);
	const { ticks, max } = niceTicks(maxV);
	const yScale = linearScale([0, max], [area.y1, area.y0]);

	return (
		<>
			{ticks.map((t) => (
				<g key={`tick-${t}`}>
					<line
						x1={area.x0}
						x2={area.x1}
						y1={yScale(t)}
						y2={yScale(t)}
						stroke="currentColor"
						strokeOpacity={0.1}
					/>
					<text
						x={area.x0 - 8}
						y={yScale(t)}
						textAnchor="end"
						dominantBaseline="central"
						fontSize={10}
						fill="currentColor"
						opacity={0.6}
					>
						{formatNumber(t)}
					</text>
				</g>
			))}
			{data.metricLabels.map((_label, mi) => {
				const points: string[] = [];
				const circles: ReactNode[] = [];
				for (const c of data.categories) {
					const v = c.values[mi];
					if (v === null || v === undefined || !isFinite(v)) continue;
					const x = cx(c.key);
					const y = yScale(v);
					points.push(`${x},${y}`);
					circles.push(
						<circle
							key={`p-${mi}-${formatCategoryKey(c.key)}`}
							cx={x}
							cy={y}
							r={3}
							fill={colorAt(mi)}
						/>,
					);
				}
				return (
					<g key={`line-${mi}`}>
						<polyline points={points.join(' ')} fill="none" stroke={colorAt(mi)} strokeWidth={2} />
						{circles}
					</g>
				);
			})}
			{data.categories.map((c) => (
				<text
					key={`xlbl-${formatCategoryKey(c.key)}`}
					x={cx(c.key)}
					y={area.y1 + 16}
					textAnchor="middle"
					fontSize={11}
					fill="currentColor"
					opacity={0.8}
				>
					{formatCategoryKey(c.key)}
				</text>
			))}
			<line
				x1={area.x0}
				x2={area.x1}
				y1={area.y1}
				y2={area.y1}
				stroke="currentColor"
				strokeOpacity={0.3}
			/>
		</>
	);
}
