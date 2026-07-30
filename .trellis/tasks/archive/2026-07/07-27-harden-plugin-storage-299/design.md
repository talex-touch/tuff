# Design — 插件 SQLite 与 Secret 加固 #299

## Architecture

```text
Plugin renderer / main-local facade
  -> Tuff transport authoritative identity (#300)
  -> protected storage handler
     identity/current activation/sdkapi/permission/input policy
  -> PluginSqliteRuntimeManager
     canonical path + activation record + bounded scheduler
  -> Worker(plugin-sqlite-worker.js)
     duplicate SQL policy + fixed DB + quota PRAGMA + @libsql/client
  -> bounded response / stable error
```

Secret lane shares the same identity/permission resolver but remains in main because encryption keys and secure-store ownership are host-only.

## Error Contract

Define shared constants and `PluginStorageErrorCode` in the plugin event types. Public responses expose `{ success, code?, error? }`; errors use generic messages. SDK `PluginStorageError` preserves `code` and operation. Native error text, SQL, params, canonical paths, keys and values stay in sanitized internal diagnostics only.

Core codes cover caller/permission/sdk/plugin availability, path/symlink, SQL invalid/denied/size, params/statements, rows/result, concurrency/timeout, disk quota, worker unavailable, Secret key/backend.

## Authoritative Plugin Resolution

A helper receives `(payload, HandlerContext)` and:

1. requires `isAuthoritativePluginContext(context.plugin)`;
2. resolves `manager.getPluginByName(context.plugin.name)`;
3. compares `TouchPlugin.getActivationIdentity()` against identity pluginName/instance/generation;
4. rejects payload `pluginName` mismatch but never uses it as authority;
5. requires a runnable status;
6. applies sdkapi gate and `withPermission({ requireVerifiedPlugin: true, failClosedForPlugin: true })`.

SQLite and Secret use separate permission ids but one error-normalization contract. Secret health is no longer host-global anonymous data.

## SQL Policy

Create a pure scanner with states: normal, single/double/backtick/bracket quote, line comment, block comment. It returns tokens and one executable statement or a stable policy error. It handles doubled quote escapes and permits one terminal semicolon followed only by comments/space.

- Query lane: top-level `SELECT` only; host wraps validated SQL as `SELECT * FROM (<sql>) LIMIT 1001`.
- Execute/transaction: `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`, `CREATE INDEX`, `DROP TABLE`, `DROP INDEX`, and narrowly parsed `ALTER TABLE`.
- Always denied anywhere outside quoted/comment text: ATTACH, DETACH, PRAGMA, VACUUM, load_extension, transaction/savepoint keywords, RETURNING, CREATE TRIGGER/VIEW/VIRTUAL TABLE.

The host validates before queue admission; worker validates again before execution. Host-generated BEGIN/COMMIT/ROLLBACK and quota PRAGMAs use private worker functions, never request flags.

## Worker Protocol

Electron-vite builds `plugin-sqlite-worker.js`. Protocol messages contain request id, fixed operation kind, SQL/params/statements, and initialization dbPath/quota. The worker owns one Client and handles one request at a time.

Main runtime starts workers with bounded `resourceLimits`, tracks exactly one in-flight request per worker, and starts the deadline only when execution begins. On timeout/error/exit it marks the generation poisoned, rejects current and queued calls with a stable code, awaits `worker.terminate()`, removes the conditional record, and lazily recreates later.

A timed-out mutation may leave WAL/journal state, but worker termination closes the native handle; the next worker relies on SQLite crash recovery before accepting work. Tests prove no late reply and no stale record deletion.

## Runtime Manager And Quotas

`PluginSqliteRuntimeManager` keys records by plugin instance + activation generation, while plugin name is metadata. It owns:

- per-record FIFO queue (max 8), one active;
- global semaphore (max 4 active);
- max 16 live workers with idle LRU shutdown;
- canonical path resolver and DB-size checks;
- closePlugin(identity/name), closeAll(), and conditional generation cleanup.

Input limits are enforced before worker startup. Worker enforces row/result size before posting. Database quota is initialized using actual page size and verified `max_page_count`; retained journal limit and checkpoint run through trusted worker commands. Existing over-quota DBs fail closed without mutation.

## Canonical Path

Only host metadata supplies paths. Validate plugin name as a safe segment, create expected owner data directory, resolve canonical global plugin root and owner root, and require strict path-component containment. Reject symlinked owner roots and database files; existing DB realpath must be a direct child of owner root. Recheck after worker opens. TOCTOU against a process with direct filesystem access remains bounded by #297, but transport traversal/symlink escape is rejected.

## Lifecycle

PluginModule owns one runtime manager. It subscribes to committed `PERMISSION_REVOKED` and disposes the listener on destroy.

- revoke storage.sqlite/revokeAll: mark matching activation revoked, reject queue, terminate worker, retain DB;
- revoke storage.plugin: new Secret calls fail guard, retain values;
- disable/reload/unload/crash: terminate old activation, retain DB/Secret;
- uninstall: await worker termination before directory removal, then atomic purge of `plugin.<name>.` Secret prefix;
- module destroy: terminate all workers and dispose listeners.

Nested plugin manager lifecycle receives an explicit storage teardown callback; unload becomes truly async and awaits disable + teardown before map/directory mutation.

## Secure Store

Serialize mutations per root with a Promise tail that survives rejection. Each mutation reads current store inside the critical section, writes a random same-directory temp file with mode 0600, fsyncs file, renames atomically, and best-effort fsyncs directory. Cleanup temp on failure. Prefix purge derives its prefix in host code and uses the same mutation path.

Reads remain concurrent. A write failure returns false/preserves prior store. Logging is generic and excludes key/value/path.

## Compatibility And Rollback

Successful SDK shapes and fixed filename remain unchanged. Unsupported SQL becomes an intentional hard cut; no official plugin currently uses SQLite. Secret missing remains null, but denied/unavailable becomes a typed failure. Rollback can disable worker registration and SQLite handlers, but must not restore main-process raw SQL or fail-open permission behavior.
