import { o as Predicate } from "./filter-4LNTxfrR.js";
import { n as PaginationState } from "./pagination-BDJRxWZ9.js";
import { t as Result } from "./_result-24D-ZFgW.js";
import { r as SortSpec } from "./sort-CxVgnAS7.js";
import { t as RowId } from "./_types-ChlTfGdX.js";

//#region src/data-source.d.ts
/** state の何が変化したかを fetch 実装者に伝えるためのスナップショット。 */
type FetchQuery = {
  readonly predicate: Predicate | null;
  readonly sort: SortSpec;
  readonly pagination: PaginationState; /** 任意の追加クエリパラメータ。サーバー固有の引数 (tenant id, view 名 など)。 */
  readonly extra?: Readonly<Record<string, unknown>>; /** 中止用。debounce で次のクエリに置き換わると signal.aborted=true になる。 */
  readonly signal?: AbortSignal;
};
type FetchResult<TRow> = {
  readonly rows: ReadonlyArray<TRow>; /** サーバー側で確定した総件数。pagination の derived 値 (pageCount 等) に使う。 */
  readonly totalCount: number; /** 次ページ取得用の cursor。infinite scroll で使う。 */
  readonly nextCursor?: string | null;
};
/** 編集系の入力共通シェイプ。 */
type CellPatch = {
  readonly rowId: RowId;
  readonly columnId: string;
  readonly value: unknown;
};
type EditError = {
  readonly code: string;
  readonly message: string; /** バリデーションで field-level エラーを表す場合。 */
  readonly columnId?: string;
};
/** Realtime push の3形態。 */
type RealtimeEvent<TRow> = {
  readonly kind: 'insert';
  readonly row: TRow;
} | {
  readonly kind: 'update';
  readonly rowId: RowId;
  readonly row: TRow;
} | {
  readonly kind: 'delete';
  readonly rowId: RowId;
};
type Unsubscribe = () => void;
/**
 * DataSource のメインインターフェース。全フィールドが任意。
 *
 * - `fetch` を実装 → server モードが使える (`createTable({ mode: 'server', dataSource })`)
 * - `updateCell` / `bulkUpdate` を実装 → withEdit ミックスインで楽観編集
 * - `insertRow` / `deleteRows` を実装 → 行追加・削除も核から呼べる
 * - `subscribe` を実装 → in-memory data を realtime で差分更新
 */
interface DataSource<TRow> {
  readonly fetch?: (query: FetchQuery) => Promise<FetchResult<TRow>>;
  readonly updateCell?: (input: {
    readonly rowId: RowId;
    readonly columnId: string;
    readonly value: unknown;
    readonly row: TRow;
  }) => Promise<Result<TRow, EditError>>;
  readonly bulkUpdate?: (patches: ReadonlyArray<CellPatch & {
    readonly row: TRow;
  }>) => Promise<Result<ReadonlyArray<TRow>, EditError>>;
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
declare function createMemoryDataSource<TRow>(initial: ReadonlyArray<TRow>, getRowId: (row: TRow) => RowId): DataSource<TRow> & {
  readonly getRows: () => ReadonlyArray<TRow>;
};
//#endregion
export { FetchResult as a, createMemoryDataSource as c, FetchQuery as i, DataSource as n, RealtimeEvent as o, EditError as r, Unsubscribe as s, CellPatch as t };
//# sourceMappingURL=data-source-crBvwLY-.d.ts.map