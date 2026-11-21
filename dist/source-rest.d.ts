import { o as Predicate } from "./filter-4LNTxfrR.js";
import { n as DataSource } from "./data-source-crBvwLY-.js";

//#region src/source-rest.d.ts
/**
 * filter AST から URL クエリ文字列への変換戦略。
 * デフォルトでは `?col=value` のフラットなパラメータ列に潰す (top-level AND of leaves のみサポート)。
 */
type FilterEncoder = (predicate: Predicate | null) => Record<string, string>;
/**
 * sort spec から URL クエリ文字列への変換戦略。
 * デフォルト: `_sort=col1:asc,col2:desc`。
 */
type SortEncoder = (sort: ReadonlyArray<{
  columnId: string;
  dir: 'asc' | 'desc';
}>) => Record<string, string>;
type RestSourceOptions<TRow> = {
  readonly baseUrl: string; /** リソースパス (例: 'users') */
  readonly resource: string; /** row → 一意な id 文字列。URL に埋めるため。 */
  readonly idOf: (row: TRow) => string; /** 任意の認証ヘッダなど。 */
  readonly headers?: Record<string, string> | (() => Record<string, string>); /** filter エンコード。未指定なら top-level AND of leaves を ?col=value で。 */
  readonly encodeFilter?: FilterEncoder;
  readonly encodeSort?: SortEncoder;
  /**
   * レスポンスから { rows, totalCount, nextCursor } を抽出。
   * 既定: `{ rows, totalCount }` をそのまま受け取る。
   */
  readonly parseResponse?: (json: unknown) => {
    rows: ReadonlyArray<TRow>;
    totalCount: number;
    nextCursor?: string | null;
  }; /** fetch 実装の差し替え (テスト用)。 */
  readonly fetchImpl?: typeof fetch;
};
declare function createRestDataSource<TRow>(opts: RestSourceOptions<TRow>): DataSource<TRow>;
//#endregion
export { FilterEncoder, RestSourceOptions, SortEncoder, createRestDataSource };
//# sourceMappingURL=source-rest.d.ts.map