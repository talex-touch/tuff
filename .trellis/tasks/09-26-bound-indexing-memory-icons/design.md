# Design

The original ordered design (bounded admission → icon cutover → legacy conversion → native crash → scale acceptance)
was implemented and shipped. Steps 1–3 are now landed code; steps 4–5 are the remaining order, re-scoped for the
beta54 pipeline. Evidence index: `research/2026-09-29-master-reconciliation.md`.

## Landed contracts — reference only, never re-plan

- **Two admission layers, not one.** (a) Content *batch* admission: shared `IndexedWorkerSchedulerService`
  (`packages/utils/search/indexing-worker-scheduler.ts:78-79`) with the file adapter at
  `file-provider-index-scheduler-service.ts:105-109` — `chunkSize 30`, `maxInFlight 1`, `maxPendingBatches 2`,
  overflow returned as `deferred` and kept durable in `file_index_progress`; `schedule()` returns
  `{ accepted, deferred }`, `getSnapshot()` exposes `activeBatches/queuedBatches/pendingRecords/deferredRecords`,
  and `deferredRecords` is cumulative by contract — never publish it as current backlog. (b) Physical *write*
  admission: `search-index-writer.ts:53-55,492` — 1 active, 2 admitted waiters, at most 1 background waiter, producers
  park on a shared capacity pulse instead of the worker pending map; `withPausedAdmission` keeps its self-write
  bypass and shutdown rejects every waiter.
- **Result ownership.** `index-worker-payload-budget.ts:14,17` — 1 MiB per result, 32 MiB per batch including pending
  and inflight ownership; oversize output is an explicit failed result. Admission credit is held until results are
  persisted and published via the optional `afterBatch` barrier (`file-index-worker-client.ts:92,107,280`, wired at
  `file-provider-index-runtime-service.ts:209`). Live accounting comes from `pendingBytes`/`inflightBytes`
  (`file-provider-index-flush-service.ts:77,81`, `file-provider-index-runtime-service.ts:197`), not from cumulative
  counters. Mutation leases (`file-index-worker-client.ts:42-68,181`) fence stale deferred results.
- **Icon delivery.** `IconService.getFileIconPath(filePath, size?)` (`icon-service.ts:121`) returns a validated path,
  default 64 / max 256, at most 64 distinct in-flight requests, 256 lightweight cache entries; the single artifact
  helper (`file-icon-artifact.ts:19-20,230,279`) owns PNG validation, content-hash naming and atomic writes with
  `FILE_ICON_MAX_BYTES = 1 MiB`; `IconWorkerClient.extractToFile` writes inside the worker
  (`icon-worker.ts:86,112`) while macOS keeps the main-thread AppKit writer; the protocol allowlists only
  `getFileIconCacheDirectory()`. Scan-driven icon production is gone — the post-scan pass is thumbnails-only
  (`file-provider-asset-service.ts:254`).
- **Legacy conversion.** Keyset pages of 32 ids that carry only `length(value)` (`db/utils.ts:246`), per-row value cap,
  verified artifact write before a compare-and-update replacement (`file-provider-icon-migration-service.ts:89-99`,
  `db/utils.ts:283`). Failures keep the original value; no deletion, no VACUUM.
- **Content indexing policy.** `DEFAULT_FILE_INDEX_CONTENT_SETTINGS.contentIndexingEnabled === false`
  (`packages/utils/transport/events/types/file-index.ts:62-66`); the enable/disable/cleanup lifecycle lives in
  `file-provider-content-index-policy-service.ts`.

## Invalidated assumptions

1. The beta.41 `11d76262a` "100 admitted / 0 completed" probe and "targeted pipeline files are identical" — the
   pipeline was replaced by beta54; re-measuring it proves nothing about master.
2. One shared queue for all memory pressure — there are now two admission layers (batch and physical write) plus a
   page-level policy service; merging or duplicating them is out of bounds.
