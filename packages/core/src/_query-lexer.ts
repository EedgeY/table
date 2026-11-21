export type TokenKind =
	| 'IDENT'
	| 'STRING'
	| 'NUMBER'
	| 'OP'
	| 'LPAREN'
	| 'RPAREN'
	| 'COMMA'
	| 'COLON'
	| 'PIPE'
	| 'MINUS'
	| 'PLUS'
	| 'STAR'
	| 'SLASH'
	| 'AMP'
	| 'SEMI'
	| 'KW_LET'
	| 'KW_OR'
	| 'KW_AND'
	| 'KW_NOT'
	| 'KW_BY'
	| 'KW_IN'
	| 'KW_IS'
	| 'KW_NULL'
	| 'KW_CHART'
	| 'EOF';

export type Token = {
	readonly kind: TokenKind;
	readonly text: string;
	readonly pos: number;
};

const OPERATORS: readonly string[] = [
	'>=',
	'<=',
	'!=',
	'~^',
	'~$',
	'~i',
	'=',
	'>',
	'<',
	'~',
] as const;

const KEYWORDS: Readonly<Record<string, TokenKind>> = {
	let: 'KW_LET',
	or: 'KW_OR',
	and: 'KW_AND',
	not: 'KW_NOT',
	by: 'KW_BY',
	in: 'KW_IN',
	is: 'KW_IS',
	null: 'KW_NULL',
	chart: 'KW_CHART',
};

export type LexError = {
	readonly message: string;
	readonly pos: number;
};

export type LexResult =
	| { readonly ok: true; readonly tokens: ReadonlyArray<Token> }
	| { readonly ok: false; readonly error: LexError };

