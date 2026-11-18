#[derive(Debug, Clone)]
pub struct FsEventsVolumeCheckpoint {
    pub supported: bool,
    pub volume_uuid: Option<String>,
    pub current_event_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NativeFsEventItem {
    pub event_id: String,
    pub path: String,
    pub kind: String,
    pub action: String,
    pub flags: u32,
    pub is_history_done: bool,
}

#[cfg(target_os = "macos")]
mod darwin {
    use super::{FsEventsVolumeCheckpoint, NativeFsEventItem};
    use std::ffi::{CStr, CString, c_char, c_void};
    use std::ptr;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    use objc2_core_foundation::{CFAllocator, CFArray, CFIndex, CFMutableArray, CFString, CFUUID};

    type FSEventStreamRef = *mut c_void;
    type ConstFSEventStreamRef = *const c_void;
    type FSEventStreamEventId = u64;
    type FSEventStreamCreateFlags = u32;
    type FSEventStreamEventFlags = u32;
    type DispatchQueueRef = *mut c_void;

    const K_FS_EVENT_STREAM_EVENT_ID_SINCE_NOW: u64 = 0xFFFF_FFFF_FFFF_FFFF;
    const K_FS_EVENT_STREAM_CREATE_FLAG_NO_DEFER: u32 = 0x0000_0002;
    const K_FS_EVENT_STREAM_CREATE_FLAG_FILE_EVENTS: u32 = 0x0000_0010;

    const FLAG_MUST_SCAN_SUB_DIRS: u32 = 0x0000_0001;
    const FLAG_USER_DROPPED: u32 = 0x0000_0002;
    const FLAG_KERNEL_DROPPED: u32 = 0x0000_0004;
    const FLAG_EVENT_IDS_WRAPPED: u32 = 0x0000_0008;
    const FLAG_HISTORY_DONE: u32 = 0x0000_0010;
    const FLAG_ROOT_CHANGED: u32 = 0x0000_0020;

    const FLAG_ITEM_CREATED: u32 = 0x0000_0100;
    const FLAG_ITEM_REMOVED: u32 = 0x0000_0200;
    const FLAG_ITEM_RENAMED: u32 = 0x0000_0800;
    const FLAG_ITEM_IS_FILE: u32 = 0x0001_0000;
    const FLAG_ITEM_IS_DIR: u32 = 0x0002_0000;
    const FLAG_ITEM_IS_SYMLINK: u32 = 0x0004_0000;

    #[repr(C)]
    struct FSEventStreamContext {
        version: CFIndex,
        info: *mut c_void,
        retain: Option<extern "C" fn(*const c_void) -> *const c_void>,
        release: Option<extern "C" fn(*const c_void)>,
        copy_description: Option<extern "C" fn(*const c_void) -> *const CFString>,
    }

    type FSEventStreamCallback = extern "C" fn(
        stream_ref: ConstFSEventStreamRef,
        client_callback_info: *mut c_void,
        num_events: usize,
        event_paths: *mut c_void,
        event_flags: *const FSEventStreamEventFlags,
        event_ids: *const FSEventStreamEventId,
    );

    #[link(name = "CoreServices", kind = "framework")]
    unsafe extern "C" {
        fn FSEventsGetCurrentEventId() -> FSEventStreamEventId;
        fn FSEventsCopyUUIDForDevice(dev: libc::dev_t) -> *const CFUUID;
        fn FSEventStreamCreate(
            allocator: *const CFAllocator,
            callback: FSEventStreamCallback,
            context: *mut FSEventStreamContext,
            paths_to_watch: *const CFArray<CFString>,
            since_when: FSEventStreamEventId,
            latency: f64,
            flags: FSEventStreamCreateFlags,
        ) -> FSEventStreamRef;
        fn FSEventStreamSetDispatchQueue(stream_ref: FSEventStreamRef, q: DispatchQueueRef);
        fn FSEventStreamStart(stream_ref: FSEventStreamRef) -> u8;
        fn FSEventStreamStop(stream_ref: FSEventStreamRef);
        fn FSEventStreamInvalidate(stream_ref: FSEventStreamRef);
        fn FSEventStreamRelease(stream_ref: FSEventStreamRef);
    }

    unsafe extern "C" {
        fn CFUUIDCreateString(alloc: *const CFAllocator, uuid: *const CFUUID) -> *const CFString;
        fn CFRelease(cf: *const c_void);
        fn dispatch_queue_create(label: *const c_char, attr: *const c_void) -> DispatchQueueRef;
        fn dispatch_sync_f(
            queue: DispatchQueueRef,
            context: *mut c_void,
            work: extern "C" fn(*mut c_void),
        );
        fn dispatch_release(object: *mut c_void);
    }

    extern "C" fn noop_dispatch_barrier(_ctx: *mut c_void) {}

