import type { ChartConfig, TableInstance } from '@tarbo-table/core';
import { parseQuery } from '@tarbo-table/core';
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type KeyboardEvent,
	type ReactNode,
} from 'react';
import { cn } from './_utils.ts';
import {
	applySuggestion,
	getCompletions,
	type QueryTemplate,
	type Suggestion,
} from './_command-completion.ts';
import { Input } from './components/input.tsx';

export type { QueryTemplate } from './_command-completion.ts';

export type CommandLineInputProps<TRow> = {
	readonly table: TableInstance<TRow>;
	readonly placeholder?: string;
	readonly debounceMs?: number;
	/** チャート構文がパース成功したときに呼ばれる。入力からチャート指定が消えたら null。 */
	readonly onChartConfig?: (config: ChartConfig | null) => void;
	/** 補完ポップオーバーを無効化する。既定 false。 */
	readonly disableHints?: boolean;
	/**
	 * controlled モード: 入力文字列を親から渡す。`useTableUrlState` の `value` を
	 * 渡すと URL ↔ 入力欄の双方向同期が成立する。未指定なら uncontrolled。
	 */
	readonly value?: string;
	/** controlled モードで入力値が変わったときの通知。`useTableUrlState` の `setValue` を渡す。 */
	readonly onValueChange?: (next: string) => void;
	/**
	 * chart 構文 (`chart bar by … sum:…`) の補完候補を有効化。既定 false。
	 * パーサ自体は常に chart 構文を解釈する。これは補完表示の制御のみ。
	 */
	readonly enableChart?: boolean;
	/**
	 * 空入力時にテンプレートセクションとして提示するクエリ雛形。
	 * 未指定 / 空配列ならテンプレートセクションを表示しない。
	 * 安定参照を渡すこと (モジュールスコープ const 推奨)。再生成すると useMemo が無効化される。
	 */
	readonly templates?: ReadonlyArray<QueryTemplate>;
};

type ApplyError = {
	readonly message: string;
	readonly position: number;
	readonly token: string;
};

export function errorUnderlineSpan(error: { readonly position: number; readonly token: string }): {
	readonly start: number;
	readonly width: number;
} {
	const start = Math.max(0, error.position);
	const width = Math.max(1, error.token.length);
	return { start, width };
}

const CATEGORY_LABEL: Readonly<Record<Suggestion['category'], string>> = {
	column: '列',
	operator: '演算子',
	connective: '接続',
	sort: 'ソート',
	'chart-type': 'チャート種別',
	'chart-keyword': 'チャート',
	'aggregate-fn': '集計関数',
	'computed-keyword': '計算列',
	function: '関数',
	value: '値',
	template: 'テンプレート',
};

const CATEGORY_DOT: Readonly<Record<Suggestion['category'], string>> = {
	column: 'bg-emerald-500',
	operator: 'bg-blue-500',
	connective: 'bg-slate-400',
	sort: 'bg-amber-500',
	'chart-type': 'bg-purple-500',
	'chart-keyword': 'bg-purple-500',
	'aggregate-fn': 'bg-sky-500',
	'computed-keyword': 'bg-rose-500',
	function: 'bg-indigo-500',
	value: 'bg-muted-foreground',
	template: 'bg-foreground',
};

