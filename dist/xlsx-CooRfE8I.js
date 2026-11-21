//#region src/_xlsx-zip.ts
const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
		t[i] = c >>> 0;
	}
	return t;
})();
function _crc32(bytes) {
	let crc = 4294967295;
	for (let i = 0; i < bytes.length; i++) crc = crc >>> 8 ^ CRC_TABLE[(crc ^ bytes[i]) & 255];
	return (crc ^ 4294967295) >>> 0;
}
const TEXT_ENCODER = new TextEncoder();
function _str(s) {
	return TEXT_ENCODER.encode(s);
}
function _dosDateTime() {
	const d = /* @__PURE__ */ new Date();
	const time = d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1;
	const date = d.getFullYear() - 1980 << 9 | d.getMonth() + 1 << 5 | d.getDate();
	return {
		time: time & 65535,
		date: date & 65535
	};
}
function _concat(chunks) {
	let n = 0;
	for (const c of chunks) n += c.length;
	const out = new Uint8Array(n);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.length;
	}
	return out;
}
function _u16(view, offset, v) {
	view.setUint16(offset, v, true);
}
function _u32(view, offset, v) {
	view.setUint32(offset, v, true);
}
function _buildZip(files) {
	const { time, date } = _dosDateTime();
	const localChunks = [];
	const entries = [];
	let offset = 0;
	for (const f of files) {
		const nameBytes = _str(f.name);
		const crc = _crc32(f.data);
		const header = new Uint8Array(30 + nameBytes.length);
		const dv = new DataView(header.buffer);
		_u32(dv, 0, 67324752);
		_u16(dv, 4, 20);
		_u16(dv, 6, 0);
		_u16(dv, 8, 0);
		_u16(dv, 10, time);
		_u16(dv, 12, date);
		_u32(dv, 14, crc);
		_u32(dv, 18, f.data.length);
		_u32(dv, 22, f.data.length);
		_u16(dv, 26, nameBytes.length);
		_u16(dv, 28, 0);
		header.set(nameBytes, 30);
		localChunks.push(header, f.data);
		entries.push({
			nameBytes,
			crc,
			size: f.data.length,
			localOffset: offset
		});
		offset += header.length + f.data.length;
	}
	const centralChunks = [];
	let cdSize = 0;
	for (const e of entries) {
		const c = new Uint8Array(46 + e.nameBytes.length);
		const dv = new DataView(c.buffer);
		_u32(dv, 0, 33639248);
		_u16(dv, 4, 20);
		_u16(dv, 6, 20);
		_u16(dv, 8, 0);
		_u16(dv, 10, 0);
		_u16(dv, 12, time);
		_u16(dv, 14, date);
		_u32(dv, 16, e.crc);
		_u32(dv, 20, e.size);
		_u32(dv, 24, e.size);
		_u16(dv, 28, e.nameBytes.length);
		_u16(dv, 30, 0);
		_u16(dv, 32, 0);
		_u16(dv, 34, 0);
		_u16(dv, 36, 0);
		_u32(dv, 38, 0);
		_u32(dv, 42, e.localOffset);
		c.set(e.nameBytes, 46);
		centralChunks.push(c);
		cdSize += c.length;
	}
	const cdOffset = offset;
	const end = new Uint8Array(22);
	const ev = new DataView(end.buffer);
	_u32(ev, 0, 101010256);
	_u16(ev, 4, 0);
	_u16(ev, 6, 0);
	_u16(ev, 8, entries.length);
	_u16(ev, 10, entries.length);
	_u32(ev, 12, cdSize);
	_u32(ev, 16, cdOffset);
	_u16(ev, 20, 0);
	return _concat([
		..._concatChunks(localChunks),
		..._concatChunks(centralChunks),
		end
	]);
}
function _concatChunks(chunks) {
	return chunks.slice();
}
//#endregion
//#region src/xlsx.ts
function _escapeXml(s) {
	return s.replace(/[<>&"']/g, (ch) => {
		switch (ch) {
			case "<": return "&lt;";
			case ">": return "&gt;";
			case "&": return "&amp;";
			case "\"": return "&quot;";
			case "'": return "&apos;";
			default: return ch;
		}
	});
}
function _colName(n) {
	let s = "";
	let v = n;
	while (v > 0) {
		v--;
		s = String.fromCharCode(65 + v % 26) + s;
		v = Math.floor(v / 26);
	}
	return s;
}
function exportXlsx(rows, columns, opts) {
	const cols = opts?.columns ?? columns;
	const sheetName = (opts?.sheetName ?? "Sheet1").slice(0, 31).replace(/[\\/?*[\]:]/g, "_");
	const sst = [];
	const sstIdx = /* @__PURE__ */ new Map();
	const internString = (s) => {
		const idx = sstIdx.get(s);
		if (idx !== void 0) return idx;
		const next = sst.length;
		sst.push(s);
		sstIdx.set(s, next);
		return next;
	};
	const sheetRows = [];
	const headerCells = [];
	for (let c = 0; c < cols.length; c++) {
		const ref = `${_colName(c + 1)}1`;
		const idx = internString(cols[c].header ?? cols[c].id);
		headerCells.push(`<c r="${ref}" t="s"><v>${idx}</v></c>`);
	}
	sheetRows.push(`<row r="1">${headerCells.join("")}</row>`);
	for (let r = 0; r < rows.length; r++) {
		const row = rows[r];
		const cells = [];
		for (let c = 0; c < cols.length; c++) {
			const col = cols[c];
			const raw = col.accessor(row);
			const v = opts?.formatCell ? opts.formatCell(raw, col) : raw;
			const ref = `${_colName(c + 1)}${r + 2}`;
			if (v === null || v === void 0 || v === "") continue;
			if (typeof v === "number" && Number.isFinite(v)) cells.push(`<c r="${ref}"><v>${v}</v></c>`);
			else if (typeof v === "boolean") cells.push(`<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`);
			else {
				const idx = internString(String(v));
				cells.push(`<c r="${ref}" t="s"><v>${idx}</v></c>`);
			}
		}
		sheetRows.push(`<row r="${r + 2}">${cells.join("")}</row>`);
	}
	const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`;
	const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">` + sst.map((s) => `<si><t xml:space="preserve">${_escapeXml(s)}</t></si>`).join("") + "</sst>";
	const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${_escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
	return _buildZip([
		{
			name: "[Content_Types].xml",
			data: _str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/sharedStrings.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml\"/></Types>")
		},
		{
			name: "_rels/.rels",
			data: _str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>")
		},
		{
			name: "xl/_rels/workbook.xml.rels",
			data: _str("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings\" Target=\"sharedStrings.xml\"/></Relationships>")
		},
		{
			name: "xl/workbook.xml",
			data: _str(workbookXml)
		},
		{
			name: "xl/worksheets/sheet1.xml",
			data: _str(sheetXml)
		},
		{
			name: "xl/sharedStrings.xml",
			data: _str(sstXml)
		}
	]);
}
//#endregion
export { exportXlsx as n, _colName as t };

//# sourceMappingURL=xlsx-CooRfE8I.js.map