    pub fn get_volume_checkpoint(root_path: &str) -> FsEventsVolumeCheckpoint {
        let Ok(c_path) = CString::new(root_path.as_bytes()) else {
            return FsEventsVolumeCheckpoint {
                supported: true,
                volume_uuid: None,
                current_event_id: None,
            };
        };
        let mut st: libc::stat = unsafe { std::mem::zeroed() };
        if unsafe { libc::lstat(c_path.as_ptr(), &mut st) } != 0 {
            return FsEventsVolumeCheckpoint {
                supported: true,
                volume_uuid: None,
                current_event_id: None,
            };
        }

        let current_id = unsafe { FSEventsGetCurrentEventId() };
        let uuid_ref = unsafe { FSEventsCopyUUIDForDevice(st.st_dev) };
        let volume_uuid = if !uuid_ref.is_null() {
            let cf_str = unsafe { CFUUIDCreateString(ptr::null(), uuid_ref) };
            let out = if !cf_str.is_null() {
                let s = unsafe { &*cf_str }.to_string();
                unsafe { CFRelease(cf_str.cast::<c_void>()) };
                Some(s)
            } else {
                None
            };
            unsafe { CFRelease(uuid_ref.cast::<c_void>()) };
            out
        } else {
            None
        };

        FsEventsVolumeCheckpoint {
            supported: true,
            volume_uuid,
            current_event_id: if current_id == K_FS_EVENT_STREAM_EVENT_ID_SINCE_NOW {
                None
            } else {
                Some(current_id.to_string())
            },
        }
    }

    pub type EventEmitFn = Box<dyn Fn(Vec<NativeFsEventItem>) + Send + Sync>;

    struct CallbackContext {
        alive: Arc<AtomicBool>,
        emit: EventEmitFn,
    }

    extern "C" fn on_fsevents(
        _stream_ref: ConstFSEventStreamRef,
        client_info: *mut c_void,
        num_events: usize,
        event_paths: *mut c_void,
        event_flags: *const FSEventStreamEventFlags,
        event_ids: *const FSEventStreamEventId,
    ) {
        if client_info.is_null() || num_events == 0 {
            return;
        }
        let ctx = unsafe { &*(client_info as *const CallbackContext) };
        if !ctx.alive.load(Ordering::Acquire) {
            return;
        }

        let path_ptrs = event_paths as *const *const c_char;
        let mut batch = Vec::with_capacity(num_events.min(512));

        for i in 0..num_events {
            let flags = unsafe { *event_flags.add(i) };
            let event_id = unsafe { *event_ids.add(i) };
            let raw_path_ptr = unsafe { *path_ptrs.add(i) };
            let path = if !raw_path_ptr.is_null() {
                unsafe { CStr::from_ptr(raw_path_ptr) }
                    .to_string_lossy()
                    .into_owned()
            } else {
                String::new()
            };

            let is_history_done = (flags & FLAG_HISTORY_DONE) != 0;
            let kind = if (flags & FLAG_ITEM_IS_SYMLINK) != 0 {
                "symlink"
            } else if (flags & FLAG_ITEM_IS_DIR) != 0 {
                "dir"
            } else if (flags & FLAG_ITEM_IS_FILE) != 0 {
                "file"
            } else {
                "unknown"
            };

            let action = if is_history_done {
                "history-done"
            } else if (flags
                & (FLAG_MUST_SCAN_SUB_DIRS
                    | FLAG_USER_DROPPED
                    | FLAG_KERNEL_DROPPED
                    | FLAG_EVENT_IDS_WRAPPED
                    | FLAG_ROOT_CHANGED))
                != 0
            {
                "must-scan"
            } else if (flags & FLAG_ITEM_RENAMED) != 0 {
                "renamed"
            } else if (flags & FLAG_ITEM_REMOVED) != 0 {
                "removed"
            } else if (flags & FLAG_ITEM_CREATED) != 0 {
                "created"
            } else {
                "modified"
            };

            batch.push(NativeFsEventItem {
                event_id: event_id.to_string(),
                path,
                kind: kind.to_string(),
                action: action.to_string(),
                flags,
                is_history_done,
            });
        }

        if !batch.is_empty() && ctx.alive.load(Ordering::Acquire) {
            (ctx.emit)(batch);
        }
    }

    pub struct NativeStreamHandle {
        stream: FSEventStreamRef,
        queue: DispatchQueueRef,
        alive: Arc<AtomicBool>,
        ctx_ptr: *mut CallbackContext,
        pub replaying_since_when: bool,
    }

    unsafe impl Send for NativeStreamHandle {}
    unsafe impl Sync for NativeStreamHandle {}

    pub fn validate_since_when(
        roots: &[String],
        requested_since: Option<&str>,
        expected_volume_uuid: Option<&str>,
    ) -> Option<u64> {
        let since_raw = requested_since?.trim();
        if since_raw.is_empty() {
            return None;
        }
        let since_id = since_raw.parse::<u64>().ok()?;
        if since_id == 0 || since_id == K_FS_EVENT_STREAM_EVENT_ID_SINCE_NOW {
            return None;
        }
        let expected_uuid = expected_volume_uuid?.trim();
        if expected_uuid.is_empty() {
            return None;
        }
        let primary_root = roots.first()?;
        let ck = get_volume_checkpoint(primary_root);
        let live_uuid = ck.volume_uuid?;
        if !live_uuid.eq_ignore_ascii_case(expected_uuid) {
            return None;
        }
        let live_id = ck.current_event_id?.parse::<u64>().ok()?;
        if since_id > live_id {
            return None;
        }
        Some(since_id)
    }

