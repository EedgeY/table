# CLI クエリ DSL リファレンス

`@tarbo-table/core/query` の `parseQuery` / `stringifyQuery` が扱う文字列 DSL の完全文法。`<CommandLineInput />` と `useTableUrlState` の URL 同期で使われる。

---

## 全体構造

```
<query> ::= <let-clause>* <predicate>? <sort>? <chart>?
```

各セクションは省略可能。区切りは空白。`let` 句（計算列）は先頭に置きます。

例:

```
let total = amount * quantity; total>=50000 dept="eng" by -total, name chart bar by dept sum:total
└──────── computed ────────┘ └────── predicate ──────┘ └── sort ──┘ └──────── chart ────────┘
```

---

## computed columns（`let` 句）

`let <name> = <expr>;` を先頭に並べると、行ごとに評価される計算列を定義できます。定義した名前は通常の列とまったく同じに扱われ、後続の predicate / sort / chart から参照でき、描画・CSV/TSV エクスポート・URL 復元にも乗ります。

```
let total = amount * quantity; let tax = round(total * 0.1, 2); tax > 1000 by -total
```

- 各 `let` は `;` で区切る（末尾の `;` は任意）。
- 式は **`eval` を使わない専用サンドボックス**で評価されます（任意の JS は実行されません）。文法外の入力は安全にパースエラーになります。
- 後続の `let` は**それ以前**に定義した計算列を参照できます（上の `tax` は `total` を参照）。前方参照・自己参照・既存列との名前衝突はパースエラーです。

### 式の演算子

優先度は高い順（スプレッドシート方式）:

| 優先度 | 演算子           | 結合性     | 意味                                       |
| ------ | ---------------- | ---------- | ------------------------------------------ |
| 1      | 単項 `-`         | 右         | 符号反転                                   |
| 2      | `*` `/`          | 左         | 乗算・除算（ゼロ除算は `null`）            |
| 3      | `+` `-`          | 左         | 加算・減算（**数値専用**）                 |
| 4      | `= != > < >= <=` | **非結合** | 比較。結果は boolean。`a < b < c` はエラー |

- 各オペランドは数値へ強制されます（数値文字列・真偽値も可）。いずれかが `null` / 空 / 非数値なら算術結果は `null`（null 伝播）。
- 比較は IEEE-754 の表現誤差を均した値で行うため `0.1 + 0.2 = 0.3` は `true`。順序比較に `null` が絡むと `false`。`=` / `!=` は両辺が数値なら数値比較、そうでなければ文字列比較（case-sensitive）で、`null` は `null` とだけ等しい。
- 文字列リテラルはダブルクォート（`"high"`）。クォートした名前が既存列に一致すれば列参照、しなければ文字列リテラルになります。

### 関数

| 関数                      | 引数         | 説明                                                      |
| ------------------------- | ------------ | --------------------------------------------------------- |
| `IF(cond, then, else)`    | 3            | `cond` が真なら `then`、偽なら `else`。**採る側だけ評価** |
| `round(value [, places])` | 1–2          | 四捨五入（0 から離れる方向）。`places` 既定 0・負値可     |
| `abs` `floor` `ceil`      | 1            | 絶対値 / 切り捨て / 切り上げ                              |
| `min(a, …)` `max(a, …)`   | 1+（可変長） | 最小 / 最大（`null` は無視、全 `null` は `null`）         |
| `coalesce(a, …)`          | 1+（可変長） | 最初の非 `null` 値をそのまま返す                          |

関数名は case-insensitive（`IF` / `if` どちらでも可）。未知の関数・引数個数の不一致はパースエラーです。

`IF` の条件の真偽は: `false` / `0`（誤差を均した後の `0` を含む）/ `""` / `null` / `NaN` が偽、それ以外は真。`IF` は採られない分岐を評価しないので `IF(qty = 0, 0, total / qty)` はゼロ除算を踏みません。

例:

```
let total = amount * quantity            数値計算列（amount か quantity が空なら null）
let tax   = round(total * 0.1, 2)        前の total を参照したマネタリ丸め
let band  = IF(salary >= 50000, "高", "低")   条件による文字列列
let net   = IF(qty = 0, 0, round(total / qty, 2))   遅延分岐で除算回避
```

