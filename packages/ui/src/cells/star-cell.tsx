import type { CellMeta } from '@tarbo-table/core';
import { type ReactNode, useId } from 'react';
import { cn } from '../_utils.ts';

export type StarCellProps = {
	readonly meta: Extract<CellMeta, { kind: 'star' }>;
	readonly size?: number;
	readonly className?: string;
};

function _Star({ fill, size }: { fill: number; size: number }): ReactNode {
	const clipId = useId();
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			className="inline-block align-middle"
			aria-hidden="true"
		>
			<defs>
				<clipPath id={clipId}>
					<rect x={0} y={0} width={24 * fill} height={24} />
				</clipPath>
			</defs>
			<path
				d="M12 2.5l2.95 6.36 6.99.66-5.28 4.69 1.6 6.87L12 17.6l-6.26 3.48 1.6-6.87L2.06 9.52l6.99-.66z"
				fill="currentColor"
				className="text-border"
			/>
			<path
				d="M12 2.5l2.95 6.36 6.99.66-5.28 4.69 1.6 6.87L12 17.6l-6.26 3.48 1.6-6.87L2.06 9.52l6.99-.66z"
				fill="currentColor"
				className="text-amber-400"
				clipPath={`url(#${clipId})`}
			/>
		</svg>
	);
}

export function StarCell(props: StarCellProps): ReactNode {
	const { meta, size = 14, className } = props;
	const max = meta.max ?? 5;
	const value = Math.max(0, Math.min(max, meta.value));
	return (
		<span
			className={cn('inline-flex items-center gap-0.5', className)}
			aria-label={`${value}/${max}`}
		>
			{Array.from({ length: max }, (_, i) => {
				const frac = Math.max(0, Math.min(1, value - i));
				return <_Star key={i} fill={frac} size={size} />;
			})}
			<span className="ml-1 text-[10px] font-medium tabular-nums text-muted-foreground">
				{value.toFixed(value % 1 === 0 ? 0 : 1)}
			</span>
		</span>
	);
}
