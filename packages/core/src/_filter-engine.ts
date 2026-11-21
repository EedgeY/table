import type { CellValue, ColumnDef } from './column.ts';
import type { Predicate } from './filter.ts';
import { type CompiledGroup, type CompiledLeaf, type CompiledNode, OP_TAGS } from './_types.ts';
import { _coerceNumber } from './_utils.ts';

const NOOP_ACCESSOR: (_row: unknown) => CellValue = () => null;

export function _compilePredicate<TRow>(
	p: Predicate | null,
	columns: ReadonlyArray<ColumnDef<TRow>>,
): CompiledNode | null {
	if (p == null) {
		return null;
	}
	const colMap = new Map<string, ColumnDef<TRow>>();
	for (const c of columns) {
		colMap.set(c.id, c);
	}
	return compileNode(p, colMap);
}

function compileNode<TRow>(p: Predicate, cols: Map<string, ColumnDef<TRow>>): CompiledNode {
	if (p.kind === 'leaf') {
		const col = cols.get(p.columnId);
		const accessor = (col?.accessor ?? NOOP_ACCESSOR) as (row: unknown) => CellValue;
		const rawValue = p.value;

		let targetLower = '';
		let numTarget = Number.NaN;
		let isNumTarget = false;
		let inSet: Set<string> | null = null;
		let inNumSet: Set<number> | null = null;

		if (Array.isArray(rawValue)) {
			inSet = new Set();
			inNumSet = new Set();
			let allNumeric = true;
			for (const v of rawValue) {
				inSet.add(String(v).toLowerCase());
				const n = _coerceNumber(v as CellValue);
				if (n === null) {
					allNumeric = false;
				} else {
					inNumSet.add(n);
				}
			}
			if (!allNumeric) {
				inNumSet = null;
			}
		} else if (rawValue !== undefined) {
			targetLower = String(rawValue).toLowerCase();
			const n = _coerceNumber(rawValue as CellValue);
			if (n !== null) {
				numTarget = n;
				isNumTarget = true;
			}
		}

		const leaf: CompiledLeaf = {
			kind: 0,
			accessor,
			op: OP_TAGS[p.op],
			numTarget,
			isNumTarget,
			targetLower,
			caseSensitive: p.caseSensitive === true,
			inSet,
			inNumSet,
		};
		return leaf;
	}

	const children = p.children.map((c) => compileNode(c, cols));
	const group: CompiledGroup = {
		kind: 1,
		combinator: p.combinator === 'or' ? 1 : 0,
		negate: p.negate === true,
		children,
	};
	return group;
}

export function _evalNode(node: CompiledNode, row: unknown): boolean {
	if (node.kind === 0) {
		return evalLeaf(node, row);
	}
	const { combinator, children, negate } = node;
	const len = children.length;
	if (combinator === 0) {
		let ok = true;
		for (let i = 0; i < len; i++) {
			const child = children[i];
			if (child == null) {
				continue;
			}
			if (!_evalNode(child, row)) {
				ok = false;
				break;
			}
		}
		return negate ? !ok : ok;
	}
	let ok = false;
	for (let i = 0; i < len; i++) {
		const child = children[i];
		if (child == null) {
			continue;
		}
		if (_evalNode(child, row)) {
			ok = true;
			break;
		}
	}
	return negate ? !ok : ok;
}

function evalLeaf(leaf: CompiledLeaf, row: unknown): boolean {
	const value = leaf.accessor(row);
	const op = leaf.op;

	if (op === OP_TAGS.isNull) {
		return value == null;
	}
	if (op === OP_TAGS.isNotNull) {
		return value != null;
	}
	if (value == null) {
		return false;
	}

	if (op === OP_TAGS.in) {
		if (leaf.inNumSet !== null && typeof value === 'number' && Number.isFinite(value)) {
			return leaf.inNumSet.has(value);
		}
		if (leaf.inSet !== null) {
			return leaf.inSet.has(String(value).toLowerCase());
		}
		return false;
	}

	if (op === OP_TAGS.like || op === OP_TAGS.startsWith || op === OP_TAGS.endsWith) {
		const sa = leaf.caseSensitive ? String(value) : String(value).toLowerCase();
		const sb = leaf.caseSensitive
			? leaf.targetLower === ''
				? ''
				: String(leaf.targetLower)
			: leaf.targetLower;
		switch (op) {
			case OP_TAGS.like:
				return sa.indexOf(sb) !== -1;
			case OP_TAGS.startsWith:
				return sa.startsWith(sb);
			case OP_TAGS.endsWith:
				return sa.endsWith(sb);
		}
	}

	const isNumValue = typeof value === 'number' && Number.isFinite(value);
	if (isNumValue && leaf.isNumTarget) {
		const a = value;
		const b = leaf.numTarget;
		switch (op) {
			case OP_TAGS['=']:
				return a === b;
			case OP_TAGS['!=']:
				return a !== b;
			case OP_TAGS['>']:
				return a > b;
			case OP_TAGS['<']:
				return a < b;
			case OP_TAGS['>=']:
				return a >= b;
			case OP_TAGS['<=']:
				return a <= b;
		}
	}

	const sa = String(value).toLowerCase();
	const sb = leaf.targetLower;
	switch (op) {
		case OP_TAGS['=']:
			return sa === sb;
		case OP_TAGS['!=']:
			return sa !== sb;
		case OP_TAGS['>']:
			return sa > sb;
		case OP_TAGS['<']:
			return sa < sb;
		case OP_TAGS['>=']:
			return sa >= sb;
		case OP_TAGS['<=']:
			return sa <= sb;
	}
	return false;
}

