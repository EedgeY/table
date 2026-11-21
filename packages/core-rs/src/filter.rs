use crate::column::{BoolColumn, Cell, Column, StrColumn, STR_NULL};
use crate::table::Table;
use crate::utils::coerce_number_str;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Op {
    Eq = 0,
    Ne = 1,
    Gt = 2,
    Lt = 3,
    Ge = 4,
    Le = 5,
    Like = 6,
    StartsWith = 7,
    EndsWith = 8,
    IsNull = 9,
    IsNotNull = 10,
    In = 11,
}

impl Op {
    pub fn from_tag(t: u8) -> Option<Self> {
        Some(match t {
            0 => Op::Eq,
            1 => Op::Ne,
            2 => Op::Gt,
            3 => Op::Lt,
            4 => Op::Ge,
            5 => Op::Le,
            6 => Op::Like,
            7 => Op::StartsWith,
            8 => Op::EndsWith,
            9 => Op::IsNull,
            10 => Op::IsNotNull,
            11 => Op::In,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Combinator {
    And,
    Or,
}

#[derive(Debug, Clone)]
pub enum Value {
    Null,
    Number(f64),
    String(String),
    Boolean(bool),
    List(Vec<Value>),
}

#[derive(Debug, Clone)]
pub struct Leaf {
    pub column_id: String,
    pub op: Op,
    pub value: Value,
    pub case_sensitive: bool,
}

#[derive(Debug, Clone)]
pub struct Group {
    pub combinator: Combinator,
    pub negate: bool,
    pub children: Vec<Predicate>,
}

#[derive(Debug, Clone)]
pub enum Predicate {
    Leaf(Leaf),
    Group(Group),
}

#[derive(Debug, Clone)]
pub enum CompiledLeaf {
    NumEq(usize, f64),
    NumNe(usize, f64),
    NumGt(usize, f64),
    NumLt(usize, f64),
    NumGe(usize, f64),
    NumLe(usize, f64),
    NumIn(usize, Vec<f64>),

    StrEq {
        col: usize,
        code: Option<u32>,
        negate: bool,
        case_sensitive: bool,
    },
    StrMatch {
        col: usize,
        table: Vec<bool>,
    },
    StrCmp {
        col: usize,
        op: Op,
        lower_target: String,
        case_sensitive: bool,
    },

    BoolEq(usize, bool),
    BoolNe(usize, bool),

    IsNull(usize),
    IsNotNull(usize),

    Const(bool),
}

#[derive(Debug, Clone)]
pub enum CompiledGroup {
    Group {
        combinator: Combinator,
        negate: bool,
        children: Vec<CompiledPredicate>,
    },
}

#[derive(Debug, Clone)]
pub enum CompiledPredicate {
    Leaf(CompiledLeaf),
    Group(CompiledGroup),
}

pub fn compile_predicate(p: &Predicate, table: &Table) -> CompiledPredicate {
    match p {
        Predicate::Group(g) => CompiledPredicate::Group(CompiledGroup::Group {
            combinator: g.combinator,
            negate: g.negate,
            children: g
                .children
                .iter()
                .map(|c| compile_predicate(c, table))
                .collect(),
        }),
        Predicate::Leaf(l) => CompiledPredicate::Leaf(compile_leaf(l, table)),
    }
}

fn compile_leaf(l: &Leaf, table: &Table) -> CompiledLeaf {
    let Some(col_idx) = table.column_index(&l.column_id) else {
        return match l.op {
            Op::IsNull => CompiledLeaf::Const(true),
            Op::IsNotNull => CompiledLeaf::Const(false),
            _ => CompiledLeaf::Const(false),
        };
    };
    let col = table.column(col_idx);

    if matches!(l.op, Op::IsNull) {
        return CompiledLeaf::IsNull(col_idx);
    }
    if matches!(l.op, Op::IsNotNull) {
        return CompiledLeaf::IsNotNull(col_idx);
    }

    match col {
        Column::Num(_) => compile_num_leaf(col_idx, &l.op, &l.value),
        Column::Str(s) => compile_str_leaf(col_idx, s, l),
        Column::Bool(_) => compile_bool_leaf(col_idx, &l.op, &l.value),
    }
}

fn value_to_number(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) if n.is_finite() => Some(*n),
        Value::Boolean(b) => Some(if *b { 1.0 } else { 0.0 }),
        Value::String(s) => coerce_number_str(s),
        _ => None,
    }
}

fn compile_num_leaf(col: usize, op: &Op, value: &Value) -> CompiledLeaf {
    if let Op::In = op {
        let Value::List(items) = value else {
            return CompiledLeaf::Const(false);
        };
        let mut set: Vec<f64> = Vec::with_capacity(items.len());
        for it in items {
            if let Some(n) = value_to_number(it) {
                set.push(n);
            }
        }
        return CompiledLeaf::NumIn(col, set);
    }
    let n = match value_to_number(value) {
        Some(n) => n,
        None => return CompiledLeaf::Const(false),
    };
    match op {
        Op::Eq => CompiledLeaf::NumEq(col, n),
        Op::Ne => CompiledLeaf::NumNe(col, n),
        Op::Gt => CompiledLeaf::NumGt(col, n),
        Op::Lt => CompiledLeaf::NumLt(col, n),
        Op::Ge => CompiledLeaf::NumGe(col, n),
        Op::Le => CompiledLeaf::NumLe(col, n),
        Op::Like | Op::StartsWith | Op::EndsWith => CompiledLeaf::StrCmp {
            col,
            op: *op,
            lower_target: match value {
                Value::String(s) => s.to_lowercase(),
                Value::Number(n) => n.to_string(),
                Value::Boolean(b) => b.to_string(),
                _ => String::new(),
            },
            case_sensitive: false,
        },
        _ => CompiledLeaf::Const(false),
    }
}

fn compile_str_leaf(col: usize, s: &StrColumn, l: &Leaf) -> CompiledLeaf {
    let case_sensitive = l.case_sensitive;

    if let Op::In = l.op {
        let Value::List(items) = &l.value else {
            return CompiledLeaf::Const(false);
        };
        let mut table = vec![false; s.dict.len()];
        for it in items {
            let needle_lower = match it {
                Value::String(s) => s.to_lowercase(),
                Value::Number(n) => n.to_string().to_lowercase(),
                Value::Boolean(b) => b.to_string().to_lowercase(),
                _ => continue,
            };
            for (i, low) in s.dict_lower.iter().enumerate() {
                if *low == needle_lower {
                    table[i] = true;
                }
            }
        }
        return CompiledLeaf::StrMatch { col, table };
    }

    match l.op {
        Op::Eq | Op::Ne => {
            let target_lower = match &l.value {
                Value::String(s) => s.to_lowercase(),
                Value::Number(n) => n.to_string(),
                Value::Boolean(b) => b.to_string(),
                _ => return CompiledLeaf::Const(matches!(l.op, Op::Ne)),
            };
            let code = if case_sensitive {
                let target_orig = match &l.value {
                    Value::String(s) => s.clone(),
                    Value::Number(n) => n.to_string(),
                    Value::Boolean(b) => b.to_string(),
                    _ => return CompiledLeaf::Const(matches!(l.op, Op::Ne)),
                };
                s.dict
                    .iter()
                    .position(|d| *d == target_orig)
                    .map(|i| i as u32)
            } else {
                s.dict_lower
                    .iter()
                    .position(|d| *d == target_lower)
                    .map(|i| i as u32)
            };
            CompiledLeaf::StrEq {
                col,
                code,
                negate: matches!(l.op, Op::Ne),
                case_sensitive,
            }
        }
        Op::Like | Op::StartsWith | Op::EndsWith => {
            let target = match &l.value {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                Value::Boolean(b) => b.to_string(),
                _ => String::new(),
            };
            let needle = if case_sensitive {
                target.clone()
            } else {
                target.to_lowercase()
            };
            let dict = if case_sensitive {
                &s.dict
            } else {
                &s.dict_lower
            };
            let mut table = vec![false; s.dict.len()];
            for (i, d) in dict.iter().enumerate() {
                let hit = match l.op {
                    Op::Like => d.contains(&needle),
                    Op::StartsWith => d.starts_with(&needle),
                    Op::EndsWith => d.ends_with(&needle),
                    _ => unreachable!(),
                };
                if hit {
                    table[i] = true;
                }
            }
            CompiledLeaf::StrMatch { col, table }
        }
        Op::Gt | Op::Lt | Op::Ge | Op::Le => CompiledLeaf::StrCmp {
            col,
            op: l.op,
            lower_target: match &l.value {
                Value::String(s) => s.to_lowercase(),
                Value::Number(n) => n.to_string(),
                Value::Boolean(b) => b.to_string(),
                _ => String::new(),
            },
            case_sensitive,
        },
        _ => CompiledLeaf::Const(false),
    }
}

fn compile_bool_leaf(col: usize, op: &Op, value: &Value) -> CompiledLeaf {
    let b = match value {
        Value::Boolean(b) => *b,
        Value::Number(n) => *n != 0.0,
        Value::String(s) => match s.as_str() {
            "true" | "1" => true,
            "false" | "0" => false,
            _ => return CompiledLeaf::Const(false),
        },
        _ => return CompiledLeaf::Const(false),
    };
    match op {
        Op::Eq => CompiledLeaf::BoolEq(col, b),
        Op::Ne => CompiledLeaf::BoolNe(col, b),
        _ => CompiledLeaf::Const(false),
    }
}

#[inline]
fn eval_leaf(leaf: &CompiledLeaf, columns: &[Column], row: usize) -> bool {
    match leaf {
        CompiledLeaf::Const(b) => *b,
        CompiledLeaf::IsNull(c) => columns[*c].is_null(row),
        CompiledLeaf::IsNotNull(c) => !columns[*c].is_null(row),

        CompiledLeaf::NumEq(c, t) => num_get(&columns[*c], row).is_some_and(|v| v == *t),
        CompiledLeaf::NumNe(c, t) => num_get(&columns[*c], row).is_some_and(|v| v != *t),
        CompiledLeaf::NumGt(c, t) => num_get(&columns[*c], row).is_some_and(|v| v > *t),
        CompiledLeaf::NumLt(c, t) => num_get(&columns[*c], row).is_some_and(|v| v < *t),
        CompiledLeaf::NumGe(c, t) => num_get(&columns[*c], row).is_some_and(|v| v >= *t),
        CompiledLeaf::NumLe(c, t) => num_get(&columns[*c], row).is_some_and(|v| v <= *t),
        CompiledLeaf::NumIn(c, set) => match num_get(&columns[*c], row) {
            Some(v) => set.contains(&v),
            None => false,
        },

        CompiledLeaf::StrEq {
            col,
            code,
            negate,
            case_sensitive: _,
        } => {
            let s = str_col(&columns[*col]);
            let row_code = s.codes[row];
            if row_code == STR_NULL {
                return false;
            }
            let eq = match code {
                Some(c) => row_code == *c,
                None => false,
            };
            if *negate {
                !eq
            } else {
                eq
            }
        }
        CompiledLeaf::StrMatch { col, table } => {
            let s = str_col(&columns[*col]);
            let row_code = s.codes[row];
            if row_code == STR_NULL {
                return false;
            }
            *table.get(row_code as usize).unwrap_or(&false)
        }
        CompiledLeaf::StrCmp {
            col,
            op,
            lower_target,
            case_sensitive,
        } => {
            let col_ref = &columns[*col];
            let cell = Cell::from_column(col_ref, row);
            let row_str_owned: Option<String> = match cell {
                Cell::Null => return false,
                Cell::Num(n) => Some(n.to_string()),
                Cell::Str(s) => Some(if *case_sensitive {
                    s.to_string()
                } else {
                    s.to_lowercase()
                }),
                Cell::Bool(b) => Some(b.to_string()),
            };
            let sa = row_str_owned.unwrap();
            let sb = lower_target;
            match op {
                Op::Gt => sa.as_str() > sb.as_str(),
                Op::Lt => sa.as_str() < sb.as_str(),
                Op::Ge => sa.as_str() >= sb.as_str(),
                Op::Le => sa.as_str() <= sb.as_str(),
                _ => false,
            }
        }

        CompiledLeaf::BoolEq(c, t) => bool_col(&columns[*c]).get(row) == Some(*t),
        CompiledLeaf::BoolNe(c, t) => match bool_col(&columns[*c]).get(row) {
            Some(b) => b != *t,
            None => false,
        },
    }
}

#[inline]
fn num_get(col: &Column, row: usize) -> Option<f64> {
    match col {
        Column::Num(n) => n.get(row),
        _ => None,
    }
}

#[inline]
fn str_col(col: &Column) -> &StrColumn {
    match col {
        Column::Str(s) => s,
        _ => unreachable!("str op compiled against non-string column"),
    }
}

#[inline]
fn bool_col(col: &Column) -> &BoolColumn {
    match col {
        Column::Bool(b) => b,
        _ => unreachable!("bool op compiled against non-bool column"),
    }
}

#[inline]
fn eval_node(node: &CompiledPredicate, columns: &[Column], row: usize) -> bool {
    match node {
        CompiledPredicate::Leaf(l) => eval_leaf(l, columns, row),
        CompiledPredicate::Group(CompiledGroup::Group {
            combinator,
            negate,
            children,
        }) => {
            let ok = match combinator {
                Combinator::And => children.iter().all(|c| eval_node(c, columns, row)),
                Combinator::Or => children.iter().any(|c| eval_node(c, columns, row)),
            };
            if *negate {
                !ok
            } else {
                ok
            }
        }
    }
}

pub fn filter_indices(table: &Table, compiled: Option<&CompiledPredicate>) -> Vec<u32> {
    let n = table.n_rows();
    let columns = table.columns_slice();
    match compiled {
        None => (0..n as u32).collect(),
        Some(node) => {
            let mut out = Vec::with_capacity(n);
            for i in 0..n {
                if eval_node(node, columns, i) {
                    out.push(i as u32);
                }
            }
            out
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::column::{Column, NumColumn, StrColumn};
    use crate::table::Table;

    fn fixture() -> Table {
        let mut id = NumColumn::with_capacity(4);
        for v in [1.0, 2.0, 3.0, 4.0] {
            id.push(Some(v));
        }
        let mut name = StrColumn::new();
        for v in ["Tanaka", "Yamada", "tan", "TANG"] {
            name.push(Some(v));
        }
        let mut salary = NumColumn::with_capacity(4);
        salary.push(Some(50000.0));
        salary.push(Some(100000.0));
        salary.push(None);
        salary.push(Some(75000.0));

        let mut t = Table::new();
        t.add_column("id".into(), Column::Num(id));
        t.add_column("name".into(), Column::Str(name));
        t.add_column("salary".into(), Column::Num(salary));
        t.finalize();
        t
    }

    fn run(t: &Table, p: Predicate) -> Vec<u32> {
        let c = compile_predicate(&p, t);
        filter_indices(t, Some(&c))
    }

    #[test]
    fn null_predicate_keeps_all() {
        let t = fixture();
        assert_eq!(filter_indices(&t, None), vec![0, 1, 2, 3]);
    }

    #[test]
    fn leaf_eq_on_numeric() {
        let t = fixture();
        let p = Predicate::Leaf(Leaf {
            column_id: "id".into(),
            op: Op::Eq,
            value: Value::Number(2.0),
            case_sensitive: false,
        });
        assert_eq!(run(&t, p), vec![1]);
    }

    #[test]
    fn leaf_like_case_insensitive_by_default() {
        let t = fixture();
        let p = Predicate::Leaf(Leaf {
            column_id: "name".into(),
            op: Op::Like,
            value: Value::String("tan".into()),
            case_sensitive: false,
        });
        assert_eq!(run(&t, p), vec![0, 2, 3]);
    }

    #[test]
    fn leaf_is_null_on_nullable_numeric() {
        let t = fixture();
        let p = Predicate::Leaf(Leaf {
            column_id: "salary".into(),
            op: Op::IsNull,
            value: Value::Null,
            case_sensitive: false,
        });
        assert_eq!(run(&t, p), vec![2]);
    }

    #[test]
    fn or_and_combines_correctly() {
        let t = fixture();
        let inner_and = Predicate::Group(Group {
            combinator: Combinator::And,
            negate: false,
            children: vec![
                Predicate::Leaf(Leaf {
                    column_id: "id".into(),
                    op: Op::Gt,
                    value: Value::Number(10.0),
                    case_sensitive: false,
                }),
                Predicate::Leaf(Leaf {
                    column_id: "name".into(),
                    op: Op::Like,
                    value: Value::String("tan".into()),
                    case_sensitive: false,
                }),
            ],
        });
        let or = Predicate::Group(Group {
            combinator: Combinator::Or,
            negate: false,
            children: vec![
                inner_and,
                Predicate::Leaf(Leaf {
                    column_id: "salary".into(),
                    op: Op::Ge,
                    value: Value::Number(100000.0),
                    case_sensitive: false,
                }),
            ],
        });
        assert_eq!(run(&t, or), vec![1]);
    }

    #[test]
    fn in_mixed_set() {
        let t = fixture();
        let p = Predicate::Leaf(Leaf {
            column_id: "id".into(),
            op: Op::In,
            value: Value::List(vec![Value::Number(1.0), Value::Number(3.0)]),
            case_sensitive: false,
        });
        assert_eq!(run(&t, p), vec![0, 2]);
    }

    #[test]
    fn not_group_inverts() {
        let t = fixture();
        let p = Predicate::Group(Group {
            combinator: Combinator::And,
            negate: true,
            children: vec![Predicate::Leaf(Leaf {
                column_id: "id".into(),
                op: Op::Lt,
                value: Value::Number(3.0),
                case_sensitive: false,
            })],
        });
        assert_eq!(run(&t, p), vec![2, 3]);
    }
}
