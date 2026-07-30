# Retention Surface Research - RED/GREEN 2

## Scope and required invariant

This note maps the concrete retention surfaces needed by RED/GREEN 2. It covers Clipboard, OCR/screenshot temporary data, search detail/cache, Intelligence audit/Context, and diagnostics/telemetry. It does not design renderer transport, export, plugin uninstall, or Settings UI.

The lifecycle layer must call thin domain adapters. It must never become a generic SQL, table-name, database-file, filesystem-path, or TempFileService namespace owner. All public summaries and cleanup results are aggregate only: category, eligible/deleted/skipped/failed counts, bounded byte counts where already known, stable codes, and report IDs. They must not include clipboard content, OCR text/image bytes, query/prompt/response text, SQL/parameters, paths, endpoints, native errors, or arbitrary metadata.

## Cross-cutting storage and execution contracts

### Database topology

- The primary database is `database.db`. The auxiliary database is `database-aux.db`; `getAuxDb()` deliberately falls back to primary until auxiliary startup is ready (`apps/core-app/src/main/modules/database/index.ts:122`, `apps/core-app/src/main/modules/database/index.ts:1051`, `apps/core-app/src/main/modules/database/index.ts:1064`).
- Clipboard, OCR, analytics snapshots, plugin analytics, report outbox, telemetry upload stats, and recommendation cache are auxiliary hot tables (`apps/core-app/src/main/modules/database/index.ts:60`). Any owner test that only exercises a primary in-memory database misses production routing and fallback behavior.
- Query completions, search usage/detail/aggregates, static/contextual embeddings, pinned items, Intelligence audit/usage, Context, Memory, quota, and configuration remain primary-owned. Search index source rows can live in `search-index.db`; that file is rebuildable and intentionally receives the common schema while non-search tables remain empty (`apps/core-app/src/main/modules/database/index.ts:932`, `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1860`). Retention must not iterate all schema-compatible database files.
- Production migrations enable foreign keys and must be used in RED integration fixtures. Context and OCR aggregate deletion relies on `ON DELETE CASCADE`; a hand-created table fixture would not prove that contract.

### Cutoff and timestamp semantics

Use one injected `nowMs` per operation and calculate `cutoffMs = nowMs - retentionMs` once. The target boundary is strictly:

```text
stored timestamp < cutoff => eligible
stored timestamp = cutoff => retained
stored timestamp > cutoff => retained
```

`null` retention skips automatic cleanup. Do not recompute `Date.now()` between pages. Drizzle `mode: 'timestamp'` columns are represented as `Date` but stored as epoch seconds; raw-number columns in OCR/Context/audit/analytics use the units documented below. Convert at the owner boundary, not in the coordinator.

There are two existing boundary mismatches that RED must expose rather than preserve: TempFileService currently deletes `mtimeMs <= cutoffMs` (`apps/core-app/src/main/service/temp-file.service.ts:250`), and `IntelligenceAuditLogger.cleanupOldLogs()` uses `timestamp <= cutoff` (`apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts:576`). Existing Clipboard, query completion, usage-log, analytics, report-queue, and message pruning already use a strict older-than boundary (`apps/core-app/src/main/modules/clipboard/clipboard-history-persistence.ts:449`, `apps/core-app/src/main/modules/box-tool/search-engine/query-completion-service.ts:224`, `apps/core-app/src/main/modules/analytics/storage/db-store.ts:296`, `apps/core-app/src/main/modules/analytics/report-queue-store.ts:134`).

### Pagination, cancellation, retry, and failure ownership

- Use keyset pages, not `OFFSET`, because successful pages delete rows. Select `ORDER BY <stable key> LIMIT <bounded batch size>` and advance the cursor only after that page commits. A practical initial bound is 100 aggregate roots per page; make the constant test-visible, not caller-selectable.
- Check `AbortSignal` before selection, before entering the DB scheduler, and between pages/files. A scheduled page is an atomic unit: cancellation does not roll back a committed page, and no later page starts.
- Every mutating DB page goes through `dbWriteScheduler.schedule(label, ..., { priority: 'background', dropPolicy: 'none' })` and wraps the transaction in `withSqliteRetry`. Scheduler priorities and non-dropping policy are already supported (`apps/core-app/src/main/db/db-write-scheduler.ts:10`, `apps/core-app/src/main/db/db-write-scheduler.ts:353`); SQLite retry recognizes the full busy-error cause chain (`apps/core-app/src/main/db/sqlite-retry.ts:58`). A retention result must not claim success when a page exhausts retry.
- A failed page leaves its cursor unchanged and remains eligible on retry. Earlier committed pages remain deleted and count as partial progress. Idempotent reruns return zero for already-completed pages and continue residual work.
- File cleanup must use fixed owner namespaces and bounded traversal. Failure of one file is aggregate evidence, not a reason to emit the path. Filesystem deletion and DB deletion cannot be one transaction; the owning adapter must make residual files discoverable by its reconciliation path.
- Register one daily coordinator after storage initialization. Saving a shorter policy enqueues one immediate run through the same per-owner admission gate; lengthening a policy does not run cleanup. Use one coordinator-owned `AbortController` for shutdown/manual cancellation.
- PollingService callbacks receive no `AbortSignal` (`packages/utils/common/utils/polling.ts:36`, `packages/utils/common/utils/polling.ts:279`). Its timeout races the callback but does not cancel it and releases lane/in-flight accounting while late work may continue (`packages/utils/common/utils/polling.ts:600`, `packages/utils/common/utils/polling.ts:648`). Therefore the coordinator callback must return/await its promise and own cancellation. Do not use the existing detached callback pattern in TempFileService or Clipboard orphan cleanup (`apps/core-app/src/main/service/temp-file.service.ts:101`, `apps/core-app/src/main/modules/clipboard/clipboard-image-persistence.ts:155`).

