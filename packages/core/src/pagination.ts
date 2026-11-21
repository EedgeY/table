export type PaginationState = {
	readonly pageIndex: number;
	readonly pageSize: number;
};

export type PaginationDerived = {
	readonly pageCount: number;
	readonly canPrev: boolean;
	readonly canNext: boolean;
	readonly startIndex: number;
	readonly endIndex: number;
};

export function createPaginationState(pageSize = Number.POSITIVE_INFINITY): PaginationState {
	return Object.freeze({ pageIndex: 0, pageSize });
}
