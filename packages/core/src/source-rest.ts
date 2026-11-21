import type { CellPatch, DataSource, EditError, FetchQuery, FetchResult } from './data-source.ts';
import type { Predicate } from './filter.ts';
import type { RowId } from './_types.ts';

type Result<T, E> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: E };

/**
 * filter AST から URL クエリ文字列への変換戦略。
 * デフォルトでは `?col=value` のフラットなパラメータ列に潰す (top-level AND of leaves のみサポート)。
 */
export type FilterEncoder = (predicate: Predicate | null) => Record<string, string>;

/**
 * sort spec から URL クエリ文字列への変換戦略。
 * デフォルト: `_sort=col1:asc,col2:desc`。
 */
export type SortEncoder = (
	sort: ReadonlyArray<{ columnId: string; dir: 'asc' | 'desc' }>,
) => Record<string, string>;

export type RestSourceOptions<TRow> = {
	readonly baseUrl: string;
	/** リソースパス (例: 'users') */
	readonly resource: string;
	/** row → 一意な id 文字列。URL に埋めるため。 */
	readonly idOf: (row: TRow) => string;
	/** 任意の認証ヘッダなど。 */
	readonly headers?: Record<string, string> | (() => Record<string, string>);
	/** filter エンコード。未指定なら top-level AND of leaves を ?col=value で。 */
	readonly encodeFilter?: FilterEncoder;
	readonly encodeSort?: SortEncoder;
	/**
	 * レスポンスから { rows, totalCount, nextCursor } を抽出。
	 * 既定: `{ rows, totalCount }` をそのまま受け取る。
	 */
	readonly parseResponse?: (json: unknown) => {
		rows: ReadonlyArray<TRow>;
		totalCount: number;
		nextCursor?: string | null;
	};
	/** fetch 実装の差し替え (テスト用)。 */
	readonly fetchImpl?: typeof fetch;
};

const _defaultFilterEncoder: FilterEncoder = (p) => {
	const out: Record<string, string> = {};
	if (p === null) return out;
	const leaves =
		p.kind === 'leaf'
			? [p]
			: p.kind === 'group' && p.combinator === 'and' && !p.negate
				? p.children
				: [];
	for (const c of leaves) {
		if (c.kind !== 'leaf') continue;
		const v = c.value;
		if (Array.isArray(v)) {
			out[c.columnId] = v.join(',');
		} else if (v !== null && v !== undefined) {
			out[c.columnId] = String(v);
		}
	}
	return out;
};

const _defaultSortEncoder: SortEncoder = (sort) => {
	const out: Record<string, string> = {};
	if (sort.length === 0) return out;
	out._sort = sort.map((k) => `${k.columnId}:${k.dir}`).join(',');
	return out;
};

const _defaultParseResponse = <TRow>(
	json: unknown,
): {
	rows: ReadonlyArray<TRow>;
	totalCount: number;
	nextCursor?: string | null;
} => {
	if (Array.isArray(json)) {
		return { rows: json as ReadonlyArray<TRow>, totalCount: json.length };
	}
	const o = json as { rows?: ReadonlyArray<TRow>; totalCount?: number; nextCursor?: string | null };
	return {
		rows: o.rows ?? [],
		totalCount: o.totalCount ?? o.rows?.length ?? 0,
		nextCursor: o.nextCursor ?? null,
	};
};

function _resolveHeaders(h: RestSourceOptions<unknown>['headers']): Record<string, string> {
	if (!h) return {};
	if (typeof h === 'function') return h();
	return h;
}

function _toEditError(status: number, message: string): EditError {
	return { code: `http_${status}`, message };
}