> 完全な型強制・truthiness・cleanup の仕様は [computed-columns-grammar.md](computed-columns-grammar.md) を参照。`&` 連結や `lower`/`upper` などの文字列関数は別スライスで追加予定です。

---

## predicate（フィルタ条件）

### 比較演算子

| 演算子 | 意味       | 例                 |
| ------ | ---------- | ------------------ |
| `=`    | 等しい     | `dept=eng`         |
| `!=`   | 等しくない | `status!=archived` |
| `>`    | より大きい | `salary>50000`     |
| `<`    | より小さい | `age<30`           |
| `>=`   | 以上       | `salary>=70000`    |
| `<=`   | 以下       | `score<=100`       |

数値リテラルは自動判定（`50000`）。文字列はクォートか裸の単語。

### パターンマッチ

| 演算子 | 意味                    | 例            |
| ------ | ----------------------- | ------------- |
| `~`    | like (case-sensitive)   | `name~"田中"` |
| `~i`   | like (case-insensitive) | `name~i"abc"` |
| `~^`   | starts with             | `name~^"田"`  |
| `~$`   | ends with               | `name~$"郎"`  |

### NULL 判定

| 構文              | 意味          |
| ----------------- | ------------- |
| `col is null`     | NULL 判定     |
| `col is not null` | NOT NULL 判定 |

例:

```
manager_id is null
email is not null
```

### IN リスト

```
dept in(eng, sales, marketing)
age in(20, 30, 40)
```

### 暗黙 AND（空白区切り）

```
salary>=50000 dept=eng
```

→ `salary >= 50000 AND dept = 'eng'`

### OR

```
dept=eng or dept=sales
dept=eng | dept=sales
```

`or` キーワードまたは `|` 記号。

### 否定 (NOT)

```
not (dept=archived)
not name~"test"
```

### グループ化

```
(dept=eng or dept=sales) salary>=60000
```

`( ... )` で優先順位を明示。

### 演算子優先度

高い順:

1. `( ... )`（グループ化）
2. `not`
3. 暗黙 AND（空白）
4. `or` / `|`

```
A B or C
≡ (A AND B) OR C

A or B C
≡ A OR (B AND C)

not A or B
≡ (NOT A) OR B
```

### 列名のクォート

スペース・特殊文字を含む列名はダブルクォートで囲みます。

```
"first name"="Alice"
"商品 ID">=100
```

### 値のクォート

文字列値はダブルクォート推奨（特に空白・記号を含む場合）。

```
city="New York"
name~"田中 太郎"
```

裸の英数字単語はそのまま書ける:

```
dept=eng
status=active
```

ダブルクォート内で `\"` でエスケープ。

### case-insensitive 比較

`like` 系は `~i` で case-insensitive。それ以外の演算子は既定 case-sensitive。

```
email~i"@example.com"
```

---

## sort（ソート指定）

```
by <col1>, -<col2>, +<col3>
```

| 接頭辞   | 意味              |
| -------- | ----------------- |
| 何もなし | 昇順（asc）       |
| `+`      | 昇順（asc、明示） |
| `-`      | 降順（desc）      |

複数列はカンマ区切り。

例:

```
by dept, -salary
by -created_at
by +rank, name
```

---

## chart（チャート指定）

```
chart <type> by <groupBy> <fn>:<col>[, <fn>:<col>...]
```

| `type`   | 説明                        |
| -------- | --------------------------- |
| `bar`    | 棒グラフ                    |
| `line`   | 折れ線                      |
| `pie`    | 円グラフ                    |
| `combo`  | 棒 + 折れ線                 |
| `bubble` | バブル (x, y, size の 3 軸) |

`<fn>` は集約関数: `sum` / `avg` / `min` / `max` / `count` / `median` / `p95` / `stddev`。

例:

```
chart bar by dept sum:salary
chart pie by status count:id
chart combo by month sum:revenue, avg:price
chart bubble by region sum:sales, avg:rating, count:customers
```

`<CommandLineInput onChartConfig={setChart} />` で `setChart` に `ChartConfig` が渡されます。