export function CommandLineInput<TRow>(props: CommandLineInputProps<TRow>): ReactNode {
	const {
		table,
		placeholder,
		debounceMs = 150,
		onChartConfig,
		disableHints = false,
		value: propValue,
		onValueChange,
		enableChart = false,
		templates,
	} = props;
	const isControlled = propValue !== undefined;
	const [internalValue, setInternalValue] = useState('');
	const value = isControlled ? propValue : internalValue;
	const [cursor, setCursor] = useState(0);
	const [focused, setFocused] = useState(false);
	const [error, setError] = useState<ApplyError | null>(null);
	const [highlight, setHighlight] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	const setValue = (next: string): void => {
		if (!isControlled) setInternalValue(next);
		onValueChange?.(next);
	};

	const apply = (v: string): void => {
		const r = parseQuery(v, table.getBaseColumns());
		if (r.ok) {
			table.setComputedColumns(r.value.computed ?? []);
			table.setPredicate(r.value.predicate);
			table.setSort(r.value.sort);
			setError(null);
			if (onChartConfig) onChartConfig(r.value.chart ?? null);
		} else {
			setError({
				message: r.error.message,
				position: r.error.position,
				token: r.error.token ?? '',
			});
		}
	};

	const scheduleApply = (v: string): void => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => apply(v), debounceMs);
	};

	const lastAppliedValueRef = useRef<string>('');
	const scheduleApplyRef = useRef(scheduleApply);
	scheduleApplyRef.current = scheduleApply;
	useEffect(() => {
		if (value === lastAppliedValueRef.current) return;
		lastAppliedValueRef.current = value;
		scheduleApplyRef.current(value);
	}, [value]);

	const onChange = (e: ChangeEvent<HTMLInputElement>): void => {
		const v = e.target.value;
		setValue(v);
		setCursor(e.target.selectionStart ?? v.length);
	};

	const onSelect = (e: ChangeEvent<HTMLInputElement>): void => {
		setCursor(e.target.selectionStart ?? value.length);
	};

	const insertSuggestion = (s: Suggestion): void => {
		const r = applySuggestion(value, cursor, s);
		setValue(r.value);
		setCursor(r.cursor);
		requestAnimationFrame(() => {
			const el = inputRef.current;
			if (el) {
				el.focus();
				el.setSelectionRange(r.cursor, r.cursor);
			}
		});
	};

	const completion = useMemo(
		() =>
			disableHints
				? null
				: getCompletions(value, cursor, table.getColumns(), { enableChart, templates }),
		[value, cursor, table, disableHints, enableChart, templates],
	);
	const suggestionsCount = completion?.suggestions.length ?? 0;

	useEffect(() => {
		setHighlight(0);
	}, [value, cursor]);

	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
		if (!completion || suggestionsCount === 0) {
			if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setHighlight((h) => (h + 1) % suggestionsCount);
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			setHighlight((h) => (h - 1 + suggestionsCount) % suggestionsCount);
			return;
		}
		if (e.key === 'Tab' || (e.key === 'Enter' && completion.phase !== 'value')) {
			const s = completion.suggestions[highlight];
			if (s) {
				e.preventDefault();
				insertSuggestion(s);
			}
			return;
		}
		if (e.key === 'Escape') {
			(e.target as HTMLInputElement).blur();
		}
	};

	const showPopover = focused && completion !== null && completion.suggestions.length > 0;

	return (
		<div className="relative">
			<Input
				ref={inputRef}
				value={value}
				onChange={onChange}
				onSelect={onSelect}
				onFocus={() => setFocused(true)}
				onBlur={() => {
					setTimeout(() => setFocused(false), 120);
				}}
				onKeyDown={onKeyDown}
				placeholder={placeholder ?? 'salary>=50000 name~"田中" by -age'}
				className={cn(
					'h-9 font-mono text-[13px] border-transparent bg-muted/40 shadow-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0',
					error && 'border-destructive focus-visible:ring-destructive',
				)}
			/>
			{showPopover && completion && (
				<SuggestionPopover
					completion={completion}
					highlight={highlight}
					onHover={setHighlight}
					onPick={insertSuggestion}
				/>
			)}
			{error &&
				(() => {
					const { start, width } = errorUnderlineSpan(error);
					return (
						<div className="mt-1 px-3 font-mono text-xs text-destructive">
							<div aria-hidden="true" className="whitespace-pre">
								{' '.repeat(start)}
								<span data-testid="error-underline" className="text-destructive">
									{'^'.repeat(width)}
								</span>
							</div>
							<div role="alert">{error.message}</div>
						</div>
					);
				})()}
		</div>
	);
}

