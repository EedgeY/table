import { c as ColumnPinning, l as ColumnPinningState, p as ColumnVisibilityState, r as ColumnDef, s as ColumnNode, u as ColumnSizingState } from "./column-DyosWKa_.js";
import { o as Predicate } from "./filter-4LNTxfrR.js";
import { n as PaginationState, t as PaginationDerived } from "./pagination-BDJRxWZ9.js";
import { r as SortSpec } from "./sort-CxVgnAS7.js";
import { t as RowId } from "./_types-ChlTfGdX.js";
import { n as DataSource } from "./data-source-crBvwLY-.js";
import { t as RelationSource } from "./relation-source-CDj2XaGS.js";
import { n as SelectionState, t as SelectionMode } from "./selection-YAVaahwz.js";
import { i as ComputedColumnSpec } from "./query-Cz5tpFWu.js";

//#region src/_engine-driver.d.ts
/**
 * - `setData(rows)` is called whenever the consumer-visible data ref changes.
 *   A WASM driver may use this to re-extract typed columns; the JS driver is
 *   a no-op.
 * - `setPredicate(p)` is called when the predicate ref changes. The driver
 *   should invalidate any compiled cache. It does *not* run the filter.
 * - `runFilter(scratch)` returns the matching index array. May reuse the
 *   provided `scratch` Uint32Array (JS driver does this).
 * - `runSort(filtered, spec)` returns the sorted index array. `filtered` is
 *   the result of the most recent `runFilter` call; the driver may not
 *   mutate it.
 * - `dispose()` releases any held resources (e.g. WASM linear memory).
 */
interface EngineDriver<TRow> {
  setData: (rows: ReadonlyArray<TRow>) => void;
  setPredicate: (predicate: Predicate | null) => void;
  runFilter: (scratch: Uint32Array) => Uint32Array;
  runSort: (filtered: Uint32Array, spec: SortSpec) => Uint32Array;
  dispose?: () => void;
}
type EngineDriverFactory<TRow> = (data: ReadonlyArray<TRow>, columns: ReadonlyArray<ColumnDef<TRow>>) => EngineDriver<TRow>;
//#endregion
//#region src/_server-store.d.ts
type ServerStatus = 'idle' | 'loading' | 'error';
type ServerError = {
  readonly message: string;
  readonly cause?: unknown;
};
type ServerState<TRow> = {
  readonly rows: ReadonlyArray<TRow>;
  readonly totalCount: number;
  readonly status: ServerStatus;
  readonly error: ServerError | null; /** infinite scroll: 次の cursor。null/undefined なら末端。 */
  readonly nextCursor: string | null;
};
//#endregion
//#region src/create-table.d.ts
type VisibleRow<TRow> = {
  readonly id: RowId;
  readonly index: number;
  readonly row: TRow;
};
type TableState = Readonly<{
  predicate: Predicate | null;
  sort: SortSpec;
  selection: SelectionState;
  pagination: PaginationState;
  columnSizing: ColumnSizingState;
  columnVisibility: ColumnVisibilityState;
  columnPinning: ColumnPinningState;
}>;
type TableMode = 'client' | 'server';
type CreateTableOptions<TRow> = {
  /**
   * client モードでの行データ。server モードでは無視され、初期は空配列でよい
   * (fetch 結果で逐次差し替わる)。
   */
  data?: ReadonlyArray<TRow>;
  /**
   * 列定義。フラットな ColumnDef[] のほか、`ColumnGroupDef` を含むネスト構造で
   * マルチレベルヘッダーを表現できる。pipeline には葉ノードだけが flatten されて渡る。
   */
  columns: ReadonlyArray<ColumnNode<TRow>>;
  getRowId?: (row: TRow, index: number) => string;
  initialState?: Partial<TableState>;
  pageSize?: number;
  selectionMode?: SelectionMode;
  /**
   * 'client' (default): 渡された data に対して in-process pipeline を回す。
   * 'server': pipeline を bypass し、state 変更ごとに dataSource.fetch を呼ぶ。
   * server を選ぶ場合は dataSource.fetch が必須。
   */
  mode?: TableMode;
  /**
   * 編集 / fetch / realtime 用のデータバックエンド。
   * - mode='server' では fetch が必須
   * - withEdit を併用する場合 updateCell / bulkUpdate を実装
   * - realtime push を反映する場合 subscribe を実装
   */
  dataSource?: DataSource<TRow>;
  /**
   * server モードの fetch debounce。連続する setPredicate / setSort / setPagination
   * を 1 回の fetch にまとめる。既定 50ms。
   */
  serverDebounceMs?: number;
  /**
   * Pipeline backend. Default is the in-process TypeScript engine. Pass a
   * factory (e.g. `rsDriverFactory` from `@tarbo-table/core-rs/node`) to
   * route filter/sort through Rust+WebAssembly without changing any other
   * call site.
   */
  engine?: EngineDriverFactory<TRow>;
  /**
   * 別テーブルへのリレーション解決バックエンド。'relation' / 'relation-many'
   * 型の列を描画する UI 層、およびサブテーブル展開機能から参照される。
   * 未指定なら null が返り、リレーション機能は無効。
   */
  relations?: RelationSource;
};
type Listener = () => void;
declare const _INTERNAL: unique symbol;
/**
 * `TableInstance` に attach される内部アクセサ。
 * 拡張関数は `(table as unknown as { [_INTERNAL]: TableInternal<TRow> })[_INTERNAL]` で取り出す。
 */
