import type { TableInstance } from '@tarbo-table/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './components/button.tsx';
import { useT } from './i18n.tsx';
import { useTable } from './use-table.ts';

export type StatusBarProps<TRow> = {
	readonly table: TableInstance<TRow>;
	readonly pageSizeOptions?: ReadonlyArray<number>;
};

export function StatusBar<TRow>(props: StatusBarProps<TRow>): ReactNode {
	useTable(props.table);
	const { table } = props;
	const t = useT();
	const pageSizeOptions = props.pageSizeOptions ?? [25, 50, 100, 500];

	const pag = table.getPagination();
	const rowCount = table.getRowCount();
	const state = table.getState();
	const pageSize = state.pagination.pageSize;

	const setPageIndex = (idx: number): void => {
		table.setPagination({ pageIndex: idx });
	};

	const setPageSize = (size: number): void => {
		table.setPagination({ pageSize: size, pageIndex: 0 });
	};

	return (
		<div className="flex items-center justify-between border-t border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					disabled={!pag.canPrev}
					onClick={() => setPageIndex(state.pagination.pageIndex - 1)}
					aria-label="Previous page"
				>
					<ChevronLeft className="h-3.5 w-3.5" />
				</Button>
				<span className="tt-tabular">
					{t('status.page')}{' '}
					<strong className="text-foreground">{state.pagination.pageIndex + 1}</strong>{' '}
					{t('status.of')} {pag.pageCount}
				</span>
				<Button
					variant="ghost"
					size="icon"
					disabled={!pag.canNext}
					onClick={() => setPageIndex(state.pagination.pageIndex + 1)}
					aria-label="Next page"
				>
					<ChevronRight className="h-3.5 w-3.5" />
				</Button>
				<select
					value={Number.isFinite(pageSize) ? String(pageSize) : 'all'}
					onChange={(e) =>
						setPageSize(
							e.target.value === 'all' ? Number.POSITIVE_INFINITY : Number(e.target.value),
						)
					}
					className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
				>
					{pageSizeOptions.map((s) => (
						<option key={s} value={s}>
							{s} {t('status.rowsSuffix')}
						</option>
					))}
					<option value="all">{t('status.allOption')}</option>
				</select>
			</div>
			<div className="tt-tabular">
				{rowCount.visible.toLocaleString()} / {rowCount.total.toLocaleString()}{' '}
				{t('status.records')}
				{state.selection.ids.size > 0 && (
					<span className="ml-3">
						{state.selection.ids.size} {t('status.selected')}
					</span>
				)}
			</div>
		</div>
	);
}
