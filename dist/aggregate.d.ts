import { n as CellValue, r as ColumnDef } from "./column-DyosWKa_.js";
import { t as AggregateFn } from "./_aggregate-DIRq4gJY.js";
import { r as TableInstance } from "./create-table-BKUeRmqP.js";

//#region src/aggregate.d.ts
/** 単一列+関数の組。setAggregations で渡す形。 */
type AggregationSpec = {
  readonly columnId: string;
  readonly fn: AggregateFn;
};
/** 集約結果1バケツ。groupBy なしなら 1 要素配列で key=null。 */
type AggregateBucket = {
  readonly key: CellValue | null;
  readonly count: number;
  readonly values: Readonly<Record<string, number | null>>;
};
type AggregateOptions = {
  /** グループ化列 (1段)。未指定なら全体集計。 */readonly groupBy?: string; /** 集約対象列 → 関数のマップ。 */
  readonly columns: Readonly<Record<string, AggregateFn>>;
};
/**
 * 行配列を 1 段の groupBy で集約。チャート向けの shape。
 *
 * - `groupBy` 未指定: 全行を 1 バケツに集約し key=null。
 * - `groupBy` 指定: バケツの順番は最初に出現したキーの順 (Map の挿入順) を保つ。
 * - count: 行数 (null 値を含む)。
 */
declare function aggregate<TRow>(rows: ReadonlyArray<TRow>, columns: ReadonlyArray<ColumnDef<TRow>>, opts: AggregateOptions): ReadonlyArray<AggregateBucket>;
/**
 * `withAggregate(t)` で attach される mixin の公開シェイプ。
 *
 * - `setAggregations` は集約 spec を入れ替えて再描画通知
 * - `getOverallAggregates` は filter+sort 後の全行に対する集約値 (footer 用)
 */
type AggregateMixin = {
  setAggregations: (specs: ReadonlyArray<AggregationSpec>) => void;
  getAggregations: () => ReadonlyArray<AggregationSpec>;
  getOverallAggregates: () => Readonly<Record<string, number | null>>;
};
declare const _AGGREGATE_STATE: unique symbol;
type AggregateState = {
  readonly getAggSpecsMap: () => Readonly<Record<string, AggregateFn>>;
};
/**
 * `TableInstance` に集約機能を attach する。冪等: 既に attach 済みなら何もしない。
 *
 * `getOverallAggregates()` は filter+sort 反映後の indices で計算される
 * (内部アクセサ経由で pipeline を見るため)。
 *
 * 注意: 集約 spec は `TableState` の外側のクロージャ状態に持つ。
 * `subscribeWithSelector` では観測できないため、UI は plain `subscribe` を使うこと。
 */
declare function withAggregate<TRow>(table: TableInstance<TRow>): TableInstance<TRow> & AggregateMixin;
//#endregion
export { AggregateBucket, type AggregateFn, AggregateMixin, AggregateOptions, AggregateState, AggregationSpec, _AGGREGATE_STATE, aggregate, withAggregate };
//# sourceMappingURL=aggregate.d.ts.map