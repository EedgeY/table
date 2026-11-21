import type { TableInstance } from '@tarbo-table/core';
import type { GroupingMixin } from '@tarbo-table/core/grouping';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { ColumnVisibilityMenu } from './column-visibility-menu.tsx';
import { Button } from './components/button.tsx';
import { ExportMenu } from './export-menu.tsx';
import { GroupingDropdown } from './grouping-dropdown.tsx';
import { SortPopover } from './sort-popover.tsx';

export type ToolbarProps<TRow> = {
	readonly table: TableInstance<TRow> & Partial<GroupingMixin<TRow>>;
	readonly onRefresh?: () => void;
	readonly onInsert?: () => void;
	readonly extra?: ReactNode;
	readonly showColumnVisibility?: boolean;
	readonly showExport?: boolean;
	readonly showGrouping?: boolean;
	readonly exportFileName?: string;
};

export function Toolbar<TRow>(props: ToolbarProps<TRow>): ReactNode {
	const {
		table,
		onRefresh,
		onInsert,
		extra,
		showColumnVisibility = true,
		showExport = true,
		showGrouping = true,
		exportFileName,
	} = props;

	return (
		<div className="flex items-center gap-2 border-b border-border bg-background px-3 py-1.5">
			<SortPopover table={table} />
			{showColumnVisibility && <ColumnVisibilityMenu table={table} />}
			{showGrouping && <GroupingDropdown table={table} />}
			{showExport && <ExportMenu table={table} fileName={exportFileName} />}
			{extra}
			<div className="flex-1" />
			{onRefresh && (
				<Button variant="outline" size="icon" onClick={onRefresh} aria-label="Refresh">
					<RefreshCw className="h-3.5 w-3.5" />
				</Button>
			)}
			{onInsert && (
				<Button variant="accent" size="sm" onClick={onInsert}>
					Insert
				</Button>
			)}
		</div>
	);
}
