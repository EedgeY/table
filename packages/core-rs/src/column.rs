pub const STR_NULL: u32 = u32::MAX;

#[derive(Debug, Clone)]
pub struct NumColumn {
    pub values: Vec<f64>,
    pub mask: Vec<u8>,
}

impl NumColumn {
    pub fn with_capacity(n: usize) -> Self {
        Self {
            values: Vec::with_capacity(n),
            mask: Vec::with_capacity(n),
        }
    }

    #[inline]
    pub fn push(&mut self, v: Option<f64>) {
        match v {
            Some(n) if n.is_finite() => {
                self.values.push(n);
                self.mask.push(1);
            }
            _ => {
                self.values.push(0.0);
                self.mask.push(0);
            }
        }
    }

    #[inline]
    pub fn is_null(&self, row: usize) -> bool {
        self.mask[row] == 0
    }

    #[inline]
    pub fn get(&self, row: usize) -> Option<f64> {
        if self.mask[row] == 0 {
            None
        } else {
            Some(self.values[row])
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct StrColumn {
    pub codes: Vec<u32>,
    pub dict: Vec<String>,
    pub dict_lower: Vec<String>,
    pub dict_rank: Vec<u32>,
}

impl StrColumn {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_capacity(n: usize) -> Self {
        Self {
            codes: Vec::with_capacity(n),
            dict: Vec::new(),
            dict_lower: Vec::new(),
            dict_rank: Vec::new(),
        }
    }

    pub fn push(&mut self, s: Option<&str>) {
        match s {
            None => self.codes.push(STR_NULL),
            Some(s) => {
                let code = match self.dict.iter().position(|d| d == s) {
                    Some(i) => i as u32,
                    None => {
                        let i = self.dict.len() as u32;
                        self.dict.push(s.to_string());
                        self.dict_lower.push(s.to_lowercase());
                        i
                    }
                };
                self.codes.push(code);
            }
        }
    }

    pub fn finalize(&mut self) {
        let n = self.dict.len();
        let mut order: Vec<u32> = (0..n as u32).collect();
        order.sort_by(|&a, &b| self.dict[a as usize].cmp(&self.dict[b as usize]));
        let mut rank = vec![0u32; n];
        for (pos, code) in order.iter().enumerate() {
            rank[*code as usize] = pos as u32;
        }
        self.dict_rank = rank;
    }

    #[inline]
    pub fn is_null(&self, row: usize) -> bool {
        self.codes[row] == STR_NULL
    }

    #[inline]
    pub fn get(&self, row: usize) -> Option<&str> {
        let code = self.codes[row];
        if code == STR_NULL {
            None
        } else {
            Some(self.dict[code as usize].as_str())
        }
    }

    #[inline]
    pub fn get_lower(&self, row: usize) -> Option<&str> {
        let code = self.codes[row];
        if code == STR_NULL {
            None
        } else {
            Some(self.dict_lower[code as usize].as_str())
        }
    }

    #[inline]
    pub fn rank(&self, row: usize) -> Option<u32> {
        let code = self.codes[row];
        if code == STR_NULL {
            None
        } else {
            Some(self.dict_rank[code as usize])
        }
    }
}

#[derive(Debug, Clone)]
pub struct BoolColumn {
    pub values: Vec<u8>,
}

impl BoolColumn {
    pub fn with_capacity(n: usize) -> Self {
        Self {
            values: Vec::with_capacity(n),
        }
    }

    #[inline]
    pub fn push(&mut self, v: Option<bool>) {
        self.values.push(match v {
            Some(true) => 1,
            Some(false) => 0,
            None => 2,
        });
    }

    #[inline]
    pub fn is_null(&self, row: usize) -> bool {
        self.values[row] == 2
    }

    #[inline]
    pub fn get(&self, row: usize) -> Option<bool> {
        match self.values[row] {
            0 => Some(false),
            1 => Some(true),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColumnKind {
    Num,
    Str,
    Bool,
}

#[derive(Debug, Clone)]
pub enum Column {
    Num(NumColumn),
    Str(StrColumn),
    Bool(BoolColumn),
}

impl Column {
    pub fn kind(&self) -> ColumnKind {
        match self {
            Column::Num(_) => ColumnKind::Num,
            Column::Str(_) => ColumnKind::Str,
            Column::Bool(_) => ColumnKind::Bool,
        }
    }

    pub fn len(&self) -> usize {
        match self {
            Column::Num(c) => c.values.len(),
            Column::Str(c) => c.codes.len(),
            Column::Bool(c) => c.values.len(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    #[inline]
    pub fn is_null(&self, row: usize) -> bool {
        match self {
            Column::Num(c) => c.is_null(row),
            Column::Str(c) => c.is_null(row),
            Column::Bool(c) => c.is_null(row),
        }
    }

    pub fn finalize(&mut self) {
        if let Column::Str(s) = self {
            s.finalize();
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum Cell<'a> {
    Null,
    Num(f64),
    Str(&'a str),
    Bool(bool),
}

impl<'a> Cell<'a> {
    pub fn from_column(col: &'a Column, row: usize) -> Self {
        match col {
            Column::Num(c) => match c.get(row) {
                Some(v) => Cell::Num(v),
                None => Cell::Null,
            },
            Column::Str(c) => match c.get(row) {
                Some(s) => Cell::Str(s),
                None => Cell::Null,
            },
            Column::Bool(c) => match c.get(row) {
                Some(b) => Cell::Bool(b),
                None => Cell::Null,
            },
        }
    }

    pub fn is_null(&self) -> bool {
        matches!(self, Cell::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn num_column_push_and_get() {
        let mut c = NumColumn::with_capacity(3);
        c.push(Some(1.0));
        c.push(None);
        c.push(Some(f64::NAN));
        assert_eq!(c.get(0), Some(1.0));
        assert_eq!(c.get(1), None);
        assert_eq!(c.get(2), None);
    }

    #[test]
    fn str_column_interns_and_ranks() {
        let mut c = StrColumn::new();
        c.push(Some("eng"));
        c.push(Some("sales"));
        c.push(Some("eng"));
        c.push(None);
        c.finalize();
        assert_eq!(c.dict, vec!["eng".to_string(), "sales".to_string()]);
        assert_eq!(c.rank(0), Some(0));
        assert_eq!(c.rank(1), Some(1));
        assert_eq!(c.rank(2), Some(0));
        assert_eq!(c.rank(3), None);
    }
}
