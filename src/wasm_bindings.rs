#[cfg(feature = "wasm")]
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[cfg(feature = "wasm")]
use crate::column::{BoolColumn, Column, NumColumn, StrColumn};
#[cfg(feature = "wasm")]
use crate::filter::{compile_predicate, filter_indices, Combinator, Leaf, Op, Predicate, Value};
#[cfg(feature = "wasm")]
use crate::pagination::{derive_pagination, slice_page, PaginationState};
#[cfg(feature = "wasm")]
use crate::sort::{build_comparator, sort_indices, NullsOrder, SortDir, SortKey, SortSpec};
#[cfg(feature = "wasm")]
use crate::table::Table;

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub struct WasmTable {
    inner: Table,
}

#[cfg(feature = "wasm")]
#[wasm_bindgen]
impl WasmTable {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: Table::new(),
        }
    }

    /// Add a numeric column. `values` is the raw f64 buffer, `mask` is a
    /// per-row presence byte (0 = null, 1 = present). Lengths must match.
    pub fn add_num_column(&mut self, id: String, values: &[f64], mask: &[u8]) {
        let n = values.len();
        let mut col = NumColumn::with_capacity(n);
        for i in 0..n {
            if mask[i] == 0 {
                col.push(None);
            } else {
                col.push(Some(values[i]));
            }
        }
        self.inner.add_column(id, Column::Num(col));
    }

    /// Add a string column. `codes[i] == u32::MAX` means null; otherwise it
    /// indexes into `dict`. `dict` is passed as a JSON string array
    /// (`JSON.stringify(["eng", "sales", ...])`).
    pub fn add_str_column(
        &mut self,
        id: String,
        codes: &[u32],
        dict_json: &str,
    ) -> Result<(), JsError> {
        let dict: Vec<String> = serde_json::from_str(dict_json)
            .map_err(|e| JsError::new(&format!("dict_json parse error: {e}")))?;
        let dict_lower: Vec<String> = dict.iter().map(|s| s.to_lowercase()).collect();
        let col = StrColumn {
            codes: codes.to_vec(),
            dict,
            dict_lower,
            dict_rank: Vec::new(),
        };
        self.inner.add_column(id, Column::Str(col));
        Ok(())
    }

    /// Add a boolean column. `values[i]` ∈ {0 (false), 1 (true), 2 (null)}.
    pub fn add_bool_column(&mut self, id: String, values: &[u8]) {
        let mut col = BoolColumn::with_capacity(values.len());
        for v in values {
            col.values.push(*v);
        }
        self.inner.add_column(id, Column::Bool(col));
    }

    /// Must be called after all columns are added.
    pub fn finalize(&mut self) {
        self.inner.finalize();
    }

    #[wasm_bindgen(getter)]
    pub fn n_rows(&self) -> u32 {
        self.inner.n_rows() as u32
    }

    #[wasm_bindgen(getter)]
    pub fn n_columns(&self) -> u32 {
        self.inner.n_columns() as u32
    }
}

#[cfg(feature = "wasm")]
impl Default for WasmTable {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(feature = "wasm")]
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum WirePredicate {
    Leaf {
        #[serde(rename = "columnId")]
        column_id: String,
        op: String,
        #[serde(default)]
        value: WireValue,
        #[serde(default, rename = "caseSensitive")]
        case_sensitive: bool,
    },
    Group {
        combinator: String,
        #[serde(default)]
        negate: bool,
        children: Vec<WirePredicate>,
    },
}

#[cfg(feature = "wasm")]
#[derive(Deserialize, Default)]
#[serde(untagged)]
enum WireValue {
    #[default]
    Null,
    Number(f64),
    String(String),
    Boolean(bool),
    List(Vec<WireValue>),
}