export function createRestDataSource<TRow>(opts: RestSourceOptions<TRow>): DataSource<TRow> {
	const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
	const encodeFilter = opts.encodeFilter ?? _defaultFilterEncoder;
	const encodeSort = opts.encodeSort ?? _defaultSortEncoder;
	const parseResponse = opts.parseResponse ?? _defaultParseResponse<TRow>;
	const url = (suffix = ''): string =>
		`${opts.baseUrl.replace(/\/$/, '')}/${opts.resource}${suffix}`;
	const headers = (): HeadersInit => ({
		'Content-Type': 'application/json',
		..._resolveHeaders(opts.headers),
	});

	return {
		async fetch(q: FetchQuery): Promise<FetchResult<TRow>> {
			const params = new URLSearchParams({
				_limit: String(q.pagination.pageSize),
				_offset: String(q.pagination.pageIndex * q.pagination.pageSize),
				...encodeFilter(q.predicate),
				...encodeSort(q.sort as ReadonlyArray<{ columnId: string; dir: 'asc' | 'desc' }>),
			});
			if (q.extra && typeof q.extra.cursor === 'string') {
				params.set('_cursor', q.extra.cursor);
			}
			const u = `${url()}?${params.toString()}`;
			const res = await fetchImpl(u, { signal: q.signal, headers: headers() });
			if (!res.ok) {
				throw new Error(`fetch ${u} failed: ${res.status} ${res.statusText}`);
			}
			const json = (await res.json()) as unknown;
			return parseResponse(json);
		},
		async updateCell(input): Promise<Result<TRow, EditError>> {
			const { columnId, value, row } = input;
			const id = encodeURIComponent(opts.idOf(row));
			const body = JSON.stringify({ [columnId]: value });
			const res = await fetchImpl(url(`/${id}`), {
				method: 'PATCH',
				headers: headers(),
				body,
			});
			if (!res.ok) {
				return { ok: false, error: _toEditError(res.status, await _readErrorText(res)) };
			}
			try {
				const json = (await res.json()) as TRow;
				return { ok: true, value: json };
			} catch {
				return { ok: true, value: { ...row, [columnId]: value } as TRow };
			}
		},
		async bulkUpdate(
			patches: ReadonlyArray<CellPatch & { row: TRow }>,
		): Promise<Result<ReadonlyArray<TRow>, EditError>> {
			const res = await fetchImpl(url('/bulk'), {
				method: 'PATCH',
				headers: headers(),
				body: JSON.stringify({
					patches: patches.map((p) => ({
						id: opts.idOf(p.row),
						[p.columnId]: p.value,
					})),
				}),
			});
			if (!res.ok) {
				return { ok: false, error: _toEditError(res.status, await _readErrorText(res)) };
			}
			const json = (await res.json()) as ReadonlyArray<TRow>;
			return { ok: true, value: json };
		},
		async insertRow(partial): Promise<Result<TRow, EditError>> {
			const res = await fetchImpl(url(), {
				method: 'POST',
				headers: headers(),
				body: JSON.stringify(partial),
			});
			if (!res.ok) {
				return { ok: false, error: _toEditError(res.status, await _readErrorText(res)) };
			}
			const json = (await res.json()) as TRow;
			return { ok: true, value: json };
		},
		async deleteRows(rowIds: ReadonlyArray<RowId>): Promise<Result<void, EditError>> {
			for (const id of rowIds) {
				const res = await fetchImpl(url(`/${encodeURIComponent(id)}`), {
					method: 'DELETE',
					headers: headers(),
				});
				if (!res.ok) {
					return { ok: false, error: _toEditError(res.status, await _readErrorText(res)) };
				}
			}
			return { ok: true, value: undefined };
		},
	};
}

