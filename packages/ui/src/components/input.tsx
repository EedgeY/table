import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../_utils.ts';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
	({ className, type, ...props }, ref) => (
		<input
			ref={ref}
			type={type ?? 'text'}
			className={cn(
				'flex h-8 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			{...props}
		/>
	),
);
Input.displayName = 'Input';
