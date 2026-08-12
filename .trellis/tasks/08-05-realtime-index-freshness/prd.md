# Realtime index freshness with bounded resource usage

## Goal

Fix the install-to-searchable chain per research/realtime-chain-diagnosis.md: F1 bounded-backoff retry + dead-letter for scan failures (idle zero-polling), F2 400/300ms event coalescing via IndexingWatchDeltaQueueService debounce, F3 trim stability sleeps (1000->250ms), F4 filesystem-aware health check triggering backfill, F5 write lastIndexedAt on app rows, F6 dev mdls gate on >6h not first-scan-only. Target: install an app -> searchable in <=10s (design headroom ~2.5s), zero idle polling. A-M7 same-class fold-in optional.

## Requirements

- R1 (F1): A transient failure in per-path app resolution (module load, mdls
  throttle, Spotlight lag, bundle mid-write) is retried with bounded backoff
  (3 attempts, 2/8/30s) and then parked in a dead-letter set swept only while
  non-empty (10min) — "failed" and "not an app" are distinct, logged, and surfaced
  through operationalErrorService. Idle state adds zero timers.
- R2 (F2): Watch events coalesce in a time window (app 400ms / file 300ms) via an
  optional debounce on the existing IndexingWatchDeltaQueueService; one timer per
  active window, released when the window closes. An app install (~16 raw events)
  results in one resolution pass, not sixteen serial 1.5s passes.
- R3 (F3): `_waitForItemStable` tail sleep 1000→250ms, probe interval 500→300ms
  (chokidar's 2000ms awaitWriteFinish already debounces upstream).
- R4 (F4): Provider health includes a filesystem cardinality probe (readdir count
  of *.app under watch roots vs DB rows, called only at startup/decision points,
  never polled); a mismatch marks unhealthy and triggers the existing backfill.
- R5 (F5): App upsert/insert writes `lastIndexedAt` (both SQL sites).
- R6 (F6): Dev-profile mdls poll uses the same `>6h since last scan` gate as prod
  instead of the first-scan-only branch.
- R7: Resource envelope: no new periodic polling in idle state; all added timers
  are bounded and self-releasing; parameters as named constants.

## Acceptance Criteria

- [ ] Unit tests per F1-F6 (retry schedule, dead-letter sweep lifecycle including
      timer release on empty, coalescing window merges N events → 1 pass, health
      probe mismatch → backfill trigger, lastIndexedAt written, dev gate).
- [ ] Existing addon/apps + search-engine + addon/files suites green;
      typecheck:node green for touched files.
- [ ] Manual acceptance script B from the diagnosis doc recorded in the task dir
      (install app → searchable ≤10s) — to be run by the user post-restart; the
      chain's per-stage latency budget documented in code constants.

## Notes

Authoritative design: parent task research/realtime-chain-diagnosis.md (per-stage
chain map, fix designs with file:line, parameter table, acceptance scripts).
Diagnosis also established: the Doubao incident's direct cause was an environment
accident (out/main emptied under a running dev instance) — restart resolves the
module error; these fixes close the four HEAD defects it exposed.
