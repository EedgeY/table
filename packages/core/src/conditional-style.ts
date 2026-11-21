import type { CellValue, ColumnDef } from './column.ts';

export type CellStyleObject = Readonly<{
	color?: string;
	backgroundColor?: string;
	fontWeight?: 'normal' | 'bold' | string;
	textDecoration?: 'none' | 'underline' | 'line-through';
	fontStyle?: 'normal' | 'italic';
	textAlign?: 'left' | 'center' | 'right';
	className?: string;
}>;

export type ConditionalRule<TRow> =
	/** 関数ベース: 全権限を委ねる */
	| {
			readonly kind: 'fn';
			readonly compute: (input: { row: TRow; value: CellValue }) => CellStyleObject | null;
	  }
	/** 比較演算: value <op> threshold で true なら style */
	| {
			readonly kind: 'compare';
			readonly op: '>' | '<' | '>=' | '<=' | '=' | '!=';
			readonly threshold: number;
			readonly style: CellStyleObject;
	  }
	/** 範囲: min <= value <= max なら style */
	| {
			readonly kind: 'between';
			readonly min: number;
			readonly max: number;
			readonly style: CellStyleObject;
	  }
	/** カラースケール (ヒートマップ): min/max 間で色を補間 */
	| {
			readonly kind: 'scale';
			readonly min: number;
			readonly max: number;
			/** 開始色 (oklch / hex / rgb)。背景色として適用。 */
			readonly minColor: string;
			readonly maxColor: string;
	  }
	| {
			readonly kind: 'bar';
			readonly min: number;
			readonly max: number;
			readonly color: string;
	  };

export type ConditionalCellMeta<TRow> = {
	readonly rules: ReadonlyArray<ConditionalRule<TRow>>;
};

/** rule の集合を順に評価して、merge した CellStyleObject を返す。 */
export function evaluateCellStyle<TRow>(input: {
	readonly row: TRow;
	readonly value: CellValue;
	readonly rules: ReadonlyArray<ConditionalRule<TRow>>;
}): CellStyleObject {
	let merged: Record<string, string> = {};
	for (const rule of input.rules) {
		const s = _applyRule(rule, input.row, input.value);
		if (s !== null) {
			merged = { ...merged, ...s };
		}
	}
	return Object.freeze(merged) as CellStyleObject;
}

function _applyRule<TRow>(
	rule: ConditionalRule<TRow>,
	row: TRow,
	value: CellValue,
): CellStyleObject | null {
	switch (rule.kind) {
		case 'fn': {
			return rule.compute({ row, value });
		}
		case 'compare': {
			if (typeof value !== 'number') return null;
			const ok = _cmp(rule.op, value, rule.threshold);
			return ok ? rule.style : null;
		}
		case 'between': {
			if (typeof value !== 'number') return null;
			if (value >= rule.min && value <= rule.max) return rule.style;
			return null;
		}
		case 'scale': {
			if (typeof value !== 'number') return null;
			const t = _clamp01((value - rule.min) / (rule.max - rule.min || 1));
			return { backgroundColor: _lerpColor(rule.minColor, rule.maxColor, t) };
		}
		case 'bar': {
			if (typeof value !== 'number') return null;
			const t = _clamp01((value - rule.min) / (rule.max - rule.min || 1));
			const pct = Math.round(t * 100);
			return {
				backgroundColor: `linear-gradient(to right, ${rule.color} 0%, ${rule.color} ${pct}%, transparent ${pct}%, transparent 100%)`,
			} as CellStyleObject;
		}
	}
}

function _cmp(op: '>' | '<' | '>=' | '<=' | '=' | '!=', a: number, b: number): boolean {
	switch (op) {
		case '>':
			return a > b;
		case '<':
			return a < b;
		case '>=':
			return a >= b;
		case '<=':
			return a <= b;
		case '=':
			return a === b;
		case '!=':
			return a !== b;
	}
}

