import type { CellValue, ColumnType } from './column.ts';
import type { Token } from './_query-lexer.ts';
import { _tokenize } from './_query-lexer.ts';
import type { ParseError } from './query.ts';
import type { Result } from './_result.ts';
import { err, ok } from './_result.ts';
import { _coerceNumber } from './_utils.ts';

function _cleanNumber(x: number): number | null {
	if (!Number.isFinite(x)) {
		return null;
	}
	const r = Number(x.toPrecision(15));
	return Math.abs(r) < EPSILON_ZERO ? 0 : r;
}

const EPSILON_ZERO = 1e-9;

export function _coerceString(v: CellValue): string {
	if (v === null || v === undefined) return '';
	if (typeof v === 'string') return v;
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	const c = _cleanNumber(v);
	return c === null ? '' : String(c);
}

/** computed column の式 AST。serialize 可能で、コンパイルとは独立。 */
export type ExprNode =
	| { readonly kind: 'num'; readonly value: number }
	| { readonly kind: 'str'; readonly value: string }
	| { readonly kind: 'col'; readonly name: string }
	| { readonly kind: 'neg'; readonly operand: ExprNode }
	| {
			readonly kind: 'bin';
			readonly op: '+' | '-' | '*' | '/';
			readonly left: ExprNode;
			readonly right: ExprNode;
	  }
	| {
			readonly kind: 'concat';
			readonly left: ExprNode;
			readonly right: ExprNode;
	  }
	| {
			readonly kind: 'cmp';
			readonly op: '=' | '!=' | '>' | '<' | '>=' | '<=';
			readonly left: ExprNode;
			readonly right: ExprNode;
	  }
	| {
			readonly kind: 'func';
			/** 正規化済みの関数名 (常に小文字; lexer は case-insensitive)。round-trip で安定。 */
			readonly name: string;
			readonly args: ReadonlyArray<ExprNode>;
	  };

const FUNC_ARITY: Readonly<Record<string, { readonly min: number; readonly max: number }>> = {
	if: { min: 3, max: 3 },
	round: { min: 1, max: 2 },
	abs: { min: 1, max: 1 },
	floor: { min: 1, max: 1 },
	ceil: { min: 1, max: 1 },
	min: { min: 1, max: Number.POSITIVE_INFINITY },
	max: { min: 1, max: Number.POSITIVE_INFINITY },
	coalesce: { min: 1, max: Number.POSITIVE_INFINITY },
	lower: { min: 1, max: 1 },
	upper: { min: 1, max: 1 },
};

export type ExprCtx = {
	readonly tokens: ReadonlyArray<Token>;
	i: number;
	readonly columns: ReadonlySet<string>;
};

function _peek(ctx: ExprCtx): Token {
	return ctx.tokens[ctx.i]!;
}
function _consume(ctx: ExprCtx): Token {
	return ctx.tokens[ctx.i++]!;
}

const CMP_OPS: ReadonlySet<string> = new Set(['=', '!=', '>', '<', '>=', '<=']);

export function _parseExpr(ctx: ExprCtx): Result<ExprNode, ParseError> {
	return _parseComparison(ctx);
}

function _parseComparison(ctx: ExprCtx): Result<ExprNode, ParseError> {
	const left = _parseConcat(ctx);
	if (!left.ok) return left;
	const opTok = _peek(ctx);
	if (opTok.kind !== 'OP' || !CMP_OPS.has(opTok.text)) {
		return left;
	}
	_consume(ctx);
	const op = opTok.text as '=' | '!=' | '>' | '<' | '>=' | '<=';
	const right = _parseConcat(ctx);
	if (!right.ok) return right;
	const next = _peek(ctx);
	if (next.kind === 'OP' && CMP_OPS.has(next.text)) {
		return err({
			message: '比較演算子は連鎖できません',
			position: next.pos,
			token: next.text,
		});
	}
	return ok({ kind: 'cmp', op, left: left.value, right: right.value });
}

function _parseConcat(ctx: ExprCtx): Result<ExprNode, ParseError> {
	const first = _parseAdditive(ctx);
	if (!first.ok) return first;
	let left = first.value;
	while (_peek(ctx).kind === 'AMP') {
		_consume(ctx);
		const right = _parseAdditive(ctx);
		if (!right.ok) return right;
		left = { kind: 'concat', left, right: right.value };
	}
	return ok(left);
}

