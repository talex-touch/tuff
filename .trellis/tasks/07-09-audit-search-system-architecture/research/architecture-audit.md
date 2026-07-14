# Search and System Architecture Audit

Date: 2026-07-09

## Executive Summary

The repository has a sound target direction: typed transport, explicit module
lifecycle, provider descriptors, an indexing runtime, SQLite/FTS diagnostics,
and hardened Electron window profiles all exist. The main problem is that
several of those target abstractions are not yet the runtime source of truth.
Compatibility paths remain active beside the new paths, which creates split
ownership and makes the system look safer or more unified than it is.

The highest-priority issue is outside search: every window created through the
public plugin window API is still forced onto the fully privileged compatibility
profile, even when it is classified as a trusted candidate. The API accepts
arbitrary URLs, the handler is not protected by the declared `window.create`
permission, and the property API reflectively invokes arbitrary `BrowserWindow`
/ `WebContents` members. This should be treated as a release-blocking
trust-boundary problem.

Within search, the highest risks are:

1. `SearchEngineCore` is a global UI-coupled singleton used by both CoreBox and
   AI agents, so callers cancel and influence each other.
2. the gather callback contract is synchronous while the consumer is async,
   so final/end events can overtake result processing;
3. File/App providers still write the same FTS data before emitting batches or
   deltas that `IndexingRuntime` writes again;
4. onboarding and CoreBox visibility fail open when storage is unavailable.

No P0 data-loss defect was reproduced. The P0 finding is a code-confirmed
security boundary, while the P1 search findings are code-confirmed concurrency,
privacy, and ownership defects whose user-visible frequency still needs
packaged runtime measurement.

## Current Architecture Map

### Repository and process boundaries

- `apps/core-app`: Electron application, containing main, preload, renderer,
  modules, plugin runtime, local SQLite, search, and indexing.
- `apps/nexus`: Nuxt ecosystem/documentation application.
- `packages/utils`: shared transport, plugin SDK, search/indexing contracts,
  permission definitions, and common runtime utilities.
- `packages/tuffex` and other packages: shared UI/business/native/intelligence
  packages.
- `plugins/*`: first-party plugins loaded by CoreApp through the plugin runtime.

The CoreApp main process loads a positional list of foreground modules, then a
small deferred list in `apps/core-app/src/main/index.ts:164`. `CoreBoxModule`
loads `SearchEngineCore` as a nested module in
`apps/core-app/src/main/modules/box-tool/core-box/index.ts:58`.

### Search read path

```text
CoreBox renderer useSearch
  -> typed transport send(CoreBoxEvents.search.query)
  -> CoreBox main handler / CoreBoxManager
  -> SearchEngineCore.search()
  -> hard-coded ISearchProvider map
  -> gather fast/deferred providers
  -> merge, rank, usage/completion enrichment
  -> initial invoke response
  -> global search.update / search.end pushes to windowManager.current
```

The AI search agent bypasses the renderer/IPC entry and calls the same singleton
`SearchEngineCore.search()` directly. App and File providers query the shared
`SearchIndexService`; native platform providers and plugin feature adapters
return additional candidates.

### Search write path

The intended path is:

```text
IndexedSource scan/watch/reconcile
  -> IndexingRuntime
  -> ScanScheduler / WatchEventRouter / ReconcileEngine
  -> SearchIndexStoreAdapter
  -> main SearchIndexService
  -> search_index FTS5 + keyword mappings
```

The active compatibility paths are still:

```text
FileProvider
  -> file/index/search workers
  -> a second SQLite connection
  -> worker-local SearchIndexService(directMode)
  -> the same FTS tables

AppProvider
  -> direct SearchIndexService.indexItems()
  -> the same FTS tables
```

Both providers then emit runtime batches/deltas, so the intended and legacy
paths overlap.

### Configuration and diagnostics path

Settings builds a provider registry from indexed-source diagnostics plus plugin
manifest descriptors. Search execution, however, remains a separate hard-coded
provider map. User config is consumed by both planes in different ways, but the
registry is not an executable provider registry and there is no generic indexed
source query adapter.

## Findings

### P0 - Plugin window isolation and permission boundaries are effectively open

**Classification:** code-confirmed security boundary; exploitability depends on
an installed plugin opening local or remote content.

Evidence:

- `resolvePluginViewSecurityProfile()` always returns
  `effectiveProfile: 'compat-plugin-view'`, even for `trusted-candidate` at
  `apps/core-app/src/main/modules/plugin/runtime/plugin-view-security-profile.ts:35`.
