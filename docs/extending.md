# 拡張ガイド

`@tarbo-table/core` を拡張する 2 つの方法:

1. **Mixin パターン**: 既存の `with*` 関数を組み合わせて TableInstance を増強する
2. **カスタムバックエンド**: `DataSource` / `EngineDriver` / `RelationSource` / `PersistStorage` を自前実装する

---

## Mixin パターン

### 利用可能な Mixin 一覧

| Mixin           | 提供する機能                                | 内部依存                           |
| --------------- | ------------------------------------------- | ---------------------------------- |
| `withAggregate` | フッター集計 (`getOverallAggregates`)       | なし                               |
| `withGrouping`  | 階層 groupBy + 折り畳み + flat 化           | `withAggregate` を自動 attach      |
| `withFocus`     | キーボードナビ + 矩形範囲選択               | なし                               |
| `withEdit`      | 楽観 UI + Undo/Redo                         | `dataSource.updateCell` (optional) |
| `withPersist`   | localStorage / URL / カスタムへの状態永続化 | 他 mixin の状態も保存可能          |

### 冪等性

すべての `with*` 関数は **冪等** です。2 回呼んでも同じ参照を返します。

```ts
const t1 = withGrouping(table);
const t2 = withGrouping(t1);
console.log(t1 === t2); // true
```

### 典型的な積み順

```ts
import { createTable } from '@tarbo-table/core';
import { withGrouping } from '@tarbo-table/core/grouping';
import { withFocus } from '@tarbo-table/core/focus';
import { withEdit } from '@tarbo-table/core/edit';
import { withPersist } from '@tarbo-table/core/persist';

let table = createTable<Row>({ data, columns, dataSource });
table = withGrouping(table); // withAggregate も同時 attach
table = withFocus(table);
table = withEdit(table, { maxHistory: 50 });
table = withPersist(table, { key: 'my-table', storage: 'local' });
//      ↑ 最外側 → grouping の状態も永続化対象になる
```

#### 順序のルール

- **`withPersist` は最外側**: 内側の mixin の状態を読み取って保存するため
- **`withGrouping` は `withAggregate` を内包** するので明示的に呼ばなくてもよい
- **`withFocus` / `withEdit`** は独立。順序に意味はないが、`withEdit` を先にすると `EditMixin` 型が `withFocus` の型に取り込まれる

### state の保持場所

| 状態                                                                                                      | 保持場所                     | 購読方法                              |
| --------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------- |
| `predicate` / `sort` / `pagination` / `selection` / `columnSizing` / `columnVisibility` / `columnPinning` | `TableState` 内              | `subscribe` / `subscribeWithSelector` |
| `groupBy` / `collapsedGroups`                                                                             | `withGrouping` のクロージャ  | `subscribe`（state 外）               |
| `aggregations`                                                                                            | `withAggregate` のクロージャ | `subscribe`（state 外）               |
| `focus` / `range`                                                                                         | `withFocus` のクロージャ     | `subscribeFocus(cb)`                  |
| `editState` (dirty/inFlight/errors)                                                                       | `withEdit` のクロージャ      | `subscribeEdit(cb)`                   |

`TableState` 外の状態を React で観測するには:

```tsx
const [, force] = useReducer((x: number) => x + 1, 0);
useEffect(() => table.subscribe(() => force()), [table]);
```

`<DataTable />` は内部でこの 2 重購読を自動で行っています。

---

## カスタム DataSource

`DataSource<TRow>` は `mode: 'server'` で fetch を委譲する、もしくは `withEdit` の commit 先として使うバックエンド抽象です。

### 最小実装

```ts
import type { DataSource } from '@tarbo-table/core';

const dataSource: DataSource<Row> = {
	async fetch(query) {
		const url = new URL('/api/rows', baseUrl);
		if (query.predicate) url.searchParams.set('q', stringifyPredicate(query.predicate));
		url.searchParams.set('limit', String(query.pagination.pageSize));
		url.searchParams.set('offset', String(query.pagination.pageIndex * query.pagination.pageSize));

		const res = await fetch(url, { signal: query.signal });
		const json = await res.json();
		return { rows: json.rows, totalCount: json.total };
	},
};
```

