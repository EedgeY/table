import type { CellValue, ChartConfig, ColumnNode, DataSource } from '@tarbo-table/core';
import { aggregate, createMemoryDataSource, createTable, pivot } from '@tarbo-table/core';
import type { ColumnEditMeta } from '@tarbo-table/ui';
import type { ConditionalCellMeta } from '@tarbo-table/core/conditional-style';
import { withEdit, type EditMixin } from '@tarbo-table/core/edit';
import { withFocus, type FocusMixin } from '@tarbo-table/core/focus';
import { withPersist, type PersistMixin } from '@tarbo-table/core/persist';
import { CommandLineInput, DataChart, DataTable, TableLocaleProvider } from '@tarbo-table/ui';
import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';

type FullTable = ReturnType<typeof createTable<Employee>> &
	EditMixin<Employee> &
	FocusMixin &
	PersistMixin;

type Employee = {
	id: number;
	name: string;
	email: string;
	dept: 'eng' | 'sales' | 'hr' | 'finance';
	role: 'admin' | 'editor' | 'viewer';
	salary: number;
	active: boolean;
};

const DEPTS: Employee['dept'][] = ['eng', 'sales', 'hr', 'finance'];
const ROLES: Employee['role'][] = ['admin', 'editor', 'viewer'];

function _generate(n: number): Employee[] {
	const out: Employee[] = new Array(n);
	for (let i = 0; i < n; i++) {
		out[i] = {
			id: i + 1,
			name: `社員 ${i + 1}`,
			email: `user${i + 1}@example.co.jp`,
			dept: DEPTS[i % DEPTS.length]!,
			role: ROLES[i % ROLES.length]!,
			salary: 300_000 + ((i * 137) % 700_000),
			active: i % 5 !== 0,
		};
	}
	return out;
}

const initialRows = _generate(300);

const salaryStyle: ConditionalCellMeta<Employee> = {
	rules: [
		{
			kind: 'scale',
			min: 300_000,
			max: 1_000_000,
			minColor: '#e0f2fe',
			maxColor: '#fde68a',
		},
		{
			kind: 'compare',
			op: '>=',
			threshold: 900_000,
			style: { color: '#dc2626', fontWeight: 'bold' },
		},
	],
};

const columns: (ColumnNode<Employee> & {
	edit?: ColumnEditMeta<Employee>;
	cellStyle?: ConditionalCellMeta<Employee>;
})[] = [
	{ id: 'id', accessor: (r) => r.id, type: 'number', header: 'ID', defaultWidth: 60 },
	{
		id: 'name',
		accessor: (r) => r.name,
		header: '氏名',
		defaultWidth: 140,
		edit: {
			editor: { kind: 'text' },
			validate: (v) => {
				if (typeof v === 'string' && v.length > 0 && v.length < 40) return null;
				return '1〜40 文字で入力してください';
			},
		},
	},
	{
		id: 'email',
		accessor: (r) => r.email,
		header: 'メール',
		defaultWidth: 200,
		edit: {
			editor: { kind: 'text' },
			validate: (v) =>
				typeof v === 'string' && /.+@.+\..+/.test(v) ? null : 'メールアドレスとして無効です',
		},
	},
	{
		id: 'dept',
		accessor: (r) => r.dept,
		header: '部署',
		defaultWidth: 100,
		edit: {
			editor: {
				kind: 'select',
				options: DEPTS.map((d) => ({ value: d, label: d })),
			},
		},
	},
	{
		id: 'role',
		accessor: (r) => r.role,
		header: 'ロール',
		defaultWidth: 100,
		edit: {
			editor: {
				kind: 'select',
				options: ROLES.map((r) => ({ value: r, label: r })),
			},
		},
	},
	{
		id: 'salary',
		accessor: (r) => r.salary,
		type: 'number',
		header: '給与',
		defaultWidth: 130,
		edit: {
			editor: { kind: 'number', step: 10_000, min: 0 },
		},
		cellStyle: salaryStyle,
	},
	{
		id: 'active',
		accessor: (r) => r.active,
		type: 'boolean',
		header: '有効',
		defaultWidth: 70,
		edit: {
			editor: { kind: 'boolean' },
		},
	},
];

type Mode = 'client' | 'server' | 'server-error';

