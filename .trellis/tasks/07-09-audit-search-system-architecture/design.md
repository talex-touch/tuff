# Technical Design

## Design Intent

The audit found split ownership rather than a missing architecture. This design
makes existing target abstractions authoritative in a sequence that limits
blast radius:

1. enforce the plugin trust boundary;
2. make search update ordering deterministic;
3. move request state out of the global search singleton;
4. centralize storage/onboarding readiness;
5. make `IndexingRuntime` the only semantic FTS mutation path;
6. consolidate provider lifecycle only after those ownership boundaries settle.

The parent task coordinates these changes. Each implementation child must be
independently testable and reversible.

## Architectural Invariants

- Privileged capability access is denied unless a typed permission mapping is
  both declared and enforced at the handler boundary.
- Remote content never shares a renderer with Node integration.
- A search request owns exactly one session; a session belongs to exactly one
  caller and delivery sink.
- Search updates are processed in emission order, and completion is terminal.
- Cache entries contain immutable result data, never live session identity or
  cancellation state.
- `IndexingRuntime` is the only semantic entry point for shared search-index
  mutations, and exactly one physical writer owns FTS writes and DDL.
- Unknown onboarding state is not equivalent to consent.
- Every timer, listener, stream, poller, worker, and provider has an awaited,
  idempotent owner-defined teardown path.

## Target Boundaries

```text
Plugin renderer
  -> typed PluginWindowCapabilityBroker
     -> permission guard
     -> URL/profile policy
     -> allowlisted window commands
     -> TouchWindow

CoreBox / ApplicationIndex renderer       AI agent / background caller
  -> typed search stream                  -> SearchService.execute(request)
  -> CoreBoxSearchFacade                     -> collecting sink
            \                              /
             -> SearchService / SearchPipeline
                -> SearchSessionRegistry
                -> request-scoped providers + gather + rank
                -> caller-owned SearchSink

IndexedSource scan/watch/reconcile/reset
  -> IndexingRuntime
  -> SearchIndexWriterAdapter
  -> one dedicated SearchIndex writer connection
  -> FTS tables

StorageModule readiness
  -> OnboardingGate
  -> CoreBoxSearchFacade / indexing startup / shortcut handling
```

## Plugin Window Boundary

Introduce a narrow broker around the existing `PluginEvents.window.*` handlers.
The broker is not a new transport layer; it is the policy owner used by the
existing typed handlers.

### Permission contract

- Map the real event names `window:new`, `window:visible`, and
  `window:property` to `window.create` or a narrower new permission where
  appropriate.
- Register all three handlers through the same permission-aware wrapper used by
  other privileged plugin APIs.
- Add an invariant test that enumerates privileged plugin events and fails when
  a handler has no enforced mapping.

### Content and profile policy

- `trusted-plugin-view` remains Node-disabled, context-isolated, sandboxed, and
  web-security enabled.
- Public creation accepts a closed plugin-window option subset and rejects
  caller-supplied preload/webPreferences, session/partition, kiosk/fullscreen,
  parent/modal, and unknown Electron options.
- A `compat-plugin-view` request may load only a canonical local file within the
  owning plugin root. Remote URLs are rejected under the recommended hard-cut
  policy.
- Remote plugin content, if later reintroduced, requires a separate
  Node-disabled profile, explicit origin allowlist, navigation policy, and a
  dedicated high-risk permission. It is not an exception to compatibility mode.
- `resolvePluginViewSecurityProfile()` returns the candidate profile as the
  effective profile for eligible plugins. Compatibility reasons remain logged
  and included in diagnostics.

### Window command contract

Replace arbitrary property maps with a discriminated command union, for
example `show`, `hide`, `focus`, `setBounds`, `setAlwaysOnTop`, `close`, and a
small reviewed set of WebContents operations. Validate arguments per command.
No string is used as a reflective member name.

The old SDK helper may translate its supported legacy shapes into commands for
one compatibility period, but unknown keys fail closed and are observable.

## Search Request and Session Model

### Request contract

The reusable search service accepts explicit caller context rather than reading
CoreBox globals:

```ts
interface SearchRequestContext {
  caller: {
    kind: 'core-box' | 'application-index' | 'division-box' | 'ai-agent' | 'system'
    id: string
    windowId?: number
  }
  activation?: SearchActivationContext
  sink: SearchSink
}
```

The query remains `TuffQuery`; UI activation and rendering concerns are passed
only by the UI facade.