function _clamp01(t: number): number {
	if (!Number.isFinite(t)) return 0;
	return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function _lerpColor(a: string, b: string, t: number): string {
	const ca = _parseColor(a);
	const cb = _parseColor(b);
	if (ca === null || cb === null) return a;
	const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
	const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
	const bv = Math.round(ca[2] + (cb[2] - ca[2]) * t);
	return `rgb(${r}, ${g}, ${bv})`;
}

function _parseColor(s: string): [number, number, number] | null {
	const trimmed = s.trim();
	const m = trimmed.match(/^#([0-9a-fA-F]{6})$/);
	if (m) {
		const hex = m[1]!;
		return [
			parseInt(hex.slice(0, 2), 16),
			parseInt(hex.slice(2, 4), 16),
			parseInt(hex.slice(4, 6), 16),
		];
	}
	const m3 = trimmed.match(/^#([0-9a-fA-F]{3})$/);
	if (m3) {
		const hex = m3[1]!;
		const r = parseInt(hex[0]! + hex[0], 16);
		const g = parseInt(hex[1]! + hex[1], 16);
		const b = parseInt(hex[2]! + hex[2], 16);
		return [r, g, b];
	}
	const mr = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
	if (mr) return [Number(mr[1]), Number(mr[2]), Number(mr[3])];
	return null;
}

export function _getColumnRules<TRow>(
	column: ColumnDef<TRow> & { cellStyle?: ConditionalCellMeta<TRow> | undefined },
): ReadonlyArray<ConditionalRule<TRow>> {
	return column.cellStyle?.rules ?? [];
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('evaluateCellStyle', () => {
		it('compare: value > threshold で style', () => {
			const s = evaluateCellStyle({
				row: {},
				value: 150,
				rules: [
					{
						kind: 'compare',
						op: '>',
						threshold: 100,
						style: { color: 'red' },
					},
				],
			});
			expect(s.color).toBe('red');
		});

		it('compare: false なら空 style', () => {
			const s = evaluateCellStyle({
				row: {},
				value: 50,
				rules: [
					{
						kind: 'compare',
						op: '>',
						threshold: 100,
						style: { color: 'red' },
					},
				],
			});
			expect(s.color).toBeUndefined();
		});

		it('between: 範囲内', () => {
			const s = evaluateCellStyle({
				row: {},
				value: 50,
				rules: [
					{
						kind: 'between',
						min: 0,
						max: 100,
						style: { backgroundColor: 'yellow' },
					},
				],
			});
			expect(s.backgroundColor).toBe('yellow');
		});

		it('scale: 線形補間', () => {
			const s = evaluateCellStyle({
				row: {},
				value: 50,
				rules: [
					{
						kind: 'scale',
						min: 0,
						max: 100,
						minColor: '#000000',
						maxColor: '#ffffff',
					},
				],
			});
			expect(s.backgroundColor).toBe('rgb(128, 128, 128)');
		});

		it('複数ルールは後勝ち merge', () => {
			const s = evaluateCellStyle({
				row: {},
				value: 150,
				rules: [
					{ kind: 'compare', op: '>', threshold: 100, style: { color: 'red' } },
					{
						kind: 'compare',
						op: '>',
						threshold: 100,
						style: { color: 'blue', fontWeight: 'bold' },
					},
				],
			});
			expect(s.color).toBe('blue');
			expect(s.fontWeight).toBe('bold');
		});

		it('fn: row 全体を参照できる', () => {
			const s = evaluateCellStyle({
				row: { salary: 1000 },
				value: 'tanaka',
				rules: [
					{
						kind: 'fn',
						compute: ({ row }) => (row.salary > 500 ? { color: 'gold' } : null),
					},
				],
			});
			expect(s.color).toBe('gold');
		});

		it('number でない値は数値 rule をスキップ', () => {
			const s = evaluateCellStyle({
				row: {},
				value: 'text',
				rules: [
					{ kind: 'compare', op: '>', threshold: 0, style: { color: 'red' } },
					{ kind: 'between', min: 0, max: 1, style: { color: 'blue' } },
					{ kind: 'scale', min: 0, max: 1, minColor: '#000', maxColor: '#fff' },
				],
			});
			expect(Object.keys(s)).toEqual([]);
		});
	});

	describe('_lerpColor', () => {
		it('hex 6 桁', () => {
			expect(_lerpColor('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
		});
		it('hex 3 桁', () => {
			expect(_lerpColor('#f00', '#0f0', 0.5)).toBe('rgb(128, 128, 0)');
		});
		it('rgb()', () => {
			expect(_lerpColor('rgb(0, 0, 0)', 'rgb(100, 100, 100)', 0.5)).toBe('rgb(50, 50, 50)');
		});
		it('解釈不能はそのまま', () => {
			expect(_lerpColor('oklch(0.5 0 0)', '#fff', 0.5)).toBe('oklch(0.5 0 0)');
		});
	});
}
