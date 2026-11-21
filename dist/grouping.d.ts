import { n as CellValue } from "./column-DyosWKa_.js";
import { t as RowId } from "./_types-ChlTfGdX.js";
import { r as TableInstance } from "./create-table-BKUeRmqP.js";
import { AggregateMixin } from "./aggregate.js";

//#region src/grouping.d.ts
/**
 * グループ階層 1 ノード。葉/非葉の区別は children.length で判別。
 * indices は元データの行インデックス (`pipeline.sorted` 由来) を含む。
 * aggregates はそのグループ範囲で計算済みの集約値。
 */
type RowGroupNode = {
  readonly key: CellValue; /** ルートからこのノードまでのキー列。深さに応じて長さが伸びる。 */
  readonly path: ReadonlyArray<CellValue>;
  readonly depth: number;
  readonly indices: Uint32Array;
  readonly children: ReadonlyArray<RowGroupNode>;
  readonly aggregates: Readonly<Record<string, number | null>>;
};
/** トップレベルから始まるノードの配列。groupBy が空配列なら空 tree。 */
type RowGroupTree = ReadonlyArray<RowGroupNode>;
/**
 * Flat 化されたグループ行。`getFlatGroupedRows()` の戻り値要素。
 * tbody を 1 次元配列としてレンダリングし、virtualization をそのまま使えるようにする。
 */
type FlatGroupRow<TRow> = {
  readonly kind: 'group';
  readonly node: RowGroupNode;
} | {
  readonly kind: 'row';
  readonly id: RowId;
  readonly row: TRow;
  readonly index: number; /** インデント表示用。groupBy の深さに等しい (= groupBy.length)。 */
  readonly depth: number;
};
/**
 * `withGrouping(t)` で attach される mixin の公開シェイプ。
 */
type GroupingMixin<TRow> = {
  setGroupBy: (columnIds: ReadonlyArray<string>) => void; /** 折り畳まれているグループの path id (`JSON.stringify(node.path)`) 集合を一括設定。 */
  setCollapsedGroups: (pathIds: Iterable<string>) => void; /** 1 つの group の折り畳み状態を反転。 */
  toggleCollapsed: (pathId: string) => void;
  getGroupBy: () => ReadonlyArray<string>;
  getCollapsedGroups: () => ReadonlySet<string>; /** groupBy 階層を含むグループツリー。groupBy 未設定なら空配列。 */
  getGroupedRows: () => RowGroupTree;
  /**
   * グループツリーを 1 次元 (group header + leaf row が混在) に flatten した配列。
   * tbody を平坦に描画して virtualization をそのまま使えるようにするためのもの。
   * groupBy 未設定なら空配列。
   */
  getFlatGroupedRows: () => ReadonlyArray<FlatGroupRow<TRow>>;
};
/**
 * `TableInstance` にグルーピング機能を attach する。冪等: 既に attach 済みなら同じ参照を返す。
 *
 * 内部で `withAggregate(t)` を呼ぶ (idempotent) ので、`AggregateMixin` の API も同時に生える。
 * グループツリーの各ノードに集約値を載せるため、集約 spec を共有する必要がある。
 *
 * 注意: groupBy/collapsed は `TableState` の外側のクロージャ状態に持つ。
 * `subscribeWithSelector` では観測できないため、UI は plain `subscribe` を使うこと。
 */
declare function withGrouping<TRow>(table: TableInstance<TRow>): TableInstance<TRow> & GroupingMixin<TRow> & AggregateMixin;
//#endregion
export { FlatGroupRow, GroupingMixin, RowGroupNode, RowGroupTree, withGrouping };
//# sourceMappingURL=grouping.d.ts.map