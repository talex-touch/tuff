# 技术设计：应用图标自愈与数据库句柄加固

## 1. Boundaries

```text
macOS/Windows scanner
  -> ScannedAppInfo { path, bundleId, icon? }
  -> identity-based versioned cache lookup
  -> AppProvider backfill plan
       -> bounded file/extension transactions
       -> independent icon cache hydration
            macOS cache miss
              -> .icns + sips fast path
              -> tuff-native AppKit helper
              -> event-loop callback on AppKit main thread
                   -> @autoreleasepool
                   -> NSWorkspace iconForFile:
                   -> atomic PNG write to deterministic cache path
                   -> completion { path, width, height }
            Windows cache miss
              -> existing IconWorkerClient compatibility path
       -> bounded icon-extension persistence retry
       -> one lightweight cache/result invalidation if required
  -> search-processing-service
       -> persisted icon if valid
       -> current identity cache if valid
       -> i-ri-apps-line fallback
  -> tfile:// allowlisted protocol -> built-in file: streaming Response
  -> CoreBox renderer
```

SQLite remains the durable app/index source of truth. The filesystem icon cache is derived content addressed by app identity. Renderer code receives only normalized `tfile://` or class icons and never reads the database, invokes native extraction, or receives image bytes over IPC.

## 2. Shared icon cache contract

Move cache version/key construction into `app-icon-cache.ts`:

```ts
resolveVersionedAppIconCachePath(appPath, bundleId, platform): string | null

resolveExistingVersionedAppIconCachePath(appPath, bundleId, platform): string | null

```

`IconService.getCachedAppIcon()` and `ensureAppIcon()` use the same path. `search-processing-service` receives `path` and `bundleId`; when the persisted icon is absent/nonexistent it checks this deterministic current path before falling back.

This is not a second business state store. The cache file is derived from stable app identity and only supplies bytes when the persisted pointer is stale.

## 3. Transaction lifecycle

`@libsql/client@0.17.4` local `Sqlite3Client.transaction()` detaches a native database connection. Prepared statements retain that connection until V8 GC even after commit, explicit transaction close, and native database close. An incomplete dependency patch or forced GC would hide rather than remove the ownership problem.

Application invariant:

```text
transaction count = O(write phases), never O(scanned applications)
```

AppProvider therefore builds mutation plans in memory and performs one atomic write phase independent of app count. Metadata, icon-pointer repair, and icon hydration use Drizzle/libSQL `db.batch()`, which stays on the module client instead of detaching transaction connections; additions retain one phase transaction because extension rows require returned file IDs. Realtime single-item mutations remain low-frequency and atomic. The controlled handle smoke measures the AppProvider workflow, not an impossible claim that the upstream native binding finalizes arbitrary prepared statements synchronously.

## 4. AppProvider write batching

Replace per-app `runAdaptiveTaskQueue(...runAppTransaction...)` with bounded atomic write phases:

1. Build and validate additions/updates in memory.
2. Schedule one database writer task per phase.
3. Use module-client `db.batch()` for metadata/icon writes and one transaction for the addition phase.
4. Abort/retry the phase on database-wide failure.
5. Record and skip only record-local invalid input discovered before the write phase.

Startup backfill and full sync share the same batch helpers. Realtime one-app operations retain their existing single transaction.

## 5. Independent hydration and self-healing

Hydration starts immediately after scanner output exists, not after all app-row writes succeed.

1. Scanner cache hits are assigned to `ScannedAppInfo.icon` immediately.
2. Cache misses are deduped by `IconService.ensureAppIcon()` and extracted outside SQLite transactions.
3. Darwin first attempts the existing `.icns -> sips` path. Missing/failed standalone icons use the tuff-native AppKit helper; Electron `app.getFileIcon` is not a Darwin app-icon fallback.
4. The helper writes directly to the deterministic cache path and resolves with path/dimension metadata. No native image buffer enters TypeScript or a worker message.
5. Resolved icons are accumulated and existing app rows receive one batched icon-extension write.
6. Icon-only hydration does not publish `IndexedSourceDelta`: `mapIndexedSourceRecordToSearchIndexItem()` has no icon field, so the old upsert only rewrote FTS/keyword/meta state. If an already-visible result needs refresh, one lightweight invalidation is the control plane; `tfile` remains the byte data plane.
7. `SQLITE_BUSY` schedules a bounded delayed persistence retry; the identity cache fallback remains usable in the meantime.

Hydration task/timer ownership stays in AppProvider and participates in shutdown draining. Retry state is process-local derived work, never durable state.

