pub const SCORE_MATCH: f64 = 16.0;
pub const SCORE_BOUNDARY: f64 = 10.0;
pub const SCORE_CAMEL: f64 = 7.0;
pub const SCORE_CONSECUTIVE: f64 = 12.0;
pub const SCORE_GAP_START: f64 = -3.0;
pub const SCORE_GAP_EXTENSION: f64 = -1.0;

#[derive(Debug, Default)]
pub struct FzfScratch {
    prev: Vec<f64>,
    curr: Vec<f64>,
    back: Vec<u16>,
    target_chars: Vec<char>,
    target_lower: Vec<char>,
    utf16_starts: Vec<u32>,
    matched_pos: Vec<usize>,
    ranges_buf: Vec<(u32, u32)>,
}

impl FzfScratch {
    pub fn new() -> Self {
        Self {
            prev: Vec::with_capacity(256),
            curr: Vec::with_capacity(256),
            back: Vec::with_capacity(1024),
            target_chars: Vec::with_capacity(256),
            target_lower: Vec::with_capacity(256),
            utf16_starts: Vec::with_capacity(257),
            matched_pos: Vec::with_capacity(64),
            ranges_buf: Vec::with_capacity(64),
        }
    }
}

#[inline]
pub fn is_subsequence_ascii(target: &[u8], query_lower: &[u8]) -> bool {
    if query_lower.is_empty() || query_lower.len() > target.len() {
        return false;
    }
    let mut qi = 0usize;
    let q_len = query_lower.len();
    for &b in target {
        if b.to_ascii_lowercase() == query_lower[qi] {
            qi += 1;
            if qi == q_len {
                return true;
            }
        }
    }
    false
}

#[inline]
pub fn find_ascii_ci(haystack: &[u8], needle_lower: &[u8]) -> Option<usize> {
    let n_len = needle_lower.len();
    if n_len == 0 {
        return Some(0);
    }
    if n_len > haystack.len() {
        return None;
    }
    let first = needle_lower[0];
    let last_start = haystack.len() - n_len;
    for i in 0..=last_start {
        if haystack[i].to_ascii_lowercase() == first
            && haystack[i..i + n_len].eq_ignore_ascii_case(needle_lower)
        {
            return Some(i);
        }
    }
    None
}

#[inline]
fn boundary_bonus_ascii(bytes: &[u8], idx: usize) -> f64 {
    if idx == 0 {
        return SCORE_BOUNDARY;
    }
    let prev = bytes[idx - 1];
    let cur = bytes[idx];
    if matches!(prev, b'/' | b'\\' | b' ' | b'_' | b'.' | b'-') {
        return SCORE_BOUNDARY;
    }
    if prev.is_ascii_lowercase() && cur.is_ascii_uppercase() {
        return SCORE_CAMEL;
    }
    if !prev.is_ascii_digit() && cur.is_ascii_digit() {
        return SCORE_CAMEL;
    }
    0.0
}

#[inline]
fn boundary_bonus_char(chars: &[char], idx: usize) -> f64 {
    if idx == 0 {
        return SCORE_BOUNDARY;
    }
    let prev = chars[idx - 1];
    let cur = chars[idx];
    if matches!(prev, '/' | '\\' | ' ' | '_' | '.' | '-') {
        return SCORE_BOUNDARY;
    }
    if prev.is_lowercase() && cur.is_uppercase() {
        return SCORE_CAMEL;
    }
    if !prev.is_ascii_digit() && cur.is_ascii_digit() {
        return SCORE_CAMEL;
    }
    0.0
}

pub fn merge_ranges_tuples(ranges: &mut [(u32, u32)]) -> Vec<Vec<u32>> {
    if ranges.is_empty() {
        return Vec::new();
    }
    ranges.sort_by_key(|&(s, e)| (s, e));
    let mut out: Vec<Vec<u32>> = Vec::with_capacity(ranges.len());
    let mut cur_s = ranges[0].0;
    let mut cur_e = ranges[0].1;
    for &(s, e) in &ranges[1..] {
        if s <= cur_e {
            cur_e = cur_e.max(e);
        } else {
            out.push(vec![cur_s, cur_e]);
            cur_s = s;
            cur_e = e;
        }
    }
    out.push(vec![cur_s, cur_e]);
    out
}

