# Incident: 2026-01-16 Error Log Long-term Fix Plan

## Scope
Source log:
- `apps/core-app/tuff/logs/E.2026-01-16.err`

This document is **documentation-first** and tracks long-term fixes only.

## High-level Findings (from log)
- `plugin:api:get-runtime-stats` handler errors: **1379**
- `analytics_snapshots` insert errors: **727** (mostly `SQLITE_BUSY_SNAPSHOT`)
- `files` update errors: **34** (`SQLITE_BUSY`)
- `[AuditLogger] Failed to flush logs`: **4** (`SQLITE_BUSY(_SNAPSHOT)`)
- OCR pipeline DB writes failing: `ocr_results` insert / `ocr_jobs` update (multiple, mostly `SQLITE_BUSY`)
- OpenAI errors: `401` (vision.ocr), `400` (embedding.generate)
- `Perf:EventLoop` lag spikes (including extreme values)

## Root Cause Summary
### 1) ViewCache lifecycle inconsistency
- Runtime stats collects cached `WebContentsView` instances (ViewCache).
- Some cached entries become stale/invalid (view object missing, `webContents` missing, destroyed, or lifecycle race), causing runtime errors.

### 2) SQLite write contention across multiple subsystems
- Multiple writers (analytics persistence, OCR persistence, file indexing updates, audit logger flush, etc.) concurrently write into the same database.
- WAL + busy_timeout is not sufficient when write bursts happen concurrently; libsql returns `SQLITE_BUSY_SNAPSHOT`/`SQLITE_BUSY`.

### 3) AI provider / model mismatch & payload governance
- `401` suggests missing/invalid API key routing.
- `400` suggests invalid model or invalid request payload (too large / wrong input type) especially around embeddings.
- OCR outputs can be large; storing raw payload directly increases DB pressure and lock times.

### 4) Event-loop lag false positives on suspend/resume
- Extremely large lag values are consistent with OS sleep/resume; current monitor treats it as runtime lag.

---

## Long-term Fix Checklist

Status legend:
- ⬜ Pending
- 🟡 In Progress
- ✅ Fixed

### P0: ViewCache lifecycle correctness (no stale entries)
- ✅ **[VC-1]** Refactor ViewCache storage model:
  - Store a stable identity (`webContents.id`) and lifecycle metadata.
  - Store only safe references; prevent `undefined` from entering the cache.
- ✅ **[VC-2]** Register lifecycle hooks:
  - On `webContents.destroyed`/`render-process-gone`/`crashed`, automatically evict cache entry.
  - On plugin disable/unload, evict all entries for that plugin.
- ✅ **[VC-3]** Provide a safe enumeration API:
  - `getCachedViewsByPlugin(pluginName)` must never throw.
  - It must return only verified-alive views.
- ⬜ **[VC-4]** Add invariant checks + structured logging (not spam):
  - When eviction happens due to invalid view, log once per key with throttling.

**Acceptance Criteria**
- `plugin:api:get-runtime-stats` runs repeatedly without exceptions.
- ViewCache size never contains stale entries after view destruction.

**Verification Notes**
- Code: `apps/core-app/src/main/modules/box-tool/core-box/view-cache.ts`
- Cache entries are bound to `webContents.id` and automatically evicted when the underlying `webContents` is destroyed.

### P0: SQLite write contention elimination (single-writer scheduling)
- ✅ **[DB-1]** Introduce a unified DB write scheduler for non-critical writes:
  - Single queue (or per-table queues) to serialize writes to SQLite.
  - Backpressure + batching support.
- ✅ **[DB-2]** Refactor analytics persistence to use scheduler:
  - Batch insert snapshots via scheduler.
- ✅ **[DB-3]** Refactor audit logger persistence to use scheduler:
  - Insert audit logs + usage stats update must be scheduled.
- ✅ **[DB-4]** Refactor OCR persistence to use scheduler:
  - Insert `ocr_results`, update `ocr_jobs` must be scheduled.
- ✅ **[DB-5]** Refactor file indexing updates to use scheduler:
  - Avoid concurrent direct writes during scanning.
- ⬜ **[DB-6]** Review libsql client usage:
  - Ensure a single shared client/connection is used for local file DB.

**Acceptance Criteria**
- Under concurrent OCR + analytics + file indexing load, `SQLITE_BUSY(_SNAPSHOT)` error rate becomes ~0.
- DB write throughput is stable; no long lock bursts.

**Verification Notes**
- Scheduler: `apps/core-app/src/main/db/db-write-scheduler.ts`
- Analytics writes scheduled: `apps/core-app/src/main/modules/analytics/storage/db-store.ts`
- Audit writes scheduled (transactional): `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts`
- OCR writes scheduled (transactional for result+status): `apps/core-app/src/main/modules/ocr/ocr-service.ts`
- File indexing worker is compute-only and persistence is scheduled in main process:
  - Worker: `apps/core-app/src/main/modules/box-tool/addon/files/workers/file-index-worker.ts`
  - Main process persistence: `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`

### P1: AI provider correctness & payload governance
- ✅ **[AI-1]** Provider/model validation:
  - Ensure model names are compatible with the provider.
  - Reject invalid combinations early with actionable error.
- ✅ **[AI-2]** Centralize API key validation & routing:
  - Provider config must be loaded before invocation.
  - Missing key should be deterministic and not produce repeated runtime churn.
- ✅ **[AI-3]** OCR output storage governance:
  - Store a compact summary + hash.
  - Keep raw text size capped or stored externally (file store) with references.
- ✅ **[AI-4]** Embedding input governance:
  - Apply chunking/truncation + token/length limits.

**Acceptance Criteria**
- No `OpenAI API error: 401` when key is configured; clear error when missing.
- No `OpenAI API error: 400` due to invalid model/payload; large OCR texts do not blow up DB.

### P1: Perf monitor correctness on suspend/resume
- ⬜ **[PERF-1]** Detect `powerMonitor` suspend/resume and suppress lag incidents for a grace window.

**Acceptance Criteria**
- Event-loop lag alerts reflect real runtime regressions, not OS sleep.

---

## Implementation Notes / PR Tracking
Fill this when fixes land.

| ID | Status | PR / Commit | Notes | Verification |
|---|---|---|---|---|
| VC-1 | ⬜ |  |  |  |
| VC-2 | ⬜ |  |  |  |
| VC-3 | ⬜ |  |  |  |
| VC-4 | ⬜ |  |  |  |
| DB-1 | ⬜ |  |  |  |
| DB-2 | ⬜ |  |  |  |
| DB-3 | ⬜ |  |  |  |
| DB-4 | ⬜ |  |  |  |
| DB-5 | ⬜ |  |  |  |
| DB-6 | ⬜ |  |  |  |
| AI-1 | ✅ |  |  |  |
| AI-2 | ✅ |  |  |  |
| AI-3 | ✅ |  |  |  |
| AI-4 | ✅ |  |  |  |
| PERF-1 | ⬜ |  |  |  |
