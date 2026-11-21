//#region src/data-source.ts
function createMemoryDataSource(initial, getRowId) {
	let rows = [...initial];
	const findIndex = (rowId) => rows.findIndex((r) => getRowId(r) === rowId);
	return {
		getRows: () => rows,
		fetch: (_q) => {
			return Promise.resolve({
				rows: [...rows],
				totalCount: rows.length
			});
		},
		updateCell: ({ rowId, columnId, value, row }) => {
			const idx = findIndex(rowId);
			if (idx < 0) return Promise.resolve({
				ok: false,
				error: {
					code: "not_found",
					message: `row ${rowId} not found`
				}
			});
			const merged = {
				...row,
				[columnId]: value
			};
			rows = rows.map((r, i) => i === idx ? merged : r);
			return Promise.resolve({
				ok: true,
				value: merged
			});
		},
		bulkUpdate: (patches) => {
			const updated = [];
			for (const { rowId, columnId, value, row } of patches) {
				const idx = findIndex(rowId);
				if (idx < 0) return Promise.resolve({
					ok: false,
					error: {
						code: "not_found",
						message: `row ${rowId} not found`
					}
				});
				const merged = {
					...row,
					[columnId]: value
				};
				rows = rows.map((r, i) => i === idx ? merged : r);
				updated.push(merged);
			}
			return Promise.resolve({
				ok: true,
				value: updated
			});
		},
		insertRow: (partial) => {
			const row = partial;
			rows = [...rows, row];
			return Promise.resolve({
				ok: true,
				value: row
			});
		},
		deleteRows: (rowIds) => {
			const ids = new Set(rowIds);
			rows = rows.filter((r) => !ids.has(getRowId(r)));
			return Promise.resolve({
				ok: true,
				value: void 0
			});
		}
	};
}
//#endregion
export { createMemoryDataSource };

//# sourceMappingURL=data-source.js.map