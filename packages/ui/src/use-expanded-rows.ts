import type { RowId } from '@tarbo-table/core';
import { useCallback, useState } from 'react';

export type ExpandedMap = ReadonlyMap<RowId, string>;

export type UseExpandedRows = {
	readonly map: ExpandedMap;
	readonly isExpanded: (rowId: RowId, columnId: string) => boolean;
	readonly getExpanded: (rowId: RowId) => string | undefined;
	readonly toggle: (rowId: RowId, columnId: string) => void;
	readonly collapse: (rowId: RowId) => void;
	readonly collapseAll: () => void;
};

export function useExpandedRows(): UseExpandedRows {
	const [map, setMap] = useState<ReadonlyMap<RowId, string>>(() => new Map());

	const isExpanded = useCallback(
		(rowId: RowId, columnId: string): boolean => map.get(rowId) === columnId,
		[map],
	);

	const getExpanded = useCallback((rowId: RowId): string | undefined => map.get(rowId), [map]);

	const toggle = useCallback((rowId: RowId, columnId: string): void => {
		setMap((prev) => {
			const next = new Map(prev);
			if (next.get(rowId) === columnId) {
				next.delete(rowId);
			} else {
				next.set(rowId, columnId);
			}
			return next;
		});
	}, []);

	const collapse = useCallback((rowId: RowId): void => {
		setMap((prev) => {
			if (!prev.has(rowId)) return prev;
			const next = new Map(prev);
			next.delete(rowId);
			return next;
		});
	}, []);

	const collapseAll = useCallback((): void => setMap(new Map()), []);

	return { map, isExpanded, getExpanded, toggle, collapse, collapseAll };
}
