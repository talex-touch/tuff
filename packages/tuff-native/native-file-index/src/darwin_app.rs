#[derive(Debug, Clone)]
pub struct NativeFrontmostAppInfo {
    pub display_name: Option<String>,
    pub bundle_id: Option<String>,
    pub process_id: Option<i32>,
    pub executable_path: Option<String>,
    pub window_title: Option<String>,
}

#[cfg(any(target_os = "macos", test))]
#[derive(Debug, Clone, PartialEq, Eq)]
struct CachedAppMeta {
    display_name: Option<String>,
    bundle_id: Option<String>,
    executable_path: Option<String>,
}

#[cfg(any(target_os = "macos", test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ProcessIdentity {
    pid: i32,
    start_sec: u64,
    start_usec: u64,
}

#[cfg(target_os = "macos")]
const APP_CACHE_CAPACITY: usize = 64;

#[cfg(any(target_os = "macos", test))]
struct PidAppCache {
    entries: Vec<(ProcessIdentity, CachedAppMeta)>,
    capacity: usize,
}

#[cfg(any(target_os = "macos", test))]
impl PidAppCache {
    fn new(capacity: usize) -> Self {
        Self {
            entries: Vec::with_capacity(capacity),
            capacity,
        }
    }

    fn get(&mut self, key: ProcessIdentity) -> Option<CachedAppMeta> {
        let idx = self.entries.iter().position(|(k, _)| *k == key)?;
        if idx > 0 {
            self.entries[..=idx].rotate_right(1);
        }
        Some(self.entries[0].1.clone())
    }

    fn insert(&mut self, key: ProcessIdentity, meta: CachedAppMeta) {
        // Evict any stale entry sharing the same PID (guards against PID reuse).
        self.entries.retain(|(k, _)| k.pid != key.pid);
        if self.entries.len() >= self.capacity {
            self.entries.pop();
        }
        self.entries.insert(0, (key, meta));
    }
}

#[cfg(target_os = "macos")]
mod darwin {
    use super::{
        APP_CACHE_CAPACITY, CachedAppMeta, NativeFrontmostAppInfo, PidAppCache, ProcessIdentity,
    };
    use std::sync::{Mutex, OnceLock};

    use objc2::msg_send;
    use objc2::rc::{Retained, autoreleasepool};
    use objc2::runtime::AnyObject;
    use objc2_app_kit::{NSRunningApplication, NSWorkspace};
    use objc2_core_foundation::{CFArray, CFString};
    use objc2_core_graphics::{
        CGWindowListCopyWindowInfo, CGWindowListOption, kCGNullWindowID, kCGWindowLayer,
        kCGWindowName, kCGWindowOwnerPID,
    };
    use objc2_foundation::NSString;

    const K_CF_NUMBER_SINT32_TYPE: isize = 3;

    unsafe extern "C" {
        fn CFDictionaryGetValue(
            the_dict: *const std::ffi::c_void,
            key: *const std::ffi::c_void,
        ) -> *const std::ffi::c_void;
        fn CFNumberGetValue(
            number: *const std::ffi::c_void,
            the_type: isize,
            value_ptr: *mut std::ffi::c_void,
        ) -> u8;
        fn CFGetTypeID(cf: *const std::ffi::c_void) -> usize;
        fn CFNumberGetTypeID() -> usize;
        fn CFStringGetTypeID() -> usize;
    }

