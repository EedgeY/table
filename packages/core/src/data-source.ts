import type { Predicate } from './filter.ts';
import type { PaginationState } from './pagination.ts';
import type { Result } from './_result.ts';
import type { SortSpec } from './sort.ts';
import type { RowId } from './_types.ts';

/** state の何が変化したかを fetch 実装者に伝えるためのスナップショット。 */
export type FetchQuery = {
	readonly predicate: Predicate | null;
	readonly sort: SortSpec;
	readonly pagination: PaginationState;
	/** 任意の追加クエリパラメータ。サーバー固有の引数 (tenant id, view 名 など)。 */
	readonly extra?: Readonly<Record<string, unknown>>;
	/** 中止用。debounce で次のクエリに置き換わると signal.aborted=true になる。 */
	readonly signal?: AbortSignal;
};

export type FetchResult<TRow> = {
	readonly rows: ReadonlyArray<TRow>;
	/** サーバー側で確定した総件数。pagination の derived 値 (pageCount 等) に使う。 */
	readonly totalCount: number;
	/** 次ページ取得用の cursor。infinite scroll で使う。 */
	readonly nextCursor?: string | null;
};

/** 編集系の入力共通シェイプ。 */
export type CellPatch = {
	readonly rowId: RowId;
	readonly columnId: string;
	readonly value: unknown;
};

export type EditError = {
	readonly code: string;
	readonly message: string;
	/** バリデーションで field-level エラーを表す場合。 */
	readonly columnId?: string;
};

/** Realtime push の3形態。 */
export type RealtimeEvent<TRow> =
	| { readonly kind: 'insert'; readonly row: TRow }
	| { readonly kind: 'update'; readonly rowId: RowId; readonly row: TRow }
	| { readonly kind: 'delete'; readonly rowId: RowId };

export type Unsubscribe = () => void;

/**
 * DataSource のメインインターフェース。全フィールドが任意。
 *
 * - `fetch` を実装 → server モードが使える (`createTable({ mode: 'server', dataSource })`)
 * - `updateCell` / `bulkUpdate` を実装 → withEdit ミックスインで楽観編集
 * - `insertRow` / `deleteRows` を実装 → 行追加・削除も核から呼べる
 * - `subscribe` を実装 → in-memory data を realtime で差分更新
 */
export interface DataSource<TRow> {
	readonly fetch?: (query: FetchQuery) => Promise<FetchResult<TRow>>;
	readonly updateCell?: (input: {
		readonly rowId: RowId;
		readonly columnId: string;
		readonly value: unknown;
		readonly row: TRow;
	}) => Promise<Result<TRow, EditError>>;
	readonly bulkUpdate?: (
		patches: ReadonlyArray<CellPatch & { readonly row: TRow }>,
	) => Promise<Result<ReadonlyArray<TRow>, EditError>>;
	readonly insertRow?: (row: Partial<TRow>) => Promise<Result<TRow, EditError>>;
	readonly deleteRows?: (rowIds: ReadonlyArray<RowId>) => Promise<Result<void, EditError>>;
	readonly subscribe?: (cb: (event: RealtimeEvent<TRow>) => void) => Unsubscribe;
}

/**
 * 配列 1 つで簡易にローカル DataSource を作るヘルパ。
 *
 * テスト / プロトタイプ / オフライン編集に。
 * updateCell は in-place で row を置換し、bulkUpdate / insertRow / deleteRows も整合的に動作。
 */