- The compatibility profile sets `webSecurity=false`, `nodeIntegration=true`,
  `nodeIntegrationInSubFrames=true`, `contextIsolation=false`, `sandbox=false`,
  and `webviewTag=true` at
  `apps/core-app/src/main/core/window-security-profile.ts:35`.
- `PluginEvents.window.new` accepts either a local file or arbitrary URL and
  directly calls `loadURL()` at
  `apps/core-app/src/main/modules/plugin/plugin-module.ts:2070` and
  `apps/core-app/src/main/modules/plugin/plugin-module.ts:2113`.
- The public SDK explicitly accepts `{ url }` at
  `packages/utils/plugin/sdk/window/index.ts:11`.
- The same SDK accepts the full `BrowserWindowConstructorOptions`, and the main
  handler spreads caller options into `TouchWindow` while accepting a
  caller-supplied preload when the plugin has no manifest preload at
  `packages/utils/plugin/sdk/window/index.ts:11` and
  `apps/core-app/src/main/modules/plugin/plugin-module.ts:2079`.
- The permission map protects `window:create`, not the actual `window:new`
  event, and the handler is registered directly without `withPermission()`:
  `apps/core-app/src/main/modules/permission/permission-guard.ts:95` and
  `apps/core-app/src/main/modules/plugin/plugin-module.ts:2070`.
- `window.property` reflectively assigns properties or invokes any named
  `BrowserWindow` / `WebContents` function at
  `apps/core-app/src/main/modules/plugin/plugin-module.ts:2200`.

Impact:

- Remote content or a local plugin-view XSS can execute with Node privileges.
- The intended trusted-profile migration provides observation metadata but no
  protection at runtime.
- The permission registry creates a false assurance because enforcement is
  opt-in at each handler and event names can drift from mapping names.
- Reflective window mutation remains a capability bypass even after the window
  profile is hardened unless it is replaced by an allowlisted API.
- Unreviewed window options provide a second policy surface for preload,
  session/partition, kiosk/fullscreen, parent/modal, and other Electron behavior.

Recommended action:

1. Block remote URL loading under the compatibility profile immediately, or
   require an explicit high-risk permission and origin allowlist.
2. Make `candidateProfile` the effective profile for eligible plugins and keep
   compatibility as an explicit, audited exception.
3. Register `window:new`, `window:visible`, and `window:property` through typed
   permission-aware handlers; align event identity with permission mappings.
4. Replace full BrowserWindow options with a validated plugin-window option
   allowlist and reject caller-supplied preload/webPreferences.
5. Replace reflective property application with a narrow command allowlist.
6. Add a transport-level invariant test proving every privileged plugin event
   declares and enforces a permission.

### P1 - Search sessions are global, UI-coupled, and unsafe for multiple callers

**Classification:** code-confirmed concurrency and isolation defect.

Evidence:

- The singleton holds one `activatedProviders`, one
  `currentGatherController`, one `latestSessionId`, and one `lastSearchQuery` at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:152`.
- Every non-cached search aborts the currently running gather operation without
  checking the caller at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1297`.
- Incremental updates and completion are always sent to
  `windowManager.current`, not to the request origin, at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1507`
  and `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1674`.
- The AI search agent calls the same singleton directly at
  `apps/core-app/src/main/modules/ai/agents/builtin/search-agent.ts:209` and
  `apps/core-app/src/main/modules/ai/agents/builtin/search-agent.ts:253`.
- Active provider selection reads global CoreBox activation state at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:676`.
- The query event advertises MessagePort streaming, but the renderer uses a
  normal request plus separate global update/end channels:
  `packages/utils/transport/events/index.ts:1133` and
  `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts:852`.

Failure modes:

- An AI query cancels an in-flight CoreBox query, or typing in CoreBox cancels
  an AI tool call.
- AI searches can inherit an activated UI provider and receive an incomplete
  result set.
- An AI-triggered search can push incremental results/end state into the
  visible CoreBox window.
- DivisionBox, ApplicationIndex, future multi-window search, and background
  agents cannot own independent sessions.

Recommended action:

Introduce a request-scoped `SearchSession` keyed by caller/request identity.
The session must own controller, activation context, cache identity, trace, and
stream sink. Return updates through the declared request stream rather than
`windowManager.current`. Keep a separate UI search facade only for UI-specific
activation behavior.

### P1 - Async result processing can be overtaken by `search.end`

**Classification:** code-confirmed ordering race; not reproduced in a packaged
runtime during this audit.

Evidence:

- `TuffAggregatorCallback` returns `void` at
  `packages/utils/common/search/gather.ts:51`.