### Session ownership

`SearchSessionRegistry` owns a map keyed by a newly generated `sessionId`.
Each `SearchSession` owns:

- `AbortController` and terminal state;
- caller/request identity;
- provider selection and activation snapshot;
- trace id and timestamps;
- immutable cache lookup/result association;
- ordered update queue;
- caller-owned `SearchSink`.

Session completion removes the map entry only after the ordered update queue
has drained. Cancelling an unknown, stale, or completed id is a no-op. Destroy
aborts and awaits every live session.

### Service/facade separation

- `SearchPipeline` performs provider selection from explicit inputs, gather,
  merge, rank, enrichment, trace, and result production. It has no window
  lookup and no mutable UI activation state.
- `CoreBoxSearchFacade` snapshots CoreBox activation, opens the renderer sink,
  and translates compatibility query/update/end traffic during migration.
- `AgentSearchFacade` supplies no CoreBox activation and uses a collecting sink;
  it never sends renderer updates.
- `ApplicationIndex` and DivisionBox use their own caller ids and stream/sink.

## Ordered Gather and Delivery

Keep the callback model for the first change because it is a smaller and more
testable migration than replacing gather with an async iterator.

- Change `TuffAggregatorCallback` to return `void | Promise<void>`.
- The gather controller maintains one promise chain and awaits every callback in
  emission order.
- Fast, deferred, late-fast, final, and cancellation updates all use the same
  serializer.
- Provider execution can remain concurrent; only mutation/delivery of aggregate
  state is serialized.
- Callback rejection terminates the gather operation, aborts remaining work,
  and rejects the controller promise. It must not be logged and ignored.
- The terminal callback is awaited before `controller.promise` resolves.

The session layer then serializes merge/rank/enrichment and sink delivery on top
of this contract. Both layers use terminal guards so stale queued work cannot
publish after cancellation.

## Search Stream Migration

Add a real typed stream event instead of changing the response type of the
existing request event in place:

```ts
type SearchStreamChunk =
  | { type: 'started'; sessionId: string }
  | { type: 'snapshot'; sessionId: string; result: TuffSearchResult }
  | { type: 'update'; sessionId: string; items: TuffItem[] }
  | { type: 'complete'; sessionId: string; result: TuffSearchResult; cancelled?: boolean }
```

- `CoreBoxEvents.search.stream` uses the existing `transport.stream()` /
  `onStream()` protocol and MessagePort policy.
- Extend `StreamContext` with an abort signal or cancellation subscription so a
  renderer `StreamController.cancel()` promptly aborts the owning
  `SearchSession`. The current polling-only `isCancelled()` contract is not
  sufficient for a slow provider.
- The initial snapshot is a stream chunk, eliminating the current race where an
  update/end can arrive before the invoke response establishes `currentSearchId`.
- During migration, the old query handler creates the same request-scoped
  session but uses a sender-scoped compatibility sink. It may send only to
  `context.sender`; it cannot broadcast or use `windowManager.current`.
- Migrate `useSearch` and `ApplicationIndex`, then remove their global
  update/end listeners. Remove the compatibility facade only after no caller
  uses the old event.

## Cache Semantics

Cache an immutable `SearchResultSnapshot` keyed by normalized query, inputs,
provider/config version, and activation scope where relevant. A hit creates a
new session, clones or safely shares immutable result data, records a cache-hit
trace, delivers through the new sink, and completes under the new session id.
The cache never stores controller, sink, caller, or session id.

## Storage and Onboarding Gate

`StorageModule` exposes a stable readiness object and promise:

```ts
type StorageReadiness =
  | { state: 'pending' }
  | { state: 'ready' }
  | { state: 'failed'; reason: string; recoverable: boolean }
```

- `waitUntilReady()` is single-flight and resolves to `ready` or `failed`; it
  does not require callers to catch a readiness exception.
- `OnboardingGate` reads the app setting only after storage is ready and returns
  `allowed`, `blocked`, or `degraded` with a reason.
- Search service registration can happen during module init, but provider
  loading, consent-sensitive scans, and maintenance start only after `allowed`.
- CoreBox shortcut handling shows the onboarding/recovery surface for `blocked`
  or `degraded`; it does not open the search surface.
- Recovery re-evaluates the gate and starts services once. Failure remains
  visible in diagnostics.

## Single Search-Index Writer

### Ownership

