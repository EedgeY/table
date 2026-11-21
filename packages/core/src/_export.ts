import type { CellValue, ColumnDef } from './column.ts';

/** UTF-8 BOM (Byte Order Mark)。Excel が UTF-8 を自動判定するための先頭マーカー。 */
export const BOM = '﻿';

const NEEDS_QUOTE_CSV = /[",\r\n]/;
const NEEDS_QUOTE_TSV = /[\t"\r\n]/;

export function _stringifyCell<TRow>(
	value: CellValue,
	column: ColumnDef<TRow>,
	formatter?: (v: CellValue, c: ColumnDef<TRow>) => string,
): string {
	if (formatter) {
		return formatter(value, column);
	}
	if (value === null || value === undefined) {
		return '';
	}
	return String(value);
}

export function _escapeCell(raw: string, delimiter: ',' | '\t'): string {
	const needsQuote = delimiter === ',' ? NEEDS_QUOTE_CSV : NEEDS_QUOTE_TSV;
	if (!needsQuote.test(raw)) {
		return raw;
	}
	return `"${raw.replaceAll('"', '""')}"`;
}

export function _buildLine(cells: ReadonlyArray<string>, delimiter: ',' | '\t'): string {
	const out: string[] = new Array(cells.length);
	for (let i = 0; i < cells.length; i++) {
		out[i] = _escapeCell(cells[i]!, delimiter);
	}
	return out.join(delimiter);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('_escapeCell (CSV)', () => {
		it('プレーンな文字列はクオートしない', () => {
			expect(_escapeCell('hello', ',')).toBe('hello');
		});
		it('カンマを含む場合はクオート', () => {
			expect(_escapeCell('a,b', ',')).toBe('"a,b"');
		});
		it('改行を含む場合はクオート', () => {
			expect(_escapeCell('a\nb', ',')).toBe('"a\nb"');
		});
		it('ダブルクオートは "" にエスケープしてクオート', () => {
			expect(_escapeCell('a"b', ',')).toBe('"a""b"');
		});
		it('タブはCSVではクオート不要', () => {
			expect(_escapeCell('a\tb', ',')).toBe('a\tb');
		});
	});

	describe('_escapeCell (TSV)', () => {
		it('タブを含む場合はクオート', () => {
			expect(_escapeCell('a\tb', '\t')).toBe('"a\tb"');
		});
		it('カンマはTSVではクオート不要', () => {
			expect(_escapeCell('a,b', '\t')).toBe('a,b');
		});
	});

	describe('_buildLine', () => {
		it('カンマ区切り行を組み立てる', () => {
			expect(_buildLine(['a', 'b', 'c'], ',')).toBe('a,b,c');
		});
		it('タブ区切り行を組み立てる', () => {
			expect(_buildLine(['a', 'b'], '\t')).toBe('a\tb');
		});
	});

	describe('_stringifyCell', () => {
		const col: ColumnDef<unknown> = { id: 'x', accessor: () => null };
		it('null/undefined は空文字', () => {
			expect(_stringifyCell(null, col)).toBe('');
			expect(_stringifyCell(undefined, col)).toBe('');
		});
		it('数値は文字列化', () => {
			expect(_stringifyCell(42, col)).toBe('42');
		});
		it('boolean は文字列化', () => {
			expect(_stringifyCell(true, col)).toBe('true');
		});
		it('formatter が優先される', () => {
			expect(_stringifyCell(1500, col, (v) => `¥${v}`)).toBe('¥1500');
		});
	});
}
