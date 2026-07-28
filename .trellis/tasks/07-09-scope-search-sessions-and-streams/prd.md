# Scope Search Sessions and Streams

## Goal

Replace global UI-coupled search state with request-scoped sessions and
caller-owned delivery. CoreBox, ApplicationIndex, DivisionBox, AI agents, and
background callers must be able to search concurrently without cancelling,
activating, caching, or receiving results for one another.

## Parent and Dependency

- Parent: `07-09-audit-search-system-architecture`.
- Priority: P1.
- Explicit prerequisite: `07-09-serialize-search-gather-updates` must be
  completed and archived or otherwise verified before this task starts.

## Background

- `SearchEngineCore` owns one activated-provider state, gather controller,
  latest session id, and last query at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:152`.
- A new search aborts the current global gather at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1297`.
- Updates are delivered through current-window lookup at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1507`
  and
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1674`.
- AI agents call the same singleton directly at
  `apps/core-app/src/main/modules/ai/agents/builtin/search-agent.ts:209`.
- Cache lookup can reuse an old session id at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1222`,
  and cancellation does not verify the requested id.
- The query event advertises streaming, but renderers use invoke plus global
  update/end listeners at `packages/utils/transport/events/index.ts:1133` and
  `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts:852`.

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

## Acceptance Criteria

- [ ] Concurrent CoreBox and AI queries both complete without cross-cancellation,
  UI activation inheritance, or renderer leakage.
- [ ] Two renderer windows receive only their own snapshots, updates, and
  completion.
- [ ] Every request, including identical cache hits, has a new session id and
  trace identity.
- [ ] Cancelling a stale id cannot cancel a newer request.
- [ ] The first stream chunk establishes session id before any update/completion
  processing, eliminating pending-update maps required by invoke ordering.
- [ ] Renderer unmount or stream cancellation aborts only its session.
- [ ] No search delivery references `windowManager.current` or a single global
  gather controller.
- [ ] Existing ranking/provider behavior remains unchanged outside explicit
  caller activation context.

## Out of Scope

- Provider lifecycle/control-plane consolidation.
- Search relevance tuning or UI redesign.
- FTS write ownership and storage hydration changes.
