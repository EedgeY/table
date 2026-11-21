import type { VirtualRange, VirtualRangeInput } from './virtual.ts';

export function _getVirtualRange(input: VirtualRangeInput): VirtualRange {
	const { scrollTop, viewportHeight, rowHeight, overscan, totalRows } = input;
	if (totalRows <= 0 || rowHeight <= 0) {
		return { startIdx: 0, endIdx: 0, paddingTop: 0, paddingBottom: 0 };
	}
	const safeScroll = Math.max(0, scrollTop);
	const safeViewport = Math.max(0, viewportHeight);
	const safeOverscan = Math.max(0, overscan | 0);

	const rawStart = Math.floor(safeScroll / rowHeight) - safeOverscan;
	const rawEnd = Math.ceil((safeScroll + safeViewport) / rowHeight) + safeOverscan;
	const startIdx = Math.max(0, rawStart);
	const endIdx = Math.min(totalRows, Math.max(startIdx, rawEnd));
	const paddingTop = startIdx * rowHeight;
	const paddingBottom = (totalRows - endIdx) * rowHeight;
	return { startIdx, endIdx, paddingTop, paddingBottom };
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('_virtual', () => {
		it('startIdx is non-negative when scrollTop is 0', () => {
			const r = _getVirtualRange({
				scrollTop: 0,
				viewportHeight: 400,
				rowHeight: 32,
				overscan: 6,
				totalRows: 1000,
			});
			expect(r.startIdx).toBe(0);
		});

		it('endIdx clamps to totalRows', () => {
			const r = _getVirtualRange({
				scrollTop: 1_000_000,
				viewportHeight: 400,
				rowHeight: 32,
				overscan: 6,
				totalRows: 1000,
			});
			expect(r.endIdx).toBe(1000);
		});

		it('paddingTop + visible block + paddingBottom equals totalRows * rowHeight', () => {
			const totalRows = 1000;
			const rowHeight = 32;
			const r = _getVirtualRange({
				scrollTop: 200,
				viewportHeight: 400,
				rowHeight,
				overscan: 6,
				totalRows,
			});
			const visible = (r.endIdx - r.startIdx) * rowHeight;
			expect(r.paddingTop + visible + r.paddingBottom).toBe(totalRows * rowHeight);
		});

		it('totalRows=0 yields an empty range', () => {
			expect(
				_getVirtualRange({
					scrollTop: 0,
					viewportHeight: 400,
					rowHeight: 32,
					overscan: 6,
					totalRows: 0,
				}),
			).toEqual({ startIdx: 0, endIdx: 0, paddingTop: 0, paddingBottom: 0 });
		});

		it('overscan extends both sides', () => {
			const baseline = _getVirtualRange({
				scrollTop: 320,
				viewportHeight: 320,
				rowHeight: 32,
				overscan: 0,
				totalRows: 1000,
			});
			const withOver = _getVirtualRange({
				scrollTop: 320,
				viewportHeight: 320,
				rowHeight: 32,
				overscan: 5,
				totalRows: 1000,
			});
			expect(withOver.startIdx).toBeLessThan(baseline.startIdx);
			expect(withOver.endIdx).toBeGreaterThan(baseline.endIdx);
		});
	});
}
