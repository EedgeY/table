import { n as _coerceNumber } from "./_utils-GkG6ju0s.js";
//#region src/_aggregate.ts
const PERCENTILE_FNS = Object.freeze({
	median: .5,
	p25: .25,
	p75: .75,
	p90: .9,
	p95: .95,
	p99: .99
});
function _percentile(sorted, q) {
	const n = sorted.length;
	if (n === 0) return NaN;
	if (n === 1) return sorted[0];
	const pos = (n - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	if (lo === hi) return sorted[lo];
	const frac = pos - lo;
	return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}
function _aggregateOne(data, indices, column, fn) {
	if (fn === "count") {
		let n = 0;
		for (const i of indices) {
			const v = column.accessor(data[i]);
			if (v !== null && v !== void 0) n++;
		}
		return n;
	}
	if (fn === "countDistinct") {
		const seen = /* @__PURE__ */ new Set();
		for (const i of indices) {
			const v = column.accessor(data[i]);
			if (v !== null && v !== void 0) seen.add(v);
		}
		return seen.size;
	}
	if (fn in PERCENTILE_FNS) {
		const values = [];
		for (const i of indices) {
			const n = _coerceNumber(column.accessor(data[i]));
			if (n !== null) values.push(n);
		}
		if (values.length === 0) return null;
		values.sort((a, b) => a - b);
		return _percentile(values, PERCENTILE_FNS[fn]);
	}
	let count = 0;
	let sum = 0;
	let sumSq = 0;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const i of indices) {
		const n = _coerceNumber(column.accessor(data[i]));
		if (n === null) continue;
		count++;
		sum += n;
		sumSq += n * n;
		if (n < min) min = n;
		if (n > max) max = n;
	}
	if (count === 0) return null;
	switch (fn) {
		case "sum": return sum;
		case "avg": return sum / count;
		case "min": return min;
		case "max": return max;
		case "variance": {
			const mean = sum / count;
			return sumSq / count - mean * mean;
		}
		case "stddev": {
			const mean = sum / count;
			const v = sumSq / count - mean * mean;
			return Math.sqrt(Math.max(0, v));
		}
		default: return null;
	}
}
function _aggregateMany(data, indices, columns, specs) {
	const out = {};
	for (const id of Object.keys(specs)) {
		const fn = specs[id];
		const col = columns.find((c) => c.id === id);
		if (!col) {
			out[id] = null;
			continue;
		}
		out[id] = _aggregateOne(data, indices, col, fn);
	}
	return Object.freeze(out);
}
//#endregion
export { _aggregateOne as n, _aggregateMany as t };

//# sourceMappingURL=_aggregate-CE3a7yZM.js.map