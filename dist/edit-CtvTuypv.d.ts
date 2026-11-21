import { t as Result } from "./_result-24D-ZFgW.js";
import { t as RowId } from "./_types-ChlTfGdX.js";
import { r as EditError } from "./data-source-crBvwLY-.js";
import { r as TableInstance } from "./create-table-BKUeRmqP.js";

//#region src/_edit-store.d.ts
type CellKey = string;
/** undo/redo 1 操作。1 セル変更 = 1 entry。 */
type EditOp = {
  readonly rowId: RowId;
  readonly columnId: string;
  readonly before: unknown;
  readonly after: unknown;
};
type EditState = {
  readonly dirty: ReadonlyMap<CellKey, unknown>;
  readonly inFlight: ReadonlySet<CellKey>;
  readonly errors: ReadonlyMap<CellKey, EditError>;
  readonly undoStack: ReadonlyArray<EditOp>;
  readonly redoStack: ReadonlyArray<EditOp>;
};
//#endregion
//#region src/edit.d.ts
type EditMixin<TRow> = {
  getEditState: () => EditState;
  commitEdit: (input: {
    rowId: RowId;
    columnId: string;
    value: unknown;
  }) => Promise<Result<TRow, EditError>>;
  rollbackCell: (rowId: RowId, columnId: string) => void;
  clearEditError: (rowId: RowId, columnId: string) => void;
  undo: () => Promise<Result<void, EditError>>;
  redo: () => Promise<Result<void, EditError>>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  subscribeEdit: (cb: (state: EditState) => void) => () => void; /** セル単位の dirty / inFlight / error を 1 回で取得するヘルパ。 */
  getCellEdit: (rowId: RowId, columnId: string) => {
    readonly dirty: boolean;
    readonly inFlight: boolean;
    readonly error: EditError | null;
  };
};
type WithEditOptions = {
  /** undo stack の上限。既定 50。 */readonly maxHistory?: number;
};
/**
 * `TableInstance` に編集機能を attach。冪等。
 * dataSource が createTable に渡されていなければ、オフライン編集として動作
 * (data ref のみ書き換え、サーバー反映なし)。
 */
declare function withEdit<TRow>(table: TableInstance<TRow>, options?: WithEditOptions): TableInstance<TRow> & EditMixin<TRow>;
//#endregion
export { EditState as a, EditOp as i, WithEditOptions as n, withEdit as r, EditMixin as t };
//# sourceMappingURL=edit-CtvTuypv.d.ts.map