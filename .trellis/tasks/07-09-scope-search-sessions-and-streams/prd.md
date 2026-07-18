# Scope Search Sessions and Streams

## Goal

Replace global UI-coupled search state with request-scoped sessions and
caller-owned delivery. CoreBox, ApplicationIndex, DivisionBox, AI agents, and
background callers must search concurrently without cancelling, activating,
caching, or receiving results for one another, including when a visible CoreBox
query refreshes as first-run index batches commit.

## Parent and Dependency

- Parent: `07-09-audit-search-system-architecture`.
- Priority: P1.
- Explicit prerequisite: `07-09-serialize-search-gather-updates` must be
  completed and archived or otherwise verified before this task starts.
- Progressive first-run refresh may be developed against a test generation
  source, but production enablement depends on the committed-generation contract
  from `07-09-establish-single-search-index-writer`.

## Background

- `SearchEngineCore` still owns one `currentGatherController`, `latestSessionId`,
  `lastSearchQuery`, mutable provider activation map, and current-window delivery.
- Starting any search aborts that global gather, so the AI Search Agent and UI
  callers can cancel or inherit state from one another.
- `cancelSearch(searchId)` aborts the single current controller without proving
  that the requested id owns it.
- Cache entries retain the prior result object and session id; identical cache
  hits can therefore reuse trace identity.
- CoreBox and ApplicationIndex use invoke for the initial result plus global
  `search.update` / `search.end` listeners. Updates can arrive before invoke
  establishes `currentSearchId`, requiring pending maps and allowing another
  renderer window to observe traffic not addressed to it.
- `CoreBoxEvents.search.query` advertises stream capability, but its response is
  still typed as a single `TuffSearchResult`; no typed request-owned stream
  contract exists.
- The archived `07-09-progressive-corebox-index-search` child already delivered
  commit-driven bounded refresh, full snapshot replacement, selection
  preservation, transient-hint removal, and lifecycle cleanup. Those completed
  requirements remain part of this task's integrated acceptance but are not
  reimplemented here.

## Requirements

- Introduce a `SearchSessionRegistry` keyed by a new session id per request,
  including cache hits.
- Each session owns its abort controller, caller identity, activation snapshot,
  provider selection, trace, cache association, terminal state, and delivery
  sink.
- The reusable search pipeline must not read current-window or mutable CoreBox
  activation globals.
- UI callers use an explicit UI facade; AI/background callers use collecting or
  callback sinks and never emit renderer traffic.
- Cancellation verifies the requested live session and is a no-op for stale,
  unknown, or completed ids.
- Add a typed stream event whose first chunk establishes session identity before
  updates. Renderer cancellation must promptly abort the owning session.
- Migrate `useSearch` and `ApplicationIndex`; temporary invoke compatibility may
  deliver only to `context.sender`, never broadcast/current-window lookup.
- Cache immutable result snapshots only; never cache session/controller/sink
  envelopes.
- Destroy must abort and await all live sessions.
- A visible CoreBox caller with a non-empty query may opt into committed index
  generation refreshes. Changes are coalesced so a matching committed record is
  reflected within one second, with one mandatory final refresh on scan
  completion.
- Every refresh uses a new caller-owned session and a full replacement snapshot;
  it never revives a completed session or restarts another caller.
- Renderer replacement preserves the selected item by id when it remains in the
  result set and falls back deterministically when it disappears.
- Index-driven refresh is silent: searching, recommendation warm-up, and
  indexing-progress hints are not rendered. Terminal no-result behavior remains.

## Acceptance Criteria

- [x] Concurrent CoreBox and AI queries both complete without cross-cancellation,
  UI activation inheritance, or renderer leakage.
- [x] Two renderer windows receive only their own snapshots, updates, and
  completion.
- [x] Every request, including identical cache hits, has a new session id and
  trace identity.
- [x] Cancelling a stale id cannot cancel a newer request.
- [x] The first stream chunk establishes session id before any update/completion
  processing, eliminating pending-update maps required by invoke ordering.
- [x] Renderer unmount or stream cancellation aborts only its session.
- [x] No search delivery references `windowManager.current` or a single global
  gather controller.
- [x] Existing ranking/provider behavior remains unchanged outside explicit
  caller activation context.
- [x] During an unfinished first App/File scan, a stable CoreBox query displays a
  newly committed matching item within one second without text edits.
- [x] Generation refresh replaces and reorders the snapshot, preserves selection
  by item id, and performs exactly one final refresh after completion.
- [x] Transient CoreBox searching, recommendation warm-up, and indexing hints are
  absent while terminal no-result behavior remains available.

## Out of Scope

- Provider lifecycle/control-plane consolidation.
- Search relevance tuning or broader UI redesign beyond progressive snapshot
  replacement, selection preservation, transient-hint removal, and existing
  terminal no-result behavior.
- FTS write ownership and storage hydration changes.
