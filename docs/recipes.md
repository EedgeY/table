# レシピ集（サンプルコード）

実コードを抜粋した、ユースケース別のレシピ集。`examples/vanilla-1m` と `examples/react-supabase` の実装をベースにしています。

---

## 目次

1. [最小: バニラ JS で 1000 行テーブル](#1-最小-バニラ-js-で-1000-行テーブル)
2. [1M 行: getVirtualRange で自前仮想スクロール](#2-1m-行-getvirtualrange-で自前仮想スクロール)
3. [React + DataTable で Supabase 風 UI](#3-react--datatable-で-supabase-風-ui)
4. [WASM エンジンに切り替え](#4-wasm-エンジンに切り替え)
5. [マルチレベルヘッダー](#5-マルチレベルヘッダー)
6. [リッチセル全種類](#6-リッチセル全種類)
7. [リレーション展開（サブテーブル）](#7-リレーション展開サブテーブル)
8. [グルーピング + 集計](#8-グルーピング--集計)
9. [集約・ピボット (純関数)](#9-集約ピボット-純関数)
10. [インライン編集 + Undo/Redo](#10-インライン編集--undoredo)
11. [キーボードフォーカス + 範囲コピー](#11-キーボードフォーカス--範囲コピー)
12. [URL 同期 + コマンドバー](#12-url-同期--コマンドバー)
13. [チャート表示](#13-チャート表示)
14. [サーバーモード + Realtime](#14-サーバーモード--realtime)
15. [REST DataSource](#15-rest-datasource)
16. [永続化 (localStorage / URL)](#16-永続化-localstorage--url)
17. [条件付き書式 (ヒートマップ / データバー)](#17-条件付き書式-ヒートマップ--データバー)
18. [CSV / TSV / XLSX エクスポート](#18-csv--tsv--xlsx-エクスポート)
19. [クリップボード貼り付け (Excel/Sheets 互換)](#19-クリップボード貼り付け-excelsheets-互換)
20. [多言語化 (i18n)](#20-多言語化-i18n)

---

## 1. 最小: バニラ JS で 1000 行テーブル

```ts
import { createTable, f, type ColumnDef } from '@tarbo-table/core';

type Row = { id: number; name: string; salary: number };

const data: Row[] = Array.from({ length: 1000 }, (_, i) => ({
	id: i + 1,
	name: `User ${i + 1}`,
	salary: 30000 + i * 100,
}));

const columns: ColumnDef<Row>[] = [
	{ id: 'id', accessor: (r) => r.id, type: 'number' },
	{ id: 'name', accessor: (r) => r.name },
	{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
];

const table = createTable<Row>({ data, columns, pageSize: 50 });

// フィルタ・ソート
table.setPredicate(f.leaf('salary', '>=', 50000));
table.setSort([{ columnId: 'salary', dir: 'desc' }]);

// 描画
function render() {
	const rows = table.getPagedRows();
	const html = rows
		.map(({ row }) => `<tr><td>${row.id}</td><td>${row.name}</td><td>${row.salary}</td></tr>`)
		.join('');
	document.querySelector('tbody')!.innerHTML = html;
}

table.subscribe(render);
render();
```

---

## 2. 1M 行: getVirtualRange で自前仮想スクロール

`examples/vanilla-1m/src/main.ts` のパターン。DOM 100% 自前で 1M 行をスムーズにスクロールさせる。

### HTML 構造

```html
<div class="tg-scroll">
	<!-- overflow:auto; position:relative -->
	<div class="tg-header">...</div>
	<!-- position:sticky; top:0 -->
	<div class="tg-spacer">
		<!-- height = 全体高さ -->
		<div class="tg-rows">
			<!-- position:absolute; top:0 -->
			<!-- 行プール: viewport 分だけ -->
		</div>
	</div>
</div>
```

### render 関数の核心

```ts
import { getVirtualRange } from '@tarbo-table/core';

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 36;

function render(): void {
	const total = table.getRowCount().visible;
	const totalHeight = total * ROW_HEIGHT;

	const clientH = scrollEl.clientHeight;
	const viewport = Math.max(0, clientH - HEADER_HEIGHT);

	// ─── 16.7M-px スクロール精度問題への対処 ───
	// ブラウザの transform subpixel 精度の境界 (2^24 = 16,777,216px) を
	// 超えると translateY がズレてスクロールが詰まる。
	// 対策: spacer 高さを 16M に切り詰め、scrollTop を仮想 position に
	//       線形マッピングする "scroll proxy" を使う
	const MAX_SAFE_SCROLL = 16_000_000;
	const useProxy = totalHeight > MAX_SAFE_SCROLL;
	const proxyHeight = useProxy ? MAX_SAFE_SCROLL : totalHeight;
	spacerEl.style.height = `${proxyHeight}px`;

	const rawScrollTop = scrollEl.scrollTop;
	const proxyMax = Math.max(1, proxyHeight - viewport);
	const virtualMax = Math.max(0, totalHeight - viewport);
	const virtualScrollTop = useProxy ? (rawScrollTop * virtualMax) / proxyMax : rawScrollTop;

	// ─── getVirtualRange で描画範囲を計算 ───
	const range = getVirtualRange({
		scrollTop: virtualScrollTop,
		viewportHeight: viewport,
		rowHeight: ROW_HEIGHT,
		overscan: 6,
		totalRows: total,
	});

	// ─── filter+sort 後のインデックスを取得 ───
	const indices = table.getVisibleIndices(); // Uint32Array

	// ─── 行プールを再利用しつつ translateY で配置 ───
	const needed = range.endIdx - range.startIdx;
	for (let i = 0; i < needed; i++) {
		const visIdx = range.startIdx + i;
		const dataIdx = indices[visIdx]!;
		const row = data[dataIdx]!;
		const el = rowPool[i]!;

		// 重要: rawScrollTop を基準に translateY を計算することで、
		// transform 値が viewport 近傍に収まり精度問題を回避
		const renderY = visIdx * ROW_HEIGHT - virtualScrollTop + rawScrollTop;
		el.style.transform = `translateY(${renderY}px)`;
		el.style.display = '';
		// セル内容を更新...
	}
	// 余った要素を非表示
	for (let i = needed; i < rowPool.length; i++) {
		rowPool[i]!.style.display = 'none';
	}
}

scrollEl.addEventListener('scroll', () => requestAnimationFrame(render), { passive: true });
```

### 行プール初期化（DOM 再利用）

```ts
const rowPool: HTMLElement[] = [];
const POOL_SIZE = Math.ceil(viewport / ROW_HEIGHT) + 12; // overscan 込み

for (let i = 0; i < POOL_SIZE; i++) {
	const row = document.createElement('div');
	row.className = 'tg-row';
	row.style.position = 'absolute';
	row.style.top = '0';
	row.style.left = '0';
	row.style.height = `${ROW_HEIGHT}px`;
	rowsContainer.appendChild(row);
	rowPool.push(row);
}
```

### CSS

```css
.tg-scroll {
	overflow: auto;
	position: relative;
	contain: strict;
}
.tg-header {
	position: sticky;
	top: 0;
	z-index: 2;
}
.tg-spacer {
	position: relative;
}
.tg-rows {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
}

.tg-row {
	position: absolute;
	top: 0;
	left: 0;
	will-change: transform;
	contain: layout paint; /* 行単位の再描画コストを最小化 */
}
```

---

## 3. React + DataTable で Supabase 風 UI

```tsx
import { useMemo } from 'react';
import { createTable, type ColumnDef } from '@tarbo-table/core';
import { DataTable } from '@tarbo-table/ui';
import '@tarbo-table/ui/styles.css';

type Row = { id: number; name: string; dept: string; salary: number };

export function App({ data }: { data: Row[] }) {
	const columns: ColumnDef<Row>[] = useMemo(
		() => [
			{ id: 'id', accessor: (r) => r.id, type: 'number', defaultWidth: 80 },
			{ id: 'name', accessor: (r) => r.name, defaultWidth: 180 },
			{ id: 'dept', accessor: (r) => r.dept, defaultWidth: 140 },
			{ id: 'salary', accessor: (r) => r.salary, type: 'number', defaultWidth: 120 },
		],
		[],
	);

	const table = useMemo(
		() =>
			createTable<Row>({
				data,
				columns,
				pageSize: 100,
				selectionMode: 'multi',
				getRowId: (r) => String(r.id),
			}),
		[data, columns],
	);

	return <DataTable table={table} />;
}
```

これで仮想スクロール / ソート / フィルタチップ / ページネーション / エクスポートが全部動く。

---

## 4. WASM エンジンに切り替え

```tsx
import { useRsDriverFactory } from '@tarbo-table/core-rs/react';
import { createTable } from '@tarbo-table/core';
import { DataTable } from '@tarbo-table/ui';
import { useMemo, useEffect } from 'react';

function MyTable({ data, columns }) {
	const rsFactory = useRsDriverFactory(); // null → 関数

	const table = useMemo(() => {
		if (!rsFactory) return null;
		return createTable({ data, columns, engine: rsFactory, pageSize: 100 });
	}, [rsFactory, data, columns]);

	// メモリ解放
	useEffect(() => {
		return () => {
			table?.dispose();
		};
	}, [table]);

	if (!table) return <div>loading engine…</div>;
	return <DataTable table={table} />;
}
```

---

## 5. マルチレベルヘッダー

`ColumnNode` に `kind: 'group'` を混ぜると自動でマルチレベルヘッダーになります。

```ts
import type { ColumnNode } from '@tarbo-table/core';

const columns: ColumnNode<Employee>[] = [
  { id: 'id', accessor: (r) => r.id, type: 'number' },
  {
    kind: 'group',
    id: 'profile',
    header: 'プロフィール',
    children: [
      { id: 'name',    accessor: (r) => r.name,    header: '氏名' },
      { id: 'email',   accessor: (r) => r.email,   header: 'メール' },
      { id: 'address', accessor: (r) => r.address, header: '住所' },
    ],
  },
  {
    kind: 'group',
    id: 'compensation',
    header: '給与',
    children: [
      { id: 'salary', accessor: (r) => r.salary, type: 'number' },
      { id: 'bonus',  accessor: (r) => r.bonus,  type: 'number' },
    ],
  },
];

<DataTable table={table} headerMode="auto" />
//                       ↑ 既定。group があれば自動でマルチレベル
```

---

## 6. リッチセル全種類

`column.type` + `cellMeta` の組み合わせで 9 種のリッチセルが使えます。

### 画像セル

```ts
{
  id: 'photo',
  accessor: (r) => r.name,       // ソート用のスカラー値
  type: 'image',
  cellMeta: (r) => ({ kind: 'image', src: r.photo, alt: r.name }),
}
```

### ユーザーセル（アバター + 名前 + メール）

```ts
{
  id: 'user',
  accessor: (r) => r.name,
  type: 'user',
  cellMeta: (r) => ({
    kind: 'user',
    name: r.name,
    email: r.email,
    avatar: r.photo,
  }),
}
```

### スパークライン

```ts
{
  id: 'performance',
  accessor: (r) => r.performance.at(-1) ?? 0,   // 最新値をソートに
  type: 'sparkline',
  cellMeta: (r) => ({
    kind: 'sparkline',
    values: r.performance,                       // number[]
    color: 'oklch(0.78 0.16 165)',
  }),
}
```

### 星評価

```ts
{
  id: 'rating',
  accessor: (r) => r.rating,
  type: 'star',
  cellMeta: (r) => ({ kind: 'star', value: r.rating, max: 5 }),
}
```

### タグ

```ts
{
  id: 'skills',
  accessor: (r) => r.skills.join(', '),
  type: 'tags',
  cellMeta: (r) => ({
    kind: 'tags',
    tags: r.skills.map((s) => ({ label: s })),
    max: 3,
  }),
}
```

### プログレスバー

```ts
{
  id: 'workload',
  accessor: (r) => r.workload,
  type: 'progress',
  cellMeta: (r) => ({ kind: 'progress', value: r.workload, max: 100 }),
}
```

### リンク

```ts
{
  id: 'more_info',
  accessor: (r) => r.more_info,
  type: 'link',
}
// row.more_info に { href, label?, external? } 形式のオブジェクトを持つか、
// cellMeta で kind:'link' を返す
```

### チェックボックス

```ts
{
  id: 'opt_in',
  accessor: (r) => r.opt_in,
  type: 'checkbox',
}
```

### リレーション

```ts
{
  id: 'manager',
  accessor: (r) => managers[r.manager_id - 1]?.name ?? null,
  type: 'relation',
  cellMeta: (r) => {
    const m = managers[r.manager_id - 1];
    if (!m) return null;
    return {
      kind: 'relation',
      recordRef: { tableId: 'managers', rowId: m.id },
      label: m.name,
      avatar: m.avatar,
    };
  },
}
```

---

## 7. リレーション展開（サブテーブル）

`createMemoryRelationSource` + `relations` オプションで自動的にサブテーブル展開が動きます。

```ts
import { createMemoryRelationSource } from '@tarbo-table/core';

const relations = createMemoryRelationSource({
  managers: {
    rows: managersData,
    columns: managerColumns,
    getRowId: (r) => String(r.id),
  },
  departments: {
    rows: departmentsData,
    columns: deptColumns,
    getRowId: (r) => String(r.id),
  },
});

const table = createTable<Employee>({
  data,
  columns,
  relations,
});

<DataTable table={table} />
// リレーション列をクリックするとサブテーブルが展開される
```

`<DataTable />` は内部で `useExpandedRows` を使って 1 行 1 展開の制約で開閉します。

---

## 8. グルーピング + 集計

```ts
import { withGrouping } from '@tarbo-table/core/grouping';
import { withAggregate } from '@tarbo-table/core/aggregate';

const table = withGrouping(createTable<Employee>({ data, columns }));
// withGrouping は withAggregate も同時 attach

table.setGroupBy(['dept']);
table.setAggregations([
	{ columnId: 'salary', fn: 'sum' },
	{ columnId: 'salary', fn: 'avg' },
]);

// 階層ツリー
const tree = table.getGroupedRows();
for (const node of tree) {
	console.log(node.key, node.aggregates.salary);
}

// 仮想スクロール用 flat 化
const flat = table.getFlatGroupedRows();
// → [{ kind: 'group', node: ... }, { kind: 'row', row: ..., depth: 1 }, ...]

// 折り畳み
table.toggleCollapsed(JSON.stringify(['eng']));
```

UI から操作する場合は `<DataTable />` が自動的に `<GroupingDropdown />` を Toolbar に出します。

### ネストグルーピング (2 段)

```ts
table.setGroupBy(['region', 'dept']);
// region > dept の 2 段ネストツリーになる
```

---

## 9. 集約・ピボット (純関数)

```ts
import { aggregate, pivot } from '@tarbo-table/core';

const rows = table.getVisibleRows().map((r) => r.row);
const cols = table.getColumns();

// ─── 全体集計 ───
const total = aggregate(rows, cols, {
	columns: { salary: 'sum', age: 'avg' },
});
console.log(total[0].values); // { salary: 12345678, age: 35.4 }

// ─── 1 段 groupBy ───
const byDept = aggregate(rows, cols, {
	groupBy: 'dept',
	columns: { salary: 'avg', id: 'count' },
});

// ─── パーセンタイル ───
const p95 = aggregate(rows, cols, {
	columns: { salary: 'p95' },
});

// ─── ピボット (rows × cols × values) ───
const indices = rows.map((_, i) => i);
const result = pivot(rows, cols, indices, {
	rows: ['dept'],
	cols: ['role'],
	values: [
		{ columnId: 'salary', fn: 'sum' },
		{ columnId: 'id', fn: 'count' },
	],
});

// result.matrix[r][c * 2 + 0] = salary sum (dept r, role c)
// result.matrix[r][c * 2 + 1] = id count   (dept r, role c)
```

---

## 10. インライン編集 + Undo/Redo

### ColumnEditMeta の宣言

```ts
import type { ColumnEditMeta } from '@tarbo-table/ui';
import type { ColumnNode } from '@tarbo-table/core';

const columns: Array<ColumnNode<Employee> & { edit?: ColumnEditMeta<Employee> }> = [
	{
		id: 'name',
		accessor: (r) => r.name,
		edit: {
			editor: { kind: 'text' },
			validate: (v) =>
				typeof v === 'string' && v.length > 0 && v.length < 40
					? null
					: '1〜40 文字で入力してください',
		},
	},
	{
		id: 'dept',
		accessor: (r) => r.dept,
		edit: {
			editor: {
				kind: 'select',
				options: DEPTS.map((d) => ({ value: d, label: d })),
			},
		},
	},
	{
		id: 'salary',
		accessor: (r) => r.salary,
		type: 'number',
		edit: { editor: { kind: 'number', step: 10000, min: 0 } },
	},
	{
		id: 'active',
		accessor: (r) => r.active,
		type: 'boolean',
		edit: { editor: { kind: 'boolean' } },
	},
];
```

### withEdit の attach

```ts
import { withEdit } from '@tarbo-table/core/edit';
import { withFocus } from '@tarbo-table/core/focus';
import { createMemoryDataSource } from '@tarbo-table/core';

const dataSource = createMemoryDataSource(initialRows, (r) => String(r.id));

const table = withFocus(
	withEdit(
		createTable<Employee>({
			data: initialRows,
			columns,
			dataSource,
			getRowId: (r) => String(r.id),
		}),
		{ maxHistory: 50 },
	),
);

// Undo / Redo
table.canUndo(); // boolean
await table.undo();
table.canRedo();
await table.redo();

// セル状態
const { dirty, inFlight, error } = table.getCellEdit(rowId, 'name');
```

### `<DataTable />` の自動連携

`column.edit` が設定されていて `EditMixin` が attach されていれば、`<DataTable />` が自動で `<EditableCell />` を挿入します。F2 / Enter で編集、Escape でキャンセル、Tab で次セル、boolean は即 commit。

---

## 11. キーボードフォーカス + 範囲コピー

```ts
import { withFocus } from '@tarbo-table/core/focus';

const table = withFocus(createTable<Row>(...));

// プログラム操作
table.setFocus({ rowId, columnId: 'name' });
table.moveFocus('down');               // 'up' | 'down' | 'left' | 'right'
                                       // 'home' | 'end' | 'pageUp' | 'pageDown'

// 範囲選択
table.beginRange();
table.extendRange('right');
table.extendRange('down');
const cells = table.getRangeCells();   // [{ rowId, columnId }, ...]
```

`<DataTable />` 内では以下のキー操作が自動的に動きます:

| キー        | 動作                              |
| ----------- | --------------------------------- |
| Arrow       | フォーカス移動                    |
| Shift+Arrow | 範囲選択                          |
| PageUp/Down | ページ単位移動                    |
| Home/End    | 行頭/行末                         |
| Escape      | フォーカス・範囲クリア            |
| Ctrl/Cmd+C  | 範囲を TSV でクリップボードコピー |

---

## 12. URL 同期 + コマンドバー

```tsx
import { CommandLineInput, useTableUrlState } from '@tarbo-table/ui';
import { NuqsAdapter } from 'nuqs/adapters/react';

// ルート近くに NuqsAdapter
createRoot(root).render(
	<NuqsAdapter>
		<App />
	</NuqsAdapter>,
);

function App() {
	const { value, setValue } = useTableUrlState(table, {
		key: 'ttq',
		history: 'replace',
		throttleMs: 150,
	});

	const [chart, setChart] = useState<ChartConfig | null>(null);

	return (
		<>
			<CommandLineInput
				table={table}
				value={value}
				onValueChange={setValue}
				onChartConfig={setChart}
			/>
			{chart ? <DataChart table={table} chart={chart} /> : <DataTable table={table} />}
		</>
	);
}
```

URL は `?ttq=salary%3E%3D50000+dept%3Deng+by+-salary` のように同期されます。

---

## 13. チャート表示

`<CommandLineInput />` でチャート構文を入力すると `onChartConfig` が呼ばれます:

```
chart bar by dept sum:salary
chart pie by status count:id
chart combo by month sum:revenue, avg:price
```

```tsx
const [chart, setChart] = useState<ChartConfig | null>(null);

<CommandLineInput table={table} onChartConfig={setChart} />;

{
	chart ? (
		<DataChart
			table={table}
			chart={chart}
			onCategoryClick={(cat) => {
				// カテゴリクリックでフィルタを自動追加（既定動作）
				// false を渡すと無効化
			}}
		/>
	) : (
		<DataTable table={table} />
	);
}
```

純関数で組み立てる場合:

```ts
import { buildChartData } from '@tarbo-table/core/chart';

const data = buildChartData(rows, columns, {
	type: 'bar',
	groupBy: 'dept',
	metrics: [{ fn: 'sum', columnId: 'salary' }],
});
// data は ChartCategoryData | ChartBubbleData
```

---

## 14. サーバーモード + Realtime

```ts
import type { DataSource, RealtimeEvent } from '@tarbo-table/core';

const dataSource: DataSource<Row> = {
  async fetch(query) {
    const params = new URLSearchParams();
    if (query.predicate) params.set('q', stringifyPredicate(query.predicate));
    params.set('limit', String(query.pagination.pageSize));
    params.set('offset', String(query.pagination.pageIndex * query.pagination.pageSize));

    const res = await fetch(`/api/rows?${params}`, { signal: query.signal });
    const json = await res.json();
    return { rows: json.rows, totalCount: json.total };
  },

  async updateCell({ rowId, columnId, value }) {
    const res = await fetch(`/api/rows/${rowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ [columnId]: value }),
    });
    if (!res.ok) return { ok: false, error: { code: 'http', message: res.statusText } };
    return { ok: true, value: await res.json() };
  },

  subscribe(cb) {
    const ws = new WebSocket('wss://example.com/rows');
    ws.onmessage = (e) => {
      const event: RealtimeEvent<Row> = JSON.parse(e.data);
      cb(event);
    };
    return () => ws.close();
  },
};

const table = createTable<Row>({
  columns,
  mode: 'server',
  dataSource,
  serverDebounceMs: 100,
  pageSize: 50,
  getRowId: (r) => String(r.id),
});

// 無限スクロール対応の場合
<DataTable table={table} infiniteScroll infiniteThreshold={200} />
```

---

## 15. REST DataSource

シンプルな REST API なら `createRestDataSource` を使うと早いです。

```ts
import { createRestDataSource } from '@tarbo-table/core/source-rest';

const dataSource = createRestDataSource<Row>({
	baseUrl: 'https://api.example.com',
	resource: 'employees',
	idOf: (r) => r.id,
	headers: () => ({
		Authorization: `Bearer ${token}`,
		'X-Tenant': tenantId,
	}),
});

const table = createTable<Row>({ columns, mode: 'server', dataSource });
```

カスタマイズが必要なら `encodeFilter` / `encodeSort` / `parseResponse` を渡します。

```ts
const dataSource = createRestDataSource<Row>({
	baseUrl: '...',
	resource: 'employees',
	idOf: (r) => r.id,
	encodeFilter: (predicate) => {
		// Predicate AST を独自の URL パラメータ形式に変換
		return { filter: JSON.stringify(predicate) };
	},
	encodeSort: (sort) => ({
		order_by: sort.map((k) => `${k.dir === 'desc' ? '-' : ''}${k.columnId}`).join(','),
	}),
	parseResponse: (json) => ({
		rows: json.data,
		totalCount: json.meta.total,
	}),
});
```

---

## 16. 永続化 (localStorage / URL)

### localStorage

```ts
import { withPersist } from '@tarbo-table/core/persist';

const table = withPersist(createTable<Row>({ data, columns }), {
	key: 'employee-table',
	storage: 'local',
	include: ['sort', 'columnSizing', 'columnVisibility'],
	debounceMs: 100,
});

// 手動操作
table.flushPersist(); // debounce を待たず即時保存
table.reloadPersist(); // 保存済みを読み直す
table.clearPersist(); // 永続化停止 & 削除
```

### URL searchParams

```ts
withPersist(table, { key: 'state', storage: 'url' });
// → URL に ?tt_state=... が付く
```

### sessionStorage（カスタム）

```ts
withPersist(table, {
	key: 'session-table',
	storage: {
		load: (k) => sessionStorage.getItem(k),
		save: (k, v) => sessionStorage.setItem(k, v),
	},
});
```

### Mixin との組み合わせ

```ts
// withPersist は最外側 → grouping 状態も保存される
const table = withPersist(
  withGrouping(createTable(...)),
  { key: 't', storage: 'local' },
);
```

---

## 17. 条件付き書式 (ヒートマップ / データバー)

`ColumnDef.cellStyle` に `ConditionalCellMeta` を付けると `<DataTable />` が自動で評価します。

```ts
import type { ConditionalCellMeta } from '@tarbo-table/core/conditional-style';

const salaryStyle: ConditionalCellMeta<Employee> = {
	rules: [
		// ヒートマップ
		{
			kind: 'scale',
			min: 300_000,
			max: 1_000_000,
			minColor: '#e0f2fe',
			maxColor: '#fde68a',
		},
		// 閾値超過で強調
		{
			kind: 'compare',
			op: '>=',
			threshold: 900_000,
			style: { color: '#dc2626', fontWeight: 'bold' },
		},
	],
};

const columns = [
	{
		id: 'salary',
		accessor: (r) => r.salary,
		type: 'number',
		cellStyle: salaryStyle,
	},
];
```

### データバー

```ts
const progressStyle: ConditionalCellMeta<Row> = {
	rules: [{ kind: 'bar', min: 0, max: 100, color: '#3b82f6' }],
};
```

### カスタム関数

```ts
const customStyle: ConditionalCellMeta<Row> = {
	rules: [
		{
			kind: 'fn',
			compute: ({ row, value }) => {
				if (row.status === 'error') return { backgroundColor: '#fee', color: '#900' };
				if (typeof value === 'number' && value < 0) return { color: 'red' };
				return null;
			},
		},
	],
};
```

---

## 18. CSV / TSV / XLSX エクスポート

### `<ExportMenu />` を使う（推奨）

```tsx
import { ExportMenu } from '@tarbo-table/ui';

<ExportMenu table={table} scope="visible" fileName="employees" />;
```

`<DataTable />` の `<Toolbar />` には既定で含まれています。

### プログラムから

```ts
import { exportRows } from '@tarbo-table/core/export';
import { exportXlsx } from '@tarbo-table/core/xlsx';

// CSV
const rows = table.getVisibleRows().map((r) => r.row);
const csv = exportRows(rows, table.getColumns(), { format: 'csv', bom: true });

const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
const url = URL.createObjectURL(blob);
const a = Object.assign(document.createElement('a'), { href: url, download: 'data.csv' });
a.click();
URL.revokeObjectURL(url);

// XLSX
const bytes = exportXlsx(rows, table.getColumns(), { sheetName: '従業員一覧' });
const xlsxBlob = new Blob([bytes], {
	type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
```

---

## 19. クリップボード貼り付け (Excel/Sheets 互換)

```ts
import { buildPasteCellPatches, parseTsv } from '@tarbo-table/core/clipboard';

// 1. クリップボードから TSV を取得
const tsv = await navigator.clipboard.readText();

// 2. パッチを生成
const patches = buildPasteCellPatches({
	tsv,
	anchor: { rowIndex: focusedRowIndex, columnIndex: focusedColIndex },
	rows: table.getVisibleRows().map((r) => r.row),
	rowIds: table.getVisibleRows().map((r) => r.id),
	columns: table.getColumns(),
	parsers: {
		// 列ごとの型変換 (任意)
		salary: (raw) => Number(raw),
		active: (raw) => raw === 'true' || raw === '1',
	},
});

// 3. DataSource で一括更新
await dataSource.bulkUpdate(patches);
```

### コピー側

```ts
import { toTsv } from '@tarbo-table/core';

const selectedRows = [...].map((id) => rowsById.get(id));
const tsv = toTsv(selectedRows, table.getColumns());
await navigator.clipboard.writeText(tsv);
```

`<DataTable />` で `FocusMixin` 付きの場合、Ctrl/Cmd+C は範囲を自動で TSV にしてクリップボードコピーします。

---

## 20. 多言語化 (i18n)

### ロケール切り替え

```tsx
import { TableLocaleProvider } from '@tarbo-table/ui';

<TableLocaleProvider locale="en" currency="USD">
	<DataTable table={table} />
</TableLocaleProvider>;
```

### 個別文言の上書き

```tsx
<TableLocaleProvider
	locale="ja"
	messages={{
		'toolbar.sort': '並び替え',
		'filter.addFilter': '条件を追加',
	}}
>
	<DataTable table={table} />
</TableLocaleProvider>
```

### カスタム文言の参照

```tsx
import { useT } from '@tarbo-table/ui';

function MyButton() {
	const t = useT();
	return <button>{t('toolbar.export')}</button>;
}
```

### 数値・通貨フォーマット

```tsx
import { useTableLocale } from '@tarbo-table/ui';

function PriceCell({ value }: { value: number }) {
	const { currencyFormat } = useTableLocale();
	return <span>{currencyFormat.format(value)}</span>; // ¥123,456
}
```

---

## 関連ドキュメント

- [はじめに](./getting-started.md)
- [@tarbo-table/core API](./api/core.md)
- [@tarbo-table/ui API](./api/ui.md)
- [@tarbo-table/core-rs API](./api/core-rs.md)
- [CLI クエリ DSL](./query-dsl.md)
- [拡張ガイド](./extending.md)
