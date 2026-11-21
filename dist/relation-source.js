//#region src/relation-source.ts
function createMemoryRelationSource(tables) {
	return {
		fetchByIds(tableId, ids) {
			const t = tables[tableId];
			if (t === void 0) return Promise.resolve([]);
			const idSet = new Set(ids.map((id) => String(id)));
			const out = t.rows.filter((r) => idSet.has(String(t.getRowId(r))));
			return Promise.resolve(out);
		},
		getColumns(tableId) {
			const t = tables[tableId];
			return t ? t.columns : [];
		}
	};
}
//#endregion
export { createMemoryRelationSource };

//# sourceMappingURL=relation-source.js.map