import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../_utils.ts';

const buttonVariants = cva(
	'inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:opacity-90',
				outline: 'border border-border bg-background hover:bg-muted',
				ghost: 'hover:bg-muted',
				accent: 'bg-accent text-accent-foreground hover:opacity-90',
				destructive: 'bg-destructive text-white hover:opacity-90',
			},
			size: {
				default: 'h-8 px-3 py-1.5',
				sm: 'h-7 px-2 text-xs',
				icon: 'h-7 w-7',
			},
		},
		defaultVariants: { variant: 'outline', size: 'default' },
	},
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof buttonVariants> & { readonly asChild?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : 'button';
		return (
			<Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
		);
	},
);
Button.displayName = 'Button';

export { buttonVariants };
