//#region src/_types.d.ts
declare const RowIdBrand: unique symbol;
type RowId = string & {
  readonly [RowIdBrand]: true;
};
//#endregion
export { RowId as t };
//# sourceMappingURL=_types-ChlTfGdX.d.ts.map