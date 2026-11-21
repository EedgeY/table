import type { ColumnDef } from '@tarbo-table/core';

export type SuggestionCategory =
	| 'column'
	| 'operator'
	| 'connective'
	| 'sort'
	| 'chart-type'
	| 'chart-keyword'
	| 'aggregate-fn'
	| 'computed-keyword'
	| 'function'
	| 'value'
	| 'template';

export type Suggestion = {
	readonly label: string;
	readonly secondaryLabel?: string;
	readonly insertText: string;
	readonly category: SuggestionCategory;
	readonly group?: string;
	readonly hint?: string;
	readonly cursorOffset?: number;
	readonly description?: string;
};

/**
 * Consumer が `CommandLineInput.templates` に渡すクエリ雛形。
 * 空入力時にテンプレートセクションとして提示される。
 */
export type QueryTemplate = {
	/** ポップオーバーに表示するラベル (人間向け)。 */
	readonly label: string;
	/** 入力欄に挿入される文字列。 */
	readonly insertText: string;
	/** 右端の補助テキスト (例: '棒グラフ')。 */
	readonly hint?: string;
	/** title 属性に出る詳細説明 (任意)。 */
	readonly description?: string;
};

export type GetCompletionsOptions = {
	readonly enableChart?: boolean;
	readonly templates?: ReadonlyArray<QueryTemplate>;
};

export const CHART_TYPES = ['bar', 'line', 'pie', 'combo', 'bubble'] as const;
export const AGG_FNS = [
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
] as const;
export const COMPUTED_FNS = [
	{ name: 'if', desc: 'IF(cond, then, else)' },
	{ name: 'round', desc: 'round(value [, places])' },
	{ name: 'abs', desc: '絶対値' },
	{ name: 'floor', desc: '切り捨て' },
	{ name: 'ceil', desc: '切り上げ' },
	{ name: 'min', desc: '最小 (可変長)' },
	{ name: 'max', desc: '最大 (可変長)' },
	{ name: 'coalesce', desc: '最初の非 null 値' },
	{ name: 'lower', desc: '小文字化' },
	{ name: 'upper', desc: '大文字化' },
] as const;

export const OPERATORS = [
	{ op: '=', label: '等しい', group: '比較' },
	{ op: '!=', label: '等しくない', group: '比較' },
	{ op: '>', label: 'より大きい', group: '比較' },
	{ op: '<', label: 'より小さい', group: '比較' },
	{ op: '>=', label: '以上', group: '比較' },
	{ op: '<=', label: '以下', group: '比較' },
	{ op: '~', label: '含む', group: 'パターン' },
	{ op: '~i', label: '含む (大小無視)', group: 'パターン' },
	{ op: '~^', label: 'で始まる', group: 'パターン' },
	{ op: '~$', label: 'で終わる', group: 'パターン' },
] as const;

const AGG_GROUPS: Readonly<Record<(typeof AGG_FNS)[number], '集約' | '分位数' | '統計'>> = {
	count: '集約',
	countDistinct: '集約',
	sum: '集約',
	avg: '集約',
	min: '集約',
	max: '集約',
	median: '分位数',
	p25: '分位数',
	p75: '分位数',
	p90: '分位数',
	p95: '分位数',
	p99: '分位数',
	stddev: '統計',
	variance: '統計',
};
export const CONNECTIVES = [
	{ kw: 'and', desc: 'AND (省略可)' },
	{ kw: 'or', desc: 'OR' },
	{ kw: '|', desc: 'OR (短縮)' },
	{ kw: 'not', desc: 'NOT' },
] as const;

