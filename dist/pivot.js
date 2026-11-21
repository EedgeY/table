import { n as _aggregateOne } from "./_aggregate-CE3a7yZM.js";
//#region src/pivot.ts
function _buildAxis(data, indices, columns, axisColIds) {
	if (axisColIds.length === 0) return {
		tree: [],
		leafCount: 1,
		leafBuckets: [[...indices]]
	};
	const cols = axisColIds.map((id) => columns.find((c) => c.id === id) ?? null);
	for (let i = 0; i < cols.length; i++) if (cols[i] === null) return {
		tree: [],
		leafCount: 0,
		leafBuckets: []
	};
	let leafCount = 0;
	const leafBuckets = [];
	const build = (idxList, depth, path) => {
		if (depth >= cols.length) return [];
		const col = cols[depth];
		const buckets = /* @__PURE__ */ new Map();
		for (const i of idxList) {
			const k = col.accessor(data[i]);
			const norm = k === void 0 ? null : k;
			let arr = buckets.get(norm);
			if (!arr) {
				arr = [];
				buckets.set(norm, arr);
			}
			arr.push(i);
		}
		const out = [];
		for (const [key, idxArr] of buckets) {
			const nextPath = [...path, key];
			if (depth === cols.length - 1) {
				const leafIdx = leafCount++;
				leafBuckets.push(idxArr);
				out.push(Object.freeze({
					key,
					path: Object.freeze(nextPath),
					children: Object.freeze([]),
					leafIndex: leafIdx
				}));
			} else out.push(Object.freeze({
				key,
				path: Object.freeze(nextPath),
				children: Object.freeze(build(idxArr, depth + 1, nextPath)),
				leafIndex: -1
			}));
		}
		return out;
	};
	return {
		tree: build(idxList(indices), 0, []),
		leafCount,
		leafBuckets
	};
}
function idxList(indices) {
	return Array.isArray(indices) ? indices : Array.from(indices);
}
function pivot(rows, columns, indices, config) {
	const valueCols = config.values.map((v) => ({
		spec: v,
		col: columns.find((c) => c.id === v.columnId) ?? null
	}));
	const rowAxis = _buildAxis(rows, indices, columns, config.rows);
	const colAxis = _buildAxis(rows, indices, columns, config.cols);
	const valueWidth = config.values.length;
	const matrix = new Array(Math.max(1, rowAxis.leafCount));
	for (let r = 0; r < matrix.length; r++) matrix[r] = new Array(Math.max(1, colAxis.leafCount) * valueWidth).fill(null);
	for (let r = 0; r < Math.max(1, rowAxis.leafCount); r++) {
		const rowIndices = rowAxis.leafBuckets[r] ?? [];
		for (let c = 0; c < Math.max(1, colAxis.leafCount); c++) {
			const colIndices = colAxis.leafBuckets[c] ?? [];
			const rowSet = new Set(rowIndices);
			const cellIndices = [];
			for (const i of colIndices) if (rowSet.has(i)) cellIndices.push(i);
			for (let v = 0; v < valueWidth; v++) {
				const { spec, col } = valueCols[v];
				if (col === null || cellIndices.length === 0) matrix[r][c * valueWidth + v] = null;
				else matrix[r][c * valueWidth + v] = _aggregateOne(rows, cellIndices, col, spec.fn);
			}
		}
	}
	return Object.freeze({
		matrix: Object.freeze(matrix.map((r) => Object.freeze(r))),
		rowAxis: Object.freeze(rowAxis.tree),
		colAxis: Object.freeze(colAxis.tree),
		values: Object.freeze([...config.values])
	});
}
//#endregion
export { pivot };

//# sourceMappingURL=pivot.js.map