import type { CellValue } from './column.ts';

export function _coerceNumber(v: CellValue): number | null {
	if (v == null || v === '') {
		return null;
	}
	if (typeof v === 'number') {
		return Number.isFinite(v) ? v : null;
	}
	if (typeof v === 'boolean') {
		return v ? 1 : 0;
	}
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

export function _cmpAny(a: CellValue, b: CellValue, nullsLast: boolean): number {
	const aNull = a == null;
	const bNull = b == null;
	if (aNull && bNull) {
		return 0;
	}
	if (aNull) {
		return nullsLast ? 1 : -1;
	}
	if (bNull) {
		return nullsLast ? -1 : 1;
	}
	if (typeof a === 'number' && typeof b === 'number') {
		return a - b;
	}
	const sa = String(a);
	const sb = String(b);
	return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function _freeze<T>(o: T): Readonly<T> {
	return Object.freeze(o);
}

export function _shallowEq<T>(a: T, b: T): boolean {
	if (Object.is(a, b)) {
		return true;
	}
	if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
		return false;
	}
	const ak = Object.keys(a as object);
	const bk = Object.keys(b as object);
	if (ak.length !== bk.length) {
		return false;
	}
	for (const k of ak) {
		const av = (a as Record<string, unknown>)[k];
		const bv = (b as Record<string, unknown>)[k];
		if (!Object.is(av, bv)) {
			return false;
		}
	}
	return true;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('_coerceNumber', () => {
		it('returns finite numbers as-is', () => {
			expect(_coerceNumber(42)).toBe(42);
		});
		it('parses numeric strings', () => {
			expect(_coerceNumber('123')).toBe(123);
		});
		it('returns null for empty / non-numeric / null', () => {
			expect(_coerceNumber('')).toBeNull();
			expect(_coerceNumber('abc')).toBeNull();
			expect(_coerceNumber(null)).toBeNull();
			expect(_coerceNumber(undefined)).toBeNull();
			expect(_coerceNumber(Number.NaN)).toBeNull();
		});
		it('coerces booleans to 0/1', () => {
			expect(_coerceNumber(true)).toBe(1);
			expect(_coerceNumber(false)).toBe(0);
		});
	});

	describe('_cmpAny', () => {
		it('nulls last vs first', () => {
			expect(_cmpAny(null, 1, true)).toBe(1);
			expect(_cmpAny(null, 1, false)).toBe(-1);
		});
		it('numeric pair compares numerically', () => {
			expect(_cmpAny(10, 2, true)).toBeGreaterThan(0);
		});
		it('mixed types fall back to string compare', () => {
			expect(_cmpAny(2, '10', true)).toBeGreaterThan(0);
		});
	});

	describe('_shallowEq', () => {
		it('Object.is equal short-circuits', () => {
			const obj = { a: 1 };
			expect(_shallowEq(obj, obj)).toBe(true);
		});
		it('compares one level deep', () => {
			expect(_shallowEq({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
			expect(_shallowEq({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
		});
		it('differing keys reject', () => {
			expect(_shallowEq({ a: 1 }, { a: 1, b: 2 })).toBe(false);
		});
	});
}
