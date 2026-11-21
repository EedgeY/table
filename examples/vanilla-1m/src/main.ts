import {
	type ColumnDef,
	createTable,
	f,
	type FilterOp,
	getVirtualRange,
	type RowId,
	type TableInstance,
} from '@tarbo-table/core';

type Row = {
	id: number;
	name: string;
	dept: string;
	city: string;
	status: string;
	salary: number;
	score: number;
};

const FIRST = [
	'Sato',
	'Suzuki',
	'Takahashi',
	'Tanaka',
	'Watanabe',
	'Ito',
	'Yamamoto',
	'Nakamura',
	'Kobayashi',
	'Kato',
];
const DEPTS = [
	'Engineering',
	'Sales',
	'Marketing',
	'Finance',
	'HR',
	'Operations',
	'Design',
	'Research',
	'Support',
	'Legal',
];
const CITIES = [
	'Tokyo',
	'Osaka',
	'Kyoto',
	'Sapporo',
	'Fukuoka',
	'Nagoya',
	'Sendai',
	'Yokohama',
	'Kobe',
	'Hiroshima',
];
const STATUS = ['active', 'onboarding', 'remote', 'leave'];

function mulberry32(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), a | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function genData(n: number): Row[] {
	const rand = mulberry32(42);
	const out: Row[] = new Array(n);
	for (let i = 0; i < n; i++) {
		out[i] = {
			id: i + 1,
			name: `${FIRST[Math.floor(rand() * FIRST.length)]} ${i + 1}`,
			dept: DEPTS[Math.floor(rand() * DEPTS.length)]!,
			city: CITIES[Math.floor(rand() * CITIES.length)]!,
			status: STATUS[Math.floor(rand() * STATUS.length)]!,
			salary: 35000 + Math.floor(rand() * 160000),
			score: Math.floor(rand() * 100),
		};
	}
	return out;
}

const columns: ColumnDef<Row>[] = [
	{ id: 'id', header: 'ID', accessor: (r) => r.id, type: 'number', defaultWidth: 90 },
	{ id: 'name', header: 'Name', accessor: (r) => r.name, defaultWidth: 180 },
	{ id: 'dept', header: 'Department', accessor: (r) => r.dept, defaultWidth: 140 },
	{ id: 'city', header: 'City', accessor: (r) => r.city, defaultWidth: 120 },
	{ id: 'status', header: 'Status', accessor: (r) => r.status, defaultWidth: 110 },
	{ id: 'salary', header: 'Salary', accessor: (r) => r.salary, type: 'number', defaultWidth: 130 },
	{ id: 'score', header: 'Score', accessor: (r) => r.score, type: 'number', defaultWidth: 100 },
];

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 64;

// ブラウザ (Blink/WebKit) は要素の最大高 ≒ 33,554,400px、
// transform の subpixel 精度は 2^24 = 16,777,216px が事実上の境界。
// それを超えるとレイアウトと translateY がズレ、スクロールが途中で詰まる。
// 1,000,000 行 × 30px = 30M px は普通に超える。
// 対策: spacer を MAX_SAFE_SCROLL までクランプし、scrollTop を virtual position に
// 線形マッピングする ("scroll proxy")。
const MAX_SAFE_SCROLL = 16_000_000;

const gridEl = document.getElementById('grid')!;
const statusEl = document.getElementById('status')!;
const perfEl = document.getElementById('perf')!;
const rowsSelect = document.getElementById('rows') as HTMLSelectElement;
const clearSortBtn = document.getElementById('clear-sort')!;
const clearFilterBtn = document.getElementById('clear-filter')!;

const scrollEl = document.createElement('div');
scrollEl.className = 'tg-scroll';
const headerEl = document.createElement('div');
headerEl.className = 'tg-header';
const spacerEl = document.createElement('div');
spacerEl.className = 'tg-spacer';
const rowsContainer = document.createElement('div');
rowsContainer.className = 'tg-rows';
spacerEl.appendChild(rowsContainer);
scrollEl.appendChild(headerEl);
scrollEl.appendChild(spacerEl);
gridEl.appendChild(scrollEl);

type FilterEntry = { op: FilterOp; value: string };
const filterInputs = new Map<string, FilterEntry>();
const rowPool: HTMLDivElement[] = [];
const cellPool = new WeakMap<HTMLDivElement, HTMLDivElement[]>();

let table: TableInstance<Row> = null!;

function totalWidth(): number {
	let w = 0;
	for (const c of columns) {
		w += table.getColumnWidth(c.id);
	}
	return w;
}

