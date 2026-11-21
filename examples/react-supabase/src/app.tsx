import type {
	ChartConfig,
	ColumnDef,
	ColumnNode,
	EngineDriverFactory,
	RowId,
} from '@tarbo-table/core';
import { createMemoryRelationSource, createTable } from '@tarbo-table/core';
import { withGrouping } from '@tarbo-table/core/grouping';
import { useRsDriverFactory } from '@tarbo-table/core-rs/react';
import { CommandLineInput, DataChart, DataTable, useTableUrlState } from '@tarbo-table/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

type Employee = {
	id: number;
	name: string;
	email: string;
	address: string;
	tel: string;
	role: 'admin' | 'editor' | 'viewer';
	dept: 'eng' | 'sales' | 'hr' | 'finance';
	salary: number;
	must_change_password: boolean;
	opt_in: boolean;
	photo: string;
	more_info: string;
	performance: number[];
	manager_id: number;
};

type Manager = {
	id: number;
	name: string;
	avatar: string;
};

const MANAGER_NAMES = [
	'Osborne Lehner',
	"Viola O'Kon",
	'Kane West',
	'Jeromy Miller',
	'Darlene Hettinger',
	'Lura Mohr',
	'Greta Armstrong',
	'Fabiola Jaskolski',
];

const _managers: Manager[] = MANAGER_NAMES.map((name, i) => ({
	id: i + 1,
	name,
	avatar: `https://i.pravatar.cc/40?img=${50 + i}`,
}));

const DEPTS: Employee['dept'][] = ['eng', 'sales', 'hr', 'finance'];
const ROLES: Employee['role'][] = ['admin', 'editor', 'viewer'];

function _generate(n: number): Employee[] {
	const out: Employee[] = new Array(n);
	for (let i = 0; i < n; i++) {
		const id = i + 1;
		out[i] = {
			id,
			name: `社員 ${id}`,
			email: `user${id}@example.co.jp`,
			address: `東京都港区${(i % 99) + 1}-${(i % 9) + 1}`,
			tel: `090-${String(1000 + (i % 9000)).padStart(4, '0')}-${String(1000 + ((i * 7) % 9000)).padStart(4, '0')}`,
			role: ROLES[i % ROLES.length]!,
			dept: DEPTS[i % DEPTS.length]!,
			salary: 300_000 + ((i * 137) % 700_000),
			must_change_password: i % 7 === 0,
			opt_in: i % 3 === 0,
			photo: `https://i.pravatar.cc/40?img=${(i % 70) + 1}`,
			more_info: `https://example.com/employees/${id}`,
			performance: Array.from({ length: 16 }, (_, j) => {
				const t = j / 15;
				return Math.sin(t * Math.PI * 2 + i * 0.13) * 0.5 + 0.5 + ((i + j) % 3) * 0.05;
			}),
			manager_id: (i % _managers.length) + 1,
		};
	}
	return out;
}

const data = _generate(10_000);

const columns: ColumnNode<Employee>[] = [
	{ id: 'id', accessor: (r) => r.id, type: 'number', header: 'ID', defaultWidth: 70 },
	{
		id: 'photo',
		accessor: (r) => r.name,
		type: 'image',
		header: 'Photo',
		defaultWidth: 70,
		cellMeta: (r) => ({ kind: 'image', src: r.photo, alt: r.name }),
	},
	{
		kind: 'group',
		id: 'profile',
		header: 'プロフィール',
		children: [
			{ id: 'name', accessor: (r) => r.name, header: '氏名', defaultWidth: 120 },
			{ id: 'email', accessor: (r) => r.email, header: 'メール', defaultWidth: 200 },
			{ id: 'address', accessor: (r) => r.address, header: '住所', defaultWidth: 180 },
		],
	},
	{ id: 'tel', accessor: (r) => r.tel, header: '電話', defaultWidth: 140 },
	{ id: 'dept', accessor: (r) => r.dept, header: '部署', defaultWidth: 90 },
	{ id: 'role', accessor: (r) => r.role, header: 'ロール', defaultWidth: 90 },
	{
		id: 'salary',
		accessor: (r) => r.salary,
		type: 'number',
		header: '給与',
		defaultWidth: 110,
	},
	{
		id: 'opt_in',
		accessor: (r) => r.opt_in,
		type: 'checkbox',
		header: 'Opt-In',
		defaultWidth: 80,
	},
	{
		id: 'performance',
		accessor: (r) => r.performance[r.performance.length - 1] ?? null,
		type: 'sparkline',
		header: 'Performance',
		defaultWidth: 150,
		cellMeta: (r) => ({ kind: 'sparkline', values: r.performance, color: '#16a34a' }),
	},
	{
		id: 'must_change_password',
		accessor: (r) => r.must_change_password,
		type: 'checkbox',
		header: 'PW変更',
		defaultWidth: 80,
	},
	{
		id: 'more_info',
		accessor: (r) => r.more_info,
		type: 'link',
		header: 'More Info',
		defaultWidth: 200,
	},
	{
		id: 'manager',
		accessor: (r) => _managers[r.manager_id - 1]?.name ?? null,
		type: 'relation',
		header: 'Manager',
		defaultWidth: 180,
		cellMeta: (r) => {
			const m = _managers[r.manager_id - 1];
			if (!m) return null;
			return {
				kind: 'relation',
				recordRef: { tableId: 'managers', rowId: m.id },
				label: m.name,
				avatar: m.avatar,
			};
		},
	},
];

