use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::time::Instant;

use crate::arena::{ArenaState, HotRecord};
use crate::cjk_pinyin::{build_pinyin_projection, lookup_cjk_syllables};
use crate::fzf::{FzfScratch, find_ascii_ci, merge_ranges_tuples, score_fzf_subsequence};

#[derive(Debug, Clone)]
pub struct NativeSearchMatchItem {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub is_dir: bool,
    pub mtime_sec: u32,
    pub mtime_ms: f64,
    pub score: f64,
    pub match_kind: String,
    pub matched_ranges: Vec<Vec<u32>>,
}

#[derive(Debug, Clone)]
pub struct NativeSearchOutcome {
    pub items: Vec<NativeSearchMatchItem>,
    pub total_indexed: usize,
    pub bitmap_rejected: usize,
    pub evaluated_candidates: usize,
    pub duration_ms: f64,
}

#[derive(Clone, Copy)]
pub(crate) struct HeapCandidate {
    pub idx: u32,
    pub score: f64,
    pub mtime_sec: u32,
    pub name_len: u16,
    pub match_kind: &'static str,
}

impl PartialEq for HeapCandidate {
    fn eq(&self, other: &Self) -> bool {
        self.score.total_cmp(&other.score) == Ordering::Equal
            && self.mtime_sec == other.mtime_sec
            && self.name_len == other.name_len
            && self.idx == other.idx
    }
}

impl Eq for HeapCandidate {}

