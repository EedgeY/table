/**
 * @fileoverview React helpers for `@tarbo-table/core-rs`.
 *
 * Provides {@link useRsDriverFactory} — a hook that loads the wasm module
 * once and yields an `EngineDriverFactory` once ready. While `null`, the
 * caller can render a loading state. A typical pattern:
 *
 * ```tsx
 * const rsFactory = useRsDriverFactory();
 * const table = useMemo(() => {
 *   if (!rsFactory) return null;
 *   return createTable({ data, columns, engine: rsFactory });
 * }, [rsFactory]);
 * if (!table) return <Loading />;
 * return <DataTable table={table} />;
 * ```
 *
 * @module @tarbo-table/core-rs/react
 */

import { useEffect, useState } from 'react';
import { loadRsDriverFactory, type RsDriverFactory } from './web.ts';

/**
 * Loads the wasm module lazily on mount and returns the resolved factory.
 * Returns `null` until the wasm has initialized.
 */
export function useRsDriverFactory(): RsDriverFactory | null {
	const [factory, setFactory] = useState<RsDriverFactory | null>(null);

	useEffect(() => {
		let cancelled = false;
		loadRsDriverFactory()
			.then((f) => {
				if (!cancelled) {
					// Wrap in function form so React doesn't invoke the factory
					// itself (factories are functions; useState would call them).
					setFactory(() => f);
				}
			})
			.catch((e: unknown) => {
				console.error('[@tarbo-table/core-rs] wasm load failed', e);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return factory;
}

export type { RsDriverFactory };
