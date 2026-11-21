//#region src/_aggregate.d.ts
/**
 * - count: null/undefined を除いた非欠損数
 * - countDistinct: ユニークな非 null 値の数
 * - sum/avg/min/max: 数値化できた値のみ対象
 * - median: 中央値
 * - p25 / p75 / p90 / p95 / p99: 線形補間で分位数
 * - stddev / variance: 母分散・母標準偏差
 */
type AggregateFn = 'count' | 'countDistinct' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'p25' | 'p75' | 'p90' | 'p95' | 'p99' | 'stddev' | 'variance';
//#endregion
export { AggregateFn as t };
//# sourceMappingURL=_aggregate-DIRq4gJY.d.ts.map