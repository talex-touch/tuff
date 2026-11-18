use std::collections::HashSet;
use std::sync::{Arc, Mutex, RwLock, RwLockReadGuard, RwLockWriteGuard};

use napi::bindgen_prelude::Function;
use napi::threadsafe_function::{ThreadsafeCallContext, ThreadsafeFunctionCallMode};
use napi::{Env, Error, Result, Status, Task};
use napi_derive::napi;

use crate::arena::ArenaState;
use crate::darwin_app::NativeFrontmostAppInfo;
use crate::darwin_spotlight::query_spotlight;
use crate::fsevents::{
    FsEventsVolumeCheckpoint, NativeFsEventItem, NativeStreamHandle, get_volume_checkpoint,
    start_stream,
};
use crate::scanner::{RawScannedEntry, ScanFilterConfig, scan_roots_bulk, scan_roots_bulk_grouped};
use crate::scorer::{NativeSearchMatchItem, search_arena};

#[napi(object)]
pub struct FileIndexCapabilities {
    pub supported: bool,
    pub platform: String,
    pub has_bulk_scanner: bool,
    pub has_native_fsevents: bool,
    pub has_native_spotlight: bool,
    pub has_native_frontmost_app: bool,
}

#[napi(object)]
pub struct JsFrontmostAppInfo {
    pub display_name: Option<String>,
    pub bundle_id: Option<String>,
    pub process_id: Option<i32>,
    pub executable_path: Option<String>,
    pub window_title: Option<String>,
}

#[napi(object)]
pub struct JsSpotlightHit {
    pub path: String,
    pub name: String,
    pub mtime_ms: f64,
    pub size: f64,
    pub is_dir: bool,
}

#[napi(object)]
pub struct JsScanFilterOptions {
    pub exclude_names: Option<Vec<String>>,
    pub context_dependent_names: Option<Vec<String>>,
    pub project_markers: Option<Vec<String>>,
    pub exclude_dir_suffixes: Option<Vec<String>>,
    pub exclude_hidden: Option<bool>,
    pub exclude_path_prefixes: Option<Vec<String>>,
    pub allow_path_prefixes: Option<Vec<String>>,
    pub max_depth: Option<u32>,
    pub include_dirs: Option<bool>,
    pub skip_linked_worktrees: Option<bool>,
}

#[napi(object)]
pub struct JsBulkScanEntry {
    pub dir: String,
    pub name: String,
    pub is_dir: bool,
    pub mtime_sec: u32,
}

#[napi(object)]
pub struct JsBulkScanResult {
    pub entries: Vec<JsBulkScanEntry>,
    pub file_count: u32,
    pub dir_count: u32,
    pub skipped_count: u32,
    pub error_count: u32,
    pub duration_ms: f64,
    pub backend: String,
}

#[napi(object)]
pub struct JsArenaIndexStats {
    pub file_count: u32,
    pub dir_count: u32,
    pub active_count: u32,
    pub tombstone_count: u32,
    pub arena_bytes: u32,
    pub last_scan_ms: f64,
    pub backend: String,
}

#[napi(object)]
pub struct JsSearchOptions {
    pub limit: Option<u32>,
    pub extensions: Option<Vec<String>>,
    pub type_filter: Option<String>,
}

#[napi(object)]
pub struct JsSearchMatchItem {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub is_dir: bool,
    pub mtime_sec: u32,
    pub mtime_ms: f64,
    pub score: f64,
    pub match_kind: String,
    pub matched_ranges: Vec<Vec<u32>>,
}

#[napi(object)]
pub struct JsSearchResult {
    pub items: Vec<JsSearchMatchItem>,
    pub total_indexed: u32,
    pub bitmap_rejected: u32,
    pub evaluated_candidates: u32,
    pub duration_ms: f64,
}

#[napi(object)]
pub struct JsDeltaEntry {
    pub dir: String,
    pub name: String,
    pub is_dir: bool,
    pub mtime_sec: Option<u32>,
}

#[napi(object)]
pub struct JsFsEventsCheckpoint {
    pub supported: bool,
    pub volume_uuid: Option<String>,
    pub current_event_id: Option<String>,
}

#[napi(object)]
pub struct JsFsEventItem {
    pub event_id: String,
    pub path: String,
    pub kind: String,
    pub action: String,
    pub flags: u32,
    pub is_history_done: bool,
}

#[napi(object)]
pub struct JsFsEventsStartOptions {
    pub roots: Vec<String>,
    pub since_event_id: Option<String>,
    pub volume_uuid: Option<String>,
    pub latency_ms: Option<f64>,
}

#[napi(object)]
pub struct JsFsEventsStartResult {
    pub replaying_since_when: bool,
    pub checkpoint: JsFsEventsCheckpoint,
}

