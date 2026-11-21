//#region src/conditional-style.ts
function evaluateCellStyle(input) {
	let merged = {};
	for (const rule of input.rules) {
		const s = _applyRule(rule, input.row, input.value);
		if (s !== null) merged = {
			...merged,
			...s
		};
	}
	return Object.freeze(merged);
}
function _applyRule(rule, row, value) {
	switch (rule.kind) {
		case "fn": return rule.compute({
			row,
			value
		});
		case "compare":
			if (typeof value !== "number") return null;
			return _cmp(rule.op, value, rule.threshold) ? rule.style : null;
		case "between":
			if (typeof value !== "number") return null;
			if (value >= rule.min && value <= rule.max) return rule.style;
			return null;
		case "scale": {
			if (typeof value !== "number") return null;
			const t = _clamp01((value - rule.min) / (rule.max - rule.min || 1));
			return { backgroundColor: _lerpColor(rule.minColor, rule.maxColor, t) };
		}
		case "bar": {
			if (typeof value !== "number") return null;
			const t = _clamp01((value - rule.min) / (rule.max - rule.min || 1));
			const pct = Math.round(t * 100);
			return { backgroundColor: `linear-gradient(to right, ${rule.color} 0%, ${rule.color} ${pct}%, transparent ${pct}%, transparent 100%)` };
		}
	}
}
function _cmp(op, a, b) {
	switch (op) {
		case ">": return a > b;
		case "<": return a < b;
		case ">=": return a >= b;
		case "<=": return a <= b;
		case "=": return a === b;
		case "!=": return a !== b;
	}
}
function _clamp01(t) {
	if (!Number.isFinite(t)) return 0;
	return t < 0 ? 0 : t > 1 ? 1 : t;
}
function _lerpColor(a, b, t) {
	const ca = _parseColor(a);
	const cb = _parseColor(b);
	if (ca === null || cb === null) return a;
	return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)}, ${Math.round(ca[1] + (cb[1] - ca[1]) * t)}, ${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`;
}
function _parseColor(s) {
	const trimmed = s.trim();
	const m = trimmed.match(/^#([0-9a-fA-F]{6})$/);
	if (m) {
		const hex = m[1];
		return [
			parseInt(hex.slice(0, 2), 16),
			parseInt(hex.slice(2, 4), 16),
			parseInt(hex.slice(4, 6), 16)
		];
	}
	const m3 = trimmed.match(/^#([0-9a-fA-F]{3})$/);
	if (m3) {
		const hex = m3[1];
		return [
			parseInt(hex[0] + hex[0], 16),
			parseInt(hex[1] + hex[1], 16),
			parseInt(hex[2] + hex[2], 16)
		];
	}
	const mr = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
	if (mr) return [
		Number(mr[1]),
		Number(mr[2]),
		Number(mr[3])
	];
	return null;
}
function _getColumnRules(column) {
	return column.cellStyle?.rules ?? [];
}
//#endregion
export { _getColumnRules, _lerpColor, evaluateCellStyle };

//# sourceMappingURL=conditional-style.js.map