# Master reconciliation — 2026-09-29 (after beta54)

Purpose: retire every assumption in `prd.md` / `design.md` that beta54 already shipped, so the remaining
order contains no reimplementation of landed backpressure, content-index, or icon work.

Base facts used here:

- This task's implementation landed as `b3edffef1 feat(search): bound file indexing memory, worker backpressure, and icon storage` (2026-09-26, 82 files) and is an ancestor of `master`.
- `728d251a0 perf(indexing): bound file scanning and content enrichment` + `bd86b0af1 fix(ci): split file index state services` (2026-09-29) landed the successor task `.trellis/tasks/09-29-bounded-fd-fzf-file-indexing/` and shipped in `v2.4.14-beta.54`.
- Worktree is clean; every path below was read on `master` at the beta54 tip, not inferred from the artifacts.

## 1. Landed — do not re-plan

| Capability | Where it lives now | Evidence |
| --- | --- | --- |
| Global physical-write admission | `apps/core-app/src/main/modules/box-tool/search-engine/search-index-writer.ts` | `MAX_ACTIVE_ADMISSIONS = 1`, `MAX_QUEUED_ADMISSIONS = 2`, `MAX_BACKGROUND_QUEUED_ADMISSIONS = 1` (:53-55); `acquireAdmission` (:492) parks producers on a shared capacity pulse instead of the worker pending map |
| Per-provider content batch admission | `packages/utils/search/indexing-worker-scheduler.ts` + `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.ts` | `maxInFlight ?? 1`, `maxPendingBatches ?? 2` (:78-79 shared / :105-109 adapter), `chunkSize ?? 30` (adapter :107), `schedule()` returns `{ accepted, deferred }` (shared :109), cumulative `deferredRecords` documented as non-live (:45) |
| Retained-result byte budgets | `.../workers/index-worker-payload-budget.ts` | `INDEX_WORKER_RESULT_MAX_BYTES = 1 MiB` (:14), `INDEX_WORKER_BATCH_MAX_BYTES = 32 MiB` (:17), oversize results fail explicitly |
| Admission credit held until publication | `.../workers/file-index-worker-client.ts` | optional `afterBatch?: () => Promise<void>` barrier (:92, :107, awaited at :280), wired from `file-provider-index-runtime-service.ts:209` |
| Live backlog accounting (not cumulative) | `file-provider-index-flush-service.ts` (:77, :81), `file-provider-index-runtime-service.ts` (:197 `getBufferSnapshot`, :201-202), `file-provider-runtime-evidence.ts` (:115-117, :232-238) | `pendingBytes` / `inflightBytes` / `bufferBudgetBytes` surface as current values; `schedulerDeferredRecords` stays labelled cumulative |
| Mutation-lease fencing / cancellation | `file-index-worker-client.ts` (:42-68 `mutationLeaseId`, :181 `cancelLease`) | stale deferred results cannot overwrite a newer version |
| On-demand path-backed file icons | `apps/core-app/src/main/service/icon-service.ts`, `.../main/service/file-icon-artifact.ts` | `getFileIconPath` (:121), `MAX_FILE_ICON_INFLIGHT = 64` (:26), `MAX_FILE_ICON_CACHE_ENTRIES = 256` (:27, trim at :527), `FILE_ICON_MAX_BYTES = 1 MiB` / `FILE_ICON_MAX_DIMENSION = 256` (artifact :19-20), `persistFileIconPngArtifact` (:230) + `persistFileIconPng` (:279); extension writes carry the `file-icon.persist` writer label (`file-provider-icon-cache-service.ts:23`) |
| Worker/path split for icons | `.../workers/icon-worker-client.ts:50 extractToFile`, `.../workers/icon-worker.ts:86 writeIconPngAtomically` | worker writes PNG bytes to `outputPath`; returned path is validated against the requested path (:141); macOS still uses the main-thread AppKit writer |
| All icon consumers migrated | `everything-icon-cache.ts:62`, `file-provider.ts:612`, `file-provider-asset-service.ts:157`, `file-provider-opener-service.ts:578`, `file-protocol/index.ts:37` | the only remaining caller of the legacy data-URL `extractFileIcon` is `icon-worker.ts` (plus its test); tfile allows only the temp dir (:32) and `getFileIconCacheDirectory()` — never the whole cache or home |
| Legacy data-URL conversion | `.../services/file-provider-icon-migration-service.ts` (class :33, `PAGE_SIZE = 32` :4, keyset `afterId` loop :59-111, verify-then-replace :89-99), `db/utils.ts` (:246 `getLegacyFileIconPage`, :266 `getLegacyFileIconValue`, :283 `replaceFileIconValue`) | pages carry ids + `length(value)` only; values are replaced only when the compare-and-update matches the previously read value |
| Migration scheduling | `file-provider.ts:2145` → `file-provider-asset-service.ts:176 scheduleLegacyIconMigration` | idle-gated per page (`waitForIdle`), single-flight, unref'd timer, cleared on close |
| Scan-driven icon production stopped | `file-provider-asset-service.ts:254 generateMissingThumbnails()`; `file-provider.ts:3882` | post-scan pass is thumbnails-only; `iconGeneratedBytesCumulative` (`file-provider-runtime-evidence.ts:238`) stayed 0 across a whole-home scan |
| Native crash lifecycle diagnostics | `apps/core-app/src/main/modules/sentry/sentry-service.ts` (**moved** from `src/main/service/`) | phases `discovered`/`parsed`/`sent` (:63, :265, :921-930, :939-948, :955-971), `beforeSend` (:1001), `afterSendEvent` (:1028), snapshot getter (:1325); dump dir comes from `core/precore.ts:181 crashReporter.start` |
| fd enumeration backend + fallback | `.../workers/file-scan-fd-backend.ts` (:33 `resolveBundledFdBinary`, :56 `scanDirectoryBatchesWithFd`, args :69-82), `.../workers/file-scan-worker.ts` (:11, :47-48 `backend: 'fd' \| 'legacy' \| 'mixed'`, fallback :130-163) | 09-29 PRD AC8/AC9/AC11 record the fd-vs-walker set equality and packaged-binary evidence |
| Content indexing default-off | `packages/utils/transport/events/types/file-index.ts:62-66` (`DEFAULT_FILE_INDEX_CONTENT_SETTINGS.contentIndexingEnabled === false`), `files/types.ts:9-20`, `services/file-provider-content-index-policy-service.ts` (:30 class, :69 false on disable, :86 `reconcileAtStartup`) | beta54 enables metadata search always,正文 only on explicit opt-in |
| Progress/state services | `file-provider-progress-stream-service.ts` (:95 publisher, :247 `FileProviderProgressStateService`), `file-provider-scan-progress-service.ts:81`, `file-provider-progress-estimator-service.ts` | progress projection and throttling now live outside `file-provider.ts`; `bd86b0af1` moved content policy out of the facade |
| Thumbnail pipeline unchanged in kind | `.../files/thumbnail-service.ts:207 generateThumbnail`, `.../workers/thumbnail-worker*.ts` | 09-29 touched only 8 lines here; thumbnails remain a separate lazy asset from the icon path |

