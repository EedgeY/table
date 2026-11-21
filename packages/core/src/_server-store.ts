import type { DataSource, FetchQuery } from './data-source.ts';
import type { Predicate } from './filter.ts';
import type { PaginationState } from './pagination.ts';
import type { SortSpec } from './sort.ts';

export type ServerStatus = 'idle' | 'loading' | 'error';

export type ServerError = {
	readonly message: string;
	readonly cause?: unknown;
};

export type ServerState<TRow> = {
	readonly rows: ReadonlyArray<TRow>;
	readonly totalCount: number;
	readonly status: ServerStatus;
	readonly error: ServerError | null;
	/** infinite scroll: 次の cursor。null/undefined なら末端。 */
	readonly nextCursor: string | null;
};

export type ServerStore<TRow> = {
	readonly getState: () => ServerState<TRow>;
	readonly invalidate: (query: Omit<FetchQuery, 'signal'>) => Promise<void>;
	readonly fetchMore: (query: Omit<FetchQuery, 'signal'>) => Promise<void>;
	readonly mutate: (
		patch: Partial<Pick<ServerState<TRow>, 'rows' | 'totalCount' | 'nextCursor'>>,
	) => void;
	readonly dispose: () => void;
};

export type ServerStoreOptions<TRow> = {
	readonly dataSource: DataSource<TRow>;
	readonly onChange: () => void;
	readonly debounceMs?: number;
};

const FROZEN_EMPTY: ReadonlyArray<unknown> = Object.freeze([]);

export function _createServerStore<TRow>(opts: ServerStoreOptions<TRow>): ServerStore<TRow> {
	const debounceMs = opts.debounceMs ?? 50;
	let state: ServerState<TRow> = Object.freeze({
		rows: FROZEN_EMPTY as ReadonlyArray<TRow>,
		totalCount: 0,
		status: 'idle',
		error: null,
		nextCursor: null,
	});
	let aborter: AbortController | null = null;
	let pending: ReturnType<typeof setTimeout> | null = null;
	let disposed = false;

	const setState = (next: ServerState<TRow>): void => {
		state = Object.freeze(next);
		opts.onChange();
	};

	const runFetch = async (query: Omit<FetchQuery, 'signal'>): Promise<void> => {
		const ds = opts.dataSource;
		if (!ds.fetch) {
			setState({
				...state,
				status: 'error',
				error: { message: 'dataSource.fetch is required for server mode' },
			});
			return;
		}
		if (aborter !== null) {
			aborter.abort();
		}
		const ctrl = new AbortController();
		aborter = ctrl;
		setState({ ...state, status: 'loading', error: null });
		try {
			const result = await ds.fetch({ ...query, signal: ctrl.signal });
			if (ctrl.signal.aborted || disposed) {
				return;
			}
			setState({
				rows: result.rows,
				totalCount: result.totalCount,
				status: 'idle',
				error: null,
				nextCursor: result.nextCursor ?? null,
			});
		} catch (e: unknown) {
			if (ctrl.signal.aborted || disposed) {
				return;
			}
			const message = e instanceof Error ? e.message : String(e);
			setState({ ...state, status: 'error', error: { message, cause: e } });
		} finally {
			if (aborter === ctrl) {
				aborter = null;
			}
		}
	};

	const invalidate: ServerStore<TRow>['invalidate'] = (query) => {
		if (disposed) return Promise.resolve();
		if (pending !== null) {
			clearTimeout(pending);
			pending = null;
		}
		if (debounceMs <= 0) {
			return runFetch(query);
		}
		return new Promise<void>((resolve) => {
			pending = setTimeout(() => {
				pending = null;
				resolve(runFetch(query));
			}, debounceMs);
		});
	};

	const runFetchMore = async (query: Omit<FetchQuery, 'signal'>): Promise<void> => {
		const ds = opts.dataSource;
		if (!ds.fetch) return;
		if (state.status === 'loading') return;
		if (state.nextCursor === null && state.rows.length > 0) return;
		const ctrl = new AbortController();
		setState({ ...state, status: 'loading', error: null });
		try {
			const result = await ds.fetch({ ...query, signal: ctrl.signal });
			if (ctrl.signal.aborted || disposed) return;
			setState({
				rows: [...state.rows, ...result.rows],
				totalCount: result.totalCount,
				status: 'idle',
				error: null,
				nextCursor: result.nextCursor ?? null,
			});
		} catch (e: unknown) {
			if (ctrl.signal.aborted || disposed) return;
			const message = e instanceof Error ? e.message : String(e);
			setState({ ...state, status: 'error', error: { message, cause: e } });
		}
	};

	return {
		getState: () => state,
		invalidate,
		fetchMore(query) {
			if (disposed) return Promise.resolve();
			return runFetchMore(query);
		},
		mutate(patch) {
			if (disposed) return;
			setState({
				rows: patch.rows ?? state.rows,
				totalCount: patch.totalCount ?? state.totalCount,
				status: state.status,
				error: state.error,
				nextCursor: patch.nextCursor !== undefined ? patch.nextCursor : state.nextCursor,
			});
		},
		dispose() {
			disposed = true;
			if (pending !== null) {
				clearTimeout(pending);
				pending = null;
			}
			if (aborter !== null) {
				aborter.abort();
				aborter = null;
			}
		},
	};
}

