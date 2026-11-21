import { n as _aggregateOne, t as _aggregateMany } from "./_aggregate-CE3a7yZM.js";
import { t as _INTERNAL } from "./create-table-BDxHjkHt.js";
//#region src/aggregate.ts
function aggregate(rows, columns, opts) {
	const groupColId = opts.groupBy;
	const valueColIds = Object.keys(opts.columns);
	const buckets = /* @__PURE__ */ new Map();
	if (groupColId === void 0) {
		const all = new Array(rows.length);
		for (let i = 0; i < rows.length; i++) all[i] = i;
		buckets.set(null, all);
	} else {
		const groupCol = columns.find((c) => c.id === groupColId);
		if (!groupCol) return [];
		for (let i = 0; i < rows.length; i++) {
			const k = groupCol.accessor(rows[i]);
			const norm = k === void 0 ? null : k;
			let arr = buckets.get(norm);
			if (!arr) {
				arr = [];
				buckets.set(norm, arr);
			}
			arr.push(i);
		}
	}
	const out = [];
	for (const [key, idxArr] of buckets) {
		const indices = new Uint32Array(idxArr);
		const values = {};
		for (const id of valueColIds) {
			const fn = opts.columns[id];
			const col = columns.find((c) => c.id === id);
			values[id] = col ? _aggregateOne(rows, indices, col, fn) : null;
		}
		out.push(Object.freeze({
			key,
			count: indices.length,
			values: Object.freeze(values)
		}));
	}
	return Object.freeze(out);
}
const _AGGREGATE_STATE = Symbol.for("@tarbo-table/core/aggregate-state");
function withAggregate(table) {
	if (table[_AGGREGATE_STATE] !== void 0) return table;
	const internal = table[_INTERNAL];
	let aggregations = Object.freeze([]);
	const getAggSpecsMap = () => {
		const out = {};
		for (const s of aggregations) out[s.columnId] = s.fn;
		return out;
	};
	Object.assign(table, {
		setAggregations(specs) {
			aggregations = Object.freeze([...specs]);
			internal.notify();
		},
		getAggregations: () => aggregations,
		getOverallAggregates() {
			return _aggregateMany(internal.getData(), internal.getSortedIndices(), internal.getColumns(), getAggSpecsMap());
		}
	});
	Object.defineProperty(table, _AGGREGATE_STATE, {
		value: Object.freeze({ getAggSpecsMap }),
		enumerable: false,
		writable: false,
		configurable: false
	});
	return table;
}
//#endregion
export { _AGGREGATE_STATE, aggregate, withAggregate };

//# sourceMappingURL=aggregate.js.map