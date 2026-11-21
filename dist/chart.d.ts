import { n as CellValue, r as ColumnDef } from "./column-DyosWKa_.js";
import { t as ChartConfig } from "./query-Cz5tpFWu.js";

//#region src/chart.d.ts
type ChartCategoryData = {
  readonly type: 'bar' | 'line' | 'pie' | 'combo'; /** カテゴリ (groupBy キー) ごとに、メトリクス並び順の値配列。 */
  readonly categories: ReadonlyArray<{
    readonly key: CellValue | null;
    readonly values: ReadonlyArray<number | null>;
  }>; /** メトリクスのラベル ("sum(salary)" 形式)。凡例 / 軸ラベル用。 */
  readonly metricLabels: ReadonlyArray<string>;
};
type ChartBubbleData = {
  readonly type: 'bubble';
  readonly points: ReadonlyArray<{
    readonly key: CellValue | null;
    readonly x: number | null;
    readonly y: number | null;
    readonly r: number | null;
  }>;
  readonly axisLabels: {
    readonly x: string;
    readonly y: string;
    readonly r: string;
  };
};
type ChartData = ChartCategoryData | ChartBubbleData;
/**
 * 行配列 + ChartConfig からチャート用データを構築。
 * `rows` は通常 `table.getVisibleRows()` の row のみ (filter + sort 済み) を渡す想定。
 */
declare function buildChartData<TRow>(rows: ReadonlyArray<TRow>, columns: ReadonlyArray<ColumnDef<TRow>>, config: ChartConfig): ChartData;
//#endregion
export { ChartBubbleData, ChartCategoryData, ChartData, buildChartData };
//# sourceMappingURL=chart.d.ts.map