#[cfg(feature = "wasm")]
impl WireValue {
    fn into_value(self) -> Value {
        match self {
            WireValue::Null => Value::Null,
            WireValue::Number(n) => Value::Number(n),
            WireValue::String(s) => Value::String(s),
            WireValue::Boolean(b) => Value::Boolean(b),
            WireValue::List(items) => {
                Value::List(items.into_iter().map(|i| i.into_value()).collect())
            }
        }
    }
}

#[cfg(feature = "wasm")]
fn parse_op(s: &str) -> Result<Op, JsError> {
    Ok(match s {
        "=" => Op::Eq,
        "!=" => Op::Ne,
        ">" => Op::Gt,
        "<" => Op::Lt,
        ">=" => Op::Ge,
        "<=" => Op::Le,
        "like" => Op::Like,
        "startsWith" => Op::StartsWith,
        "endsWith" => Op::EndsWith,
        "isNull" => Op::IsNull,
        "isNotNull" => Op::IsNotNull,
        "in" => Op::In,
        other => return Err(JsError::new(&format!("unknown op '{other}'"))),
    })
}

#[cfg(feature = "wasm")]
fn parse_combinator(s: &str) -> Result<Combinator, JsError> {
    match s {
        "and" => Ok(Combinator::And),
        "or" => Ok(Combinator::Or),
        other => Err(JsError::new(&format!("unknown combinator '{other}'"))),
    }
}

#[cfg(feature = "wasm")]
fn into_predicate(wp: WirePredicate) -> Result<Predicate, JsError> {
    Ok(match wp {
        WirePredicate::Leaf {
            column_id,
            op,
            value,
            case_sensitive,
        } => Predicate::Leaf(Leaf {
            column_id,
            op: parse_op(&op)?,
            value: value.into_value(),
            case_sensitive,
        }),
        WirePredicate::Group {
            combinator,
            negate,
            children,
        } => {
            let mut kids = Vec::with_capacity(children.len());
            for c in children {
                kids.push(into_predicate(c)?);
            }
            Predicate::Group(crate::filter::Group {
                combinator: parse_combinator(&combinator)?,
                negate,
                children: kids,
            })
        }
    })
}

#[cfg(feature = "wasm")]
#[derive(Deserialize)]
struct WireSortKey {
    #[serde(rename = "columnId")]
    column_id: String,
    dir: String,
    #[serde(default)]
    nulls: Option<String>,
}

#[cfg(feature = "wasm")]
fn into_sort_spec(json: &str) -> Result<SortSpec, JsError> {
    if json.is_empty() {
        return Ok(Vec::new());
    }
    let wire: Vec<WireSortKey> = serde_json::from_str(json)
        .map_err(|e| JsError::new(&format!("sort spec parse error: {e}")))?;
    let mut out = Vec::with_capacity(wire.len());
    for k in wire {
        let dir = match k.dir.as_str() {
            "asc" => SortDir::Asc,
            "desc" => SortDir::Desc,
            other => return Err(JsError::new(&format!("unknown sort dir '{other}'"))),
        };
        let nulls = match k.nulls.as_deref() {
            Some("first") => NullsOrder::First,
            _ => NullsOrder::Last,
        };
        out.push(SortKey {
            column_id: k.column_id,
            dir,
            nulls,
        });
    }
    Ok(out)
}

/// Filter the table by a JSON-encoded predicate. Pass an empty string to
/// keep every row (the null-predicate path).
#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn wasm_filter(table: &WasmTable, predicate_json: &str) -> Result<Vec<u32>, JsError> {
    if predicate_json.is_empty() {
        return Ok(filter_indices(&table.inner, None));
    }
    let wp: WirePredicate = serde_json::from_str(predicate_json)
        .map_err(|e| JsError::new(&format!("predicate parse error: {e}")))?;
    let p = into_predicate(wp)?;
    let c = compile_predicate(&p, &table.inner);
    Ok(filter_indices(&table.inner, Some(&c)))
}

