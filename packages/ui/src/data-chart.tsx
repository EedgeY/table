import type { CellValue, ChartConfig, Predicate, TableInstance } from '@tarbo-table/core';
import { buildChartData, f } from '@tarbo-table/core';
import { useEffect, useReducer, type ReactNode } from 'react';
import { cn } from './_utils.ts';
import { ChartFrame, renderBar } from './_chart-bar.tsx';
import { renderBubble } from './_chart-bubble.tsx';
import { renderCombo } from './_chart-combo.tsx';
import { renderLine } from './_chart-line.tsx';
import { renderPie } from './_chart-pie.tsx';
import { CHART_LAYOUT, colorAt, plotArea } from './_chart-scales.ts';

export type DataChartProps<TRow> = {
	readonly table: TableInstance<TRow>;
	readonly chart: ChartConfig;
	readonly className?: string;
	/**
	 * カテゴリクリック時のコールバック。
	 * 既定では `table.setPredicate` を呼んで `groupBy` 列で絞り込む (filter linking)。
	 * `false` を渡すと連動を完全に無効化。
	 */
	readonly onCategoryClick?:
		| ((category: { readonly key: CellValue; readonly groupBy: string }) => void)
		| false;
};

function Legend(props: { labels: ReadonlyArray<string> }): ReactNode {
	const area = plotArea();
	const y = CHART_LAYOUT.height - 12;
	const totalWidth = area.x1 - area.x0;
	const itemWidth = Math.min(180, totalWidth / Math.max(1, props.labels.length));
	const startX = area.x0;
	return (
		<g>
			{props.labels.map((label, i) => (
				<g key={`leg-${i}`} transform={`translate(${startX + i * itemWidth}, ${y})`}>
					<rect width={12} height={12} fill={colorAt(i)} y={-10} rx={2} />
					<text x={18} y={0} fontSize={11} fill="currentColor" opacity={0.85}>
						{label}
					</text>
				</g>
			))}
		</g>
	);
}

function _defaultLink<TRow>(table: TableInstance<TRow>, groupBy: string, key: CellValue): void {
	if (key === null || key === undefined) return;
	const next: Predicate = f.leaf(groupBy, '=', key);
	table.setPredicate(next);
}

export function DataChart<TRow>(props: DataChartProps<TRow>): ReactNode {
	const { table, chart, className, onCategoryClick } = props;
	const linkEnabled = onCategoryClick !== false;
	const handleCategoryClick = (key: CellValue): void => {
		if (!linkEnabled) return;
		if (typeof onCategoryClick === 'function') {
			onCategoryClick({ key, groupBy: chart.groupBy });
		} else {
			_defaultLink(table, chart.groupBy, key);
		}
	};

	const [, force] = useReducer((x: number) => x + 1, 0);
	useEffect(() => table.subscribe(() => force()), [table]);

	const rows = table.getVisibleRows().map((r) => r.row);
	const data = buildChartData(rows, table.getColumns(), chart);

	let inner: ReactNode;
	let legendLabels: ReadonlyArray<string> = [];
	let clickableKeys: ReadonlyArray<CellValue> = [];
	if (data.type === 'bubble') {
		inner = renderBubble(data);
		legendLabels = [];
		clickableKeys = data.points.map((p) => p.key);
	} else {
		legendLabels = data.metricLabels;
		clickableKeys = data.categories.map((c) => c.key);
		switch (data.type) {
			case 'bar':
				inner = renderBar(data);
				break;
			case 'line':
				inner = renderLine(data);
				break;
			case 'pie':
				inner = renderPie(data);
				legendLabels = data.categories.map((c) => (c.key === null ? '(なし)' : String(c.key)));
				break;
			case 'combo':
				inner = renderCombo(data);
				break;
		}
	}

	return (
		<div
			className={cn(
				'tt-data-chart flex h-full flex-col gap-2 border border-border bg-background p-3',
				className,
			)}
		>
			<div className="text-xs text-muted-foreground">
				{chart.type} chart · by {chart.groupBy}
				{' · '}
				{chart.metrics.map((m) => `${m.fn}(${m.columnId})`).join(', ')}
				{' · '}
				{rows.length} 行
			</div>
			<div className="flex-1 overflow-hidden text-foreground">
				<ChartFrame className="h-full w-full">
					{inner}
					{legendLabels.length > 0 && <Legend labels={legendLabels} />}
					{linkEnabled && clickableKeys.length > 0 && (
						<ClickableOverlay keys={clickableKeys} onClick={(key) => handleCategoryClick(key)} />
					)}
				</ChartFrame>
			</div>
		</div>
	);
}

function ClickableOverlay(props: {
	keys: ReadonlyArray<CellValue>;
	onClick: (key: CellValue) => void;
}): ReactNode {
	const area = plotArea();
	const w = area.x1 - area.x0;
	const h = area.y1 - area.y0;
	const n = props.keys.length;
	const slot = n > 0 ? w / n : 0;
	return (
		<g aria-label="カテゴリクリック">
			{props.keys.map((k, i) => (
				<rect
					key={`hit-${i}-${String(k)}`}
					x={area.x0 + i * slot}
					y={area.y0}
					width={slot}
					height={h}
					fill="transparent"
					className="cursor-pointer hover:fill-accent/10"
					onClick={() => props.onClick(k)}
				/>
			))}
		</g>
	);
}
