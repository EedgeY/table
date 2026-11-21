import type { ColumnDef, ColumnVisibilityState } from './column.ts';

export function _initialVisibility<TRow>(
	columns: ReadonlyArray<ColumnDef<TRow>>,
	override?: ColumnVisibilityState,
): ColumnVisibilityState {
	const out: Record<string, boolean> = {};
	for (const c of columns) {
		out[c.id] = c.hidden === true ? false : true;
	}
	if (override) {
		for (const k of Object.keys(override)) {
			out[k] = override[k] === true;
		}
	}
	return Object.freeze(out);
}

export function _filterVisible<TRow>(
	columns: ReadonlyArray<ColumnDef<TRow>>,
	visibility: ColumnVisibilityState,
): ReadonlyArray<ColumnDef<TRow>> {
	return columns.filter((c) => visibility[c.id] !== false);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('_initialVisibility', () => {
		it('全列が hidden 未指定なら全 true', () => {
			const cols = [
				{ id: 'a', accessor: () => 1 },
				{ id: 'b', accessor: () => 2 },
			];
			expect(_initialVisibility(cols)).toEqual({ a: true, b: true });
		});
		it('hidden:true は false で初期化', () => {
			const cols = [
				{ id: 'a', accessor: () => 1, hidden: true },
				{ id: 'b', accessor: () => 2 },
			];
			expect(_initialVisibility(cols)).toEqual({ a: false, b: true });
		});
		it('override が優先', () => {
			const cols = [{ id: 'a', accessor: () => 1, hidden: true }];
			expect(_initialVisibility(cols, { a: true })).toEqual({ a: true });
		});
	});

	describe('_filterVisible', () => {
		it('false の列を除外する', () => {
			const cols = [
				{ id: 'a', accessor: () => 1 },
				{ id: 'b', accessor: () => 2 },
				{ id: 'c', accessor: () => 3 },
			];
			expect(_filterVisible(cols, { a: true, b: false, c: true }).map((c) => c.id)).toEqual([
				'a',
				'c',
			]);
		});
		it('明示されていない列は表示扱い', () => {
			const cols = [{ id: 'a', accessor: () => 1 }];
			expect(_filterVisible(cols, {}).map((c) => c.id)).toEqual(['a']);
		});
	});
}
