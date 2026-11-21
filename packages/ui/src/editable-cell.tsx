import type { ColumnDef, RowId, TableInstance } from '@tarbo-table/core';
import type { EditMixin } from '@tarbo-table/core/edit';
import type { FocusMixin } from '@tarbo-table/core/focus';
import { Check, X } from 'lucide-react';
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
} from 'react';
import { cn } from './_utils.ts';

export type CellEditorSpec =
	| { readonly kind: 'text' }
	| {
			readonly kind: 'number';
			readonly step?: number;
			readonly min?: number;
			readonly max?: number;
	  }
	| { readonly kind: 'boolean' }
	| { readonly kind: 'date' }
	| {
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
export type ColumnEditMeta<TRow = unknown> = {
	readonly editor: CellEditorSpec;
	readonly parse?: (raw: string) => unknown;
	readonly format?: (value: unknown) => string;
	readonly validate?: (value: unknown, row: TRow) => string | null;
};

export type EditableCellProps<TRow> = {
	readonly table: TableInstance<TRow> & EditMixin<TRow> & Partial<FocusMixin>;
	readonly column: ColumnDef<TRow> & { readonly edit?: ColumnEditMeta<TRow> };
	readonly row: TRow;
	readonly rowId: RowId;
	readonly isFocused: boolean;
	/** 編集モードに入った瞬間に呼ばれる。範囲選択クリアなど。 */
	readonly onEnterEdit?: () => void;
	/** 編集モード終了時。 */
	readonly onExitEdit?: () => void;
};

function _defaultFormat(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'boolean') return value ? '✓' : '';
	return String(value);
}

function _defaultParseText(raw: string): unknown {
	return raw;
}

