import { r as ColumnDef } from "./column-DyosWKa_.js";
import { t as RowId } from "./_types-ChlTfGdX.js";
import { a as FetchResult, i as FetchQuery, s as Unsubscribe } from "./data-source-crBvwLY-.js";

//#region src/relation-source.d.ts
/**
 * 別テーブル参照を解決するための統一インターフェース。
 *
 * - `fetchByIds`: id リスト → レコード配列。リレーションセル描画 / サブテーブル展開で使う。
 * - `fetchByQuery`: 任意のクエリでレコードを取得。サブテーブルが大量レコードを扱う場合のフィルタ・ソート・ページング。
 * - `getColumns`: 関連先テーブルの列定義。サブテーブルがこれを使って自テーブルを描画。
 * - `subscribe`: realtime push（任意）。
 */
interface RelationSource {
  readonly fetchByIds: (tableId: string, ids: ReadonlyArray<RowId>) => Promise<ReadonlyArray<unknown>>;
  readonly fetchByQuery?: (tableId: string, query: FetchQuery) => Promise<FetchResult<unknown>>;
  readonly getColumns: (tableId: string) => ReadonlyArray<ColumnDef<unknown>>;
  readonly subscribe?: (tableId: string, cb: () => void) => Unsubscribe;
}
/** モック / テスト用のメモリ実装。複数テーブルを Map で保持。 */
declare function createMemoryRelationSource(tables: Record<string, {
  readonly rows: ReadonlyArray<unknown>;
  readonly columns: ReadonlyArray<ColumnDef<unknown>>;
  readonly getRowId: (row: unknown) => RowId;
}>): RelationSource;
//#endregion
export { createMemoryRelationSource as n, RelationSource as t };
//# sourceMappingURL=relation-source-CDj2XaGS.d.ts.map