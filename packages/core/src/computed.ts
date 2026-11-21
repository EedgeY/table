import type { ColumnDef } from './column.ts';
import type { ComputedColumnSpec } from './query.ts';
import { parseQuery } from './query.ts';
import { createTable } from './create-table.ts';
import { exportRows } from './export.ts';
import type { EvalFn } from './_computed-engine.ts';
import { _compileColumn } from './_computed-engine.ts';

/**
 * 式 spec を accessor 付き `ColumnDef` 列にコンパイルする。
 * spec は定義順に処理され、後の式は「base 列 + それ以前にコンパイルした computed 列」を
 * 参照できる (parse 時の検証と同じ可視範囲)。返り値は computed 列のみ (base は含まない)。
 */
export function compileComputedColumns<TRow>(
	specs: ReadonlyArray<ComputedColumnSpec>,
	baseColumns: ReadonlyArray<ColumnDef<TRow>>,
): ColumnDef<TRow>[] {
	const resolved = new Map<string, EvalFn>();
	for (const c of baseColumns) {
		resolved.set(c.id, c.accessor as EvalFn);
	}

	const out: ColumnDef<TRow>[] = [];
	for (const spec of specs) {
		const { accessor, type } = _compileColumn(spec.expr, (name) => {
			const fn = resolved.get(name);
			if (fn === undefined) {
				throw new Error(`computed column "${spec.name}": 未解決の列参照 "${name}"`);
			}
			return fn;
		});
		resolved.set(spec.name, accessor);
		out.push({
			id: spec.name,
			accessor: accessor as ColumnDef<TRow>['accessor'],
			...(type !== undefined ? { type } : {}),
		});
	}
	return out;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	type Row = { amount: number; quantity: number };
	const base: ColumnDef<Row>[] = [
		{ id: 'amount', accessor: (r) => r.amount, type: 'number' },
		{ id: 'quantity', accessor: (r) => r.quantity, type: 'number' },
	];
	const compileFrom = (src: string): ColumnDef<Row>[] => {
		const r = parseQuery(src, base);
		if (!r.ok) throw new Error(r.error.message);
		return compileComputedColumns(r.value.computed ?? [], base);
	};

	describe('compileComputedColumns', () => {
		it('式 spec を accessor 付き ColumnDef にコンパイル', () => {
			const computed = compileFrom('let total = amount * quantity');
			expect(computed).toHaveLength(1);
			expect(computed[0]!.id).toBe('total');
			expect(computed[0]!.accessor({ amount: 100, quantity: 3 })).toBe(300);
		});

		it('後の computed が前の computed を参照できる', () => {
			const computed = compileFrom('let total = amount * quantity; let tax = total * 2');
			const tax = computed.find((c) => c.id === 'tax')!;
			expect(tax.accessor({ amount: 100, quantity: 3 })).toBe(600);
		});

		it('accessor 評価に cleanup が効く', () => {
			const [s] = compileFrom('let s = amount + quantity');
			expect(s!.accessor({ amount: 0.1, quantity: 0.2 })).toBe(0.3);
		});
	});

	describe('computed column の end-to-end (parse → table → export)', () => {
		type SalesRow = { product: string; amount: number; quantity: number };
		const salesCols: ColumnDef<SalesRow>[] = [
			{ id: 'product', accessor: (r) => r.product },
			{ id: 'amount', accessor: (r) => r.amount, type: 'number' },
			{ id: 'quantity', accessor: (r) => r.quantity, type: 'number' },
		];
		const salesData: SalesRow[] = [
			{ product: 'A', amount: 100, quantity: 3 },
			{ product: 'B', amount: 50, quantity: 1 },
			{ product: 'C', amount: 200, quantity: 2 },
		];

		it('let で定義した列で filter / sort / 描画 / export できる', () => {
			const parsed = parseQuery('let total = amount * quantity; total >= 100 by -total', salesCols);
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;

			const computed = compileComputedColumns(parsed.value.computed ?? [], salesCols);
			const table = createTable<SalesRow>({
				data: salesData,
				columns: [...salesCols, ...computed],
			});
			table.setPredicate(parsed.value.predicate);
			table.setSort(parsed.value.sort);

			expect(table.getVisibleRows().map((r) => r.row.product)).toEqual(['C', 'A']);

			expect(table.getVisibleColumns().map((c) => c.id)).toContain('total');
			const csv = exportRows(
				table.getVisibleRows().map((r) => r.row),
				table.getVisibleColumns(),
				{ format: 'csv', bom: false, eol: '\n' },
			);
			expect(csv.split('\n')[0]).toContain('total');
			expect(csv.split('\n')[1]).toContain('400');
		});

		it('table.setComputedColumns でランタイム登録 → filter/sort が参照できる', () => {
			const table = createTable<SalesRow>({ data: salesData, columns: salesCols });
			const parsed = parseQuery(
				'let total = amount * quantity; total >= 100 by -total',
				table.getBaseColumns(),
			);
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;

			table.setComputedColumns(parsed.value.computed ?? []);
			table.setPredicate(parsed.value.predicate);
			table.setSort(parsed.value.sort);

			expect(table.getColumns().map((c) => c.id)).toContain('total');
			expect(table.getVisibleRows().map((r) => r.row.product)).toEqual(['C', 'A']);
		});

		it('setComputedColumns は関数 (round) を含む式も登録できる', () => {
			const table = createTable<SalesRow>({ data: salesData, columns: salesCols });
			const parsed = parseQuery('let tax = round(amount * 0.1, 2)', table.getBaseColumns());
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			table.setComputedColumns(parsed.value.computed ?? []);
			const taxCol = table.getColumns().find((c) => c.id === 'tax')!;
			expect(taxCol.accessor(salesData[0]!)).toBe(10);
		});

		it('文字列を返す IF 列は string 型として sort / filter できる', () => {
			const table = createTable<SalesRow>({ data: salesData, columns: salesCols });
			const parsed = parseQuery(
				'let band = IF(amount >= 100, "high", "low") by band',
				table.getBaseColumns(),
			);
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;

			table.setComputedColumns(parsed.value.computed ?? []);
			const bandCol = table.getColumns().find((c) => c.id === 'band')!;
			expect(bandCol.type).toBe('string');

			table.setSort(parsed.value.sort);
			expect(table.getVisibleRows().map((r) => r.row.product)).toEqual(['A', 'C', 'B']);

			table.setSort([]);
			table.setPredicate({ kind: 'leaf', columnId: 'band', op: '=', value: 'high' });
			expect(table.getVisibleRows().map((r) => r.row.product)).toEqual(['A', 'C']);
		});

		it('文字列連結 (&) の let 句は string 型で end-to-end 動作する', () => {
			type NameRow = { first: string; last: string };
			const nameCols: ColumnDef<NameRow>[] = [
				{ id: 'first', accessor: (r) => r.first },
				{ id: 'last', accessor: (r) => r.last },
			];
			const table = createTable<NameRow>({
				data: [{ first: 'John', last: 'Doe' }],
				columns: nameCols,
			});
			const parsed = parseQuery('let label = first & " " & last', table.getBaseColumns());
			if (!parsed.ok) throw new Error('parse');
			table.setComputedColumns(parsed.value.computed ?? []);
			const labelCol = table.getColumns().find((c) => c.id === 'label')!;
			expect(labelCol.type).toBe('string');
			expect(labelCol.accessor({ first: 'John', last: 'Doe' })).toBe('John Doe');
		});

		it('lower / upper の let 句は string 型に推論される', () => {
			const table = createTable<SalesRow>({ data: salesData, columns: salesCols });
			const parsed = parseQuery('let p = upper(product)', table.getBaseColumns());
			if (!parsed.ok) throw new Error('parse');
			table.setComputedColumns(parsed.value.computed ?? []);
			const col = table.getColumns().find((c) => c.id === 'p')!;
			expect(col.type).toBe('string');
			expect(col.accessor(salesData[0]!)).toBe('A');
		});

		it('比較を返す let 句は boolean 型に推論される', () => {
			const table = createTable<SalesRow>({ data: salesData, columns: salesCols });
			const parsed = parseQuery('let big = amount >= 100', table.getBaseColumns());
			if (!parsed.ok) throw new Error('parse');
			table.setComputedColumns(parsed.value.computed ?? []);
			expect(table.getColumns().find((c) => c.id === 'big')!.type).toBe('boolean');
		});

		it('setComputedColumns([]) で computed 列を解除し再 parse できる (列名衝突なし)', () => {
			const table = createTable<SalesRow>({ data: salesData, columns: salesCols });
			const first = parseQuery('let total = amount * quantity', table.getBaseColumns());
			if (!first.ok) throw new Error('parse 1');
			table.setComputedColumns(first.value.computed ?? []);
			expect(table.getColumns().map((c) => c.id)).toContain('total');

			const again = parseQuery('let total = amount * quantity', table.getBaseColumns());
			expect(again.ok).toBe(true);

			table.setComputedColumns([]);
			expect(table.getColumns().map((c) => c.id)).not.toContain('total');
		});
	});
}
