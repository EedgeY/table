export type CellValue = string | number | boolean | null | undefined;

/**
 * 列の概念型。
 *
 * - 'string' | 'number' | 'boolean' は filter/sort/集計の基本型。
 * - 'image' | 'link' | 'sparkline' | 'checkbox' | 'relation' | 'relation-many' は
 *   セル描画上の表現型。accessor は引き続きプリミティブ（filter/sort のキー）を返し、
 *   装飾データは `ColumnDef.cellMeta` で別アクセサとして受け取る。
 */
export type ColumnType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'image'
	| 'link'
	| 'sparkline'
	| 'checkbox'
	| 'relation'
	| 'relation-many'
	| 'star'
	| 'tags'
	| 'progress'
	| 'user';

/** リレーション先のレコード参照。tableId は RelationSource.fetchByIds のキー。 */
export type RowRef = { readonly tableId: string; readonly rowId: string | number };

/** 多対多リレーションの 1 エントリ。 */
export type RelationRef = {
	readonly recordRef: RowRef;
	readonly label: string;
	readonly avatar?: string;
	readonly color?: string;
};

/**
 * セル描画用の装飾メタ。判別共用体。
 *
 * 設計指針: accessor が filter/sort/export 用のプリミティブを返す一方、
 * このメタは UI 層が画像 URL・スパークライン値配列・リレーション参照などを
 * 受け取るための副次チャネル。core 側の filter/sort ホットパスには影響しない。
 */
export type CellMeta =
	| {
			readonly kind: 'image';
			readonly src: string;
			readonly alt?: string;
			readonly blurhash?: string;
			readonly width?: number;
			readonly height?: number;
	  }
	| {
			readonly kind: 'link';
			readonly href: string;
			readonly label?: string;
			readonly external?: boolean;
	  }
	| {
			readonly kind: 'sparkline';
			readonly values: ReadonlyArray<number>;
			readonly color?: string;
			readonly baseline?: number;
	  }
	| {
			readonly kind: 'checkbox';
			readonly checked: boolean;
			readonly indeterminate?: boolean;
	  }
	| {
			readonly kind: 'relation';
			readonly recordRef: RowRef;
			readonly label: string;
			readonly avatar?: string;
			readonly color?: string;
	  }
	| {
			readonly kind: 'relation-many';
			readonly refs: ReadonlyArray<RelationRef>;
			readonly max?: number;
	  }
	| {
			readonly kind: 'star';
			/** 評価値 (0..max)。小数も可。 */
			readonly value: number;
			/** 最大星数。既定 5。 */
			readonly max?: number;
	  }
	| {
			readonly kind: 'tags';
			readonly tags: ReadonlyArray<{ readonly label: string; readonly color?: string }>;
			/** 並べる最大数。これを超えた分は `+N more` として畳む。 */
			readonly max?: number;
	  }
	| {
			readonly kind: 'progress';
			readonly value: number;
			readonly max?: number;
			readonly color?: string;
			/** ラベル表示モード。'percent' は %、'value' は raw 値、'none' は非表示。 */
			readonly label?: 'percent' | 'value' | 'none';
	  }
	| {
			readonly kind: 'user';
			readonly name: string;
			readonly email?: string;
			readonly avatar?: string;
			readonly color?: string;
	  };

/**
 * filter/sort のフォールバック挙動。
 * 'disabled' は当該列の filter/sort を完全にオフ。
 * 'on-label' はリレーション系で label 文字列を使う。
 * 'on-accessor' は accessor 返却値そのまま（デフォルト）。
 */
export type ColumnFilterFallback = 'disabled' | 'on-label' | 'on-accessor';
export type ColumnSortFallback = 'disabled' | 'on-label' | 'on-accessor';

export type ColumnDef<TRow, TKey extends string = string> = {
	readonly id: TKey;
	readonly accessor: (row: TRow) => CellValue;
	readonly type?: ColumnType;
	readonly header?: string;
	readonly defaultWidth?: number;
	readonly minWidth?: number;
	readonly maxWidth?: number;
	readonly sortable?: boolean;
	readonly filterable?: boolean;
	/** 初期表示状態。true なら最初から非表示。State 経由で動的に切替可能。 */
	readonly hidden?: boolean;
	/**
	 * セル描画用の装飾メタ。UI 層が optional に消費する。
	 * accessor とは独立しているため filter/sort には影響しない。
	 */
	readonly cellMeta?: (row: TRow) => CellMeta | null;
	/** type に応じた既定挙動を上書きしたい場合のみ指定。未指定なら defaultFilterableFor(type) が使われる。 */
	readonly filterFallback?: ColumnFilterFallback;
	readonly sortFallback?: ColumnSortFallback;
};

/**
 * type ごとの既定 filterable 値。
 * 明示的に `ColumnDef.filterable` が指定されていればそちらが優先。
 */
export function defaultFilterableFor(type: ColumnType | undefined): boolean {
	switch (type) {
		case 'image':
		case 'sparkline':
			return false;
		case 'string':
		case 'number':
		case 'boolean':
		case 'link':
		case 'checkbox':
		case 'relation':
		case 'relation-many':
		case 'star':
		case 'tags':
		case 'progress':
		case 'user':
		case undefined:
			return true;
	}
}

/**
 * type ごとの既定 sortable 値。
 * 明示的に `ColumnDef.sortable` が指定されていればそちらが優先。
 */
export function defaultSortableFor(type: ColumnType | undefined): boolean {
	switch (type) {
		case 'image':
			return false;
		case 'string':
		case 'number':
		case 'boolean':
		case 'link':
		case 'sparkline':
		case 'checkbox':
		case 'relation':
		case 'relation-many':
		case 'star':
		case 'tags':
		case 'progress':
		case 'user':
		case undefined:
			return true;
	}
}

