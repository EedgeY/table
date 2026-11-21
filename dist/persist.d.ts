import { l as ColumnPinningState, p as ColumnVisibilityState, u as ColumnSizingState } from "./column-DyosWKa_.js";
import { o as Predicate } from "./filter-4LNTxfrR.js";
import { n as PaginationState } from "./pagination-BDJRxWZ9.js";
import { r as SortSpec } from "./sort-CxVgnAS7.js";
import { r as TableInstance } from "./create-table-BKUeRmqP.js";

//#region src/persist.d.ts
type PersistInclude = 'predicate' | 'sort' | 'pagination' | 'columnSizing' | 'columnVisibility' | 'columnPinning' | 'grouping';
type Snapshot = {
  readonly v: 1;
  readonly predicate?: Predicate | null;
  readonly sort?: SortSpec;
  readonly pagination?: PaginationState;
  readonly columnSizing?: ColumnSizingState;
  readonly columnVisibility?: ColumnVisibilityState;
  readonly columnPinning?: ColumnPinningState;
  readonly grouping?: ReadonlyArray<string>;
};
interface PersistStorage {
  readonly load: (key: string) => string | null;
  readonly save: (key: string, value: string) => void;
}
type PersistOptions = {
  readonly key: string;
  readonly storage?: 'local' | 'url' | PersistStorage; /** 保存対象を絞り込む。未指定なら全項目。 */
  readonly include?: ReadonlyArray<PersistInclude>; /** 書き込み debounce (連続変更を 1 回に集約)。既定 100ms。 */
  readonly debounceMs?: number;
};
declare function _captureSnapshot<TRow>(table: TableInstance<TRow>, include: ReadonlySet<PersistInclude>): Snapshot;
declare function _applySnapshot<TRow>(table: TableInstance<TRow>, snap: Snapshot, include: ReadonlySet<PersistInclude>): void;
type PersistMixin = {
  /** 現在の state を即時に保存 (debounce を待たない)。 */flushPersist: () => void; /** 保存済みデータを読み直して適用。 */
  reloadPersist: () => void; /** 永続化を停止 & 保存済みデータも削除。 */
  clearPersist: () => void;
};
/**
 * `TableInstance` に永続化を attach する。create 直後に呼ぶこと。
 * `withGrouping` を併用する場合は `withGrouping(t)` の後に呼ぶと
 * grouping 状態も保存対象になる。
 */
declare function withPersist<TRow>(table: TableInstance<TRow>, opts: PersistOptions): TableInstance<TRow> & PersistMixin;
//#endregion
export { PersistInclude, PersistMixin, PersistOptions, PersistStorage, Snapshot, _applySnapshot, _captureSnapshot, withPersist };
//# sourceMappingURL=persist.d.ts.map