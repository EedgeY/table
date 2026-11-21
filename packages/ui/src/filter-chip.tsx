import type { CellValue, FilterOp, Leaf } from '@tarbo-table/core';
import { X } from 'lucide-react';
import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Button } from './components/button.tsx';
import { Input } from './components/input.tsx';
import { OperatorPopover } from './operator-popover.tsx';

export type FilterChipProps = {
	readonly leaf: Leaf;
	readonly onChange: (next: Leaf) => void;
	readonly onRemove: () => void;
};

function _parseValue(raw: string): CellValue {
	if (raw === '') return '';
	const n = Number(raw);
	return Number.isFinite(n) && raw.trim() !== '' && !raw.includes(' ') ? n : raw;
}

const VALUELESS_OPS: ReadonlySet<FilterOp> = new Set(['isNull', 'isNotNull']);

export function FilterChip(props: FilterChipProps): ReactNode {
	const { leaf, onChange, onRemove } = props;
	const [editingValue, setEditingValue] = useState<string>(() => {
		const v = leaf.value;
		if (v === undefined || v === null) return '';
		if (Array.isArray(v)) return v.join(',');
		return String(v);
	});

	const showValue = !VALUELESS_OPS.has(leaf.op);

	const handleOpChange = (op: FilterOp): void => {
		if (VALUELESS_OPS.has(op)) {
			onChange({ ...leaf, op, value: undefined });
		} else {
			onChange({ ...leaf, op });
		}
	};

	const handleValueCommit = (e: ChangeEvent<HTMLInputElement>): void => {
		const next = _parseValue(e.target.value);
		setEditingValue(e.target.value);
		onChange({ ...leaf, value: next });
	};

	return (
		<div className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 pl-2 pr-1 text-xs">
			<span className="font-medium">{leaf.columnId}</span>
			<OperatorPopover value={leaf.op} onChange={handleOpChange} />
			{showValue && (
				<Input
					value={editingValue}
					onChange={handleValueCommit}
					className="h-6 w-28 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
					placeholder="value"
				/>
			)}
			<Button
				variant="ghost"
				size="icon"
				className="h-5 w-5"
				onClick={onRemove}
				aria-label="Remove filter"
			>
				<X className="h-3 w-3" />
			</Button>
		</div>
	);
}
