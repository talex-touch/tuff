# Core Performance Rollout (2026-03)

This rollout focuses on **SQLite write-pressure control** and **high-frequency metrics throttling** to reduce lock contention, cut write amplification, and keep critical telemetry durable.

## Problem Context
- Search paths produced frequent `stats/analytics` writes and competed with business writes in SQLite.
- OCR queue bursts generated excessive intermediate-state writes with low operational value.
- Metrics persisted at overly short intervals, which was not cost-effective for production.

## Applied Strategies

### 1) Tiered Usage Stats Aggregation
- Split persistence paths for `search` and `action (execute/cancel)`.
- `search` now flushes in **30-minute** batches by default; `action` flushes in **10-minute** batches.
- Keep threshold-based early flush to avoid stale data during long sessions.
- Auto-sample `search` under write pressure to protect critical action durability.

### 2) Lower-Frequency Analytics Snapshots
- Minimum persistence interval now is:
  - `15m` window: 10 minutes
  - `1h` window: 20 minutes
  - `24h` window: 60 minutes
- Memory aggregation + low-frequency persistence significantly lowers sustained I/O load.

### 3) Unified Scheduling for Completion + Report Queue Writes
- Query completion recording now uses `dbWriteScheduler + withSqliteRetry`.
- Analytics report queue operations (insert/retry/delete/cleanup) are routed through the same scheduler.
- High-frequency write paths now share serialized scheduling to reduce lock races.

### 4) OCR Write-Pressure Governance
- Skip `ocr.jobs.start` intermediate writes under queue pressure and persist only key terminal states.
- Apply minimum-interval + queue-depth gating for `last-queued`, `last-dispatch`, and `last-success`.
- Persist `last-failure` only on the first transition to failed state.
- Add semantic-signature dedupe for `queue-disabled` to avoid duplicate writes.

### 5) Policy Modularization and Observability
- Extract OCR config persistence policy into a dedicated module to reduce service branching complexity.
- Add label-level TopN summary logs in `dbWriteScheduler` for faster hotspot diagnosis during stress tests.

## Expected Outcomes
- Lower probability of SQLite `database is locked` incidents.
- Significant write-amplification reduction in high-frequency search/OCR scenarios.
- Practical minute-level persistence cadence instead of noisy sub-second or second-level writes.

## Operational Notes
- Track queue depth, average wait time, and failed/dropped counts from `dbWriteScheduler`.
- If pressure rises again, tune in this order:
  - `search` sampling ratio
  - `search/action` flush interval
  - OCR `last-*` minimum persistence interval

## Persist Official Notice to D1
- New endpoint: `POST /api/dashboard/updates/sync-official`
- Auth: admin session or API key with `release:news` scope

:::TuffCodeBlock{lang="bash"}
---
code: |
  curl -X POST "https://<your-nexus-host>/api/dashboard/updates/sync-official" \
    -H "Authorization: Bearer <API_KEY>" \
    -H "Content-Type: application/json"
---
:::

- Response includes `total`, `inserted`, and `updated` so operations can verify persistence status.
