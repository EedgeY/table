import type { ColumnDef } from './column.ts';
import type { FetchQuery, FetchResult, Unsubscribe } from './data-source.ts';
import type { RowId } from './_types.ts';

/**
 * 別テーブル参照を解決するための統一インターフェース。
 *
 * - `fetchByIds`: id リスト → レコード配列。リレーションセル描画 / サブテーブル展開で使う。
 * - `fetchByQuery`: 任意のクエリでレコードを取得。サブテーブルが大量レコードを扱う場合のフィルタ・ソート・ページング。
 * - `getColumns`: 関連先テーブルの列定義。サブテーブルがこれを使って自テーブルを描画。
 * - `subscribe`: realtime push（任意）。
 */
export interface RelationSource {
	readonly fetchByIds: (
		tableId: string,
		ids: ReadonlyArray<RowId>,
	) => Promise<ReadonlyArray<unknown>>;
	readonly fetchByQuery?: (tableId: string, query: FetchQuery) => Promise<FetchResult<unknown>>;
	readonly getColumns: (tableId: string) => ReadonlyArray<ColumnDef<unknown>>;
	readonly subscribe?: (tableId: string, cb: () => void) => Unsubscribe;
}

/** モック / テスト用のメモリ実装。複数テーブルを Map で保持。 */
export function createMemoryRelationSource(
	tables: Record<
		string,
		{
			readonly rows: ReadonlyArray<unknown>;
			readonly columns: ReadonlyArray<ColumnDef<unknown>>;
			readonly getRowId: (row: unknown) => RowId;
		}
	>,
): RelationSource {
	return {
		fetchByIds(tableId, ids) {
			const t = tables[tableId];
			if (t === undefined) return Promise.resolve([]);
			const idSet = new Set(ids.map((id) => String(id)));
			const out = t.rows.filter((r) => idSet.has(String(t.getRowId(r))));
			return Promise.resolve(out);
		},
		getColumns(tableId) {
			const t = tables[tableId];
			return t ? t.columns : [];
		},
	};
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	type User = { id: number; name: string };
	const users: User[] = [
		{ id: 1, name: 'Alice' },
		{ id: 2, name: 'Bob' },
		{ id: 3, name: 'Carol' },
	];

	describe('createMemoryRelationSource', () => {
		it('fetchByIds は要求された id のレコードだけ返す', async () => {
			const rs = createMemoryRelationSource({
				users: {
					rows: users,
					columns: [
						{ id: 'id', accessor: (r) => (r as User).id, type: 'number' },
						{ id: 'name', accessor: (r) => (r as User).name },
					],
					getRowId: (r) => String((r as User).id) as RowId,
				},
			});
			const got = await rs.fetchByIds('users', ['1' as RowId, '3' as RowId]);
			expect((got as User[]).map((u) => u.name)).toEqual(['Alice', 'Carol']);
		});

		it('未知の tableId は空配列を返す', async () => {
			const rs = createMemoryRelationSource({});
			expect(await rs.fetchByIds('nope', ['1' as RowId])).toEqual([]);
			expect(rs.getColumns('nope')).toEqual([]);
		});

		it('getColumns は登録済みの列定義を返す', () => {
			const rs = createMemoryRelationSource({
				users: {
					rows: users,
					columns: [{ id: 'name', accessor: (r) => (r as User).name }],
					getRowId: (r) => String((r as User).id) as RowId,
				},
			});
			const cols = rs.getColumns('users');
			expect(cols.map((c) => c.id)).toEqual(['name']);
		});
	});
}
