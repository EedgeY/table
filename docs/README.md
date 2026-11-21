# tarbo-table ドキュメント

業務システム向けの **ゼロ依存・超高速・ヘッドレス** table ライブラリ + Supabase 風 React UI。

> このディレクトリは tarbo-table の完全リファレンスです。各章は独立して読めますが、初めての方は [はじめに](./getting-started.md) → [@tarbo-table/core API](./api/core.md) の順で読むのがおすすめです。

---

## パッケージ構成

| パッケージ             | 内容                                                                                                                                                                                                                                                                                    | ランタイム依存                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `@tarbo-table/core`    | 状態とロジックのみのヘッドレスコア。filter AST / multi-sort / pagination / virtualization / selection / grouping / aggregate / export / chart / query DSL / pivot / edit / focus / persist / xlsx / clipboard。                                                                         | **ゼロ**                           |
| `@tarbo-table/ui`      | React 19 + Tailwind v4 + Radix ベースの Supabase 風 UI コンポーネント。DataTable / Toolbar / FilterBar / SortPopover / ColumnVisibilityMenu / GroupingDropdown / ExportMenu / CommandLineInput / MultiHeader / StatusBar / DataChart / EditableCell / SubDataTable / 9 種のリッチセル。 | React 19 + 上記                    |
| `@tarbo-table/core-rs` | Rust → WebAssembly の高速エンジン（filter / sort）。1M 行クラスのフィルタ・ソートを 1 フレーム予算内に。`image` サブモジュールに画像処理パイプラインも同梱。                                                                                                                            | **ゼロ** (peer: react は optional) |

---

## ドキュメント目次

### 入門

- **[はじめに](./getting-started.md)** — インストール、最小サンプル、ピア依存、Tailwind 設定、nuqs アダプタ、ロード手順
- **[使い方ガイド (USAGE)](./USAGE.md)** — GitHub の dist ブランチからの導入手順、dist ブランチ運用、Vite / Next.js での WASM ロード
- **[サンプル集 (recipes)](./recipes.md)** — 1M 行 / Supabase 風 UI / リッチセル / リレーション展開 / 編集 + Undo / 永続化 / URL 同期 / ピボット / チャート の実コード

### API リファレンス

- **[@tarbo-table/core](./api/core.md)** — ヘッドレスコアの全公開 API（型・関数）
- **[@tarbo-table/ui](./api/ui.md)** — React UI の全コンポーネント・hook・Props
- **[@tarbo-table/core-rs](./api/core-rs.md)** — Rust WASM エンジン (`./node` / `./web` / `./react` / `./image`)
- **[クエリ DSL](./query-dsl.md)** — CLI 風クエリ言語の完全文法

### 上級

- **[拡張ガイド](./extending.md)** — Mixin パターン（withGrouping / withAggregate / withFocus / withEdit / withPersist）、カスタム DataSource / EngineDriver / RelationSource の実装
- **[リリース手順 (RELEASE)](./RELEASE.md)** — メンテナ向けの dist ブランチビルド・タグ運用

---

## アーキテクチャ俯瞰

```
                ┌─────────────────────────────────┐
                │   @tarbo-table/ui  (React)      │
                │  DataTable / FilterBar / ...    │
                └────────────┬────────────────────┘
                             │  TableInstance を prop / useTable で購読
                             ▼
                ┌─────────────────────────────────┐
                │  @tarbo-table/core  (zero-dep)  │
                │                                 │
                │  createTable(opts) ──► TableInstance
                │       │
                │       ├─ pipeline:  filter → sort → page
                │       │   （dirty flag + Uint32Array indices）
                │       │
                │       ├─ subscribe / subscribeWithSelector
                │       │
                │       └─ engine: EngineDriverFactory (差し替え可)
                │                       ▲
                └───────────────────────│─────────┘
                                        │
                ┌───────────────────────│─────────┐
                │ @tarbo-table/core-rs  │         │
                │   rsDriverFactory ────┘         │
                │   (Rust → WASM via wasm-bindgen)│
                └─────────────────────────────────┘
```