## 6. Three Electron protocol surfaces

| Scheme   | Current implementation                                                                                                                    | Ownership decision                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `tfile`  | Privileged `standard/secure/supportFetchAPI/stream` scheme; canonical path parsing, allowlist validation, and `net.fetch(file:)` response | Canonical data plane for new local images, screenshots, audio, video, and file resources      |
| `atom`   | Legacy `protocol.handle('atom')` direct-file forwarding without the `tfile` allowlist                                                     | Legacy-only; no new consumers and no new security assumptions                                 |
| `stream` | Privileged scheme registration exists, but the current source has no resource handler                                                     | Reserved until it has an explicit owner/contract; never use it as an undocumented blob tunnel |

`packages/utils/transport/sdk/stream/protocol.ts` is a separate typed transport protocol. It may carry bounded structured control/chunk metadata. It must not carry `Buffer`, `ArrayBuffer`, base64 images, audio, video, screenshots, or arbitrary files. Bulk bytes are materialized once and fetched through `tfile`.

The `tfile` handler forwards the validated `file:` URL with `bypassCustomProtocolHandlers: true`. Electron exposes the returned body as a Web `ReadableStream`; no main-process `readFile()` or IPC byte copy is introduced.

## 7. Native AppKit completion contract

```ts
interface DarwinAppIconWriteOptions {
  sourcePath: string
  outputPath: string
  size: number
}

interface DarwinAppIconWriteResult {
  path: string
  width: number
  height: number
}

writeDarwinAppIcon(options: DarwinAppIconWriteOptions): Promise<DarwinAppIconWriteResult>
```

The public JS Promise yields through `setImmediate`, so every extraction starts on a fresh Electron main-process event-loop turn. The private N-API binding is synchronous by design and rejects any non-main-thread caller before touching AppKit; it validates bounded string/size inputs and calls `NSWorkspace.sharedWorkspace iconForFile:` inside `@autoreleasepool`. The native implementation rasterizes directly to PNG and writes atomically. `NSImage`, `CGImageRef`, `NSData`, and image bytes are destroyed before JavaScript completion; only the descriptor crosses the native boundary. No `Napi::AsyncWorker`, libuv icon worker, or native-image callback payload is involved.

Stable failures use `ERR_DARWIN_APP_ICON_*` codes for invalid input/size, wrong-thread use, unsupported platform, icon unavailability, rasterization, and write failure. A failure resolves through the existing IconService fallback policy; it never falls back to an unsupported Electron `large` request.

## 8. Initial scan retry semantics

SearchCore owns the initial indexed-source scan. Its bounded retry loop must distinguish abort/shutdown from retryable runtime failure. A failed scan is logged and retried with bounded backoff; success terminates the loop. No parallel duplicate scan is allowed.

Icon self-healing does not depend on this retry succeeding, but retry ensures stale metadata is eventually persisted.

## 9. Compatibility and rollback

- No schema migration.
- Existing icon rows remain readable; stale paths are repaired by identity.
- Darwin `.icns -> sips` remains the first extraction path; the AppKit helper covers asset-catalog-only or otherwise unresolved bundles.
- Windows keeps its existing compatibility behavior and shared worker extraction until a separate protocol migration is designed.
- `tfile` remains backward-compatible and only gains explicit built-in-handler forwarding after the same allowlist check.
- Rolling back the native helper may temporarily restore Darwin `normal` only for emergency diagnosis; `large` and Buffer IPC remain prohibited. The safe product rollback is the class fallback.
- Reverting source code leaves cache/DB rows valid but may reintroduce per-app transaction handle pressure; no dependency patch or schema downgrade is involved.

## 10. Risk controls

- High-cardinality `db.transaction()` loops are forbidden; batch helpers are the single transaction-count boundary for scanner-driven app mutations.
- AppKit calls execute on the macOS main queue with one autorelease pool per request. TypeScript retains cache-key single-flight and serializes distinct Darwin native extractions so libuv/AppKit queues are not flooded.
- The native helper writes only the caller-owned deterministic cache target. The `tfile` allowlist remains the renderer access boundary.
- No resource byte array may be returned from the native app-icon API or posted through a Node worker/MessagePort/IPC channel.
- Filesystem existence checks occur only for mapped result candidates or scanner cache access, never an unbounded renderer pass.
- Cache extraction never runs inside a DB writer task; icon-only cache completion never mutates FTS.
- No user database deletion, manual row editing, global GC dependency, or renderer-side native extraction.
