import type { TableInstance } from '@tarbo-table/core';
import { parseQuery } from '@tarbo-table/core';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useRef } from 'react';

export type UseTableUrlStateOptions = {
	/** URL クエリパラメータ名。既定 `'ttq'`。 */
	readonly key?: string;
	/** 履歴エントリの種別。既定 `'replace'` (フィルタ操作で履歴を汚さない)。 */
	readonly history?: 'push' | 'replace';
	/** URL 書き込み throttle (ms)。既定 150ms。 */
	readonly throttleMs?: number;
	/** 空文字列のとき param を URL から削除。既定 `true`。 */
	readonly clearOnDefault?: boolean;
};

export type UseTableUrlStateReturn = {
	/** 現在の URL クエリ文字列 (空なら `''`)。 */
	readonly value: string;
	/** URL を書き換える。空文字列 + `clearOnDefault` で param が消える。 */
	readonly setValue: (next: string) => void;
};

/**
 * URL に DSL 文字列を保存し、table の predicate / sort を同期する。
 *
 * 副作用:
 * - URL → table: 値が変わるたび parseQuery して predicate / sort を反映
 *   (chart は table state に乗らないので無視)
 * - parseQuery 失敗は no-op (入力途中など、テーブルは壊さない)
 *
 * 完全同期 (chart 含む) には戻り値 `{ value, setValue }` を `CommandLineInput`
 * に渡すこと。CommandLineInput 内部の debounce 付き apply が chart も処理する。
 */
