# Migrate search-index split write paths

## Goal

Move every remaining search-index write path to the worker-owned `search-index.db` and prove real flag-on application behavior before the database split may be enabled.

## Confirmed facts

- `DB_SEARCH_SPLIT_ENABLED` (`TUFF_DB_SEARCH_SPLIT_ENABLED`) is implemented in `apps/core-app/src/main/db/runtime-flags.ts` and defaults **off**.
- The worker already owns `search-index.db`; the flag-off path currently falls back to the primary database.
- Enabling the flag before every remaining writer migrates writes provider data to `database.db` while reads use `search-index.db`: this is **silent data loss**.
- `FilePersistencePort.upsertFiles()` is not a universal replacement: it omits `displayName`, uses a fixed conflict set, and does not write `file_extensions`.

## Requirements

### R1 — Preserve the sole-writer boundary

- With the split enabled, no main-thread path may mutate the moved search-index tables.
- Keep the flag-off path byte-identical; never enable the flag as part of this task.
- Await worker acknowledgement before dependent reads.

### R2 — Migrate every remaining writer

- Wire split context into the provider `dbUtils` callers in `app-provider.ts` and `file-provider.ts`.
- Migrate every named `runAppTransaction` and `withDbWrite` site, plus provider services that mutate through `dbUtils`.
- Migrate embedding writes, first-launch reindex behavior, and any remaining `dbUtils.addEmbedding` callers.
- Do not use `upsertFiles` where its fixed behavior would discard `displayName` or extensions; forward exact SQL through the worker when necessary.

### R3 — Prove the split in an application run

- Run the CoreApp with `TUFF_DB_SEARCH_SPLIT_ENABLED=true` only after all writes are migrated.
- Prove first-launch full reindex, correct app/file search results, matching pre/post counts, populated `search-index.db`, and the absence of worker-originating primary WAL growth.
- Verify no SQLite busy storm or indexing event-loop stall; toggle the flag off and confirm the rollback path.

## Acceptance Criteria

- [ ] Every 2d/2e writer listed in `design.md` executes on the worker connection when split is enabled, while the default-off path is unchanged.
- [ ] Provider-specific `displayName`, conflict semantics, and extensions remain intact; no migration substitutes incomplete `upsertFiles` behavior.
- [ ] The embedding, first-launch reindex, and orphan-cleanup decisions are implemented and covered by focused evidence.
- [ ] A flag-on CoreApp run proves populated `search-index.db`, complete app/file results, matching counts, healthy indexing, and flag-off rollback.
- [ ] The flag remains default-off until all preceding criteria have direct app-run evidence.

## Constraints

- Never claim flag-on acceptance from typecheck alone.
- No production profile/database mutation; use a disposable application profile for runtime evidence.
- The failure mode of an incomplete migration is silent data loss. Treat any unverified writer as a release blocker.