pub fn to_scan_config(options: Option<JsScanFilterOptions>) -> ScanFilterConfig {
    let Some(opt) = options else {
        return ScanFilterConfig::default();
    };
    let to_lower_set = |items: Option<Vec<String>>| -> HashSet<String> {
        items
            .unwrap_or_default()
            .into_iter()
            .map(|s| s.to_lowercase())
            .collect()
    };
    let to_lower_vec = |items: Option<Vec<String>>| -> Vec<String> {
        items
            .unwrap_or_default()
            .into_iter()
            .map(|s| s.to_lowercase())
            .collect()
    };
    ScanFilterConfig {
        exclude_names: to_lower_set(opt.exclude_names),
        context_dependent_names: to_lower_set(opt.context_dependent_names),
        project_markers: to_lower_set(opt.project_markers),
        exclude_dir_suffixes: to_lower_vec(opt.exclude_dir_suffixes),
        exclude_hidden: opt.exclude_hidden.unwrap_or(false),
        exclude_path_prefixes: opt.exclude_path_prefixes.unwrap_or_default(),
        allow_path_prefixes: opt.allow_path_prefixes.unwrap_or_default(),
        max_depth: opt.max_depth.unwrap_or(24) as usize,
        include_dirs: opt.include_dirs.unwrap_or(true),
        skip_linked_worktrees: opt.skip_linked_worktrees.unwrap_or(true),
    }
}

#[inline]
pub fn stats_from_arena(guard: &ArenaState, backend: &str) -> JsArenaIndexStats {
    JsArenaIndexStats {
        file_count: guard.active_files as u32,
        dir_count: guard.active_dirs as u32,
        active_count: (guard.active_files + guard.active_dirs) as u32,
        tombstone_count: guard.tombstones as u32,
        arena_bytes: guard.memory_bytes() as u32,
        last_scan_ms: guard.last_scan_ms,
        backend: backend.to_string(),
    }
}

pub fn delta_to_raw(entries: Vec<JsDeltaEntry>) -> Vec<RawScannedEntry> {
    entries
        .into_iter()
        .map(|e| RawScannedEntry {
            dir: e.dir,
            name: e.name,
            is_dir: e.is_dir,
            mtime_sec: e.mtime_sec.unwrap_or(0),
        })
        .collect()
}

pub fn arena_read(state: &RwLock<ArenaState>) -> Result<RwLockReadGuard<'_, ArenaState>> {
    state
        .read()
        .map_err(|_| Error::new(Status::GenericFailure, "Arena lock poisoned"))
}

pub fn arena_write(state: &RwLock<ArenaState>) -> Result<RwLockWriteGuard<'_, ArenaState>> {
    state
        .write()
        .map_err(|_| Error::new(Status::GenericFailure, "Arena lock poisoned"))
}

pub fn apply_arena_delta(
    guard: &mut ArenaState,
    upserts: Vec<JsDeltaEntry>,
    removed_paths: Vec<String>,
    removed_prefixes: Vec<String>,
) -> JsArenaIndexStats {
    for prefix in removed_prefixes {
        guard.remove_prefix(&prefix);
    }
    for p in removed_paths {
        guard.remove_full_path(&p);
    }
    for e in upserts {
        guard.upsert(&e.dir, &e.name, e.is_dir, e.mtime_sec.unwrap_or(0));
    }
    guard.compact_if_needed();
    stats_from_arena(guard, "delta")
}

pub fn to_js_frontmost_app(app: NativeFrontmostAppInfo) -> JsFrontmostAppInfo {
    JsFrontmostAppInfo {
        display_name: app.display_name,
        bundle_id: app.bundle_id,
        process_id: app.process_id,
        executable_path: app.executable_path,
        window_title: app.window_title,
    }
}

pub fn to_js_checkpoint(ck: FsEventsVolumeCheckpoint) -> JsFsEventsCheckpoint {
    JsFsEventsCheckpoint {
        supported: ck.supported,
        volume_uuid: ck.volume_uuid,
        current_event_id: ck.current_event_id,
    }
}

pub fn start_fsevents_watcher(
    handle: &Mutex<Option<NativeStreamHandle>>,
    options: JsFsEventsStartOptions,
    on_events: Function<'_, Vec<JsFsEventItem>, ()>,
) -> Result<JsFsEventsStartResult> {
    let mut guard = handle
        .lock()
        .map_err(|_| Error::new(Status::GenericFailure, "Watcher lock poisoned"))?;
    if let Some(prev) = guard.take() {
        prev.stop();
    }

    let tsfn = on_events
        .build_threadsafe_function::<Vec<JsFsEventItem>>()
        .max_queue_size::<256>()
        .build_callback(|ctx: ThreadsafeCallContext<Vec<JsFsEventItem>>| Ok(ctx.value))?;

    let primary_root = options.roots.first().cloned().unwrap_or_default();
    let stream_handle = start_stream(
        &options.roots,
        options.since_event_id.as_deref(),
        options.volume_uuid.as_deref(),
        options.latency_ms.unwrap_or(80.0),
        Box::new(move |events: Vec<NativeFsEventItem>| {
            let js_events: Vec<JsFsEventItem> = events
                .into_iter()
                .map(|e| JsFsEventItem {
                    event_id: e.event_id,
                    path: e.path,
                    kind: e.kind,
                    action: e.action,
                    flags: e.flags,
                    is_history_done: e.is_history_done,
                })
                .collect();
            let _ = tsfn.call(js_events, ThreadsafeFunctionCallMode::NonBlocking);
        }),
    )
    .map_err(|e| Error::new(Status::GenericFailure, e))?;

    let replaying = stream_handle.replaying_since_when;
    *guard = Some(stream_handle);
    Ok(JsFsEventsStartResult {
        replaying_since_when: replaying,
        checkpoint: to_js_checkpoint(get_volume_checkpoint(&primary_root)),
    })
}