/// Zero-allocation ASCII Smith-Waterman scorer.
/// Both `target` and `query_lower` must be valid ASCII (`query_lower` pre-lowercased).
pub fn score_fzf_ascii(
    target: &[u8],
    query_lower: &[u8],
    need_ranges: bool,
    scratch: &mut FzfScratch,
) -> Option<(f64, Vec<Vec<u32>>)> {
    let t_len = target.len();
    let q_len = query_lower.len();
    if q_len == 0 || t_len == 0 || q_len > t_len || t_len > 256 {
        return None;
    }
    if !is_subsequence_ascii(target, query_lower) {
        return None;
    }

    scratch.prev.clear();
    scratch.prev.resize(t_len, f64::NEG_INFINITY);
    scratch.curr.clear();
    scratch.curr.resize(t_len, f64::NEG_INFINITY);

    if need_ranges {
        scratch.back.clear();
        scratch.back.resize(q_len * t_len, u16::MAX);
    }

    for (qi, &q_b) in query_lower.iter().enumerate() {
        scratch.curr.fill(f64::NEG_INFINITY);
        let mut best_gap_val = f64::NEG_INFINITY;
        let mut best_gap_idx = u16::MAX;

        for ti in 0..t_len {
            if qi > 0 && ti >= 2 {
                let prev_idx = ti - 2;
                let pv = scratch.prev[prev_idx];
                if pv.is_finite() {
                    let cand = pv - SCORE_GAP_EXTENSION * (prev_idx as f64);
                    if cand > best_gap_val {
                        best_gap_val = cand;
                        best_gap_idx = prev_idx as u16;
                    }
                }
            }

            if target[ti].to_ascii_lowercase() != q_b {
                continue;
            }

            let char_score = SCORE_MATCH + boundary_bonus_ascii(target, ti);
            if qi == 0 {
                let lead_gap = if ti == 0 {
                    0.0
                } else {
                    SCORE_GAP_START + SCORE_GAP_EXTENSION * ((ti - 1) as f64)
                };
                scratch.curr[ti] = char_score + lead_gap;
                continue;
            }

            let mut best = f64::NEG_INFINITY;
            let mut from = u16::MAX;

            if ti > 0 && scratch.prev[ti - 1].is_finite() {
                best = scratch.prev[ti - 1] + SCORE_CONSECUTIVE;
                from = (ti - 1) as u16;
            }
            if best_gap_val.is_finite() {
                let gapped =
                    best_gap_val + SCORE_GAP_START + SCORE_GAP_EXTENSION * ((ti - 2) as f64);
                if gapped > best {
                    best = gapped;
                    from = best_gap_idx;
                }
            }

            if best.is_finite() {
                scratch.curr[ti] = best + char_score;
                if need_ranges {
                    scratch.back[qi * t_len + ti] = from;
                }
            }
        }
        std::mem::swap(&mut scratch.prev, &mut scratch.curr);
    }

    let mut best = f64::NEG_INFINITY;
    let mut end_idx = 0usize;
    for (ti, &val) in scratch.prev.iter().enumerate() {
        if !val.is_finite() {
            continue;
        }
        let trailing = SCORE_GAP_EXTENSION * ((t_len - ti - 1) as f64) * 0.2;
        let total = val + trailing;
        if total > best {
            best = total;
            end_idx = ti;
        }
    }
    if !best.is_finite() {
        return None;
    }

    let max_possible = (q_len as f64) * (SCORE_MATCH + SCORE_BOUNDARY)
        + ((q_len.saturating_sub(1)) as f64) * SCORE_CONSECUTIVE;
    let normalized = (best / max_possible.max(1.0)).clamp(0.0, 1.0);
    if normalized <= 0.15 {
        return None;
    }

    if !need_ranges {
        return Some((normalized, Vec::new()));
    }

    scratch.matched_pos.clear();
    scratch.matched_pos.resize(q_len, 0);
    let mut cur_t = end_idx;
    for qi in (0..q_len).rev() {
        scratch.matched_pos[qi] = cur_t;
        if qi > 0 {
            let p = scratch.back[qi * t_len + cur_t];
            if p == u16::MAX {
                return None;
            }
            cur_t = p as usize;
        }
    }

    scratch.ranges_buf.clear();
    for &ci in &scratch.matched_pos {
        scratch.ranges_buf.push((ci as u32, (ci + 1) as u32));
    }
    Some((normalized, merge_ranges_tuples(&mut scratch.ranges_buf)))
}

