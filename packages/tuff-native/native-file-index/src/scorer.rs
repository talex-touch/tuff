use std::collections::BinaryHeap;
use std::sync::Mutex;
use std::time::Instant;

use crate::arena::{ArenaState, EXT_NONE, EXT_OVERFLOW, HotRecord, compute_char_mask};
use crate::fzf::{FzfScratch, find_ascii_ci, score_fzf_ascii, score_fzf_subsequence};
use crate::search_pool::SearchPool;
use crate::top_k::{HeapCandidate, build_search_outcome, heap_min_needed_score, push_top_k};

pub use crate::top_k::{NativeSearchMatchItem, NativeSearchOutcome};

struct ExtFilterMask<'a> {
    list: &'a [String],
    bits: [u64; 16],
    has_overflow: bool,
    is_empty: bool,
}

impl<'a> ExtFilterMask<'a> {
    fn from_arena(arena: &ArenaState, list: &'a [String]) -> Self {
        let mut bits = [0u64; 16];
        let mut has_overflow = false;
        let arena_exts_full = arena.exts.is_full();
        for ext in list {
            if let Some(id) = arena.exts.lookup_lower(ext) {
                let idx = (id as usize) >> 6;
                let bit = (id as usize) & 63;
                bits[idx] |= 1u64 << bit;
            } else if arena_exts_full {
                has_overflow = true;
            }
        }
        Self {
            list,
            bits,
            has_overflow,
            is_empty: list.is_empty(),
        }
    }

    #[inline]
    fn matches(&self, arena: &ArenaState, rec: &HotRecord, rec_idx: usize) -> bool {
        if rec.is_dir() || self.is_empty {
            return false;
        }
        let ext_id = rec.ext_id();
        if ext_id == EXT_NONE {
            return false;
        }
        if ext_id == EXT_OVERFLOW {
            if !self.has_overflow {
                return false;
            }
            let name_lower = arena.lower_str(rec, rec_idx);
            let ext = name_lower.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
            return self.list.iter().any(|allowed| allowed == ext);
        }
        let idx = (ext_id as usize) >> 6;
        let bit = (ext_id as usize) & 63;
        (self.bits[idx] & (1u64 << bit)) != 0
    }
}

struct WorkerScratch {
    fzf: FzfScratch,
    path_buf: String,
    lower_buf: String,
}

impl WorkerScratch {
    fn new() -> Self {
        Self {
            fzf: FzfScratch::new(),
            path_buf: String::with_capacity(256),
            lower_buf: String::with_capacity(256),
        }
    }
}

#[inline]
fn matches_record_filters(
    arena: &ArenaState,
    rec: &HotRecord,
    rec_idx: usize,
    ext_mask: Option<&ExtFilterMask<'_>>,
    type_filter: Option<&str>,
) -> bool {
    if rec.is_deleted() {
        return false;
    }
    if let Some(tf) = type_filter {
        if tf == "folder" && !rec.is_dir() {
            return false;
        }
        if tf == "file" && rec.is_dir() {
            return false;
        }
    }
    if let Some(mask) = ext_mask {
        return mask.matches(arena, rec, rec_idx);
    }
    true
}

#[inline]
fn contains_ci(
    haystack: &str,
    needle_lower: &str,
    needle_is_ascii: bool,
    lower_scratch: &mut String,
) -> bool {
    if haystack.is_ascii() && needle_is_ascii {
        return find_ascii_ci(haystack.as_bytes(), needle_lower.as_bytes()).is_some();
    }
    lower_scratch.clear();
    for ch in haystack.chars() {
        for lc in ch.to_lowercase() {
            lower_scratch.push(lc);
        }
    }
    lower_scratch.contains(needle_lower)
}

#[inline]
fn rsplit_dot_bytes(bytes: &[u8]) -> &[u8] {
    match bytes.iter().rposition(|&b| b == b'.') {
        Some(pos) => &bytes[..pos],
        None => bytes,
    }
}

