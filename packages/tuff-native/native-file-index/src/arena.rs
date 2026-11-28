use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::cjk_pinyin::{build_pinyin_projection, contains_cjk};
use crate::scanner::{RawScannedEntry, ScannedDirGroup};
use crate::string_pool::{DirTable, Utf8Slab, compute_char_mask_bytes, fnv1a_bytes};

const EMPTY_BUCKET: u32 = u32::MAX;
pub const EXT_NONE: u16 = 0;
pub const EXT_OVERFLOW: u16 = 1023;
const EXT_MAX_INTERNED: usize = 1022;

pub const FLAG_IS_DIR: u16 = 1 << 0;
pub const FLAG_DELETED: u16 = 1 << 1;
pub const FLAG_IS_ASCII: u16 = 1 << 2;
pub const FLAG_HAS_LOWER: u16 = 1 << 3;
pub const FLAG_HAS_PINYIN: u16 = 1 << 4;
const EXT_ID_SHIFT: u16 = 6;
const EXT_ID_MASK: u16 = 0x03FF;

#[inline]
pub fn compute_char_mask(s: &str) -> u64 {
    compute_char_mask_bytes(s.as_bytes())
}

#[inline]
pub fn hash_dir_id_and_name(dir_id: u32, name_bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in dir_id.to_le_bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h ^= 0xff;
    h = h.wrapping_mul(0x0100_0000_01b3);
    for &b in name_bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

/// Compact 24-byte hot search record packed for CPU L2/SLC cache residency.
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct HotRecord {
    pub char_mask: u64,
    pub mtime_sec: u32,
    pub dir_id: u32,
    pub name_off: u32,
    pub name_len: u16,
    pub flags: u16,
}

impl HotRecord {
    #[inline]
    pub fn pack_flags(
        is_dir: bool,
        deleted: bool,
        is_ascii: bool,
        has_lower: bool,
        has_pinyin: bool,
        ext_id: u16,
    ) -> u16 {
        let mut f = 0u16;
        if is_dir {
            f |= FLAG_IS_DIR;
        }
        if deleted {
            f |= FLAG_DELETED;
        }
        if is_ascii {
            f |= FLAG_IS_ASCII;
        }
        if has_lower {
            f |= FLAG_HAS_LOWER;
        }
        if has_pinyin {
            f |= FLAG_HAS_PINYIN;
        }
        f | ((ext_id & EXT_ID_MASK) << EXT_ID_SHIFT)
    }

    #[inline]
    pub fn is_dir(&self) -> bool {
        (self.flags & FLAG_IS_DIR) != 0
    }

    #[inline]
    pub fn is_deleted(&self) -> bool {
        (self.flags & FLAG_DELETED) != 0
    }

    #[inline]
    pub fn is_ascii(&self) -> bool {
        (self.flags & FLAG_IS_ASCII) != 0
    }

    #[inline]
    pub fn has_lower(&self) -> bool {
        (self.flags & FLAG_HAS_LOWER) != 0
    }

    #[inline]
    pub fn has_pinyin(&self) -> bool {
        (self.flags & FLAG_HAS_PINYIN) != 0
    }

    #[inline]
    pub fn has_cold(&self) -> bool {
        (self.flags & (FLAG_HAS_LOWER | FLAG_HAS_PINYIN)) != 0
    }

    #[inline]
    pub fn ext_id(&self) -> u16 {
        (self.flags >> EXT_ID_SHIFT) & EXT_ID_MASK
    }

    #[inline]
    pub fn set_deleted(&mut self, deleted: bool) {
        if deleted {
            self.flags |= FLAG_DELETED;
        } else {
            self.flags &= !FLAG_DELETED;
        }
    }

    #[inline]
    pub fn set_is_dir(&mut self, is_dir: bool) {
        if is_dir {
            self.flags |= FLAG_IS_DIR;
        } else {
            self.flags &= !FLAG_IS_DIR;
        }
    }

    #[inline]
    pub fn set_ext_id(&mut self, ext_id: u16) {
        self.flags = (self.flags & 0x003F) | ((ext_id & EXT_ID_MASK) << EXT_ID_SHIFT);
    }
}

/// Cold metadata stored ONLY for non-ASCII filenames with case-folding or CJK pinyin.
#[derive(Debug, Clone, Copy)]
pub struct ColdMeta {
    pub lower_off: u32,
    pub py_init_off: u32,
    pub py_full_off: u32,
    pub lower_len: u16,
    pub py_init_len: u16,
    pub py_full_len: u16,
}

#[derive(Debug, Clone, Default)]
pub struct ExtTable {
    map: HashMap<String, u16>,
}

impl ExtTable {
    pub fn clear(&mut self) {
        self.map.clear();
    }

    #[inline]
    pub fn is_full(&self) -> bool {
        self.map.len() >= EXT_MAX_INTERNED
    }

    #[inline]
    pub fn lookup_lower(&self, lower_ext: &str) -> Option<u16> {
        self.map.get(lower_ext).copied()
    }

    pub fn intern_file_name_ext(&mut self, name: &str) -> u16 {
        let Some((_, ext)) = name.rsplit_once('.') else {
            return EXT_NONE;
        };
        if ext.is_empty() {
            return EXT_NONE;
        }
        if ext.is_ascii() && ext.len() <= 32 {
            let mut buf = [0u8; 32];
            for (i, &b) in ext.as_bytes().iter().enumerate() {
                buf[i] = b.to_ascii_lowercase();
            }
            // SAFETY: `ext` is pure ASCII and lowercase ASCII bytes are valid UTF-8.
            let lower = unsafe { std::str::from_utf8_unchecked(&buf[..ext.len()]) };
            if let Some(&id) = self.map.get(lower) {
                return id;
            }
            if self.map.len() < EXT_MAX_INTERNED {
                let id = (self.map.len() as u16) + 1;
                self.map.insert(lower.to_owned(), id);
                return id;
            }
            return EXT_OVERFLOW;
        }
        let lower = ext.to_lowercase();
        if let Some(&id) = self.map.get(&lower) {
            return id;
        }
        if self.map.len() < EXT_MAX_INTERNED {
            let id = (self.map.len() as u16) + 1;
            self.map.insert(lower, id);
            return id;
        }
        EXT_OVERFLOW
    }

    pub fn memory_bytes(&self) -> usize {
        self.map.capacity() * (std::mem::size_of::<String>() + std::mem::size_of::<u16>() + 8)
    }
}

#[derive(Debug, Clone)]
pub struct ArenaState {
    pub dirs: DirTable,
    pub records: Vec<HotRecord>,
    pub name_slab: Utf8Slab,
    pub cold_slab: Utf8Slab,
    pub cold_metas: Vec<ColdMeta>,
    pub cold_map: HashMap<u32, u32>,
    pub record_buckets: Vec<u32>,
    pub exts: ExtTable,
    pub active_files: usize,
    pub active_dirs: usize,
    pub tombstones: usize,
    pub last_scan_ms: f64,
}

impl Default for ArenaState {
    fn default() -> Self {
        Self::new()
    }
}

impl ArenaState {
    pub fn new() -> Self {
        Self {
            dirs: DirTable::with_capacity(4096),
            records: Vec::with_capacity(32768),
            name_slab: Utf8Slab::with_capacity(1024 * 1024),
            cold_slab: Utf8Slab::with_capacity(64 * 1024),
            cold_metas: Vec::new(),
            cold_map: HashMap::new(),
            record_buckets: vec![EMPTY_BUCKET; 65536],
            exts: ExtTable::default(),
            active_files: 0,
            active_dirs: 0,
            tombstones: 0,
            last_scan_ms: 0.0,
        }
    }

    pub fn clear(&mut self) {
        self.dirs.clear();
        self.records.clear();
        self.name_slab.clear();
        self.cold_slab.clear();
        self.cold_metas.clear();
        self.cold_map.clear();
        self.record_buckets.fill(EMPTY_BUCKET);
        self.exts.clear();
        self.active_files = 0;
        self.active_dirs = 0;
        self.tombstones = 0;
        self.last_scan_ms = 0.0;
    }

    pub fn memory_bytes(&self) -> usize {
        self.records.capacity() * std::mem::size_of::<HotRecord>()
            + self.name_slab.capacity()
            + self.cold_slab.capacity()
            + self.cold_metas.capacity() * std::mem::size_of::<ColdMeta>()
            + self.cold_map.capacity() * 12
            + self.record_buckets.capacity() * std::mem::size_of::<u32>()
            + self.dirs.memory_bytes()
            + self.exts.memory_bytes()
    }

    #[inline]
    pub fn name_bytes(&self, rec: &HotRecord) -> &[u8] {
        self.name_slab.get_bytes(rec.name_off, rec.name_len)
    }

    #[inline]
    pub fn name_str(&self, rec: &HotRecord) -> &str {
        self.name_slab.get_str(rec.name_off, rec.name_len)
    }

    #[inline]
    pub fn cold_meta(&self, rec_idx: usize) -> Option<&ColdMeta> {
        let cold_idx = *self.cold_map.get(&(rec_idx as u32))?;
        self.cold_metas.get(cold_idx as usize)
    }

    #[inline]
    pub fn lower_str(&self, rec: &HotRecord, rec_idx: usize) -> &str {
        if !rec.has_lower() {
            return self.name_str(rec);
        }
        if let Some(meta) = self.cold_meta(rec_idx)
            && meta.lower_len > 0
        {
            return self.cold_slab.get_str(meta.lower_off, meta.lower_len);
        }
        self.name_str(rec)
    }

    #[inline]
    pub fn py_init_str(&self, rec: &HotRecord, rec_idx: usize) -> &str {
        if !rec.has_pinyin() {
            return "";
        }
        let Some(meta) = self.cold_meta(rec_idx) else {
            return "";
        };
        if meta.py_init_len == 0 {
            return "";
        }
        self.cold_slab.get_str(meta.py_init_off, meta.py_init_len)
    }

    #[inline]
    pub fn py_full_str(&self, rec: &HotRecord, rec_idx: usize) -> &str {
        if !rec.has_pinyin() {
            return "";
        }
        let Some(meta) = self.cold_meta(rec_idx) else {
            return "";
        };
        if meta.py_full_len == 0 {
            return "";
        }
        self.cold_slab.get_str(meta.py_full_off, meta.py_full_len)
    }

    pub fn try_reserve_for_records(&mut self, expected: usize) -> Result<(), String> {
        self.records
            .try_reserve(expected)
            .map_err(|e| format!("Arena records allocation failed: {e}"))?;
        let name_est = expected
            .checked_mul(24)
            .ok_or_else(|| "Arena name_slab reservation overflow".to_string())?;
        self.name_slab.try_reserve(name_est)?;
        let doubled = expected
            .checked_mul(2)
            .ok_or_else(|| "Arena record_buckets capacity overflow".to_string())?;
        let needed_buckets = doubled
            .checked_next_power_of_two()
            .ok_or_else(|| "Arena record_buckets power-of-two overflow".to_string())?
            .max(16);
        if needed_buckets > self.record_buckets.len() {
            self.record_buckets
                .try_reserve(needed_buckets - self.record_buckets.len())
                .map_err(|e| format!("Arena record_buckets allocation failed: {e}"))?;
            self.record_buckets.resize(needed_buckets, EMPTY_BUCKET);
            self.rehash_record_buckets();
        }
        Ok(())
    }

    pub fn reserve_for_records(&mut self, expected: usize) {
        let _ = self.try_reserve_for_records(expected);
    }

    pub fn replace_all(&mut self, entries: Vec<RawScannedEntry>, scan_ms: f64) {
        self.clear();
        self.last_scan_ms = scan_ms;
        self.reserve_for_records(entries.len());
        for entry in entries {
            self.upsert(&entry.dir, &entry.name, entry.is_dir, entry.mtime_sec);
        }
    }

    /// Replaces the entire arena directly from directory-grouped scan batches,
    /// interning each directory only once per group instead of once per file.
    pub fn replace_from_groups(&mut self, groups: Vec<ScannedDirGroup>, scan_ms: f64) {
        self.clear();
        self.last_scan_ms = scan_ms;
        let total_entries: usize = groups.iter().map(|g| g.entries.len()).sum();
        self.dirs.reserve_buckets_for(groups.len());
        self.reserve_for_records(total_entries);
        for group in groups {
            if group.entries.is_empty() {
                continue;
            }
            let Ok(dir_id) = self.dirs.try_intern_dir(&group.dir) else {
                continue;
            };
            for entry in group.entries {
                self.upsert_with_dir_id(dir_id, &entry.name, entry.is_dir, entry.mtime_sec);
            }
        }
    }

    pub fn upsert(&mut self, dir: &str, name: &str, is_dir: bool, mtime_sec: u32) {
        if name.is_empty() || name.len() > u16::MAX as usize {
            return;
        }
        let Ok(dir_id) = self.dirs.try_intern_dir(dir) else {
            return;
        };
        self.upsert_with_dir_id(dir_id, name, is_dir, mtime_sec);
    }

    pub fn upsert_with_dir_id(&mut self, dir_id: u32, name: &str, is_dir: bool, mtime_sec: u32) {
        if name.is_empty() || name.len() > u16::MAX as usize {
            return;
        }
        let key_hash = hash_dir_id_and_name(dir_id, name.as_bytes());
        if let Some(existing_idx) = self.find_record_bucket(dir_id, name.as_bytes(), key_hash) {
            let ext_id = if is_dir {
                EXT_NONE
            } else {
                self.exts.intern_file_name_ext(name)
            };
            let existing = &mut self.records[existing_idx as usize];
            if existing.is_deleted() {
                existing.set_deleted(false);
                self.tombstones = self.tombstones.saturating_sub(1);
                if is_dir {
                    self.active_dirs += 1;
                } else {
                    self.active_files += 1;
                }
            } else if existing.is_dir() != is_dir {
                if existing.is_dir() {
                    self.active_dirs = self.active_dirs.saturating_sub(1);
                    self.active_files += 1;
                } else {
                    self.active_files = self.active_files.saturating_sub(1);
                    self.active_dirs += 1;
                }
            }
            existing.set_is_dir(is_dir);
            existing.set_ext_id(ext_id);
            existing.mtime_sec = mtime_sec;
            return;
        }

        let Some((name_off, name_len)) = self.name_slab.append_str(name) else {
            return;
        };

        let is_ascii = name.is_ascii();
        let mut char_mask = self.dirs.tail_mask(dir_id) | compute_char_mask_bytes(name.as_bytes());
        let mut has_lower = false;
        let mut has_pinyin = false;

        if !is_ascii {
            let mut lower_off = 0u32;
            let mut lower_len = 0u16;
            let mut py_init_off = 0u32;
            let mut py_init_len = 0u16;
            let mut py_full_off = 0u32;
            let mut py_full_len = 0u16;

            let lower = name.to_lowercase();
            if lower != name
                && let Some((off, len)) = self.cold_slab.append_str(&lower)
            {
                lower_off = off;
                lower_len = len;
                has_lower = true;
                char_mask |= compute_char_mask_bytes(lower.as_bytes());
            }

            if contains_cjk(name) {
                let proj = build_pinyin_projection(name);
                if proj.has_cjk
                    && let (Some((io, il)), Some((fo, fl))) = (
                        self.cold_slab.append_str(&proj.initials),
                        self.cold_slab.append_str(&proj.full),
                    )
                {
                    py_init_off = io;
                    py_init_len = il;
                    py_full_off = fo;
                    py_full_len = fl;
                    has_pinyin = true;
                    char_mask |= compute_char_mask_bytes(proj.full.as_bytes());
                }
            }

            if has_lower || has_pinyin {
                let cold_idx = self.cold_metas.len() as u32;
                self.cold_metas.push(ColdMeta {
                    lower_off,
                    py_init_off,
                    py_full_off,
                    lower_len,
                    py_init_len,
                    py_full_len,
                });
                self.cold_map.insert(self.records.len() as u32, cold_idx);
            }
        }

        let ext_id = if is_dir {
            EXT_NONE
        } else {
            self.exts.intern_file_name_ext(name)
        };

        let idx = self.records.len() as u32;
        self.records.push(HotRecord {
            char_mask,
            mtime_sec,
            dir_id,
            name_off,
            name_len,
            flags: HotRecord::pack_flags(is_dir, false, is_ascii, has_lower, has_pinyin, ext_id),
        });
        self.insert_record_bucket(idx, key_hash);
        if is_dir {
            self.active_dirs += 1;
        } else {
            self.active_files += 1;
        }
    }

    pub fn has_full_path(&self, full_path: &str) -> bool {
        let p = Path::new(full_path);
        let Some(name_os) = p.file_name() else {
            return false;
        };
        let dir = p.parent().map(|d| d.to_string_lossy()).unwrap_or_default();
        let name = name_os.to_string_lossy();
        let Some(dir_id) = self.dirs.lookup(&dir) else {
            return false;
        };
        let key_hash = hash_dir_id_and_name(dir_id, name.as_bytes());
        let Some(idx) = self.find_record_bucket(dir_id, name.as_bytes(), key_hash) else {
            return false;
        };
        !self.records[idx as usize].is_deleted()
    }

    pub fn remove_full_path(&mut self, full_path: &str) -> bool {
        let p = Path::new(full_path);
        let Some(name_os) = p.file_name() else {
            return false;
        };
        let dir = p.parent().map(|d| d.to_string_lossy()).unwrap_or_default();
        let name = name_os.to_string_lossy();
        let Some(dir_id) = self.dirs.lookup(&dir) else {
            return false;
        };
        let key_hash = hash_dir_id_and_name(dir_id, name.as_bytes());
        if let Some(idx) = self.find_record_bucket(dir_id, name.as_bytes(), key_hash) {
            let rec = &mut self.records[idx as usize];
            if !rec.is_deleted() {
                rec.set_deleted(true);
                self.tombstones += 1;
                if rec.is_dir() {
                    self.active_dirs = self.active_dirs.saturating_sub(1);
                } else {
                    self.active_files = self.active_files.saturating_sub(1);
                }
                return true;
            }
        }
        false
    }

    pub fn remove_prefix(&mut self, prefix_path: &str) -> usize {
        let clean = prefix_path.trim_end_matches(['/', '\\']);
        let mut affected_dirs = HashSet::new();
        if clean.is_empty() {
            for dir_id in 0..self.dirs.len() {
                let d_id = dir_id as u32;
                if self.dirs.full_len(d_id) == 0 || self.dirs.starts_with_slash(d_id) {
                    affected_dirs.insert(d_id);
                }
            }
        } else if let Some(clean_id) = self.dirs.lookup(clean) {
            for dir_id in 0..self.dirs.len() {
                let d_id = dir_id as u32;
                if self.dirs.is_self_or_ancestor(d_id, clean_id) {
                    affected_dirs.insert(d_id);
                }
            }
        } else {
            let mut dir_buf = String::new();
            for dir_id in 0..self.dirs.len() {
                let d_id = dir_id as u32;
                if self.dirs.full_len(d_id) >= clean.len() {
                    self.dirs.write_dir_to(d_id, &mut dir_buf);
                    if dir_buf == clean
                        || (dir_buf.starts_with(clean)
                            && matches!(
                                dir_buf.as_bytes().get(clean.len()),
                                Some(b'/') | Some(b'\\')
                            ))
                    {
                        affected_dirs.insert(d_id);
                    }
                }
            }
        }

        let mut removed = usize::from(self.remove_full_path(clean));
        if affected_dirs.is_empty() {
            return removed;
        }
        for rec in &mut self.records {
            if !rec.is_deleted() && affected_dirs.contains(&rec.dir_id) {
                rec.set_deleted(true);
                self.tombstones += 1;
                removed += 1;
                if rec.is_dir() {
                    self.active_dirs = self.active_dirs.saturating_sub(1);
                } else {
                    self.active_files = self.active_files.saturating_sub(1);
                }
            }
        }
        removed
    }

    pub fn compact_if_needed(&mut self) {
        if self.records.is_empty() || self.tombstones * 6 < self.records.len() {
            return;
        }
        let mut next = ArenaState::new();
        next.last_scan_ms = self.last_scan_ms;
        next.reserve_for_records(self.records.len().saturating_sub(self.tombstones));
        let mut dir_buf = String::new();
        for rec in &self.records {
            if rec.is_deleted() {
                continue;
            }
            self.dirs.write_dir_to(rec.dir_id, &mut dir_buf);
            let name = self.name_str(rec);
            next.upsert(&dir_buf, name, rec.is_dir(), rec.mtime_sec);
        }
        *self = next;
    }

    #[inline]
    pub fn find_record_bucket(&self, dir_id: u32, name_bytes: &[u8], key_hash: u64) -> Option<u32> {
        if self.record_buckets.is_empty() {
            return None;
        }
        let mask = self.record_buckets.len() - 1;
        let mut slot = (key_hash as usize) & mask;
        loop {
            let idx = self.record_buckets[slot];
            if idx == EMPTY_BUCKET {
                return None;
            }
            let rec = &self.records[idx as usize];
            if rec.dir_id == dir_id && self.name_bytes(rec) == name_bytes {
                return Some(idx);
            }
            slot = (slot + 1) & mask;
        }
    }

    #[inline]
    pub fn insert_record_bucket(&mut self, rec_idx: u32, key_hash: u64) {
        if (self.records.len() * 2) > self.record_buckets.len() {
            let new_len = (self.record_buckets.len() * 2).max(16);
            self.record_buckets.resize(new_len, EMPTY_BUCKET);
            self.rehash_record_buckets();
            return;
        }
        let mask = self.record_buckets.len() - 1;
        let mut slot = (key_hash as usize) & mask;
        while self.record_buckets[slot] != EMPTY_BUCKET {
            slot = (slot + 1) & mask;
        }
        self.record_buckets[slot] = rec_idx;
    }

    fn rehash_record_buckets(&mut self) {
        self.record_buckets.fill(EMPTY_BUCKET);
        let mask = self.record_buckets.len() - 1;
        for (idx, rec) in self.records.iter().enumerate() {
            let name_bytes = self.name_slab.get_bytes(rec.name_off, rec.name_len);
            let key_hash = hash_dir_id_and_name(rec.dir_id, name_bytes);
            let mut slot = (key_hash as usize) & mask;
            while self.record_buckets[slot] != EMPTY_BUCKET {
                slot = (slot + 1) & mask;
            }
            self.record_buckets[slot] = idx as u32;
        }
    }

    pub fn save_snapshot(&self, snapshot_path: &Path) -> Result<usize, String> {
        crate::snapshot::save_snapshot(self, snapshot_path)
    }

    pub fn load_snapshot(&mut self, snapshot_path: &Path) -> Result<usize, String> {
        crate::snapshot::load_snapshot(self, snapshot_path)
    }
}

#[inline]
pub fn fnv1a_str(s: &str) -> u64 {
    fnv1a_bytes(s.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hot_record_size_is_24_bytes_and_handles_upsert_delete_has_path_and_compact() {
        assert_eq!(std::mem::size_of::<HotRecord>(), 24);

        let mut arena = ArenaState::new();
        arena.upsert("/Users/dev/project", "index.ts", false, 100);
        arena.upsert("/Users/dev/project/sub", "App.tsx", false, 200);
        arena.upsert("/Users/dev/project", "sub", true, 150);
        arena.upsert("/Users/dev/project/other", "keep.md", false, 300);

        assert!(arena.has_full_path("/Users/dev/project/index.ts"));
        assert!(arena.has_full_path("/Users/dev/project/sub/App.tsx"));
        assert!(!arena.has_full_path("/Users/dev/project/missing.ts"));

        // Prefix removal removes `/Users/dev/project/sub` and its children
        let removed = arena.remove_prefix("/Users/dev/project/sub");
        assert_eq!(removed, 2);
        assert!(!arena.has_full_path("/Users/dev/project/sub/App.tsx"));
        assert!(!arena.has_full_path("/Users/dev/project/sub"));
        assert!(arena.has_full_path("/Users/dev/project/index.ts"));

        // Force compaction
        arena.compact_if_needed();
        assert_eq!(arena.tombstones, 0);
        assert!(arena.has_full_path("/Users/dev/project/index.ts"));
        assert!(arena.has_full_path("/Users/dev/project/other/keep.md"));
        assert!(!arena.has_full_path("/Users/dev/project/sub/App.tsx"));

        // Re-upsert updates mtime cleanly
        arena.upsert("/Users/dev/project", "index.ts", false, 999);
        assert_eq!(arena.active_files, 2);
        assert!(arena.has_full_path("/Users/dev/project/index.ts"));
    }

    #[test]
    fn skips_lower_and_pinyin_slabs_for_pure_ascii() {
        let mut arena = ArenaState::new();
        arena.upsert("/tmp", "hello-world.ts", false, 1);
        assert_eq!(arena.cold_slab.len(), 0);
        assert_eq!(arena.cold_metas.len(), 0);

        arena.upsert("/tmp", "重庆报告.pdf", false, 2);
        assert_eq!(arena.cold_metas.len(), 1);
        // "重庆报告.pdf".to_lowercase() == "重庆报告.pdf", so lower is NOT duplicated
        assert!(!arena.records[1].has_lower());
        assert!(arena.records[1].has_pinyin());

        arena.upsert("/tmp", "重庆Report.pdf", false, 3);
        assert_eq!(arena.cold_metas.len(), 2);
        assert!(arena.records[2].has_lower());
        assert!(arena.records[2].has_pinyin());
    }
}