## 2. Invalidated assumptions

1. **"Current targeted pipeline files are identical to beta.41 `11d76262a`"** (prd.md evidence bullet). No longer true: beta54 rewrote the scan backend, the writer admission, the content policy and the progress services. The 100-batch/20-record admission probe describes a build that no longer exists.
2. **Enrichment-on-by-default acceptance.** `research/verification-2026-09-26.md` measured enrichment, `file_index_progress` tails and content-driven write pressure because content indexing was implicit. Under beta54 that work only exists behind `contentIndexingEnabled === true`, so those measurements cannot be replayed as-is.
3. **Design's single-layer memory contract.** `design.md` described admission as one shared `IndexedWorkerSchedulerService` queue. Master now has two distinct layers with different jobs — content batch admission (shared SDK scheduler) and physical write admission (`SearchIndexWriter`) — plus a page-level content policy service. They must not be merged or duplicated.
4. **Legacy walker as the only scan path.** Icon-budget and memory measurements taken under the legacy walker no longer describe the default enumeration path (fd, with legacy as fallback).
5. **`sentry-service.ts` path.** The native-crash diagnostics are real but live at `modules/sentry/sentry-service.ts`; artifact references to `src/main/service/sentry-service.ts` are stale.
6. **Startup-IPC validation inside this task.** The channel reply-contract work is tracked separately as `.trellis/tasks/09-26-channel-error-reply-contract/` (status `planning`). Keep it out of this task's remaining order.

## 3. Still open (the only remaining work)

| # | Open item | Why the landed evidence does not close it | Owner files |
| --- | --- | --- | --- |
| O1 | Cold-scan icon budget under the fd backend | The zero-icon-bytes observation is from a beta.41-era dev app on the legacy walker; 09-29 changed enumeration and thumbnail plumbing | `file-scan-worker.ts`, `file-provider-asset-service.ts`, `file-provider-runtime-evidence.ts` |
| O2 | Legacy conversion end-to-end: completion, resume after kill, and failure preservation at legacy scale | Implementation and unit tests exist; the only runtime record is "converts slowly while the scan holds the writer" (251,627 → 245,784 data URLs in ~50 min). No pass has been observed to reach `page.length === 0`, and no mid-pass kill/restart has been replayed | `file-provider-icon-migration-service.ts`, `db/utils.ts`, `file-provider-asset-service.ts` |
| O3 | Native crash delivery re-confirmation on the current build | The single observed receipt is release `2.4.14-beta.41@release` with Electron `^41.10.6`; master upgraded Electron (`bea8088c1`) and reworked startup | `core/precore.ts`, `modules/sentry/sentry-service.ts` |
| O4 | 100k / three-hour isolated acceptance re-baseline | Recorded against the pre-fd pipeline, with enrichment implicitly on, on a root outside `/tmp` (`~/tuff-index-probe-beta47`) | `file-scan-worker.ts`, `search-index-writer.ts`, `file-provider-index-runtime-service.ts`, `file-provider-runtime-evidence.ts` |

Non-overlap note: 09-29's open **AC7** (post-scan idle CPU ≤5%, currently 26.7%–50% dominated by renderer/GPU) is a renderer/GPU baseline problem owned by that task. O4 re-baselines *indexing* envelopes only and must not claim AC7.

## 4. Corrected boundary facts for future runs

- Isolated profile knobs already used by this task and still valid: `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR`, `TUFF_FILE_PROVIDER_BASE_WATCH_PATHS`, `TUFF_DISABLE_GLOBAL_SHORTCUTS=1`, `TUFF_DB_SEARCH_SPLIT_ENABLED=0` for the shared-file writer topology.
- Fresh profiles now resolve content indexing to **off**; any probe that expects enrichment must opt in explicitly (`contentIndexingEnabled: true`) or it will observe zero parser activity by design.
- Scratch trees and profiles belong under `/tmp` (prd.md), not under the home directory as the beta.47 campaign did.
