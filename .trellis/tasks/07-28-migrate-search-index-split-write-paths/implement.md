# Implementation plan: search-index split write paths

## 1. Establish exact write inventory

1. Search the named 2d/2e sites and all `dbUtils.addEmbedding` callers before modifying them.
2. Classify each write by table, dependent id/extension behavior, current connection, and worker API suitability.
3. Keep a checklist mapping every named site to its replacement and focused test/evidence.

## 2. Wire context and migrate writes

1. Add provider-local split context to `createDbUtils` in `app-provider.ts` and both `file-provider.ts` sites.
2. Convert app-provider transaction sites via exact `execWrite` forwarding, preserving returned ids and extension writes.
3. Convert file-provider scheduled writes to the typed worker persistence API only where its write contract is exact.
4. Route embeddings and remaining direct helper callers to the worker.
5. Ensure an empty split database triggers the required first-launch rescan/reindex.
6. Add focused startup-order evidence that a split-enabled provider write waits or fails closed before `searchIndexWriter` readiness and never reaches the primary database as a fallback.

## 3. Focused verification before runtime evidence

1. Run focused provider/worker/persistence tests for each changed contract.
2. Confirm the flag-off paths preserve their prior SQL and behavior.
3. Verify each split-on path awaits worker completion before dependent reads.
4. Exercise the provider-before-writer-ready startup path and prove it cannot write `database.db`; include the result with the writer admission evidence.
5. Do not infer runtime correctness from typecheck alone.

## 4. Flag-on application acceptance

1. Start a disposable-profile CoreApp with `TUFF_DB_SEARCH_SPLIT_ENABLED=true pnpm core:dev`.
2. Confirm `search-index.db` creation/population and first-launch full reindex.
3. Compare application and file counts and query results against flag-off; any mismatch is a silent-data-loss blocker.
4. Inspect worker/primary WAL behavior and logs for SQLite busy storms or event-loop stalls.
5. Disable the flag and verify CoreApp resumes the primary-database path.

## Rollback

Keep the flag default-off. Revert the migration commit if any named writer or application acceptance check fails; do not enable the flag or delete primary moved tables as a workaround.