async function _readErrorText(res: Response): Promise<string> {
	try {
		return (await res.text()).slice(0, 500) || res.statusText;
	} catch {
		return res.statusText;
	}
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	type User = { id: number; name: string };

	function mockFetch(
		handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
	): typeof fetch {
		return (input: string | URL | globalThis.Request, init?: RequestInit) =>
			Promise.resolve(handler(String(input), init));
	}

	describe('createRestDataSource', () => {
		it('fetch で GET /users と totalCount を返す', async () => {
			const ds = createRestDataSource<User>({
				baseUrl: 'https://api',
				resource: 'users',
				idOf: (u) => String(u.id),
				fetchImpl: mockFetch((url) => {
					expect(url).toContain('https://api/users');
					expect(url).toContain('_limit=10');
					expect(url).toContain('_offset=0');
					return new Response(JSON.stringify({ rows: [{ id: 1, name: 'a' }], totalCount: 5 }), {
						status: 200,
					});
				}),
			});
			const r = await ds.fetch!({
				predicate: null,
				sort: [],
				pagination: { pageIndex: 0, pageSize: 10 },
			});
			expect(r.totalCount).toBe(5);
			expect(r.rows).toHaveLength(1);
		});

		it('top-level AND of leaves を flat なクエリ string にエンコード', async () => {
			let capturedUrl = '';
			const ds = createRestDataSource<User>({
				baseUrl: 'https://api',
				resource: 'users',
				idOf: (u) => String(u.id),
				fetchImpl: mockFetch((url) => {
					capturedUrl = url;
					return new Response(JSON.stringify({ rows: [], totalCount: 0 }), { status: 200 });
				}),
			});
			await ds.fetch!({
				predicate: {
					kind: 'group',
					combinator: 'and',
					children: [
						{ kind: 'leaf', columnId: 'name', op: '=', value: 'tanaka' },
						{ kind: 'leaf', columnId: 'id', op: '=', value: 3 },
					],
				},
				sort: [{ columnId: 'id', dir: 'desc' }],
				pagination: { pageIndex: 1, pageSize: 20 },
			});
			expect(capturedUrl).toContain('name=tanaka');
			expect(capturedUrl).toContain('id=3');
			expect(capturedUrl).toContain('_sort=id%3Adesc');
			expect(capturedUrl).toContain('_offset=20');
		});

		it('updateCell が PATCH /users/:id を呼ぶ', async () => {
			const ds = createRestDataSource<User>({
				baseUrl: 'https://api',
				resource: 'users',
				idOf: (u) => String(u.id),
				fetchImpl: mockFetch((url, init) => {
					expect(url).toBe('https://api/users/1');
					expect(init?.method).toBe('PATCH');
					expect(init?.body).toBe(JSON.stringify({ name: 'A' }));
					return new Response(JSON.stringify({ id: 1, name: 'A' }), { status: 200 });
				}),
			});
			const r = await ds.updateCell!({
				rowId: '1' as RowId,
				columnId: 'name',
				value: 'A',
				row: { id: 1, name: 'a' },
			});
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value).toEqual({ id: 1, name: 'A' });
			}
		});

		it('updateCell が 4xx で EditError を返す', async () => {
			const ds = createRestDataSource<User>({
				baseUrl: 'https://api',
				resource: 'users',
				idOf: (u) => String(u.id),
				fetchImpl: mockFetch(() => new Response('forbidden', { status: 403 })),
			});
			const r = await ds.updateCell!({
				rowId: '1' as RowId,
				columnId: 'name',
				value: 'X',
				row: { id: 1, name: 'a' },
			});
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.code).toBe('http_403');
				expect(r.error.message).toBe('forbidden');
			}
		});

		it('headers を function で動的に与えられる', async () => {
			let capturedHeaders: HeadersInit | undefined;
			const ds = createRestDataSource<User>({
				baseUrl: 'https://api',
				resource: 'users',
				idOf: (u) => String(u.id),
				headers: () => ({ Authorization: 'Bearer x' }),
				fetchImpl: mockFetch((_, init) => {
					capturedHeaders = init?.headers;
					return new Response(JSON.stringify({ rows: [], totalCount: 0 }), { status: 200 });
				}),
			});
			await ds.fetch!({
				predicate: null,
				sort: [],
				pagination: { pageIndex: 0, pageSize: 10 },
			});
			expect(capturedHeaders).toMatchObject({ Authorization: 'Bearer x' });
		});

		it('insertRow で POST', async () => {
			const ds = createRestDataSource<User>({
				baseUrl: 'https://api',
				resource: 'users',
				idOf: (u) => String(u.id),
				fetchImpl: mockFetch((url, init) => {
					expect(init?.method).toBe('POST');
					return new Response(JSON.stringify({ id: 100, name: 'new' }), { status: 201 });
				}),
			});
			const r = await ds.insertRow!({ name: 'new' });
			expect(r.ok).toBe(true);
		});

		it('deleteRows で DELETE を rowIds 数だけ呼ぶ', async () => {
			const calls: string[] = [];
			const ds = createRestDataSource<User>({
				baseUrl: 'https://api',
				resource: 'users',
				idOf: (u) => String(u.id),
				fetchImpl: mockFetch((url) => {
					calls.push(url);
					return new Response(null, { status: 204 });
				}),
			});
			const r = await ds.deleteRows!(['1' as RowId, '2' as RowId]);
			expect(r.ok).toBe(true);
			expect(calls).toEqual(['https://api/users/1', 'https://api/users/2']);
		});

		it('レスポンスが配列形でも parseResponse のデフォルトがハンドル', async () => {
			const ds = createRestDataSource<User>({
				baseUrl: 'https://api',
				resource: 'users',
				idOf: (u) => String(u.id),
				fetchImpl: mockFetch(
					() =>
						new Response(
							JSON.stringify([
								{ id: 1, name: 'a' },
								{ id: 2, name: 'b' },
							]),
							{
								status: 200,
							},
						),
				),
			});
			const r = await ds.fetch!({
				predicate: null,
				sort: [],
				pagination: { pageIndex: 0, pageSize: 10 },
			});
			expect(r.totalCount).toBe(2);
			expect(r.rows).toHaveLength(2);
		});

		it('カスタム encodeFilter で OR / 範囲条件にも対応できる', async () => {
			let capturedUrl = '';
			const ds = createRestDataSource<User>({
				baseUrl: 'https://api',
				resource: 'users',
				idOf: (u) => String(u.id),
				encodeFilter: (p) => {
					const o: Record<string, string> = {};
					if (p) o.q = JSON.stringify(p);
					return o;
				},
				fetchImpl: mockFetch((url) => {
					capturedUrl = url;
					return new Response(JSON.stringify({ rows: [], totalCount: 0 }), { status: 200 });
				}),
			});
			await ds.fetch!({
				predicate: {
					kind: 'group',
					combinator: 'or',
					children: [
						{ kind: 'leaf', columnId: 'name', op: '=', value: 'a' },
						{ kind: 'leaf', columnId: 'name', op: '=', value: 'b' },
					],
				},
				sort: [],
				pagination: { pageIndex: 0, pageSize: 10 },
			});
			expect(capturedUrl).toContain('q=');
			expect(decodeURIComponent(capturedUrl)).toContain('"combinator":"or"');
		});
	});
}
