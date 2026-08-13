# Migrate search-index split write paths

> **对账更正(2026-08-13,#1745)。** 本文原以「默认关闭、开启是未来动作」为前提写成;`cd39bdbf6`
> (2026-08-05)把默认翻转为**开启**并随 2d.3 写路径迁移一并落地,该前提自此失效,但下文一直未改——
> 成为 #1107 记的那句话的第九处复读源头。以下按当前运行事实改写:分库是默认拓扑,`=0` 是回滚。
> 真正的发布门(隔离 CoreApp 实跑证据)原样保留,它从来不依赖默认值的方向。

## Goal

Verify every search-index write path against the worker-owned `search-index.db` under the **default-on** split topology, and map each release assertion to direct application evidence.

## Confirmed facts

- `DB_SEARCH_SPLIT_ENABLED` (`TUFF_DB_SEARCH_SPLIT_ENABLED`) is implemented in `apps/core-app/src/main/db/runtime-flags.ts:26` and defaults **on** since `cd39bdbf6` (2026-08-05). `=0` is the emergency rollback to the shared-file topology, not the safe default.
- The worker owns `search-index.db`; the `=0` path falls back to the primary database.
- The silent-data-loss failure mode this task was written against — providers writing `database.db` while readers use `search-index.db` — belonged to the **half-migrated** state. The 2d.3 write-path migration landed with the flip; what remains is proving it, not fearing it.
- `FilePersistencePort.upsertFiles()` is not a universal replacement: it omits `displayName`, uses a fixed conflict set, and does not write `file_extensions`.

## Requirements

### R1 — Preserve the sole-writer boundary

- Under the default split, no main-thread path may mutate the moved search-index tables.
- Keep the `=0` shared-file path byte-identical; it is the rollback route and must stay reachable.
- Await worker acknowledgement before dependent reads.
- With the split enabled, provider writes must not begin before `searchIndexWriter` is admitted and ready; pre-ready startup must wait or fail closed and must never fall back to the main-thread `db`.

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

- [ ] Every 2d/2e writer listed in `design.md` executes on the worker connection under the default split, while the `=0` shared-file path is unchanged.
- [ ] Focused startup-ordering evidence proves provider writes cannot reach the split path before `searchIndexWriter` readiness and cannot silently fall back to `database.db`.
- [ ] Provider-specific `displayName`, conflict semantics, and extensions remain intact; no migration substitutes incomplete `upsertFiles` behavior.
- [ ] The embedding, first-launch reindex, and orphan-cleanup decisions are implemented and covered by focused evidence.
- [ ] An isolated-profile CoreApp run proves populated `search-index.db`, complete app/file results, matching counts, healthy indexing, and the `=0` rollback path — each assertion mapped to that run, never inferred from typecheck.
- [ ] The writer-inventory and startup-ordering work stays release-blocking until the preceding criteria have direct app-run evidence; the default stays on, and any regression rolls back via `=0` rather than by re-inverting the default.

## Constraints

- Never claim flag-on acceptance from typecheck alone.
- No production profile/database mutation; use a disposable application profile for runtime evidence.
- The failure mode of an incomplete migration is silent data loss. Treat any unverified writer as a release blocker.
