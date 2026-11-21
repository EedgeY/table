import { ReactNode } from "react";
import { CellMeta, CellValue, ChartConfig, ColumnDef, FilterOp, Leaf, RelationSource, RowId, TableInstance, TableState } from "@tarbo-table/core";
import { EditMixin } from "@tarbo-table/core/edit";
import { FocusMixin } from "@tarbo-table/core/focus";
import { GroupingMixin } from "@tarbo-table/core/grouping";

//#region src/column-header.d.ts
type ColumnHeaderProps<TRow> = {
  readonly table: TableInstance<TRow>;
  readonly column: ColumnDef<TRow>;
  readonly className?: string;
};
declare function ColumnHeader<TRow>(props: ColumnHeaderProps<TRow>): ReactNode;
//#endregion
//#region src/column-visibility-menu.d.ts
type ColumnVisibilityMenuProps<TRow> = {
  readonly table: TableInstance<TRow>;
};
declare function ColumnVisibilityMenu<TRow>(props: ColumnVisibilityMenuProps<TRow>): ReactNode;
//#endregion
//#region src/_command-completion.d.ts
/**
 * Consumer が `CommandLineInput.templates` に渡すクエリ雛形。
 * 空入力時にテンプレートセクションとして提示される。
 */
type QueryTemplate = {
  /** ポップオーバーに表示するラベル (人間向け)。 */readonly label: string; /** 入力欄に挿入される文字列。 */
  readonly insertText: string; /** 右端の補助テキスト (例: '棒グラフ')。 */
  readonly hint?: string; /** title 属性に出る詳細説明 (任意)。 */
  readonly description?: string;
};
//#endregion
//#region src/command-line-input.d.ts
type CommandLineInputProps<TRow> = {
  readonly table: TableInstance<TRow>;
  readonly placeholder?: string;
  readonly debounceMs?: number; /** チャート構文がパース成功したときに呼ばれる。入力からチャート指定が消えたら null。 */
  readonly onChartConfig?: (config: ChartConfig | null) => void; /** 補完ポップオーバーを無効化する。既定 false。 */
  readonly disableHints?: boolean;
  /**
   * controlled モード: 入力文字列を親から渡す。`useTableUrlState` の `value` を
   * 渡すと URL ↔ 入力欄の双方向同期が成立する。未指定なら uncontrolled。
   */
  readonly value?: string; /** controlled モードで入力値が変わったときの通知。`useTableUrlState` の `setValue` を渡す。 */
  readonly onValueChange?: (next: string) => void;
  /**
   * chart 構文 (`chart bar by … sum:…`) の補完候補を有効化。既定 false。
   * パーサ自体は常に chart 構文を解釈する。これは補完表示の制御のみ。
   */
  readonly enableChart?: boolean;
  /**
   * 空入力時にテンプレートセクションとして提示するクエリ雛形。
   * 未指定 / 空配列ならテンプレートセクションを表示しない。
   * 安定参照を渡すこと (モジュールスコープ const 推奨)。再生成すると useMemo が無効化される。
   */
  readonly templates?: ReadonlyArray<QueryTemplate>;
};
declare function CommandLineInput<TRow>(props: CommandLineInputProps<TRow>): ReactNode;
//#endregion
//#region src/data-chart.d.ts
type DataChartProps<TRow> = {
  readonly table: TableInstance<TRow>;
  readonly chart: ChartConfig;
  readonly className?: string;
  /**
   * カテゴリクリック時のコールバック。
   * 既定では `table.setPredicate` を呼んで `groupBy` 列で絞り込む (filter linking)。
   * `false` を渡すと連動を完全に無効化。
   */
  readonly onCategoryClick?: ((category: {
    readonly key: CellValue;
    readonly groupBy: string;
  }) => void) | false;
};
declare function DataChart<TRow>(props: DataChartProps<TRow>): ReactNode;
//#endregion
//#region src/data-table.d.ts
/**
 * `ColumnDef.render` に渡される描画コンテキスト。
 * - `value` は accessor のプリミティブ戻り値（filter/sort のキーと同じ）。
 * - `cellMeta` は `ColumnDef.cellMeta` がある場合のみ。
 */
