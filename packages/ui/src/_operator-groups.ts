import type { FilterOp } from '@tarbo-table/core';

export type OperatorItem = {
	readonly op: FilterOp;
	readonly label: string;
	readonly symbol: string;
};

export type OperatorGroup = {
	readonly label: string;
	readonly items: ReadonlyArray<OperatorItem>;
};

export const OPERATOR_GROUPS: ReadonlyArray<OperatorGroup> = Object.freeze([
	{
		label: 'COMPARISON',
		items: Object.freeze([
			{ op: '=' as const, label: 'Equals', symbol: '=' },
			{ op: '!=' as const, label: 'Not equal', symbol: '<>' },
			{ op: '>' as const, label: 'Greater than', symbol: '>' },
			{ op: '<' as const, label: 'Less than', symbol: '<' },
			{ op: '>=' as const, label: 'Greater or equal', symbol: '>=' },
			{ op: '<=' as const, label: 'Less or equal', symbol: '<=' },
		]),
	},
	{
		label: 'PATTERN MATCHING',
		items: Object.freeze([
			{ op: 'like' as const, label: 'Contains', symbol: '~' },
			{ op: 'startsWith' as const, label: 'Starts with', symbol: '~^' },
			{ op: 'endsWith' as const, label: 'Ends with', symbol: '~$' },
		]),
	},
	{
		label: 'EMPTY',
		items: Object.freeze([
			{ op: 'isNull' as const, label: 'Is null', symbol: 'ø' },
			{ op: 'isNotNull' as const, label: 'Is not null', symbol: '!ø' },
		]),
	},
]);

export const OP_SYMBOLS: Readonly<Record<FilterOp, string>> = Object.freeze({
	'=': '=',
	'!=': '<>',
	'>': '>',
	'<': '<',
	'>=': '>=',
	'<=': '<=',
	like: '~',
	startsWith: '~^',
	endsWith: '~$',
	isNull: 'ø',
	isNotNull: '!ø',
	in: 'in',
});
