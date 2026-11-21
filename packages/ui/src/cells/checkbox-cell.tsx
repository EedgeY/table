import type { CellMeta } from '@tarbo-table/core';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { cn } from '../_utils.ts';

export type CheckboxCellProps = {
	readonly meta: Extract<CellMeta, { kind: 'checkbox' }>;
	readonly disabled?: boolean;
	readonly onChange?: (next: boolean) => void;
	readonly className?: string;
};

export function CheckboxCell(props: CheckboxCellProps): ReactNode {
	const { meta, disabled, onChange, className } = props;
	const indeterminate = meta.indeterminate === true;
	const checked: RadixCheckbox.CheckedState = indeterminate ? 'indeterminate' : meta.checked;

	const stop = (e: MouseEvent): void => e.stopPropagation();

	return (
		<span className="inline-flex items-center" onClick={stop}>
			<RadixCheckbox.Root
				checked={checked}
				disabled={disabled || onChange === undefined}
				onCheckedChange={(v) => {
					if (typeof v === 'boolean') onChange?.(v);
				}}
				className={cn(
					'inline-flex h-3.5 w-3.5 items-center justify-center rounded border border-border bg-background transition',
					'data-[state=checked]:bg-accent data-[state=checked]:border-accent',
					'data-[state=indeterminate]:bg-accent/60 data-[state=indeterminate]:border-accent',
					'disabled:opacity-50',
					className,
				)}
				aria-label="cell-checkbox"
			>
				<RadixCheckbox.Indicator>
					{indeterminate ? (
						<Minus className="h-3 w-3 text-accent-foreground" />
					) : (
						<Check className="h-3 w-3 text-accent-foreground" />
					)}
				</RadixCheckbox.Indicator>
			</RadixCheckbox.Root>
		</span>
	);
}
