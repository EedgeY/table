use std::cmp::Ordering;

use crate::column::{BoolColumn, Column, NumColumn, StrColumn};
use crate::table::Table;
use crate::utils::cmp_num;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortDir {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NullsOrder {
    First,
    Last,
}

#[derive(Debug, Clone)]
pub struct SortKey {
    pub column_id: String,
    pub dir: SortDir,
    pub nulls: NullsOrder,
}

pub type SortSpec = Vec<SortKey>;

#[derive(Debug, Clone, Copy)]
struct CompiledKey {
    col: usize,
    mult: i8,
    nulls_last: bool,
}

pub struct Comparator<'a> {
    columns: &'a [Column],
    keys: Vec<CompiledKey>,
}

pub fn build_comparator<'a>(table: &'a Table, spec: &SortSpec) -> Comparator<'a> {
    let mut keys: Vec<CompiledKey> = Vec::with_capacity(spec.len());
    for k in spec {
        let Some(col) = table.column_index(&k.column_id) else {
            continue;
        };
        keys.push(CompiledKey {
            col,
            mult: if matches!(k.dir, SortDir::Desc) {
                -1
            } else {
                1
            },
            nulls_last: matches!(k.nulls, NullsOrder::Last),
        });
    }
    Comparator {
        columns: table.columns_slice(),
        keys,
    }
}

impl<'a> Comparator<'a> {
    #[inline]
    fn cmp_pair(&self, a: usize, b: usize, k: CompiledKey) -> Ordering {
        let col = &self.columns[k.col];
        let raw = match col {
            Column::Num(n) => cmp_num_pair(n, a, b, k.nulls_last),
            Column::Str(s) => cmp_str_pair(s, a, b, k.nulls_last),
            Column::Bool(b_col) => cmp_bool_pair(b_col, a, b, k.nulls_last),
        };
        if k.mult == -1 {
            raw.reverse()
        } else {
            raw
        }
    }

    pub fn compare(&self, a: u32, b: u32) -> Ordering {
        let ai = a as usize;
        let bi = b as usize;
        for k in &self.keys {
            let c = self.cmp_pair(ai, bi, *k);
            if c != Ordering::Equal {
                return c;
            }
        }
        a.cmp(&b)
    }
}

#[inline]
fn cmp_num_pair(c: &NumColumn, a: usize, b: usize, nulls_last: bool) -> Ordering {
    let an = c.is_null(a);
    let bn = c.is_null(b);
    match (an, bn) {
        (true, true) => Ordering::Equal,
        (true, false) => {
            if nulls_last {
                Ordering::Greater
            } else {
                Ordering::Less
            }
        }
        (false, true) => {
            if nulls_last {
                Ordering::Less
            } else {
                Ordering::Greater
            }
        }
        (false, false) => cmp_num(c.values[a], c.values[b]),
    }
}

#[inline]
fn cmp_str_pair(c: &StrColumn, a: usize, b: usize, nulls_last: bool) -> Ordering {
    let ra = c.rank(a);
    let rb = c.rank(b);
    match (ra, rb) {
        (None, None) => Ordering::Equal,
        (None, _) => {
            if nulls_last {
                Ordering::Greater
            } else {
                Ordering::Less
            }
        }
        (_, None) => {
            if nulls_last {
                Ordering::Less
            } else {
                Ordering::Greater
            }
        }
        (Some(x), Some(y)) => x.cmp(&y),
    }
}

#[inline]
fn cmp_bool_pair(c: &BoolColumn, a: usize, b: usize, nulls_last: bool) -> Ordering {
    let va = c.get(a);
    let vb = c.get(b);
    match (va, vb) {
        (None, None) => Ordering::Equal,
        (None, _) => {
            if nulls_last {
                Ordering::Greater
            } else {
                Ordering::Less
            }
        }
        (_, None) => {
            if nulls_last {
                Ordering::Less
            } else {
                Ordering::Greater
            }
        }
        (Some(false), Some(true)) => Ordering::Less,
        (Some(true), Some(false)) => Ordering::Greater,
        _ => Ordering::Equal,
    }
}

pub fn sort_indices(indices: &mut [u32], cmp: &Comparator) {
    indices.sort_by(|a, b| cmp.compare(*a, *b));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::column::Column;
    use crate::column::NumColumn;
    use crate::column::StrColumn;

    fn fixture() -> Table {
        let mut id = NumColumn::with_capacity(5);
        for v in [1.0, 2.0, 3.0, 4.0, 5.0] {
            id.push(Some(v));
        }
        let mut dept = StrColumn::new();
        for v in ["eng", "sales", "eng", "eng", "sales"] {
            dept.push(Some(v));
        }
        let mut salary = NumColumn::with_capacity(5);
        for v in [100.0, 80.0, 120.0, 100.0, 90.0] {
            salary.push(Some(v));
        }
        let mut t = Table::new();
        t.add_column("id".into(), Column::Num(id));
        t.add_column("dept".into(), Column::Str(dept));
        t.add_column("salary".into(), Column::Num(salary));
        t.finalize();
        t
    }

    fn sort_by(t: &Table, spec: SortSpec) -> Vec<u32> {
        let cmp = build_comparator(t, &spec);
        let mut all: Vec<u32> = (0..t.n_rows() as u32).collect();
        sort_indices(&mut all, &cmp);
        all
    }

    #[test]
    fn single_asc_numeric() {
        let t = fixture();
        let r = sort_by(
            &t,
            vec![SortKey {
                column_id: "salary".into(),
                dir: SortDir::Asc,
                nulls: NullsOrder::Last,
            }],
        );
        assert_eq!(r, vec![1, 4, 0, 3, 2]);
    }

    #[test]
    fn single_desc_numeric() {
        let t = fixture();
        let r = sort_by(
            &t,
            vec![SortKey {
                column_id: "salary".into(),
                dir: SortDir::Desc,
                nulls: NullsOrder::Last,
            }],
        );
        assert_eq!(r, vec![2, 0, 3, 4, 1]);
    }

    #[test]
    fn multi_key_dept_asc_then_salary_desc() {
        let t = fixture();
        let r = sort_by(
            &t,
            vec![
                SortKey {
                    column_id: "dept".into(),
                    dir: SortDir::Asc,
                    nulls: NullsOrder::Last,
                },
                SortKey {
                    column_id: "salary".into(),
                    dir: SortDir::Desc,
                    nulls: NullsOrder::Last,
                },
            ],
        );
        assert_eq!(r, vec![2, 0, 3, 4, 1]);
    }

    #[test]
    fn ties_break_by_original_index() {
        let t = fixture();
        let r = sort_by(
            &t,
            vec![SortKey {
                column_id: "dept".into(),
                dir: SortDir::Asc,
                nulls: NullsOrder::Last,
            }],
        );
        assert_eq!(r, vec![0, 2, 3, 1, 4]);
    }

    #[test]
    fn empty_spec_preserves_order() {
        let t = fixture();
        let r = sort_by(&t, vec![]);
        assert_eq!(r, vec![0, 1, 2, 3, 4]);
    }
}