export function _tokenize(input: string): LexResult {
	const tokens: Token[] = [];
	let i = 0;
	const n = input.length;

	while (i < n) {
		const ch = input[i]!;

		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			i++;
			continue;
		}

		if (ch === '(') {
			tokens.push({ kind: 'LPAREN', text: '(', pos: i });
			i++;
			continue;
		}
		if (ch === ')') {
			tokens.push({ kind: 'RPAREN', text: ')', pos: i });
			i++;
			continue;
		}
		if (ch === ',') {
			tokens.push({ kind: 'COMMA', text: ',', pos: i });
			i++;
			continue;
		}
		if (ch === ':') {
			tokens.push({ kind: 'COLON', text: ':', pos: i });
			i++;
			continue;
		}
		if (ch === '|') {
			tokens.push({ kind: 'PIPE', text: '|', pos: i });
			i++;
			continue;
		}
		if (ch === '+') {
			tokens.push({ kind: 'PLUS', text: '+', pos: i });
			i++;
			continue;
		}
		if (ch === '*') {
			tokens.push({ kind: 'STAR', text: '*', pos: i });
			i++;
			continue;
		}
		if (ch === '/') {
			tokens.push({ kind: 'SLASH', text: '/', pos: i });
			i++;
			continue;
		}
		if (ch === '&') {
			tokens.push({ kind: 'AMP', text: '&', pos: i });
			i++;
			continue;
		}
		if (ch === ';') {
			tokens.push({ kind: 'SEMI', text: ';', pos: i });
			i++;
			continue;
		}

		if (ch === '-') {
			tokens.push({ kind: 'MINUS', text: '-', pos: i });
			i++;
			continue;
		}

		if (ch === '"') {
			const start = i;
			i++;
			let str = '';
			while (i < n) {
				const c = input[i]!;
				if (c === '\\' && i + 1 < n && input[i + 1] === '"') {
					str += '"';
					i += 2;
					continue;
				}
				if (c === '"') {
					tokens.push({ kind: 'STRING', text: str, pos: start });
					i++;
					break;
				}
				str += c;
				i++;
			}
			if (i > n || (i === n && input[i - 1] !== '"')) {
				return { ok: false, error: { message: 'クオート文字列が閉じていない', pos: start } };
			}
			continue;
		}

		let matched: string | null = null;
		for (const op of OPERATORS) {
			if (input.startsWith(op, i)) {
				matched = op;
				break;
			}
		}
		if (matched !== null) {
			tokens.push({ kind: 'OP', text: matched, pos: i });
			i += matched.length;
			continue;
		}

		if ((ch >= '0' && ch <= '9') || ch === '.') {
			const start = i;
			while (i < n) {
				const c = input[i]!;
				if (
					(c >= '0' && c <= '9') ||
					c === '.' ||
					c === 'e' ||
					c === 'E' ||
					c === '+' ||
					c === '-'
				) {
					if ((c === '+' || c === '-') && i > start) {
						const prev = input[i - 1]!;
						if (prev !== 'e' && prev !== 'E') {
							break;
						}
					}
					i++;
					continue;
				}
				break;
			}
			tokens.push({ kind: 'NUMBER', text: input.slice(start, i), pos: start });
			continue;
		}

		const isIdentChar = (c: string): boolean => {
			if (c >= 'a' && c <= 'z') return true;
			if (c >= 'A' && c <= 'Z') return true;
			if (c >= '0' && c <= '9') return true;
			if (c === '_') return true;
			return c.charCodeAt(0) > 127;
		};
		if (isIdentChar(ch)) {
			const start = i;
			while (i < n && isIdentChar(input[i]!)) {
				i++;
			}
			const text = input.slice(start, i);
			const lower = text.toLowerCase();
			const kwKind = KEYWORDS[lower];
			tokens.push({
				kind: kwKind ?? 'IDENT',
				text,
				pos: start,
			});
			continue;
		}

		return { ok: false, error: { message: `予期しない文字 '${ch}'`, pos: i } };
	}

	tokens.push({ kind: 'EOF', text: '', pos: n });
	return { ok: true, tokens };
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('_tokenize', () => {
		it('プレーンな leaf', () => {
			const r = _tokenize('name=Tanaka');
			if (!r.ok) throw new Error('lex failed');
			expect(r.tokens.map((t) => t.kind)).toEqual(['IDENT', 'OP', 'IDENT', 'EOF']);
			expect(r.tokens.map((t) => t.text)).toEqual(['name', '=', 'Tanaka', '']);
		});

		it('演算子の最長一致 (>= が > より優先)', () => {
			const r = _tokenize('a>=1');
			if (!r.ok) throw new Error('lex failed');
			expect(r.tokens[1]!.text).toBe('>=');
		});

		it('クオート文字列とエスケープ', () => {
			const r = _tokenize('name="田中 \\"太郎\\""');
			if (!r.ok) throw new Error('lex failed');
			expect(r.tokens[2]!.kind).toBe('STRING');
			expect(r.tokens[2]!.text).toBe('田中 "太郎"');
		});

		it('数値', () => {
			const r = _tokenize('x=3.14');
			if (!r.ok) throw new Error('lex failed');
			expect(r.tokens[2]!.kind).toBe('NUMBER');
			expect(r.tokens[2]!.text).toBe('3.14');
		});

		it('キーワード認識', () => {
			const r = _tokenize('a=1 OR b=2 BY -c');
			if (!r.ok) throw new Error('lex failed');
			const kinds = r.tokens.map((t) => t.kind);
			expect(kinds).toContain('KW_OR');
			expect(kinds).toContain('KW_BY');
			expect(kinds).toContain('MINUS');
		});

		it('パイプ |', () => {
			const r = _tokenize('a=1|b=2');
			if (!r.ok) throw new Error('lex failed');
			expect(r.tokens.map((t) => t.kind)).toContain('PIPE');
		});

		it('未閉じクオートはエラー', () => {
			const r = _tokenize('name="abc');
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.error.pos).toBe(5);
			}
		});

		it('日本語識別子', () => {
			const r = _tokenize('"列 名"=x');
			if (!r.ok) throw new Error('lex failed');
			expect(r.tokens[0]!.text).toBe('列 名');
			expect(r.tokens[0]!.kind).toBe('STRING');
		});

		it('IN リスト', () => {
			const r = _tokenize('x in(1,2,3)');
			if (!r.ok) throw new Error('lex failed');
			expect(r.tokens.map((t) => t.kind)).toEqual([
				'IDENT',
				'KW_IN',
				'LPAREN',
				'NUMBER',
				'COMMA',
				'NUMBER',
				'COMMA',
				'NUMBER',
				'RPAREN',
				'EOF',
			]);
		});

		it('演算子 ~i (case-insensitive like)', () => {
			const r = _tokenize('name~i"abc"');
			if (!r.ok) throw new Error('lex failed');
			expect(r.tokens[1]!.text).toBe('~i');
		});

		it('let 句のトークン (KW_LET / STAR / SEMI)', () => {
			const r = _tokenize('let total = amount * quantity ;');
			if (!r.ok) throw new Error('lex failed');
			expect(r.tokens.map((t) => t.kind)).toEqual([
				'KW_LET',
				'IDENT',
				'OP',
				'IDENT',
				'STAR',
				'IDENT',
				'SEMI',
				'EOF',
			]);
		});

		it('文字列連結 & を AMP トークン化', () => {
			const r = _tokenize('first & last');
			if (!r.ok) throw new Error('lex failed');
			expect(r.tokens.map((t) => t.kind)).toEqual(['IDENT', 'AMP', 'IDENT', 'EOF']);
		});

		it('算術演算子 + / を単独トークン化', () => {
			const r = _tokenize('a+b/c');
			if (!r.ok) throw new Error('lex failed');
			expect(r.tokens.map((t) => t.kind)).toEqual([
				'IDENT',
				'PLUS',
				'IDENT',
				'SLASH',
				'IDENT',
				'EOF',
			]);
		});

		it('chart キーワードとコロン', () => {
			const r = _tokenize('chart bar by dept sum:salary');
			if (!r.ok) throw new Error('lex failed');
			const kinds = r.tokens.map((t) => t.kind);
			expect(kinds).toEqual([
				'KW_CHART',
				'IDENT',
				'KW_BY',
				'IDENT',
				'IDENT',
				'COLON',
				'IDENT',
				'EOF',
			]);
		});
	});
}
