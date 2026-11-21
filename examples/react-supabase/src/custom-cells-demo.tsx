import type {
	CellMeta,
	ChartConfig,
	ColumnDef,
	ColumnNode,
	EngineDriverFactory,
	RowId,
} from '@tarbo-table/core';
import { createMemoryRelationSource, createTable } from '@tarbo-table/core';
import { withFocus } from '@tarbo-table/core/focus';
import { useRsDriverFactory } from '@tarbo-table/core-rs/react';
import { CommandLineInput, DataChart, DataTable, useTableUrlState } from '@tarbo-table/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { makeAvatar } from './_avatar.ts';

type Person = {
	id: number;
	name: string;
	email: string;
	photo: string;
	opt_in: boolean;
	title: string;
	more_info: string;
	performance: number[];
	manager_id: number;
	hired: string;
	rating: number;
	skills: string[];
	workload: number;
};

type Manager = {
	id: number;
	name: string;
	email: string;
	avatar: string;
	dept: string;
};

const FIRST_NAMES = [
	'Natasha',
	'Conner',
	'Serena',
	'Aurore',
	'Derek',
	'Alisa',
	'Eliezer',
	'Darren',
	'Modesta',
	'Berniece',
	'Delphine',
	'Connor',
	'Karson',
	'Filiberto',
	'Brain',
	'Carlie',
	'Florian',
	'Milford',
	'Shanna',
	'Melany',
	'Lynn',
	'Ciara',
	'Myron',
	'Melody',
	'Jamey',
	'Velda',
	'Keshaun',
	'Eva',
	'Gilda',
	'Kayden',
];
const LAST_NAMES = [
	'Schoen',
	'Spencer',
	'Lesch',
	'Heidenreich',
	'Kihn',
	'Nicolas',
	'Dickens',
	'Ledner',
	'Braun',
	'Smith',
	'Boyer',
	'Yahoo',
	'Kessler',
	'Ernser',
	'Ebert',
	'Grady',
	'Jones',
	'Harris',
	'Davis',
	'Little',
	'Bosco',
	'Mitchell',
	'Luettgen',
	'Howell',
	'Cummings',
	'Ratke',
	'Reynolds',
];
const TITLES = [
	'Investor Optimization Manager',
	'Central Identity Orchestrator',
	'Lead Mobility Agent',
	'Future Brand Agent',
	'Global Program Planner',
	'Central Interactions Architect',
	'Principal Usability Technician',
	'Lead Communications Architect',
	'National Configuration Coordinator',
	'Chief Integration Liaison',
	'District Interactions Liaison',
	'Product Implementation Producer',
	'Forward Data Strategist',
	'Product Interactions Administrator',
	'Senior Infrastructure Associate',
];
const SKILL_POOL = [
	'TypeScript',
	'React',
	'Rust',
	'Go',
	'Python',
	'GraphQL',
	'PostgreSQL',
	'Docker',
	'Kubernetes',
	'CSS',
	'WebAssembly',
	'Swift',
	'Figma',
	'Tailwind',
	'AWS',
	'Redis',
];
const MANAGERS_RAW = [
	['Osborne Lehner', 'eng'],
	["Viola O'Kon", 'sales'],
	['Kane West', 'hr'],
	['Jeromy Miller', 'eng'],
	['Darlene Hettinger', 'sales'],
	['Lura Mohr', 'finance'],
	['Greta Armstrong', 'eng'],
	['Fabiola Jaskolski', 'sales'],
	['Margaretta Wilderman', 'hr'],
	['Keanu Lindgren', 'eng'],
] as const;

function _hashf(seed: number, salt: number): number {
	let h = (seed + 1) * (salt + 31);
	h = (h ^ (h >> 7)) * 2654435761;
	return Math.abs((h >> 0) % 1000) / 1000;
}