export type ColumnSizingState = Readonly<Record<string, number>>;

/** 列ID → 可視性(true=表示) のマップ。未指定列は表示扱い。 */
export type ColumnVisibilityState = Readonly<Record<string, boolean>>;

export type ColumnPinning = 'left' | 'right';
export type ColumnPinningState = Readonly<Record<string, ColumnPinning>>;

/**
 * 葉ノード。`kind?: 'leaf'` は ColumnDef との後方互換のため optional。
 * 既存呼び出しは `kind` を持たないが、ColumnNode の判別共用体としては 'leaf' 扱いになる。
 */
export type ColumnLeaf<TRow, TKey extends string = string> = ColumnDef<TRow, TKey> & {
	readonly kind?: 'leaf';
};

/**
 * 列グループ。マルチレベルヘッダーの上段に表示される。
 * children には葉ノード or さらにネストしたグループを置ける。
 * グループ自体は accessor を持たない（値の参照は葉ノードが担う）。
 */
export type ColumnGroupDef<TRow, TKey extends string = string> = {
	readonly kind: 'group';
	readonly id: string;
	readonly header: string;
	readonly children: ReadonlyArray<ColumnNode<TRow, TKey>>;
};

/** 葉 or グループ。`createTable.columns` はこの再帰型を受け取る。 */
export type ColumnNode<TRow, TKey extends string = string> =
	| ColumnLeaf<TRow, TKey>
	| ColumnGroupDef<TRow, TKey>;

/** ノードが葉かどうかの type guard。 */
export function isColumnLeaf<TRow, TKey extends string>(
	node: ColumnNode<TRow, TKey>,
): node is ColumnLeaf<TRow, TKey> {
	return (node as ColumnGroupDef<TRow, TKey>).kind !== 'group';
}

/** ノードがグループかどうかの type guard。 */
export function isColumnGroup<TRow, TKey extends string>(
	node: ColumnNode<TRow, TKey>,
): node is ColumnGroupDef<TRow, TKey> {
	return (node as ColumnGroupDef<TRow, TKey>).kind === 'group';
}

/** ツリーから葉ノードのみを順序保ったまま抜き出す。pipeline はこの flat 配列を使う。 */
export function flattenColumns<TRow, TKey extends string = string>(
	nodes: ReadonlyArray<ColumnNode<TRow, TKey>>,
): ReadonlyArray<ColumnDef<TRow, TKey>> {
	const out: ColumnDef<TRow, TKey>[] = [];
	const stack: ColumnNode<TRow, TKey>[] = [...nodes];
	const walk = (n: ColumnNode<TRow, TKey>): void => {
		if (isColumnGroup(n)) {
			for (const c of n.children) {
				walk(c);
			}
		} else {
			const { kind: _kind, ...rest } = n;
			out.push(rest as ColumnDef<TRow, TKey>);
		}
	};
	for (const n of stack) {
		walk(n);
	}
	return out;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('flattenColumns', () => {
		it('flat な葉配列はそのまま返す', () => {
			const cols: ColumnNode<{ a: number }>[] = [
				{ id: 'a', accessor: (r) => r.a },
				{ id: 'b', accessor: () => 0 },
			];
			expect(flattenColumns(cols).map((c) => c.id)).toEqual(['a', 'b']);
		});

		it('1段ネストのグループを展開', () => {
			const cols: ColumnNode<{ a: number }>[] = [
				{ id: 'id', accessor: (r) => r.a },
				{
					kind: 'group',
					id: 'g',
					header: 'グループ',
					children: [
						{ id: 'g1', accessor: () => 1 },
						{ id: 'g2', accessor: () => 2 },
					],
				},
				{ id: 'tel', accessor: () => 'x' },
			];
			expect(flattenColumns(cols).map((c) => c.id)).toEqual(['id', 'g1', 'g2', 'tel']);
		});

		it('多段ネストも展開', () => {
			const cols: ColumnNode<unknown>[] = [
				{
					kind: 'group',
					id: 'A',
					header: 'A',
					children: [
						{ id: 'a1', accessor: () => 1 },
						{
							kind: 'group',
							id: 'B',
							header: 'B',
							children: [{ id: 'b1', accessor: () => 2 }],
						},
					],
				},
			];
			expect(flattenColumns(cols).map((c) => c.id)).toEqual(['a1', 'b1']);
		});
	});

	describe('isColumnLeaf / isColumnGroup', () => {
		it('kind 未指定は葉', () => {
			expect(isColumnLeaf({ id: 'a', accessor: () => 0 })).toBe(true);
		});
		it("kind 'leaf' は葉", () => {
			expect(isColumnLeaf({ kind: 'leaf', id: 'a', accessor: () => 0 })).toBe(true);
		});
		it("kind 'group' はグループ", () => {
			expect(isColumnGroup({ kind: 'group', id: 'g', header: 'G', children: [] })).toBe(true);
		});
	});

	describe('defaultFilterableFor / defaultSortableFor', () => {
		it('image はどちらも false', () => {
			expect(defaultFilterableFor('image')).toBe(false);
			expect(defaultSortableFor('image')).toBe(false);
		});
		it('sparkline は filter 不可・sort 可', () => {
			expect(defaultFilterableFor('sparkline')).toBe(false);
			expect(defaultSortableFor('sparkline')).toBe(true);
		});
		it('未指定・基本型・relation は両方 true', () => {
			for (const t of [
				undefined,
				'string',
				'number',
				'boolean',
				'link',
				'checkbox',
				'relation',
				'relation-many',
				'star',
				'tags',
				'progress',
				'user',
			] as const) {
				expect(defaultFilterableFor(t)).toBe(true);
				expect(defaultSortableFor(t)).toBe(true);
			}
		});
	});
}
