import { n as _coerceNumber } from "./_utils-GkG6ju0s.js";
import { f } from "./filter.js";
//#region src/_result.ts
function ok(value) {
	return {
		ok: true,
		value
	};
}
function err(error) {
	return {
		ok: false,
		error
	};
}
//#endregion
//#region src/_query-lexer.ts
const OPERATORS = [
	">=",
	"<=",
	"!=",
	"~^",
	"~$",
	"~i",
	"=",
	">",
	"<",
	"~"
];
const KEYWORDS = {
	let: "KW_LET",
	or: "KW_OR",
	and: "KW_AND",
	not: "KW_NOT",
	by: "KW_BY",
	in: "KW_IN",
	is: "KW_IS",
	null: "KW_NULL",
	chart: "KW_CHART"
};
function _tokenize(input) {
	const tokens = [];
	let i = 0;
	const n = input.length;
	while (i < n) {
		const ch = input[i];
		if (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
			i++;
			continue;
		}
		if (ch === "(") {
			tokens.push({
				kind: "LPAREN",
				text: "(",
				pos: i
			});
			i++;
			continue;
		}
		if (ch === ")") {
			tokens.push({
				kind: "RPAREN",
				text: ")",
				pos: i
			});
			i++;
			continue;
		}
		if (ch === ",") {
			tokens.push({
				kind: "COMMA",
				text: ",",
				pos: i
			});
			i++;
			continue;
		}
		if (ch === ":") {
			tokens.push({
				kind: "COLON",
				text: ":",
				pos: i
			});
			i++;
			continue;
		}
		if (ch === "|") {
			tokens.push({
				kind: "PIPE",
				text: "|",
				pos: i
			});
			i++;
			continue;
		}
		if (ch === "+") {
			tokens.push({
				kind: "PLUS",
				text: "+",
				pos: i
			});
			i++;
			continue;
		}
		if (ch === "*") {
			tokens.push({
				kind: "STAR",
				text: "*",
				pos: i
			});
			i++;
			continue;
		}
		if (ch === "/") {
			tokens.push({
				kind: "SLASH",
				text: "/",
				pos: i
			});
			i++;
			continue;
		}
		if (ch === "&") {
			tokens.push({
				kind: "AMP",
				text: "&",
				pos: i
			});
			i++;
			continue;
		}
		if (ch === ";") {
			tokens.push({
				kind: "SEMI",
				text: ";",
				pos: i
			});
			i++;
			continue;
		}
		if (ch === "-") {
			tokens.push({
				kind: "MINUS",
				text: "-",
				pos: i
			});
			i++;
			continue;
		}
		if (ch === "\"") {
			const start = i;
			i++;
			let str = "";
			while (i < n) {
				const c = input[i];
				if (c === "\\" && i + 1 < n && input[i + 1] === "\"") {
					str += "\"";
					i += 2;
					continue;
				}
				if (c === "\"") {
					tokens.push({
						kind: "STRING",
						text: str,
						pos: start
					});
					i++;
					break;
				}
				str += c;
				i++;
			}
			if (i > n || i === n && input[i - 1] !== "\"") return {
				ok: false,
				error: {
					message: "クオート文字列が閉じていない",
					pos: start
				}
			};
			continue;
		}
		let matched = null;
		for (const op of OPERATORS) if (input.startsWith(op, i)) {
			matched = op;
			break;
		}
		if (matched !== null) {
			tokens.push({
				kind: "OP",
				text: matched,
				pos: i
			});
			i += matched.length;
			continue;
		}
		if (ch >= "0" && ch <= "9" || ch === ".") {
			const start = i;
			while (i < n) {
				const c = input[i];
				if (c >= "0" && c <= "9" || c === "." || c === "e" || c === "E" || c === "+" || c === "-") {
					if ((c === "+" || c === "-") && i > start) {
						const prev = input[i - 1];
						if (prev !== "e" && prev !== "E") break;
					}
					i++;
					continue;
				}
				break;
			}
			tokens.push({
				kind: "NUMBER",
				text: input.slice(start, i),
				pos: start
			});
			continue;
		}
		const isIdentChar = (c) => {
			if (c >= "a" && c <= "z") return true;
			if (c >= "A" && c <= "Z") return true;
			if (c >= "0" && c <= "9") return true;
			if (c === "_") return true;
			return c.charCodeAt(0) > 127;
		};
		if (isIdentChar(ch)) {
			const start = i;
			while (i < n && isIdentChar(input[i])) i++;
			const text = input.slice(start, i);
			const kwKind = KEYWORDS[text.toLowerCase()];
			tokens.push({
				kind: kwKind ?? "IDENT",
				text,
				pos: start
			});
			continue;
		}
		return {
			ok: false,
			error: {
				message: `予期しない文字 '${ch}'`,
				pos: i
			}
		};
	}
	tokens.push({
		kind: "EOF",
		text: "",
		pos: n
	});
	return {
		ok: true,
		tokens
	};
}
//#endregion
//#region src/_computed-engine.ts
function _cleanNumber(x) {
	if (!Number.isFinite(x)) return null;
	const r = Number(x.toPrecision(15));
	return Math.abs(r) < EPSILON_ZERO ? 0 : r;
}
const EPSILON_ZERO = 1e-9;
function _coerceString(v) {
	if (v === null || v === void 0) return "";
	if (typeof v === "string") return v;
	if (typeof v === "boolean") return v ? "true" : "false";
	const c = _cleanNumber(v);
	return c === null ? "" : String(c);
}
const FUNC_ARITY = {
	if: {
		min: 3,
		max: 3
	},
	round: {
		min: 1,
		max: 2
	},
	abs: {
		min: 1,
		max: 1
	},
	floor: {
		min: 1,
		max: 1
	},
	ceil: {
		min: 1,
		max: 1
	},
	min: {
		min: 1,
		max: Number.POSITIVE_INFINITY
	},
	max: {
		min: 1,
		max: Number.POSITIVE_INFINITY
	},
	coalesce: {
		min: 1,
		max: Number.POSITIVE_INFINITY
	},
	lower: {
		min: 1,
		max: 1
	},
	upper: {
		min: 1,
		max: 1
	}
};
function _peek$1(ctx) {
	return ctx.tokens[ctx.i];
}
function _consume$1(ctx) {
	return ctx.tokens[ctx.i++];
}
const CMP_OPS = new Set([
	"=",
	"!=",
	">",
	"<",
	">=",
	"<="
]);
function _parseExpr(ctx) {
	return _parseComparison(ctx);
}
function _parseComparison(ctx) {
	const left = _parseConcat(ctx);
	if (!left.ok) return left;
	const opTok = _peek$1(ctx);
	if (opTok.kind !== "OP" || !CMP_OPS.has(opTok.text)) return left;
	_consume$1(ctx);
	const op = opTok.text;
	const right = _parseConcat(ctx);
	if (!right.ok) return right;
	const next = _peek$1(ctx);
	if (next.kind === "OP" && CMP_OPS.has(next.text)) return err({
		message: "比較演算子は連鎖できません",
		position: next.pos,
		token: next.text
	});
	return ok({
		kind: "cmp",
		op,
		left: left.value,
		right: right.value
	});
}
function _parseConcat(ctx) {
	const first = _parseAdditive(ctx);
	if (!first.ok) return first;
	let left = first.value;
	while (_peek$1(ctx).kind === "AMP") {
		_consume$1(ctx);
		const right = _parseAdditive(ctx);
		if (!right.ok) return right;
		left = {
			kind: "concat",
			left,
			right: right.value
		};
	}
	return ok(left);
}
function _parseAdditive(ctx) {
	const first = _parseMultiplicative(ctx);
	if (!first.ok) return first;
	let left = first.value;
	while (_peek$1(ctx).kind === "PLUS" || _peek$1(ctx).kind === "MINUS") {
		const op = _consume$1(ctx).kind === "PLUS" ? "+" : "-";
		const right = _parseMultiplicative(ctx);
		if (!right.ok) return right;
		left = {
			kind: "bin",
			op,
			left,
			right: right.value
		};
	}
	return ok(left);
}
function _parseMultiplicative(ctx) {
	const first = _parseUnary$1(ctx);
	if (!first.ok) return first;
	let left = first.value;
	while (_peek$1(ctx).kind === "STAR" || _peek$1(ctx).kind === "SLASH") {
		const op = _consume$1(ctx).kind === "STAR" ? "*" : "/";
		const right = _parseUnary$1(ctx);
		if (!right.ok) return right;
		left = {
			kind: "bin",
			op,
			left,
			right: right.value
		};
	}
	return ok(left);
}
function _parseUnary$1(ctx) {
	if (_peek$1(ctx).kind === "MINUS") {
		_consume$1(ctx);
		const operand = _parseUnary$1(ctx);
		if (!operand.ok) return operand;
		return ok({
			kind: "neg",
			operand: operand.value
		});
	}
	return _parsePrimary$1(ctx);
}
function _parsePrimary$1(ctx) {
	const t = _peek$1(ctx);
	if (t.kind === "LPAREN") {
		_consume$1(ctx);
		const inner = _parseExpr(ctx);
		if (!inner.ok) return inner;
		const rp = _consume$1(ctx);
		if (rp.kind !== "RPAREN") return err({
			message: ") が必要",
			position: rp.pos,
			token: rp.text
		});
		return inner;
	}
	if (t.kind === "NUMBER") {
		_consume$1(ctx);
		const n = Number(t.text);
		if (!Number.isFinite(n)) return err({
			message: `不正な数値: ${t.text}`,
			position: t.pos,
			token: t.text
		});
		return ok({
			kind: "num",
			value: n
		});
	}
	if (t.kind === "IDENT" && ctx.tokens[ctx.i + 1]?.kind === "LPAREN") return _parseFuncCall(ctx);
	if (t.kind === "STRING") {
		_consume$1(ctx);
		return ok(ctx.columns.has(t.text) ? {
			kind: "col",
			name: t.text
		} : {
			kind: "str",
			value: t.text
		});
	}
	if (t.kind === "IDENT") {
		_consume$1(ctx);
		if (!ctx.columns.has(t.text)) return err({
			message: `未知の列: ${t.text}`,
			position: t.pos,
			token: t.text
		});
		return ok({
			kind: "col",
			name: t.text
		});
	}
	return err({
		message: "式が必要",
		position: t.pos,
		token: t.text
	});
}
function _parseFuncCall(ctx) {
	const nameTok = _consume$1(ctx);
	const name = nameTok.text.toLowerCase();
	const arity = FUNC_ARITY[name];
	if (arity === void 0) return err({
		message: `未知の関数: ${nameTok.text}`,
		position: nameTok.pos,
		token: nameTok.text
	});
	_consume$1(ctx);
	const args = [];
	if (_peek$1(ctx).kind !== "RPAREN") while (true) {
		const arg = _parseExpr(ctx);
		if (!arg.ok) return arg;
		args.push(arg.value);
		if (_peek$1(ctx).kind === "COMMA") {
			_consume$1(ctx);
			continue;
		}
		break;
	}
	const rp = _consume$1(ctx);
	if (rp.kind !== "RPAREN") return err({
		message: ") が必要",
		position: rp.pos,
		token: rp.text
	});
	if (args.length < arity.min || args.length > arity.max) return err({
		message: `${name} の引数は ${arity.max === Number.POSITIVE_INFINITY ? `${arity.min} 個以上` : arity.min === arity.max ? `${arity.min} 個` : `${arity.min}〜${arity.max} 個`} 必要 (実際 ${args.length} 個)`,
		position: nameTok.pos,
		token: nameTok.text
	});
	return ok({
		kind: "func",
		name,
		args
	});
}
function _inferType(node) {
	switch (node.kind) {
		case "num":
		case "neg":
		case "bin": return "number";
		case "str":
		case "concat": return "string";
		case "cmp": return "boolean";
		case "col": return;
		case "func":
			if (node.name === "if") {
				const t = _inferType(node.args[1]);
				const e = _inferType(node.args[2]);
				return t !== void 0 && t === e ? t : void 0;
			}
			if (node.name === "coalesce") {
				let acc;
				for (const a of node.args) {
					const t = _inferType(a);
					if (t === void 0) return void 0;
					if (acc === void 0) acc = t;
					else if (acc !== t) return void 0;
				}
				return acc;
			}
			if (node.name === "lower" || node.name === "upper") return "string";
			return "number";
	}
}
function _compileExpr(node, resolve) {
	switch (node.kind) {
		case "num": {
			const v = node.value;
			return () => v;
		}
		case "str": {
			const v = node.value;
			return () => v;
		}
		case "col": return resolve(node.name);
		case "neg": {
			const operand = _compileExpr(node.operand, resolve);
			return (row) => {
				const v = _coerceNumber(operand(row));
				return v === null ? null : -v;
			};
		}
		case "bin": {
			const left = _compileExpr(node.left, resolve);
			const right = _compileExpr(node.right, resolve);
			const op = node.op;
			return (row) => {
				const a = _coerceNumber(left(row));
				if (a === null) return null;
				const b = _coerceNumber(right(row));
				if (b === null) return null;
				switch (op) {
					case "+": return a + b;
					case "-": return a - b;
					case "*": return a * b;
					case "/": return b === 0 ? null : a / b;
				}
			};
		}
		case "concat": {
			const left = _compileExpr(node.left, resolve);
			const right = _compileExpr(node.right, resolve);
			return (row) => _coerceString(left(row)) + _coerceString(right(row));
		}
		case "cmp": {
			const left = _compileExpr(node.left, resolve);
			const right = _compileExpr(node.right, resolve);
			const op = node.op;
			return (row) => _compareValues(op, left(row), right(row));
		}
		case "func": {
			const args = node.args.map((a) => _compileExpr(a, resolve));
			return _compileFunc(node.name, args);
		}
	}
}
function _compileColumn(node, resolve) {
	const evalFn = _compileExpr(node, resolve);
	const type = _inferType(node);
	if (type !== void 0 && type !== "number") return {
		accessor: evalFn,
		type
	};
	const accessor = (row) => {
		const v = evalFn(row);
		return typeof v === "number" ? _cleanNumber(v) : v;
	};
	return {
		accessor,
		type
	};
}
function _compareValues(op, a, b) {
	const aNull = a === null || a === void 0;
	const bNull = b === null || b === void 0;
	const an = _coerceNumber(a);
	const bn = _coerceNumber(b);
	if (op === "=" || op === "!=") {
		let eq;
		if (aNull || bNull) eq = aNull && bNull;
		else if (an !== null && bn !== null) eq = _cleanNumber(an) === _cleanNumber(bn);
		else eq = String(a) === String(b);
		return op === "=" ? eq : !eq;
	}
	if (aNull || bNull) return false;
	let c;
	if (an !== null && bn !== null) {
		const ca = _cleanNumber(an);
		const cb = _cleanNumber(bn);
		c = ca < cb ? -1 : ca > cb ? 1 : 0;
	} else {
		const sa = String(a);
		const sb = String(b);
		c = sa < sb ? -1 : sa > sb ? 1 : 0;
	}
	switch (op) {
		case ">": return c > 0;
		case "<": return c < 0;
		case ">=": return c >= 0;
		case "<=": return c <= 0;
	}
}
function _truthy(v) {
	if (v === null || v === void 0) return false;
	if (typeof v === "boolean") return v;
	if (typeof v === "number") {
		const c = _cleanNumber(v);
		return c !== null && c !== 0;
	}
	return v !== "";
}
function _compileFunc(name, args) {
	switch (name) {
		case "if": {
			const cond = args[0];
			const thenFn = args[1];
			const elseFn = args[2];
			return (row) => _truthy(cond(row)) ? thenFn(row) : elseFn(row);
		}
		case "abs": {
			const a = args[0];
			return (row) => {
				const v = _coerceNumber(a(row));
				return v === null ? null : Math.abs(v);
			};
		}
		case "floor": {
			const a = args[0];
			return (row) => {
				const v = _coerceNumber(a(row));
				return v === null ? null : Math.floor(v);
			};
		}
		case "ceil": {
			const a = args[0];
			return (row) => {
				const v = _coerceNumber(a(row));
				return v === null ? null : Math.ceil(v);
			};
		}
		case "round": {
			const valueFn = args[0];
			const placesFn = args[1];
			return (row) => _round(valueFn(row), placesFn === void 0 ? 0 : placesFn(row));
		}
		case "min":
		case "max": {
			const isMin = name === "min";
			return (row) => {
				let acc = null;
				for (let k = 0; k < args.length; k++) {
					const v = _coerceNumber(args[k](row));
					if (v === null) continue;
					if (acc === null || (isMin ? v < acc : v > acc)) acc = v;
				}
				return acc;
			};
		}
		case "coalesce": return (row) => {
			for (let k = 0; k < args.length; k++) {
				const v = args[k](row);
				if (v !== null && v !== void 0) return v;
			}
			return null;
		};
		case "lower": {
			const a = args[0];
			return (row) => _coerceString(a(row)).toLowerCase();
		}
		case "upper": {
			const a = args[0];
			return (row) => _coerceString(a(row)).toUpperCase();
		}
	}
	throw new Error(`未知の関数: ${name}`);
}
function _round(value, placesVal) {
	const c = _coerceNumber(value);
	if (c === null) return null;
	const v = _cleanNumber(c);
	if (v === null) return null;
	const pc = _coerceNumber(placesVal);
	const factor = 10 ** (pc === null ? 0 : Math.trunc(pc));
	const scaled = _cleanNumber(v * factor);
	if (scaled === null) return null;
	return _cleanNumber(Math.sign(scaled) * Math.round(Math.abs(scaled)) / factor);
}
//#endregion
//#region src/_query-parser.ts
const CHART_TYPES = new Set([
	"bar",
	"line",
	"pie",
	"combo",
	"bubble"
]);
const AGG_FNS = new Set([
	"count",
	"countDistinct",
	"sum",
	"avg",
	"min",
	"max",
	"median",
	"p25",
	"p75",
	"p90",
	"p95",
	"p99",
	"stddev",
	"variance"
]);
const OP_MAP = {
	"=": "=",
	"!=": "!=",
	">": ">",
	"<": "<",
	">=": ">=",
	"<=": "<=",
	"~": "like",
	"~^": "startsWith",
	"~$": "endsWith",
	"~i": "like"
};
function _peek(ctx) {
	return ctx.tokens[ctx.i];
}
function _consume(ctx) {
	return ctx.tokens[ctx.i++];
}
function _eof(ctx) {
	return _peek(ctx).kind === "EOF";
}
function _canStartPrimary(t) {
	return t.kind === "IDENT" || t.kind === "STRING" || t.kind === "KW_NOT" || t.kind === "LPAREN";
}
function _tokenToValue(t) {
	if (t.kind === "NUMBER") {
		const n = _coerceNumber(t.text);
		return n === null ? t.text : n;
	}
	return t.text;
}
function _parseValue(ctx) {
	const t = _peek(ctx);
	if (t.kind === "STRING" || t.kind === "NUMBER" || t.kind === "IDENT") {
		_consume(ctx);
		return ok(_tokenToValue(t));
	}
	return err({
		message: "値が必要",
		position: t.pos,
		token: t.text
	});
}
function _parseLeafValue(ctx, opText) {
	const t = _peek(ctx);
	if (t.kind !== "STRING" && t.kind !== "NUMBER" && t.kind !== "IDENT") return err({
		message: "値が必要",
		position: t.pos,
		token: t.text
	});
	if (opText === ">" || opText === "<" || opText === ">=" || opText === "<=") {
		_consume(ctx);
		return ok(_tokenToValue(t));
	}
	if (t.kind === "STRING") {
		_consume(ctx);
		return ok(_tokenToValue(t));
	}
	const parts = [];
	const firstNumeric = t.kind === "NUMBER";
	while (true) {
		const cur = _peek(ctx);
		if (cur.kind !== "IDENT" && cur.kind !== "NUMBER" && cur.kind !== "STRING") break;
		if (parts.length > 0) {
			const ahead = ctx.tokens[ctx.i + 1];
			if (ahead && (ahead.kind === "OP" || ahead.kind === "KW_IS" || ahead.kind === "KW_IN")) break;
		}
		_consume(ctx);
		parts.push(cur.text);
	}
	if (parts.length === 1 && firstNumeric) {
		const n = _coerceNumber(parts[0]);
		return ok(n === null ? parts[0] : n);
	}
	return ok(parts.join(" "));
}
function _parseInList(ctx) {
	const lp = _consume(ctx);
	if (lp.kind !== "LPAREN") return err({
		message: "in の後には ( が必要",
		position: lp.pos,
		token: lp.text
	});
	const values = [];
	if (_peek(ctx).kind === "RPAREN") {
		_consume(ctx);
		return ok(values);
	}
	while (true) {
		const v = _parseValue(ctx);
		if (!v.ok) return v;
		values.push(v.value);
		const next = _peek(ctx);
		if (next.kind === "COMMA") {
			_consume(ctx);
			continue;
		}
		if (next.kind === "RPAREN") {
			_consume(ctx);
			return ok(values);
		}
		return err({
			message: "in リストには , か ) が必要",
			position: next.pos,
			token: next.text
		});
	}
}
function _parseLeaf(ctx) {
	const idTok = _consume(ctx);
	let columnId;
	if (idTok.kind === "IDENT" || idTok.kind === "STRING") columnId = idTok.text;
	else return err({
		message: "列名が必要",
		position: idTok.pos,
		token: idTok.text
	});
	if (!ctx.columns.has(columnId)) return err({
		message: `未知の列: ${columnId}`,
		position: idTok.pos,
		token: columnId
	});
	const opTok = _peek(ctx);
	if (opTok.kind === "KW_IS") {
		_consume(ctx);
		const next = _peek(ctx);
		if (next.kind === "KW_NOT") {
			_consume(ctx);
			const nul = _consume(ctx);
			if (nul.kind !== "KW_NULL") return err({
				message: "is not の後には null が必要",
				position: nul.pos,
				token: nul.text
			});
			return ok(f.leaf(columnId, "isNotNull"));
		}
		if (next.kind !== "KW_NULL") return err({
			message: "is の後には null か not null が必要",
			position: next.pos,
			token: next.text
		});
		_consume(ctx);
		return ok(f.leaf(columnId, "isNull"));
	}
	if (opTok.kind === "KW_IN") {
		_consume(ctx);
		const values = _parseInList(ctx);
		if (!values.ok) return values;
		return ok(f.leaf(columnId, "in", values.value));
	}
	if (opTok.kind !== "OP") return err({
		message: "演算子が必要",
		position: opTok.pos,
		token: opTok.text
	});
	_consume(ctx);
	const op = OP_MAP[opTok.text];
	if (op === void 0) return err({
		message: `不明な演算子: ${opTok.text}`,
		position: opTok.pos,
		token: opTok.text
	});
	const value = _parseLeafValue(ctx, opTok.text);
	if (!value.ok) return value;
	return ok(opTok.text === "~i" ? f.leaf(columnId, op, value.value, false) : f.leaf(columnId, op, value.value));
}
function _parsePrimary(ctx) {
	if (_peek(ctx).kind === "LPAREN") {
		_consume(ctx);
		const inner = _parseOr(ctx);
		if (!inner.ok) return inner;
		const rp = _consume(ctx);
		if (rp.kind !== "RPAREN") return err({
			message: ") が必要",
			position: rp.pos,
			token: rp.text
		});
		return inner;
	}
	return _parseLeaf(ctx);
}
function _parseUnary(ctx) {
	if (_peek(ctx).kind === "KW_NOT") {
		_consume(ctx);
		const inner = _parsePrimary(ctx);
		if (!inner.ok) return inner;
		return ok(f.not(inner.value));
	}
	return _parsePrimary(ctx);
}
function _parseAnd(ctx) {
	const first = _parseUnary(ctx);
	if (!first.ok) return first;
	const items = [first.value];
	while (true) {
		const t = _peek(ctx);
		if (t.kind === "KW_AND") _consume(ctx);
		else if (_canStartPrimary(t)) {} else break;
		const next = _parseUnary(ctx);
		if (!next.ok) return next;
		items.push(next.value);
	}
	return ok(items.length === 1 ? items[0] : f.and(...items));
}
function _parseOr(ctx) {
	const first = _parseAnd(ctx);
	if (!first.ok) return first;
	const items = [first.value];
	while (_peek(ctx).kind === "PIPE" || _peek(ctx).kind === "KW_OR") {
		_consume(ctx);
		const next = _parseAnd(ctx);
		if (!next.ok) return next;
		items.push(next.value);
	}
	return ok(items.length === 1 ? items[0] : f.or(...items));
}
function _parseChart(ctx) {
	const typeTok = _consume(ctx);
	if (typeTok.kind !== "IDENT") return err({
		message: "chart の後にはチャート種別が必要",
		position: typeTok.pos,
		token: typeTok.text
	});
	const type = typeTok.text.toLowerCase();
	if (!CHART_TYPES.has(type)) return err({
		message: `不明なチャート種別: ${typeTok.text} (有効: bar, line, pie, combo, bubble)`,
		position: typeTok.pos,
		token: typeTok.text
	});
	const byTok = _consume(ctx);
	if (byTok.kind !== "KW_BY") return err({
		message: "chart <type> の後には by が必要",
		position: byTok.pos,
		token: byTok.text
	});
	const groupTok = _consume(ctx);
	if (groupTok.kind !== "IDENT" && groupTok.kind !== "STRING") return err({
		message: "グループ列名が必要",
		position: groupTok.pos,
		token: groupTok.text
	});
	if (!ctx.columns.has(groupTok.text)) return err({
		message: `未知の列: ${groupTok.text}`,
		position: groupTok.pos,
		token: groupTok.text
	});
	const metrics = [];
	while (true) {
		if (_peek(ctx).kind !== "IDENT") break;
		const aggTok = _consume(ctx);
		const fn = aggTok.text.toLowerCase();
		if (!AGG_FNS.has(fn)) return err({
			message: `不明な集約関数: ${aggTok.text} (有効: count, sum, avg, min, max)`,
			position: aggTok.pos,
			token: aggTok.text
		});
		const colon = _consume(ctx);
		if (colon.kind !== "COLON") return err({
			message: "集約関数の後には : が必要",
			position: colon.pos,
			token: colon.text
		});
		const colTok = _consume(ctx);
		if (colTok.kind !== "IDENT" && colTok.kind !== "STRING") return err({
			message: "集約対象の列名が必要",
			position: colTok.pos,
			token: colTok.text
		});
		if (!ctx.columns.has(colTok.text)) return err({
			message: `未知の列: ${colTok.text}`,
			position: colTok.pos,
			token: colTok.text
		});
		metrics.push({
			fn,
			columnId: colTok.text
		});
	}
	if (metrics.length === 0) {
		const t = _peek(ctx);
		return err({
			message: "メトリクスが 1 個以上必要 (例 sum:salary)",
			position: t.pos,
			token: t.text
		});
	}
	if (type === "combo" && metrics.length !== 2) return err({
		message: `combo チャートは 2 メトリクス必要 (bar, line の順)。現在 ${metrics.length}`,
		position: typeTok.pos,
		token: typeTok.text
	});
	if (type === "bubble" && metrics.length !== 3) return err({
		message: `bubble チャートは 3 メトリクス必要 (x, y, r の順)。現在 ${metrics.length}`,
		position: typeTok.pos,
		token: typeTok.text
	});
	return ok({
		type,
		groupBy: groupTok.text,
		metrics: Object.freeze(metrics)
	});
}
function _parseLetClause(ctx, computed) {
	_consume(ctx);
	const nameTok = _consume(ctx);
	if (nameTok.kind !== "IDENT") return err({
		message: "let の後には定義名が必要",
		position: nameTok.pos,
		token: nameTok.text
	});
	const name = nameTok.text;
	if (ctx.columns.has(name)) return err({
		message: `名前が既に使われています: ${name}`,
		position: nameTok.pos,
		token: name
	});
	const eq = _consume(ctx);
	if (eq.kind !== "OP" || eq.text !== "=") return err({
		message: "定義名の後には = が必要",
		position: eq.pos,
		token: eq.text
	});
	const expr = _parseExpr(ctx);
	if (!expr.ok) return expr;
	ctx.columns.add(name);
	computed.push({
		name,
		expr: expr.value
	});
	return ok(void 0);
}
function _parseSortKey(ctx) {
	let dir = "asc";
	if (_peek(ctx).kind === "MINUS") {
		_consume(ctx);
		dir = "desc";
	}
	const t = _consume(ctx);
	if (t.kind !== "IDENT" && t.kind !== "STRING") return err({
		message: "ソート列名が必要",
		position: t.pos,
		token: t.text
	});
	if (!ctx.columns.has(t.text)) return err({
		message: `未知の列: ${t.text}`,
		position: t.pos,
		token: t.text
	});
	return ok({
		columnId: t.text,
		dir
	});
}
function _parse(tokens, columns) {
	const ctx = {
		tokens,
		i: 0,
		columns: new Set(columns.map((c) => c.id))
	};
	if (_eof(ctx)) return ok({
		predicate: null,
		sort: []
	});
	const computed = [];
	while (_peek(ctx).kind === "KW_LET") {
		const r = _parseLetClause(ctx, computed);
		if (!r.ok) return r;
		if (_peek(ctx).kind === "SEMI") _consume(ctx);
	}
	let predicate = null;
	if (!_eof(ctx) && _peek(ctx).kind !== "KW_BY" && _peek(ctx).kind !== "KW_CHART") {
		const p = _parseOr(ctx);
		if (!p.ok) return p;
		predicate = p.value;
	}
	const sort = [];
	if (_peek(ctx).kind === "KW_BY") {
		_consume(ctx);
		while (true) {
			const sk = _parseSortKey(ctx);
			if (!sk.ok) return sk;
			sort.push(sk.value);
			if (_peek(ctx).kind === "COMMA") {
				_consume(ctx);
				continue;
			}
			break;
		}
	}
	let chart;
	if (_peek(ctx).kind === "KW_CHART") {
		_consume(ctx);
		const c = _parseChart(ctx);
		if (!c.ok) return c;
		chart = c.value;
	}
	if (!_eof(ctx)) {
		const t = _peek(ctx);
		return err({
			message: "余分なトークン",
			position: t.pos,
			token: t.text
		});
	}
	return ok({
		predicate,
		sort: Object.freeze(sort),
		...computed.length > 0 ? { computed: Object.freeze(computed) } : {},
		...chart ? { chart } : {}
	});
}
//#endregion
//#region src/query.ts
function parseQuery(input, columns) {
	const lex = _tokenize(input);
	if (!lex.ok) return err({
		message: lex.error.message,
		position: lex.error.pos
	});
	return _parse(lex.tokens, columns);
}
const _DSL_KEYWORDS = new Set([
	"or",
	"and",
	"not",
	"by",
	"in",
	"is",
	"null",
	"chart"
]);
function _isBareIdent(s) {
	if (s.length === 0) return false;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (!(c >= 48 && c <= 57 || c >= 65 && c <= 90 || c >= 97 && c <= 122 || c === 95 || c > 127)) return false;
	}
	const first = s.charCodeAt(0);
	if (first >= 48 && first <= 57) return false;
	if (_DSL_KEYWORDS.has(s.toLowerCase())) return false;
	return true;
}
function _quoteString(s) {
	return `"${s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}
function _stringifyColumnId(id) {
	return _isBareIdent(id) ? id : _quoteString(id);
}
function _stringifyValue(v) {
	if (typeof v === "number") return Number.isFinite(v) ? String(v) : _quoteString(String(v));
	if (typeof v === "boolean") return _quoteString(String(v));
	if (v === null || v === void 0) return _quoteString("");
	return _quoteString(String(v));
}
function _stringifyLeaf(leaf) {
	const col = _stringifyColumnId(leaf.columnId);
	switch (leaf.op) {
		case "isNull": return `${col} is null`;
		case "isNotNull": return `${col} is not null`;
		case "in": return `${col} in(${(Array.isArray(leaf.value) ? leaf.value : leaf.value !== void 0 ? [leaf.value] : []).map((x) => _stringifyValue(x)).join(", ")})`;
		case "like": return `${col}${leaf.caseSensitive === false ? "~i" : "~"}${_stringifyValue(leaf.value)}`;
		case "startsWith": return `${col}~^${_stringifyValue(leaf.value)}`;
		case "endsWith": return `${col}~$${_stringifyValue(leaf.value)}`;
		default: return `${col}${leaf.op}${_stringifyValue(leaf.value)}`;
	}
}
function _stringifyPredicateRec(p, ctx) {
	if (p.kind === "leaf") return _stringifyLeaf(p);
	const negate = p.negate === true;
	if (p.children.length === 1 && !negate) return _stringifyPredicateRec(p.children[0], ctx);
	if (p.children.length === 0) return "";
	const sep = p.combinator === "and" ? " " : " | ";
	const innerCtx = p.combinator === "and" ? "and" : "or";
	const inner = p.children.map((c) => _stringifyPredicateRec(c, innerCtx)).join(sep);
	if (negate) return `not (${inner})`;
	if (ctx === "and" && p.combinator === "or") return `(${inner})`;
	return inner;
}
function stringifyPredicate(p) {
	if (p === null) return "";
	return _stringifyPredicateRec(p, "top");
}
function _exprPrec(node) {
	if (node.kind === "cmp") return 0;
	if (node.kind === "concat") return 1;
	if (node.kind !== "bin") return 4;
	return node.op === "*" || node.op === "/" ? 3 : 2;
}
function _stringifyExprChild(child, parentPrec, isRight) {
	const s = _stringifyExpr(child);
	const cp = _exprPrec(child);
	const sameAssoc = child.kind === "bin" || child.kind === "concat";
	return cp < parentPrec || cp === parentPrec && isRight && sameAssoc ? `(${s})` : s;
}
function _stringifyExpr(node) {
	switch (node.kind) {
		case "num": return String(node.value);
		case "str": return _quoteString(node.value);
		case "col": return _stringifyColumnId(node.name);
		case "neg": return node.operand.kind === "bin" || node.operand.kind === "cmp" ? `-(${_stringifyExpr(node.operand)})` : `-${_stringifyExpr(node.operand)}`;
		case "bin": {
			const prec = _exprPrec(node);
			const left = _stringifyExprChild(node.left, prec, false);
			const right = _stringifyExprChild(node.right, prec, true);
			return `${left} ${node.op} ${right}`;
		}
		case "concat": {
			const prec = _exprPrec(node);
			return `${_stringifyExprChild(node.left, prec, false)} & ${_stringifyExprChild(node.right, prec, true)}`;
		}
		case "cmp": {
			const wrap = (c) => c.kind === "cmp" ? `(${_stringifyExpr(c)})` : _stringifyExpr(c);
			return `${wrap(node.left)} ${node.op} ${wrap(node.right)}`;
		}
		case "func": return `${node.name}(${node.args.map((a) => _stringifyExpr(a)).join(", ")})`;
	}
}
function stringifySort(sort) {
	if (sort.length === 0) return "";
	return `by ${sort.map((k) => {
		const col = _stringifyColumnId(k.columnId);
		return k.dir === "desc" ? `-${col}` : col;
	}).join(", ")}`;
}
function stringifyQuery(input) {
	const parts = [];
	for (const c of input.computed ?? []) parts.push(`let ${c.name} = ${_stringifyExpr(c.expr)};`);
	const p = stringifyPredicate(input.predicate ?? null);
	if (p) parts.push(p);
	const s = stringifySort(input.sort ?? []);
	if (s) parts.push(s);
	return parts.join(" ");
}
//#endregion
export { stringifySort as a, stringifyQuery as i, parseQuery as n, _compileColumn as o, stringifyPredicate as r, _stringifyExpr as t };

//# sourceMappingURL=query-DAwNhlv_.js.map