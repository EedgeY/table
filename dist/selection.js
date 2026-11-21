//#region src/selection.ts
function createSelectionState(mode = "none") {
	return Object.freeze({
		mode,
		ids: /* @__PURE__ */ new Set()
	});
}
//#endregion
export { createSelectionState };

//# sourceMappingURL=selection.js.map