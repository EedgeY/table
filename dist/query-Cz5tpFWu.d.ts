import { r as ColumnDef } from "./column-DyosWKa_.js";
import { t as AggregateFn } from "./_aggregate-DIRq4gJY.js";
import { o as Predicate } from "./filter-4LNTxfrR.js";
import { t as Result } from "./_result-24D-ZFgW.js";
import { r as SortSpec } from "./sort-CxVgnAS7.js";

//#region src/_computed-engine.d.ts
/** computed column の式 AST。serialize 可能で、コンパイルとは独立。 */
type ExprNode = {
  readonly kind: 'num';
  readonly value: number;
} | {
  readonly kind: 'str';
  readonly value: string;
} | {
  readonly kind: 'col';
  readonly name: string;
} | {
  readonly kind: 'neg';
  readonly operand: ExprNode;
} | {
  readonly kind: 'bin';
  readonly op: '+' | '-' | '*' | '/';
  readonly left: ExprNode;
  readonly right: ExprNode;
} | {
  readonly kind: 'concat';
  readonly left: ExprNode;
  readonly right: ExprNode;
} | {
  readonly kind: 'cmp';
  readonly op: '=' | '!=' | '>' | '<' | '>=' | '<=';
  readonly left: ExprNode;
  readonly right: ExprNode;
} | {
  readonly kind: 'func'; /** 正規化済みの関数名 (常に小文字; lexer は case-insensitive)。round-trip で安定。 */
  readonly name: string;
  readonly args: ReadonlyArray<ExprNode>;
};
//#endregion
//#region src/query.d.ts
type ParseError = {
  readonly message: string;
  readonly position: number;
  readonly token?: string;
};
type ChartType = 'bar' | 'line' | 'pie' | 'combo' | 'bubble';
type ChartMetric = {
  readonly fn: AggregateFn;
  readonly columnId: string;
};
type ChartConfig = {
  readonly type: ChartType;
  readonly groupBy: string;
  readonly metrics: ReadonlyArray<ChartMetric>;
};
/** `let name = expr;` 句から得られる computed column 定義 (式は AST のまま)。 */
type ComputedColumnSpec = {
  readonly name: string;
  readonly expr: ExprNode;
};
type ParsedQuery = {
  readonly predicate: Predicate | null;
  readonly sort: SortSpec; /** 先頭の `let …;` 句で定義された computed column。定義順を保持。 */
  readonly computed?: ReadonlyArray<ComputedColumnSpec>;
  readonly chart?: ChartConfig;
};
/**
 * クエリ文字列を ParsedQuery にパースする。
 * 列名は `columns` 内の id にマッチする必要があり、存在しない列はエラー。
 * 失敗時の `position` は文字オフセット (0-based)、`token` は問題のトークン文字列。
 */
declare function parseQuery<TRow>(input: string, columns: ReadonlyArray<ColumnDef<TRow>>): Result<ParsedQuery, ParseError>;
/**
 * Predicate AST を DSL 文字列に戻す。`null` は空文字。
 * `parseQuery(stringifyPredicate(p)) === { predicate: p, ... }` (構造的等価) を満たす。
 */
declare function stringifyPredicate(p: Predicate | null): string;
declare function _stringifyExpr(node: ExprNode): string;
/** SortSpec を `by col1, -col2` 形式の文字列に。空なら空文字。 */
declare function stringifySort(sort: SortSpec): string;
/**
 * `{ predicate, sort }` をクエリ DSL 文字列に。chart は対象外。
 * `parseQuery(stringifyQuery(x))` で同じ predicate / sort が復元される。
 */
declare function stringifyQuery(input: {
  readonly computed?: ReadonlyArray<ComputedColumnSpec>;
  readonly predicate?: Predicate | null;
  readonly sort?: SortSpec;
}): string;
//#endregion
export { ParseError as a, parseQuery as c, stringifySort as d, ExprNode as f, ComputedColumnSpec as i, stringifyPredicate as l, ChartMetric as n, ParsedQuery as o, ChartType as r, _stringifyExpr as s, ChartConfig as t, stringifyQuery as u };
//# sourceMappingURL=query-Cz5tpFWu.d.ts.map