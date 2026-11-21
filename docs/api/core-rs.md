# `@tarbo-table/core-rs` API リファレンス

Rust → WebAssembly でビルドされた `@tarbo-table/core` のエンジンドライバ。1M 行クラスのフィルタ・ソートを高速化する。`image` サブモジュールに画像処理パイプラインも同梱。

> このパッケージは optional です。WASM 初期化コストを払う価値があるのは概ね 5 万行以上の場合。それ以下は JS エンジン（既定）で十分です。

---

## 目次

1. [エントリポイント一覧](#エントリポイント一覧)
2. [`./node` — Node.js / SSR](#node--nodejs--ssr)
3. [`./web` — ブラウザ / Vite / Webpack](#web--ブラウザ--vite--webpack)
4. [`./react` — React Hook](#react--react-hook)
5. [`./image` — 画像処理パイプライン](#image--画像処理パイプライン)
6. [`EngineDriver` interface](#enginedriver-interface)
7. [使い分けの判断基準](#使い分けの判断基準)
8. [メモリ管理 (`dispose()`)](#メモリ管理-dispose)

---

## エントリポイント一覧

`package.json` の `exports` で 5 つのエントリを公開しています。

| エントリ     | 対象環境                | wasm ロード方式         | 主な公開 API                                         |
| ------------ | ----------------------- | ----------------------- | ---------------------------------------------------- |
| `"."` (root) | 型のみ                  | —                       | 型定義 (`Engine`, `Predicate`, `SortKey` ...)        |
| `"./node"`   | Node.js                 | 同期 (require)          | `rsDriverFactory`, `createNodeEngine`                |
| `"./web"`    | ブラウザ                | 非同期 (fetch)          | `loadRsDriverFactory`, `createWebEngine`, `initWasm` |
| `"./react"`  | React                   | 非同期 (内部で `./web`) | `useRsDriverFactory`                                 |
| `"./image"`  | Node / ブラウザ自動判定 | 動的 import             | `loadImagePipeline`, `ImagePipeline`, 関連型         |

`exports` の自動ルーティング: `"."` をインポートした場合、Node 環境では `./node`、ブラウザ環境では `./web` に自動的に解決されます。

---

## `./node` — Node.js / SSR

Node 専用。wasm を **同期ロード** するため `await` 不要。

### `rsDriverFactory<TRow>(data, columns): EngineDriver<TRow>`

`createTable({ engine })` に渡せる drop-in ファクトリ。

```ts
import { createTable } from '@tarbo-table/core';
import { rsDriverFactory } from '@tarbo-table/core-rs/node';

const table = createTable({
	data,
	columns,
	engine: rsDriverFactory, // ← これだけ
	pageSize: 100,
});

table.setPredicate(f.and(f.leaf('dept', '=', 'eng'), f.leaf('salary', '>=', 60000)));
table.setSort([{ columnId: 'salary', dir: 'desc' }]);
const rows = table.getPagedRows();

table.dispose(); // ← 必ず呼ぶ（WASM 線形メモリ解放）
```

### `createNodeEngine<TRow>(rows, columns): Engine<TRow>`

`createTable` を使わない低レベル API。filter / sort / page を個別に呼べるスタンドアロンエンジン。

```ts
import { createNodeEngine } from '@tarbo-table/core-rs/node';

const engine = createNodeEngine(rows, columns);

const filtered = engine.filter({ kind: 'leaf', columnId: 'salary', op: '>=', value: 50000 });
const sorted = engine.sort(filtered, [{ columnId: 'salary', dir: 'desc' }]);
const paged = engine.page(sorted, { pageIndex: 0, pageSize: 20 });

engine.dispose();
```

`ColumnBinding<TRow>` は `ColumnDef<TRow>` の縮小版で、`id` / `kind` / `accessor` のみを持ちます。

---

## `./web` — ブラウザ / Vite / Webpack

ブラウザ向け。wasm を **非同期 fetch** で初期化するため `await` が必要。

### `loadRsDriverFactory(): Promise<RsDriverFactory>`

`createTable({ engine })` に渡せるファクトリを非同期で取得。初回ロード後はキャッシュされ、以降の呼び出しは即座に resolve。

```ts
import { createTable } from '@tarbo-table/core';
import { loadRsDriverFactory } from '@tarbo-table/core-rs/web';

// ページ初回ロード時に一度だけ
const rsFactory = await loadRsDriverFactory();

const table = createTable({ data, columns, engine: rsFactory });
```

### `initWasm(): Promise<void>`

wasm モジュールを **プリロード** するオプショナル API。`loadRsDriverFactory` の中でも自動的に行われるため、明示的に呼ぶ必要は通常ありません。テーブル生成より前にネットワーク取得だけ済ませたい場合に使います。

```ts
import { initWasm } from '@tarbo-table/core-rs/web';
initWasm(); // 非同期にネットワーク取得を開始（await しなくてもよい）
```

### `createWebEngine<TRow>(rows, columns): Promise<Engine<TRow>>`

ブラウザ向け低レベルエンジン（`createTable` を使わない場合）。

```ts
import { createWebEngine } from '@tarbo-table/core-rs/web';

const engine = await createWebEngine(rows, columns);
const filtered = engine.filter({ ... });
engine.dispose();
```

### `RsDriverFactory` 型

```ts
type RsDriverFactory = <TRow>(
	data: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
) => EngineDriver<TRow>;
```

### Vite / Webpack 設定

**Vite (推奨)**: 設定不要。`./web` の動的 import が `dist/assets/tarbo_table_core_rs_bg-<hash>.wasm` として自動的にアセット化されます（検証済: Vite 6）。

**Next.js**: webpack の `experiments.asyncWebAssembly` を有効にする必要があります。

```js
// next.config.js
export default {
	webpack: (config) => {
		config.experiments = { ...config.experiments, asyncWebAssembly: true };
		return config;
	},
};
```

Next.js の Server Component で使う場合は `./node` エントリを使うか、`'use client'` を付けて `./web` を使ってください。

---

## `./react` — React Hook

### `useRsDriverFactory(): RsDriverFactory | null`

wasm をマウント時に非同期ロードし、完了したらファクトリを返すフック。ロード完了前は `null` を返します。

```tsx
import { useRsDriverFactory } from '@tarbo-table/core-rs/react';
import { createTable } from '@tarbo-table/core';
import { DataTable } from '@tarbo-table/ui';
import { useMemo, useEffect } from 'react';

function MyTable({ data, columns }) {
	const rsFactory = useRsDriverFactory(); // null → RsDriverFactory

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

> **エラーハンドリング**: wasm ロード失敗時は `console.error` を出すだけで `null` のままです。フォールバックとして `engine` 未指定の `createTable`（JS エンジン）に切り替えることを推奨します。

---

## `./image` — 画像処理パイプライン

pipeline（filter/sort）バンドルとは **完全に独立**。`loadImagePipeline()` を呼ばない限り何もロードされません。

### 公開型

```ts
type ImageFmt = 'jpeg' | 'png' | 'webp';
type FitMode = 'cover' | 'contain' | 'stretch';

type CompressOptions = {
	fmt?: ImageFmt; // 既定 'jpeg'
	maxDim?: number; // 最大辺 px。0 でスキップ。既定 0
	quality?: number; // JPEG quality 1..100。既定 80
};

type ThumbnailOptions = {
	fit?: FitMode; // 既定 'cover'
	quality?: number; // 既定 75
};
```

### `loadImagePipeline(): Promise<ImagePipeline>`

共有 `ImagePipeline` インスタンスを取得（ページ/プロセス生存期間中キャッシュ）。Node / ブラウザを自動判定し、`pkg-node-image/` or `pkg-web-image/` を動的 import。

```ts
import { loadImagePipeline } from '@tarbo-table/core-rs/image';

const pipeline = await loadImagePipeline();
```

### `ImagePipeline` クラス

#### `compress(src, opts?): Promise<Uint8Array>`

再エンコード（必要なら maxDim 指定で最大辺キャップ付きリサイズ）。

```ts
const bytes = await pipeline.compress(imageBytes, {
	fmt: 'webp',
	maxDim: 1200,
	quality: 85,
});
```

`src` は `Uint8Array | Blob | string`（string は URL）。

#### `thumbnail(src, width, height, opts?): Promise<Blob>`

W×H サムネイル。常に JPEG Blob を返すため `URL.createObjectURL()` にそのまま渡せます。

```ts
const blob = await pipeline.thumbnail(src, 64, 64, { fit: 'cover', quality: 75 });
imgEl.src = URL.createObjectURL(blob);
```

#### `blurhash(src, x?, y?): Promise<string>`

blurhash プレースホルダ文字列を生成。`x`/`y` は AC コンポーネント数 (3..9)。既定 `x=4, y=3`。

```ts
const hash = await pipeline.blurhash(src);
```

内部で 64×64 にリサイズしてからエンコードするため大きな画像でも軽量。

#### `decodeDimensions(src): Promise<{ width: number; height: number } | null>`

ピクセルを完全デコードせず幅・高さだけ取得。フォーマット非対応なら `null`。

#### `dataUrl(bytes, fmt?): string`

`Uint8Array → data: URL` 変換ヘルパー（同期）。

```ts
const url = pipeline.dataUrl(bytes, 'jpeg');
```

> **WebP**: pure-Rust エンコーダの制約で **lossless のみ** 対応です（quality は無視されます）。lossy WebP が必要なら別ライブラリを検討してください。

---

## `EngineDriver` interface

`@tarbo-table/core` の `_engine-driver.ts` で定義（`@tarbo-table/core` 側から型として export）。`createTable({ engine })` が受け取る形。

```ts
interface EngineDriver<TRow> {
	setData: (rows: ReadonlyArray<TRow>) => void;
	setPredicate: (predicate: Predicate | null) => void;
	runFilter: (scratch: Uint32Array) => Uint32Array;
	runSort: (filtered: Uint32Array, spec: SortSpec) => Uint32Array;
	dispose?: () => void;
}

type EngineDriverFactory<TRow> = (
	data: ReadonlyArray<TRow>,
	columns: ReadonlyArray<ColumnDef<TRow>>,
) => EngineDriver<TRow>;
```

| メソッド       | 説明                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `setData`      | 行データが差し替わったとき呼ばれる。WASM ドライバは旧 `WasmTable` を `free()` し新しい型付き列を再構築              |
| `setPredicate` | 述語が変わったとき呼ばれる（実行はしない）。コンパイルキャッシュを無効化                                            |
| `runFilter`    | フィルタ実行。`scratch` は再利用可能 `Uint32Array`（JS ドライバが使う）。マッチした行インデックスの新しい配列を返す |
| `runSort`      | ソート実行。`filtered` は mutate 禁止。新しい配列を返す                                                             |
| `dispose?`     | リソース解放。WASM ドライバは `WasmTable.free()` を呼ぶ                                                             |

ページネーション計算と行スライスは `createTable` 内部の JS が行うため、`EngineDriver` は **filter + sort のみ** を担当します。

カスタムエンジン実装の詳細は [extending.md](../extending.md#カスタムエンジンの実装) を参照。

---

## 使い分けの判断基準

| 状況                                        | 推奨                                                            |
| ------------------------------------------- | --------------------------------------------------------------- |
| 行数 < 5,000                                | JS デフォルト（engine 指定なし）。WASM 初期化コストの方が大きい |
| 行数 5,000 – 50,000 + 並び替え/フィルタ多用 | Rust 推奨。`loadRsDriverFactory()` は 1 回だけ                  |
| 行数 > 50,000                               | Rust ほぼ必須。multi-key sort で 8× 程度の速度向上              |
| データを毎フレーム入れ替える                | 抽出（型付き列構築）が約 170ms/1M 行のため不向き。バッチ反映を  |
| 高カーディナリティ文字列 (email/UUID 等)    | 辞書符号化が効かず旨味薄。numeric 中心の表で真価                |

### WASM 内部の仕組み

- 文字列列は **辞書エンコード** されるため、`=` / `like` がコード比較に還元されて高速
- `runFilter` の返値は wasm 線形メモリから直接 `Uint32Array` で返るため、JS 側のコピーが最小
- ソートは `dict_rank` の事前構築でコード比較に落とす

### Cargo features

| feature      | 内容                                              | 対応バンドル                        |
| ------------ | ------------------------------------------------- | ----------------------------------- |
| `wasm`       | filter/sort/page の wasm bindings                 | `pkg-node/`, `pkg-web/`             |
| `image`      | 純 Rust の圧縮/サムネ/blurhash（`cargo test` 用） | rlib のみ                           |
| `image-wasm` | image + wasm bindings                             | `pkg-node-image/`, `pkg-web-image/` |

`wasm-opt` の最適化フラグ（`-O4` + bulk-memory / sign-ext / multivalue）はリリースビルドで有効。

---

## メモリ管理 (`dispose()`)

WASM ドライバは `WasmTable` ごとに線形メモリを保持します。テーブルが不要になったら **必ず** `table.dispose()` を呼んでください。JS エンジン（既定）では no-op なので常に呼んで問題ありません。

```tsx
useEffect(() => {
	return () => {
		table.dispose();
	};
}, [table]);
```

低レベル API (`createNodeEngine` / `createWebEngine`) も同じく `engine.dispose()` を呼ぶ必要があります。`Symbol.dispose` をサポートしているので `using` 構文も使えます (TypeScript 5.2+):

```ts
{
	using engine = createNodeEngine(rows, columns);
	// ブロックを抜けるとき自動 dispose
}
```

---

## 関連ドキュメント

- [@tarbo-table/core API リファレンス](./core.md)
- [拡張ガイド (カスタムエンジン)](../extending.md#カスタムエンジンの実装)
- [はじめに (WASM ロード手順)](../getting-started.md#7-wasm-エンジン任意大規模データ向け)