function _parseAdditive(ctx: ExprCtx): Result<ExprNode, ParseError> {
	const first = _parseMultiplicative(ctx);
	if (!first.ok) return first;
	let left = first.value;
	while (_peek(ctx).kind === 'PLUS' || _peek(ctx).kind === 'MINUS') {
		const op = _consume(ctx).kind === 'PLUS' ? '+' : '-';
		const right = _parseMultiplicative(ctx);
		if (!right.ok) return right;
		left = { kind: 'bin', op, left, right: right.value };
	}
	return ok(left);
}

function _parseMultiplicative(ctx: ExprCtx): Result<ExprNode, ParseError> {
	const first = _parseUnary(ctx);
	if (!first.ok) return first;
	let left = first.value;
	while (_peek(ctx).kind === 'STAR' || _peek(ctx).kind === 'SLASH') {
		const op = _consume(ctx).kind === 'STAR' ? '*' : '/';
		const right = _parseUnary(ctx);
		if (!right.ok) return right;
		left = { kind: 'bin', op, left, right: right.value };
	}
	return ok(left);
}

function _parseUnary(ctx: ExprCtx): Result<ExprNode, ParseError> {
	if (_peek(ctx).kind === 'MINUS') {
		_consume(ctx);
		const operand = _parseUnary(ctx);
		if (!operand.ok) return operand;
		return ok({ kind: 'neg', operand: operand.value });
	}
	return _parsePrimary(ctx);
}

function _parsePrimary(ctx: ExprCtx): Result<ExprNode, ParseError> {
	const t = _peek(ctx);
	if (t.kind === 'LPAREN') {
		_consume(ctx);
		const inner = _parseExpr(ctx);
		if (!inner.ok) return inner;
		const rp = _consume(ctx);
		if (rp.kind !== 'RPAREN') {
			return err({ message: ') が必要', position: rp.pos, token: rp.text });
		}
		return inner;
	}
	if (t.kind === 'NUMBER') {
		_consume(ctx);
		const n = Number(t.text);
		if (!Number.isFinite(n)) {
			return err({ message: `不正な数値: ${t.text}`, position: t.pos, token: t.text });
		}
		return ok({ kind: 'num', value: n });
	}
	if (t.kind === 'IDENT' && ctx.tokens[ctx.i + 1]?.kind === 'LPAREN') {
		return _parseFuncCall(ctx);
	}
	if (t.kind === 'STRING') {
		_consume(ctx);
		return ok(
			ctx.columns.has(t.text) ? { kind: 'col', name: t.text } : { kind: 'str', value: t.text },
		);
	}
	if (t.kind === 'IDENT') {
		_consume(ctx);
		if (!ctx.columns.has(t.text)) {
			return err({ message: `未知の列: ${t.text}`, position: t.pos, token: t.text });
		}
		return ok({ kind: 'col', name: t.text });
	}
	return err({ message: '式が必要', position: t.pos, token: t.text });
}

function _parseFuncCall(ctx: ExprCtx): Result<ExprNode, ParseError> {
	const nameTok = _consume(ctx);
	const name = nameTok.text.toLowerCase();
	const arity = FUNC_ARITY[name];
	if (arity === undefined) {
		return err({
			message: `未知の関数: ${nameTok.text}`,
			position: nameTok.pos,
			token: nameTok.text,
		});
	}
	_consume(ctx);
	const args: ExprNode[] = [];
	if (_peek(ctx).kind !== 'RPAREN') {
		while (true) {
			const arg = _parseExpr(ctx);
			if (!arg.ok) return arg;
			args.push(arg.value);
			if (_peek(ctx).kind === 'COMMA') {
				_consume(ctx);
				continue;
			}
			break;
		}
	}
	const rp = _consume(ctx);
	if (rp.kind !== 'RPAREN') {
		return err({ message: ') が必要', position: rp.pos, token: rp.text });
	}
	if (args.length < arity.min || args.length > arity.max) {
		const need =
			arity.max === Number.POSITIVE_INFINITY
				? `${arity.min} 個以上`
				: arity.min === arity.max
					? `${arity.min} 個`
					: `${arity.min}〜${arity.max} 個`;
		return err({
			message: `${name} の引数は ${need} 必要 (実際 ${args.length} 個)`,
			position: nameTok.pos,
			token: nameTok.text,
		});
	}
	return ok({ kind: 'func', name, args });
}

export type EvalFn = (row: unknown) => CellValue;

export type ColumnResolver = (name: string) => EvalFn;

