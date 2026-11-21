import type { ColumnDef, TableInstance } from '@tarbo-table/core';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useCallback, type PointerEvent, type ReactNode } from 'react';
import { cn } from './_utils.ts';
import { useTable } from './use-table.ts';

export type ColumnHeaderProps<TRow> = {
	readonly table: TableInstance<TRow>;
	readonly column: ColumnDef<TRow>;
	readonly className?: string;
};

export function ColumnHeader<TRow>(props: ColumnHeaderProps<TRow>): ReactNode {
	const state = useTable(props.table);
	const { table, column, className } = props;
	const sortKey = state.sort.find((k) => k.columnId === column.id);
	const width = table.getColumnWidth(column.id);

	const handleSortClick = (e: { shiftKey: boolean }): void => {
		if (column.sortable === false) return;
		table.toggleSort(column.id, e.shiftKey);
	};

	const startResize = useCallback(
		(e: PointerEvent<HTMLDivElement>) => {
			e.preventDefault();
			const startX = e.clientX;
			const startW = table.getColumnWidth(column.id);
			const move = (ev: globalThis.PointerEvent): void => {
				table.setColumnWidth(column.id, startW + (ev.clientX - startX));
			};
			const up = (): void => {
				window.removeEventListener('pointermove', move);
				window.removeEventListener('pointerup', up);
			};
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
		},
		[table, column.id],
	);

	return (
		<th
			scope="col"
			style={{ width, minWidth: width }}
			className={cn(
				'group relative select-none border-b border-r border-border bg-muted px-2 py-1.5 text-left text-xs font-medium text-muted-foreground',
				className,
			)}
		>
			<button
				type="button"
				onClick={handleSortClick}
				className={cn(
					'flex w-full items-center gap-1 text-left',
					column.sortable === false && 'cursor-default',
				)}
				disabled={column.sortable === false}
			>
				<span className="flex-1 truncate">{column.header ?? column.id}</span>
				{column.type && <span className="text-[10px] font-normal opacity-60">{column.type}</span>}
				{sortKey ? (
					sortKey.dir === 'asc' ? (
						<ArrowUp className="h-3 w-3" />
					) : (
						<ArrowDown className="h-3 w-3" />
					)
				) : (
					<ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" />
				)}
			</button>
			<div
				onPointerDown={startResize}
				className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-accent/40"
				aria-hidden="true"
			/>
		</th>
	);
}
