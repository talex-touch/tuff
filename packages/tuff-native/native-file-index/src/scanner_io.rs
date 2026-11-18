use std::fs;
use std::io::Read;
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ChildKind {
    File,
    Dir,
    Symlink,
    Other,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ChildMeta {
    pub name_start: u32,
    pub name_end: u32,
    pub kind: ChildKind,
    pub mtime_sec: u32,
}

#[cfg(target_os = "macos")]
const ATTR_BUF_SIZE: usize = 128 * 1024;

pub(crate) struct DirScratch {
    #[cfg(target_os = "macos")]
    pub attr_buf: Vec<u8>,
    #[cfg(target_os = "macos")]
    pub c_path_buf: Vec<u8>,
    pub child_names: String,
    pub children: Vec<ChildMeta>,
    pub lower_buf: String,
    pub child_path_buf: String,
}

impl DirScratch {
    pub(crate) fn new() -> Self {
        Self {
            #[cfg(target_os = "macos")]
            attr_buf: vec![0u8; ATTR_BUF_SIZE],
            #[cfg(target_os = "macos")]
            c_path_buf: Vec::with_capacity(1024),
            child_names: String::with_capacity(4096),
            children: Vec::with_capacity(128),
            lower_buf: String::with_capacity(128),
            child_path_buf: String::with_capacity(1024),
        }
    }
}

#[inline]
pub(crate) fn write_lowercase_into(src: &str, buf: &mut String) {
    buf.clear();
    if src.is_ascii() {
        buf.push_str(src);
        buf.make_ascii_lowercase();
    } else {
        for ch in src.chars() {
            for lc in ch.to_lowercase() {
                buf.push(lc);
            }
        }
    }
}

#[inline]
pub(crate) fn build_child_path(parent: &str, name: &str, out: &mut String) {
    out.clear();
    let sep = if parent.contains('\\') && !parent.contains('/') {
        '\\'
    } else {
        '/'
    };
    out.reserve(parent.len() + 1 + name.len());
    out.push_str(parent);
    if !parent.is_empty() && !parent.ends_with(['/', '\\']) {
        out.push(sep);
    }
    out.push_str(name);
}

pub(crate) fn is_linked_worktree_git_file(git_path: &str) -> bool {
    let Ok(mut file) = fs::File::open(git_path) else {
        return false;
    };
    let mut buf = [0u8; 512];
    let Ok(n) = file.read(&mut buf) else {
        return false;
    };
    let Ok(text) = std::str::from_utf8(&buf[..n]) else {
        return false;
    };
    let trimmed = text.trim();
    if let Some(rest) = trimmed.strip_prefix("gitdir:") {
        let target = rest.trim();
        target.contains("/worktrees/") || target.contains("\\worktrees\\")
    } else {
        false
    }
}

pub(crate) fn list_directory_readdir(dir_path: &str, scratch: &mut DirScratch) -> Result<(), i32> {
    scratch.child_names.clear();
    scratch.children.clear();
    let entries = fs::read_dir(dir_path).map_err(|e| e.raw_os_error().unwrap_or(5))?;
    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else {
            continue;
        };
        let kind = if ft.is_symlink() {
            ChildKind::Symlink
        } else if ft.is_dir() {
            ChildKind::Dir
        } else if ft.is_file() {
            ChildKind::File
        } else {
            ChildKind::Other
        };
        let name = entry.file_name();
        let name_lossy = name.to_string_lossy();
        if name_lossy == "." || name_lossy == ".." {
            continue;
        }
        let mtime_sec = if matches!(kind, ChildKind::File | ChildKind::Dir) {
            entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs().min(u32::MAX as u64) as u32)
                .unwrap_or(0)
        } else {
            0
        };
        let name_start = scratch.child_names.len() as u32;
        scratch.child_names.push_str(&name_lossy);
        let name_end = scratch.child_names.len() as u32;
        scratch.children.push(ChildMeta {
            name_start,
            name_end,
            kind,
            mtime_sec,
        });
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn list_directory_fast(dir_path: &str, scratch: &mut DirScratch) -> Result<(), i32> {
    use std::ffi::CStr;
    use std::ptr;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct AttrList {
        bitmapcount: u16,
        reserved: u16,
        commonattr: u32,
        volattr: u32,
        dirattr: u32,
        fileattr: u32,
        forkattr: u32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct AttributeSet {
        commonattr: u32,
        volattr: u32,
        dirattr: u32,
        fileattr: u32,
        forkattr: u32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct AttrReference {
        attr_dataoffset: i32,
        attr_length: u32,
    }

    const ATTR_BIT_MAP_COUNT: u16 = 5;
    const ATTR_CMN_NAME: u32 = 0x0000_0001;
    const ATTR_CMN_OBJTYPE: u32 = 0x0000_0008;
    const ATTR_CMN_MODTIME: u32 = 0x0000_0400;
    const ATTR_CMN_RETURNED_ATTRS: u32 = 0x8000_0000;
    const FSOPT_NOFOLLOW: u64 = 0x0000_0001;
    const VREG: u32 = 1;
    const VDIR: u32 = 2;
    const VLNK: u32 = 5;

    unsafe extern "C" {
        fn getattrlistbulk(
            dirfd: libc::c_int,
            attrList: *mut AttrList,
            attrBuf: *mut libc::c_void,
            attrBufSize: libc::size_t,
            options: u64,
        ) -> libc::c_int;
    }

    let path_bytes = dir_path.as_bytes();
    if path_bytes.contains(&0) {
        return Err(libc::EINVAL);
    }
    scratch.c_path_buf.clear();
    scratch.c_path_buf.extend_from_slice(path_bytes);
    scratch.c_path_buf.push(0);

    let fd = unsafe {
        libc::open(
            scratch.c_path_buf.as_ptr().cast::<libc::c_char>(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if fd < 0 {
        return Err(std::io::Error::last_os_error()
            .raw_os_error()
            .unwrap_or(libc::EIO));
    }

    scratch.child_names.clear();
    scratch.children.clear();

    let mut attr_list = AttrList {
        bitmapcount: ATTR_BIT_MAP_COUNT,
        reserved: 0,
        commonattr: ATTR_CMN_RETURNED_ATTRS | ATTR_CMN_NAME | ATTR_CMN_OBJTYPE | ATTR_CMN_MODTIME,
        volattr: 0,
        dirattr: 0,
        fileattr: 0,
        forkattr: 0,
    };

    let buf_len = scratch.attr_buf.len();
    loop {
        let ret_count = unsafe {
            getattrlistbulk(
                fd,
                &mut attr_list,
                scratch.attr_buf.as_mut_ptr().cast::<libc::c_void>(),
                buf_len,
                FSOPT_NOFOLLOW,
            )
        };
        if ret_count < 0 {
            let err = std::io::Error::last_os_error()
                .raw_os_error()
                .unwrap_or(libc::EIO);
            unsafe { libc::close(fd) };
            if matches!(err, libc::ENOTSUP | libc::EOPNOTSUPP) {
                return list_directory_readdir(dir_path, scratch);
            }
            return Err(err);
        }
        if ret_count == 0 {
            break;
        }

        let mut offset = 0usize;
        for _ in 0..ret_count {
            if offset + 24 > buf_len {
                break;
            }
            let entry_ptr = unsafe { scratch.attr_buf.as_ptr().add(offset) };
            let entry_len = unsafe { ptr::read_unaligned(entry_ptr.cast::<u32>()) } as usize;
            if entry_len < 24 || offset + entry_len > buf_len {
                break;
            }
            let returned = unsafe { ptr::read_unaligned(entry_ptr.add(4).cast::<AttributeSet>()) };

            let mut field_off = 4 + std::mem::size_of::<AttributeSet>();
            let mut name_range: Option<(u32, u32)> = None;
            let mut kind = ChildKind::Other;
            let mut mtime_sec = 0u32;

            if (returned.commonattr & ATTR_CMN_NAME) != 0 && field_off + 8 <= entry_len {
                let name_ref_ptr = unsafe { entry_ptr.add(field_off) };
                let name_ref = unsafe { ptr::read_unaligned(name_ref_ptr.cast::<AttrReference>()) };
                if name_ref.attr_dataoffset >= 0 && name_ref.attr_length > 0 {
                    let str_rel = field_off as isize + name_ref.attr_dataoffset as isize;
                    if str_rel >= 0 && (str_rel as usize) < entry_len {
                        let str_abs = offset + str_rel as usize;
                        let slice_end = (offset + entry_len).min(buf_len);
                        if let Ok(c_str) =
                            CStr::from_bytes_until_nul(&scratch.attr_buf[str_abs..slice_end])
                            && let Ok(s) = c_str.to_str()
                            && s != "."
                            && s != ".."
                        {
                            let start = scratch.child_names.len() as u32;
                            scratch.child_names.push_str(s);
                            let end = scratch.child_names.len() as u32;
                            name_range = Some((start, end));
                        }
                    }
                }
                field_off += 8;
            }

            if (returned.commonattr & ATTR_CMN_OBJTYPE) != 0 && field_off + 4 <= entry_len {
                let objtype =
                    unsafe { ptr::read_unaligned(entry_ptr.add(field_off).cast::<u32>()) };
                kind = match objtype {
                    VREG => ChildKind::File,
                    VDIR => ChildKind::Dir,
                    VLNK => ChildKind::Symlink,
                    _ => ChildKind::Other,
                };
                field_off += 4;
            }

            if (returned.commonattr & ATTR_CMN_MODTIME) != 0
                && field_off + std::mem::size_of::<libc::timespec>() <= entry_len
            {
                let ts = unsafe {
                    ptr::read_unaligned(entry_ptr.add(field_off).cast::<libc::timespec>())
                };
                if ts.tv_sec > 0 {
                    mtime_sec = ts.tv_sec.min(u32::MAX as i64) as u32;
                }
            }

            if let Some((name_start, name_end)) = name_range {
                scratch.children.push(ChildMeta {
                    name_start,
                    name_end,
                    kind,
                    mtime_sec,
                });
            }

            offset += entry_len;
        }
    }

    unsafe { libc::close(fd) };
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn list_directory_fast(dir_path: &str, scratch: &mut DirScratch) -> Result<(), i32> {
    list_directory_readdir(dir_path, scratch)
}