type TableInternal<TRow> = {
  /** Result Set のインデックス (filter+sort 反映済み)。server モードでは退化した 0..n-1。 */readonly getSortedIndices: () => Uint32Array;
  readonly getData: () => ReadonlyArray<TRow>;
  readonly getColumns: () => ReadonlyArray<ColumnDef<TRow>>;
  readonly getRowId: (row: TRow, index: number) => RowId; /** 既存 listeners Set を一斉に呼ぶ。拡張側 setter から再描画をトリガーするのに使う。 */
  readonly notify: () => void; /** 現在の data ref を差し替える。withEdit / realtime push 用。 */
  readonly replaceData: (data: ReadonlyArray<TRow>) => void; /** 利用中の DataSource (未指定なら null)。withEdit から参照する。 */
  readonly getDataSource: () => DataSource<TRow> | null; /** 'client' | 'server'。withEdit が挙動を切り替えるのに使う。 */
  readonly getMode: () => TableMode;
};
type TableInstance<TRow> = {
  setData: (data: ReadonlyArray<TRow>) => void; /** Release pipeline-backend resources (e.g. WASM linear memory). No-op for the default JS engine. */
  dispose: () => void;
  /**
   * `parseQuery` の `let …;` 句 (computed column) を有効列として登録/差し替える。
   * 土台列 (opts.columns) の上に specs を順にコンパイルして重ね、以後 filter / sort /
   * 描画 / export が computed column を参照できる。空配列で computed をすべて解除。
   */
  setComputedColumns: (specs: ReadonlyArray<ComputedColumnSpec>) => void;
  setPredicate: (predicate: Predicate | null) => void;
  setSort: (spec: SortSpec) => void;
  toggleSort: (columnId: string, additive: boolean) => void;
  setPagination: (patch: Partial<PaginationState>) => void;
  setColumnWidth: (columnId: string, px: number) => void;
  setColumnVisibility: (columnId: string, visible: boolean) => void;
  toggleColumnVisibility: (columnId: string) => void;
  setColumnPinning: (columnId: string, pin: ColumnPinning | null) => void;
  getPinnedColumns: () => {
    readonly left: ReadonlyArray<ColumnDef<TRow>>;
    readonly center: ReadonlyArray<ColumnDef<TRow>>;
    readonly right: ReadonlyArray<ColumnDef<TRow>>;
  };
  selectRow: (id: RowId) => void;
  toggleRow: (id: RowId) => void;
  clearSelection: () => void;
  getState: () => TableState; /** ネスト構造のまま返す。マルチレベルヘッダー描画用。 */
  getColumnTree: () => ReadonlyArray<ColumnNode<TRow>>; /** 葉ノードのみを順序保ったまま返す。computed column 登録後はそれらも含む。 */
  getColumns: () => ReadonlyArray<ColumnDef<TRow>>;
  /**
   * computed column を除いた土台列 (opts.columns の葉) を返す。
   * `let …;` 句を parse する際の列スキーマとして使う (computed 名の衝突を避ける)。
   */
  getBaseColumns: () => ReadonlyArray<ColumnDef<TRow>>;
  getVisibleColumns: () => ReadonlyArray<ColumnDef<TRow>>;
  getRowId: (row: TRow, index: number) => RowId;
  getColumnWidth: (columnId: string) => number;
  getVisibleRows: () => ReadonlyArray<VisibleRow<TRow>>;
  getPagedRows: () => ReadonlyArray<VisibleRow<TRow>>; /** リレーション解決バックエンド。`createTable({ relations })` 未指定なら null。 */
  getRelationSource: () => RelationSource | null;
  getVisibleIndices: () => Uint32Array;
  getPagedIndices: () => Uint32Array;
  getPagination: () => PaginationDerived;
  getRowCount: () => {
    total: number;
    visible: number;
    paged: number;
  };
  subscribe: (listener: Listener) => () => void;
  subscribeWithSelector: <T>(select: (state: TableState) => T, listener: (next: T, prev: T) => void, equals?: (a: T, b: T) => boolean) => () => void; /** 'client' | 'server'。 */
  getMode: () => TableMode; /** server モードのフェッチ状態。client モードでは status='idle' / rows=[] が返る。 */
  getServerState: () => ServerState<TRow>; /** 現在の state で fetch を再発火 (refresh / retry 用)。client モードでは no-op。 */
  refresh: () => Promise<void>;
  /**
   * Infinite scroll 用: 既存 rows を保ったまま次ページを取得して append。
   * dataSource.fetch が cursor / offset を扱うように実装されている前提。
   * 末端 (nextCursor=null) の場合は no-op。client モードでも no-op。
   */
  fetchMore: () => Promise<void>; /** Realtime 用: in-memory data に対して行を差分更新 (insert / update / delete)。 */
  applyRowEvent: (event: {
    kind: 'insert';
    row: TRow;
  } | {
    kind: 'update';
    rowId: RowId;
    row: TRow;
  } | {
    kind: 'delete';
    rowId: RowId;
  }) => void;
};
declare function createTable<TRow>(opts: CreateTableOptions<TRow>): TableInstance<TRow>;
//#endregion
export { TableMode as a, _INTERNAL as c, ServerState as d, ServerStatus as f, TableInternal as i, createTable as l, EngineDriverFactory as m, Listener as n, TableState as o, EngineDriver as p, TableInstance as r, VisibleRow as s, CreateTableOptions as t, ServerError as u };
//# sourceMappingURL=create-table-BKUeRmqP.d.ts.map