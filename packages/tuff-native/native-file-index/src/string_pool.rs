const EMPTY_BUCKET: u32 = u32::MAX;
pub const NO_PARENT: u32 = u32::MAX;
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0100_0000_01b3;

#[inline]
pub fn fnv1a_bytes(bytes: &[u8]) -> u64 {
    fnv1a_extend(FNV_OFFSET, bytes)
}

#[inline]
pub fn fnv1a_extend(mut h: u64, bytes: &[u8]) -> u64 {
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(FNV_PRIME);
    }
    h
}

#[inline]
pub fn fnv1a_push_byte(mut h: u64, b: u8) -> u64 {
    h ^= b as u64;
    h.wrapping_mul(FNV_PRIME)
}

#[inline]
pub fn compute_char_mask_bytes(bytes: &[u8]) -> u64 {
    let mut mask = 0u64;
    for &b in bytes {
        let bit = match b {
            b'a'..=b'z' => (b - b'a') as u32,
            b'A'..=b'Z' => (b - b'A') as u32,
            b'0'..=b'9' => 26 + (b - b'0') as u32,
            b'-' => 36,
            b'_' => 37,
            b'.' => 38,
            b' ' => 39,
            b'/' | b'\\' => 40,
            b'@' | b'+' | b'#' | b'$' => 41,
            0x80..=0xFF => 42,
            _ => continue,
        };
        mask |= 1u64 << bit;
    }
    mask
}

/// Contiguous UTF-8 byte slab indexed by `(u32 offset, u16 length)`.
#[derive(Debug, Clone, Default)]
pub struct Utf8Slab {
    buf: Vec<u8>,
}

impl Utf8Slab {
    pub fn with_capacity(cap: usize) -> Self {
        Self {
            buf: Vec::with_capacity(cap),
        }
    }

    #[inline]
    pub fn clear(&mut self) {
        self.buf.clear();
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.buf.len()
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.buf.is_empty()
    }

    #[inline]
    pub fn capacity(&self) -> usize {
        self.buf.capacity()
    }

    #[inline]
    pub fn as_bytes(&self) -> &[u8] {
        &self.buf
    }

    #[inline]
    pub fn append_str(&mut self, s: &str) -> Option<(u32, u16)> {
        let bytes = s.as_bytes();
        if bytes.len() > u16::MAX as usize {
            return None;
        }
        let off = self.buf.len();
        if off.checked_add(bytes.len())? > u32::MAX as usize {
            return None;
        }
        self.buf.extend_from_slice(bytes);
        Some((off as u32, bytes.len() as u16))
    }

    #[inline]
    pub fn extend_raw_validated(&mut self, raw: &[u8]) {
        self.buf.extend_from_slice(raw);
    }

    #[inline]
    pub fn reserve(&mut self, additional: usize) {
        self.buf.reserve(additional);
    }

    #[inline]
    pub fn get_bytes(&self, off: u32, len: u16) -> &[u8] {
        let start = off as usize;
        let end = start + len as usize;
        &self.buf[start..end]
    }

