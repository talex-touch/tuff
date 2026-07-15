# Progressive CoreBox Search During First Index

## Goal

Keep CoreBox search useful while the first App/File index is still being built:
newly committed matching items become visible without editing the query, while
all non-terminal CoreBox hint UI stays hidden.

## Parent and Dependencies

- Parent: `07-09-audit-search-system-architecture`.
- This task delivers the narrow end-to-end progressive-search slice. It does not
  replace the broader single-writer or request-scoped-session children.
- Existing ordered gather completion remains authoritative for each search
  request.

## Confirmed Current Behavior

- App search-index writes commit item-by-item through `SearchIndexService` during
  startup backfill.
- File search-index writes commit through `SearchIndexWorkerClient` in batches.
- CoreBox only reruns search on input/window events; index commits do not refresh
  an unchanged query.
- Search results can remain stale for the five-second search-cache TTL because
  index mutations do not invalidate that cache.
- Current visible transient hints are the searching card, recommendation warm-up
  card, and empty-query indexing tag. A true terminal no-result flow is separate
  and must remain unchanged.

## Requirements

### R1 — Remove transient CoreBox hints

- Remove searching, recommendation warm-up, and indexing-progress hint UI from
  CoreBox.
- Do not replace them with another loading/preheating/indexing placeholder.
- Preserve terminal no-result behavior and its sizing event.
- Remove obsolete components, helpers, styles, tests, and locale keys that have
  no remaining consumer.

### R2 — Publish committed search-index changes

- Add one typed CoreBox stream carrying a monotonic revision, committed provider
  ids, and commit time.
- Emit only after a main-process or worker-backed search-index mutation succeeds.
- File/App diagnostic progress is not a commit signal and must not drive refresh.
- Clear SearchEngineCore query cache before notifying renderer subscribers.
- Stream contexts and mutation subscriptions must be released on cancellation or
  shutdown.

### R3 — Refresh the active query progressively

- A visible CoreBox with a non-empty ordinary query refreshes after index commits
  without requiring text edits.
- Coalesce continuous commit events into bounded refreshes; a committed matching
  item becomes visible within one second when no prior UI search is still in
  flight.
- Do not overlap duplicate CoreBox refresh requests. A commit received during an
  in-flight request schedules a trailing refresh.
- Use a complete fresh search snapshot, not raw-item append logic, so ranking,
  filters, and stale-item removal stay authoritative.
- Preserve the selected item by id when it remains present; otherwise fall back
  deterministically.
- Cancel timers and the commit stream when the renderer unmounts.

## Acceptance Criteria

- [x] Searching, recommendation warm-up, and empty-query indexing hints no longer
  render; terminal no-result handling remains intact.
- [x] Successful App main-process and File worker-backed index commits both
  publish the typed revision stream and invalidate cached search snapshots.
- [x] With a stable visible query, a newly committed matching App/File item
  appears within one second without editing the input.
- [x] Continuous commits are coalesced, never overlap duplicate UI searches, and
  produce a trailing refresh.
- [x] Progressive refresh replaces the result snapshot and preserves selection by
  item id when possible.
- [x] Stream/timer cleanup, focused tests, renderer/node type-checks, UI smoke, and
  commit-scope checks pass.

## Out of Scope

- Completing the full single-search-index-writer migration.
- Completing the full multi-caller `SearchSessionRegistry` migration.
- Search relevance or ranking-weight changes.
- Redesigning terminal no-result UX.
