//#region src/_virtual.ts
function _getVirtualRange(input) {
	const { scrollTop, viewportHeight, rowHeight, overscan, totalRows } = input;
	if (totalRows <= 0 || rowHeight <= 0) return {
		startIdx: 0,
		endIdx: 0,
		paddingTop: 0,
		paddingBottom: 0
	};
	const safeScroll = Math.max(0, scrollTop);
	const safeViewport = Math.max(0, viewportHeight);
	const safeOverscan = Math.max(0, overscan | 0);
	const rawStart = Math.floor(safeScroll / rowHeight) - safeOverscan;
	const rawEnd = Math.ceil((safeScroll + safeViewport) / rowHeight) + safeOverscan;
	const startIdx = Math.max(0, rawStart);
	const endIdx = Math.min(totalRows, Math.max(startIdx, rawEnd));
	return {
		startIdx,
		endIdx,
		paddingTop: startIdx * rowHeight,
		paddingBottom: (totalRows - endIdx) * rowHeight
	};
}
//#endregion
//#region src/virtual.ts
function getVirtualRange(input) {
	return _getVirtualRange(input);
}
//#endregion
export { getVirtualRange as t };

//# sourceMappingURL=virtual-Dencev4w.js.map