import type { HeaderCell, TableInstance } from '@tarbo-table/core';
import { buildHeaderMatrix } from '@tarbo-table/core';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useCallback, type PointerEvent, type ReactNode } from 'react';
import { cn } from './_utils.ts';
import { useTable } from './use-table.ts';

export type MultiHeaderProps<TRow> = {
	readonly table: TableInstance<TRow>;
};

export function MultiHeader<TRow>(props: MultiHeaderProps<TRow>): ReactNode {
	const state = useTable(props.table);
	const { table } = props;
	const tree = table.getColumnTree();
	const matrix = buildHeaderMatrix(tree);

	const startResize = useCallback(
		(columnId: string) => (e: PointerEvent<HTMLDivElement>) => {
			e.preventDefault();
			const startX = e.clientX;
			const startW = table.getColumnWidth(columnId);
			const move = (ev: globalThis.PointerEvent): void => {
				table.setColumnWidth(columnId, startW + (ev.clientX - startX));
			};
			const up = (): void => {
				window.removeEventListener('pointermove', move);
				window.removeEventListener('pointerup', up);
			};
			window.addEventListener('pointermove', move);
			window.addEventListener('pointerup', up);
		},
		[table],
	);

	const renderLeafCell = (cell: HeaderCell): ReactNode => {
		const colId = cell.columnId!;
		const visible = state.columnVisibility[colId] !== false;
		if (!visible) return null;
		const sortKey = state.sort.find((k) => k.columnId === colId);
		const width = table.getColumnWidth(colId);
		const col = table.getColumns().find((c) => c.id === colId);
		const sortable = col?.sortable !== false;

		return (
			<th
				key={cell.id}
				rowSpan={cell.rowSpan}
				colSpan={cell.colSpan}
				scope="col"
				style={{ width, minWidth: width }}
				className="group relative select-none border-b border-r border-border bg-muted px-2 py-1.5 text-left text-xs font-medium text-muted-foreground"
			>
				<button
					type="button"
					onClick={(e) => sortable && table.toggleSort(colId, e.shiftKey)}
					disabled={!sortable}
					className={cn('flex w-full items-center gap-1 text-left', !sortable && 'cursor-default')}
				>
					<span className="flex-1 truncate">{cell.label}</span>
					{col?.type && <span className="text-[10px] font-normal opacity-60">{col.type}</span>}
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
					onPointerDown={startResize(colId)}
					className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-accent/40"
					aria-hidden="true"
				/>
			</th>
		);
	};

	return (
		<thead className="sticky top-0 z-10 bg-muted">
			{matrix.map((row, ri) => (
				<tr key={`row-${ri}`}>
					{row.map((cell) =>
						cell.isLeaf ? (
							renderLeafCell(cell)
						) : (
							<th
								key={cell.id}
								rowSpan={cell.rowSpan}
								colSpan={cell.colSpan}
								scope="colgroup"
								className="border-b border-r border-border bg-muted px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground"
							>
								{cell.label}
							</th>
						),
					)}
				</tr>
			))}
		</thead>
	);
}