function _defaultParseNumber(raw: string): unknown {
	if (raw === '') return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

export function EditableCell<TRow>(props: EditableCellProps<TRow>): ReactNode {
	const { table, column, row, rowId, isFocused, onEnterEdit, onExitEdit } = props;
	const editMeta = column.edit;
	const cellState = table.getCellEdit(rowId, column.id);
	const value = column.accessor(row);
	const format = editMeta?.format ?? _defaultFormat;
	const display = format(value);

	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState<string>(display);
	const [localError, setLocalError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

	const enter = useCallback((): void => {
		if (!editMeta) return;
		setDraft(display);
		setLocalError(null);
		setEditing(true);
		onEnterEdit?.();
	}, [editMeta, display, onEnterEdit]);

	const cancel = useCallback((): void => {
		setEditing(false);
		setLocalError(null);
		onExitEdit?.();
	}, [onExitEdit]);

	const commit = useCallback(async (): Promise<boolean> => {
		if (!editMeta) return false;
		const parser =
			editMeta.parse ??
			(editMeta.editor.kind === 'number'
				? _defaultParseNumber
				: editMeta.editor.kind === 'boolean'
					? (s: string) => s === 'true'
					: _defaultParseText);
		const parsed = parser(draft);
		const validationMsg = editMeta.validate?.(parsed, row) ?? null;
		if (validationMsg !== null) {
			setLocalError(validationMsg);
			return false;
		}
		const result = await table.commitEdit({ rowId, columnId: column.id, value: parsed });
		if (!result.ok) {
			setLocalError(result.error.message);
			return false;
		}
		setEditing(false);
		setLocalError(null);
		onExitEdit?.();
		return true;
	}, [draft, editMeta, row, table, rowId, column.id, onExitEdit]);

	useEffect(() => {
		if (!isFocused || !editMeta) return;
		const onKey = (e: globalThis.KeyboardEvent): void => {
			if (editing) return;
			if (e.key === 'F2' || e.key === 'Enter') {
				e.preventDefault();
				e.stopPropagation();
				enter();
			} else if (e.key === 'Delete' || e.key === 'Backspace') {
				e.preventDefault();
				void table.commitEdit({ rowId, columnId: column.id, value: null });
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => {
			window.removeEventListener('keydown', onKey, true);
		};
	}, [isFocused, editMeta, editing, enter, table, rowId, column.id]);

	useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus();
			if (inputRef.current instanceof HTMLInputElement) {
				inputRef.current.select();
			}
		}
	}, [editing]);

	if (!editMeta || !editing) {
		return (
			<span
				className={cn(
					'inline-flex items-center gap-1',
					cellState.inFlight && 'opacity-60',
					cellState.error && 'text-destructive underline decoration-dashed',
				)}
				title={cellState.error?.message}
				onDoubleClick={() => {
					if (editMeta) enter();
				}}
			>
				{display}
				{cellState.inFlight && (
					<span
						className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent"
						aria-label="保存中"
					/>
				)}
				{cellState.error && (
					<button
						type="button"
						onClick={() => table.clearEditError(rowId, column.id)}
						className="ml-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-destructive/20 text-[10px] text-destructive"
						aria-label="エラーを閉じる"
					>
						×
					</button>
				)}
			</span>
		);
	}

	const ed = editMeta.editor;
	const onKeyDown = (e: KeyboardEvent): void => {
		if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			void commit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			cancel();
		} else if (e.key === 'Tab') {
			e.preventDefault();
			void commit().then((ok) => {
				if (ok) {
					table.moveFocus?.(e.shiftKey ? 'left' : 'right');
				}
			});
		} else {
			e.stopPropagation();
		}
	};

	const commonProps = {
		ref: inputRef as RefObject<HTMLInputElement>,
		onKeyDown,
		onBlur: () => {
			void commit();
		},
		className: cn(
			'h-6 w-full border border-accent bg-background px-1 text-sm outline-none',
			localError && 'border-destructive',
		),
	};

	let inputEl: ReactNode = null;
	if (ed.kind === 'text') {
		inputEl = (
			<input
				type="text"
				value={draft}
				onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
				{...commonProps}
			/>
		);
	} else if (ed.kind === 'number') {
		inputEl = (
			<input
				type="number"
				value={draft}
				step={ed.step}
				min={ed.min}
				max={ed.max}
				onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
				{...commonProps}
			/>
		);
	} else if (ed.kind === 'date') {
		inputEl = (
			<input
				type="date"
				value={draft}
				onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
				{...commonProps}
			/>
		);
	} else if (ed.kind === 'boolean') {
		inputEl = (
			<input
				type="checkbox"
				checked={draft === 'true'}
				onChange={(e: ChangeEvent<HTMLInputElement>) => {
					setDraft(String(e.target.checked));
					void table
						.commitEdit({ rowId, columnId: column.id, value: e.target.checked })
						.then((r) => {
							if (r.ok) {
								setEditing(false);
								onExitEdit?.();
							}
						});
				}}
				className="h-4 w-4 accent-accent"
				ref={inputRef as RefObject<HTMLInputElement>}
			/>
		);
	} else if (ed.kind === 'select') {
		inputEl = (
			<select
				value={draft}
				onChange={(e: ChangeEvent<HTMLSelectElement>) => {
					setDraft(e.target.value);
				}}
				onKeyDown={onKeyDown}
				onBlur={() => {
					void commit();
				}}
				className={cn(
					'h-6 w-full border border-accent bg-background px-1 text-sm outline-none',
					localError && 'border-destructive',
				)}
				ref={inputRef as RefObject<HTMLSelectElement>}
			>
				{ed.options.map((o) => (
					<option key={String(o.value)} value={String(o.value)}>
						{o.label}
					</option>
				))}
			</select>
		);
	}

	return (
		<span className="inline-flex w-full items-center gap-0.5">
			{inputEl}
			<button
				type="button"
				className="inline-flex h-5 w-5 items-center justify-center text-accent hover:bg-accent/10"
				onMouseDown={(e) => {
					e.preventDefault();
					void commit();
				}}
				aria-label="保存"
			>
				<Check className="h-3 w-3" />
			</button>
			<button
				type="button"
				className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:bg-muted"
				onMouseDown={(e) => {
					e.preventDefault();
					cancel();
				}}
				aria-label="取消"
			>
				<X className="h-3 w-3" />
			</button>
			{localError && (
				<span className="ml-1 truncate text-[10px] text-destructive" title={localError}>
					{localError}
				</span>
			)}
		</span>
	);
}
