import { type ColumnDef, createTable, f, type SortSpec } from '@tarbo-table/core';
import { createNodeEngine, rsDriverFactory } from '../src/node.ts';
import type { ColumnBinding } from '../src/_types.ts';

type Row = {
	id: number;
	name: string;
	dept: string;
	city: string;
	salary: number;
	tenure: number;
	active: boolean;
};

const DEPTS = ['eng', 'sales', 'design', 'ops', 'data'];
const CITIES = ['tokyo', 'osaka', 'kyoto', 'fukuoka', 'sapporo', 'sendai'];
const FIRST = ['Tanaka', 'Yamada', 'Suzuki', 'Sato', 'Watanabe', 'Ito', 'Nakamura', 'Kobayashi'];

function genData(n: number): Row[] {
	const out: Row[] = new Array(n);
	let seed = 0xdeadbeef;
	const rng = (): number => {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		return (seed >>> 0) / 0x100000000;
	};
	for (let i = 0; i < n; i++) {
		out[i] = {
			id: i,
			name: FIRST[Math.floor(rng() * FIRST.length)]!,
			dept: DEPTS[Math.floor(rng() * DEPTS.length)]!,
			city: CITIES[Math.floor(rng() * CITIES.length)]!,
			salary: 30000 + Math.floor(rng() * 100000),
			tenure: Math.floor(rng() * 30),
			active: rng() < 0.85,
		};
	}
	return out;
}

