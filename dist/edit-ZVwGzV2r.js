import { t as _INTERNAL } from "./create-table-BDxHjkHt.js";
//#region src/_edit-store.ts
const SEP = "";
const _cellKey = (rowId, columnId) => `${rowId}${SEP}${columnId}`;
const FROZEN_EMPTY_STATE = Object.freeze({
	dirty: /* @__PURE__ */ new Map(),
	inFlight: /* @__PURE__ */ new Set(),
	errors: /* @__PURE__ */ new Map(),
	undoStack: Object.freeze([]),
	redoStack: Object.freeze([])
});
function _createEditStore(opts) {
	const maxHistory = opts.maxHistory ?? 50;
	let state = FROZEN_EMPTY_STATE;
	const listeners = /* @__PURE__ */ new Set();
	const notify = () => {
		opts.onChange();
		for (const l of listeners) l();
	};
	const setState = (next) => {
		state = next;
		notify();
	};
	const getCellValue = (row, columnId) => {
		const col = opts.columns.find((c) => c.id === columnId);
		if (!col) return void 0;
		return col.accessor(row);
	};
	const writeCell = (rowId, columnId, value) => {
		const row = opts.findRowById(rowId);
		if (row === null) return null;
		const next = {
			...row,
			[columnId]: value
		};
		opts.writeRow(rowId, next);
		return next;
	};
	const finalizeOk = (rowId, columnId, before, after) => {
		const key = _cellKey(rowId, columnId);
		const nextDirty = new Map(state.dirty);
		nextDirty.delete(key);
		const nextInFlight = new Set(state.inFlight);
		nextInFlight.delete(key);
		const op = {
			rowId,
			columnId,
			before,
			after
		};
		const newStack = [...state.undoStack, op];
		const trimmed = newStack.length > maxHistory ? newStack.slice(newStack.length - maxHistory) : newStack;
		setState({
			...state,
			dirty: nextDirty,
			inFlight: nextInFlight,
			undoStack: Object.freeze(trimmed),
			redoStack: Object.freeze([])
		});
	};
	const commit = async (input) => {
		const { rowId, columnId, value } = input;
		const row = opts.findRowById(rowId);
		if (row === null) return {
			ok: false,
			error: {
				code: "not_found",
				message: `row ${rowId} not found`
			}
		};
		const before = getCellValue(row, columnId);
		if (Object.is(before, value)) return {
			ok: true,
			value: row
		};
		const key = _cellKey(rowId, columnId);
		const optimistic = writeCell(rowId, columnId, value);
		if (optimistic === null) return {
			ok: false,
			error: {
				code: "not_found",
				message: `row ${rowId} not found`
			}
		};
		const nextDirty = new Map(state.dirty);
		if (!nextDirty.has(key)) nextDirty.set(key, before);
		const nextInFlight = new Set(state.inFlight);
		nextInFlight.add(key);
		const nextErrors = new Map(state.errors);
		nextErrors.delete(key);
		setState({
			...state,
			dirty: nextDirty,
			inFlight: nextInFlight,
			errors: nextErrors
		});
		const ds = opts.dataSource;
		if (!ds.updateCell) {
			finalizeOk(rowId, columnId, before, value);
			return {
				ok: true,
				value: optimistic
			};
		}
		const result = await ds.updateCell({
			rowId,
			columnId,
			value,
			row: optimistic
		});
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
			errors: nextErrors2
		});
		return result;
	};
	const rollback = (rowId, columnId) => {
		const key = _cellKey(rowId, columnId);
		if (!state.dirty.has(key)) return;
		writeCell(rowId, columnId, state.dirty.get(key));
		const nextDirty = new Map(state.dirty);
		nextDirty.delete(key);
		const nextInFlight = new Set(state.inFlight);
		nextInFlight.delete(key);
		setState({
			...state,
			dirty: nextDirty,
			inFlight: nextInFlight
		});
	};
	const clearError = (rowId, columnId) => {
		const key = _cellKey(rowId, columnId);
		if (!state.errors.has(key)) return;
		const nextErrors = new Map(state.errors);
		nextErrors.delete(key);
		setState({
			...state,
			errors: nextErrors
		});
	};
	const applyOpDirect = async (rowId, columnId, nextValue) => {
		const row = opts.findRowById(rowId);
		if (row === null) return {
			ok: false,
			error: {
				code: "not_found",
				message: `row ${rowId} not found`
			}
		};
		const key = _cellKey(rowId, columnId);
		const before = getCellValue(row, columnId);
		const optimistic = writeCell(rowId, columnId, nextValue);
		if (optimistic === null) return {
			ok: false,
			error: {
				code: "not_found",
				message: `row ${rowId} not found`
			}
		};
		const nextInFlight = new Set(state.inFlight);
		nextInFlight.add(key);
		setState({
			...state,
			inFlight: nextInFlight
		});
		const ds = opts.dataSource;
		if (!ds.updateCell) {
			const nextInFlight2 = new Set(state.inFlight);
			nextInFlight2.delete(key);
			setState({
				...state,
				inFlight: nextInFlight2
			});
			return {
				ok: true,
				value: optimistic
			};
		}
		const result = await ds.updateCell({
			rowId,
			columnId,
			value: nextValue,
			row: optimistic
		});
		if (result.ok) {
			opts.writeRow(rowId, result.value);
			const nextInFlight2 = new Set(state.inFlight);
			nextInFlight2.delete(key);
			setState({
				...state,
				inFlight: nextInFlight2
			});
			return result;
		}
		writeCell(rowId, columnId, before);
		const nextInFlight2 = new Set(state.inFlight);
		nextInFlight2.delete(key);
		const nextErrors = new Map(state.errors);
		nextErrors.set(key, result.error);
		setState({
			...state,
			inFlight: nextInFlight2,
			errors: nextErrors
		});
		return result;
	};
	const undo = async () => {
		const top = state.undoStack[state.undoStack.length - 1];
		if (!top) return {
			ok: true,
			value: void 0
		};
		const nextUndoStack = state.undoStack.slice(0, -1);
		const nextRedoStack = [...state.redoStack, top];
		setState({
			...state,
			undoStack: Object.freeze(nextUndoStack),
			redoStack: Object.freeze(nextRedoStack)
		});
		const result = await applyOpDirect(top.rowId, top.columnId, top.before);
		return result.ok ? {
			ok: true,
			value: void 0
		} : {
			ok: false,
			error: result.error
		};
	};
	const redo = async () => {
		const top = state.redoStack[state.redoStack.length - 1];
		if (!top) return {
			ok: true,
			value: void 0
		};
		const nextRedoStack = state.redoStack.slice(0, -1);
		const nextUndoStack = [...state.undoStack, top];
		setState({
			...state,
			undoStack: Object.freeze(nextUndoStack),
			redoStack: Object.freeze(nextRedoStack)
		});
		const result = await applyOpDirect(top.rowId, top.columnId, top.after);
		return result.ok ? {
			ok: true,
			value: void 0
		} : {
			ok: false,
			error: result.error
		};
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
		}
	};
}
//#endregion
//#region src/edit.ts
const _EDIT_ATTACHED = Symbol.for("@tarbo-table/core/edit-attached");
function withEdit(table, options) {
	if (table[_EDIT_ATTACHED] === true) return table;
	const internal = table[_INTERNAL];
	const dataSource = internal.getDataSource() ?? {};
	const findRowById = (rowId) => {
		const data = internal.getData();
		for (let i = 0; i < data.length; i++) if (internal.getRowId(data[i], i) === rowId) return data[i];
		return null;
	};
	const findIndexById = (rowId) => {
		const data = internal.getData();
		for (let i = 0; i < data.length; i++) if (internal.getRowId(data[i], i) === rowId) return i;
		return -1;
	};
	const writeRow = (rowId, row) => {
		const idx = findIndexById(rowId);
		if (idx < 0) return;
		const next = internal.getData().slice();
		next[idx] = row;
		internal.replaceData(next);
	};
	const editStore = _createEditStore({
		dataSource,
		columns: internal.getColumns(),
		findRowById,
		findIndexById,
		writeRow,
		onChange: internal.notify,
		maxHistory: options?.maxHistory
	});
	Object.assign(table, {
		getEditState: () => editStore.getState(),
		commitEdit: (input) => editStore.commit(input),
		rollbackCell: (rowId, columnId) => editStore.rollback(rowId, columnId),
		clearEditError: (rowId, columnId) => editStore.clearError(rowId, columnId),
		undo: () => editStore.undo(),
		redo: () => editStore.redo(),
		canUndo: () => editStore.canUndo(),
		canRedo: () => editStore.canRedo(),
		subscribeEdit(cb) {
			return editStore.subscribe(() => cb(editStore.getState()));
		},
		getCellEdit(rowId, columnId) {
			const s = editStore.getState();
			const key = _cellKey(rowId, columnId);
			return {
				dirty: s.dirty.has(key),
				inFlight: s.inFlight.has(key),
				error: s.errors.get(key) ?? null
			};
		}
	});
	Object.defineProperty(table, _EDIT_ATTACHED, {
		value: true,
		enumerable: false,
		writable: false,
		configurable: false
	});
	return table;
}
//#endregion
export { withEdit as t };

//# sourceMappingURL=edit-ZVwGzV2r.js.map