- The gather implementation calls `onUpdate()` without awaiting it for fast,
  deferred, late-fast, and final updates, for example at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts:232`
  and `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts:301`.
- `SearchEngineCore` passes an `async` callback at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1525`;
  that callback awaits merge/ranking before sending an update at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1790`.
- The final callback clears the controller and sends `search.end` at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1674`.
- The existing late-fast test verifies three synchronous callback invocations,
  but does not use an async consumer:
  `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.test.ts:56`.
- Renderer `applySearchEnd()` sets loading false immediately at
  `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts:1367`.

Impact:

- `search.end` may arrive before the final ranked `search.update`.
- Loading can stop before results settle, activation state can be finalized
  early, and the controller can be cleared while callback work is still active.
- The initial invoke response can race with a final empty update when the first
  merge/rank is slow.

Recommended action:

Change the callback contract to `void | Promise<void>` and serialize updates,
or replace callbacks with an `AsyncIterable<TuffUpdate>`. Add a test with a
deliberately delayed async consumer that asserts strict update/end ordering and
abort behavior.

### P1 - Indexing has dual ownership and duplicate writes

**Classification:** code-confirmed architecture defect; contention and duplicate
work frequency require runtime metrics.

Evidence:

- `SearchEngineCore` installs `SearchIndexStoreAdapter` over the main
  `SearchIndexService` at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:2528`.
- The runtime applies every scan batch through the adapter at
  `apps/core-app/src/main/modules/box-tool/search-engine/indexing-scan-scheduler.ts:80`,
  and watch deltas at
  `apps/core-app/src/main/modules/box-tool/search-engine/indexing-watch-router.ts:124`.
- The adapter calls `SearchIndexService.indexItems()` at
  `apps/core-app/src/main/modules/box-tool/search-engine/indexing-store-adapter.ts:169`.
- File full scan persists records and dispatches legacy indexing side effects
  before emitting the same record batch at
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:762`.
- File scan waits for its worker FTS drain, then returns the batches to the
  runtime at
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:1415`.
- File watch handling enqueues the legacy incremental path and returns a runtime
  delta for the same event at
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:1476`.
- The worker opens another connection to the same SQLite file and creates a
  direct-mode `SearchIndexService` at
  `apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker.ts:293`.
- AppProvider directly writes search keywords at
  `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:2151`, then
  returns scan/watch records to the runtime at
  `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:647` and
  `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:695`.
- The database module must query FileProvider worker state before WAL
  checkpoints at `apps/core-app/src/main/modules/database/index.ts:270`, which
  is a dependency inversion from storage infrastructure back into a feature
  provider.
- The architecture plan explicitly says FileProvider internal writes still
  need migration at
  `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md:335` and
  `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md:412`.

Impact:

- Duplicate FTS inserts/deletes and redundant CPU/IO.
- Two independent write schedulers/connections contend on one WAL database.
- Diagnostics can report a second delete as `missing-indexed-item` after the
  legacy path already removed it.
- Retry, rollback, rebuild, and task completion semantics have no single owner.

Recommended action:

Choose one durable write owner. The lowest-risk migration is to make provider
scanners emit records only, keep one worker-backed store adapter as the sole
writer, then remove provider-local FTS writes source by source. Add a temporary
write-origin metric and provider/item idempotency assertion before deleting the
legacy paths.

### P1 - Storage and onboarding gates fail open

**Classification:** code-confirmed privacy and first-run contract violation.

Evidence:

- Search treats a storage read failure as completed onboarding at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:450`.
- CoreBox shortcut handling explicitly allows the window to open when the same
  check fails at
  `apps/core-app/src/main/modules/box-tool/core-box/index.ts:84`.
- Storage exposes readiness by throwing until `filePath` exists at
  `apps/core-app/src/main/modules/storage/index.ts:784`; consumers independently
  decide whether to fail open or closed.

Impact:

- Provider loading and indexing can start before consent/first-run state is
  known.
- CoreBox can appear during an unhydrated or corrupt first-run state.
- High-privacy source policy relies on each caller implementing the same gate
  correctly.

Recommended action:

Expose a single awaited storage hydration primitive with explicit states such
as `pending`, `ready`, and `failed`. Onboarding-dependent UI and indexing must
fail closed until `ready`; a failure should surface a degraded reason and
recovery action instead of fabricating initialized settings.

### P2 - Provider registry, indexed sources, and executable providers are separate planes

**Classification:** code-confirmed architecture gap; several incomplete sources
are intentionally documented as skeletons.

Evidence:

- Settings converts every indexed source into a provider descriptor and merges
  plugin descriptors at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-provider-registry.ts:92`.