---

## 完全な例

```
salary>=50000 (dept=eng or dept=sales) name~i"田" by -salary, name chart bar by dept sum:salary
```

意味:

- フィルタ: `salary >= 50000 AND (dept = 'eng' OR dept = 'sales') AND name like '田' (ci)`
- ソート: `salary DESC, name ASC`
- チャート: 部署別の給与合計を棒グラフで

---

## エスケープ・特殊文字

| 文字                 | 扱い                                                 |
| -------------------- | ---------------------------------------------------- |
| 空白                 | トークン区切り                                       |
| `( ) , : =` 系       | 文法記号                                             |
| `"` 内の文字         | エスケープ `\"` を除いてそのまま                     |
| 数字のみの裸トークン | `number` として解釈（`salary=50000` → 50000 は数値） |

---

## ラウンドトリップ: stringify と parse

```ts
import { parseQuery, stringifyQuery } from '@tarbo-table/core/query';

const original = 'salary>=50000 dept=eng by -salary';
const parsed = parseQuery(original, columns);
if (!parsed.ok) throw new Error(parsed.error.message);

const restored = stringifyQuery({
	computed: parsed.value.computed,
	predicate: parsed.value.predicate,
	sort: parsed.value.sort,
});
// restored は original と意味的に等価（空白・括弧の位置は正規化される）
```

`stringifyQuery` は `parseQuery` の逆変換になっており、URL 永続化やコマンドバーの状態復元に使えます。`let` 計算列（`IF` / 比較 / 関数を含む）も定義順を保って round-trip します。

### 部分 stringify

| 関数                                  | 戻り値                                        |
| ------------------------------------- | --------------------------------------------- |
| `stringifyPredicate(p)`               | predicate のみの DSL 文字列（`null` は `''`） |
| `stringifySort(spec)`                 | `"by col1, -col2"` 形式（空配列は `''`）      |
| `stringifyQuery({ predicate, sort })` | 全体の DSL 文字列                             |

> `chart` の stringify は現状未実装です。`onChartConfig` の値は呼び出し元で保持する必要があります。

---

## エラーハンドリング

```ts
const result = parseQuery(input, columns);
if (!result.ok) {
	console.error(result.error.message); // 'unknown column "xxx"'
	console.error(result.error.position); // 14 (文字オフセット)
	console.error(result.error.token); // 'xxx'
}
```

`position` は文字オフセット（0-indexed）。UI 側で `^` インジケータの位置決めに使えます。

### よくあるエラー

| メッセージ                 | 原因                         |
| -------------------------- | ---------------------------- |
| `unknown column "xxx"`     | `columns` に存在しない列 ID  |
| `unexpected token`         | 文法エラー（記号の欠落など） |
| `expected value after '='` | 演算子の右辺が空             |
| `unterminated string`      | 閉じクォートなし             |

---

## 補完カテゴリ（`<CommandLineInput />` 用）

`<CommandLineInput />` の補完エンジンは入力カーソル位置に応じて以下のカテゴリの候補を出します:

| カテゴリ        | 例                                                             |
| --------------- | -------------------------------------------------------------- |
| `column`        | 列 ID 一覧（先頭または connective 後）                         |
| `operator`      | `=`, `!=`, `>=`, `~`, `is null` ...                            |
| `connective`    | `or`, `\|`, スペース                                           |
| `sort`          | `by`, `,`, `-`, `+`                                            |
| `chart-type`    | `bar`, `line`, `pie`, `combo`, `bubble`                        |
| `chart-keyword` | `chart`, `by`                                                  |
| `aggregate-fn`  | `sum`, `avg`, `min`, `max`, `count`, `median`, `p95`, `stddev` |
| `value`         | （未実装、将来対応予定）                                       |
| `template`      | よく使うクエリスニペット                                       |

---

## 関連ドキュメント

- [core API: `parseQuery` / `stringifyQuery`](./api/core.md#クエリ-dsl-parsequery--stringifyquery)
- [UI: `<CommandLineInput />`](./api/ui.md#commandlineinput)
- [UI: `useTableUrlState`](./api/ui.md#usetableurlstate)