function _inferType(node: ExprNode): ColumnType | undefined {
	switch (node.kind) {
		case 'num':
		case 'neg':
		case 'bin':
			return 'number';
		case 'str':
		case 'concat':
			return 'string';
		case 'cmp':
			return 'boolean';
		case 'col':
			return undefined;
		case 'func': {
			if (node.name === 'if') {
				const t = _inferType(node.args[1]!);
				const e = _inferType(node.args[2]!);
				return t !== undefined && t === e ? t : undefined;
			}
			if (node.name === 'coalesce') {
				let acc: ColumnType | undefined;
				for (const a of node.args) {
					const t = _inferType(a);
					if (t === undefined) return undefined;
					if (acc === undefined) acc = t;
					else if (acc !== t) return undefined;
				}
				return acc;
			}
			if (node.name === 'lower' || node.name === 'upper') {
				return 'string';
			}
			return 'number';
		}
	}
}

function _compileExpr(node: ExprNode, resolve: ColumnResolver): EvalFn {
	switch (node.kind) {
		case 'num': {
			const v = node.value;
			return () => v;
		}
		case 'str': {
			const v = node.value;
			return () => v;
		}
		case 'col':
			return resolve(node.name);
		case 'neg': {
			const operand = _compileExpr(node.operand, resolve);
			return (row) => {
				const v = _coerceNumber(operand(row));
				return v === null ? null : -v;
			};
		}
		case 'bin': {
			const left = _compileExpr(node.left, resolve);
			const right = _compileExpr(node.right, resolve);
			const op = node.op;
			return (row) => {
				const a = _coerceNumber(left(row));
				if (a === null) return null;
				const b = _coerceNumber(right(row));
				if (b === null) return null;
				switch (op) {
					case '+':
						return a + b;
					case '-':
						return a - b;
					case '*':
						return a * b;
					case '/':
						return b === 0 ? null : a / b;
				}
			};
		}
		case 'concat': {
			const left = _compileExpr(node.left, resolve);
			const right = _compileExpr(node.right, resolve);
			return (row) => _coerceString(left(row)) + _coerceString(right(row));
		}
		case 'cmp': {
			const left = _compileExpr(node.left, resolve);
			const right = _compileExpr(node.right, resolve);
			const op = node.op;
			return (row) => _compareValues(op, left(row), right(row));
		}
		case 'func': {
			const args = node.args.map((a) => _compileExpr(a, resolve));
			return _compileFunc(node.name, args);
		}
	}
}

export function _compileColumn(
	node: ExprNode,
	resolve: ColumnResolver,
): { accessor: EvalFn; type: ColumnType | undefined } {
	const evalFn = _compileExpr(node, resolve);
	const type = _inferType(node);
	if (type !== undefined && type !== 'number') {
		return { accessor: evalFn, type };
	}
	const accessor: EvalFn = (row) => {
		const v = evalFn(row);
		return typeof v === 'number' ? _cleanNumber(v) : v;
	};
	return { accessor, type };
}

function _compareValues(
	op: '=' | '!=' | '>' | '<' | '>=' | '<=',
	a: CellValue,
	b: CellValue,
): boolean {
	const aNull = a === null || a === undefined;
	const bNull = b === null || b === undefined;
	const an = _coerceNumber(a);
	const bn = _coerceNumber(b);

	if (op === '=' || op === '!=') {
		let eq: boolean;
		if (aNull || bNull) {
			eq = aNull && bNull;
		} else if (an !== null && bn !== null) {
			eq = _cleanNumber(an) === _cleanNumber(bn);
		} else {
			eq = String(a) === String(b);
		}
		return op === '=' ? eq : !eq;
	}

	if (aNull || bNull) return false;
	let c: number;
	if (an !== null && bn !== null) {
		const ca = _cleanNumber(an)!;
		const cb = _cleanNumber(bn)!;
		c = ca < cb ? -1 : ca > cb ? 1 : 0;
	} else {
		const sa = String(a);
		const sb = String(b);
		c = sa < sb ? -1 : sa > sb ? 1 : 0;
	}
	switch (op) {
		case '>':
			return c > 0;
		case '<':
			return c < 0;
		case '>=':
			return c >= 0;
		case '<=':
			return c <= 0;
	}
}

function _truthy(v: CellValue): boolean {
	if (v === null || v === undefined) return false;
	if (typeof v === 'boolean') return v;
	if (typeof v === 'number') {
		const c = _cleanNumber(v);
		return c !== null && c !== 0;
	}
	return v !== '';
}

