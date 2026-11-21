import type { ColumnDef } from './column.ts';
import type { DataSource, EditError } from './data-source.ts';
import type { Result } from './_result.ts';
import type { RowId } from './_types.ts';

export type CellKey = string;

const SEP = '';
export const _cellKey = (rowId: RowId, columnId: string): CellKey => `${rowId}${SEP}${columnId}`;
export const _parseCellKey = (k: CellKey): { rowId: RowId; columnId: string } => {
	const i = k.indexOf(SEP);
	return { rowId: k.slice(0, i) as RowId, columnId: k.slice(i + 1) };
};

/** undo/redo 1 操作。1 セル変更 = 1 entry。 */
export type EditOp = {
	readonly rowId: RowId;
	readonly columnId: string;
	readonly before: unknown;
	readonly after: unknown;
};

export type EditState = {
	readonly dirty: ReadonlyMap<CellKey, unknown>;
	readonly inFlight: ReadonlySet<CellKey>;
	readonly errors: ReadonlyMap<CellKey, EditError>;
	readonly undoStack: ReadonlyArray<EditOp>;
	readonly redoStack: ReadonlyArray<EditOp>;
};

export type EditStore<TRow> = {
	readonly getState: () => EditState;
	readonly commit: (input: {
		rowId: RowId;
		columnId: string;
		value: unknown;
	}) => Promise<Result<TRow, EditError>>;
	readonly rollback: (rowId: RowId, columnId: string) => void;
	readonly clearError: (rowId: RowId, columnId: string) => void;
	readonly undo: () => Promise<Result<void, EditError>>;
	readonly redo: () => Promise<Result<void, EditError>>;
	readonly canUndo: () => boolean;
	readonly canRedo: () => boolean;
	readonly subscribe: (cb: () => void) => () => void;
};

export type EditStoreOptions<TRow> = {
	readonly dataSource: DataSource<TRow>;
	readonly columns: ReadonlyArray<ColumnDef<TRow>>;
	readonly findRowById: (rowId: RowId) => TRow | null;
	readonly findIndexById: (rowId: RowId) => number;
	readonly writeRow: (rowId: RowId, row: TRow) => void;
	readonly onChange: () => void;
	readonly maxHistory?: number;
};

const FROZEN_EMPTY_STATE: EditState = Object.freeze({
	dirty: new Map<CellKey, unknown>(),
	inFlight: new Set<CellKey>(),
	errors: new Map<CellKey, EditError>(),
	undoStack: Object.freeze([] as ReadonlyArray<EditOp>),
	redoStack: Object.freeze([] as ReadonlyArray<EditOp>),
});

