import type { CellValue, ColumnDef } from './column.ts';
import type { FilterOp, Leaf, Predicate } from './filter.ts';
import { f } from './filter.ts';
import type {
	ChartConfig,
	ChartMetric,
	ChartType,
	ComputedColumnSpec,
	ParsedQuery,
	ParseError,
} from './query.ts';
import type { Result } from './_result.ts';
import { err, ok } from './_result.ts';
import type { Token } from './_query-lexer.ts';
import type { AggregateFn } from './_aggregate.ts';
import { _parseExpr } from './_computed-engine.ts';
import { _coerceNumber } from './_utils.ts';

const CHART_TYPES: ReadonlySet<ChartType> = new Set(['bar', 'line', 'pie', 'combo', 'bubble']);
const AGG_FNS: ReadonlySet<AggregateFn> = new Set([
	'count',
	'countDistinct',
	'sum',
	'avg',
	'min',
	'max',
	'median',
	'p25',
	'p75',
	'p90',
	'p95',
	'p99',
	'stddev',
	'variance',
]);

const OP_MAP: Readonly<Record<string, FilterOp>> = {
	'=': '=',
	'!=': '!=',
	'>': '>',
	'<': '<',
	'>=': '>=',
	'<=': '<=',
	'~': 'like',
	'~^': 'startsWith',
	'~$': 'endsWith',
	'~i': 'like',
};

type ParserCtx = {
	tokens: ReadonlyArray<Token>;
	i: number;
	columns: Set<string>;
};

function _peek(ctx: ParserCtx): Token {
	return ctx.tokens[ctx.i]!;
}
function _consume(ctx: ParserCtx): Token {
	return ctx.tokens[ctx.i++]!;
}
function _eof(ctx: ParserCtx): boolean {
	return _peek(ctx).kind === 'EOF';
}

function _canStartPrimary(t: Token): boolean {
	return t.kind === 'IDENT' || t.kind === 'STRING' || t.kind === 'KW_NOT' || t.kind === 'LPAREN';
}

function _tokenToValue(t: Token): CellValue {
	if (t.kind === 'NUMBER') {
		const n = _coerceNumber(t.text);
		return n === null ? t.text : n;
	}
	return t.text;
}

function _parseValue(ctx: ParserCtx): Result<CellValue, ParseError> {
	const t = _peek(ctx);
	if (t.kind === 'STRING' || t.kind === 'NUMBER' || t.kind === 'IDENT') {
		_consume(ctx);
		return ok(_tokenToValue(t));
	}
	return err({ message: '値が必要', position: t.pos, token: t.text });
}

function _parseLeafValue(ctx: ParserCtx, opText: string): Result<CellValue, ParseError> {
	const t = _peek(ctx);
	if (t.kind !== 'STRING' && t.kind !== 'NUMBER' && t.kind !== 'IDENT') {
		return err({ message: '値が必要', position: t.pos, token: t.text });
	}
	if (opText === '>' || opText === '<' || opText === '>=' || opText === '<=') {
		_consume(ctx);
		return ok(_tokenToValue(t));
	}
	if (t.kind === 'STRING') {
		_consume(ctx);
		return ok(_tokenToValue(t));
	}

	const parts: string[] = [];
	const firstKind = t.kind;
	const firstNumeric = firstKind === 'NUMBER';
	while (true) {
		const cur = _peek(ctx);
		if (cur.kind !== 'IDENT' && cur.kind !== 'NUMBER' && cur.kind !== 'STRING') break;
		if (parts.length > 0) {
			const ahead = ctx.tokens[ctx.i + 1];
			if (ahead && (ahead.kind === 'OP' || ahead.kind === 'KW_IS' || ahead.kind === 'KW_IN')) {
				break;
			}
		}
		_consume(ctx);
		parts.push(cur.text);
	}
	if (parts.length === 1 && firstNumeric) {
		const n = _coerceNumber(parts[0]!);
		return ok(n === null ? parts[0]! : n);
	}
	return ok(parts.join(' '));
}

