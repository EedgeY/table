import type { DataSource, EditError } from './data-source.ts';
import type { Result } from './_result.ts';
import { _INTERNAL, type TableInstance, type TableInternal } from './create-table.ts';
import { _cellKey, _createEditStore, type EditState, type EditStore } from './_edit-store.ts';
import type { RowId } from './_types.ts';

export type { EditOp, EditState } from './_edit-store.ts';

export type EditMixin<TRow> = {
	getEditState: () => EditState;
	commitEdit: (input: {
		rowId: RowId;
		columnId: string;
		value: unknown;
	}) => Promise<Result<TRow, EditError>>;
	rollbackCell: (rowId: RowId, columnId: string) => void;
	clearEditError: (rowId: RowId, columnId: string) => void;
	undo: () => Promise<Result<void, EditError>>;
	redo: () => Promise<Result<void, EditError>>;
	canUndo: () => boolean;
	canRedo: () => boolean;
	subscribeEdit: (cb: (state: EditState) => void) => () => void;
	/** セル単位の dirty / inFlight / error を 1 回で取得するヘルパ。 */
	getCellEdit: (
		rowId: RowId,
		columnId: string,
	) => {
		readonly dirty: boolean;
		readonly inFlight: boolean;
		readonly error: EditError | null;
	};
};

const _EDIT_ATTACHED: unique symbol = Symbol.for('@tarbo-table/core/edit-attached') as never;

export type WithEditOptions = {
	/** undo stack の上限。既定 50。 */
	readonly maxHistory?: number;
};

/**
 * `TableInstance` に編集機能を attach。冪等。
 * dataSource が createTable に渡されていなければ、オフライン編集として動作
 * (data ref のみ書き換え、サーバー反映なし)。
 */
export function withEdit<TRow>(
	table: TableInstance<TRow>,
	options?: WithEditOptions,
): TableInstance<TRow> & EditMixin<TRow> {
	const flagged = (table as unknown as { [_EDIT_ATTACHED]?: true })[_EDIT_ATTACHED];
	if (flagged === true) {
		return table as TableInstance<TRow> & EditMixin<TRow>;
	}
	const internal = (table as unknown as { [_INTERNAL]: TableInternal<TRow> })[_INTERNAL];

	const dataSource: DataSource<TRow> = internal.getDataSource() ?? {};

	const findRowById = (rowId: RowId): TRow | null => {
		const data = internal.getData();
		for (let i = 0; i < data.length; i++) {
			if (internal.getRowId(data[i]!, i) === rowId) {
				return data[i]!;
			}
		}
		return null;
	};
	const findIndexById = (rowId: RowId): number => {
		const data = internal.getData();
		for (let i = 0; i < data.length; i++) {
			if (internal.getRowId(data[i]!, i) === rowId) return i;
		}
		return -1;
	};
	const writeRow = (rowId: RowId, row: TRow): void => {
		const idx = findIndexById(rowId);
		if (idx < 0) return;
		const data = internal.getData();
		const next = data.slice() as TRow[];
		next[idx] = row;
		internal.replaceData(next);
	};

	const editStore: EditStore<TRow> = _createEditStore<TRow>({
		dataSource,
		columns: internal.getColumns(),
		findRowById,
		findIndexById,
		writeRow,
		onChange: internal.notify,
		maxHistory: options?.maxHistory,
	});

	const mixin: EditMixin<TRow> = {
		getEditState: () => editStore.getState(),
		commitEdit: (input) => editStore.commit(input),
		rollbackCell: (rowId, columnId) => editStore.rollback(rowId, columnId),
		clearEditError: (rowId, columnId) => editStore.clearError(rowId, columnId),
		undo: () => editStore.undo(),
		redo: () => editStore.redo(),
		canUndo: () => editStore.canUndo(),
		canRedo: () => editStore.canRedo(),
		subscribeEdit(cb) {
			return editStore.subscribe(() => cb(editStore.getState()));
		},
		getCellEdit(rowId, columnId) {
			const s = editStore.getState();
			const key = _cellKey(rowId, columnId);
			return {
				dirty: s.dirty.has(key),
				inFlight: s.inFlight.has(key),
				error: s.errors.get(key) ?? null,
			};
		},
	};

	Object.assign(table, mixin);
	Object.defineProperty(table, _EDIT_ATTACHED, {
		value: true,
		enumerable: false,
		writable: false,
		configurable: false,
	});
	return table as TableInstance<TRow> & EditMixin<TRow>;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	const { createTable } = await import('./create-table.ts');

	type Row = { id: number; name: string };
	const cols = [
		{ id: 'id', accessor: (r: Row) => r.id },
		{ id: 'name', accessor: (r: Row) => r.name },
	];
	const data: Row[] = [
		{ id: 1, name: 'a' },
		{ id: 2, name: 'b' },
	];

	describe('withEdit', () => {
		it('attach 後に commitEdit/undo/redo が使える', async () => {
			const t = withEdit(
				createTable<Row>({
					data,
					columns: cols,
					getRowId: (r) => String(r.id),
					dataSource: {
						updateCell: async ({ row, columnId, value }) => ({
							ok: true,
							value: { ...row, [columnId]: value } as Row,
						}),
					},
				}),
			);
			const res = await t.commitEdit({ rowId: '1' as RowId, columnId: 'name', value: 'A' });
			expect(res.ok).toBe(true);
			expect(t.canUndo()).toBe(true);
			const after = t.getPagedRows().find((r) => r.id === '1');
			expect(after?.row.name).toBe('A');
		});

		it('getCellEdit でセル状態を観察できる', async () => {
			const t = withEdit(
				createTable<Row>({
					data,
					columns: cols,
					getRowId: (r) => String(r.id),
					dataSource: {
						updateCell: async () => ({ ok: false, error: { code: 'x', message: 'm' } }),
					},
				}),
			);
			await t.commitEdit({ rowId: '1' as RowId, columnId: 'name', value: 'X' });
			expect(t.getCellEdit('1' as RowId, 'name').error?.message).toBe('m');
		});

		it('冪等: 2 回 attach しても同じ table', () => {
			const base = createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) });
			const a = withEdit(base);
			const b = withEdit(a);
			expect(a).toBe(b);
		});

		it('dataSource なし (オフライン) でも commit は確定する', async () => {
			const t = withEdit(createTable<Row>({ data, columns: cols, getRowId: (r) => String(r.id) }));
			const res = await t.commitEdit({ rowId: '1' as RowId, columnId: 'name', value: 'A' });
			expect(res.ok).toBe(true);
		});
	});
}