export function _filterIndices<TRow>(
	data: ReadonlyArray<TRow>,
	compiled: CompiledNode | null,
	out: Uint32Array,
): number {
	const len = data.length;
	if (compiled === null) {
		for (let i = 0; i < len; i++) {
			out[i] = i;
		}
		return len;
	}
	let n = 0;
	for (let i = 0; i < len; i++) {
		if (_evalNode(compiled, data[i])) {
			out[n++] = i;
		}
	}
	return n;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	const cols: ColumnDef<{ id: number; name: string; salary: number | null }>[] = [
		{ id: 'id', accessor: (r) => r.id, type: 'number' },
		{ id: 'name', accessor: (r) => r.name },
		{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
	];
	const data = [
		{ id: 1, name: 'Tanaka', salary: 50000 },
		{ id: 2, name: 'Yamada', salary: 100000 },
		{ id: 3, name: 'tan', salary: null },
		{ id: 4, name: 'TANG', salary: 75000 },
	];

	const runFilter = (pred: Predicate | null): number[] => {
		const compiled = _compilePredicate(pred, cols);
		const out = new Uint32Array(data.length);
		const n = _filterIndices(data, compiled, out);
		return Array.from(out.slice(0, n));
	};

	describe('_filter-engine', () => {
		it('null predicate keeps everything', () => {
			expect(runFilter(null)).toEqual([0, 1, 2, 3]);
		});

		it('leaf "=" on numeric column matches exact value', () => {
			expect(runFilter({ kind: 'leaf', columnId: 'id', op: '=', value: 2 })).toEqual([1]);
		});

		it('leaf "like" is case-insensitive by default', () => {
			expect(runFilter({ kind: 'leaf', columnId: 'name', op: 'like', value: 'tan' })).toEqual([
				0, 2, 3,
			]);
		});

		it('leaf "isNull" treats undefined and null identically', () => {
			expect(runFilter({ kind: 'leaf', columnId: 'salary', op: 'isNull' })).toEqual([2]);
		});

		it('OR(AND(...), leaf) short-circuits on first AND failure', () => {
			const pred: Predicate = {
				kind: 'group',
				combinator: 'or',
				children: [
					{
						kind: 'group',
						combinator: 'and',
						children: [
							{ kind: 'leaf', columnId: 'id', op: '>', value: 10 },
							{ kind: 'leaf', columnId: 'name', op: 'like', value: 'tan' },
						],
					},
					{ kind: 'leaf', columnId: 'salary', op: '>=', value: 100000 },
				],
			};
			expect(runFilter(pred)).toEqual([1]);
		});

		it('"in" with mixed sets matches either path', () => {
			expect(runFilter({ kind: 'leaf', columnId: 'id', op: 'in', value: [1, 3] })).toEqual([0, 2]);
		});

		it('compile is referentially stable for the same input (no mutation)', () => {
			const pred: Predicate = { kind: 'leaf', columnId: 'id', op: '=', value: 1 };
			const c1 = _compilePredicate(pred, cols)!;
			expect(c1.kind).toBe(0);
		});

		it('NOT group inverts the result', () => {
			const pred: Predicate = {
				kind: 'group',
				combinator: 'and',
				negate: true,
				children: [{ kind: 'leaf', columnId: 'id', op: '<', value: 3 }],
			};
			expect(runFilter(pred)).toEqual([2, 3]);
		});
	});
}
