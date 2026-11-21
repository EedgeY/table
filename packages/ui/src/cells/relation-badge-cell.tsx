import type { CellMeta } from '@tarbo-table/core';
import type { MouseEvent, ReactNode } from 'react';
import { cn } from '../_utils.ts';
import { useThumbnailUrl } from './_use-thumbnail.ts';

type SingleMeta = Extract<CellMeta, { kind: 'relation' }>;
type ManyMeta = Extract<CellMeta, { kind: 'relation-many' }>;

export type RelationBadgeCellProps = {
	readonly meta: SingleMeta | ManyMeta;
	readonly onExpand?: () => void;
	readonly className?: string;
};

function _Avatar({
	src,
	label,
	color,
}: {
	src?: string;
	label: string;
	color?: string;
}): ReactNode {
	const hasSrc = src !== undefined && src !== '';
	const thumb = useThumbnailUrl(hasSrc ? src! : '', 16);
	if (hasSrc) {
		return (
			<img
				src={thumb}
				alt=""
				width={16}
				height={16}
				loading="lazy"
				decoding="async"
				className="inline-block h-4 w-4 shrink-0 rounded-full border border-border object-cover"
			/>
		);
	}
	const initials = label.length > 0 ? label.slice(0, 1).toUpperCase() : '?';
	return (
		<span
			className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-[9px] font-medium"
			style={color !== undefined ? { background: color } : undefined}
		>
			{initials}
		</span>
	);
}

function _Pill({
	label,
	avatar,
	color,
}: {
	label: string;
	avatar?: string;
	color?: string;
}): ReactNode {
	return (
		<span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-xs">
			<_Avatar src={avatar} label={label} color={color} />
			<span className="truncate">{label}</span>
		</span>
	);
}

export function RelationBadgeCell(props: RelationBadgeCellProps): ReactNode {
	const { meta, onExpand, className } = props;

	const onClick = (e: MouseEvent<HTMLSpanElement>): void => {
		if (onExpand === undefined) return;
		e.stopPropagation();
		onExpand();
	};

	if (meta.kind === 'relation') {
		return (
			<span
				className={cn(
					'inline-flex max-w-full items-center',
					onExpand !== undefined && 'cursor-pointer',
					className,
				)}
				onClick={onClick}
			>
				<_Pill label={meta.label} avatar={meta.avatar} color={meta.color} />
			</span>
		);
	}

	const max = meta.max ?? 2;
	const visible = meta.refs.slice(0, max);
	const extra = meta.refs.length - visible.length;
	return (
		<span
			className={cn(
				'inline-flex max-w-full items-center gap-1 truncate',
				onExpand !== undefined && 'cursor-pointer',
				className,
			)}
			onClick={onClick}
		>
			{visible.map((r) => (
				<_Pill
					key={`${r.recordRef.tableId}:${String(r.recordRef.rowId)}`}
					label={r.label}
					avatar={r.avatar}
					color={r.color}
				/>
			))}
			{extra > 0 && (
				<span className="shrink-0 rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground">
					+{extra}
				</span>
			)}
		</span>
	);
}