const JS_COLUMNS: ColumnDef<Row>[] = [
	{ id: 'id', accessor: (r) => r.id, type: 'number' },
	{ id: 'name', accessor: (r) => r.name },
	{ id: 'dept', accessor: (r) => r.dept },
	{ id: 'city', accessor: (r) => r.city },
	{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
	{ id: 'tenure', accessor: (r) => r.tenure, type: 'number' },
	{ id: 'active', accessor: (r) => r.active, type: 'boolean' },
];

const RS_COLUMNS: ColumnBinding<Row>[] = [
	{ id: 'id', accessor: (r) => r.id, type: 'number' },
	{ id: 'name', accessor: (r) => r.name, type: 'string' },
	{ id: 'dept', accessor: (r) => r.dept, type: 'string' },
	{ id: 'city', accessor: (r) => r.city, type: 'string' },
	{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
	{ id: 'tenure', accessor: (r) => r.tenure, type: 'number' },
	{ id: 'active', accessor: (r) => r.active, type: 'boolean' },
];

function log(line: string): void {
	process.stdout.write(`${line}\n`);
}

function fmt(ms: number): string {
	if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
	if (ms < 1000) return `${ms.toFixed(2)}ms`;
	return `${(ms / 1000).toFixed(2)}s`;
}

function bench(
	label: string,
	runs: number,
	fn: () => unknown,
): { mean: number; min: number; max: number } {
	for (let i = 0; i < 2; i++) fn();
	const samples: number[] = [];
	for (let i = 0; i < runs; i++) {
		const t0 = performance.now();
		fn();
		samples.push(performance.now() - t0);
	}
	const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
	const min = Math.min(...samples);
	const max = Math.max(...samples);
	log(
		`  ${label.padEnd(36)} ${fmt(mean).padStart(8)}  (min ${fmt(min).padStart(8)} / max ${fmt(max).padStart(8)})`,
	);
	return { mean, min, max };
}

function speedup(jsT: number, rsT: number): string {
	if (rsT === 0) return '∞';
	const ratio = jsT / rsT;
	return ratio >= 1 ? `${ratio.toFixed(2)}× faster` : `${(1 / ratio).toFixed(2)}× slower`;
}

async function main(): Promise<void> {
	const N = Number(process.env.BENCH_N ?? 1_000_000);
	const RUNS = Number(process.env.BENCH_RUNS ?? 5);
	log(`\n@tarbo-table benchmark — N=${N.toLocaleString()} rows, ${RUNS} runs each\n`);

	log('• generating data…');
	const t0 = performance.now();
	const data = genData(N);
	log(`  done in ${fmt(performance.now() - t0)}\n`);

	log('• one-time engine build (extract + ingest)');
	const tBuildJsStart = performance.now();
	const jsTable = createTable<Row>({
		data,
		columns: JS_COLUMNS,
		initialState: { pagination: { pageIndex: 0, pageSize: Number.POSITIVE_INFINITY } },
	});
	const jsBuildMs = performance.now() - tBuildJsStart;
	log(`  js createTable           ${fmt(jsBuildMs).padStart(8)}`);

	const tBuildRsStart = performance.now();
	const rsEngine = createNodeEngine(data, RS_COLUMNS);
	const rsBuildMs = performance.now() - tBuildRsStart;
	log(
		`  rs createNodeEngine      ${fmt(rsBuildMs).padStart(8)}  (extract + wasm ingest + finalize)\n`,
	);

	type Sample = { mean: number; min: number; max: number };
	const results: { name: string; js: Sample; rs: Sample }[] = [];

	{
		log('• filter: salary >= 50000');
		const pred = f.leaf<'salary'>('salary', '>=', 50000);
		const js = bench('  js setPredicate + getPaged', RUNS, () => {
			jsTable.setPredicate(null);
			jsTable.setPredicate(pred);
			return jsTable.getPagedIndices();
		});
		const rs = bench('  rs engine.filter', RUNS, () => rsEngine.filter(pred));
		log(`  → ${speedup(js.mean, rs.mean)}\n`);
		results.push({ name: 'filter / numeric >=', js, rs });
	}

	{
		log("• filter: dept = 'eng' AND salary >= 60000");
		const pred = f.and(f.leaf('dept', '=', 'eng'), f.leaf('salary', '>=', 60000));
		const js = bench('  js setPredicate + getPaged', RUNS, () => {
			jsTable.setPredicate(null);
			jsTable.setPredicate(pred);
			return jsTable.getPagedIndices();
		});
		const rs = bench('  rs engine.filter', RUNS, () => rsEngine.filter(pred));
		log(`  → ${speedup(js.mean, rs.mean)}\n`);
		results.push({ name: 'filter / AND(str=, num>=)', js, rs });
	}

	{
		log("• filter: name like 'Tan'");
		const pred = f.leaf('name', 'like', 'Tan');
		const js = bench('  js setPredicate + getPaged', RUNS, () => {
			jsTable.setPredicate(null);
			jsTable.setPredicate(pred);
			return jsTable.getPagedIndices();
		});
		const rs = bench('  rs engine.filter', RUNS, () => rsEngine.filter(pred));
		log(`  → ${speedup(js.mean, rs.mean)}\n`);
		results.push({ name: 'filter / string LIKE', js, rs });
	}

	{
		log('• sort: salary desc');
		const sort: SortSpec = [{ columnId: 'salary', dir: 'desc' }];
		const filteredFull = rsEngine.filter(null);
		const js = bench('  js setSort + getPaged', RUNS, () => {
			jsTable.setPredicate(null);
			jsTable.setSort([]);
			jsTable.setSort(sort);
			return jsTable.getPagedIndices();
		});
		const rs = bench('  rs engine.sort', RUNS, () => rsEngine.sort(filteredFull, sort));
		log(`  → ${speedup(js.mean, rs.mean)}\n`);
		results.push({ name: 'sort / numeric desc', js, rs });
	}

	{
		log('• sort: dept asc, salary desc');
		const sort: SortSpec = [
			{ columnId: 'dept', dir: 'asc' },
			{ columnId: 'salary', dir: 'desc' },
		];
		const filteredFull = rsEngine.filter(null);
		const js = bench('  js setSort + getPaged', RUNS, () => {
			jsTable.setPredicate(null);
			jsTable.setSort([]);
			jsTable.setSort(sort);
			return jsTable.getPagedIndices();
		});
		const rs = bench('  rs engine.sort', RUNS, () => rsEngine.sort(filteredFull, sort));
		log(`  → ${speedup(js.mean, rs.mean)}\n`);
		results.push({ name: 'sort / multi-key', js, rs });
	}

	{
		log('• full: filter(salary>=60000) → sort(salary desc) → page(0,100)');
		const pred = f.leaf('salary', '>=', 60000);
		const sort: SortSpec = [{ columnId: 'salary', dir: 'desc' }];
		const js = bench('  js setPredicate + setSort + page', RUNS, () => {
			jsTable.setPredicate(null);
			jsTable.setSort([]);
			jsTable.setPagination({ pageIndex: 0, pageSize: 100 });
			jsTable.setPredicate(pred);
			jsTable.setSort(sort);
			return jsTable.getPagedIndices();
		});
		const rs = bench('  rs filter → sort → page', RUNS, () => {
			const filtered = rsEngine.filter(pred);
			const sorted = rsEngine.sort(filtered, sort);
			return rsEngine.page(sorted, { pageIndex: 0, pageSize: 100 });
		});
		log(`  → ${speedup(js.mean, rs.mean)}\n`);
		results.push({ name: 'full pipeline / 100-row page', js, rs });
	}

	{
		log('• createTable({ engine: rsDriverFactory }) — same as UI demo');
		const pred = f.leaf('salary', '>=', 60000);
		const sort: SortSpec = [{ columnId: 'salary', dir: 'desc' }];

		const rsTableBuildStart = performance.now();
		const rsTable = createTable<Row>({
			data,
			columns: JS_COLUMNS,
			initialState: { pagination: { pageIndex: 0, pageSize: 100 } },
			engine: rsDriverFactory,
		});
		log(`  one-time build (rsDriverFactory): ${fmt(performance.now() - rsTableBuildStart)}\n`);

		const js = bench('  jsTable setPredicate + setSort + page', RUNS, () => {
			jsTable.setPredicate(null);
			jsTable.setSort([]);
			jsTable.setPagination({ pageIndex: 0, pageSize: 100 });
			jsTable.setPredicate(pred);
			jsTable.setSort(sort);
			return jsTable.getPagedIndices();
		});
		const rs = bench('  rsTable setPredicate + setSort + page', RUNS, () => {
			rsTable.setPredicate(null);
			rsTable.setSort([]);
			rsTable.setPagination({ pageIndex: 0, pageSize: 100 });
			rsTable.setPredicate(pred);
			rsTable.setSort(sort);
			return rsTable.getPagedIndices();
		});
		log(`  → ${speedup(js.mean, rs.mean)}\n`);
		results.push({ name: 'createTable({engine:rs}) full pipeline', js, rs });
		rsTable.dispose();
	}

	const COL1 = 38;
	const COL2 = 14;
	const COL3 = 14;
	const COL4 = 18;
	log('═'.repeat(COL1 + COL2 + COL3 + COL4 + 6));
	log(
		'  ' +
			'scenario'.padEnd(COL1) +
			'js mean'.padStart(COL2) +
			'rs mean'.padStart(COL3) +
			'speedup'.padStart(COL4),
	);
	log('─'.repeat(COL1 + COL2 + COL3 + COL4 + 6));
	for (const r of results) {
		log(
			'  ' +
				r.name.padEnd(COL1) +
				fmt(r.js.mean).padStart(COL2) +
				fmt(r.rs.mean).padStart(COL3) +
				speedup(r.js.mean, r.rs.mean).padStart(COL4),
		);
	}
	log('═'.repeat(COL1 + COL2 + COL3 + COL4 + 6));

	rsEngine.dispose();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
