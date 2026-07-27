# 应用图标自愈与数据库句柄加固

## Goal

CoreBox must render cached application icons immediately, recover missing icons without depending on a fully successful startup index pass, and extract macOS application icons without sending image bytes through Electron IPC or Node worker messages. Native resources are materialized atomically to an allowlisted cache path and consumed through the project's protocol data plane. Local libSQL write ownership remains bounded so icon repair cannot exhaust database handles.

## Confirmed Background

- Beta `2.4.13-beta.22` scanned 145 macOS applications in 295 ms; scanning is not the latency source.
- The real profile contained 249 app rows: 174 icon extensions referenced deleted `/var/folders/...` cache paths, 75 were empty, and 0 referenced the current cache root.
- CoreBox correctly mapped those missing paths to `i-ri-apps-line`; the visible command glyph is a terminal fallback, not a loading state.
- AppProvider previously created scanner-sized transaction pressure. `@libsql/client@0.17.4` local transactions retain native handles through prepared-statement ownership until V8 GC; high-cardinality per-app transactions remain prohibited.
- The current cache key is deterministic from platform cache version plus `bundleId || appPath`, but recommendation mapping originally attempted only old-path filename migration.
- The 2026-07-26 hard-crash was initially misattributed to Darwin 27 and to the last visible SQLite error. Commit `48be2d946` changed a working macOS `app.getFileIcon(..., { size: 'normal' })` call to unsupported `size: 'large'`; commit `c0e6045d7` then moved cache-miss hydration into detached background work and amplified the trigger frequency.
- Electron 41.10.2 delegates the macOS lookup to Chromium's ThreadPool. Its Mac icon loader handles SMALL/NORMAL and traps on the unsupported enum, matching the repeated `ThreadPoolForegroundWorker + NSImage + EXC_BREAKPOINT/SIGTRAP` reports. The OS version itself is not the root cause.
- Electron's macOS icon loader is type-oriented and does not reliably provide unique application icons for asset-catalog-only bundles. The durable path is `NSWorkspace iconForFile:` on the AppKit main queue, native atomic PNG persistence, and a path-only completion callback.
- The project currently registers three Electron schemes: `tfile` is the allowlisted local-resource data plane; `atom` is a legacy direct-file handler; `stream` is privileged but has no resource handler. Typed transport streams remain suitable for bounded control/chunk metadata, not image/audio/file bytes.

## Requirements

### R1 — Immediate identity-based cache recovery

- One shared cache-key function must own the versioned application icon path for `IconService`, scanners, and recommendation mapping.
- If the persisted icon is empty or missing, app recommendations must resolve the current cache path from `app path + bundleId` before using the class fallback.
- Cache lookup must remain local, synchronous, bounded to the app result being mapped, and must not invoke Electron native icon extraction.

### R2 — Bounded transactional ownership

- AppProvider startup/full-sync additions, metadata corrections, and icon persistence must use a bounded number of phase transactions independent of app count; one native transaction per app is prohibited.
- File rows and their extension rows remain atomic within each phase. No renderer-side database access or second source of truth is allowed.
- Dependency monkey-patches and forced `global.gc()` are prohibited: the durable application-level fix is to remove high-cardinality transaction creation and keep the remaining low-frequency transaction count bounded.

### R3 — Icon hydration independent of index success

- A completed platform scan must start cache hydration even when app additions or metadata persistence later fail.
- Hydration must extract/dedupe outside a database transaction and persist resolved icon extensions in bounded batches.
- Icon-only hydration must not publish `IndexedSourceDelta` mutations: the search-index mapping does not carry icon bytes or icon paths. A lightweight cache/result invalidation MAY notify consumers after persistence, but resource bytes are always fetched through a protocol URL.
- Database-busy persistence failure receives bounded delayed retries. Cache extraction success remains usable through R1 while persistence retries.
- Shutdown drains or cancels hydration/retry work; no unbounded timer or orphan mutation may remain.

### R4 — Native macOS icon safety and truthful retry