## 1. Clipboard history and associated images

### Real owners, storage, and sensitive fields

| Surface | Production owner/location | Time/key semantics | Sensitive payload |
| --- | --- | --- | --- |
| `clipboard_history` | `ClipboardModule` -> `ClipboardHistoryPersistence`, auxiliary DB with primary fallback (`apps/core-app/src/main/modules/clipboard.ts:1378`) | `id` keyset; `timestamp` is Drizzle timestamp/epoch seconds (`apps/core-app/src/main/db/schema.ts:359`) | text, HTML/raw content, image path or data URL, thumbnail, file-list JSON, source app, metadata |
| `clipboard_history_meta` | `ClipboardMetaPersistence`; FK cascade from Clipboard root (`apps/core-app/src/main/db/schema.ts:381`) | child `created_at`; deletion authority is the parent row | OCR text/excerpt/keywords/status and other extension metadata |
| memory cache/freshness | `ClipboardHistoryPersistence` / `ClipboardModule` | cache is capped at 20 and has one-hour freshness semantics (`apps/core-app/src/main/modules/clipboard/clipboard-history-persistence.ts:29`) | hydrated Clipboard items and metadata |
| `temp/clipboard/images` | `ClipboardImagePersistence` through TempFileService | referenced images have no time retention; orphan minimum age is owner-specific | original PNG files |
| `temp/clipboard/live-images` | `ClipboardImagePersistence` through TempFileService | already registered for 24 hours (`apps/core-app/src/main/modules/clipboard/clipboard-image-persistence.ts:147`) | transient clipboard image reads |

`isFavorite` is the only current durable protection field (`apps/core-app/src/main/db/schema.ts:369`). There is no separate pinned/important column or trusted retention metadata contract. The existing renderer-facing metadata JSON is arbitrary and cannot grant deletion immunity. Treat favorite and pinned as the existing `isFavorite = true` authority. If "important" must remain independently expressible, add one host-only boolean column (for example `retention_protected`) and a typed host mutation; do not infer it from arbitrary `metadata`/plugin tags. The selection index should support `(is_favorite, retention_protected, timestamp, id)` or the equivalent journaled query plan.

### Existing cleanup and gaps

`cleanupHistory()` currently selects every matching row, starts image deletion through a synchronous `void` callback, then performs one unbounded direct delete (`apps/core-app/src/main/modules/clipboard/clipboard-history-persistence.ts:437`, `apps/core-app/src/main/modules/clipboard.ts:194`). It does not exclude favorites, use scheduler/retry, accept a signal, paginate, report file failures, or await associated image deletion. Its memory-cache cutoff is separately recomputed. Manual item deletion has the same detached image behavior (`apps/core-app/src/main/modules/clipboard/clipboard-history-persistence.ts:686`).

Clipboard image orphan reconciliation is useful retry infrastructure, but it loads all referenced image rows and recursively collects all files before deleting (`apps/core-app/src/main/modules/clipboard/clipboard-image-persistence.ts:178`). The scheduled callback detaches that promise, so PollingService backpressure/timeout does not cover the real work. The `clipboard/images` namespace intentionally has `retentionMs: null`, because referenced history images must follow Clipboard record ownership rather than a blind file age (`apps/core-app/src/main/modules/clipboard/clipboard-image-persistence.ts:147`).

### Minimal adapter

Add a narrow `ClipboardRetentionAdapter` over new internal methods on `ClipboardHistoryPersistence` and `ClipboardImagePersistence`:

1. Select a keyset page where `timestamp < cutoff`, `COALESCE(is_favorite, 0) = 0`, and the host-only important flag is false. Return only IDs, type, and owner-validated image paths internally.
2. Delete selected roots in one scheduled/retried transaction; `clipboard_history_meta` and linked OCR rows cascade.
3. Evict exactly the committed IDs from memory/freshness and notify once per page, not once per row.
4. Await deletion of owner-contained image paths. Then await a bounded orphan-reconciliation page so a failed image unlink remains retryable after its DB row is gone. Never delete a file outside TempFileService base or outside the fixed Clipboard image namespace.
5. Return aggregate page evidence. Keep existing explicit "clear all" behavior separate from automatic retention protection semantics.

