import type { ColumnPinningState, ColumnSizingState, ColumnVisibilityState } from './column.ts';
import type { Predicate } from './filter.ts';
import type { PaginationState } from './pagination.ts';
import type { SortSpec } from './sort.ts';
import { _INTERNAL, type TableInstance, type TableInternal } from './create-table.ts';

export type PersistInclude =
	| 'predicate'
	| 'sort'
	| 'pagination'
	| 'columnSizing'
	| 'columnVisibility'
	| 'columnPinning'
	| 'grouping';

export type Snapshot = {
	readonly v: 1;
	readonly predicate?: Predicate | null;
	readonly sort?: SortSpec;
	readonly pagination?: PaginationState;
	readonly columnSizing?: ColumnSizingState;
	readonly columnVisibility?: ColumnVisibilityState;
	readonly columnPinning?: ColumnPinningState;
	readonly grouping?: ReadonlyArray<string>;
};

export interface PersistStorage {
	readonly load: (key: string) => string | null;
	readonly save: (key: string, value: string) => void;
}

export type PersistOptions = {
	readonly key: string;
	readonly storage?: 'local' | 'url' | PersistStorage;
	/** 保存対象を絞り込む。未指定なら全項目。 */
	readonly include?: ReadonlyArray<PersistInclude>;
	/** 書き込み debounce (連続変更を 1 回に集約)。既定 100ms。 */
	readonly debounceMs?: number;
};

const URL_PARAM_KEY = (key: string): string => `tt_${key}`;

function _localStorageBackend(): PersistStorage | null {
	if (typeof window === 'undefined') return null;
	try {
		const ls = window.localStorage;
		if (!ls) return null;
		return {
			load: (k) => ls.getItem(k),
			save: (k, v) => {
				ls.setItem(k, v);
			},
		};
	} catch {
		return null;
	}
}

function _urlBackend(key: string): PersistStorage | null {
	if (typeof window === 'undefined') return null;
	const param = URL_PARAM_KEY(key);
	return {
		load: () => {
			try {
				const u = new URL(window.location.href);
				return u.searchParams.get(param);
			} catch {
				return null;
			}
		},
		save: (_k, v) => {
			const u = new URL(window.location.href);
			if (v === '') {
				u.searchParams.delete(param);
			} else {
				u.searchParams.set(param, v);
			}
			window.history.replaceState(null, '', u.toString());
		},
	};
}

function _resolveStorage(opts: PersistOptions): PersistStorage | null {
	const s = opts.storage ?? 'local';
	if (s === 'local') return _localStorageBackend();
	if (s === 'url') return _urlBackend(opts.key);
	return s;
}

function _serialize(snapshot: Snapshot): string {
	return JSON.stringify(snapshot);
}

function _deserialize(raw: string): Snapshot | null {
	try {
		const o = JSON.parse(raw) as Snapshot;
		if (typeof o !== 'object' || o === null || o.v !== 1) return null;
		return o;
	} catch {
		return null;
	}
}

export function _captureSnapshot<TRow>(
	table: TableInstance<TRow>,
	include: ReadonlySet<PersistInclude>,
): Snapshot {
	const state = table.getState();
	const out: {
		v: 1;
		predicate?: Predicate | null;
		sort?: SortSpec;
		pagination?: PaginationState;
		columnSizing?: ColumnSizingState;
		columnVisibility?: ColumnVisibilityState;
		columnPinning?: ColumnPinningState;
		grouping?: ReadonlyArray<string>;
	} = { v: 1 };
	if (include.has('predicate')) out.predicate = state.predicate;
	if (include.has('sort')) out.sort = state.sort;
	if (include.has('pagination')) out.pagination = state.pagination;
	if (include.has('columnSizing')) out.columnSizing = state.columnSizing;
	if (include.has('columnVisibility')) out.columnVisibility = state.columnVisibility;
	if (include.has('columnPinning')) out.columnPinning = state.columnPinning;
	if (include.has('grouping')) {
		const gb = (table as unknown as { getGroupBy?: () => ReadonlyArray<string> }).getGroupBy;
		if (typeof gb === 'function') {
			out.grouping = gb();
		}
	}
	return out;
}