- Darwin app hydration must never pass Electron's unsupported `size: 'large'` option.
- The final macOS application-icon fallback must call `NSWorkspace iconForFile:` on the AppKit main queue inside an autorelease pool, write PNG data atomically to the deterministic cache target, and complete with path/dimension metadata only.
- `NSImage`, `NSData`, `Buffer`, `ArrayBuffer`, or encoded image bytes must not cross a worker/process boundary. A malformed app or missing native icon returns an explicit failure and the normal class fallback without blocking unrelated apps.
- The initial indexed-source scan must not silently convert a failed AppProvider scan into terminal success. Retry must be bounded and observable.

### R5 — Protocol data plane for streaming resources

- Streaming or bulk resource bytes—including images, screenshots, audio, video, and files—must not travel through raw IPC, MessagePort payloads, preload bridges, or Node worker messages.
- Producers materialize resources to an allowlisted path and return a typed descriptor containing path plus bounded metadata. Consumers load the resource through the canonical protocol URL.
- `tfile` is the canonical local-resource scheme for new code. Its handler validates the allowlist and forwards the built-in `file:` request through `net.fetch`, preserving the streaming `Response` body.
- `atom` remains legacy-only and receives no new consumers. The registered `stream` scheme must not be mistaken for the typed transport stream or used as an undocumented byte tunnel.
- Small structured control messages MAY cross the existing typed transport; the payload must not embed resource bytes or base64 data.

## Acceptance Criteria

- [x] With the captured stale-profile shape, cached Chrome, DingTalk, PixPin, and Preview icons resolve on the first CoreBox query without waiting for DB repair (real-profile packaged DOM + screenshot, all four `tfile://.../Library/Caches/app-icons/darwin/...`).
- [x] A successful repair leaves no app icon extension under `/var/folders/...`; valid icons point to the current versioned cache and unresolved apps use the existing fallback (real profile `41 -> 0` stale pointers; 134 current-cache pointers).
- [x] Startup/full-sync transaction count is independent of app count and the post-backfill database-handle delta stays within the documented constant bound without `global.gc()` (module-client `db.batch`; final real-profile cold start held 11 main DB descriptors versus the captured 486).
- [x] Injected `SQLITE_BUSY` during app-row persistence does not prevent a subsequent CoreBox cache-backed query; the write exhausted its bounded retry with an explicit retryable result and succeeded after lock release.
- [x] Darwin production code and regression tests contain no `app.getFileIcon(..., { size: 'large' })` path. The shared Electron boundary rejects Darwin `large`, and the app-icon fallback writes the deterministic PNG through the AppKit helper.
- [x] Native completion is exactly `{ path, width, height }`; invalid path/size codes are stable, `Buffer.isBuffer(result) === false`, and Darwin app icons never enter `IconWorkerClient`, IPC, MessagePort, or preload.
- [x] Renderer-visible application icons continue resolving through `tfile`; focused protocol coverage verifies allowlist admission, `bypassCustomProtocolHandlers: true`, and a streaming `Response` body.
- [x] One isolated Electron dev profile hydrated 227 cache misses and stayed alive for 2m29s with no new `.ips`, `SIGTRAP`, or `EXC_BREAKPOINT`. Five independent native processes then wrote 125 real application icons each (625/625 success); no-`.icns` samples produced distinct AppKit outputs where the OS supplied unique icons.
- [x] Focused AppProvider coverage proves hydrated icon persistence without `search-index applyDelta`; the live hydration log completed 227 icons without icon-only FTS publication.
- [x] Native build, CoreApp node typecheck, scoped ESLint, 107 focused icon/protocol/AppProvider tests, descriptor/error smoke, and the five-process native stress pass.
- [ ] An official-attested N+1 release repeats the real-profile smoke with native trust `pass`; local packaging is explicitly unsigned (`signing-key-unavailable`) and cannot supply release evidence.

## Constraints / Out of Scope

- Do not redesign CoreBox cards, fallback visuals, recommendation ranking, or plugin icons.
- Do not clear or recreate the user database as the fix.
- Do not add a raw IPC/preload/MessagePort channel for icon bytes and do not return native image buffers from the new helper.
- Do not use unsupported Darwin `large` file-icon requests. Once the AppKit helper is active, Darwin app hydration must not fall back to Electron/Chromium file-icon extraction.
- Do not replace SQLite as the business source of truth or undertake the wider search-index split migration in this task.
- No unbounded retries, global GC dependency, administrator prompt, broad protocol allowlist, or compatibility byte tunnel.
