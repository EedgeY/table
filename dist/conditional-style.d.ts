import { n as CellValue, r as ColumnDef } from "./column-DyosWKa_.js";

//#region src/conditional-style.d.ts
type CellStyleObject = Readonly<{
  color?: string;
  backgroundColor?: string;
  fontWeight?: 'normal' | 'bold' | string;
  textDecoration?: 'none' | 'underline' | 'line-through';
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  className?: string;
}>;
type ConditionalRule<TRow> = /** 関数ベース: 全権限を委ねる */{
  readonly kind: 'fn';
  readonly compute: (input: {
    row: TRow;
    value: CellValue;
  }) => CellStyleObject | null;
} /** 比較演算: value <op> threshold で true なら style */ | {
  readonly kind: 'compare';
  readonly op: '>' | '<' | '>=' | '<=' | '=' | '!=';
  readonly threshold: number;
  readonly style: CellStyleObject;
} /** 範囲: min <= value <= max なら style */ | {
  readonly kind: 'between';
  readonly min: number;
  readonly max: number;
  readonly style: CellStyleObject;
} /** カラースケール (ヒートマップ): min/max 間で色を補間 */ | {
  readonly kind: 'scale';
  readonly min: number;
  readonly max: number; /** 開始色 (oklch / hex / rgb)。背景色として適用。 */
  readonly minColor: string;
  readonly maxColor: string;
} | {
  readonly kind: 'bar';
  readonly min: number;
  readonly max: number;
  readonly color: string;
};
type ConditionalCellMeta<TRow> = {
  readonly rules: ReadonlyArray<ConditionalRule<TRow>>;
};
/** rule の集合を順に評価して、merge した CellStyleObject を返す。 */
declare function evaluateCellStyle<TRow>(input: {
  readonly row: TRow;
  readonly value: CellValue;
  readonly rules: ReadonlyArray<ConditionalRule<TRow>>;
}): CellStyleObject;
declare function _lerpColor(a: string, b: string, t: number): string;
declare function _getColumnRules<TRow>(column: ColumnDef<TRow> & {
  cellStyle?: ConditionalCellMeta<TRow> | undefined;
}): ReadonlyArray<ConditionalRule<TRow>>;
//#endregion
export { CellStyleObject, ConditionalCellMeta, ConditionalRule, _getColumnRules, _lerpColor, evaluateCellStyle };
//# sourceMappingURL=conditional-style.d.ts.map