use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use crate::arena::{
    ArenaState, ColdMeta, EXT_NONE, FLAG_HAS_LOWER, FLAG_HAS_PINYIN, FLAG_IS_ASCII, FLAG_IS_DIR,
    HotRecord, hash_dir_id_and_name,
};
use crate::string_pool::{NO_PARENT, compute_char_mask_bytes};

pub const SNAPSHOT_MAGIC: &[u8; 8] = b"TUFFIDX3";
const SNAPSHOT_VERSION_FLAGS: u32 = 1;
const SNAPSHOT_HEADER_LEN: usize = 40;
const WIRE_FLAG_SAME_DIR: u8 = 0x80;

#[inline]
fn write_varint_u32(out: &mut Vec<u8>, mut val: u32) {
    while val >= 0x80 {
        out.push((val as u8) | 0x80);
        val >>= 7;
    }
    out.push(val as u8);
}

#[inline]
fn read_varint_u32(buf: &[u8], cursor: &mut usize) -> Result<u32, String> {
    let mut result = 0u32;
    let mut shift = 0u32;
    for _ in 0..5 {
        let &b = buf
            .get(*cursor)
            .ok_or_else(|| "Unexpected EOF reading varint".to_string())?;
        *cursor += 1;
        result |= ((b & 0x7F) as u32) << shift;
        if (b & 0x80) == 0 {
            return Ok(result);
        }
        shift += 7;
    }
    Err("Malformed varint in TUFFIDX3 snapshot".to_string())
}

#[inline]
fn read_u32_le(buf: &[u8], cursor: &mut usize) -> Result<u32, String> {
    let slice = buf
        .get(*cursor..*cursor + 4)
        .ok_or_else(|| "Unexpected EOF reading u32".to_string())?;
    *cursor += 4;
    Ok(u32::from_le_bytes(slice.try_into().unwrap()))
}

#[inline]
fn read_f64_le(buf: &[u8], cursor: &mut usize) -> Result<f64, String> {
    let slice = buf
        .get(*cursor..*cursor + 8)
        .ok_or_else(|| "Unexpected EOF reading f64".to_string())?;
    *cursor += 8;
    Ok(f64::from_le_bytes(slice.try_into().unwrap()))
}

#[inline]
fn read_u8(buf: &[u8], cursor: &mut usize) -> Result<u8, String> {
    let &b = buf
        .get(*cursor)
        .ok_or_else(|| "Unexpected EOF reading u8".to_string())?;
    *cursor += 1;
    Ok(b)
}

#[inline]
fn read_slice<'a>(buf: &'a [u8], cursor: &mut usize, len: usize) -> Result<&'a [u8], String> {
    let end = cursor
        .checked_add(len)
        .ok_or_else(|| "Snapshot length overflow".to_string())?;
    let slice = buf
        .get(*cursor..end)
        .ok_or_else(|| "Unexpected EOF reading snapshot slice".to_string())?;
    *cursor = end;
    Ok(slice)
}