pub fn stop_fsevents_watcher(handle: &Mutex<Option<NativeStreamHandle>>) -> Result<()> {
    let mut guard = handle
        .lock()
        .map_err(|_| Error::new(Status::GenericFailure, "Watcher lock poisoned"))?;
    if let Some(prev) = guard.take() {
        prev.stop();
    }
    Ok(())
}

pub struct SpotlightQueryTask {
    pub query: String,
    pub roots: Vec<String>,
    pub limit: usize,
    pub timeout_ms: u64,
}

impl Task for SpotlightQueryTask {
    type Output = Vec<JsSpotlightHit>;
    type JsValue = Vec<JsSpotlightHit>;

    fn compute(&mut self) -> Result<Self::Output> {
        let hits = query_spotlight(&self.query, &self.roots, self.limit, self.timeout_ms)
            .map_err(|e| Error::new(Status::GenericFailure, e))?;
        Ok(hits
            .into_iter()
            .map(|h| JsSpotlightHit {
                path: h.path,
                name: h.name,
                mtime_ms: h.mtime_ms,
                size: h.size,
                is_dir: h.is_dir,
            })
            .collect())
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct BulkScanTask {
    pub roots: Vec<String>,
    pub config: ScanFilterConfig,
}

impl Task for BulkScanTask {
    type Output = JsBulkScanResult;
    type JsValue = JsBulkScanResult;

    fn compute(&mut self) -> Result<Self::Output> {
        let outcome = scan_roots_bulk(&self.roots, &self.config, None);
        Ok(JsBulkScanResult {
            entries: outcome
                .entries
                .into_iter()
                .map(|e| JsBulkScanEntry {
                    dir: e.dir,
                    name: e.name,
                    is_dir: e.is_dir,
                    mtime_sec: e.mtime_sec,
                })
                .collect(),
            file_count: outcome.file_count as u32,
            dir_count: outcome.dir_count as u32,
            skipped_count: outcome.skipped_count as u32,
            error_count: outcome.error_count as u32,
            duration_ms: outcome.duration_ms,
            backend: outcome.backend.to_string(),
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct ArenaIndexTask {
    pub state: Arc<RwLock<ArenaState>>,
    pub roots: Vec<String>,
    pub config: ScanFilterConfig,
}

impl Task for ArenaIndexTask {
    type Output = JsArenaIndexStats;
    type JsValue = JsArenaIndexStats;

    fn compute(&mut self) -> Result<Self::Output> {
        let outcome = scan_roots_bulk_grouped(&self.roots, &self.config, None);
        let mut guard = self
            .state
            .write()
            .map_err(|_| Error::new(Status::GenericFailure, "Arena lock poisoned"))?;
        guard.replace_from_groups(outcome.groups, outcome.duration_ms);
        Ok(stats_from_arena(&guard, outcome.backend))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct ArenaSearchTask {
    pub state: Arc<RwLock<ArenaState>>,
    pub query: String,
    pub limit: usize,
    pub extensions: Option<Vec<String>>,
    pub type_filter: Option<String>,
}

impl Task for ArenaSearchTask {
    type Output = JsSearchResult;
    type JsValue = JsSearchResult;

    fn compute(&mut self) -> Result<Self::Output> {
        let guard = self
            .state
            .read()
            .map_err(|_| Error::new(Status::GenericFailure, "Arena lock poisoned"))?;
        let outcome = search_arena(
            &guard,
            &self.query,
            self.limit,
            self.extensions.as_ref(),
            self.type_filter.as_deref(),
        );
        Ok(JsSearchResult {
            items: outcome
                .items
                .into_iter()
                .map(|item: NativeSearchMatchItem| JsSearchMatchItem {
                    path: item.path,
                    name: item.name,
                    extension: item.extension,
                    is_dir: item.is_dir,
                    mtime_sec: item.mtime_sec,
                    mtime_ms: item.mtime_ms,
                    score: item.score,
                    match_kind: item.match_kind,
                    matched_ranges: item.matched_ranges,
                })
                .collect(),
            total_indexed: outcome.total_indexed as u32,
            bitmap_rejected: outcome.bitmap_rejected as u32,
            evaluated_candidates: outcome.evaluated_candidates as u32,
            duration_ms: outcome.duration_ms,
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}
