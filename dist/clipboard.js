//#region src/clipboard.ts
function _stringifyTsvCell(v) {
	if (v === null || v === void 0) return "";
	if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
	const s = String(v);
	if (/[\t\n\r"]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
	return s;
}
function toTsv(rows, columns) {
	const lines = new Array(rows.length);
	for (let r = 0; r < rows.length; r++) {
		const cells = new Array(columns.length);
		for (let c = 0; c < columns.length; c++) cells[c] = _stringifyTsvCell(columns[c].accessor(rows[r]));
		lines[r] = cells.join("	");
	}
	return lines.join("\n");
}
function parseTsv(tsv) {
	const out = [];
	let row = [];
	let cell = "";
	let inQuote = false;
	const n = tsv.length;
	for (let i = 0; i < n; i++) {
		const ch = tsv[i];
		if (inQuote) if (ch === "\"") if (tsv[i + 1] === "\"") {
			cell += "\"";
			i++;
		} else inQuote = false;
		else cell += ch;
		else if (ch === "\"" && cell === "") inQuote = true;
		else if (ch === "	") {
			row.push(cell);
			cell = "";
		} else if (ch === "\n" || ch === "\r") {
			row.push(cell);
			cell = "";
			out.push(row);
			row = [];
			if (ch === "\r" && tsv[i + 1] === "\n") i++;
		} else cell += ch;
	}
	if (cell !== "" || row.length > 0) {
		row.push(cell);
		out.push(row);
	}
	while (out.length > 0) {
		const last = out[out.length - 1];
		if (last.length === 1 && last[0] === "") out.pop();
		else break;
	}
	return out;
}
function _defaultParseCell(raw) {
	if (raw === "") return null;
	if (raw === "TRUE" || raw === "true") return true;
	if (raw === "FALSE" || raw === "false") return false;
	const n = Number(raw);
	if (Number.isFinite(n) && raw.trim() !== "") return n;
	return raw;
}
function buildPasteCellPatches(input) {
	const matrix = parseTsv(input.tsv);
	const patches = [];
	for (let i = 0; i < matrix.length; i++) {
		const ri = input.anchor.rowIndex + i;
		if (ri >= input.rows.length) break;
		const rowId = input.rowIds[ri];
		const tsvRow = matrix[i];
		for (let j = 0; j < tsvRow.length; j++) {
			const ci = input.anchor.columnIndex + j;
			if (ci >= input.columns.length) break;
			const col = input.columns[ci];
			const parser = input.parsers?.[col.id] ?? _defaultParseCell;
			const raw = tsvRow[j];
			patches.push({
				rowId,
				columnId: col.id,
				value: parser(raw)
			});
		}
	}
	return patches;
}
//#endregion
export { buildPasteCellPatches, parseTsv, toTsv };

//# sourceMappingURL=clipboard.js.map