type CellRenderContext<TRow> = {
  readonly row: TRow;
  readonly value: CellValue;
  readonly cellMeta: CellMeta | null;
  readonly column: ColumnDef<TRow>;
  readonly rowId: RowId;
  readonly isFocused: boolean;
};
/**
 * セル描画拡張。`ColumnDef` を inline で拡張するパターン
 * （`editable-cell.tsx` の `ColumnEditMeta` と同じ）。
 */
type ColumnRenderMeta<TRow> = {
  readonly render?: (ctx: CellRenderContext<TRow>) => ReactNode;
};
type DataTableProps<TRow> = {
  readonly table: TableInstance<TRow> & Partial<GroupingMixin<TRow>> & Partial<FocusMixin> & Partial<EditMixin<TRow>>;
  readonly rowHeight?: number;
  readonly headerHeight?: number;
  readonly overscan?: number;
  readonly className?: string; /** false で非表示、ReactNode でカスタム差し替え、true (既定) で標準 Toolbar。 */
  readonly toolbar?: boolean | ReactNode;
  readonly filterBar?: boolean | ReactNode;
  readonly statusBar?: boolean | ReactNode;
  /**
   * マルチレベルヘッダーを使うか。
   * - 'auto' (既定): columns にグループがあれば自動で multi、なければ flat
   * - 'multi' / 'flat': 強制指定
   */
  readonly headerMode?: 'auto' | 'multi' | 'flat';
  readonly onRowClick?: (row: TRow, index: number) => void; /** セル onClick (Editable cell や detail panel 切替用)。 */
  readonly onCellClick?: (input: {
    row: TRow;
    rowIndex: number;
    column: ColumnDef<TRow>;
  }) => void; /** Infinite scroll: 末端近くに到達すると fetchMore を発火する。既定 true。 */
  readonly infiniteScroll?: boolean; /** 末端から何 px 手前で fetchMore を発火するか。既定 200。 */
  readonly infiniteThreshold?: number; /** カスタムスケルトン (mode='server' && rows=0 && status='loading' のとき)。 */
  readonly loadingFallback?: ReactNode; /** カスタムエラー (mode='server' && status='error') 表示。 */
  readonly errorFallback?: (error: {
    readonly message: string;
  }, retry: () => void) => ReactNode; /** カスタム空状態 (rows=0 && status='idle') の表示。 */
  readonly emptyFallback?: ReactNode;
};
declare function DataTable<TRow>(props: DataTableProps<TRow>): ReactNode;
//#endregion
//#region src/cells/checkbox-cell.d.ts
type CheckboxCellProps = {
  readonly meta: Extract<CellMeta, {
    kind: 'checkbox';
  }>;
  readonly disabled?: boolean;
  readonly onChange?: (next: boolean) => void;
  readonly className?: string;
};
declare function CheckboxCell(props: CheckboxCellProps): ReactNode;
//#endregion
//#region src/cells/image-cell.d.ts
type ImageCellProps = {
  readonly meta: Extract<CellMeta, {
    kind: 'image';
  }>;
  readonly size?: number;
  readonly className?: string; /** false にすると Rust パイプラインを使わず素の `<img>` で描画する。既定 true。 */
  readonly thumbnail?: boolean;
};
declare function ImageCell(props: ImageCellProps): ReactNode;
//#endregion
//#region src/cells/link-cell.d.ts
type LinkCellProps = {
  readonly meta: Extract<CellMeta, {
    kind: 'link';
  }>;
  readonly className?: string;
};
declare function LinkCell(props: LinkCellProps): ReactNode;
//#endregion
//#region src/cells/progress-cell.d.ts
type ProgressCellProps = {
  readonly meta: Extract<CellMeta, {
    kind: 'progress';
  }>;
  readonly className?: string;
};
declare function ProgressCell(props: ProgressCellProps): ReactNode;
//#endregion
//#region src/cells/relation-badge-cell.d.ts
type SingleMeta = Extract<CellMeta, {
  kind: 'relation';
}>;
type ManyMeta = Extract<CellMeta, {
  kind: 'relation-many';
}>;
type RelationBadgeCellProps = {
  readonly meta: SingleMeta | ManyMeta;
  readonly onExpand?: () => void;
  readonly className?: string;
};
declare function RelationBadgeCell(props: RelationBadgeCellProps): ReactNode;
//#endregion
//#region src/cells/sparkline-cell.d.ts
type SparklineCellProps = {
  readonly meta: Extract<CellMeta, {
    kind: 'sparkline';
  }>;
  readonly height?: number;
  readonly className?: string;
};
declare function SparklineCell(props: SparklineCellProps): ReactNode;
//#endregion
//#region src/cells/star-cell.d.ts
type StarCellProps = {
  readonly meta: Extract<CellMeta, {
    kind: 'star';
  }>;
  readonly size?: number;
  readonly className?: string;
};
declare function StarCell(props: StarCellProps): ReactNode;
//#endregion
//#region src/cells/tags-cell.d.ts
type TagsCellProps = {
  readonly meta: Extract<CellMeta, {
    kind: 'tags';
  }>;
  readonly className?: string;
};
declare function TagsCell(props: TagsCellProps): ReactNode;
//#endregion
//#region src/cells/user-cell.d.ts
type UserCellProps = {
  readonly meta: Extract<CellMeta, {
    kind: 'user';
  }>;
  readonly className?: string;
};
declare function UserCell(props: UserCellProps): ReactNode;
//#endregion
//#region src/editable-cell.d.ts
type CellEditorSpec = {
  readonly kind: 'text';
} | {
  readonly kind: 'number';
  readonly step?: number;
  readonly min?: number;
  readonly max?: number;
} | {
  readonly kind: 'boolean';
} | {
  readonly kind: 'date';
} | {
  readonly kind: 'select';
  readonly options: ReadonlyArray<{
    readonly value: string | number | boolean;
    readonly label: string;
  }>;
};
/**
 * ColumnDef に編集メタを乗せたい場合は、`ColumnDef` を拡張した型として宣言する。
 * tarbo-table 側で declaration merging するのではなく、利用側で
 * `columns: Array<ColumnDef<T> & { edit?: ColumnEditMeta }>` のように使う想定。
 */