export function createMemoryDataSource<TRow>(
	initial: ReadonlyArray<TRow>,
	getRowId: (row: TRow) => RowId,
): DataSource<TRow> & { readonly getRows: () => ReadonlyArray<TRow> } {
	let rows: TRow[] = [...initial];

	const findIndex = (rowId: RowId): number => rows.findIndex((r) => getRowId(r) === rowId);

	return {
		getRows: () => rows,
		fetch: (_q: FetchQuery): Promise<FetchResult<TRow>> => {
			return Promise.resolve({ rows: [...rows], totalCount: rows.length });
		},
		updateCell: ({ rowId, columnId, value, row }) => {
			const idx = findIndex(rowId);
			if (idx < 0) {
				return Promise.resolve({
					ok: false,
					error: { code: 'not_found', message: `row ${rowId} not found` },
				});
			}
			const merged = { ...row, [columnId]: value } as TRow;
			rows = rows.map((r, i) => (i === idx ? merged : r));
			return Promise.resolve({ ok: true, value: merged });
		},
		bulkUpdate: (patches) => {
			const updated: TRow[] = [];
			for (const { rowId, columnId, value, row } of patches) {
				const idx = findIndex(rowId);
				if (idx < 0) {
					return Promise.resolve({
						ok: false,
						error: { code: 'not_found', message: `row ${rowId} not found` },
					});
				}
				const merged = { ...row, [columnId]: value } as TRow;
				rows = rows.map((r, i) => (i === idx ? merged : r));
				updated.push(merged);
			}
			return Promise.resolve({ ok: true, value: updated });
		},
		insertRow: (partial) => {
			const row = partial as TRow;
			rows = [...rows, row];
			return Promise.resolve({ ok: true, value: row });
		},
		deleteRows: (rowIds) => {
			const ids = new Set(rowIds);
			rows = rows.filter((r) => !ids.has(getRowId(r)));
			return Promise.resolve({ ok: true, value: undefined });
		},
	};
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	type Row = { id: number; name: string };
	const initial: Row[] = [
		{ id: 1, name: 'a' },
		{ id: 2, name: 'b' },
	];

	describe('createMemoryDataSource', () => {
		it('updateCell で行が置換される', async () => {
			const ds = createMemoryDataSource(initial, (r) => String(r.id) as RowId);
			const res = await ds.updateCell!({
				rowId: '1' as RowId,
				columnId: 'name',
				value: 'A',
				row: { id: 1, name: 'a' },
			});
			expect(res.ok).toBe(true);
			expect(ds.getRows()[0]).toEqual({ id: 1, name: 'A' });
		});

		it('updateCell で未知 rowId はエラー', async () => {
			const ds = createMemoryDataSource(initial, (r) => String(r.id) as RowId);
			const res = await ds.updateCell!({
				rowId: '999' as RowId,
				columnId: 'name',
				value: 'X',
				row: { id: 999, name: '' },
			});
			expect(res.ok).toBe(false);
			if (!res.ok) {
				expect(res.error.code).toBe('not_found');
			}
		});

		it('insertRow / deleteRows', async () => {
			const ds = createMemoryDataSource(initial, (r) => String(r.id) as RowId);
			await ds.insertRow!({ id: 3, name: 'c' });
			expect(ds.getRows()).toHaveLength(3);
			await ds.deleteRows!(['1' as RowId, '3' as RowId]);
			expect(ds.getRows().map((r) => r.id)).toEqual([2]);
		});

		it('bulkUpdate で複数行を一括', async () => {
			const ds = createMemoryDataSource(initial, (r) => String(r.id) as RowId);
			const res = await ds.bulkUpdate!([
				{ rowId: '1' as RowId, columnId: 'name', value: 'A', row: { id: 1, name: 'a' } },
				{ rowId: '2' as RowId, columnId: 'name', value: 'B', row: { id: 2, name: 'b' } },
			]);
			expect(res.ok).toBe(true);
			expect(ds.getRows().map((r) => r.name)).toEqual(['A', 'B']);
		});

		it('fetch は全行を返す (メモリ DS の規約)', async () => {
			const ds = createMemoryDataSource(initial, (r) => String(r.id) as RowId);
			const r = await ds.fetch!({
				predicate: null,
				sort: [],
				pagination: { pageIndex: 0, pageSize: 10 },
			});
			expect(r.totalCount).toBe(2);
			expect(r.rows).toHaveLength(2);
		});
	});
}