- Search execution uses a separate hard-coded provider map registered at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:428`.
- User config filters that map by matching provider id at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:233`.
- Production `SearchIndexService.search()` calls are limited to App/File
  provider implementations; there is no generic query provider for indexed
  sources such as Quicklinks or Browser Bookmarks.
- Quicklinks and Browser Bookmarks can emit records into the index, but their
  runtime source contracts are not `ISearchProvider` implementations:
  `apps/core-app/src/main/modules/box-tool/search-engine/quicklinks-indexed-source.ts:250`
  and
  `apps/core-app/src/main/modules/box-tool/search-engine/browser-bookmarks-indexed-source.ts:245`.
- The plan calls these sources skeletons and records incomplete persistent
  feeds/lifecycle at
  `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md:167` and
  `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md:333`.

Impact:

- Settings can describe an indexed provider/source that is not independently
  queryable by SearchEngineCore.
- Enabling, ordering, diagnostics, indexing, root-result push, and pull search
  do not share one lifecycle or health model.
- Provider ids and source ids must line up by convention rather than a runtime
  registration invariant.

Recommended action:

Define one executable registry entry that links descriptor, source, query
adapter, lifecycle state, permission decision, and health. A generic
`IndexedSourceSearchProvider` can query FTS by source id while push-only plugins
remain explicit push providers.

### P2 - Provider load and teardown lifecycle is incomplete

**Classification:** code-confirmed lifecycle defect.

Evidence:

- Provider load errors are caught and logged, but the provider remains in the
  active map and the engine still logs all providers loaded successfully at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:491` and
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:572`.
- `ISearchProvider` has no typed `onDestroy` contract at
  `packages/utils/core-box/tuff/tuff-dsl.ts:1524`.
- SearchCore detects `onDestroy` dynamically and does not await it at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:2725`.
- AppProvider registers polling jobs and several untracked timers, while its
  async `onDestroy()` only logs:
  `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:450`,
  `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:553`, and
  `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts:1968`.
- FileProvider owns multiple worker clients and background tasks but has no
  `onDestroy` or `onDeactivate` implementation at
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:397`.
- SearchCore registers transport and `ALL_MODULES_LOADED` listeners without
  storing disposers at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:2561`.
- The singleton instance is never reset after destroy.

Impact:

- A failed provider is silently searchable but usually returns empty/error
  behavior without a stable degraded state.
- Module unload/reload can duplicate handlers and leave polling/background work
  alive.
- Shutdown does not guarantee worker drain, queue flush, or provider cleanup.

Recommended action:

Add a typed async provider lifecycle (`load`, `start`, `stop`, `destroy`) and a
provider state registry. Track every timer, polling registration, listener, and
worker under a disposable scope. Make `SearchEngineCore.destroy()` async and
idempotent, and add unload/reload tests.

### P2 - Cache and cancellation do not preserve session identity

**Classification:** code-confirmed API defect with limited current exposure.

Evidence:

- Cache lookup occurs before aborting the active gather and returns the cached
  result with its previous session id at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1222`.
- A cache hit therefore does not terminate or supersede the current search.
- `cancelSearch(searchId)` aborts whichever global controller is current without
  verifying the id at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:812`.
- The renderer currently does not invoke the cancel event, so the incorrect API
  is mostly dormant.

Impact:

- Same-query cache hits can reuse a session id while older async enrichment or
  pushes still exist.
- Cancelling a stale id can cancel a newer query.
- Trace semantics record a new logical request using an old result identity.

Recommended action:

Create a new session id for every request, even on cache hits. Cache immutable
candidate/result data, not a live session envelope. Cancellation must address a
session map and be a no-op for unknown or completed ids.

### P2 - Search index initialization and repair are not single-flight

**Classification:** code-confirmed race risk; no destructive race was reproduced.

Evidence:

- `SearchIndexService` tracks only an `initialized` boolean, not an init promise,
  at `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:118`.
- Multiple read/write methods call `ensureInitialized()` and can enter it before
  the boolean flips at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:696`.
