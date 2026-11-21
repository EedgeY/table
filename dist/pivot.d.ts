import { n as CellValue, r as ColumnDef } from "./column-DyosWKa_.js";
import { t as AggregateFn } from "./_aggregate-DIRq4gJY.js";

//#region src/pivot.d.ts
type PivotValueSpec = {
  readonly columnId: string;
  readonly fn: AggregateFn;
};
type PivotConfig = {
  readonly rows: ReadonlyArray<string>;
  readonly cols: ReadonlyArray<string>;
  readonly values: ReadonlyArray<PivotValueSpec>;
};
/** 軸ヘッダーの 1 ノード。階層を path で表す。 */
type AxisNode = {
  readonly key: CellValue;
  readonly path: ReadonlyArray<CellValue>;
  readonly children: ReadonlyArray<AxisNode>; /** この軸ノードの葉ノードに対応する leaf index (matrix の行/列番号)。葉でない場合は -1。 */
  readonly leafIndex: number;
};
type PivotResult = {
  /** rowAxis の葉数 × (colAxis の葉数 × values.length) の 2 次元配列。null = 該当なし。 */readonly matrix: ReadonlyArray<ReadonlyArray<number | null>>;
  readonly rowAxis: ReadonlyArray<AxisNode>;
  readonly colAxis: ReadonlyArray<AxisNode>;
  readonly values: ReadonlyArray<PivotValueSpec>;
};
/**
 * 純関数: 行配列 + 列定義 + PivotConfig からピボット結果を計算。
 * 既存の `_aggregateOne` を 1 セルごとに呼ぶ。
 */
declare function pivot<TRow>(rows: ReadonlyArray<TRow>, columns: ReadonlyArray<ColumnDef<TRow>>, indices: ReadonlyArray<number>, config: PivotConfig): PivotResult;
//#endregion
export { AxisNode, PivotConfig, PivotResult, PivotValueSpec, pivot };
//# sourceMappingURL=pivot.d.ts.map