/// Reusable-buffer Unicode Smith-Waterman scorer (dispatches to ASCII fast path when both are ASCII).
pub fn score_fzf_subsequence(
    target: &str,
    query_lower: &[char],
    query_lower_str: &str,
    need_ranges: bool,
    scratch: &mut FzfScratch,
) -> Option<(f64, Vec<Vec<u32>>)> {
    if target.is_ascii() && query_lower_str.is_ascii() {
        return score_fzf_ascii(
            target.as_bytes(),
            query_lower_str.as_bytes(),
            need_ranges,
            scratch,
        );
    }

    let q_len = query_lower.len();
    if q_len == 0 || target.is_empty() {
        return None;
    }

    // Greedy subsequence + length check before filling DP tables
    scratch.target_chars.clear();
    scratch.target_lower.clear();
    let mut qi = 0usize;
    for ch in target.chars() {
        if scratch.target_chars.len() >= 256 {
            return None;
        }
        let lc = ch.to_lowercase().next().unwrap_or(ch);
        if qi < q_len && lc == query_lower[qi] {
            qi += 1;
        }
        scratch.target_chars.push(ch);
        scratch.target_lower.push(lc);
    }
    let t_len = scratch.target_chars.len();
    if qi < q_len || t_len == 0 || q_len > t_len || t_len > 256 {
        return None;
    }

    scratch.prev.clear();
    scratch.prev.resize(t_len, f64::NEG_INFINITY);
    scratch.curr.clear();
    scratch.curr.resize(t_len, f64::NEG_INFINITY);
    if need_ranges {
        scratch.back.clear();
        scratch.back.resize(q_len * t_len, u16::MAX);
    }

    for (qi, &q_ch) in query_lower.iter().enumerate() {
        scratch.curr.fill(f64::NEG_INFINITY);
        let mut best_gap_val = f64::NEG_INFINITY;
        let mut best_gap_idx = u16::MAX;

        for ti in 0..t_len {
            if qi > 0 && ti >= 2 {
                let prev_idx = ti - 2;
                let pv = scratch.prev[prev_idx];
                if pv.is_finite() {
                    let cand = pv - SCORE_GAP_EXTENSION * (prev_idx as f64);
                    if cand > best_gap_val {
                        best_gap_val = cand;
                        best_gap_idx = prev_idx as u16;
                    }
                }
            }

            if scratch.target_lower[ti] != q_ch {
                continue;
            }

            let char_score = SCORE_MATCH + boundary_bonus_char(&scratch.target_chars, ti);
            if qi == 0 {
                let lead_gap = if ti == 0 {
                    0.0
                } else {
                    SCORE_GAP_START + SCORE_GAP_EXTENSION * ((ti - 1) as f64)
                };
                scratch.curr[ti] = char_score + lead_gap;
                continue;
            }

            let mut best = f64::NEG_INFINITY;
            let mut from = u16::MAX;

            if ti > 0 && scratch.prev[ti - 1].is_finite() {
                best = scratch.prev[ti - 1] + SCORE_CONSECUTIVE;
                from = (ti - 1) as u16;
            }
            if best_gap_val.is_finite() {
                let gapped =
                    best_gap_val + SCORE_GAP_START + SCORE_GAP_EXTENSION * ((ti - 2) as f64);
                if gapped > best {
                    best = gapped;
                    from = best_gap_idx;
                }
            }

            if best.is_finite() {
                scratch.curr[ti] = best + char_score;
                if need_ranges {
                    scratch.back[qi * t_len + ti] = from;
                }
            }
        }
        std::mem::swap(&mut scratch.prev, &mut scratch.curr);
    }

    let mut best = f64::NEG_INFINITY;
    let mut end_idx = 0usize;
    for (ti, &val) in scratch.prev.iter().enumerate() {
        if !val.is_finite() {
            continue;
        }
        let trailing = SCORE_GAP_EXTENSION * ((t_len - ti - 1) as f64) * 0.2;
        let total = val + trailing;
        if total > best {
            best = total;
            end_idx = ti;
        }
    }
    if !best.is_finite() {
        return None;
    }

    let max_possible = (q_len as f64) * (SCORE_MATCH + SCORE_BOUNDARY)
        + ((q_len.saturating_sub(1)) as f64) * SCORE_CONSECUTIVE;
    let normalized = (best / max_possible.max(1.0)).clamp(0.0, 1.0);
    if normalized <= 0.15 {
        return None;
    }

    if !need_ranges {
        return Some((normalized, Vec::new()));
    }

    scratch.matched_pos.clear();
    scratch.matched_pos.resize(q_len, 0);
    let mut cur_t = end_idx;
    for qi in (0..q_len).rev() {
        scratch.matched_pos[qi] = cur_t;
        if qi > 0 {
            let p = scratch.back[qi * t_len + cur_t];
            if p == u16::MAX {
                return None;
            }
            cur_t = p as usize;
        }
    }

    scratch.utf16_starts.clear();
    let mut u16_acc = 0u32;
    for &ch in &scratch.target_chars {
        scratch.utf16_starts.push(u16_acc);
        u16_acc += ch.len_utf16() as u32;
    }
    scratch.utf16_starts.push(u16_acc);

    scratch.ranges_buf.clear();
    for &ci in &scratch.matched_pos {
        scratch
            .ranges_buf
            .push((scratch.utf16_starts[ci], scratch.utf16_starts[ci + 1]));
    }
    Some((normalized, merge_ranges_tuples(&mut scratch.ranges_buf)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ascii_fast_path_matches_unicode_path_exactly() {
        let cases = [
            ("file-provider-search-result-service.ts", "fpsr"),
            ("CamelCaseController2.tsx", "ccc2"),
            ("my_super_helper_v10.rs", "msh10"),
            ("src/modules/native-file-index/ArenaState.rs", "mnas"),
            ("nonmatching-file.txt", "xyz"),
        ];
        let mut scratch = FzfScratch::new();
        for (target, query) in cases {
            let q_chars: Vec<char> = query.chars().collect();
            let ascii_score_only =
                score_fzf_ascii(target.as_bytes(), query.as_bytes(), false, &mut scratch);
            let ascii_with_ranges =
                score_fzf_ascii(target.as_bytes(), query.as_bytes(), true, &mut scratch);

            // Force the char-based DP via a direct unicode test comparison on exact same string
            let uni = score_fzf_unicode_for_test(target, &q_chars, &mut scratch);
            assert_eq!(
                ascii_score_only.as_ref().map(|(s, _)| s.to_bits()),
                uni.as_ref().map(|(s, _)| s.to_bits()),
                "score mismatch for target={target} query={query}"
            );
            assert_eq!(
                ascii_with_ranges, uni,
                "ranges mismatch for {target}/{query}"
            );
        }
    }

    #[test]
    fn handles_unicode_emoji_utf16_highlights() {
        let mut scratch = FzfScratch::new();
        let target = "😀file-provider.ts";
        let q = "fp";
        let q_chars: Vec<char> = q.chars().collect();
        let (score, ranges) =
            score_fzf_subsequence(target, &q_chars, q, true, &mut scratch).expect("should match");
        assert!(score > 0.15);
        // '😀' takes 2 UTF-16 code units, 'f' is at index 2..3, 'p' is at 7..8
        assert_eq!(ranges, vec![vec![2, 3], vec![7, 8]]);
    }

    fn score_fzf_unicode_for_test(
        target: &str,
        query_lower: &[char],
        scratch: &mut FzfScratch,
    ) -> Option<(f64, Vec<Vec<u32>>)> {
        // Call the char branch by passing a non-ASCII dummy or running directly:
        let q_len = query_lower.len();
        scratch.target_chars = target.chars().collect();
        let t_len = scratch.target_chars.len();
        if q_len == 0 || t_len == 0 || q_len > t_len || t_len > 256 {
            return None;
        }
        scratch.target_lower = scratch
            .target_chars
            .iter()
            .map(|c| c.to_lowercase().next().unwrap_or(*c))
            .collect();
        scratch.prev.clear();
        scratch.prev.resize(t_len, f64::NEG_INFINITY);
        scratch.curr.clear();
        scratch.curr.resize(t_len, f64::NEG_INFINITY);
        scratch.back.clear();
        scratch.back.resize(q_len * t_len, u16::MAX);

        for (qi, &q_ch) in query_lower.iter().enumerate() {
            scratch.curr.fill(f64::NEG_INFINITY);
            let mut best_gap_val = f64::NEG_INFINITY;
            let mut best_gap_idx = u16::MAX;
            for ti in 0..t_len {
                if qi > 0 && ti >= 2 {
                    let prev_idx = ti - 2;
                    let pv = scratch.prev[prev_idx];
                    if pv.is_finite() {
                        let cand = pv - SCORE_GAP_EXTENSION * (prev_idx as f64);
                        if cand > best_gap_val {
                            best_gap_val = cand;
                            best_gap_idx = prev_idx as u16;
                        }
                    }
                }
                if scratch.target_lower[ti] != q_ch {
                    continue;
                }
                let char_score = SCORE_MATCH + boundary_bonus_char(&scratch.target_chars, ti);
                if qi == 0 {
                    let lead_gap = if ti == 0 {
                        0.0
                    } else {
                        SCORE_GAP_START + SCORE_GAP_EXTENSION * ((ti - 1) as f64)
                    };
                    scratch.curr[ti] = char_score + lead_gap;
                    continue;
                }
                let mut best = f64::NEG_INFINITY;
                let mut from = u16::MAX;
                if ti > 0 && scratch.prev[ti - 1].is_finite() {
                    best = scratch.prev[ti - 1] + SCORE_CONSECUTIVE;
                    from = (ti - 1) as u16;
                }
                if best_gap_val.is_finite() {
                    let gapped =
                        best_gap_val + SCORE_GAP_START + SCORE_GAP_EXTENSION * ((ti - 2) as f64);
                    if gapped > best {
                        best = gapped;
                        from = best_gap_idx;
                    }
                }
                if best.is_finite() {
                    scratch.curr[ti] = best + char_score;
                    scratch.back[qi * t_len + ti] = from;
                }
            }
            std::mem::swap(&mut scratch.prev, &mut scratch.curr);
        }
        let mut best = f64::NEG_INFINITY;
        let mut end_idx = 0usize;
        for (ti, &val) in scratch.prev.iter().enumerate() {
            if !val.is_finite() {
                continue;
            }
            let trailing = SCORE_GAP_EXTENSION * ((t_len - ti - 1) as f64) * 0.2;
            let total = val + trailing;
            if total > best {
                best = total;
                end_idx = ti;
            }
        }
        if !best.is_finite() {
            return None;
        }
        let max_possible = (q_len as f64) * (SCORE_MATCH + SCORE_BOUNDARY)
            + ((q_len.saturating_sub(1)) as f64) * SCORE_CONSECUTIVE;
        let normalized = (best / max_possible.max(1.0)).clamp(0.0, 1.0);
        if normalized <= 0.15 {
            return None;
        }
        let mut matched = vec![0usize; q_len];
        let mut cur_t = end_idx;
        for qi in (0..q_len).rev() {
            matched[qi] = cur_t;
            if qi > 0 {
                let p = scratch.back[qi * t_len + cur_t];
                if p == u16::MAX {
                    return None;
                }
                cur_t = p as usize;
            }
        }
        let mut ranges: Vec<(u32, u32)> = matched
            .into_iter()
            .map(|i| (i as u32, (i + 1) as u32))
            .collect();
        Some((normalized, merge_ranges_tuples(&mut ranges)))
    }
}
