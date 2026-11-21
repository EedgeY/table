import { isColumnGroup } from "./column.js";
//#region src/_header-layout.ts
function _depth(node) {
	if (!isColumnGroup(node)) return 1;
	let max = 0;
	for (const c of node.children) {
		const d = _depth(c);
		if (d > max) max = d;
	}
	return 1 + max;
}
function _leafCount(node) {
	if (!isColumnGroup(node)) return 1;
	let total = 0;
	for (const c of node.children) total += _leafCount(c);
	return total;
}
function _buildHeaderLayout(nodes) {
	let totalDepth = 0;
	for (const n of nodes) {
		const d = _depth(n);
		if (d > totalDepth) totalDepth = d;
	}
	if (totalDepth === 0) return [];
	const rows = Array.from({ length: totalDepth }, () => []);
	const placeNode = (node, row) => {
		if (isColumnGroup(node)) {
			rows[row].push({
				id: node.id,
				label: node.header,
				colSpan: _leafCount(node),
				rowSpan: 1,
				isLeaf: false
			});
			for (const c of node.children) placeNode(c, row + 1);
		} else rows[row].push({
			id: node.id,
			label: node.header ?? node.id,
			colSpan: 1,
			rowSpan: totalDepth - row,
			isLeaf: true,
			columnId: node.id
		});
	};
	for (const n of nodes) placeNode(n, 0);
	const out = [];
	for (const r of rows) if (r.length > 0) out.push(r);
	return out;
}
//#endregion
//#region src/header.ts
function buildHeaderMatrix(nodes) {
	return _buildHeaderLayout(nodes);
}
//#endregion
export { buildHeaderMatrix as t };

//# sourceMappingURL=header-Dh8PZjss.js.map