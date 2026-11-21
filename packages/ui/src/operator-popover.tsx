import type { FilterOp } from '@tarbo-table/core';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from './components/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './components/popover.tsx';
import { OPERATOR_GROUPS, OP_SYMBOLS } from './_operator-groups.ts';

export type OperatorPopoverProps = {
	readonly value: FilterOp;
	readonly onChange: (op: FilterOp) => void;
	readonly trigger?: ReactNode;
};

export function OperatorPopover(props: OperatorPopoverProps): ReactNode {
	const [open, setOpen] = useState(false);
	const { value, onChange, trigger } = props;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				{trigger ?? (
					<Button variant="ghost" size="sm" className="gap-1 px-1.5 font-mono">
						{OP_SYMBOLS[value]}
						<ChevronDown className="h-3 w-3" />
					</Button>
				)}
			</PopoverTrigger>
			<PopoverContent className="w-56 p-1">
				{OPERATOR_GROUPS.map((group, gi) => (
					<div key={group.label}>
						{gi > 0 && <div className="my-1 h-px bg-border" />}
						<div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
							{group.label}
						</div>
						{group.items.map((item) => (
							<button
								key={item.op}
								type="button"
								onClick={() => {
									onChange(item.op);
									setOpen(false);
								}}
								className={
									'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-muted ' +
									(item.op === value ? 'bg-muted' : '')
								}
							>
								<span>{item.label}</span>
								<span className="font-mono text-xs text-muted-foreground">{item.symbol}</span>
							</button>
						))}
					</div>
				))}
			</PopoverContent>
		</Popover>
	);
}
