import { n as CellValue, r as ColumnDef } from "./column-DyosWKa_.js";

//#region src/xlsx.d.ts
type ExportXlsxOptions<TRow> = {
  readonly sheetName?: string;
  readonly columns?: ReadonlyArray<ColumnDef<TRow>>;
  readonly formatCell?: (value: CellValue, column: ColumnDef<TRow>) => CellValue;
};
declare function _colName(n: number): string;
/**
 * 行配列 + 列定義から XLSX Uint8Array を生成。
 * 文字列 sheet 化を抑えるため SharedStrings を構築。
 */
declare function exportXlsx<TRow>(rows: ReadonlyArray<TRow>, columns: ReadonlyArray<ColumnDef<TRow>>, opts?: ExportXlsxOptions<TRow>): Uint8Array;
//#endregion
export { ExportXlsxOptions, _colName, exportXlsx };
//# sourceMappingURL=xlsx.d.ts.map