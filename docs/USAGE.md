# tarbo-table を他プロジェクトで使う

> npm には未公開のため、**GitHub リポジトリ** (`EedgeY/table`) の dist ブランチから
> 直接インストールする手順。消費側に Rust toolchain は不要。

---

## 仕組み

`main` ブランチがソース。リリース時にスクリプトが **3 つの dist ブランチ**を
それぞれ pre-built artifact で上書きする:

```
EedgeY/table
├── main             ← ソース。普通の開発はここ
├── dist-core        ← @tarbo-table/core 完成品 (TS dist 込み)
├── dist-core-rs     ← @tarbo-table/core-rs 完成品 (WASM 込み, 約 206KB)
└── dist-ui          ← @tarbo-table/ui 完成品 (TS dist + Tailwind)
```

消費側は各ブランチを **個別パッケージとして** Git URL で取り込む。
1 ブランチ = 1 パッケージなので pnpm/npm の git 解決が確実に動く。

---

## 取り込み手順 (消費側)

### 0. 前提

- マシンに `git` が入っている (HTTPS で取得するので GitHub の認証は不要)
- パッケージマネージャは pnpm 推奨 (npm/yarn も動くはず)

### 1. 依存追加

```bash
pnpm add \
  git+https://github.com/EedgeY/table.git#dist-core \
  git+https://github.com/EedgeY/table.git#dist-core-rs \
  git+https://github.com/EedgeY/table.git#dist-ui
```

または `package.json` に直書き:

```jsonc
{
	"dependencies": {
		"@tarbo-table/core": "git+https://github.com/EedgeY/table.git#dist-core",
		"@tarbo-table/core-rs": "git+https://github.com/EedgeY/table.git#dist-core-rs",
		"@tarbo-table/ui": "git+https://github.com/EedgeY/table.git#dist-ui",
		"react": "^19.0.0",
		"react-dom": "^19.0.0",
	},
}
```

```bash
pnpm install
```

> `dist-core-rs` 同士の依存 (`core-rs` が `core` を peerDep にしている等) は
> `release-dist.sh` が package.json 書換時に同じ git URL に置換しているので、
> ネストした依存も全部 GitHub から取得される。

### 2. 特定バージョンに固定したい

タグを切ってあるなら:

```jsonc
"@tarbo-table/core": "git+https://github.com/EedgeY/table.git#v0.1.0-core"
```

(タグ運用は任意。詳しくは [RELEASE.md](./RELEASE.md))

---

## 使い方 (TypeScript / React)

### A. ヘッドレスのみ (UI なし、core だけ)

```ts
import { createTable, f } from '@tarbo-table/core';

const t = createTable({
	data: rows,
	columns: [
		{ id: 'id', accessor: (r) => r.id, type: 'number' },
		{ id: 'name', accessor: (r) => r.name },
		{ id: 'salary', accessor: (r) => r.salary, type: 'number' },
	],
	pageSize: 100,
});

t.setPredicate(f.leaf('salary', '>=', 50000));
t.setSort([{ columnId: 'salary', dir: 'desc' }]);
const page = t.getPagedRows(); // ReadonlyArray<{ id, index, row }>
```

### B. Rust + WASM エンジンに切替 (Node 環境)

万行を超え、フィルタ/ソートを繰り返すなら:

```ts
import { createTable } from '@tarbo-table/core';
import { rsDriverFactory } from '@tarbo-table/core-rs/node';

const t = createTable({
	data: rows,
	columns,
	engine: rsDriverFactory, // ← これだけ
});
// あとは A. と同じ API
```

### C. Rust + WASM エンジン (Browser / Vite, Next.js)

```ts
import { createTable } from '@tarbo-table/core';
import { loadRsDriverFactory } from '@tarbo-table/core-rs/web';

const rsFactory = await loadRsDriverFactory(); // wasm を fetch + init (1回のみ)
const t = createTable({
	data: rows,
	columns,
	engine: rsFactory,
});
```

