import type { TableInstance } from '@tarbo-table/core';
import type { GroupingMixin } from '@tarbo-table/core/grouping';
import { Layers, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from './components/button.tsx';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from './components/dropdown-menu.tsx';

export type GroupingDropdownProps<TRow> = {
	readonly table: TableInstance<TRow> & Partial<GroupingMixin<TRow>>;
};

export function GroupingDropdown<TRow>(props: GroupingDropdownProps<TRow>): ReactNode {
	const { table } = props;
	const [_, force] = useState(0);

	if (typeof table.setGroupBy !== 'function' || typeof table.getGroupBy !== 'function') {
		return null;
	}
	const setGroupBy = table.setGroupBy;
	const groupBy = table.getGroupBy();
	const columns = table.getColumns();

	const add = (id: string): void => {
		if (groupBy.includes(id)) return;
		setGroupBy([...groupBy, id]);
		force((n) => n + 1);
	};
	const remove = (id: string): void => {
		setGroupBy(groupBy.filter((g) => g !== id));
		force((n) => n + 1);
	};

	return (
		<div className="flex items-center gap-1">
			{groupBy.map((id) => {
				const col = columns.find((c) => c.id === id);
				return (
					<span
						key={id}
						className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 pl-2 pr-1 text-xs"
					>
						{col?.header ?? id}
						<Button
							variant="ghost"
							size="icon"
							className="h-5 w-5"
							onClick={() => remove(id)}
							aria-label="Remove group"
						>
							<X className="h-3 w-3" />
						</Button>
					</span>
				);
			})}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm">
						<Layers className="h-3 w-3" />
						Group by
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuLabel>グループ化列</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{columns.map((c) => (
						<DropdownMenuItem
							key={c.id}
							disabled={groupBy.includes(c.id)}
							onSelect={() => add(c.id)}
						>
							{c.header ?? c.id}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
