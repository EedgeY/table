import { NuqsAdapter } from 'nuqs/adapters/react';
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import { BusinessDemo } from './business-demo.tsx';
import { CustomCellsDemo } from './custom-cells-demo.tsx';
import './style.css';

type Tab = 'cells' | 'business' | 'supabase';

const _LABELS: Readonly<Record<Tab, string>> = {
	cells: '🎨 Custom Cells',
	business: '🏢 業務系機能',
	supabase: '💼 Supabase 風',
};

function Root(): ReactNode {
	const initial: Tab = ((location.hash.replace('#', '') as Tab) || 'cells') as Tab;
	const [tab, setTab] = useState<Tab>(initial);
	const select = (t: Tab): void => {
		setTab(t);
		location.hash = t;
	};
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-1 border-b border-border bg-background px-3 py-1.5 text-xs">
				{(['cells', 'business', 'supabase'] as const).map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => select(t)}
						className={`rounded px-2 py-1 ${tab === t ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
					>
						{_LABELS[t]}
					</button>
				))}
				<div className="ml-auto text-muted-foreground">
					<a
						href="https://github.com/EedgeY/table"
						target="_blank"
						rel="noreferrer"
						className="hover:underline"
					>
						source
					</a>
				</div>
			</div>
			<div className="min-h-0 flex-1">
				{tab === 'cells' && <CustomCellsDemo />}
				{tab === 'business' && <BusinessDemo />}
				{tab === 'supabase' && <App />}
			</div>
		</div>
	);
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root not found');

createRoot(rootEl).render(
	<StrictMode>
		<NuqsAdapter>
			<Root />
		</NuqsAdapter>
	</StrictMode>,
);