function _compileFunc(name: string, args: ReadonlyArray<EvalFn>): EvalFn {
	switch (name) {
		case 'if': {
			const cond = args[0]!;
			const thenFn = args[1]!;
			const elseFn = args[2]!;
			return (row) => (_truthy(cond(row)) ? thenFn(row) : elseFn(row));
		}
		case 'abs': {
			const a = args[0]!;
			return (row) => {
				const v = _coerceNumber(a(row));
				return v === null ? null : Math.abs(v);
			};
		}
		case 'floor': {
			const a = args[0]!;
			return (row) => {
				const v = _coerceNumber(a(row));
				return v === null ? null : Math.floor(v);
			};
		}
		case 'ceil': {
			const a = args[0]!;
			return (row) => {
				const v = _coerceNumber(a(row));
				return v === null ? null : Math.ceil(v);
			};
		}
		case 'round': {
			const valueFn = args[0]!;
			const placesFn = args[1];
			return (row) => _round(valueFn(row), placesFn === undefined ? 0 : placesFn(row));
		}
		case 'min':
		case 'max': {
			const isMin = name === 'min';
			return (row) => {
				let acc: number | null = null;
				for (let k = 0; k < args.length; k++) {
					const v = _coerceNumber(args[k]!(row));
					if (v === null) continue;
					if (acc === null || (isMin ? v < acc : v > acc)) acc = v;
				}
				return acc;
			};
		}
		case 'coalesce': {
			return (row) => {
				for (let k = 0; k < args.length; k++) {
					const v = args[k]!(row);
					if (v !== null && v !== undefined) return v;
				}
				return null;
			};
		}
		case 'lower': {
			const a = args[0]!;
			return (row) => _coerceString(a(row)).toLowerCase();
		}
		case 'upper': {
			const a = args[0]!;
			return (row) => _coerceString(a(row)).toUpperCase();
		}
	}
	throw new Error(`未知の関数: ${name}`);
}