impl PartialOrd for HeapCandidate {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for HeapCandidate {
    fn cmp(&self, other: &Self) -> Ordering {
        // Inverted ordering: worst surviving item compares `Greater` so `BinaryHeap::peek()` is worst.
        other
            .score
            .total_cmp(&self.score)
            .then_with(|| other.mtime_sec.cmp(&self.mtime_sec))
            .then_with(|| self.name_len.cmp(&other.name_len))
            .then_with(|| self.idx.cmp(&other.idx))
    }
}

#[inline]
pub(crate) fn push_top_k(heap: &mut BinaryHeap<HeapCandidate>, limit: usize, item: HeapCandidate) {
    if limit == 0 {
        return;
    }
    if heap.len() < limit {
        heap.push(item);
    } else if let Some(mut worst) = heap.peek_mut()
        && item < *worst
    {
        *worst = item;
    }
}

/// Returns the score floor required for `rec` to enter `heap`, or `None` if `rec` cannot
/// beat the current `limit`-th item even with a perfect `1.0` exact match score.
#[inline]
pub(crate) fn heap_min_needed_score(
    heap: &BinaryHeap<HeapCandidate>,
    limit: usize,
    rec: &HotRecord,
    idx: u32,
) -> Option<f64> {
    if heap.len() < limit {
        return Some(0.0);
    }
    let Some(w) = heap.peek() else {
        return Some(0.0);
    };
    if w.score >= 1.0
        && (rec.mtime_sec < w.mtime_sec
            || (rec.mtime_sec == w.mtime_sec
                && (rec.name_len > w.name_len || (rec.name_len == w.name_len && idx >= w.idx))))
    {
        return None;
    }
    Some(w.score)
}

#[inline]
fn utf16_offset_for_byte(s: &str, byte_idx: usize) -> u32 {
    if s.is_ascii() {
        return byte_idx.min(s.len()) as u32;
    }
    s[..byte_idx.min(s.len())]
        .chars()
        .map(|c| c.len_utf16() as u32)
        .sum()
}

fn byte_range_to_utf16(s: &str, byte_start: usize, byte_end: usize) -> Vec<u32> {
    if s.is_ascii() {
        let start = byte_start.min(s.len()) as u32;
        let end = byte_end.min(s.len()) as u32;
        return vec![start, end];
    }
    let start = utf16_offset_for_byte(s, byte_start);
    let len: u32 = s[byte_start.min(s.len())..byte_end.min(s.len())]
        .chars()
        .map(|c| c.len_utf16() as u32)
        .sum();
    vec![start, start + len]
}

fn compute_pinyin_ranges(
    arena: &ArenaState,
    rec: &HotRecord,
    rec_idx: usize,
    name: &str,
    q_lower: &str,
) -> Vec<Vec<u32>> {
    let py_init_raw = arena.py_init_str(rec, rec_idx);
    let py_full_raw = arena.py_full_str(rec, rec_idx);
    let proj = build_pinyin_projection(name);

    for variant in py_init_raw.split('|') {
        if variant.starts_with(q_lower) {
            let mut spans: Vec<(u32, u32)> = proj
                .spans
                .iter()
                .take(q_lower.len())
                .map(|&(u_s, u_l, _, _)| (u_s as u32, (u_s + u_l) as u32))
                .collect();
            return merge_ranges_tuples(&mut spans);
        }
        if let Some(pos) = variant.find(q_lower) {
            let mut spans: Vec<(u32, u32)> = proj
                .spans
                .iter()
                .skip(pos)
                .take(q_lower.len())
                .map(|&(u_s, u_l, _, _)| (u_s as u32, (u_s + u_l) as u32))
                .collect();
            return merge_ranges_tuples(&mut spans);
        }
    }

    for (v_idx, full_var) in py_full_raw.split('|').enumerate() {
        if let Some(byte_pos) = full_var.find(q_lower) {
            let end_byte = byte_pos + q_lower.len();
            if v_idx == 0 {
                let mut spans: Vec<(u32, u32)> = proj
                    .spans
                    .iter()
                    .filter(|&&(_, _, p_s, p_e)| {
                        (p_e as usize) > byte_pos && (p_s as usize) < end_byte
                    })
                    .map(|&(u_s, u_l, _, _)| (u_s as u32, (u_s + u_l) as u32))
                    .collect();
                return merge_ranges_tuples(&mut spans);
            }
            let mut spans = Vec::new();
            let mut utf16_pos = 0u32;
            let mut alt_off = 0usize;
            for ch in name.chars() {
                let u_len = ch.len_utf16() as u32;
                if let Some(((_, syl0), alt_opt)) = lookup_cjk_syllables(ch) {
                    let syl = alt_opt.map(|(_, s1)| s1).unwrap_or(syl0);
                    let p_s = alt_off;
                    let p_e = alt_off + syl.len();
                    alt_off = p_e;
                    if p_e > byte_pos && p_s < end_byte {
                        spans.push((utf16_pos, utf16_pos + u_len));
                    }
                } else if ch.is_ascii_alphanumeric() {
                    let p_s = alt_off;
                    let p_e = alt_off + 1;
                    alt_off = p_e;
                    if p_e > byte_pos && p_s < end_byte {
                        spans.push((utf16_pos, utf16_pos + u_len));
                    }
                }
                utf16_pos += u_len;
            }
            return merge_ranges_tuples(&mut spans);
        }
    }
    Vec::new()
}

fn compute_match_ranges(
    arena: &ArenaState,
    rec: &HotRecord,
    rec_idx: usize,
    match_kind: &'static str,
    q_lower: &str,
    q_chars: &[char],
    scratch: &mut FzfScratch,
) -> Vec<Vec<u32>> {
    let name = arena.name_str(rec);
    match match_kind {
        "exact" => {
            let name_u16_len = utf16_offset_for_byte(name, name.len());
            vec![vec![0, name_u16_len]]
        }
        "prefix" => {
            let hl_len = utf16_offset_for_byte(name, q_lower.len().min(name.len()));
            vec![vec![0, hl_len]]
        }
        "substring" => {
            let byte_pos = if rec.is_ascii() && q_lower.is_ascii() {
                find_ascii_ci(name.as_bytes(), q_lower.as_bytes()).unwrap_or(0)
            } else {
                arena.lower_str(rec, rec_idx).find(q_lower).unwrap_or(0)
            };
            let range = byte_range_to_utf16(
                name,
                byte_pos.min(name.len()),
                (byte_pos + q_lower.len()).min(name.len()),
            );
            vec![range]
        }
        "pinyin" => compute_pinyin_ranges(arena, rec, rec_idx, name, q_lower),
        "fuzzy" => score_fzf_subsequence(name, q_chars, q_lower, true, scratch)
            .map(|(_, ranges)| ranges)
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

pub(crate) fn build_search_outcome(
    arena: &ArenaState,
    top_k: Vec<HeapCandidate>,
    q_lower: &str,
    q_chars: &[char],
    bitmap_rejected: usize,
    evaluated: usize,
    started: Instant,
) -> NativeSearchOutcome {
    let mut fzf_scratch = FzfScratch::new();
    let mut items = Vec::with_capacity(top_k.len());

    for cand in top_k {
        let rec_idx = cand.idx as usize;
        let rec = &arena.records[rec_idx];
        let name_str = arena.name_str(rec);
        let full_path = arena.dirs.build_full_path(rec.dir_id, name_str);
        let name = name_str.to_owned();
        let extension = if rec.is_dir() {
            String::new()
        } else {
            name.rsplit_once('.')
                .map(|(_, e)| format!(".{}", e.to_lowercase()))
                .unwrap_or_default()
        };
        let matched_ranges = compute_match_ranges(
            arena,
            rec,
            rec_idx,
            cand.match_kind,
            q_lower,
            q_chars,
            &mut fzf_scratch,
        );
        items.push(NativeSearchMatchItem {
            path: full_path,
            name,
            extension,
            is_dir: rec.is_dir(),
            mtime_sec: rec.mtime_sec,
            mtime_ms: (rec.mtime_sec as f64) * 1000.0,
            score: cand.score,
            match_kind: cand.match_kind.to_string(),
            matched_ranges,
        });
    }

    NativeSearchOutcome {
        items,
        total_indexed: arena.active_files + arena.active_dirs,
        bitmap_rejected,
        evaluated_candidates: evaluated,
        duration_ms: started.elapsed().as_secs_f64() * 1000.0,
    }
}
