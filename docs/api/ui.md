# `@tarbo-table/ui` API リファレンス

React 19 + Tailwind v4 + Radix ベースの Supabase 風 UI コンポーネント。`@tarbo-table/core` の `TableInstance` を prop として受け取って描画する。

> このファイルは `@tarbo-table/ui` の **全公開コンポーネント・hook・型** を網羅しています。サンプルコードは [recipes.md](../recipes.md) を参照。

---

## 目次

1. [前提セットアップ](#前提セットアップ)
2. [`<DataTable />`](#datatable)
3. [`useTable`](#usetable)
4. [`useTableUrlState`](#usetableurlstate)
5. [`useExpandedRows`](#useexpandedrows)
6. [`<Toolbar />`](#toolbar)
7. [`<FilterBar />` / `<FilterChip />` / `<OperatorPopover />`](#filterbar--filterchip--operatorpopover)
8. [`<SortPopover />`](#sortpopover)
9. [`<ColumnHeader />` / `<MultiHeader />`](#columnheader--multiheader)
10. [`<ColumnVisibilityMenu />`](#columnvisibilitymenu)
11. [`<GroupingDropdown />`](#groupingdropdown)
12. [`<ExportMenu />`](#exportmenu)
13. [`<CommandLineInput />`](#commandlineinput)
14. [`<StatusBar />`](#statusbar)
15. [`<DataChart />`](#datachart)
16. [`<EditableCell />` / `ColumnEditMeta` / `CellEditorSpec`](#editablecell)
17. [`<SubDataTable />`](#subdatatable)
18. [リッチセル: 9 種](#リッチセル-9-種)
19. [i18n: `TableLocaleProvider` / `useT` / `useTableLocale`](#i18n)
20. [カスタムレンダラー: `CellRenderContext` / `ColumnRenderMeta`](#カスタムレンダラー)

---

## 前提セットアップ

### 1. スタイルシートを import

```tsx
import '@tarbo-table/ui/styles.css';
```

これがないと Tailwind v4 のクラス定義が無効になります。

### 2. Tailwind v4 の content / source 設定

```js
// tailwind.config.{js,ts}
export default {
	content: ['./src/**/*.{ts,tsx}', './node_modules/@tarbo-table/ui/dist/**/*.{js,mjs}'],
};
```

### 3. nuqs アダプタ（URL 同期を使う場合のみ）

```tsx
import { NuqsAdapter } from 'nuqs/adapters/react'; // or next/app, react-router

createRoot(root).render(
	<NuqsAdapter>
		<App />
	</NuqsAdapter>,
);
```

---

## `<DataTable />`

Supabase 風テーブル UI の本体。Toolbar + FilterBar + 仮想スクロール + StatusBar を縦積みで構成する。

### 最小サンプル

```tsx
import { DataTable } from '@tarbo-table/ui';
import { createTable } from '@tarbo-table/core';

const table = createTable({ data, columns, pageSize: 100 });
<DataTable table={table} />;
```

### `DataTableProps<TRow>`

```ts
type DataTableProps<TRow> = {
	// ───── 必須 ─────
	table: TableInstance<TRow> &
		Partial<GroupingMixin<TRow>> &
		Partial<FocusMixin> &
		Partial<EditMixin<TRow>>;

	// ───── レイアウト ─────
	rowHeight?: number; // 行高さ px (既定 32)
	headerHeight?: number; // 予約（現状内部未使用）
	overscan?: number; // 仮想化オーバースキャン行数 (既定: viewport/rowHeight/2、最低 8)
	className?: string;

	// ───── ゾーン表示切替 ─────
	toolbar?: boolean | ReactNode; // false=非表示, true=既定 Toolbar, ReactNode=差し替え
	filterBar?: boolean | ReactNode; // 同上
	statusBar?: boolean | ReactNode; // 同上

	// ───── ヘッダーモード ─────
	headerMode?: 'auto' | 'multi' | 'flat';
	//   'auto'  : group があれば MultiHeader、なければ flat（既定）
	//   'multi' : 強制マルチレベル
	//   'flat'  : 強制フラット

	// ───── インタラクション ─────
	onRowClick?: (row: TRow, index: number) => void;
	onCellClick?: (input: { row: TRow; rowIndex: number; column: ColumnDef<TRow> }) => void;

	// ───── 無限スクロール ─────
	infiniteScroll?: boolean; // 既定 true
	infiniteThreshold?: number; // 末端から px (既定 200)

	// ───── フォールバック ─────
	loadingFallback?: ReactNode;
	errorFallback?: (error: { readonly message: string }, retry: () => void) => ReactNode;
	emptyFallback?: ReactNode;
};
```

### 内部で自動的に行うこと

- `useTable(table)` で `TableState` を購読
- `table.subscribe()` でも追加購読（Mixin 外部状態の変化を拾う）
- カラム描画の優先順位:
  1. `column.render` (ColumnRenderMeta) があればそれを使用
  2. `column.edit` + `EditMixin` 付きなら `<EditableCell />`
  3. `column.type` に応じた組み込みセル
  4. それ以外は `accessor(row)` を文字列化
- `column.cellStyle` (`ConditionalCellMeta`) があれば `evaluateCellStyle` を呼ぶ
- リレーション列クリックで `useExpandedRows` をトグルし `<SubDataTable />` を展開
- `FocusMixin` 付きの場合はキーボード操作を有効化:
  - Arrow: フォーカス移動
  - Shift+Arrow: 範囲選択
  - PageUp/Down, Home/End
  - Escape: フォーカス・範囲クリア
  - Ctrl/Cmd+C: 範囲を TSV でクリップボードコピー
- `role="grid"` / `aria-rowcount` / `aria-colcount` / `role="gridcell"` / `aria-selected` の付与

---

## `useTable`

`TableInstance` の `TableState` を React 状態として購読する hook。

```ts
function useTable<TRow>(table: TableInstance<TRow>): TableState;
```

```tsx
const state = useTable(table);
// state.predicate / state.sort / state.selection / state.pagination / ...
```

内部実装は `useSyncExternalStore(table.subscribe, table.getState)`。子コンポーネント (`ColumnHeader` / `FilterBar` / `SortPopover` ...) も独立してこれを使うため、無関係な変更で再レンダリングを誘発しません。

> Mixin 外の状態（`groupBy`, `focus`, `editState` 等）は `TableState` に乗らないため、それぞれの Mixin が提供する `subscribeFocus` / `subscribeEdit` を使うか、`useState` のカウンタ + `table.subscribe` で強制再レンダリングしてください。

---

## `useTableUrlState`

filter / sort 文字列を URL の query string（nuqs 経由）と同期する hook。

```ts
function useTableUrlState<TRow>(
	table: TableInstance<TRow>,
	options?: UseTableUrlStateOptions,
): UseTableUrlStateReturn;

type UseTableUrlStateOptions = {
	key?: string; // URL パラメータ名（既定 'ttq'）
	history?: 'push' | 'replace'; // 履歴エントリ種別（既定 'replace'）
	throttleMs?: number; // URL 書き込み throttle ms（既定 150）
	clearOnDefault?: boolean; // 空文字列で param を削除（既定 true）
};

type UseTableUrlStateReturn = {
	value: string; // 現在の URL クエリ文字列
	setValue: (next: string) => void; // URL を書き換える
};
```

### 使用パターン

```tsx
const { value, setValue } = useTableUrlState(table);

<CommandLineInput table={table} value={value} onValueChange={setValue} />;
```

- **URL → table**: `value` 変化時に `parseQuery` を実行し、`table.setPredicate` / `table.setSort` を呼ぶ。
- **parse 失敗は no-op**: 入力途中などのパースエラーで table 状態は変更されない。
- **初回空文字列**: 初回ロード時に空文字列の場合は table の初期状態を尊重してリセットしない。
- **chart は対象外**: chart 構文の URL 同期は `<CommandLineInput />` の内部 apply に任せ、URL state は predicate/sort のみ。

> **前提**: 祖先に `<NuqsAdapter>` を置くこと。アダプタは React (`nuqs/adapters/react`) / Next App Router (`nuqs/adapters/next/app`) / React Router (`nuqs/adapters/react-router`) など環境別。

---

## `useExpandedRows`

リレーションセルのサブテーブル展開状態を UI ローカルで管理する hook。

```ts
function useExpandedRows(): UseExpandedRows;

type ExpandedMap = ReadonlyMap<RowId, string>;

type UseExpandedRows = {
	map: ExpandedMap;
	isExpanded: (rowId: RowId, columnId: string) => boolean;
	getExpanded: (rowId: RowId) => string | undefined;
	toggle: (rowId: RowId, columnId: string) => void;
	collapse: (rowId: RowId) => void;
	collapseAll: () => void;
};
```

各行は同時に **1 つのリレーション列しか展開できない**（1 行 1 展開）。`<DataTable />` 内部で使われていますが、独立した hook として公開されているので自前テーブル実装でも使えます。

---

## `<Toolbar />`

テーブル上部の操作群。Sort / ColumnVisibility / GroupBy / Export / Refresh / Insert を縦/横並べる。

```tsx
<Toolbar
	table={table}
	onRefresh={() => table.refresh()}
	onInsert={() => openInsertModal()}
	showColumnVisibility
	showExport
	showGrouping
	exportFileName="employees"
	extra={<MyCustomButton />}
/>
```

### `ToolbarProps<TRow>`

| Prop                   | 型                                       | 既定      | 説明                                         |
| ---------------------- | ---------------------------------------- | --------- | -------------------------------------------- |
| `table`                | `TableInstance & Partial<GroupingMixin>` | —         | 必須                                         |
| `onRefresh`            | `() => void`                             | —         | 指定時のみ「再読込」ボタン表示               |
| `onInsert`             | `() => void`                             | —         | 指定時のみ「Insert」ボタン表示               |
| `extra`                | `ReactNode`                              | —         | Sort 系ボタン群の右に追加できるカスタム slot |
| `showColumnVisibility` | `boolean`                                | `true`    |                                              |
| `showExport`           | `boolean`                                | `true`    |                                              |
| `showGrouping`         | `boolean`                                | `true`    |                                              |
| `exportFileName`       | `string`                                 | `'table'` | ExportMenu のファイル名ベース                |

### 子コンポーネント関係

```
Toolbar
├── SortPopover
├── ColumnVisibilityMenu  (showColumnVisibility)
├── GroupingDropdown      (showGrouping)
├── ExportMenu            (showExport)
├── extra                 (slot)
├── Refresh ボタン        (onRefresh)
└── Insert ボタン         (onInsert)
```

---

## `<FilterBar />` / `<FilterChip />` / `<OperatorPopover />`

Supabase 風のチップ並び + Add filter ボタン。

### `<FilterBar />`

```tsx
<FilterBar table={table} />
```

```ts
type FilterBarProps<TRow> = { table: TableInstance<TRow> };
```

- `predicate` が top-level AND of leaves のときのみチップ編集可能。OR/NOT/ネストを含む複雑な predicate のときは「CLI モードで編集してください」バナーになる。
- Add filter ボタンから列を選ぶと `f.leaf(col.id, '=', '')` が追加される。

### `<FilterChip />`

1 つの leaf 条件を `[列名 演算子 値 ×]` 形式で表示・編集。

```ts
type FilterChipProps = {
	leaf: Leaf;
	onChange: (next: Leaf) => void;
	onRemove: () => void;
};
```

- 値入力は文字列。commit 時に純数字なら自動で `number` に変換。
- `isNull` / `isNotNull` のとき値入力欄を非表示。
- 演算子変更は内部の `<OperatorPopover />` に委譲。

### `<OperatorPopover />`

```ts
type OperatorPopoverProps = {
	value: FilterOp;
	onChange: (op: FilterOp) => void;
	trigger?: ReactNode; // 省略時は記号 Button
};
```

セクション分けされた演算子リスト（Equals / Not equal / Greater than / Like / Starts with / Is null / In ...）を表示。

---

## `<SortPopover />`

マルチカラムソート設定 UI。

```tsx
<SortPopover table={table} />
```

```ts
type SortPopoverProps<TRow> = { table: TableInstance<TRow> };
```

- 現在のソート列を縦に並べ、`asc/desc` トグルと × 削除。
- 「Pick a column to sort by」ドロップダウンで新規追加。
- ソート列数を Badge で表示。

---

## `<ColumnHeader />` / `<MultiHeader />`

### `<ColumnHeader />` — 1 段ヘッダー

```ts
type ColumnHeaderProps<TRow> = {
	table: TableInstance<TRow>;
	column: ColumnDef<TRow>;
	className?: string;
};
```

- クリックでソートトグル（Shift+クリックでマルチカラム追加）。
- 右端のハンドルでリサイズ（`pointerdown` / `pointermove` / `pointerup` ドラッグ）。
- ソートアイコン: ArrowUp/Down/Up-Down（未ソート時はホバーでフェードイン）。
- `column.type` がある場合、ヘッダー右端に小さく型名を表示。

### `<MultiHeader />` — マルチレベルヘッダー

```ts
type MultiHeaderProps<TRow> = { table: TableInstance<TRow> };
```

- `table.getColumnTree()` から `buildHeaderMatrix` でヘッダー行列を生成。
- 葉セル: ソートクリック + リサイズハンドル。`columnVisibility` で非表示列をスキップ。
- グループセル: ラベルのみの `<th scope="colgroup">`。`colSpan` / `rowSpan` を自動付与。
- `<DataTable />` の `headerMode='auto'` でグループ存在時、または `headerMode='multi'` のときに自動で使われる。

---

## `<ColumnVisibilityMenu />`

列の表示/非表示を切り替えるドロップダウン。

```ts
type ColumnVisibilityMenuProps<TRow> = { table: TableInstance<TRow> };
```

- 全列をチェックボックスリストで表示。
- `table.toggleColumnVisibility(c.id)` で切り替え。
- チェック後もメニューが閉じない（`e.preventDefault()`）。

---

## `<GroupingDropdown />`

行 groupBy 設定ドロップダウン。`withGrouping(t)` で GroupingMixin が attach されている場合のみ有効。

```ts
type GroupingDropdownProps<TRow> = {
	table: TableInstance<TRow> & Partial<GroupingMixin<TRow>>;
};
```

- Mixin 未 attach の場合は `null` を返し何も描画しない。
- 現在の groupBy 列をチップ（× ボタン付き）で表示。
- GroupingMixin の状態は `TableState` 外なので、内部で `useState` カウンタ + `subscribe` で強制再描画。

---

## `<ExportMenu />`

CSV / TSV / Excel (.xlsx) をブラウザ Blob ダウンロードとして出力するメニュー。

```ts
type ExportMenuProps<TRow> = {
	table: TableInstance<TRow>;
	scope?: 'visible' | 'page'; // 出力対象（既定 'visible'）
	fileName?: string; // 拡張子なしのファイル名ベース（既定 'table'）
};
```

- `scope='visible'`: `table.getVisibleRows()`（フィルタ後全行）
- `scope='page'`: `table.getPagedRows()`（現ページのみ）
- CSV / TSV は UTF-8 BOM 付き
- ダウンロードは `URL.createObjectURL` + `<a>` クリックの標準方式

---

## `<CommandLineInput />`

CLI クエリ DSL + GUI 補完バーを組み合わせたクエリ入力コンポーネント。

```tsx
<CommandLineInput
	table={table}
	value={urlValue}
	onValueChange={setUrlValue}
	onChartConfig={setChart}
	enableChart
	templates={QUERY_TEMPLATES}
	debounceMs={150}
	placeholder="salary>=50000 dept=eng by -salary"
	disableHints={false}
/>
```

### `CommandLineInputProps<TRow>`

| Prop            | 型                                      | 既定        | 説明                                                                                      |
| --------------- | --------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `table`         | `TableInstance<TRow>`                   | —           | 必須                                                                                      |
| `placeholder`   | `string`                                | —           |                                                                                           |
| `debounceMs`    | `number`                                | `150`       | parse + apply の debounce                                                                 |
| `onChartConfig` | `(config: ChartConfig \| null) => void` | —           | チャート構文を検出したら通知                                                              |
| `disableHints`  | `boolean`                               | `false`     | チップ補完を非表示にする                                                                  |
| `value`         | `string`                                | —           | controlled モード                                                                         |
| `onValueChange` | `(next: string) => void`                | —           | controlled モードの変更通知                                                               |
| `enableChart`   | `boolean`                               | `false`     | `chart` キーワード / chart-phase 補完を有効化。パース自体は常に有効、これは補完表示のみ。 |
| `templates`     | `ReadonlyArray<QueryTemplate>`          | `undefined` | 空入力時に提示するクエリ雛形。未指定 / 空配列ならテンプレートセクションを表示しない。     |

#### `QueryTemplate`

```ts
type QueryTemplate = {
	readonly label: string; // ラベル (人間向け)
	readonly insertText: string; // 入力欄に挿入される文字列
	readonly hint?: string; // 右端の補助テキスト
	readonly description?: string; // title 属性の詳細
};
```

`templates` は安定参照を渡すこと (モジュールスコープ const 推奨)。レンダごとに新しい配列を生成すると内部 `useMemo` が無効化される。

### 主要機能

- **150ms デバウンス** で `parseQuery` を実行し、成功時に `table.setPredicate` / `table.setSort` / `onChartConfig` を反映
- **controlled / uncontrolled 両対応**
- **補完候補** をカーソル位置に応じて計算（カテゴリ: `column` / `operator` / `connective` / `sort` / `chart-type` / `chart-keyword` / `aggregate-fn` / `value` / `template`）
- **キーボード**: ↑↓ で候補ハイライト、Tab / Enter で確定、Escape でブラー
- **PhaseBadge**: 現在の入力フェーズを視覚表示
- **QueryPreview**: パース成功時にフィルタ・ソート・チャートをチップで可視化
- **QuickAddMenu**: フィルタ/ソートを GUI から文字列挿入
- **ChartBuilderButton**: 種別 → groupBy → 集計関数 → 集計列の 4 ステップで `chart bar by dept sum:salary` を組み立て
- エラー時は位置インジケータ（`^`）でハイライト

### URL 同期との組み合わせ

```tsx
const { value, setValue } = useTableUrlState(table);
<CommandLineInput table={table} value={value} onValueChange={setValue} onChartConfig={setChart} />;
```

---

## `<StatusBar />`

ページネーション + 行数 + 選択数のフッター。

```ts
type StatusBarProps<TRow> = {
	table: TableInstance<TRow>;
	pageSizeOptions?: ReadonlyArray<number>; // 既定 [25, 50, 100, 500]
};
```

- `<select>` で pageSize 切り替え（`Number.POSITIVE_INFINITY` = 全件表示）。
- 選択行がある場合は `N selected` を表示。
- `useT()` でロケール対応文言を使用。

---

## `<DataChart />`

CLI クエリで指定された `ChartConfig` を pure SVG で描画する。

```tsx
<DataChart table={table} chart={chart} onCategoryClick={(cat) => filterToCategory(cat)} />
```

```ts
type DataChartProps<TRow> = {
	table: TableInstance<TRow>;
	chart: ChartConfig;
	className?: string;
	onCategoryClick?: ((category: { key: CellValue; groupBy: string }) => void) | false;
};
```

- チャート種別 5 種: `bar` / `line` / `pie` / `combo` / `bubble`
- 各レンダラは `_chart-*.tsx` に分離（依存ゼロの pure SVG）
- **filter linking**（既定）: カテゴリクリックで `f.leaf(groupBy, '=', key)` を `table.setPredicate` に渡す
- `onCategoryClick={false}` で連動を無効化、関数を渡してカスタムハンドラに

---

## `<EditableCell />`

`DataTable` 内で表示される編集可能セル。表示モード / 編集モードの 2 状態を持つ。通常は `<DataTable />` が自動で挿入するため、直接インスタンス化する必要はほとんどありません。

### `CellEditorSpec`

```ts
type CellEditorSpec =
	| { kind: 'text' }
	| { kind: 'number'; step?: number; min?: number; max?: number }
	| { kind: 'boolean' }
	| { kind: 'date' }
	| { kind: 'select'; options: ReadonlyArray<{ value: string | number | boolean; label: string }> };
```

### `ColumnEditMeta<TRow>`

```ts
type ColumnEditMeta<TRow> = {
	editor: CellEditorSpec;
	parse?: (raw: string) => unknown;
	format?: (value: unknown) => string;
	validate?: (value: unknown, row: TRow) => string | null;
};
```

`ColumnDef<TRow>` に拡張プロパティとして `edit` を追加して使う:

```ts
const columns: Array<ColumnDef<Row> & { edit?: ColumnEditMeta<Row> }> = [
	{
		id: 'salary',
		accessor: (r) => r.salary,
		type: 'number',
		edit: {
			editor: { kind: 'number', step: 10000, min: 0 },
			validate: (v) => (typeof v === 'number' && v >= 0 ? null : '0 以上で入力してください'),
		},
	},
	{
		id: 'dept',
		accessor: (r) => r.dept,
		edit: {
			editor: {
				kind: 'select',
				options: [
					{ value: 'eng', label: 'Engineering' },
					{ value: 'sales', label: 'Sales' },
				],
			},
		},
	},
];
```

### キーボード操作（編集中）

| キー                          | 動作                           |
| ----------------------------- | ------------------------------ |
| `F2` / `Enter`（表示時）      | 編集モード開始                 |
| `Delete` / `Backspace`        | 値を `null` にクリア           |
| `Enter`（編集中）             | 確定                           |
| `Escape`（編集中）            | 取消                           |
| `Tab` / `Shift+Tab`（編集中） | 確定 + フォーカスを右/左に移動 |

boolean セルは変更時即 commit（編集モードを経由しない）。

### `EditableCellProps`

```ts
type EditableCellProps<TRow> = {
	table: TableInstance<TRow> & EditMixin<TRow> & Partial<FocusMixin>;
	column: ColumnDef<TRow> & { edit?: ColumnEditMeta<TRow> };
	row: TRow;
	rowId: RowId;
	isFocused: boolean;
	onEnterEdit?: () => void;
	onExitEdit?: () => void;
};
```

`table.getCellEdit(rowId, columnId)` で `inFlight` / `error` 状態を取得し、保存中インジケーターとエラー表示を行う。

---

## `<SubDataTable />`

リレーションセル展開時に行直下に表示される軽量サブテーブル。

```ts
type SubDataTableProps = {
	relationSource: RelationSource;
	tableId: string; // 参照先テーブル ID
	ids: ReadonlyArray<RowId>; // 展開対象のレコード ID 群
	className?: string;
};
```

- `relationSource.fetchByIds(tableId, ids)` で非同期フェッチ
- 64 件上限の module-level LRU キャッシュ（キー: `tableId|sorted(ids)`）
- ヘッダー + 行のみのシンプル表（filter/sort/pagination は未対応）
- エラー時はエラー表示、フェッチ中はスピナー

`<DataTable />` がリレーション列展開時に自動挿入します。

---

## リッチセル: 9 種

すべて `@tarbo-table/ui` から名前付き export されています。`<DataTable />` 内で `column.type` に応じて自動的に使われますが、自前の `column.render` でも直接呼び出せます。

各セルは `@tarbo-table/core` の `CellMeta` の対応する `kind` の Extract 型を受け取ります。

### `<ImageCell />` — 画像サムネ

```ts
type ImageCellProps = {
	meta: { kind: 'image'; src: string; alt?: string; width?: number; height?: number };
	size?: number; // 既定 22 px
	thumbnail?: boolean; // 既定 true（Rust パイプラインが利用可能なら使う）
	className?: string;
};
```

- エラー時は `ImageOff` アイコンのフォールバック
- `loading="lazy"` / `decoding="async"`

### `<LinkCell />` — リンク

```ts
type LinkCellProps = {
	meta: { kind: 'link'; href: string; label?: string; external?: boolean };
	className?: string;
};
```

- 外部リンクは `target="_blank"` + `rel="noopener noreferrer"` + ExternalLink アイコン
- `e.stopPropagation()` で行選択と衝突しない

### `<CheckboxCell />` — チェックボックス

```ts
type CheckboxCellProps = {
	meta: { kind: 'checkbox'; checked: boolean; indeterminate?: boolean };
	disabled?: boolean;
	onChange?: (next: boolean) => void;
	className?: string;
};
```

- `onChange` 未指定なら読み取り専用
- `indeterminate` 対応（`-` アイコン）

### `<SparklineCell />` — スパークライン

```ts
type SparklineCellProps = {
	meta: { kind: 'sparkline'; values: ReadonlyArray<number>; baseline?: number; color?: string };
	height?: number; // 既定 22
	className?: string;
};
```

- pure SVG（依存ゼロ）
- `preserveAspectRatio="none"` で td 幅に伸縮
- 最終点に小さな円
- 全値同一なら中央水平線

### `<RelationBadgeCell />` — リレーションバッジ

```ts
type RelationBadgeCellProps = {
	meta: SingleMeta | ManyMeta;
	// SingleMeta = { kind: 'relation'; label; avatar?; color?; recordRef }
	// ManyMeta   = { kind: 'relation-many'; refs: RelationRef[]; max? }
	onExpand?: () => void;
	className?: string;
};
```

- `relation-many` の場合は `max`（既定 2）件まで表示し、残りは `+N more` ピル
- `onExpand` 指定時は `cursor-pointer`
- アバターがない場合はイニシャル文字（1 文字）の丸アイコン

### `<StarCell />` — 星評価

```ts
type StarCellProps = {
	meta: { kind: 'star'; value: number; max?: number };
	size?: number; // 星 1 個のサイズ px（既定 14）
	className?: string;
};
```

- 半分単位（0.5 刻み）の塗りに対応（SVG clipPath）
- 右に数値を表示

### `<TagsCell />` — タグチップ

```ts
type TagsCellProps = {
	meta: { kind: 'tags'; tags: ReadonlyArray<{ label: string; color?: string }>; max?: number };
	className?: string;
};
```

- `max`（既定 4）超過分は `+N more`
- `color` 未指定タグはラベルから決定的ハッシュで OKLCH パレット（8 色）に配色

### `<ProgressCell />` — プログレスバー

```ts
type ProgressCellProps = {
	meta: {
		kind: 'progress';
		value: number;
		max?: number; // 既定 100
		color?: string;
		label?: 'percent' | 'value' | 'none'; // 既定 'percent'
	};
	className?: string;
};
```

- 自動色: 0..40% 赤系、40..70% 琥珀、70..100% 緑
- `role="progressbar"` + `aria-valuenow/min/max` 付き

### `<UserCell />` — ユーザーカード

```ts
type UserCellProps = {
	meta: { kind: 'user'; name: string; email?: string; avatar?: string; color? };
	className?: string;
};
```

- アバターがない場合は名前のイニシャル（最大 2 文字）の丸アイコン
- `useThumbnailUrl` で 22 px サムネに最適化
- メールは 9 px で 2 行目に表示

---

## i18n

### `<TableLocaleProvider />`

```ts
type TableLocaleProviderProps = {
	locale?: LocaleId; // 既定 'ja'
	messages?: Partial<LocaleMessages>; // 部分上書き
	currency?: string; // 既定: 'ja' → 'JPY'、その他 → 'USD'
	children: ReactNode;
};

type LocaleId = 'ja' | 'en' | string;
```

```tsx
<TableLocaleProvider locale="en" currency="USD">
	<DataTable table={table} />
</TableLocaleProvider>
```

未知の `locale` は `'ja'` ベースにフォールバック。Provider なしでも日本語が既定で使われます。

### `LocaleMessages` — 全 24 キー

| キー                    | 既定（ja）                                    |
| ----------------------- | --------------------------------------------- |
| `toolbar.sort`          | ソート                                        |
| `toolbar.columns`       | 列                                            |
| `toolbar.export`        | エクスポート                                  |
| `toolbar.groupBy`       | グループ化                                    |
| `toolbar.refresh`       | 再読込                                        |
| `toolbar.insert`        | 追加                                          |
| `filter.addFilter`      | フィルタを追加                                |
| `filter.placeholder`    | 値を入力                                      |
| `filter.advancedHint`   | 複雑なフィルタは CLI モードで編集してください |
| `status.page`           | ページ                                        |
| `status.of`             | /                                             |
| `status.records`        | 件                                            |
| `status.selected`       | 選択中                                        |
| `status.allOption`      | 全件                                          |
| `status.rowsSuffix`     | 行                                            |
| `export.label`          | エクスポート                                  |
| `editable.saving`       | 保存中…                                       |
| `editable.dismissError` | 閉じる                                        |
| `editable.save`         | 保存                                          |
| `editable.cancel`       | キャンセル                                    |
| `server.loading`        | 読み込み中…                                   |
| `server.empty`          | データがありません                            |
| `server.retry`          | 再試行                                        |
| `group.noneKey`         | (未分類)                                      |
| `group.count`           | 件                                            |

### `useT()` — 文言引きショートカット

```ts
const t = useT();
<button>{t('toolbar.sort')}</button>
```

### `useTableLocale()` — Context 全体

```ts
type TableLocale = {
	locale: LocaleId;
	messages: LocaleMessages;
	numberFormat: Intl.NumberFormat;
	dateTimeFormat: Intl.DateTimeFormat;
	currencyFormat: Intl.NumberFormat;
};

const { numberFormat, currencyFormat } = useTableLocale();
const formatted = currencyFormat.format(123456); // ¥123,456
```

---

## カスタムレンダラー

`ColumnDef` に `render` を追加するパターンで、`type` ベースの組み込みセルを上書きできます。

### `CellRenderContext<TRow>`

```ts
type CellRenderContext<TRow> = {
	row: TRow;
	value: CellValue; // accessor の戻り値
	cellMeta: CellMeta | null; // ColumnDef.cellMeta があれば
	column: ColumnDef<TRow>;
	rowId: RowId;
	isFocused: boolean;
};
```

### `ColumnRenderMeta<TRow>`

```ts
type ColumnRenderMeta<TRow> = {
	render?: (ctx: CellRenderContext<TRow>) => ReactNode;
};
```

### 使い方

```tsx
const columns: Array<ColumnDef<Row> & ColumnRenderMeta<Row>> = [
	{
		id: 'status',
		accessor: (r) => r.status,
		render: ({ value, isFocused }) => (
			<span className={value === 'active' ? 'text-green-600' : 'text-gray-400'}>
				{String(value)}
			</span>
		),
	},
];
```

`<DataTable />` 内では `column.render` が最優先で使われ、`column.edit` や `column.type` の組み込みセルより先に評価されます。

---

## 公開エクスポート全一覧

| エクスポート                                                                                                                                   | 種別              |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `DataTable`, `DataTableProps`, `CellRenderContext`, `ColumnRenderMeta`                                                                         | Component / Types |
| `useTable`                                                                                                                                     | Hook              |
| `useTableUrlState`, `UseTableUrlStateOptions`, `UseTableUrlStateReturn`                                                                        | Hook / Types      |
| `useExpandedRows`, `ExpandedMap`, `UseExpandedRows`                                                                                            | Hook / Types      |
| `Toolbar`, `ToolbarProps`                                                                                                                      | Component         |
| `FilterBar`, `FilterBarProps`                                                                                                                  | Component         |
| `FilterChip`, `FilterChipProps`                                                                                                                | Component         |
| `OperatorPopover`, `OperatorPopoverProps`                                                                                                      | Component         |
| `SortPopover`, `SortPopoverProps`                                                                                                              | Component         |
| `ColumnHeader`, `ColumnHeaderProps`                                                                                                            | Component         |
| `ColumnVisibilityMenu`, `ColumnVisibilityMenuProps`                                                                                            | Component         |
| `GroupingDropdown`, `GroupingDropdownProps`                                                                                                    | Component         |
| `ExportMenu`, `ExportMenuProps`                                                                                                                | Component         |
| `CommandLineInput`, `CommandLineInputProps`                                                                                                    | Component         |
| `MultiHeader`, `MultiHeaderProps`                                                                                                              | Component         |
| `StatusBar`, `StatusBarProps`                                                                                                                  | Component         |
| `DataChart`, `DataChartProps`                                                                                                                  | Component         |
| `EditableCell`, `EditableCellProps`, `CellEditorSpec`, `ColumnEditMeta`                                                                        | Component / Types |
| `SubDataTable`, `SubDataTableProps`                                                                                                            | Component         |
| `TableLocaleProvider`, `TableLocaleProviderProps`, `useT`, `useTableLocale`, `LocaleId`, `LocaleMessages`, `TableLocale`                       | i18n              |
| `ImageCell`, `LinkCell`, `CheckboxCell`, `SparklineCell`, `RelationBadgeCell`, `StarCell`, `TagsCell`, `ProgressCell`, `UserCell` + 各 `Props` | リッチセル        |

---

## 関連ドキュメント

- [@tarbo-table/core API リファレンス](./core.md)
- [@tarbo-table/core-rs API リファレンス](./core-rs.md)
- [CLI クエリ DSL](../query-dsl.md)
- [サンプル集 (recipes)](../recipes.md)
