import { t as _INTERNAL } from "./create-table-BDxHjkHt.js";
//#region src/focus.ts
const _FOCUS_ATTACHED = Symbol.for("@tarbo-table/core/focus-attached");
function withFocus(table) {
	if (table[_FOCUS_ATTACHED] === true) return table;
	const internal = table[_INTERNAL];
	let focus = null;
	let range = null;
	const listeners = /* @__PURE__ */ new Set();
	const notifyFocus = () => {
		for (const l of listeners) l(focus);
		internal.notify();
	};
	const setFocus = (next) => {
		if (next === focus) return;
		if (next !== null && focus !== null && next.rowId === focus.rowId && next.columnId === focus.columnId) return;
		focus = next === null ? null : Object.freeze({
			rowId: next.rowId,
			columnId: next.columnId
		});
		notifyFocus();
	};
	const visibleColumnIds = () => table.getVisibleColumns().map((c) => c.id);
	const pagedRowIds = () => table.getPagedRows().map((r) => r.id);
	const moveFocus = (direction, pageSize = 10) => {
		const cols = visibleColumnIds();
		const rows = pagedRowIds();
		if (cols.length === 0 || rows.length === 0) return null;
		if (focus === null) {
			const initial = {
				rowId: rows[0],
				columnId: cols[0]
			};
			setFocus(initial);
			return initial;
		}
		const ri = rows.indexOf(focus.rowId);
		const ci = cols.indexOf(focus.columnId);
		const safeRi = ri < 0 ? 0 : ri;
		const safeCi = ci < 0 ? 0 : ci;
		let nextRi = safeRi;
		let nextCi = safeCi;
		switch (direction) {
			case "up":
				nextRi = Math.max(0, safeRi - 1);
				break;
			case "down":
				nextRi = Math.min(rows.length - 1, safeRi + 1);
				break;
			case "left":
				nextCi = Math.max(0, safeCi - 1);
				break;
			case "right":
				nextCi = Math.min(cols.length - 1, safeCi + 1);
				break;
			case "home":
				nextCi = 0;
				break;
			case "end":
				nextCi = cols.length - 1;
				break;
			case "pageUp":
				nextRi = Math.max(0, safeRi - pageSize);
				break;
			case "pageDown":
				nextRi = Math.min(rows.length - 1, safeRi + pageSize);
				break;
		}
		const next = {
			rowId: rows[nextRi],
			columnId: cols[nextCi]
		};
		setFocus(next);
		return next;
	};
	const rangeBounds = (r) => {
		const rows = pagedRowIds();
		const cols = visibleColumnIds();
		const a1 = rows.indexOf(r.anchor.rowId);
		const a2 = rows.indexOf(r.head.rowId);
		const b1 = cols.indexOf(r.anchor.columnId);
		const b2 = cols.indexOf(r.head.columnId);
		if (a1 < 0 || a2 < 0 || b1 < 0 || b2 < 0) return {
			rowIds: [],
			columnIds: []
		};
		const rLo = Math.min(a1, a2);
		const rHi = Math.max(a1, a2);
		const cLo = Math.min(b1, b2);
		const cHi = Math.max(b1, b2);
		return {
			rowIds: rows.slice(rLo, rHi + 1),
			columnIds: cols.slice(cLo, cHi + 1)
		};
	};
	const setRange = (next) => {
		range = next === null ? null : Object.freeze({
			anchor: { ...next.anchor },
			head: { ...next.head }
		});
		internal.notify();
	};
	Object.assign(table, {
		getFocus: () => focus,
		setFocus(next) {
			setFocus(next);
			if (range !== null) {
				range = null;
				internal.notify();
			}
		},
		clearFocus: () => setFocus(null),
		moveFocus(direction, pageSize) {
			const result = moveFocus(direction, pageSize);
			if (range !== null) {
				range = null;
				internal.notify();
			}
			return result;
		},
		subscribeFocus(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getRange: () => range,
		setRange,
		beginRange() {
			if (focus === null) return;
			setRange({
				anchor: focus,
				head: focus
			});
		},
		extendRange(direction, pageSize) {
			if (focus === null) {
				const next = moveFocus(direction, pageSize);
				if (next === null) return;
				setRange({
					anchor: next,
					head: next
				});
				return;
			}
			const anchor = range ? range.anchor : focus;
			const next = moveFocus(direction, pageSize);
			if (next === null) return;
			setRange({
				anchor,
				head: next
			});
		},
		clearRange() {
			if (range === null) return;
			range = null;
			internal.notify();
		},
		getRangeCells() {
			if (range === null) return focus !== null ? [{
				rowId: focus.rowId,
				columnId: focus.columnId
			}] : [];
			const { rowIds, columnIds } = rangeBounds(range);
			const out = [];
			for (const rid of rowIds) for (const cid of columnIds) out.push({
				rowId: rid,
				columnId: cid
			});
			return out;
		}
	});
	Object.defineProperty(table, _FOCUS_ATTACHED, {
		value: true,
		enumerable: false,
		writable: false,
		configurable: false
	});
	return table;
}
//#endregion
export { withFocus };

//# sourceMappingURL=focus.js.map