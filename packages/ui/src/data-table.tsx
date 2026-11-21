import type {
	CellMeta,
	CellValue,
	ColumnDef,
	RowId,
	TableInstance,
	VisibleRow,
} from '@tarbo-table/core';
import { getVirtualRange, isColumnGroup } from '@tarbo-table/core';
import type { ConditionalCellMeta, ConditionalRule } from '@tarbo-table/core/conditional-style';
import { evaluateCellStyle } from '@tarbo-table/core/conditional-style';
import type { EditMixin } from '@tarbo-table/core/edit';
import type { FocusMixin, FocusMoveDirection } from '@tarbo-table/core/focus';
import type { FlatGroupRow, GroupingMixin } from '@tarbo-table/core/grouping';
import { AlertCircle, ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { CheckboxCell } from './cells/checkbox-cell.tsx';
import { ImageCell } from './cells/image-cell.tsx';
import { LinkCell } from './cells/link-cell.tsx';
import { ProgressCell } from './cells/progress-cell.tsx';
import { RelationBadgeCell } from './cells/relation-badge-cell.tsx';
import { SparklineCell } from './cells/sparkline-cell.tsx';
import { StarCell } from './cells/star-cell.tsx';
import { TagsCell } from './cells/tags-cell.tsx';
import { UserCell } from './cells/user-cell.tsx';
import { EditableCell, type ColumnEditMeta } from './editable-cell.tsx';
import { SubDataTable } from './sub-table.tsx';
import { useExpandedRows } from './use-expanded-rows.ts';
import { Fragment } from 'react';
import {
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
	type ReactNode,
} from 'react';
import { cn } from './_utils.ts';
import { ColumnHeader } from './column-header.tsx';
import { FilterBar } from './filter-bar.tsx';
import { MultiHeader } from './multi-header.tsx';
import { StatusBar } from './status-bar.tsx';
import { Toolbar } from './toolbar.tsx';
import { useTable } from './use-table.ts';

/**
 * `ColumnDef.render` に渡される描画コンテキスト。
 * - `value` は accessor のプリミティブ戻り値（filter/sort のキーと同じ）。
 * - `cellMeta` は `ColumnDef.cellMeta` がある場合のみ。
 */
export type CellRenderContext<TRow> = {
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
export type ColumnRenderMeta<TRow> = {
	readonly render?: (ctx: CellRenderContext<TRow>) => ReactNode;
};

export type DataTableProps<TRow> = {
	readonly table: TableInstance<TRow> &
		Partial<GroupingMixin<TRow>> &
		Partial<FocusMixin> &
		Partial<EditMixin<TRow>>;
	readonly rowHeight?: number;
	readonly headerHeight?: number;
	readonly overscan?: number;
	readonly className?: string;
	/** false で非表示、ReactNode でカスタム差し替え、true (既定) で標準 Toolbar。 */
	readonly toolbar?: boolean | ReactNode;
	readonly filterBar?: boolean | ReactNode;
	readonly statusBar?: boolean | ReactNode;
	/**
	 * マルチレベルヘッダーを使うか。
	 * - 'auto' (既定): columns にグループがあれば自動で multi、なければ flat
	 * - 'multi' / 'flat': 強制指定
	 */
	readonly headerMode?: 'auto' | 'multi' | 'flat';
	readonly onRowClick?: (row: TRow, index: number) => void;
	/** セル onClick (Editable cell や detail panel 切替用)。 */
	readonly onCellClick?: (input: { row: TRow; rowIndex: number; column: ColumnDef<TRow> }) => void;
	/** Infinite scroll: 末端近くに到達すると fetchMore を発火する。既定 true。 */
	readonly infiniteScroll?: boolean;
	/** 末端から何 px 手前で fetchMore を発火するか。既定 200。 */
	readonly infiniteThreshold?: number;
	/** カスタムスケルトン (mode='server' && rows=0 && status='loading' のとき)。 */
	readonly loadingFallback?: ReactNode;
	/** カスタムエラー (mode='server' && status='error') 表示。 */
	readonly errorFallback?: (error: { readonly message: string }, retry: () => void) => ReactNode;
	/** カスタム空状態 (rows=0 && status='idle') の表示。 */
	readonly emptyFallback?: ReactNode;
};

function formatGroupKey(key: CellValue): string {
	if (key === null || key === undefined) return '(なし)';
	return String(key);
}

function _extractRelationRefs(
	meta: CellMeta | null,
): { readonly tableId: string; readonly ids: ReadonlyArray<RowId> } | null {
	if (meta === null) return null;
	if (meta.kind === 'relation') {
		return {
			tableId: meta.recordRef.tableId,
			ids: [String(meta.recordRef.rowId) as RowId],
		};
	}
	if (meta.kind === 'relation-many') {
		if (meta.refs.length === 0) return null;
		return {
			tableId: meta.refs[0]!.recordRef.tableId,
			ids: meta.refs.map((r) => String(r.recordRef.rowId) as RowId),
		};
	}
	return null;
}

function renderBuiltInCell<TRow>(input: {
	readonly column: ColumnDef<TRow>;
	readonly value: CellValue;
	readonly cellMeta: CellMeta | null;
	readonly row: TRow;
	readonly onRelationExpand?: () => void;
}): ReactNode {
	const { column, value, cellMeta, onRelationExpand } = input;
	switch (column.type) {
		case 'image':
			if (cellMeta && cellMeta.kind === 'image') return <ImageCell meta={cellMeta} />;
			break;
		case 'link':
			if (cellMeta && cellMeta.kind === 'link') return <LinkCell meta={cellMeta} />;
			if (typeof value === 'string' && value !== '') {
				return <LinkCell meta={{ kind: 'link', href: value }} />;
			}
			break;
		case 'checkbox':
			if (cellMeta && cellMeta.kind === 'checkbox') return <CheckboxCell meta={cellMeta} />;
			return <CheckboxCell meta={{ kind: 'checkbox', checked: value === true }} />;
		case 'sparkline':
			if (cellMeta && cellMeta.kind === 'sparkline') return <SparklineCell meta={cellMeta} />;
			break;
		case 'relation':
			if (cellMeta && cellMeta.kind === 'relation') {
				return <RelationBadgeCell meta={cellMeta} onExpand={onRelationExpand} />;
			}
			break;
		case 'relation-many':
			if (cellMeta && cellMeta.kind === 'relation-many') {
				return <RelationBadgeCell meta={cellMeta} onExpand={onRelationExpand} />;
			}
			break;
		case 'star':
			if (cellMeta && cellMeta.kind === 'star') return <StarCell meta={cellMeta} />;
			if (typeof value === 'number') return <StarCell meta={{ kind: 'star', value }} />;
			break;
		case 'tags':
			if (cellMeta && cellMeta.kind === 'tags') return <TagsCell meta={cellMeta} />;
			break;
		case 'progress':
			if (cellMeta && cellMeta.kind === 'progress') return <ProgressCell meta={cellMeta} />;
			if (typeof value === 'number') {
				return <ProgressCell meta={{ kind: 'progress', value }} />;
			}
			break;
		case 'user':
			if (cellMeta && cellMeta.kind === 'user') return <UserCell meta={cellMeta} />;
			break;
		default:
			break;
	}
	if (value === null || value === undefined) return '';
	return String(value);
}

async function copyCellsToClipboard<TRow>(
	table: TableInstance<TRow>,
	cells: ReadonlyArray<{
		readonly rowId: RowId;
		readonly columnId: string;
	}>,
): Promise<void> {
	if (cells.length === 0 || typeof navigator === 'undefined' || !navigator.clipboard) return;
	const rowIds = Array.from(new Set(cells.map((c) => c.rowId)));
	const columnIds = Array.from(new Set(cells.map((c) => c.columnId)));
	const rowMap = new Map(table.getPagedRows().map((r) => [r.id, r.row]));
	const colMap = new Map(table.getColumns().map((c) => [c.id, c]));
	const lines: string[] = [];
	for (const rid of rowIds) {
		const row = rowMap.get(rid);
		if (!row) continue;
		const cellsStr: string[] = [];
		for (const cid of columnIds) {
			const col = colMap.get(cid);
			if (!col) {
				cellsStr.push('');
				continue;
			}
			const v = col.accessor(row);
			cellsStr.push(v === null || v === undefined ? '' : String(v));
		}
		lines.push(cellsStr.join('\t'));
	}
	await navigator.clipboard.writeText(lines.join('\n'));
}

export function DataTable<TRow>(props: DataTableProps<TRow>): ReactNode {
	const state = useTable(props.table);
	const {
		table,
		rowHeight = 32,
		overscan,
		className,
		toolbar = true,
		filterBar = true,
		statusBar = true,
		headerMode = 'auto',
		onRowClick,
		onCellClick,
		infiniteScroll = true,
		infiniteThreshold = 200,
		loadingFallback,
		errorFallback,
		emptyFallback,
	} = props;

	const [, force] = useReducer((x: number) => x + 1, 0);
	useEffect(() => table.subscribe(() => force()), [table]);

	const expanded = useExpandedRows();
	const relationSource = table.getRelationSource();

	const focus = table.getFocus?.() ?? null;
	const hasFocusMixin = typeof table.setFocus === 'function';
	const rangeCells = table.getRangeCells?.() ?? [];
	const rangeKeys = useMemo(() => {
		const set = new Set<string>();
		for (const c of rangeCells) set.add(`${c.rowId}|${c.columnId}`);
		return set;
	}, [rangeCells]);
	const mode = table.getMode();
	const serverState = table.getServerState();
	const isServer = mode === 'server';
	const isLoading = serverState.status === 'loading';
	const hasError = serverState.status === 'error';

	useEffect(() => {
		if (focus === null || !hasFocusMixin) return;
		const el = scrollRef.current;
		if (!el) return;
		const rows = table.getPagedRows();
		const idx = rows.findIndex((r) => r.id === focus.rowId);
		if (idx < 0) return;
		const rowTop = idx * rowHeight;
		const rowBottom = rowTop + rowHeight;
		if (rowTop < el.scrollTop) {
			el.scrollTop = rowTop;
		} else if (rowBottom > el.scrollTop + el.clientHeight) {
			el.scrollTop = rowBottom - el.clientHeight;
		}
	}, [focus, hasFocusMixin, rowHeight, table]);

	const visibleColumns = table.getVisibleColumns();
	const groupBy = table.getGroupBy?.() ?? [];
	const isGrouped = groupBy.length > 0;
	const useMulti =
		headerMode === 'multi' || (headerMode === 'auto' && table.getColumnTree().some(isColumnGroup));

	const items: ReadonlyArray<
		| FlatGroupRow<TRow>
		| { kind: 'row'; id: VisibleRow<TRow>['id']; row: TRow; index: number; depth: number }
	> =
		isGrouped && table.getFlatGroupedRows
			? table.getFlatGroupedRows()
			: table
					.getPagedRows()
					.map((r) => ({ kind: 'row' as const, id: r.id, row: r.row, index: r.index, depth: 0 }));

	const scrollRef = useRef<HTMLDivElement | null>(null);
	const [viewport, setViewport] = useState({ scrollTop: 0, height: 400 });

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		let rafId = 0;
		const apply = (): void => {
			rafId = 0;
			setViewport((v) => {
				const next = { scrollTop: el.scrollTop, height: el.clientHeight };
				if (v.scrollTop === next.scrollTop && v.height === next.height) return v;
				return next;
			});
			if (isServer && infiniteScroll && !isLoading) {
				const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
				if (fromBottom < infiniteThreshold) {
					void table.fetchMore();
				}
			}
		};
		const schedule = (): void => {
			if (rafId !== 0) return;
			rafId = requestAnimationFrame(apply);
		};
		apply();
		const ro = new ResizeObserver(apply);
		ro.observe(el);
		el.addEventListener('scroll', schedule, { passive: true });
		return () => {
			if (rafId !== 0) cancelAnimationFrame(rafId);
			ro.disconnect();
			el.removeEventListener('scroll', schedule);
		};
	}, [isServer, infiniteScroll, isLoading, infiniteThreshold, table]);

	const effectiveOverscan = overscan ?? Math.max(8, Math.ceil(viewport.height / rowHeight / 2));

	const range = getVirtualRange({
		scrollTop: viewport.scrollTop,
		viewportHeight: viewport.height,
		rowHeight,
		overscan: effectiveOverscan,
		totalRows: items.length,
	});

	const sliced = items.slice(range.startIdx, range.endIdx);
	const selectedIds = state.selection.ids;

	const pageJump = useMemo(
		() => Math.max(1, Math.floor(viewport.height / rowHeight) - 1),
		[viewport.height, rowHeight],
	);

	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
		if (!hasFocusMixin) return;
		if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
			const cells = table.getRangeCells?.() ?? [];
			if (cells.length === 0) return;
			void copyCellsToClipboard(table, cells);
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		let dir: FocusMoveDirection | null = null;
		switch (e.key) {
			case 'ArrowUp':
				dir = 'up';
				break;
			case 'ArrowDown':
				dir = 'down';
				break;
			case 'ArrowLeft':
				dir = 'left';
				break;
			case 'ArrowRight':
				dir = 'right';
				break;
			case 'Home':
				dir = 'home';
				break;
			case 'End':
				dir = 'end';
				break;
			case 'PageUp':
				dir = 'pageUp';
				break;
			case 'PageDown':
				dir = 'pageDown';
				break;
			case 'Escape':
				table.clearFocus?.();
				table.clearRange?.();
				return;
		}
		if (dir !== null) {
			e.preventDefault();
			e.stopPropagation();
			if (e.shiftKey && table.extendRange) {
				table.extendRange(dir, pageJump);
			} else {
				table.moveFocus?.(dir, pageJump);
			}
		}
	};

	return (
		<div
			className={cn(
				'tt-data-table flex h-full flex-col border border-border bg-background outline-none',
				className,
			)}
			tabIndex={hasFocusMixin ? 0 : -1}
			onKeyDown={onKeyDown}
			role="grid"
			aria-rowcount={items.length}
			aria-colcount={visibleColumns.length}
		>
			{filterBar !== false && (filterBar === true ? <FilterBar table={table} /> : filterBar)}
			{toolbar !== false && (toolbar === true ? <Toolbar table={table} /> : toolbar)}
			<div ref={scrollRef} className="relative flex-1 overflow-auto">
				<table className="relative w-full table-fixed border-collapse">
					{useMulti ? (
						<MultiHeader table={table} />
					) : (
						<thead className="sticky top-0 z-10 bg-muted">
							<tr>
								{visibleColumns.map((c) => (
									<ColumnHeader key={c.id} table={table} column={c} />
								))}
							</tr>
						</thead>
					)}
					<tbody>
						{range.paddingTop > 0 && (
							<tr style={{ height: range.paddingTop }} aria-hidden="true">
								<td colSpan={visibleColumns.length} />
							</tr>
						)}
						{sliced.map((item, i) => {
							if (item.kind === 'group') {
								const { node } = item;
								const groupCol =
									visibleColumns.find((c) => c.id === groupBy[node.depth]) ??
									table.getColumns().find((c) => c.id === groupBy[node.depth]);
								const label = groupCol?.header ?? groupBy[node.depth] ?? '';
								const pathId = JSON.stringify(node.path);
								const isCollapsed = table.getCollapsedGroups?.().has(pathId) ?? false;
								const Caret = isCollapsed ? ChevronRight : ChevronDown;
								return (
									<tr
										key={`g:${node.depth}:${range.startIdx + i}:${String(node.key)}`}
										className="cursor-pointer select-none border-b border-border bg-muted/40 hover:bg-muted/60"
										style={{ height: rowHeight } as CSSProperties}
										onClick={() => table.toggleCollapsed?.(pathId)}
										aria-expanded={!isCollapsed}
									>
										<td
											colSpan={visibleColumns.length}
											className="overflow-hidden truncate px-2 text-sm font-medium"
											style={{ paddingLeft: 8 + node.depth * 16 }}
										>
											<Caret className="mr-1 inline-block h-3 w-3 align-middle text-muted-foreground" />
											<span className="text-muted-foreground">{label}:</span>{' '}
											<span>{formatGroupKey(node.key)}</span>
											<span className="ml-2 text-xs text-muted-foreground">
												({node.indices.length}件)
											</span>
										</td>
									</tr>
								);
							}
							const selected = selectedIds.has(item.id);
							const rowIndex = range.startIdx + i + 1;
							const expandedColId = expanded.getExpanded(item.id);
							const expandedCol =
								expandedColId !== undefined
									? visibleColumns.find((c) => c.id === expandedColId)
									: undefined;
							const expandedRefs =
								expandedCol?.cellMeta !== undefined
									? _extractRelationRefs(expandedCol.cellMeta(item.row))
									: null;
							return (
								<Fragment key={item.id}>
									<tr
										onClick={() => {
											if (onRowClick) onRowClick(item.row, item.index);
											else if (state.selection.mode !== 'none') table.toggleRow(item.id);
										}}
										className={cn(
											'border-b border-border',
											selected ? 'bg-accent/15' : 'hover:bg-muted/50',
											'cursor-pointer',
										)}
										style={{ height: rowHeight } as CSSProperties}
										role="row"
										aria-rowindex={rowIndex}
										aria-selected={selected}
									>
										{visibleColumns.map((c: ColumnDef<TRow>, ci) => {
											const v = c.accessor(item.row);
											const cellMeta = c.cellMeta ? c.cellMeta(item.row) : null;
											const renderFn = (c as ColumnDef<TRow> & ColumnRenderMeta<TRow>).render;
											const isNum = c.type === 'number' || typeof v === 'number';
											const indent = ci === 0 && item.depth > 0 ? 8 + item.depth * 16 : undefined;
											const isFocused =
												focus !== null && focus.rowId === item.id && focus.columnId === c.id;
											const editMeta = (c as ColumnDef<TRow> & { edit?: ColumnEditMeta<TRow> })
												.edit;
											const hasEdit =
												typeof table.commitEdit === 'function' && editMeta !== undefined;
											const styleMeta = (
												c as ColumnDef<TRow> & {
													cellStyle?: ConditionalCellMeta<TRow>;
												}
											).cellStyle;
											const conditional =
												styleMeta !== undefined
													? evaluateCellStyle({
															row: item.row,
															value: v,
															rules: styleMeta.rules as ReadonlyArray<ConditionalRule<TRow>>,
														})
													: undefined;
											const baseStyle: CSSProperties = {};
											if (indent !== undefined) baseStyle.paddingLeft = indent;
											if (conditional?.color) baseStyle.color = conditional.color;
											if (conditional?.backgroundColor)
												baseStyle.background = conditional.backgroundColor;
											if (conditional?.fontWeight) baseStyle.fontWeight = conditional.fontWeight;
											if (conditional?.fontStyle) baseStyle.fontStyle = conditional.fontStyle;
											if (conditional?.textAlign) baseStyle.textAlign = conditional.textAlign;
											if (conditional?.textDecoration)
												baseStyle.textDecoration = conditional.textDecoration;
											const inRange = rangeKeys.has(`${item.id}|${c.id}`);
											return (
												<td
													key={c.id}
													role="gridcell"
													aria-colindex={ci + 1}
													className={cn(
														'overflow-hidden truncate border-r border-border px-2 text-sm',
														isNum && 'tt-tabular text-right',
														isFocused && 'outline outline-2 outline-accent -outline-offset-2',
														inRange && !isFocused && 'bg-accent/10',
														conditional?.className,
													)}
													style={baseStyle}
													onClick={(e) => {
														if (hasFocusMixin) {
															e.stopPropagation();
															if (e.shiftKey && focus !== null && table.setRange) {
																table.setRange({
																	anchor: focus,
																	head: { rowId: item.id, columnId: c.id },
																});
																table.setFocus?.({ rowId: item.id, columnId: c.id });
															} else {
																table.setFocus?.({ rowId: item.id, columnId: c.id });
															}
														}
														onCellClick?.({ row: item.row, rowIndex: item.index, column: c });
													}}
												>
													{renderFn ? (
														renderFn({
															row: item.row,
															value: v,
															cellMeta,
															column: c,
															rowId: item.id,
															isFocused,
														})
													) : hasEdit ? (
														<EditableCell
															table={
																table as TableInstance<TRow> & EditMixin<TRow> & Partial<FocusMixin>
															}
															column={c as ColumnDef<TRow> & { edit: ColumnEditMeta<TRow> }}
															row={item.row}
															rowId={item.id}
															isFocused={isFocused}
														/>
													) : (
														renderBuiltInCell({
															column: c,
															value: v,
															cellMeta,
															row: item.row,
															onRelationExpand:
																relationSource !== null &&
																(c.type === 'relation' || c.type === 'relation-many')
																	? () => expanded.toggle(item.id, c.id)
																	: undefined,
														})
													)}
												</td>
											);
										})}
									</tr>
									{expandedRefs !== null && relationSource !== null && (
										<tr role="row" aria-hidden="false">
											<td colSpan={visibleColumns.length} className="p-0">
												<SubDataTable
													relationSource={relationSource}
													tableId={expandedRefs.tableId}
													ids={expandedRefs.ids}
												/>
											</td>
										</tr>
									)}
								</Fragment>
							);
						})}
						{range.paddingBottom > 0 && (
							<tr style={{ height: range.paddingBottom }} aria-hidden="true">
								<td colSpan={visibleColumns.length} />
							</tr>
						)}
						{isServer && isLoading && items.length > 0 && (
							<tr aria-live="polite">
								<td
									colSpan={visibleColumns.length}
									className="border-b border-border bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground"
								>
									<Loader2 className="mr-1 inline-block h-3 w-3 animate-spin align-middle" />
									読み込み中...
								</td>
							</tr>
						)}
					</tbody>
				</table>
				{isServer && items.length === 0 && (
					<div
						className="pointer-events-none absolute inset-0 flex items-center justify-center"
						aria-busy={isLoading}
					>
						{isLoading
							? (loadingFallback ?? (
									<div className="pointer-events-auto flex flex-col items-center gap-2 text-xs text-muted-foreground">
										<Loader2 className="h-5 w-5 animate-spin" />
										<span>データを読み込んでいます…</span>
									</div>
								))
							: hasError && serverState.error
								? (errorFallback?.(
										{ message: serverState.error.message },
										() => void table.refresh(),
									) ?? (
										<div className="pointer-events-auto flex flex-col items-center gap-2 text-xs text-destructive">
											<AlertCircle className="h-5 w-5" />
											<span>{serverState.error.message}</span>
											<button
												type="button"
												onClick={() => void table.refresh()}
												className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted"
											>
												<RefreshCw className="h-3 w-3" />
												再試行
											</button>
										</div>
									))
								: (emptyFallback ?? (
										<span className="text-xs text-muted-foreground">データがありません</span>
									))}
					</div>
				)}
				{!isServer && items.length === 0 && emptyFallback !== undefined && (
					<div className="absolute inset-0 flex items-center justify-center">{emptyFallback}</div>
				)}
				{isServer && hasError && items.length > 0 && serverState.error && (
					<div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-destructive bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
						<AlertCircle className="h-3 w-3" />
						<span className="flex-1">{serverState.error.message}</span>
						<button
							type="button"
							onClick={() => void table.refresh()}
							className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-background px-2 py-0.5"
						>
							<RefreshCw className="h-3 w-3" />
							再試行
						</button>
					</div>
				)}
			</div>
			{statusBar !== false && (statusBar === true ? <StatusBar table={table} /> : statusBar)}
		</div>
	);
}
