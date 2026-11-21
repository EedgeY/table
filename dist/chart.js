import { aggregate } from "./aggregate.js";
//#region src/chart.ts
function metricLabel(fn, columnId) {
	return `${fn}(${columnId})`;
}
function buildChartData(rows, columns, config) {
	const perMetric = config.metrics.map((m) => aggregate(rows, columns, {
		groupBy: config.groupBy,
		columns: { [m.columnId]: m.fn }
	}));
	const keyOrder = [];
	const seen = /* @__PURE__ */ new Set();
	const values = /* @__PURE__ */ new Map();
	const keyId = (k) => JSON.stringify(k);
	for (let mi = 0; mi < perMetric.length; mi++) {
		const buckets = perMetric[mi];
		const colId = config.metrics[mi].columnId;
		for (const b of buckets) {
			const id = keyId(b.key);
			if (!seen.has(id)) {
				seen.add(id);
				keyOrder.push(b.key);
				values.set(id, new Array(config.metrics.length).fill(null));
			}
			values.get(id)[mi] = b.values[colId] ?? null;
		}
	}
	if (config.type === "bubble") {
		const [mx, my, mr] = config.metrics;
		return Object.freeze({
			type: "bubble",
			points: Object.freeze(keyOrder.map((key) => {
				const v = values.get(keyId(key));
				return Object.freeze({
					key,
					x: v[0] ?? null,
					y: v[1] ?? null,
					r: v[2] ?? null
				});
			})),
			axisLabels: Object.freeze({
				x: mx ? metricLabel(mx.fn, mx.columnId) : "",
				y: my ? metricLabel(my.fn, my.columnId) : "",
				r: mr ? metricLabel(mr.fn, mr.columnId) : ""
			})
		});
	}
	const metricLabels = config.metrics.map((m) => metricLabel(m.fn, m.columnId));
	return Object.freeze({
		type: config.type,
		categories: Object.freeze(keyOrder.map((key) => Object.freeze({
			key,
			values: Object.freeze([...values.get(keyId(key))])
		}))),
		metricLabels: Object.freeze(metricLabels)
	});
}
//#endregion
export { buildChartData };

//# sourceMappingURL=chart.js.map