### Clipboard RED tests

Create a temporary migrated libSQL fixture with `PRAGMA foreign_keys = ON`, auxiliary routing, a real TempFileService rooted under `mkdtemp`, and deterministic `nowMs`.

- Seed rows at `cutoff - 1`, `cutoff`, and `cutoff + 1`; only the first is removed at the 90-day default.
- Seed favorite, pinned-as-favorite, and host-important old rows; prove all survive. Prove untrusted metadata containing `important`, `pinned`, or similar text cannot create authority.
- Seed more than two batch sizes and assert keyset page sizes/order, complete eventual deletion, no skipped shifted rows, and bounded scheduler calls.
- Abort after page one commits; assert page one stays deleted, later pages and their files survive, and rerun completes them.
- Seed an image row plus metadata/OCR children and a real file under `clipboard/images`; assert cascades, awaited unlink, cache/freshness eviction, and no external-path deletion.
- Inject first unlink failure, first `SQLITE_BUSY`, and exhausted retry separately. Prove retry recovery, residual orphan recovery, stable aggregate failure, and idempotent rerun.
- Assert serialized summaries/log metadata do not contain synthetic clipboard/image/OCR canaries or paths.

## 2. OCR and screenshot temporary data

### OCR database owner and schema

OCR uses the auxiliary DB (`apps/core-app/src/main/modules/ocr/ocr-service.ts:374`). `ocr_jobs` owns queue state, retry/error detail, payload hash, and JSON `meta`; `ocr_results` owns recognized text and JSON extras and cascades from the job (`apps/core-app/src/main/db/schema.ts:396`, `apps/core-app/src/main/db/schema.ts:422`). `queued_at`, `started_at`, `finished_at`, and result `created_at` are Drizzle timestamp/epoch-second fields.

The job `meta` may persist the complete image data URL or a source path (`apps/core-app/src/main/modules/ocr/ocr-service.ts:750`, `apps/core-app/src/main/modules/ocr/ocr-service.ts:690`). Results persist OCR text, summary/snippet, embedding, model, and usage detail (`apps/core-app/src/main/modules/ocr/ocr-service.ts:1200`). Clipboard OCR projections also persist text/excerpts in `clipboard_history_meta` (`apps/core-app/src/main/modules/ocr/ocr-service.ts:1240`). Lifecycle summaries must count jobs/results only and never hydrate these payload columns.

There is no dedicated OCR temporary-file namespace today. OCR reads either a Clipboard-owned temp image or a user-owned file and must not delete that source merely because an OCR job expires (`apps/core-app/src/main/modules/ocr/ocr-service.ts:769`, `apps/core-app/src/main/modules/ocr/ocr-service.ts:790`). If OCR later materializes bytes, register a fixed `ocr/intermediate` namespace and retain only handles created by that owner. Eager deletion applies only to those owned intermediates.

### Screenshot owner and namespaces

`NativeScreenshotService` owns `native/screenshots`; it currently registers 30-minute retention, not the required 24-hour default (`apps/core-app/src/main/modules/native-capabilities/screenshot-service.ts:20`, `apps/core-app/src/main/modules/native-capabilities/screenshot-service.ts:314`). `output: 'data-url'` stays in memory; `output: 'tfile'` creates a TempFileService PNG and returns its path/tfile URL (`apps/core-app/src/main/modules/native-capabilities/screenshot-service.ts:367`).

Two eager-cleanup leaks are confirmed:

- The system screenshot action requests a tfile, copies the image to Clipboard, ignores the returned handle, and never releases it (`apps/core-app/src/main/modules/box-tool/addon/system/system-actions-provider.ts:474`). It should use an in-memory output or release the owned file in `finally`.
- Assistant "save screenshot" copies the tfile to the selected destination but does not release the temporary source on success, cancellation, or failure (`apps/core-app/src/main/modules/assistant/module.ts:1515`, `apps/core-app/src/main/modules/assistant/module.ts:1565`).

A tfile intentionally returned to an active consumer cannot be eagerly deleted before consumption; that call needs an owner-issued release handle or an explicit main-owned release path, with 24-hour scheduled cleanup as fallback. Do not expose an arbitrary path deletion method to renderer code.

### TempFileService gaps and minimal adapter

TempFileService already provides a base-dir containment check, registered namespace retention, file creation/deletion, and recursive cleanup (`apps/core-app/src/main/service/temp-file.service.ts:81`, `apps/core-app/src/main/service/temp-file.service.ts:126`, `apps/core-app/src/main/service/temp-file.service.ts:189`). It currently:

- allows `createFile()` for any namespace string without checking registration;
- runs every registered namespace in one unbounded traversal;
- exposes no `AbortSignal`, page/yield contract, per-namespace cleanup entry point, or aggregate result;
- swallows stat/unlink errors and uses `<= cutoff`;
- detaches scheduled cleanup, so PollingService considers it complete immediately.

