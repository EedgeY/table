import type { RowId } from './_types.ts';
import type { SelectionState } from './selection.ts';

function freezeSet(set: Set<RowId>): SelectionState['ids'] {
	return set as ReadonlySet<RowId>;
}

export function _selectOne(state: SelectionState, id: RowId): SelectionState {
	if (state.mode === 'none') {
		return state;
	}
	const next = new Set<RowId>([id]);
	return Object.freeze({ mode: state.mode, ids: freezeSet(next) });
}

export function _toggle(state: SelectionState, id: RowId): SelectionState {
	if (state.mode === 'none') {
		return state;
	}
	const next = new Set<RowId>(state.ids);
	if (next.has(id)) {
		next.delete(id);
	} else {
		if (state.mode === 'single') {
			next.clear();
		}
		next.add(id);
	}
	return Object.freeze({ mode: state.mode, ids: freezeSet(next) });
}

export function _selectMany(state: SelectionState, ids: Iterable<RowId>): SelectionState {
	if (state.mode === 'none') {
		return state;
	}
	if (state.mode === 'single') {
		let last: RowId | undefined;
		for (const id of ids) {
			last = id;
		}
		if (last === undefined) {
			return state;
		}
		return _selectOne(state, last);
	}
	const next = new Set<RowId>(state.ids);
	for (const id of ids) {
		next.add(id);
	}
	return Object.freeze({ mode: state.mode, ids: freezeSet(next) });
}

export function _clearSelection(state: SelectionState): SelectionState {
	if (state.ids.size === 0) {
		return state;
	}
	return Object.freeze({ mode: state.mode, ids: freezeSet(new Set()) });
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	const empty = (mode: SelectionState['mode']): SelectionState =>
		Object.freeze({ mode, ids: new Set() as ReadonlySet<RowId> });

	describe('_selection', () => {
		it('none mode is a no-op', () => {
			const s = empty('none');
			expect(_toggle(s, 'a' as RowId)).toBe(s);
		});

		it('single mode toggle replaces previous selection', () => {
			let s = empty('single');
			s = _toggle(s, 'a' as RowId);
			expect(Array.from(s.ids)).toEqual(['a']);
			s = _toggle(s, 'b' as RowId);
			expect(Array.from(s.ids)).toEqual(['b']);
		});

		it('multi mode toggle adds and removes', () => {
			let s = empty('multi');
			s = _toggle(s, 'a' as RowId);
			s = _toggle(s, 'b' as RowId);
			expect(Array.from(s.ids).sort()).toEqual(['a', 'b']);
			s = _toggle(s, 'a' as RowId);
			expect(Array.from(s.ids)).toEqual(['b']);
		});

		it('clear leaves mode unchanged', () => {
			let s = empty('multi');
			s = _selectMany(s, ['a' as RowId, 'b' as RowId]);
			s = _clearSelection(s);
			expect(s.mode).toBe('multi');
			expect(s.ids.size).toBe(0);
		});

		it('_selectMany on single mode picks the last id', () => {
			const s = _selectMany(empty('single'), ['a' as RowId, 'b' as RowId, 'c' as RowId]);
			expect(Array.from(s.ids)).toEqual(['c']);
		});
	});
}
