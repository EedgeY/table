import type { CellMeta } from '@tarbo-table/core';
import type { ReactNode } from 'react';
import { cn } from '../_utils.ts';

export type ProgressCellProps = {
	readonly meta: Extract<CellMeta, { kind: 'progress' }>;
	readonly className?: string;
};

function _autoColor(ratio: number): string {
	if (ratio < 0.4) return 'oklch(0.65 0.18 25)';
	if (ratio < 0.7) return 'oklch(0.78 0.16 75)';
	return 'oklch(0.7 0.18 145)';
}

export function ProgressCell(props: ProgressCellProps): ReactNode {
	const { meta, className } = props;
	const max = meta.max ?? 100;
	const clamped = Math.max(0, Math.min(max, meta.value));
	const ratio = max === 0 ? 0 : clamped / max;
	const bar = meta.color ?? _autoColor(ratio);
	const showLabel = meta.label ?? 'percent';
	const labelText =
		showLabel === 'none'
			? null
			: showLabel === 'value'
				? `${clamped}`
				: `${Math.round(ratio * 100)}%`;

	return (
		<span className={cn('inline-flex w-full items-center gap-2', className)}>
			<span
				className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
				role="progressbar"
				aria-valuenow={clamped}
				aria-valuemin={0}
				aria-valuemax={max}
			>
				<span
					className="absolute inset-y-0 left-0 rounded-full transition-[width]"
					style={{ width: `${ratio * 100}%`, background: bar }}
				/>
			</span>
			{labelText !== null && (
				<span className="w-9 shrink-0 text-right text-[10px] font-medium tabular-nums text-muted-foreground">
					{labelText}
				</span>
			)}
		</span>
	);
}