Add an internal bounded `cleanupRegisteredNamespace(namespaceId, cutoffMs, signal)` primitive, but keep namespace IDs private to fixed domain wrappers. `OcrScreenshotTempRetentionAdapter` should call only OCR-owned intermediate and `native/screenshots`; Clipboard namespaces remain with Clipboard. Register both at the normalized 24-hour policy, await eager releases in operation `finally` blocks, and run scheduled fallback through the one lifecycle coordinator rather than another detached timer. A failed eager release remains visible to namespace cleanup.

For OCR DB retention, add an `OcrService` owner method that pages terminal jobs only (`completed`, `failed`, `cancelled`) by `COALESCE(finished_at, queued_at) < cutoff`. Preserve `pending` and `processing` jobs even if old. Delete job roots in scheduled/retried transactions so results cascade. Clipboard metadata is Clipboard-root-owned and disappears with Clipboard; do not delete live Clipboard metadata merely because a standalone OCR job ages out unless product policy explicitly defines that cross-owner behavior.

### OCR/screenshot/TempFileService RED tests

- Use all real migrations in a temporary libSQL DB and real files under a `mkdtemp` TempFileService root. Do not mock `fs`, `TempFileService`, or the retention adapter.
- Prove 24-hour strict boundaries for terminal OCR jobs/results and screenshot/intermediate files. `cutoff` survives; `cutoff - 1` is deleted.
- Prove pending/processing OCR jobs and user-owned/external source paths survive; terminal job children cascade.
- Prove namespace isolation: screenshot cleanup cannot remove Clipboard files, OCR cleanup cannot remove screenshot files, unregistered/unknown namespace selection is rejected, and traversal cannot escape the base directory.
- Prove screenshot system-action and save flows release temporary files in success/cancel/error paths; a consumer-held tfile survives until release and falls back to scheduled expiry.
- Abort between file/DB pages and assert no later work starts. Inject unlink and SQLite busy failures; prove stable partial evidence and successful idempotent retry.
- Assert summaries and every captured logger/transport projection omit OCR text, data URL, image bytes, source paths, result extras, and native errors.

## 3. Search detail, contextual behavior, and caches

### In-scope surfaces

Search initializes one `DbUtils` with primary, auxiliary, and search-index routing; query completion and usage use primary, recommendation cache uses auxiliary, and producer index reads use the dedicated search DB when enabled (`apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1853`).

| Surface | Timestamp/cutoff | Retention action |
| --- | --- | --- |
| `query_completions` | `last_completed` Drizzle timestamp | Delete mappings older than 30 days. Prefix is raw normalized query detail (`apps/core-app/src/main/db/schema.ts:264`). |
| `usage_logs` | `timestamp` Drizzle timestamp | Delete raw keyword/context rows older than 30 days (`apps/core-app/src/main/db/schema.ts:188`). |
| `contextual_embeddings` | `timestamp` Drizzle timestamp | Delete old behavior-context text/vector rows. No active production writer/owner was found beyond the schema (`apps/core-app/src/main/db/schema.ts:167`). |
| `usage_summary` | `last_used` Drizzle timestamp | Delete stale per-item aggregate behavior (`apps/core-app/src/main/db/schema.ts:225`). |
| `item_usage_stats` | latest non-null action timestamp, falling back to `updated_at` | Delete stale per-source/item aggregate behavior; preserve the separate pin row (`apps/core-app/src/main/db/schema.ts:235`). |
| `item_time_stats` | `last_updated` Drizzle timestamp | Delete stale time-distribution behavior (`apps/core-app/src/main/db/schema.ts:526`). |
| `usage_trend_daily` | integer epoch-day bucket | Delete buckets whose day ends strictly before the cutoff; document/test day-boundary conversion (`apps/core-app/src/main/db/schema.ts:204`). |
| `recommendation_cache` | `created_at`/`expires_at` Drizzle timestamps | Delete expired rows and rows created before policy cutoff; cache payload is item IDs (`apps/core-app/src/main/db/schema.ts:548`). |
| in-memory search result cache | entry `Date.now()` timestamp | Clear after committed retention work; cached result snapshots can contain result detail (`apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:180`). |
| usage and recommendation caches | 15-minute usage cache, 10-second pin cache, recommendation cache | Clear usage/recommendation detail caches, but rebuild/preserve the pin cache from `pinned_items` (`apps/core-app/src/main/modules/box-tool/search-engine/usage-stats-cache.ts:18`, `apps/core-app/src/main/modules/box-tool/search-engine/search-usage-service.ts:15`, `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts:532`). |

### Explicitly protected search data

