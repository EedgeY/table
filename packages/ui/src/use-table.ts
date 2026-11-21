import type { TableInstance, TableState } from '@tarbo-table/core';
import { useSyncExternalStore } from 'react';

/**
 * createTable で作った TableInstance を React 状態としてリアクティブに購読する。
 * 戻り値は state スナップショット。コンポーネントは state 変更時に再レンダーされる。
 */
export function useTable<TRow>(table: TableInstance<TRow>): TableState {
	return useSyncExternalStore(
		(cb) => table.subscribe(cb),
		() => table.getState(),
		() => table.getState(),
	);
}
