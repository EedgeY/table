import type { ColumnDef } from './column.ts';
import type { Predicate } from './filter.ts';
import type { SortSpec } from './sort.ts';
import { _compilePredicate, _filterIndices } from './_filter-engine.ts';
import { _buildComparator, _sortIndices } from './_sort-engine.ts';
import type { CompiledNode } from './_types.ts';

/**
 * - `setData(rows)` is called whenever the consumer-visible data ref changes.
 *   A WASM driver may use this to re-extract typed columns; the JS driver is
 *   a no-op.
 * - `setPredicate(p)` is called when the predicate ref changes. The driver
 *   should invalidate any compiled cache. It does *not* run the filter.
 * - `runFilter(scratch)` returns the matching index array. May reuse the
 *   provided `scratch` Uint32Array (JS driver does this).
 * - `runSort(filtered, spec)` returns the sorted index array. `filtered` is
 *   the result of the most recent `runFilter` call; the driver may not
 *   mutate it.
 * - `dispose()` releases any held resources (e.g. WASM linear memory).
 */
export interface EngineDriver<TRow> {
	setData: (rows: ReadonlyArray<TRow>) => void;
	setPredicate: (predicate: Predicate | null) => void;
	runFilter: (scratch: Uint32Array) => Uint32Array;
	runSort: (filtered: Uint32Array, spec: SortSpec) => Uint32Array;
	dispose?: () => void;
}

export type EngineDriverFactory<TRow> = (
	data: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
) => EngineDriver<TRow>;

export function _createJsEngineDriver<TRow>(
	initialData: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
): EngineDriver<TRow> {
	let data = initialData;
	let predicate: Predicate | null = null;
	let compiled: CompiledNode | null = null;
	return {
		setData(rows) {
			data = rows;
		},
		setPredicate(p) {
			predicate = p;
			compiled = null;
		},
		runFilter(scratch) {
			if (compiled === null && predicate !== null) {
				compiled = _compilePredicate(predicate, columns) as CompiledNode | null;
			}
			const n = _filterIndices(data, compiled, scratch);
			return scratch.slice(0, n);
		},
		runSort(filtered, spec) {
			if (spec.length === 0) return filtered;
			const cmp = _buildComparator(data, spec, columns, filtered);
			return _sortIndices(filtered, cmp);
		},
	};
}

export const defaultEngineFactory: EngineDriverFactory<unknown> = _createJsEngineDriver;

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	type R = { id: number; name: string; salary: number };
	const cols: ColumnDef<R>[] = [
		{ id: 'id', accessor: (r) => r.id, type: 'number' },
		{ id: 'name', accessor: (r) => r.name },
		{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
	];
	const data: R[] = [
		{ id: 1, name: 'a', salary: 100 },
		{ id: 2, name: 'b', salary: 50 },
		{ id: 3, name: 'c', salary: 75 },
	];

	describe('JsEngineDriver', () => {
		it('null predicate keeps everything in original order', () => {
			const d = _createJsEngineDriver(data, cols);
			const scratch = new Uint32Array(data.length);
			const filtered = d.runFilter(scratch);
			expect(Array.from(filtered)).toEqual([0, 1, 2]);
		});

		it('setPredicate then runFilter applies the filter', () => {
			const d = _createJsEngineDriver(data, cols);
			d.setPredicate({ kind: 'leaf', columnId: 'salary', op: '>=', value: 75 });
			const scratch = new Uint32Array(data.length);
			expect(Array.from(d.runFilter(scratch))).toEqual([0, 2]);
		});

		it('runSort returns multi-key stable order', () => {
			const d = _createJsEngineDriver(data, cols);
			const scratch = new Uint32Array(data.length);
			const filtered = d.runFilter(scratch);
			const sorted = d.runSort(filtered, [{ columnId: 'salary', dir: 'asc' }]);
			expect(Array.from(sorted)).toEqual([1, 2, 0]);
		});

		it('setData swaps the underlying data ref without invalidating compiled predicate', () => {
			const d = _createJsEngineDriver(data, cols);
			d.setPredicate({ kind: 'leaf', columnId: 'salary', op: '>=', value: 75 });
			const scratch = new Uint32Array(data.length);
			d.runFilter(scratch);
			d.setData([
				{ id: 4, name: 'd', salary: 200 },
				{ id: 5, name: 'e', salary: 10 },
			]);
			const next = new Uint32Array(2);
			expect(Array.from(d.runFilter(next))).toEqual([0]);
		});
	});
}
