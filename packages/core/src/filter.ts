import type { CellValue } from './column.ts';

export type FilterOp =
	| '='
	| '!='
	| '>'
	| '<'
	| '>='
	| '<='
	| 'like'
	| 'startsWith'
	| 'endsWith'
	| 'isNull'
	| 'isNotNull'
	| 'in';

export type Combinator = 'and' | 'or';

export type Leaf<K extends string = string> = {
	readonly kind: 'leaf';
	readonly columnId: K;
	readonly op: FilterOp;
	readonly value?: CellValue | readonly CellValue[];
	readonly caseSensitive?: boolean;
};

export type Group<K extends string = string> = {
	readonly kind: 'group';
	readonly combinator: Combinator;
	readonly children: ReadonlyArray<Predicate<K>>;
	readonly negate?: boolean;
};

export type Predicate<K extends string = string> = Leaf<K> | Group<K>;

/** Same-column multi-condition shortcut. Lowered to a Group by `f.column`. */
export type ColumnFilter<K extends string = string> = {
	readonly columnId: K;
	readonly combinator: Combinator;
	readonly conditions: ReadonlyArray<Omit<Leaf<K>, 'kind' | 'columnId'>>;
};

function leaf<K extends string>(
	columnId: K,
	op: FilterOp,
	value?: CellValue | readonly CellValue[],
	caseSensitive?: boolean,
): Leaf<K> {
	const out: Leaf<K> =
		caseSensitive === undefined
			? { kind: 'leaf', columnId, op, value }
			: { kind: 'leaf', columnId, op, value, caseSensitive };
	return Object.freeze(out);
}

function group<K extends string>(combinator: Combinator, children: Predicate<K>[]): Group<K> {
	return Object.freeze({
		kind: 'group' as const,
		combinator,
		children: Object.freeze(children.slice()),
	});
}

function and<K extends string>(...children: Predicate<K>[]): Group<K> {
	return group('and', children);
}

function or<K extends string>(...children: Predicate<K>[]): Group<K> {
	return group('or', children);
}

function not<K extends string>(p: Predicate<K>): Group<K> {
	return Object.freeze({
		kind: 'group' as const,
		combinator: 'and' as const,
		children: Object.freeze([p]),
		negate: true,
	});
}

function column<K extends string>(cf: ColumnFilter<K>): Group<K> {
	const children: Leaf<K>[] = cf.conditions.map((c) =>
		leaf<K>(cf.columnId, c.op, c.value, c.caseSensitive),
	);
	return group(cf.combinator, children);
}

export const f = Object.freeze({ leaf, and, or, not, column });

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('filter builder', () => {
		it('leaf returns frozen Leaf', () => {
			const l = f.leaf('city', '=', 'Tokyo');
			expect(l.kind).toBe('leaf');
			expect(l.columnId).toBe('city');
			expect(Object.isFrozen(l)).toBe(true);
		});

		it('and / or wrap children in a Group', () => {
			const g = f.or(f.leaf('a', '=', 1), f.leaf('b', '>', 2));
			expect(g.kind).toBe('group');
			expect(g.combinator).toBe('or');
			expect(g.children).toHaveLength(2);
			expect(Object.isFrozen(g.children)).toBe(true);
		});

		it('not is a negated AND wrapper', () => {
			const n = f.not(f.leaf('a', '=', 1));
			expect(n.combinator).toBe('and');
			expect(n.negate).toBe(true);
		});

		it('column lowers ColumnFilter into a Group of Leafs', () => {
			const g = f.column({
				columnId: 'salary',
				combinator: 'and',
				conditions: [
					{ op: '>=', value: 50000 },
					{ op: '<', value: 100000 },
				],
			});
			expect(g.children).toHaveLength(2);
			const c0 = g.children[0]!;
			expect(c0.kind).toBe('leaf');
			if (c0.kind === 'leaf') {
				expect(c0.columnId).toBe('salary');
				expect(c0.op).toBe('>=');
				expect(c0.value).toBe(50000);
			}
		});
	});
}