struct QueryScanParams<'a> {
    q_lower: &'a str,
    q_chars: &'a [char],
    q_is_ascii: bool,
    is_path_query: bool,
    q_mask: u64,
    limit: usize,
    ext_mask: Option<&'a ExtFilterMask<'a>>,
    type_filter: Option<&'a str>,
}

fn eval_record_score_only(
    arena: &ArenaState,
    rec: &HotRecord,
    rec_idx: usize,
    params: &QueryScanParams<'_>,
    min_needed_score: f64,
    scratch: &mut WorkerScratch,
) -> Option<(f64, &'static str)> {
    let q_lower = params.q_lower;
    let q_chars = params.q_chars;
    let q_is_ascii = params.q_is_ascii;
    let is_path_query = params.is_path_query;

    if !matches_record_filters(arena, rec, rec_idx, params.ext_mask, params.type_filter) {
        return None;
    }

    if !is_path_query {
        if rec.is_ascii() && q_is_ascii {
            let name_b = arena.name_bytes(rec);
            let q_b = q_lower.as_bytes();
            let stem_b = rsplit_dot_bytes(name_b);
            if name_b.eq_ignore_ascii_case(q_b) || stem_b.eq_ignore_ascii_case(q_b) {
                return Some((1.0, "exact"));
            }
            if min_needed_score > 0.97 {
                return None;
            }
            if name_b.len() >= q_b.len() && name_b[..q_b.len()].eq_ignore_ascii_case(q_b) {
                return Some((0.97, "prefix"));
            }
            if min_needed_score > 0.92 {
                return None;
            }
            if let Some(byte_pos) = find_ascii_ci(name_b, q_b) {
                let pos_penalty = (byte_pos as f64) * 0.0015;
                let s = (0.92 - pos_penalty).max(0.80);
                return Some((s, "substring"));
            }
            if min_needed_score > 0.85 {
                return None;
            }
            if let Some((fzf_score, _)) = score_fzf_ascii(name_b, q_b, false, &mut scratch.fzf) {
                return Some((fzf_score * 0.85, "fuzzy"));
            }
        } else if !rec.is_ascii() {
            let name = arena.name_str(rec);
            let name_lower = arena.lower_str(rec, rec_idx);
            let stem_lower = name_lower
                .rsplit_once('.')
                .map(|(s, _)| s)
                .unwrap_or(name_lower);

            if name_lower == q_lower || stem_lower == q_lower {
                return Some((1.0, "exact"));
            }
            if min_needed_score > 0.97 {
                return None;
            }
            if name_lower.starts_with(q_lower) {
                return Some((0.97, "prefix"));
            }
            if min_needed_score > 0.92 {
                return None;
            }
            if let Some(byte_pos) = name_lower.find(q_lower) {
                let pos_penalty = (byte_pos as f64) * 0.0015;
                let s = (0.92 - pos_penalty).max(0.80);
                return Some((s, "substring"));
            }

            if min_needed_score > 0.90 {
                return None;
            }
            if rec.has_pinyin() && q_is_ascii {
                let py_init_raw = arena.py_init_str(rec, rec_idx);
                if !py_init_raw.is_empty() {
                    for variant in py_init_raw.split('|') {
                        if variant.starts_with(q_lower) {
                            return Some((0.90, "pinyin"));
                        }
                        if variant.contains(q_lower) {
                            return Some((0.84, "pinyin"));
                        }
                    }
                    let py_full_raw = arena.py_full_str(rec, rec_idx);
                    for (v_idx, full_var) in py_full_raw.split('|').enumerate() {
                        if full_var.starts_with(q_lower) && v_idx == 0 {
                            return Some((0.90, "pinyin"));
                        }
                        if full_var.contains(q_lower) {
                            return Some((0.82, "pinyin"));
                        }
                    }
                }
            }

            if min_needed_score > 0.85 {
                return None;
            }
            if let Some((fzf_score, _)) =
                score_fzf_subsequence(name, q_chars, q_lower, false, &mut scratch.fzf)
            {
                return Some((fzf_score * 0.85, "fuzzy"));
            }
        }
    }

    if min_needed_score > 0.72 {
        return None;
    }

    arena.dirs.write_dir_to(rec.dir_id, &mut scratch.path_buf);
    if !is_path_query
        && !contains_ci(
            &scratch.path_buf,
            q_lower,
            q_is_ascii,
            &mut scratch.lower_buf,
        )
    {
        return None;
    }

    if !scratch.path_buf.is_empty() && !scratch.path_buf.ends_with(['/', '\\']) {
        let sep = if scratch.path_buf.contains('\\') && !scratch.path_buf.contains('/') {
            '\\'
        } else {
            '/'
        };
        scratch.path_buf.push(sep);
    }
    scratch.path_buf.push_str(arena.name_str(rec));

    if let Some((path_score, _)) =
        score_fzf_subsequence(&scratch.path_buf, q_chars, q_lower, false, &mut scratch.fzf)
    {
        return Some((path_score * 0.72, "path"));
    }
    if contains_ci(
        &scratch.path_buf,
        q_lower,
        q_is_ascii,
        &mut scratch.lower_buf,
    ) {
        return Some((0.70, "path"));
    }

    None
}