type ColumnEditMeta<TRow = unknown> = {
  readonly editor: CellEditorSpec;
  readonly parse?: (raw: string) => unknown;
  readonly format?: (value: unknown) => string;
  readonly validate?: (value: unknown, row: TRow) => string | null;
};
type EditableCellProps<TRow> = {
  readonly table: TableInstance<TRow> & EditMixin<TRow> & Partial<FocusMixin>;
  readonly column: ColumnDef<TRow> & {
    readonly edit?: ColumnEditMeta<TRow>;
  };
  readonly row: TRow;
  readonly rowId: RowId;
  readonly isFocused: boolean; /** 編集モードに入った瞬間に呼ばれる。範囲選択クリアなど。 */
  readonly onEnterEdit?: () => void; /** 編集モード終了時。 */
  readonly onExitEdit?: () => void;
};
declare function EditableCell<TRow>(props: EditableCellProps<TRow>): ReactNode;
//#endregion
//#region src/export-menu.d.ts
type ExportMenuProps<TRow> = {
  readonly table: TableInstance<TRow>; /** 出力対象スコープ。'visible' (フィルタ後全行) / 'page' (現ページのみ)。既定 'visible'。 */
  readonly scope?: 'visible' | 'page'; /** ファイル名のベース。拡張子なし。既定 'table'。 */
  readonly fileName?: string;
};
declare function ExportMenu<TRow>(props: ExportMenuProps<TRow>): ReactNode;
//#endregion
//#region src/filter-bar.d.ts
type FilterBarProps<TRow> = {
  readonly table: TableInstance<TRow>;
  /**
   * ルート div の追加 className。tailwind-merge で既定の衝突クラスは上書きされる。
   * 内部パーツを深くカスタムしたい場合は `FilterChip` などのパーツを export 済みなので
   * composition で自前 FilterBar を組むこと。
   */
  readonly className?: string;
};
declare function FilterBar<TRow>(props: FilterBarProps<TRow>): ReactNode;
//#endregion
//#region src/filter-chip.d.ts
type FilterChipProps = {
  readonly leaf: Leaf;
  readonly onChange: (next: Leaf) => void;
  readonly onRemove: () => void;
};
declare function FilterChip(props: FilterChipProps): ReactNode;
//#endregion
//#region src/grouping-dropdown.d.ts
type GroupingDropdownProps<TRow> = {
  readonly table: TableInstance<TRow> & Partial<GroupingMixin<TRow>>;
};
declare function GroupingDropdown<TRow>(props: GroupingDropdownProps<TRow>): ReactNode;
//#endregion
//#region src/multi-header.d.ts
type MultiHeaderProps<TRow> = {
  readonly table: TableInstance<TRow>;
};
declare function MultiHeader<TRow>(props: MultiHeaderProps<TRow>): ReactNode;
//#endregion
//#region src/operator-popover.d.ts
type OperatorPopoverProps = {
  readonly value: FilterOp;
  readonly onChange: (op: FilterOp) => void;
  readonly trigger?: ReactNode;
};
declare function OperatorPopover(props: OperatorPopoverProps): ReactNode;
//#endregion
//#region src/sort-popover.d.ts
type SortPopoverProps<TRow> = {
  readonly table: TableInstance<TRow>;
};
declare function SortPopover<TRow>(props: SortPopoverProps<TRow>): ReactNode;
//#endregion
//#region src/status-bar.d.ts
type StatusBarProps<TRow> = {
  readonly table: TableInstance<TRow>;
  readonly pageSizeOptions?: ReadonlyArray<number>;
};
declare function StatusBar<TRow>(props: StatusBarProps<TRow>): ReactNode;
//#endregion
//#region src/toolbar.d.ts
type ToolbarProps<TRow> = {
  readonly table: TableInstance<TRow> & Partial<GroupingMixin<TRow>>;
  readonly onRefresh?: () => void;
  readonly onInsert?: () => void;
  readonly extra?: ReactNode;
  readonly showColumnVisibility?: boolean;
  readonly showExport?: boolean;
  readonly showGrouping?: boolean;
  readonly exportFileName?: string;
};
declare function Toolbar<TRow>(props: ToolbarProps<TRow>): ReactNode;
//#endregion
//#region src/sub-table.d.ts
type SubDataTableProps = {
  readonly relationSource: RelationSource;
  readonly tableId: string;
  readonly ids: ReadonlyArray<RowId>;
  readonly className?: string;
};
declare function SubDataTable(props: SubDataTableProps): ReactNode;
//#endregion
//#region src/use-expanded-rows.d.ts
type ExpandedMap = ReadonlyMap<RowId, string>;
type UseExpandedRows = {
  readonly map: ExpandedMap;
  readonly isExpanded: (rowId: RowId, columnId: string) => boolean;
  readonly getExpanded: (rowId: RowId) => string | undefined;
  readonly toggle: (rowId: RowId, columnId: string) => void;
  readonly collapse: (rowId: RowId) => void;
  readonly collapseAll: () => void;
};
declare function useExpandedRows(): UseExpandedRows;
//#endregion
//#region src/use-table.d.ts
/**
 * createTable で作った TableInstance を React 状態としてリアクティブに購読する。
 * 戻り値は state スナップショット。コンポーネントは state 変更時に再レンダーされる。
 */