export function _createEditStore<TRow>(opts: EditStoreOptions<TRow>): EditStore<TRow> {
	const maxHistory = opts.maxHistory ?? 50;
	let state: EditState = FROZEN_EMPTY_STATE;
	const listeners = new Set<() => void>();

	const notify = (): void => {
		opts.onChange();
		for (const l of listeners) l();
	};

	const setState = (next: EditState): void => {
		state = next;
		notify();
	};

	const getCellValue = (row: TRow, columnId: string): unknown => {
		const col = opts.columns.find((c) => c.id === columnId);
		if (!col) return undefined;
		return col.accessor(row);
	};

	const writeCell = (rowId: RowId, columnId: string, value: unknown): TRow | null => {
		const row = opts.findRowById(rowId);
		if (row === null) return null;
		const next = { ...(row as Record<string, unknown>), [columnId]: value } as TRow;
		opts.writeRow(rowId, next);
		return next;
	};

	const finalizeOk = (rowId: RowId, columnId: string, before: unknown, after: unknown): void => {
		const key = _cellKey(rowId, columnId);
		const nextDirty = new Map(state.dirty);
		nextDirty.delete(key);
		const nextInFlight = new Set(state.inFlight);
		nextInFlight.delete(key);
		const op: EditOp = { rowId, columnId, before, after };
		const newStack = [...state.undoStack, op];
		const trimmed =
			newStack.length > maxHistory ? newStack.slice(newStack.length - maxHistory) : newStack;
		setState({
			...state,
			dirty: nextDirty,
			inFlight: nextInFlight,
			undoStack: Object.freeze(trimmed),
			redoStack: Object.freeze([]),
		});
	};

	const commit: EditStore<TRow>['commit'] = async (input) => {
		const { rowId, columnId, value } = input;
		const row = opts.findRowById(rowId);
		if (row === null) {
			return { ok: false, error: { code: 'not_found', message: `row ${rowId} not found` } };
		}
		const before = getCellValue(row, columnId);
		if (Object.is(before, value)) {
			return { ok: true, value: row };
		}

		const key = _cellKey(rowId, columnId);
		const optimistic = writeCell(rowId, columnId, value);
		if (optimistic === null) {
			return { ok: false, error: { code: 'not_found', message: `row ${rowId} not found` } };
		}
		const nextDirty = new Map(state.dirty);
		if (!nextDirty.has(key)) {
			nextDirty.set(key, before);
		}
		const nextInFlight = new Set(state.inFlight);
		nextInFlight.add(key);
		const nextErrors = new Map(state.errors);
		nextErrors.delete(key);
		setState({
			...state,
			dirty: nextDirty,
			inFlight: nextInFlight,
			errors: nextErrors,
		});

		const ds = opts.dataSource;
		if (!ds.updateCell) {
			finalizeOk(rowId, columnId, before, value);
			return { ok: true, value: optimistic };
		}

		const result = await ds.updateCell({ rowId, columnId, value, row: optimistic });
		if (result.ok) {
			opts.writeRow(rowId, result.value);
			finalizeOk(rowId, columnId, before, value);
			return result;
		}

		writeCell(rowId, columnId, before);
		const nextDirty2 = new Map(state.dirty);
		nextDirty2.delete(key);
		const nextInFlight2 = new Set(state.inFlight);
		nextInFlight2.delete(key);
		const nextErrors2 = new Map(state.errors);
		nextErrors2.set(key, result.error);
		setState({
			...state,
			dirty: nextDirty2,
			inFlight: nextInFlight2,
			errors: nextErrors2,
		});
		return result;
	};

	const rollback: EditStore<TRow>['rollback'] = (rowId, columnId) => {
		const key = _cellKey(rowId, columnId);
		if (!state.dirty.has(key)) return;
		const original = state.dirty.get(key);
		writeCell(rowId, columnId, original);
		const nextDirty = new Map(state.dirty);
		nextDirty.delete(key);
		const nextInFlight = new Set(state.inFlight);
		nextInFlight.delete(key);
		setState({ ...state, dirty: nextDirty, inFlight: nextInFlight });
	};

	const clearError: EditStore<TRow>['clearError'] = (rowId, columnId) => {
		const key = _cellKey(rowId, columnId);
		if (!state.errors.has(key)) return;
		const nextErrors = new Map(state.errors);
		nextErrors.delete(key);
		setState({ ...state, errors: nextErrors });
	};

	const applyOpDirect = async (
		rowId: RowId,
		columnId: string,
		nextValue: unknown,
	): Promise<Result<TRow, EditError>> => {
		const row = opts.findRowById(rowId);
		if (row === null) {
			return { ok: false, error: { code: 'not_found', message: `row ${rowId} not found` } };
		}
		const key = _cellKey(rowId, columnId);
		const before = getCellValue(row, columnId);
		const optimistic = writeCell(rowId, columnId, nextValue);
		if (optimistic === null) {
			return { ok: false, error: { code: 'not_found', message: `row ${rowId} not found` } };
		}
		const nextInFlight = new Set(state.inFlight);
		nextInFlight.add(key);
		setState({ ...state, inFlight: nextInFlight });

		const ds = opts.dataSource;
		if (!ds.updateCell) {
			const nextInFlight2 = new Set(state.inFlight);
			nextInFlight2.delete(key);
			setState({ ...state, inFlight: nextInFlight2 });
			return { ok: true, value: optimistic };
		}
		const result = await ds.updateCell({ rowId, columnId, value: nextValue, row: optimistic });
		if (result.ok) {
			opts.writeRow(rowId, result.value);
			const nextInFlight2 = new Set(state.inFlight);
			nextInFlight2.delete(key);
			setState({ ...state, inFlight: nextInFlight2 });
			return result;
		}
		writeCell(rowId, columnId, before);
		const nextInFlight2 = new Set(state.inFlight);
		nextInFlight2.delete(key);
		const nextErrors = new Map(state.errors);
		nextErrors.set(key, result.error);
		setState({ ...state, inFlight: nextInFlight2, errors: nextErrors });
		return result;
	};

	const undo: EditStore<TRow>['undo'] = async () => {
		const top = state.undoStack[state.undoStack.length - 1];
		if (!top) return { ok: true, value: undefined };
		const nextUndoStack = state.undoStack.slice(0, -1);
		const nextRedoStack = [...state.redoStack, top];
		setState({
			...state,
			undoStack: Object.freeze(nextUndoStack),
			redoStack: Object.freeze(nextRedoStack),
		});
		const result = await applyOpDirect(top.rowId, top.columnId, top.before);
		return result.ok ? { ok: true, value: undefined } : { ok: false, error: result.error };
	};

	const redo: EditStore<TRow>['redo'] = async () => {
		const top = state.redoStack[state.redoStack.length - 1];
		if (!top) return { ok: true, value: undefined };
		const nextRedoStack = state.redoStack.slice(0, -1);
		const nextUndoStack = [...state.undoStack, top];
		setState({
			...state,
			undoStack: Object.freeze(nextUndoStack),
			redoStack: Object.freeze(nextRedoStack),
		});
		const result = await applyOpDirect(top.rowId, top.columnId, top.after);
		return result.ok ? { ok: true, value: undefined } : { ok: false, error: result.error };
	};

	return {
		getState: () => state,
		commit,
		rollback,
		clearError,
		undo,
		redo,
		canUndo: () => state.undoStack.length > 0,
		canRedo: () => state.redoStack.length > 0,
		subscribe(cb) {
			listeners.add(cb);
			return () => {
				listeners.delete(cb);
			};
		},
	};
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	type Row = { id: number; name: string };
	const cols: ColumnDef<Row>[] = [
		{ id: 'id', accessor: (r) => r.id, type: 'number' },
		{ id: 'name', accessor: (r) => r.name },
	];

	function makeStore(initial: Row[]) {
		const rows: Row[] = [...initial];
		const findRow = (rowId: RowId): Row | null => {
			const i = rows.findIndex((r) => String(r.id) === rowId);
			return i >= 0 ? rows[i]! : null;
		};
		const writeRow = (rowId: RowId, row: Row): void => {
			const i = rows.findIndex((r) => String(r.id) === rowId);
			if (i >= 0) rows[i] = row;
		};
		return {
			rows,
			store: _createEditStore<Row>({
				dataSource: {
					updateCell: async ({ rowId, columnId, value, row }) => {
						const next = { ...row, [columnId]: value } as Row;
						writeRow(rowId, next);
						return { ok: true, value: next };
					},
				},
				columns: cols,
				findRowById: findRow,
				findIndexById: (rowId) => rows.findIndex((r) => String(r.id) === rowId),
				writeRow,
				onChange: () => {},
			}),
		};
	}

	describe('_createEditStore', () => {
		it('commit で楽観反映 + サーバー確定', async () => {
			const { rows, store } = makeStore([{ id: 1, name: 'a' }]);
			const res = await store.commit({ rowId: '1' as RowId, columnId: 'name', value: 'A' });
			expect(res.ok).toBe(true);
			expect(rows[0]!.name).toBe('A');
			expect(store.getState().dirty.size).toBe(0);
			expect(store.getState().inFlight.size).toBe(0);
		});

		it('updateCell が失敗すると rollback されエラーを保持', async () => {
			const rows: Row[] = [{ id: 1, name: 'a' }];
			const store = _createEditStore<Row>({
				dataSource: {
					updateCell: async () => ({ ok: false, error: { code: 'forbidden', message: 'nope' } }),
				},
				columns: cols,
				findRowById: (id) => rows.find((r) => String(r.id) === id) ?? null,
				findIndexById: (id) => rows.findIndex((r) => String(r.id) === id),
				writeRow: (id, r) => {
					const i = rows.findIndex((x) => String(x.id) === id);
					if (i >= 0) rows[i] = r;
				},
				onChange: () => {},
			});
			const res = await store.commit({ rowId: '1' as RowId, columnId: 'name', value: 'X' });
			expect(res.ok).toBe(false);
			expect(rows[0]!.name).toBe('a');
			expect(store.getState().errors.size).toBe(1);
		});

		it('undo で前の値に戻る', async () => {
			const { rows, store } = makeStore([{ id: 1, name: 'a' }]);
			await store.commit({ rowId: '1' as RowId, columnId: 'name', value: 'A' });
			expect(store.canUndo()).toBe(true);
			await store.undo();
			expect(rows[0]!.name).toBe('a');
			expect(store.canRedo()).toBe(true);
		});

		it('redo で undo した変更が再適用', async () => {
			const { rows, store } = makeStore([{ id: 1, name: 'a' }]);
			await store.commit({ rowId: '1' as RowId, columnId: 'name', value: 'A' });
			await store.undo();
			await store.redo();
			expect(rows[0]!.name).toBe('A');
		});

		it('新規 commit で redoStack はクリアされる', async () => {
			const { store } = makeStore([{ id: 1, name: 'a' }]);
			await store.commit({ rowId: '1' as RowId, columnId: 'name', value: 'A' });
			await store.undo();
			expect(store.canRedo()).toBe(true);
			await store.commit({ rowId: '1' as RowId, columnId: 'name', value: 'B' });
			expect(store.canRedo()).toBe(false);
		});

		it('同じ値の commit は no-op', async () => {
			const { store } = makeStore([{ id: 1, name: 'a' }]);
			await store.commit({ rowId: '1' as RowId, columnId: 'name', value: 'a' });
			expect(store.getState().undoStack).toHaveLength(0);
		});

		it('clearError で error が消える', async () => {
			const rows: Row[] = [{ id: 1, name: 'a' }];
			const store = _createEditStore<Row>({
				dataSource: {
					updateCell: async () => ({ ok: false, error: { code: 'x', message: 'm' } }),
				},
				columns: cols,
				findRowById: (id) => rows.find((r) => String(r.id) === id) ?? null,
				findIndexById: (id) => rows.findIndex((r) => String(r.id) === id),
				writeRow: () => {},
				onChange: () => {},
			});
			await store.commit({ rowId: '1' as RowId, columnId: 'name', value: 'X' });
			expect(store.getState().errors.size).toBe(1);
			store.clearError('1' as RowId, 'name');
			expect(store.getState().errors.size).toBe(0);
		});

		it('maxHistory を超えると古い undo が捨てられる', async () => {
			const rows: Row[] = [{ id: 1, name: 'a' }];
			const store = _createEditStore<Row>({
				dataSource: {
					updateCell: async ({ row, columnId, value }) => ({
						ok: true,
						value: { ...row, [columnId]: value } as Row,
					}),
				},
				columns: cols,
				findRowById: (id) => rows.find((r) => String(r.id) === id) ?? null,
				findIndexById: (id) => rows.findIndex((r) => String(r.id) === id),
				writeRow: (id, r) => {
					const i = rows.findIndex((x) => String(x.id) === id);
					if (i >= 0) rows[i] = r;
				},
				onChange: () => {},
				maxHistory: 2,
			});
			await store.commit({ rowId: '1' as RowId, columnId: 'name', value: 'A' });
			await store.commit({ rowId: '1' as RowId, columnId: 'name', value: 'B' });
			await store.commit({ rowId: '1' as RowId, columnId: 'name', value: 'C' });
			expect(store.getState().undoStack).toHaveLength(2);
		});
	});

	describe('_cellKey / _parseCellKey', () => {
		it('round-trip', () => {
			const k = _cellKey('row-1' as RowId, 'col.x');
			expect(_parseCellKey(k)).toEqual({ rowId: 'row-1', columnId: 'col.x' });
		});
	});
}