    pub fn start_stream(
        roots: &[String],
        requested_since: Option<&str>,
        expected_volume_uuid: Option<&str>,
        latency_ms: f64,
        emit: EventEmitFn,
    ) -> Result<NativeStreamHandle, String> {
        if roots.is_empty() {
            return Err("At least one watch root is required".to_string());
        }

        let validated_since = validate_since_when(roots, requested_since, expected_volume_uuid);
        let since_when = validated_since.unwrap_or(K_FS_EVENT_STREAM_EVENT_ID_SINCE_NOW);

        let cf_paths = CFMutableArray::<CFString>::with_capacity(roots.len());
        for root in roots {
            let s = CFString::from_str(root);
            cf_paths.append(&s);
        }

        let alive = Arc::new(AtomicBool::new(true));
        let ctx_box = Box::new(CallbackContext {
            alive: Arc::clone(&alive),
            emit,
        });
        let ctx_ptr = Box::into_raw(ctx_box);

        let mut stream_ctx = FSEventStreamContext {
            version: 0,
            info: ctx_ptr.cast::<c_void>(),
            retain: None,
            release: None,
            copy_description: None,
        };

        let flags =
            K_FS_EVENT_STREAM_CREATE_FLAG_NO_DEFER | K_FS_EVENT_STREAM_CREATE_FLAG_FILE_EVENTS;
        let latency_secs = (latency_ms.clamp(10.0, 2000.0)) / 1000.0;

        let stream = unsafe {
            FSEventStreamCreate(
                ptr::null(),
                on_fsevents,
                &mut stream_ctx,
                &**cf_paths,
                since_when,
                latency_secs,
                flags,
            )
        };
        if stream.is_null() {
            unsafe { drop(Box::from_raw(ctx_ptr)) };
            return Err("FSEventStreamCreate failed".to_string());
        }

        let queue_label = CString::new("com.tuff.native.fsevents").unwrap();
        let queue = unsafe { dispatch_queue_create(queue_label.as_ptr(), ptr::null()) };
        if queue.is_null() {
            unsafe {
                FSEventStreamRelease(stream);
                drop(Box::from_raw(ctx_ptr));
            }
            return Err("dispatch_queue_create failed".to_string());
        }

        unsafe {
            FSEventStreamSetDispatchQueue(stream, queue);
            if FSEventStreamStart(stream) == 0 {
                FSEventStreamInvalidate(stream);
                FSEventStreamRelease(stream);
                dispatch_release(queue);
                drop(Box::from_raw(ctx_ptr));
                return Err("FSEventStreamStart returned false".to_string());
            }
        }

        Ok(NativeStreamHandle {
            stream,
            queue,
            alive,
            ctx_ptr,
            replaying_since_when: validated_since.is_some(),
        })
    }

    impl NativeStreamHandle {
        pub fn stop(mut self) {
            self.alive.store(false, Ordering::Release);
            unsafe {
                FSEventStreamStop(self.stream);
                FSEventStreamInvalidate(self.stream);
                FSEventStreamRelease(self.stream);
                // Drain any in-flight callback already scheduled on this serial queue before releasing context.
                dispatch_sync_f(self.queue, ptr::null_mut(), noop_dispatch_barrier);
                dispatch_release(self.queue);
                if !self.ctx_ptr.is_null() {
                    drop(Box::from_raw(self.ctx_ptr));
                    self.ctx_ptr = ptr::null_mut();
                }
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod darwin {
    use super::{FsEventsVolumeCheckpoint, NativeFsEventItem};
    pub type EventEmitFn = Box<dyn Fn(Vec<NativeFsEventItem>) + Send + Sync>;
    pub struct NativeStreamHandle {
        pub replaying_since_when: bool,
    }
    pub fn get_volume_checkpoint(_root_path: &str) -> FsEventsVolumeCheckpoint {
        FsEventsVolumeCheckpoint {
            supported: false,
            volume_uuid: None,
            current_event_id: None,
        }
    }
    pub fn start_stream(
        _roots: &[String],
        _requested_since: Option<&str>,
        _expected_volume_uuid: Option<&str>,
        _latency_ms: f64,
        _emit: EventEmitFn,
    ) -> Result<NativeStreamHandle, String> {
        Err("Native FSEvents stream is only supported on macOS".to_string())
    }
    impl NativeStreamHandle {
        pub fn stop(self) {}
    }
}

pub use darwin::{EventEmitFn, NativeStreamHandle, get_volume_checkpoint, start_stream};
