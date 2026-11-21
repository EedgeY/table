import type { ColumnDef, RelationSource, RowId } from '@tarbo-table/core';
import { Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from './_utils.ts';

export type SubDataTableProps = {
	readonly relationSource: RelationSource;
	readonly tableId: string;
	readonly ids: ReadonlyArray<RowId>;
	readonly className?: string;
};

const _CACHE_MAX = 64;
const _cache = new Map<string, ReadonlyArray<unknown>>();

function _cacheKey(tableId: string, ids: ReadonlyArray<RowId>): string {
	return `${tableId}|${[...ids].map(String).sort().join(',')}`;
}

function _cacheGet(key: string): ReadonlyArray<unknown> | undefined {
	const v = _cache.get(key);
	if (v !== undefined) {
		_cache.delete(key);
		_cache.set(key, v);
	}
	return v;
}

function _cacheSet(key: string, value: ReadonlyArray<unknown>): void {
	if (_cache.has(key)) _cache.delete(key);
	_cache.set(key, value);
	while (_cache.size > _CACHE_MAX) {
		const oldest = _cache.keys().next().value;
		if (oldest === undefined) break;
		_cache.delete(oldest);
	}
}

export function SubDataTable(props: SubDataTableProps): ReactNode {
	const { relationSource, tableId, ids, className } = props;
	const key = _cacheKey(tableId, ids);
	const [rows, setRows] = useState<ReadonlyArray<unknown> | null>(() => _cacheGet(key) ?? null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const cached = _cacheGet(key);
		if (cached !== undefined) {
			setRows(cached);
			return;
		}
		let cancelled = false;
		setRows(null);
		setError(null);
		relationSource
			.fetchByIds(tableId, ids)
			.then((res) => {
				if (cancelled) return;
				_cacheSet(key, res);
				setRows(res);
			})
			.catch((e: unknown) => {
				if (cancelled) return;
				setError(e instanceof Error ? e.message : String(e));
			});
		return () => {
			cancelled = true;
		};
	}, [key, relationSource, tableId, ids]);

	const columns = relationSource.getColumns(tableId);

	return (
		<div className={cn('border-t border-border bg-muted/20 px-4 py-2 text-xs', className)}>
			<div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
				{tableId} ({ids.length})
			</div>
			{error !== null ? (
				<div className="text-destructive">読み込みエラー: {error}</div>
			) : rows === null ? (
				<div className="inline-flex items-center gap-1 text-muted-foreground">
					<Loader2 className="h-3 w-3 animate-spin" />
					読み込み中…
				</div>
			) : rows.length === 0 ? (
				<div className="text-muted-foreground">該当レコードがありません。</div>
			) : (
				<table className="w-full border-collapse">
					<thead>
						<tr className="text-left text-muted-foreground">
							{columns.map((c) => (
								<th
									key={c.id}
									className="border-b border-border px-2 py-1 font-medium"
									style={c.defaultWidth ? { width: c.defaultWidth } : undefined}
								>
									{c.header ?? c.id}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row, i) => (
							<tr key={i} className="border-b border-border/60">
								{columns.map((c) => (
									<td key={c.id} className="truncate px-2 py-1">
										{_formatCellValue((c as ColumnDef<unknown>).accessor(row))}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

function _formatCellValue(v: unknown): string {
	if (v === null || v === undefined) return '';
	if (typeof v === 'boolean') return v ? '✓' : '';
	return String(v);
}
