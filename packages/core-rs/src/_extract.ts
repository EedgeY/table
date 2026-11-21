import type { CellValue, ColumnBinding, ColumnKind, ExtractedColumn } from './_types.ts';

const STR_NULL = 0xffff_ffff;

function inferKind(sample: CellValue): ColumnKind {
	if (typeof sample === 'number') return 'number';
	if (typeof sample === 'boolean') return 'boolean';
	return 'string';
}

const _SCALAR_KINDS: ReadonlySet<ColumnKind> = new Set(['number', 'string', 'boolean']);

function detectKind<TRow>(rows: ReadonlyArray<TRow>, col: ColumnBinding<TRow>): ColumnKind {
	if (col.type !== undefined && _SCALAR_KINDS.has(col.type)) return col.type;
	const probe = Math.min(64, rows.length);
	for (let i = 0; i < probe; i++) {
		const row = rows[i];
		if (row === undefined) continue;
		const v = col.accessor(row);
		if (v == null) continue;
		return inferKind(v);
	}
	return 'string';
}

export function extractColumns<TRow>(
	rows: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnBinding<TRow>>,
): ExtractedColumn[] {
	const n = rows.length;
	const out: ExtractedColumn[] = [];

	for (const col of columns) {
		const kind = detectKind(rows, col);

		if (kind === 'number') {
			const values = new Float64Array(n);
			const mask = new Uint8Array(n);
			for (let i = 0; i < n; i++) {
				const v = col.accessor(rows[i] as TRow);
				if (v == null || v === '' || Number.isNaN(v as number)) {
					mask[i] = 0;
					continue;
				}
				const num = typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
				if (!Number.isFinite(num)) {
					mask[i] = 0;
					continue;
				}
				values[i] = num;
				mask[i] = 1;
			}
			out.push({ id: col.id, kind: 'number', values, mask });
			continue;
		}

		if (kind === 'boolean') {
			const buf = new Uint8Array(n);
			for (let i = 0; i < n; i++) {
				const v = col.accessor(rows[i] as TRow);
				if (v == null) {
					buf[i] = 2;
				} else if (typeof v === 'boolean') {
					buf[i] = v ? 1 : 0;
				} else if (typeof v === 'number') {
					buf[i] = v === 0 ? 0 : 1;
				} else {
					const s = String(v).toLowerCase();
					if (s === 'true' || s === '1') buf[i] = 1;
					else if (s === 'false' || s === '0') buf[i] = 0;
					else buf[i] = 2;
				}
			}
			out.push({ id: col.id, kind: 'boolean', values: buf });
			continue;
		}

		const codes = new Uint32Array(n);
		const dictMap = new Map<string, number>();
		const dict: string[] = [];
		for (let i = 0; i < n; i++) {
			const v = col.accessor(rows[i] as TRow);
			if (v == null) {
				codes[i] = STR_NULL;
				continue;
			}
			const s = String(v);
			let id = dictMap.get(s);
			if (id === undefined) {
				id = dict.length;
				dictMap.set(s, id);
				dict.push(s);
			}
			codes[i] = id;
		}
		out.push({ id: col.id, kind: 'string', codes, dict });
	}

	return out;
}
