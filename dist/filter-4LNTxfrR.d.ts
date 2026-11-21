import { n as CellValue } from "./column-DyosWKa_.js";

//#region src/filter.d.ts
type FilterOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'like' | 'startsWith' | 'endsWith' | 'isNull' | 'isNotNull' | 'in';
type Combinator = 'and' | 'or';
type Leaf<K extends string = string> = {
  readonly kind: 'leaf';
  readonly columnId: K;
  readonly op: FilterOp;
  readonly value?: CellValue | readonly CellValue[];
  readonly caseSensitive?: boolean;
};
type Group<K extends string = string> = {
  readonly kind: 'group';
  readonly combinator: Combinator;
  readonly children: ReadonlyArray<Predicate<K>>;
  readonly negate?: boolean;
};
type Predicate<K extends string = string> = Leaf<K> | Group<K>;
/** Same-column multi-condition shortcut. Lowered to a Group by `f.column`. */
type ColumnFilter<K extends string = string> = {
  readonly columnId: K;
  readonly combinator: Combinator;
  readonly conditions: ReadonlyArray<Omit<Leaf<K>, 'kind' | 'columnId'>>;
};
declare function leaf<K extends string>(columnId: K, op: FilterOp, value?: CellValue | readonly CellValue[], caseSensitive?: boolean): Leaf<K>;
declare function and<K extends string>(...children: Predicate<K>[]): Group<K>;
declare function or<K extends string>(...children: Predicate<K>[]): Group<K>;
declare function not<K extends string>(p: Predicate<K>): Group<K>;
declare function column<K extends string>(cf: ColumnFilter<K>): Group<K>;
declare const f: Readonly<{
  leaf: typeof leaf;
  and: typeof and;
  or: typeof or;
  not: typeof not;
  column: typeof column;
}>;
//#endregion
export { Leaf as a, Group as i, Combinator as n, Predicate as o, FilterOp as r, f as s, ColumnFilter as t };
//# sourceMappingURL=filter-4LNTxfrR.d.ts.map