export function _applySnapshot<TRow>(
	table: TableInstance<TRow>,
	snap: Snapshot,
	include: ReadonlySet<PersistInclude>,
): void {
	if (include.has('predicate') && snap.predicate !== undefined) {
		table.setPredicate(snap.predicate);
	}
	if (include.has('sort') && snap.sort !== undefined) {
		table.setSort(snap.sort);
	}
	if (include.has('pagination') && snap.pagination !== undefined) {
		table.setPagination(snap.pagination);
	}
	if (include.has('columnSizing') && snap.columnSizing !== undefined) {
		for (const id of Object.keys(snap.columnSizing)) {
			const w = snap.columnSizing[id];
			if (typeof w === 'number') {
				table.setColumnWidth(id, w);
			}
		}
	}
	if (include.has('columnVisibility') && snap.columnVisibility !== undefined) {
		for (const id of Object.keys(snap.columnVisibility)) {
			table.setColumnVisibility(id, snap.columnVisibility[id] !== false);
		}
	}
	if (include.has('columnPinning') && snap.columnPinning !== undefined) {
		for (const id of Object.keys(snap.columnPinning)) {
			const p = snap.columnPinning[id];
			if (p === 'left' || p === 'right') table.setColumnPinning(id, p);
		}
	}
	if (include.has('grouping') && snap.grouping !== undefined) {
		const setGroupBy = (
			table as unknown as {
				setGroupBy?: (ids: ReadonlyArray<string>) => void;
			}
		).setGroupBy;
		if (typeof setGroupBy === 'function') {
			setGroupBy(snap.grouping);
		}
	}
}

export type PersistMixin = {
	/** 現在の state を即時に保存 (debounce を待たない)。 */
	flushPersist: () => void;
	/** 保存済みデータを読み直して適用。 */
	reloadPersist: () => void;
	/** 永続化を停止 & 保存済みデータも削除。 */
	clearPersist: () => void;
};

const _PERSIST_ATTACHED: unique symbol = Symbol.for('@tarbo-table/core/persist-attached') as never;

/**
 * `TableInstance` に永続化を attach する。create 直後に呼ぶこと。
 * `withGrouping` を併用する場合は `withGrouping(t)` の後に呼ぶと
 * grouping 状態も保存対象になる。
 */
export function withPersist<TRow>(
	table: TableInstance<TRow>,
	opts: PersistOptions,
): TableInstance<TRow> & PersistMixin {
	const flagged = (table as unknown as { [_PERSIST_ATTACHED]?: true })[_PERSIST_ATTACHED];
	if (flagged === true) {
		return table as TableInstance<TRow> & PersistMixin;
	}
	const internal = (table as unknown as { [_INTERNAL]: TableInternal<TRow> })[_INTERNAL];

	const storage = _resolveStorage(opts);
	const include: ReadonlySet<PersistInclude> = new Set(
		opts.include ?? [
			'predicate',
			'sort',
			'pagination',
			'columnSizing',
			'columnVisibility',
			'columnPinning',
			'grouping',
		],
	);
	const debounceMs = opts.debounceMs ?? 100;

	let suppress = false;
	let pending: ReturnType<typeof setTimeout> | null = null;

	const flush = (): void => {
		if (!storage || suppress) return;
		if (pending !== null) {
			clearTimeout(pending);
			pending = null;
		}
		const snap = _captureSnapshot(table, include);
		storage.save(opts.key, _serialize(snap));
	};

	const schedule = (): void => {
		if (!storage || suppress) return;
		if (pending !== null) clearTimeout(pending);
		pending = setTimeout(() => {
			pending = null;
			flush();
		}, debounceMs);
	};

	if (storage) {
		const raw = storage.load(opts.key);
		if (raw !== null) {
			const snap = _deserialize(raw);
			if (snap !== null) {
				suppress = true;
				try {
					_applySnapshot(table, snap, include);
				} finally {
					suppress = false;
				}
			}
		}
	}

	const unsubscribe = table.subscribe(() => {
		schedule();
	});

	const mixin: PersistMixin = {
		flushPersist: flush,
		reloadPersist() {
			if (!storage) return;
			const raw = storage.load(opts.key);
			if (raw === null) return;
			const snap = _deserialize(raw);
			if (snap === null) return;
			suppress = true;
			try {
				_applySnapshot(table, snap, include);
			} finally {
				suppress = false;
			}
			internal.notify();
		},
		clearPersist() {
			if (pending !== null) {
				clearTimeout(pending);
				pending = null;
			}
			if (storage) storage.save(opts.key, '');
			unsubscribe();
		},
	};

	Object.assign(table, mixin);
	Object.defineProperty(table, _PERSIST_ATTACHED, {
		value: true,
		enumerable: false,
		writable: false,
		configurable: false,
	});
	return table as TableInstance<TRow> & PersistMixin;
}