### 編集対応

```ts
const dataSource: DataSource<Row> = {
  async fetch(query) { ... },
  async updateCell({ rowId, columnId, value }) {
    const res = await fetch(`/api/rows/${rowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ [columnId]: value }),
    });
    if (!res.ok) return { ok: false, error: { code: 'http', message: res.statusText } };
    return { ok: true, value: await res.json() };
  },
  async bulkUpdate(patches) { ... },
  async insertRow(row) { ... },
  async deleteRows(rowIds) { ... },
};
```

### Realtime 対応

```ts
const dataSource: DataSource<Row> = {
  async fetch(query) { ... },
  subscribe(cb) {
    const ws = new WebSocket('wss://example.com/rows');
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      cb(event);   // { kind: 'insert' | 'update' | 'delete', ... }
    };
    return () => ws.close();
  },
};
```

`createTable({ mode: 'server', dataSource })` で subscribe が自動的に呼ばれ、`RealtimeEvent` が `applyRowEvent` に流されます。

### `EditError`

```ts
type EditError = {
	code: string; // 'conflict' / 'validation' / 'http' / ...
	message: string;
	columnId?: string; // 列単位エラーの場合
};
```

`Result<T, E>` の `error` 側に詰めて返すと、`withEdit` の `getEditState().errors` に格納されます。

### REST アダプタの利用

シンプルな REST API なら `createRestDataSource` を使う方が早いです:

```ts
import { createRestDataSource } from '@tarbo-table/core/source-rest';

const dataSource = createRestDataSource<Row>({
	baseUrl: 'https://api.example.com',
	resource: 'rows',
	idOf: (r) => r.id,
});
```

カスタマイズが必要な場合は `encodeFilter` / `encodeSort` / `parseResponse` を渡してください。

---

## カスタムエンジンの実装

`EngineDriver<TRow>` を実装すると `createTable({ engine })` で差し替えられます。WebGPU / WebWorker / 別 wasm 実装などに使えます。

### Skeleton

```ts
import type { EngineDriver, EngineDriverFactory } from '@tarbo-table/core';

function myEngineFactory<TRow>(
	data: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
): EngineDriver<TRow> {
	let rows = data;
	let predicate: Predicate | null = null;

	return {
		setData(next) {
			rows = next;
			// 必要なら type 変換 / index 再構築
		},
		setPredicate(next) {
			predicate = next;
			// 必要ならコンパイルキャッシュ無効化
		},
		runFilter(scratch) {
			const out = new Uint32Array(rows.length);
			let n = 0;
			for (let i = 0; i < rows.length; i++) {
				if (matches(rows[i], predicate, columns)) out[n++] = i;
			}
			return out.subarray(0, n);
		},
		runSort(filtered, spec) {
			// filtered を mutate しない（新しい配列を作る）
			const arr = new Uint32Array(filtered);
			arr.sort((a, b) => compareRows(rows[a], rows[b], spec, columns));
			return arr;
		},
		dispose() {
			// リソース解放
		},
	};
}

const engine: EngineDriverFactory<TRow> = myEngineFactory;
createTable({ data, columns, engine });
```

### 注意事項

- `runFilter` / `runSort` の戻り値は新しい `Uint32Array` を返してください。入力 `scratch` / `filtered` を mutate すると pipeline の dirty flag が壊れます。
- `setData` / `setPredicate` は **実行はしない**。状態更新だけ行い、`runFilter` で初めて実行する遅延評価が前提です。
- `dispose` は必須ではありませんが、WASM / Worker を使う場合は必ず実装してください。

### ページネーション

`createTable` 内部の JS が `getPagedRows` などのページング計算を行います。エンジン側でページ計算する必要はありません（ただし `createNodeEngine` / `createWebEngine` のような低レベル API では `page` メソッドも提供できます）。

---

## カスタム RelationSource

`<DataTable />` のリレーションセル展開で別テーブルのデータを表示するためのバックエンド。

```ts
import type { RelationSource } from '@tarbo-table/core';

