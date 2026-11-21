import type { CellValue, ColumnDef } from './column.ts';
import type { Leaf, Predicate } from './filter.ts';
import type { SortSpec } from './sort.ts';
import type { Result } from './_result.ts';
import { err } from './_result.ts';
import type { AggregateFn } from './_aggregate.ts';
import type { ExprNode } from './_computed-engine.ts';
import { _tokenize } from './_query-lexer.ts';
import { _parse } from './_query-parser.ts';

export type { ExprNode };

export type ParseError = {
	readonly message: string;
	readonly position: number;
	readonly token?: string;
};

export type ChartType = 'bar' | 'line' | 'pie' | 'combo' | 'bubble';

export type ChartMetric = {
	readonly fn: AggregateFn;
	readonly columnId: string;
};

export type ChartConfig = {
	readonly type: ChartType;
	readonly groupBy: string;
	readonly metrics: ReadonlyArray<ChartMetric>;
};

/** `let name = expr;` 句から得られる computed column 定義 (式は AST のまま)。 */
export type ComputedColumnSpec = {
	readonly name: string;
	readonly expr: ExprNode;
};

export type ParsedQuery = {
	readonly predicate: Predicate | null;
	readonly sort: SortSpec;
	/** 先頭の `let …;` 句で定義された computed column。定義順を保持。 */
	readonly computed?: ReadonlyArray<ComputedColumnSpec>;
	readonly chart?: ChartConfig;
};

export type { Result };

/**
 * クエリ文字列を ParsedQuery にパースする。
 * 列名は `columns` 内の id にマッチする必要があり、存在しない列はエラー。
 * 失敗時の `position` は文字オフセット (0-based)、`token` は問題のトークン文字列。
 */
export function parseQuery<TRow>(
	input: string,
	columns: ReadonlyArray<ColumnDef<TRow>>,
): Result<ParsedQuery, ParseError> {
	const lex = _tokenize(input);
	if (!lex.ok) {
		return err({ message: lex.error.message, position: lex.error.pos });
	}
	return _parse(lex.tokens, columns);
}

const _DSL_KEYWORDS: ReadonlySet<string> = new Set([
	'or',
	'and',
	'not',
	'by',
	'in',
	'is',
	'null',
	'chart',
]);

function _isBareIdent(s: string): boolean {
	if (s.length === 0) return false;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		const ok =
			(c >= 0x30 && c <= 0x39) ||
			(c >= 0x41 && c <= 0x5a) ||
			(c >= 0x61 && c <= 0x7a) ||
			c === 0x5f ||
			c > 127;
		if (!ok) return false;
	}
	const first = s.charCodeAt(0);
	if (first >= 0x30 && first <= 0x39) return false;
	if (_DSL_KEYWORDS.has(s.toLowerCase())) return false;
	return true;
}

