import type { CellValue, ColumnDef } from './column.ts';
import type { CellPatch } from './data-source.ts';
import type { RowId } from './_types.ts';

function _stringifyTsvCell(v: unknown): string {
	if (v === null || v === undefined) return '';
	if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
	const s = String(v);
	if (/[\t\n\r"]/.test(s)) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

/** 行 × 列の 2 次元配列を TSV 文字列に変換。 */
export function toTsv<TRow>(
	rows: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
): string {
	const lines: string[] = new Array(rows.length);
	for (let r = 0; r < rows.length; r++) {
		const cells: string[] = new Array(columns.length);
		for (let c = 0; c < columns.length; c++) {
			cells[c] = _stringifyTsvCell(columns[c]!.accessor(rows[r]!));
		}
		lines[r] = cells.join('\t');
	}
	return lines.join('\n');
}

/**
 * TSV 文字列を 2 次元 string 配列にパース。
 * - 行末は \r\n / \n / \r いずれも許容
 * - "..." でクオートされたセルは Excel スタイルの "" エスケープを解除
 * - 末尾の空行は無視
 */
export function parseTsv(tsv: string): string[][] {
	const out: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let inQuote = false;
	const n = tsv.length;
	for (let i = 0; i < n; i++) {
		const ch = tsv[i]!;
		if (inQuote) {
			if (ch === '"') {
				if (tsv[i + 1] === '"') {
					cell += '"';
					i++;
				} else {
					inQuote = false;
				}
			} else {
				cell += ch;
			}
		} else {
			if (ch === '"' && cell === '') {
				inQuote = true;
			} else if (ch === '\t') {
				row.push(cell);
				cell = '';
			} else if (ch === '\n' || ch === '\r') {
				row.push(cell);
				cell = '';
				out.push(row);
				row = [];
				if (ch === '\r' && tsv[i + 1] === '\n') i++;
			} else {
				cell += ch;
			}
		}
	}
	if (cell !== '' || row.length > 0) {
		row.push(cell);
		out.push(row);
	}
	while (out.length > 0) {
		const last = out[out.length - 1]!;
		if (last.length === 1 && last[0] === '') out.pop();
		else break;
	}
	return out;
}

/**
 * 矩形ペーストの入力。
 *
 * - tsv: クリップボードから受け取った文字列
 * - anchor: ペースト先の起点 ({ rowIndex, columnIndex } = 表示順での位置)
 * - rows: ペースト対象行 (table.getPagedRows() の row のみ)
 * - rowIds: 各 rows に対応する RowId
 * - columns: ペースト対象列 (table.getVisibleColumns())
 * - parsers: 列ごとの string → 値の変換 (未指定なら数値判定して落とす)
 */
export type BuildPastePatchesInput<TRow> = {
	readonly tsv: string;
	readonly anchor: { readonly rowIndex: number; readonly columnIndex: number };
	readonly rows: ReadonlyArray<TRow>;
	readonly rowIds: ReadonlyArray<RowId>;
	readonly columns: ReadonlyArray<ColumnDef<TRow>>;
	readonly parsers?: Readonly<Record<string, (raw: string) => CellValue | unknown>>;
};

function _defaultParseCell(raw: string): CellValue {
	if (raw === '') return null;
	if (raw === 'TRUE' || raw === 'true') return true;
	if (raw === 'FALSE' || raw === 'false') return false;
	const n = Number(raw);
	if (Number.isFinite(n) && raw.trim() !== '') return n;
	return raw;
}

/**
 * TSV から CellPatch[] を構築。範囲外 (anchor + i がテーブル末尾を超える) は切り捨て。
 * 編集不可な列 (parsers でも `edit` メタでも判定不能なため) はそのまま patch を作る。
 * 呼び出し側で `withEdit` を通せば自動で edit メタを尊重 (editable=false なら commit 失敗で
 * rollback される)。
 */
export function buildPasteCellPatches<TRow>(input: BuildPastePatchesInput<TRow>): CellPatch[] {
	const matrix = parseTsv(input.tsv);
	const patches: CellPatch[] = [];
	for (let i = 0; i < matrix.length; i++) {
		const ri = input.anchor.rowIndex + i;
		if (ri >= input.rows.length) break;
		const rowId = input.rowIds[ri]!;
		const tsvRow = matrix[i]!;
		for (let j = 0; j < tsvRow.length; j++) {
			const ci = input.anchor.columnIndex + j;
			if (ci >= input.columns.length) break;
			const col = input.columns[ci]!;
			const parser = input.parsers?.[col.id] ?? _defaultParseCell;
			const raw = tsvRow[j]!;
			patches.push({ rowId, columnId: col.id, value: parser(raw) });
		}
	}
	return patches;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	type Row = { id: number; name: string; n: number };
	const cols: ColumnDef<Row>[] = [
		{ id: 'id', accessor: (r) => r.id, type: 'number' },
		{ id: 'name', accessor: (r) => r.name },
		{ id: 'n', accessor: (r) => r.n, type: 'number' },
	];

	describe('toTsv', () => {
		it('行 × 列を TSV に変換', () => {
			const rows: Row[] = [
				{ id: 1, name: 'a', n: 10 },
				{ id: 2, name: 'b', n: 20 },
			];
			expect(toTsv(rows, cols)).toBe('1\ta\t10\n2\tb\t20');
		});

		it('改行/タブ/ダブルクオートを含むセルはクオート', () => {
			const rows: Row[] = [{ id: 1, name: 'a\tb', n: 0 }];
			expect(toTsv(rows, [cols[1]!])).toBe('"a\tb"');
			const rows2: Row[] = [{ id: 1, name: 'say "hi"', n: 0 }];
			expect(toTsv(rows2, [cols[1]!])).toBe('"say ""hi"""');
		});

		it('null は空文字、boolean は TRUE/FALSE', () => {
			const c: ColumnDef<{ x: unknown }>[] = [{ id: 'x', accessor: (r) => r.x as CellValue }];
			expect(toTsv([{ x: null }], c)).toBe('');
			expect(toTsv([{ x: true }, { x: false }], c)).toBe('TRUE\nFALSE');
		});
	});

	describe('parseTsv', () => {
		it('基本的な TSV', () => {
			expect(parseTsv('1\ta\t10\n2\tb\t20')).toEqual([
				['1', 'a', '10'],
				['2', 'b', '20'],
			]);
		});

		it('クオート内のタブ・改行・"" エスケープ', () => {
			expect(parseTsv('"a\tb"\n"say ""hi"""')).toEqual([['a\tb'], ['say "hi"']]);
		});

		it('\\r\\n と \\n どちらの行末も許容', () => {
			expect(parseTsv('a\tb\r\nc\td')).toEqual([
				['a', 'b'],
				['c', 'd'],
			]);
		});

		it('末尾の空行は無視', () => {
			expect(parseTsv('a\tb\n')).toEqual([['a', 'b']]);
		});

		it('空入力は空配列', () => {
			expect(parseTsv('')).toEqual([]);
		});
	});

	describe('buildPasteCellPatches', () => {
		const rows: Row[] = [
			{ id: 1, name: 'a', n: 1 },
			{ id: 2, name: 'b', n: 2 },
			{ id: 3, name: 'c', n: 3 },
		];
		const rowIds = ['r1', 'r2', 'r3'] as RowId[];

		it('単一セル', () => {
			const patches = buildPasteCellPatches({
				tsv: 'X',
				anchor: { rowIndex: 1, columnIndex: 1 },
				rows,
				rowIds,
				columns: cols,
			});
			expect(patches).toEqual([{ rowId: 'r2', columnId: 'name', value: 'X' }]);
		});

		it('2x2 矩形', () => {
			const patches = buildPasteCellPatches({
				tsv: 'A\t10\nB\t20',
				anchor: { rowIndex: 0, columnIndex: 1 },
				rows,
				rowIds,
				columns: cols,
			});
			expect(patches).toHaveLength(4);
			expect(patches[0]).toEqual({ rowId: 'r1', columnId: 'name', value: 'A' });
			expect(patches[1]).toEqual({ rowId: 'r1', columnId: 'n', value: 10 });
			expect(patches[2]).toEqual({ rowId: 'r2', columnId: 'name', value: 'B' });
			expect(patches[3]).toEqual({ rowId: 'r2', columnId: 'n', value: 20 });
		});

		it('テーブル末尾を超える行は切り捨て', () => {
			const patches = buildPasteCellPatches({
				tsv: 'X\nY\nZ\nW',
				anchor: { rowIndex: 1, columnIndex: 1 },
				rows,
				rowIds,
				columns: cols,
			});
			expect(patches).toHaveLength(2);
		});

		it('カスタム parser が優先される', () => {
			const patches = buildPasteCellPatches({
				tsv: 'hello',
				anchor: { rowIndex: 0, columnIndex: 0 },
				rows,
				rowIds,
				columns: cols,
				parsers: { id: () => 999 },
			});
			expect(patches[0]).toEqual({ rowId: 'r1', columnId: 'id', value: 999 });
		});

		it('TRUE/FALSE は boolean に変換', () => {
			const patches = buildPasteCellPatches({
				tsv: 'TRUE',
				anchor: { rowIndex: 0, columnIndex: 1 },
				rows,
				rowIds,
				columns: cols,
			});
			expect(patches[0]?.value).toBe(true);
		});

		it('空セルは null', () => {
			const patches = buildPasteCellPatches({
				tsv: '\tX',
				anchor: { rowIndex: 0, columnIndex: 1 },
				rows,
				rowIds,
				columns: cols,
			});
			expect(patches[0]?.value).toBe(null);
			expect(patches[1]?.value).toBe('X');
		});
	});

	describe('toTsv → parseTsv round-trip', () => {
		it('内容を失わない', () => {
			const rows: Row[] = [
				{ id: 1, name: 'with tab\there', n: 10 },
				{ id: 2, name: 'with "quotes"', n: 20 },
				{ id: 3, name: 'multi\nline', n: 30 },
			];
			const tsv = toTsv(rows, cols);
			const parsed = parseTsv(tsv);
			expect(parsed).toHaveLength(3);
			expect(parsed[0]).toEqual(['1', 'with tab\there', '10']);
			expect(parsed[1]).toEqual(['2', 'with "quotes"', '20']);
			expect(parsed[2]).toEqual(['3', 'multi\nline', '30']);
		});
	});
}