function _parseInList(ctx: ParserCtx): Result<ReadonlyArray<CellValue>, ParseError> {
	const lp = _consume(ctx);
	if (lp.kind !== 'LPAREN') {
		return err({ message: 'in の後には ( が必要', position: lp.pos, token: lp.text });
	}
	const values: CellValue[] = [];
	if (_peek(ctx).kind === 'RPAREN') {
		_consume(ctx);
		return ok(values);
	}
	while (true) {
		const v = _parseValue(ctx);
		if (!v.ok) return v;
		values.push(v.value);
		const next = _peek(ctx);
		if (next.kind === 'COMMA') {
			_consume(ctx);
			continue;
		}
		if (next.kind === 'RPAREN') {
			_consume(ctx);
			return ok(values);
		}
		return err({ message: 'in リストには , か ) が必要', position: next.pos, token: next.text });
	}
}

function _parseLeaf(ctx: ParserCtx): Result<Predicate, ParseError> {
	const idTok = _consume(ctx);
	let columnId: string;
	if (idTok.kind === 'IDENT' || idTok.kind === 'STRING') {
		columnId = idTok.text;
	} else {
		return err({ message: '列名が必要', position: idTok.pos, token: idTok.text });
	}

	if (!ctx.columns.has(columnId)) {
		return err({ message: `未知の列: ${columnId}`, position: idTok.pos, token: columnId });
	}

	const opTok = _peek(ctx);

	if (opTok.kind === 'KW_IS') {
		_consume(ctx);
		const next = _peek(ctx);
		if (next.kind === 'KW_NOT') {
			_consume(ctx);
			const nul = _consume(ctx);
			if (nul.kind !== 'KW_NULL') {
				return err({ message: 'is not の後には null が必要', position: nul.pos, token: nul.text });
			}
			return ok(f.leaf(columnId, 'isNotNull'));
		}
		if (next.kind !== 'KW_NULL') {
			return err({
				message: 'is の後には null か not null が必要',
				position: next.pos,
				token: next.text,
			});
		}
		_consume(ctx);
		return ok(f.leaf(columnId, 'isNull'));
	}

	if (opTok.kind === 'KW_IN') {
		_consume(ctx);
		const values = _parseInList(ctx);
		if (!values.ok) return values;
		return ok(f.leaf(columnId, 'in', values.value));
	}

	if (opTok.kind !== 'OP') {
		return err({ message: '演算子が必要', position: opTok.pos, token: opTok.text });
	}
	_consume(ctx);
	const op = OP_MAP[opTok.text];
	if (op === undefined) {
		return err({ message: `不明な演算子: ${opTok.text}`, position: opTok.pos, token: opTok.text });
	}

	const value = _parseLeafValue(ctx, opTok.text);
	if (!value.ok) return value;

	const leaf: Leaf =
		opTok.text === '~i'
			? f.leaf(columnId, op, value.value, false)
			: f.leaf(columnId, op, value.value);
	return ok(leaf);
}

function _parsePrimary(ctx: ParserCtx): Result<Predicate, ParseError> {
	const t = _peek(ctx);
	if (t.kind === 'LPAREN') {
		_consume(ctx);
		const inner = _parseOr(ctx);
		if (!inner.ok) return inner;
		const rp = _consume(ctx);
		if (rp.kind !== 'RPAREN') {
			return err({ message: ') が必要', position: rp.pos, token: rp.text });
		}
		return inner;
	}
	return _parseLeaf(ctx);
}

function _parseUnary(ctx: ParserCtx): Result<Predicate, ParseError> {
	if (_peek(ctx).kind === 'KW_NOT') {
		_consume(ctx);
		const inner = _parsePrimary(ctx);
		if (!inner.ok) return inner;
		return ok(f.not(inner.value));
	}
	return _parsePrimary(ctx);
}