Vite はこの import の wasm を自動でアセット化する (検証済: Vite 6, ビルド時
`dist/assets/tarbo_table_core_rs_bg-<hash>.wasm` として出力)。

### D. React フック (DataTable まで)

```tsx
import { useMemo } from 'react';
import { createTable } from '@tarbo-table/core';
import { useRsDriverFactory } from '@tarbo-table/core-rs/react';
import { DataTable } from '@tarbo-table/ui';
import '@tarbo-table/ui/styles.css';

function MyTable({ data, columns }) {
	const rsFactory = useRsDriverFactory(); // null until wasm loads

	const table = useMemo(() => {
		if (!rsFactory) return null;
		return createTable({ data, columns, pageSize: 100, engine: rsFactory });
	}, [rsFactory, data, columns]);

	if (!table) return <div>loading engine…</div>;
	return <DataTable table={table} />;
}
```

### Tailwind v4 設定 (UI 利用時のみ)

`tailwind.config` でクラスのスキャン対象に dist を加える:

```js
export default {
	content: ['./src/**/*.{ts,tsx}', './node_modules/@tarbo-table/ui/dist/**/*.{js,mjs}'],
};
```

`@tarbo-table/ui/styles.css` を main 側 CSS から `@import` するか、エントリで
import する。

---

## 動作確認チェックリスト

```bash
# 1. 取り込めたか
pnpm ls @tarbo-table/core @tarbo-table/core-rs @tarbo-table/ui

# 2. 型解決できているか
pnpm tsc --noEmit

# 3. Vite/Next dev で wasm がロードされるか
pnpm dev
# ブラウザ DevTools Network タブで *.wasm が 200 で返るのを確認
```

---

## いつ Rust エンジンを使うか (実用判断)

| 状況                                     | おすすめ                                                              |
| ---------------------------------------- | --------------------------------------------------------------------- |
| 行数 < 5k                                | JS デフォルト (engine 指定なし) で十分。WASM 初期化コストの方が大きい |
| 行数 5k–50k + 並び替え/フィルタ多用      | Rust 推奨。`loadRsDriverFactory()` は 1 回だけ                        |
| 行数 > 50k                               | Rust ほぼ必須。multi-key sort で 8×                                   |
| データを毎フレーム入れ替える             | 抽出が 170ms/1M 行のため不向き。バッチ反映を                          |
| 高カーディナリティ文字列 (email/UUID 等) | 辞書符号化が効かず旨味薄。numeric 中心の表で真価                      |

---

## アップグレード

```bash
# 各 dist ブランチの最新を取りに行く
pnpm update \
  @tarbo-table/core \
  @tarbo-table/core-rs \
  @tarbo-table/ui
```

pnpm は git URL 依存については **コミット SHA を `pnpm-lock.yaml` に固定する**
ので、`pnpm update` を呼ぶまでは決定的にロックされる。

---

## トラブルシュート

| 症状                                             | 原因                            | 対処                                                                             |
| ------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------- |
| `Cannot find module '@tarbo-table/...'` ビルド時 | dist ブランチが空 or 古い       | リリース側で `pnpm release:dist` を実行                                          |
| Next.js で wasm が読めない                       | webpack 設定                    | `next.config.js` の `webpack: (c) => (c.experiments.asyncWebAssembly = true, c)` |
| Vite で `.wasm` が 404                           | カスタム base path 設定漏れ     | `vite.config` の `base` 設定確認                                                 |
| 1k 行で逆に遅い                                  | Rust 抽出オーバーヘッドが大きい | engine 指定なし (JS) のままで OK                                                 |

---

## 関連ドキュメント

- **リリース側手順** (`tarbo-table` 本体メンテナ向け): [RELEASE.md](./RELEASE.md)
- 設計判断の記録: [docs/adr/](./adr/)
- 本体 README: [README.md](../README.md)