function _generate(n: number): Person[] {
	const out: Person[] = new Array(n);
	for (let i = 0; i < n; i++) {
		const id = i + 1;
		const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
		const last = LAST_NAMES[(i * 7) % LAST_NAMES.length]!;
		const name = `${first} ${last}`;
		const skillCount = 2 + Math.floor(_hashf(i, 11) * 4);
		const skills: string[] = [];
		for (let j = 0; j < skillCount; j++) {
			const s = SKILL_POOL[(i * 13 + j * 5) % SKILL_POOL.length]!;
			if (!skills.includes(s)) skills.push(s);
		}
		const ratingRaw = _hashf(i, 3) * 5;
		const rating = Math.round(ratingRaw * 2) / 2;
		const performance = Array.from({ length: 18 }, (_, j) => {
			const t = j / 17;
			return Math.sin(t * Math.PI * 2 + i * 0.21) * 0.4 + 0.5 + _hashf(i, j + 1) * 0.2 - 0.1;
		});
		const hiredYear = 2023 + Math.floor(_hashf(i, 19) * 3);
		const hiredMonth = 1 + Math.floor(_hashf(i, 23) * 12);
		const hiredDay = 1 + Math.floor(_hashf(i, 29) * 28);
		out[i] = {
			id,
			name,
			email: `${first}.${last}${(i % 99) + 11}@${i % 2 === 0 ? 'gmail' : 'hotmail'}.com`,
			photo: makeAvatar(i, name),
			opt_in: i % 3 === 0,
			title: TITLES[i % TITLES.length]!,
			more_info: `https://${
				['friendly-neck', 'definite-justice', 'only-git', 'cautious-pass', 'splendid-sandpaper'][
					i % 5
				]
			}.com`,
			performance,
			manager_id: (i % MANAGERS_RAW.length) + 1,
			hired: `${['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i % 7]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][hiredMonth - 1]} ${String(hiredDay).padStart(2, '0')} ${hiredYear}`,
			rating,
			skills,
			workload: Math.round(_hashf(i, 41) * 100),
		};
	}
	return out;
}

const _managers: Manager[] = MANAGERS_RAW.map(([name, dept], i) => ({
	id: i + 1,
	name,
	email: `${name
		.split(' ')[0]!
		.toLowerCase()
		.replace(/[^a-z]/g, '')}@example.com`,
	avatar: makeAvatar(1000 + i, name),
	dept,
}));

const data = _generate(2000);

