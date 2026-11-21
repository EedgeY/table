import type { CellMeta } from '@tarbo-table/core';
import type { ReactNode } from 'react';
import { cn } from '../_utils.ts';

export type TagsCellProps = {
	readonly meta: Extract<CellMeta, { kind: 'tags' }>;
	readonly className?: string;
};

const _PALETTE: ReadonlyArray<{ readonly bg: string; readonly fg: string }> = [
	{ bg: 'oklch(0.94 0.05 145)', fg: 'oklch(0.32 0.12 145)' },
	{ bg: 'oklch(0.94 0.05 60)', fg: 'oklch(0.36 0.12 60)' },
	{ bg: 'oklch(0.93 0.05 230)', fg: 'oklch(0.34 0.12 230)' },
	{ bg: 'oklch(0.94 0.05 320)', fg: 'oklch(0.36 0.12 320)' },
	{ bg: 'oklch(0.94 0.05 25)', fg: 'oklch(0.40 0.16 25)' },
	{ bg: 'oklch(0.94 0.05 200)', fg: 'oklch(0.34 0.12 200)' },
	{ bg: 'oklch(0.95 0.04 90)', fg: 'oklch(0.38 0.11 90)' },
	{ bg: 'oklch(0.93 0.05 280)', fg: 'oklch(0.34 0.12 280)' },
];

function _hash(label: string): number {
	let h = 2166136261;
	for (let i = 0; i < label.length; i++) {
		h ^= label.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return Math.abs(h);
}

function _resolveColor(color: string | undefined, label: string): { bg: string; fg: string } {
	if (color !== undefined) return { bg: color, fg: 'oklch(0.15 0 0)' };
	return _PALETTE[_hash(label) % _PALETTE.length]!;
}

export function TagsCell(props: TagsCellProps): ReactNode {
	const { meta, className } = props;
	const max = meta.max ?? 4;
	const visible = meta.tags.slice(0, max);
	const extra = meta.tags.length - visible.length;

	return (
		<span className={cn('inline-flex max-w-full items-center gap-1 truncate', className)}>
			{visible.map((t, i) => {
				const c = _resolveColor(t.color, t.label);
				return (
					<span
						key={`${t.label}-${i}`}
						className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
						style={{ background: c.bg, color: c.fg }}
					>
						{t.label}
					</span>
				);
			})}
			{extra > 0 && (
				<span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
					+{extra}
				</span>
			)}
		</span>
	);
}
