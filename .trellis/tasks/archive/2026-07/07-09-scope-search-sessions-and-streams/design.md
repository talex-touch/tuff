# Request-Scoped Search Sessions and Streams — Design

## Intent

Replace `SearchEngineCore`'s process-wide active request with caller-owned search
sessions. CoreBox, ApplicationIndex, DivisionBox, AI agents, and future background
callers share ranking/provider code but never share cancellation, activation,
cache identity, or delivery state.

The archived progressive CoreBox index-refresh child remains authoritative for
commit-driven refresh and full-snapshot replacement. This task changes each
refresh into a normal request-owned search session; it does not add a second
refresh scheduler.

## Invariants

1. One request creates exactly one fresh session id, including cache hits.
2. One session belongs to exactly one immutable caller identity and one sink.
3. A session owns cancellation, its activation snapshot, provider selection,
   trace metadata, cache association, buffered delivery, and terminal state.
4. Search updates are delivered in emission order. Start precedes snapshot;
   snapshot precedes buffered updates; completion/error is terminal.
5. Cancelling an id can affect only a live session owned by the requesting caller.
6. Cache values are detached result snapshots. They contain no session id,
   controller, sink, caller, promise, or mutable pipeline state.
7. The reusable pipeline never resolves `windowManager.current` and never emits
   transport events directly.
8. UI facades derive caller identity from the transport handler's sender. AI and
   background callers use collecting/callback sinks and cannot emit UI traffic.
9. Destroy aborts every live session and awaits terminal delivery before provider
   and transport teardown proceeds.

## Request and Session Model

Add `search-session.ts` beside `search-core.ts`.

```ts
type SearchCallerKind =
  | 'core-box'
  | 'application-index'
  | 'division-box'
  | 'ai-agent'
  | 'background'

interface SearchCallerIdentity {
  kind: SearchCallerKind
  id: string
  senderId?: number
}

interface SearchRequestContext {
  caller: SearchCallerIdentity
  activations?: readonly IProviderActivate[] | null
  sink?: SearchSink
}

interface SearchExecution {
  sessionId: string
  result: Promise<TuffSearchResult>
  completed: Promise<void>
  cancel: () => boolean
}
```

`activations` has explicit semantics:

- array: caller-owned activation snapshot;
- `null`: no UI activation inheritance; use the normal enabled provider pool;
- omitted: compatibility default captured once from the provider registry when
  the session is created.

The registry owns a `Map<sessionId, SearchSession>`. A session contains:

- a root `AbortController`;
- immutable caller identity and normalized query snapshot for tracing;
- a private activation map cloned at creation;
- attached gather controller (when gather starts);
- ordered sink queue and pre-snapshot update buffer;
- `running | completed | cancelled | failed` terminal state;
- a terminal promise used by shutdown.

Attaching a gather controller links the session signal to `gather.abort()`. If
cancellation happened before gather creation, attachment aborts immediately.

`cancel(sessionId, caller)` returns `false` for unknown, terminal, or owner-
mismatched sessions. It never falls back to a global controller. Normal renderer
stream cancellation uses the known session handle and therefore cannot target a
newer request accidentally.

## Search Pipeline Boundary

`SearchEngineCore.startSearch(query, context)` creates the session synchronously
and returns `SearchExecution`. `search(query, context)` remains as a convenience
wrapper that awaits `execution.result` for collecting callers.

The existing search body becomes a request-scoped execution using only the
session passed to it:

```text
startSearch
  -> registry.create(caller, query, activations, sink)
  -> sink.start(sessionId)
  -> executeSession(session, query)
     -> orchestrate(query, session.activations)
     -> select providers from session.activations
     -> cache lookup / gather / rank
     -> session.mergeActivations(results)
     -> session.publishUpdate(...)
     -> session.complete(...)
  -> session.publishSnapshot(initialResult)
```

The current global fields are removed:

- `currentGatherController`;
- `latestSessionId`;
- `lastSearchQuery`;
- `searchSessionStartTimes` (start time moves into session trace metadata).

Stale-result checks become `session.signal.aborted` / terminal checks. Starting a
new request never aborts another session. Query-completion recording uses the
executed item's own `searchResult.query`, not a process-global last query.

`SearchProviderRegistry` gains a pure `getActiveFor(activationMap)` view. Search
results merge activation records into the session snapshot only. CoreBox's
control-plane activation methods remain for explicit activate/deactivate actions,
but the search pipeline neither reads nor mutates that live map after session
creation.

`SearchQueryOrchestrator.orchestrate` receives the session activation map so the
cache key and provider pool are derived from the same immutable request state.
Existing ranking, provider ordering, filter routing, and gather ordering are
unchanged.

## Ordered Delivery Sink

`SearchSink` is transport-agnostic:

