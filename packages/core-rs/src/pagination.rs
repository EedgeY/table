#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PaginationState {
    pub page_index: u32,
    pub page_size: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PaginationDerived {
    pub page_count: u32,
    pub can_prev: bool,
    pub can_next: bool,
    pub start_index: u32,
    pub end_index: u32,
}

fn calc_page_count(size: f64, total: u32) -> u32 {
    if size <= 0.0 || !size.is_finite() {
        return 1;
    }
    let n = (total as f64 / size).ceil() as u32;
    n.max(1)
}

pub fn derive_pagination(state: PaginationState, total: u32) -> PaginationDerived {
    let size = state.page_size;
    let page_count = calc_page_count(size, total);
    let page_index = state.page_index.min(page_count - 1);
    let start_index = if size.is_finite() {
        (page_index as f64 * size) as u32
    } else {
        0
    };
    let end_index = if size.is_finite() {
        (start_index + size as u32).min(total)
    } else {
        total
    };
    PaginationDerived {
        page_count,
        can_prev: page_index > 0,
        can_next: page_index < page_count - 1,
        start_index,
        end_index,
    }
}

pub fn clamp_pagination(state: PaginationState, total: u32) -> PaginationState {
    let page_count = calc_page_count(state.page_size, total);
    let clamped = state.page_index.min(page_count - 1);
    if clamped == state.page_index {
        state
    } else {
        PaginationState {
            page_index: clamped,
            page_size: state.page_size,
        }
    }
}

pub fn slice_page(indices: &[u32], d: PaginationDerived) -> Vec<u32> {
    if d.start_index as usize >= indices.len() {
        return Vec::new();
    }
    indices[d.start_index as usize..d.end_index as usize].to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_count_at_least_one_when_total_is_zero() {
        let d = derive_pagination(
            PaginationState {
                page_index: 0,
                page_size: 10.0,
            },
            0,
        );
        assert_eq!(d.page_count, 1);
    }

    #[test]
    fn page_index_clamps() {
        let d = derive_pagination(
            PaginationState {
                page_index: 99,
                page_size: 10.0,
            },
            25,
        );
        assert_eq!(d.page_count, 3);
        assert!(d.can_prev);
        assert!(!d.can_next);
        assert_eq!(d.start_index, 20);
        assert_eq!(d.end_index, 25);
    }

    #[test]
    fn infinity_page_size_single_page() {
        let d = derive_pagination(
            PaginationState {
                page_index: 0,
                page_size: f64::INFINITY,
            },
            1_000_000,
        );
        assert_eq!(d.page_count, 1);
        assert_eq!(d.start_index, 0);
        assert_eq!(d.end_index, 1_000_000);
    }

    #[test]
    fn slice_page_returns_empty_beyond_total() {
        let arr: Vec<u32> = (0..5).collect();
        let d = derive_pagination(
            PaginationState {
                page_index: 0,
                page_size: 2.0,
            },
            5,
        );
        assert_eq!(slice_page(&arr, d), vec![0, 1]);
    }
}
