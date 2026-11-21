import type { ColumnDef, Leaf, Predicate, TableInstance } from '@tarbo-table/core';
import { f } from '@tarbo-table/core';
import { Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './_utils.ts';
import { Button } from './components/button.tsx';
import { Input } from './components/input.tsx';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from './components/dropdown-menu.tsx';
import { FilterChip } from './filter-chip.tsx';
import { useTable } from './use-table.ts';

export type FilterBarProps<TRow> = {
	readonly table: TableInstance<TRow>;
	/**
	 * ルート div の追加 className。tailwind-merge で既定の衝突クラスは上書きされる。
	 * 内部パーツを深くカスタムしたい場合は `FilterChip` などのパーツを export 済みなので
	 * composition で自前 FilterBar を組むこと。
	 */
	readonly className?: string;
};

export function _flatLeavesOrNull(p: Predicate | null): readonly Leaf[] | null {
	if (p === null) return [];
	if (p.kind === 'leaf') return [p];
	if (p.kind === 'group' && p.combinator === 'and' && p.negate !== true) {
		const out: Leaf[] = [];
		for (const c of p.children) {
			if (c.kind === 'leaf') {
				out.push(c);
			} else {
				return null;
			}
		}
		return out;
	}
	return null;
}

function _buildPredicate(leaves: readonly Leaf[]): Predicate | null {
	if (leaves.length === 0) return null;
	if (leaves.length === 1) return leaves[0]!;
	return f.and(...leaves);
}

export function FilterBar<TRow>(props: FilterBarProps<TRow>): ReactNode {
	const { table, className } = props;
	const state = useTable(table);
	const leaves = _flatLeavesOrNull(state.predicate);

	const columns = table.getColumns();
	const filterableCols = columns.filter((c) => c.filterable !== false);

	if (leaves === null) {
		return (
			<div
				className={cn(
					'flex items-center gap-2 border-b border-border bg-background px-3 py-2 text-xs text-muted-foreground',
					className,
				)}
			>
				<Search className="h-3 w-3" />
				複雑なフィルタ条件 (OR / NOT / ネスト) は CLI モードで編集してください。
			</div>
		);
	}

	const addLeaf = (col: ColumnDef<TRow>): void => {
		const newLeaf: Leaf = f.leaf(col.id, '=', '');
		const next: Predicate | null = _buildPredicate([...leaves, newLeaf]);
		table.setPredicate(next);
	};

	const updateLeaf = (idx: number, next: Leaf): void => {
		const arr = [...leaves];
		arr[idx] = next;
		table.setPredicate(_buildPredicate(arr));
	};

	const removeLeaf = (idx: number): void => {
		const arr = leaves.filter((_, i) => i !== idx);
		table.setPredicate(_buildPredicate(arr));
	};

	return (
		<div
			className={cn(
				'flex items-center gap-2 border-b border-border bg-background px-3 py-2',
				className,
			)}
		>
			<Search className="h-3.5 w-3.5 text-muted-foreground" />
			<div className="flex flex-1 flex-wrap items-center gap-1.5">
				{leaves.map((leaf, i) => (
					<FilterChip
						key={`${leaf.columnId}-${i}`}
						leaf={leaf}
						onChange={(l) => updateLeaf(i, l)}
						onRemove={() => removeLeaf(i)}
					/>
				))}
				{leaves.length === 0 && (
					<Input
						className="h-7 max-w-md border-0 bg-transparent shadow-none focus-visible:ring-0"
						placeholder="Filter by id, name, role... or use the menu →"
						readOnly
					/>
				)}
			</div>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm">
						<Plus className="h-3 w-3" />
						Add filter
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					{filterableCols.map((c) => (
						<DropdownMenuItem key={c.id} onSelect={() => addLeaf(c)}>
							{c.header ?? c.id}
							<span className="ml-auto text-xs text-muted-foreground">{c.type ?? 'text'}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('_flatLeavesOrNull', () => {
		it('null は空配列', () => {
			expect(_flatLeavesOrNull(null)).toEqual([]);
		});
		it('単一 leaf は 1 要素配列', () => {
			const leaf = f.leaf('a', '=', 1);
			expect(_flatLeavesOrNull(leaf)).toEqual([leaf]);
		});
		it('AND of leaves はそのまま展開', () => {
			const result = _flatLeavesOrNull(f.and(f.leaf('a', '=', 1), f.leaf('b', '>', 2)));
			expect(result).toHaveLength(2);
		});
		it('OR は表現不能 (null)', () => {
			expect(_flatLeavesOrNull(f.or(f.leaf('a', '=', 1)))).toBeNull();
		});
		it('NOT も表現不能', () => {
			expect(_flatLeavesOrNull(f.not(f.leaf('a', '=', 1)))).toBeNull();
		});
		it('ネスト AND は表現不能', () => {
			expect(_flatLeavesOrNull(f.and(f.and(f.leaf('a', '=', 1))))).toBeNull();
		});
	});
}