Do not touch File/App producer rows, FTS/index documents, scan/task state, static `embeddings` tied to current source records, provider/config settings, or `pinned_items`. Static content embeddings and contextual behavior embeddings are different tables (`apps/core-app/src/main/db/schema.ts:151`, `apps/core-app/src/main/db/schema.ts:167`). Pins have their own durable table and must remain even when associated usage aggregates expire (`apps/core-app/src/main/db/schema.ts:568`). Do not run retention against `search-index.db` merely because common migrations created empty copies there.

### Existing cleanup and gaps

- Query completion cleanup defaults to 90 days, deletes all rows in one scheduled/retried statement, returns zero regardless of affected rows, swallows failure, and has no signal/page contract (`apps/core-app/src/main/modules/box-tool/search-engine/query-completion-service.ts:210`).
- Usage summary defaults to 30 days but performs an unbounded direct delete outside scheduler/retry and reports zero (`apps/core-app/src/main/modules/box-tool/search-engine/usage-summary-service.ts:120`). Its separate daily PollingService task would duplicate the lifecycle coordinator (`apps/core-app/src/main/modules/box-tool/search-engine/usage-summary-service.ts:50`).
- Search maintenance starts cleanup calls without awaiting them, so its task can finish before cleanup (`apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1809`).
- Recommendation DB cache has expiry support in DbUtils, but no complete lifecycle invocation/in-memory invalidation contract was found. `contextual_embeddings` has no real service owner, so the new search adapter must adopt only this schema-specific detail table rather than creating a generic table cleaner.
- Search/usage/recommendation caches have usable invalidation primitives, but there is no single internal retention invalidation method. Search currently clears all three on pin mutation, which is the closest established ordering (`apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:2042`).

### Minimal adapter

Add `SearchDetailRetentionAdapter` behind `SearchEngineCore`, snapshotting direct internal methods at construction. It owns the fixed table set above and routes each page to its real primary/auxiliary DB. Use one transaction per database/page, stable IDs or composite keys, scheduled/retried writes, and signal checks between pages. Flush pending usage queues before selecting so an older buffered event cannot be inserted after cleanup; current fresh events may remain. After all committed pages, clear search-result, usage-stats, and recommendation caches, then invalidate/reload pin cache without deleting pins.

Do not reuse `cleanupFileIndex()` or any storage-maintenance generic table list: it deletes producer/index tables and is outside search-detail authority.

### Search RED tests

- Build migrated temporary primary, auxiliary, and search-index libSQL files. Seed a distinct synthetic canary in every in-scope table and protected table.
- Prove strict 30-day boundaries for completion, usage, contextual detail, aggregate behavior, day buckets, and recommendation cache.
- Seed more than two pages per key shape; assert no skip/duplicate, cancellation after one page, exact affected counts, and idempotent continuation.
- Inject SQLite busy then success and retry exhaustion. Assert all statements run through scheduler/retry and failure cannot return success/zero-as-success.
- Prove File/App rows, FTS/search-index documents, scan/index task state, current static embeddings, configuration/provider settings, and `pinned_items` remain byte-for-byte unchanged in primary/search databases.
- Prove stale aggregate data for a pinned item may be removed while its pin survives and is still injected after cache reload.
- Prime search-result, usage-stats, and recommendation caches with canaries; prove committed cleanup invalidates them and cancellation/failure does not expose their contents in results/logs.

## 4. Intelligence audit and Context aggregates

### Audit owner and data contract

`IntelligenceAuditLogger` owns primary-DB `intelligence_audit_logs` and derived `intelligence_usage_stats`; it already routes normal writes through scheduler/retry (`apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts:153`, `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts:175`). Audit rows contain timestamp in raw epoch milliseconds, identifiers, prompt hash, caller/user, token/cost/latency/success, error, and JSON metadata (`apps/core-app/src/main/db/schema.ts:600`). The logger also keeps up to 1,000 rows in memory plus a pending persistence queue (`apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts:153`).

The current cleanup uses one unbounded direct delete and `<= cutoff`; it neither uses scheduler/retry nor clears memory/pending state (`apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts:573`). More importantly, the audit producer currently writes the full `promptTemplate` and `promptVariables` into metadata and raw failure messages into `error` (`apps/core-app/src/main/modules/ai/intelligence-sdk.ts:2028`, `apps/core-app/src/main/modules/ai/intelligence-sdk.ts:2098`). This violates the metadata-only target before retention even runs. RED must require a prompt hash plus bounded identifiers/counters/stable error code only; prompt/variables, provider response, and native error text must never enter DB or memory audit rows.

Audit retention should remove audit event rows at 30 days. Preserve `intelligence_usage_stats` as aggregate usage unless explicit category deletion semantics later include it; preserve quota rows regardless. Flush/sanitize pending rows before retention, page DB roots by `(timestamp, id)`, and prune memory rows by the same strict cutoff. A manual full category clear must define pending admission/serialization in RED 3; RED 2 only needs retention-safe ordering.

### Context owner, aggregate boundary, and blocker