function _tokenize(s: string): string[] {
	const OPS = ['>=', '<=', '!=', '~^', '~$', '~i', '=', '>', '<', '~'] as const;
	const out: string[] = [];
	let cur = '';
	let inQ = false;
	const flush = (): void => {
		if (cur) out.push(cur);
		cur = '';
	};
	for (let i = 0; i < s.length; i++) {
		const ch = s[i]!;
		if (ch === '"') {
			cur += ch;
			inQ = !inQ;
			continue;
		}
		if (inQ) {
			cur += ch;
			continue;
		}
		if (/\s/.test(ch)) {
			flush();
			continue;
		}
		let matched: string | null = null;
		for (const op of OPS) {
			if (s.startsWith(op, i)) {
				matched = op;
				break;
			}
		}
		if (matched !== null) {
			flush();
			out.push(matched);
			i += matched.length - 1;
			continue;
		}
		cur += ch;
	}
	if (cur) out.push(cur);
	return out;
}

function _splitPrefix(input: string): { committed: string[]; prefix: string } {
	const endsSpace = /\s$/.test(input) || input === '';
	const tokens = _tokenize(input);
	if (endsSpace) {
		return { committed: tokens, prefix: '' };
	}
	const prefix = tokens.pop() ?? '';
	return { committed: tokens, prefix };
}

function _lastChartIndex(tokens: ReadonlyArray<string>): number {
	for (let i = tokens.length - 1; i >= 0; i--) {
		if (tokens[i]!.toLowerCase() === 'chart') return i;
	}
	return -1;
}

function _hasSortBy(tokens: ReadonlyArray<string>): boolean {
	const chartIdx = _lastChartIndex(tokens);
	for (let i = 0; i < tokens.length; i++) {
		if (chartIdx >= 0 && i > chartIdx) break;
		if (tokens[i]!.toLowerCase() === 'by') return true;
	}
	return false;
}

const OPERATOR_CHARS = new Set(['=', '!', '<', '>', '~']);
function _isOperatorOnly(s: string): boolean {
	if (s.length === 0) return false;
	for (const c of s) if (!OPERATOR_CHARS.has(c)) return false;
	return true;
}

function _isColumnLike<TRow>(s: string, columns: ReadonlyArray<ColumnDef<TRow>>): boolean {
	return columns.some((c) => c.id === s);
}

type ChartPhase = 'type' | 'by' | 'group-col' | 'metric-fn' | 'metric-col' | 'done';
function _chartPhase(tokensAfterChart: ReadonlyArray<string>): ChartPhase {
	if (tokensAfterChart.length === 0) return 'type';
	if (tokensAfterChart.length === 1) return 'by';
	if (tokensAfterChart.length === 2) return 'group-col';
	const last = tokensAfterChart[tokensAfterChart.length - 1]!;
	if (last.includes(':')) {
		const [, after] = last.split(':');
		if (after === undefined || after === '') return 'metric-col';
		return 'done';
	}
	return 'metric-fn';
}

function _splitClauses(before: string): { committedClauses: string[]; currentClause: string } {
	const clauses: string[] = [];
	let cur = '';
	let inQ = false;
	for (let i = 0; i < before.length; i++) {
		const ch = before[i]!;
		if (inQ && ch === '\\' && before[i + 1] === '"') {
			cur += '\\"';
			i++;
			continue;
		}
		if (ch === '"') {
			inQ = !inQ;
			cur += ch;
			continue;
		}
		if (ch === ';' && !inQ) {
			clauses.push(cur);
			cur = '';
			continue;
		}
		cur += ch;
	}
	return { committedClauses: clauses, currentClause: cur };
}

function _committedLetNames(before: string): string[] {
	const { committedClauses } = _splitClauses(before);
	const names: string[] = [];
	for (const clause of committedClauses) {
		const m = /^\s*let\s+([A-Za-z_$][\w$]*)\s*=/i.exec(clause);
		if (m?.[1] !== undefined) names.push(m[1]);
	}
	return names;
}

function _isInLetExpr(currentClause: string): boolean {
	return /^\s*let\s+[A-Za-z_$][\w$]*\s*=/i.test(currentClause);
}

function _isClauseStart(currentClause: string, prefix: string): boolean {
	return currentClause.trimStart() === prefix;
}

