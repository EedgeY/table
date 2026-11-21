import type { ChartCategoryData } from '@tarbo-table/core';
import type { ReactNode } from 'react';
import {
	bandScale,
	colorAt,
	CHART_LAYOUT,
	formatCategoryKey,
	formatNumber,
	linearScale,
	niceTicks,
	plotArea,
} from './_chart-scales.ts';

export function renderBar(data: ChartCategoryData): ReactNode {
	const area = plotArea();
	const keys = data.categories.map((c) => c.key);
	const xScale = bandScale(keys, [area.x0, area.x1]);

	const allValues = data.categories.flatMap((c) =>
		c.values.filter((v): v is number => v !== null && isFinite(v)),
	);
	const maxV = allValues.length === 0 ? 1 : Math.max(...allValues);
	const { ticks, max } = niceTicks(maxV);
	const yScale = linearScale([0, max], [area.y1, area.y0]);

	const metricCount = data.metricLabels.length;
	const groupBandwidth = xScale.bandwidth;
	const barWidth = metricCount === 0 ? 0 : groupBandwidth / metricCount;

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
			{data.categories.map((c) => {
				const x0 = xScale(c.key);
				return (
					<g key={`cat-${formatCategoryKey(c.key)}`}>
						{c.values.map((v, mi) => {
							if (v === null || !isFinite(v)) return null;
							const x = x0 + mi * barWidth;
							const y = yScale(v);
							const h = area.y1 - y;
							return (
								<rect
									key={`bar-${mi}`}
									x={x}
									y={y}
									width={Math.max(1, barWidth - 2)}
									height={Math.max(0, h)}
									fill={colorAt(mi)}
								/>
							);
						})}
						<text
							x={x0 + groupBandwidth / 2}
							y={area.y1 + 16}
							textAnchor="middle"
							fontSize={11}
							fill="currentColor"
							opacity={0.8}
						>
							{formatCategoryKey(c.key)}
						</text>
					</g>
				);
			})}
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

export function ChartFrame(props: {
	children: ReactNode;
	layout?: typeof CHART_LAYOUT;
	className?: string;
}): ReactNode {
	const layout = props.layout ?? CHART_LAYOUT;
	return (
		<svg
			viewBox={`0 0 ${layout.width} ${layout.height}`}
			className={props.className}
			preserveAspectRatio="xMidYMid meet"
			role="img"
		>
			{props.children}
		</svg>
	);
}