- Warmup is fire-and-forget in SearchCore at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:2528`.
- Initialization can drop/recreate `search_index` when the content column is
  missing or metadata reads fail at
  `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:710`
  and `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:735`.
- Main and worker processes each own a `SearchIndexService` instance.

Impact:

- Concurrent startup calls can duplicate DDL and repair work.
- Main/worker initialization can race around a destructive FTS rebuild.
- A transient metadata error may trigger runtime repair outside the approved
  migration/evidence flow.

Recommended action:

Use a single-flight init promise and separate non-destructive readiness checks
from explicit repair/migration commands. Only one process should own FTS DDL;
other connections should wait for a durable schema version/readiness marker.

### P2 - System composition relies on implicit order and oversized coordinators

**Classification:** maintainability and change-risk finding.

Evidence:

- Main startup dependencies are encoded by comments and array position at
  `apps/core-app/src/main/index.ts:164`, not declared dependencies checked by
  `ModuleManager`.
- SearchCore is 2,744 lines and owns transport, provider registry, UI delivery,
  activation, cache, ranking, telemetry, recommendation, usage, indexing
  runtime, onboarding, and maintenance.
- FileProvider is 4,045 lines and AppProvider is 4,007 lines despite service
  extraction; both still coordinate persistence, workers, scheduling,
  diagnostics, and source lifecycle.
- Main imports renderer locale JSON and a renderer SVG at
  `apps/core-app/src/main/utils/i18n-helper.ts:8` and
  `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:77`.

Impact:

- Moving a module in the startup list can silently violate readiness
  assumptions.
- Ownership changes require edits across large coordinators and are difficult
  to test in isolation.
- Main bundling depends on renderer source layout and loader behavior.

Recommended action:

Add declared module dependencies/readiness contracts and validate the startup
graph. Split SearchCore around session orchestration, provider registry,
ranking, and delivery. Complete File/App write ownership migration before more
service extraction. Move shared locales/assets to a process-neutral package.

## Observability and Validation Gaps

- No test runs CoreBox and AI search concurrently against one engine instance.
- No test uses an async gather update consumer or asserts update/end ordering.
- No invariant test proves one FTS write per provider/item mutation.
- No lifecycle test unloads and reloads SearchEngineCore with real timers,
  polling registrations, and worker clients.
- No permission-contract test matches every privileged transport event to an
  enforced permission.
- Current R3 evidence remains `active / partial` at approximately 74%; real
  profile migration and packaged cold-start evidence remain open in
  `docs/engineering/reports/r3-indexing-runtime-2026-06-25/README.md:7`.

## Recommended Remediation Order

### Phase 0 - Security containment

1. Deny remote content in compatibility plugin windows.
2. Enforce `window.create` on the actual plugin window events.
3. Remove reflective window/WebContents invocation.
4. Activate trusted profiles for eligible plugins and inventory remaining
   compatibility consumers.

### Phase 1 - Search session correctness

1. Introduce request-scoped sessions and per-request streaming.
2. Serialize async gather updates and completion.
3. Give cache hits new request/session identities.
4. Add concurrent UI/AI and ordering regression tests.

### Phase 2 - Persistence ownership

1. Instrument write origin and duplicate mutations.
2. Make one worker-backed store the only FTS writer.
3. Remove FileProvider duplicate scan/watch writes.
4. Remove AppProvider direct FTS writes.
5. Move FTS DDL/repair to one durable migration owner.

### Phase 3 - Lifecycle and control plane

1. Add typed async provider lifecycle and disposal scopes.
2. Make provider registry entries executable and health-aware.
3. Replace storage fail-open logic with awaited hydration state.
4. Add module dependency declarations and boundary packages.

### Phase 4 - Production proof

1. Run concurrent search stress with CoreBox, AI agent, and multiple windows.
2. Collect SQLite write-origin, busy retry, WAL, and duplicate-write metrics.
3. Complete real-profile R3 preflight/simulation/approved migration evidence.
4. Re-run packaged cold-start and natural Settings diagnostics evidence.

## Verification Performed

The audit did not modify product source code. The following focused suites
passed:

- Search/indexing/CoreBox: 7 files, 105 tests.
- Plugin window security/permission: 3 files, 17 tests.
- Total: 10 files, 122 tests.

Passing tests do not invalidate the findings. Several tests explicitly encode
the compatibility behavior, while the missing concurrency, async ordering,
dual-write, and lifecycle scenarios are not covered.

## Confidence Labels

- **Code-confirmed:** P0 plugin boundary; P1 global session; P1 async callback
  contract; P1 dual write; P1 fail-open gate; P2 registry split; P2 lifecycle;
  P2 cache/cancel identity.
- **High-confidence risk requiring runtime measurement:** frequency and latency
  impact of duplicate writes; FTS init/repair race; shutdown leak impact.
- **Open production unknowns:** real-profile migration state, packaged cold-start
  stability, and natural user-profile indexing diagnostics, as already recorded
  by the R3 evidence packet.
