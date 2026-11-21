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

export function renderCombo(data: ChartCategoryData): ReactNode {
	const area = plotArea();
	const keys = data.categories.map((c) => c.key);
	const xScale = bandScale(keys, [area.x0, area.x1]);

	const barVals = data.categories
		.map((c) => c.values[0])
		.filter((v): v is number => v !== null && v !== undefined && isFinite(v));
	const lineVals = data.categories
		.map((c) => c.values[1])
		.filter((v): v is number => v !== null && v !== undefined && isFinite(v));

	const barMax = barVals.length === 0 ? 1 : Math.max(...barVals);
	const lineMax = lineVals.length === 0 ? 1 : Math.max(...lineVals);

	const barTicks = niceTicks(barMax);
	const lineTicks = niceTicks(lineMax);
	const yLeft = linearScale([0, barTicks.max], [area.y1, area.y0]);
	const yRight = linearScale([0, lineTicks.max], [area.y1, area.y0]);

	const linePoints: string[] = [];
	const lineDots: ReactNode[] = [];
	for (const c of data.categories) {
		const v = c.values[1];
		if (v === null || v === undefined || !isFinite(v)) continue;
		const x = xScale(c.key) + xScale.bandwidth / 2;
		const y = yRight(v);
		linePoints.push(`${x},${y}`);
		lineDots.push(
			<circle key={`d-${formatCategoryKey(c.key)}`} cx={x} cy={y} r={3.5} fill={colorAt(1)} />,
		);
	}

	const barColor = colorAt(0);
	const lineColor = colorAt(1);

	return (
		<>
			{barTicks.ticks.map((t) => (
				<g key={`lt-${t}`}>
					<line
						x1={area.x0}
						x2={area.x1}
						y1={yLeft(t)}
						y2={yLeft(t)}
						stroke="currentColor"
						strokeOpacity={0.1}
					/>
					<text
						x={area.x0 - 8}
						y={yLeft(t)}
						textAnchor="end"
						dominantBaseline="central"
						fontSize={10}
						fill={barColor}
					>
						{formatNumber(t)}
					</text>
				</g>
			))}
			{lineTicks.ticks.map((t) => (
				<text
					key={`rt-${t}`}
					x={area.x1 + 8}
					y={yRight(t)}
					textAnchor="start"
					dominantBaseline="central"
					fontSize={10}
					fill={lineColor}
				>
					{formatNumber(t)}
				</text>
			))}
			{data.categories.map((c) => {
				const v = c.values[0];
				if (v === null || v === undefined || !isFinite(v)) return null;
				const x = xScale(c.key);
				const y = yLeft(v);
				const h = area.y1 - y;
				return (
					<rect
						key={`bar-${formatCategoryKey(c.key)}`}
						x={x}
						y={y}
						width={Math.max(1, xScale.bandwidth)}
						height={Math.max(0, h)}
						fill={barColor}
						opacity={0.85}
					/>
				);
			})}
			<polyline points={linePoints.join(' ')} fill="none" stroke={lineColor} strokeWidth={2} />
			{lineDots}
			{data.categories.map((c) => (
				<text
					key={`xlbl-${formatCategoryKey(c.key)}`}
					x={xScale(c.key) + xScale.bandwidth / 2}
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
			<line
				x1={area.x0}
				x2={area.x0}
				y1={area.y0}
				y2={area.y1}
				stroke={barColor}
				strokeOpacity={0.4}
			/>
			<line
				x1={area.x1}
				x2={area.x1}
				y1={area.y0}
				y2={area.y1}
				stroke={lineColor}
				strokeOpacity={0.4}
			/>
			<text
				x={area.x0 - 44}
				y={(area.y0 + area.y1) / 2}
				textAnchor="middle"
				fontSize={10}
				fill={barColor}
				transform={`rotate(-90 ${area.x0 - 44} ${(area.y0 + area.y1) / 2})`}
			>
				{data.metricLabels[0] ?? ''}
			</text>
			<text
				x={area.x1 + 44}
				y={(area.y0 + area.y1) / 2}
				textAnchor="middle"
				fontSize={10}
				fill={lineColor}
				transform={`rotate(-90 ${area.x1 + 44} ${(area.y0 + area.y1) / 2})`}
			>
				{data.metricLabels[1] ?? ''}
			</text>
		</>
	);
}