- `IndexingRuntime` remains the semantic coordinator and the only public owner
  of shared search-index mutation operations.
- Extract the generic capabilities already present in
  `SearchIndexWorkerClient` into a runtime-owned `SearchIndexWriter`. The writer
  owns one SQLite connection, write queue, FTS DDL readiness, and shutdown
  drain.
- `SearchIndexWriterAdapter` implements `IndexStoreAdapter` and maps batches and
  deltas into the writer. Read-only search can continue through the main
  `SearchIndexService` connection after schema readiness is established.

### Provider migration

- FileProvider may continue owning `files`, content, scan-progress, and other
  provider-local durable state. Its worker path stops mutating shared FTS and
  emits `IndexedSourceRecordBatch` / `IndexedSourceDelta` after the relevant
  provider-local commit.
- AppProvider stops direct `SearchIndexService.indexItems()` calls and emits the
  same runtime records/deltas it already constructs.
- Migration is source-scoped. A source uses either the legacy writer or the
  runtime writer for a mutation, never both. Temporary write-origin metrics and
  duplicate-id assertions prove parity before hard removal.

### Initialization and repair

- Both writer and reader use a single-flight readiness promise.
- Normal readiness checks validate the durable schema marker and never drop or
  recreate FTS.
- DDL, repair, and rebuild are explicit migration/maintenance operations owned
  by the writer, with preflight and rollback evidence.
- Database checkpoint code depends on the writer's drain/readiness interface,
  not on FileProvider worker internals.

## Provider Lifecycle and Control Plane

After request, storage, and index ownership are stable, define an executable
registry entry that combines:

- descriptor and user configuration;
- `ISearchProvider` or generic indexed-source query adapter;
- lifecycle state (`registered`, `loading`, `ready`, `degraded`, `stopped`);
- permission/admission decision and health;
- disposable scope for listeners, timers, polling jobs, streams, and workers.

Lifecycle methods are typed, async, and idempotent: `load`, `start`, `stop`, and
`destroy`. Search selects only `ready` entries. Load failures are retained as
degraded diagnostics but are not executed.

Do not split large coordinator files merely to reduce line count. Extract a
component only when the new ownership boundary is established and covered by
contract tests. Declared module dependency validation follows this lifecycle
work rather than preceding it.

## Compatibility and Rollout

### Security

The approved rollout is a hard safety cut for remote compatibility windows and
reflective commands. Keep diagnostics for blocked calls and publish the narrow
replacement command contract. Do not add a warning-only compatibility flag that
silently preserves the vulnerable default.

### Search

Use a request-scoped compatibility sink while migrating renderer callers. The
new session model is authoritative from the first search child; no old global
controller remains behind the adapter.

### Indexing

Migrate one source at a time behind source-scoped writer selection. Preserve
the legacy path as rollback code only until parity evidence passes. Rollback
switches one source back to its previous writer and requires a reconcile; it
does not enable both writers.

### Storage

Rollback may restore the previous UI flow, but it must not restore fail-open
consent behavior. A degraded gate is the minimum safe fallback.

## Operational Evidence

- Permission-denied and compatibility-profile reasons by plugin/event.
- Search live-session count, caller kind, cancellation reason, cache hit, first
  snapshot latency, completion latency, and dropped-stale-update count.
- FTS write origin, provider/source id, mutation kind, duplicate attempt,
  SQLite busy/retry, WAL/checkpoint, and writer queue drain time.
- Storage readiness duration/failure reason and onboarding-gate decision.
- Provider lifecycle transition and disposal leak counts.

Metrics must not include raw query text, sensitive file content, browser data,
or plugin payloads.

## Decisions and Trade-offs

- Promise-aware callbacks are selected before an async-iterator rewrite because
  they fix the verified ordering defect with a smaller contract change.
- A new stream event is selected instead of mutating the current invoke event so
  compatibility can be removed deliberately and callers can migrate one at a
  time.
- A dedicated writer is selected over main/worker dual scheduling because it
  provides one queue, one DDL owner, and a clear checkpoint contract. Provider
  local tables remain provider-owned.
- Provider registry consolidation is delayed until session and index ownership
  are stable; otherwise the registry would merely wrap conflicting behavior.

## Resolved Decision

D1 was approved on 2026-07-09: compatibility-profile windows reject remote
URLs, non-allowlisted window commands fail closed, and eligible plugins use the
hardened profile. Unknown third-party compatibility does not override this
trust-boundary invariant.
