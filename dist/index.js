import { AlertCircle, ArrowDown, ArrowDownUp, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3, Download, ExternalLink, ImageOff, Layers, Loader2, Minus, Plus, RefreshCw, Search, X } from "lucide-react";
import { Fragment, createContext, forwardRef, useCallback, useContext, useEffect, useId, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Fragment as Fragment$1, jsx, jsxs } from "react/jsx-runtime";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { buildChartData, buildHeaderMatrix, exportRows, f, getVirtualRange, isColumnGroup, parseQuery } from "@tarbo-table/core";
import { evaluateCellStyle } from "@tarbo-table/core/conditional-style";
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { exportXlsx } from "@tarbo-table/core/xlsx";
import { parseAsString, useQueryState } from "nuqs";
//#region src/_utils.ts
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
//#endregion
//#region src/use-table.ts
function useTable(table) {
	return useSyncExternalStore((cb) => table.subscribe(cb), () => table.getState(), () => table.getState());
}
//#endregion
//#region src/column-header.tsx
function ColumnHeader(props) {
	const state = useTable(props.table);
	const { table, column, className } = props;
	const sortKey = state.sort.find((k) => k.columnId === column.id);
	const width = table.getColumnWidth(column.id);
	const handleSortClick = (e) => {
		if (column.sortable === false) return;
		table.toggleSort(column.id, e.shiftKey);
	};
	const startResize = useCallback((e) => {
		e.preventDefault();
		const startX = e.clientX;
		const startW = table.getColumnWidth(column.id);
		const move = (ev) => {
			table.setColumnWidth(column.id, startW + (ev.clientX - startX));
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}, [table, column.id]);
	return /* @__PURE__ */ jsxs("th", {
		scope: "col",
		style: {
			width,
			minWidth: width
		},
		className: cn("group relative select-none border-b border-r border-border bg-muted px-2 py-1.5 text-left text-xs font-medium text-muted-foreground", className),
		children: [/* @__PURE__ */ jsxs("button", {
			type: "button",
			onClick: handleSortClick,
			className: cn("flex w-full items-center gap-1 text-left", column.sortable === false && "cursor-default"),
			disabled: column.sortable === false,
			children: [
				/* @__PURE__ */ jsx("span", {
					className: "flex-1 truncate",
					children: column.header ?? column.id
				}),
				column.type && /* @__PURE__ */ jsx("span", {
					className: "text-[10px] font-normal opacity-60",
					children: column.type
				}),
				sortKey ? sortKey.dir === "asc" ? /* @__PURE__ */ jsx(ArrowUp, { className: "h-3 w-3" }) : /* @__PURE__ */ jsx(ArrowDown, { className: "h-3 w-3" }) : /* @__PURE__ */ jsx(ArrowUpDown, { className: "h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" })
			]
		}), /* @__PURE__ */ jsx("div", {
			onPointerDown: startResize,
			className: "absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-accent/40",
			"aria-hidden": "true"
		})]
	});
}
//#endregion
//#region src/components/button.tsx
const buttonVariants = cva("inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50", {
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground hover:opacity-90",
			outline: "border border-border bg-background hover:bg-muted",
			ghost: "hover:bg-muted",
			accent: "bg-accent text-accent-foreground hover:opacity-90",
			destructive: "bg-destructive text-white hover:opacity-90"
		},
		size: {
			default: "h-8 px-3 py-1.5",
			sm: "h-7 px-2 text-xs",
			icon: "h-7 w-7"
		}
	},
	defaultVariants: {
		variant: "outline",
		size: "default"
	}
});
const Button = forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
	return /* @__PURE__ */ jsx(asChild ? Slot : "button", {
		ref,
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
});
Button.displayName = "Button";
//#endregion
//#region src/components/dropdown-menu.tsx
const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuContent = forwardRef(({ className, sideOffset = 4, ...props }, ref) => /* @__PURE__ */ jsx(DropdownMenuPrimitive.Portal, { children: /* @__PURE__ */ jsx(DropdownMenuPrimitive.Content, {
	ref,
	sideOffset,
	collisionPadding: 8,
	className: cn("z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md", className),
	...props
}) }));
DropdownMenuContent.displayName = "DropdownMenuContent";
const DropdownMenuItem = forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(DropdownMenuPrimitive.Item, {
	ref,
	className: cn("relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className),
	...props
}));
DropdownMenuItem.displayName = "DropdownMenuItem";
const DropdownMenuCheckboxItem = forwardRef(({ className, children, checked, ...props }, ref) => /* @__PURE__ */ jsxs(DropdownMenuPrimitive.CheckboxItem, {
	ref,
	checked,
	className: cn("relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-sm outline-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className),
	...props,
	children: [/* @__PURE__ */ jsx("span", {
		className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center",
		children: /* @__PURE__ */ jsx(DropdownMenuPrimitive.ItemIndicator, { children: /* @__PURE__ */ jsx(Check, { className: "h-3.5 w-3.5" }) })
	}), children]
}));
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";
const DropdownMenuLabel = forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(DropdownMenuPrimitive.Label, {
	ref,
	className: cn("px-2 py-1.5 text-xs font-semibold text-muted-foreground", className),
	...props
}));
DropdownMenuLabel.displayName = "DropdownMenuLabel";
const DropdownMenuSeparator = forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(DropdownMenuPrimitive.Separator, {
	ref,
	className: cn("-mx-1 my-1 h-px bg-border", className),
	...props
}));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";
//#endregion
//#region src/column-visibility-menu.tsx
function ColumnVisibilityMenu(props) {
	const state = useTable(props.table);
	const { table } = props;
	const columns = table.getColumns();
	return /* @__PURE__ */ jsxs(DropdownMenu, { children: [/* @__PURE__ */ jsx(DropdownMenuTrigger, {
		asChild: true,
		children: /* @__PURE__ */ jsxs(Button, {
			variant: "outline",
			size: "sm",
			children: [/* @__PURE__ */ jsx(Columns3, { className: "h-3 w-3" }), "Columns"]
		})
	}), /* @__PURE__ */ jsxs(DropdownMenuContent, {
		className: "min-w-[14rem]",
		children: [
			/* @__PURE__ */ jsx(DropdownMenuLabel, { children: "表示する列" }),
			/* @__PURE__ */ jsx(DropdownMenuSeparator, {}),
			columns.map((c) => {
				return /* @__PURE__ */ jsx(DropdownMenuCheckboxItem, {
					checked: state.columnVisibility[c.id] !== false,
					onCheckedChange: () => table.toggleColumnVisibility(c.id),
					onSelect: (e) => e.preventDefault(),
					children: c.header ?? c.id
				}, c.id);
			})
		]
	})] });
}
//#endregion
//#region src/_command-completion.ts
const CHART_TYPES = [
	"bar",
	"line",
	"pie",
	"combo",
	"bubble"
];
const AGG_FNS = [
	"count",
	"countDistinct",
	"sum",
	"avg",
	"min",
	"max",
	"median",
	"p25",
	"p75",
	"p90",
	"p95",
	"p99",
	"stddev",
	"variance"
];
const COMPUTED_FNS = [
	{
		name: "if",
		desc: "IF(cond, then, else)"
	},
	{
		name: "round",
		desc: "round(value [, places])"
	},
	{
		name: "abs",
		desc: "絶対値"
	},
	{
		name: "floor",
		desc: "切り捨て"
	},
	{
		name: "ceil",
		desc: "切り上げ"
	},
	{
		name: "min",
		desc: "最小 (可変長)"
	},
	{
		name: "max",
		desc: "最大 (可変長)"
	},
	{
		name: "coalesce",
		desc: "最初の非 null 値"
	},
	{
		name: "lower",
		desc: "小文字化"
	},
	{
		name: "upper",
		desc: "大文字化"
	}
];
const OPERATORS = [
	{
		op: "=",
		label: "等しい",
		group: "比較"
	},
	{
		op: "!=",
		label: "等しくない",
		group: "比較"
	},
	{
		op: ">",
		label: "より大きい",
		group: "比較"
	},
	{
		op: "<",
		label: "より小さい",
		group: "比較"
	},
	{
		op: ">=",
		label: "以上",
		group: "比較"
	},
	{
		op: "<=",
		label: "以下",
		group: "比較"
	},
	{
		op: "~",
		label: "含む",
		group: "パターン"
	},
	{
		op: "~i",
		label: "含む (大小無視)",
		group: "パターン"
	},
	{
		op: "~^",
		label: "で始まる",
		group: "パターン"
	},
	{
		op: "~$",
		label: "で終わる",
		group: "パターン"
	}
];
const AGG_GROUPS = {
	count: "集約",
	countDistinct: "集約",
	sum: "集約",
	avg: "集約",
	min: "集約",
	max: "集約",
	median: "分位数",
	p25: "分位数",
	p75: "分位数",
	p90: "分位数",
	p95: "分位数",
	p99: "分位数",
	stddev: "統計",
	variance: "統計"
};
const CONNECTIVES = [
	{
		kw: "and",
		desc: "AND (省略可)"
	},
	{
		kw: "or",
		desc: "OR"
	},
	{
		kw: "|",
		desc: "OR (短縮)"
	},
	{
		kw: "not",
		desc: "NOT"
	}
];
function _tokenize(s) {
	const OPS = [
		">=",
		"<=",
		"!=",
		"~^",
		"~$",
		"~i",
		"=",
		">",
		"<",
		"~"
	];
	const out = [];
	let cur = "";
	let inQ = false;
	const flush = () => {
		if (cur) out.push(cur);
		cur = "";
	};
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === "\"") {
			cur += ch;
			inQ = !inQ;
			continue;
		}
		if (inQ) {
			cur += ch;
			continue;
		}
		if (/\s/.test(ch)) {
			flush();
			continue;
		}
		let matched = null;
		for (const op of OPS) if (s.startsWith(op, i)) {
			matched = op;
			break;
		}
		if (matched !== null) {
			flush();
			out.push(matched);
			i += matched.length - 1;
			continue;
		}
		cur += ch;
	}
	if (cur) out.push(cur);
	return out;
}
function _splitPrefix(input) {
	const endsSpace = /\s$/.test(input) || input === "";
	const tokens = _tokenize(input);
	if (endsSpace) return {
		committed: tokens,
		prefix: ""
	};
	return {
		committed: tokens,
		prefix: tokens.pop() ?? ""
	};
}
function _lastChartIndex(tokens) {
	for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i].toLowerCase() === "chart") return i;
	return -1;
}
function _hasSortBy(tokens) {
	const chartIdx = _lastChartIndex(tokens);
	for (let i = 0; i < tokens.length; i++) {
		if (chartIdx >= 0 && i > chartIdx) break;
		if (tokens[i].toLowerCase() === "by") return true;
	}
	return false;
}
const OPERATOR_CHARS = new Set([
	"=",
	"!",
	"<",
	">",
	"~"
]);
function _isOperatorOnly(s) {
	if (s.length === 0) return false;
	for (const c of s) if (!OPERATOR_CHARS.has(c)) return false;
	return true;
}
function _isColumnLike(s, columns) {
	return columns.some((c) => c.id === s);
}
function _chartPhase(tokensAfterChart) {
	if (tokensAfterChart.length === 0) return "type";
	if (tokensAfterChart.length === 1) return "by";
	if (tokensAfterChart.length === 2) return "group-col";
	const last = tokensAfterChart[tokensAfterChart.length - 1];
	if (last.includes(":")) {
		const [, after] = last.split(":");
		if (after === void 0 || after === "") return "metric-col";
		return "done";
	}
	return "metric-fn";
}
function _splitClauses(before) {
	const clauses = [];
	let cur = "";
	let inQ = false;
	for (let i = 0; i < before.length; i++) {
		const ch = before[i];
		if (inQ && ch === "\\" && before[i + 1] === "\"") {
			cur += "\\\"";
			i++;
			continue;
		}
		if (ch === "\"") {
			inQ = !inQ;
			cur += ch;
			continue;
		}
		if (ch === ";" && !inQ) {
			clauses.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	return {
		committedClauses: clauses,
		currentClause: cur
	};
}
function _committedLetNames(before) {
	const { committedClauses } = _splitClauses(before);
	const names = [];
	for (const clause of committedClauses) {
		const m = /^\s*let\s+([A-Za-z_$][\w$]*)\s*=/i.exec(clause);
		if (m?.[1] !== void 0) names.push(m[1]);
	}
	return names;
}
function _isInLetExpr(currentClause) {
	return /^\s*let\s+[A-Za-z_$][\w$]*\s*=/i.test(currentClause);
}
function _isClauseStart(currentClause, prefix) {
	return currentClause.trimStart() === prefix;
}
function _withLetColumns(columns, letNames) {
	if (letNames.length === 0) return columns;
	const existing = new Set(columns.map((c) => c.id));
	const extra = [];
	for (const name of letNames) {
		if (existing.has(name)) continue;
		existing.add(name);
		extra.push({
			id: name,
			accessor: () => null,
			type: "number",
			header: name
		});
	}
	return extra.length > 0 ? [...columns, ...extra] : columns;
}
function getCompletions(input, cursor, columns, options) {
	const enableChart = options?.enableChart ?? false;
	const templates = options?.templates;
	const before = input.slice(0, cursor);
	const { currentClause } = _splitClauses(before);
	const { committed, prefix } = _splitPrefix(currentClause);
	if (_isInLetExpr(currentClause)) {
		const exprPrefix = /[A-Za-z_$][\w$]*$/.exec(prefix)?.[0] ?? "";
		const matchLc = exprPrefix.toLowerCase();
		const fnSuggestions = COMPUTED_FNS.filter((f) => f.name.startsWith(matchLc)).map((f) => ({
			label: f.name,
			insertText: `${f.name}(`,
			category: "function",
			group: "関数",
			hint: f.desc,
			description: f.desc
		}));
		const colSuggestions = _withLetColumns(columns, _committedLetNames(before)).filter((c) => c.id.toLowerCase().startsWith(matchLc) || c.header?.startsWith(exprPrefix)).map((c) => ({
			label: c.header ?? c.id,
			secondaryLabel: c.header && c.header !== c.id ? c.id : void 0,
			insertText: c.id,
			category: "column",
			group: "列参照",
			hint: c.type === "number" ? "number" : "text"
		}));
		return {
			phase: "computed",
			hint: "計算式: 関数 (round / if / min …) や列を参照できます",
			suggestions: [...fnSuggestions, ...colSuggestions]
		};
	}
	const columnsWithLet = _withLetColumns(columns, _committedLetNames(before));
	const chartIdx = _lastChartIndex(committed);
	if (enableChart && chartIdx >= 0) {
		let phase = _chartPhase(committed.slice(chartIdx + 1));
		if (prefix.includes(":")) {
			const [fn, col] = prefix.split(":");
			if (col !== void 0 && col === "") phase = "metric-col";
			else if (fn !== void 0 && col !== void 0 && col.length > 0) phase = "metric-col";
		}
		if (phase === "type") return {
			phase: "chart",
			hint: "チャートの種類を選択",
			suggestions: CHART_TYPES.filter((t) => t.startsWith(prefix.toLowerCase())).map((t) => ({
				label: t,
				insertText: `${t} `,
				category: "chart-type",
				hint: _chartTypeDescription(t),
				description: _chartTypeDescription(t)
			}))
		};
		if (phase === "by") return {
			phase: "chart",
			hint: "グルーピング列を指定するため \"by\" を入れる",
			suggestions: [{
				label: "by",
				insertText: "by ",
				category: "chart-keyword",
				description: "グループ列を指定するキーワード"
			}]
		};
		if (phase === "group-col") return {
			phase: "chart",
			hint: "集計の基準となる列 (カテゴリ軸) を選択",
			suggestions: columns.filter((c) => c.id.toLowerCase().startsWith(prefix.toLowerCase()) || c.header?.startsWith(prefix)).map((c) => ({
				label: c.header ?? c.id,
				secondaryLabel: c.header && c.header !== c.id ? c.id : void 0,
				insertText: `${c.id} `,
				category: "column",
				hint: c.type === "number" ? "number" : "text"
			}))
		};
		if (phase === "metric-fn") return {
			phase: "chart",
			hint: "集計関数 (例: sum / avg / median)。列名は \":\" の後に指定",
			suggestions: AGG_FNS.filter((fn) => fn.startsWith(prefix.toLowerCase())).map((fn) => ({
				label: fn,
				insertText: `${fn}:`,
				category: "aggregate-fn",
				group: AGG_GROUPS[fn],
				hint: _aggDescription(fn)
			}))
		};
		if (phase === "metric-col") {
			const fn = prefix.split(":")[0] ?? "";
			const colPrefix = prefix.split(":")[1] ?? "";
			return {
				phase: "chart",
				hint: `${fn} を適用する列を選択`,
				suggestions: columns.filter((c) => c.id.toLowerCase().startsWith(colPrefix.toLowerCase()) || c.header?.startsWith(colPrefix)).map((c) => ({
					label: c.header ?? c.id,
					secondaryLabel: c.header && c.header !== c.id ? c.id : void 0,
					insertText: `${fn}:${c.id} `,
					category: "column",
					hint: c.type === "number" ? "number" : "text"
				}))
			};
		}
		return {
			phase: "chart",
			hint: "メトリクスを追加できます (例: count:id)。終了して OK",
			suggestions: AGG_FNS.map((fn) => ({
				label: `+ ${fn}`,
				insertText: `${fn}:`,
				category: "aggregate-fn",
				group: AGG_GROUPS[fn],
				hint: _aggDescription(fn)
			}))
		};
	}
	const last = committed[committed.length - 1] ?? "";
	if (last.toLowerCase() === "by" || committed.length >= 2 && committed[committed.length - 2] === "," && _hasSortBy(committed)) return {
		phase: "sort",
		hint: "ソート列を選択 (-プレフィックスで降順)",
		suggestions: [...columnsWithLet.filter((c) => c.id.toLowerCase().startsWith(prefix.toLowerCase()) || c.header?.startsWith(prefix)).map((c) => ({
			label: c.header ?? c.id,
			secondaryLabel: c.header && c.header !== c.id ? c.id : void 0,
			insertText: `${c.id}`,
			category: "column",
			group: "昇順 (asc)",
			hint: "↑"
		})), ...columnsWithLet.filter((c) => c.id.toLowerCase().startsWith(prefix.replace(/^-?/, "").toLowerCase()) || c.header?.startsWith(prefix.replace(/^-?/, ""))).map((c) => ({
			label: `−${c.header ?? c.id}`,
			secondaryLabel: c.header && c.header !== c.id ? c.id : void 0,
			insertText: `-${c.id}`,
			category: "column",
			group: "降順 (desc)",
			hint: "↓"
		}))]
	};
	if (_isOperatorOnly(prefix) && committed.length > 0 && _isColumnLike(last, columnsWithLet)) return {
		phase: "value",
		hint: "値を入力 (文字列は \"...\" でクオート)",
		suggestions: []
	};
	if (_isColumnLike(last, columnsWithLet) && prefix === "") return {
		phase: "operator",
		hint: `${last} に対する条件演算子を選択`,
		suggestions: OPERATORS.map((o) => ({
			label: o.label,
			insertText: o.op,
			category: "operator",
			group: o.group,
			hint: o.op,
			description: o.label
		}))
	};
	if (_isOperatorOnly(last)) return {
		phase: "value",
		hint: "値を入力 (文字列は \"...\" でクオート)",
		suggestions: []
	};
	if (committed.length >= 3 && _isColumnLike(committed[committed.length - 3], columnsWithLet) && _isOperatorOnly(committed[committed.length - 2]) && prefix === "") {
		const suggestions = [];
		for (const c of CONNECTIVES) suggestions.push({
			label: c.kw,
			insertText: `${c.kw} `,
			category: "connective",
			group: "接続",
			hint: c.desc
		});
		if (!_hasSortBy(committed)) suggestions.push({
			label: "by",
			insertText: "by ",
			category: "sort",
			group: "ソート",
			hint: "ソート列を指定"
		});
		if (enableChart && chartIdx < 0) suggestions.push({
			label: "chart",
			insertText: "chart ",
			category: "chart-keyword",
			group: "チャート",
			hint: "グラフを描画"
		});
		for (const c of columnsWithLet) suggestions.push({
			label: c.header ?? c.id,
			secondaryLabel: c.header && c.header !== c.id ? c.id : void 0,
			insertText: `${c.id}`,
			category: "column",
			group: "別の列で AND",
			hint: c.type === "number" ? "number" : "text"
		});
		return {
			phase: "connective",
			hint: "条件を追加・接続するキーワードを選択",
			suggestions
		};
	}
	const matchPrefix = prefix.toLowerCase();
	const colSuggestions = columnsWithLet.filter((c) => c.id.toLowerCase().startsWith(matchPrefix) || c.header?.startsWith(prefix)).map((c) => ({
		label: c.header ?? c.id,
		secondaryLabel: c.header && c.header !== c.id ? c.id : void 0,
		insertText: c.id,
		category: "column",
		group: "列で絞り込み",
		hint: c.type === "number" ? "number" : "text"
	}));
	const keywords = [];
	if ("let".startsWith(matchPrefix) && _isClauseStart(currentClause, prefix)) keywords.push({
		label: "let",
		insertText: "let ",
		category: "computed-keyword",
		group: "キーワード",
		hint: "計算列を定義",
		description: "let <名前> = <式>; で計算列を定義"
	});
	if (enableChart && "chart".startsWith(matchPrefix)) keywords.push({
		label: "chart",
		insertText: "chart ",
		category: "chart-keyword",
		group: "キーワード",
		hint: "グラフを描画"
	});
	if ("by".startsWith(matchPrefix) && committed.length > 0 && !_hasSortBy(committed)) keywords.push({
		label: "by",
		insertText: "by ",
		category: "sort",
		group: "キーワード",
		hint: "ソートを追加"
	});
	const templateSuggestions = [];
	if (matchPrefix === "" && committed.length === 0 && templates && templates.length > 0) for (const t of templates) templateSuggestions.push({
		label: t.label,
		insertText: t.insertText,
		category: "template",
		group: "テンプレート",
		hint: t.hint,
		description: t.description
	});
	const hasChartKeyword = enableChart;
	return {
		phase: prefix === "" && committed.length === 0 ? "empty" : "column",
		hint: committed.length === 0 ? hasChartKeyword ? "列名で絞り込み、または「chart」「by」キーワードを使えます" : "列名で絞り込み、または「by」キーワードでソートを追加できます" : hasChartKeyword ? "列名 / 接続子 / ソート / チャートを追加できます" : "列名 / 接続子 / ソートを追加できます",
		suggestions: [
			...colSuggestions,
			...keywords,
			...templateSuggestions
		]
	};
}
function _chartTypeDescription(t) {
	switch (t) {
		case "bar": return "棒グラフ (カテゴリ別の集計値)";
		case "line": return "折れ線 (時系列など)";
		case "pie": return "円グラフ (構成比)";
		case "combo": return "複合 (棒 + 線, 2 メトリクス必須)";
		case "bubble": return "バブル (x/y/r の 3 メトリクス必須)";
	}
}
function _aggDescription(fn) {
	switch (fn) {
		case "count": return "行数 (非 null)";
		case "countDistinct": return "ユニーク値の数";
		case "sum": return "合計";
		case "avg": return "平均";
		case "min": return "最小";
		case "max": return "最大";
		case "median": return "中央値";
		case "p25":
		case "p75":
		case "p90":
		case "p95":
		case "p99": return "分位数";
		case "stddev": return "標準偏差";
		case "variance": return "分散";
	}
}
function applySuggestion(input, cursor, suggestion) {
	const before = input.slice(0, cursor);
	const after = input.slice(cursor);
	const { prefix } = _splitPrefix(before);
	const replaced = suggestion.category === "function" || suggestion.category === "column" ? /[A-Za-z_$][\w$]*$/.exec(prefix)?.[0] ?? "" : prefix;
	const start = before.length - replaced.length;
	const head = input.slice(0, start);
	return {
		value: head + suggestion.insertText + after,
		cursor: head.length + suggestion.insertText.length
	};
}
//#endregion
//#region src/components/input.tsx
const Input = forwardRef(({ className, type, ...props }, ref) => /* @__PURE__ */ jsx("input", {
	ref,
	type: type ?? "text",
	className: cn("flex h-8 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50", className),
	...props
}));
Input.displayName = "Input";
//#endregion
//#region src/command-line-input.tsx
function errorUnderlineSpan(error) {
	return {
		start: Math.max(0, error.position),
		width: Math.max(1, error.token.length)
	};
}
const CATEGORY_LABEL = {
	column: "列",
	operator: "演算子",
	connective: "接続",
	sort: "ソート",
	"chart-type": "チャート種別",
	"chart-keyword": "チャート",
	"aggregate-fn": "集計関数",
	"computed-keyword": "計算列",
	function: "関数",
	value: "値",
	template: "テンプレート"
};
const CATEGORY_DOT = {
	column: "bg-emerald-500",
	operator: "bg-blue-500",
	connective: "bg-slate-400",
	sort: "bg-amber-500",
	"chart-type": "bg-purple-500",
	"chart-keyword": "bg-purple-500",
	"aggregate-fn": "bg-sky-500",
	"computed-keyword": "bg-rose-500",
	function: "bg-indigo-500",
	value: "bg-muted-foreground",
	template: "bg-foreground"
};
function CommandLineInput(props) {
	const { table, placeholder, debounceMs = 150, onChartConfig, disableHints = false, value: propValue, onValueChange, enableChart = false, templates } = props;
	const isControlled = propValue !== void 0;
	const [internalValue, setInternalValue] = useState("");
	const value = isControlled ? propValue : internalValue;
	const [cursor, setCursor] = useState(0);
	const [focused, setFocused] = useState(false);
	const [error, setError] = useState(null);
	const [highlight, setHighlight] = useState(0);
	const inputRef = useRef(null);
	const timer = useRef(null);
	useEffect(() => () => {
		if (timer.current) clearTimeout(timer.current);
	}, []);
	const setValue = (next) => {
		if (!isControlled) setInternalValue(next);
		onValueChange?.(next);
	};
	const apply = (v) => {
		const r = parseQuery(v, table.getBaseColumns());
		if (r.ok) {
			table.setComputedColumns(r.value.computed ?? []);
			table.setPredicate(r.value.predicate);
			table.setSort(r.value.sort);
			setError(null);
			if (onChartConfig) onChartConfig(r.value.chart ?? null);
		} else setError({
			message: r.error.message,
			position: r.error.position,
			token: r.error.token ?? ""
		});
	};
	const scheduleApply = (v) => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => apply(v), debounceMs);
	};
	const lastAppliedValueRef = useRef("");
	const scheduleApplyRef = useRef(scheduleApply);
	scheduleApplyRef.current = scheduleApply;
	useEffect(() => {
		if (value === lastAppliedValueRef.current) return;
		lastAppliedValueRef.current = value;
		scheduleApplyRef.current(value);
	}, [value]);
	const onChange = (e) => {
		const v = e.target.value;
		setValue(v);
		setCursor(e.target.selectionStart ?? v.length);
	};
	const onSelect = (e) => {
		setCursor(e.target.selectionStart ?? value.length);
	};
	const insertSuggestion = (s) => {
		const r = applySuggestion(value, cursor, s);
		setValue(r.value);
		setCursor(r.cursor);
		requestAnimationFrame(() => {
			const el = inputRef.current;
			if (el) {
				el.focus();
				el.setSelectionRange(r.cursor, r.cursor);
			}
		});
	};
	const completion = useMemo(() => disableHints ? null : getCompletions(value, cursor, table.getColumns(), {
		enableChart,
		templates
	}), [
		value,
		cursor,
		table,
		disableHints,
		enableChart,
		templates
	]);
	const suggestionsCount = completion?.suggestions.length ?? 0;
	useEffect(() => {
		setHighlight(0);
	}, [value, cursor]);
	const onKeyDown = (e) => {
		if (!completion || suggestionsCount === 0) {
			if (e.key === "Escape") e.target.blur();
			return;
		}
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setHighlight((h) => (h + 1) % suggestionsCount);
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			setHighlight((h) => (h - 1 + suggestionsCount) % suggestionsCount);
			return;
		}
		if (e.key === "Tab" || e.key === "Enter" && completion.phase !== "value") {
			const s = completion.suggestions[highlight];
			if (s) {
				e.preventDefault();
				insertSuggestion(s);
			}
			return;
		}
		if (e.key === "Escape") e.target.blur();
	};
	const showPopover = focused && completion !== null && completion.suggestions.length > 0;
	return /* @__PURE__ */ jsxs("div", {
		className: "relative",
		children: [
			/* @__PURE__ */ jsx(Input, {
				ref: inputRef,
				value,
				onChange,
				onSelect,
				onFocus: () => setFocused(true),
				onBlur: () => {
					setTimeout(() => setFocused(false), 120);
				},
				onKeyDown,
				placeholder: placeholder ?? "salary>=50000 name~\"田中\" by -age",
				className: cn("h-9 font-mono text-[13px] border-transparent bg-muted/40 shadow-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0", error && "border-destructive focus-visible:ring-destructive")
			}),
			showPopover && completion && /* @__PURE__ */ jsx(SuggestionPopover, {
				completion,
				highlight,
				onHover: setHighlight,
				onPick: insertSuggestion
			}),
			error && (() => {
				const { start, width } = errorUnderlineSpan(error);
				return /* @__PURE__ */ jsxs("div", {
					className: "mt-1 px-3 font-mono text-xs text-destructive",
					children: [/* @__PURE__ */ jsxs("div", {
						"aria-hidden": "true",
						className: "whitespace-pre",
						children: [" ".repeat(start), /* @__PURE__ */ jsx("span", {
							"data-testid": "error-underline",
							className: "text-destructive",
							children: "^".repeat(width)
						})]
					}), /* @__PURE__ */ jsx("div", {
						role: "alert",
						children: error.message
					})]
				});
			})()
		]
	});
}
function SuggestionPopover(props) {
	const { completion, highlight, onHover, onPick } = props;
	const items = [];
	let lastKey = null;
	completion.suggestions.forEach((s, i) => {
		const sectionLabel = s.group ?? CATEGORY_LABEL[s.category];
		const key = `${s.category}:${sectionLabel}`;
		if (key !== lastKey) {
			items.push({
				kind: "header",
				key,
				label: sectionLabel
			});
			lastKey = key;
		}
		items.push({
			kind: "item",
			key: `${s.category}-${s.label}-${i}`,
			idx: i,
			s
		});
	});
	return /* @__PURE__ */ jsxs("div", {
		className: "absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-md border border-border bg-background py-1 text-sm shadow-lg",
		role: "listbox",
		children: [/* @__PURE__ */ jsxs("div", {
			className: "flex items-center gap-2 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground",
			children: [/* @__PURE__ */ jsx("span", {
				className: "normal-case",
				children: completion.hint
			}), /* @__PURE__ */ jsx("span", {
				className: "ml-auto normal-case",
				children: "↑↓ で選択 · Enter / Tab で確定 · Esc で閉じる"
			})]
		}), items.map((it) => it.kind === "header" ? /* @__PURE__ */ jsx("div", {
			className: "px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
			children: it.label
		}, it.key) : /* @__PURE__ */ jsxs("button", {
			type: "button",
			role: "option",
			"aria-selected": highlight === it.idx,
			onMouseEnter: () => onHover(it.idx),
			onMouseDown: (e) => {
				e.preventDefault();
				onPick(it.s);
			},
			title: it.s.description,
			className: cn("flex w-full items-center gap-2 px-3 py-1.5 text-left transition", highlight === it.idx ? "bg-muted" : "hover:bg-muted/60"),
			children: [
				/* @__PURE__ */ jsx("span", {
					className: cn("h-2 w-2 shrink-0 rounded-full", CATEGORY_DOT[it.s.category]),
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ jsxs("span", {
					className: "flex flex-1 items-baseline gap-2 truncate",
					children: [/* @__PURE__ */ jsx("span", {
						className: "truncate text-[13px] text-foreground",
						children: it.s.label
					}), it.s.secondaryLabel && /* @__PURE__ */ jsx("span", {
						className: "truncate font-mono text-[10px] text-muted-foreground/80",
						children: it.s.secondaryLabel
					})]
				}),
				it.s.hint && /* @__PURE__ */ jsx("span", {
					className: "font-mono text-[11px] text-muted-foreground",
					children: it.s.hint
				})
			]
		}, it.key))]
	});
}
//#endregion
//#region src/_chart-scales.ts
const _keyId = (k) => JSON.stringify(k);
function bandScale(keys, range, paddingInner = .2) {
	const n = keys.length;
	const total = range[1] - range[0];
	const step = n === 0 ? 0 : total / n;
	const bandwidth = step * (1 - paddingInner);
	const idx = /* @__PURE__ */ new Map();
	for (let i = 0; i < keys.length; i++) idx.set(_keyId(keys[i] ?? null), i);
	const fn = ((key) => {
		const i = idx.get(_keyId(key));
		if (i === void 0) return range[0];
		return range[0] + i * step + (step - bandwidth) / 2;
	});
	fn.bandwidth = bandwidth;
	fn.step = step;
	return fn;
}
function linearScale(domain, range) {
	const [d0, d1] = domain;
	const [r0, r1] = range;
	const span = d1 - d0;
	const fn = ((v) => {
		if (span === 0) return (r0 + r1) / 2;
		return r0 + (v - d0) / span * (r1 - r0);
	});
	fn.domain = domain;
	fn.range = range;
	return fn;
}
function niceTicks(maxValue, tickCount = 5) {
	if (!isFinite(maxValue) || maxValue <= 0) return {
		ticks: [0],
		max: 1
	};
	const rawStep = maxValue / tickCount;
	const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
	const norm = rawStep / mag;
	let step;
	if (norm <= 1) step = 1 * mag;
	else if (norm <= 2) step = 2 * mag;
	else if (norm <= 5) step = 5 * mag;
	else step = 10 * mag;
	const max = Math.ceil(maxValue / step) * step;
	const ticks = [];
	for (let v = 0; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
	return {
		ticks,
		max
	};
}
const _fmt = new Intl.NumberFormat();
function formatNumber(v) {
	if (v === null || v === void 0) return "";
	return _fmt.format(v);
}
const PALETTE = [
	"#3b82f6",
	"#10b981",
	"#f59e0b",
	"#ef4444",
	"#8b5cf6",
	"#06b6d4"
];
function colorAt(i) {
	return PALETTE[i % PALETTE.length];
}
const CHART_LAYOUT = {
	width: 800,
	height: 400,
	margin: {
		top: 20,
		right: 70,
		bottom: 60,
		left: 70
	},
	legendHeight: 24
};
function plotArea(layout = CHART_LAYOUT) {
	const w = layout.width - layout.margin.left - layout.margin.right;
	const h = layout.height - layout.margin.top - layout.margin.bottom;
	return {
		x0: layout.margin.left,
		y0: layout.margin.top,
		x1: layout.margin.left + w,
		y1: layout.margin.top + h,
		width: w,
		height: h
	};
}
function formatCategoryKey(k) {
	if (k === null || k === void 0) return "(なし)";
	return String(k);
}
//#endregion
//#region src/_chart-bar.tsx
function renderBar(data) {
	const area = plotArea();
	const xScale = bandScale(data.categories.map((c) => c.key), [area.x0, area.x1]);
	const allValues = data.categories.flatMap((c) => c.values.filter((v) => v !== null && isFinite(v)));
	const { ticks, max } = niceTicks(allValues.length === 0 ? 1 : Math.max(...allValues));
	const yScale = linearScale([0, max], [area.y1, area.y0]);
	const metricCount = data.metricLabels.length;
	const groupBandwidth = xScale.bandwidth;
	const barWidth = metricCount === 0 ? 0 : groupBandwidth / metricCount;
	return /* @__PURE__ */ jsxs(Fragment$1, { children: [
		ticks.map((t) => /* @__PURE__ */ jsxs("g", { children: [/* @__PURE__ */ jsx("line", {
			x1: area.x0,
			x2: area.x1,
			y1: yScale(t),
			y2: yScale(t),
			stroke: "currentColor",
			strokeOpacity: .1
		}), /* @__PURE__ */ jsx("text", {
			x: area.x0 - 8,
			y: yScale(t),
			textAnchor: "end",
			dominantBaseline: "central",
			fontSize: 10,
			fill: "currentColor",
			opacity: .6,
			children: formatNumber(t)
		})] }, `tick-${t}`)),
		data.categories.map((c) => {
			const x0 = xScale(c.key);
			return /* @__PURE__ */ jsxs("g", { children: [c.values.map((v, mi) => {
				if (v === null || !isFinite(v)) return null;
				const x = x0 + mi * barWidth;
				const y = yScale(v);
				const h = area.y1 - y;
				return /* @__PURE__ */ jsx("rect", {
					x,
					y,
					width: Math.max(1, barWidth - 2),
					height: Math.max(0, h),
					fill: colorAt(mi)
				}, `bar-${mi}`);
			}), /* @__PURE__ */ jsx("text", {
				x: x0 + groupBandwidth / 2,
				y: area.y1 + 16,
				textAnchor: "middle",
				fontSize: 11,
				fill: "currentColor",
				opacity: .8,
				children: formatCategoryKey(c.key)
			})] }, `cat-${formatCategoryKey(c.key)}`);
		}),
		/* @__PURE__ */ jsx("line", {
			x1: area.x0,
			x2: area.x1,
			y1: area.y1,
			y2: area.y1,
			stroke: "currentColor",
			strokeOpacity: .3
		})
	] });
}
function ChartFrame(props) {
	const layout = props.layout ?? CHART_LAYOUT;
	return /* @__PURE__ */ jsx("svg", {
		viewBox: `0 0 ${layout.width} ${layout.height}`,
		className: props.className,
		preserveAspectRatio: "xMidYMid meet",
		role: "img",
		children: props.children
	});
}
//#endregion
//#region src/_chart-bubble.tsx
const MIN_R = 4;
const MAX_R = 36;
function renderBubble(data) {
	const area = plotArea();
	const valid = data.points.filter((p) => p.x !== null && p.y !== null && p.r !== null && isFinite(p.x) && isFinite(p.y) && isFinite(p.r));
	if (valid.length === 0) return /* @__PURE__ */ jsx("text", {
		x: (area.x0 + area.x1) / 2,
		y: (area.y0 + area.y1) / 2,
		textAnchor: "middle",
		fill: "currentColor",
		opacity: .6,
		fontSize: 14,
		children: "データがありません"
	});
	const xs = valid.map((p) => p.x);
	const ys = valid.map((p) => p.y);
	const rs = valid.map((p) => p.r);
	const xMax = Math.max(...xs);
	const yMax = Math.max(...ys);
	const rMax = Math.max(...rs);
	const rMin = Math.min(...rs);
	const xTicks = niceTicks(xMax);
	const yTicks = niceTicks(yMax);
	const xScale = linearScale([0, xTicks.max], [area.x0, area.x1]);
	const yScale = linearScale([0, yTicks.max], [area.y1, area.y0]);
	const rScale = linearScale([rMin, rMax === rMin ? rMax + 1 : rMax], [MIN_R, MAX_R]);
	return /* @__PURE__ */ jsxs(Fragment$1, { children: [
		yTicks.ticks.map((t) => /* @__PURE__ */ jsxs("g", { children: [/* @__PURE__ */ jsx("line", {
			x1: area.x0,
			x2: area.x1,
			y1: yScale(t),
			y2: yScale(t),
			stroke: "currentColor",
			strokeOpacity: .1
		}), /* @__PURE__ */ jsx("text", {
			x: area.x0 - 8,
			y: yScale(t),
			textAnchor: "end",
			dominantBaseline: "central",
			fontSize: 10,
			fill: "currentColor",
			opacity: .6,
			children: formatNumber(t)
		})] }, `yt-${t}`)),
		xTicks.ticks.map((t) => /* @__PURE__ */ jsxs("g", { children: [/* @__PURE__ */ jsx("line", {
			x1: xScale(t),
			x2: xScale(t),
			y1: area.y0,
			y2: area.y1,
			stroke: "currentColor",
			strokeOpacity: .05
		}), /* @__PURE__ */ jsx("text", {
			x: xScale(t),
			y: area.y1 + 16,
			textAnchor: "middle",
			fontSize: 10,
			fill: "currentColor",
			opacity: .6,
			children: formatNumber(t)
		})] }, `xt-${t}`)),
		/* @__PURE__ */ jsx("text", {
			x: (area.x0 + area.x1) / 2,
			y: area.y1 + 38,
			textAnchor: "middle",
			fontSize: 11,
			fill: "currentColor",
			opacity: .7,
			children: data.axisLabels.x
		}),
		/* @__PURE__ */ jsx("text", {
			x: area.x0 - 44,
			y: (area.y0 + area.y1) / 2,
			textAnchor: "middle",
			fontSize: 11,
			fill: "currentColor",
			opacity: .7,
			transform: `rotate(-90 ${area.x0 - 44} ${(area.y0 + area.y1) / 2})`,
			children: data.axisLabels.y
		}),
		valid.map((p, i) => /* @__PURE__ */ jsxs("g", { children: [/* @__PURE__ */ jsx("circle", {
			cx: xScale(p.x),
			cy: yScale(p.y),
			r: rScale(p.r),
			fill: colorAt(i),
			fillOpacity: .6,
			stroke: colorAt(i)
		}), /* @__PURE__ */ jsx("text", {
			x: xScale(p.x),
			y: yScale(p.y),
			textAnchor: "middle",
			dominantBaseline: "central",
			fontSize: 10,
			fill: "currentColor",
			children: formatCategoryKey(p.key)
		})] }, `b-${formatCategoryKey(p.key)}`)),
		/* @__PURE__ */ jsx("line", {
			x1: area.x0,
			x2: area.x1,
			y1: area.y1,
			y2: area.y1,
			stroke: "currentColor",
			strokeOpacity: .3
		}),
		/* @__PURE__ */ jsx("line", {
			x1: area.x0,
			x2: area.x0,
			y1: area.y0,
			y2: area.y1,
			stroke: "currentColor",
			strokeOpacity: .3
		})
	] });
}
//#endregion
//#region src/_chart-combo.tsx
function renderCombo(data) {
	const area = plotArea();
	const xScale = bandScale(data.categories.map((c) => c.key), [area.x0, area.x1]);
	const barVals = data.categories.map((c) => c.values[0]).filter((v) => v !== null && v !== void 0 && isFinite(v));
	const lineVals = data.categories.map((c) => c.values[1]).filter((v) => v !== null && v !== void 0 && isFinite(v));
	const barMax = barVals.length === 0 ? 1 : Math.max(...barVals);
	const lineMax = lineVals.length === 0 ? 1 : Math.max(...lineVals);
	const barTicks = niceTicks(barMax);
	const lineTicks = niceTicks(lineMax);
	const yLeft = linearScale([0, barTicks.max], [area.y1, area.y0]);
	const yRight = linearScale([0, lineTicks.max], [area.y1, area.y0]);
	const linePoints = [];
	const lineDots = [];
	for (const c of data.categories) {
		const v = c.values[1];
		if (v === null || v === void 0 || !isFinite(v)) continue;
		const x = xScale(c.key) + xScale.bandwidth / 2;
		const y = yRight(v);
		linePoints.push(`${x},${y}`);
		lineDots.push(/* @__PURE__ */ jsx("circle", {
			cx: x,
			cy: y,
			r: 3.5,
			fill: colorAt(1)
		}, `d-${formatCategoryKey(c.key)}`));
	}
	const barColor = colorAt(0);
	const lineColor = colorAt(1);
	return /* @__PURE__ */ jsxs(Fragment$1, { children: [
		barTicks.ticks.map((t) => /* @__PURE__ */ jsxs("g", { children: [/* @__PURE__ */ jsx("line", {
			x1: area.x0,
			x2: area.x1,
			y1: yLeft(t),
			y2: yLeft(t),
			stroke: "currentColor",
			strokeOpacity: .1
		}), /* @__PURE__ */ jsx("text", {
			x: area.x0 - 8,
			y: yLeft(t),
			textAnchor: "end",
			dominantBaseline: "central",
			fontSize: 10,
			fill: barColor,
			children: formatNumber(t)
		})] }, `lt-${t}`)),
		lineTicks.ticks.map((t) => /* @__PURE__ */ jsx("text", {
			x: area.x1 + 8,
			y: yRight(t),
			textAnchor: "start",
			dominantBaseline: "central",
			fontSize: 10,
			fill: lineColor,
			children: formatNumber(t)
		}, `rt-${t}`)),
		data.categories.map((c) => {
			const v = c.values[0];
			if (v === null || v === void 0 || !isFinite(v)) return null;
			const x = xScale(c.key);
			const y = yLeft(v);
			const h = area.y1 - y;
			return /* @__PURE__ */ jsx("rect", {
				x,
				y,
				width: Math.max(1, xScale.bandwidth),
				height: Math.max(0, h),
				fill: barColor,
				opacity: .85
			}, `bar-${formatCategoryKey(c.key)}`);
		}),
		/* @__PURE__ */ jsx("polyline", {
			points: linePoints.join(" "),
			fill: "none",
			stroke: lineColor,
			strokeWidth: 2
		}),
		lineDots,
		data.categories.map((c) => /* @__PURE__ */ jsx("text", {
			x: xScale(c.key) + xScale.bandwidth / 2,
			y: area.y1 + 16,
			textAnchor: "middle",
			fontSize: 11,
			fill: "currentColor",
			opacity: .8,
			children: formatCategoryKey(c.key)
		}, `xlbl-${formatCategoryKey(c.key)}`)),
		/* @__PURE__ */ jsx("line", {
			x1: area.x0,
			x2: area.x1,
			y1: area.y1,
			y2: area.y1,
			stroke: "currentColor",
			strokeOpacity: .3
		}),
		/* @__PURE__ */ jsx("line", {
			x1: area.x0,
			x2: area.x0,
			y1: area.y0,
			y2: area.y1,
			stroke: barColor,
			strokeOpacity: .4
		}),
		/* @__PURE__ */ jsx("line", {
			x1: area.x1,
			x2: area.x1,
			y1: area.y0,
			y2: area.y1,
			stroke: lineColor,
			strokeOpacity: .4
		}),
		/* @__PURE__ */ jsx("text", {
			x: area.x0 - 44,
			y: (area.y0 + area.y1) / 2,
			textAnchor: "middle",
			fontSize: 10,
			fill: barColor,
			transform: `rotate(-90 ${area.x0 - 44} ${(area.y0 + area.y1) / 2})`,
			children: data.metricLabels[0] ?? ""
		}),
		/* @__PURE__ */ jsx("text", {
			x: area.x1 + 44,
			y: (area.y0 + area.y1) / 2,
			textAnchor: "middle",
			fontSize: 10,
			fill: lineColor,
			transform: `rotate(-90 ${area.x1 + 44} ${(area.y0 + area.y1) / 2})`,
			children: data.metricLabels[1] ?? ""
		})
	] });
}
//#endregion
//#region src/_chart-line.tsx
function renderLine(data) {
	const area = plotArea();
	const xScale = bandScale(data.categories.map((c) => c.key), [area.x0, area.x1]);
	const cx = (k) => xScale(k) + xScale.bandwidth / 2;
	const allValues = data.categories.flatMap((c) => c.values.filter((v) => v !== null && isFinite(v)));
	const { ticks, max } = niceTicks(allValues.length === 0 ? 1 : Math.max(...allValues));
	const yScale = linearScale([0, max], [area.y1, area.y0]);
	return /* @__PURE__ */ jsxs(Fragment$1, { children: [
		ticks.map((t) => /* @__PURE__ */ jsxs("g", { children: [/* @__PURE__ */ jsx("line", {
			x1: area.x0,
			x2: area.x1,
			y1: yScale(t),
			y2: yScale(t),
			stroke: "currentColor",
			strokeOpacity: .1
		}), /* @__PURE__ */ jsx("text", {
			x: area.x0 - 8,
			y: yScale(t),
			textAnchor: "end",
			dominantBaseline: "central",
			fontSize: 10,
			fill: "currentColor",
			opacity: .6,
			children: formatNumber(t)
		})] }, `tick-${t}`)),
		data.metricLabels.map((_label, mi) => {
			const points = [];
			const circles = [];
			for (const c of data.categories) {
				const v = c.values[mi];
				if (v === null || v === void 0 || !isFinite(v)) continue;
				const x = cx(c.key);
				const y = yScale(v);
				points.push(`${x},${y}`);
				circles.push(/* @__PURE__ */ jsx("circle", {
					cx: x,
					cy: y,
					r: 3,
					fill: colorAt(mi)
				}, `p-${mi}-${formatCategoryKey(c.key)}`));
			}
			return /* @__PURE__ */ jsxs("g", { children: [/* @__PURE__ */ jsx("polyline", {
				points: points.join(" "),
				fill: "none",
				stroke: colorAt(mi),
				strokeWidth: 2
			}), circles] }, `line-${mi}`);
		}),
		data.categories.map((c) => /* @__PURE__ */ jsx("text", {
			x: cx(c.key),
			y: area.y1 + 16,
			textAnchor: "middle",
			fontSize: 11,
			fill: "currentColor",
			opacity: .8,
			children: formatCategoryKey(c.key)
		}, `xlbl-${formatCategoryKey(c.key)}`)),
		/* @__PURE__ */ jsx("line", {
			x1: area.x0,
			x2: area.x1,
			y1: area.y1,
			y2: area.y1,
			stroke: "currentColor",
			strokeOpacity: .3
		})
	] });
}
//#endregion
//#region src/_chart-pie.tsx
function polar(cx, cy, r, angle) {
	return {
		x: cx + r * Math.sin(angle),
		y: cy - r * Math.cos(angle)
	};
}
function arcPath(cx, cy, r, a0, a1) {
	const p0 = polar(cx, cy, r, a0);
	const p1 = polar(cx, cy, r, a1);
	const large = a1 - a0 > Math.PI ? 1 : 0;
	return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`;
}
function renderPie(data) {
	const w = CHART_LAYOUT.width;
	const h = CHART_LAYOUT.height - CHART_LAYOUT.legendHeight;
	const cx = w / 2;
	const cy = h / 2;
	const r = Math.min(w, h) / 2 - 30;
	const slices = data.categories.map((c) => ({
		key: c.key,
		value: c.values[0] !== null && c.values[0] !== void 0 && isFinite(c.values[0]) ? c.values[0] : 0
	})).filter((s) => s.value > 0);
	const total = slices.reduce((acc, s) => acc + s.value, 0);
	if (total === 0) return /* @__PURE__ */ jsx("text", {
		x: cx,
		y: cy,
		textAnchor: "middle",
		fill: "currentColor",
		opacity: .6,
		fontSize: 14,
		children: "データがありません"
	});
	let acc = 0;
	return /* @__PURE__ */ jsxs("g", { children: [slices.map((s, i) => {
		const a0 = acc / total * Math.PI * 2;
		acc += s.value;
		const a1 = acc / total * Math.PI * 2;
		const mid = (a0 + a1) / 2;
		const lp = polar(cx, cy, r * .65, mid);
		const pct = s.value / total * 100;
		return /* @__PURE__ */ jsxs("g", { children: [/* @__PURE__ */ jsx("path", {
			d: arcPath(cx, cy, r, a0, a1),
			fill: colorAt(i),
			stroke: "white",
			strokeWidth: 1
		}), pct >= 5 && /* @__PURE__ */ jsxs("text", {
			x: lp.x,
			y: lp.y,
			textAnchor: "middle",
			dominantBaseline: "central",
			fontSize: 11,
			fill: "white",
			fontWeight: 500,
			children: [
				formatCategoryKey(s.key),
				" (",
				pct.toFixed(0),
				"%)"
			]
		})] }, `slice-${formatCategoryKey(s.key)}`);
	}), /* @__PURE__ */ jsxs("text", {
		x: cx,
		y: h + 12,
		textAnchor: "middle",
		fontSize: 10,
		fill: "currentColor",
		opacity: .6,
		children: ["合計: ", formatNumber(total)]
	})] });
}
//#endregion
//#region src/data-chart.tsx
function Legend(props) {
	const area = plotArea();
	const y = CHART_LAYOUT.height - 12;
	const totalWidth = area.x1 - area.x0;
	const itemWidth = Math.min(180, totalWidth / Math.max(1, props.labels.length));
	const startX = area.x0;
	return /* @__PURE__ */ jsx("g", { children: props.labels.map((label, i) => /* @__PURE__ */ jsxs("g", {
		transform: `translate(${startX + i * itemWidth}, ${y})`,
		children: [/* @__PURE__ */ jsx("rect", {
			width: 12,
			height: 12,
			fill: colorAt(i),
			y: -10,
			rx: 2
		}), /* @__PURE__ */ jsx("text", {
			x: 18,
			y: 0,
			fontSize: 11,
			fill: "currentColor",
			opacity: .85,
			children: label
		})]
	}, `leg-${i}`)) });
}
function _defaultLink(table, groupBy, key) {
	if (key === null || key === void 0) return;
	const next = f.leaf(groupBy, "=", key);
	table.setPredicate(next);
}
function DataChart(props) {
	const { table, chart, className, onCategoryClick } = props;
	const linkEnabled = onCategoryClick !== false;
	const handleCategoryClick = (key) => {
		if (!linkEnabled) return;
		if (typeof onCategoryClick === "function") onCategoryClick({
			key,
			groupBy: chart.groupBy
		});
		else _defaultLink(table, chart.groupBy, key);
	};
	const [, force] = useReducer((x) => x + 1, 0);
	useEffect(() => table.subscribe(() => force()), [table]);
	const rows = table.getVisibleRows().map((r) => r.row);
	const data = buildChartData(rows, table.getColumns(), chart);
	let inner;
	let legendLabels = [];
	let clickableKeys = [];
	if (data.type === "bubble") {
		inner = renderBubble(data);
		legendLabels = [];
		clickableKeys = data.points.map((p) => p.key);
	} else {
		legendLabels = data.metricLabels;
		clickableKeys = data.categories.map((c) => c.key);
		switch (data.type) {
			case "bar":
				inner = renderBar(data);
				break;
			case "line":
				inner = renderLine(data);
				break;
			case "pie":
				inner = renderPie(data);
				legendLabels = data.categories.map((c) => c.key === null ? "(なし)" : String(c.key));
				break;
			case "combo":
				inner = renderCombo(data);
				break;
		}
	}
	return /* @__PURE__ */ jsxs("div", {
		className: cn("tt-data-chart flex h-full flex-col gap-2 border border-border bg-background p-3", className),
		children: [/* @__PURE__ */ jsxs("div", {
			className: "text-xs text-muted-foreground",
			children: [
				chart.type,
				" chart · by ",
				chart.groupBy,
				" · ",
				chart.metrics.map((m) => `${m.fn}(${m.columnId})`).join(", "),
				" · ",
				rows.length,
				" 行"
			]
		}), /* @__PURE__ */ jsx("div", {
			className: "flex-1 overflow-hidden text-foreground",
			children: /* @__PURE__ */ jsxs(ChartFrame, {
				className: "h-full w-full",
				children: [
					inner,
					legendLabels.length > 0 && /* @__PURE__ */ jsx(Legend, { labels: legendLabels }),
					linkEnabled && clickableKeys.length > 0 && /* @__PURE__ */ jsx(ClickableOverlay, {
						keys: clickableKeys,
						onClick: (key) => handleCategoryClick(key)
					})
				]
			})
		})]
	});
}
function ClickableOverlay(props) {
	const area = plotArea();
	const w = area.x1 - area.x0;
	const h = area.y1 - area.y0;
	const n = props.keys.length;
	const slot = n > 0 ? w / n : 0;
	return /* @__PURE__ */ jsx("g", {
		"aria-label": "カテゴリクリック",
		children: props.keys.map((k, i) => /* @__PURE__ */ jsx("rect", {
			x: area.x0 + i * slot,
			y: area.y0,
			width: slot,
			height: h,
			fill: "transparent",
			className: "cursor-pointer hover:fill-accent/10",
			onClick: () => props.onClick(k)
		}, `hit-${i}-${String(k)}`))
	});
}
//#endregion
//#region src/cells/checkbox-cell.tsx
function CheckboxCell(props) {
	const { meta, disabled, onChange, className } = props;
	const indeterminate = meta.indeterminate === true;
	const checked = indeterminate ? "indeterminate" : meta.checked;
	const stop = (e) => e.stopPropagation();
	return /* @__PURE__ */ jsx("span", {
		className: "inline-flex items-center",
		onClick: stop,
		children: /* @__PURE__ */ jsx(RadixCheckbox.Root, {
			checked,
			disabled: disabled || onChange === void 0,
			onCheckedChange: (v) => {
				if (typeof v === "boolean") onChange?.(v);
			},
			className: cn("inline-flex h-3.5 w-3.5 items-center justify-center rounded border border-border bg-background transition", "data-[state=checked]:bg-accent data-[state=checked]:border-accent", "data-[state=indeterminate]:bg-accent/60 data-[state=indeterminate]:border-accent", "disabled:opacity-50", className),
			"aria-label": "cell-checkbox",
			children: /* @__PURE__ */ jsx(RadixCheckbox.Indicator, { children: indeterminate ? /* @__PURE__ */ jsx(Minus, { className: "h-3 w-3 text-accent-foreground" }) : /* @__PURE__ */ jsx(Check, { className: "h-3 w-3 text-accent-foreground" }) })
		})
	});
}
//#endregion
//#region src/cells/_use-thumbnail.ts
let _pipelinePromise = null;
async function _loadPipeline() {
	if (_pipelinePromise !== null) return _pipelinePromise;
	_pipelinePromise = (async () => {
		try {
			return await (await import("@tarbo-table/core-rs/image")).loadImagePipeline();
		} catch {
			return null;
		}
	})();
	return _pipelinePromise;
}
const _CACHE_MAX$1 = 200;
const _cache$1 = /* @__PURE__ */ new Map();
function _cacheGet$1(key) {
	const v = _cache$1.get(key);
	if (v !== void 0) {
		_cache$1.delete(key);
		_cache$1.set(key, v);
	}
	return v;
}
function _cacheSet$1(key, url) {
	if (_cache$1.has(key)) _cache$1.delete(key);
	_cache$1.set(key, url);
	while (_cache$1.size > _CACHE_MAX$1) {
		const oldest = _cache$1.keys().next().value;
		if (oldest === void 0) break;
		const old = _cache$1.get(oldest);
		_cache$1.delete(oldest);
		if (old !== void 0 && old.startsWith("blob:")) URL.revokeObjectURL(old);
	}
}
function useThumbnailUrl(src, width, height = width) {
	const [resolved, setResolved] = useState(() => {
		return _cacheGet$1(`${src}|${width}x${height}`) ?? src;
	});
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);
	useEffect(() => {
		if (src === "" || src.startsWith("blob:")) {
			setResolved(src);
			return;
		}
		const key = `${src}|${width}x${height}`;
		const cached = _cacheGet$1(key);
		if (cached !== void 0) {
			setResolved(cached);
			return;
		}
		setResolved(src);
		let cancelled = false;
		(async () => {
			const p = await _loadPipeline();
			if (cancelled || p === null) return;
			const blob = await p.thumbnail(src, width * 2, height * 2);
			if (cancelled) return;
			const url = URL.createObjectURL(blob);
			_cacheSet$1(key, url);
			if (mountedRef.current) setResolved(url);
		})();
		return () => {
			cancelled = true;
		};
	}, [
		src,
		width,
		height
	]);
	return resolved;
}
//#endregion
//#region src/cells/image-cell.tsx
function ImageCell(props) {
	const { meta, size = 22, className, thumbnail = true } = props;
	const [errored, setErrored] = useState(false);
	const resolvedSrc = useThumbnailUrl(thumbnail ? meta.src : "", size);
	const finalSrc = thumbnail ? resolvedSrc : meta.src;
	if (errored) return /* @__PURE__ */ jsx("span", {
		className: cn("inline-flex items-center justify-center rounded border border-border bg-muted text-muted-foreground", className),
		style: {
			width: size,
			height: size
		},
		"aria-label": meta.alt ?? "image unavailable",
		children: /* @__PURE__ */ jsx(ImageOff, { className: "h-3 w-3" })
	});
	return /* @__PURE__ */ jsx("img", {
		src: finalSrc,
		alt: meta.alt ?? "",
		loading: "lazy",
		decoding: "async",
		width: meta.width ?? size,
		height: meta.height ?? size,
		onError: () => setErrored(true),
		className: cn("inline-block rounded border border-border object-cover align-middle", className),
		style: {
			width: size,
			height: size
		}
	});
}
//#endregion
//#region src/cells/link-cell.tsx
function _isExternal(meta) {
	if (meta.external !== void 0) return meta.external;
	return /^https?:\/\//.test(meta.href);
}
function LinkCell(props) {
	const { meta, className } = props;
	const external = _isExternal(meta);
	const label = meta.label ?? meta.href;
	const onClick = (e) => {
		e.stopPropagation();
	};
	return /* @__PURE__ */ jsxs("a", {
		href: meta.href,
		onClick,
		target: external ? "_blank" : void 0,
		rel: external ? "noopener noreferrer" : void 0,
		className: cn("inline-flex items-center gap-1 truncate text-accent underline-offset-2 hover:underline", className),
		children: [/* @__PURE__ */ jsx("span", {
			className: "truncate",
			children: label
		}), external && /* @__PURE__ */ jsx(ExternalLink, { className: "h-3 w-3 shrink-0 opacity-60" })]
	});
}
//#endregion
//#region src/cells/progress-cell.tsx
function _autoColor(ratio) {
	if (ratio < .4) return "oklch(0.65 0.18 25)";
	if (ratio < .7) return "oklch(0.78 0.16 75)";
	return "oklch(0.7 0.18 145)";
}
function ProgressCell(props) {
	const { meta, className } = props;
	const max = meta.max ?? 100;
	const clamped = Math.max(0, Math.min(max, meta.value));
	const ratio = max === 0 ? 0 : clamped / max;
	const bar = meta.color ?? _autoColor(ratio);
	const showLabel = meta.label ?? "percent";
	const labelText = showLabel === "none" ? null : showLabel === "value" ? `${clamped}` : `${Math.round(ratio * 100)}%`;
	return /* @__PURE__ */ jsxs("span", {
		className: cn("inline-flex w-full items-center gap-2", className),
		children: [/* @__PURE__ */ jsx("span", {
			className: "relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted",
			role: "progressbar",
			"aria-valuenow": clamped,
			"aria-valuemin": 0,
			"aria-valuemax": max,
			children: /* @__PURE__ */ jsx("span", {
				className: "absolute inset-y-0 left-0 rounded-full transition-[width]",
				style: {
					width: `${ratio * 100}%`,
					background: bar
				}
			})
		}), labelText !== null && /* @__PURE__ */ jsx("span", {
			className: "w-9 shrink-0 text-right text-[10px] font-medium tabular-nums text-muted-foreground",
			children: labelText
		})]
	});
}
//#endregion
//#region src/cells/relation-badge-cell.tsx
function _Avatar$1({ src, label, color }) {
	const hasSrc = src !== void 0 && src !== "";
	const thumb = useThumbnailUrl(hasSrc ? src : "", 16);
	if (hasSrc) return /* @__PURE__ */ jsx("img", {
		src: thumb,
		alt: "",
		width: 16,
		height: 16,
		loading: "lazy",
		decoding: "async",
		className: "inline-block h-4 w-4 shrink-0 rounded-full border border-border object-cover"
	});
	const initials = label.length > 0 ? label.slice(0, 1).toUpperCase() : "?";
	return /* @__PURE__ */ jsx("span", {
		className: "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-[9px] font-medium",
		style: color !== void 0 ? { background: color } : void 0,
		children: initials
	});
}
function _Pill({ label, avatar, color }) {
	return /* @__PURE__ */ jsxs("span", {
		className: "inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-xs",
		children: [/* @__PURE__ */ jsx(_Avatar$1, {
			src: avatar,
			label,
			color
		}), /* @__PURE__ */ jsx("span", {
			className: "truncate",
			children: label
		})]
	});
}
function RelationBadgeCell(props) {
	const { meta, onExpand, className } = props;
	const onClick = (e) => {
		if (onExpand === void 0) return;
		e.stopPropagation();
		onExpand();
	};
	if (meta.kind === "relation") return /* @__PURE__ */ jsx("span", {
		className: cn("inline-flex max-w-full items-center", onExpand !== void 0 && "cursor-pointer", className),
		onClick,
		children: /* @__PURE__ */ jsx(_Pill, {
			label: meta.label,
			avatar: meta.avatar,
			color: meta.color
		})
	});
	const max = meta.max ?? 2;
	const visible = meta.refs.slice(0, max);
	const extra = meta.refs.length - visible.length;
	return /* @__PURE__ */ jsxs("span", {
		className: cn("inline-flex max-w-full items-center gap-1 truncate", onExpand !== void 0 && "cursor-pointer", className),
		onClick,
		children: [visible.map((r) => /* @__PURE__ */ jsx(_Pill, {
			label: r.label,
			avatar: r.avatar,
			color: r.color
		}, `${r.recordRef.tableId}:${String(r.recordRef.rowId)}`)), extra > 0 && /* @__PURE__ */ jsxs("span", {
			className: "shrink-0 rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground",
			children: ["+", extra]
		})]
	});
}
//#endregion
//#region src/cells/sparkline-cell.tsx
const VIEW_W = 100;
const VIEW_H = 24;
const PAD_Y = 2;
function _compute(values, baseline) {
	if (values.length === 0) return null;
	let min = Infinity;
	let max = -Infinity;
	for (const v of values) {
		if (v < min) min = v;
		if (v > max) max = v;
	}
	if (baseline !== void 0) {
		if (baseline < min) min = baseline;
		if (baseline > max) max = baseline;
	}
	const range = max - min;
	const usableH = VIEW_H - PAD_Y * 2;
	const norm = (v) => range === 0 ? VIEW_H / 2 : PAD_Y + (1 - (v - min) / range) * usableH;
	const n = values.length;
	const step = n === 1 ? 0 : VIEW_W / (n - 1);
	const pts = [];
	for (let i = 0; i < n; i++) {
		const x = n === 1 ? VIEW_W / 2 : i * step;
		const y = norm(values[i]);
		pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
	}
	const lastIdx = n - 1;
	const lastX = n === 1 ? VIEW_W / 2 : lastIdx * step;
	const lastY = norm(values[lastIdx]);
	const baselineY = baseline === void 0 ? null : norm(baseline);
	return {
		pathPoints: pts.join(" "),
		lastX,
		lastY,
		baselineY
	};
}
function SparklineCell(props) {
	const { meta, height = 22, className } = props;
	const computed = useMemo(() => _compute(meta.values, meta.baseline), [meta.values, meta.baseline]);
	if (computed === null) return null;
	const color = meta.color ?? "currentColor";
	return /* @__PURE__ */ jsxs("svg", {
		viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
		preserveAspectRatio: "none",
		width: "100%",
		height,
		"aria-hidden": "true",
		className: cn("block align-middle", className),
		style: { color },
		children: [
			computed.baselineY !== null && /* @__PURE__ */ jsx("line", {
				x1: 0,
				x2: VIEW_W,
				y1: computed.baselineY,
				y2: computed.baselineY,
				stroke: "currentColor",
				strokeOpacity: .2,
				strokeDasharray: "2 2",
				strokeWidth: .5,
				vectorEffect: "non-scaling-stroke"
			}),
			/* @__PURE__ */ jsx("polyline", {
				points: computed.pathPoints,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.25,
				strokeLinejoin: "round",
				strokeLinecap: "round",
				vectorEffect: "non-scaling-stroke"
			}),
			/* @__PURE__ */ jsx("circle", {
				cx: computed.lastX,
				cy: computed.lastY,
				r: 1.6,
				fill: "currentColor",
				vectorEffect: "non-scaling-stroke"
			})
		]
	});
}
//#endregion
//#region src/cells/star-cell.tsx
function _Star({ fill, size }) {
	const clipId = useId();
	return /* @__PURE__ */ jsxs("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		className: "inline-block align-middle",
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsx("clipPath", {
				id: clipId,
				children: /* @__PURE__ */ jsx("rect", {
					x: 0,
					y: 0,
					width: 24 * fill,
					height: 24
				})
			}) }),
			/* @__PURE__ */ jsx("path", {
				d: "M12 2.5l2.95 6.36 6.99.66-5.28 4.69 1.6 6.87L12 17.6l-6.26 3.48 1.6-6.87L2.06 9.52l6.99-.66z",
				fill: "currentColor",
				className: "text-border"
			}),
			/* @__PURE__ */ jsx("path", {
				d: "M12 2.5l2.95 6.36 6.99.66-5.28 4.69 1.6 6.87L12 17.6l-6.26 3.48 1.6-6.87L2.06 9.52l6.99-.66z",
				fill: "currentColor",
				className: "text-amber-400",
				clipPath: `url(#${clipId})`
			})
		]
	});
}
function StarCell(props) {
	const { meta, size = 14, className } = props;
	const max = meta.max ?? 5;
	const value = Math.max(0, Math.min(max, meta.value));
	return /* @__PURE__ */ jsxs("span", {
		className: cn("inline-flex items-center gap-0.5", className),
		"aria-label": `${value}/${max}`,
		children: [Array.from({ length: max }, (_, i) => {
			return /* @__PURE__ */ jsx(_Star, {
				fill: Math.max(0, Math.min(1, value - i)),
				size
			}, i);
		}), /* @__PURE__ */ jsx("span", {
			className: "ml-1 text-[10px] font-medium tabular-nums text-muted-foreground",
			children: value.toFixed(value % 1 === 0 ? 0 : 1)
		})]
	});
}
//#endregion
//#region src/cells/tags-cell.tsx
const _PALETTE = [
	{
		bg: "oklch(0.94 0.05 145)",
		fg: "oklch(0.32 0.12 145)"
	},
	{
		bg: "oklch(0.94 0.05 60)",
		fg: "oklch(0.36 0.12 60)"
	},
	{
		bg: "oklch(0.93 0.05 230)",
		fg: "oklch(0.34 0.12 230)"
	},
	{
		bg: "oklch(0.94 0.05 320)",
		fg: "oklch(0.36 0.12 320)"
	},
	{
		bg: "oklch(0.94 0.05 25)",
		fg: "oklch(0.40 0.16 25)"
	},
	{
		bg: "oklch(0.94 0.05 200)",
		fg: "oklch(0.34 0.12 200)"
	},
	{
		bg: "oklch(0.95 0.04 90)",
		fg: "oklch(0.38 0.11 90)"
	},
	{
		bg: "oklch(0.93 0.05 280)",
		fg: "oklch(0.34 0.12 280)"
	}
];
function _hash(label) {
	let h = 2166136261;
	for (let i = 0; i < label.length; i++) {
		h ^= label.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return Math.abs(h);
}
function _resolveColor(color, label) {
	if (color !== void 0) return {
		bg: color,
		fg: "oklch(0.15 0 0)"
	};
	return _PALETTE[_hash(label) % _PALETTE.length];
}
function TagsCell(props) {
	const { meta, className } = props;
	const max = meta.max ?? 4;
	const visible = meta.tags.slice(0, max);
	const extra = meta.tags.length - visible.length;
	return /* @__PURE__ */ jsxs("span", {
		className: cn("inline-flex max-w-full items-center gap-1 truncate", className),
		children: [visible.map((t, i) => {
			const c = _resolveColor(t.color, t.label);
			return /* @__PURE__ */ jsx("span", {
				className: "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
				style: {
					background: c.bg,
					color: c.fg
				},
				children: t.label
			}, `${t.label}-${i}`);
		}), extra > 0 && /* @__PURE__ */ jsxs("span", {
			className: "shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
			children: ["+", extra]
		})]
	});
}
//#endregion
//#region src/cells/user-cell.tsx
function _Avatar({ src, name, color }) {
	const hasSrc = src !== void 0 && src !== "";
	const thumb = useThumbnailUrl(hasSrc ? src : "", 22);
	if (hasSrc) return /* @__PURE__ */ jsx("img", {
		src: thumb,
		alt: "",
		width: 22,
		height: 22,
		loading: "lazy",
		decoding: "async",
		className: "h-[22px] w-[22px] shrink-0 rounded-full border border-border object-cover"
	});
	const initials = name.split(/\s+/).slice(0, 2).map((s) => s.slice(0, 1).toUpperCase()).join("");
	return /* @__PURE__ */ jsx("span", {
		className: "inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white",
		style: { background: color ?? "oklch(0.55 0.14 230)" },
		"aria-hidden": "true",
		children: initials || "?"
	});
}
function UserCell(props) {
	const { meta, className } = props;
	const hasEmail = meta.email !== void 0 && meta.email !== "";
	return /* @__PURE__ */ jsxs("span", {
		className: cn("inline-flex max-w-full items-center gap-2 truncate", className),
		children: [/* @__PURE__ */ jsx(_Avatar, {
			src: meta.avatar,
			name: meta.name,
			color: meta.color
		}), /* @__PURE__ */ jsxs("span", {
			className: "flex min-w-0 flex-col leading-tight",
			children: [/* @__PURE__ */ jsx("span", {
				className: "truncate text-[11px] font-medium",
				children: meta.name
			}), hasEmail && /* @__PURE__ */ jsx("span", {
				className: "truncate text-[9px] text-muted-foreground",
				children: meta.email
			})]
		})]
	});
}
//#endregion
//#region src/editable-cell.tsx
function _defaultFormat(value) {
	if (value === null || value === void 0) return "";
	if (typeof value === "boolean") return value ? "✓" : "";
	return String(value);
}
function _defaultParseText(raw) {
	return raw;
}
function _defaultParseNumber(raw) {
	if (raw === "") return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}
function EditableCell(props) {
	const { table, column, row, rowId, isFocused, onEnterEdit, onExitEdit } = props;
	const editMeta = column.edit;
	const cellState = table.getCellEdit(rowId, column.id);
	const value = column.accessor(row);
	const display = (editMeta?.format ?? _defaultFormat)(value);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(display);
	const [localError, setLocalError] = useState(null);
	const inputRef = useRef(null);
	const enter = useCallback(() => {
		if (!editMeta) return;
		setDraft(display);
		setLocalError(null);
		setEditing(true);
		onEnterEdit?.();
	}, [
		editMeta,
		display,
		onEnterEdit
	]);
	const cancel = useCallback(() => {
		setEditing(false);
		setLocalError(null);
		onExitEdit?.();
	}, [onExitEdit]);
	const commit = useCallback(async () => {
		if (!editMeta) return false;
		const parsed = (editMeta.parse ?? (editMeta.editor.kind === "number" ? _defaultParseNumber : editMeta.editor.kind === "boolean" ? (s) => s === "true" : _defaultParseText))(draft);
		const validationMsg = editMeta.validate?.(parsed, row) ?? null;
		if (validationMsg !== null) {
			setLocalError(validationMsg);
			return false;
		}
		const result = await table.commitEdit({
			rowId,
			columnId: column.id,
			value: parsed
		});
		if (!result.ok) {
			setLocalError(result.error.message);
			return false;
		}
		setEditing(false);
		setLocalError(null);
		onExitEdit?.();
		return true;
	}, [
		draft,
		editMeta,
		row,
		table,
		rowId,
		column.id,
		onExitEdit
	]);
	useEffect(() => {
		if (!isFocused || !editMeta) return;
		const onKey = (e) => {
			if (editing) return;
			if (e.key === "F2" || e.key === "Enter") {
				e.preventDefault();
				e.stopPropagation();
				enter();
			} else if (e.key === "Delete" || e.key === "Backspace") {
				e.preventDefault();
				table.commitEdit({
					rowId,
					columnId: column.id,
					value: null
				});
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => {
			window.removeEventListener("keydown", onKey, true);
		};
	}, [
		isFocused,
		editMeta,
		editing,
		enter,
		table,
		rowId,
		column.id
	]);
	useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus();
			if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
		}
	}, [editing]);
	if (!editMeta || !editing) return /* @__PURE__ */ jsxs("span", {
		className: cn("inline-flex items-center gap-1", cellState.inFlight && "opacity-60", cellState.error && "text-destructive underline decoration-dashed"),
		title: cellState.error?.message,
		onDoubleClick: () => {
			if (editMeta) enter();
		},
		children: [
			display,
			cellState.inFlight && /* @__PURE__ */ jsx("span", {
				className: "inline-block h-2 w-2 animate-pulse rounded-full bg-accent",
				"aria-label": "保存中"
			}),
			cellState.error && /* @__PURE__ */ jsx("button", {
				type: "button",
				onClick: () => table.clearEditError(rowId, column.id),
				className: "ml-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-destructive/20 text-[10px] text-destructive",
				"aria-label": "エラーを閉じる",
				children: "×"
			})
		]
	});
	const ed = editMeta.editor;
	const onKeyDown = (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			e.stopPropagation();
			commit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			cancel();
		} else if (e.key === "Tab") {
			e.preventDefault();
			commit().then((ok) => {
				if (ok) table.moveFocus?.(e.shiftKey ? "left" : "right");
			});
		} else e.stopPropagation();
	};
	const commonProps = {
		ref: inputRef,
		onKeyDown,
		onBlur: () => {
			commit();
		},
		className: cn("h-6 w-full border border-accent bg-background px-1 text-sm outline-none", localError && "border-destructive")
	};
	let inputEl = null;
	if (ed.kind === "text") inputEl = /* @__PURE__ */ jsx("input", {
		type: "text",
		value: draft,
		onChange: (e) => setDraft(e.target.value),
		...commonProps
	});
	else if (ed.kind === "number") inputEl = /* @__PURE__ */ jsx("input", {
		type: "number",
		value: draft,
		step: ed.step,
		min: ed.min,
		max: ed.max,
		onChange: (e) => setDraft(e.target.value),
		...commonProps
	});
	else if (ed.kind === "date") inputEl = /* @__PURE__ */ jsx("input", {
		type: "date",
		value: draft,
		onChange: (e) => setDraft(e.target.value),
		...commonProps
	});
	else if (ed.kind === "boolean") inputEl = /* @__PURE__ */ jsx("input", {
		type: "checkbox",
		checked: draft === "true",
		onChange: (e) => {
			setDraft(String(e.target.checked));
			table.commitEdit({
				rowId,
				columnId: column.id,
				value: e.target.checked
			}).then((r) => {
				if (r.ok) {
					setEditing(false);
					onExitEdit?.();
				}
			});
		},
		className: "h-4 w-4 accent-accent",
		ref: inputRef
	});
	else if (ed.kind === "select") inputEl = /* @__PURE__ */ jsx("select", {
		value: draft,
		onChange: (e) => {
			setDraft(e.target.value);
		},
		onKeyDown,
		onBlur: () => {
			commit();
		},
		className: cn("h-6 w-full border border-accent bg-background px-1 text-sm outline-none", localError && "border-destructive"),
		ref: inputRef,
		children: ed.options.map((o) => /* @__PURE__ */ jsx("option", {
			value: String(o.value),
			children: o.label
		}, String(o.value)))
	});
	return /* @__PURE__ */ jsxs("span", {
		className: "inline-flex w-full items-center gap-0.5",
		children: [
			inputEl,
			/* @__PURE__ */ jsx("button", {
				type: "button",
				className: "inline-flex h-5 w-5 items-center justify-center text-accent hover:bg-accent/10",
				onMouseDown: (e) => {
					e.preventDefault();
					commit();
				},
				"aria-label": "保存",
				children: /* @__PURE__ */ jsx(Check, { className: "h-3 w-3" })
			}),
			/* @__PURE__ */ jsx("button", {
				type: "button",
				className: "inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:bg-muted",
				onMouseDown: (e) => {
					e.preventDefault();
					cancel();
				},
				"aria-label": "取消",
				children: /* @__PURE__ */ jsx(X, { className: "h-3 w-3" })
			}),
			localError && /* @__PURE__ */ jsx("span", {
				className: "ml-1 truncate text-[10px] text-destructive",
				title: localError,
				children: localError
			})
		]
	});
}
//#endregion
//#region src/sub-table.tsx
const _CACHE_MAX = 64;
const _cache = /* @__PURE__ */ new Map();
function _cacheKey(tableId, ids) {
	return `${tableId}|${[...ids].map(String).sort().join(",")}`;
}
function _cacheGet(key) {
	const v = _cache.get(key);
	if (v !== void 0) {
		_cache.delete(key);
		_cache.set(key, v);
	}
	return v;
}
function _cacheSet(key, value) {
	if (_cache.has(key)) _cache.delete(key);
	_cache.set(key, value);
	while (_cache.size > _CACHE_MAX) {
		const oldest = _cache.keys().next().value;
		if (oldest === void 0) break;
		_cache.delete(oldest);
	}
}
function SubDataTable(props) {
	const { relationSource, tableId, ids, className } = props;
	const key = _cacheKey(tableId, ids);
	const [rows, setRows] = useState(() => _cacheGet(key) ?? null);
	const [error, setError] = useState(null);
	useEffect(() => {
		const cached = _cacheGet(key);
		if (cached !== void 0) {
			setRows(cached);
			return;
		}
		let cancelled = false;
		setRows(null);
		setError(null);
		relationSource.fetchByIds(tableId, ids).then((res) => {
			if (cancelled) return;
			_cacheSet(key, res);
			setRows(res);
		}).catch((e) => {
			if (cancelled) return;
			setError(e instanceof Error ? e.message : String(e));
		});
		return () => {
			cancelled = true;
		};
	}, [
		key,
		relationSource,
		tableId,
		ids
	]);
	const columns = relationSource.getColumns(tableId);
	return /* @__PURE__ */ jsxs("div", {
		className: cn("border-t border-border bg-muted/20 px-4 py-2 text-xs", className),
		children: [/* @__PURE__ */ jsxs("div", {
			className: "mb-1 text-[10px] uppercase tracking-wide text-muted-foreground",
			children: [
				tableId,
				" (",
				ids.length,
				")"
			]
		}), error !== null ? /* @__PURE__ */ jsxs("div", {
			className: "text-destructive",
			children: ["読み込みエラー: ", error]
		}) : rows === null ? /* @__PURE__ */ jsxs("div", {
			className: "inline-flex items-center gap-1 text-muted-foreground",
			children: [/* @__PURE__ */ jsx(Loader2, { className: "h-3 w-3 animate-spin" }), "読み込み中…"]
		}) : rows.length === 0 ? /* @__PURE__ */ jsx("div", {
			className: "text-muted-foreground",
			children: "該当レコードがありません。"
		}) : /* @__PURE__ */ jsxs("table", {
			className: "w-full border-collapse",
			children: [/* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", {
				className: "text-left text-muted-foreground",
				children: columns.map((c) => /* @__PURE__ */ jsx("th", {
					className: "border-b border-border px-2 py-1 font-medium",
					style: c.defaultWidth ? { width: c.defaultWidth } : void 0,
					children: c.header ?? c.id
				}, c.id))
			}) }), /* @__PURE__ */ jsx("tbody", { children: rows.map((row, i) => /* @__PURE__ */ jsx("tr", {
				className: "border-b border-border/60",
				children: columns.map((c) => /* @__PURE__ */ jsx("td", {
					className: "truncate px-2 py-1",
					children: _formatCellValue(c.accessor(row))
				}, c.id))
			}, i)) })]
		})]
	});
}
function _formatCellValue(v) {
	if (v === null || v === void 0) return "";
	if (typeof v === "boolean") return v ? "✓" : "";
	return String(v);
}
//#endregion
//#region src/use-expanded-rows.ts
function useExpandedRows() {
	const [map, setMap] = useState(() => /* @__PURE__ */ new Map());
	return {
		map,
		isExpanded: useCallback((rowId, columnId) => map.get(rowId) === columnId, [map]),
		getExpanded: useCallback((rowId) => map.get(rowId), [map]),
		toggle: useCallback((rowId, columnId) => {
			setMap((prev) => {
				const next = new Map(prev);
				if (next.get(rowId) === columnId) next.delete(rowId);
				else next.set(rowId, columnId);
				return next;
			});
		}, []),
		collapse: useCallback((rowId) => {
			setMap((prev) => {
				if (!prev.has(rowId)) return prev;
				const next = new Map(prev);
				next.delete(rowId);
				return next;
			});
		}, []),
		collapseAll: useCallback(() => setMap(/* @__PURE__ */ new Map()), [])
	};
}
//#endregion
//#region src/components/popover.tsx
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverContent = forwardRef(({ className, align = "start", sideOffset = 4, ...props }, ref) => /* @__PURE__ */ jsx(PopoverPrimitive.Portal, { children: /* @__PURE__ */ jsx(PopoverPrimitive.Content, {
	ref,
	align,
	sideOffset,
	collisionPadding: 8,
	className: cn("z-50 min-w-[12rem] rounded-md border border-border bg-background p-1 text-foreground shadow-md outline-none", "data-[state=open]:animate-in data-[state=closed]:animate-out", className),
	...props
}) }));
PopoverContent.displayName = "PopoverContent";
//#endregion
//#region src/_operator-groups.ts
const OPERATOR_GROUPS = Object.freeze([
	{
		label: "COMPARISON",
		items: Object.freeze([
			{
				op: "=",
				label: "Equals",
				symbol: "="
			},
			{
				op: "!=",
				label: "Not equal",
				symbol: "<>"
			},
			{
				op: ">",
				label: "Greater than",
				symbol: ">"
			},
			{
				op: "<",
				label: "Less than",
				symbol: "<"
			},
			{
				op: ">=",
				label: "Greater or equal",
				symbol: ">="
			},
			{
				op: "<=",
				label: "Less or equal",
				symbol: "<="
			}
		])
	},
	{
		label: "PATTERN MATCHING",
		items: Object.freeze([
			{
				op: "like",
				label: "Contains",
				symbol: "~"
			},
			{
				op: "startsWith",
				label: "Starts with",
				symbol: "~^"
			},
			{
				op: "endsWith",
				label: "Ends with",
				symbol: "~$"
			}
		])
	},
	{
		label: "EMPTY",
		items: Object.freeze([{
			op: "isNull",
			label: "Is null",
			symbol: "ø"
		}, {
			op: "isNotNull",
			label: "Is not null",
			symbol: "!ø"
		}])
	}
]);
const OP_SYMBOLS = Object.freeze({
	"=": "=",
	"!=": "<>",
	">": ">",
	"<": "<",
	">=": ">=",
	"<=": "<=",
	like: "~",
	startsWith: "~^",
	endsWith: "~$",
	isNull: "ø",
	isNotNull: "!ø",
	in: "in"
});
//#endregion
//#region src/operator-popover.tsx
function OperatorPopover(props) {
	const [open, setOpen] = useState(false);
	const { value, onChange, trigger } = props;
	return /* @__PURE__ */ jsxs(Popover, {
		open,
		onOpenChange: setOpen,
		children: [/* @__PURE__ */ jsx(PopoverTrigger, {
			asChild: true,
			children: trigger ?? /* @__PURE__ */ jsxs(Button, {
				variant: "ghost",
				size: "sm",
				className: "gap-1 px-1.5 font-mono",
				children: [OP_SYMBOLS[value], /* @__PURE__ */ jsx(ChevronDown, { className: "h-3 w-3" })]
			})
		}), /* @__PURE__ */ jsx(PopoverContent, {
			className: "w-56 p-1",
			children: OPERATOR_GROUPS.map((group, gi) => /* @__PURE__ */ jsxs("div", { children: [
				gi > 0 && /* @__PURE__ */ jsx("div", { className: "my-1 h-px bg-border" }),
				/* @__PURE__ */ jsx("div", {
					className: "px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
					children: group.label
				}),
				group.items.map((item) => /* @__PURE__ */ jsxs("button", {
					type: "button",
					onClick: () => {
						onChange(item.op);
						setOpen(false);
					},
					className: "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-muted " + (item.op === value ? "bg-muted" : ""),
					children: [/* @__PURE__ */ jsx("span", { children: item.label }), /* @__PURE__ */ jsx("span", {
						className: "font-mono text-xs text-muted-foreground",
						children: item.symbol
					})]
				}, item.op))
			] }, group.label))
		})]
	});
}
//#endregion
//#region src/filter-chip.tsx
function _parseValue(raw) {
	if (raw === "") return "";
	const n = Number(raw);
	return Number.isFinite(n) && raw.trim() !== "" && !raw.includes(" ") ? n : raw;
}
const VALUELESS_OPS = new Set(["isNull", "isNotNull"]);
function FilterChip(props) {
	const { leaf, onChange, onRemove } = props;
	const [editingValue, setEditingValue] = useState(() => {
		const v = leaf.value;
		if (v === void 0 || v === null) return "";
		if (Array.isArray(v)) return v.join(",");
		return String(v);
	});
	const showValue = !VALUELESS_OPS.has(leaf.op);
	const handleOpChange = (op) => {
		if (VALUELESS_OPS.has(op)) onChange({
			...leaf,
			op,
			value: void 0
		});
		else onChange({
			...leaf,
			op
		});
	};
	const handleValueCommit = (e) => {
		const next = _parseValue(e.target.value);
		setEditingValue(e.target.value);
		onChange({
			...leaf,
			value: next
		});
	};
	return /* @__PURE__ */ jsxs("div", {
		className: "inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 pl-2 pr-1 text-xs",
		children: [
			/* @__PURE__ */ jsx("span", {
				className: "font-medium",
				children: leaf.columnId
			}),
			/* @__PURE__ */ jsx(OperatorPopover, {
				value: leaf.op,
				onChange: handleOpChange
			}),
			showValue && /* @__PURE__ */ jsx(Input, {
				value: editingValue,
				onChange: handleValueCommit,
				className: "h-6 w-28 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0",
				placeholder: "value"
			}),
			/* @__PURE__ */ jsx(Button, {
				variant: "ghost",
				size: "icon",
				className: "h-5 w-5",
				onClick: onRemove,
				"aria-label": "Remove filter",
				children: /* @__PURE__ */ jsx(X, { className: "h-3 w-3" })
			})
		]
	});
}
//#endregion
//#region src/filter-bar.tsx
function _flatLeavesOrNull(p) {
	if (p === null) return [];
	if (p.kind === "leaf") return [p];
	if (p.kind === "group" && p.combinator === "and" && p.negate !== true) {
		const out = [];
		for (const c of p.children) if (c.kind === "leaf") out.push(c);
		else return null;
		return out;
	}
	return null;
}
function _buildPredicate(leaves) {
	if (leaves.length === 0) return null;
	if (leaves.length === 1) return leaves[0];
	return f.and(...leaves);
}
function FilterBar(props) {
	const { table, className } = props;
	const leaves = _flatLeavesOrNull(useTable(table).predicate);
	const filterableCols = table.getColumns().filter((c) => c.filterable !== false);
	if (leaves === null) return /* @__PURE__ */ jsxs("div", {
		className: cn("flex items-center gap-2 border-b border-border bg-background px-3 py-2 text-xs text-muted-foreground", className),
		children: [/* @__PURE__ */ jsx(Search, { className: "h-3 w-3" }), "複雑なフィルタ条件 (OR / NOT / ネスト) は CLI モードで編集してください。"]
	});
	const addLeaf = (col) => {
		const newLeaf = f.leaf(col.id, "=", "");
		const next = _buildPredicate([...leaves, newLeaf]);
		table.setPredicate(next);
	};
	const updateLeaf = (idx, next) => {
		const arr = [...leaves];
		arr[idx] = next;
		table.setPredicate(_buildPredicate(arr));
	};
	const removeLeaf = (idx) => {
		const arr = leaves.filter((_, i) => i !== idx);
		table.setPredicate(_buildPredicate(arr));
	};
	return /* @__PURE__ */ jsxs("div", {
		className: cn("flex items-center gap-2 border-b border-border bg-background px-3 py-2", className),
		children: [
			/* @__PURE__ */ jsx(Search, { className: "h-3.5 w-3.5 text-muted-foreground" }),
			/* @__PURE__ */ jsxs("div", {
				className: "flex flex-1 flex-wrap items-center gap-1.5",
				children: [leaves.map((leaf, i) => /* @__PURE__ */ jsx(FilterChip, {
					leaf,
					onChange: (l) => updateLeaf(i, l),
					onRemove: () => removeLeaf(i)
				}, `${leaf.columnId}-${i}`)), leaves.length === 0 && /* @__PURE__ */ jsx(Input, {
					className: "h-7 max-w-md border-0 bg-transparent shadow-none focus-visible:ring-0",
					placeholder: "Filter by id, name, role... or use the menu →",
					readOnly: true
				})]
			}),
			/* @__PURE__ */ jsxs(DropdownMenu, { children: [/* @__PURE__ */ jsx(DropdownMenuTrigger, {
				asChild: true,
				children: /* @__PURE__ */ jsxs(Button, {
					variant: "outline",
					size: "sm",
					children: [/* @__PURE__ */ jsx(Plus, { className: "h-3 w-3" }), "Add filter"]
				})
			}), /* @__PURE__ */ jsx(DropdownMenuContent, { children: filterableCols.map((c) => /* @__PURE__ */ jsxs(DropdownMenuItem, {
				onSelect: () => addLeaf(c),
				children: [c.header ?? c.id, /* @__PURE__ */ jsx("span", {
					className: "ml-auto text-xs text-muted-foreground",
					children: c.type ?? "text"
				})]
			}, c.id)) })] })
		]
	});
}
//#endregion
//#region src/multi-header.tsx
function MultiHeader(props) {
	const state = useTable(props.table);
	const { table } = props;
	const matrix = buildHeaderMatrix(table.getColumnTree());
	const startResize = useCallback((columnId) => (e) => {
		e.preventDefault();
		const startX = e.clientX;
		const startW = table.getColumnWidth(columnId);
		const move = (ev) => {
			table.setColumnWidth(columnId, startW + (ev.clientX - startX));
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}, [table]);
	const renderLeafCell = (cell) => {
		const colId = cell.columnId;
		if (!(state.columnVisibility[colId] !== false)) return null;
		const sortKey = state.sort.find((k) => k.columnId === colId);
		const width = table.getColumnWidth(colId);
		const col = table.getColumns().find((c) => c.id === colId);
		const sortable = col?.sortable !== false;
		return /* @__PURE__ */ jsxs("th", {
			rowSpan: cell.rowSpan,
			colSpan: cell.colSpan,
			scope: "col",
			style: {
				width,
				minWidth: width
			},
			className: "group relative select-none border-b border-r border-border bg-muted px-2 py-1.5 text-left text-xs font-medium text-muted-foreground",
			children: [/* @__PURE__ */ jsxs("button", {
				type: "button",
				onClick: (e) => sortable && table.toggleSort(colId, e.shiftKey),
				disabled: !sortable,
				className: cn("flex w-full items-center gap-1 text-left", !sortable && "cursor-default"),
				children: [
					/* @__PURE__ */ jsx("span", {
						className: "flex-1 truncate",
						children: cell.label
					}),
					col?.type && /* @__PURE__ */ jsx("span", {
						className: "text-[10px] font-normal opacity-60",
						children: col.type
					}),
					sortKey ? sortKey.dir === "asc" ? /* @__PURE__ */ jsx(ArrowUp, { className: "h-3 w-3" }) : /* @__PURE__ */ jsx(ArrowDown, { className: "h-3 w-3" }) : /* @__PURE__ */ jsx(ArrowUpDown, { className: "h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" })
				]
			}), /* @__PURE__ */ jsx("div", {
				onPointerDown: startResize(colId),
				className: "absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-accent/40",
				"aria-hidden": "true"
			})]
		}, cell.id);
	};
	return /* @__PURE__ */ jsx("thead", {
		className: "sticky top-0 z-10 bg-muted",
		children: matrix.map((row, ri) => /* @__PURE__ */ jsx("tr", { children: row.map((cell) => cell.isLeaf ? renderLeafCell(cell) : /* @__PURE__ */ jsx("th", {
			rowSpan: cell.rowSpan,
			colSpan: cell.colSpan,
			scope: "colgroup",
			className: "border-b border-r border-border bg-muted px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground",
			children: cell.label
		}, cell.id)) }, `row-${ri}`))
	});
}
//#endregion
//#region src/i18n.tsx
const JA = Object.freeze({
	"toolbar.sort": "ソート",
	"toolbar.columns": "列",
	"toolbar.export": "エクスポート",
	"toolbar.groupBy": "グループ化",
	"toolbar.refresh": "再読込",
	"toolbar.insert": "追加",
	"filter.addFilter": "フィルタを追加",
	"filter.placeholder": "id, 名前, ロールで絞り込み... または右のメニューから →",
	"filter.advancedHint": "複雑なフィルタ条件 (OR / NOT / ネスト) は CLI モードで編集してください。",
	"status.page": "ページ",
	"status.of": "/",
	"status.records": "件",
	"status.selected": "選択中",
	"status.allOption": "全件",
	"status.rowsSuffix": "行",
	"export.label": "形式を選択 (UTF-8 BOM)",
	"editable.saving": "保存中",
	"editable.dismissError": "エラーを閉じる",
	"editable.save": "保存",
	"editable.cancel": "取消",
	"server.loading": "データを読み込んでいます…",
	"server.empty": "データがありません",
	"server.retry": "再試行",
	"group.noneKey": "(なし)",
	"group.count": "件"
});
const EN = Object.freeze({
	"toolbar.sort": "Sort",
	"toolbar.columns": "Columns",
	"toolbar.export": "Export",
	"toolbar.groupBy": "Group by",
	"toolbar.refresh": "Refresh",
	"toolbar.insert": "Insert",
	"filter.addFilter": "Add filter",
	"filter.placeholder": "Filter by id, name, role... or use the menu →",
	"filter.advancedHint": "Complex filters (OR / NOT / nested) can be edited in CLI mode.",
	"status.page": "Page",
	"status.of": "of",
	"status.records": "records",
	"status.selected": "selected",
	"status.allOption": "All",
	"status.rowsSuffix": "rows",
	"export.label": "Select format (UTF-8 BOM)",
	"editable.saving": "Saving",
	"editable.dismissError": "Dismiss error",
	"editable.save": "Save",
	"editable.cancel": "Cancel",
	"server.loading": "Loading data…",
	"server.empty": "No data",
	"server.retry": "Retry",
	"group.noneKey": "(none)",
	"group.count": "rows"
});
const BUILTIN = Object.freeze({
	ja: JA,
	en: EN
});
const LocaleContext = createContext({
	locale: "ja",
	messages: JA,
	numberFormat: new Intl.NumberFormat("ja-JP"),
	dateTimeFormat: new Intl.DateTimeFormat("ja-JP"),
	currencyFormat: new Intl.NumberFormat("ja-JP", {
		style: "currency",
		currency: "JPY"
	})
});
function TableLocaleProvider(props) {
	const id = props.locale ?? "ja";
	const base = BUILTIN[id] ?? BUILTIN.ja;
	const merged = useMemo(() => {
		return {
			locale: id,
			messages: props.messages ? {
				...base,
				...props.messages
			} : base,
			numberFormat: new Intl.NumberFormat(id),
			dateTimeFormat: new Intl.DateTimeFormat(id),
			currencyFormat: new Intl.NumberFormat(id, {
				style: "currency",
				currency: props.currency ?? (id === "ja" ? "JPY" : "USD")
			})
		};
	}, [
		id,
		props.messages,
		props.currency,
		base
	]);
	return /* @__PURE__ */ jsx(LocaleContext.Provider, {
		value: merged,
		children: props.children
	});
}
function useTableLocale() {
	return useContext(LocaleContext);
}
function useT() {
	const { messages } = useTableLocale();
	return (key) => messages[key];
}
//#endregion
//#region src/status-bar.tsx
function StatusBar(props) {
	useTable(props.table);
	const { table } = props;
	const t = useT();
	const pageSizeOptions = props.pageSizeOptions ?? [
		25,
		50,
		100,
		500
	];
	const pag = table.getPagination();
	const rowCount = table.getRowCount();
	const state = table.getState();
	const pageSize = state.pagination.pageSize;
	const setPageIndex = (idx) => {
		table.setPagination({ pageIndex: idx });
	};
	const setPageSize = (size) => {
		table.setPagination({
			pageSize: size,
			pageIndex: 0
		});
	};
	return /* @__PURE__ */ jsxs("div", {
		className: "flex items-center justify-between border-t border-border bg-background px-3 py-1.5 text-xs text-muted-foreground",
		children: [/* @__PURE__ */ jsxs("div", {
			className: "flex items-center gap-2",
			children: [
				/* @__PURE__ */ jsx(Button, {
					variant: "ghost",
					size: "icon",
					disabled: !pag.canPrev,
					onClick: () => setPageIndex(state.pagination.pageIndex - 1),
					"aria-label": "Previous page",
					children: /* @__PURE__ */ jsx(ChevronLeft, { className: "h-3.5 w-3.5" })
				}),
				/* @__PURE__ */ jsxs("span", {
					className: "tt-tabular",
					children: [
						t("status.page"),
						" ",
						/* @__PURE__ */ jsx("strong", {
							className: "text-foreground",
							children: state.pagination.pageIndex + 1
						}),
						" ",
						t("status.of"),
						" ",
						pag.pageCount
					]
				}),
				/* @__PURE__ */ jsx(Button, {
					variant: "ghost",
					size: "icon",
					disabled: !pag.canNext,
					onClick: () => setPageIndex(state.pagination.pageIndex + 1),
					"aria-label": "Next page",
					children: /* @__PURE__ */ jsx(ChevronRight, { className: "h-3.5 w-3.5" })
				}),
				/* @__PURE__ */ jsxs("select", {
					value: Number.isFinite(pageSize) ? String(pageSize) : "all",
					onChange: (e) => setPageSize(e.target.value === "all" ? Number.POSITIVE_INFINITY : Number(e.target.value)),
					className: "rounded-md border border-border bg-background px-1.5 py-0.5 text-xs",
					children: [pageSizeOptions.map((s) => /* @__PURE__ */ jsxs("option", {
						value: s,
						children: [
							s,
							" ",
							t("status.rowsSuffix")
						]
					}, s)), /* @__PURE__ */ jsx("option", {
						value: "all",
						children: t("status.allOption")
					})]
				})
			]
		}), /* @__PURE__ */ jsxs("div", {
			className: "tt-tabular",
			children: [
				rowCount.visible.toLocaleString(),
				" / ",
				rowCount.total.toLocaleString(),
				" ",
				t("status.records"),
				state.selection.ids.size > 0 && /* @__PURE__ */ jsxs("span", {
					className: "ml-3",
					children: [
						state.selection.ids.size,
						" ",
						t("status.selected")
					]
				})
			]
		})]
	});
}
//#endregion
//#region src/export-menu.tsx
function _download(content, fileName, mime) {
	const blob = typeof content === "string" ? new Blob([content], { type: `${mime};charset=utf-8` }) : new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
function ExportMenu(props) {
	const { table, scope = "visible", fileName = "table" } = props;
	const handle = (format) => () => {
		const rows = (scope === "page" ? table.getPagedRows() : table.getVisibleRows()).map((r) => r.row);
		const cols = table.getVisibleColumns();
		if (format === "xlsx") {
			_download(exportXlsx(rows, cols), `${fileName}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
			return;
		}
		const content = exportRows(rows, cols, {
			format,
			bom: true
		});
		const mime = format === "csv" ? "text/csv" : "text/tab-separated-values";
		_download(content, `${fileName}.${format}`, mime);
	};
	return /* @__PURE__ */ jsxs(DropdownMenu, { children: [/* @__PURE__ */ jsx(DropdownMenuTrigger, {
		asChild: true,
		children: /* @__PURE__ */ jsxs(Button, {
			variant: "outline",
			size: "sm",
			children: [/* @__PURE__ */ jsx(Download, { className: "h-3 w-3" }), "Export"]
		})
	}), /* @__PURE__ */ jsxs(DropdownMenuContent, { children: [
		/* @__PURE__ */ jsx(DropdownMenuLabel, { children: "形式を選択 (UTF-8 BOM)" }),
		/* @__PURE__ */ jsx(DropdownMenuSeparator, {}),
		/* @__PURE__ */ jsx(DropdownMenuItem, {
			onSelect: handle("csv"),
			children: "CSV (.csv)"
		}),
		/* @__PURE__ */ jsx(DropdownMenuItem, {
			onSelect: handle("tsv"),
			children: "TSV (.tsv)"
		}),
		/* @__PURE__ */ jsx(DropdownMenuItem, {
			onSelect: handle("xlsx"),
			children: "Excel (.xlsx)"
		})
	] })] });
}
//#endregion
//#region src/grouping-dropdown.tsx
function GroupingDropdown(props) {
	const { table } = props;
	const [_, force] = useState(0);
	if (typeof table.setGroupBy !== "function" || typeof table.getGroupBy !== "function") return null;
	const setGroupBy = table.setGroupBy;
	const groupBy = table.getGroupBy();
	const columns = table.getColumns();
	const add = (id) => {
		if (groupBy.includes(id)) return;
		setGroupBy([...groupBy, id]);
		force((n) => n + 1);
	};
	const remove = (id) => {
		setGroupBy(groupBy.filter((g) => g !== id));
		force((n) => n + 1);
	};
	return /* @__PURE__ */ jsxs("div", {
		className: "flex items-center gap-1",
		children: [groupBy.map((id) => {
			return /* @__PURE__ */ jsxs("span", {
				className: "inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 pl-2 pr-1 text-xs",
				children: [columns.find((c) => c.id === id)?.header ?? id, /* @__PURE__ */ jsx(Button, {
					variant: "ghost",
					size: "icon",
					className: "h-5 w-5",
					onClick: () => remove(id),
					"aria-label": "Remove group",
					children: /* @__PURE__ */ jsx(X, { className: "h-3 w-3" })
				})]
			}, id);
		}), /* @__PURE__ */ jsxs(DropdownMenu, { children: [/* @__PURE__ */ jsx(DropdownMenuTrigger, {
			asChild: true,
			children: /* @__PURE__ */ jsxs(Button, {
				variant: "outline",
				size: "sm",
				children: [/* @__PURE__ */ jsx(Layers, { className: "h-3 w-3" }), "Group by"]
			})
		}), /* @__PURE__ */ jsxs(DropdownMenuContent, { children: [
			/* @__PURE__ */ jsx(DropdownMenuLabel, { children: "グループ化列" }),
			/* @__PURE__ */ jsx(DropdownMenuSeparator, {}),
			columns.map((c) => /* @__PURE__ */ jsx(DropdownMenuItem, {
				disabled: groupBy.includes(c.id),
				onSelect: () => add(c.id),
				children: c.header ?? c.id
			}, c.id))
		] })] })]
	});
}
//#endregion
//#region src/sort-popover.tsx
function SortPopover(props) {
	const { table } = props;
	const sortKeys = useTable(table).sort;
	const columns = table.getColumns();
	const sortableCols = columns.filter((c) => c.sortable !== false);
	const addKey = (columnId) => {
		if (sortKeys.find((k) => k.columnId === columnId)) return;
		const next = {
			columnId,
			dir: "asc"
		};
		table.setSort([...sortKeys, next]);
	};
	const removeKey = (columnId) => {
		table.setSort(sortKeys.filter((k) => k.columnId !== columnId));
	};
	const toggleDir = (columnId) => {
		table.setSort(sortKeys.map((k) => k.columnId === columnId ? {
			...k,
			dir: k.dir === "asc" ? "desc" : "asc"
		} : k));
	};
	return /* @__PURE__ */ jsxs(Popover, { children: [/* @__PURE__ */ jsx(PopoverTrigger, {
		asChild: true,
		children: /* @__PURE__ */ jsxs(Button, {
			variant: "outline",
			size: "sm",
			children: [
				/* @__PURE__ */ jsx(ArrowDownUp, { className: "h-3 w-3" }),
				"Sort",
				sortKeys.length > 0 && /* @__PURE__ */ jsx("span", {
					className: "ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground",
					children: sortKeys.length
				})
			]
		})
	}), /* @__PURE__ */ jsxs(PopoverContent, {
		className: "w-80 p-3",
		align: "start",
		children: [sortKeys.length === 0 ? /* @__PURE__ */ jsxs("p", {
			className: "mb-2 text-xs text-muted-foreground",
			children: [
				"No sorts applied to this view",
				/* @__PURE__ */ jsx("br", {}),
				"Add a column below to sort the view"
			]
		}) : /* @__PURE__ */ jsx("div", {
			className: "mb-3 space-y-1.5",
			children: sortKeys.map((k) => {
				return /* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs",
					children: [
						/* @__PURE__ */ jsx("span", {
							className: "flex-1 truncate font-medium",
							children: columns.find((c) => c.id === k.columnId)?.header ?? k.columnId
						}),
						/* @__PURE__ */ jsx(Button, {
							variant: "ghost",
							size: "icon",
							onClick: () => toggleDir(k.columnId),
							"aria-label": "toggle direction",
							children: k.dir === "asc" ? /* @__PURE__ */ jsx(ArrowUp, { className: "h-3 w-3" }) : /* @__PURE__ */ jsx(ArrowDown, { className: "h-3 w-3" })
						}),
						/* @__PURE__ */ jsx(Button, {
							variant: "ghost",
							size: "icon",
							onClick: () => removeKey(k.columnId),
							"aria-label": "remove sort",
							children: /* @__PURE__ */ jsx(X, { className: "h-3 w-3" })
						})
					]
				}, k.columnId);
			})
		}), /* @__PURE__ */ jsxs(DropdownMenu, { children: [/* @__PURE__ */ jsx(DropdownMenuTrigger, {
			asChild: true,
			children: /* @__PURE__ */ jsx(Button, {
				variant: "outline",
				size: "sm",
				className: "w-full justify-start",
				children: "Pick a column to sort by"
			})
		}), /* @__PURE__ */ jsx(DropdownMenuContent, { children: sortableCols.map((c) => /* @__PURE__ */ jsxs(DropdownMenuItem, {
			onSelect: () => addKey(c.id),
			disabled: sortKeys.some((k) => k.columnId === c.id),
			children: [c.header ?? c.id, /* @__PURE__ */ jsx("span", {
				className: "ml-auto text-xs text-muted-foreground",
				children: c.type ?? "text"
			})]
		}, c.id)) })] })]
	})] });
}
//#endregion
//#region src/toolbar.tsx
function Toolbar(props) {
	const { table, onRefresh, onInsert, extra, showColumnVisibility = true, showExport = true, showGrouping = true, exportFileName } = props;
	return /* @__PURE__ */ jsxs("div", {
		className: "flex items-center gap-2 border-b border-border bg-background px-3 py-1.5",
		children: [
			/* @__PURE__ */ jsx(SortPopover, { table }),
			showColumnVisibility && /* @__PURE__ */ jsx(ColumnVisibilityMenu, { table }),
			showGrouping && /* @__PURE__ */ jsx(GroupingDropdown, { table }),
			showExport && /* @__PURE__ */ jsx(ExportMenu, {
				table,
				fileName: exportFileName
			}),
			extra,
			/* @__PURE__ */ jsx("div", { className: "flex-1" }),
			onRefresh && /* @__PURE__ */ jsx(Button, {
				variant: "outline",
				size: "icon",
				onClick: onRefresh,
				"aria-label": "Refresh",
				children: /* @__PURE__ */ jsx(RefreshCw, { className: "h-3.5 w-3.5" })
			}),
			onInsert && /* @__PURE__ */ jsx(Button, {
				variant: "accent",
				size: "sm",
				onClick: onInsert,
				children: "Insert"
			})
		]
	});
}
//#endregion
//#region src/data-table.tsx
function formatGroupKey(key) {
	if (key === null || key === void 0) return "(なし)";
	return String(key);
}
function _extractRelationRefs(meta) {
	if (meta === null) return null;
	if (meta.kind === "relation") return {
		tableId: meta.recordRef.tableId,
		ids: [String(meta.recordRef.rowId)]
	};
	if (meta.kind === "relation-many") {
		if (meta.refs.length === 0) return null;
		return {
			tableId: meta.refs[0].recordRef.tableId,
			ids: meta.refs.map((r) => String(r.recordRef.rowId))
		};
	}
	return null;
}
function renderBuiltInCell(input) {
	const { column, value, cellMeta, onRelationExpand } = input;
	switch (column.type) {
		case "image":
			if (cellMeta && cellMeta.kind === "image") return /* @__PURE__ */ jsx(ImageCell, { meta: cellMeta });
			break;
		case "link":
			if (cellMeta && cellMeta.kind === "link") return /* @__PURE__ */ jsx(LinkCell, { meta: cellMeta });
			if (typeof value === "string" && value !== "") return /* @__PURE__ */ jsx(LinkCell, { meta: {
				kind: "link",
				href: value
			} });
			break;
		case "checkbox":
			if (cellMeta && cellMeta.kind === "checkbox") return /* @__PURE__ */ jsx(CheckboxCell, { meta: cellMeta });
			return /* @__PURE__ */ jsx(CheckboxCell, { meta: {
				kind: "checkbox",
				checked: value === true
			} });
		case "sparkline":
			if (cellMeta && cellMeta.kind === "sparkline") return /* @__PURE__ */ jsx(SparklineCell, { meta: cellMeta });
			break;
		case "relation":
			if (cellMeta && cellMeta.kind === "relation") return /* @__PURE__ */ jsx(RelationBadgeCell, {
				meta: cellMeta,
				onExpand: onRelationExpand
			});
			break;
		case "relation-many":
			if (cellMeta && cellMeta.kind === "relation-many") return /* @__PURE__ */ jsx(RelationBadgeCell, {
				meta: cellMeta,
				onExpand: onRelationExpand
			});
			break;
		case "star":
			if (cellMeta && cellMeta.kind === "star") return /* @__PURE__ */ jsx(StarCell, { meta: cellMeta });
			if (typeof value === "number") return /* @__PURE__ */ jsx(StarCell, { meta: {
				kind: "star",
				value
			} });
			break;
		case "tags":
			if (cellMeta && cellMeta.kind === "tags") return /* @__PURE__ */ jsx(TagsCell, { meta: cellMeta });
			break;
		case "progress":
			if (cellMeta && cellMeta.kind === "progress") return /* @__PURE__ */ jsx(ProgressCell, { meta: cellMeta });
			if (typeof value === "number") return /* @__PURE__ */ jsx(ProgressCell, { meta: {
				kind: "progress",
				value
			} });
			break;
		case "user":
			if (cellMeta && cellMeta.kind === "user") return /* @__PURE__ */ jsx(UserCell, { meta: cellMeta });
			break;
		default: break;
	}
	if (value === null || value === void 0) return "";
	return String(value);
}
async function copyCellsToClipboard(table, cells) {
	if (cells.length === 0 || typeof navigator === "undefined" || !navigator.clipboard) return;
	const rowIds = Array.from(new Set(cells.map((c) => c.rowId)));
	const columnIds = Array.from(new Set(cells.map((c) => c.columnId)));
	const rowMap = new Map(table.getPagedRows().map((r) => [r.id, r.row]));
	const colMap = new Map(table.getColumns().map((c) => [c.id, c]));
	const lines = [];
	for (const rid of rowIds) {
		const row = rowMap.get(rid);
		if (!row) continue;
		const cellsStr = [];
		for (const cid of columnIds) {
			const col = colMap.get(cid);
			if (!col) {
				cellsStr.push("");
				continue;
			}
			const v = col.accessor(row);
			cellsStr.push(v === null || v === void 0 ? "" : String(v));
		}
		lines.push(cellsStr.join("	"));
	}
	await navigator.clipboard.writeText(lines.join("\n"));
}
function DataTable(props) {
	const state = useTable(props.table);
	const { table, rowHeight = 32, overscan, className, toolbar = true, filterBar = true, statusBar = true, headerMode = "auto", onRowClick, onCellClick, infiniteScroll = true, infiniteThreshold = 200, loadingFallback, errorFallback, emptyFallback } = props;
	const [, force] = useReducer((x) => x + 1, 0);
	useEffect(() => table.subscribe(() => force()), [table]);
	const expanded = useExpandedRows();
	const relationSource = table.getRelationSource();
	const focus = table.getFocus?.() ?? null;
	const hasFocusMixin = typeof table.setFocus === "function";
	const rangeCells = table.getRangeCells?.() ?? [];
	const rangeKeys = useMemo(() => {
		const set = /* @__PURE__ */ new Set();
		for (const c of rangeCells) set.add(`${c.rowId}|${c.columnId}`);
		return set;
	}, [rangeCells]);
	const mode = table.getMode();
	const serverState = table.getServerState();
	const isServer = mode === "server";
	const isLoading = serverState.status === "loading";
	const hasError = serverState.status === "error";
	useEffect(() => {
		if (focus === null || !hasFocusMixin) return;
		const el = scrollRef.current;
		if (!el) return;
		const idx = table.getPagedRows().findIndex((r) => r.id === focus.rowId);
		if (idx < 0) return;
		const rowTop = idx * rowHeight;
		const rowBottom = rowTop + rowHeight;
		if (rowTop < el.scrollTop) el.scrollTop = rowTop;
		else if (rowBottom > el.scrollTop + el.clientHeight) el.scrollTop = rowBottom - el.clientHeight;
	}, [
		focus,
		hasFocusMixin,
		rowHeight,
		table
	]);
	const visibleColumns = table.getVisibleColumns();
	const groupBy = table.getGroupBy?.() ?? [];
	const isGrouped = groupBy.length > 0;
	const useMulti = headerMode === "multi" || headerMode === "auto" && table.getColumnTree().some(isColumnGroup);
	const items = isGrouped && table.getFlatGroupedRows ? table.getFlatGroupedRows() : table.getPagedRows().map((r) => ({
		kind: "row",
		id: r.id,
		row: r.row,
		index: r.index,
		depth: 0
	}));
	const scrollRef = useRef(null);
	const [viewport, setViewport] = useState({
		scrollTop: 0,
		height: 400
	});
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		let rafId = 0;
		const apply = () => {
			rafId = 0;
			setViewport((v) => {
				const next = {
					scrollTop: el.scrollTop,
					height: el.clientHeight
				};
				if (v.scrollTop === next.scrollTop && v.height === next.height) return v;
				return next;
			});
			if (isServer && infiniteScroll && !isLoading) {
				if (el.scrollHeight - el.scrollTop - el.clientHeight < infiniteThreshold) table.fetchMore();
			}
		};
		const schedule = () => {
			if (rafId !== 0) return;
			rafId = requestAnimationFrame(apply);
		};
		apply();
		const ro = new ResizeObserver(apply);
		ro.observe(el);
		el.addEventListener("scroll", schedule, { passive: true });
		return () => {
			if (rafId !== 0) cancelAnimationFrame(rafId);
			ro.disconnect();
			el.removeEventListener("scroll", schedule);
		};
	}, [
		isServer,
		infiniteScroll,
		isLoading,
		infiniteThreshold,
		table
	]);
	const effectiveOverscan = overscan ?? Math.max(8, Math.ceil(viewport.height / rowHeight / 2));
	const range = getVirtualRange({
		scrollTop: viewport.scrollTop,
		viewportHeight: viewport.height,
		rowHeight,
		overscan: effectiveOverscan,
		totalRows: items.length
	});
	const sliced = items.slice(range.startIdx, range.endIdx);
	const selectedIds = state.selection.ids;
	const pageJump = useMemo(() => Math.max(1, Math.floor(viewport.height / rowHeight) - 1), [viewport.height, rowHeight]);
	const onKeyDown = (e) => {
		if (!hasFocusMixin) return;
		if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
			const cells = table.getRangeCells?.() ?? [];
			if (cells.length === 0) return;
			copyCellsToClipboard(table, cells);
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		let dir = null;
		switch (e.key) {
			case "ArrowUp":
				dir = "up";
				break;
			case "ArrowDown":
				dir = "down";
				break;
			case "ArrowLeft":
				dir = "left";
				break;
			case "ArrowRight":
				dir = "right";
				break;
			case "Home":
				dir = "home";
				break;
			case "End":
				dir = "end";
				break;
			case "PageUp":
				dir = "pageUp";
				break;
			case "PageDown":
				dir = "pageDown";
				break;
			case "Escape":
				table.clearFocus?.();
				table.clearRange?.();
				return;
		}
		if (dir !== null) {
			e.preventDefault();
			e.stopPropagation();
			if (e.shiftKey && table.extendRange) table.extendRange(dir, pageJump);
			else table.moveFocus?.(dir, pageJump);
		}
	};
	return /* @__PURE__ */ jsxs("div", {
		className: cn("tt-data-table flex h-full flex-col border border-border bg-background outline-none", className),
		tabIndex: hasFocusMixin ? 0 : -1,
		onKeyDown,
		role: "grid",
		"aria-rowcount": items.length,
		"aria-colcount": visibleColumns.length,
		children: [
			filterBar !== false && (filterBar === true ? /* @__PURE__ */ jsx(FilterBar, { table }) : filterBar),
			toolbar !== false && (toolbar === true ? /* @__PURE__ */ jsx(Toolbar, { table }) : toolbar),
			/* @__PURE__ */ jsxs("div", {
				ref: scrollRef,
				className: "relative flex-1 overflow-auto",
				children: [
					/* @__PURE__ */ jsxs("table", {
						className: "relative w-full table-fixed border-collapse",
						children: [useMulti ? /* @__PURE__ */ jsx(MultiHeader, { table }) : /* @__PURE__ */ jsx("thead", {
							className: "sticky top-0 z-10 bg-muted",
							children: /* @__PURE__ */ jsx("tr", { children: visibleColumns.map((c) => /* @__PURE__ */ jsx(ColumnHeader, {
								table,
								column: c
							}, c.id)) })
						}), /* @__PURE__ */ jsxs("tbody", { children: [
							range.paddingTop > 0 && /* @__PURE__ */ jsx("tr", {
								style: { height: range.paddingTop },
								"aria-hidden": "true",
								children: /* @__PURE__ */ jsx("td", { colSpan: visibleColumns.length })
							}),
							sliced.map((item, i) => {
								if (item.kind === "group") {
									const { node } = item;
									const label = (visibleColumns.find((c) => c.id === groupBy[node.depth]) ?? table.getColumns().find((c) => c.id === groupBy[node.depth]))?.header ?? groupBy[node.depth] ?? "";
									const pathId = JSON.stringify(node.path);
									const isCollapsed = table.getCollapsedGroups?.().has(pathId) ?? false;
									const Caret = isCollapsed ? ChevronRight : ChevronDown;
									return /* @__PURE__ */ jsx("tr", {
										className: "cursor-pointer select-none border-b border-border bg-muted/40 hover:bg-muted/60",
										style: { height: rowHeight },
										onClick: () => table.toggleCollapsed?.(pathId),
										"aria-expanded": !isCollapsed,
										children: /* @__PURE__ */ jsxs("td", {
											colSpan: visibleColumns.length,
											className: "overflow-hidden truncate px-2 text-sm font-medium",
											style: { paddingLeft: 8 + node.depth * 16 },
											children: [
												/* @__PURE__ */ jsx(Caret, { className: "mr-1 inline-block h-3 w-3 align-middle text-muted-foreground" }),
												/* @__PURE__ */ jsxs("span", {
													className: "text-muted-foreground",
													children: [label, ":"]
												}),
												" ",
												/* @__PURE__ */ jsx("span", { children: formatGroupKey(node.key) }),
												/* @__PURE__ */ jsxs("span", {
													className: "ml-2 text-xs text-muted-foreground",
													children: [
														"(",
														node.indices.length,
														"件)"
													]
												})
											]
										})
									}, `g:${node.depth}:${range.startIdx + i}:${String(node.key)}`);
								}
								const selected = selectedIds.has(item.id);
								const rowIndex = range.startIdx + i + 1;
								const expandedColId = expanded.getExpanded(item.id);
								const expandedCol = expandedColId !== void 0 ? visibleColumns.find((c) => c.id === expandedColId) : void 0;
								const expandedRefs = expandedCol?.cellMeta !== void 0 ? _extractRelationRefs(expandedCol.cellMeta(item.row)) : null;
								return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("tr", {
									onClick: () => {
										if (onRowClick) onRowClick(item.row, item.index);
										else if (state.selection.mode !== "none") table.toggleRow(item.id);
									},
									className: cn("border-b border-border", selected ? "bg-accent/15" : "hover:bg-muted/50", "cursor-pointer"),
									style: { height: rowHeight },
									role: "row",
									"aria-rowindex": rowIndex,
									"aria-selected": selected,
									children: visibleColumns.map((c, ci) => {
										const v = c.accessor(item.row);
										const cellMeta = c.cellMeta ? c.cellMeta(item.row) : null;
										const renderFn = c.render;
										const isNum = c.type === "number" || typeof v === "number";
										const indent = ci === 0 && item.depth > 0 ? 8 + item.depth * 16 : void 0;
										const isFocused = focus !== null && focus.rowId === item.id && focus.columnId === c.id;
										const editMeta = c.edit;
										const hasEdit = typeof table.commitEdit === "function" && editMeta !== void 0;
										const styleMeta = c.cellStyle;
										const conditional = styleMeta !== void 0 ? evaluateCellStyle({
											row: item.row,
											value: v,
											rules: styleMeta.rules
										}) : void 0;
										const baseStyle = {};
										if (indent !== void 0) baseStyle.paddingLeft = indent;
										if (conditional?.color) baseStyle.color = conditional.color;
										if (conditional?.backgroundColor) baseStyle.background = conditional.backgroundColor;
										if (conditional?.fontWeight) baseStyle.fontWeight = conditional.fontWeight;
										if (conditional?.fontStyle) baseStyle.fontStyle = conditional.fontStyle;
										if (conditional?.textAlign) baseStyle.textAlign = conditional.textAlign;
										if (conditional?.textDecoration) baseStyle.textDecoration = conditional.textDecoration;
										const inRange = rangeKeys.has(`${item.id}|${c.id}`);
										return /* @__PURE__ */ jsx("td", {
											role: "gridcell",
											"aria-colindex": ci + 1,
											className: cn("overflow-hidden truncate border-r border-border px-2 text-sm", isNum && "tt-tabular text-right", isFocused && "outline outline-2 outline-accent -outline-offset-2", inRange && !isFocused && "bg-accent/10", conditional?.className),
											style: baseStyle,
											onClick: (e) => {
												if (hasFocusMixin) {
													e.stopPropagation();
													if (e.shiftKey && focus !== null && table.setRange) {
														table.setRange({
															anchor: focus,
															head: {
																rowId: item.id,
																columnId: c.id
															}
														});
														table.setFocus?.({
															rowId: item.id,
															columnId: c.id
														});
													} else table.setFocus?.({
														rowId: item.id,
														columnId: c.id
													});
												}
												onCellClick?.({
													row: item.row,
													rowIndex: item.index,
													column: c
												});
											},
											children: renderFn ? renderFn({
												row: item.row,
												value: v,
												cellMeta,
												column: c,
												rowId: item.id,
												isFocused
											}) : hasEdit ? /* @__PURE__ */ jsx(EditableCell, {
												table,
												column: c,
												row: item.row,
												rowId: item.id,
												isFocused
											}) : renderBuiltInCell({
												column: c,
												value: v,
												cellMeta,
												row: item.row,
												onRelationExpand: relationSource !== null && (c.type === "relation" || c.type === "relation-many") ? () => expanded.toggle(item.id, c.id) : void 0
											})
										}, c.id);
									})
								}), expandedRefs !== null && relationSource !== null && /* @__PURE__ */ jsx("tr", {
									role: "row",
									"aria-hidden": "false",
									children: /* @__PURE__ */ jsx("td", {
										colSpan: visibleColumns.length,
										className: "p-0",
										children: /* @__PURE__ */ jsx(SubDataTable, {
											relationSource,
											tableId: expandedRefs.tableId,
											ids: expandedRefs.ids
										})
									})
								})] }, item.id);
							}),
							range.paddingBottom > 0 && /* @__PURE__ */ jsx("tr", {
								style: { height: range.paddingBottom },
								"aria-hidden": "true",
								children: /* @__PURE__ */ jsx("td", { colSpan: visibleColumns.length })
							}),
							isServer && isLoading && items.length > 0 && /* @__PURE__ */ jsx("tr", {
								"aria-live": "polite",
								children: /* @__PURE__ */ jsxs("td", {
									colSpan: visibleColumns.length,
									className: "border-b border-border bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground",
									children: [/* @__PURE__ */ jsx(Loader2, { className: "mr-1 inline-block h-3 w-3 animate-spin align-middle" }), "読み込み中..."]
								})
							})
						] })]
					}),
					isServer && items.length === 0 && /* @__PURE__ */ jsx("div", {
						className: "pointer-events-none absolute inset-0 flex items-center justify-center",
						"aria-busy": isLoading,
						children: isLoading ? loadingFallback ?? /* @__PURE__ */ jsxs("div", {
							className: "pointer-events-auto flex flex-col items-center gap-2 text-xs text-muted-foreground",
							children: [/* @__PURE__ */ jsx(Loader2, { className: "h-5 w-5 animate-spin" }), /* @__PURE__ */ jsx("span", { children: "データを読み込んでいます…" })]
						}) : hasError && serverState.error ? errorFallback?.({ message: serverState.error.message }, () => void table.refresh()) ?? /* @__PURE__ */ jsxs("div", {
							className: "pointer-events-auto flex flex-col items-center gap-2 text-xs text-destructive",
							children: [
								/* @__PURE__ */ jsx(AlertCircle, { className: "h-5 w-5" }),
								/* @__PURE__ */ jsx("span", { children: serverState.error.message }),
								/* @__PURE__ */ jsxs("button", {
									type: "button",
									onClick: () => void table.refresh(),
									className: "inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted",
									children: [/* @__PURE__ */ jsx(RefreshCw, { className: "h-3 w-3" }), "再試行"]
								})
							]
						}) : emptyFallback ?? /* @__PURE__ */ jsx("span", {
							className: "text-xs text-muted-foreground",
							children: "データがありません"
						})
					}),
					!isServer && items.length === 0 && emptyFallback !== void 0 && /* @__PURE__ */ jsx("div", {
						className: "absolute inset-0 flex items-center justify-center",
						children: emptyFallback
					}),
					isServer && hasError && items.length > 0 && serverState.error && /* @__PURE__ */ jsxs("div", {
						className: "sticky bottom-0 z-10 flex items-center gap-2 border-t border-destructive bg-destructive/10 px-3 py-1.5 text-xs text-destructive",
						children: [
							/* @__PURE__ */ jsx(AlertCircle, { className: "h-3 w-3" }),
							/* @__PURE__ */ jsx("span", {
								className: "flex-1",
								children: serverState.error.message
							}),
							/* @__PURE__ */ jsxs("button", {
								type: "button",
								onClick: () => void table.refresh(),
								className: "inline-flex items-center gap-1 rounded border border-destructive/40 bg-background px-2 py-0.5",
								children: [/* @__PURE__ */ jsx(RefreshCw, { className: "h-3 w-3" }), "再試行"]
							})
						]
					})
				]
			}),
			statusBar !== false && (statusBar === true ? /* @__PURE__ */ jsx(StatusBar, { table }) : statusBar)
		]
	});
}
//#endregion
//#region src/use-table-url-state.ts
function useTableUrlState(table, options) {
	const key = options?.key ?? "ttq";
	const history = options?.history ?? "replace";
	const throttleMs = options?.throttleMs ?? 150;
	const clearOnDefault = options?.clearOnDefault ?? true;
	const [raw, setRaw] = useQueryState(key, parseAsString.withOptions({
		history,
		limitUrlUpdates: {
			method: "throttle",
			timeMs: throttleMs
		},
		clearOnDefault
	}));
	const value = raw ?? "";
	const lastAppliedRef = useRef(null);
	const hasObservedRef = useRef(false);
	useEffect(() => {
		if (value === lastAppliedRef.current) return;
		if (value === "" && !hasObservedRef.current) {
			hasObservedRef.current = true;
			lastAppliedRef.current = "";
			return;
		}
		hasObservedRef.current = true;
		lastAppliedRef.current = value;
		if (value === "") {
			table.setComputedColumns([]);
			table.setPredicate(null);
			table.setSort([]);
			return;
		}
		const r = parseQuery(value, table.getBaseColumns());
		if (r.ok) {
			table.setComputedColumns(r.value.computed ?? []);
			table.setPredicate(r.value.predicate);
			table.setSort(r.value.sort);
		}
	}, [table, value]);
	return {
		value,
		setValue: useCallback((next) => {
			setRaw(next === "" && clearOnDefault ? null : next);
		}, [setRaw, clearOnDefault])
	};
}
//#endregion
export { CheckboxCell, ColumnHeader, ColumnVisibilityMenu, CommandLineInput, DataChart, DataTable, EditableCell, ExportMenu, FilterBar, FilterChip, GroupingDropdown, ImageCell, LinkCell, MultiHeader, OperatorPopover, ProgressCell, RelationBadgeCell, SortPopover, SparklineCell, StarCell, StatusBar, SubDataTable, TableLocaleProvider, TagsCell, Toolbar, UserCell, useExpandedRows, useT, useTable, useTableLocale, useTableUrlState };

//# sourceMappingURL=index.js.map