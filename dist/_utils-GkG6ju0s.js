//#region src/_utils.ts
function _coerceNumber(v) {
	if (v == null || v === "") return null;
	if (typeof v === "number") return Number.isFinite(v) ? v : null;
	if (typeof v === "boolean") return v ? 1 : 0;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}
function _cmpAny(a, b, nullsLast) {
	const aNull = a == null;
	const bNull = b == null;
	if (aNull && bNull) return 0;
	if (aNull) return nullsLast ? 1 : -1;
	if (bNull) return nullsLast ? -1 : 1;
	if (typeof a === "number" && typeof b === "number") return a - b;
	const sa = String(a);
	const sb = String(b);
	return sa < sb ? -1 : sa > sb ? 1 : 0;
}
//#endregion
export { _coerceNumber as n, _cmpAny as t };

//# sourceMappingURL=_utils-GkG6ju0s.js.map