pub fn save_snapshot(arena: &ArenaState, snapshot_path: &Path) -> Result<usize, String> {
    if let Some(parent) = snapshot_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let active_count = arena.active_files + arena.active_dirs;
    let estimated_bytes = SNAPSHOT_HEADER_LEN
        + arena.dirs.slab.len()
        + arena.dirs.len() * 5
        + active_count * 34
        + arena.cold_slab.len();
    let mut out = Vec::with_capacity(estimated_bytes);
    out.resize(SNAPSHOT_HEADER_LEN, 0);

    // 1. Directory slab + compact DirNode table (parents always precede children)
    out.extend_from_slice(arena.dirs.slab.as_bytes());
    for node in &arena.dirs.nodes {
        write_varint_u32(&mut out, node.parent.wrapping_add(1));
        write_varint_u32(&mut out, node.seg_len as u32);
        out.push(node.sep);
    }

    // 2. Active records (delta-compressed dir_id + inline cold metadata only when present)
    let mut prev_dir_id = u32::MAX;
    let mut written_records = 0u32;
    let mut total_name_bytes = 0u32;
    let mut total_cold_bytes = 0u32;

    for (rec_idx, rec) in arena.records.iter().enumerate() {
        if rec.is_deleted() {
            continue;
        }
        written_records += 1;
        let same_dir = rec.dir_id == prev_dir_id;
        let wire_flags = ((rec.flags as u8) & 0x1D) | if same_dir { WIRE_FLAG_SAME_DIR } else { 0 };
        out.push(wire_flags);
        if !same_dir {
            write_varint_u32(&mut out, rec.dir_id);
            prev_dir_id = rec.dir_id;
        }
        out.extend_from_slice(&rec.mtime_sec.to_le_bytes());

        let name_bytes = arena.name_bytes(rec);
        write_varint_u32(&mut out, name_bytes.len() as u32);
        out.extend_from_slice(name_bytes);
        total_name_bytes = total_name_bytes.saturating_add(name_bytes.len() as u32);

        if rec.has_cold() {
            let meta = arena.cold_meta(rec_idx).copied().unwrap_or(ColdMeta {
                lower_off: 0,
                py_init_off: 0,
                py_full_off: 0,
                lower_len: 0,
                py_init_len: 0,
                py_full_len: 0,
            });
            if rec.has_lower() {
                let lb = arena.cold_slab.get_bytes(meta.lower_off, meta.lower_len);
                write_varint_u32(&mut out, lb.len() as u32);
                out.extend_from_slice(lb);
                total_cold_bytes = total_cold_bytes.saturating_add(lb.len() as u32);
            }
            if rec.has_pinyin() {
                let ib = arena
                    .cold_slab
                    .get_bytes(meta.py_init_off, meta.py_init_len);
                let fb = arena
                    .cold_slab
                    .get_bytes(meta.py_full_off, meta.py_full_len);
                write_varint_u32(&mut out, ib.len() as u32);
                out.extend_from_slice(ib);
                write_varint_u32(&mut out, fb.len() as u32);
                out.extend_from_slice(fb);
                total_cold_bytes = total_cold_bytes
                    .saturating_add(ib.len() as u32)
                    .saturating_add(fb.len() as u32);
            }
        }
    }

    // Patch 40-byte header in place
    out[0..8].copy_from_slice(SNAPSHOT_MAGIC);
    out[8..12].copy_from_slice(&SNAPSHOT_VERSION_FLAGS.to_le_bytes());
    out[12..20].copy_from_slice(&arena.last_scan_ms.to_le_bytes());
    out[20..24].copy_from_slice(&(arena.dirs.len() as u32).to_le_bytes());
    out[24..28].copy_from_slice(&(arena.dirs.slab.len() as u32).to_le_bytes());
    out[28..32].copy_from_slice(&written_records.to_le_bytes());
    out[32..36].copy_from_slice(&total_name_bytes.to_le_bytes());
    out[36..40].copy_from_slice(&total_cold_bytes.to_le_bytes());

    let temp_path = snapshot_path.with_extension("tmp");
    {
        let mut file = File::create(&temp_path).map_err(|e| e.to_string())?;
        file.write_all(&out).map_err(|e| e.to_string())?;
    }
    fs::rename(&temp_path, snapshot_path).map_err(|e| e.to_string())?;
    Ok(out.len())
}