function SuggestionPopover(props: {
	completion: NonNullable<ReturnType<typeof getCompletions>>;
	highlight: number;
	onHover: (i: number) => void;
	onPick: (s: Suggestion) => void;
}): ReactNode {
	const { completion, highlight, onHover, onPick } = props;
	const items: Array<
		| { kind: 'header'; key: string; label: string }
		| { kind: 'item'; key: string; idx: number; s: Suggestion }
	> = [];
	let lastKey: string | null = null;
	completion.suggestions.forEach((s, i) => {
		const sectionLabel = s.group ?? CATEGORY_LABEL[s.category];
		const key = `${s.category}:${sectionLabel}`;
		if (key !== lastKey) {
			items.push({ kind: 'header', key, label: sectionLabel });
			lastKey = key;
		}
		items.push({ kind: 'item', key: `${s.category}-${s.label}-${i}`, idx: i, s });
	});

	return (
		<div
			className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-md border border-border bg-background py-1 text-sm shadow-lg"
			role="listbox"
		>
			<div className="flex items-center gap-2 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
				<span className="normal-case">{completion.hint}</span>
				<span className="ml-auto normal-case">↑↓ で選択 · Enter / Tab で確定 · Esc で閉じる</span>
			</div>
			{items.map((it) =>
				it.kind === 'header' ? (
					<div
						key={it.key}
						className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
					>
						{it.label}
					</div>
				) : (
					<button
						key={it.key}
						type="button"
						role="option"
						aria-selected={highlight === it.idx}
						onMouseEnter={() => onHover(it.idx)}
						onMouseDown={(e) => {
							e.preventDefault();
							onPick(it.s);
						}}
						title={it.s.description}
						className={cn(
							'flex w-full items-center gap-2 px-3 py-1.5 text-left transition',
							highlight === it.idx ? 'bg-muted' : 'hover:bg-muted/60',
						)}
					>
						<span
							className={cn('h-2 w-2 shrink-0 rounded-full', CATEGORY_DOT[it.s.category])}
							aria-hidden="true"
						/>
						<span className="flex flex-1 items-baseline gap-2 truncate">
							<span className="truncate text-[13px] text-foreground">{it.s.label}</span>
							{it.s.secondaryLabel && (
								<span className="truncate font-mono text-[10px] text-muted-foreground/80">
									{it.s.secondaryLabel}
								</span>
							)}
						</span>
						{it.s.hint && (
							<span className="font-mono text-[11px] text-muted-foreground">{it.s.hint}</span>
						)}
					</button>
				),
			)}
		</div>
	);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('errorUnderlineSpan', () => {
		it('token 長ぶんの幅で下線スパンを返す', () => {
			expect(errorUnderlineSpan({ position: 8, token: 'nope' })).toEqual({ start: 8, width: 4 });
		});

		it('token 空なら幅 1 (キャレット)', () => {
			expect(errorUnderlineSpan({ position: 14, token: '' })).toEqual({ start: 14, width: 1 });
		});

		it('負の position は 0 にクランプ', () => {
			expect(errorUnderlineSpan({ position: -3, token: 'x' })).toEqual({ start: 0, width: 1 });
		});
	});

	describe('CommandLineInput (エラー下線の描画)', () => {
		it('let 句の式エラーで position から token 長ぶん下線を引く', async () => {
			const { render, act, waitFor } = await import('@testing-library/react');
			const { createTable } = await import('@tarbo-table/core');
			const { default: React, useMemo } = await import('react');
			type Row = { salary: number };
			const cols = [{ id: 'salary', accessor: (r: Row) => r.salary, type: 'number' as const }];
			const data: Row[] = [{ salary: 1 }];

			function Demo(): React.ReactElement {
				const table = useMemo(() => createTable<Row>({ data, columns: cols }), []);
				return React.createElement(CommandLineInput<Row>, {
					table,
					debounceMs: 0,
					value: 'let x = nope * 2',
				});
			}

			let container: HTMLElement | undefined;
			await act(async () => {
				const r = render(React.createElement(Demo));
				container = r.container;
			});

			await waitFor(() => {
				const underline = container!.querySelector('[data-testid="error-underline"]');
				expect(underline?.textContent).toBe('^^^^');
				expect(container!.querySelector('[role="alert"]')?.textContent).toContain('未知の列');
			});
		});

		it('正常な let + filter 句ではエラー下線を出さない', async () => {
			const { render, act, waitFor } = await import('@testing-library/react');
			const { createTable } = await import('@tarbo-table/core');
			const { default: React, useMemo } = await import('react');
			type Row = { salary: number; age: number };
			const cols = [
				{ id: 'salary', accessor: (r: Row) => r.salary, type: 'number' as const },
				{ id: 'age', accessor: (r: Row) => r.age, type: 'number' as const },
			];
			const data: Row[] = [{ salary: 1, age: 2 }];

			function Demo(): React.ReactElement {
				const table = useMemo(() => createTable<Row>({ data, columns: cols }), []);
				return React.createElement(CommandLineInput<Row>, {
					table,
					debounceMs: 0,
					value: 'let total = salary * age; total > 0',
				});
			}

			let container: HTMLElement | undefined;
			await act(async () => {
				const r = render(React.createElement(Demo));
				container = r.container;
			});

			await waitFor(() => {
				expect(container!.querySelector('[role="alert"]')).toBeNull();
			});
		});
	});
}
