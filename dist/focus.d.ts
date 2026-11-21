import { t as RowId } from "./_types-ChlTfGdX.js";
import { r as TableInstance } from "./create-table-BKUeRmqP.js";

//#region src/focus.d.ts
type CellFocus = {
  readonly rowId: RowId;
  readonly columnId: string;
};
/**
 * 範囲選択。anchor は範囲の起点 (Shift+Click 元)、head は終点 (現在のフォーカス)。
 * 矩形は anchor と head から計算する。
 */
type CellRange = {
  readonly anchor: CellFocus;
  readonly head: CellFocus;
};
type FocusListener = (focus: CellFocus | null) => void;
type FocusMoveDirection = 'up' | 'down' | 'left' | 'right' | 'home' | 'end' | 'pageUp' | 'pageDown';
type FocusMixin = {
  getFocus: () => CellFocus | null;
  setFocus: (focus: CellFocus | null) => void;
  clearFocus: () => void;
  /**
   * 現在の focus から方向移動して新しい focus を計算 & セット。
   * pageSize は PageUp/Down 時に使う (viewport から渡す)。
   * 戻り値: 移動後の focus (空テーブルなら null)。
   */
  moveFocus: (direction: FocusMoveDirection, pageSize?: number) => CellFocus | null; /** focus のみを購読 (TableState とは独立)。 */
  subscribeFocus: (listener: FocusListener) => () => void;
  getRange: () => CellRange | null; /** 矩形を直接セット (アンカーとヘッドを与える)。 */
  setRange: (range: CellRange | null) => void; /** 現在のフォーカスを anchor にして range を開始。 */
  beginRange: () => void; /** anchor を保ったまま head のみ移動 (Shift+Arrow 等)。 */
  extendRange: (direction: FocusMoveDirection, pageSize?: number) => void;
  clearRange: () => void;
  /**
   * 現在の range が含むセル位置 (rowId, columnId) を全列挙。
   * クリップボードコピー等の用途。
   */
  getRangeCells: () => ReadonlyArray<{
    readonly rowId: RowId;
    readonly columnId: string;
  }>;
};
declare function withFocus<TRow>(table: TableInstance<TRow>): TableInstance<TRow> & FocusMixin;
//#endregion
export { CellFocus, CellRange, FocusListener, FocusMixin, FocusMoveDirection, withFocus };
//# sourceMappingURL=focus.d.ts.map