//#region src/_export.ts
const NEEDS_QUOTE_CSV = /[",\r\n]/;
const NEEDS_QUOTE_TSV = /[\t"\r\n]/;
function _stringifyCell(value, column, formatter) {
	if (formatter) return formatter(value, column);
	if (value === null || value === void 0) return "";
	return String(value);
}
function _escapeCell(raw, delimiter) {
	if (!(delimiter === "," ? NEEDS_QUOTE_CSV : NEEDS_QUOTE_TSV).test(raw)) return raw;
	return `"${raw.replaceAll("\"", "\"\"")}"`;
}
function _buildLine(cells, delimiter) {
	const out = new Array(cells.length);
	for (let i = 0; i < cells.length; i++) out[i] = _escapeCell(cells[i], delimiter);
	return out.join(delimiter);
}
//#endregion
//#region src/export.ts
function exportRows(rows, columns, options) {
	const delimiter = (options?.format ?? "csv") === "csv" ? "," : "	";
	const includeHeader = options?.includeHeader !== false;
	const includeBom = options?.bom !== false;
	const eol = options?.eol ?? "\r\n";
	const cols = options?.columns ?? columns;
	const formatter = options?.formatCell;
	const lines = [];
	if (includeHeader) {
		const headerCells = new Array(cols.length);
		for (let i = 0; i < cols.length; i++) {
			const col = cols[i];
			headerCells[i] = col.header ?? col.id;
		}
		lines.push(_buildLine(headerCells, delimiter));
	}
	for (const row of rows) {
		const cells = new Array(cols.length);
		for (let i = 0; i < cols.length; i++) {
			const col = cols[i];
			cells[i] = _stringifyCell(col.accessor(row), col, formatter);
		}
		lines.push(_buildLine(cells, delimiter));
	}
	const body = lines.join(eol);
	return includeBom ? "﻿" + body : body;
}
//#endregion
export { exportRows as t };

//# sourceMappingURL=export-l8XPbi0G.js.map