```ts
interface SearchSink {
  start?(sessionId: string): void | Promise<void>
  snapshot?(result: TuffSearchResult): void | Promise<void>
  update?(payload: CoreBoxSearchUpdatePayload): void | Promise<void>
  noResults?(): void | Promise<void>
  complete?(payload: CoreBoxSearchEndPayload): void | Promise<void>
  error?(error: Error): void | Promise<void>
}
```

`SearchSession` serializes sink calls. Gather updates produced before the initial
result resolves are buffered. Publishing the snapshot flushes updates in order,
then any pending terminal signal. No update is accepted after terminal state.

Sink implementations:

- typed stream sink: emits typed chunks, then calls `StreamContext.end()`;
- sender-scoped compatibility sink: sends existing `search.update`, `search.end`,
  and `search.noResults` events only to `context.sender.id`;
- collecting sink: no renderer side effects; used by AI/background calls;
- callback sink: available to in-process consumers without transport coupling.

The reusable pipeline has no window lookup or transport import for delivery.

## Typed Stream Contract

Add a distinct stream event instead of overloading the invoke-typed
`CoreBoxEvents.search.query` response:

```ts
interface CoreBoxSearchSessionRequest {
  query: TuffQuery
  activations?: IProviderActivate[] | null
  surface: 'core-box' | 'application-index' | 'division-box'
}

type CoreBoxSearchSessionChunk =
  | { type: 'session'; sessionId: string }
  | { type: 'snapshot'; sessionId: string; result: TuffSearchResult }
  | { type: 'update'; sessionId: string; items: TuffItem[] }
  | { type: 'no-results'; sessionId: string; shouldShrink: boolean }
  | { type: 'complete'; sessionId: string; cancelled?: boolean;
      activate?: IProviderActivate[]; sources?: TuffSearchResult['sources'] }
```

The first chunk is emitted synchronously from session creation before gather or
cache work. `StreamContext` exposes an abort signal backed by the server stream
runtime. The CoreBox facade links that signal to `execution.cancel()` and awaits
`execution.completed`; completion emits its terminal chunk before ending the
transport stream.

The existing invoke query remains temporarily for non-migrated/plugin
compatibility. It creates the same registry session and sender-scoped sink. It
never uses current-window delivery. The existing cancel event validates both id
and sender ownership.

## Renderer Migration

`useSearch.ts` and `ApplicationIndex.vue` consume the typed stream directly:

- cancel only the stored `StreamController` for the prior request;
- accept `session` first and set current identity immediately;
- resolve the initial search promise from `snapshot`;
- process `update` and `complete` only for that stream/session;
- process `no-results` through the existing terminal sizing behavior;
- cancel the controller on unmount.

Remove the global `search.update` / `search.end` subscriptions and the
`pendingSearchUpdatesById` / `pendingSearchEndById` invoke-order buffers.

The existing progressive index-commit scheduler still starts a fresh request and
replaces the full snapshot. Its selection-by-id and trailing-refresh behavior are
unchanged.

## Cache Contract

Cache keys continue to use normalized query, inputs, provider configuration, and
now the session activation snapshot. Cache values exclude `sessionId` and are
deep-detached at insertion. A hit deep-detaches the stored snapshot again and
attaches the new session id and trace timing.

This prevents a direct in-process caller from mutating cached objects and proves
that identical hits cannot share identity or delivery state.

## Lifecycle and Failure Semantics

- Cache/recommendation paths complete their session after snapshot delivery.
- Gather cancellation produces one cancelled completion and no later update.
- Provider/gather failures preserve the current fallback result behavior, but
  terminalize the owning session exactly once.
- Sink errors terminalize only that session and are logged; they do not abort a
  different caller.
- `SearchSessionRegistry.destroy()` marks itself closed, aborts all live sessions,
  awaits their terminal promises with `Promise.allSettled`, then clears the map.
- `SearchEngineCore.destroy()` becomes awaitable and idempotent; callers that own
  teardown await it.

## Compatibility and Rollback

The registry and request-scoped pipeline are authoritative once introduced.
Renderer migration can temporarily roll back from typed stream to the
sender-scoped invoke facade without restoring global controller/current-window
behavior. No compatibility alias may reintroduce process-global cancellation or
cache session identity.

## Verification

Focused contracts must prove:

1. concurrent CoreBox and AI sessions both complete and AI produces no UI sends;
2. two renderer senders receive only their own updates/completion;
3. identical cache hits receive distinct ids and detached result objects;
4. stale, unknown, completed, and wrong-owner cancellation are no-ops;
5. an update emitted before initial resolution is delivered after the session and
   snapshot chunks, with no pending renderer map;
6. stream/unmount cancellation aborts only the owning gather promptly;
7. destroy aborts and awaits multiple live sessions;
8. existing gather FIFO/terminal ordering, ranking/provider routing, progressive
   refresh, selection preservation, and terminal no-result tests remain green;
9. scoped ESLint and CoreApp renderer/node type-checks pass;
10. a direct runtime smoke exercises simultaneous UI-stream and collecting AI
    searches and observes distinct terminal session ids.