const myRelations: RelationSource = {
  async fetchByIds(tableId, ids) {
    const res = await fetch(`/api/${tableId}?ids=${ids.join(',')}`);
    return res.json();
  },
  getColumns(tableId) {
    // テーブルごとの ColumnDef を返す（同期）
    if (tableId === 'managers') return managerColumns;
    if (tableId === 'departments') return deptColumns;
    return [];
  },
  // optional
  async fetchByQuery(tableId, query) { ... },
  subscribe(tableId, cb) {
    const ws = new WebSocket(`wss://example.com/${tableId}`);
    ws.onmessage = () => cb();
    return () => ws.close();
  },
};

createTable({ data, columns, relations: myRelations });
```

`getColumns` は同期である必要があります（描画時に列定義が必要）。fetch は `fetchByIds` でバッチ取得。

メモリ実装の例は `createMemoryRelationSource` を参考にしてください。

---

## カスタム PersistStorage

`withPersist` の `storage` に渡せるカスタムストレージインターフェース:

```ts
type PersistStorage = {
	load(key: string): string | null;
	save(key: string, value: string): void;
};
```

例: `sessionStorage`、IndexedDB、サーバー保存:

```ts
// sessionStorage
withPersist(table, {
  key: 'session-table',
  storage: {
    load: (k) => sessionStorage.getItem(k),
    save: (k, v) => sessionStorage.setItem(k, v),
  },
});

// IndexedDB (idb-keyval 等)
import { get, set } from 'idb-keyval';
withPersist(table, {
  key: 'table',
  storage: {
    load: (k) => /* sync load is required — use a synchronous wrapper */,
    save: (k, v) => { set(k, v); },   // 非同期 save は問題ない
  },
});
```

> **同期 load の制約**: `load` は同期である必要があります（テーブル初期化時に状態を即座に復元するため）。非同期ロードが必要な場合は、別途事前ロードして `initialState` で `createTable` に渡してください。

---

## カスタムセルレンダラー

`ColumnDef` に `render` を追加するパターンで、`<DataTable />` の組み込みセルを上書きできます。詳しくは [@tarbo-table/ui のカスタムレンダラー](./api/ui.md#カスタムレンダラー) を参照。

```tsx
const columns: Array<ColumnDef<Row> & ColumnRenderMeta<Row>> = [
	{
		id: 'status',
		accessor: (r) => r.status,
		render: ({ value, row }) => <StatusBadge value={value as string} severity={row.severity} />,
	},
];
```

優先順位: `column.render` > `column.edit` (`EditableCell`) > `column.type` の組み込みセル > 文字列化フォールバック。

---

## i18n の独自ロケール追加

`<TableLocaleProvider locale="zh" messages={{ ... }}>` で任意の `locale` 文字列を渡せます。`messages` は **全 24 キーの部分上書き** が可能で、未指定キーは ja のフォールバックが使われます。

```tsx
const zhMessages: Partial<LocaleMessages> = {
	'toolbar.sort': '排序',
	'toolbar.columns': '列',
	'filter.addFilter': '添加筛选',
	// ...
};

<TableLocaleProvider locale="zh" messages={zhMessages} currency="CNY">
	<DataTable table={table} />
</TableLocaleProvider>;
```

---

## 関連ドキュメント

- [@tarbo-table/core API リファレンス](./api/core.md)
- [@tarbo-table/ui API リファレンス](./api/ui.md)
- [@tarbo-table/core-rs API リファレンス](./api/core-rs.md)
- [サンプル集 (recipes)](./recipes.md)
