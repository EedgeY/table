import type { ChartBubbleData } from '@tarbo-table/core';
import type { ReactNode } from 'react';
import {
	colorAt,
	formatCategoryKey,
	formatNumber,
	linearScale,
	niceTicks,
	plotArea,
} from './_chart-scales.ts';

const MIN_R = 4;
const MAX_R = 36;

export function renderBubble(data: ChartBubbleData): ReactNode {
	const area = plotArea();
	const valid = data.points.filter(
		(p): p is typeof p & { x: number; y: number; r: number } =>
			p.x !== null &&
			p.y !== null &&
			p.r !== null &&
			isFinite(p.x) &&
			isFinite(p.y) &&
			isFinite(p.r),
	);
	if (valid.length === 0) {
		return (
			<text
				x={(area.x0 + area.x1) / 2}
				y={(area.y0 + area.y1) / 2}
				textAnchor="middle"
				fill="currentColor"
				opacity={0.6}
				fontSize={14}
			>
				データがありません
			</text>
		);
	}

	const xs = valid.map((p) => p.x);
	const ys = valid.map((p) => p.y);
	const rs = valid.map((p) => p.r);
	const xMax = Math.max(...xs);
	const yMax = Math.max(...ys);
	const rMax = Math.max(...rs);
	const rMin = Math.min(...rs);

	const xTicks = niceTicks(xMax);
	const yTicks = niceTicks(yMax);
	const xScale = linearScale([0, xTicks.max], [area.x0, area.x1]);
	const yScale = linearScale([0, yTicks.max], [area.y1, area.y0]);
	const rScale = linearScale([rMin, rMax === rMin ? rMax + 1 : rMax], [MIN_R, MAX_R]);

	return (
		<>
			{yTicks.ticks.map((t) => (
				<g key={`yt-${t}`}>
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
			{xTicks.ticks.map((t) => (
				<g key={`xt-${t}`}>
					<line
						x1={xScale(t)}
						x2={xScale(t)}
						y1={area.y0}
						y2={area.y1}
						stroke="currentColor"
						strokeOpacity={0.05}
					/>
					<text
						x={xScale(t)}
						y={area.y1 + 16}
						textAnchor="middle"
						fontSize={10}
						fill="currentColor"
						opacity={0.6}
					>
						{formatNumber(t)}
					</text>
				</g>
			))}
			<text
				x={(area.x0 + area.x1) / 2}
				y={area.y1 + 38}
				textAnchor="middle"
				fontSize={11}
				fill="currentColor"
				opacity={0.7}
			>
				{data.axisLabels.x}
			</text>
			<text
				x={area.x0 - 44}
				y={(area.y0 + area.y1) / 2}
				textAnchor="middle"
				fontSize={11}
				fill="currentColor"
				opacity={0.7}
				transform={`rotate(-90 ${area.x0 - 44} ${(area.y0 + area.y1) / 2})`}
			>
				{data.axisLabels.y}
			</text>
			{valid.map((p, i) => (
				<g key={`b-${formatCategoryKey(p.key)}`}>
					<circle
						cx={xScale(p.x)}
						cy={yScale(p.y)}
						r={rScale(p.r)}
						fill={colorAt(i)}
						fillOpacity={0.6}
						stroke={colorAt(i)}
					/>
					<text
						x={xScale(p.x)}
						y={yScale(p.y)}
						textAnchor="middle"
						dominantBaseline="central"
						fontSize={10}
						fill="currentColor"
					>
						{formatCategoryKey(p.key)}
					</text>
				</g>
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
				stroke="currentColor"
				strokeOpacity={0.3}
			/>
		</>
	);
}
