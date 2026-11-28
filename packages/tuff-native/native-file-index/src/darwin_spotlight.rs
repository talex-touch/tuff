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
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex, mpsc};
    use std::time::Duration;

    use objc2_core_foundation::{
        CFAllocator, CFArray, CFDate, CFIndex, CFMutableArray, CFNumber, CFOptionFlags, CFString,
        CFType,
    };

    const MAX_CONCURRENT_SPOTLIGHT_QUERIES: usize = 4;
    static ACTIVE_SPOTLIGHT_QUERIES: AtomicUsize = AtomicUsize::new(0);

    struct ActiveQueryGuard;
    impl Drop for ActiveQueryGuard {
        fn drop(&mut self) {
            ACTIVE_SPOTLIGHT_QUERIES.fetch_sub(1, Ordering::AcqRel);
        }
    }

    fn try_acquire_spotlight_slot() -> Option<ActiveQueryGuard> {
        let mut current = ACTIVE_SPOTLIGHT_QUERIES.load(Ordering::Acquire);
        loop {
            if current >= MAX_CONCURRENT_SPOTLIGHT_QUERIES {
                return None;
            }
            match ACTIVE_SPOTLIGHT_QUERIES.compare_exchange_weak(
                current,
                current + 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return Some(ActiveQueryGuard),
                Err(actual) => current = actual,
            }
        }
    }

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
        fn CFGetTypeID(cf: *const c_void) -> usize;
        fn CFStringGetTypeID() -> usize;
        fn CFNumberGetTypeID() -> usize;
        fn CFDateGetTypeID() -> usize;
    }

    unsafe fn read_and_release_cf_string(ptr: *const c_void, str_type_id: usize) -> Option<String> {
        if ptr.is_null() {
            return None;
        }
        let value = if unsafe { CFGetTypeID(ptr) } == str_type_id {
            Some(unsafe { &*(ptr.cast::<CFString>()) }.to_string())
        } else {
            None
        };
        unsafe { CFRelease(ptr) };
        value
    }

    unsafe fn read_and_release_cf_number_f64(
        ptr: *const c_void,
        num_type_id: usize,
    ) -> Option<f64> {
        if ptr.is_null() {
            return None;
        }
        let value = if unsafe { CFGetTypeID(ptr) } == num_type_id {
            unsafe { &*(ptr.cast::<CFNumber>()) }.as_f64()
        } else {
            None
        };
        unsafe { CFRelease(ptr) };
        value
    }

    unsafe fn read_and_release_cf_date_ms(ptr: *const c_void, date_type_id: usize) -> Option<f64> {
        if ptr.is_null() {
            return None;
        }
        let value = if unsafe { CFGetTypeID(ptr) } == date_type_id {
            unsafe { &*(ptr.cast::<CFDate>()) }
                .to_system_time()
                .and_then(|st| st.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs_f64() * 1000.0)
        } else {
            None
        };
        unsafe { CFRelease(ptr) };
        value
    }

    const K_MD_QUERY_SYNCHRONOUS: CFOptionFlags = 1;

    let trimmed = query_text.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let Some(slot_guard) = try_acquire_spotlight_slot() else {
        return Ok(Vec::new());
    };

    let escaped = trimmed.replace('\\', "\\\\").replace('"', "\\\"");
    let query_expr = format!("kMDItemFSName == \"*{escaped}*\"cd");
    let roots_owned = roots.to_vec();
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_worker = Arc::clone(&cancelled);
    let active_query: Arc<Mutex<Option<usize>>> = Arc::new(Mutex::new(None));
    let active_query_worker = Arc::clone(&active_query);
    let (tx, rx) = mpsc::channel();

    let spawn_result = std::thread::Builder::new()
        .name("tuff-spotlight-query".into())
        .spawn(move || unsafe {
            let _slot = slot_guard;
            if cancelled_worker.load(Ordering::Acquire) {
                let _ = tx.send(Ok(Vec::new()));
                return;
            }

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

            {
                let mut guard = active_query_worker
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                if cancelled_worker.load(Ordering::Acquire) {
                    drop(guard);
                    CFRelease(query_ref.cast::<c_void>());
                    let _ = tx.send(Ok(Vec::new()));
                    return;
                }
                *guard = Some(query_ref as usize);
            }

            let ok = MDQueryExecute(query_ref, K_MD_QUERY_SYNCHRONOUS);
            if ok == 0 || cancelled_worker.load(Ordering::Acquire) {
                {
                    let mut guard = active_query_worker
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
                    *guard = None;
                }
                MDQueryStop(query_ref);
                CFRelease(query_ref.cast::<c_void>());
                let _ = tx.send(Ok(Vec::new()));
                return;
            }

            let str_type_id = CFStringGetTypeID();
            let num_type_id = CFNumberGetTypeID();
            let date_type_id = CFDateGetTypeID();

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

                let Some(path_str) =
                    read_and_release_cf_string(MDItemCopyAttribute(item, kMDItemPath), str_type_id)
                else {
                    continue;
                };
                if path_str.is_empty() {
                    continue;
                }

                let name_str = read_and_release_cf_string(
                    MDItemCopyAttribute(item, kMDItemFSName),
                    str_type_id,
                )
                .unwrap_or_else(|| {
                    Path::new(&path_str)
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string()
                });

                let size_val = read_and_release_cf_number_f64(
                    MDItemCopyAttribute(item, kMDItemFSSize),
                    num_type_id,
                )
                .unwrap_or(0.0);

                let mtime_ms = read_and_release_cf_date_ms(
                    MDItemCopyAttribute(item, kMDItemFSContentChangeDate),
                    date_type_id,
                )
                .unwrap_or(0.0);

                let is_dir = read_and_release_cf_string(
                    MDItemCopyAttribute(item, kMDItemContentType),
                    str_type_id,
                )
                .is_some_and(|uti| uti == "public.folder" || uti == "public.directory");

                hits.push(NativeSpotlightHit {
                    path: path_str,
                    name: name_str,
                    mtime_ms,
                    size: size_val,
                    is_dir,
                });
            }

            {
                let mut guard = active_query_worker
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                *guard = None;
            }
            MDQueryStop(query_ref);
            CFRelease(query_ref.cast::<c_void>());
            let _ = tx.send(Ok(hits));
        });

    if let Err(err) = spawn_result {
        return Err(format!("Failed to spawn Spotlight query thread: {err}"));
    }

    match rx.recv_timeout(Duration::from_millis(timeout_ms.max(50))) {
        Ok(result) => result,
        Err(_) => {
            cancelled.store(true, Ordering::Release);
            let guard = active_query.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(raw_query) = *guard {
                unsafe { MDQueryStop(raw_query as MDQueryRef) };
            }
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
