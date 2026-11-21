import type { CellValue, ColumnDef } from './column.ts';
import { _buildLine, _stringifyCell, BOM } from './_export.ts';

export type ExportFormat = 'csv' | 'tsv';

export type ExportOptions<TRow> = {
	/** 出力形式。既定 'csv'。 */
	readonly format?: ExportFormat;
	/** ヘッダー行を出すか。既定 true。 */
	readonly includeHeader?: boolean;
	/** UTF-8 BOM を先頭に付けるか。既定 true (Excel 互換)。 */
	readonly bom?: boolean;
	/**
	 * 出力対象列。未指定なら引数 columns をそのまま使う。
	 * UI 層で getVisibleColumns() を渡すと表示列のみ出力できる。
	 */
	readonly columns?: ReadonlyArray<ColumnDef<TRow>>;
	/** セル値のカスタムフォーマッタ (例: 通貨/日付)。 */
	readonly formatCell?: (value: CellValue, column: ColumnDef<TRow>) => string;
	/** 行末文字。既定 '\r\n' (Excel 互換)。 */
	readonly eol?: string;
};

/**
 * 行配列を CSV / TSV 文字列に変換する。
 *
 * - 値内に区切り文字 / 改行 / ダブルクオートが含まれる場合は "..." でクオートし、
 *   内部のダブルクオートは "" にエスケープ (RFC 4180)。
 * - null / undefined は空文字。
 * - UTF-8 BOM 付き出力で、Excel での日本語ファイル読み込みに対応。
 */
export function exportRows<TRow>(
	rows: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
	options?: ExportOptions<TRow>,
): string {
	const format: ExportFormat = options?.format ?? 'csv';
	const delimiter: ',' | '\t' = format === 'csv' ? ',' : '\t';
	const includeHeader = options?.includeHeader !== false;
	const includeBom = options?.bom !== false;
	const eol = options?.eol ?? '\r\n';
	const cols = options?.columns ?? columns;
	const formatter = options?.formatCell;

	const lines: string[] = [];

	if (includeHeader) {
		const headerCells: string[] = new Array(cols.length);
		for (let i = 0; i < cols.length; i++) {
			const col = cols[i]!;
			headerCells[i] = col.header ?? col.id;
		}
		lines.push(_buildLine(headerCells, delimiter));
	}

	for (const row of rows) {
		const cells: string[] = new Array(cols.length);
		for (let i = 0; i < cols.length; i++) {
			const col = cols[i]!;
			const raw = col.accessor(row);
			cells[i] = _stringifyCell(raw, col, formatter);
		}
		lines.push(_buildLine(cells, delimiter));
	}

	const body = lines.join(eol);
	return includeBom ? BOM + body : body;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	type Row = { id: number; name: string; note: string | null };
	const cols: ColumnDef<Row>[] = [
		{ id: 'id', accessor: (r) => r.id, header: 'ID', type: 'number' },
		{ id: 'name', accessor: (r) => r.name, header: '名前' },
		{ id: 'note', accessor: (r) => r.note, header: 'Note' },
	];
	const data: Row[] = [
		{ id: 1, name: '田中', note: 'a,b' },
		{ id: 2, name: '"鈴木"', note: null },
		{ id: 3, name: '山田\n太郎', note: 'タブ\tあり' },
	];

	describe('exportRows', () => {
		it('CSV: BOM 付きヘッダー + 行を出力', () => {
			const out = exportRows(data, cols);
			expect(out.startsWith('﻿')).toBe(true);
			const body = out.slice(1);
			const lines = body.split('\r\n');
			expect(lines[0]).toBe('ID,名前,Note');
			expect(lines[1]).toBe('1,田中,"a,b"');
			expect(lines[2]).toBe('2,"""鈴木""",');
			expect(lines[3]).toBe('3,"山田\n太郎",タブ\tあり');
		});

		it('TSV: タブ区切りでタブ含みセルはクオート', () => {
			const out = exportRows(data, cols, { format: 'tsv', bom: false });
			const lines = out.split('\r\n');
			expect(lines[0]).toBe('ID\t名前\tNote');
			expect(lines[1]).toBe('1\t田中\ta,b');
			expect(lines[3]).toBe('3\t"山田\n太郎"\t"タブ\tあり"');
		});

		it('bom:false で BOM を抑制', () => {
			const out = exportRows([data[0]!], cols, { bom: false });
			expect(out.startsWith('﻿')).toBe(false);
		});

		it('includeHeader:false でヘッダー行を抑制', () => {
			const out = exportRows([data[0]!], cols, { includeHeader: false, bom: false });
			expect(out).toBe('1,田中,"a,b"');
		});

		it('columns オプションで対象列を絞り込み', () => {
			const out = exportRows([data[0]!], cols, {
				columns: [cols[0]!, cols[1]!],
				bom: false,
			});
			expect(out).toBe('ID,名前\r\n1,田中');
		});

		it('formatCell で値を整形', () => {
			const moneyCols: ColumnDef<{ p: number }>[] = [
				{ id: 'p', accessor: (r) => r.p, header: '価格', type: 'number' },
			];
			const out = exportRows([{ p: 1500 }], moneyCols, {
				bom: false,
				formatCell: (v, c) =>
					c.id === 'p' && typeof v === 'number' ? `¥${v.toLocaleString('en-US')}` : String(v ?? ''),
			});
			expect(out).toBe('価格\r\n"¥1,500"');
		});

		it('eol オプションで行末を切替', () => {
			const out = exportRows([data[0]!], cols, { bom: false, eol: '\n' });
			expect(out).toBe('ID,名前,Note\n1,田中,"a,b"');
		});

		it('空配列でもヘッダーは出る', () => {
			const out = exportRows([], cols, { bom: false });
			expect(out).toBe('ID,名前,Note');
		});
	});
}
