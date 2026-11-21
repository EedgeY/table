use std::cmp::Ordering;

pub fn coerce_number_str(v: &str) -> Option<f64> {
    if v.is_empty() {
        return None;
    }
    let trimmed = v.trim();
    if trimmed.is_empty() {
        return None;
    }
    trimmed.parse::<f64>().ok().filter(|n| n.is_finite())
}

#[inline]
pub fn cmp_str(a: &str, b: &str) -> Ordering {
    a.cmp(b)
}

#[inline]
pub fn cmp_num(a: f64, b: f64) -> Ordering {
    a.partial_cmp(&b).unwrap_or(Ordering::Equal)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coerce_number_str_basic() {
        assert_eq!(coerce_number_str("42"), Some(42.0));
        assert_eq!(coerce_number_str("-3.5"), Some(-3.5));
    }

    #[test]
    fn coerce_number_str_rejects_garbage() {
        assert_eq!(coerce_number_str(""), None);
        assert_eq!(coerce_number_str("abc"), None);
        assert_eq!(coerce_number_str("NaN"), None);
        assert_eq!(coerce_number_str("Infinity"), None);
    }
}
