import { _INTERNAL, type TableInstance, type TableInternal } from './create-table.ts';
import type { RowId } from './_types.ts';

export type CellFocus = {
	readonly rowId: RowId;
	readonly columnId: string;
};

/**
 * 範囲選択。anchor は範囲の起点 (Shift+Click 元)、head は終点 (現在のフォーカス)。
 * 矩形は anchor と head から計算する。
 */
export type CellRange = {
	readonly anchor: CellFocus;
	readonly head: CellFocus;
};

export type FocusListener = (focus: CellFocus | null) => void;

export type FocusMoveDirection =
	| 'up'
	| 'down'
	| 'left'
	| 'right'
	| 'home'
	| 'end'
	| 'pageUp'
	| 'pageDown';

export type FocusMixin = {
	getFocus: () => CellFocus | null;
	setFocus: (focus: CellFocus | null) => void;
	clearFocus: () => void;
	/**
	 * 現在の focus から方向移動して新しい focus を計算 & セット。
	 * pageSize は PageUp/Down 時に使う (viewport から渡す)。
	 * 戻り値: 移動後の focus (空テーブルなら null)。
	 */
	moveFocus: (direction: FocusMoveDirection, pageSize?: number) => CellFocus | null;
	/** focus のみを購読 (TableState とは独立)。 */
	subscribeFocus: (listener: FocusListener) => () => void;
	getRange: () => CellRange | null;
	/** 矩形を直接セット (アンカーとヘッドを与える)。 */
	setRange: (range: CellRange | null) => void;
	/** 現在のフォーカスを anchor にして range を開始。 */
	beginRange: () => void;
	/** anchor を保ったまま head のみ移動 (Shift+Arrow 等)。 */
	extendRange: (direction: FocusMoveDirection, pageSize?: number) => void;
	clearRange: () => void;
	/**
	 * 現在の range が含むセル位置 (rowId, columnId) を全列挙。
	 * クリップボードコピー等の用途。
	 */
	getRangeCells: () => ReadonlyArray<{ readonly rowId: RowId; readonly columnId: string }>;
};

const _FOCUS_ATTACHED: unique symbol = Symbol.for('@tarbo-table/core/focus-attached') as never;