`ContextHygieneService` is the real primary-DB owner and uses the raw libSQL client with scheduled/retried writes (`apps/core-app/src/main/modules/ai/intelligence-context-hygiene.ts:694`). Context session `updated_at` is a raw epoch-millisecond number. The root statuses are `active`, `archived`, and `expired`; turns, checkpoints, compression snapshots, and package logs all cascade from the session root (`apps/core-app/src/main/db/schema.ts:870`, `apps/core-app/src/main/db/schema.ts:892`, `apps/core-app/src/main/db/schema.ts:915`, `apps/core-app/src/main/db/schema.ts:950`, `apps/core-app/src/main/db/schema.ts:1021`). Deleting one eligible session in a transaction is therefore the correct aggregate boundary.

Two production gaps block honest "inactive, non-pinned Context" behavior:

- Session creation sets `active`, and Context selection recognizes archived/expired sessions, but no production archive/expire transition was found (`apps/core-app/src/main/modules/ai/intelligence-context-hygiene.ts:833`, `apps/core-app/src/main/modules/ai/intelligence-context-hygiene.ts:850`, `apps/core-app/src/main/modules/ai/intelligence-context-hygiene.ts:955`). Without an owner transition, automatic cleanup has no naturally eligible rows.
- The schema has no pinned field, trusted pin table, or typed pin API. Renderer DivisionBox pin state is unrelated local UI storage and cannot authorize deletion protection.

Before GREEN 2, add an owner-controlled `is_pinned` boolean (or an equally authoritative dedicated relation), indexed with `(status, is_pinned, updated_at, id)`, plus explicit archive/expire/pin methods on `ContextHygieneService`. Do not parse arbitrary Context metadata for `pinned`. The retention adapter selects only `status IN ('archived', 'expired')`, `is_pinned = 0`, and `updated_at < cutoff`; active sessions survive regardless of age.

### Explicitly protected Intelligence data

Do not touch active or pinned Context sessions; explicit `intelligence_memory_items` and tombstones; Intelligence quota and aggregate usage; provider/configuration records; prompts/templates; workflow/capability registry; local knowledge documents/chunks/embeddings; or model cache. Memory has its own TTL and delete/tombstone lifecycle (`apps/core-app/src/main/db/schema.ts:976`) and must not be reached by a session cascade because its source IDs are intentionally not foreign keys.

### Minimal adapter

Add `IntelligenceRetentionAdapter` over direct methods on `IntelligenceAuditLogger` and `ContextHygieneService`:

- Audit method: sanitize/flush pending rows, keyset-select old IDs, scheduled/retried page delete, prune the bounded memory cache, return counts only.
- Context method: keyset-select eligible roots, delete each bounded root page in one scheduled/retried transaction, rely on FK cascades, and return root/child counts captured without payload columns. The lifecycle adapter must not issue child-table deletes.
- Use `background`, not Context's current interactive priority, for retention work. Keep owner operation labels fixed.

### Intelligence RED tests

- Use a fully migrated temporary libSQL DB with foreign keys enabled. Seed audit rows at all three cutoff boundaries and more than two pages.
- Seed active-old, archived-old, expired-old, archived-at-cutoff, archived-new, and pinned-old sessions with turns/checkpoints/compression/package-log children. Assert only inactive, non-pinned roots strictly older than cutoff cascade.
- Seed Memory items/tombstones, quota, usage aggregates, provider/config, prompts/templates, workflow definitions, and knowledge rows referencing canary IDs; assert unchanged.
- Abort after a Context page commits and retry. Inject busy/retry exhaustion into audit and Context pages; assert no partial aggregate inside a transaction and no false success.
- Prime audit pending/memory state and prove an old pending row cannot be reinserted after cleanup.
- Invoke success/failure audit production paths with synthetic prompt, variable, response, SQL/path, Secret, and native-error canaries. Assert none enter audit DB/memory, cleanup summaries, logger metadata, or public projections; only hash, counters, bounded IDs, and stable error codes remain.

## 5. Diagnostics, telemetry, and logs

### Durable and in-memory surfaces

