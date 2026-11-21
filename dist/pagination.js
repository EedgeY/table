//#region src/pagination.ts
function createPaginationState(pageSize = Number.POSITIVE_INFINITY) {
	return Object.freeze({
		pageIndex: 0,
		pageSize
	});
}
//#endregion
export { createPaginationState };

//# sourceMappingURL=pagination.js.map