3. Enrichment-on acceptance runs — content indexing is default-off, so any probe expecting parser activity must opt in.
4. Legacy walker as the default enumeration path — fd is primary, legacy is the fallback.
5. `src/main/service/sentry-service.ts` — the file is now `src/main/modules/sentry/sentry-service.ts`.

## Remaining order (re-scoped)

Order is by risk removed per hour of machine time. Each slice is independently closable and non-overlapping.
The next slice (S1 = O1 + O2) is specified with exact files, contracts and probes in `implement.md`.

### O1 — Cold-scan icon budget under the fd backend (probe-only, no production edits expected)

- Dependency: none.
- Contract: during a cold scan of a tree whose rows already exist in the DB, `iconGeneratedBytesCumulative` stays 0,
  `file_extensions` gains no new `data:image/png;base64,%` icon value for those rows, and the post-scan pass touches
  thumbnails only. Lazy rendering must still resolve `tfile:///…/Caches/file-icons/<sha256>.png` with cache reuse
  (several rows sharing one hash file) and app rows from `app-icons`.
- Isolation: throwaway profile under `/tmp`; the scan root is a synthetic tree, not the home directory.
- Fails if: any scan-path icon write appears (that would be a production defect; fix belongs in this task, icon owner).

### O2 — Legacy conversion campaign (probe plus fix only if a probe fails)

- Dependency: none. Prefer running with content indexing at its default (off) so the writer is not contended, and
  repeat one short run with content indexing on + an external write lock to prove the idle gate holds.
- Contract: one pass over a legacy-shaped `file_extensions` population must terminate with
  `scanned === converted + skipped + failed` and zero remaining `data:image/png;base64,%` icon values for
  `files.type = 'file'` rows; `skipped/failed` rows keep their original value byte-for-byte; a `SIGTERM` mid-page
  followed by a restart resumes at the next keyset id without re-converting or losing values; peak RSS and the page
  rate (rows/second) are recorded so the residual drain time on a 250k-row profile is explicit.
- Evidence source: structured `File icon migration pass finished` log line, `iconMigrated`/`scanned` counters, and
  direct SQLite counts on the isolated database.

### O3 — Native crash delivery re-confirmation on the current build

- Dependency: none.
- Contract: isolated profile → `kill -SEGV` → dump written under the precore-configured crash directory → relaunch →
  `discovery completed phase=discovered` → `Native crash minidump parsed phase=parsed` → `transport completed
  phase=sent` with a 2xx status → independent Sentry receipt for the new release. If receipt cannot be independently
  observed, record the exact external blocker instead of claiming delivery.
- Non-goals: no second uploader, no privacy widening, no transport error-semantics rewrite.

### O4 — 100k / three-hour isolated acceptance re-baseline

- Dependency: O1 and O2 closed (so the campaign measures the shipping icon/conversion behaviour rather than a moving
  tree).
- Contract: two isolated profiles over the same 100k synthetic tree — (a) shipping default (content indexing off,
  fd backend) and (b) content indexing on, which is the only configuration that still exercises enrichment
  admission and the byte budgets. Both must report the completed row count, exactly one root completion checkpoint,
  live queue/byte snapshots (`activeBatches/queuedBatches/pendingRecords`, `pendingBytes/inflightBytes`), per-isolate
  heap, process RSS, event-loop lag, and concurrent CoreBox search latency during the scan; the default profile must
  additionally show zero parser activity. Residency of at least three hours records the same series with queues
  returning to zero at rest, then a graceful shutdown with no module-unload timeout.
- Isolation: scratch tree and profiles under `/tmp`, `TUFF_DISABLE_GLOBAL_SHORTCUTS=1`.
- Non-goal: 09-29's open AC7 idle-CPU baseline (renderer/GPU) is owned by
  `.trellis/tasks/09-29-bounded-fd-fzf-file-indexing/` and must not be claimed here.

## Boundaries

- No real-profile migration, no database deletion or VACUUM, no commits/pushes/releases.
- Production edits happen only when an O1–O4 probe fails, and only inside the files named by that probe.
- Test authors own tests; production owners skip validation until their mutation wave settles. Main runs shared
  verification once.
