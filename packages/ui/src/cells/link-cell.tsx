import type { CellMeta } from '@tarbo-table/core';
import { ExternalLink } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { cn } from '../_utils.ts';

export type LinkCellProps = {
	readonly meta: Extract<CellMeta, { kind: 'link' }>;
	readonly className?: string;
};

function _isExternal(meta: LinkCellProps['meta']): boolean {
	if (meta.external !== undefined) return meta.external;
	return /^https?:\/\//.test(meta.href);
}

export function LinkCell(props: LinkCellProps): ReactNode {
	const { meta, className } = props;
	const external = _isExternal(meta);
	const label = meta.label ?? meta.href;

	const onClick = (e: MouseEvent<HTMLAnchorElement>): void => {
		e.stopPropagation();
	};

	return (
		<a
			href={meta.href}
			onClick={onClick}
			target={external ? '_blank' : undefined}
			rel={external ? 'noopener noreferrer' : undefined}
			className={cn(
				'inline-flex items-center gap-1 truncate text-accent underline-offset-2 hover:underline',
				className,
			)}
		>
			<span className="truncate">{label}</span>
			{external && <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />}
		</a>
	);
}
