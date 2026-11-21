import type { CellValue, ColumnDef } from './column.ts';
import { _aggregateMany } from './_aggregate.ts';
import type { AggregateFn } from './_aggregate.ts';
import type { FlatGroupRow, RowGroupNode } from './grouping.ts';
import type { RowId } from './_types.ts';

function _bucketize<TRow>(
	data: ReadonlyArray<TRow>,
	indices: ArrayLike<number> & Iterable<number>,
	col: ColumnDef<TRow>,
): Map<CellValue | null, number[]> {
	const map = new Map<CellValue | null, number[]>();
	for (const i of indices) {
		const k = col.accessor(data[i]!);
		const norm = k === undefined ? null : k;
		let arr = map.get(norm);
		if (!arr) {
			arr = [];
			map.set(norm, arr);
		}
		arr.push(i);
	}
	return map;
}

function _buildLevel<TRow>(
	data: ReadonlyArray<TRow>,
	indices: ArrayLike<number> & Iterable<number>,
	groupColumns: ReadonlyArray<ColumnDef<TRow>>,
	depth: number,
	parentPath: ReadonlyArray<CellValue>,
	allColumns: ReadonlyArray<ColumnDef<TRow>>,
	aggSpecs: Readonly<Record<string, AggregateFn>>,
): ReadonlyArray<RowGroupNode> {
	if (depth >= groupColumns.length) {
		return [];
	}
	const col = groupColumns[depth]!;
	const buckets = _bucketize(data, indices, col);
	const out: RowGroupNode[] = [];
	for (const [key, idxArr] of buckets) {
		const u32 = new Uint32Array(idxArr);
		const path = [...parentPath, key as CellValue];
		const children = _buildLevel(data, u32, groupColumns, depth + 1, path, allColumns, aggSpecs);
		out.push(
			Object.freeze({
				key: key as CellValue,
				path: Object.freeze(path),
				depth,
				indices: u32,
				children: Object.freeze(children),
				aggregates: _aggregateMany(data, u32, allColumns, aggSpecs),
			}),
		);
	}
	return Object.freeze(out);
}

export function _buildGroupTree<TRow>(
	data: ReadonlyArray<TRow>,
	sortedIndices: Uint32Array,
	groupColumns: ReadonlyArray<ColumnDef<TRow>>,
	allColumns: ReadonlyArray<ColumnDef<TRow>>,
	aggSpecs: Readonly<Record<string, AggregateFn>>,
): ReadonlyArray<RowGroupNode> {
	return _buildLevel(data, sortedIndices, groupColumns, 0, [], allColumns, aggSpecs);
}

export function _pathToId(path: ReadonlyArray<CellValue>): string {
	return JSON.stringify(path);
}

