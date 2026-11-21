import { t as _INTERNAL } from "./create-table-BDxHjkHt.js";
//#region src/persist.ts
const URL_PARAM_KEY = (key) => `tt_${key}`;
function _localStorageBackend() {
	if (typeof window === "undefined") return null;
	try {
		const ls = window.localStorage;
		if (!ls) return null;
		return {
			load: (k) => ls.getItem(k),
			save: (k, v) => {
				ls.setItem(k, v);
			}
		};
	} catch {
		return null;
	}
}
function _urlBackend(key) {
	if (typeof window === "undefined") return null;
	const param = URL_PARAM_KEY(key);
	return {
		load: () => {
			try {
				return new URL(window.location.href).searchParams.get(param);
			} catch {
				return null;
			}
		},
		save: (_k, v) => {
			const u = new URL(window.location.href);
			if (v === "") u.searchParams.delete(param);
			else u.searchParams.set(param, v);
			window.history.replaceState(null, "", u.toString());
		}
	};
}
function _resolveStorage(opts) {
	const s = opts.storage ?? "local";
	if (s === "local") return _localStorageBackend();
	if (s === "url") return _urlBackend(opts.key);
	return s;
}
function _serialize(snapshot) {
	return JSON.stringify(snapshot);
}
function _deserialize(raw) {
	try {
		const o = JSON.parse(raw);
		if (typeof o !== "object" || o === null || o.v !== 1) return null;
		return o;
	} catch {
		return null;
	}
}
function _captureSnapshot(table, include) {
	const state = table.getState();
	const out = { v: 1 };
	if (include.has("predicate")) out.predicate = state.predicate;
	if (include.has("sort")) out.sort = state.sort;
	if (include.has("pagination")) out.pagination = state.pagination;
	if (include.has("columnSizing")) out.columnSizing = state.columnSizing;
	if (include.has("columnVisibility")) out.columnVisibility = state.columnVisibility;
	if (include.has("columnPinning")) out.columnPinning = state.columnPinning;
	if (include.has("grouping")) {
		const gb = table.getGroupBy;
		if (typeof gb === "function") out.grouping = gb();
	}
	return out;
}
function _applySnapshot(table, snap, include) {
	if (include.has("predicate") && snap.predicate !== void 0) table.setPredicate(snap.predicate);
	if (include.has("sort") && snap.sort !== void 0) table.setSort(snap.sort);
	if (include.has("pagination") && snap.pagination !== void 0) table.setPagination(snap.pagination);
	if (include.has("columnSizing") && snap.columnSizing !== void 0) for (const id of Object.keys(snap.columnSizing)) {
		const w = snap.columnSizing[id];
		if (typeof w === "number") table.setColumnWidth(id, w);
	}
	if (include.has("columnVisibility") && snap.columnVisibility !== void 0) for (const id of Object.keys(snap.columnVisibility)) table.setColumnVisibility(id, snap.columnVisibility[id] !== false);
	if (include.has("columnPinning") && snap.columnPinning !== void 0) for (const id of Object.keys(snap.columnPinning)) {
		const p = snap.columnPinning[id];
		if (p === "left" || p === "right") table.setColumnPinning(id, p);
	}
	if (include.has("grouping") && snap.grouping !== void 0) {
		const setGroupBy = table.setGroupBy;
		if (typeof setGroupBy === "function") setGroupBy(snap.grouping);
	}
}
const _PERSIST_ATTACHED = Symbol.for("@tarbo-table/core/persist-attached");
function withPersist(table, opts) {
	if (table[_PERSIST_ATTACHED] === true) return table;
	const internal = table[_INTERNAL];
	const storage = _resolveStorage(opts);
	const include = new Set(opts.include ?? [
		"predicate",
		"sort",
		"pagination",
		"columnSizing",
		"columnVisibility",
		"columnPinning",
		"grouping"
	]);
	const debounceMs = opts.debounceMs ?? 100;
	let suppress = false;
	let pending = null;
	const flush = () => {
		if (!storage || suppress) return;
		if (pending !== null) {
			clearTimeout(pending);
			pending = null;
		}
		const snap = _captureSnapshot(table, include);
		storage.save(opts.key, _serialize(snap));
	};
	const schedule = () => {
		if (!storage || suppress) return;
		if (pending !== null) clearTimeout(pending);
		pending = setTimeout(() => {
			pending = null;
			flush();
		}, debounceMs);
	};
	if (storage) {
		const raw = storage.load(opts.key);
		if (raw !== null) {
			const snap = _deserialize(raw);
			if (snap !== null) {
				suppress = true;
				try {
					_applySnapshot(table, snap, include);
				} finally {
					suppress = false;
				}
			}
		}
	}
	const unsubscribe = table.subscribe(() => {
		schedule();
	});
	Object.assign(table, {
		flushPersist: flush,
		reloadPersist() {
			if (!storage) return;
			const raw = storage.load(opts.key);
			if (raw === null) return;
			const snap = _deserialize(raw);
			if (snap === null) return;
			suppress = true;
			try {
				_applySnapshot(table, snap, include);
			} finally {
				suppress = false;
			}
			internal.notify();
		},
		clearPersist() {
			if (pending !== null) {
				clearTimeout(pending);
				pending = null;
			}
			if (storage) storage.save(opts.key, "");
			unsubscribe();
		}
	});
	Object.defineProperty(table, _PERSIST_ATTACHED, {
		value: true,
		enumerable: false,
		writable: false,
		configurable: false
	});
	return table;
}
//#endregion
export { _applySnapshot, _captureSnapshot, withPersist };

//# sourceMappingURL=persist.js.map