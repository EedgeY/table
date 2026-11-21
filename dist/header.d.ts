import { s as ColumnNode } from "./column-DyosWKa_.js";

//#region src/header.d.ts
/** ヘッダーセル1個分の情報。HTML thead の <th> 属性にそのまま渡せる形。 */
type HeaderCell = {
  readonly id: string;
  readonly label: string;
  readonly colSpan: number;
  readonly rowSpan: number;
  readonly isLeaf: boolean; /** 葉ノードの場合の元 ColumnDef.id。グループでは undefined。 */
  readonly columnId?: string;
};
/** 行ごとの HeaderCell の並び。`<thead>` の `<tr>` × 行数 に対応。 */
type HeaderMatrix = ReadonlyArray<ReadonlyArray<HeaderCell>>;
/**
 * ColumnNode ツリーから rowSpan / colSpan 付きの 2 次元ヘッダーマトリクスを構築する。
 * 純関数。UI 層は `m.map(row => <tr>{row.map(c => <th colSpan={c.colSpan}/>)}</tr>)` で
 * そのまま描画できる。
 */
declare function buildHeaderMatrix<TRow, TKey extends string = string>(nodes: ReadonlyArray<ColumnNode<TRow, TKey>>): HeaderMatrix;
//#endregion
export { HeaderCell, HeaderMatrix, buildHeaderMatrix };
//# sourceMappingURL=header.d.ts.map