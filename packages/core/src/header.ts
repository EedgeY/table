import type { ColumnNode } from './column.ts';
import { _buildHeaderLayout } from './_header-layout.ts';

/** ヘッダーセル1個分の情報。HTML thead の <th> 属性にそのまま渡せる形。 */
export type HeaderCell = {
	readonly id: string;
	readonly label: string;
	readonly colSpan: number;
	readonly rowSpan: number;
	readonly isLeaf: boolean;
	/** 葉ノードの場合の元 ColumnDef.id。グループでは undefined。 */
	readonly columnId?: string;
};

/** 行ごとの HeaderCell の並び。`<thead>` の `<tr>` × 行数 に対応。 */
export type HeaderMatrix = ReadonlyArray<ReadonlyArray<HeaderCell>>;

/**
 * ColumnNode ツリーから rowSpan / colSpan 付きの 2 次元ヘッダーマトリクスを構築する。
 * 純関数。UI 層は `m.map(row => <tr>{row.map(c => <th colSpan={c.colSpan}/>)}</tr>)` で
 * そのまま描画できる。
 */
export function buildHeaderMatrix<TRow, TKey extends string = string>(
	nodes: ReadonlyArray<ColumnNode<TRow, TKey>>,
): HeaderMatrix {
	return _buildHeaderLayout(nodes);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	describe('buildHeaderMatrix (公開ラッパ)', () => {
		it('葉のみ', () => {
			const m = buildHeaderMatrix([
				{ id: 'a', accessor: () => 0 },
				{ id: 'b', accessor: () => 0 },
			]);
			expect(m).toHaveLength(1);
			expect(m[0]!.map((c) => c.id)).toEqual(['a', 'b']);
		});
	});
}