/// Stable multi-key sort of the given index set.
#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn wasm_sort(table: &WasmTable, indices: &[u32], spec_json: &str) -> Result<Vec<u32>, JsError> {
    let spec = into_sort_spec(spec_json)?;
    if spec.is_empty() {
        return Ok(indices.to_vec());
    }
    let cmp = build_comparator(&table.inner, &spec);
    let mut out = indices.to_vec();
    sort_indices(&mut out, &cmp);
    Ok(out)
}

/// Slice a page of `indices`. `page_size_is_infinite == 1` collapses to a
/// single page covering everything (matches `Number.POSITIVE_INFINITY` on
/// the JS side, which can't be transferred verbatim).
#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn wasm_page(
    indices: &[u32],
    page_index: u32,
    page_size: f64,
    page_size_is_infinite: u8,
) -> Vec<u32> {
    let size = if page_size_is_infinite != 0 {
        f64::INFINITY
    } else {
        page_size
    };
    let state = PaginationState {
        page_index,
        page_size: size,
    };
    let total = indices.len() as u32;
    let d = derive_pagination(state, total);
    slice_page(indices, d)
}

#[cfg(feature = "image-wasm")]
use crate::image as img;

#[cfg(feature = "image-wasm")]
fn _fmt_from_u8(v: u8) -> Result<img::ImageFmt, JsError> {
    match v {
        0 => Ok(img::ImageFmt::Jpeg),
        1 => Ok(img::ImageFmt::Png),
        2 => Ok(img::ImageFmt::WebP),
        other => Err(JsError::new(&format!("unknown image fmt code {other}"))),
    }
}

#[cfg(feature = "image-wasm")]
fn _fit_from_u8(v: u8) -> Result<img::FitMode, JsError> {
    match v {
        0 => Ok(img::FitMode::Cover),
        1 => Ok(img::FitMode::Contain),
        2 => Ok(img::FitMode::Stretch),
        other => Err(JsError::new(&format!("unknown fit mode code {other}"))),
    }
}

/// Decode `src` and re-encode in the target format, optionally downscaling so
/// the largest dimension fits `max_dim` (0 disables).
///
/// `fmt`: 0=jpeg, 1=png, 2=webp. `quality` ∈ 1..=100 (jpeg only).
#[cfg(feature = "image-wasm")]
#[wasm_bindgen]
pub fn img_compress(src: &[u8], fmt: u8, max_dim: u32, quality: u8) -> Result<Vec<u8>, JsError> {
    let f = _fmt_from_u8(fmt)?;
    img::compress(src, f, max_dim, quality).map_err(|e| JsError::new(&e))
}

/// Generate a W×H thumbnail (always JPEG output).
/// `fit`: 0=cover, 1=contain, 2=stretch.
#[cfg(feature = "image-wasm")]
#[wasm_bindgen]
pub fn img_thumbnail(src: &[u8], w: u32, h: u32, fit: u8, quality: u8) -> Result<Vec<u8>, JsError> {
    let m = _fit_from_u8(fit)?;
    img::thumbnail(src, w, h, m, quality).map_err(|e| JsError::new(&e))
}

/// Encode a blurhash placeholder string. `x` / `y` are AC components (typically 3..9).
#[cfg(feature = "image-wasm")]
#[wasm_bindgen]
pub fn img_blurhash(src: &[u8], x: u32, y: u32) -> Result<String, JsError> {
    img::blurhash_for(src, x, y).map_err(|e| JsError::new(&e))
}

/// Probe the image dimensions without fully decoding. Returns a 2-element
/// `Uint32Array` `[width, height]`, or an empty array if the format is not
/// recognized.
#[cfg(feature = "image-wasm")]
#[wasm_bindgen]
pub fn img_decode_dimensions(src: &[u8]) -> Vec<u32> {
    match img::decode_dimensions(src) {
        Some((w, h)) => vec![w, h],
        None => Vec::new(),
    }
}