function _quoteString(s: string): string {
	return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function _stringifyColumnId(id: string): string {
	return _isBareIdent(id) ? id : _quoteString(id);
}

function _stringifyValue(v: CellValue): string {
	if (typeof v === 'number') return Number.isFinite(v) ? String(v) : _quoteString(String(v));
	if (typeof v === 'boolean') return _quoteString(String(v));
	if (v === null || v === undefined) return _quoteString('');
	return _quoteString(String(v));
}

function _stringifyLeaf(leaf: Leaf): string {
	const col = _stringifyColumnId(leaf.columnId);
	switch (leaf.op) {
		case 'isNull':
			return `${col} is null`;
		case 'isNotNull':
			return `${col} is not null`;
		case 'in': {
			const arr = Array.isArray(leaf.value)
				? leaf.value
				: leaf.value !== undefined
					? [leaf.value as CellValue]
					: [];
			return `${col} in(${arr.map((x) => _stringifyValue(x as CellValue)).join(', ')})`;
		}
		case 'like': {
			const opStr = leaf.caseSensitive === false ? '~i' : '~';
			return `${col}${opStr}${_stringifyValue(leaf.value as CellValue)}`;
		}
		case 'startsWith':
			return `${col}~^${_stringifyValue(leaf.value as CellValue)}`;
		case 'endsWith':
			return `${col}~$${_stringifyValue(leaf.value as CellValue)}`;
		default:
			return `${col}${leaf.op}${_stringifyValue(leaf.value as CellValue)}`;
	}
}

type _PrecCtx = 'top' | 'or' | 'and';

function _stringifyPredicateRec(p: Predicate, ctx: _PrecCtx): string {
	if (p.kind === 'leaf') return _stringifyLeaf(p);
	const negate = p.negate === true;
	if (p.children.length === 1 && !negate) {
		return _stringifyPredicateRec(p.children[0]!, ctx);
	}
	if (p.children.length === 0) return '';
	const sep = p.combinator === 'and' ? ' ' : ' | ';
	const innerCtx: _PrecCtx = p.combinator === 'and' ? 'and' : 'or';
	const inner = p.children.map((c) => _stringifyPredicateRec(c, innerCtx)).join(sep);
	if (negate) return `not (${inner})`;
	if (ctx === 'and' && p.combinator === 'or') return `(${inner})`;
	return inner;
}

/**
 * Predicate AST を DSL 文字列に戻す。`null` は空文字。
 * `parseQuery(stringifyPredicate(p)) === { predicate: p, ... }` (構造的等価) を満たす。
 */
export function stringifyPredicate(p: Predicate | null): string {
	if (p === null) return '';
	return _stringifyPredicateRec(p, 'top');
}

function _exprPrec(node: ExprNode): number {
	if (node.kind === 'cmp') return 0;
	if (node.kind === 'concat') return 1;
	if (node.kind !== 'bin') return 4;
	return node.op === '*' || node.op === '/' ? 3 : 2;
}

function _stringifyExprChild(child: ExprNode, parentPrec: number, isRight: boolean): string {
	const s = _stringifyExpr(child);
	const cp = _exprPrec(child);
	const sameAssoc = child.kind === 'bin' || child.kind === 'concat';
	const needsParen = cp < parentPrec || (cp === parentPrec && isRight && sameAssoc);
	return needsParen ? `(${s})` : s;
}

export function _stringifyExpr(node: ExprNode): string {
	switch (node.kind) {
		case 'num':
			return String(node.value);
		case 'str':
			return _quoteString(node.value);
		case 'col':
			return _stringifyColumnId(node.name);
		case 'neg':
			return node.operand.kind === 'bin' || node.operand.kind === 'cmp'
				? `-(${_stringifyExpr(node.operand)})`
				: `-${_stringifyExpr(node.operand)}`;
		case 'bin': {
			const prec = _exprPrec(node);
			const left = _stringifyExprChild(node.left, prec, false);
			const right = _stringifyExprChild(node.right, prec, true);
			return `${left} ${node.op} ${right}`;
		}
		case 'concat': {
			const prec = _exprPrec(node);
			const left = _stringifyExprChild(node.left, prec, false);
			const right = _stringifyExprChild(node.right, prec, true);
			return `${left} & ${right}`;
		}
		case 'cmp': {
			const wrap = (c: ExprNode): string =>
				c.kind === 'cmp' ? `(${_stringifyExpr(c)})` : _stringifyExpr(c);
			return `${wrap(node.left)} ${node.op} ${wrap(node.right)}`;
		}
		case 'func':
			return `${node.name}(${node.args.map((a) => _stringifyExpr(a)).join(', ')})`;
	}
}

/** SortSpec を `by col1, -col2` 形式の文字列に。空なら空文字。 */
export function stringifySort(sort: SortSpec): string {
	if (sort.length === 0) return '';
	const parts = sort.map((k) => {
		const col = _stringifyColumnId(k.columnId);
		return k.dir === 'desc' ? `-${col}` : col;
	});
	return `by ${parts.join(', ')}`;
}

/**
 * `{ predicate, sort }` をクエリ DSL 文字列に。chart は対象外。
 * `parseQuery(stringifyQuery(x))` で同じ predicate / sort が復元される。
 */
export function stringifyQuery(input: {
	readonly computed?: ReadonlyArray<ComputedColumnSpec>;
	readonly predicate?: Predicate | null;
	readonly sort?: SortSpec;
}): string {
	const parts: string[] = [];
	for (const c of input.computed ?? []) {
		parts.push(`let ${c.name} = ${_stringifyExpr(c.expr)};`);
	}
	const p = stringifyPredicate(input.predicate ?? null);
	if (p) parts.push(p);
	const s = stringifySort(input.sort ?? []);
	if (s) parts.push(s);
	return parts.join(' ');
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	const cols: ColumnDef<unknown>[] = [
		{ id: 'name', accessor: () => '' },
		{ id: 'age', accessor: () => 0, type: 'number' },
		{ id: 'salary', accessor: () => 0, type: 'number' },
		{ id: 'dept', accessor: () => '' },
		{ id: 'id', accessor: () => 0, type: 'number' },
		{ id: '列 名', accessor: () => '' },
	];

	describe('parseQuery', () => {
		it('空入力は predicate=null, sort=[]', () => {
			const r = parseQuery('', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.predicate).toBeNull();
				expect(r.value.sort).toEqual([]);
			}
		});

		it('let 句で computed column を定義', () => {
			const r = parseQuery('let total = salary * age', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.computed).toHaveLength(1);
				expect(r.value.computed?.[0]?.name).toBe('total');
				expect(r.value.computed?.[0]?.expr).toMatchObject({ kind: 'bin', op: '*' });
				expect(r.value.predicate).toBeNull();
			}
		});

		it('後続フィルター/ソートが computed column を参照できる', () => {
			const r = parseQuery('let total = salary * age; total > 1000 by -total', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.computed?.[0]?.name).toBe('total');
				expect(r.value.predicate).toMatchObject({
					kind: 'leaf',
					columnId: 'total',
					op: '>',
					value: 1000,
				});
				expect(r.value.sort).toEqual([{ columnId: 'total', dir: 'desc' }]);
			}
		});

		it('複数 let は順に定義され、後の式が前を参照できる', () => {
			const r = parseQuery('let total = salary * age; let tax = total * 2', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.computed?.map((c) => c.name)).toEqual(['total', 'tax']);
			}
		});

		it('既存列と同名の定義はエラー', () => {
			expect(parseQuery('let salary = age * 2', cols).ok).toBe(false);
		});

		it('let 内の未知の列参照はエラー', () => {
			expect(parseQuery('let x = nope * 2', cols).ok).toBe(false);
		});

		it('JS 風入力はパースできない (ADR-0001 サンドボックス境界)', () => {
			expect(parseQuery('let x = eval(salary)', cols).ok).toBe(false);
			expect(parseQuery('let x = salary => 1', cols).ok).toBe(false);
			expect(parseQuery('let x = `${salary}`', cols).ok).toBe(false);
		});

		it('let 句で関数を使える (round/min/coalesce)', () => {
			const r = parseQuery('let tax = round(salary * age, 2)', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.computed?.[0]?.expr).toMatchObject({ kind: 'func', name: 'round' });
			}
		});

		it('未知の関数 / アリティ不一致は parse エラー位置を返す', () => {
			const unknown = parseQuery('let x = sqrt(salary)', cols);
			expect(unknown.ok).toBe(false);
			if (!unknown.ok) {
				expect(unknown.error.message).toMatch(/未知の関数/);
				expect(unknown.error.token).toBe('sqrt');
			}
			expect(parseQuery('let x = abs(salary, age)', cols).ok).toBe(false);
		});

		it('単一 leaf', () => {
			const r = parseQuery('age>30', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.predicate).toMatchObject({
					kind: 'leaf',
					columnId: 'age',
					op: '>',
					value: 30,
				});
			}
		});

		it('暗黙 AND', () => {
			const r = parseQuery('salary>=50000 age<30', cols);
			expect(r.ok).toBe(true);
			if (r.ok && r.value.predicate?.kind === 'group') {
				expect(r.value.predicate.combinator).toBe('and');
				expect(r.value.predicate.children).toHaveLength(2);
			}
		});

		it('OR とネスト', () => {
			const r = parseQuery('(age=1 | age=2) salary>0', cols);
			expect(r.ok).toBe(true);
			if (r.ok && r.value.predicate?.kind === 'group') {
				expect(r.value.predicate.combinator).toBe('and');
				const first = r.value.predicate.children[0]!;
				expect(first.kind).toBe('group');
				if (first.kind === 'group') {
					expect(first.combinator).toBe('or');
				}
			}
		});

		it('not プレフィックス', () => {
			const r = parseQuery('not name="x"', cols);
			expect(r.ok).toBe(true);
			if (r.ok && r.value.predicate?.kind === 'group') {
				expect(r.value.predicate.negate).toBe(true);
			}
		});

		it('ソート単体 (by -age, name)', () => {
			const r = parseQuery('by -age, name', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.predicate).toBeNull();
				expect(r.value.sort).toEqual([
					{ columnId: 'age', dir: 'desc' },
					{ columnId: 'name', dir: 'asc' },
				]);
			}
		});

		it('フィルター + ソート', () => {
			const r = parseQuery('salary>=50000 by -age', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.predicate?.kind).toBe('leaf');
				expect(r.value.sort).toEqual([{ columnId: 'age', dir: 'desc' }]);
			}
		});

		it('クオート列名 (日本語スペース込み)', () => {
			const r = parseQuery('"列 名"=x', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.predicate).toMatchObject({ columnId: '列 名', op: '=', value: 'x' });
			}
		});

		it('クオートなしの値に空白が含まれていても受け付ける (greedy)', () => {
			const r = parseQuery('name = 社員 1', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.predicate).toMatchObject({
					columnId: 'name',
					op: '=',
					value: '社員 1',
				});
			}
		});

		it('greedy 値でも次の leaf を正しく区切る (lookahead)', () => {
			const r = parseQuery('name = 社員 太郎 age < 30', cols);
			expect(r.ok).toBe(true);
			if (r.ok && r.value.predicate?.kind === 'group') {
				expect(r.value.predicate.children).toHaveLength(2);
				expect(r.value.predicate.children[0]).toMatchObject({
					columnId: 'name',
					value: '社員 太郎',
				});
				expect(r.value.predicate.children[1]).toMatchObject({
					columnId: 'age',
					op: '<',
					value: 30,
				});
			}
		});

		it('greedy 値でも by キーワードでソートに切り替わる', () => {
			const r = parseQuery('name = 社員 1 by age', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.predicate).toMatchObject({
					columnId: 'name',
					value: '社員 1',
				});
				expect(r.value.sort).toEqual([{ columnId: 'age', dir: 'asc' }]);
			}
		});

		it('数値比較演算子は単一値のみ (greedy 化しない)', () => {
			const r = parseQuery('age >= 30 50', cols);
			expect(r.ok).toBe(false);
		});

		it('明示クオートはそのまま単独値', () => {
			const r = parseQuery('name = "社員 1" extra', cols);
			expect(r.ok).toBe(false);
		});

		it('like (~)', () => {
			const r = parseQuery('name~"田中"', cols);
			if (r.ok) {
				expect(r.value.predicate).toMatchObject({ op: 'like', value: '田中' });
			}
		});

		it('case-insensitive like (~i)', () => {
			const r = parseQuery('name~i"abc"', cols);
			if (r.ok) {
				expect(r.value.predicate).toMatchObject({ op: 'like', value: 'abc', caseSensitive: false });
			}
		});

		it('startsWith (~^) / endsWith (~$)', () => {
			const a = parseQuery('name~^"田"', cols);
			const b = parseQuery('name~$"郎"', cols);
			if (a.ok) expect(a.value.predicate).toMatchObject({ op: 'startsWith' });
			if (b.ok) expect(b.value.predicate).toMatchObject({ op: 'endsWith' });
		});

		it('is null / is not null', () => {
			const a = parseQuery('name is null', cols);
			const b = parseQuery('name is not null', cols);
			if (a.ok) expect(a.value.predicate).toMatchObject({ op: 'isNull' });
			if (b.ok) expect(b.value.predicate).toMatchObject({ op: 'isNotNull' });
		});

		it('in リスト', () => {
			const r = parseQuery('age in(1,2,3)', cols);
			if (r.ok) {
				expect(r.value.predicate).toMatchObject({ op: 'in', value: [1, 2, 3] });
			}
		});

		it('未知の列はエラー位置を返す', () => {
			const r = parseQuery('unknown=1', cols);
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.message).toMatch(/未知の列/);
				expect(r.error.position).toBe(0);
			}
		});

		it('演算子破損はエラー', () => {
			const r = parseQuery('age>>=1', cols);
			expect(r.ok).toBe(false);
		});

		it('閉じ括弧不足はエラー', () => {
			const r = parseQuery('(age=1', cols);
			expect(r.ok).toBe(false);
		});

		it('キーワード case-insensitive', () => {
			const r = parseQuery('age=1 OR name="x" BY -age', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.predicate?.kind).toBe('group');
				expect(r.value.sort).toEqual([{ columnId: 'age', dir: 'desc' }]);
			}
		});
	});

	describe('parseQuery (chart)', () => {
		it('chart bar by dept sum:salary', () => {
			const r = parseQuery('chart bar by dept sum:salary', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.chart).toEqual({
					type: 'bar',
					groupBy: 'dept',
					metrics: [{ fn: 'sum', columnId: 'salary' }],
				});
			}
		});

		it('chart combo は 2 メトリクス必須', () => {
			const good = parseQuery('chart combo by dept sum:salary count:id', cols);
			expect(good.ok).toBe(true);
			if (good.ok) {
				expect(good.value.chart?.metrics).toHaveLength(2);
			}
			const bad = parseQuery('chart combo by dept sum:salary', cols);
			expect(bad.ok).toBe(false);
			if (!bad.ok) {
				expect(bad.error.message).toMatch(/combo/);
			}
		});

		it('chart bubble は 3 メトリクス必須', () => {
			const good = parseQuery('chart bubble by dept sum:salary avg:age count:id', cols);
			expect(good.ok).toBe(true);
			if (good.ok) {
				expect(good.value.chart?.metrics).toHaveLength(3);
			}
			const bad = parseQuery('chart bubble by dept sum:salary avg:age', cols);
			expect(bad.ok).toBe(false);
		});

		it('filter + sort + chart 組み合わせ', () => {
			const r = parseQuery('salary>=50000 by -age chart bar by dept sum:salary', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.predicate?.kind).toBe('leaf');
				expect(r.value.sort).toEqual([{ columnId: 'age', dir: 'desc' }]);
				expect(r.value.chart?.type).toBe('bar');
			}
		});

		it('不明な chart type はエラー', () => {
			const r = parseQuery('chart pyramid by dept count:id', cols);
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.message).toMatch(/不明なチャート種別/);
			}
		});

		it('不明な集約関数はエラー', () => {
			const r = parseQuery('chart bar by dept undef:salary', cols);
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.message).toMatch(/不明な集約関数/);
			}
		});

		it('median / p95 / stddev も chart 集約関数として受け付ける', () => {
			const a = parseQuery('chart bar by dept median:salary', cols);
			expect(a.ok).toBe(true);
			const b = parseQuery('chart bar by dept p95:salary', cols);
			expect(b.ok).toBe(true);
			const c = parseQuery('chart bar by dept stddev:salary', cols);
			expect(c.ok).toBe(true);
		});

		it('未知の列はエラー', () => {
			const r = parseQuery('chart bar by foobar count:id', cols);
			expect(r.ok).toBe(false);
		});

		it('chart 単体 (filter/sort なし)', () => {
			const r = parseQuery('chart pie by dept count:id', cols);
			expect(r.ok).toBe(true);
			if (r.ok) {
				expect(r.value.predicate).toBeNull();
				expect(r.value.sort).toEqual([]);
				expect(r.value.chart?.type).toBe('pie');
			}
		});
	});

	describe('stringifyQuery (round-trip via parseQuery)', () => {
		const cases: ReadonlyArray<{ label: string; input: string }> = [
			{ label: 'empty', input: '' },
			{ label: 'eq leaf', input: 'age=30' },
			{ label: 'ne leaf', input: 'age!=30' },
			{ label: 'lt/lte/gt/gte', input: 'age>=18 age<=65 salary>0 salary<1000' },
			{ label: 'like', input: 'name~"田中"' },
			{ label: 'startsWith', input: 'name~^"田"' },
			{ label: 'endsWith', input: 'name~$"中"' },
			{ label: 'case-insensitive like', input: 'name~i"abc"' },
			{ label: 'isNull / isNotNull', input: 'name is null id is not null' },
			{ label: 'in list', input: 'dept in("eng", "sales")' },
			{ label: 'implicit AND', input: 'salary>=50000 age<30' },
			{ label: 'OR with pipe', input: 'age=1 | age=2' },
			{ label: 'AND of OR (paren precedence)', input: '(age=1 | age=2) salary>0' },
			{ label: 'nested OR/AND', input: '(age=1 dept="eng") | (age=2 dept="sales")' },
			{ label: 'not leaf', input: 'not age=1' },
			{ label: 'not group', input: 'not (age=1 | age=2)' },
			{ label: 'sort asc/desc', input: 'by age, -salary' },
			{ label: 'filter + sort', input: 'salary>=50000 by -salary, name' },
			{ label: 'quoted column name', input: '"列 名"="x"' },
		];
		for (const { label, input } of cases) {
			it(`round-trip: ${label}`, () => {
				const parsed = parseQuery(input, cols);
				expect(parsed.ok).toBe(true);
				if (!parsed.ok) return;
				const str = stringifyQuery({
					predicate: parsed.value.predicate,
					sort: parsed.value.sort,
				});
				const reparsed = parseQuery(str, cols);
				expect(reparsed.ok).toBe(true);
				if (!reparsed.ok) return;
				expect(reparsed.value.predicate).toEqual(parsed.value.predicate);
				expect(reparsed.value.sort).toEqual(parsed.value.sort);
			});
		}

		it('null predicate / 空 sort は空文字', () => {
			expect(stringifyQuery({ predicate: null, sort: [] })).toBe('');
			expect(stringifyQuery({})).toBe('');
		});

		it('computed (let 句) + filter + sort が round-trip する', () => {
			const parsed = parseQuery('let total = salary * age; total > 1000 by -total', cols);
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			const str = stringifyQuery({
				computed: parsed.value.computed,
				predicate: parsed.value.predicate,
				sort: parsed.value.sort,
			});
			const reparsed = parseQuery(str, cols);
			expect(reparsed.ok).toBe(true);
			if (!reparsed.ok) return;
			expect(reparsed.value.computed).toEqual(parsed.value.computed);
			expect(reparsed.value.predicate).toEqual(parsed.value.predicate);
			expect(reparsed.value.sort).toEqual(parsed.value.sort);
		});

		it('式の優先順位/括弧が round-trip で保たれる', () => {
			for (const src of [
				'let x = (salary + age) * id',
				'let x = salary + age * id',
				'let x = salary - (age - id)',
				'let x = -salary + id',
			]) {
				const parsed = parseQuery(src, cols);
				expect(parsed.ok).toBe(true);
				if (!parsed.ok) continue;
				const str = stringifyQuery({ computed: parsed.value.computed });
				const reparsed = parseQuery(str, cols);
				expect(reparsed.ok).toBe(true);
				if (!reparsed.ok) continue;
				expect(reparsed.value.computed).toEqual(parsed.value.computed);
			}
		});

		it('関数呼び出しを含む let 句が round-trip する (正規化込み)', () => {
			for (const src of [
				'let tax = round(salary * 0.1, 2)',
				'let m = min(salary, age, id)',
				'let a = abs(salary - age)',
				'let c = coalesce(salary, age, 0)',
				'let n = round(min(salary, age), -2)',
			]) {
				const parsed = parseQuery(src, cols);
				expect(parsed.ok).toBe(true);
				if (!parsed.ok) continue;
				const str = stringifyQuery({ computed: parsed.value.computed });
				const reparsed = parseQuery(str, cols);
				expect(reparsed.ok).toBe(true);
				if (!reparsed.ok) continue;
				expect(reparsed.value.computed).toEqual(parsed.value.computed);
			}
		});

		it('比較 / IF / 文字列リテラルを含む let 句が round-trip する', () => {
			for (const src of [
				'let hi = salary >= 50000',
				'let eq = age = 30',
				'let band = IF(salary >= 50000, "high", "low")',
				'let net = IF(age = 0, 0, salary / age)',
				'let g = IF(salary >= 80000, "A", IF(salary >= 50000, "B", "C"))',
				'let b = (salary > age) + id',
			]) {
				const parsed = parseQuery(src, cols);
				expect(parsed.ok, src).toBe(true);
				if (!parsed.ok) continue;
				const str = stringifyQuery({ computed: parsed.value.computed });
				const reparsed = parseQuery(str, cols);
				expect(reparsed.ok, str).toBe(true);
				if (!reparsed.ok) continue;
				expect(reparsed.value.computed, src).toEqual(parsed.value.computed);
			}
		});

		it('文字列連結 / lower / upper を含む let 句が round-trip する', () => {
			for (const src of [
				'let label = name & " " & dept',
				'let x = name & age',
				'let x = name & age + id',
				'let lo = lower(name)',
				'let up = upper(dept)',
				'let mix = upper(name) & "-" & lower(dept)',
				'let cmp = name & dept = "x"',
			]) {
				const parsed = parseQuery(src, cols);
				expect(parsed.ok, src).toBe(true);
				if (!parsed.ok) continue;
				const str = stringifyQuery({ computed: parsed.value.computed });
				const reparsed = parseQuery(str, cols);
				expect(reparsed.ok, str).toBe(true);
				if (!reparsed.ok) continue;
				expect(reparsed.value.computed, src).toEqual(parsed.value.computed);
			}
		});

		it('文字列値は常にクオート (greedy 解析の罠回避)', () => {
			const r = stringifyQuery({
				predicate: { kind: 'leaf', columnId: 'name', op: '=', value: 'foo bar' },
			});
			expect(r).toBe('name="foo bar"');
		});

		it('クオート文字を含む値は escape される', () => {
			const r = stringifyQuery({
				predicate: { kind: 'leaf', columnId: 'name', op: '=', value: 'he said "hi"' },
			});
			expect(r).toBe('name="he said \\"hi\\""');
			const parsed = parseQuery(r, cols);
			expect(parsed.ok).toBe(true);
			if (parsed.ok && parsed.value.predicate?.kind === 'leaf') {
				expect(parsed.value.predicate.value).toBe('he said "hi"');
			}
		});

		it('キーワード相当の列名はクオート', () => {
			const r = stringifyPredicate({ kind: 'leaf', columnId: 'by', op: '=', value: 'x' });
			expect(r.startsWith('"by"=')).toBe(true);
		});
	});
}