const columns: ColumnNode<Person>[] = [
	{ id: 'id', accessor: (r) => r.id, type: 'number', header: 'ID', defaultWidth: 50 },
	{
		id: 'user',
		accessor: (r) => r.name,
		type: 'user',
		header: 'User',
		defaultWidth: 200,
		cellMeta: (r): CellMeta => ({
			kind: 'user',
			name: r.name,
			email: r.email,
			avatar: r.photo,
		}),
	},
	{
		id: 'photo',
		accessor: (r) => r.name,
		type: 'image',
		header: 'Photo',
		defaultWidth: 70,
		cellMeta: (r): CellMeta => ({ kind: 'image', src: r.photo, alt: r.name }),
	},
	{
		id: 'opt_in',
		accessor: (r) => r.opt_in,
		type: 'checkbox',
		header: 'Opt-In',
		defaultWidth: 70,
	},
	{
		id: 'title',
		accessor: (r) => r.title,
		header: 'Title',
		defaultWidth: 230,
	},
	{
		id: 'more_info',
		accessor: (r) => r.more_info,
		type: 'link',
		header: 'More Info',
		defaultWidth: 200,
	},
	{
		id: 'performance',
		accessor: (r) => r.performance[r.performance.length - 1] ?? 0,
		type: 'sparkline',
		header: 'Performance',
		defaultWidth: 160,
		cellMeta: (r): CellMeta => ({
			kind: 'sparkline',
			values: r.performance,
			color: 'oklch(0.78 0.16 165)',
		}),
	},
	{
		id: 'rating',
		accessor: (r) => r.rating,
		type: 'star',
		header: 'Rating',
		defaultWidth: 130,
		cellMeta: (r): CellMeta => ({ kind: 'star', value: r.rating, max: 5 }),
	},
	{
		id: 'skills',
		accessor: (r) => r.skills.join(', '),
		type: 'tags',
		header: 'Skills',
		defaultWidth: 250,
		cellMeta: (r): CellMeta => ({
			kind: 'tags',
			tags: r.skills.map((s) => ({ label: s })),
			max: 3,
		}),
	},
	{
		id: 'workload',
		accessor: (r) => r.workload,
		type: 'progress',
		header: 'Workload',
		defaultWidth: 160,
		cellMeta: (r): CellMeta => ({
			kind: 'progress',
			value: r.workload,
			max: 100,
		}),
	},
	{
		id: 'manager',
		accessor: (r) => _managers[r.manager_id - 1]?.name ?? null,
		type: 'relation',
		header: 'Manager',
		defaultWidth: 180,
		cellMeta: (r): CellMeta | null => {
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
	{
		id: 'hired',
		accessor: (r) => r.hired,
		header: 'Hired',
		defaultWidth: 170,
	},
];

const _managerColumns: ColumnDef<unknown>[] = [
	{ id: 'id', accessor: (r) => (r as Manager).id, type: 'number', header: 'ID', defaultWidth: 60 },
	{
		id: 'name',
		accessor: (r) => (r as Manager).name,
		type: 'user',
		header: 'Name',
		defaultWidth: 220,
		cellMeta: (r) => ({
			kind: 'user',
			name: (r as Manager).name,
			email: (r as Manager).email,
			avatar: (r as Manager).avatar,
		}),
	},
	{ id: 'dept', accessor: (r) => (r as Manager).dept, header: 'Dept', defaultWidth: 80 },
	{
		id: 'email',
		accessor: (r) => (r as Manager).email,
		type: 'link',
		header: 'Email',
		defaultWidth: 240,
	},
];

const _relationSource = createMemoryRelationSource({
	managers: {
		rows: _managers,
		columns: _managerColumns,
		getRowId: (r) => String((r as Manager).id) as RowId,
	},
});

const _CELL_LEGEND: ReadonlyArray<{
	readonly id: string;
	readonly label: string;
	readonly color: string;
}> = [
	{ id: 'user', label: 'User', color: 'oklch(0.55 0.14 230)' },
	{ id: 'image', label: 'Image', color: 'oklch(0.7 0.18 145)' },
	{ id: 'checkbox', label: 'Checkbox', color: 'oklch(0.65 0.18 25)' },
	{ id: 'link', label: 'Link', color: 'oklch(0.62 0.18 250)' },
	{ id: 'sparkline', label: 'Sparkline', color: 'oklch(0.78 0.16 165)' },
	{ id: 'star', label: 'Star', color: 'oklch(0.80 0.18 80)' },
	{ id: 'tags', label: 'Tags', color: 'oklch(0.65 0.18 320)' },
	{ id: 'progress', label: 'Progress', color: 'oklch(0.75 0.16 50)' },
	{ id: 'relation', label: 'Relation', color: 'oklch(0.62 0.16 285)' },
];

type EngineChoice = 'js' | 'rs';

export function CustomCellsDemo(): ReactNode {
	const rsFactory = useRsDriverFactory();
	const [engine, setEngine] = useState<EngineChoice>('rs');
	const [chart, setChart] = useState<ChartConfig | null>(null);

	const engineForTable = engine === 'rs' ? rsFactory : undefined;

	const table = useMemo(() => {
		if (engine === 'rs' && rsFactory === null) return null;
		return withFocus(
			createTable<Person>({
				data,
				columns,
				selectionMode: 'multi',
				pageSize: 100,
				getRowId: (r) => String(r.id),
				engine: engineForTable as EngineDriverFactory<Person> | undefined,
				relations: _relationSource,
			}),
		);
	}, [engine, rsFactory, engineForTable]);

	useEffect(() => () => table?.dispose(), [table]);

	return (
		<div className="custom-cells-shell flex h-full flex-col">
			<header className="border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h1 className="text-base font-semibold tracking-tight">
							tarbo-table — Custom Cells Showcase
						</h1>
						<p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
							ヘッドレスコアに <code className="rounded bg-muted px-1 font-mono">type</code> と{' '}
							<code className="rounded bg-muted px-1 font-mono">cellMeta</code>{' '}
							を宣言するだけで、画像 / リンク / チェックボックス / スパークライン / 星評価 / タグ /
							プログレス / リレーション / ユーザーカードを混在して表示できます。Manager
							列のセルをクリックするとサブテーブルが展開します。
						</p>
					</div>
					<EngineSwitch value={engine} onChange={setEngine} rsReady={rsFactory !== null} />
				</div>
				<div className="mt-3 flex flex-wrap items-center gap-1.5">
					{_CELL_LEGEND.map((l) => (
						<span
							key={l.id}
							className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
						>
							<span
								className="inline-block h-1.5 w-1.5 rounded-full"
								style={{ background: l.color }}
							/>
							{l.label}
						</span>
					))}
				</div>
			</header>

			{table ? (
				<TableBody table={table} chart={chart} onChartConfig={setChart} />
			) : (
				<div className="border-b border-border bg-background/80 px-4 py-2">
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
	table: ReturnType<typeof createTable<Person>>;
	chart: ChartConfig | null;
	onChartConfig: (c: ChartConfig | null) => void;
}): ReactNode {
	const { value, setValue } = useTableUrlState(table, { key: 'cells' });
	return (
		<>
			<div className="border-b border-border bg-background/80 px-4 py-2">
				<CommandLineInput
					table={table}
					onChartConfig={onChartConfig}
					value={value}
					onValueChange={setValue}
				/>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden bg-background px-4 py-3">
				{chart ? (
					<DataChart table={table} chart={chart} />
				) : (
					<DataTable table={table} filterBar={false} rowHeight={36} />
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
	const base = 'px-2 py-1 text-[11px] rounded font-mono transition';
	return (
		<div className="flex items-center gap-1 rounded border border-border bg-muted/40 p-0.5">
			<button
				type="button"
				className={`${base} ${value === 'js' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
				onClick={() => onChange('js')}
			>
				JS
			</button>
			<button
				type="button"
				className={`${base} ${value === 'rs' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'} ${rsReady ? '' : 'opacity-60'}`}
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
		<div className="rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
			{label}
		</div>
	);
}
