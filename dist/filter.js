//#region src/filter.ts
function leaf(columnId, op, value, caseSensitive) {
	return Object.freeze(caseSensitive === void 0 ? {
		kind: "leaf",
		columnId,
		op,
		value
	} : {
		kind: "leaf",
		columnId,
		op,
		value,
		caseSensitive
	});
}
function group(combinator, children) {
	return Object.freeze({
		kind: "group",
		combinator,
		children: Object.freeze(children.slice())
	});
}
function and(...children) {
	return group("and", children);
}
function or(...children) {
	return group("or", children);
}
function not(p) {
	return Object.freeze({
		kind: "group",
		combinator: "and",
		children: Object.freeze([p]),
		negate: true
	});
}
function column(cf) {
	const children = cf.conditions.map((c) => leaf(cf.columnId, c.op, c.value, c.caseSensitive));
	return group(cf.combinator, children);
}
const f = Object.freeze({
	leaf,
	and,
	or,
	not,
	column
});
//#endregion
export { f };

//# sourceMappingURL=filter.js.map