function _withLetColumns<TRow>(
	columns: ReadonlyArray<ColumnDef<TRow>>,
	letNames: ReadonlyArray<string>,
): ReadonlyArray<ColumnDef<TRow>> {
	if (letNames.length === 0) return columns;
	const existing = new Set(columns.map((c) => c.id));
	const extra: ColumnDef<TRow>[] = [];
	for (const name of letNames) {
		if (existing.has(name)) continue;
		existing.add(name);
		extra.push({ id: name, accessor: () => null, type: 'number', header: name });
	}
	return extra.length > 0 ? [...columns, ...extra] : columns;
}

export type CompletionContext = {
	readonly suggestions: ReadonlyArray<Suggestion>;
	readonly hint: string;
	readonly phase:
		| 'empty'
		| 'column'
		| 'operator'
		| 'value'
		| 'connective'
		| 'chart'
		| 'sort'
		| 'computed';
};

export function getCompletions<TRow>(
	input: string,
	cursor: number,
	columns: ReadonlyArray<ColumnDef<TRow>>,
	options?: GetCompletionsOptions,
): CompletionContext {
	const enableChart = options?.enableChart ?? false;
	const templates = options?.templates;

	const before = input.slice(0, cursor);
	const { currentClause } = _splitClauses(before);
	const { committed, prefix } = _splitPrefix(currentClause);

	if (_isInLetExpr(currentClause)) {
		const exprPrefix = /[A-Za-z_$][\w$]*$/.exec(prefix)?.[0] ?? '';
		const matchLc = exprPrefix.toLowerCase();
		const fnSuggestions = COMPUTED_FNS.filter((f) => f.name.startsWith(matchLc)).map<Suggestion>(
			(f) => ({
				label: f.name,
				insertText: `${f.name}(`,
				category: 'function',
				group: '関数',
				hint: f.desc,
				description: f.desc,
			}),
		);
		const exprColumns = _withLetColumns(columns, _committedLetNames(before));
		const colSuggestions = exprColumns
			.filter((c) => c.id.toLowerCase().startsWith(matchLc) || c.header?.startsWith(exprPrefix))
			.map<Suggestion>((c) => ({
				label: c.header ?? c.id,
				secondaryLabel: c.header && c.header !== c.id ? c.id : undefined,
				insertText: c.id,
				category: 'column',
				group: '列参照',
				hint: c.type === 'number' ? 'number' : 'text',
			}));
		return {
			phase: 'computed',
			hint: '計算式: 関数 (round / if / min …) や列を参照できます',
			suggestions: [...fnSuggestions, ...colSuggestions],
		};
	}

	const columnsWithLet = _withLetColumns(columns, _committedLetNames(before));

	const chartIdx = _lastChartIndex(committed);
	const inChart = enableChart && chartIdx >= 0;

	if (inChart) {
		const after = committed.slice(chartIdx + 1);
		let phase = _chartPhase(after);
		if (prefix.includes(':')) {
			const [fn, col] = prefix.split(':');
			if (col !== undefined && col === '') {
				phase = 'metric-col';
			} else if (fn !== undefined && col !== undefined && col.length > 0) {
				phase = 'metric-col';
			}
		}

		if (phase === 'type') {
			return {
				phase: 'chart',
				hint: 'チャートの種類を選択',
				suggestions: CHART_TYPES.filter((t) => t.startsWith(prefix.toLowerCase())).map((t) => ({
					label: t,
					insertText: `${t} `,
					category: 'chart-type' as const,
					hint: _chartTypeDescription(t),
					description: _chartTypeDescription(t),
				})),
			};
		}
		if (phase === 'by') {
			return {
				phase: 'chart',
				hint: 'グルーピング列を指定するため "by" を入れる',
				suggestions: [
					{
						label: 'by',
						insertText: 'by ',
						category: 'chart-keyword',
						description: 'グループ列を指定するキーワード',
					},
				],
			};
		}
		if (phase === 'group-col') {
			return {
				phase: 'chart',
				hint: '集計の基準となる列 (カテゴリ軸) を選択',
				suggestions: columns
					.filter(
						(c) =>
							c.id.toLowerCase().startsWith(prefix.toLowerCase()) || c.header?.startsWith(prefix),
					)
					.map((c) => ({
						label: c.header ?? c.id,
						secondaryLabel: c.header && c.header !== c.id ? c.id : undefined,
						insertText: `${c.id} `,
						category: 'column' as const,
						hint: c.type === 'number' ? 'number' : 'text',
					})),
			};
		}
		if (phase === 'metric-fn') {
			return {
				phase: 'chart',
				hint: '集計関数 (例: sum / avg / median)。列名は ":" の後に指定',
				suggestions: AGG_FNS.filter((fn) => fn.startsWith(prefix.toLowerCase())).map((fn) => ({
					label: fn,
					insertText: `${fn}:`,
					category: 'aggregate-fn' as const,
					group: AGG_GROUPS[fn],
					hint: _aggDescription(fn),
				})),
			};
		}
		if (phase === 'metric-col') {
			const fn = prefix.split(':')[0] ?? '';
			const colPrefix = prefix.split(':')[1] ?? '';
			return {
				phase: 'chart',
				hint: `${fn} を適用する列を選択`,
				suggestions: columns
					.filter(
						(c) =>
							c.id.toLowerCase().startsWith(colPrefix.toLowerCase()) ||
							c.header?.startsWith(colPrefix),
					)
					.map((c) => ({
						label: c.header ?? c.id,
						secondaryLabel: c.header && c.header !== c.id ? c.id : undefined,
						insertText: `${fn}:${c.id} `,
						category: 'column' as const,
						hint: c.type === 'number' ? 'number' : 'text',
					})),
			};
		}
		return {
			phase: 'chart',
			hint: 'メトリクスを追加できます (例: count:id)。終了して OK',
			suggestions: AGG_FNS.map((fn) => ({
				label: `+ ${fn}`,
				insertText: `${fn}:`,
				category: 'aggregate-fn' as const,
				group: AGG_GROUPS[fn],
				hint: _aggDescription(fn),
			})),
		};
	}

	const last = committed[committed.length - 1] ?? '';
	const lastLc = last.toLowerCase();

	if (
		lastLc === 'by' ||
		(committed.length >= 2 && committed[committed.length - 2] === ',' && _hasSortBy(committed))
	) {
		return {
			phase: 'sort',
			hint: 'ソート列を選択 (-プレフィックスで降順)',
			suggestions: [
				...columnsWithLet
					.filter(
						(c) =>
							c.id.toLowerCase().startsWith(prefix.toLowerCase()) || c.header?.startsWith(prefix),
					)
					.map((c) => ({
						label: c.header ?? c.id,
						secondaryLabel: c.header && c.header !== c.id ? c.id : undefined,
						insertText: `${c.id}`,
						category: 'column' as const,
						group: '昇順 (asc)',
						hint: '↑',
					})),
				...columnsWithLet
					.filter(
						(c) =>
							c.id.toLowerCase().startsWith(prefix.replace(/^-?/, '').toLowerCase()) ||
							c.header?.startsWith(prefix.replace(/^-?/, '')),
					)
					.map((c) => ({
						label: `−${c.header ?? c.id}`,
						secondaryLabel: c.header && c.header !== c.id ? c.id : undefined,
						insertText: `-${c.id}`,
						category: 'column' as const,
						group: '降順 (desc)',
						hint: '↓',
					})),
			],
		};
	}

	if (_isOperatorOnly(prefix) && committed.length > 0 && _isColumnLike(last, columnsWithLet)) {
		return {
			phase: 'value',
			hint: '値を入力 (文字列は "..." でクオート)',
			suggestions: [],
		};
	}

	if (_isColumnLike(last, columnsWithLet) && prefix === '') {
		return {
			phase: 'operator',
			hint: `${last} に対する条件演算子を選択`,
			suggestions: OPERATORS.map((o) => ({
				label: o.label,
				insertText: o.op,
				category: 'operator' as const,
				group: o.group,
				hint: o.op,
				description: o.label,
			})),
		};
	}

	if (_isOperatorOnly(last)) {
		return {
			phase: 'value',
			hint: '値を入力 (文字列は "..." でクオート)',
			suggestions: [],
		};
	}

	const looksLikeFilterCompleted =
		committed.length >= 3 &&
		_isColumnLike(committed[committed.length - 3]!, columnsWithLet) &&
		_isOperatorOnly(committed[committed.length - 2]!);
	if (looksLikeFilterCompleted && prefix === '') {
		const suggestions: Suggestion[] = [];
		for (const c of CONNECTIVES) {
			suggestions.push({
				label: c.kw,
				insertText: `${c.kw} `,
				category: 'connective',
				group: '接続',
				hint: c.desc,
			});
		}
		if (!_hasSortBy(committed)) {
			suggestions.push({
				label: 'by',
				insertText: 'by ',
				category: 'sort',
				group: 'ソート',
				hint: 'ソート列を指定',
			});
		}
		if (enableChart && chartIdx < 0) {
			suggestions.push({
				label: 'chart',
				insertText: 'chart ',
				category: 'chart-keyword',
				group: 'チャート',
				hint: 'グラフを描画',
			});
		}
		for (const c of columnsWithLet) {
			suggestions.push({
				label: c.header ?? c.id,
				secondaryLabel: c.header && c.header !== c.id ? c.id : undefined,
				insertText: `${c.id}`,
				category: 'column',
				group: '別の列で AND',
				hint: c.type === 'number' ? 'number' : 'text',
			});
		}
		return { phase: 'connective', hint: '条件を追加・接続するキーワードを選択', suggestions };
	}

	const matchPrefix = prefix.toLowerCase();
	const colSuggestions = columnsWithLet
		.filter((c) => c.id.toLowerCase().startsWith(matchPrefix) || c.header?.startsWith(prefix))
		.map<Suggestion>((c) => ({
			label: c.header ?? c.id,
			secondaryLabel: c.header && c.header !== c.id ? c.id : undefined,
			insertText: c.id,
			category: 'column',
			group: '列で絞り込み',
			hint: c.type === 'number' ? 'number' : 'text',
		}));

	const keywords: Suggestion[] = [];
	if ('let'.startsWith(matchPrefix) && _isClauseStart(currentClause, prefix)) {
		keywords.push({
			label: 'let',
			insertText: 'let ',
			category: 'computed-keyword',
			group: 'キーワード',
			hint: '計算列を定義',
			description: 'let <名前> = <式>; で計算列を定義',
		});
	}
	if (enableChart && 'chart'.startsWith(matchPrefix)) {
		keywords.push({
			label: 'chart',
			insertText: 'chart ',
			category: 'chart-keyword',
			group: 'キーワード',
			hint: 'グラフを描画',
		});
	}
	if ('by'.startsWith(matchPrefix) && committed.length > 0 && !_hasSortBy(committed)) {
		keywords.push({
			label: 'by',
			insertText: 'by ',
			category: 'sort',
			group: 'キーワード',
			hint: 'ソートを追加',
		});
	}
	const templateSuggestions: Suggestion[] = [];
	if (matchPrefix === '' && committed.length === 0 && templates && templates.length > 0) {
		for (const t of templates) {
			templateSuggestions.push({
				label: t.label,
				insertText: t.insertText,
				category: 'template',
				group: 'テンプレート',
				hint: t.hint,
				description: t.description,
			});
		}
	}

	const hasChartKeyword = enableChart;
	return {
		phase: prefix === '' && committed.length === 0 ? 'empty' : 'column',
		hint:
			committed.length === 0
				? hasChartKeyword
					? '列名で絞り込み、または「chart」「by」キーワードを使えます'
					: '列名で絞り込み、または「by」キーワードでソートを追加できます'
				: hasChartKeyword
					? '列名 / 接続子 / ソート / チャートを追加できます'
					: '列名 / 接続子 / ソートを追加できます',
		suggestions: [...colSuggestions, ...keywords, ...templateSuggestions],
	};
}