| Surface | Real owner/storage | Current lifecycle and gap |
| --- | --- | --- |
| `analytics_snapshots` | `DbStore`, auxiliary with primary fallback; `timestamp` raw epoch ms and JSON metrics (`apps/core-app/src/main/modules/analytics/storage/db-store.ts:50`, `apps/core-app/src/main/db/schema.ts:1049`) | Scheduled/retried cleanup exists and uses strict `<`, but current per-window retention ranges from 5 minutes to 7 days, not the policy-level 30-day cap (`apps/core-app/src/main/modules/analytics/storage/memory-store.ts:7`). |
| `plugin_analytics` | `DbStore`, auxiliary; raw epoch-ms timestamp and arbitrary JSON metadata (`apps/core-app/src/main/modules/analytics/storage/db-store.ts:334`) | Writes use scheduler/retry; no complete age cleanup owner was found. Metadata can contain content unless ingress is narrowed. |
| `analytics_report_queue` | `ReportQueueStore`, auxiliary plus primary compatibility mirror/fallback (`apps/core-app/src/main/modules/analytics/report-queue-store.ts:23`) | Payload/endpoint/error are sensitive. Store has scheduled/retried strict prune; startup and Nexus outboxes also cap age at 14 days and count at 120/2,000 (`apps/core-app/src/main/modules/analytics/startup-analytics.ts:31`, `apps/core-app/src/main/modules/sentry/sentry-service.ts:72`). Keep the tighter operational cap: effective retention is the minimum of owner outbox TTL and user diagnostics policy. |
| `telemetry_upload_stats` | `TelemetryUploadStatsStore`, auxiliary with primary fallback (`apps/core-app/src/main/modules/sentry/telemetry-upload-stats-store.ts:23`) | Singleton counters plus timestamps and `last_failure_message`. Upsert bypasses scheduler/retry, and native failure text can persist (`apps/core-app/src/main/modules/sentry/sentry-service.ts:461`). Counters are not age rows; retain counters but replace failure text with a stable code and clear stale failure fields by cutoff. |
| Nexus telemetry memory buffer/outbox | `SentryServiceModule` | Telemetry sanitizer already drops search query and allowlists metadata; Sentry sanitizer drops request/breadcrumb/extra/path context (`apps/core-app/src/main/modules/sentry/telemetry-sanitizer.ts:368`, `apps/core-app/src/main/modules/sentry/telemetry-sanitizer.ts:419`). Keep these as mandatory ingress gates and test serialized output. |
| analytics messages/report queue | `AnalyticsMessageStore` and `AnalyticsModule`, memory only | Dev store is capped at 120/30 days (`apps/core-app/src/main/modules/analytics/message-store.ts:10`). Remote message reporting keeps 120/24 hours but currently sends raw title, message, and arbitrary meta (`apps/core-app/src/main/modules/analytics/analytics-module.ts:598`). This is a confirmed redaction gap, not solved by retention. |
| core log4js files/crash dumps | precore logger under `<innerRoot>/logs` | Date/10 MiB/3 backups are configured, but no explicit 30-day owner exists; crash upload is disabled (`apps/core-app/src/main/core/precore.ts:139`, `apps/core-app/src/main/core/precore.ts:145`, `apps/core-app/src/main/core/precore.ts:158`). Generic `cleanupLogs()` targets `app.getPath('logs')`, which is not explicitly set to this inner-root path, and deletes every file it sees (`apps/core-app/src/main/service/storage-maintenance.ts:182`). |
| download error logs | `ErrorLogger` at its injected log directory | Contains error details, stack, and arbitrary metadata; rotates at 10 MiB and retains five rotated files, not an age policy (`apps/core-app/src/main/modules/download/error-logger.ts:36`, `apps/core-app/src/main/modules/download/error-logger.ts:190`). |
| plugin session logs | each `PluginLoggerManager` below plugin runtime roots | Separate plugin-owned data, not core-log path authority (`apps/core-app/src/main/modules/plugin/plugin.ts:1249`, `apps/core-app/src/main/modules/plugin/plugin.ts:1308`). Coordinate with plugin data disposition; do not let diagnostics recursively delete plugin roots. |
| workflow debug logs | workflow debug owner under configured session roots | Explicit debug-only JSONL can include sanitized debug data and has no observed retention API (`apps/core-app/src/main/utils/workflow-debug.ts:115`, `apps/core-app/src/main/utils/workflow-debug.ts:131`). It needs its own fixed-root adapter if included in diagnostics clear. |

The 30-day diagnostics policy is a maximum, not a promise to retain every diagnostic for 30 days. Existing tighter memory/outbox/window limits remain valid; policy shortening may reduce them further, and policy lengthening cannot restore data.

### Minimal adapters and redaction prerequisites

Add one `DiagnosticsRetentionAdapter` that composes existing fixed owners rather than deleting generic paths/tables:

1. `DbStore.cleanupPolicyPage()` for snapshot and plugin-analytics pages in the auxiliary DB, with compatibility cleanup only where a known migration fallback can still contain rows.
2. `ReportQueueStore.prune(cutoff)` for shared outbox rows, preserving its existing tighter TTL/count and scheduler/retry behavior.
3. `TelemetryUploadStatsStore` scheduled/retried update that retains counters but clears old failure timestamp/code. Never persist raw `lastFailureMessage`.
4. In-memory message/telemetry owner methods that prune/clear by timestamp and return counts only.
5. A core-log adapter constructed with the captured `<innerRoot>/logs` root and fixed allowlisted core filenames/crash directory. It uses `lstat`, rejects symlinks/non-files, checks signal between bounded entries, and never accepts a caller path. Download, workflow-debug, and plugin logs remain separate adapters under their real owners.

