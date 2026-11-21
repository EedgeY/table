import type { CellValue, ColumnDef } from './column.ts';
import { _buildZip, _str, type ZipFile } from './_xlsx-zip.ts';

export type ExportXlsxOptions<TRow> = {
	readonly sheetName?: string;
	readonly columns?: ReadonlyArray<ColumnDef<TRow>>;
	readonly formatCell?: (value: CellValue, column: ColumnDef<TRow>) => CellValue;
};

function _escapeXml(s: string): string {
	return s.replace(/[<>&"']/g, (ch) => {
		switch (ch) {
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '&':
				return '&amp;';
			case '"':
				return '&quot;';
			case "'":
				return '&apos;';
			default:
				return ch;
		}
	});
}

export function _colName(n: number): string {
	let s = '';
	let v = n;
	while (v > 0) {
		v--;
		s = String.fromCharCode(65 + (v % 26)) + s;
		v = Math.floor(v / 26);
	}
	return s;
}

/**
 * 行配列 + 列定義から XLSX Uint8Array を生成。
 * 文字列 sheet 化を抑えるため SharedStrings を構築。
 */
export function exportXlsx<TRow>(
	rows: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
	opts?: ExportXlsxOptions<TRow>,
): Uint8Array {
	const cols = opts?.columns ?? columns;
	const sheetName = (opts?.sheetName ?? 'Sheet1').slice(0, 31).replace(/[\\/?*[\]:]/g, '_');

	const sst: string[] = [];
	const sstIdx = new Map<string, number>();
	const internString = (s: string): number => {
		const idx = sstIdx.get(s);
		if (idx !== undefined) return idx;
		const next = sst.length;
		sst.push(s);
		sstIdx.set(s, next);
		return next;
	};

	const sheetRows: string[] = [];
	const headerCells: string[] = [];
	for (let c = 0; c < cols.length; c++) {
		const ref = `${_colName(c + 1)}1`;
		const idx = internString(cols[c]!.header ?? cols[c]!.id);
		headerCells.push(`<c r="${ref}" t="s"><v>${idx}</v></c>`);
	}
	sheetRows.push(`<row r="1">${headerCells.join('')}</row>`);

	for (let r = 0; r < rows.length; r++) {
		const row = rows[r]!;
		const cells: string[] = [];
		for (let c = 0; c < cols.length; c++) {
			const col = cols[c]!;
			const raw = col.accessor(row);
			const v = opts?.formatCell ? opts.formatCell(raw, col) : raw;
			const ref = `${_colName(c + 1)}${r + 2}`;
			if (v === null || v === undefined || v === '') {
				continue;
			}
			if (typeof v === 'number' && Number.isFinite(v)) {
				cells.push(`<c r="${ref}"><v>${v}</v></c>`);
			} else if (typeof v === 'boolean') {
				cells.push(`<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`);
			} else {
				const idx = internString(String(v));
				cells.push(`<c r="${ref}" t="s"><v>${idx}</v></c>`);
			}
		}
		sheetRows.push(`<row r="${r + 2}">${cells.join('')}</row>`);
	}

	const sheetXml =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
		`<sheetData>${sheetRows.join('')}</sheetData>` +
		'</worksheet>';

	const sstXml =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">` +
		sst.map((s) => `<si><t xml:space="preserve">${_escapeXml(s)}</t></si>`).join('') +
		'</sst>';

	const workbookXml =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
		`<sheets><sheet name="${_escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
		'</workbook>';

	const workbookRels =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
		'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
		'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
		'</Relationships>';

	const rootRels =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
		'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
		'</Relationships>';

	const contentTypes =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
		'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
		'<Default Extension="xml" ContentType="application/xml"/>' +
		'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
		'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
		'<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
		'</Types>';

	const files: ZipFile[] = [
		{ name: '[Content_Types].xml', data: _str(contentTypes) },
		{ name: '_rels/.rels', data: _str(rootRels) },
		{ name: 'xl/_rels/workbook.xml.rels', data: _str(workbookRels) },
		{ name: 'xl/workbook.xml', data: _str(workbookXml) },
		{ name: 'xl/worksheets/sheet1.xml', data: _str(sheetXml) },
		{ name: 'xl/sharedStrings.xml', data: _str(sstXml) },
	];
	return _buildZip(files);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	type Row = { id: number; name: string; ok: boolean };
	const cols: ColumnDef<Row>[] = [
		{ id: 'id', accessor: (r) => r.id, header: 'ID', type: 'number' },
		{ id: 'name', accessor: (r) => r.name, header: '名前' },
		{ id: 'ok', accessor: (r) => r.ok, header: '有効', type: 'boolean' },
	];

	describe('exportXlsx', () => {
		it('XLSX バイナリは ZIP の PK signature で始まる', () => {
			const bytes = exportXlsx([{ id: 1, name: 'a', ok: true }], cols);
			expect(bytes[0]).toBe(0x50);
			expect(bytes[1]).toBe(0x4b);
			expect(bytes[2]).toBe(0x03);
			expect(bytes[3]).toBe(0x04);
		});

		it('空 rows でもヘッダー行のみ書き出す', () => {
			const bytes = exportXlsx([], cols);
			expect(bytes.length).toBeGreaterThan(100);
		});

		it('シート名はサニタイズされる', () => {
			const bytes = exportXlsx([{ id: 1, name: 'a', ok: true }], cols, {
				sheetName: 'invalid/sheet?',
			});
			expect(bytes.length).toBeGreaterThan(100);
		});
	});

	describe('_colName', () => {
		it('A, Z, AA, AZ', () => {
			expect(_colName(1)).toBe('A');
			expect(_colName(26)).toBe('Z');
			expect(_colName(27)).toBe('AA');
			expect(_colName(52)).toBe('AZ');
			expect(_colName(53)).toBe('BA');
		});
	});
}