    #[inline]
    pub fn get_str(&self, off: u32, len: u16) -> &str {
        // SAFETY: Only valid UTF-8 strings (`&str` via `append_str` or validated via `from_utf8`)
        // are stored in `Utf8Slab`, and offsets/lengths always fall on UTF-8 char boundaries.
        unsafe { std::str::from_utf8_unchecked(self.get_bytes(off, len)) }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct DirNode {
    pub parent: u32,
    pub seg_off: u32,
    pub full_len: u32,
    pub seg_len: u16,
    pub sep: u8,
    pub _pad: u8,
    pub full_hash: u64,
    pub tail_mask: u64,
}

/// Compact parent-trie directory interner backed by a single `Utf8Slab` and
/// an open-addressed `Vec<u32>` bucket table (zero per-directory `String` allocs).
#[derive(Debug, Clone)]
pub struct DirTable {
    pub slab: Utf8Slab,
    pub nodes: Vec<DirNode>,
    pub buckets: Vec<u32>,
}

impl Default for DirTable {
    fn default() -> Self {
        Self::with_capacity(4096)
    }
}

impl DirTable {
    pub fn with_capacity(node_cap: usize) -> Self {
        let bucket_cap = (node_cap * 2).next_power_of_two().max(16);
        Self {
            slab: Utf8Slab::with_capacity(node_cap * 16),
            nodes: Vec::with_capacity(node_cap),
            buckets: vec![EMPTY_BUCKET; bucket_cap],
        }
    }

    pub fn clear(&mut self) {
        self.slab.clear();
        self.nodes.clear();
        self.buckets.fill(EMPTY_BUCKET);
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    pub fn memory_bytes(&self) -> usize {
        self.slab.capacity()
            + self.nodes.capacity() * std::mem::size_of::<DirNode>()
            + self.buckets.capacity() * std::mem::size_of::<u32>()
    }

    #[inline]
    pub fn hash_of(&self, dir_id: u32) -> u64 {
        self.nodes
            .get(dir_id as usize)
            .map(|n| n.full_hash)
            .unwrap_or(FNV_OFFSET)
    }

    #[inline]
    pub fn tail_mask(&self, dir_id: u32) -> u64 {
        self.nodes
            .get(dir_id as usize)
            .map(|n| n.tail_mask)
            .unwrap_or(1u64 << 40)
    }

    #[inline]
    pub fn full_len(&self, dir_id: u32) -> usize {
        self.nodes
            .get(dir_id as usize)
            .map(|n| n.full_len as usize)
            .unwrap_or(0)
    }

    #[inline]
    pub fn ends_with_sep(&self, dir_id: u32) -> bool {
        let Some(node) = self.nodes.get(dir_id as usize) else {
            return false;
        };
        let seg = self.slab.get_bytes(node.seg_off, node.seg_len);
        matches!(seg.last(), Some(b'/') | Some(b'\\'))
    }

    /// Compares a stored `dir_id` against `target` in O(depth) with zero heap allocation.
    pub fn dir_equals(&self, mut dir_id: u32, mut target: &str) -> bool {
        let Some(first) = self.nodes.get(dir_id as usize) else {
            return false;
        };
        if first.full_len as usize != target.len() {
            return false;
        }
        loop {
            let node = &self.nodes[dir_id as usize];
            let seg = self.slab.get_str(node.seg_off, node.seg_len);
            if !target.ends_with(seg) {
                return false;
            }
            target = &target[..target.len() - seg.len()];
            if node.parent == NO_PARENT {
                return node.sep == 0 && target.is_empty();
            }
            if node.sep != 0 {
                if target.as_bytes().last() != Some(&node.sep) {
                    return false;
                }
                target = &target[..target.len() - 1];
            }
            dir_id = node.parent;
        }
    }

    pub fn lookup(&self, dir: &str) -> Option<u32> {
        if self.nodes.is_empty() || self.buckets.is_empty() {
            return None;
        }
        let hash = fnv1a_bytes(dir.as_bytes());
        let mask = self.buckets.len() - 1;
        let mut slot = (hash as usize) & mask;
        loop {
            let idx = self.buckets[slot];
            if idx == EMPTY_BUCKET {
                return None;
            }
            let node = &self.nodes[idx as usize];
            if node.full_hash == hash && self.dir_equals(idx, dir) {
                return Some(idx);
            }
            slot = (slot + 1) & mask;
        }
    }

    pub fn intern_dir(&mut self, dir: &str) -> u32 {
        let hash = fnv1a_bytes(dir.as_bytes());
        if let Some(existing) = self.lookup_with_hash(dir, hash) {
            return existing;
        }

        let (parent, sep, seg) = match split_dir_segment(dir) {
            Some((parent_str, sep, seg)) => (self.intern_dir(parent_str), sep, seg),
            None => (NO_PARENT, 0, dir),
        };

        let (seg_off, seg_len) = self
            .slab
            .append_str(seg)
            .expect("directory segment exceeds slab capacity");

        let tail_seg = seg.rsplit(['/', '\\']).next().unwrap_or("");
        let tail_mask = compute_tail_mask(tail_seg);
        let full_len = dir.len() as u32;
        let id = self.nodes.len() as u32;

        self.nodes.push(DirNode {
            parent,
            seg_off,
            full_len,
            seg_len,
            sep,
            _pad: 0,
            full_hash: hash,
            tail_mask,
        });
        self.insert_bucket(id, hash);
        id
    }

    /// Reconstructs a directory string into `out` (cleared first) without extra allocations.
    pub fn write_dir_to(&self, dir_id: u32, out: &mut String) {
        out.clear();
        let Some(leaf) = self.nodes.get(dir_id as usize) else {
            return;
        };
        out.reserve(leaf.full_len as usize);

        let mut stack_buf = [0u32; 48];
        let mut stack_len = 0usize;
        let mut overflow: Option<Vec<u32>> = None;

        let mut cur = dir_id;
        while cur != NO_PARENT {
            if let Some(ref mut vec) = overflow {
                vec.push(cur);
            } else if stack_len < stack_buf.len() {
                stack_buf[stack_len] = cur;
                stack_len += 1;
            } else {
                let mut vec = Vec::with_capacity(64);
                vec.extend_from_slice(&stack_buf);
                vec.push(cur);
                overflow = Some(vec);
            }
            cur = self.nodes[cur as usize].parent;
        }

        let chain: &[u32] = match overflow {
            Some(ref vec) => vec.as_slice(),
            None => &stack_buf[..stack_len],
        };

        for &id in chain.iter().rev() {
            let node = &self.nodes[id as usize];
            if node.sep != 0 {
                out.push(node.sep as char);
            }
            out.push_str(self.slab.get_str(node.seg_off, node.seg_len));
        }
    }

    /// Allocates and returns `dir/name` (or `dir\name` on Windows paths) in a single `String`.
    pub fn build_full_path(&self, dir_id: u32, name: &str) -> String {
        let dir_len = self.full_len(dir_id);
        if dir_len == 0 {
            return name.to_owned();
        }
        let ends_sep = self.ends_with_sep(dir_id);
        let mut out = String::with_capacity(dir_len + usize::from(!ends_sep) + name.len());
        self.write_dir_to(dir_id, &mut out);
        if !ends_sep {
            let sep = if out.contains('\\') && !out.contains('/') {
                '\\'
            } else {
                '/'
            };
            out.push(sep);
        }
        out.push_str(name);
        out
    }

    /// Returns true if `dir_id == ancestor_id` or `ancestor_id` is in `dir_id`'s parent chain.
    pub fn is_self_or_ancestor(&self, mut dir_id: u32, ancestor_id: u32) -> bool {
        let Some(anc) = self.nodes.get(ancestor_id as usize) else {
            return false;
        };
        let anc_len = anc.full_len;
        while dir_id != NO_PARENT {
            if dir_id == ancestor_id {
                return true;
            }
            let node = &self.nodes[dir_id as usize];
            if node.full_len <= anc_len {
                return false;
            }
            dir_id = node.parent;
        }
        false
    }

    /// Returns true if the reconstructed directory begins with `/` (or is empty).
    pub fn starts_with_slash(&self, mut dir_id: u32) -> bool {
        while dir_id != NO_PARENT {
            let node = &self.nodes[dir_id as usize];
            if node.parent == NO_PARENT {
                let seg = self.slab.get_bytes(node.seg_off, node.seg_len);
                return seg.first() == Some(&b'/');
            }
            if node.parent != NO_PARENT {
                let p = &self.nodes[node.parent as usize];
                if p.full_len == 0 {
                    return node.sep == b'/';
                }
            }
            dir_id = node.parent;
        }
        false
    }

    /// Inserts a pre-validated node during snapshot loading.
    pub fn push_snapshot_node(
        &mut self,
        parent: u32,
        seg_off: u32,
        seg_len: u16,
        sep: u8,
    ) -> Result<u32, String> {
        let seg_bytes = self.slab.get_bytes(seg_off, seg_len);
        let seg_str = std::str::from_utf8(seg_bytes).map_err(|e| e.to_string())?;
        let (full_len, full_hash) = if parent == NO_PARENT {
            (seg_bytes.len() as u32, fnv1a_bytes(seg_bytes))
        } else {
            let p = self
                .nodes
                .get(parent as usize)
                .ok_or_else(|| "Invalid snapshot DirNode parent index".to_string())?;
            let mut h = p.full_hash;
            let mut len = p.full_len;
            if sep != 0 {
                h = fnv1a_push_byte(h, sep);
                len = len.saturating_add(1);
            }
            h = fnv1a_extend(h, seg_bytes);
            len = len.saturating_add(seg_bytes.len() as u32);
            (len, h)
        };

        let tail_seg = seg_str.rsplit(['/', '\\']).next().unwrap_or("");
        let tail_mask = compute_tail_mask(tail_seg);
        let id = self.nodes.len() as u32;
        self.nodes.push(DirNode {
            parent,
            seg_off,
            full_len,
            seg_len,
            sep,
            _pad: 0,
            full_hash,
            tail_mask,
        });
        self.insert_bucket(id, full_hash);
        Ok(id)
    }

    pub fn reserve_buckets_for(&mut self, expected_nodes: usize) {
        let needed = (expected_nodes * 2).next_power_of_two().max(16);
        if needed > self.buckets.len() {
            self.buckets.resize(needed, EMPTY_BUCKET);
            self.rehash_buckets();
        }
    }

    fn lookup_with_hash(&self, dir: &str, hash: u64) -> Option<u32> {
        if self.buckets.is_empty() {
            return None;
        }
        let mask = self.buckets.len() - 1;
        let mut slot = (hash as usize) & mask;
        loop {
            let idx = self.buckets[slot];
            if idx == EMPTY_BUCKET {
                return None;
            }
            let node = &self.nodes[idx as usize];
            if node.full_hash == hash && self.dir_equals(idx, dir) {
                return Some(idx);
            }
            slot = (slot + 1) & mask;
        }
    }

    fn insert_bucket(&mut self, dir_id: u32, hash: u64) {
        if (self.nodes.len() * 2) > self.buckets.len() {
            let new_len = (self.buckets.len() * 2).max(16);
            self.buckets.resize(new_len, EMPTY_BUCKET);
            self.rehash_buckets();
            return;
        }
        let mask = self.buckets.len() - 1;
        let mut slot = (hash as usize) & mask;
        while self.buckets[slot] != EMPTY_BUCKET {
            slot = (slot + 1) & mask;
        }
        self.buckets[slot] = dir_id;
    }

    fn rehash_buckets(&mut self) {
        self.buckets.fill(EMPTY_BUCKET);
        let mask = self.buckets.len() - 1;
        for (idx, node) in self.nodes.iter().enumerate() {
            let mut slot = (node.full_hash as usize) & mask;
            while self.buckets[slot] != EMPTY_BUCKET {
                slot = (slot + 1) & mask;
            }
            self.buckets[slot] = idx as u32;
        }
    }
}

#[inline]
pub fn compute_tail_mask(tail_seg: &str) -> u64 {
    let mut mask = 1u64 << 40;
    if tail_seg.is_ascii() {
        mask |= compute_char_mask_bytes(tail_seg.as_bytes());
    } else {
        let lower = tail_seg.to_lowercase();
        mask |= compute_char_mask_bytes(lower.as_bytes());
    }
    mask
}

#[inline]
fn split_dir_segment(dir: &str) -> Option<(&str, u8, &str)> {
    let pos = dir.rfind(['/', '\\'])?;
    if pos + 1 >= dir.len() {
        return None;
    }
    let sep = dir.as_bytes()[pos];
    Some((&dir[..pos], sep, &dir[pos + 1..]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dir_trie_interns_reconstructs_and_checks_ancestors() {
        let mut dirs = DirTable::with_capacity(16);
        let root_id = dirs.intern_dir("/");
        let sub_id = dirs.intern_dir("/Users/dev/project");
        let deep_id = dirs.intern_dir("/Users/dev/project/src/components");
        let win_id = dirs.intern_dir("C:\\Workspace\\src");
        let empty_id = dirs.intern_dir("");

        assert_eq!(dirs.lookup("/Users/dev/project"), Some(sub_id));
        assert_eq!(dirs.intern_dir("/Users/dev/project"), sub_id);

        let mut buf = String::new();
        dirs.write_dir_to(root_id, &mut buf);
        assert_eq!(buf, "/");
        dirs.write_dir_to(deep_id, &mut buf);
        assert_eq!(buf, "/Users/dev/project/src/components");
        dirs.write_dir_to(win_id, &mut buf);
        assert_eq!(buf, "C:\\Workspace\\src");
        dirs.write_dir_to(empty_id, &mut buf);
        assert_eq!(buf, "");

        assert!(dirs.dir_equals(deep_id, "/Users/dev/project/src/components"));
        assert!(!dirs.dir_equals(deep_id, "/Users/dev/project/src/other"));
        assert!(dirs.is_self_or_ancestor(deep_id, sub_id));
        assert!(dirs.is_self_or_ancestor(sub_id, sub_id));
        assert!(!dirs.is_self_or_ancestor(sub_id, deep_id));
        assert_eq!(
            dirs.build_full_path(sub_id, "index.ts"),
            "/Users/dev/project/index.ts"
        );
        assert_eq!(
            dirs.build_full_path(win_id, "main.rs"),
            "C:\\Workspace\\src\\main.rs"
        );
        assert_eq!(dirs.build_full_path(root_id, "etc"), "/etc");
        assert_eq!(dirs.build_full_path(empty_id, "foo.txt"), "foo.txt");
    }
}
