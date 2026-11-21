# はじめに

tarbo-table を最短 5 分で動かすためのチュートリアル。

---

## 必要環境

| 項目                 | 推奨                                                   |
| -------------------- | ------------------------------------------------------ |
| Node.js              | 20+ (本リポジトリは Node 22)                           |
| パッケージマネージャ | pnpm 10+ (npm / yarn でも動きますが、本体は pnpm 想定) |
| React                | 19+ (UI 利用時のみ)                                    |
| Tailwind CSS         | v4 (UI 利用時のみ)                                     |
| TypeScript           | 5+                                                     |

ブラウザは ES2022 相当を要求します（仮想スクロール最適化に `Uint32Array.prototype.set` / `Array.prototype.findLast` を使用）。

---

## 1. インストール

### GitHub の dist ブランチから入れる（npm 未公開）

```bash
pnpm add \
  git+https://github.com/EedgeY/table.git#dist-core \
  git+https://github.com/EedgeY/table.git#dist-core-rs \
  git+https://github.com/EedgeY/table.git#dist-ui
```

詳細は [USAGE.md](./USAGE.md) を参照。

### ローカル開発（モノレポ内部で参照）

```bash
git clone https://github.com/EedgeY/table.git
cd table
pnpm install
pnpm build
```

---

## 2. ピア依存

`@tarbo-table/ui` を使う場合、以下が `peerDependencies` として要求されます。

```json
{
	"@tarbo-table/core": "git+https://github.com/EedgeY/table.git#dist-core",
	"@tarbo-table/core-rs": "git+https://github.com/EedgeY/table.git#dist-core-rs", // optional
	"react": "^19.0.0",
	"react-dom": "^19.0.0",
	"nuqs": "^2.0.0" // optional (useTableUrlState を使う場合のみ)
}
```

`@tarbo-table/core-rs` と `nuqs` は **optional**。WASM エンジン or URL 同期を使わない場合は不要です。

---

## 3. 最小サンプル（ヘッドレスのみ）

UI を使わず、ロジックだけ使う場合（バニラ JS / DOM 直 / 他のフレームワーク）。

```ts
import { createTable, f, getVirtualRange, type ColumnDef } from '@tarbo-table/core';

type Row = { id: number; name: string; salary: number };

const data: Row[] = [
	{ id: 1, name: 'Alice', salary: 80000 },
	{ id: 2, name: 'Bob', salary: 60000 },
	{ id: 3, name: 'Charlie', salary: 120000 },
];

const columns: ColumnDef<Row>[] = [
	{ id: 'id', accessor: (r) => r.id, type: 'number', defaultWidth: 80 },
	{ id: 'name', accessor: (r) => r.name, defaultWidth: 160 },
	{ id: 'salary', accessor: (r) => r.salary, type: 'number', defaultWidth: 120 },
];

const table = createTable<Row>({
	data,
	columns,
	pageSize: 100,
	selectionMode: 'multi',
	getRowId: (r) => String(r.id),
});

// フィルタ・ソート
table.setPredicate(f.leaf('salary', '>=', 70000));
table.setSort([{ columnId: 'salary', dir: 'desc' }]);

// 現在ページの行を取得
const rows = table.getPagedRows();
// → [{ id, index, row }] (filter+sort+page 後)

// 状態変化を購読
const unsubscribe = table.subscribe(() => {
	console.log('changed', table.getRowCount());
});
```

---

## 4. 最小サンプル（React + DataTable）

```tsx
import { useMemo } from 'react';
import { createTable, type ColumnDef } from '@tarbo-table/core';
import { DataTable } from '@tarbo-table/ui';
import '@tarbo-table/ui/styles.css'; // ← 必須: Tailwind v4 スタイル

type Row = { id: number; name: string; salary: number };

function App({ data }: { data: Row[] }) {
	const columns: ColumnDef<Row>[] = useMemo(
		() => [
			{ id: 'id', accessor: (r) => r.id, type: 'number' },
			{ id: 'name', accessor: (r) => r.name },
			{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
		],
		[],
	);

	const table = useMemo(
		() =>
			createTable<Row>({
				data,
				columns,
				pageSize: 50,
				getRowId: (r) => String(r.id),
			}),
		[data, columns],
	);

	return <DataTable table={table} />;
}
```

これだけで:

- 仮想スクロール（行高さ自動算出）
- 列リサイズ
- ソートクリック
- フィルタチップ UI
- ページネーション
- 行選択
- CSV / TSV / XLSX エクスポートメニュー

が動きます。

---

## 5. Tailwind v4 設定

`@tarbo-table/ui` は Tailwind v4 ベースなので、消費側の Tailwind に dist のクラス出力を含める必要があります。

**`tailwind.config.{js,ts}`** がある場合:

```js
export default {
	content: ['./src/**/*.{ts,tsx}', './node_modules/@tarbo-table/ui/dist/**/*.{js,mjs}'],
};
```

**Tailwind v4 の inline import 方式の場合** (`app.css`):

```css
@import 'tailwindcss';
@source '../node_modules/@tarbo-table/ui/dist/**/*.{js,mjs}';
@import '@tarbo-table/ui/styles.css';
```

---

## 6. nuqs アダプタ（URL 同期を使う場合）

`useTableUrlState` を使う場合、ルート近くに nuqs Adapter を置く必要があります。

```tsx
// main.tsx
import { NuqsAdapter } from 'nuqs/adapters/react'; // or react-router / next/app

createRoot(document.getElementById('root')!).render(
	<NuqsAdapter>
		<App />
	</NuqsAdapter>,
);
```

Next.js App Router の場合は `nuqs/adapters/next/app`、React Router の場合は `nuqs/adapters/react-router` を使ってください。

---

## 7. WASM エンジン（任意・大規模データ向け）

行数が 5 万を超える、またはフィルタ・ソートを多用するなら Rust WASM エンジンに切り替えます。

### React の場合

```tsx
import { useRsDriverFactory } from '@tarbo-table/core-rs/react';
import { createTable } from '@tarbo-table/core';
import { DataTable } from '@tarbo-table/ui';

function Page({ data, columns }) {
	const rsFactory = useRsDriverFactory(); // null → 関数（wasm ロード完了後）

	const table = useMemo(() => {
		if (!rsFactory) return null;
		return createTable({ data, columns, engine: rsFactory, pageSize: 100 });
	}, [rsFactory, data, columns]);

	if (!table) return <div>loading engine…</div>;
	return <DataTable table={table} />;
}
```

### Vite (ブラウザバニラ) の場合

```ts
import { loadRsDriverFactory } from '@tarbo-table/core-rs/web';

const rsFactory = await loadRsDriverFactory(); // wasm fetch + init (1 回だけ)
const table = createTable({ data, columns, engine: rsFactory });
```

### Node.js / SSR の場合

```ts
import { rsDriverFactory } from '@tarbo-table/core-rs/node';
// ↑ import 時に wasm を同期ロード。await 不要

const table = createTable({ data, columns, engine: rsDriverFactory });
```

> **メモリ解放**: WASM ドライバを使う場合、不要になったら `table.dispose()` を呼ぶこと。JS エンジン（既定）では no-op なので常に呼んで問題ありません。

詳しくは [core-rs API リファレンス](./api/core-rs.md) を参照。

---

## 8. 次のステップ

- **API リファレンス**: [@tarbo-table/core](./api/core.md) / [@tarbo-table/ui](./api/ui.md)
- **実コードのサンプル集**: [recipes.md](./recipes.md)
- **CLI クエリ DSL の文法**: [query-dsl.md](./query-dsl.md)
- **拡張パターン**: [extending.md](./extending.md)