declare function useTable<TRow>(table: TableInstance<TRow>): TableState;
//#endregion
//#region src/use-table-url-state.d.ts
type UseTableUrlStateOptions = {
  /** URL クエリパラメータ名。既定 `'ttq'`。 */readonly key?: string; /** 履歴エントリの種別。既定 `'replace'` (フィルタ操作で履歴を汚さない)。 */
  readonly history?: 'push' | 'replace'; /** URL 書き込み throttle (ms)。既定 150ms。 */
  readonly throttleMs?: number; /** 空文字列のとき param を URL から削除。既定 `true`。 */
  readonly clearOnDefault?: boolean;
};
type UseTableUrlStateReturn = {
  /** 現在の URL クエリ文字列 (空なら `''`)。 */readonly value: string; /** URL を書き換える。空文字列 + `clearOnDefault` で param が消える。 */
  readonly setValue: (next: string) => void;
};
/**
 * URL に DSL 文字列を保存し、table の predicate / sort を同期する。
 *
 * 副作用:
 * - URL → table: 値が変わるたび parseQuery して predicate / sort を反映
 *   (chart は table state に乗らないので無視)
 * - parseQuery 失敗は no-op (入力途中など、テーブルは壊さない)
 *
 * 完全同期 (chart 含む) には戻り値 `{ value, setValue }` を `CommandLineInput`
 * に渡すこと。CommandLineInput 内部の debounce 付き apply が chart も処理する。
 */