    fn pid_cache() -> &'static Mutex<PidAppCache> {
        static CACHE: OnceLock<Mutex<PidAppCache>> = OnceLock::new();
        CACHE.get_or_init(|| Mutex::new(PidAppCache::new(APP_CACHE_CAPACITY)))
    }

    fn resolve_process_identity(app: &NSRunningApplication, pid: i32) -> Option<ProcessIdentity> {
        if pid <= 0 {
            return None;
        }
        let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
        let size = std::mem::size_of::<libc::proc_bsdinfo>() as libc::c_int;
        let ret = unsafe {
            libc::proc_pidinfo(
                pid,
                libc::PROC_PIDTBSDINFO,
                0,
                (&mut info as *mut libc::proc_bsdinfo).cast::<libc::c_void>(),
                size,
            )
        };
        if ret == size && (info.pbi_start_tvsec != 0 || info.pbi_start_tvusec != 0) {
            return Some(ProcessIdentity {
                pid,
                start_sec: info.pbi_start_tvsec,
                start_usec: info.pbi_start_tvusec,
            });
        }

        // Fallback to NSRunningApplication.launchDate if proc_pidinfo is restricted for another UID.
        let launch_date: Option<Retained<AnyObject>> = unsafe { msg_send![app, launchDate] };
        let date = launch_date?;
        let secs: f64 = unsafe { msg_send![&*date, timeIntervalSinceReferenceDate] };
        Some(ProcessIdentity {
            pid,
            start_sec: secs.to_bits(),
            start_usec: 1,
        })
    }

    fn resolve_static_app_meta(app: &NSRunningApplication) -> CachedAppMeta {
        let display_name = app
            .localizedName()
            .map(|s: Retained<NSString>| s.to_string())
            .filter(|s| !s.is_empty());
        let bundle_id = app
            .bundleIdentifier()
            .map(|s: Retained<NSString>| s.to_string())
            .filter(|s| !s.is_empty());
        let executable_path = app
            .executableURL()
            .and_then(|url| url.path())
            .map(|s: Retained<NSString>| s.to_string())
            .filter(|s| !s.is_empty());
        CachedAppMeta {
            display_name,
            bundle_id,
            executable_path,
        }
    }

    fn resolve_frontmost_window_title(pid: i32) -> Option<String> {
        if pid <= 0 {
            return None;
        }
        let options =
            CGWindowListOption::OptionOnScreenOnly | CGWindowListOption::ExcludeDesktopElements;
        let window_list = CGWindowListCopyWindowInfo(options, kCGNullWindowID)?;
        let count = CFArray::count(&window_list);
        let key_pid: *const std::ffi::c_void =
            std::ptr::from_ref(unsafe { kCGWindowOwnerPID }).cast();
        let key_layer: *const std::ffi::c_void =
            std::ptr::from_ref(unsafe { kCGWindowLayer }).cast();
        let key_name: *const std::ffi::c_void = std::ptr::from_ref(unsafe { kCGWindowName }).cast();
        let num_type_id = unsafe { CFNumberGetTypeID() };
        let str_type_id = unsafe { CFStringGetTypeID() };

        for i in 0..count {
            let dict_ptr = unsafe { window_list.value_at_index(i) };
            if dict_ptr.is_null() {
                continue;
            }

            let pid_val = unsafe { CFDictionaryGetValue(dict_ptr, key_pid) };
            if pid_val.is_null() || unsafe { CFGetTypeID(pid_val) } != num_type_id {
                continue;
            }
            let mut owner_pid = 0i32;
            if unsafe {
                CFNumberGetValue(
                    pid_val,
                    K_CF_NUMBER_SINT32_TYPE,
                    (&mut owner_pid as *mut i32).cast(),
                )
            } == 0
                || owner_pid != pid
            {
                continue;
            }

            let layer_val = unsafe { CFDictionaryGetValue(dict_ptr, key_layer) };
            if !layer_val.is_null() && unsafe { CFGetTypeID(layer_val) } == num_type_id {
                let mut layer = 0i32;
                if unsafe {
                    CFNumberGetValue(
                        layer_val,
                        K_CF_NUMBER_SINT32_TYPE,
                        (&mut layer as *mut i32).cast(),
                    )
                } != 0
                    && layer != 0
                {
                    continue;
                }
            }

            let name_val = unsafe { CFDictionaryGetValue(dict_ptr, key_name) };
            if !name_val.is_null() && unsafe { CFGetTypeID(name_val) } == str_type_id {
                let title = unsafe { &*(name_val.cast::<CFString>()) }.to_string();
                if !title.is_empty() {
                    return Some(title);
                }
            }
        }
        None
    }

    pub fn get_frontmost_application() -> Option<NativeFrontmostAppInfo> {
        autoreleasepool(|_| {
            let workspace = NSWorkspace::sharedWorkspace();
            let app = workspace.frontmostApplication()?;
            let pid = app.processIdentifier();

            let identity = resolve_process_identity(&app, pid);
            let cached_meta = identity
                .and_then(|key| pid_cache().lock().ok().and_then(|mut cache| cache.get(key)));

            let meta = match cached_meta {
                Some(hit) => hit,
                None => {
                    let fresh = resolve_static_app_meta(&app);
                    if let Some(key) = identity
                        && let Ok(mut cache) = pid_cache().lock()
                    {
                        cache.insert(key, fresh.clone());
                    }
                    fresh
                }
            };

            let window_title = resolve_frontmost_window_title(pid);

            Some(NativeFrontmostAppInfo {
                display_name: meta.display_name,
                bundle_id: meta.bundle_id,
                process_id: if pid > 0 { Some(pid) } else { None },
                executable_path: meta.executable_path,
                window_title,
            })
        })
    }
}

#[cfg(not(target_os = "macos"))]
mod darwin {
    use super::NativeFrontmostAppInfo;
    pub fn get_frontmost_application() -> Option<NativeFrontmostAppInfo> {
        None
    }
}

pub use darwin::get_frontmost_application;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pid_cache_handles_mru_eviction_and_pid_reuse() {
        let mut cache = PidAppCache::new(2);
        let k1 = ProcessIdentity {
            pid: 100,
            start_sec: 1000,
            start_usec: 1,
        };
        let m1 = CachedAppMeta {
            display_name: Some("App1".into()),
            bundle_id: Some("com.test.app1".into()),
            executable_path: Some("/Applications/App1.app/Contents/MacOS/App1".into()),
        };
        let k2 = ProcessIdentity {
            pid: 200,
            start_sec: 2000,
            start_usec: 2,
        };
        let m2 = CachedAppMeta {
            display_name: Some("App2".into()),
            bundle_id: Some("com.test.app2".into()),
            executable_path: None,
        };
        let k3 = ProcessIdentity {
            pid: 300,
            start_sec: 3000,
            start_usec: 3,
        };
        let m3 = CachedAppMeta {
            display_name: Some("App3".into()),
            bundle_id: Some("com.test.app3".into()),
            executable_path: None,
        };

        cache.insert(k1, m1.clone());
        cache.insert(k2, m2.clone());
        // Touch k1 so k2 becomes LRU
        assert_eq!(cache.get(k1), Some(m1.clone()));
        cache.insert(k3, m3.clone());
        assert_eq!(cache.get(k2), None);
        assert_eq!(cache.get(k1), Some(m1));
        assert_eq!(cache.get(k3), Some(m3));

        // PID reuse on pid=100 with new start time must miss old entry and replace it
        let k1_reused = ProcessIdentity {
            pid: 100,
            start_sec: 5000,
            start_usec: 9,
        };
        assert_eq!(cache.get(k1_reused), None);
        let m1_new = CachedAppMeta {
            display_name: Some("NewApp".into()),
            bundle_id: Some("com.test.new".into()),
            executable_path: None,
        };
        cache.insert(k1_reused, m1_new.clone());
        assert_eq!(cache.get(k1), None);
        assert_eq!(cache.get(k1_reused), Some(m1_new));
    }
}
