# 技术设计：应用图标自愈与数据库句柄加固

## 1. Boundaries

```text
macOS/Windows scanner
  -> ScannedAppInfo { path, bundleId, icon? }
  -> identity-based versioned cache lookup
  -> AppProvider backfill plan
       -> bounded file/extension transactions
       -> independent icon cache hydration
       -> bounded icon-extension persistence retry
       -> IndexedSource runtime upsert
  -> search-processing-service
       -> persisted icon if valid
       -> current identity cache if valid
       -> i-ri-apps-line fallback
  -> CoreBox renderer
```

SQLite remains the durable app/index source of truth. The filesystem icon cache is derived content addressed by app identity. Renderer code receives only normalized `tfile://` or class icons and never reads the database or extracts native icons.

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
3. Resolved icons are accumulated.
4. Existing app rows receive one batched icon-extension write.
5. Runtime upserts publish immediately after cache success and remain usable while persistence retries.
6. `SQLITE_BUSY` schedules a bounded delayed retry; the identity cache fallback remains usable in the meantime.

Hydration task/timer ownership stays in AppProvider and participates in shutdown draining. Retry state is process-local derived work, never durable state.

## 6. Initial scan retry semantics

SearchCore owns the initial indexed-source scan. Its bounded retry loop must distinguish abort/shutdown from retryable runtime failure. A failed scan is logged and retried with bounded backoff; success terminates the loop. No parallel duplicate scan is allowed.

Icon self-healing does not depend on this retry succeeding, but retry ensures stale metadata is eventually persisted.

## 7. Compatibility and rollback

- No schema migration.
- Existing icon rows remain readable; stale paths are repaired by identity.
- Darwin 27 continues returning `null` before Electron native lookup.
- Windows keeps data-URL behavior and shared worker extraction.
- Reverting source code leaves cache/DB rows valid but reintroduces per-app transaction handle pressure; no dependency patch or schema downgrade is involved.
- The installed Beta backup remains available at `~/Applications/Tuff-backups/tuff-2.4.13-beta.14.app` during real-profile validation.

## 8. Risk controls

- High-cardinality `db.transaction()` loops are forbidden; batch helpers are the single transaction-count boundary for scanner-driven app mutations.
- Batch sizes remain bounded to scanned application count; no million-row workload exists in this provider.
- Filesystem existence checks occur only for mapped result candidates or scanner cache access, never an unbounded renderer pass.
- Cache extraction never runs inside a DB writer task.
- No user database deletion, manual row editing, or fallback to native `app.getFileIcon` on Darwin 27.
