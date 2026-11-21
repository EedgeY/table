import type { RowId } from './_types.ts';
export type { RowId } from './_types.ts';

export type SelectionMode = 'none' | 'single' | 'multi';

export type SelectionState = {
	readonly mode: SelectionMode;
	readonly ids: ReadonlySet<RowId>;
};

export function createSelectionState(mode: SelectionMode = 'none'): SelectionState {
	return Object.freeze({ mode, ids: new Set<RowId>() as ReadonlySet<RowId> });
}
