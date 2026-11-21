const CRC_TABLE: Uint32Array = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		t[i] = c >>> 0;
	}
	return t;
})();

export function _crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]!) & 0xff]!;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

export type ZipFile = {
	readonly name: string;
	readonly data: Uint8Array;
};

const TEXT_ENCODER = new TextEncoder();

export function _str(s: string): Uint8Array {
	return TEXT_ENCODER.encode(s);
}

function _dosDateTime(): { time: number; date: number } {
	const d = new Date();
	const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
	const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
	return { time: time & 0xffff, date: date & 0xffff };
}

function _concat(chunks: ReadonlyArray<Uint8Array>): Uint8Array {
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

function _u16(view: DataView, offset: number, v: number): void {
	view.setUint16(offset, v, true);
}
function _u32(view: DataView, offset: number, v: number): void {
	view.setUint32(offset, v, true);
}

export function _buildZip(files: ReadonlyArray<ZipFile>): Uint8Array {
	const { time, date } = _dosDateTime();
	const localChunks: Uint8Array[] = [];
	type Entry = {
		nameBytes: Uint8Array;
		crc: number;
		size: number;
		localOffset: number;
	};
	const entries: Entry[] = [];
	let offset = 0;
	for (const f of files) {
		const nameBytes = _str(f.name);
		const crc = _crc32(f.data);
		// Local File Header (30 bytes) + name + data
		const header = new Uint8Array(30 + nameBytes.length);
		const dv = new DataView(header.buffer);
		_u32(dv, 0, 0x04034b50);
		_u16(dv, 4, 20); // version needed
		_u16(dv, 6, 0); // gp flag
		_u16(dv, 8, 0); // method = store
		_u16(dv, 10, time);
		_u16(dv, 12, date);
		_u32(dv, 14, crc);
		_u32(dv, 18, f.data.length);
		_u32(dv, 22, f.data.length);
		_u16(dv, 26, nameBytes.length);
		_u16(dv, 28, 0);
		header.set(nameBytes, 30);
		localChunks.push(header, f.data);
		entries.push({ nameBytes, crc, size: f.data.length, localOffset: offset });
		offset += header.length + f.data.length;
	}
	const centralChunks: Uint8Array[] = [];
	let cdSize = 0;
	for (const e of entries) {
		// Central Directory Header (46 bytes) + name
		const c = new Uint8Array(46 + e.nameBytes.length);
		const dv = new DataView(c.buffer);
		_u32(dv, 0, 0x02014b50);
		_u16(dv, 4, 20); // version made by
		_u16(dv, 6, 20); // version needed
		_u16(dv, 8, 0);
		_u16(dv, 10, 0);
		_u16(dv, 12, time);
		_u16(dv, 14, date);
		_u32(dv, 16, e.crc);
		_u32(dv, 20, e.size);
		_u32(dv, 24, e.size);
		_u16(dv, 28, e.nameBytes.length);
		_u16(dv, 30, 0); // extra
		_u16(dv, 32, 0); // comment
		_u16(dv, 34, 0); // disk
		_u16(dv, 36, 0); // internal attrs
		_u32(dv, 38, 0); // external attrs
		_u32(dv, 42, e.localOffset);
		c.set(e.nameBytes, 46);
		centralChunks.push(c);
		cdSize += c.length;
	}
	const cdOffset = offset;
	// End of Central Directory (22 bytes)
	const end = new Uint8Array(22);
	const ev = new DataView(end.buffer);
	_u32(ev, 0, 0x06054b50);
	_u16(ev, 4, 0); // disk
	_u16(ev, 6, 0); // start disk
	_u16(ev, 8, entries.length);
	_u16(ev, 10, entries.length);
	_u32(ev, 12, cdSize);
	_u32(ev, 16, cdOffset);
	_u16(ev, 20, 0); // comment len
	return _concat([..._concatChunks(localChunks), ..._concatChunks(centralChunks), end]);
}

function _concatChunks(chunks: ReadonlyArray<Uint8Array>): Uint8Array[] {
	return chunks.slice();
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('_crc32', () => {
		it('既知の値', () => {
			expect(_crc32(new TextEncoder().encode('hello')).toString(16)).toBe('3610a686');
		});

		it('空入力は 0', () => {
			expect(_crc32(new Uint8Array(0))).toBe(0);
		});
	});

	describe('_buildZip', () => {
		it('1 ファイル: PK signature と中央ディレクトリが正しい', () => {
			const data = _str('hello');
			const zip = _buildZip([{ name: 'a.txt', data }]);
			expect(zip[0]).toBe(0x50);
			expect(zip[1]).toBe(0x4b);
			expect(zip[2]).toBe(0x03);
			expect(zip[3]).toBe(0x04);
			const end = zip.length - 22;
			expect(zip[end]).toBe(0x50);
			expect(zip[end + 1]).toBe(0x4b);
			expect(zip[end + 2]).toBe(0x05);
			expect(zip[end + 3]).toBe(0x06);
		});

		it('複数ファイル: 中央ディレクトリにエントリ数が反映', () => {
			const zip = _buildZip([
				{ name: 'a.txt', data: _str('a') },
				{ name: 'b.txt', data: _str('bb') },
				{ name: 'c.txt', data: _str('ccc') },
			]);
			const dv = new DataView(zip.buffer, zip.length - 22);
			expect(dv.getUint16(8, true)).toBe(3);
			expect(dv.getUint16(10, true)).toBe(3);
		});
	});
}
