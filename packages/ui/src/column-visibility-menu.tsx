import type { TableInstance } from '@tarbo-table/core';
import { Columns3 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './components/button.tsx';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from './components/dropdown-menu.tsx';
import { useTable } from './use-table.ts';

export type ColumnVisibilityMenuProps<TRow> = {
	readonly table: TableInstance<TRow>;
};

export function ColumnVisibilityMenu<TRow>(props: ColumnVisibilityMenuProps<TRow>): ReactNode {
	const state = useTable(props.table);
	const { table } = props;
	const columns = table.getColumns();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					<Columns3 className="h-3 w-3" />
					Columns
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-[14rem]">
				<DropdownMenuLabel>表示する列</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{columns.map((c) => {
					const visible = state.columnVisibility[c.id] !== false;
					return (
						<DropdownMenuCheckboxItem
							key={c.id}
							checked={visible}
							onCheckedChange={() => table.toggleColumnVisibility(c.id)}
							onSelect={(e) => e.preventDefault()}
						>
							{c.header ?? c.id}
						</DropdownMenuCheckboxItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
