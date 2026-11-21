#![deny(unsafe_op_in_unsafe_fn)]
#![cfg_attr(target_arch = "wasm32", allow(clippy::missing_safety_doc))]

pub mod column;
pub mod filter;
pub mod pagination;
pub mod sort;
pub mod table;
pub mod utils;

#[cfg(feature = "image")]
pub mod image;

#[cfg(any(feature = "wasm", feature = "image-wasm"))]
mod wasm_bindings;

pub use column::{BoolColumn, Cell, Column, ColumnKind, NumColumn, StrColumn};
pub use filter::{compile_predicate, Combinator, CompiledPredicate, Leaf, Op, Predicate, Value};
pub use pagination::{
    clamp_pagination, derive_pagination, slice_page, PaginationDerived, PaginationState,
};
pub use sort::{build_comparator, sort_indices, SortDir, SortKey, SortSpec};
pub use table::Table;