export function useTableUrlState<TRow>(
	table: TableInstance<TRow>,
	options?: UseTableUrlStateOptions,
): UseTableUrlStateReturn {
	const key = options?.key ?? 'ttq';
	const history = options?.history ?? 'replace';
	const throttleMs = options?.throttleMs ?? 150;
	const clearOnDefault = options?.clearOnDefault ?? true;

	const [raw, setRaw] = useQueryState(
		key,
		parseAsString.withOptions({
			history,
			limitUrlUpdates: { method: 'throttle', timeMs: throttleMs },
			clearOnDefault,
		}),
	);

	const value = raw ?? '';

	const lastAppliedRef = useRef<string | null>(null);
	const hasObservedRef = useRef(false);

	useEffect(() => {
		if (value === lastAppliedRef.current) return;
		if (value === '' && !hasObservedRef.current) {
			hasObservedRef.current = true;
			lastAppliedRef.current = '';
			return;
		}
		hasObservedRef.current = true;
		lastAppliedRef.current = value;

		if (value === '') {
			table.setComputedColumns([]);
			table.setPredicate(null);
			table.setSort([]);
			return;
		}
		const r = parseQuery(value, table.getBaseColumns());
		if (r.ok) {
			table.setComputedColumns(r.value.computed ?? []);
			table.setPredicate(r.value.predicate);
			table.setSort(r.value.sort);
		}
	}, [table, value]);

	const setValue = useCallback(
		(next: string): void => {
			void setRaw(next === '' && clearOnDefault ? null : next);
		},
		[setRaw, clearOnDefault],
	);

	return { value, setValue };
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('useTableUrlState (hook)', () => {
		it('URL の初期 DSL 文字列を table に反映', async () => {
			const { render, act } = await import('@testing-library/react');
			const { NuqsTestingAdapter } = await import('nuqs/adapters/testing');
			const { createTable } = await import('@tarbo-table/core');
			const { default: React, useMemo } = await import('react');
			type Row = { id: number; name: string };
			const cols = [
				{ id: 'id', accessor: (r: Row) => r.id, type: 'number' as const },
				{ id: 'name', accessor: (r: Row) => r.name },
			];
			const data: Row[] = [
				{ id: 1, name: 'a' },
				{ id: 2, name: 'b' },
			];

			let captured: ReturnType<typeof createTable<Row>> | null = null;
			function Demo(): React.ReactElement {
				const table = useMemo(() => createTable<Row>({ data, columns: cols }), []);
				captured = table;
				useTableUrlState(table);
				return React.createElement('div');
			}

			const initial = 'id>1 by -name';
			await act(async () => {
				render(
					React.createElement(NuqsTestingAdapter, {
						searchParams: `ttq=${encodeURIComponent(initial)}`,
						hasMemory: true,
						children: React.createElement(Demo),
					}),
				);
			});

			const state = captured!.getState();
			expect(state.predicate).toMatchObject({
				kind: 'leaf',
				columnId: 'id',
				op: '>',
				value: 1,
			});
			expect(state.sort).toEqual([{ columnId: 'name', dir: 'desc' }]);
		});

		it('setValue で URL が更新される', async () => {
			const { render, act, waitFor } = await import('@testing-library/react');
			const { NuqsTestingAdapter } = await import('nuqs/adapters/testing');
			const { createTable } = await import('@tarbo-table/core');
			const { default: React, useEffect, useMemo } = await import('react');
			type Row = { id: number };
			const cols = [{ id: 'id', accessor: (r: Row) => r.id, type: 'number' as const }];
			const data: Row[] = [{ id: 1 }, { id: 2 }];

			let setExt: ((s: string) => void) | null = null;
			function Demo(): React.ReactElement {
				const table = useMemo(() => createTable<Row>({ data, columns: cols }), []);
				const { setValue } = useTableUrlState(table, { throttleMs: 0 });
				useEffect(() => {
					setExt = setValue;
				}, [setValue]);
				return React.createElement('div');
			}

			const updates: Array<URLSearchParams> = [];
			await act(async () => {
				render(
					React.createElement(NuqsTestingAdapter, {
						hasMemory: true,
						onUrlUpdate: (e: { searchParams: URLSearchParams }) => {
							updates.push(e.searchParams);
						},
						children: React.createElement(Demo),
					}),
				);
			});

			await act(async () => {
				setExt!('id=1');
			});

			// nuqs は URL 書き込みを async に flush するため waitFor で待つ
			await waitFor(() => {
				expect(updates.length).toBeGreaterThan(0);
				expect(updates[updates.length - 1]!.get('ttq')).toBe('id=1');
			});
		});

		it('parse 失敗時は table を変更しない', async () => {
			const { render, act } = await import('@testing-library/react');
			const { NuqsTestingAdapter } = await import('nuqs/adapters/testing');
			const { createTable } = await import('@tarbo-table/core');
			const { default: React, useMemo } = await import('react');
			type Row = { id: number };
			const cols = [{ id: 'id', accessor: (r: Row) => r.id, type: 'number' as const }];
			const data: Row[] = [{ id: 1 }];

			let captured: ReturnType<typeof createTable<Row>> | null = null;
			function Demo(): React.ReactElement {
				const table = useMemo(() => createTable<Row>({ data, columns: cols }), []);
				captured = table;
				useTableUrlState(table);
				return React.createElement('div');
			}

			await act(async () => {
				render(
					React.createElement(NuqsTestingAdapter, {
						searchParams: `ttq=${encodeURIComponent('name="abc')}`,
						hasMemory: true,
						children: React.createElement(Demo),
					}),
				);
			});

			expect(captured!.getState().predicate).toBeNull();
			expect(captured!.getState().sort).toEqual([]);
		});

		it('空文字列 setValue で clearOnDefault が効く', async () => {
			const { render, act, waitFor } = await import('@testing-library/react');
			const { NuqsTestingAdapter } = await import('nuqs/adapters/testing');
			const { createTable } = await import('@tarbo-table/core');
			const { default: React, useEffect, useMemo } = await import('react');
			type Row = { id: number };
			const cols = [{ id: 'id', accessor: (r: Row) => r.id, type: 'number' as const }];
			const data: Row[] = [{ id: 1 }];

			let setExt: ((s: string) => void) | null = null;
			function Demo(): React.ReactElement {
				const table = useMemo(() => createTable<Row>({ data, columns: cols }), []);
				const { setValue } = useTableUrlState(table, { throttleMs: 0 });
				useEffect(() => {
					setExt = setValue;
				}, [setValue]);
				return React.createElement('div');
			}

			const updates: Array<URLSearchParams> = [];
			await act(async () => {
				render(
					React.createElement(NuqsTestingAdapter, {
						searchParams: `ttq=${encodeURIComponent('id=1')}`,
						hasMemory: true,
						onUrlUpdate: (e: { searchParams: URLSearchParams }) => {
							updates.push(e.searchParams);
						},
						children: React.createElement(Demo),
					}),
				);
			});

			await act(async () => {
				setExt!('');
			});

			// nuqs は URL 書き込みを async に flush するため waitFor で待つ
			await waitFor(() => {
				expect(updates.length).toBeGreaterThan(0);
				expect(updates[updates.length - 1]!.get('ttq')).toBeNull();
			});
		});
	});
}