pub fn load_snapshot(arena: &mut ArenaState, snapshot_path: &Path) -> Result<usize, String> {
    let raw = fs::read(snapshot_path).map_err(|e| e.to_string())?;
    if raw.len() < SNAPSHOT_HEADER_LEN || &raw[0..8] != SNAPSHOT_MAGIC {
        return Err("Invalid or unsupported snapshot header (expected TUFFIDX3)".to_string());
    }

    let mut cursor = 8usize;
    let version_flags = read_u32_le(&raw, &mut cursor)?;
    if version_flags != SNAPSHOT_VERSION_FLAGS {
        return Err(format!(
            "Unsupported TUFFIDX3 snapshot version flags: {version_flags}"
        ));
    }
    let last_scan_ms = read_f64_le(&raw, &mut cursor)?;
    let dir_node_count = read_u32_le(&raw, &mut cursor)? as usize;
    let dir_slab_len = read_u32_le(&raw, &mut cursor)? as usize;
    let record_count = read_u32_le(&raw, &mut cursor)? as usize;
    let name_slab_len = read_u32_le(&raw, &mut cursor)? as usize;
    let cold_slab_len = read_u32_le(&raw, &mut cursor)? as usize;

    let dir_slab_bytes = read_slice(&raw, &mut cursor, dir_slab_len)?;
    std::str::from_utf8(dir_slab_bytes).map_err(|e| e.to_string())?;

    let mut next = ArenaState::new();
    next.last_scan_ms = last_scan_ms;
    next.dirs.slab.reserve(dir_slab_len);
    next.dirs.slab.extend_raw_validated(dir_slab_bytes);
    next.dirs.nodes.reserve(dir_node_count);
    next.dirs.reserve_buckets_for(dir_node_count);

    let mut seg_off = 0usize;
    for i in 0..dir_node_count {
        let parent_enc = read_varint_u32(&raw, &mut cursor)?;
        let parent = parent_enc.wrapping_sub(1);
        if parent != NO_PARENT && (parent as usize) >= i {
            return Err("Invalid DirNode parent ordering in TUFFIDX3 snapshot".to_string());
        }
        let seg_len_u32 = read_varint_u32(&raw, &mut cursor)?;
        if seg_len_u32 > u16::MAX as u32 {
            return Err("DirNode segment length exceeds u16::MAX".to_string());
        }
        let seg_len = seg_len_u32 as usize;
        if seg_off + seg_len > dir_slab_len {
            return Err("DirNode segment out of dir_slab bounds".to_string());
        }
        let sep = read_u8(&raw, &mut cursor)?;
        next.dirs
            .push_snapshot_node(parent, seg_off as u32, seg_len as u16, sep)?;
        seg_off += seg_len;
    }

    next.reserve_for_records(record_count);
    if name_slab_len > next.name_slab.capacity() {
        next.name_slab.reserve(name_slab_len);
    }
    if cold_slab_len > 0 {
        next.cold_slab.reserve(cold_slab_len);
    }

    let mut prev_dir_id = u32::MAX;
    for _ in 0..record_count {
        let wire_flags = read_u8(&raw, &mut cursor)?;
        let same_dir = (wire_flags & WIRE_FLAG_SAME_DIR) != 0;
        let dir_id = if same_dir {
            if prev_dir_id == u32::MAX {
                return Err("Invalid SAME_DIR flag on first TUFFIDX3 record".to_string());
            }
            prev_dir_id
        } else {
            let d = read_varint_u32(&raw, &mut cursor)?;
            if (d as usize) >= dir_node_count {
                return Err("Record dir_id out of bounds in TUFFIDX3 snapshot".to_string());
            }
            prev_dir_id = d;
            d
        };

        let mtime_sec = read_u32_le(&raw, &mut cursor)?;
        let name_len_u32 = read_varint_u32(&raw, &mut cursor)?;
        if name_len_u32 == 0 || name_len_u32 > u16::MAX as u32 {
            return Err("Invalid record name length in TUFFIDX3 snapshot".to_string());
        }
        let name_bytes = read_slice(&raw, &mut cursor, name_len_u32 as usize)?;

        let is_dir = (wire_flags & (FLAG_IS_DIR as u8)) != 0;
        let is_ascii = (wire_flags & (FLAG_IS_ASCII as u8)) != 0;
        let has_lower = (wire_flags & (FLAG_HAS_LOWER as u8)) != 0;
        let has_pinyin = (wire_flags & (FLAG_HAS_PINYIN as u8)) != 0;

        let name_str = if is_ascii {
            if !name_bytes.is_ascii() {
                return Err("Non-ASCII bytes in ASCII-flagged TUFFIDX3 record".to_string());
            }
            // SAFETY: Verified `name_bytes.is_ascii()` above.
            unsafe { std::str::from_utf8_unchecked(name_bytes) }
        } else {
            std::str::from_utf8(name_bytes).map_err(|e| e.to_string())?
        };

        let (name_off, name_len) = next
            .name_slab
            .append_str(name_str)
            .ok_or_else(|| "name_slab capacity exceeded loading snapshot".to_string())?;

        let mut char_mask = next.dirs.tail_mask(dir_id) | compute_char_mask_bytes(name_bytes);
        if has_lower || has_pinyin {
            let mut lower_off = 0u32;
            let mut lower_len = 0u16;
            let mut py_init_off = 0u32;
            let mut py_init_len = 0u16;
            let mut py_full_off = 0u32;
            let mut py_full_len = 0u16;

            if has_lower {
                let len = read_varint_u32(&raw, &mut cursor)? as usize;
                let lb = read_slice(&raw, &mut cursor, len)?;
                let ls = std::str::from_utf8(lb).map_err(|e| e.to_string())?;
                let (o, l) = next
                    .cold_slab
                    .append_str(ls)
                    .ok_or_else(|| "cold_slab overflow".to_string())?;
                lower_off = o;
                lower_len = l;
                char_mask |= compute_char_mask_bytes(lb);
            }
            if has_pinyin {
                let i_len = read_varint_u32(&raw, &mut cursor)? as usize;
                let ib = read_slice(&raw, &mut cursor, i_len)?;
                let is = std::str::from_utf8(ib).map_err(|e| e.to_string())?;
                let (io, il) = next
                    .cold_slab
                    .append_str(is)
                    .ok_or_else(|| "cold_slab overflow".to_string())?;
                py_init_off = io;
                py_init_len = il;

                let f_len = read_varint_u32(&raw, &mut cursor)? as usize;
                let fb = read_slice(&raw, &mut cursor, f_len)?;
                let fs = std::str::from_utf8(fb).map_err(|e| e.to_string())?;
                let (fo, fl) = next
                    .cold_slab
                    .append_str(fs)
                    .ok_or_else(|| "cold_slab overflow".to_string())?;
                py_full_off = fo;
                py_full_len = fl;
                char_mask |= compute_char_mask_bytes(fb);
            }

            let cold_idx = next.cold_metas.len() as u32;
            next.cold_metas.push(ColdMeta {
                lower_off,
                py_init_off,
                py_full_off,
                lower_len,
                py_init_len,
                py_full_len,
            });
            next.cold_map.insert(next.records.len() as u32, cold_idx);
        }

        let ext_id = if is_dir {
            EXT_NONE
        } else {
            next.exts.intern_file_name_ext(name_str)
        };

        let rec_idx = next.records.len() as u32;
        next.records.push(HotRecord {
            char_mask,
            mtime_sec,
            dir_id,
            name_off,
            name_len,
            flags: HotRecord::pack_flags(is_dir, false, is_ascii, has_lower, has_pinyin, ext_id),
        });
        let key_hash = hash_dir_id_and_name(dir_id, name_bytes);
        next.insert_record_bucket(rec_idx, key_hash);
        if is_dir {
            next.active_dirs += 1;
        } else {
            next.active_files += 1;
        }
    }

    *arena = next;
    Ok(arena.active_files + arena.active_dirs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_tuffidx3_snapshot_with_tombstones_cjk_and_rejects_legacy() {
        let tmp = std::env::temp_dir().join(format!("tuffidx3-test-{}.bin", std::process::id()));
        let legacy =
            std::env::temp_dir().join(format!("tuffidx2-legacy-{}.bin", std::process::id()));

        let mut arena = ArenaState::new();
        arena.last_scan_ms = 12.5;
        arena.upsert("/Users/dev/docs", "重庆Report😀.md", false, 100);
        arena.upsert("/Users/dev/docs", "deleted.txt", false, 150);
        arena.upsert("/Users/dev/src", "main.rs", false, 200);
        arena.upsert("/Users/dev", "src", true, 50);
        arena.remove_full_path("/Users/dev/docs/deleted.txt");
        assert_eq!(arena.tombstones, 1);

        let bytes = arena.save_snapshot(&tmp).expect("save_snapshot succeeds");
        assert!(bytes > SNAPSHOT_HEADER_LEN);

        let mut loaded = ArenaState::new();
        let count = loaded.load_snapshot(&tmp).expect("load_snapshot succeeds");
        assert_eq!(count, 3);
        assert_eq!(loaded.tombstones, 0);
        assert_eq!(loaded.active_files, 2);
        assert_eq!(loaded.active_dirs, 1);
        assert_eq!(loaded.last_scan_ms, 12.5);
        assert!(loaded.has_full_path("/Users/dev/docs/重庆Report😀.md"));
        assert!(loaded.has_full_path("/Users/dev/src/main.rs"));
        assert!(loaded.has_full_path("/Users/dev/src"));
        assert!(!loaded.has_full_path("/Users/dev/docs/deleted.txt"));

        // Reject legacy TUFFIDX2 magic cleanly
        fs::write(&legacy, b"TUFFIDX2\x00\x00\x00\x00").unwrap();
        let mut bad = ArenaState::new();
        let err = bad.load_snapshot(&legacy).unwrap_err();
        assert!(err.contains("TUFFIDX3"));

        let _ = fs::remove_file(&tmp);
        let _ = fs::remove_file(&legacy);
    }
}