Before RED can pass, route analytics remote message reports through a strict metadata-only sanitizer or disable that report surface; raw `title/message/meta` cannot be considered diagnostics-safe. Also remove raw errors from DB queue-pressure metadata: `DbStore` currently stores a truncated native error string for later logging (`apps/core-app/src/main/modules/analytics/storage/db-store.ts:85`). OperationalErrorService is the established projection boundary: it rejects sensitive context keys and unsafe public messages while retaining native detail only for the local sink (`apps/core-app/src/main/modules/observability/operational-error-service.ts:15`, `apps/core-app/src/main/modules/observability/operational-error-service.ts:299`).

### Diagnostics/telemetry RED tests

- Use migrated temporary primary/auxiliary libSQL files, a real temporary core-log root, and in-memory owner fixtures. Seed every surface with unique synthetic canaries and strict 30-day boundaries.
- Prove policy cleanup removes eligible snapshots/plugin analytics/outbox rows through scheduler/retry, honors tighter 14-day outbox rules, preserves current rows/counters, clears stale failure fields, paginates, cancels, and retries idempotently.
- Prove core-log cleanup touches only fixed core files below the captured root; preserve external files, symlinks, plugin/download/workflow roots, and boundary-mtime files. Inject stat/unlink failure and assert aggregate stable evidence only.
- Serialize sanitized Nexus, Sentry, analytics message-report, operational error, retention summary, and normal logger calls. Assert absence of synthetic clipboard, OCR, query, prompt/response, SQL parameter, path, password, Secret, endpoint-query, payload, stack, and native-error canaries.
- Assert diagnostics summaries contain only bounded counts/bytes/window/category/stable codes; do not snapshot arbitrary JSON payloads as test evidence.

## Required temporary integration harness

RED owner tests should share a small test-only harness, not production helpers:

1. Create a real directory with `mkdtemp`, then separate `primary.sqlite`, `aux.sqlite`, and `search-index.sqlite` clients as needed.
2. Apply the real journaled migrations in order (or Drizzle `migrate` against the production migrations folder), then execute `PRAGMA foreign_keys = ON` on every client. Existing search usage tests demonstrate real file-backed libSQL plus migration application and scheduler drain (`apps/core-app/src/main/modules/box-tool/search-engine/search-usage-service.test.ts:14`, `apps/core-app/src/main/modules/box-tool/search-engine/search-usage-service.test.ts:43`).
3. Build Drizzle handles with the production schema; pass primary/auxiliary handles explicitly to adapters so fallback and split routing are testable.
4. Construct a real `TempFileService({ baseDir: fixtureTempRoot })`; set file mtimes with filesystem APIs. Existing TempFileService consumers mostly mock it, so new focused tests are required (`apps/core-app/src/main/modules/clipboard/clipboard-image-persistence.test.ts:47`, `apps/core-app/src/main/modules/native-capabilities/screenshot-service.test.ts:124`).
5. Drain `dbWriteScheduler`, close every libSQL client, and recursively remove only the fixture root in `finally`/`afterEach`.
6. Use fake time only for deterministic `nowMs` and retry delays; do not mock database or filesystem behavior under test. Inject failure at adapter boundaries or libSQL client wrappers without putting native error text into assertions/evidence.

Suggested focused RED files:

- `apps/core-app/src/main/modules/privacy/clipboard-retention-owner.integration.test.ts`
- `apps/core-app/src/main/modules/privacy/ocr-screenshot-temp-retention-owner.integration.test.ts`
- `apps/core-app/src/main/service/temp-file.service.retention.test.ts`
- `apps/core-app/src/main/modules/privacy/search-detail-retention-owner.integration.test.ts`
- `apps/core-app/src/main/modules/privacy/intelligence-retention-owner.integration.test.ts`
- `apps/core-app/src/main/modules/privacy/diagnostics-retention-owner.integration.test.ts`
- `apps/core-app/src/main/modules/privacy/retention-coordinator.test.ts`

## GREEN 2 prerequisite decisions

The following are implementation prerequisites, not optional refactors:

1. Define strict `< cutoff` once and align TempFileService/audit behavior.
2. Add trusted Clipboard "important" authority or explicitly map it to the existing favorite flag; arbitrary metadata cannot protect rows.
3. Add Context pin authority and real archive/expire transitions; otherwise no production Context row is safely eligible.
4. Fix Intelligence audit ingress so prompt variables/templates and raw errors never persist.
5. Fix analytics message-report ingress so raw message/meta never go remote or into a durable outbox.
6. Add awaited, bounded, cancellable owner methods and route every DB page through scheduler/retry.
7. Replace detached owner polling with the one lifecycle coordinator; retain tighter owner TTLs as caps.
8. Add only query-plan indexes proven necessary by RED fixtures and `EXPLAIN QUERY PLAN`, in the next journaled migration. Do not delete data in a migration.

With these decisions, GREEN 2 can remain thin: adapters delegate to real owners, the coordinator supplies policy/time/signal, and no generic deletion authority is introduced.
