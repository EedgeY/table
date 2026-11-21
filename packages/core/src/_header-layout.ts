import type { ColumnNode } from './column.ts';
import { isColumnGroup } from './column.ts';
import type { HeaderCell, HeaderMatrix } from './header.ts';

function _depth<TRow, TKey extends string>(node: ColumnNode<TRow, TKey>): number {
	if (!isColumnGroup(node)) {
		return 1;
	}
	let max = 0;
	for (const c of node.children) {
		const d = _depth(c);
		if (d > max) {
			max = d;
		}
	}
	return 1 + max;
}

function _leafCount<TRow, TKey extends string>(node: ColumnNode<TRow, TKey>): number {
	if (!isColumnGroup(node)) {
		return 1;
	}
	let total = 0;
	for (const c of node.children) {
		total += _leafCount(c);
	}
	return total;
}

export function _buildHeaderLayout<TRow, TKey extends string>(
	nodes: ReadonlyArray<ColumnNode<TRow, TKey>>,
): HeaderMatrix {
	let totalDepth = 0;
	for (const n of nodes) {
		const d = _depth(n);
		if (d > totalDepth) {
			totalDepth = d;
		}
	}
	if (totalDepth === 0) {
		return [];
	}

	const rows: HeaderCell[][] = Array.from({ length: totalDepth }, () => []);

	const placeNode = (node: ColumnNode<TRow, TKey>, row: number): void => {
		if (isColumnGroup(node)) {
			rows[row]!.push({
				id: node.id,
				label: node.header,
				colSpan: _leafCount(node),
				rowSpan: 1,
				isLeaf: false,
			});
			for (const c of node.children) {
				placeNode(c, row + 1);
			}
		} else {
			rows[row]!.push({
				id: node.id,
				label: node.header ?? node.id,
				colSpan: 1,
				rowSpan: totalDepth - row,
				isLeaf: true,
				columnId: node.id,
			});
		}
	};
	for (const n of nodes) {
		placeNode(n, 0);
	}

	const out: HeaderCell[][] = [];
	for (const r of rows) {
		if (r.length > 0) {
			out.push(r);
		}
	}
	return out;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('_buildHeaderLayout', () => {
		it('葉のみは1段ヘッダー', () => {
			const cols: ColumnNode<unknown>[] = [
				{ id: 'a', accessor: () => 0 },
				{ id: 'b', accessor: () => 0 },
			];
			const m = _buildHeaderLayout(cols);
			expect(m).toHaveLength(1);
			expect(m[0]).toHaveLength(2);
			expect(m[0]![0]!.rowSpan).toBe(1);
			expect(m[0]![0]!.colSpan).toBe(1);
		});

		it('「id | groupname/(id,name,address) | tel」が 2 段ヘッダーになる', () => {
			const cols: ColumnNode<unknown>[] = [
				{ id: 'id', accessor: () => 0 },
				{
					kind: 'group',
					id: 'gn',
					header: 'groupname',
					children: [
						{ id: 'gid', accessor: () => 0 },
						{ id: 'gname', accessor: () => 0 },
						{ id: 'gaddr', accessor: () => 0 },
					],
				},
				{ id: 'tel', accessor: () => 0 },
			];
			const m = _buildHeaderLayout(cols);
			expect(m).toHaveLength(2);
			expect(m[0]!).toHaveLength(3);
			expect(m[0]![0]).toMatchObject({ id: 'id', rowSpan: 2, colSpan: 1, isLeaf: true });
			expect(m[0]![1]).toMatchObject({ id: 'gn', rowSpan: 1, colSpan: 3, isLeaf: false });
			expect(m[0]![2]).toMatchObject({ id: 'tel', rowSpan: 2, colSpan: 1, isLeaf: true });
			expect(m[1]!.map((c) => c.id)).toEqual(['gid', 'gname', 'gaddr']);
			expect(m[1]!.every((c) => c.rowSpan === 1 && c.colSpan === 1)).toBe(true);
		});

		it('3段ネスト', () => {
			const cols: ColumnNode<unknown>[] = [
				{
					kind: 'group',
					id: 'A',
					header: 'A',
					children: [
						{ id: 'a1', accessor: () => 0 },
						{
							kind: 'group',
							id: 'B',
							header: 'B',
							children: [
								{ id: 'b1', accessor: () => 0 },
								{ id: 'b2', accessor: () => 0 },
							],
						},
					],
				},
			];
			const m = _buildHeaderLayout(cols);
			expect(m).toHaveLength(3);
			expect(m[0]).toMatchObject([{ id: 'A', colSpan: 3, rowSpan: 1 }]);
			expect(m[1]).toMatchObject([
				{ id: 'a1', rowSpan: 2, colSpan: 1, isLeaf: true },
				{ id: 'B', rowSpan: 1, colSpan: 2, isLeaf: false },
			]);
			expect(m[2]!.map((c) => c.id)).toEqual(['b1', 'b2']);
		});

		it('空配列は空マトリクス', () => {
			expect(_buildHeaderLayout([])).toEqual([]);
		});
	});
}
