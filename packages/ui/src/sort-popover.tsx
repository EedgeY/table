import type { SortKey, TableInstance } from '@tarbo-table/core';
import { ArrowDown, ArrowDownUp, ArrowUp, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './components/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './components/popover.tsx';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from './components/dropdown-menu.tsx';
import { useTable } from './use-table.ts';

export type SortPopoverProps<TRow> = {
	readonly table: TableInstance<TRow>;
};

export function SortPopover<TRow>(props: SortPopoverProps<TRow>): ReactNode {
	const { table } = props;
	const state = useTable(table);
	const sortKeys = state.sort;
	const columns = table.getColumns();
	const sortableCols = columns.filter((c) => c.sortable !== false);

	const addKey = (columnId: string): void => {
		const existing = sortKeys.find((k) => k.columnId === columnId);
		if (existing) return;
		const next: SortKey = { columnId, dir: 'asc' };
		table.setSort([...sortKeys, next]);
	};

	const removeKey = (columnId: string): void => {
		table.setSort(sortKeys.filter((k) => k.columnId !== columnId));
	};

	const toggleDir = (columnId: string): void => {
		table.setSort(
			sortKeys.map((k) =>
				k.columnId === columnId ? { ...k, dir: k.dir === 'asc' ? 'desc' : ('asc' as const) } : k,
			),
		);
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm">
					<ArrowDownUp className="h-3 w-3" />
					Sort
					{sortKeys.length > 0 && (
						<span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
							{sortKeys.length}
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-3" align="start">
				{sortKeys.length === 0 ? (
					<p className="mb-2 text-xs text-muted-foreground">
						No sorts applied to this view
						<br />
						Add a column below to sort the view
					</p>
				) : (
					<div className="mb-3 space-y-1.5">
						{sortKeys.map((k) => {
							const col = columns.find((c) => c.id === k.columnId);
							return (
								<div
									key={k.columnId}
									className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs"
								>
									<span className="flex-1 truncate font-medium">{col?.header ?? k.columnId}</span>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => toggleDir(k.columnId)}
										aria-label="toggle direction"
									>
										{k.dir === 'asc' ? (
											<ArrowUp className="h-3 w-3" />
										) : (
											<ArrowDown className="h-3 w-3" />
										)}
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => removeKey(k.columnId)}
										aria-label="remove sort"
									>
										<X className="h-3 w-3" />
									</Button>
								</div>
							);
						})}
					</div>
				)}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" className="w-full justify-start">
							Pick a column to sort by
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						{sortableCols.map((c) => (
							<DropdownMenuItem
								key={c.id}
								onSelect={() => addKey(c.id)}
								disabled={sortKeys.some((k) => k.columnId === c.id)}
							>
								{c.header ?? c.id}
								<span className="ml-auto text-xs text-muted-foreground">{c.type ?? 'text'}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</PopoverContent>
		</Popover>
	);
}