function buildHeader(): void {
	headerEl.innerHTML = '';
	headerEl.style.height = `${HEADER_HEIGHT}px`;
	headerEl.style.width = `${totalWidth()}px`;
	for (const col of columns) {
		const cell = document.createElement('div');
		cell.className = 'tg-th';
		cell.dataset.field = col.id;
		cell.style.width = `${table.getColumnWidth(col.id)}px`;

		const label = document.createElement('div');
		label.className = 'tg-th-label';
		label.textContent = col.header ?? col.id;
		const arrow = document.createElement('span');
		arrow.className = 'tg-sort-arrow';
		label.appendChild(arrow);
		label.addEventListener('click', (e) => {
			table.toggleSort(col.id, e.shiftKey);
		});
		cell.appendChild(label);

		const input = document.createElement('input');
		input.className = 'tg-filter';
		input.placeholder = col.type === 'number' ? '= 1000  /  >= 5000' : 'contains...';
		input.addEventListener('input', () => {
			const v = input.value.trim();
			if (v === '') {
				filterInputs.delete(col.id);
			} else {
				const parsed = parseFilter(v, col.type === 'number');
				filterInputs.set(col.id, parsed);
			}
			applyFilters();
		});
		cell.appendChild(input);

		const resize = document.createElement('div');
		resize.className = 'tg-resize';
		attachResize(resize, col.id);
		cell.appendChild(resize);

		headerEl.appendChild(cell);
	}
	updateHeaderSortIndicators();
}

