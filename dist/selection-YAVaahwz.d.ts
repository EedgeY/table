import { t as RowId } from "./_types-ChlTfGdX.js";

//#region src/selection.d.ts
type SelectionMode = 'none' | 'single' | 'multi';
type SelectionState = {
  readonly mode: SelectionMode;
  readonly ids: ReadonlySet<RowId>;
};
declare function createSelectionState(mode?: SelectionMode): SelectionState;
//#endregion
export { SelectionState as n, createSelectionState as r, SelectionMode as t };
//# sourceMappingURL=selection-YAVaahwz.d.ts.map