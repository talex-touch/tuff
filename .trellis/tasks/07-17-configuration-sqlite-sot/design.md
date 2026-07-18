# Configuration SQLite Source of Truth — Design

## Boundary

`StorageModule` remains the public owner of application configuration and the only mutable cache. A new repository isolates SQLite and legacy-file mechanics:

```text
renderer / main callers
        │ typed StorageEvents + main-storage helpers
        ▼
   StorageModule (sync cache, versions, subscriptions)
        │ async persistence / startup hydration
        ▼
ApplicationConfigRepository
   ├─ sqlite backend (default SoT)
   └─ legacy backend (migration, mirror, explicit fallback)
```

Plugin storage and other persisted domains do not cross this boundary.

## Schema

Add `app_config_entries`:

| Column | Contract |
|---|---|
| `key` | normalized POSIX relative config key, primary key |
| `value` | validated JSON text; `{}` for tombstones |
| `revision` | integer `>= 0`, persisted conflict/version source |
| `deleted` | boolean tombstone; prevents legacy resurrection |
| `updated_at` | epoch milliseconds for diagnostics/order evidence |

Add `app_config_migration_state` with singleton `id = 'legacy-v1'`, phase, backup path, imported/skipped/failed counts and completion timestamp. The migration transaction writes entries and terminal state together. No payload is copied into migration diagnostics.

`apps/core-app/resources/db/migrations/0029_app_config_sot.sql`, schema declarations, and migration journal are updated together.

## Startup data flow

1. `databaseModule` runs schema migrations.
2. `storageModule.onInit()` obtains `databaseModule.getClient()` and resolves backend mode.
3. SQLite mode creates/validates a fixed backup of legacy config files before first import.
4. It recursively scans the config directory, excluding `plugins/`, backup directories, hidden migration markers and non-files. Relative paths are normalized to `/` and validated with the existing config-name policy.
5. Valid JSON is imported in one transaction with insert-if-absent. Existing SQLite rows, including tombstones, always win.
6. All SQLite rows are loaded once. Non-deleted rows hydrate `StorageCache` with persisted revision and serialized value; tombstones hydrate a deleted-key set.
7. `APP_SETTING` and `ACCOUNT` warmup completes from cache, then readiness becomes ready.
8. On migration/hydration failure, the repository stops using SQLite for the configuration domain, records one stable fallback reason, and loads legacy mode only. It does not close the shared DatabaseModule client. Reads never merge SQLite and file values in one runtime.

Crash behavior:

- crash before backup completes: no DB rows committed; retry backup/import;
- crash during import transaction: transaction rolls back; retry;
- crash after DB commit: migration state is complete and rows are authoritative;
- mirror failure after commit: SQLite remains authoritative, diagnostic remains visible.

## Runtime read/write flow

### Read

`getConfig()` remains synchronous. SQLite mode never performs per-read disk I/O; the repository retains serialized row snapshots so an LRU cache miss can be materialized without a second database query or a duplicate parsed object. `reloadConfig()` refreshes legacy mode from its file primary; SQLite mode reloads the in-process authoritative snapshot because no external writer is allowed.

### Save

`saveConfig()` preserves synchronous validation, dedupe, optimistic client-version checking, cache mutation and update broadcast. The polling service or `persistMainConfig()` submits a snapshot `{ key, value, revision, deleted }` to a serialized repository queue.

SQLite upsert is revision-monotonic. A queued older revision cannot replace a newer row. Success updates `persistedContent`; failure leaves the cache dirty for existing retry/quarantine behavior.

After SQLite commit, legacy mirror is atomically replaced using a temp file + rename. Tombstone commit removes the mirror. Mirror failure is logged but does not mark the SQLite write failed.

### Delete

Delete sets cache data to `{}`, increments the revision, records the key in the deleted set and marks it dirty. Persistence writes a tombstone before removing the mirror. Reads return `{}` and imports never resurrect the key.

## Backend and rollback modes

- Default: `TALEX_CONFIG_STORAGE_BACKEND=sqlite` (implicit). SQLite is primary. `TALEX_CONFIG_LEGACY_MIRROR` defaults enabled for the compatibility window.
- Explicit rollback: `TALEX_CONFIG_STORAGE_BACKEND=legacy`. Legacy files are primary; no SQLite import, upsert, delete or migration-state mutation occurs.
- Automatic fallback: SQLite migration/hydration failure selects legacy for the current process only. It does not mutate the environment or delete SQLite data.
- Invalid backend values fail closed to `sqlite` with a warning, rather than silently selecting rollback.

Returning from explicit legacy mode does not auto-promote newer legacy changes over existing SQLite rows. Operators keep rollback mode until data reconciliation is explicitly chosen; this prevents split-brain precedence rules.

## Startup preflight

`TouchApp` currently needs app settings before module initialization. Add an async preflight before `genTouchApp()`:

1. open the existing main DB path with a short-lived client;
2. query non-deleted `app-setting.ini` from `app_config_entries`;
3. close the client in `finally`;
4. fallback to the legacy file only for explicit legacy mode, absent database/table/row, or query failure;
5. pass the snapshot into `genTouchApp()` / `TouchApp` instead of letting `TouchApp` read disk.

On first upgraded launch the table does not exist until DatabaseModule migration, so legacy fallback supplies bootstrap settings; Storage then imports them transactionally. Subsequent launches use SQLite before window creation.

## Compatibility contracts

- No StorageEvents or renderer SDK payload changes.
- Cache version starts from persisted `revision`, not hard-coded `1`.
- AppSetting normalization remains in `StorageModule`; normalized values become dirty and are persisted to SQLite.
- Existing `StoragePollingService` retry/quarantine and LRU behavior remains.
- `persistMainConfig()` awaits primary commit; in SQLite mode mirror completion is best-effort but observed/logged.
- No values, auth data, or full user paths are emitted in migration logs.

## Risk controls

- Dedicated tables avoid cross-domain ownership of existing `config` / `system_config`.
- A repository-level serial queue prevents overlapping persist/delete order inversion.
- Tombstones prevent fallback/import resurrection.
- Import insert-if-absent makes reruns idempotent and preserves SQLite authority.
- Immutable backup plus dual-write mirror makes old binaries bootable during the compatibility window.
- Focused real-SQLite tests cover transactions, crash retry shape, revisions and tombstones; Storage tests cover public behavior.
