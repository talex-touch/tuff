# 实施计划：应用图标自愈与数据库句柄加固

## 1. Planning gate

- Confirm the captured real-profile evidence and the `@libsql/client` 200-transaction reproduction.
- Validate PRD/design convergence and start the Trellis task.

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

## 5. Icon hydration self-healing

- Start hydration from scanner output independently of backfill completion.
- Resolve/extract outside DB transactions, batch icon persistence, and publish runtime upserts.
- Add bounded DB-busy retry ownership and shutdown draining.
- Keep Darwin 27 native lookup fail-closed.

## 6. Initial scan retry

- Add bounded, single-flight retry around SearchCore's initial AppProvider indexed-source scan.
- Abort cleanly during shutdown and keep failure telemetry truthful.

## 7. Functional smoke before cleanup

- Run the libSQL handle reproduction.
- Run a controlled stale-icon profile through scanner -> cache -> CoreBox mapping.
- Launch a packaged app with an isolated profile and confirm startup health, bounded handles, and real cache-backed app icons.
- Run against the captured real profile only after controlled smoke passes; do not delete or rewrite the database manually.

## 8. Rollback points

- AppProvider batching can be reverted independently; no dependency patch, schema migration, or cache format rollback is involved.
- Shared cache resolver is deterministic and schema-free.
- AppProvider batching and hydration changes stay behind existing provider/runtime boundaries; no renderer transport cutover is required.
