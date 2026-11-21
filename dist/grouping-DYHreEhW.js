import { t as _aggregateMany } from "./_aggregate-CE3a7yZM.js";
import { t as _INTERNAL } from "./create-table-BDxHjkHt.js";
import { _AGGREGATE_STATE, withAggregate } from "./aggregate.js";
//#region src/_grouping.ts
function _bucketize(data, indices, col) {
	const map = /* @__PURE__ */ new Map();
	for (const i of indices) {
		const k = col.accessor(data[i]);
		const norm = k === void 0 ? null : k;
		let arr = map.get(norm);
		if (!arr) {
			arr = [];
			map.set(norm, arr);
		}
		arr.push(i);
	}
	return map;
}
function _buildLevel(data, indices, groupColumns, depth, parentPath, allColumns, aggSpecs) {
	if (depth >= groupColumns.length) return [];
	const col = groupColumns[depth];
	const buckets = _bucketize(data, indices, col);
	const out = [];
	for (const [key, idxArr] of buckets) {
		const u32 = new Uint32Array(idxArr);
		const path = [...parentPath, key];
		const children = _buildLevel(data, u32, groupColumns, depth + 1, path, allColumns, aggSpecs);
		out.push(Object.freeze({
			key,
			path: Object.freeze(path),
			depth,
			indices: u32,
			children: Object.freeze(children),
			aggregates: _aggregateMany(data, u32, allColumns, aggSpecs)
		}));
	}
	return Object.freeze(out);
}
function _buildGroupTree(data, sortedIndices, groupColumns, allColumns, aggSpecs) {
	return _buildLevel(data, sortedIndices, groupColumns, 0, [], allColumns, aggSpecs);
}
function _pathToId(path) {
	return JSON.stringify(path);
}
function _flattenGroupTree(tree, data, leafDepth, getRowId, collapsedPaths) {
	const out = [];
	const visit = (node) => {
		out.push({
			kind: "group",
			node
		});
		if (collapsedPaths !== void 0 && collapsedPaths.has(_pathToId(node.path))) return;
		if (node.children.length === 0) {
			for (let i = 0; i < node.indices.length; i++) {
				const idx = node.indices[i];
				const row = data[idx];
				out.push({
					kind: "row",
					id: getRowId(row, idx),
					row,
					index: idx,
					depth: leafDepth
				});
			}
			return;
		}
		for (const child of node.children) visit(child);
	};
	for (const top of tree) visit(top);
	return out;
}
//#endregion
//#region src/grouping.ts
const _GROUPING_ATTACHED = Symbol.for("@tarbo-table/core/grouping-attached");
function withGrouping(table) {
	if (table[_GROUPING_ATTACHED] === true) return table;
	withAggregate(table);
	const internal = table[_INTERNAL];
	const aggState = table[_AGGREGATE_STATE];
	let groupBy = Object.freeze([]);
	let collapsed = Object.freeze(/* @__PURE__ */ new Set());
	const resolveGroupCols = () => {
		if (groupBy.length === 0) return null;
		const columns = internal.getColumns();
		const groupCols = [];
		for (const id of groupBy) {
			const col = columns.find((c) => c.id === id);
			if (col) groupCols.push(col);
		}
		return groupCols.length === 0 ? null : groupCols;
	};
	Object.assign(table, {
		setGroupBy(columnIds) {
			groupBy = Object.freeze([...columnIds]);
			collapsed = Object.freeze(/* @__PURE__ */ new Set());
			internal.notify();
		},
		setCollapsedGroups(pathIds) {
			collapsed = Object.freeze(new Set(pathIds));
			internal.notify();
		},
		toggleCollapsed(pathId) {
			const next = new Set(collapsed);
			if (next.has(pathId)) next.delete(pathId);
			else next.add(pathId);
			collapsed = Object.freeze(next);
			internal.notify();
		},
		getGroupBy: () => groupBy,
		getCollapsedGroups: () => collapsed,
		getGroupedRows() {
			const groupCols = resolveGroupCols();
			if (groupCols === null) return [];
			return _buildGroupTree(internal.getData(), internal.getSortedIndices(), groupCols, internal.getColumns(), aggState.getAggSpecsMap());
		},
		getFlatGroupedRows() {
			const groupCols = resolveGroupCols();
			if (groupCols === null) return [];
			return _flattenGroupTree(_buildGroupTree(internal.getData(), internal.getSortedIndices(), groupCols, internal.getColumns(), aggState.getAggSpecsMap()), internal.getData(), groupCols.length, internal.getRowId, collapsed);
		}
	});
	Object.defineProperty(table, _GROUPING_ATTACHED, {
		value: true,
		enumerable: false,
		writable: false,
		configurable: false
	});
	return table;
}
//#endregion
export { withGrouping as t };

//# sourceMappingURL=grouping-DYHreEhW.js.map