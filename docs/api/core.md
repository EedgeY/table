# `@tarbo-table/core` API リファレンス

ゼロ依存のヘッドレステーブルコア。状態とロジックのみを提供し、レンダリングは消費側に委ねる。

> このファイルは `@tarbo-table/core` の **全公開 API** を網羅した完全リファレンスです。サンプルコードは [recipes.md](../recipes.md)、CLI DSL の構文は [query-dsl.md](../query-dsl.md)、Mixin の積み順は [extending.md](../extending.md) を参照してください。

---

## 目次

1. [`createTable` と `TableInstance`](#createtable-と-tableinstance)
2. [`ColumnDef` / `ColumnGroupDef` / `CellMeta`](#columndef--columngroupdef--cellmeta)
3. [`f` フィルタビルダー / `Predicate` AST](#f-フィルタビルダー--predicate-ast)
4. [`SortKey` / `SortSpec`](#sortkey--sortspec)
5. [`SelectionState` / `RowId`](#selectionstate--rowid)
6. [`PaginationState` / `PaginationDerived`](#paginationstate--paginationderived)
7. [`getVirtualRange` — 仮想スクロール計算](#getvirtualrange--仮想スクロール計算)
8. [集約: `aggregate` / `withAggregate`](#集約-aggregate--withaggregate)
9. [グルーピング: `withGrouping`](#グルーピング-withgrouping)
10. [`buildHeaderMatrix` — マルチレベルヘッダー](#buildheadermatrix--マルチレベルヘッダー)
11. [DataSource インターフェース](#datasource-インターフェース)
12. [REST DataSource](#rest-datasource)
13. [RelationSource](#relationsource)
14. [編集: `withEdit`](#編集-withedit)
15. [フォーカス: `withFocus`](#フォーカス-withfocus)
16. [永続化: `withPersist`](#永続化-withpersist)
17. [CSV / TSV エクスポート](#csv--tsv-エクスポート)
18. [XLSX エクスポート](#xlsx-エクスポート)
19. [チャートデータ整形](#チャートデータ整形)
20. [クエリ DSL: `parseQuery` / `stringifyQuery`](#クエリ-dsl-parsequery--stringifyquery)
21. [ピボット: `pivot`](#ピボット-pivot)
22. [条件付き書式: `evaluateCellStyle`](#条件付き書式-evaluatecellstyle)
23. [クリップボード: `toTsv` / `parseTsv` / `buildPasteCellPatches`](#クリップボード-totsv--parsetsv--buildpastecellpatches)
24. [カスタムエンジン: `EngineDriver`](#カスタムエンジン-enginedriver)
25. [サブパス import / バンドル戦略](#サブパス-import--バンドル戦略)

---

## `createTable` と `TableInstance`

### `createTable<TRow>(options): TableInstance<TRow>`

テーブルインスタンスを生成するファクトリ関数。

```ts
import { createTable } from '@tarbo-table/core';

const table = createTable<Row>({
	data: rows,
	columns,
	pageSize: 100,
	selectionMode: 'multi',
	getRowId: (r) => String(r.id),
});
```

### `CreateTableOptions<TRow>`

| フィールド         | 型                                     | 必須                | 説明                                              |
| ------------------ | -------------------------------------- | ------------------- | ------------------------------------------------- |
| `data`             | `ReadonlyArray<TRow>`                  | client モードで必須 | 行データ。client モードで使用                     |
| `columns`          | `ReadonlyArray<ColumnNode<TRow>>`      | ✅                  | 列定義（ネスト可・マルチレベルヘッダー対応）      |
| `getRowId`         | `(row: TRow, index: number) => string` | ◯                   | 行 ID 導出関数。省略時は index を文字列化         |
| `initialState`     | `Partial<TableState>`                  | ◯                   | 初期状態の上書き                                  |
| `pageSize`         | `number`                               | ◯                   | 1 ページの行数（省略時 `Infinity` = ページなし）  |
| `selectionMode`    | `'none' \| 'single' \| 'multi'`        | ◯                   | 行選択モード（既定 `'none'`）                     |
| `mode`             | `'client' \| 'server'`                 | ◯                   | データ取得モード（既定 `'client'`）               |
| `dataSource`       | `DataSource<TRow>`                     | server モードで必須 | fetch / 編集 / Realtime バックエンド              |
| `serverDebounceMs` | `number`                               | ◯                   | server モードの fetch debounce ms（既定 50）      |
| `engine`           | `EngineDriverFactory<TRow>`            | ◯                   | パイプラインバックエンド差し替え（例: Rust WASM） |
| `relations`        | `RelationSource`                       | ◯                   | リレーション解決バックエンド                      |

> `mode='server'` で `dataSource.fetch` が未定義の場合は `createTable` 時に throw します。

### `TableState` — 不変な状態オブジェクト

```ts
type TableState = Readonly<{
	predicate: Predicate | null;
	sort: SortSpec;
	selection: SelectionState;
	pagination: PaginationState;
	columnSizing: ColumnSizingState;
	columnVisibility: ColumnVisibilityState;
	columnPinning: ColumnPinningState;
}>;
```

`Object.freeze` 済み。setter を呼ぶたびに新しい state が生成され、全 listener に通知されます。

> **state 外のクロージャ状態**: `groupBy` / `collapsed` / `aggregations` / `focus` / `range` / `editState` は `TableState` には載りません。これらは Mixin が個別に管理しており、`subscribeWithSelector` では観測できません。Mixin の専用購読 API (`subscribeFocus` / `subscribeEdit` など) または素の `subscribe` を使ってください。

### `TableInstance<TRow>` — メソッド完全一覧

#### データ系

| メソッド                                   | 説明                                                           |
| ------------------------------------------ | -------------------------------------------------------------- |
| `setData(data: ReadonlyArray<TRow>): void` | 行データを差し替え。pagination をクランプして通知              |
| `dispose(): void`                          | エンジンドライバの `dispose` を呼ぶ。JS 既定エンジンでは no-op |

#### フィルタ・ソート

| メソッド                                                | 説明                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `setPredicate(predicate: Predicate \| null): void`      | フィルタ条件をセット（`null` でリセット）                     |
| `setSort(spec: SortSpec): void`                         | ソートキー配列を一括セット                                    |
| `toggleSort(columnId: string, additive: boolean): void` | `asc → desc → off` サイクル。`additive=true` で既存キーに追加 |

#### ページネーション

| メソッド                                               | 説明                                |
| ------------------------------------------------------ | ----------------------------------- |
| `setPagination(patch: Partial<PaginationState>): void` | `pageIndex` / `pageSize` を部分更新 |

#### 列操作

| メソッド                                                             | 説明                                                                                                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setColumnWidth(columnId, px): void`                                 | 列幅を `minWidth`/`maxWidth` でクランプしてセット                                                                                                   |
| `setColumnVisibility(columnId, visible): void`                       | 列の表示/非表示を明示的にセット                                                                                                                     |
| `toggleColumnVisibility(columnId): void`                             | 列の表示/非表示をトグル                                                                                                                             |
| `setColumnPinning(columnId, pin: ColumnPinning \| null): void`       | 列を左/右に固定。`null` で固定解除                                                                                                                  |
| `setComputedColumns(specs: ReadonlyArray<ComputedColumnSpec>): void` | `parseQuery` の `let …;` 句を有効列として登録/差し替え。土台列の上に specs を順にコンパイルし、以後 filter/sort/描画/export が参照可。`[]` で全解除 |

#### 行選択

| メソッド                     | 説明                                 |
| ---------------------------- | ------------------------------------ |
| `selectRow(id: RowId): void` | 行を選択（`mode='single'` では排他） |
| `toggleRow(id: RowId): void` | 行選択をトグル                       |
| `clearSelection(): void`     | 全選択解除                           |

#### Getter — 状態

| メソッド           | 戻り値                                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| `getState()`       | `TableState`                                                                |
| `getMode()`        | `'client' \| 'server'`                                                      |
| `getServerState()` | `ServerState<TRow>` (`status`, `rows`, `totalCount`, `error`, `nextCursor`) |

#### Getter — 列

| メソッド                   | 戻り値                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `getColumnTree()`          | `ReadonlyArray<ColumnNode<TRow>>` — ネスト構造のまま                                                |
| `getColumns()`             | `ReadonlyArray<ColumnDef<TRow>>` — 葉のみ flat 化（順序保持）。computed column 登録後はそれらも含む |
| `getBaseColumns()`         | computed column を除いた土台列（`opts.columns` の葉）。`let …;` 句の parse 用スキーマ               |
| `getVisibleColumns()`      | 非表示列を除いた列一覧                                                                              |
| `getColumnWidth(columnId)` | 列幅（未設定時 `defaultWidth ?? 120`）                                                              |
| `getPinnedColumns()`       | `{ left, center, right }` ピン固定別                                                                |

#### Getter — 行

| メソッド               | 戻り値                                                                            |
| ---------------------- | --------------------------------------------------------------------------------- |
| `getVisibleRows()`     | `ReadonlyArray<VisibleRow<TRow>>` (filter+sort 後・ページング前)                  |
| `getPagedRows()`       | `ReadonlyArray<VisibleRow<TRow>>` (filter+sort+page 後)                           |
| `getVisibleIndices()`  | `Uint32Array` — filter+sort 後の元データインデックス                              |
| `getPagedIndices()`    | `Uint32Array` — 現在ページの元データインデックス                                  |
| `getPagination()`      | `PaginationDerived` (`pageCount`, `canPrev`, `canNext`, `startIndex`, `endIndex`) |
| `getRowCount()`        | `{ total, visible, paged }`                                                       |
| `getRowId(row, index)` | `RowId`                                                                           |
| `getRelationSource()`  | `RelationSource \| null`                                                          |

#### 購読

| メソッド                                                          | 説明                                               |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| `subscribe(listener: () => void): () => void`                     | 全状態変化を購読。返り値は unsubscribe 関数        |
| `subscribeWithSelector<T>(select, listener, equals?): () => void` | 状態スライスのみ購読（既定 equals は `Object.is`） |

#### Server モード専用

| メソッド                     | 説明                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| `refresh(): Promise<void>`   | 現在の state で再 fetch（client では no-op）                         |
| `fetchMore(): Promise<void>` | 無限スクロール: `nextCursor` で次ページを追記                        |
| `applyRowEvent(event)`       | Realtime 差分更新。`{ kind: 'insert' \| 'update' \| 'delete', ... }` |

### `VisibleRow<TRow>`

```ts
type VisibleRow<TRow> = {
	readonly id: RowId;
	readonly index: number; // 元データでのインデックス
	readonly row: TRow;
};
```

---

## `ColumnDef` / `ColumnGroupDef` / `CellMeta`

### `ColumnDef<TRow>` — 列定義の本体

```ts
type ColumnDef<TRow> = {
	readonly id: string; // 列 ID（必須）
	readonly accessor: (row: TRow) => CellValue; // 値取得関数（必須）
	readonly type?: ColumnType; // filter/sort 挙動に影響
	readonly header?: string; // 表示名（省略時は id）
	readonly defaultWidth?: number; // px
	readonly minWidth?: number;
	readonly maxWidth?: number;
	readonly sortable?: boolean; // 省略時は defaultSortableFor(type)
	readonly filterable?: boolean; // 省略時は defaultFilterableFor(type)
	readonly hidden?: boolean; // 初期非表示
	readonly cellMeta?: (row: TRow) => CellMeta | null; // セル描画用メタ
	readonly cellStyle?: ConditionalCellMeta<TRow>; // 条件付き書式
	readonly filterFallback?: ColumnFilterFallback; // 'disabled' | 'on-label' | 'on-accessor'
	readonly sortFallback?: ColumnSortFallback;
};
```

### `ColumnType`

```ts
type ColumnType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'image'
	| 'link'
	| 'sparkline'
	| 'checkbox'
	| 'relation'
	| 'relation-many'
	| 'star'
	| 'tags'
	| 'progress'
	| 'user';
```

### `CellMeta` — 判別共用体

| `kind`            | フィールド                                                        |
| ----------------- | ----------------------------------------------------------------- |
| `'image'`         | `{ src; alt?; width?; height? }`                                  |
| `'link'`          | `{ href; label?; external? }`                                     |
| `'sparkline'`     | `{ values: number[]; baseline?; color? }`                         |
| `'checkbox'`      | `{ checked; indeterminate? }`                                     |
| `'relation'`      | `{ recordRef: RowRef; label; avatar?; color? }`                   |
| `'relation-many'` | `{ refs: ReadonlyArray<RelationRef>; max? }`                      |
| `'star'`          | `{ value; max? }`                                                 |
| `'tags'`          | `{ tags: ReadonlyArray<{ label; color? }>; max? }`                |
| `'progress'`      | `{ value; max?; color?; label?: 'percent' \| 'value' \| 'none' }` |
| `'user'`          | `{ name; email?; avatar?; color? }`                               |

### `RowRef` / `RelationRef`

```ts
type RowRef = { tableId: string; rowId: string | number };

type RelationRef = {
	recordRef: RowRef;
	label: string;
	avatar?: string;
	color?: string;
};
```

### `ColumnGroupDef<TRow>` — マルチレベルヘッダー

```ts
type ColumnGroupDef<TRow> = {
	kind: 'group';
	id: string;
	header: string;
	children: ReadonlyArray<ColumnNode<TRow>>; // 葉 or グループの混在可
};

type ColumnNode<TRow> = ColumnLeaf<TRow> | ColumnGroupDef<TRow>;
```

### 列ユーティリティ

| 関数                         | 説明                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| `defaultFilterableFor(type)` | type ごとの default filterable（`image` / `sparkline` は false） |
| `defaultSortableFor(type)`   | type ごとの default sortable（`image` のみ false）               |
| `isColumnLeaf(node)`         | 型ガード                                                         |
| `isColumnGroup(node)`        | 型ガード                                                         |
| `flattenColumns(nodes)`      | ツリーから葉のみを順序保ちで抽出                                 |

---

## `f` フィルタビルダー / `Predicate` AST

### `Predicate` の構造

```ts
type Predicate = Leaf | Group;

type Leaf = {
	kind: 'leaf';
	columnId: string;
	op: FilterOp;
	value?: CellValue | CellValue[];
	caseSensitive?: boolean;
};

type Group = {
	kind: 'group';
	combinator: 'and' | 'or';
	children: Predicate[];
	negate?: boolean;
};
```

### `FilterOp`

```ts
type FilterOp =
	| '='
	| '!='
	| '>'
	| '<'
	| '>='
	| '<='
	| 'like'
	| 'startsWith'
	| 'endsWith'
	| 'isNull'
	| 'isNotNull'
	| 'in';
```

### `f` ビルダー API

```ts
import { f } from '@tarbo-table/core';

// 単一条件
const p1 = f.leaf('salary', '>=', 50000);

// AND グループ
const p2 = f.and(f.leaf('dept', '=', 'eng'), f.leaf('salary', '>=', 70000));

// OR + 否定
const p3 = f.not(f.or(f.leaf('status', '=', 'archived'), f.leaf('name', 'isNull')));

// 同一列の複合条件
const p4 = f.column({
	columnId: 'salary',
	combinator: 'and',
	conditions: [
		{ op: '>=', value: 50000 },
		{ op: '<', value: 100000 },
	],
});

// 適用
table.setPredicate(p2);
```

| メソッド   | シグネチャ                                       |
| ---------- | ------------------------------------------------ |
| `f.leaf`   | `(columnId, op, value?, caseSensitive?) => Leaf` |
| `f.and`    | `(...children) => Group`                         |
| `f.or`     | `(...children) => Group`                         |
| `f.not`    | `(p) => Group`                                   |
| `f.column` | `(cf: ColumnFilter) => Group`                    |

> `f.leaf` の戻り値は `Object.freeze` 済みです。

### caseSensitive

`like` / `startsWith` / `endsWith` / `=` などの文字列演算で `caseSensitive: true` を指定すると case-sensitive 比較になります（既定は case-insensitive）。

---

## `SortKey` / `SortSpec`

```ts
type SortDir = 'asc' | 'desc';

type SortKey = {
	columnId: string;
	dir: SortDir;
	nulls?: 'first' | 'last';
};

type SortSpec = ReadonlyArray<SortKey>;
```

```ts
// マルチカラムソート
table.setSort([
	{ columnId: 'dept', dir: 'asc' },
	{ columnId: 'salary', dir: 'desc', nulls: 'last' },
]);
```

ソートは **stable**。同一値の行は元の順序を保つ。

---

## `SelectionState` / `RowId`

```ts
type RowId = string; // branded type
type SelectionMode = 'none' | 'single' | 'multi';

type SelectionState = {
	mode: SelectionMode;
	ids: ReadonlySet<RowId>;
};

function createSelectionState(mode?: SelectionMode): SelectionState;
```

選択は `RowId` でキーイングされるため、filter / sort / pagination が変わっても消えません（行が存在し続ける限り）。

---

## `PaginationState` / `PaginationDerived`

```ts
type PaginationState = {
	pageIndex: number;
	pageSize: number;
};

type PaginationDerived = {
	pageCount: number;
	canPrev: boolean;
	canNext: boolean;
	startIndex: number;
	endIndex: number;
};

function createPaginationState(pageSize?: number): PaginationState;
```

`pageSize: Number.POSITIVE_INFINITY` で「全件表示（ページなし）」になります。

---

## `getVirtualRange` — 仮想スクロール計算

DOM 非依存の純関数。スクロール位置から「今描画すべき行範囲」を計算する。

```ts
import { getVirtualRange } from '@tarbo-table/core';

const range = getVirtualRange({
	scrollTop: el.scrollTop,
	viewportHeight: el.clientHeight,
	rowHeight: 32,
	overscan: 6,
	totalRows: table.getRowCount().visible,
});

// range = { startIdx, endIdx, paddingTop, paddingBottom }
```

| 入力フィールド   | 説明                               |
| ---------------- | ---------------------------------- |
| `scrollTop`      | スクロールコンテナの `scrollTop`   |
| `viewportHeight` | コンテナの可視高さ                 |
| `rowHeight`      | 行 1 つの高さ（px、均一前提）      |
| `overscan`       | 表示範囲の上下に余分に描画する行数 |
| `totalRows`      | 行総数                             |

`@tarbo-table/ui` の `<DataTable />` は内部でこれを使っています。自前 DOM 実装での使用例は [recipes.md](../recipes.md) を参照。

---

## 集約: `aggregate` / `withAggregate`

### `aggregate<TRow>(rows, columns, opts): ReadonlyArray<AggregateBucket>`

groupBy なし or 1 段 groupBy の純関数集計。

```ts
import { aggregate } from '@tarbo-table/core';

// 全体集計
const overall = aggregate(rows, columns, {
	columns: { salary: 'sum', age: 'avg' },
});
// → [{ key: null, count: N, values: { salary: 1234, age: 35 } }]

// groupBy 集計
const byDept = aggregate(rows, columns, {
	groupBy: 'dept',
	columns: { salary: 'avg' },
});
// → [{ key: 'eng', count, values }, { key: 'sales', ... }]
```

### `AggregateFn`

| 関数       | 説明                  |
| ---------- | --------------------- |
| `'sum'`    | 合計                  |
| `'avg'`    | 平均                  |
| `'min'`    | 最小                  |
| `'max'`    | 最大                  |
| `'count'`  | 件数（null 含む全行） |
| `'median'` | 中央値                |
| `'p95'`    | 95 パーセンタイル     |
| `'stddev'` | 標準偏差（母集団）    |

### `withAggregate<TRow>(table): TableInstance & AggregateMixin`

テーブル全体に対するフッター集計を提供する mixin。**冪等**。

```ts
import { withAggregate } from '@tarbo-table/core';

const t = withAggregate(createTable(...));
t.setAggregations([{ columnId: 'salary', fn: 'sum' }]);
const totals = t.getOverallAggregates();   // { salary: 12345678 }
```

| メソッド                 | 説明                               |
| ------------------------ | ---------------------------------- |
| `setAggregations(specs)` | 集約 spec を更新                   |
| `getAggregations()`      | 現在の spec 一覧                   |
| `getOverallAggregates()` | filter+sort 後の全行に対する集計値 |

---

## グルーピング: `withGrouping`

階層 groupBy + 折り畳み + flat 化を提供する mixin。内部で `withAggregate` も自動 attach するので、グループ集計が同時に使える。

```ts
import { withGrouping } from '@tarbo-table/core';

const t = withGrouping(createTable(...));

t.setGroupBy(['dept', 'role']);             // 2 段ネスト
t.setAggregations([{ columnId: 'salary', fn: 'sum' }]);
t.toggleCollapsed('["eng"]');               // path を JSON 文字列で

const tree = t.getGroupedRows();            // RowGroupTree
const flat = t.getFlatGroupedRows();        // 仮想スクロール用 flat 配列
```

### `RowGroupNode`

```ts
type RowGroupNode = {
	key: CellValue | null;
	path: ReadonlyArray<CellValue | null>;
	depth: number;
	indices: Uint32Array; // 配下の行インデックス
	children: ReadonlyArray<RowGroupNode>;
	aggregates: Readonly<Record<string, number | null>>;
};
```

### `FlatGroupRow<TRow>`

仮想スクロール用に group header と data row を混在させた 1 次元配列の要素。

```ts
type FlatGroupRow<TRow> =
	| { kind: 'group'; node: RowGroupNode }
	| { kind: 'row'; id: RowId; row: TRow; index: number; depth: number };
```

### `GroupingMixin<TRow>` メソッド

| メソッド                      | 説明                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `setGroupBy(columnIds)`       | groupBy 列の配列を一括セット（変更で collapsed リセット） |
| `getGroupBy()`                | 現在の groupBy 列                                         |
| `setCollapsedGroups(pathIds)` | 折り畳み中の path ID 集合を一括セット                     |
| `toggleCollapsed(pathId)`     | 1 グループの折り畳みをトグル                              |
| `getCollapsedGroups()`        | 折り畳み中 path ID の集合                                 |
| `getGroupedRows()`            | グループ階層ツリー                                        |
| `getFlatGroupedRows()`        | flat 化された配列                                         |

---

## `buildHeaderMatrix` — マルチレベルヘッダー

`ColumnNode` ツリーから `rowSpan`/`colSpan` 付き 2 次元ヘッダー配列を構築する純関数。`<thead>` 描画用。

```ts
import { buildHeaderMatrix } from '@tarbo-table/core';

const matrix = buildHeaderMatrix(table.getColumnTree());
// matrix: HeaderCell[][]
// matrix[rowIndex][colIndex] = { id, label, colSpan, rowSpan, isLeaf, columnId? }
```

```ts
type HeaderCell = {
	id: string;
	label: string;
	colSpan: number;
	rowSpan: number;
	isLeaf: boolean;
	columnId?: string; // isLeaf=true のときのみ
};

type HeaderMatrix = ReadonlyArray<ReadonlyArray<HeaderCell>>;
```

---

## DataSource インターフェース

`mode: 'server'` で fetch を委譲する、もしくは編集（`withEdit`）の commit 先として使うバックエンド抽象。

```ts
type DataSource<TRow> = {
	fetch?: (q: FetchQuery) => Promise<FetchResult<TRow>>;
	updateCell?: (input) => Promise<Result<TRow, EditError>>;
	bulkUpdate?: (patches) => Promise<Result<TRow[], EditError>>;
	insertRow?: (row) => Promise<Result<TRow, EditError>>;
	deleteRows?: (rowIds) => Promise<Result<void, EditError>>;
	subscribe?: (cb) => Unsubscribe;
};
```

### `FetchQuery`

```ts
type FetchQuery = {
	predicate: Predicate | null;
	sort: SortSpec;
	pagination: PaginationState;
	extra?: Record<string, unknown>;
	signal?: AbortSignal;
};
```

### `FetchResult<TRow>`

```ts
type FetchResult<TRow> = {
	rows: ReadonlyArray<TRow>;
	totalCount: number;
	nextCursor?: string | null; // 無限スクロール用
};
```

### `RealtimeEvent<TRow>`

```ts
type RealtimeEvent<TRow> =
	| { kind: 'insert'; row: TRow }
	| { kind: 'update'; rowId: RowId; row: TRow }
	| { kind: 'delete'; rowId: RowId };
```

### `createMemoryDataSource<TRow>(initial, getRowId)`

テスト・プロトタイプ用のインメモリ実装。全 CRUD + fetch を備える。

```ts
import { createMemoryDataSource } from '@tarbo-table/core';

const ds = createMemoryDataSource(rows, (r) => String(r.id));
// 追加で .getRows(): ReadonlyArray<TRow> も持つ
```

---

## REST DataSource

`@tarbo-table/core/source-rest` から `createRestDataSource` をインポート。REST API を `DataSource<TRow>` として包む薄いアダプタ。

```ts
import { createRestDataSource } from '@tarbo-table/core/source-rest';

const ds = createRestDataSource<Row>({
	baseUrl: 'https://api.example.com',
	resource: 'employees',
	idOf: (r) => r.id,
	headers: () => ({ Authorization: `Bearer ${token}` }),
});
```

### `RestSourceOptions<TRow>`

| フィールド       | 型                                | 説明                             |
| ---------------- | --------------------------------- | -------------------------------- |
| `baseUrl`        | `string`                          | API ベース URL                   |
| `resource`       | `string`                          | リソース名（例: `'employees'`）  |
| `idOf`           | `(row: TRow) => string \| number` | 行 → ID 抽出                     |
| `headers?`       | `() => Record<string, string>`    | 動的ヘッダ                       |
| `encodeFilter?`  | `FilterEncoder`                   | filter → URL params カスタム変換 |
| `encodeSort?`    | `SortEncoder`                     | sort → URL params カスタム変換   |
| `parseResponse?` | `(json) => FetchResult<TRow>`     | レスポンス変換                   |
| `fetchImpl?`     | `typeof fetch`                    | テスト用差し替え                 |

### デフォルト動作

- **filter**: top-level AND of leaves を `?col=value` フラットパラメータに変換。OR / ネストは `encodeFilter` カスタムが必要。
- **sort**: `?_sort=col1:asc,col2:desc` 形式。
- **pagination**: `?_limit=N&_offset=M`。
- **parseResponse**: `{ rows, totalCount }` または配列直接を受け付ける。

---

## RelationSource

別テーブル（リレーション先）のレコード解決を抽象化する trait。

```ts
type RelationSource = {
	fetchByIds: (
		tableId: string,
		ids: ReadonlyArray<string | number>,
	) => Promise<ReadonlyArray<unknown>>;
	fetchByQuery?: (tableId: string, query: FetchQuery) => Promise<FetchResult<unknown>>;
	getColumns: (tableId: string) => ReadonlyArray<ColumnDef<unknown>>;
	subscribe?: (tableId: string, cb: () => void) => Unsubscribe;
};
```

### `createMemoryRelationSource(tables)`

テスト・モック用。複数テーブルを `Record` で保持。

```ts
import { createMemoryRelationSource } from '@tarbo-table/core';

const rs = createMemoryRelationSource({
  managers: {
    rows: managers,
    columns: managerColumns,
    getRowId: (r) => String(r.id) as RowId,
  },
  departments: { ... },
});

createTable<Row>({ ..., relations: rs });
```

UI 側の `<SubDataTable />` がこれを使ってリレーション展開セルの中身を fetch します。

---

## 編集: `withEdit`

楽観 UI + Undo/Redo + セル単位 dirty/inFlight/error 管理を提供する mixin。

```ts
import { withEdit } from '@tarbo-table/core';

const t = withEdit(createTable({ ..., dataSource }), { maxHistory: 50 });

const result = await t.commitEdit({ rowId, columnId: 'salary', value: 80000 });
// → Result<TRow, EditError>

t.canUndo();    // true
await t.undo();
```

### `EditMixin<TRow>` メソッド

| メソッド                          | 説明                                                |
| --------------------------------- | --------------------------------------------------- |
| `getEditState()`                  | dirty/inFlight/errors の全体状態                    |
| `commitEdit(input)`               | 楽観 UI で即時反映 → `dataSource.updateCell` で確定 |
| `rollbackCell(rowId, columnId)`   | 変更を取り消し                                      |
| `clearEditError(rowId, columnId)` | エラーをクリア                                      |
| `undo()` / `redo()`               | Promise<Result<void, EditError>> を返す             |
| `canUndo()` / `canRedo()`         | boolean                                             |
| `subscribeEdit(cb)`               | EditState 変化を購読                                |
| `getCellEdit(rowId, columnId)`    | `{ dirty, inFlight, error }` をまとめて取得         |

`dataSource.updateCell` が未指定の場合はオフライン編集として動作（メモリ上で行を書き換えるだけ）。

---

## フォーカス: `withFocus`

キーボードナビゲーション + 矩形範囲選択を提供する mixin。

```ts
import { withFocus } from '@tarbo-table/core';

const t = withFocus(createTable(...));

t.setFocus({ rowId, columnId: 'name' });
t.moveFocus('down');                     // 'up' | 'down' | 'left' | 'right' | 'home' | 'end' | 'pageUp' | 'pageDown'

// 範囲選択
t.beginRange();
t.extendRange('right');
t.extendRange('down');
const cells = t.getRangeCells();  // [{ rowId, columnId }, ...]
```

### `FocusMixin` メソッド

| メソッド                                          | 説明                                                |
| ------------------------------------------------- | --------------------------------------------------- |
| `getFocus()` / `setFocus(focus)` / `clearFocus()` | フォーカス操作                                      |
| `moveFocus(direction, pageSize?)`                 | 方向移動（pageSize は pageUp/Down で使用、既定 10） |
| `subscribeFocus(cb)`                              | フォーカス変更のみ購読                              |
| `getRange()` / `setRange(range)`                  | 矩形範囲操作                                        |
| `beginRange()`                                    | 現フォーカスを anchor として範囲を開始              |
| `extendRange(direction, pageSize?)`               | head のみ移動（Shift+Arrow 相当）                   |
| `clearRange()`                                    | 矩形選択を解除                                      |
| `getRangeCells()`                                 | range 内全セル位置を列挙                            |

`<DataTable />` は `FocusMixin` が attach されている場合、自動でキーボード操作を有効化します。

---

## 永続化: `withPersist`

localStorage / URL searchParams / カスタム storage に状態スナップショットを保存・復元する mixin。

```ts
import { withPersist } from '@tarbo-table/core';

const t = withPersist(
  withGrouping(createTable(...)),
  {
    key: 'my-table',
    storage: 'local',                       // 'local' | 'url' | PersistStorage
    include: ['sort', 'columnSizing'],      // 保存対象を絞る
    debounceMs: 100,
  },
);
```

### `PersistOptions`

| フィールド   | 既定      | 説明                                                                                                                    |
| ------------ | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `key`        | —         | ストレージキー（必須）                                                                                                  |
| `storage`    | `'local'` | `'local'` (localStorage) / `'url'` (URL params `tt_<key>`) / カスタム `PersistStorage`                                  |
| `include`    | 全項目    | `'predicate' \| 'sort' \| 'pagination' \| 'columnSizing' \| 'columnVisibility' \| 'columnPinning' \| 'grouping'` の配列 |
| `debounceMs` | `100`     | 書き込み debounce ms                                                                                                    |

### カスタム `PersistStorage`

```ts
type PersistStorage = {
	load(key: string): string | null;
	save(key: string, value: string): void;
};
```

例: `sessionStorage` を使う:

```ts
withPersist(table, {
	key: 'session-table',
	storage: {
		load: (k) => sessionStorage.getItem(k),
		save: (k, v) => sessionStorage.setItem(k, v),
	},
});
```

### `PersistMixin` メソッド

| メソッド          | 説明                        |
| ----------------- | --------------------------- |
| `flushPersist()`  | debounce を待たず即時保存   |
| `reloadPersist()` | 保存済みを読み直して適用    |
| `clearPersist()`  | 永続化停止 & 保存済みを削除 |

> **積み順**: `withPersist` は他の mixin の **外側** に置きます。`withGrouping` の後に呼ぶと grouping 状態も保存対象になります。

---

## CSV / TSV エクスポート

```ts
import { exportRows } from '@tarbo-table/core/export';

const csv = exportRows(
	table.getVisibleRows().map((r) => r.row),
	table.getColumns(),
	{
		format: 'csv', // 'csv' | 'tsv' (既定: 'csv')
		includeHeader: true,
		bom: true, // 既定 true（Excel 日本語対応）
		formatCell: (val, col) => String(val ?? ''),
		eol: '\r\n', // 既定 '\r\n'
		columns: visibleColumns, // 出力列を絞る
	},
);

// ダウンロード
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'table.csv';
a.click();
URL.revokeObjectURL(url);
```

RFC 4180 準拠（クォート・改行のエスケープ）。

---

## XLSX エクスポート

zero-dep で Office Open XML バイナリを生成。シングルシート、文字列/数値/boolean 対応。

```ts
import { exportXlsx } from '@tarbo-table/core/xlsx';

const bytes: Uint8Array = exportXlsx(rows, columns, {
	sheetName: '従業員一覧',
	formatCell: (val, col) => val,
});

const blob = new Blob([bytes], {
	type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
```

> **非対応**: 複数シート / スタイル・罫線・色 / 数式 / 画像。高度な XLSX が必要なら外部ライブラリ（exceljs 等）を検討してください。

---

## チャートデータ整形

`aggregate` を内部で呼び、UI の SVG レンダラが消費するチャート用データを生成する純関数。

```ts
import { buildChartData } from '@tarbo-table/core/chart';

const data = buildChartData(rows, columns, {
	type: 'bar', // 'bar' | 'line' | 'pie' | 'combo' | 'bubble'
	groupBy: 'dept',
	metrics: [{ fn: 'sum', columnId: 'salary' }],
});
```

### `ChartConfig`

```ts
type ChartConfig = {
	type: 'bar' | 'line' | 'pie' | 'combo' | 'bubble';
	groupBy: string;
	metrics: ReadonlyArray<{ fn: AggregateFn; columnId: string }>;
};
```

### `ChartData` バリアント

- `ChartCategoryData` (`type: 'bar' | 'line' | 'pie' | 'combo'`) — categories × metrics 配列
- `ChartBubbleData` (`type: 'bubble'`) — `{ points, axisLabels: { x, y, r } }`

`<DataChart />` (UI パッケージ) はこれを使って SVG をレンダリングします。

---

## クエリ DSL: `parseQuery` / `stringifyQuery`

`"salary>=50000 name~'田中' by -age"` のような文字列を `{ predicate, sort, chart? }` に変換、または逆変換する。

```ts
import {
	parseQuery,
	stringifyQuery,
	stringifyPredicate,
	stringifySort,
} from '@tarbo-table/core/query';

const result = parseQuery('salary>=50000 dept=eng by -salary', columns);
if (result.ok) {
	table.setPredicate(result.value.predicate);
	table.setSort(result.value.sort);
} else {
	console.error(result.error); // { message, position, token? }
}

// 逆変換（URL 永続化 / コマンドバー復元）
const str = stringifyQuery({
	predicate: table.getState().predicate,
	sort: table.getState().sort,
});
```

DSL の完全な構文は [query-dsl.md](../query-dsl.md) を参照。

### `Result<T, E>`

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

`parseQuery` の戻り値型。エラー時の `position` は **文字オフセット**（0-indexed）で、UI 側で `^` インジケータ表示に使えます。

---

## ピボット: `pivot`

rows × cols × values の 3 軸クロス集計を提供する純関数。

```ts
import { pivot } from '@tarbo-table/core';

const result = pivot(rows, columns, indices, {
	rows: ['dept'],
	cols: ['role'],
	values: [
		{ columnId: 'salary', fn: 'sum' },
		{ columnId: 'id', fn: 'count' },
	],
});

// result.matrix[r][c * 2 + 0] = salary sum
// result.matrix[r][c * 2 + 1] = id count
// result.rowAxis, result.colAxis = AxisNode tree
```

`indices` は `table.getVisibleIndices()` を渡す想定。`null` は該当データなし。

### `AxisNode`

```ts
type AxisNode = {
	key: CellValue | null;
	path: ReadonlyArray<CellValue | null>;
	children: ReadonlyArray<AxisNode>;
	leafIndex: number; // -1 は非葉
};
```

---

## 条件付き書式: `evaluateCellStyle`

セル単位の inline style をデータから計算する純関数。ヒートマップ・データバーに対応。

```ts
import { evaluateCellStyle } from '@tarbo-table/core/conditional-style';

const style = evaluateCellStyle({
	row,
	value,
	rules: [
		{ kind: 'scale', min: 0, max: 100, minColor: '#fff', maxColor: '#f00' },
		{ kind: 'compare', op: '>=', threshold: 90, style: { fontWeight: 'bold' } },
	],
});
// → { backgroundColor, color, fontWeight, ... }
```

### `ConditionalRule<TRow>` バリアント

| `kind`      | フィールド                                             |
| ----------- | ------------------------------------------------------ |
| `'fn'`      | `compute: ({ row, value }) => CellStyleObject \| null` |
| `'compare'` | `op; threshold; style`                                 |
| `'between'` | `min; max; style`                                      |
| `'scale'`   | `min; max; minColor; maxColor`（ヒートマップ）         |
| `'bar'`     | `min; max; color`（データバー: linear-gradient 背景）  |

複数ルールは順に評価され、後勝ち merge されます。

`ColumnDef` に `cellStyle: ConditionalCellMeta<TRow>` を付けると `<DataTable />` が自動で適用します。

---

## クリップボード: `toTsv` / `parseTsv` / `buildPasteCellPatches`

Excel / Google Sheets 互換の TSV でコピー＆ペーストする。

```ts
import { toTsv, parseTsv, buildPasteCellPatches } from '@tarbo-table/core';

// コピー
const tsv = toTsv(rows, columns);
navigator.clipboard.writeText(tsv);

// ペースト
const tsv = await navigator.clipboard.readText();
const patches = buildPasteCellPatches({
	tsv,
	anchor: { rowIndex: 0, columnIndex: 2 }, // 起点セル
	rows: table.getVisibleRows().map((r) => r.row),
	rowIds: table.getVisibleRows().map((r) => r.id),
	columns: table.getColumns(),
	parsers: {
		/* 列ごとの型変換 */
	},
});

// patches を dataSource.bulkUpdate に渡す
await dataSource.bulkUpdate(patches);
```

| 関数                           | 説明                                            |
| ------------------------------ | ----------------------------------------------- |
| `toTsv(rows, columns)`         | 2D → TSV 文字列。Excel 互換のクォート処理       |
| `parseTsv(tsv)`                | TSV → `string[][]`。CRLF / LF / CR 全対応       |
| `buildPasteCellPatches(input)` | TSV から `CellPatch[]` を構築。範囲外は切り捨て |

---

## カスタムエンジン: `EngineDriver`

`createTable({ engine })` に渡せる pipeline バックエンドの interface。

```ts
type EngineDriverFactory<TRow> = (
	data: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
) => EngineDriver<TRow>;

type EngineDriver<TRow> = {
	setData: (rows: ReadonlyArray<TRow>) => void;
	setPredicate: (predicate: Predicate | null) => void;
	runFilter: (scratch: Uint32Array) => Uint32Array;
	runSort: (filtered: Uint32Array, spec: SortSpec) => Uint32Array;
	dispose?: () => void;
};
```

実装例: [`@tarbo-table/core-rs`](./core-rs.md)。

カスタムエンジン実装の詳細は [extending.md](../extending.md#カスタムエンジンの実装) を参照。

---

## サブパス import / バンドル戦略

`@tarbo-table/core` は `sideEffects: false` + ESM 個別エントリで構成されており、未使用機能は bundler の tree-shaking で除去されます。

```ts
// 標準: filter / sort / page / selection / virtualization 一式
import { createTable, f, getVirtualRange } from '@tarbo-table/core';

// 必要なときだけ opt-in（バンドル削減）
import { withGrouping } from '@tarbo-table/core/grouping';
import { withAggregate } from '@tarbo-table/core/aggregate';
import { withEdit } from '@tarbo-table/core/edit';
import { withFocus } from '@tarbo-table/core/focus';
import { withPersist } from '@tarbo-table/core/persist';
import { exportRows } from '@tarbo-table/core/export';
import { exportXlsx } from '@tarbo-table/core/xlsx';
import { buildChartData } from '@tarbo-table/core/chart';
import { parseQuery } from '@tarbo-table/core/query';
import { pivot } from '@tarbo-table/core/pivot';
import { evaluateCellStyle } from '@tarbo-table/core/conditional-style';
import { toTsv, parseTsv } from '@tarbo-table/core/clipboard';
import { createRestDataSource } from '@tarbo-table/core/source-rest';
```

### 全サブパス一覧

| サブパス              | 主な export                                                                                                                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.` (root)            | `createTable`, `f`, `getVirtualRange`, `aggregate`, `withAggregate`, `withGrouping`, `withFocus`, `withEdit`, `withPersist`, `parseQuery`, `buildChartData`, `exportRows`, `exportXlsx`, `pivot`, `evaluateCellStyle`, `toTsv`, `parseTsv`, `buildHeaderMatrix`, `createMemoryDataSource`, `createMemoryRelationSource` |
| `./create-table`      | `createTable`, 型                                                                                                                                                                                                                                                                                                       |
| `./column`            | `ColumnDef`, `flattenColumns`, 型                                                                                                                                                                                                                                                                                       |
| `./filter`            | `f`, 型                                                                                                                                                                                                                                                                                                                 |
| `./sort`              | 型のみ                                                                                                                                                                                                                                                                                                                  |
| `./selection`         | `createSelectionState`, 型                                                                                                                                                                                                                                                                                              |
| `./pagination`        | `createPaginationState`, 型                                                                                                                                                                                                                                                                                             |
| `./virtual`           | `getVirtualRange`, 型                                                                                                                                                                                                                                                                                                   |
| `./aggregate`         | `aggregate`, `withAggregate`                                                                                                                                                                                                                                                                                            |
| `./grouping`          | `withGrouping`                                                                                                                                                                                                                                                                                                          |
| `./export`            | `exportRows`                                                                                                                                                                                                                                                                                                            |
| `./xlsx`              | `exportXlsx`                                                                                                                                                                                                                                                                                                            |
| `./chart`             | `buildChartData`                                                                                                                                                                                                                                                                                                        |
| `./query`             | `parseQuery`, `stringifyQuery`, `stringifyPredicate`, `stringifySort`                                                                                                                                                                                                                                                   |
| `./header`            | `buildHeaderMatrix`                                                                                                                                                                                                                                                                                                     |
| `./data-source`       | `createMemoryDataSource`, 型                                                                                                                                                                                                                                                                                            |
| `./source-rest`       | `createRestDataSource`                                                                                                                                                                                                                                                                                                  |
| `./focus`             | `withFocus`                                                                                                                                                                                                                                                                                                             |
| `./persist`           | `withPersist`                                                                                                                                                                                                                                                                                                           |
| `./edit`              | `withEdit`                                                                                                                                                                                                                                                                                                              |
| `./clipboard`         | `toTsv`, `parseTsv`, `buildPasteCellPatches`                                                                                                                                                                                                                                                                            |
| `./pivot`             | `pivot`                                                                                                                                                                                                                                                                                                                 |
| `./conditional-style` | `evaluateCellStyle`                                                                                                                                                                                                                                                                                                     |

---

## 関連ドキュメント

- [@tarbo-table/ui API リファレンス](./ui.md)
- [@tarbo-table/core-rs API リファレンス](./core-rs.md)
- [CLI クエリ DSL の完全文法](../query-dsl.md)
- [Mixin 拡張ガイド](../extending.md)
- [サンプル集 (recipes)](../recipes.md)
