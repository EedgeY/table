import type { PaginationDerived, PaginationState } from './pagination.ts';

export function _derivePagination(state: PaginationState, total: number): PaginationDerived {
	const size = state.pageSize;
	const pageCount = size <= 0 || !Number.isFinite(size) ? 1 : Math.max(1, Math.ceil(total / size));
	const pageIndex = Math.min(Math.max(0, state.pageIndex), pageCount - 1);
	const startIndex = Number.isFinite(size) ? pageIndex * size : 0;
	const endIndex = Number.isFinite(size) ? Math.min(total, startIndex + size) : total;
	return {
		pageCount,
		canPrev: pageIndex > 0,
		canNext: pageIndex < pageCount - 1,
		startIndex,
		endIndex,
	};
}

export function _slicePage(indices: Uint32Array, d: PaginationDerived): Uint32Array {
	if (d.startIndex >= indices.length) {
		return new Uint32Array(0);
	}
	return indices.slice(d.startIndex, d.endIndex);
}

export function _clampPagination(state: PaginationState, total: number): PaginationState {
	const size = state.pageSize;
	const pageCount = size <= 0 || !Number.isFinite(size) ? 1 : Math.max(1, Math.ceil(total / size));
	const pageIndex = Math.min(Math.max(0, state.pageIndex), pageCount - 1);
	if (pageIndex === state.pageIndex) {
		return state;
	}
	return Object.freeze({ pageIndex, pageSize: state.pageSize });
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('_pagination', () => {
		it('pageCount is at least 1 even when total is 0', () => {
			expect(_derivePagination({ pageIndex: 0, pageSize: 10 }, 0).pageCount).toBe(1);
		});

		it('pageIndex clamps to [0, pageCount-1]', () => {
			expect(_derivePagination({ pageIndex: 99, pageSize: 10 }, 25)).toMatchObject({
				pageCount: 3,
				canNext: false,
				canPrev: true,
				startIndex: 20,
				endIndex: 25,
			});
		});

		it('endIndex respects total when last page is partial', () => {
			expect(_derivePagination({ pageIndex: 2, pageSize: 10 }, 25).endIndex).toBe(25);
		});

		it('canPrev / canNext at boundaries', () => {
			const first = _derivePagination({ pageIndex: 0, pageSize: 10 }, 30);
			expect(first.canPrev).toBe(false);
			expect(first.canNext).toBe(true);

			const last = _derivePagination({ pageIndex: 2, pageSize: 10 }, 30);
			expect(last.canPrev).toBe(true);
			expect(last.canNext).toBe(false);
		});

		it('Infinity pageSize collapses to a single page covering everything', () => {
			expect(
				_derivePagination({ pageIndex: 0, pageSize: Number.POSITIVE_INFINITY }, 1_000_000),
			).toMatchObject({
				pageCount: 1,
				startIndex: 0,
				endIndex: 1_000_000,
			});
		});

		it('_slicePage returns empty Uint32Array beyond pageCount', () => {
			const arr = new Uint32Array([0, 1, 2, 3, 4]);
			const d = _derivePagination({ pageIndex: 0, pageSize: 2 }, 5);
			expect(Array.from(_slicePage(arr, d))).toEqual([0, 1]);
		});
	});
}