declare function useTableUrlState<TRow>(table: TableInstance<TRow>, options?: UseTableUrlStateOptions): UseTableUrlStateReturn;
//#endregion
//#region src/i18n.d.ts
type LocaleId = 'ja' | 'en' | string;
type LocaleMessages = Readonly<{
  'toolbar.sort': string;
  'toolbar.columns': string;
  'toolbar.export': string;
  'toolbar.groupBy': string;
  'toolbar.refresh': string;
  'toolbar.insert': string;
  'filter.addFilter': string;
  'filter.placeholder': string;
  'filter.advancedHint': string;
  'status.page': string;
  'status.of': string;
  'status.records': string;
  'status.selected': string;
  'status.allOption': string;
  'status.rowsSuffix': string;
  'export.label': string;
  'editable.saving': string;
  'editable.dismissError': string;
  'editable.save': string;
  'editable.cancel': string;
  'server.loading': string;
  'server.empty': string;
  'server.retry': string;
  'group.noneKey': string;
  'group.count': string;
}>;
type TableLocale = {
  readonly locale: LocaleId;
  readonly messages: LocaleMessages;
  readonly numberFormat: Intl.NumberFormat;
  readonly dateTimeFormat: Intl.DateTimeFormat;
  readonly currencyFormat: Intl.NumberFormat;
};
type TableLocaleProviderProps = {
  readonly locale?: LocaleId; /** 全文言を部分上書き。 */
  readonly messages?: Partial<LocaleMessages>;
  readonly currency?: string;
  readonly children: ReactNode;
};
declare function TableLocaleProvider(props: TableLocaleProviderProps): ReactNode;
declare function useTableLocale(): TableLocale;
declare function useT(): (key: keyof LocaleMessages) => string;
//#endregion
export { type CellEditorSpec, type CellRenderContext, CheckboxCell, type CheckboxCellProps, type ColumnEditMeta, ColumnHeader, type ColumnHeaderProps, type ColumnRenderMeta, ColumnVisibilityMenu, type ColumnVisibilityMenuProps, CommandLineInput, type CommandLineInputProps, DataChart, type DataChartProps, DataTable, type DataTableProps, EditableCell, type EditableCellProps, type ExpandedMap, ExportMenu, type ExportMenuProps, FilterBar, type FilterBarProps, FilterChip, type FilterChipProps, GroupingDropdown, type GroupingDropdownProps, ImageCell, type ImageCellProps, LinkCell, type LinkCellProps, type LocaleId, type LocaleMessages, MultiHeader, type MultiHeaderProps, OperatorPopover, type OperatorPopoverProps, ProgressCell, type ProgressCellProps, type QueryTemplate, RelationBadgeCell, type RelationBadgeCellProps, SortPopover, type SortPopoverProps, SparklineCell, type SparklineCellProps, StarCell, type StarCellProps, StatusBar, type StatusBarProps, SubDataTable, type SubDataTableProps, type TableLocale, TableLocaleProvider, type TableLocaleProviderProps, TagsCell, type TagsCellProps, Toolbar, type ToolbarProps, type UseExpandedRows, type UseTableUrlStateOptions, type UseTableUrlStateReturn, UserCell, type UserCellProps, useExpandedRows, useT, useTable, useTableLocale, useTableUrlState };
//# sourceMappingURL=index.d.ts.map