export function _flattenGroupTree<TRow>(
	tree: ReadonlyArray<RowGroupNode>,
	data: ReadonlyArray<TRow>,
	leafDepth: number,
	getRowId: (row: TRow, index: number) => RowId,
	collapsedPaths?: ReadonlySet<string>,
): ReadonlyArray<FlatGroupRow<TRow>> {
	const out: FlatGroupRow<TRow>[] = [];
	const visit = (node: RowGroupNode): void => {
		out.push({ kind: 'group', node });
		if (collapsedPaths !== undefined && collapsedPaths.has(_pathToId(node.path))) {
			return;
		}
		if (node.children.length === 0) {
			for (let i = 0; i < node.indices.length; i++) {
				const idx = node.indices[i]!;
				const row = data[idx]!;
				out.push({ kind: 'row', id: getRowId(row, idx), row, index: idx, depth: leafDepth });
			}
			return;
		}
		for (const child of node.children) {
			visit(child);
		}
	};
	for (const top of tree) {
		visit(top);
	}
	return out;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	type Row = { dept: string; city: string; salary: number };
	const cols: ColumnDef<Row>[] = [
		{ id: 'dept', accessor: (r) => r.dept },
		{ id: 'city', accessor: (r) => r.city },
		{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
	];
	const data: Row[] = [
		{ dept: 'eng', city: 'tokyo', salary: 100 },
		{ dept: 'eng', city: 'tokyo', salary: 200 },
		{ dept: 'eng', city: 'osaka', salary: 150 },
		{ dept: 'sales', city: 'tokyo', salary: 300 },
	];

	describe('_buildGroupTree', () => {
		it('1段の dept ごとに集計', () => {
			const tree = _buildGroupTree(data, new Uint32Array([0, 1, 2, 3]), [cols[0]!], cols, {
				salary: 'sum',
			});
			expect(tree).toHaveLength(2);
			expect(tree[0]).toMatchObject({
				key: 'eng',
				depth: 0,
				path: ['eng'],
				aggregates: { salary: 450 },
			});
			expect(tree[0]!.indices.length).toBe(3);
			expect(tree[1]).toMatchObject({
				key: 'sales',
				aggregates: { salary: 300 },
			});
		});

		it('2段ネスト (dept → city) で path が正しく構築される', () => {
			const tree = _buildGroupTree(
				data,
				new Uint32Array([0, 1, 2, 3]),
				[cols[0]!, cols[1]!],
				cols,
				{ salary: 'sum' },
			);
			expect(tree).toHaveLength(2);
			const eng = tree[0]!;
			expect(eng.children).toHaveLength(2);
			expect(eng.children[0]).toMatchObject({
				key: 'tokyo',
				path: ['eng', 'tokyo'],
				depth: 1,
				aggregates: { salary: 300 },
			});
			expect(eng.children[1]).toMatchObject({
				key: 'osaka',
				path: ['eng', 'osaka'],
				aggregates: { salary: 150 },
			});
		});

		it('集約なしで空 aggregates', () => {
			const tree = _buildGroupTree(data, new Uint32Array([0, 1, 2, 3]), [cols[0]!], cols, {});
			expect(tree[0]!.aggregates).toEqual({});
		});

		it('total count が rows.length と一致', () => {
			const tree = _buildGroupTree(data, new Uint32Array([0, 1, 2, 3]), [cols[0]!], cols, {});
			const total = tree.reduce((acc, n) => acc + n.indices.length, 0);
			expect(total).toBe(data.length);
		});
	});

	describe('_flattenGroupTree', () => {
		const id = (_r: Row, i: number) => String(i) as RowId;

		it('1段 dept で group→rows の順に並ぶ', () => {
			const tree = _buildGroupTree(data, new Uint32Array([0, 1, 2, 3]), [cols[0]!], cols, {});
			const flat = _flattenGroupTree(tree, data, 1, id);
			expect(flat).toHaveLength(6);
			expect(flat[0]!.kind).toBe('group');
			expect((flat[0] as { node: RowGroupNode }).node.key).toBe('eng');
			expect(flat[1]!.kind).toBe('row');
			expect(flat[4]!.kind).toBe('group');
			expect((flat[4] as { node: RowGroupNode }).node.key).toBe('sales');
			expect(flat[5]!.kind).toBe('row');
		});

		it('2段 dept→city でネストが深さ優先で展開される', () => {
			const tree = _buildGroupTree(
				data,
				new Uint32Array([0, 1, 2, 3]),
				[cols[0]!, cols[1]!],
				cols,
				{},
			);
			const flat = _flattenGroupTree(tree, data, 2, id);
			expect(flat).toHaveLength(9);
			const kinds = flat.map((f) => f.kind);
			expect(kinds).toEqual([
				'group',
				'group',
				'row',
				'row',
				'group',
				'row',
				'group',
				'group',
				'row',
			]);
			const rowEntries = flat.filter(
				(f): f is Extract<typeof f, { kind: 'row' }> => f.kind === 'row',
			);
			expect(rowEntries).toHaveLength(4);
			expect(rowEntries.every((r) => r.depth === 2)).toBe(true);
		});

		it('row 件数は元データの行数と一致', () => {
			const tree = _buildGroupTree(data, new Uint32Array([0, 1, 2, 3]), [cols[0]!], cols, {});
			const flat = _flattenGroupTree(tree, data, 1, id);
			const rowCount = flat.filter((f) => f.kind === 'row').length;
			expect(rowCount).toBe(data.length);
		});

		it('空 tree で空配列', () => {
			const flat = _flattenGroupTree([], data, 0, id);
			expect(flat).toEqual([]);
		});

		it('collapsedPaths に含まれるグループは header のみ出力', () => {
			const tree = _buildGroupTree(data, new Uint32Array([0, 1, 2, 3]), [cols[0]!], cols, {});
			const collapsed = new Set([_pathToId(['eng'])]);
			const flat = _flattenGroupTree(tree, data, 1, id, collapsed);
			expect(flat).toHaveLength(3);
			expect(flat[0]!.kind).toBe('group');
			expect((flat[0] as { node: RowGroupNode }).node.key).toBe('eng');
			expect(flat[1]!.kind).toBe('group');
			expect((flat[1] as { node: RowGroupNode }).node.key).toBe('sales');
			expect(flat[2]!.kind).toBe('row');
		});

		it('collapsedPaths が中間ノードでもサブツリー全体をスキップ', () => {
			const tree = _buildGroupTree(
				data,
				new Uint32Array([0, 1, 2, 3]),
				[cols[0]!, cols[1]!],
				cols,
				{},
			);
			const collapsed = new Set([_pathToId(['eng'])]);
			const flat = _flattenGroupTree(tree, data, 2, id, collapsed);
			expect(flat).toHaveLength(4);
			expect(flat[0]!.kind).toBe('group');
			expect((flat[0] as { node: RowGroupNode }).node.key).toBe('eng');
			expect(flat[1]!.kind).toBe('group');
			expect((flat[1] as { node: RowGroupNode }).node.key).toBe('sales');
		});
	});
}
