import type { TableInstance } from '@tarbo-table/core';
import { exportRows } from '@tarbo-table/core';
import { exportXlsx } from '@tarbo-table/core/xlsx';
import { Download } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './components/button.tsx';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from './components/dropdown-menu.tsx';

export type ExportMenuProps<TRow> = {
	readonly table: TableInstance<TRow>;
	/** 出力対象スコープ。'visible' (フィルタ後全行) / 'page' (現ページのみ)。既定 'visible'。 */
	readonly scope?: 'visible' | 'page';
	/** ファイル名のベース。拡張子なし。既定 'table'。 */
	readonly fileName?: string;
};

function _download(content: string | Uint8Array, fileName: string, mime: string): void {
	const blob =
		typeof content === 'string'
			? new Blob([content], { type: `${mime};charset=utf-8` })
			: new Blob([content as BlobPart], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export function ExportMenu<TRow>(props: ExportMenuProps<TRow>): ReactNode {
	const { table, scope = 'visible', fileName = 'table' } = props;

	const handle = (format: 'csv' | 'tsv' | 'xlsx') => () => {
		const rows = (scope === 'page' ? table.getPagedRows() : table.getVisibleRows()).map(
			(r) => r.row,
		);
		const cols = table.getVisibleColumns();
		if (format === 'xlsx') {
			const bytes = exportXlsx(rows, cols);
			_download(
				bytes,
				`${fileName}.xlsx`,
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			);
			return;
		}
		const content = exportRows(rows, cols, { format, bom: true });
		const mime = format === 'csv' ? 'text/csv' : 'text/tab-separated-values';
		_download(content, `${fileName}.${format}`, mime);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					<Download className="h-3 w-3" />
					Export
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				<DropdownMenuLabel>形式を選択 (UTF-8 BOM)</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={handle('csv')}>CSV (.csv)</DropdownMenuItem>
				<DropdownMenuItem onSelect={handle('tsv')}>TSV (.tsv)</DropdownMenuItem>
				<DropdownMenuItem onSelect={handle('xlsx')}>Excel (.xlsx)</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
