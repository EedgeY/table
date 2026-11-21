import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type LocaleId = 'ja' | 'en' | string;

export type LocaleMessages = Readonly<{
	'toolbar.sort': string;
	'toolbar.columns': string;
	'toolbar.export': string;
	'toolbar.groupBy': string;
	'toolbar.refresh': string;
	'toolbar.insert': string;
	'filter.addFilter': string;
	'filter.placeholder': string;
	'filter.advancedHint': string;
	'status.page': string;
	'status.of': string;
	'status.records': string;
	'status.selected': string;
	'status.allOption': string;
	'status.rowsSuffix': string;
	'export.label': string;
	'editable.saving': string;
	'editable.dismissError': string;
	'editable.save': string;
	'editable.cancel': string;
	'server.loading': string;
	'server.empty': string;
	'server.retry': string;
	'group.noneKey': string;
	'group.count': string;
}>;

const JA: LocaleMessages = Object.freeze({
	'toolbar.sort': 'ソート',
	'toolbar.columns': '列',
	'toolbar.export': 'エクスポート',
	'toolbar.groupBy': 'グループ化',
	'toolbar.refresh': '再読込',
	'toolbar.insert': '追加',
	'filter.addFilter': 'フィルタを追加',
	'filter.placeholder': 'id, 名前, ロールで絞り込み... または右のメニューから →',
	'filter.advancedHint': '複雑なフィルタ条件 (OR / NOT / ネスト) は CLI モードで編集してください。',
	'status.page': 'ページ',
	'status.of': '/',
	'status.records': '件',
	'status.selected': '選択中',
	'status.allOption': '全件',
	'status.rowsSuffix': '行',
	'export.label': '形式を選択 (UTF-8 BOM)',
	'editable.saving': '保存中',
	'editable.dismissError': 'エラーを閉じる',
	'editable.save': '保存',
	'editable.cancel': '取消',
	'server.loading': 'データを読み込んでいます…',
	'server.empty': 'データがありません',
	'server.retry': '再試行',
	'group.noneKey': '(なし)',
	'group.count': '件',
});

const EN: LocaleMessages = Object.freeze({
	'toolbar.sort': 'Sort',
	'toolbar.columns': 'Columns',
	'toolbar.export': 'Export',
	'toolbar.groupBy': 'Group by',
	'toolbar.refresh': 'Refresh',
	'toolbar.insert': 'Insert',
	'filter.addFilter': 'Add filter',
	'filter.placeholder': 'Filter by id, name, role... or use the menu →',
	'filter.advancedHint': 'Complex filters (OR / NOT / nested) can be edited in CLI mode.',
	'status.page': 'Page',
	'status.of': 'of',
	'status.records': 'records',
	'status.selected': 'selected',
	'status.allOption': 'All',
	'status.rowsSuffix': 'rows',
	'export.label': 'Select format (UTF-8 BOM)',
	'editable.saving': 'Saving',
	'editable.dismissError': 'Dismiss error',
	'editable.save': 'Save',
	'editable.cancel': 'Cancel',
	'server.loading': 'Loading data…',
	'server.empty': 'No data',
	'server.retry': 'Retry',
	'group.noneKey': '(none)',
	'group.count': 'rows',
});

const BUILTIN: Readonly<Record<string, LocaleMessages>> = Object.freeze({ ja: JA, en: EN });

export type TableLocale = {
	readonly locale: LocaleId;
	readonly messages: LocaleMessages;
	readonly numberFormat: Intl.NumberFormat;
	readonly dateTimeFormat: Intl.DateTimeFormat;
	readonly currencyFormat: Intl.NumberFormat;
};

const _defaultLocale: TableLocale = {
	locale: 'ja',
	messages: JA,
	numberFormat: new Intl.NumberFormat('ja-JP'),
	dateTimeFormat: new Intl.DateTimeFormat('ja-JP'),
	currencyFormat: new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }),
};

const LocaleContext = createContext<TableLocale>(_defaultLocale);

export type TableLocaleProviderProps = {
	readonly locale?: LocaleId;
	/** 全文言を部分上書き。 */
	readonly messages?: Partial<LocaleMessages>;
	readonly currency?: string;
	readonly children: ReactNode;
};

export function TableLocaleProvider(props: TableLocaleProviderProps): ReactNode {
	const id = props.locale ?? 'ja';
	const base = BUILTIN[id] ?? BUILTIN.ja!;
	const merged = useMemo<TableLocale>(() => {
		const messages = props.messages ? { ...base, ...props.messages } : base;
		return {
			locale: id,
			messages,
			numberFormat: new Intl.NumberFormat(id),
			dateTimeFormat: new Intl.DateTimeFormat(id),
			currencyFormat: new Intl.NumberFormat(id, {
				style: 'currency',
				currency: props.currency ?? (id === 'ja' ? 'JPY' : 'USD'),
			}),
		};
	}, [id, props.messages, props.currency, base]);
	return <LocaleContext.Provider value={merged}>{props.children}</LocaleContext.Provider>;
}

export function useTableLocale(): TableLocale {
	return useContext(LocaleContext);
}

export function useT(): (key: keyof LocaleMessages) => string {
	const { messages } = useTableLocale();
	return (key) => messages[key];
}
