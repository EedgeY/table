//#region src/sort.d.ts
type SortDir = 'asc' | 'desc';
type SortKey<K extends string = string> = {
  readonly columnId: K;
  readonly dir: SortDir;
  readonly nulls?: 'first' | 'last';
};
type SortSpec<K extends string = string> = ReadonlyArray<SortKey<K>>;
//#endregion
export { SortKey as n, SortSpec as r, SortDir as t };
//# sourceMappingURL=sort-CxVgnAS7.d.ts.map