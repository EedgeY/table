//#region src/source-rest.ts
const _defaultFilterEncoder = (p) => {
	const out = {};
	if (p === null) return out;
	const leaves = p.kind === "leaf" ? [p] : p.kind === "group" && p.combinator === "and" && !p.negate ? p.children : [];
	for (const c of leaves) {
		if (c.kind !== "leaf") continue;
		const v = c.value;
		if (Array.isArray(v)) out[c.columnId] = v.join(",");
		else if (v !== null && v !== void 0) out[c.columnId] = String(v);
	}
	return out;
};
const _defaultSortEncoder = (sort) => {
	const out = {};
	if (sort.length === 0) return out;
	out._sort = sort.map((k) => `${k.columnId}:${k.dir}`).join(",");
	return out;
};
const _defaultParseResponse = (json) => {
	if (Array.isArray(json)) return {
		rows: json,
		totalCount: json.length
	};
	const o = json;
	return {
		rows: o.rows ?? [],
		totalCount: o.totalCount ?? o.rows?.length ?? 0,
		nextCursor: o.nextCursor ?? null
	};
};
function _resolveHeaders(h) {
	if (!h) return {};
	if (typeof h === "function") return h();
	return h;
}
function _toEditError(status, message) {
	return {
		code: `http_${status}`,
		message
	};
}
function createRestDataSource(opts) {
	const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
	const encodeFilter = opts.encodeFilter ?? _defaultFilterEncoder;
	const encodeSort = opts.encodeSort ?? _defaultSortEncoder;
	const parseResponse = opts.parseResponse ?? _defaultParseResponse;
	const url = (suffix = "") => `${opts.baseUrl.replace(/\/$/, "")}/${opts.resource}${suffix}`;
	const headers = () => ({
		"Content-Type": "application/json",
		..._resolveHeaders(opts.headers)
	});
	return {
		async fetch(q) {
			const params = new URLSearchParams({
				_limit: String(q.pagination.pageSize),
				_offset: String(q.pagination.pageIndex * q.pagination.pageSize),
				...encodeFilter(q.predicate),
				...encodeSort(q.sort)
			});
			if (q.extra && typeof q.extra.cursor === "string") params.set("_cursor", q.extra.cursor);
			const u = `${url()}?${params.toString()}`;
			const res = await fetchImpl(u, {
				signal: q.signal,
				headers: headers()
			});
			if (!res.ok) throw new Error(`fetch ${u} failed: ${res.status} ${res.statusText}`);
			return parseResponse(await res.json());
		},
		async updateCell(input) {
			const { columnId, value, row } = input;
			const id = encodeURIComponent(opts.idOf(row));
			const body = JSON.stringify({ [columnId]: value });
			const res = await fetchImpl(url(`/${id}`), {
				method: "PATCH",
				headers: headers(),
				body
			});
			if (!res.ok) return {
				ok: false,
				error: _toEditError(res.status, await _readErrorText(res))
			};
			try {
				return {
					ok: true,
					value: await res.json()
				};
			} catch {
				return {
					ok: true,
					value: {
						...row,
						[columnId]: value
					}
				};
			}
		},
		async bulkUpdate(patches) {
			const res = await fetchImpl(url("/bulk"), {
				method: "PATCH",
				headers: headers(),
				body: JSON.stringify({ patches: patches.map((p) => ({
					id: opts.idOf(p.row),
					[p.columnId]: p.value
				})) })
			});
			if (!res.ok) return {
				ok: false,
				error: _toEditError(res.status, await _readErrorText(res))
			};
			return {
				ok: true,
				value: await res.json()
			};
		},
		async insertRow(partial) {
			const res = await fetchImpl(url(), {
				method: "POST",
				headers: headers(),
				body: JSON.stringify(partial)
			});
			if (!res.ok) return {
				ok: false,
				error: _toEditError(res.status, await _readErrorText(res))
			};
			return {
				ok: true,
				value: await res.json()
			};
		},
		async deleteRows(rowIds) {
			for (const id of rowIds) {
				const res = await fetchImpl(url(`/${encodeURIComponent(id)}`), {
					method: "DELETE",
					headers: headers()
				});
				if (!res.ok) return {
					ok: false,
					error: _toEditError(res.status, await _readErrorText(res))
				};
			}
			return {
				ok: true,
				value: void 0
			};
		}
	};
}
async function _readErrorText(res) {
	try {
		return (await res.text()).slice(0, 500) || res.statusText;
	} catch {
		return res.statusText;
	}
}
//#endregion
export { createRestDataSource };

//# sourceMappingURL=source-rest.js.map