function _chartTypeDescription(t: (typeof CHART_TYPES)[number]): string {
	switch (t) {
		case 'bar':
			return '棒グラフ (カテゴリ別の集計値)';
		case 'line':
			return '折れ線 (時系列など)';
		case 'pie':
			return '円グラフ (構成比)';
		case 'combo':
			return '複合 (棒 + 線, 2 メトリクス必須)';
		case 'bubble':
			return 'バブル (x/y/r の 3 メトリクス必須)';
	}
}

function _aggDescription(fn: (typeof AGG_FNS)[number]): string {
	switch (fn) {
		case 'count':
			return '行数 (非 null)';
		case 'countDistinct':
			return 'ユニーク値の数';
		case 'sum':
			return '合計';
		case 'avg':
			return '平均';
		case 'min':
			return '最小';
		case 'max':
			return '最大';
		case 'median':
			return '中央値';
		case 'p25':
		case 'p75':
		case 'p90':
		case 'p95':
		case 'p99':
			return '分位数';
		case 'stddev':
			return '標準偏差';
		case 'variance':
			return '分散';
	}
}

export function applySuggestion(
	input: string,
	cursor: number,
	suggestion: Suggestion,
): { value: string; cursor: number } {
	const before = input.slice(0, cursor);
	const after = input.slice(cursor);
	const { prefix } = _splitPrefix(before);
	const replaced =
		suggestion.category === 'function' || suggestion.category === 'column'
			? (/[A-Za-z_$][\w$]*$/.exec(prefix)?.[0] ?? '')
			: prefix;
	const start = before.length - replaced.length;
	const head = input.slice(0, start);
	const value = head + suggestion.insertText + after;
	const newCursor = head.length + suggestion.insertText.length;
	return { value, cursor: newCursor };
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	const cols = [
		{ id: 'name', accessor: () => '', header: '氏名' },
		{ id: 'age', accessor: () => 0, type: 'number' as const, header: '年齢' },
		{ id: 'dept', accessor: () => '', header: '部署' },
		{ id: 'salary', accessor: () => 0, type: 'number' as const, header: '給与' },
	];

	describe('getCompletions (既定 = chart/templates off)', () => {
		it('空入力 (既定) は column のみ。template / chart-keyword なし', () => {
			const r = getCompletions('', 0, cols);
			expect(r.phase).toBe('empty');
			const cats = r.suggestions.map((s) => s.category);
			expect(cats).toContain('column');
			expect(cats).not.toContain('template');
			expect(cats).not.toContain('chart-keyword');
		});

		it('既定で "chart " と打っても通常分岐に落ちる (chart-phase ではない)', () => {
			const r = getCompletions('chart ', 6, cols);
			expect(r.phase).not.toBe('chart');
		});

		it('既定の connective phase に "chart" キーワードが含まれない', () => {
			const r = getCompletions('salary>=50000 ', 14, cols);
			expect(r.phase).toBe('connective');
			const labels = r.suggestions.map((s) => s.label);
			expect(labels).toContain('and');
			expect(labels).toContain('or');
			expect(labels).toContain('by');
			expect(labels).not.toContain('chart');
		});

		it('カラム名直後はオペレータ (label = 人間語、hint = 記号)', () => {
			const r = getCompletions('salary ', 7, cols);
			expect(r.phase).toBe('operator');
			expect(r.suggestions.map((s) => s.hint)).toContain('>=');
			expect(r.suggestions.map((s) => s.label)).toContain('以上');
		});

		it('演算子直後は値入力プロンプト (補完なし)', () => {
			const r = getCompletions('salary>=', 8, cols);
			expect(r.phase).toBe('value');
			expect(r.suggestions).toHaveLength(0);
		});

		it('"by " 後はカラム (昇順 + 降順)', () => {
			const r = getCompletions('salary>=1 by ', 13, cols);
			expect(r.phase).toBe('sort');
			const labels = r.suggestions.map((s) => s.label);
			expect(labels).toContain('給与');
			expect(labels).toContain('−給与');
		});

		it('前方一致でカラム絞り込み (id にマッチ)', () => {
			const r = getCompletions('sa', 2, cols);
			expect(r.suggestions.map((s) => s.label)).toContain('給与');
		});
	});

	describe('getCompletions (let 句 / computed columns)', () => {
		it('空入力で "let" 計算列キーワードを提示', () => {
			const r = getCompletions('', 0, cols);
			const letItem = r.suggestions.find((s) => s.label === 'let');
			expect(letItem?.category).toBe('computed-keyword');
			expect(letItem?.insertText).toBe('let ');
		});

		it('式コンテキスト (let name = ) で関数名と列参照を提示', () => {
			const r = getCompletions('let total = ', 12, cols);
			expect(r.phase).toBe('computed');
			const fns = r.suggestions.filter((s) => s.category === 'function').map((s) => s.label);
			expect(fns).toEqual(
				expect.arrayContaining(['if', 'round', 'abs', 'min', 'max', 'coalesce', 'lower', 'upper']),
			);
			const colLabels = r.suggestions.filter((s) => s.category === 'column').map((s) => s.label);
			expect(colLabels).toEqual(expect.arrayContaining(['給与', '年齢']));
		});

		it('式コンテキストの prefix で関数を前方一致絞り込み', () => {
			const r = getCompletions('let total = ro', 14, cols);
			const fns = r.suggestions.filter((s) => s.category === 'function').map((s) => s.label);
			expect(fns).toEqual(['round']);
		});

		it('let で定義した名前は後続のフィルタ位置で列補完に出る', () => {
			const r = getCompletions('let total = salary * age; tot', 29, cols);
			const labels = r.suggestions.map((s) => s.label);
			expect(labels).toContain('total');
		});

		it('let で定義した名前は後続の by ソートでも列補完に出る', () => {
			const r = getCompletions('let total = salary * age; by tot', 32, cols);
			expect(r.phase).toBe('sort');
			const labels = r.suggestions.map((s) => s.label);
			expect(labels).toContain('total');
			expect(labels).toContain('−total');
		});

		it('let 定義名の直後はオペレータを提示 (computed 列として扱う)', () => {
			const r = getCompletions('let total = salary * age; total ', 32, cols);
			expect(r.phase).toBe('operator');
		});

		it('部分/未完の式 (round() 途中) でもクラッシュせず候補を返す', () => {
			const r = getCompletions('let x = round(', 14, cols);
			expect(r.phase).toBe('computed');
			expect(r.suggestions.length).toBeGreaterThan(0);
		});

		it('`;` 直後の clause-start で再び let を提示', () => {
			const r = getCompletions('let a = salary; ', 16, cols);
			const labels = r.suggestions.map((s) => s.label);
			expect(labels).toContain('let');
		});

		it('大文字の LET も core の lexer と同じく let 句として扱う', () => {
			expect(getCompletions('LET total = ', 12, cols).phase).toBe('computed');
			const r = getCompletions('LET total = salary * age; tot', 29, cols);
			expect(r.suggestions.map((s) => s.label)).toContain('total');
		});

		it('クオート内の \\" はクオートを閉じず、続く ; も句の区切りにしない', () => {
			const input = 'name="x\\";y" ';
			const plain = 'name="xyz" ';
			expect(getCompletions(input, input.length, cols).phase).toBe(
				getCompletions(plain, plain.length, cols).phase,
			);
		});

		it('式の中の列 prefix `sa` を補完 (関数は除外)', () => {
			const r = getCompletions('let x = sa', 10, cols);
			expect(r.phase).toBe('computed');
			expect(r.suggestions.map((s) => s.label)).toContain('給与');
		});
	});

	describe('getCompletions (enableChart: true)', () => {
		const opts = { enableChart: true } as const;

		it('"chart " 後はチャート種別', () => {
			const r = getCompletions('chart ', 6, cols, opts);
			expect(r.phase).toBe('chart');
			expect(r.suggestions.map((s) => s.label)).toEqual(['bar', 'line', 'pie', 'combo', 'bubble']);
		});

		it('"chart bar " 後は "by"', () => {
			const r = getCompletions('chart bar ', 10, cols, opts);
			expect(r.suggestions[0]?.label).toBe('by');
		});

		it('"chart bar by " 後はカラム (header ラベル + id secondary)', () => {
			const r = getCompletions('chart bar by ', 13, cols, opts);
			const dept = r.suggestions.find((s) => s.insertText.startsWith('dept'));
			expect(dept?.label).toBe('部署');
			expect(dept?.secondaryLabel).toBe('dept');
		});

		it('"chart bar by dept " 後は集計関数 (短いラベル)', () => {
			const r = getCompletions('chart bar by dept ', 18, cols, opts);
			const labels = r.suggestions.map((s) => s.label);
			expect(labels).toContain('sum');
			expect(labels).toContain('max');
			expect(labels).toContain('median');
		});

		it('"chart bar by dept sum:" 後は metric-col のカラム (header)', () => {
			const r = getCompletions('chart bar by dept sum:', 22, cols, opts);
			expect(r.suggestions.map((s) => s.label)).toEqual(expect.arrayContaining(['給与', '年齢']));
		});

		it('"chart bar by dept sum:sal" は前方一致で絞り込み (id ベース)', () => {
			const r = getCompletions('chart bar by dept sum:sal', 25, cols, opts);
			expect(r.suggestions.map((s) => s.label)).toEqual(['給与']);
		});

		it('フィルタ条件完結後は connective / by / chart / カラム', () => {
			const r = getCompletions('salary>=50000 ', 14, cols, opts);
			expect(r.phase).toBe('connective');
			const labels = r.suggestions.map((s) => s.label);
			expect(labels).toContain('and');
			expect(labels).toContain('or');
			expect(labels).toContain('by');
			expect(labels).toContain('chart');
		});
	});

	describe('getCompletions (templates option)', () => {
		const tmpl = [
			{ label: 'foo template', insertText: 'foo ', hint: 'ヒント' },
			{ label: 'bar template', insertText: 'bar ' },
		] as const;

		it('templates 指定時、空入力でテンプレートセクションを返す', () => {
			const r = getCompletions('', 0, cols, { templates: tmpl });
			const templateItems = r.suggestions.filter((s) => s.category === 'template');
			expect(templateItems.map((s) => s.label)).toEqual(['foo template', 'bar template']);
			expect(templateItems[0]?.hint).toBe('ヒント');
		});

		it('templates が空配列ならテンプレートを返さない', () => {
			const r = getCompletions('', 0, cols, { templates: [] });
			expect(r.suggestions.some((s) => s.category === 'template')).toBe(false);
		});

		it('templates 指定でも非空入力ではテンプレートを返さない', () => {
			const r = getCompletions('sa', 2, cols, { templates: tmpl });
			expect(r.suggestions.some((s) => s.category === 'template')).toBe(false);
		});

		it('enableChart + templates 併用が同居できる', () => {
			const r = getCompletions('', 0, cols, { enableChart: true, templates: tmpl });
			const cats = r.suggestions.map((s) => s.category);
			expect(cats).toContain('column');
			expect(cats).toContain('chart-keyword');
			expect(cats).toContain('template');
		});
	});

	describe('applySuggestion', () => {
		it('prefix を置き換えて挿入', () => {
			const r = applySuggestion('cha', 3, {
				label: 'chart …',
				insertText: 'chart ',
				category: 'chart-keyword',
			});
			expect(r.value).toBe('chart ');
			expect(r.cursor).toBe(6);
		});

		it('カーソル位置の後の文字列は保持', () => {
			const r = applySuggestion('chart  by dept', 6, {
				label: 'bar',
				insertText: 'bar ',
				category: 'chart-type',
			});
			expect(r.value).toBe('chart bar  by dept');
		});

		it('途中の prefix を補完で置換', () => {
			const r = applySuggestion('salary>=10 by sa', 16, {
				label: '給与',
				insertText: 'salary',
				category: 'column',
			});
			expect(r.value).toBe('salary>=10 by salary');
		});

		it('式中の `round(` の後へ列を挿入 ( は保持)', () => {
			const r = applySuggestion('let x = round(', 14, {
				label: '給与',
				insertText: 'salary',
				category: 'column',
			});
			expect(r.value).toBe('let x = round(salary');
		});
	});
}