fn scan_record_range(
    arena: &ArenaState,
    params: &QueryScanParams<'_>,
    start: usize,
    end: usize,
) -> (usize, usize, BinaryHeap<HeapCandidate>) {
    let mut rejected = 0usize;
    let mut evaluated = 0usize;
    let mut scratch = WorkerScratch::new();
    let mut heap: BinaryHeap<HeapCandidate> = BinaryHeap::with_capacity(params.limit.min(256) + 1);
    let records = &arena.records;

    for (idx, rec) in records.iter().enumerate().take(end).skip(start) {
        if rec.is_deleted() {
            continue;
        }
        if (rec.char_mask & params.q_mask) != params.q_mask {
            rejected += 1;
            continue;
        }
        evaluated += 1;
        let Some(min_needed) = heap_min_needed_score(&heap, params.limit, rec, idx as u32) else {
            continue;
        };
        if let Some((score, match_kind)) =
            eval_record_score_only(arena, rec, idx, params, min_needed, &mut scratch)
        {
            push_top_k(
                &mut heap,
                params.limit,
                HeapCandidate {
                    idx: idx as u32,
                    score,
                    mtime_sec: rec.mtime_sec,
                    name_len: rec.name_len,
                    match_kind,
                },
            );
        }
    }

    (rejected, evaluated, heap)
}

