# Index-Commit Refresh Contracts (main ↔ renderer)

Source: task `09-26-corebox-refresh-churn` (2026-09-26). With a query open, CoreBox re-ran its whole
search every 0.6–1.6s for as long as an index built: every index commit reached the renderer, and the
renderer re-searched 500ms after each one with no backoff (the task's `research/root-cause.md` §1).
These contracts pace that path end to end, and take the indexing work that shared the read worker
with search off it.

```
SourceScopedIndexWriterRouter.publishCommit      (search-index-writer.ts, after the visibility barrier)
  → SearchIndexCommitHub.markCommitted            revision++ on every commit: cache correctness
  → SearchEngineCore.handleSearchIndexCommit      recommendation invalidation, per commit
  → SearchIndexCommitCoalescer, one per stream    Scenario 1: the notification is paced
  → core-box:search:index-committed               stream, MessagePort by default
  → useSearch scheduleIndexCommitRefresh          Scenario 2: backoff, hidden hold, reconcile
```

Commits keep coming during a build from full-scan batches (resumable since search-hotpath §9),
enrichment flushes (Scenario 6) and accepted watch deltas. Scenarios 3 and 4 remove the app-health
read every watcher event bought on the read worker; Scenario 5 is the Spotlight half of the same
report (build output in the list).

Not repeated here: the read worker and its lanes ([search-hotpath-contracts.md](search-hotpath-contracts.md)
§4, §7), bulk-delete cost (§8) and the read-time directory rules (§10); stream delivery
([channel-transport-contracts.md](channel-transport-contracts.md)); watch admission freshness
([background-task-timeout-contracts.md](background-task-timeout-contracts.md), "Index watch and
shutdown lifecycle").

Path prefixes: `utils/` = `packages/utils/`, `main/` = `apps/core-app/src/main/`, `search-engine/` =
`main/modules/box-tool/search-engine/`, `addon/` = `main/modules/box-tool/addon/`, `renderer/` =
`apps/core-app/src/renderer/src/`.

## Scenario: Index-commit notifications are paced per renderer stream (M1)

### 1. Scope / Trigger

- Changing `search-engine/search-index-commit-coalescer.ts` or
  `search-engine/leading-trailing-throttle.ts`; `SearchEngineCore`'s
  `registerIndexCommitStream`, `emitIndexCommit`, `handleSearchIndexCommit`,
  `refreshRecommendationGrid`, `invalidateAppRecommendationPresentation` or `destroy`
  (`search-engine/search-core.ts`);
  `CoreBoxSearchIndexCommitPayload` (`utils/transport/events/types/core-box.ts`); or anything that
  pushes to `CoreBoxEvents.search.indexCommitted` (registered in `main/modules/box-tool/core-box/ipc.ts`).
- Cross-layer: main runs two clocks. The hub revision is cache correctness and moves on every commit;
  the renderer notification triggers a UI refresh and is paced. A scan commits every ~300ms (each
  batch, each enrichment flush), and every notification makes an open non-empty query re-run in full.

### 2. Signatures

```ts
// search-engine/search-index-commit-coalescer.ts
export const INDEX_COMMIT_NOTIFY_WINDOW_MS = 1_000
export const INDEX_COMMIT_NOTIFY_BULK_WINDOW_MS = 3_000 // D-a
export const INDEX_COMMIT_DENSE_LOOKBACK_MS = 5_000
export const INDEX_COMMIT_DENSE_THRESHOLD = 3 // commits inside the lookback, the opener included

export interface SearchIndexCommitCoalescerOptions {
  emit: (payload: CoreBoxSearchIndexCommitPayload) => void
  isBulkIndexing?: () => boolean // advisory; a throw counts as false
  onEmitError?: (error: unknown) => void
  // optional overrides: now, windowMs, bulkWindowMs, denseLookbackMs, denseThreshold
}

export class SearchIndexCommitCoalescer {
  constructor(options: SearchIndexCommitCoalescerOptions)
  push(payload: CoreBoxSearchIndexCommitPayload): void
  dispose(): void // drops the open window and its payload; later pushes are ignored
}

export function mergeIndexCommitPayloads(
  previous: CoreBoxSearchIndexCommitPayload,
  next: CoreBoxSearchIndexCommitPayload
): CoreBoxSearchIndexCommitPayload

// utils/transport/events/types/core-box.ts
export interface CoreBoxSearchIndexCommitPayload {
  revision: number
  providerIds: string[]
  sourceGenerations: Record<string, number>
  committedAt: number
  recommendationsInvalidated?: boolean
  bulk?: boolean // only on a notification flushed from a bulk window
}

// search-engine/leading-trailing-throttle.ts
export class LeadingTrailingThrottle {
  constructor(options: { intervalMs: number; onTrailing: () => void; onError?: (error: unknown) => void })
  trigger(): boolean // true: the leading edge, act now; false: held for the trailing run
  dispose(): void // clears the timer and what it held; later triggers return false
}

// search-engine/search-core.ts
private readonly indexCommitStreams: Map<
  StreamContext<CoreBoxSearchIndexCommitPayload>,
  SearchIndexCommitCoalescer
>
private readonly fileCommitInvalidation: LeadingTrailingThrottle // FILE_COMMIT_INVALIDATION_INTERVAL_MS = 60_000
private refreshRecommendationGrid(): void // drop the ranking cache, push { providerIds: [], recommendationsInvalidated: true }
```

### 3. Contracts

- **Only the notification is paced.** `markCommitted` still increments the revision synchronously,
  and `handleSearchIndexCommit` still runs per commit: an app commit drops the recommendation cache, a
  file commit through `fileCommitInvalidation` (below), at most once per
  `FILE_COMMIT_INVALIDATION_INTERVAL_MS` (60s). `cacheSearchResult`
  refuses a result whose revision the hub has passed, and a lookup against an older revision
  classifies as `revision-mismatch`. The coalescer sits after all of that, inside `emitIndexCommit`.
  Pacing the hub or `publishCommit` instead would serve cached results a commit made stale.
- **A cached hit re-checks index-owned files on disk.** The cache-hit branch drops any
  `file-provider` item whose `meta.file.path` no longer exists (`dropMissingIndexedFiles`, the same
  `normalizeResultFilePath` test the provider applies on a fresh search). A deleted directory tree
  leaves the index through a subtree reconcile that yields to foreground search, so its commit can
  trail the deletion by seconds; the revision alone would serve the deleted files until the 5s TTL.
  Other sources (Spotlight, Everything) are returned as cached.
- **The window opens on the first commit and is not extended.** `push` merges into the pending
  payload and arms a timer only when none is open. A steady stream yields one notification per
  window; a debounce would starve a scan that commits for hours.
- **The window length is fixed when it opens.** Bulk (3s) when `recentCommitAt` holds ≥ 3 commits
  inside the 5s lookback, the opener included, or else when `isBulkIndexing()` is true; otherwise 1s.
  Density is checked first, so the probe runs only while commits are sparse. At most
  `denseThreshold` timestamps are kept.
- **`bulk: true` only on a flush from a bulk window** (`{ ...payload, bulk: true }`). An ordinary
  flush is the merged payload with no `bulk` key, the exact shape from before coalescing. The
  renderer reads `payload?.bulk === true`, so an older main reads as not bulk.
- **Merge** (`mergeIndexCommitPayloads`): max `revision` and `committedAt`; sorted union of
  `providerIds`; per-source max of `sourceGenerations`; `recommendationsInvalidated` is the OR of both
  and stays absent when neither carried it. A flush stands for every commit since the previous one,
  and a grid-relevant commit is never lost to a later plain one.
- **One coalescer per stream**, created by `registerIndexCommitStream` (nothing if the context is
  already aborted):
  - `emit` → `context.emit(payload)`; a cancelled context is released instead.
  - `isBulkIndexing: () => fileProvider.getIndexingStatus().isInitializing` (a file indexing run is
    in flight).
  - `onEmitError` → `searchEngineLog.warn('Index commit notification failed', { error })`. The flush
    runs on an `unref`'d timer, where nothing else would catch a throw.
- **Release.** The context's abort signal, and any `emitIndexCommit` pass that finds it cancelled,
  call `releaseIndexCommitStream` (dispose, delete). `destroy()` unsubscribes from the hub, disposes
  every coalescer, ends every live context and clears the map. A dropped pending notification is
  harmless: the renderer re-runs its query when it reconnects or is shown.
- `invalidateAppRecommendationPresentation()` (hydrated app icons) calls
  `recommendationEngine.invalidateCache()` at once and pushes `{ revision: <current>, providerIds: [],
sourceGenerations: {}, recommendationsInvalidated: true }` through the same coalescer; the revision
  does not move.
- A new payload field stays optional and additive, and `mergeIndexCommitPayloads` must say how it
  folds.
- **A file commit the throttle holds back is answered, not dropped (2026-10-30).** The throttle used
  to keep only its leading edge, so a file indexed 10s after an invalidation stayed out of the
  empty-query grid until some later commit landed past the 60s mark. `LeadingTrailingThrottle`
  lets the first commit of a window invalidate inline (`trigger()` is true, the payload carries
  `recommendationsInvalidated: true`); a commit inside the window returns false (the payload says
  `false`) and marks the window held. When a window closes with anything held,
  `refreshRecommendationGrid()` runs once, however many commits it held, and the next window opens,
  so a steady stream still costs one ranking recompute per 60s. A window that held nothing closes
  quietly and the next file commit is a leading edge again.
- **The trailing refresh is a real notification.** `refreshRecommendationGrid()` is the body of
  `invalidateAppRecommendationPresentation()`: drop the ranking cache, then push
  `{ revision: <current>, providerIds: [], sourceGenerations: {}, recommendationsInvalidated: true }`
  through the per-stream coalescers. Dropping the cache alone would leave an open CoreBox on the
  empty query showing the stale grid. App commits never go through the throttle.
- **The throttle's timer is `unref`'d and owned by the engine.** `destroy()` disposes it first, so
  no refresh runs against a half-torn-down engine; a throw from the trailing refresh is caught and
  logged (`Trailing recommendation invalidation failed`), because the timer callback is where
  nothing else would catch it.

### 4. Validation & Error Matrix

| Condition                                  | Required outcome                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| One commit, no scan                        | One notification after 1s, equal to the pushed payload (no `bulk` key)                                                        |
| 100 commits, one per 100ms                 | 1–4 notifications; revisions strictly increase; the last carries revision 100; the first has no `bulk`, the rest `bulk: true` |
| Commits every 200ms for 1s                 | One notification at 1s, carrying the 5th revision                                                                             |
| First commit while `isInitializing`        | Nothing at 1s; one `bulk: true` notification at 3s                                                                            |
| Commits resume after a gap of more than 5s | 1s window, no `bulk` key                                                                                                      |
| `isBulkIndexing` throws                    | Not bulk; the notification still goes out                                                                                     |
| `emit` throws                              | `onEmitError(error)`; nothing escapes the timer                                                                               |
| Renderer closes the stream mid-window      | Pending notification dropped; coalescer disposed                                                                              |
| `dispose()`                                | Timer cleared; later pushes ignored                                                                                           |
| Any commit                                 | `searchIndexCommitHub.getRevision()` has moved before the push returns                                                        |
| File commit 10s after an invalidation      | Held, not dropped: one `refreshRecommendationGrid()` at 60s, pushing `recommendationsInvalidated: true`                       |
| Commits every 1s for 300s                  | 6 invalidations (t = 0, 60 … 300): one per window, the last of them a trailing run                                            |
| Window closes with nothing held            | No trailing run; the next file commit is a leading edge again                                                                 |
| Trailing refresh throws                    | `Trailing recommendation invalidation failed` is logged; the next window is still paced                                       |
| `destroy()` with a commit held             | Throttle disposed first; no trailing refresh runs                                                                             |

### 5. Good / Base / Bad Cases

- Good: a full scan committing every ~300ms yields one `bulk: true` notification per 3s per open
  CoreBox, and every commit still invalidates cached searches.
- Base: saving one file yields one ordinary notification about 1s later, in the pre-coalescing shape.
- Base: a screenshot saved 10s after the previous ranking invalidation reaches the empty-query grid when
  that window closes, 50s later, and costs one recompute.
- Bad: throttling `markCommitted`; a trailing debounce; one coalescer shared by every stream (closing
  one stream drops another's notification); deriving `bulk` in the renderer from arrival rate; a
  file-commit invalidation throttle that keeps only its leading edge (a commit inside the window is
  never answered).

### 6. Tests Required

- `search-engine/search-index-commit-coalescer.test.ts` (fake timers): a lone commit passes through
  unchanged at exactly `INDEX_COMMIT_NOTIFY_WINDOW_MS`; 100 commits in 10s fold into 1–4
  notifications with the properties in the matrix; a 200ms stream is not postponed; the bulk probe
  opens a 3s window; back to 1s after a quiet gap; a throwing probe and a throwing emit; `dispose()`
  leaves `vi.getTimerCount() === 0`; the merge keeps the newest revision, commit time and
  generations, ORs the recommendation flag and never invents it.
- `search-engine/search-core.contracts.test.ts`: "folds a commit storm into a bounded number of
  stream notifications while the revision moves on every commit" (asserts the hub revision after
  each `markCommitted`); "widens the very first window while a full file scan is running"; "drops
  the pending notification of a stream the renderer closed"; "coalesces a storm of file commits into
  one ranking invalidation". The recommendation-flag and icon-presentation cases advance
  `INDEX_COMMIT_NOTIFY_WINDOW_MS` before asserting.
- `search-engine/leading-trailing-throttle.test.ts` (fake timers): the first trigger is the leading
  edge and schedules nothing else; a trigger inside the window runs once at the window's end; a burst
  folds into one run; the trailing run opens a window (300 triggers over 300s give 1 leading + 5
  trailing); a quiet window makes the next trigger a leading edge; `dispose()` leaves
  `vi.getTimerCount() === 0` and later triggers return false; the timer is `unref`'d; a throwing
  callback reaches `onError` (or is swallowed) and the next window stays open.
- `search-engine/search-core.contracts.test.ts`, "trailing ranking invalidation for file commits": a
  commit held at 10s is answered at exactly 60s (not at 59.999s); the answer reaches open streams as
  `recommendationsInvalidated: true, providerIds: []` after the coalescer window; 100 held commits give
  one run; nothing is scheduled when the window held nothing; 300 commits at 1s give 6 invalidations;
  an app commit still invalidates at once inside a file window; a throwing trailing refresh does not
  escape the timer and the next window still runs; `destroy()` cancels a held run.

### 7. Wrong vs Correct

#### Wrong

```ts
// A debounce: a scan that commits every 300ms re-arms it forever, and nothing is ever sent.
push(payload) {
  this.pending = this.pending ? mergeIndexCommitPayloads(this.pending, payload) : payload
  clearTimeout(this.timer)
  this.timer = setTimeout(() => this.flush(), INDEX_COMMIT_NOTIFY_WINDOW_MS)
}
```

#### Correct

```ts
push(payload) {
  this.recordCommit(this.now())
  this.pending = this.pending ? mergeIndexCommitPayloads(this.pending, payload) : payload
  if (this.timer !== null) return // the open window is not extended
  this.pendingBulk = this.isBulk()
  this.timer = setTimeout(flush, this.pendingBulk ? this.bulkWindowMs : this.windowMs)
}
```

## Scenario: CoreBox paces commit refreshes and reconciles same-query reruns

### 1. Scope / Trigger

- Changing how `renderer/modules/box/adapter/hooks/useSearch.ts` handles
  `CoreBoxEvents.search.indexCommitted` (`scheduleIndexCommitRefresh`, `noteIndexCommit`,
  `armIndexCommitRefresh`, `runIndexCommitRefresh`, `resetIndexCommitRefresh`, `isCoreBoxHidden`, the
  `subscribeRendererActivity` listener, the `corebox:shown` handler), or how a re-run of the query on
  screen lands (`applySearchSnapshot`'s same-query branch, the `update` chunk,
  `settleRefreshReconcile`, `applySearchEnd`).
- The renderer half of the previous scenario. Main paces notifications to at least 1s; the renderer
  paces the searches they cause (D-a), holds them while CoreBox is hidden (D-d), and lands each
  refresh without deleting and re-inserting rows (D4 of `09-25-corebox-list-motion`).

### 2. Signatures

```ts
const INDEX_COMMIT_REFRESH_STEPS_MS = [500, 2_000, 5_000] as const
const INDEX_COMMIT_BULK_STEP = 1 // index into the steps: a `bulk` notification waits at least 2s
const INDEX_COMMIT_QUIET_MS = 5_000 // a gap this long starts again from step 0
const REFRESH_RECONCILE_TIMEOUT_MS = 3_500

function scheduleIndexCommitRefresh(commit: { recommendationsInvalidated: boolean; bulk: boolean }): void
function shouldRefreshForIndexCommit(recommendationsInvalidated: boolean): boolean
function isCoreBoxHidden(): boolean // !coreBoxWindowVisible || document.hidden
function resetIndexCommitRefresh(): void

interface RefreshReconcile {
  items: TuffItem[] // what the run delivered, merged and capped the way a plain run shows it
  deliveredIds: Set<string> // every id the run delivered, taken before the render cap
  timer: ReturnType<typeof setTimeout>
}
let renderedTextQuery: { key: string; items: TuffItem[] } | null
let pendingRefreshReconcile: RefreshReconcile | null
```

### 3. Contracts

**Backoff (D-a)**

- Every notification first calls `noteIndexCommit(bulk)`, whether or not it will refresh: a gap of
  `INDEX_COMMIT_QUIET_MS` or more since the previous one (on `performance.now()`) resets the step to
  0, and `bulk` raises it to at least `INDEX_COMMIT_BULK_STEP`.
- A notification refreshes only when `shouldRefreshForIndexCommit` holds: never in DivisionBox mode
  or under a plugin-feature activation; always for a non-empty query; for the empty query (the
  recommendation grid) only when `recommendationsInvalidated`. That flag latches (`||=`) until the
  refresh runs, so a later plain commit cannot cancel a grid-relevant one.
- One timer at a time, armed at the current step; a later notification never pushes it back.
- The step climbs (to 5s at most) only when a refresh actually runs. A timer that fires during a
  search (`loading` or `inFlightQuery`) re-polls at 500ms without climbing. Commits that arrive
  during the refresh arm the next timer at the new step.
- `resetIndexCommitRefresh` (step 0; pending, flag and timer cleared) runs when the query changes
  (`watch(searchVal)`), when `corebox:shown` fires (just before its forced re-run) and when the stream
  stops: the next search reads the index as it is now, which covers every commit so far.

**Hidden CoreBox (D-d)**

- Visibility comes from `subscribeRendererActivity` (`renderer/modules/telemetry/renderer-activity.ts`),
  which `useVisibility` feeds from the native `CoreBoxEvents.ui.trigger` show/hide (document
  visibility until the first native signal). A hidden keep-alive window can report
  `document.hidden === false`, so the native signal decides and the document can only add a stop
  ([hook-guidelines.md](../frontend/hook-guidelines.md), "CoreApp window visibility and continuous
  work").
- Hidden, a qualifying notification only sets `indexCommitRefreshPending`. Two checks keep it from
  searching: `armIndexCommitRefresh` arms nothing while `isCoreBoxHidden()`, and
  `runIndexCommitRefresh` checks again when its timer fires (a native hide clears the timer, so only
  `document.hidden` can have changed since) and stays pending.
- Shown, exactly one search. `corebox:shown` (dispatched by `renderer/modules/hooks/core-box.ts` on a
  show trigger) resets and re-runs the query; the activity listener resets the step and arms 500ms
  only if something is still pending, i.e. visibility came back without a `corebox:shown`. Either
  order gives one search.

**Same-query refresh reconcile (D4)**

- A run of the query already on screen merges instead of replacing. `isRenderedTextQuery(key)`: the
  key matches and `renderedTextQuery.items` is still the array in `searchResults`. The snapshot and
  every `update` go through `mergeRenderedItems` into the rendered rows, and
  `pendingRefreshReconcile` records what the run delivered.
- `deliveredIds` comes from `snapshotItems` (after `filterDetachedItems`, **before**
  `applyRenderedItemQuota`) plus the ids of every `update` batch. `items` is capped at 80 in delivery
  order, and the two deferred file providers (the index and Spotlight) race on every run, so past the
  cap `items` can miss a row the run did deliver. Reconciling against `items` drops that row
  (possibly the selected one) and appends the other provider's tail instead.
- Settle on a non-cancelled `applySearchEnd`, or `REFRESH_RECONCILE_TIMEOUT_MS` after the snapshot if
  completion never comes. 3500ms covers main's gather budget (`defaultTuffGatherOptions` in
  `search-engine/search-gather.ts`: the deferred layer starts 50ms after the fast snapshot and gives
  each provider 3000ms) with room for ranking and IPC. Settling earlier removes a late provider's rows
  and then appends them again below everything.
- `settleRefreshReconcile` writes nothing when `renderedTextQuery?.items !== searchResults.value`: a
  widget activation, an execute or `replaceSearchResults` put other rows there since. Otherwise
  `next = mergeRenderedItems(current.filter(id in deliveredIds), items, focusedItemId)`, and a `next`
  that is element-identical to `current` is not written either (most refreshes during a build).
- Discarded, not settled: a cancelled end resets as it always did; a stream failure after the
  snapshot keeps what is on screen (nothing says which rows are stale); a superseded or reset run
  (`cancelActiveSearchStream`) discards.
- Only `setSearchResults` carries `renderedTextQuery` along with the rows (and `applySearchSnapshot`,
  which sets it); any other assignment to `searchResults.value` ends the match on purpose, so a run
  never merges into rows another query left.
- Constraint: ordinary `mergeRenderedItems` arrivals remain append-only (session talex-touch-51,
  2026-09-26). Existing rows keep their relative order and take newer data; pinned arrivals join
  the pinned block, and the focused row (`keepItemId`) is never quota-evicted. The user's default
  semantic-priority correction (2026-10-12) allows new semantic rows to insert after every stronger
  or equal-scoring row and pin, only when `keepItemId` is absent. With focus > 0 they append too.
  Reconcile may remove undelivered rows but never re-ranks survivors. Focus follows its item only
  when `focus > 0`; the untouched selection stays on row 0. See frontend CoreBox results contracts.

### 4. Validation & Error Matrix

| Condition                                                 | Required outcome                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Lone commit, visible, non-empty query                     | Search 500ms later                                                                   |
| Notifications keep arriving                               | The next searches 2s, then 5s apart                                                  |
| `bulk: true`                                              | The first search waits 2s                                                            |
| No notification for 5s or more                            | Back to 500ms                                                                        |
| Query changes, or CoreBox is shown                        | Backoff reset; the new search covers every commit so far                             |
| Timer fires during a search                               | Re-poll at 500ms; step unchanged                                                     |
| Hidden when notified                                      | No timer, no search; the refresh stays pending                                       |
| Hidden after the timer was armed                          | Timer cleared (native) or the run declines (document); still pending                 |
| Shown after commits arrived while hidden                  | Exactly one search, whichever signal comes first                                     |
| Refresh snapshot lacks a deferred row                     | The row stays, and stays selected, until settle; removed then if not delivered again |
| Completion never arrives                                  | Settled at 3500ms, not at 3499ms                                                     |
| Refresh cancelled                                         | Reset; no reconcile left behind                                                      |
| Refresh fails after its snapshot                          | Rows kept; `searchError` true; nothing removed after 3500ms                          |
| Rows replaced during the refresh                          | Both settle paths leave them alone                                                   |
| Deferred providers answer in the other order past the cap | Every re-delivered row kept; order and selection unchanged                           |

### 5. Good / Base / Bad Cases

- Good: during a scan an open `wx` query searches at most every 5s, and a refresh that changed
  nothing renders nothing.
- Base: one saved file reaches an open query about 1.5s after its commit (the 1s main window, then
  500ms), plus the search time.
- Bad: a flat 500ms refresh per commit (16 searches in 10s); gating on `document.hidden` alone;
  reconciling against the capped `items`; settling on the snapshot; writing the reconciled list over
  a widget's rows.

### 6. Tests Required

- `useSearch.core.test.ts` › "index-commit refreshes back off and wait for a visible CoreBox": one
  notification per second → searches at 500, 3000, 8000, 13000ms; one per 300ms for 10s → 500, 2600,
  7700 (16 before); `bulk` every 3s → 2000, 8000; resets on a query change, on `corebox:shown` and
  after a 5s pause; hidden holds and shows once; visible before `corebox:shown` also once; a refresh
  hidden before it fired runs once, 500ms after CoreBox is visible again.
- `useSearch.core.test.ts` › "a same-query refresh reconciles at completion": every recorded frame
  keeps the selected file; removal and focus fallback at completion; the selection keeps its row
  when rows above it go; a higher-scoring snapshot row is appended below (touched and untouched
  selection); the 3499ms / 3500ms fallback; cancel, failure, the `corebox:shown` re-run, another
  query's rows, the past-the-cap race, and rows replaced through `replaceSearchResults`.
- The older index-commit cases still hold: two notifications in one window make one search and keep
  the selection; the empty-query grid refreshes only when flagged; an unflagged commit cannot cancel
  a flagged one; one trailing search after an in-flight one, polled at 500ms.
- `useSearch.rank.test.ts` keeps the append-only invariant (100 seeded sessions).

### 7. Wrong vs Correct

#### Wrong

```ts
// A flat delay per commit, document-only visibility, and a reconcile against the capped rows.
setTimeout(() => void handleSearchImmediate({ force: true }), 500)
if (document.hidden) return
const kept = new Set(reconcile.items.map(item => item.id))
const next = current.filter(item => kept.has(item.id))
```

#### Correct

```ts
armIndexCommitRefresh(INDEX_COMMIT_REFRESH_STEPS_MS[indexCommitRefreshStep]) // 500 → 2s → 5s
if (indexCommitRefreshTimer || isCoreBoxHidden()) return // native signal first
const next = mergeRenderedItems(
  current.filter(item => reconcile.deliveredIds.has(item.id)), // ids taken before the cap
  reconcile.items,
  focusedItemId,
)
```

## Scenario: App watch events are gated by root before health (M6)

### 1. Scope / Trigger

- Changing `search-engine/indexed-source-event-router.ts` (the app queue,
  `IndexedSourceEventRouterOptions.getAppWatchRoots`), `IndexingRuntime`'s
  `routeWatchEventWithResultInternal` / `isOutsideSourceWatchRoots`
  (`search-engine/indexing-runtime.ts`), an indexed source's `getRoots`, or the app watch roots
  (`AppProvider.getIndexedSourceRoots()` → `appScanner.getWatchPaths()`; on darwin `/Applications`
  and `~/Applications`).
- Why: every `FILE_ADDED` / `FILE_CHANGED` / `FILE_UNLINKED` (plus `DIRECTORY_ADDED` /
  `DIRECTORY_UNLINKED` on darwin) was queued for the app source too. Routing each one ran
  `SourceDiagnosticsService.getDiagnostics([appSource], 'routing')`, whose app health is a full FTS
  count on the read worker, and wrote task history before the watch router found the path outside
  `/Applications`. One tuffex build (~2,759 `dist/` files) kept that serial queue saturated for ~14
  minutes: `IndexingDiagnostics.source` at ~250–340ms per event, ~210 `indexing.task-state.save` a
  minute.

### 2. Signatures

```ts
// search-engine/indexed-source-event-router.ts
export interface IndexedSourceEventRouterOptions {
  /** The app source's watch roots; only paths under one enter the app queue. Omitted: accept all. */
  getAppWatchRoots?: () => readonly string[]
}
// search-engine/search-core.ts
new IndexedSourceEventRouter(() => this.indexingRuntime, {
  getAppWatchRoots: () => appProvider.getIndexedSourceRoots().map((root) => root.path)
})

// search-engine/indexing-runtime.ts
private isOutsideSourceWatchRoots(event: IndexedSourceWatchEvent, source: IndexedSource): Promise<boolean>
function buildRootFilteredWatchResult(sourceId: string): WatchEventRouteResult

// utils/search/indexing-source.ts: the containment rule both gates use
isIndexedSourcePathInsideRoot(targetPath, rootPath, { platform }) // equal, or under `${root}/`; case-insensitive except on linux
resolveIndexedSourceWatchRootRoute(event, roots, { platform }) // null = outside every root
```

### 3. Contracts

- **Roots first, health second, at two gates.**
  - Router: the app queue's `shouldAccept` is `isWithinAppWatchRoots`. An out-of-root path never
    enters the queue: no 400ms window (`APP_WATCH_COALESCE_WINDOW_MS`), no route. The file queue
    stays ungated.
  - Runtime: for an event with a `sourceId`, `isOutsideSourceWatchRoots` runs before
    `getDiagnostics(…, 'routing')`, `applyTaskState`, `updateRootPolicy`,
    `watchRouter.routeWithResult` and `recordWatchResult`. Outside, it returns
    `buildRootFilteredWatchResult(sourceId)`, the shape the full route gives (`matchedSources: 1`,
    `skippedSources: 1`, `skipped: [{ sourceId, reason: 'source-watch-filtered' }]`, no deltas), with
    no health read, no watch-handler call and no task-history write.
- **Roots are read on every event, never cached** (`getAppWatchRoots()`, `source.getRoots()`). Only
  root ownership is decided early. Health, permission and enabled state stay with the runtime's
  diagnostics for in-root events and are not cached either.
- **Fail open.** Router: a throwing `getAppWatchRoots` warns once per router (`App watch roots
unavailable; routing app events unfiltered`) and accepts, because the runtime checks again; a
  closed gate would lose app installs until the next reconcile. Runtime: a throwing `getRoots()`, or
  a source without `handleWatchEvent`, falls through to the full route, which reads health and
  records the outcome as before.
- An empty root list admits nothing at either gate. An event without a `sourceId` skips the
  pre-check and still considers every source.

### 4. Validation & Error Matrix

| Event                                           | Required outcome                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `…/Workspace/tuffex/dist/index.mjs`, any action | Not in the app queue, no timer; the file queue routes it                                   |
| `/Applications/Probe.app/Contents/Info.plist`   | Keyed to the bundle, routed to the app source                                              |
| `/applications/Gone.app` unlinked, darwin       | Routed as a delete                                                                         |
| `/Applications Backup/Old.app`                  | Not routed                                                                                 |
| Roots change between two events                 | The second event is judged by the new roots                                                |
| `getAppWatchRoots` throws                       | Routed; one warning                                                                        |
| Scoped runtime event outside `getRoots()`       | Filtered result; `getHealth`, `handleWatchEvent`, `IndexingTaskStateStore.save` not called |
| Scoped runtime event inside the roots           | One health read, the handler called, one task-state save                                   |
| `getRoots()` throws in the runtime              | Full route: one health read, `source-watch-filtered`                                       |

### 5. Good / Base / Bad Cases

- Good: during a tuffex build the app source logs no `IndexingDiagnostics.source` and writes no task
  state, and CoreBox reads do not queue behind it.
- Base: an app dropped into `/Applications` still coalesces per bundle, routes, and records task
  history.
- Bad: checking the root after `getDiagnostics`; caching roots or the health and permission verdicts
  to save the read; failing closed when the roots cannot be read.

### 6. Tests Required

- `search-engine/indexed-source-event-router.test.ts` › "IndexedSourceEventRouter app root gate":
  build output stays out of the app queue with `vi.getTimerCount() === 0` while the file queue gets
  every path; both roots route; a case variant routes; a prefix sibling does not; roots are read per
  event; throwing roots route unfiltered.
- `search-engine/indexing-runtime.test.ts`: "decides root ownership before reading health or writing
  task state for a scoped watch event" (the filtered result equals the full-route shape; `getRoots`
  once, `getHealth`, `handleWatchEvent` and `save` never; an in-root event then reads health and saves
  once) and "falls through to the full route when the roots cannot be read".

### 7. Wrong vs Correct

#### Wrong

```ts
// A full FTS count and a task-history write, then the discovery that the path holds no app.
const diagnostics = await this.diagnosticsService.getDiagnostics(sources, 'routing')
await this.applyTaskState(diagnostics)
const result = await this.watchRouter.routeWithResult(event, this.sources, diagnostics)
await this.recordWatchResult(event, result, queuedAt) // → source-watch-filtered
```

#### Correct

```ts
if (source && (await this.isOutsideSourceWatchRoots(event, source))) {
  return buildRootFilteredWatchResult(source.descriptor.id)
}
const diagnostics = await this.diagnosticsService.getDiagnostics(sources, 'routing')
```

## Scenario: Routing health counts provider rows through `search_index_meta` (M7)

### 1. Scope / Trigger

- Changing `SearchIndexService.countByProvider` / `countByProviderViaMeta` /
  `countByProviderViaLocators` (`search-engine/search-index-service.ts`); anything that drops or empties `search_index` or
  `search_index_meta` (`prepareSearchIndexSchema`, `repair()`, `cleanupFileIndex` in
  `main/service/storage-maintenance.ts`); or a caller of `AppProvider.getAppSearchIndexHealth`
  (`addon/apps/app-provider.ts`).
- Why: `provider` is an UNINDEXED FTS5 column, so `SELECT count(*) FROM search_index WHERE provider = ?`
  walks the whole content table. It ran for every routed app watch event and every diagnostics poll,
  on a read-worker lane CoreBox queries share (search-hotpath §4; the app provider reads through the
  `'fast'` lane since §7).

### 2. Signatures

```ts
countByProvider(providerId: string, signal?: AbortSignal): Promise<number> // exact FTS count
countByProviderViaMeta(providerId: string, signal?: AbortSignal): Promise<number> // meta-backed
countByProviderViaLocators(providerId: string, signal?: AbortSignal): Promise<number> // verified, ≤ exact

// one round trip on the read executor:
//   SELECT (SELECT count(*) FROM search_index_meta WHERE provider_id = ?) AS metaRows,
//          EXISTS (SELECT 1 FROM search_index LIMIT 1) AS ftsHasRows,
//          EXISTS (SELECT 1 FROM search_index_maintenance_progress
//                   WHERE task = 'document-locators' AND cursor = -1) AS locatorsComplete
// search_index_meta: PRIMARY KEY (provider_id, item_id)

// countByProviderViaLocators, meta range outermost, one FTS rowid probe per row:
//   SELECT count(*) FROM search_index_meta AS metadata CROSS JOIN search_index AS document
//    WHERE metadata.provider_id = ? AND metadata.fts_rowid IS NOT NULL
//      AND document.rowid = metadata.fts_rowid
//      AND document.provider = metadata.provider_id AND document.item_id = metadata.item_id

private createSearchIndexTable(): Promise<boolean> // true when this call created the (empty) FTS table
private clearOrphanedSearchIndexMeta(): Promise<void> // DELETE FROM search_index_meta
private getAppSearchIndexHealth(options?: { probeFilesystem?: boolean })
```

### 3. Contracts

- The meta count is a range count on the `(provider_id, item_id)` primary key, sent through the same
  read executor as every runtime read.
- The FTS decides wherever meta cannot be trusted:
  - `ftsHasRows = 0` → 0. An empty FTS table makes every meta row an orphan (a wipe of
    `search_index` that left meta behind).
  - `metaRows = 0` → the exact `countByProvider`, for rows written before meta existed, until the
    locator backfill is done (`document-locators` cursor `-1`, the mark the writer trusts too). The
    backfill gives every FTS row a meta row, so from then on `metaRows = 0` means no documents and the
    answer is 0. The exact count would walk the whole content table to say so: 30.3s cold on the
    7.6GB dev index, where the `'fast'` lane gives up at 3s; the meta read answers in 3.2ms.
  - Otherwise → `metaRows`.
- Writers keep both tables in step (`applyDocument`, removals, replacement commits). A path that
  drops or empties `search_index` clears meta in the same place:
  - Writer init: `prepareSearchIndexSchema` calls `clearOrphanedSearchIndexMeta()` only when
    `createSearchIndexTable()` created the FTS table: a lost or dropped table, or `repair()`, which
    drops it and initializes again. A restart over an existing table clears nothing.
  - `cleanupFileIndex({ clearSearchIndex: true })` deletes `searchIndexMeta` together with
    `search_index`, `file_fts`, `keyword_mappings`, `search_keyword_postings` and
    `query_completions`.
- Caller split in `getAppSearchIndexHealth`:
  - Unprobed (`getIndexedSourceHealth()`, i.e. the app source's `getHealth` for watch routing and
    diagnostics polls) → `countByProviderViaMeta`.
  - `probeFilesystem: true` (`_ensureStartupIndexHealth`, `_shouldRunStartupBackfill`) →
    `countByProviderViaLocators`, because the answer decides whether a backfill runs. Every meta
    row is checked against the FTS row its `fts_rowid` locates, so orphaned meta counts nothing and
    the answer never exceeds the exact count: a missed backfill is impossible. It falls short only
    for FTS rows the locator backfill has not reached, which reads as unhealthy and costs at most
    one extra backfill.
  - Why not the exact count there: on the maintenance reader it still runs on the read worker,
    whose deadline is 15s. A 7.6GB dev index took 31.5s cold (`SELECT count(*) … WHERE provider`,
    202 app rows), so the read failed, health came back `null` and the startup check was skipped
    on every cold launch. The locator count returned the same 202 in 17ms.
  - The writer's and the search-index worker's own counts stay exact.
- A failing count is logged (`Failed to count app search index rows`) and becomes `null`, never 0:
  health is unknown (`healthy: null`), not unhealthy. Unprobed, `getIndexedSourceHealth` reports
  `warming` while the app index warms and `degraded` otherwise, with `searchIndexRows=unknown` in
  the reason. Probed, `_ensureStartupIndexHealth` returns without a backfill, and
  `_shouldRunStartupBackfill`'s development recent-backfill check answers
  `index-health-unavailable`.
- Benchmark (implement.md; `/tmp/refresh-churn-m7-bench/bench.mjs`: 150k file rows with ~600 bytes
  of content plus 160 app rows, on a fresh `query_only` connection): 50.6ms → 0.03ms. On the machine
  that reported the storm, the FTS count showed up as ~250–340ms of `IndexingDiagnostics.source`,
  read-worker queueing included.

### 4. Validation & Error Matrix

| State                                                                  | `countByProviderViaMeta`                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Meta and FTS agree                                                     | The meta count, in one read whose SQL names `search_index_meta` and never `FROM search_index WHERE provider` |
| After `removeProviderItems`, then `removeByProvider`                   | Follows the FTS count (2, then 0)                                                                            |
| FTS emptied, meta left behind                                          | 0                                                                                                            |
| Legacy FTS rows without meta                                           | The exact FTS count (the fallback read is observed)                                                          |
| No meta rows for the provider, locator backfill done                   | 0, without the fallback read                                                                                 |
| FTS table dropped, writer initialized again, another provider refilled | 0 for the dropped provider; the refilled provider's own count                                                |
| Writer initialized again over an existing table                        | Unchanged                                                                                                    |

### 5. Good / Base / Bad Cases

- Good: watch routing and diagnostics pay a sub-millisecond read; the backfill decision reads the
  locator-verified count, which never exceeds the exact one.
- Base: an index written before meta existed reads the exact count until the locator backfill has
  given its rows meta.
- Bad: `EXISTS (… FROM search_index WHERE provider = ?)` (still a full walk when the provider has no
  rows); dropping the empty-FTS guard; wiping `search_index` without meta; moving the backfill guard
  onto the unverified meta count (orphaned meta would claim a healthy index), or back onto the full
  FTS count (times out on a large index and skips the decision).

### 6. Tests Required

- `search-engine/search-index-service.meta-count.test.ts` (real temporary libSQL; a writer plus a
  reader-mode service whose read executor records SQL): one read without the FTS provider scan; in
  step through removals; 0 over orphaned meta; the legacy fallback; no fallback once the real
  locator backfill has run ("answers from meta alone once the locator backfill has given every FTS
  row a meta row"); orphans cleared when the FTS table is recreated; meta kept on an ordinary
  restart.
- `addon/apps/app-provider.realtime-freshness.test.ts` › "F4 filesystem cardinality probe":
  unprobed, "answers the routing health from the meta count with visible count and status" and
  "stays healthy and never reads the filesystem when the probe is not requested"; probed, with only
  `countByProviderViaLocators` on the maintenance reader, "marks the source unhealthy when a watch
  root holds an app with no row" and "drives the startup health check into a backfill when the
  probe finds a gap".
- `main/service/storage-maintenance.test.ts` › "cleanupFileIndex actual storage ownership": "clears
  file projections and derivatives but preserves app catalog on %s" (`search_index_meta` emptied
  with the search index) and "keeps explicitly retained projections and other-source queues on %s"
  (`clearSearchIndex: false`; keyword lookups still resolve through meta).

### 7. Wrong vs Correct

#### Wrong

```ts
const indexedItemCount = await searchIndex.countByProvider(this.id) // a full FTS walk per watch event
await db.run(sql`DELETE FROM search_index`) // meta now claims documents that are gone
```

#### Correct

```ts
const indexedItemCount = await (options?.probeFilesystem === true
  ? searchIndex.countByProviderViaLocators(this.id) // decisions that act on the answer
  : searchIndex.countByProviderViaMeta(this.id)) // routing and diagnostics
await db.run(sql`DELETE FROM search_index`)
await db.delete(searchIndexMeta)
```

## Scenario: Native file results obey the file-index directory rule (X1, D-b)

### 1. Scope / Trigger

- Changing `MacSpotlightFileProvider.searchNative`, `LinuxNativeFileProvider.searchNative` or
  `NativeSearchDirectoryFilter` (`addon/files/native-file-search-provider.ts`),
  `getDirectoryLevelExclusionReason` (`addon/files/utils.ts`), the iCloud Drive exception, or the
  traversal rules in `utils/common/file-filter-service.ts` / `file-scan-constants.ts`.
- Why: native backends were filtered only by the file-level search rule, after a cut to 50. For
  "wx", mdfind's first 13 hits were one build's `out/renderer/assets`, followed by `dist/_nuxt`,
  `node_modules` and `~/Library/Application Support` entries the index never holds. D-b
  (2026-09-26): one exclusion vocabulary for every file source.
- Split with search-hotpath §10: `getSearchExclusionReason` (applied to every candidate here, and to
  every provider's batch in the gather) carries the context-free directory rules at read time. The
  context-dependent names (`build`, `dist`, `out`, … beside a project marker) need a `readdir` of the
  parent that a result row cannot carry; this scenario adds that walk for native results.

### 2. Signatures

```ts
// addon/files/native-file-search-provider.ts
const NATIVE_SEARCH_MAX_RESULTS = 50
const NATIVE_SEARCH_CANDIDATE_POOL = 150
const NATIVE_SEARCH_DIRECTORY_CACHE_LIMIT = 2_048 // verdict LRU entries
const NATIVE_SEARCH_DIRECTORY_CACHE_TTL_MS = 5 * 60_000 // a project marker can appear later

class NativeSearchDirectoryFilter {
  constructor(
    normalizeKey: (directoryPath: string) => string,
    readdir?: (directoryPath: string) => Promise<string[]>, // default fs.readdir
    now?: () => number, // default Date.now
    levelOptionsOf?: (rootKey: string | null) => FileScanOptions | undefined, // default: no options
  )
  // rootKeyOf?: (filePath: string) => string | null, default () => null
  selectVisible(candidates: readonly string[], limit: number, rootKeyOf?): Promise<string[]>
  dropExcludedDirectories(results: NativeFileSearchResult[], rootKeyOf?): Promise<NativeFileSearchResult[]>
}

// addon/files/utils.ts
export async function getDirectoryLevelExclusionReason(
  directoryPath: string,
  readdir?: (directoryPath: string) => Promise<string[]>, // defaults to fs.readdir
  options?: FileScanOptions,
): Promise<FileFilterReason | null>
```

### 3. Contracts

- **Pool, rule, cut.** Candidates are the backend's deduplicated paths (on darwin, inside the
  Spotlight search roots) that pass `getSearchExclusionReason`, sliced to 150. `selectVisible` judges
  each candidate's parent directory and keeps the visible ones, in backend order, up to 50. Only those
  are `stat`ed; a hidden candidate costs no `stat`. The Linux backends are asked for the pool
  (`locate -i -l 150`, `tracker3` / `tracker search --files --limit 150`, `baloosearch --limit 150`).
- **Ancestors first, one level at a time.** A directory inherits its parent's verdict; otherwise
  `getDirectoryLevelExclusionReason(directory, readdir, levelOptionsOf(rootKey))` judges its own name:
  - a name in `CONTEXT_DEPENDENT_BLACKLISTED_DIRS` (`bin`, `build`, `cache`, `coverage`, `dist`,
    `logs`, `out`, `target`, `temp`, `temporary`, `tmp`) reads the parent's entries as project context
    (#1727) and, when they hold no marker, the folders above it up to but not including the home
    directory (`fileFilterService.isInsideProject`, passed as `insideProject`), so a package's `dist`
    under a monorepo root is a project folder too; an unreadable parent passes `siblingNames:
    undefined`, which keeps the stricter historical exclusion;
  - every other name is judged with an empty sibling list, as the walker saw it.
- **The search root is never judged**: the user asked to look there. Linux has no root key, so its
  walk runs to `/` and hides `/mnt/…` and `/media/…` results the way the index does.
- **Verdict cache.** Promises keyed by `rootKey + '\0' + directoryPath` (concurrent siblings share one
  walk), LRU in Map order (a hit refreshes recency), at most 2,048 entries, 5-minute TTL. A folder's
  entries are read at most once per TTL across queries.
- **Folder self-check.** After `stat`, `dropExcludedDirectories` judges a result that is itself a
  directory by its own path, so `node_modules` or a project's `dist` never appears as a row.
- **iCloud Drive exception (D-b, user decision 2026-09-26).** `~/Library` falls under the system-path
  rule (`/^\/Users\/[^/]+\/Library\//` in `PATH_PATTERNS.SYSTEM_PATHS`, and `Library` as a
  home-anchored system directory). On darwin `rootKeyOf` tries `findMacICloudDriveRootKey` first: a
  path whose key starts with `<home>/library/mobile documents/` takes that folder as its root key, so
  nothing above it is judged. `levelOptionsOf` returns `{ enableSystemPathFilter: false }` for exactly
  that key and `undefined` (the defaults) for every other key. Name rules still apply inside iCloud
  Drive. The read-time rule carries the same exception (`isInsideICloudDrive`, search-hotpath §10).
- Keys come from `normalizeMacSpotlightPathKey`: `path.resolve` (which collapses `..`), trailing
  slashes stripped, lower-cased (APFS is case-insensitive by default). Containment is
  `startsWith(key + '/')`.
- A signal aborted by the end of `selectVisible` returns `[]` before any `stat`.

### 4. Validation & Error Matrix

From the unit tests, including the 14-path leak matrix in "scopes the iCloud Drive exception to that
one folder, so no other ~/Library path leaks". Home is `/Users/demo`.

| Result                                                                                                                        | Outcome                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `…/core-app/out/renderer/assets/KaTeX…ttf`, `package.json` beside `out`                                                       | Hidden                       |
| `…/nanobot/web/dist/assets/…` in a project                                                                                    | Hidden                       |
| `…/webui/node_modules/wx-sdk/index.js`                                                                                        | Hidden                       |
| `~/Library/Application Support/WeChat/wx-cache.json`                                                                          | Hidden                       |
| `~/Documents/build/2026/wx-report.pdf`, no project marker                                                                     | Visible                      |
| `~/Library/Mobile Documents/com~apple~CloudDocs/Plans/wx-plan.md`                                                             | Visible                      |
| `~/Library/Mobile Documents/iCloud~com~apple~Pages/Documents/wx-brief.pages`                                                  | Visible                      |
| `~/library/mobile documents/com~apple~CloudDocs/wx-case.md` (case variant)                                                    | Visible                      |
| `…/CloudDocs/Library/wx-user-folder.md`, `…/CloudDocs/build/2026/wx-report.pdf`                                               | Visible                      |
| `…/CloudDocs/.secret/wx-dot.md`, `…/CloudDocs/proj/node_modules/wx/index.js`                                                  | Hidden                       |
| `~/Library/Mobile Documents Backup/…`, `~/Library/Mobile DocumentsOld/…` (prefix siblings)                                    | Hidden                       |
| `~/Library/Mobile Documents/../Application Support/…` (`..` escape)                                                           | Hidden                       |
| `~/Library/Containers/com.apple.CloudDocs.MobileDocumentsFileProvider/Data/…`, `~/Library/wx-direct.md`, `~/LIBRARY/Caches/…` | Hidden                       |
| 60 build-output hits ahead of 10 documents                                                                                    | The 10 documents             |
| 80 visible hits                                                                                                               | The first 50                 |
| Three hits under one project's `dist`, two queries                                                                            | The project folder read once |
| Folder results `node_modules`, `dist` (in a project), `wx-docs`                                                               | `wx-docs` only               |
| Linux: `…/node_modules/…`, `…/app/build/…` (in a project), `~/docs/wx-notes.md`                                               | The document only            |

### 5. Good / Base / Bad Cases

- Good: "wx" lists the user's documents and iCloud files; build output, dependencies and `~/Library`
  data never reach the list; sibling results share one parent read per 5 minutes.
- Base: a `build` folder in `~/Documents` without a project marker stays visible, as in the index
  (#1727).
- Bad: cutting to 50 before the rule; an uncached `readdir` per result; switching the system filter
  off for all of `~/Library`, or matching the iCloud prefix without the trailing `/`; caching
  verdicts with no TTL.

### 6. Tests Required

- `addon/files/native-file-search-provider.test.ts` › "file-index directory rule (D-b)": the "wx"
  fixture (only the two documents, two `stat` calls); "keeps iCloud Drive, which lives under
  ~/Library, and still hides the rest of ~/Library"; "fills the visible list from a wider pool when
  build output leads the answer"; "still caps the visible list at 50"; "reads a folder once for all
  its results and reuses the verdict on the next query"; "drops a folder result that is itself build
  output or a dependency folder"; "applies the same rule to the Linux native backends and asks them
  for the wider pool"; "scopes the iCloud Drive exception to that one folder, so no other ~/Library
  path leaks" (the 14-path matrix above).
- The leak test is the only one that fails when the iCloud root key is widened to all of `~/Library`
  (mutation M3, 2026-09-26). Widening `levelOptionsOf` to every root is an equivalent mutation: a
  path outside iCloud Drive always passes the `~/Library` level, which the name rule hides whatever
  the flag says. Keep the matrix in step with any change to `findMacICloudDriveRootKey`,
  `normalizeMacSpotlightPathKey` or `levelOptionsOf`.

### 7. Wrong vs Correct

#### Wrong

```ts
const paths = candidates.slice(0, NATIVE_SEARCH_MAX_RESULTS).filter(isVisible) // cut, then filter
const levelOptionsOf = () => ({ enableSystemPathFilter: false }) // opens all of ~/Library
const inICloud = key.startsWith(`${homeKey}/library/mobile documents`) // "Mobile Documents Backup" too
```

#### Correct

```ts
const candidates = hits.filter(passesSearchRule).slice(0, NATIVE_SEARCH_CANDIDATE_POOL)
const paths = await directoryFilter.selectVisible(candidates, NATIVE_SEARCH_MAX_RESULTS, rootKeyOf)
const levelOptionsOf = (rootKey: string | null) =>
  rootKey !== null && rootKey === getMacICloudDriveRootKey() ? { enableSystemPathFilter: false } : undefined
const inICloud = normalizeMacSpotlightPathKey(filePath).startsWith(`${rootKey}/`)
```

## Scenario: Linked worktrees below a root stay out of the file index (2026-10-21)

### 1. Scope / Trigger

- Changing `isLinkedWorktreeGitFile` (`utils/common/file-filter-service.ts`), the legacy walker
  (`scanDirectory`, `utils/common/file-scan-utils.ts`), `isLinkedWorktreeRoot`,
  `findLinkedWorktreeRootBelow`, `findLinkedWorktreeHolding` or `getScanChildExclusionReason`
  (`addon/files/file-traversal-policy.ts`), the fd backend's `isTraversalExcluded`,
  `NativeSearchDirectoryFilter`, the full-scan child planner (`listScanChildDirectories`), the
  watched-subtree reconcile, or the cleanup sweep's `classifyExcludedCleanupPath`.
- Why: a linked worktree (`git worktree add`) is a second checkout of a repository the index
  already holds. 24% of the dev profile's files were same-name, same-size copies, most of them
  from worktrees and extra checkouts (roadmap `FILE-AND-APP-INDEX-ROADMAP.md` §2).

### 2. Signatures

```ts
// utils/common/file-filter-service.ts
export function isLinkedWorktreeGitFile(contents: string): boolean // gitdir: …/worktrees/<name>

// addon/files/file-traversal-policy.ts
export async function isLinkedWorktreeRoot(directoryPath, readFile?): Promise<boolean>
export async function findLinkedWorktreeRootBelow(filePath, roots, isWorktreeRoot?): Promise<string | null>
export async function findLinkedWorktreeHolding(directoryPath, roots, isWorktreeRoot?): Promise<string | null>
export async function getScanChildExclusionReason(directoryPath, context, isWorktreeRoot?): Promise<FileFilterReason | null>
export async function getFileTraversalExclusionReason(filePath, readdir?, roots?): Promise<FileFilterReason | null>
```

### 3. Contracts

- **What a linked worktree is.** A folder whose `.git` is a file reading `gitdir: <path>` with
  `<path>` ending in `worktrees/<name>`, for a normal or a bare repository and with either slash.
  A `.git` folder, a submodule (`gitdir: …/modules/<name>`) and anything unreadable are not one.
  The verdict is `development-path`.
- **Below a root only.** A worktree the user picked as a watch root, or that is the deepest root
  holding a path, stays in. Watch roots nested in a base root are collapsed into it
  (`resolveIndexedWatchRootSet`), so on macOS, where the base root is the home folder, an extra
  path inside a worktree is covered by the rule like any other excluded folder; only the cleanup
  sweep exempts user-monitored paths (roadmap E4).
- **Every walk checks below its start, and every caller covers the start.** The fd backend, the
  legacy walker and the native search filter check each folder below the folder the walk starts
  at. Walks that start below a watch root cover the gap themselves:
  - the full scan walks each child of a root as its own unit; `listScanChildDirectories` awaits
    `getScanChildExclusionReason`, so a worktree child is never a unit, and the root-only walk
    then refuses it as a folder below its start;
  - a watched-subtree reconcile skips a scope that `findLinkedWorktreeHolding` places inside a
    worktree (the scope itself included) before reading or walking anything.
- **Watch events.** `getFileTraversalExclusionReason(path, undefined, watchPaths)` adds the rule
  for one path, below the deepest root holding it.
- **Eviction.** The cleanup sweep classifies a file inside a worktree below a root as excluded and
  records the worktree's `.git` as its evidence; the delete checks that evidence again
  (`lstat`), as it does for project markers. Worktree checks are cached per folder and cleared
  with the directory-read cache.

### 4. Validation & Error Matrix

| Case | Outcome |
| --- | --- |
| `<root>/repo-feature/.git` = `gitdir: <root>/repo/.git/worktrees/repo-feature` | Not indexed: scan, child unit, watch event, subtree scope; existing rows evicted |
| `<root>/repo/vendor/.git` = `gitdir: ../.git/modules/vendor` (submodule) | Indexed |
| Worktree picked as the watch root | Indexed |
| `git worktree add` under a root while the app runs | Not indexed (watch admission) |
| `.git` unreadable, or a folder | Not a worktree |

Live check (2026-10-21, isolated instance, fixture of 7 + 7 files): fresh profile 7 repository
rows and 0 worktree rows; a new file in the repository indexed, one in the worktree not; a
worktree created while running gets 0 rows; a profile indexed by the old code dropped its 7
worktree rows within 10 s of starting the new code. Before the child-planner fix the same fresh
profile held all 14: the full scan walked `repo-feature` as a unit of its own.

### 5. Good / Base / Bad Cases

- Good: one checkout of a repository in the index, however many worktrees sit beside it.
- Base: a submodule, a second clone (its own `.git` folder) and a worktree picked as a root are
  indexed as before.
- Bad: checking only the folders a walk passes through, which misses a walk that starts at the
  worktree; reading `.git` for every file instead of once per folder.

### 6. Tests Required

- `packages/utils/__tests__/file-filter-linked-worktree.test.ts`: gitdir forms; the walker skips a
  worktree below its root, keeps the repository and its submodule, keeps a worktree picked as root.
- `addon/files/file-traversal-policy.test.ts` › "linked worktrees".
- `addon/files/workers/file-scan-fd-backend.test.ts` fixture: `wt/copy.txt` excluded,
  `lib-sub/sub.txt` (submodule) admitted.
- `services/file-provider-full-scan-checkpoint-service.test.ts` › "waits for a rule that has to
  read the child"; `services/file-provider-watch-subtree-reconcile-worktree.test.ts`;
  `services/file-provider-maintenance-worktree.test.ts`.

## Scenario: Enrichment resume pacing and read-failure classes (M3 / M4)

This code ships in talex-touch-31's PR for Issue #1964 (task `09-26-bound-indexing-memory-icons`): it
is interleaved line by line with that work, and the commit and PR description credit this task. The
per-page mutation lease is #1964's and appears here only as context.

### 1. Scope / Trigger

- `addon/files/services/file-provider-enrichment-resume-service.ts`;
  `addon/files/workers/file-index-worker.ts`, `index-worker-read-failure.ts` and
  `file-index-worker-client.ts`; `addon/files/services/file-provider-index-scheduler-service.ts`;
  `FileProvider.publishCommittedWorkerRecords`; `FileParserResult.errorCode` / `truncated` in
  `utils/electron/file-parsers`.
- Why: each resume round published what it enriched (an index commit per flush), the lease-free
  publication's drain called `resume()` again, every round restarted at `files.id = 0`, and a failed
  chunk ended the round. Read errors counted as failures (`FILE_INDEX_WORKER_BATCH_FAILED:26/30`) and
  were still published.

### 2. Signatures

```ts
// addon/files/services/file-provider-enrichment-resume-service.ts
export const ENRICHMENT_RESUME_ROUND_COOLDOWN_MS = 45_000
const RESUME_BATCH_SIZE = 200
const MAX_CONSECUTIVE_NO_ADMIT_ROUNDS = 5
type ResumeRoundOutcome = 'completed' | 'wrapped' | 'paused' | 'stopped'
resume(reason: string): void
// deps.getSearchIndex: () => Pick<SearchIndexService, 'readFileEnrichmentPage'> | null

// search-engine/search-index-service.ts
readFileEnrichmentPage(
  predicate: SQL | undefined, // the lane's; may name files and file_index_progress columns
  afterId: number,
  limit: number,
  signal?: AbortSignal
): Promise<FileEnrichmentPageRow[]> // type = 'file', id > afterId, ORDER BY id

// addon/files/workers/index-worker-read-failure.ts
export const INDEX_WORKER_FILE_MISSING = 'file-missing' // ENOENT, ENOTDIR
export const INDEX_WORKER_PERMISSION_DENIED = 'permission-denied' // EACCES, EPERM
export function classifyIndexWorkerReadFailure(
  errorCode: string | null | undefined
): IndexWorkerReadSkipReason | null
export function isIndexWorkerFileMissing(progress: { status: string; lastError?: string | null }): boolean
export const INDEX_WORKER_FAILURE_SAMPLE_LIMIT = 3 // each sample cut to 240 chars plus '…'
export function pushIndexWorkerFailureSample(samples: string[], lastError: string | null | undefined): void

// FileParserResult.errorCode?: string; IndexWorkerBatchResult.failureSamples?: string[]
// FileParserResult.truncated?: boolean; file_index_progress.status gains 'truncated'
```

### 3. Contracts

- **Content indexing is opt-in.** `contentIndexingEnabled` has one shared default, `false`; missing or invalid historical values normalize to that value. A fresh config records the current `contentIndexCleanupVersion`; a non-empty historical config without the field normalizes to 0, performs one fenced cleanup, then records the current version. This avoids scanning the FTS content column on every disabled startup while retaining retry-after-failure. While disabled, fullScan/watch acknowledgements do not mark progress, schedule the parser or generate file embeddings. File FTS queries exclude the `content` column, so stale pre-policy text cannot match before cleanup finishes.
- **Base scan and enrichment are separate phases.** While a file scan owns `isInitializing`, base writes may leave durable pending work but cannot dispatch content batches. `drainIndexedSourceMutations` requests resume only after the base snapshot and its ordered publication finish; the resume lease cannot overtake the scan lease.
- **Image completion belongs to the embedding transaction (2026-10-12).** The parser emits an image
  as `pending` until the local encoder commits its vector, file embedding state and completed
  progress together. Flush's final confirmation only persists original terminal worker outcomes
  (`completed`, `truncated`, `skipped`, `failed`); it never replays an original `pending` / `processing` image
  after that transaction. Without this guard, completed images return to the recovery queue and
  repeatedly occupy the head of a partially admitted page. Failed or unavailable image encoding
  remains durably pending, not falsely completed.
- **A failed text vector keeps its file in the retry lane (2026-10-30).** A text file whose vectors
  failed used to end `completed` with `embedding_status = 'pending'`, and nothing revisited it.
  `EmbeddingService.indexFiles` now lists a text file whose own attempt `failed` in
  `retryFileIds` (`paused` and `skipped` are not failures; images are never listed, their
  transaction owns completion). `indexCommittedEntries` passes the ids to the flush as numbers, and
  the flush's final confirmation leaves those rows at the `pending` its first persist wrote, so the
  `pending` / `processing` retry lane re-reads them at the next resume. The list lives in the
  flush's retained publication stage: a replay after a capacity pause neither re-embeds nor
  completes them. A file gets three attempts per file version: the count is in memory (a success
  clears it, a restart forgets it), the third failure is not listed, and the row then completes and
  leaves the retry lane for good, so a deterministic failure is bounded and a restart does not buy
  an exhausted file more. Environment errors (helper down, request timeout) count like any other
  failure; attempts are at least one resume round apart (45 s cooldown), so a helper that stays
  down for about 90 s exhausts all three. The count table holds 4,096 files and never evicts: a new
  failing file that finds it full is treated as exhausted on its first failure, so a batch larger
  than the table still converges within three rounds (evicting the oldest made every file restart
  its count in turn and none finish). Exhausted rows join the legacy set of rows `completed` with
  `embedding_status = 'pending'`; backfilling that set is a separate product decision. The set is
  **not** enrolled: the retry lane selects on progress status alone and nothing migrates it, and a
  text file that ends `skipped` or `paused` (embedding unavailable, usage-limit or capacity pause)
  completes into it instead of entering the retry lane. A negative availability answer (the probe
  threw, or returned an unusable vector) is remembered for 60 s rather than for the process, so
  the first batch after the helper comes up probes again; the files batches skipped inside that
  minute stay in the legacy set. Only a flush wired with `checkContentCapacity` (production) can
  hold a row pending; without it the first persist already completes the row.
- **Disable is a fenced cleanup.** The main process suppresses intake, stops resume timers, cancels queued enrichment and drains committed work. Inside one source mutation lease and one Writer admission, it clears `files.content`, file embeddings, `file_index_progress` and `search_index.content` without deleting file metadata. The SourceScoped writer then crosses the reader visibility barrier and publishes one file-source commit. Only after that succeeds does `saveMainConfigDurable` persist `false`; enabling likewise durably saves `true` before resume starts. Cleanup or durable-save failure leaves the prior setting in memory and on disk, and re-arms resume when that prior setting is enabled, so the UI cannot claim a transition succeeded.

- **No self-excitation.** Each page runs inside `withMutationLease`: `scheduleIndexing(rows, label,
leaseId)`, then `waitForSearchIndexDrain(label, leaseId)`. A leased `applySourceBatch` applies
  within the lease and never calls `drainMutations`, so the round's own commits never reach
  `drainIndexedSourceMutations` → `resume()`.
- **Cooldown.** A round starts one cooldown (45s) after the previous one ended. A request during a round
  sets `rerunRequested`; requests during the cooldown are absorbed by the one pending timer
  (`scheduleFollowUp` arms at most one, `unref`'d). A round that ends `paused` or `wrapped`, or with a
  rerun requested, schedules one follow-up. The wait is `min(45s, lastRoundEndedAt + 45s −
Date.now())`, so a wall clock set back never holds recovery longer than one cooldown.
- **Independent fresh / retry / legacy cursors (2026-10-12).** Missing progress forms the fresh
  lane; `pending` / `processing` forms retry; previously skipped images with
  `lastError: 'content-indexing-disabled'` form legacy only while the media model is ready.
  Each round starts fresh and rotates one page opportunity through fresh → retry → legacy.
  Empty lanes are skipped; other admitted work or a stuck-page advance permits another probe.
  Legacy's whole-page pending marker may move its unadmitted suffix into retry, never into fresh:
  new files cannot wait for all historic retries, and neither retries nor legacy backfill starve
  under continuous fresh arrivals. All lanes retain 200-row pages and the bounded scheduler.
  Each keyset cursor advances only on full admission; partial suffixes remain recoverable while
  peers get a turn. At exhaustion the persistent cursor wraps to 0, but the current round keeps
  its last scanned position to check newly arrived higher ids. The next cooldown round recovers
  lower-id re-armed work. No new timers, schema markers or in-memory file queue.
- **Pages are read by the read worker (2026-10-22).** The service builds the lane predicate and
  `readFileEnrichmentPage` runs it through FileProvider's index service, whose executor is the
  deferred read worker; no page is read on a main-thread connection. When nothing matches, a
  predicate on `files.extension` (legacy, and fresh / retry while image embedding is unavailable)
  walks `files` from the cursor to its end: 5.1s cold and 32ms warm on the 7.6GB dev index, which
  used to block the event loop and now holds the read lane (main thread ≤ 4ms). Rows are unchanged,
  `mtime` / `ctime` included: whole seconds × 1000, as drizzle's select mapped them. A rejected
  read (timeout, full queue, cooldown) ends the round `paused` like any other error.
- **Failures.** A chunk failure (`INDEXED_WORKER_SCHEDULER_DISPATCH_FAILED` from the page's drain)
  fails only that page: `drainPage` settles the flush and the round moves on, because per-file
  failures are terminal. Stuck-page guard: a partly admitted page whose dispatch failed and that comes
  back identical (`isSamePage`) is stepped past; its rows stay pending for the pass after the wrap.
  Any other error (a drain timeout, a scheduling throw) ends the round `paused` (`Deferred file
enrichment recovery paused`), as do five consecutive iterations that admit nothing; the follow-up
  retries after the cooldown.
- **Read-failure classes.** `TextFileParser` returns the errno as `errorCode`, and the worker
  classifies it before counting a failure. Fresh / retry recovery selects only missing progress or
  `pending` / `processing`; the legacy lane only re-arms old disabled-image skips. Other skipped
  rows are not retried until a later write marks the file pending again.
  - ENOENT / ENOTDIR → `skipped` with `lastError: 'file-missing'`, not counted. Not published:
    `publishCommittedWorkerRecords` drops it, and a flush of only missing files applies no batch and
    commits nothing. The stale search row goes lazily, through `cleanupStaleSearchCandidates` when a
    search reaches it (a positive ENOENT only) or through reconcile. Never delete it on the publish
    path: a delete by `provider` / `item_id` is O(table) per row (search-hotpath §8). This departs
    from PRD R5 on purpose (implement.md).
  - EACCES / EPERM → `skipped` with `lastError: 'permission-denied'`, not counted, still published as
    a metadata-only row that stays searchable by name.
  - Anything else → `failed`, counted. The batch's `done` message carries up to three samples, and
    `FileIndexWorkerBatchFailedError` adds them as `lastErrorSamples` to the `File index worker
failed` warning.
- **A file too long to index is not indexed at all (2026-10-31, supersedes the 2026-10-22 prefix rule).**
  The 10-22 rule indexed the leading 200,000 characters of a long file and recorded `truncated`. A
  hit in the first part of a novel says little about the rest, while the body is stored in
  `files.content`, the FTS `content` column and its page overhead, so on a measured 6.4 GB index a
  few thousand long files held about 450 MB of body. `FILE_CONTENT_MAX_CHARS` (50,000, in
  `addon/files/constants.ts`) now bounds it: a file whose extracted text is longer, or whose parser
  stopped early (`FileParserResult.truncated`: output budget, chunk limit, PDF page cap), is recorded
  `skipped` with `lastError: 'content-too-long'` and `fileUpdate: { content: null, embeddingStatus:
  'none' }`. No prefix, chunk or vector is kept; the null update also removes what an earlier,
  shorter version of the same file left behind, and the file stays findable by name and path. It is
  terminal like every skip, not counted in `failed`, and not retried until a write marks the file
  pending again. The worker parses with `maxOutputBytes = FILE_PARSE_OUTPUT_MAX_BYTES` (8 bytes per
  allowed character: a 4-byte code point counted once in content and once in a chunk) and
  `maxChunks: 1024`, so a file within the cap is never cut by the budget. The worker no longer emits
  `truncated`; the status stays in the enum and in index stats for rows written before this rule.
  The 1 MiB result budget stays as a backstop (`result-too-large` → `failed`). Code chunk overlap is
  at most a quarter of the chunk and only covers lines the chunk was first to reach, so a line lands
  in at most two chunks.
- **Existing over-long bodies are cleared by a boot pass (2026-10-31).**
  `FileProviderOverlongContentCleanupService` (config key
  `file_provider_overlong_content_cleanup_version`) walks, in id pages of 50, every file whose
  `files.content` is longer than the cap or whose progress is `truncated`. Per page it first
  re-emits the records with `content: null` through the normal write path (the document hash covers
  `content`, so the FTS column is replaced and the title still matches), and only then, in one
  writer transaction, clears `files.content`, the file's embeddings and `content_chunks`, and sets
  progress to `skipped` / `content-too-long`. The order matters: a failure between the two leaves
  the page selected, so the next boot retries it, whereas the reverse would strand a stale FTS body
  that nothing selects any more. It runs after the keyword backfill and before the embedding BLOB
  pass (so no vector is converted just to be deleted), followed by the single `boot-check`
  compaction that returns the freed pages to the disk.
- **Samples stay in the local log.** A sample is a raw errno message with an absolute path in it. It
  goes to `fileProviderLog.warn` only: never into transport payloads, dashboards,
  `operationalErrorService.report` context, Sentry or Nexus
  ([quality-guidelines.md](../frontend/quality-guidelines.md), "Operational Error Privacy and SQLite
  Rebuild Recovery").

### 4. Validation & Error Matrix

| Condition                              | Required outcome                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| A round ends with requests outstanding | One `unref`'d timer; the follow-up starts at exactly 45s with reason `follow-up` |
| A request 10s after a round ended      | Held 35s, not 45s, then run with its own reason                                  |
| Clock set back an hour after a round   | The follow-up still starts within 45s                                            |
| Scheduling throws on the third page    | Paused; the retry continues after id 400; the next round wraps to id 1           |
| One page's chunk fails                 | The round continues; `failedPages` in the completion log                         |
| ENOENT, ENOTDIR, EPERM, EACCES reads   | `skipped`; `failed: 0`; no `failureSamples`                                      |
| Four EISDIR reads                      | `failed: 4`; exactly three samples                                               |
| Text over `FILE_CONTENT_MAX_CHARS`, or a parser cut at its budget | `skipped` / `content-too-long`; `failed: 0`; no content, chunks or vectors; the name still matches |
| Text of exactly `FILE_CONTENT_MAX_CHARS`                          | `completed`; the whole body is indexed                                           |
| A flush of only missing files          | No `applyBatch`, no commit                                                       |

### 5. Good / Base / Bad Cases

- Good: a backlog is worked through in rounds at least 45s apart, each continuing where the last one
  stopped; a deleted worktree's rows neither fail batches nor commit.
- Base: a worker crash on one page is logged and the pass continues.
- Bad: calling `resume()` from the round's own publication; restarting at id 0; deleting missing rows
  on the publish path; copying `lastError` samples into telemetry.

### 6. Tests Required

- `addon/files/services/file-provider-enrichment-resume-service.test.ts` › "round spacing and
  cursor" (the rows above) and "page lease ownership".
- `addon/files/workers/file-index-worker.read-failure.test.ts`: the errno is reported; ENOENT,
  ENOTDIR, EPERM (a sentinel parser) and EACCES become skips with `failed: 0`; EISDIR is counted with
  three samples.
- `addon/files/services/file-provider-index-scheduler-service.test.ts`: "adds the worker's lastError
  samples to the failed-batch warning".
- `addon/files/file-provider-startup.test.ts`: "does not publish worker results for files the worker
  found missing".

### 7. Wrong vs Correct

#### Wrong

```ts
this.startRound(reason) // straight after the last round: its own commits keep the next one coming
gt(filesSchema.id, 0) // every round reads the head of the table again
if (result.status === 'failed') failed += 1 // a deleted file fails the batch and is still published
await this.removeSearchIndexItems(missingIds, reason) // on the publish path: O(table) per row
```

#### Correct

```ts
this.scheduleFollowUp(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS, 'follow-up') // one unref'd timer
gt(filesSchema.id, this.cursor) // continue where the last round stopped
const readSkipReason = classifyIndexWorkerReadFailure(result.errorCode) // a terminal skip, not a failure
if (isIndexWorkerFileMissing(entry.progress)) continue // not published; the row goes lazily
```

## Verification

```bash
cd apps/core-app
node_modules/.bin/vitest run \
  src/main/modules/box-tool/search-engine/search-index-commit-coalescer.test.ts \
  src/main/modules/box-tool/search-engine/search-core.contracts.test.ts \
  src/main/modules/box-tool/search-engine/indexed-source-event-router.test.ts \
  src/main/modules/box-tool/search-engine/indexing-runtime.test.ts \
  src/main/modules/box-tool/search-engine/search-index-service.meta-count.test.ts \
  src/main/modules/box-tool/addon/apps/app-provider.realtime-freshness.test.ts \
  src/main/service/storage-maintenance.test.ts \
  src/main/modules/box-tool/addon/files/native-file-search-provider.test.ts \
  src/main/modules/box-tool/addon/files/services/file-provider-enrichment-resume-service.test.ts \
  src/main/modules/box-tool/addon/files/workers/file-index-worker.read-failure.test.ts \
  src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.test.ts \
  src/main/modules/box-tool/addon/files/file-provider-startup.test.ts \
  src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts \
  src/renderer/src/modules/box/adapter/hooks/useSearch.rank.test.ts
node_modules/.bin/tsc --noEmit -p tsconfig.node.json
node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json --composite false
```

Runtime, from the dev log only: during a tuffex build, `IndexingDiagnostics.source` slow logs stay
near 0 and `indexing.task-state.save` drops; enrichment resume rounds start at most once per
`ENRICHMENT_RESUME_ROUND_COOLDOWN_MS`; with a query open, searches per minute drop.
