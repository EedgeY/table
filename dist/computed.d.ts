import { r as ColumnDef } from "./column-DyosWKa_.js";
import { i as ComputedColumnSpec } from "./query-Cz5tpFWu.js";

//#region src/computed.d.ts
/**
 * 式 spec を accessor 付き `ColumnDef` 列にコンパイルする。
 * spec は定義順に処理され、後の式は「base 列 + それ以前にコンパイルした computed 列」を
 * 参照できる (parse 時の検証と同じ可視範囲)。返り値は computed 列のみ (base は含まない)。
 */
declare function compileComputedColumns<TRow>(specs: ReadonlyArray<ComputedColumnSpec>, baseColumns: ReadonlyArray<ColumnDef<TRow>>): ColumnDef<TRow>[];
//#endregion
export { compileComputedColumns };
//# sourceMappingURL=computed.d.ts.map