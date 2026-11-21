# tarbo-table

業務システム向けの **ゼロ依存・超高速・ヘッドレス** table ライブラリ + Supabase 風 React UI。

## パッケージ

- `@tarbo-table/core` — 状態とロジックのみのヘッドレスコア (ゼロ依存)
- `@tarbo-table/ui` — React 19 + Tailwind v4 + shadcn 風コンポーネント同梱の UI アダプタ
- `@tarbo-table/core-rs` — Rust → WebAssembly の高速エンジン (filter / sort / pagination、任意で差し替え)

## 機能ハイライト

### コア (`@tarbo-table/core`)

- **ランタイム依存ゼロ**
- AST ベースのフィルタ (同一列マルチ条件 + 複数列 AND/OR/NOT グループ化)
- マルチカラム安定ソート (nulls first/last)
- 行選択 (行ID基準、フィルタ/ソート/ページング変更で消えない)
- ページネーション (クライアントサイド)
- 列リサイズ + 列の表示/非表示
- マルチレベルヘッダー (`ColumnGroupDef.children` でネスト)
- 仮想スクロール用 `getVirtualRange` (DOM 非依存の純関数)
- 1M 行スケールで 1 フレーム予算内のフィルタ・ソート
- **オプション機能 (subpath import で opt-in)**:
  - 行グルーピング `withGrouping` (`@tarbo-table/core/grouping`)
  - 集約 API `withAggregate` + `aggregate` 純関数 (`@tarbo-table/core/aggregate`)
  - CSV / TSV エクスポート `exportRows` (`@tarbo-table/core/export`)
  - チャートデータ整形 `buildChartData` (`@tarbo-table/core/chart`)
  - CLI クエリ DSL `parseQuery` (`@tarbo-table/core/query`)

### UI (`@tarbo-table/ui`)

- `<DataTable />` — Supabase Studio 風のテーブル UI
- `<FilterBar />` — フィルタチップ + 演算子ポップオーバー (Equals / Not equal / Contains / ...)
- `<SortPopover />` — マルチカラムソート設定
- `<ColumnVisibilityMenu />` — 列の表示/非表示
- `<GroupingDropdown />` — 行グルーピング
- `<ExportMenu />` — CSV / TSV ダウンロード
- `<CommandLineInput />` — DC 風 CLI クエリ入力 (エラー位置インジケータ付き)
- `<MultiHeader />` — マルチレベルヘッダー (`buildHeaderMatrix` ベース)
- React 19 の `useSyncExternalStore` で TableInstance を購読する `useTable` フック

## バンドルサイズと subpath import

`@tarbo-table/core` は `sideEffects: false` + ESM 個別エントリで構成されており、未使用機能は bundler の tree-shaking で除去されます。最小バンドルを保証したい場合は subpath import を使ってください。

```ts
// 通常用途: filter / sort / page / selection / virtualization はぜんぶ入り
import { createTable, getVirtualRange, f } from '@tarbo-table/core';

const t = createTable({ data, columns });
t.setPredicate(f.eq('status', 'active'));
t.setSort([{ columnId: 'name', dir: 'asc' }]);

// 必要なときだけ opt-in
import { withGrouping } from '@tarbo-table/core/grouping';
import { withAggregate } from '@tarbo-table/core/aggregate';
import { exportRows } from '@tarbo-table/core/export';
import { buildChartData } from '@tarbo-table/core/chart';
import { parseQuery } from '@tarbo-table/core/query';

const gt = withGrouping(t); // → grouping mixin + aggregate mixin が attach
gt.setAggregations([{ columnId: 'salary', fn: 'sum' }]);
gt.setGroupBy(['region']);
```

`withGrouping(t)` は冪等で、内部で `withAggregate(t)` を呼ぶため、グループ集計には単発の呼び出しで足ります。

## CLI クエリ DSL

```
salary>=50000 name~"田中" by -age, name
```

| 構文                                                   | 意味                        |
| ------------------------------------------------------ | --------------------------- |
| 空白区切り                                             | 暗黙 AND                    |
| `\|` または `or`                                       | OR                          |
| `not`                                                  | 否定 (NOT)                  |
| `(...)`                                                | グループ化                  |
| `=` `!=` `>` `<` `>=` `<=`                             | 比較                        |
| `~` (like), `~^` (starts), `~$` (ends), `~i` (ci like) | パターンマッチ              |
| `is null` / `is not null`                              | NULL 判定                   |
| `in(a,b,c)`                                            | 集合                        |
| `"列 名"`                                              | スペース/特殊文字を含む列名 |
| `by col1, -col2`                                       | ソート (`-` で降順)         |

## ドキュメント

完全リファレンスは [`docs/`](./docs/) を参照してください。

- [📚 ドキュメントトップ (`docs/README.md`)](./docs/README.md)
- [🚀 はじめに (`docs/getting-started.md`)](./docs/getting-started.md) — インストール・最小サンプル・Tailwind / nuqs 設定
- [📖 `@tarbo-table/core` API](./docs/api/core.md) — ヘッドレスコアの全公開 API
- [🎨 `@tarbo-table/ui` API](./docs/api/ui.md) — React UI の全コンポーネント・hook
- [⚡ `@tarbo-table/core-rs` API](./docs/api/core-rs.md) — Rust WASM エンジン + 画像処理
- [🔍 CLI クエリ DSL](./docs/query-dsl.md) — 完全文法リファレンス
- [🧪 サンプル集 (recipes)](./docs/recipes.md) — 20 種のユースケース実コード
- [🧩 拡張ガイド](./docs/extending.md) — Mixin パターンとカスタムバックエンド実装
- [📦 使い方ガイド (USAGE)](./docs/USAGE.md) — GitHub の dist ブランチからの導入手順
- [🛠 リリース手順 (RELEASE)](./docs/RELEASE.md) — メンテナ向け

## 参考

- `examples/vanilla-1m` — `@tarbo-table/core` 単体の DOM 一体型 1M 行デモ
- `examples/react-supabase` — `@tarbo-table/ui` の Supabase 風 React デモ

## 開発

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev:vanilla   # ブラウザで 1M 行デモ
pnpm dev:react     # React + shadcn 風デモ
```

## ライセンス

[MIT](./LICENSE)