export function withFocus<TRow>(table: TableInstance<TRow>): TableInstance<TRow> & FocusMixin {
	const flagged = (table as unknown as { [_FOCUS_ATTACHED]?: true })[_FOCUS_ATTACHED];
	if (flagged === true) {
		return table as TableInstance<TRow> & FocusMixin;
	}

	const internal = (table as unknown as { [_INTERNAL]: TableInternal<TRow> })[_INTERNAL];
	let focus: CellFocus | null = null;
	let range: CellRange | null = null;
	const listeners = new Set<FocusListener>();

	const notifyFocus = (): void => {
		for (const l of listeners) {
			l(focus);
		}
		internal.notify();
	};

	const setFocus = (next: CellFocus | null): void => {
		if (next === focus) return;
		if (
			next !== null &&
			focus !== null &&
			next.rowId === focus.rowId &&
			next.columnId === focus.columnId
		) {
			return;
		}
		focus = next === null ? null : Object.freeze({ rowId: next.rowId, columnId: next.columnId });
		notifyFocus();
	};

	const visibleColumnIds = (): string[] => table.getVisibleColumns().map((c) => c.id);
	const pagedRowIds = (): RowId[] => table.getPagedRows().map((r) => r.id);

	const moveFocus = (direction: FocusMoveDirection, pageSize = 10): CellFocus | null => {
		const cols = visibleColumnIds();
		const rows = pagedRowIds();
		if (cols.length === 0 || rows.length === 0) {
			return null;
		}
		if (focus === null) {
			const initial: CellFocus = { rowId: rows[0]!, columnId: cols[0]! };
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
			case 'up': {
				nextRi = Math.max(0, safeRi - 1);
				break;
			}
			case 'down': {
				nextRi = Math.min(rows.length - 1, safeRi + 1);
				break;
			}
			case 'left': {
				nextCi = Math.max(0, safeCi - 1);
				break;
			}
			case 'right': {
				nextCi = Math.min(cols.length - 1, safeCi + 1);
				break;
			}
			case 'home': {
				nextCi = 0;
				break;
			}
			case 'end': {
				nextCi = cols.length - 1;
				break;
			}
			case 'pageUp': {
				nextRi = Math.max(0, safeRi - pageSize);
				break;
			}
			case 'pageDown': {
				nextRi = Math.min(rows.length - 1, safeRi + pageSize);
				break;
			}
		}
		const next: CellFocus = { rowId: rows[nextRi]!, columnId: cols[nextCi]! };
		setFocus(next);
		return next;
	};

	const rangeBounds = (
		r: CellRange,
	): {
		rowIds: ReadonlyArray<RowId>;
		columnIds: ReadonlyArray<string>;
	} => {
		const rows = pagedRowIds();
		const cols = visibleColumnIds();
		const a1 = rows.indexOf(r.anchor.rowId);
		const a2 = rows.indexOf(r.head.rowId);
		const b1 = cols.indexOf(r.anchor.columnId);
		const b2 = cols.indexOf(r.head.columnId);
		if (a1 < 0 || a2 < 0 || b1 < 0 || b2 < 0) {
			return { rowIds: [], columnIds: [] };
		}
		const rLo = Math.min(a1, a2);
		const rHi = Math.max(a1, a2);
		const cLo = Math.min(b1, b2);
		const cHi = Math.max(b1, b2);
		return {
			rowIds: rows.slice(rLo, rHi + 1),
			columnIds: cols.slice(cLo, cHi + 1),
		};
	};

	const setRange = (next: CellRange | null): void => {
		range =
			next === null ? null : Object.freeze({ anchor: { ...next.anchor }, head: { ...next.head } });
		internal.notify();
	};

	const mixin: FocusMixin = {
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
			setRange({ anchor: focus, head: focus });
		},
		extendRange(direction, pageSize) {
			if (focus === null) {
				const next = moveFocus(direction, pageSize);
				if (next === null) return;
				setRange({ anchor: next, head: next });
				return;
			}
			const anchor = range ? range.anchor : focus;
			const next = moveFocus(direction, pageSize);
			if (next === null) return;
			setRange({ anchor, head: next });
		},
		clearRange() {
			if (range === null) return;
			range = null;
			internal.notify();
		},
		getRangeCells() {
			if (range === null) {
				return focus !== null ? [{ rowId: focus.rowId, columnId: focus.columnId }] : [];
			}
			const { rowIds, columnIds } = rangeBounds(range);
			const out: { rowId: RowId; columnId: string }[] = [];
			for (const rid of rowIds) {
				for (const cid of columnIds) {
					out.push({ rowId: rid, columnId: cid });
				}
			}
			return out;
		},
	};

	Object.assign(table, mixin);
	Object.defineProperty(table, _FOCUS_ATTACHED, {
		value: true,
		enumerable: false,
		writable: false,
		configurable: false,
	});
	return table as TableInstance<TRow> & FocusMixin;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	const { createTable } = await import('./create-table.ts');
	type Row = { id: number; name: string };
	const cols = [
		{ id: 'id', accessor: (r: Row) => r.id },
		{ id: 'name', accessor: (r: Row) => r.name },
	];
	const data: Row[] = [
		{ id: 1, name: 'a' },
		{ id: 2, name: 'b' },
		{ id: 3, name: 'c' },
	];

	describe('withFocus', () => {
		it('attach 後は focus を取得・設定できる', () => {
			const t = withFocus(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			expect(t.getFocus()).toBeNull();
			t.setFocus({ rowId: '1' as RowId, columnId: 'name' });
			expect(t.getFocus()).toEqual({ rowId: '1', columnId: 'name' });
		});

		it('moveFocus(down)/(right) で 1 セルずつ移動', () => {
			const t = withFocus(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			t.setFocus({ rowId: '1' as RowId, columnId: 'id' });
			expect(t.moveFocus('right')).toEqual({ rowId: '1', columnId: 'name' });
			expect(t.moveFocus('down')).toEqual({ rowId: '2', columnId: 'name' });
		});

		it('境界で止まる (up/left at origin)', () => {
			const t = withFocus(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			t.setFocus({ rowId: '1' as RowId, columnId: 'id' });
			expect(t.moveFocus('up')).toEqual({ rowId: '1', columnId: 'id' });
			expect(t.moveFocus('left')).toEqual({ rowId: '1', columnId: 'id' });
		});

		it('home/end で行先頭/末尾の列へ', () => {
			const t = withFocus(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			t.setFocus({ rowId: '1' as RowId, columnId: 'id' });
			expect(t.moveFocus('end')).toEqual({ rowId: '1', columnId: 'name' });
			expect(t.moveFocus('home')).toEqual({ rowId: '1', columnId: 'id' });
		});

		it('focus 未設定で move すると 0,0 から開始', () => {
			const t = withFocus(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			expect(t.moveFocus('down')).toEqual({ rowId: '1', columnId: 'id' });
		});

		it('clearFocus で null になる', () => {
			const t = withFocus(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			t.setFocus({ rowId: '1' as RowId, columnId: 'name' });
			t.clearFocus();
			expect(t.getFocus()).toBeNull();
		});

		it('subscribeFocus が変更を通知', () => {
			const t = withFocus(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			let last: CellFocus | null = null;
			t.subscribeFocus((f) => {
				last = f;
			});
			t.setFocus({ rowId: '1' as RowId, columnId: 'id' });
			expect(last).toEqual({ rowId: '1', columnId: 'id' });
		});

		it('冪等: 2 回 attach しても同じ table', () => {
			const base = createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) });
			const a = withFocus(base);
			const b = withFocus(a);
			expect(a).toBe(b);
		});

		it('pageDown で pageSize 分ジャンプ', () => {
			const big = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: String(i) }));
			const t = withFocus(
				createTable<Row>({ data: big, columns: cols, getRowId: (r) => String(r.id) }),
			);
			t.setFocus({ rowId: '1' as RowId, columnId: 'id' });
			const after = t.moveFocus('pageDown', 5);
			expect(after?.rowId).toBe('6');
		});

		it('rowId が消えた場合は先頭行に吸着', () => {
			const t = withFocus(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			t.setFocus({ rowId: '999' as RowId, columnId: 'id' });
			const after = t.moveFocus('right');
			expect(after?.rowId).toBe('1');
		});

		it('beginRange / extendRange で矩形が拡がる', () => {
			const t = withFocus(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			t.setFocus({ rowId: '1' as RowId, columnId: 'id' });
			t.beginRange();
			t.extendRange('down');
			t.extendRange('right');
			const cells = t.getRangeCells();
			expect(cells).toHaveLength(4);
		});

		it('setFocus で range はクリア', () => {
			const t = withFocus(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			t.setFocus({ rowId: '1' as RowId, columnId: 'id' });
			t.beginRange();
			t.extendRange('down');
			expect(t.getRange()).not.toBeNull();
			t.setFocus({ rowId: '2' as RowId, columnId: 'name' });
			expect(t.getRange()).toBeNull();
		});

		it('range なしで getRangeCells はフォーカスセル単独', () => {
			const t = withFocus(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			t.setFocus({ rowId: '1' as RowId, columnId: 'id' });
			expect(t.getRangeCells()).toEqual([{ rowId: '1', columnId: 'id' }]);
		});
	});
}