function _round(value: CellValue, placesVal: CellValue): number | null {
	const c = _coerceNumber(value);
	if (c === null) return null;
	const v = _cleanNumber(c);
	if (v === null) return null;
	const pc = _coerceNumber(placesVal);
	const places = pc === null ? 0 : Math.trunc(pc);
	const factor = 10 ** places;
	const scaled = _cleanNumber(v * factor);
	if (scaled === null) return null;
	const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
	return _cleanNumber(rounded / factor);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	type EvalRow = Record<string, CellValue>;
	const parseExprSrc = (src: string, cols: ReadonlyArray<string>): Result<ExprNode, ParseError> => {
		const lex = _tokenize(src);
		if (!lex.ok) return err({ message: lex.error.message, position: lex.error.pos });
		const ctx: ExprCtx = { tokens: lex.tokens, i: 0, columns: new Set(cols) };
		return _parseExpr(ctx);
	};
	const evalExpr = (src: string, cols: ReadonlyArray<string>, row: EvalRow): CellValue => {
		const parsed = parseExprSrc(src, cols);
		if (!parsed.ok) throw new Error(`parse: ${parsed.error.message}`);
		const { accessor } = _compileColumn(
			parsed.value,
			(name) => (r) => (r as EvalRow)[name] ?? null,
		);
		return accessor(row);
	};

	describe('_compileColumn', () => {
		const resolve: ColumnResolver = (name) => (r) => (r as EvalRow)[name] ?? null;

		it('accessor は最終 cleanup を必ず適用する (呼び出し側でラップ不要)', () => {
			const parsed = parseExprSrc('a + b', ['a', 'b']);
			if (!parsed.ok) throw new Error(parsed.error.message);
			const row: EvalRow = { a: 0.1, b: 0.2 };
			const { accessor } = _compileColumn(parsed.value, resolve);
			expect(accessor(row)).toBe(0.3);
		});

		it('型推論を同時に返す (数値式 → number, 文字列連結 → string)', () => {
			const num = parseExprSrc('a * 2', ['a']);
			const str = parseExprSrc('a & b', ['a', 'b']);
			if (!num.ok || !str.ok) throw new Error('parse');
			expect(_compileColumn(num.value, resolve).type).toBe('number');
			expect(_compileColumn(str.value, resolve).type).toBe('string');
		});

		it('lockstep: number 以外を推論する式は実行時にも number を返さない', () => {
			const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>, EvalRow]> = [
				['a & b', ['a', 'b'], { a: 1, b: 2 }],
				['lower(a)', ['a'], { a: 'X' }],
				['upper(a)', ['a'], { a: 'x' }],
				['a > b', ['a', 'b'], { a: 1, b: 2 }],
				['if(a > 0, "y", "n")', ['a'], { a: 1 }],
				['coalesce(lower(a), "x")', ['a'], { a: null }],
			];
			for (const [src, cols, row] of cases) {
				const parsed = parseExprSrc(src, cols);
				if (!parsed.ok) throw new Error(`${src}: ${parsed.error.message}`);
				const { accessor, type } = _compileColumn(parsed.value, resolve);
				expect(type === 'string' || type === 'boolean').toBe(true);
				expect(typeof accessor(row)).not.toBe('number');
			}
		});
	});

	describe('_cleanNumber', () => {
		it('15 有効数字に丸めて表現誤差を消す', () => {
			expect(_cleanNumber(0.1 + 0.2)).toBe(0.3);
		});
		it('0 近傍はちょうど 0 にスナップ', () => {
			expect(_cleanNumber(0.000000000001)).toBe(0);
			expect(_cleanNumber(-0.000000000001)).toBe(0);
		});
		it('非有限は null', () => {
			expect(_cleanNumber(Number.NaN)).toBeNull();
			expect(_cleanNumber(Number.POSITIVE_INFINITY)).toBeNull();
			expect(_cleanNumber(Number.NEGATIVE_INFINITY)).toBeNull();
		});
		it('通常の値はそのまま', () => {
			expect(_cleanNumber(59.99)).toBe(59.99);
			expect(_cleanNumber(0)).toBe(0);
			expect(_cleanNumber(-42)).toBe(-42);
		});
	});

	describe('式の評価', () => {
		const cols = ['amount', 'quantity', 'price'];

		it('列参照と乗算', () => {
			expect(evalExpr('amount * quantity', cols, { amount: 100, quantity: 3 })).toBe(300);
		});

		it('乗除は加減より優先', () => {
			expect(
				evalExpr('amount + quantity * price', cols, { amount: 1, quantity: 2, price: 3 }),
			).toBe(7);
		});

		it('括弧で優先順位を上書き', () => {
			expect(
				evalExpr('(amount + quantity) * price', cols, { amount: 1, quantity: 2, price: 3 }),
			).toBe(9);
		});

		it('単項マイナス', () => {
			expect(evalExpr('-amount', cols, { amount: 5 })).toBe(-5);
			expect(evalExpr('amount - -quantity', cols, { amount: 5, quantity: 3 })).toBe(8);
		});

		it('オペランドが null/空なら結果も null (null 伝播)', () => {
			expect(evalExpr('amount * quantity', cols, { amount: 100, quantity: null })).toBeNull();
			expect(evalExpr('amount + price', cols, { amount: 100, price: undefined })).toBeNull();
		});

		it('ゼロ除算は null (Infinity を出さない)', () => {
			expect(evalExpr('amount / quantity', cols, { amount: 100, quantity: 0 })).toBeNull();
		});

		it('数値文字列は強制変換される', () => {
			expect(evalExpr('amount * quantity', cols, { amount: '100', quantity: '3' })).toBe(300);
		});

		it('最終結果に cleanup が効く (0.1+0.2)', () => {
			expect(evalExpr('amount + price', cols, { amount: 0.1, price: 0.2 })).toBe(0.3);
		});
	});

	describe('関数呼び出しのパース', () => {
		const cols = ['amount', 'quantity', 'price'];

		it('IDENT( は funcCall として解析される', () => {
			const r = parseExprSrc('abs(amount)', cols);
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toMatchObject({ kind: 'func', name: 'abs' });
		});

		it('関数名は case-insensitive で小文字へ正規化', () => {
			const r = parseExprSrc('ROUND(amount, 2)', cols);
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.value).toMatchObject({ kind: 'func', name: 'round' });
		});

		it('未知の関数は ParseError ({message, position, token})', () => {
			const r = parseExprSrc('sqrt(amount)', cols);
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.message).toMatch(/未知の関数/);
				expect(r.error.position).toBe(0);
				expect(r.error.token).toBe('sqrt');
			}
		});

		it('アリティ不一致は ParseError', () => {
			expect(parseExprSrc('abs()', cols).ok).toBe(false);
			expect(parseExprSrc('abs(amount, quantity)', cols).ok).toBe(false);
			expect(parseExprSrc('round(amount, 2, 3)', cols).ok).toBe(false);
			expect(parseExprSrc('min()', cols).ok).toBe(false);
		});

		it('引数は式として再帰的に解析される (ネスト / 算術)', () => {
			const r = parseExprSrc('round(amount * price, 2)', cols);
			expect(r.ok).toBe(true);
			if (r.ok && r.value.kind === 'func') {
				expect(r.value.args).toHaveLength(2);
				expect(r.value.args[0]).toMatchObject({ kind: 'bin', op: '*' });
			}
		});
	});

	describe('比較演算子', () => {
		const cols = ['salary', 'age'];

		it('>= は boolean を返す (tracer bullet)', () => {
			expect(evalExpr('salary >= 50000', cols, { salary: 60000 })).toBe(true);
			expect(evalExpr('salary >= 50000', cols, { salary: 40000 })).toBe(false);
		});

		it('= / != は数値で比較 (両者数値強制可)', () => {
			expect(evalExpr('age = 30', cols, { age: 30 })).toBe(true);
			expect(evalExpr('age != 30', cols, { age: 30 })).toBe(false);
			expect(evalExpr('age = 30', cols, { age: '30' })).toBe(true);
		});

		it('順序演算子 > < <=', () => {
			expect(evalExpr('age > 30', cols, { age: 31 })).toBe(true);
			expect(evalExpr('age < 30', cols, { age: 31 })).toBe(false);
			expect(evalExpr('age <= 30', cols, { age: 30 })).toBe(true);
		});

		it('cleanup 済みの値で比較 (0 近傍は 0 扱い)', () => {
			expect(evalExpr('age = 0', ['age'], { age: 0.1 + 0.2 - 0.3 })).toBe(true);
			expect(evalExpr('age > 0', ['age'], { age: 0.000000000001 })).toBe(false);
		});

		it('= / != の null 等価規則 (null は null とだけ等しい)', () => {
			expect(evalExpr('age = age2', ['age', 'age2'], { age: null, age2: null })).toBe(true);
			expect(evalExpr('age != age2', ['age', 'age2'], { age: null, age2: null })).toBe(false);
			expect(evalExpr('age = age2', ['age', 'age2'], { age: null, age2: 0 })).toBe(false);
			expect(evalExpr('age != age2', ['age', 'age2'], { age: null, age2: 0 })).toBe(true);
		});

		it('順序比較に null が絡むと false (SQL 風)', () => {
			expect(evalExpr('age > age2', ['age', 'age2'], { age: null, age2: 5 })).toBe(false);
			expect(evalExpr('age <= age2', ['age', 'age2'], { age: 5, age2: null })).toBe(false);
		});

		it('数値強制できない値どうしは文字列比較 (case-sensitive)', () => {
			expect(evalExpr('a = b', ['a', 'b'], { a: 'foo', b: 'foo' })).toBe(true);
			expect(evalExpr('a = b', ['a', 'b'], { a: 'Foo', b: 'foo' })).toBe(false);
			expect(evalExpr('a < b', ['a', 'b'], { a: 'apple', b: 'banana' })).toBe(true);
		});

		it('連鎖比較はパースエラー (非結合)', () => {
			const r = parseExprSrc('a < b < c', ['a', 'b', 'c']);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error.message).toMatch(/連鎖/);
		});
	});

	describe('IF 関数', () => {
		const cols = ['salary', 'qty', 'total', 'flag'];

		it('条件で分岐を選ぶ', () => {
			expect(evalExpr('IF(salary >= 50000, 1, 0)', cols, { salary: 60000 })).toBe(1);
			expect(evalExpr('IF(salary >= 50000, 1, 0)', cols, { salary: 40000 })).toBe(0);
		});

		it('truthiness: 0 / "" / null / NaN は falsy、それ以外は truthy', () => {
			expect(evalExpr('IF(flag, 1, 0)', cols, { flag: 0 })).toBe(0);
			expect(evalExpr('IF(flag, 1, 0)', cols, { flag: '' })).toBe(0);
			expect(evalExpr('IF(flag, 1, 0)', cols, { flag: null })).toBe(0);
			expect(evalExpr('IF(flag, 1, 0)', cols, { flag: Number.NaN })).toBe(0);
			expect(evalExpr('IF(flag, 1, 0)', cols, { flag: 0.000000000001 })).toBe(0);
			expect(evalExpr('IF(flag, 1, 0)', cols, { flag: 5 })).toBe(1);
			expect(evalExpr('IF(flag, 1, 0)', cols, { flag: 'x' })).toBe(1);
		});

		it('遅延評価: 採られない分岐は評価しない (ゼロ除算を回避)', () => {
			expect(evalExpr('IF(qty = 0, 0, total / qty)', cols, { qty: 0, total: 100 })).toBe(0);
			expect(evalExpr('IF(qty = 0, 0, total / qty)', cols, { qty: 4, total: 100 })).toBe(25);
		});

		it('アリティは厳密に 3', () => {
			expect(parseExprSrc('IF(salary >= 1)', cols).ok).toBe(false);
			expect(parseExprSrc('IF(salary >= 1, 2)', cols).ok).toBe(false);
			expect(parseExprSrc('IF(salary >= 1, 2, 3, 4)', cols).ok).toBe(false);
		});

		it('文字列リテラルを分岐値に使える (band の例)', () => {
			expect(evalExpr('IF(salary >= 50000, "high", "low")', cols, { salary: 60000 })).toBe('high');
			expect(evalExpr('IF(salary >= 50000, "high", "low")', cols, { salary: 40000 })).toBe('low');
		});

		it('ネスト/連鎖した IF', () => {
			const expr = 'IF(salary >= 80000, "A", IF(salary >= 50000, "B", "C"))';
			expect(evalExpr(expr, cols, { salary: 90000 })).toBe('A');
			expect(evalExpr(expr, cols, { salary: 60000 })).toBe('B');
			expect(evalExpr(expr, cols, { salary: 10000 })).toBe('C');
		});
	});

	describe('文字列リテラル', () => {
		it('既知列名はクオートしても列参照、未知名は文字列リテラル', () => {
			expect(evalExpr('"salary"', ['salary'], { salary: 42 })).toBe(42);
			expect(evalExpr('"foo"', ['salary'], { salary: 42 })).toBe('foo');
		});

		it('文字列リテラルどうしの比較', () => {
			expect(evalExpr('IF("a" = "a", 1, 0)', ['x'], { x: 0 })).toBe(1);
			expect(evalExpr('IF("a" = "b", 1, 0)', ['x'], { x: 0 })).toBe(0);
		});
	});

	describe('文字列連結 &', () => {
		const cols = ['first', 'last', 'a', 'b', 'c'];

		it('列どうしを連結する (tracer bullet)', () => {
			expect(evalExpr('first & last', cols, { first: 'John', last: 'Doe' })).toBe('JohnDoe');
		});

		it('文字列リテラルを挟んで連結 (label の例)', () => {
			expect(evalExpr('first & " " & last', cols, { first: 'John', last: 'Doe' })).toBe('John Doe');
		});

		it('数値は cleanup 済みの最小表記で文字列化 (§6.2)', () => {
			expect(evalExpr('a & b', cols, { a: 0.1 + 0.2, b: 'x' })).toBe('0.3x');
			expect(evalExpr('a & b', cols, { a: 42, b: '!' })).toBe('42!');
		});

		it('boolean は "true"/"false" に (§6.2)', () => {
			expect(evalExpr('a & b', cols, { a: true, b: false })).toBe('truefalse');
		});

		it('null/undefined は "" に、結果は常に文字列 (§7)', () => {
			expect(evalExpr('a & b', cols, { a: null, b: 'x' })).toBe('x');
			expect(evalExpr('a & b', cols, { a: 'x', b: undefined })).toBe('x');
			expect(evalExpr('a & b', cols, { a: null, b: null })).toBe('');
		});

		it('& は算術 + - より緩く結合する (a & b + c ≡ a & (b+c))', () => {
			expect(evalExpr('a & b + c', cols, { a: 'sum=', b: 2, c: 3 })).toBe('sum=5');
		});

		it('& は比較より強く結合する (a & b = c ≡ (a&b) = c)', () => {
			expect(evalExpr('a & b = c', cols, { a: 'x', b: 'y', c: 'xy' })).toBe(true);
		});

		it('左結合 (a & b & c)', () => {
			const r = parseExprSrc('a & b & c', cols);
			expect(r.ok).toBe(true);
			if (r.ok && r.value.kind === 'concat') {
				expect(r.value.left).toMatchObject({ kind: 'concat' });
				expect(r.value.right).toMatchObject({ kind: 'col', name: 'c' });
			}
		});
	});

	describe('lower / upper', () => {
		const cols = ['name', 'x'];

		it('lower は小文字化', () => {
			expect(evalExpr('lower(name)', cols, { name: 'HeLLo' })).toBe('hello');
		});

		it('upper は大文字化', () => {
			expect(evalExpr('upper(name)', cols, { name: 'HeLLo' })).toBe('HELLO');
		});

		it('null は "" (§5)', () => {
			expect(evalExpr('lower(name)', cols, { name: null })).toBe('');
			expect(evalExpr('upper(name)', cols, { name: null })).toBe('');
		});

		it('数値/boolean も coerce-to-string 経由で処理 (§6.2)', () => {
			expect(evalExpr('upper(x)', cols, { x: 'ab' })).toBe('AB');
			expect(evalExpr('lower(x)', cols, { x: true })).toBe('true');
		});

		it('アリティは厳密に 1', () => {
			expect(parseExprSrc('lower()', cols).ok).toBe(false);
			expect(parseExprSrc('lower(name, x)', cols).ok).toBe(false);
		});
	});

	describe('_inferType (string 拡張)', () => {
		it('concat は string', () => {
			const r = parseExprSrc('a & b', ['a', 'b']);
			expect(r.ok).toBe(true);
			if (r.ok) expect(_inferType(r.value)).toBe('string');
		});
		it('lower / upper は string', () => {
			const lo = parseExprSrc('lower(a)', ['a']);
			const up = parseExprSrc('upper(a)', ['a']);
			expect(lo.ok && _inferType(lo.value)).toBe('string');
			expect(up.ok && _inferType(up.value)).toBe('string');
		});
	});

	describe('数値関数の評価', () => {
		const cols = ['x', 'y', 'z'];

		it('abs: 絶対値・null 伝播', () => {
			expect(evalExpr('abs(x)', cols, { x: -5 })).toBe(5);
			expect(evalExpr('abs(x)', cols, { x: 5 })).toBe(5);
			expect(evalExpr('abs(x)', cols, { x: null })).toBeNull();
		});

		it('floor: −∞ 方向', () => {
			expect(evalExpr('floor(x)', cols, { x: 2.9 })).toBe(2);
			expect(evalExpr('floor(x)', cols, { x: -2.1 })).toBe(-3);
			expect(evalExpr('floor(x)', cols, { x: null })).toBeNull();
		});

		it('ceil: +∞ 方向', () => {
			expect(evalExpr('ceil(x)', cols, { x: 2.1 })).toBe(3);
			expect(evalExpr('ceil(x)', cols, { x: -2.9 })).toBe(-2);
			expect(evalExpr('ceil(x)', cols, { x: null })).toBeNull();
		});

		it('round: half-away-from-zero / 桁指定 / 負の桁 (§10 fixtures)', () => {
			expect(evalExpr('round(x)', cols, { x: 2.5 })).toBe(3);
			expect(evalExpr('round(x)', cols, { x: -2.5 })).toBe(-3);
			expect(evalExpr('round(x, y)', cols, { x: 2.345, y: 2 })).toBe(2.35);
			expect(evalExpr('round(x, y)', cols, { x: 2.344, y: 2 })).toBe(2.34);
			expect(evalExpr('round(x, y)', cols, { x: 1234, y: -2 })).toBe(1200);
			expect(evalExpr('round(x * 0.1, y)', cols, { x: 999.99, y: 2 })).toBe(100);
		});

		it('round: null / NaN な value は null', () => {
			expect(evalExpr('round(x)', cols, { x: null })).toBeNull();
			expect(evalExpr('round(x)', cols, { x: Number.NaN })).toBeNull();
			expect(evalExpr('round(x, y)', cols, { x: '', y: 2 })).toBeNull();
		});

		it('min / max: 可変長・null 無視・全 null は null', () => {
			expect(evalExpr('min(x, y, z)', cols, { x: 3, y: 1, z: 2 })).toBe(1);
			expect(evalExpr('max(x, y, z)', cols, { x: 3, y: 1, z: 2 })).toBe(3);
			expect(evalExpr('min(x, y)', cols, { x: null, y: 5 })).toBe(5);
			expect(evalExpr('max(x, y)', cols, { x: null, y: 5 })).toBe(5);
			expect(evalExpr('min(x, y)', cols, { x: null, y: null })).toBeNull();
		});

		it('coalesce: 最初の non-null をそのまま (型強制なし)', () => {
			expect(evalExpr('coalesce(x, y)', cols, { x: null, y: 5 })).toBe(5);
			expect(evalExpr('coalesce(x, y)', cols, { x: 'A', y: 'B' })).toBe('A');
			expect(evalExpr('coalesce(x, y)', cols, { x: null, y: undefined })).toBeNull();
			expect(evalExpr('coalesce(x, y)', cols, { x: 0, y: 9 })).toBe(0);
		});

		it('関数と算術の合成 (round が cleanup と整合)', () => {
			expect(evalExpr('round(x * 0.1, 2)', cols, { x: 19.99 })).toBe(2);
			expect(evalExpr('abs(x - y)', cols, { x: 3, y: 10 })).toBe(7);
		});
	});
}