export function BusinessDemo(): ReactNode {
	const [mode, setMode] = useState<Mode>('client');
	const [chart, setChart] = useState<ChartConfig | null>(null);
	const [showPivot, setShowPivot] = useState(false);

	const dataSource = useMemo<DataSource<Employee>>(() => {
		const mem = createMemoryDataSource(initialRows, (r) => String(r.id) as never);
		return {
			...mem,
			updateCell: async (input) => {
				await new Promise((r) => setTimeout(r, 600));
				if (Math.random() < 0.1) {
					return { ok: false, error: { code: 'simulated', message: 'ランダムに失敗 (10%)' } };
				}
				return mem.updateCell!(input);
			},
			fetch: async (q) => {
				await new Promise((r) => setTimeout(r, mode === 'server' ? 400 : 0));
				if (mode === 'server-error') {
					throw new Error('サーバー側で何らかのエラーが発生しました (デモ用)');
				}
				const rows = mem.getRows();
				const start = q.pagination.pageIndex * q.pagination.pageSize;
				const end = start + q.pagination.pageSize;
				return { rows: rows.slice(start, end), totalCount: rows.length };
			},
		};
	}, [mode]);

	const table = useMemo<FullTable>(() => {
		if (mode === 'client') {
			return withPersist(
				withFocus(
					withEdit(
						createTable<Employee>({
							data: initialRows,
							columns,
							pageSize: 50,
							getRowId: (r) => String(r.id),
							dataSource,
							selectionMode: 'multi',
						}),
					),
				),
				{ key: 'tarbo-business-demo', storage: 'local' },
			) as FullTable;
		}
		return withPersist(
			withFocus(
				withEdit(
					createTable<Employee>({
						columns,
						mode: 'server',
						dataSource,
						pageSize: 50,
						getRowId: (r) => String(r.id),
						serverDebounceMs: 100,
					}),
				),
			),
			{ key: 'tarbo-business-demo-server', storage: 'local' },
		) as FullTable;
	}, [mode, dataSource]);

	useEffect(() => {
		return () => table.dispose();
	}, [table]);

	const [, force] = useReducer((x: number) => x + 1, 0);
	useEffect(() => table.subscribe(() => force()), [table]);

	const showcaseTip = (
		<div className="mb-3 grid grid-cols-2 gap-2 rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground md:grid-cols-3">
			<div>
				<strong className="text-foreground">✏️ 編集:</strong> セルクリック後 F2 / Enter
			</div>
			<div>
				<strong className="text-foreground">🎯 移動:</strong> 矢印 / Home / End / PageUp/Down
			</div>
			<div>
				<strong className="text-foreground">🔳 範囲選択:</strong> Shift+矢印 or Shift+クリック
			</div>
			<div>
				<strong className="text-foreground">📋 コピー:</strong> Ctrl/Cmd + C
			</div>
			<div>
				<strong className="text-foreground">↶ Undo / Redo:</strong> 右上ボタン
			</div>
			<div>
				<strong className="text-foreground">💾 永続化:</strong> ソート/列幅をリロードしても保持
			</div>
			<div>
				<strong className="text-foreground">🎨 条件付き書式:</strong> 給与列のヒートマップ
			</div>
			<div>
				<strong className="text-foreground">📊 ピボット:</strong> 「ピボット」ボタン
			</div>
			<div>
				<strong className="text-foreground">📤 XLSX:</strong> Toolbar の Export → Excel
			</div>
		</div>
	);

	return (
		<TableLocaleProvider locale="ja">
			<div className="flex h-full flex-col p-3">
				<header className="mb-3 flex flex-wrap items-start justify-between gap-3">
					<div>
						<h1 className="text-lg font-semibold">tarbo-table — 業務系機能 showcase</h1>
						<p className="text-xs text-muted-foreground">
							{initialRows.length} 行 × 7 列。インライン編集 / 永続化 / 範囲選択 / 条件付き書式 /
							ピボット / XLSX を一画面で。
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<ModeSwitch value={mode} onChange={setMode} />
						<UndoRedoControls table={table} />
						<button
							type="button"
							onClick={() => setShowPivot((v) => !v)}
							className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
						>
							{showPivot ? 'テーブルに戻る' : 'ピボットを表示'}
						</button>
						<button
							type="button"
							onClick={() => {
								table.clearPersist();
								location.reload();
							}}
							className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
							title="localStorage をクリアして再読み込み"
						>
							↻ 永続化リセット
						</button>
					</div>
				</header>

				{showcaseTip}

				<div className="mb-2">
					<CommandLineInput table={table} onChartConfig={setChart} />
				</div>

				<div className="flex-1 overflow-hidden">
					{showPivot ? (
						<PivotView table={table} />
					) : chart ? (
						<DataChart table={table} chart={chart} />
					) : (
						<DataTable table={table} filterBar={false} />
					)}
				</div>

				<AggregatesPanel table={table} />
			</div>
		</TableLocaleProvider>
	);
}