if (import.meta.vitest) {
	const { describe, it, expect, vi } = import.meta.vitest;

	type Row = { id: number };
	const emptyQuery = {
		predicate: null as Predicate | null,
		sort: [] as SortSpec,
		pagination: { pageIndex: 0, pageSize: 10 } as PaginationState,
	};

	describe('_createServerStore', () => {
		it('fetch 成功で rows と totalCount を反映', async () => {
			const fetch = vi.fn().mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }], totalCount: 100 });
			const store = _createServerStore<Row>({
				dataSource: { fetch },
				onChange: () => {},
				debounceMs: 0,
			});
			await store.invalidate(emptyQuery);
			expect(store.getState().rows).toHaveLength(2);
			expect(store.getState().totalCount).toBe(100);
			expect(store.getState().status).toBe('idle');
		});

		it('fetch 失敗で error 状態', async () => {
			const fetch = vi.fn().mockRejectedValue(new Error('boom'));
			const store = _createServerStore<Row>({
				dataSource: { fetch },
				onChange: () => {},
				debounceMs: 0,
			});
			await store.invalidate(emptyQuery);
			expect(store.getState().status).toBe('error');
			expect(store.getState().error?.message).toBe('boom');
		});

		it('連続 invalidate は前の AbortController を abort', async () => {
			let aborted = false;
			const fetch = vi.fn().mockImplementation((q: FetchQuery) => {
				return new Promise((resolve, reject) => {
					q.signal?.addEventListener('abort', () => {
						aborted = true;
						reject(new Error('aborted'));
					});
					setTimeout(() => resolve({ rows: [], totalCount: 0 }), 50);
				});
			});
			const store = _createServerStore<Row>({
				dataSource: { fetch },
				onChange: () => {},
				debounceMs: 0,
			});
			const first = store.invalidate(emptyQuery);
			await store.invalidate(emptyQuery);
			await first.catch(() => {});
			expect(aborted).toBe(true);
		});

		it('mutate で rows を realtime push できる', () => {
			const store = _createServerStore<Row>({
				dataSource: { fetch: vi.fn() },
				onChange: () => {},
				debounceMs: 0,
			});
			store.mutate({ rows: [{ id: 9 }], totalCount: 1 });
			expect(store.getState().rows).toEqual([{ id: 9 }]);
			expect(store.getState().totalCount).toBe(1);
		});

		it('dispose 後は invalidate を受け付けない', async () => {
			const fetch = vi.fn().mockResolvedValue({ rows: [{ id: 1 }], totalCount: 1 });
			const store = _createServerStore<Row>({
				dataSource: { fetch },
				onChange: () => {},
				debounceMs: 0,
			});
			store.dispose();
			await store.invalidate(emptyQuery);
			expect(fetch).not.toHaveBeenCalled();
		});

		it('debounce で複数 invalidate が 1 回にまとまる', async () => {
			vi.useFakeTimers();
			const fetch = vi.fn().mockResolvedValue({ rows: [], totalCount: 0 });
			const store = _createServerStore<Row>({
				dataSource: { fetch },
				onChange: () => {},
				debounceMs: 30,
			});
			store.invalidate(emptyQuery);
			store.invalidate(emptyQuery);
			store.invalidate(emptyQuery);
			await vi.advanceTimersByTimeAsync(40);
			expect(fetch).toHaveBeenCalledTimes(1);
			vi.useRealTimers();
		});
	});
}
