# 实施计划：应用图标自愈与数据库句柄加固

## 1. Planning gate

- Preserve the captured real-profile evidence and the `@libsql/client` 200-transaction reproduction.
- Record the corrected crash timeline: `normal -> large` introduced the unsupported macOS enum; detached hydration amplified it; the SQLite error remained independent.
- Update PRD, technical design, executable code-spec, and audit backlog before implementation.
- Validate the three observed Electron schemes (`tfile`, legacy `atom`, reserved `stream`) and keep typed transport streams separate from the resource byte data plane.

## 2. Shared cache identity

- Move native cache version/key ownership from `IconService` into `app-icon-cache.ts`.
- Update `IconService` to consume the shared resolver.
- Extend app recommendation mapping to resolve a current identity cache after a stale/empty persisted icon.

## 3. Database transaction ownership

- Preserve the controlled reproduction proving upstream prepared-statement handles are GC-bound; do not ship an incomplete dependency patch.
- Make scanner-driven AppProvider write-phase count constant; use module-client `db.batch()` for metadata/icons and retain one addition transaction for returned file IDs.
- Verify the AppProvider workflow's handle delta, not arbitrary upstream transaction finalization.

## 4. AppProvider batching

- Extract shared startup/full-sync addition and metadata batch helpers.
- Replace per-app transactions with one writer-scheduled atomic write phase per mutation kind.
- Preserve atomic file/extension writes, counters, cancellation, and existing logs.

## 5. Native Darwin icon hydration

- Extend `@talex-touch/tuff-native` with a typed `writeDarwinAppIcon({ sourcePath, outputPath, size })` Promise contract.
- Validate paths and bounded size on the N-API boundary. Run `NSWorkspace iconForFile:` on the AppKit main queue inside `@autoreleasepool`, rasterize to PNG, and write with atomic file semantics.
- Complete with `{ path, width, height }` only. Native image pointers, `NSData`, `Buffer`, `ArrayBuffer`, base64, and PNG bytes never cross the native/worker boundary.
- Keep `.icns -> sips` as the Darwin fast path. Replace the Darwin `app.getFileIcon({ size: 'large' })` fallback with the native path writer; serialize distinct native cache misses and retain identity-key single-flight.
- Start hydration from scanner output independently of backfill completion, batch icon persistence, keep bounded DB-busy retry ownership, and drain work on shutdown.

## 6. Protocol resource data plane

- Make `tfile` the only new local-resource scheme: validate the existing allowlist, then forward to the built-in `file:` handler with `net.fetch(..., { bypassCustomProtocolHandlers: true })` and return its streaming `Response`.
- Do not add new `atom` consumers. Do not use the currently handler-less `stream` scheme as a byte tunnel.
- Keep typed IPC/MessagePort streams for bounded structured control metadata only. Add no icon preload bridge, raw channel, worker byte message, or base64 projection.
- Ensure application search mapping continues to return the deterministic cache as a `tfile://` URL.

## 7. Remove icon-only index mutation

- Delete per-icon `publishAppRuntimeUpsert(..., 'app-icon-hydrated')` calls: the search-index adapter drops `record.icon`, so the mutation only rewrites FTS/keyword/meta state.
- Persist hydrated icon pointers in the existing bounded batch. If immediate visible refresh is required, use one lightweight cache/result invalidation carrying no resource bytes; do not route through IndexedSource/FTS.
- Assert one hydration run creates zero search-index mutations and remains restart-safe after partial persistence failure.

## 8. Initial scan retry

- Add bounded, single-flight retry around SearchCore's initial AppProvider indexed-source scan.
- Abort cleanly during shutdown and keep failure telemetry truthful.

## 9. Functional smoke before cleanup

- Build/rebuild the native addon for the Electron target and verify its exported path-writer contract.
- Run focused native, protocol, Darwin icon, AppProvider hydration, recommendation mapping, and libSQL handle checks.
- Run a controlled 125-cache-miss profile through scanner -> native cache write -> icon persistence -> `tfile` response -> CoreBox mapping. Confirm no icon bytes appear in worker/IPC messages.
- Perform at least five cold starts, keep each run alive through hydration, and verify no new `.ips`, `SIGTRAP`, `EXC_BREAKPOINT`, unsupported `large`, icon-only FTS mutation, or AppProvider busy exhaustion.
- Launch a packaged app with an isolated profile before using the captured real profile; do not delete or rewrite the database manually.

## 10. Rollback points

- Native AppKit failure degrades to the class fallback. Emergency diagnosis may temporarily restore Darwin `normal`, but never `large` or a Buffer IPC path.
- The `tfile` forwarding option is independently reversible without changing URL or cache formats; the allowlist is never relaxed.
- AppProvider batching and removal of icon-only FTS mutation are independently reversible, but any refresh replacement must remain metadata-only.
- Shared cache identity is deterministic and schema-free. No dependency patch, schema migration, cache downgrade, or user-database reset is involved.
