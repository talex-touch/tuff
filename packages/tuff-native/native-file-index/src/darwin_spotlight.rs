#[derive(Debug, Clone)]
pub struct NativeSpotlightHit {
    pub path: String,
    pub name: String,
    pub mtime_ms: f64,
    pub size: f64,
    pub is_dir: bool,
}

#[cfg(target_os = "macos")]
pub fn query_spotlight(
    query_text: &str,
    roots: &[String],
    limit: usize,
    timeout_ms: u64,
) -> Result<Vec<NativeSpotlightHit>, String> {
    use std::ffi::c_void;
    use std::path::Path;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, mpsc};
    use std::time::Duration;

    use objc2_core_foundation::{
        CFAllocator, CFArray, CFDate, CFIndex, CFMutableArray, CFNumber, CFOptionFlags, CFString,
        CFType,
    };

    #[repr(C)]
    struct __MDQuery(c_void);
    type MDQueryRef = *mut __MDQuery;
    #[repr(C)]
    struct __MDItem(c_void);
    type MDItemRef = *mut __MDItem;

    #[link(name = "CoreServices", kind = "framework")]
    unsafe extern "C" {
        static kMDItemFSName: *const CFString;
        static kMDItemPath: *const CFString;
        static kMDItemFSSize: *const CFString;
        static kMDItemFSContentChangeDate: *const CFString;
        static kMDItemContentType: *const CFString;
        static kMDQueryScopeComputer: *const CFString;

        fn MDQueryCreate(
            allocator: *const CFAllocator,
            query_string: *const CFString,
            value_list_attrs: *const CFArray<CFString>,
            sorting_attrs: *const CFArray<CFString>,
        ) -> MDQueryRef;
        fn MDQuerySetSearchScope(
            query: MDQueryRef,
            scope_directories: *const CFArray<CFType>,
            scope_options: u32,
        );
        fn MDQuerySetMaxCount(query: MDQueryRef, size: CFIndex);
        fn MDQueryExecute(query: MDQueryRef, option_flags: CFOptionFlags) -> u8;
        fn MDQueryStop(query: MDQueryRef);
        fn MDQueryGetResultCount(query: MDQueryRef) -> CFIndex;
        fn MDQueryGetResultAtIndex(query: MDQueryRef, idx: CFIndex) -> *const c_void;
        fn MDItemCopyAttribute(item: MDItemRef, name: *const CFString) -> *const c_void;
        fn CFRelease(cf: *const c_void);
    }

    const K_MD_QUERY_SYNCHRONOUS: CFOptionFlags = 1;

    let trimmed = query_text.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let escaped = trimmed.replace('\\', "\\\\").replace('"', "\\\"");
    let query_expr = format!("kMDItemFSName == \"*{escaped}*\"cd");
    let roots_owned = roots.to_vec();
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_worker = Arc::clone(&cancelled);
    let (tx, rx) = mpsc::channel();

    std::thread::spawn(move || unsafe {
        let cf_expr = CFString::from_str(&query_expr);
        let query_ref = MDQueryCreate(
            std::ptr::null(),
            &*cf_expr as *const CFString,
            std::ptr::null(),
            std::ptr::null(),
        );
        if query_ref.is_null() {
            let _ = tx.send(Err("MDQueryCreate returned null".to_string()));
            return;
        }

        if !roots_owned.is_empty() {
            let scopes = CFMutableArray::<CFType>::with_capacity(roots_owned.len());
            for root in &roots_owned {
                let s = CFString::from_str(root);
                scopes.append(s.as_ref());
            }
            MDQuerySetSearchScope(query_ref, (&**scopes) as *const CFArray<CFType>, 0);
        } else if !kMDQueryScopeComputer.is_null() {
            let scopes = CFMutableArray::<CFType>::with_capacity(1);
            let computer = &*(kMDQueryScopeComputer.cast::<CFType>());
            scopes.append(computer);
            MDQuerySetSearchScope(query_ref, (&**scopes) as *const CFArray<CFType>, 0);
        }

        MDQuerySetMaxCount(query_ref, limit as CFIndex);

        let ok = MDQueryExecute(query_ref, K_MD_QUERY_SYNCHRONOUS);
        if ok == 0 || cancelled_worker.load(Ordering::Acquire) {
            MDQueryStop(query_ref);
            CFRelease(query_ref.cast::<c_void>());
            let _ = tx.send(Ok(Vec::new()));
            return;
        }

        let count = MDQueryGetResultCount(query_ref).min(limit as CFIndex);
        let mut hits = Vec::with_capacity(count.max(0) as usize);
        for i in 0..count {
            if cancelled_worker.load(Ordering::Acquire) {
                break;
            }
            let item = MDQueryGetResultAtIndex(query_ref, i) as MDItemRef;
            if item.is_null() {
                continue;
            }

            let path_ptr = MDItemCopyAttribute(item, kMDItemPath);
            if path_ptr.is_null() {
                continue;
            }
            let path_str = (&*(path_ptr.cast::<CFString>())).to_string();
            CFRelease(path_ptr);
            if path_str.is_empty() {
                continue;
            }

            let name_ptr = MDItemCopyAttribute(item, kMDItemFSName);
            let name_str = if !name_ptr.is_null() {
                let s = (&*(name_ptr.cast::<CFString>())).to_string();
                CFRelease(name_ptr);
                s
            } else {
                Path::new(&path_str)
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string()
            };

            let size_ptr = MDItemCopyAttribute(item, kMDItemFSSize);
            let size_val = if !size_ptr.is_null() {
                let s = (&*(size_ptr.cast::<CFNumber>())).as_f64().unwrap_or(0.0);
                CFRelease(size_ptr);
                s
            } else {
                0.0
            };

            let date_ptr = MDItemCopyAttribute(item, kMDItemFSContentChangeDate);
            let mtime_ms = if !date_ptr.is_null() {
                let ms = (&*(date_ptr.cast::<CFDate>()))
                    .to_system_time()
                    .and_then(|st| st.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs_f64() * 1000.0)
                    .unwrap_or(0.0);
                CFRelease(date_ptr);
                ms
            } else {
                0.0
            };

            let uti_ptr = MDItemCopyAttribute(item, kMDItemContentType);
            let is_dir = if !uti_ptr.is_null() {
                let uti = (&*(uti_ptr.cast::<CFString>())).to_string();
                CFRelease(uti_ptr);
                uti == "public.folder" || uti == "public.directory"
            } else {
                false
            };

            hits.push(NativeSpotlightHit {
                path: path_str,
                name: name_str,
                mtime_ms,
                size: size_val,
                is_dir,
            });
        }

        MDQueryStop(query_ref);
        CFRelease(query_ref.cast::<c_void>());
        let _ = tx.send(Ok(hits));
    });

    match rx.recv_timeout(Duration::from_millis(timeout_ms.max(50))) {
        Ok(result) => result,
        Err(_) => {
            cancelled.store(true, Ordering::Release);
            Ok(Vec::new())
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn query_spotlight(
    _query_text: &str,
    _roots: &[String],
    _limit: usize,
    _timeout_ms: u64,
) -> Result<Vec<NativeSpotlightHit>, String> {
    Ok(Vec::new())
}
