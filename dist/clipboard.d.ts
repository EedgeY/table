import { n as CellValue, r as ColumnDef } from "./column-DyosWKa_.js";
import { t as RowId } from "./_types-ChlTfGdX.js";
import { t as CellPatch } from "./data-source-crBvwLY-.js";

//#region src/clipboard.d.ts
/** 行 × 列の 2 次元配列を TSV 文字列に変換。 */
declare function toTsv<TRow>(rows: ReadonlyArray<TRow>, columns: ReadonlyArray<ColumnDef<TRow>>): string;
/**
 * TSV 文字列を 2 次元 string 配列にパース。
 * - 行末は \r\n / \n / \r いずれも許容
 * - "..." でクオートされたセルは Excel スタイルの "" エスケープを解除
 * - 末尾の空行は無視
 */
declare function parseTsv(tsv: string): string[][];
/**
 * 矩形ペーストの入力。
 *
 * - tsv: クリップボードから受け取った文字列
 * - anchor: ペースト先の起点 ({ rowIndex, columnIndex } = 表示順での位置)
 * - rows: ペースト対象行 (table.getPagedRows() の row のみ)
 * - rowIds: 各 rows に対応する RowId
 * - columns: ペースト対象列 (table.getVisibleColumns())
 * - parsers: 列ごとの string → 値の変換 (未指定なら数値判定して落とす)
 */
type BuildPastePatchesInput<TRow> = {
  readonly tsv: string;
  readonly anchor: {
    readonly rowIndex: number;
    readonly columnIndex: number;
  };
  readonly rows: ReadonlyArray<TRow>;
  readonly rowIds: ReadonlyArray<RowId>;
  readonly columns: ReadonlyArray<ColumnDef<TRow>>;
  readonly parsers?: Readonly<Record<string, (raw: string) => CellValue | unknown>>;
};
/**
 * TSV から CellPatch[] を構築。範囲外 (anchor + i がテーブル末尾を超える) は切り捨て。
 * 編集不可な列 (parsers でも `edit` メタでも判定不能なため) はそのまま patch を作る。
 * 呼び出し側で `withEdit` を通せば自動で edit メタを尊重 (editable=false なら commit 失敗で
 * rollback される)。
 */
declare function buildPasteCellPatches<TRow>(input: BuildPastePatchesInput<TRow>): CellPatch[];
//#endregion
export { BuildPastePatchesInput, buildPasteCellPatches, parseTsv, toTsv };
//# sourceMappingURL=clipboard.d.ts.map