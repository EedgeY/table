import { n as _coerceNumber, t as _cmpAny } from "./_utils-GkG6ju0s.js";
import { flattenColumns } from "./column.js";
import { o as _compileColumn } from "./query-DAwNhlv_.js";
//#region src/_selection.ts
function freezeSet(set) {
	return set;
}
function _selectOne(state, id) {
	if (state.mode === "none") return state;
	const next = new Set([id]);
	return Object.freeze({
		mode: state.mode,
		ids: freezeSet(next)
	});
}
function _toggle(state, id) {
	if (state.mode === "none") return state;
	const next = new Set(state.ids);
	if (next.has(id)) next.delete(id);
	else {
		if (state.mode === "single") next.clear();
		next.add(id);
	}
	return Object.freeze({
		mode: state.mode,
		ids: freezeSet(next)
	});
}
function _clearSelection(state) {
	if (state.ids.size === 0) return state;
	return Object.freeze({
		mode: state.mode,
		ids: freezeSet(/* @__PURE__ */ new Set())
	});
}
//#endregion
//#region src/_visibility.ts
function _initialVisibility(columns, override) {
	const out = {};
	for (const c of columns) out[c.id] = c.hidden === true ? false : true;
	if (override) for (const k of Object.keys(override)) out[k] = override[k] === true;
	return Object.freeze(out);
}
function _filterVisible(columns, visibility) {
	return columns.filter((c) => visibility[c.id] !== false);
}
//#endregion
//#region src/_types.ts
const OP_TAGS = {
	"=": 0,
	"!=": 1,
	">": 2,
	"<": 3,
	">=": 4,
	"<=": 5,
	like: 6,
	startsWith: 7,
	endsWith: 8,
	isNull: 9,
	isNotNull: 10,
	in: 11
};
//#endregion
//#region src/_filter-engine.ts
const NOOP_ACCESSOR = () => null;
function _compilePredicate(p, columns) {
	if (p == null) return null;
	const colMap = /* @__PURE__ */ new Map();
	for (const c of columns) colMap.set(c.id, c);
	return compileNode(p, colMap);
}
function compileNode(p, cols) {
	if (p.kind === "leaf") {
		const accessor = cols.get(p.columnId)?.accessor ?? NOOP_ACCESSOR;
		const rawValue = p.value;
		let targetLower = "";
		let numTarget = NaN;
		let isNumTarget = false;
		let inSet = null;
		let inNumSet = null;
		if (Array.isArray(rawValue)) {
			inSet = /* @__PURE__ */ new Set();
			inNumSet = /* @__PURE__ */ new Set();
			let allNumeric = true;
			for (const v of rawValue) {
				inSet.add(String(v).toLowerCase());
				const n = _coerceNumber(v);
				if (n === null) allNumeric = false;
				else inNumSet.add(n);
			}
			if (!allNumeric) inNumSet = null;
		} else if (rawValue !== void 0) {
			targetLower = String(rawValue).toLowerCase();
			const n = _coerceNumber(rawValue);
			if (n !== null) {
				numTarget = n;
				isNumTarget = true;
			}
		}
		return {
			kind: 0,
			accessor,
			op: OP_TAGS[p.op],
			numTarget,
			isNumTarget,
			targetLower,
			caseSensitive: p.caseSensitive === true,
			inSet,
			inNumSet
		};
	}
	const children = p.children.map((c) => compileNode(c, cols));
	return {
		kind: 1,
		combinator: p.combinator === "or" ? 1 : 0,
		negate: p.negate === true,
		children
	};
}
function _evalNode(node, row) {
	if (node.kind === 0) return evalLeaf(node, row);
	const { combinator, children, negate } = node;
	const len = children.length;
	if (combinator === 0) {
		let ok = true;
		for (let i = 0; i < len; i++) {
			const child = children[i];
			if (child == null) continue;
			if (!_evalNode(child, row)) {
				ok = false;
				break;
			}
		}
		return negate ? !ok : ok;
	}
	let ok = false;
	for (let i = 0; i < len; i++) {
		const child = children[i];
		if (child == null) continue;
		if (_evalNode(child, row)) {
			ok = true;
			break;
		}
	}
	return negate ? !ok : ok;
}
function evalLeaf(leaf, row) {
	const value = leaf.accessor(row);
	const op = leaf.op;
	if (op === OP_TAGS.isNull) return value == null;
	if (op === OP_TAGS.isNotNull) return value != null;
	if (value == null) return false;
	if (op === OP_TAGS.in) {
		if (leaf.inNumSet !== null && typeof value === "number" && Number.isFinite(value)) return leaf.inNumSet.has(value);
		if (leaf.inSet !== null) return leaf.inSet.has(String(value).toLowerCase());
		return false;
	}
	if (op === OP_TAGS.like || op === OP_TAGS.startsWith || op === OP_TAGS.endsWith) {
		const sa = leaf.caseSensitive ? String(value) : String(value).toLowerCase();
		const sb = leaf.caseSensitive ? leaf.targetLower === "" ? "" : String(leaf.targetLower) : leaf.targetLower;
		switch (op) {
			case OP_TAGS.like: return sa.indexOf(sb) !== -1;
			case OP_TAGS.startsWith: return sa.startsWith(sb);
			case OP_TAGS.endsWith: return sa.endsWith(sb);
		}
	}
	if (typeof value === "number" && Number.isFinite(value) && leaf.isNumTarget) {
		const a = value;
		const b = leaf.numTarget;
		switch (op) {
			case OP_TAGS["="]: return a === b;
			case OP_TAGS["!="]: return a !== b;
			case OP_TAGS[">"]: return a > b;
			case OP_TAGS["<"]: return a < b;
			case OP_TAGS[">="]: return a >= b;
			case OP_TAGS["<="]: return a <= b;
		}
	}
	const sa = String(value).toLowerCase();
	const sb = leaf.targetLower;
	switch (op) {
		case OP_TAGS["="]: return sa === sb;
		case OP_TAGS["!="]: return sa !== sb;
		case OP_TAGS[">"]: return sa > sb;
		case OP_TAGS["<"]: return sa < sb;
		case OP_TAGS[">="]: return sa >= sb;
		case OP_TAGS["<="]: return sa <= sb;
	}
	return false;
}
function _filterIndices(data, compiled, out) {
	const len = data.length;
	if (compiled === null) {
		for (let i = 0; i < len; i++) out[i] = i;
		return len;
	}
	let n = 0;
	for (let i = 0; i < len; i++) if (_evalNode(compiled, data[i])) out[n++] = i;
	return n;
}
//#endregion
//#region src/_sort-engine.ts
function _buildComparator(data, spec, columns, visible) {
	const colMap = /* @__PURE__ */ new Map();
	for (const c of columns) colMap.set(c.id, c);
	const keys = [];
	for (const k of spec) {
		const col = colMap.get(k.columnId);
		if (col == null) continue;
		const accessor = col.accessor;
		const isNumeric = col.type === "number" || sampleIsNumeric(data, accessor, visible);
		keys.push({
			accessor,
			mult: k.dir === "desc" ? -1 : 1,
			nullsLast: k.nulls !== "first",
			isNumeric
		});
	}
	if (keys.length === 0) return (a, b) => a - b;
	return (a, b) => {
		const ra = data[a];
		const rb = data[b];
		for (let i = 0; i < keys.length; i++) {
			const k = keys[i];
			const va = k.accessor(ra);
			const vb = k.accessor(rb);
			let cmp;
			if (k.isNumeric) {
				const aNull = va == null;
				const bNull = vb == null;
				if (aNull && bNull) cmp = 0;
				else if (aNull) cmp = k.nullsLast ? 1 : -1;
				else if (bNull) cmp = k.nullsLast ? -1 : 1;
				else if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
				else cmp = _cmpAny(va, vb, k.nullsLast);
			} else cmp = _cmpAny(va, vb, k.nullsLast);
			if (cmp !== 0) return cmp * k.mult;
		}
		return a - b;
	};
}
function sampleIsNumeric(data, accessor, visible) {
	const n = Math.min(50, visible.length);
	let seen = 0;
	for (let i = 0; i < n; i++) {
		const idx = visible[i];
		const v = accessor(data[idx]);
		if (v == null) continue;
		if (typeof v !== "number") return false;
		seen++;
	}
	return seen > 0;
}
function _sortIndices(indices, cmp) {
	const arr = Array.from(indices);
	arr.sort(cmp);
	return new Uint32Array(arr);
}
//#endregion
//#region src/_engine-driver.ts
function _createJsEngineDriver(initialData, columns) {
	let data = initialData;
	let predicate = null;
	let compiled = null;
	return {
		setData(rows) {
			data = rows;
		},
		setPredicate(p) {
			predicate = p;
			compiled = null;
		},
		runFilter(scratch) {
			if (compiled === null && predicate !== null) compiled = _compilePredicate(predicate, columns);
			const n = _filterIndices(data, compiled, scratch);
			return scratch.slice(0, n);
		},
		runSort(filtered, spec) {
			if (spec.length === 0) return filtered;
			return _sortIndices(filtered, _buildComparator(data, spec, columns, filtered));
		}
	};
}
//#endregion
//#region src/_pagination.ts
function _derivePagination(state, total) {
	const size = state.pageSize;
	const pageCount = size <= 0 || !Number.isFinite(size) ? 1 : Math.max(1, Math.ceil(total / size));
	const pageIndex = Math.min(Math.max(0, state.pageIndex), pageCount - 1);
	const startIndex = Number.isFinite(size) ? pageIndex * size : 0;
	const endIndex = Number.isFinite(size) ? Math.min(total, startIndex + size) : total;
	return {
		pageCount,
		canPrev: pageIndex > 0,
		canNext: pageIndex < pageCount - 1,
		startIndex,
		endIndex
	};
}
function _slicePage(indices, d) {
	if (d.startIndex >= indices.length) return new Uint32Array(0);
	return indices.slice(d.startIndex, d.endIndex);
}
function _clampPagination(state, total) {
	const size = state.pageSize;
	const pageCount = size <= 0 || !Number.isFinite(size) ? 1 : Math.max(1, Math.ceil(total / size));
	const pageIndex = Math.min(Math.max(0, state.pageIndex), pageCount - 1);
	if (pageIndex === state.pageIndex) return state;
	return Object.freeze({
		pageIndex,
		pageSize: state.pageSize
	});
}
//#endregion
//#region src/_pipeline.ts
function _createPipeline(data, columns, predicate, sort, pagination, engineFactory) {
	const factory = engineFactory ?? _createJsEngineDriver;
	const driver = factory(data, columns);
	if (predicate !== null) driver.setPredicate(predicate);
	return {
		scratch: new Uint32Array(data.length),
		filtered: new Uint32Array(0),
		sorted: new Uint32Array(0),
		paged: new Uint32Array(0),
		dirty: {
			filter: true,
			sort: true,
			page: true
		},
		data,
		columns,
		predicate,
		sort,
		pagination,
		driver,
		factory
	};
}
function _setColumns(p, columns) {
	p.columns = columns;
	p.driver.dispose?.();
	p.driver = p.factory(p.data, columns);
	if (p.predicate !== null) p.driver.setPredicate(p.predicate);
	p.dirty.filter = true;
	p.dirty.sort = true;
	p.dirty.page = true;
}
function _setData(p, data) {
	p.data = data;
	if (p.scratch.length < data.length) p.scratch = new Uint32Array(data.length);
	p.driver.setData(data);
	p.dirty.filter = true;
	p.dirty.sort = true;
	p.dirty.page = true;
}
function _setPredicate(p, predicate) {
	p.predicate = predicate;
	p.driver.setPredicate(predicate);
	p.dirty.filter = true;
	p.dirty.sort = true;
	p.dirty.page = true;
}
function _setSort(p, sort) {
	p.sort = sort;
	p.dirty.sort = true;
	p.dirty.page = true;
}
function _setPagination(p, pagination) {
	p.pagination = pagination;
	p.dirty.page = true;
}
function _disposePipeline(p) {
	p.driver.dispose?.();
}
function _runFilter(p) {
	if (!p.dirty.filter) return p.filtered;
	p.filtered = p.driver.runFilter(p.scratch);
	p.dirty.filter = false;
	return p.filtered;
}
function _runSort(p) {
	const filtered = _runFilter(p);
	if (!p.dirty.sort) return p.sorted;
	p.sorted = p.driver.runSort(filtered, p.sort);
	p.dirty.sort = false;
	return p.sorted;
}
function _runPage(p) {
	const sorted = _runSort(p);
	const clamped = _clampPagination(p.pagination, sorted.length);
	if (clamped !== p.pagination) {
		p.pagination = clamped;
		p.dirty.page = true;
	}
	if (!p.dirty.page) return {
		indices: p.paged,
		clamped
	};
	const size = p.pagination.pageSize;
	if (!Number.isFinite(size) || size <= 0 || size >= sorted.length) p.paged = sorted;
	else p.paged = _slicePage(sorted, _derivePagination(p.pagination, sorted.length));
	p.dirty.page = false;
	return {
		indices: p.paged,
		clamped
	};
}
//#endregion
//#region src/computed.ts
function compileComputedColumns(specs, baseColumns) {
	const resolved = /* @__PURE__ */ new Map();
	for (const c of baseColumns) resolved.set(c.id, c.accessor);
	const out = [];
	for (const spec of specs) {
		const { accessor, type } = _compileColumn(spec.expr, (name) => {
			const fn = resolved.get(name);
			if (fn === void 0) throw new Error(`computed column "${spec.name}": 未解決の列参照 "${name}"`);
			return fn;
		});
		resolved.set(spec.name, accessor);
		out.push({
			id: spec.name,
			accessor,
			...type !== void 0 ? { type } : {}
		});
	}
	return out;
}
//#endregion
//#region src/_server-store.ts
const FROZEN_EMPTY = Object.freeze([]);
function _createServerStore(opts) {
	const debounceMs = opts.debounceMs ?? 50;
	let state = Object.freeze({
		rows: FROZEN_EMPTY,
		totalCount: 0,
		status: "idle",
		error: null,
		nextCursor: null
	});
	let aborter = null;
	let pending = null;
	let disposed = false;
	const setState = (next) => {
		state = Object.freeze(next);
		opts.onChange();
	};
	const runFetch = async (query) => {
		const ds = opts.dataSource;
		if (!ds.fetch) {
			setState({
				...state,
				status: "error",
				error: { message: "dataSource.fetch is required for server mode" }
			});
			return;
		}
		if (aborter !== null) aborter.abort();
		const ctrl = new AbortController();
		aborter = ctrl;
		setState({
			...state,
			status: "loading",
			error: null
		});
		try {
			const result = await ds.fetch({
				...query,
				signal: ctrl.signal
			});
			if (ctrl.signal.aborted || disposed) return;
			setState({
				rows: result.rows,
				totalCount: result.totalCount,
				status: "idle",
				error: null,
				nextCursor: result.nextCursor ?? null
			});
		} catch (e) {
			if (ctrl.signal.aborted || disposed) return;
			const message = e instanceof Error ? e.message : String(e);
			setState({
				...state,
				status: "error",
				error: {
					message,
					cause: e
				}
			});
		} finally {
			if (aborter === ctrl) aborter = null;
		}
	};
	const invalidate = (query) => {
		if (disposed) return Promise.resolve();
		if (pending !== null) {
			clearTimeout(pending);
			pending = null;
		}
		if (debounceMs <= 0) return runFetch(query);
		return new Promise((resolve) => {
			pending = setTimeout(() => {
				pending = null;
				resolve(runFetch(query));
			}, debounceMs);
		});
	};
	const runFetchMore = async (query) => {
		const ds = opts.dataSource;
		if (!ds.fetch) return;
		if (state.status === "loading") return;
		if (state.nextCursor === null && state.rows.length > 0) return;
		const ctrl = new AbortController();
		setState({
			...state,
			status: "loading",
			error: null
		});
		try {
			const result = await ds.fetch({
				...query,
				signal: ctrl.signal
			});
			if (ctrl.signal.aborted || disposed) return;
			setState({
				rows: [...state.rows, ...result.rows],
				totalCount: result.totalCount,
				status: "idle",
				error: null,
				nextCursor: result.nextCursor ?? null
			});
		} catch (e) {
			if (ctrl.signal.aborted || disposed) return;
			const message = e instanceof Error ? e.message : String(e);
			setState({
				...state,
				status: "error",
				error: {
					message,
					cause: e
				}
			});
		}
	};
	return {
		getState: () => state,
		invalidate,
		fetchMore(query) {
			if (disposed) return Promise.resolve();
			return runFetchMore(query);
		},
		mutate(patch) {
			if (disposed) return;
			setState({
				rows: patch.rows ?? state.rows,
				totalCount: patch.totalCount ?? state.totalCount,
				status: state.status,
				error: state.error,
				nextCursor: patch.nextCursor !== void 0 ? patch.nextCursor : state.nextCursor
			});
		},
		dispose() {
			disposed = true;
			if (pending !== null) {
				clearTimeout(pending);
				pending = null;
			}
			if (aborter !== null) {
				aborter.abort();
				aborter = null;
			}
		}
	};
}
//#endregion
//#region src/_row-provider.ts
const _degenerateIndices = (len) => {
	const out = new Uint32Array(len);
	for (let i = 0; i < len; i++) out[i] = i;
	return out;
};
const _buildRowsFromArray = (rows, getRowId) => {
	const out = new Array(rows.length);
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		out[i] = {
			id: getRowId(row, i),
			index: i,
			row
		};
	}
	return out;
};
function _createClientRowProvider(pipeline, getRowId) {
	let last = null;
	const buildRows = (indices) => {
		const data = pipeline.data;
		const out = new Array(indices.length);
		for (let i = 0; i < indices.length; i++) {
			const idx = indices[i];
			const row = data[idx];
			out[i] = {
				id: getRowId(row, idx),
				index: idx,
				row
			};
		}
		return out;
	};
	const FROZEN_EMPTY_SERVER_STATE = Object.freeze({
		rows: Object.freeze([]),
		totalCount: 0,
		status: "idle",
		error: null,
		nextCursor: null
	});
	const applyRowEvent = (event) => {
		const cur = pipeline.data;
		let nextRows;
		switch (event.kind) {
			case "insert":
				nextRows = [...cur, event.row];
				break;
			case "update":
				nextRows = cur.map((r, i) => getRowId(r, i) === event.rowId ? event.row : r);
				break;
			case "delete":
				nextRows = cur.filter((r, i) => getRowId(r, i) !== event.rowId);
				break;
		}
		_setData(pipeline, nextRows);
	};
	return {
		applyQuery(q) {
			if (last === null || !Object.is(last.predicate, q.predicate)) _setPredicate(pipeline, q.predicate);
			if (last === null || !Object.is(last.sort, q.sort)) _setSort(pipeline, q.sort);
			if (last === null || !Object.is(last.pagination, q.pagination)) _setPagination(pipeline, q.pagination);
			last = q;
			return _runPage(pipeline).clamped;
		},
		resultIndices() {
			_runPage(pipeline);
			return pipeline.sorted;
		},
		pageIndices() {
			_runPage(pipeline);
			return pipeline.paged;
		},
		resultRows() {
			_runPage(pipeline);
			return buildRows(pipeline.sorted);
		},
		pageRows() {
			_runPage(pipeline);
			return buildRows(pipeline.paged);
		},
		derivePagination(pagination) {
			_runPage(pipeline);
			return _derivePagination(pagination, pipeline.sorted.length);
		},
		rowCount() {
			_runPage(pipeline);
			return {
				total: pipeline.data.length,
				visible: pipeline.sorted.length,
				paged: pipeline.paged.length
			};
		},
		getData: () => pipeline.data,
		replaceData(data) {
			_setData(pipeline, data);
		},
		applyRowEvent,
		serverState: () => FROZEN_EMPTY_SERVER_STATE,
		refresh: () => Promise.resolve(),
		fetchMore: () => Promise.resolve(),
		dispose: () => {}
	};
}
function _createServerRowProvider(opts) {
	const store = _createServerStore({
		dataSource: opts.dataSource,
		onChange: opts.onChange,
		debounceMs: opts.debounceMs
	});
	const getRowId = opts.getRowId;
	let last = null;
	const rows = () => store.getState().rows;
	return {
		applyQuery(q) {
			if (last === null || !Object.is(last.predicate, q.predicate) || !Object.is(last.sort, q.sort) || !Object.is(last.pagination, q.pagination)) {
				last = q;
				store.invalidate({
					predicate: q.predicate,
					sort: q.sort,
					pagination: q.pagination
				});
			}
			return q.pagination;
		},
		resultIndices: () => _degenerateIndices(rows().length),
		pageIndices: () => _degenerateIndices(rows().length),
		resultRows: () => _buildRowsFromArray(rows(), getRowId),
		pageRows: () => _buildRowsFromArray(rows(), getRowId),
		derivePagination: (pagination) => _derivePagination(pagination, store.getState().totalCount),
		rowCount() {
			const s = store.getState();
			return {
				total: s.totalCount,
				visible: s.totalCount,
				paged: s.rows.length
			};
		},
		getData: () => store.getState().rows,
		replaceData(data) {
			store.mutate({ rows: data });
		},
		applyRowEvent(event) {
			const cur = store.getState();
			let nextRows = [...cur.rows];
			let totalCount = cur.totalCount;
			switch (event.kind) {
				case "insert":
					nextRows.push(event.row);
					totalCount++;
					break;
				case "update":
					nextRows = nextRows.map((r, i) => getRowId(r, i) === event.rowId ? event.row : r);
					break;
				case "delete": {
					const before = nextRows.length;
					nextRows = nextRows.filter((r, i) => getRowId(r, i) !== event.rowId);
					totalCount -= before - nextRows.length;
					break;
				}
			}
			store.mutate({
				rows: nextRows,
				totalCount
			});
		},
		serverState: () => store.getState(),
		refresh: (q) => store.invalidate({
			predicate: q.predicate,
			sort: q.sort,
			pagination: q.pagination
		}),
		fetchMore(q) {
			const cur = store.getState();
			return store.fetchMore({
				predicate: q.predicate,
				sort: q.sort,
				pagination: q.pagination,
				extra: cur.nextCursor !== null ? { cursor: cur.nextCursor } : void 0
			});
		},
		dispose() {
			store.dispose();
		}
	};
}
//#endregion
//#region src/create-table.ts
const _INTERNAL = Symbol.for("@tarbo-table/core/internal");
function defaultGetRowId(_row, index) {
	return String(index);
}
function createTable(opts) {
	const baseTree = opts.columns;
	const baseColumns = flattenColumns(baseTree);
	let columnTree = baseTree;
	let columns = baseColumns;
	const getRowId = opts.getRowId ?? defaultGetRowId;
	const mode = opts.mode ?? "client";
	const initialData = opts.data ?? Object.freeze([]);
	if (mode === "server" && (!opts.dataSource || !opts.dataSource.fetch)) throw new Error("createTable: mode=server requires dataSource.fetch");
	let state = Object.freeze({
		predicate: opts.initialState?.predicate ?? null,
		sort: opts.initialState?.sort ?? [],
		selection: opts.initialState?.selection ?? Object.freeze({
			mode: opts.selectionMode ?? "none",
			ids: /* @__PURE__ */ new Set()
		}),
		pagination: opts.initialState?.pagination ?? Object.freeze({
			pageIndex: 0,
			pageSize: opts.pageSize ?? Number.POSITIVE_INFINITY
		}),
		columnSizing: opts.initialState?.columnSizing ?? Object.freeze({}),
		columnVisibility: _initialVisibility(columns, opts.initialState?.columnVisibility),
		columnPinning: opts.initialState?.columnPinning ?? Object.freeze({})
	});
	const pipeline = _createPipeline(initialData, columns, state.predicate, state.sort, state.pagination, opts.engine);
	const listeners = /* @__PURE__ */ new Set();
	const notify = () => {
		for (const l of listeners) l();
	};
	const provider = mode === "server" && opts.dataSource ? _createServerRowProvider({
		dataSource: opts.dataSource,
		onChange: notify,
		debounceMs: opts.serverDebounceMs,
		getRowId
	}) : _createClientRowProvider(pipeline, getRowId);
	const currentQuery = () => ({
		predicate: state.predicate,
		sort: state.sort,
		pagination: state.pagination
	});
	const setState = (next) => {
		state = next;
		notify();
	};
	state = Object.freeze({
		...state,
		pagination: provider.applyQuery(currentQuery())
	});
	const commitQuery = (next) => {
		const clamped = provider.applyQuery({
			predicate: next.predicate,
			sort: next.sort,
			pagination: next.pagination
		});
		setState(clamped === next.pagination ? next : Object.freeze({
			...next,
			pagination: clamped
		}));
	};
	const colDefaultWidth = (col) => col.defaultWidth ?? 120;
	const instance = {
		setData(data) {
			provider.replaceData(data);
			commitQuery(state);
		},
		dispose() {
			_disposePipeline(pipeline);
			provider.dispose();
		},
		setComputedColumns(specs) {
			const computedCols = specs.length > 0 ? compileComputedColumns(specs, baseColumns) : [];
			columns = computedCols.length > 0 ? [...baseColumns, ...computedCols] : baseColumns;
			columnTree = computedCols.length > 0 ? [...baseTree, ...computedCols] : baseTree;
			_setColumns(pipeline, columns);
			commitQuery(Object.freeze({
				...state,
				columnVisibility: _initialVisibility(columns, state.columnVisibility)
			}));
		},
		setPredicate(predicate) {
			commitQuery(Object.freeze({
				...state,
				predicate
			}));
		},
		setSort(spec) {
			commitQuery(Object.freeze({
				...state,
				sort: spec
			}));
		},
		toggleSort(columnId, additive) {
			const current = state.sort;
			const existing = current.findIndex((k) => k.columnId === columnId);
			let nextSpec;
			if (existing === -1) {
				const newKey = {
					columnId,
					dir: "asc"
				};
				nextSpec = additive ? [...current, newKey] : [newKey];
			} else if (current[existing].dir === "asc") {
				const flipped = {
					columnId,
					dir: "desc"
				};
				nextSpec = additive ? current.map((k, i) => i === existing ? flipped : k) : [flipped];
			} else nextSpec = additive ? current.filter((_, i) => i !== existing) : [];
			commitQuery(Object.freeze({
				...state,
				sort: nextSpec
			}));
		},
		setPagination(patch) {
			const merged = Object.freeze({
				pageIndex: patch.pageIndex ?? state.pagination.pageIndex,
				pageSize: patch.pageSize ?? state.pagination.pageSize
			});
			commitQuery(Object.freeze({
				...state,
				pagination: merged
			}));
		},
		setColumnWidth(columnId, px) {
			const col = columns.find((c) => c.id === columnId);
			const min = col?.minWidth ?? 32;
			const max = col?.maxWidth ?? Number.POSITIVE_INFINITY;
			const clamped = Math.min(max, Math.max(min, px));
			if (state.columnSizing[columnId] === clamped) return;
			const nextSizing = Object.freeze({
				...state.columnSizing,
				[columnId]: clamped
			});
			setState(Object.freeze({
				...state,
				columnSizing: nextSizing
			}));
		},
		setColumnVisibility(columnId, visible) {
			if (state.columnVisibility[columnId] === visible) return;
			const nextVis = Object.freeze({
				...state.columnVisibility,
				[columnId]: visible
			});
			setState(Object.freeze({
				...state,
				columnVisibility: nextVis
			}));
		},
		toggleColumnVisibility(columnId) {
			const current = state.columnVisibility[columnId] !== false;
			const nextVis = Object.freeze({
				...state.columnVisibility,
				[columnId]: !current
			});
			setState(Object.freeze({
				...state,
				columnVisibility: nextVis
			}));
		},
		setColumnPinning(columnId, pin) {
			const cur = state.columnPinning[columnId];
			if (cur === pin || cur === void 0 && pin === null) return;
			const next = { ...state.columnPinning };
			if (pin === null) delete next[columnId];
			else next[columnId] = pin;
			setState(Object.freeze({
				...state,
				columnPinning: Object.freeze(next)
			}));
		},
		getPinnedColumns() {
			const visible = _filterVisible(columns, state.columnVisibility);
			const left = [];
			const center = [];
			const right = [];
			for (const c of visible) {
				const p = state.columnPinning[c.id];
				if (p === "left") left.push(c);
				else if (p === "right") right.push(c);
				else center.push(c);
			}
			return {
				left,
				center,
				right
			};
		},
		selectRow(id) {
			const next = _selectOne(state.selection, id);
			if (next === state.selection) return;
			setState(Object.freeze({
				...state,
				selection: next
			}));
		},
		toggleRow(id) {
			const next = _toggle(state.selection, id);
			if (next === state.selection) return;
			setState(Object.freeze({
				...state,
				selection: next
			}));
		},
		clearSelection() {
			const next = _clearSelection(state.selection);
			if (next === state.selection) return;
			setState(Object.freeze({
				...state,
				selection: next
			}));
		},
		getState: () => state,
		getColumnTree: () => columnTree,
		getColumns: () => columns,
		getBaseColumns: () => baseColumns,
		getVisibleColumns: () => _filterVisible(columns, state.columnVisibility),
		getRowId,
		getColumnWidth(columnId) {
			const w = state.columnSizing[columnId];
			if (typeof w === "number") return w;
			const col = columns.find((c) => c.id === columnId);
			return col ? colDefaultWidth(col) : 120;
		},
		getVisibleIndices: () => provider.resultIndices(),
		getPagedIndices: () => provider.pageIndices(),
		getVisibleRows: () => provider.resultRows(),
		getPagedRows: () => provider.pageRows(),
		getPagination: () => provider.derivePagination(state.pagination),
		getRowCount: () => provider.rowCount(),
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		subscribeWithSelector(select, listener, equals = Object.is) {
			let last = select(state);
			const inner = () => {
				const next = select(state);
				if (!equals(last, next)) {
					const prev = last;
					last = next;
					listener(next, prev);
				}
			};
			listeners.add(inner);
			return () => {
				listeners.delete(inner);
			};
		},
		getMode: () => mode,
		getServerState: () => provider.serverState(),
		getRelationSource: () => opts.relations ?? null,
		refresh: () => provider.refresh(currentQuery()),
		fetchMore: () => provider.fetchMore(currentQuery()),
		applyRowEvent(event) {
			provider.applyRowEvent(event);
			commitQuery(state);
		}
	};
	Object.defineProperty(instance, _INTERNAL, {
		value: {
			getSortedIndices: () => provider.resultIndices(),
			getData: () => provider.getData(),
			getColumns: () => columns,
			getRowId,
			notify,
			replaceData(data) {
				provider.replaceData(data);
				commitQuery(state);
			},
			getDataSource: () => opts.dataSource ?? null,
			getMode: () => mode
		},
		enumerable: false,
		writable: false,
		configurable: false
	});
	return instance;
}
//#endregion
export { createTable as n, compileComputedColumns as r, _INTERNAL as t };

//# sourceMappingURL=create-table-BDxHjkHt.js.map