function ModeSwitch(props: { value: Mode; onChange: (m: Mode) => void }): ReactNode {
	const base = 'px-2 py-1 text-xs rounded font-mono transition';
	return (
		<div className="flex items-center gap-1 rounded border bg-muted/40 p-0.5">
			{(['client', 'server', 'server-error'] as Mode[]).map((m) => (
				<button
					key={m}
					type="button"
					className={`${base} ${props.value === m ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
					onClick={() => props.onChange(m)}
				>
					{m === 'client'
						? 'クライアント'
						: m === 'server'
							? 'サーバー (mock)'
							: 'サーバー失敗 (mock)'}
				</button>
			))}
		</div>
	);
}

function UndoRedoControls(props: { table: FullTable }): ReactNode {
	const { table } = props;
	return (
		<div className="flex items-center gap-1">
			<button
				type="button"
				disabled={!table.canUndo()}
				onClick={() => void table.undo()}
				className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
			>
				↶ Undo
			</button>
			<button
				type="button"
				disabled={!table.canRedo()}
				onClick={() => void table.redo()}
				className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
			>
				↷ Redo
			</button>
		</div>
	);
}

function AggregatesPanel(props: { table: ReturnType<typeof createTable<Employee>> }): ReactNode {
	const { table } = props;
	const rows = table.getVisibleRows().map((r) => r.row);
	const cols = table.getColumns();
	const buckets = aggregate(rows, cols, {
		columns: {
			salary: 'sum',
		},
	});
	const sum = buckets[0]?.values.salary ?? 0;
	const medianBucket = aggregate(rows, cols, { columns: { salary: 'median' } });
	const median = medianBucket[0]?.values.salary ?? 0;
	const p95Bucket = aggregate(rows, cols, { columns: { salary: 'p95' } });
	const p95 = p95Bucket[0]?.values.salary ?? 0;
	const stddev = aggregate(rows, cols, { columns: { salary: 'stddev' } });
	const sd = stddev[0]?.values.salary ?? 0;
	const count = aggregate(rows, cols, { columns: { dept: 'countDistinct' } });
	const distinctDept = count[0]?.values.dept ?? 0;
	return (
		<div className="mt-2 grid grid-cols-2 gap-2 rounded border border-border bg-muted/20 p-2 text-xs md:grid-cols-5">
			<Stat label="Σ 給与 (sum)" value={`¥${Number(sum).toLocaleString()}`} />
			<Stat label="中央値 (median)" value={`¥${Number(median).toLocaleString()}`} />
			<Stat label="p95" value={`¥${Number(p95).toLocaleString()}`} />
			<Stat label="標準偏差 (stddev)" value={`¥${Math.round(Number(sd)).toLocaleString()}`} />
			<Stat label="ユニーク部署" value={String(distinctDept)} />
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }): ReactNode {
	return (
		<div className="flex flex-col">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-mono text-foreground">{value}</span>
		</div>
	);
}

function PivotView(props: { table: ReturnType<typeof createTable<Employee>> }): ReactNode {
	const { table } = props;
	const rows = table.getVisibleRows().map((r) => r.row);
	const idx = rows.map((_, i) => i);
	const cols = table.getColumns();
	const result = pivot(rows, cols, idx, {
		rows: ['dept'],
		cols: ['role'],
		values: [
			{ columnId: 'salary', fn: 'sum' },
			{ columnId: 'id', fn: 'count' },
		],
	});

	const valueLabels = ['Σ給与', '人数'];
	return (
		<div className="h-full overflow-auto rounded border border-border bg-background">
			<table className="w-full border-collapse text-sm">
				<thead className="sticky top-0 bg-muted">
					<tr>
						<th className="border border-border px-2 py-1 text-left text-xs">部署 \\ ロール</th>
						{result.colAxis.map((c) => (
							<th
								key={String(c.key)}
								colSpan={result.values.length}
								className="border border-border bg-muted/60 px-2 py-1 text-xs"
							>
								{formatKey(c.key)}
							</th>
						))}
					</tr>
					<tr>
						<th className="border border-border px-2 py-1 text-xs">&nbsp;</th>
						{result.colAxis.flatMap((c) =>
							valueLabels.map((vl, vi) => (
								<th
									key={`${String(c.key)}-${vi}`}
									className="border border-border bg-muted/30 px-2 py-1 text-[10px] font-normal text-muted-foreground"
								>
									{vl}
								</th>
							)),
						)}
					</tr>
				</thead>
				<tbody>
					{result.rowAxis.map((r, ri) => (
						<tr key={String(r.key)}>
							<th className="border border-border bg-muted/30 px-2 py-1 text-left text-xs">
								{formatKey(r.key)}
							</th>
							{result.matrix[ri]?.map((v, ci) => (
								<td
									key={ci}
									className="border border-border px-2 py-1 text-right tt-tabular text-xs"
								>
									{v === null ? '—' : ci % 2 === 0 ? `¥${v.toLocaleString()}` : v.toLocaleString()}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function formatKey(k: CellValue): string {
	if (k === null || k === undefined) return '(なし)';
	return String(k);
}
