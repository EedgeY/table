export type SortDir = 'asc' | 'desc';

export type SortKey<K extends string = string> = {
	readonly columnId: K;
	readonly dir: SortDir;
	readonly nulls?: 'first' | 'last';
};

export type SortSpec<K extends string = string> = ReadonlyArray<SortKey<K>>;