pub fn search_arena(
    arena: &ArenaState,
    query: &str,
    limit: usize,
    extensions: Option<&Vec<String>>,
    type_filter: Option<&str>,
) -> NativeSearchOutcome {
    let started = Instant::now();
    let trimmed = query.trim();
    let ext_lower: Option<Vec<String>> = extensions.map(|list| {
        list.iter()
            .map(|e| e.trim().trim_start_matches('.').to_lowercase())
            .filter(|e| !e.is_empty())
            .collect()
    });
    let has_filter = ext_lower.as_ref().is_some_and(|v| !v.is_empty()) || type_filter.is_some();

    if (trimmed.is_empty() && !has_filter) || limit == 0 || arena.records.is_empty() {
        return NativeSearchOutcome {
            items: Vec::new(),
            total_indexed: arena.active_files + arena.active_dirs,
            bitmap_rejected: 0,
            evaluated_candidates: 0,
            duration_ms: started.elapsed().as_secs_f64() * 1000.0,
        };
    }

    let ext_mask = ext_lower
        .as_ref()
        .map(|list| ExtFilterMask::from_arena(arena, list));

    if trimmed.is_empty() {
        let mut evaluated = 0usize;
        let mut heap: BinaryHeap<HeapCandidate> = BinaryHeap::with_capacity(limit.min(256) + 1);
        for (idx, rec) in arena.records.iter().enumerate() {
            if !matches_record_filters(arena, rec, idx, ext_mask.as_ref(), type_filter) {
                continue;
            }
            evaluated += 1;
            if heap.len() == limit
                && let Some(worst) = heap.peek()
                && (rec.mtime_sec < worst.mtime_sec
                    || (rec.mtime_sec == worst.mtime_sec && rec.name_len >= worst.name_len))
            {
                continue;
            }
            push_top_k(
                &mut heap,
                limit,
                HeapCandidate {
                    idx: idx as u32,
                    score: 0.4,
                    mtime_sec: rec.mtime_sec,
                    name_len: rec.name_len,
                    match_kind: "filter",
                },
            );
        }
        let top_k = heap.into_sorted_vec();
        return build_search_outcome(arena, top_k, "", &[], 0, evaluated, started);
    }

    let q_lower = trimmed.to_lowercase();
    let q_is_ascii = q_lower.is_ascii();
    let is_path_query = q_lower.contains('/') || q_lower.contains('\\');
    let q_chars: Vec<char> = if q_is_ascii {
        Vec::new()
    } else {
        q_lower.chars().collect()
    };
    let params = QueryScanParams {
        q_lower: &q_lower,
        q_chars: &q_chars,
        q_is_ascii,
        is_path_query,
        q_mask: compute_char_mask(&q_lower),
        limit,
        ext_mask: ext_mask.as_ref(),
        type_filter,
    };

    let total_records = arena.records.len();
    let (bitmap_rejected, evaluated, top_k) = if total_records < 16_384 {
        let (rejected, eval, heap) = scan_record_range(arena, &params, 0, total_records);
        (rejected, eval, heap.into_sorted_vec())
    } else {
        let num_chunks = 8usize.min((total_records / 4096).max(1));
        let chunk_size = total_records.div_ceil(num_chunks);
        let chunk_results: Vec<Mutex<(usize, usize, Vec<HeapCandidate>)>> = (0..num_chunks)
            .map(|_| Mutex::new((0, 0, Vec::new())))
            .collect();

        let pool = SearchPool::init_global();
        let chunk_results_ref = &chunk_results;
        let params_ref = &params;

        pool.scope_chunks(num_chunks, &|chunk_idx| {
            let start = chunk_idx * chunk_size;
            let end = ((chunk_idx + 1) * chunk_size).min(total_records);
            if start >= end {
                return;
            }
            let (local_rejected, local_eval, local_heap) =
                scan_record_range(arena, params_ref, start, end);
            if let Ok(mut guard) = chunk_results_ref[chunk_idx].lock() {
                *guard = (local_rejected, local_eval, local_heap.into_vec());
            }
        });

        let mut total_rejected = 0usize;
        let mut total_eval = 0usize;
        let mut merged_heap = BinaryHeap::with_capacity(limit.min(256) + 1);
        for slot in chunk_results {
            if let Ok(mut guard) = slot.lock() {
                total_rejected += guard.0;
                total_eval += guard.1;
                for item in guard.2.drain(..) {
                    push_top_k(&mut merged_heap, limit, item);
                }
            }
        }
        (total_rejected, total_eval, merged_heap.into_sorted_vec())
    };

    build_search_outcome(
        arena,
        top_k,
        &q_lower,
        &q_chars,
        bitmap_rejected,
        evaluated,
        started,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::RawScannedEntry;

    #[test]
    fn matches_exact_fuzzy_pinyin_utf16_ranges_and_mtime_ms() {
        let mut arena = ArenaState::new();
        arena.replace_all(
            vec![
                RawScannedEntry {
                    dir: "/Users/dev/project".into(),
                    name: "file-provider-search-result-service.ts".into(),
                    is_dir: false,
                    mtime_sec: 100,
                },
                RawScannedEntry {
                    dir: "/Users/dev/docs".into(),
                    name: "重庆架构方案😀.md".into(),
                    is_dir: false,
                    mtime_sec: 200,
                },
                RawScannedEntry {
                    dir: "/Users/dev/docs".into(),
                    name: "😀重庆报告.pdf".into(),
                    is_dir: false,
                    mtime_sec: 250,
                },
            ],
            1.0,
        );

        let fzf = search_arena(&arena, "fpsr", 10, None, None);
        assert_eq!(fzf.items.len(), 1);
        assert_eq!(fzf.items[0].name, "file-provider-search-result-service.ts");
        assert_eq!(fzf.items[0].mtime_sec, 100);
        assert_eq!(fzf.items[0].mtime_ms, 100_000.0);

        let cq = search_arena(&arena, "cq", 10, None, None);
        assert_eq!(cq.items.len(), 2);
        let first = cq
            .items
            .iter()
            .find(|i| i.name == "重庆架构方案😀.md")
            .unwrap();
        assert_eq!(first.matched_ranges, vec![vec![0, 2]]);
        assert_eq!(first.mtime_ms, 200_000.0);
        let emoji_lead = cq
            .items
            .iter()
            .find(|i| i.name == "😀重庆报告.pdf")
            .unwrap();
        assert_eq!(emoji_lead.matched_ranges, vec![vec![2, 4]]);
        assert_eq!(emoji_lead.mtime_ms, 250_000.0);

        let full_cq = search_arena(&arena, "chongqing", 10, None, None);
        assert_eq!(full_cq.items.len(), 2);
        let hit = full_cq
            .items
            .iter()
            .find(|i| i.name == "😀重庆报告.pdf")
            .unwrap();
        assert_eq!(hit.matched_ranges, vec![vec![2, 4]]);
    }

    #[test]
    fn bounded_top_k_heap_matches_full_sort_and_recency_scan() {
        let mut arena = ArenaState::new();
        let mut entries = Vec::with_capacity(20_003);
        for i in 0..20_000u32 {
            let name = if i % 17 == 0 {
                format!("report_alpha_{i}.md")
            } else if i % 13 == 0 {
                format!("report_{i:05}_summary.ts")
            } else {
                format!("unrelated_item_{i}.txt")
            };
            entries.push(RawScannedEntry {
                dir: format!("/Users/dev/dir_{}", i % 50),
                name,
                is_dir: false,
                mtime_sec: (i * 37) % 10_000,
            });
        }
        entries.push(RawScannedEntry {
            dir: "/Users/dev/a".into(),
            name: "report.md".into(),
            is_dir: false,
            mtime_sec: 5000,
        });
        entries.push(RawScannedEntry {
            dir: "/Users/dev/b".into(),
            name: "report".into(),
            is_dir: false,
            mtime_sec: 5000,
        });
        entries.push(RawScannedEntry {
            dir: "/Users/dev/c".into(),
            name: "report.ts".into(),
            is_dir: false,
            mtime_sec: 9000,
        });

        arena.replace_all(entries, 1.0);

        let top15 = search_arena(&arena, "report", 15, None, None);
        let all = search_arena(&arena, "report", 5000, None, None);
        assert_eq!(top15.items.len(), 15);
        assert_eq!(top15.items[0].name, "report.ts");
        assert_eq!(top15.items[0].mtime_ms, 9_000_000.0);
        assert_eq!(top15.items[1].name, "report");

        let top_paths: Vec<&str> = top15.items.iter().map(|i| i.path.as_str()).collect();
        let all_paths: Vec<&str> = all.items.iter().take(15).map(|i| i.path.as_str()).collect();
        assert_eq!(top_paths, all_paths);

        // Empty-query recency scan (extension + typeFilter)
        let md_top5 = search_arena(&arena, "", 5, Some(&vec![".md".to_string()]), Some("file"));
        assert_eq!(md_top5.items.len(), 5);
        for w in md_top5.items.windows(2) {
            assert!(w[0].mtime_ms >= w[1].mtime_ms);
            assert_eq!(w[0].mtime_ms, (w[0].mtime_sec as f64) * 1000.0);
            assert_eq!(w[0].extension, ".md");
        }

        // Empty-query typeFilter-only recency scan (`listRecentFiles` hot path)
        let recent_files = search_arena(&arena, "", 10, None, Some("file"));
        assert_eq!(recent_files.items.len(), 10);
        for w in recent_files.items.windows(2) {
            assert!(w[0].mtime_ms >= w[1].mtime_ms);
        }
    }
}