const _managerColumns: ColumnDef<unknown>[] = [
	{ id: 'id', accessor: (r) => (r as Manager).id, type: 'number', header: 'ID', defaultWidth: 60 },
	{ id: 'name', accessor: (r) => (r as Manager).name, header: '氏名', defaultWidth: 140 },
];

const _relationSource = createMemoryRelationSource({
	managers: {
		rows: _managers,
		columns: _managerColumns,
		getRowId: (r) => String((r as Manager).id) as RowId,
	},
});

type EngineChoice = 'js' | 'rs';

export function App(): ReactNode {
	const rsFactory = useRsDriverFactory();
	const [engine, setEngine] = useState<EngineChoice>('rs');
	const [chart, setChart] = useState<ChartConfig | null>(null);

	const engineForTable = engine === 'rs' ? rsFactory : undefined;

	const table = useMemo(() => {
		if (engine === 'rs' && rsFactory === null) return null;
		return withGrouping(
			createTable<Employee>({
				data,
				columns,
				selectionMode: 'multi',
				pageSize: 100,
				getRowId: (r) => String(r.id),
				engine: engineForTable as EngineDriverFactory<Employee> | undefined,
				relations: _relationSource,
			}),
		);
	}, [engine, rsFactory, engineForTable]);

	useEffect(() => {
		return () => {
			table?.dispose();
		};
	}, [table]);

	return (
		<div className="flex h-full flex-col p-3">
			<header className="mb-3 flex items-start justify-between gap-3">
				<div>
					<h1 className="text-lg font-semibold">tarbo-table — Supabase風 DataTable デモ</h1>
					<p className="text-xs text-muted-foreground">
						10,000 行 × 9 列。CLI で
						<code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono">
							salary&gt;=500000 dept=eng by -salary
						</code>
						{' / '}
						<code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono">
							chart bar by dept sum:salary
						</code>
						{' / '}
						<code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono">
							let bonus = round(salary * 0.1, 0); bonus &gt; 50000 by -bonus
						</code>
						のように入力 (最後は computed column)。
					</p>
				</div>
				<EngineSwitch value={engine} onChange={setEngine} rsReady={rsFactory !== null} />
			</header>
			{table ? (
				<TableBody table={table} chart={chart} onChartConfig={setChart} />
			) : (
				<div className="mb-2">
					<LoadingBar label="wasm を読み込んでいます…" />
				</div>
			)}
		</div>
	);
}

function TableBody({
	table,
	chart,
	onChartConfig,
}: {
	table: ReturnType<typeof createTable<Employee>>;
	chart: ChartConfig | null;
	onChartConfig: (c: ChartConfig | null) => void;
}): ReactNode {
	const { value, setValue } = useTableUrlState(table);
	return (
		<>
			<div className="mb-2">
				<CommandLineInput
					table={table}
					onChartConfig={onChartConfig}
					value={value}
					onValueChange={setValue}
					enableChart
				/>
			</div>
			<div className="flex-1 overflow-hidden">
				{chart ? (
					<DataChart table={table} chart={chart} />
				) : (
					<DataTable table={table} filterBar={false} />
				)}
			</div>
		</>
	);
}

function EngineSwitch({
	value,
	onChange,
	rsReady,
}: {
	value: EngineChoice;
	onChange: (v: EngineChoice) => void;
	rsReady: boolean;
}): ReactNode {
	const base = 'px-2 py-1 text-xs rounded font-mono transition';
	return (
		<div className="flex items-center gap-1 rounded border bg-muted/40 p-0.5">
			<button
				type="button"
				className={`${base} ${value === 'js' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
				onClick={() => onChange('js')}
			>
				JS engine
			</button>
			<button
				type="button"
				className={`${base} ${value === 'rs' ? 'bg-background shadow-sm' : 'text-muted-foreground'} ${rsReady ? '' : 'opacity-60'}`}
				onClick={() => onChange('rs')}
				title={rsReady ? 'Rust + WebAssembly' : 'wasm loading…'}
			>
				Rust (WASM) {rsReady ? '✓' : '⌛'}
			</button>
		</div>
	);
}

function LoadingBar({ label }: { label: string }): ReactNode {
	return (
		<div className="rounded border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
			{label}
		</div>
	);
}