function parseFilter(raw: string, isNumeric: boolean): FilterEntry {
	const m = raw.match(/^\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
	if (m) {
		return { op: m[1] as FilterOp, value: m[2]!.trim() };
	}
	return { op: isNumeric ? '=' : 'like', value: raw };
}

function applyFilters(): void {
	const leaves = Array.from(filterInputs.entries()).map(([columnId, { op, value }]) =>
		f.leaf(columnId, op, value),
	);
	if (leaves.length === 0) {
		table.setPredicate(null);
		return;
	}
	if (leaves.length === 1) {
		table.setPredicate(leaves[0]!);
		return;
	}
	table.setPredicate(f.and(...leaves));
}

function attachResize(handle: HTMLDivElement, columnId: string): void {
	let startX = 0;
	let startWidth = 0;
	const onMove = (e: PointerEvent): void => {
		const dx = e.clientX - startX;
		table.setColumnWidth(columnId, startWidth + dx);
		const th = headerEl.querySelector<HTMLDivElement>(`.tg-th[data-field="${columnId}"]`);
		if (th) th.style.width = `${table.getColumnWidth(columnId)}px`;
		headerEl.style.width = `${totalWidth()}px`;
		spacerEl.style.width = `${totalWidth()}px`;
		render();
	};
	const onUp = (e: PointerEvent): void => {
		handle.releasePointerCapture(e.pointerId);
		handle.classList.remove('dragging');
		handle.removeEventListener('pointermove', onMove);
		handle.removeEventListener('pointerup', onUp);
	};
	handle.addEventListener('pointerdown', (e: PointerEvent) => {
		e.preventDefault();
		startX = e.clientX;
		startWidth = table.getColumnWidth(columnId);
		handle.setPointerCapture(e.pointerId);
		handle.classList.add('dragging');
		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
	});
}

function updateHeaderSortIndicators(): void {
	const spec = table.getState().sort;
	const map = new Map(spec.map((k, i) => [k.columnId, { dir: k.dir, idx: i }]));
	for (const th of headerEl.querySelectorAll<HTMLDivElement>('.tg-th')) {
		const field = th.dataset.field!;
		const arrow = th.querySelector<HTMLSpanElement>('.tg-sort-arrow')!;
		const info = map.get(field);
		if (info) {
			th.classList.add('sorted');
			arrow.textContent =
				info.dir === 'asc'
					? `▲${spec.length > 1 ? info.idx + 1 : ''}`
					: `▼${spec.length > 1 ? info.idx + 1 : ''}`;
		} else {
			th.classList.remove('sorted');
			arrow.textContent = '';
		}
	}
}

function createRowEl(): HTMLDivElement {
	const row = document.createElement('div');
	row.className = 'tg-row';
	row.style.height = `${ROW_HEIGHT}px`;
	row.style.width = `${totalWidth()}px`;
	const cells: HTMLDivElement[] = [];
	for (const col of columns) {
		const td = document.createElement('div');
		td.className = `tg-td${col.type === 'number' ? ' num' : ''}`;
		td.style.width = `${table.getColumnWidth(col.id)}px`;
		row.appendChild(td);
		cells.push(td);
	}
	cellPool.set(row, cells);
	row.addEventListener('click', () => {
		const id = row.dataset.id as RowId | undefined;
		if (id !== undefined) {
			table.toggleRow(id);
		}
	});
	return row;
}

function render(): void {
	const total = table.getRowCount().visible;
	const totalHeight = total * ROW_HEIGHT;

	const clientH = scrollEl.clientHeight;
	const viewport = Math.max(0, clientH - HEADER_HEIGHT);

	const useProxy = totalHeight > MAX_SAFE_SCROLL;
	const proxyHeight = useProxy ? MAX_SAFE_SCROLL : totalHeight;
	spacerEl.style.height = `${proxyHeight}px`;
	spacerEl.style.width = `${totalWidth()}px`;

	const rawScrollTop = scrollEl.scrollTop;
	const proxyMax = Math.max(1, proxyHeight - viewport);
	const virtualMax = Math.max(0, totalHeight - viewport);
	const virtualScrollTop = useProxy ? (rawScrollTop * virtualMax) / proxyMax : rawScrollTop;

	const range = getVirtualRange({
		scrollTop: virtualScrollTop,
		viewportHeight: viewport,
		rowHeight: ROW_HEIGHT,
		overscan: 6,
		totalRows: total,
	});

	const indices = table.getVisibleIndices();
	const data = (window as unknown as { __DATA__: Row[] }).__DATA__;
	const selection = table.getState().selection.ids;

	const needed = range.endIdx - range.startIdx;
	while (rowPool.length < needed) {
		const r = createRowEl();
		rowsContainer.appendChild(r);
		rowPool.push(r);
	}

	for (let i = 0; i < needed; i++) {
		const visIdx = range.startIdx + i;
		const dataIdx = indices[visIdx]!;
		const row = data[dataIdx]!;
		const el = rowPool[i]!;
		const renderY = visIdx * ROW_HEIGHT - virtualScrollTop + rawScrollTop;
		el.style.transform = `translateY(${renderY}px)`;
		el.style.width = `${totalWidth()}px`;
		el.style.display = '';
		el.classList.toggle('alt', (visIdx & 1) === 1);

		const rowId = String(row.id) as RowId;
		el.dataset.id = rowId;
		el.classList.toggle('selected', selection.has(rowId));

		const cells = cellPool.get(el)!;
		for (let c = 0; c < columns.length; c++) {
			const col = columns[c]!;
			const td = cells[c]!;
			td.style.width = `${table.getColumnWidth(col.id)}px`;
			const v = col.accessor(row);
			td.textContent =
				v == null ? '' : col.type === 'number' ? (v as number).toLocaleString() : String(v);
		}
	}
	for (let i = needed; i < rowPool.length; i++) {
		rowPool[i]!.style.display = 'none';
	}

	updateHeaderSortIndicators();
	updateStatus();
}

function updateStatus(): void {
	const c = table.getRowCount();
	const sel = table.getState().selection.ids.size;
	statusEl.textContent = `${c.paged.toLocaleString()} of ${c.visible.toLocaleString()} visible · ${c.total.toLocaleString()} total · ${sel} selected`;
}

function loadData(n: number): void {
	const t0 = performance.now();
	const data = genData(n);
	(window as unknown as { __DATA__: Row[] }).__DATA__ = data;
	const t1 = performance.now();

	if (table == null) {
		table = createTable<Row>({
			data,
			columns,
			selectionMode: 'multi',
			getRowId: (r) => String(r.id),
		});
		table.subscribe(() => render());
	} else {
		table.setData(data);
	}
	buildHeader();
	render();

	const t2 = performance.now();
	perfEl.textContent = `${n.toLocaleString()} rows · gen ${(t1 - t0).toFixed(0)}ms · first paint ${(t2 - t1).toFixed(0)}ms`;
}

scrollEl.addEventListener(
	'scroll',
	() => {
		requestAnimationFrame(render);
	},
	{ passive: true },
);

rowsSelect.addEventListener('change', () => loadData(Number(rowsSelect.value)));
clearSortBtn.addEventListener('click', () => table.setSort([]));
clearFilterBtn.addEventListener('click', () => {
	filterInputs.clear();
	for (const i of headerEl.querySelectorAll<HTMLInputElement>('.tg-filter')) {
		i.value = '';
	}
	table.setPredicate(null);
});

loadData(Number(rowsSelect.value));

window.addEventListener('resize', render);
