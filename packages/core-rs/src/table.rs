use crate::column::Column;

#[derive(Debug, Default, Clone)]
pub struct Table {
    columns: Vec<Column>,
    names: Vec<String>,
    n_rows: usize,
}

impl Table {
    pub fn new() -> Self {
        Self {
            columns: Vec::new(),
            names: Vec::new(),
            n_rows: 0,
        }
    }

    pub fn add_column(&mut self, name: String, col: Column) {
        if self.columns.is_empty() {
            self.n_rows = col.len();
        } else {
            debug_assert_eq!(
                col.len(),
                self.n_rows,
                "column '{name}' has {} rows; table has {}",
                col.len(),
                self.n_rows
            );
        }
        self.names.push(name);
        self.columns.push(col);
    }

    pub fn finalize(&mut self) {
        for c in &mut self.columns {
            c.finalize();
        }
    }

    pub fn n_rows(&self) -> usize {
        self.n_rows
    }

    pub fn n_columns(&self) -> usize {
        self.columns.len()
    }

    pub fn column_index(&self, name: &str) -> Option<usize> {
        self.names.iter().position(|n| n == name)
    }

    pub fn column(&self, idx: usize) -> &Column {
        &self.columns[idx]
    }

    pub fn columns_slice(&self) -> &[Column] {
        &self.columns
    }

    pub fn name(&self, idx: usize) -> &str {
        &self.names[idx]
    }
}
