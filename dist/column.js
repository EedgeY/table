//#region src/column.ts
function defaultFilterableFor(type) {
	switch (type) {
		case "image":
		case "sparkline": return false;
		case "string":
		case "number":
		case "boolean":
		case "link":
		case "checkbox":
		case "relation":
		case "relation-many":
		case "star":
		case "tags":
		case "progress":
		case "user":
		case void 0: return true;
	}
}
function defaultSortableFor(type) {
	switch (type) {
		case "image": return false;
		case "string":
		case "number":
		case "boolean":
		case "link":
		case "sparkline":
		case "checkbox":
		case "relation":
		case "relation-many":
		case "star":
		case "tags":
		case "progress":
		case "user":
		case void 0: return true;
	}
}
function isColumnLeaf(node) {
	return node.kind !== "group";
}
function isColumnGroup(node) {
	return node.kind === "group";
}
function flattenColumns(nodes) {
	const out = [];
	const stack = [...nodes];
	const walk = (n) => {
		if (isColumnGroup(n)) for (const c of n.children) walk(c);
		else {
			const { kind: _kind, ...rest } = n;
			out.push(rest);
		}
	};
	for (const n of stack) walk(n);
	return out;
}
//#endregion
export { defaultFilterableFor, defaultSortableFor, flattenColumns, isColumnGroup, isColumnLeaf };

//# sourceMappingURL=column.js.map