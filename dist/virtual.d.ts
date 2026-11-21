//#region src/virtual.d.ts
type VirtualRangeInput = {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan: number;
  totalRows: number;
};
type VirtualRange = {
  startIdx: number;
  endIdx: number;
  paddingTop: number;
  paddingBottom: number;
};
declare function getVirtualRange(input: VirtualRangeInput): VirtualRange;
//#endregion
export { VirtualRange, VirtualRangeInput, getVirtualRange };
//# sourceMappingURL=virtual.d.ts.map