function _parseAnd(ctx: ParserCtx): Result<Predicate, ParseError> {
	const first = _parseUnary(ctx);
	if (!first.ok) return first;
	const items: Predicate[] = [first.value];
	while (true) {
		const t = _peek(ctx);
		if (t.kind === 'KW_AND') {
			_consume(ctx);
		} else if (_canStartPrimary(t)) {
			// 暗黙の AND
		} else {
			break;
		}
		const next = _parseUnary(ctx);
		if (!next.ok) return next;
		items.push(next.value);
	}
	return ok(items.length === 1 ? items[0]! : f.and(...items));
}

function _parseOr(ctx: ParserCtx): Result<Predicate, ParseError> {
	const first = _parseAnd(ctx);
	if (!first.ok) return first;
	const items: Predicate[] = [first.value];
	while (_peek(ctx).kind === 'PIPE' || _peek(ctx).kind === 'KW_OR') {
		_consume(ctx);
		const next = _parseAnd(ctx);
		if (!next.ok) return next;
		items.push(next.value);
	}
	return ok(items.length === 1 ? items[0]! : f.or(...items));
}

function _parseChart(ctx: ParserCtx): Result<ChartConfig, ParseError> {
	const typeTok = _consume(ctx);
	if (typeTok.kind !== 'IDENT') {
		return err({
			message: 'chart の後にはチャート種別が必要',
			position: typeTok.pos,
			token: typeTok.text,
		});
	}
	const type = typeTok.text.toLowerCase() as ChartType;
	if (!CHART_TYPES.has(type)) {
		return err({
			message: `不明なチャート種別: ${typeTok.text} (有効: bar, line, pie, combo, bubble)`,
			position: typeTok.pos,
			token: typeTok.text,
		});
	}

	const byTok = _consume(ctx);
	if (byTok.kind !== 'KW_BY') {
		return err({
			message: 'chart <type> の後には by が必要',
			position: byTok.pos,
			token: byTok.text,
		});
	}

	const groupTok = _consume(ctx);
	if (groupTok.kind !== 'IDENT' && groupTok.kind !== 'STRING') {
		return err({ message: 'グループ列名が必要', position: groupTok.pos, token: groupTok.text });
	}
	if (!ctx.columns.has(groupTok.text)) {
		return err({
			message: `未知の列: ${groupTok.text}`,
			position: groupTok.pos,
			token: groupTok.text,
		});
	}

	const metrics: ChartMetric[] = [];
	while (true) {
		const next = _peek(ctx);
		if (next.kind !== 'IDENT') break;
		const aggTok = _consume(ctx);
		const fn = aggTok.text.toLowerCase() as AggregateFn;
		if (!AGG_FNS.has(fn)) {
			return err({
				message: `不明な集約関数: ${aggTok.text} (有効: count, sum, avg, min, max)`,
				position: aggTok.pos,
				token: aggTok.text,
			});
		}
		const colon = _consume(ctx);
		if (colon.kind !== 'COLON') {
			return err({ message: '集約関数の後には : が必要', position: colon.pos, token: colon.text });
		}
		const colTok = _consume(ctx);
		if (colTok.kind !== 'IDENT' && colTok.kind !== 'STRING') {
			return err({ message: '集約対象の列名が必要', position: colTok.pos, token: colTok.text });
		}
		if (!ctx.columns.has(colTok.text)) {
			return err({ message: `未知の列: ${colTok.text}`, position: colTok.pos, token: colTok.text });
		}
		metrics.push({ fn, columnId: colTok.text });
	}

	if (metrics.length === 0) {
		const t = _peek(ctx);
		return err({
			message: 'メトリクスが 1 個以上必要 (例 sum:salary)',
			position: t.pos,
			token: t.text,
		});
	}
	if (type === 'combo' && metrics.length !== 2) {
		return err({
			message: `combo チャートは 2 メトリクス必要 (bar, line の順)。現在 ${metrics.length}`,
			position: typeTok.pos,
			token: typeTok.text,
		});
	}
	if (type === 'bubble' && metrics.length !== 3) {
		return err({
			message: `bubble チャートは 3 メトリクス必要 (x, y, r の順)。現在 ${metrics.length}`,
			position: typeTok.pos,
			token: typeTok.text,
		});
	}

	return ok({
		type,
		groupBy: groupTok.text,
		metrics: Object.freeze(metrics),
	});
}