- **パイプライン**: `filter → sort → page`。`Uint32Array` の行インデックスを使い、行データは一切コピーしない。dirty flag で再計算を最小化。
- **状態**: `TableState` は `Object.freeze` 済み不変オブジェクト。setter は新しい state を生成して全 listener に通知。
- **拡張**: `withGrouping` / `withAggregate` / `withEdit` / `withFocus` / `withPersist` は冪等な mixin で TableInstance を増強する。

---

## 機能マトリクス

| 機能                                   | パッケージ               | エクスポート                                                                                                                              |
| -------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| テーブル生成                           | core                     | `createTable`                                                                                                                             |
| フィルタ AST                           | core                     | `f`, `Predicate`, `Leaf`, `Group`                                                                                                         |
| マルチカラム安定ソート                 | core                     | `SortKey`, `SortSpec`                                                                                                                     |
| 仮想スクロール範囲計算（DOM 非依存）   | core                     | `getVirtualRange`                                                                                                                         |
| 行選択 (single / multi)                | core                     | `createSelectionState`, `RowId`                                                                                                           |
| ページネーション (client)              | core                     | `createPaginationState`                                                                                                                   |
| マルチレベルヘッダー                   | core                     | `buildHeaderMatrix`, `ColumnGroupDef`                                                                                                     |
| 行グルーピング (階層)                  | core/grouping            | `withGrouping`                                                                                                                            |
| 集約 (sum / avg / median / p95 / …)    | core/aggregate           | `aggregate`, `withAggregate`                                                                                                              |
| CSV / TSV エクスポート                 | core/export              | `exportRows`                                                                                                                              |
| XLSX エクスポート                      | core/xlsx                | `exportXlsx`                                                                                                                              |
| ピボット (rows × cols × values)        | core/pivot               | `pivot`                                                                                                                                   |
| 条件付き書式 (scale / bar / compare)   | core/conditional-style   | `evaluateCellStyle`                                                                                                                       |
| クリップボード TSV (Excel 互換)        | core/clipboard           | `toTsv`, `parseTsv`, `buildPasteCellPatches`                                                                                              |
| CLI クエリ DSL                         | core/query               | `parseQuery`, `stringifyQuery`                                                                                                            |
| チャートデータ整形                     | core/chart               | `buildChartData`                                                                                                                          |
| インライン編集 + Undo/Redo             | core/edit                | `withEdit`                                                                                                                                |
| キーボードフォーカス + 範囲選択        | core/focus               | `withFocus`                                                                                                                               |
| 状態永続化 (localStorage / URL)        | core/persist             | `withPersist`                                                                                                                             |
| サーバーモード (fetch / realtime)      | core/data-source         | `DataSource`, `createMemoryDataSource`                                                                                                    |
| REST アダプタ                          | core/source-rest         | `createRestDataSource`                                                                                                                    |
| リレーション解決                       | core/relation-source     | `createMemoryRelationSource`                                                                                                              |
| Rust WASM エンジン                     | core-rs/{node,web,react} | `rsDriverFactory`, `loadRsDriverFactory`, `useRsDriverFactory`                                                                            |
| 画像処理 (compress / thumb / blurhash) | core-rs/image            | `loadImagePipeline`                                                                                                                       |
| React テーブル本体                     | ui                       | `<DataTable />`                                                                                                                           |
| React URL 同期 (nuqs)                  | ui                       | `useTableUrlState`                                                                                                                        |
| 9 種のリッチセル                       | ui                       | `ImageCell` / `LinkCell` / `CheckboxCell` / `SparklineCell` / `RelationBadgeCell` / `StarCell` / `TagsCell` / `ProgressCell` / `UserCell` |
| ロケール (ja / en)                     | ui                       | `<TableLocaleProvider />`, `useT`                                                                                                         |

---

## サンプルアプリ

| サンプル                   | 場所                                                     | 起動               |
| -------------------------- | -------------------------------------------------------- | ------------------ |
| 1M 行 DOM デモ (core 単体) | [`examples/vanilla-1m`](../examples/vanilla-1m/)         | `pnpm dev:vanilla` |
| Supabase 風 React デモ     | [`examples/react-supabase`](../examples/react-supabase/) | `pnpm dev:react`   |

---

## ライセンス

MIT。詳細は各パッケージの `package.json` を参照してください。
