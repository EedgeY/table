import { n as CellValue, r as ColumnDef } from "./column-DyosWKa_.js";

//#region src/export.d.ts
type ExportFormat = 'csv' | 'tsv';
type ExportOptions<TRow> = {
  /** 出力形式。既定 'csv'。 */readonly format?: ExportFormat; /** ヘッダー行を出すか。既定 true。 */
  readonly includeHeader?: boolean; /** UTF-8 BOM を先頭に付けるか。既定 true (Excel 互換)。 */
  readonly bom?: boolean;
  /**
   * 出力対象列。未指定なら引数 columns をそのまま使う。
   * UI 層で getVisibleColumns() を渡すと表示列のみ出力できる。
   */
  readonly columns?: ReadonlyArray<ColumnDef<TRow>>; /** セル値のカスタムフォーマッタ (例: 通貨/日付)。 */
  readonly formatCell?: (value: CellValue, column: ColumnDef<TRow>) => string; /** 行末文字。既定 '\r\n' (Excel 互換)。 */
  readonly eol?: string;
};
/**
 * 行配列を CSV / TSV 文字列に変換する。
 *
 * - 値内に区切り文字 / 改行 / ダブルクオートが含まれる場合は "..." でクオートし、
 *   内部のダブルクオートは "" にエスケープ (RFC 4180)。
 * - null / undefined は空文字。
 * - UTF-8 BOM 付き出力で、Excel での日本語ファイル読み込みに対応。
 */
declare function exportRows<TRow>(rows: ReadonlyArray<TRow>, columns: ReadonlyArray<ColumnDef<TRow>>, options?: ExportOptions<TRow>): string;
//#endregion
export { ExportFormat, ExportOptions, exportRows };
//# sourceMappingURL=export.d.ts.map