function _parseLetClause(
	ctx: ParserCtx,
	computed: ComputedColumnSpec[],
): Result<undefined, ParseError> {
	_consume(ctx);
	const nameTok = _consume(ctx);
	if (nameTok.kind !== 'IDENT') {
		return err({ message: 'let の後には定義名が必要', position: nameTok.pos, token: nameTok.text });
	}
	const name = nameTok.text;
	if (ctx.columns.has(name)) {
		return err({
			message: `名前が既に使われています: ${name}`,
			position: nameTok.pos,
			token: name,
		});
	}
	const eq = _consume(ctx);
	if (eq.kind !== 'OP' || eq.text !== '=') {
		return err({ message: '定義名の後には = が必要', position: eq.pos, token: eq.text });
	}
	const expr = _parseExpr(ctx);
	if (!expr.ok) return expr;
	ctx.columns.add(name);
	computed.push({ name, expr: expr.value });
	return ok(undefined);
}

function _parseSortKey(
	ctx: ParserCtx,
): Result<{ columnId: string; dir: 'asc' | 'desc' }, ParseError> {
	let dir: 'asc' | 'desc' = 'asc';
	if (_peek(ctx).kind === 'MINUS') {
		_consume(ctx);
		dir = 'desc';
	}
	const t = _consume(ctx);
	if (t.kind !== 'IDENT' && t.kind !== 'STRING') {
		return err({ message: 'ソート列名が必要', position: t.pos, token: t.text });
	}
	if (!ctx.columns.has(t.text)) {
		return err({ message: `未知の列: ${t.text}`, position: t.pos, token: t.text });
	}
	return ok({ columnId: t.text, dir });
}

export function _parse<TRow>(
	tokens: ReadonlyArray<Token>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
): Result<ParsedQuery, ParseError> {
	const colSet = new Set(columns.map((c) => c.id));
	const ctx: ParserCtx = { tokens, i: 0, columns: colSet };

	if (_eof(ctx)) {
		return ok({ predicate: null, sort: [] });
	}

	const computed: ComputedColumnSpec[] = [];
	while (_peek(ctx).kind === 'KW_LET') {
		const r = _parseLetClause(ctx, computed);
		if (!r.ok) return r;
		if (_peek(ctx).kind === 'SEMI') {
			_consume(ctx);
		}
	}

	let predicate: Predicate | null = null;
	if (!_eof(ctx) && _peek(ctx).kind !== 'KW_BY' && _peek(ctx).kind !== 'KW_CHART') {
		const p = _parseOr(ctx);
		if (!p.ok) return p;
		predicate = p.value;
	}

	const sort: { columnId: string; dir: 'asc' | 'desc' }[] = [];
	if (_peek(ctx).kind === 'KW_BY') {
		_consume(ctx);
		while (true) {
			const sk = _parseSortKey(ctx);
			if (!sk.ok) return sk;
			sort.push(sk.value);
			if (_peek(ctx).kind === 'COMMA') {
				_consume(ctx);
				continue;
			}
			break;
		}
	}

	let chart: ChartConfig | undefined;
	if (_peek(ctx).kind === 'KW_CHART') {
		_consume(ctx);
		const c = _parseChart(ctx);
		if (!c.ok) return c;
		chart = c.value;
	}

	if (!_eof(ctx)) {
		const t = _peek(ctx);
		return err({ message: '余分なトークン', position: t.pos, token: t.text });
	}

	return ok({
		predicate,
		sort: Object.freeze(sort),
		...(computed.length > 0 ? { computed: Object.freeze(computed) } : {}),
		...(chart ? { chart } : {}),
	});
}
