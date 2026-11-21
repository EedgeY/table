import type { CellMeta } from '@tarbo-table/core';
import type { ReactNode } from 'react';
import { cn } from '../_utils.ts';
import { useThumbnailUrl } from './_use-thumbnail.ts';

export type UserCellProps = {
	readonly meta: Extract<CellMeta, { kind: 'user' }>;
	readonly className?: string;
};

function _Avatar({ src, name, color }: { src?: string; name: string; color?: string }): ReactNode {
	const hasSrc = src !== undefined && src !== '';
	const thumb = useThumbnailUrl(hasSrc ? src! : '', 22);
	if (hasSrc) {
		return (
			<img
				src={thumb}
				alt=""
				width={22}
				height={22}
				loading="lazy"
				decoding="async"
				className="h-[22px] w-[22px] shrink-0 rounded-full border border-border object-cover"
			/>
		);
	}
	const initials = name
		.split(/\s+/)
		.slice(0, 2)
		.map((s) => s.slice(0, 1).toUpperCase())
		.join('');
	return (
		<span
			className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
			style={{ background: color ?? 'oklch(0.55 0.14 230)' }}
			aria-hidden="true"
		>
			{initials || '?'}
		</span>
	);
}

export function UserCell(props: UserCellProps): ReactNode {
	const { meta, className } = props;
	const hasEmail = meta.email !== undefined && meta.email !== '';
	return (
		<span className={cn('inline-flex max-w-full items-center gap-2 truncate', className)}>
			<_Avatar src={meta.avatar} name={meta.name} color={meta.color} />
			<span className="flex min-w-0 flex-col leading-tight">
				<span className="truncate text-[11px] font-medium">{meta.name}</span>
				{hasEmail && (
					<span className="truncate text-[9px] text-muted-foreground">{meta.email}</span>
				)}
			</span>
		</span>
	);
}