if (import.meta.vitest) {
	const { describe, it, expect, vi } = import.meta.vitest;
	const { createTable } = await import('./create-table.ts');
	type Row = { id: number; name: string };
	const cols = [
		{ id: 'id', accessor: (r: Row) => r.id },
		{ id: 'name', accessor: (r: Row) => r.name },
	];
	const data: Row[] = [
		{ id: 1, name: 'a' },
		{ id: 2, name: 'b' },
	];

	function memStorage(): PersistStorage & { store: Map<string, string> } {
		const store = new Map<string, string>();
		return {
			store,
			load: (k) => store.get(k) ?? null,
			save: (k, v) => {
				if (v === '') store.delete(k);
				else store.set(k, v);
			},
		};
	}

	describe('withPersist', () => {
		it('flushPersist で snapshot が storage に書き込まれる', () => {
			const s = memStorage();
			const t = withPersist(createTable<Row>({ data, columns: cols }), {
				key: 'k',
				storage: s,
				debounceMs: 0,
			});
			t.setSort([{ columnId: 'id', dir: 'desc' }]);
			t.flushPersist();
			const raw = s.store.get('k')!;
			const parsed = JSON.parse(raw) as Snapshot;
			expect(parsed.sort).toEqual([{ columnId: 'id', dir: 'desc' }]);
		});

		it('reloadPersist で保存済み state を復元', () => {
			const s = memStorage();
			const t = withPersist(createTable<Row>({ data, columns: cols }), {
				key: 'k',
				storage: s,
				debounceMs: 0,
			});
			t.setSort([{ columnId: 'id', dir: 'desc' }]);
			t.flushPersist();

			const t2 = withPersist(createTable<Row>({ data, columns: cols }), {
				key: 'k',
				storage: s,
				debounceMs: 0,
			});
			expect(t2.getState().sort).toEqual([{ columnId: 'id', dir: 'desc' }]);
		});

		it('include で保存対象を絞れる', () => {
			const s = memStorage();
			const t = withPersist(createTable<Row>({ data, columns: cols }), {
				key: 'k',
				storage: s,
				debounceMs: 0,
				include: ['sort'],
			});
			t.setSort([{ columnId: 'id', dir: 'desc' }]);
			t.setPredicate({ kind: 'leaf', columnId: 'name', op: '=', value: 'a' });
			t.flushPersist();
			const snap = JSON.parse(s.store.get('k')!) as Snapshot;
			expect(snap.sort).toBeDefined();
			expect(snap.predicate).toBeUndefined();
		});

		it('clearPersist で storage から削除', () => {
			const s = memStorage();
			const t = withPersist(createTable<Row>({ data, columns: cols }), {
				key: 'k',
				storage: s,
				debounceMs: 0,
			});
			t.flushPersist();
			expect(s.store.has('k')).toBe(true);
			t.clearPersist();
			expect(s.store.has('k')).toBe(false);
		});

		it('debounce で連続変更が 1 回にまとまる', async () => {
			vi.useFakeTimers();
			const s = memStorage();
			const saveSpy = vi.spyOn(s, 'save');
			const t = withPersist(createTable<Row>({ data, columns: cols }), {
				key: 'k',
				storage: s,
				debounceMs: 30,
			});
			t.setSort([{ columnId: 'id', dir: 'asc' }]);
			t.setSort([{ columnId: 'id', dir: 'desc' }]);
			t.setSort([{ columnId: 'name', dir: 'asc' }]);
			await vi.advanceTimersByTimeAsync(50);
			expect(saveSpy).toHaveBeenCalledTimes(1);
			vi.useRealTimers();
		});

		it('冪等: 2 回 attach しても同じ table', () => {
			const s = memStorage();
			const base = createTable<Row>({ data, columns: cols });
			const a = withPersist(base, { key: 'k', storage: s });
			const b = withPersist(a, { key: 'k', storage: s });
			expect(a).toBe(b);
		});

		it('壊れた JSON は無視されて初期 state のまま', () => {
			const s = memStorage();
			s.store.set('k', 'not json');
			const t = withPersist(createTable<Row>({ data, columns: cols }), {
				key: 'k',
				storage: s,
			});
			expect(t.getState().sort).toEqual([]);
		});

		it('snapshot.v が不一致なら無視', () => {
			const s = memStorage();
			s.store.set('k', JSON.stringify({ v: 999, sort: [{ columnId: 'id', dir: 'desc' }] }));
			const t = withPersist(createTable<Row>({ data, columns: cols }), {
				key: 'k',
				storage: s,
			});
			expect(t.getState().sort).toEqual([]);
		});
	});

	describe('_captureSnapshot / _applySnapshot', () => {
		it('round-trip で state が保たれる', () => {
			const include = new Set<PersistInclude>([
				'predicate',
				'sort',
				'columnSizing',
				'columnVisibility',
			]);
			const t = createTable<Row>({ data, columns: cols });
			t.setSort([{ columnId: 'id', dir: 'asc' }]);
			t.setColumnWidth('id', 250);
			t.setColumnVisibility('name', false);
			const snap = _captureSnapshot(t, include);

			const t2 = createTable<Row>({ data, columns: cols });
			_applySnapshot(t2, snap, include);
			expect(t2.getState().sort).toEqual([{ columnId: 'id', dir: 'asc' }]);
			expect(t2.getColumnWidth('id')).toBe(250);
			expect(t2.getState().columnVisibility.name).toBe(false);
		});
	});
}
