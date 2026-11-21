//#region src/pagination.d.ts
type PaginationState = {
  readonly pageIndex: number;
  readonly pageSize: number;
};
type PaginationDerived = {
  readonly pageCount: number;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly startIndex: number;
  readonly endIndex: number;
};
declare function createPaginationState(pageSize?: number): PaginationState;
//#endregion
export { PaginationState as n, createPaginationState as r, PaginationDerived as t };
//# sourceMappingURL=pagination-BDJRxWZ9.d.ts.map