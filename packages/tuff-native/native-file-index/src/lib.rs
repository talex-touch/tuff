pub mod arena;
pub mod cjk_pinyin;
pub mod cjk_pinyin_table;
pub mod darwin_app;
pub mod darwin_spotlight;
pub mod fsevents;
pub mod fzf;
pub mod napi_types;
pub mod scanner;
mod scanner_io;
pub mod scorer;
mod search_pool;
pub mod snapshot;
pub mod string_pool;
pub mod top_k;

use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use napi::bindgen_prelude::{AsyncTask, Function};
use napi::{Error, Result, Status};
use napi_derive::napi;

use arena::ArenaState;
use darwin_app::get_frontmost_application;
use fsevents::{NativeStreamHandle, get_volume_checkpoint};
use napi_types::{
    ArenaIndexTask, ArenaSearchTask, BulkScanTask, FileIndexCapabilities, JsArenaIndexStats,
    JsDeltaEntry, JsFrontmostAppInfo, JsFsEventItem, JsFsEventsCheckpoint, JsFsEventsStartOptions,
    JsFsEventsStartResult, JsScanFilterOptions, JsSearchOptions, SpotlightQueryTask,
    apply_arena_delta, arena_read, arena_write, delta_to_raw, start_fsevents_watcher,
    stats_from_arena, stop_fsevents_watcher, to_js_checkpoint, to_js_frontmost_app, to_scan_config,
};

#[napi]
pub fn get_file_index_capabilities() -> FileIndexCapabilities {
    let is_mac = cfg!(target_os = "macos");
    FileIndexCapabilities {
        supported: true,
        platform: std::env::consts::OS.to_string(),
        has_bulk_scanner: is_mac,
        has_native_fsevents: is_mac,
        has_native_spotlight: is_mac,
        has_native_frontmost_app: is_mac,
    }
}

#[napi]
pub fn get_frontmost_application_darwin() -> Option<JsFrontmostAppInfo> {
    get_frontmost_application().map(to_js_frontmost_app)
}

#[napi]
pub fn query_spotlight_native(
    query: String,
    roots: Vec<String>,
    limit: Option<u32>,
    timeout_ms: Option<u32>,
) -> AsyncTask<SpotlightQueryTask> {
    AsyncTask::new(SpotlightQueryTask {
        query,
        roots,
        limit: limit.unwrap_or(150).min(500) as usize,
        timeout_ms: timeout_ms.unwrap_or(500) as u64,
    })
}

#[napi]
pub fn scan_directory_bulk(
    roots: Vec<String>,
    options: Option<JsScanFilterOptions>,
) -> AsyncTask<BulkScanTask> {
    AsyncTask::new(BulkScanTask {
        roots,
        config: to_scan_config(options),
    })
}

#[napi]
pub fn get_fsevents_volume_checkpoint(root_path: String) -> JsFsEventsCheckpoint {
    to_js_checkpoint(get_volume_checkpoint(&root_path))
}

#[napi]
pub struct NativeFileArena {
    state: Arc<RwLock<ArenaState>>,
}

impl Default for NativeFileArena {
    fn default() -> Self {
        Self::new()
    }
}

#[napi]
impl NativeFileArena {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(ArenaState::new())),
        }
    }

    #[napi]
    pub fn index_roots(
        &self,
        roots: Vec<String>,
        options: Option<JsScanFilterOptions>,
    ) -> AsyncTask<ArenaIndexTask> {
        AsyncTask::new(ArenaIndexTask {
            state: Arc::clone(&self.state),
            roots,
            config: to_scan_config(options),
        })
    }

    #[napi]
    pub fn replace_entries(
        &self,
        entries: Vec<JsDeltaEntry>,
        scan_ms: Option<f64>,
    ) -> Result<JsArenaIndexStats> {
        let mut guard = arena_write(&self.state)?;
        guard.replace_all(delta_to_raw(entries), scan_ms.unwrap_or(0.0));
        Ok(stats_from_arena(&guard, "memory"))
    }

    #[napi]
    pub fn apply_delta(
        &self,
        upserts: Vec<JsDeltaEntry>,
        removed_paths: Vec<String>,
        removed_prefixes: Vec<String>,
    ) -> Result<JsArenaIndexStats> {
        let mut guard = arena_write(&self.state)?;
        Ok(apply_arena_delta(
            &mut guard,
            upserts,
            removed_paths,
            removed_prefixes,
        ))
    }

    #[napi]
    pub fn has_path(&self, full_path: String) -> Result<bool> {
        let guard = arena_read(&self.state)?;
        Ok(guard.has_full_path(&full_path))
    }

    #[napi]
    pub fn search(
        &self,
        query: String,
        options: Option<JsSearchOptions>,
    ) -> AsyncTask<ArenaSearchTask> {
        let limit = options.as_ref().and_then(|o| o.limit).unwrap_or(50) as usize;
        let extensions = options.as_ref().and_then(|o| o.extensions.clone());
        let type_filter = options.as_ref().and_then(|o| o.type_filter.clone());
        AsyncTask::new(ArenaSearchTask {
            state: Arc::clone(&self.state),
            query,
            limit,
            extensions,
            type_filter,
        })
    }

    #[napi]
    pub fn save_snapshot(&self, snapshot_path: String) -> Result<u32> {
        let guard = arena_read(&self.state)?;
        let bytes = guard
            .save_snapshot(&PathBuf::from(snapshot_path))
            .map_err(|e| Error::new(Status::GenericFailure, e))?;
        Ok(bytes as u32)
    }

    #[napi]
    pub fn load_snapshot(&self, snapshot_path: String) -> Result<JsArenaIndexStats> {
        let mut guard = arena_write(&self.state)?;
        guard
            .load_snapshot(&PathBuf::from(snapshot_path))
            .map_err(|e| Error::new(Status::GenericFailure, e))?;
        Ok(stats_from_arena(&guard, "snapshot"))
    }

    #[napi]
    pub fn get_stats(&self) -> Result<JsArenaIndexStats> {
        let guard = arena_read(&self.state)?;
        Ok(stats_from_arena(&guard, "memory"))
    }
}

#[napi]
pub struct NativeFsEventsWatcher {
    handle: Mutex<Option<NativeStreamHandle>>,
}

impl Default for NativeFsEventsWatcher {
    fn default() -> Self {
        Self::new()
    }
}

#[napi]
impl NativeFsEventsWatcher {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            handle: Mutex::new(None),
        }
    }

    #[napi]
    pub fn start(
        &self,
        options: JsFsEventsStartOptions,
        on_events: Function<'_, Vec<JsFsEventItem>, ()>,
    ) -> Result<JsFsEventsStartResult> {
        start_fsevents_watcher(&self.handle, options, on_events)
    }

    #[napi]
    pub fn stop(&self) -> Result<()> {
        stop_fsevents_watcher(&self.handle)
    }

    #[napi]
    pub fn is_running(&self) -> Result<bool> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::new(Status::GenericFailure, "Watcher lock poisoned"))?;
        Ok(guard.is_some())
    }
}
