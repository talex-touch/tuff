# CoreBox Results Contracts

> How the CoreBox renderer lands results, keeps the selection, says it is searching, and moves
> rows and the highlight. Established 2026-09-25/26 by `09-25-corebox-keyboard-jump`,
> `09-25-corebox-list-motion`, `09-26-corebox-refresh-churn` (renderer half),
> `09-25-corebox-search-pulse-beam`, `09-26-corebox-pulse-semantics` and
> `09-26-corebox-meta-overlay` (feedback placement), under `09-25-corebox-ux-polish`.

---

## Principles

- **Data lands in one update; motion follows it.** Rows are opaque from their first frame and
  nothing ready waits for an animation ([Ready results must not wait for reveal
  motion](./component-guidelines.md#ready-results-must-not-wait-for-reveal-motion)).
- **What the user is looking at keeps its place.** Rows on screen keep their index, an untouched
  selection stays on row 0, the preview pane waits before it closes.
- **Compositor properties only.** Motion is `transform`, `translate` or `opacity`. Nothing
  transitions width, height, padding, `filter` or a custom property, and keyboard navigation never
  scrolls smoothly.
- **One gate for script motion.** See "One motion gate" below.

```
hooks/useSearch.ts        res · loading · awaitingFirstResults · searchSettling · boxOptions.focus
  mergeRenderedItems        append-only merge, keepItemId            → Append-only / reconcile
  settleRefreshReconcile    a same-query refresh settles at the end   → Append-only / reconcile
box/CoreBox.vue
  [res, focus] watchers     a followed selection stays visible        → Selection follow
  TxPrismGlow + status      the searching cue                         → Searching cue
  useMotionGate             shouldAnimate(), low-battery attribute    → One motion gate
  useSelectionBlock         the moving highlight, data-pointer-idle   → Selection block
  useListFlip               rows an update moved slide                → List FLIP
  addonType / addonItem     the preview pane's hold                   → Preview pane
  footerRef.onScreen        where an action's outcome shows           → Feedback placement
render/BoxItem · ItemSubtitle   row paint, hover, same-name folders   → Selection block, names
```

Not repeated here:

- Main-process commit pacing and the refresh's full matrix:
  [index-commit-refresh-contracts.md](../main-process/index-commit-refresh-contracts.md).
- ⌘K keys, the action pipeline and failure logging:
  [corebox-meta-overlay-contracts.md](../main-process/corebox-meta-overlay-contracts.md).
- The glow's own visuals (compositor-only loop, retract on grow):
  [TuffEx Design Rules](./tuffex-design-rules.md).
- Hidden keep-alive windows and continuous work:
  [Hook Guidelines](./hook-guidelines.md#coreapp-window-visibility-and-continuous-work).
- Grid keyboard geometry: [Component Guidelines](./component-guidelines.md#grid-keyboard-geometry).
- Not landed yet, so not specified: preview-card identity and border (R-F) and the R-P2 items
  (history panel, height measurement, preview placeholder) of `09-25-corebox-list-motion`.

Path prefixes: `renderer/` = `apps/core-app/src/renderer/src/`, `hooks/` =
`renderer/modules/box/adapter/hooks/`, `render/` = `renderer/components/render/`, `box/` =
`renderer/views/box/`.

## Scenario: The selection follows a moved row only when the user moved it

### 1. Scope / Trigger

- Changing where `useSearch` reads or restores the selection: `focusedItemId` in
  `applySearchSnapshot`, the `update` chunk and `settleRefreshReconcile`; `selectedItemId` in
  `executeSearch`; `restoreFocusedItem`; `pendingPreferredItemId` in `requestSearchSnapshot`. Or the
  two `[res, () => boxOptions.focus]` watchers, `resultsQuery`, `onScreenItemRefs` or
  `expectFreshResults` in `box/CoreBox.vue`.
- Why (keyboard-jump): with an extension query ("pdf") every file scores the same, the file index
  and Spotlight answer in either order under the same ids, and the renderer made the selection
  follow row 0's item through every re-rank (b592636ce, 2026-08-05). The highlight drifted to row
  20–50 or the last row, off screen, and the next ↓ jumped there.

### 2. Signatures

```ts
// hooks/useSearch.ts — read before the handler changes `res`
const focusedItemId = boxOptions.focus > 0 ? (res.value[boxOptions.focus]?.id ?? null) : null
// executeSearch, for a `preserveSelection` refresh: the same rule
const selectedItemId =
  options.preserveSelection && boxOptions.focus > 0 ? (res.value[boxOptions.focus]?.id ?? null) : null
function restoreFocusedItem(itemId: string | null): void
// null id or focus < 0 → unchanged; found → its index; gone → 0 (−1 when there are no rows)

// box/CoreBox.vue
let resultsQuery: string | null // the query of the results on screen; null after `corebox:shown`
let onScreenItemRefs: ItemRef[] // the itemRefs array the rows now on screen registered into
let followedRowWasOnScreen: boolean
// Two watchers on [res, () => boxOptions.focus], inline in the source:
//   flush 'pre'  → followedRowWasOnScreen, measured before the rows move
//   flush 'post' → the scroll, once the DOM has landed
scrollActiveItemIntoView() // useKeyboard: next frame, instant, minimal, clears the footer
```

### 3. Contracts

- **Row 0 is not a choice (R1).** Focus 0 is the untouched default. It stays on row 0 through
  batches, re-ranks and refreshes, whatever lands there. Moving back to row 0 counts as untouched.
- **A row the user moved to follows its item (R2).** With focus > 0, Enter must run the row they
  picked, so every handler reads `focusedItemId` before it changes `res` and calls
  `restoreFocusedItem` after. `applyRenderedItemQuota` never evicts it (`keepItemId`). A selected
  row that is gone falls back to row 0.
- A `preserveSelection` refresh whose snapshot lacks the user's row remembers it
  (`pendingPreferredItemId`) and moves the selection back when a later batch delivers it, unless the
  user moved in between: their newer choice wins. With the same-query merge (next scenario) the row
  normally never leaves.
- **CoreBox keeps a followed selection visible (R4).**
  - Pre-flush, only when both `res` and focus changed, it records whether the previously selected
    row intersected the scroll viewport, measured on `onScreenItemRefs[previousFocus]`. The `res`
    watcher hands `itemRefs` a fresh, empty array before each re-render, so `itemRefs.value` may
    already be that empty array here.
  - Post-flush it stores `onScreenItemRefs = itemRefs.value` and returns on a focus-only change: a
    key press or a click is useKeyboard's to scroll.
  - Then, for a new query's first results (`searchVal !== resultsQuery`): `resultsQuery =
    searchVal` and `scrollTo(0, 0)`. Otherwise, if the followed row was on screen:
    `scrollActiveItemIntoView()`.
- `corebox:shown` sets `resultsQuery = null`. The re-run on show starts at row 0 while the list is
  still scrolled where it was hidden, so its first results scroll to the top; later batches of that
  run do not.
- Scrolling is instant and minimal. A list the user scrolled away from stays where they put it, and
  a keyboard move is never scrolled a second time.

### 4. Validation & Error Matrix

| Situation | Focus | Scroll |
| --- | --- | --- |
| Focus 0; a later batch would outscore row 0 | 0, same item on top (append-only) | none |
| Focus 0; index-commit refresh | 0 | none |
| Focus k > 0; a pinned arrival, quota eviction or reconcile removal above it | follows its item | `scrollActiveItemIntoView()` if the row was on screen |
| Same, but the user had scrolled the row away | follows its item | none |
| The selected row is removed (quota, reconcile) | 0 (−1 when empty) | into view if the removed row was on screen |
| A new query's first results | 0 (reset when the search started) | `scrollTo(0, 0)`, once |
| The re-run after `corebox:shown` | 0 | `scrollTo(0, 0)` on its first results only |
| A refresh snapshot lacks the user's row; a later batch returns it | back on it, unless the user moved since | into view if the fallback row was on screen |
| Arrow key or click | set by useKeyboard | useKeyboard's scroll only |

### 5. Good / Base / Bad Cases

- Good: "pdf" streams two batches; row 0 stays highlighted and ↓ goes to row 1.
- Base: the user picked row 5; a refresh removes a row above it; the highlight moves up with its
  item, and the list scrolls only if that row had been visible.
- Bad: following row 0's item through re-ranks; measuring the old row through `itemRefs.value` in
  pre-flush; smooth-scrolling to the selection; scrolling on every `res` change.
- Known gap, outside keyboard-jump's scope: a key pressed between a new query's start and its
  snapshot moves the index on the old rows, and that index carries over to the new ones.

### 6. Tests Required

- `hooks/useSearch.rank.test.ts`: "keeps the top row and an untouched selection when a later batch
  would outscore it"; "appends a wide file batch below a weak fast hit and leaves the selection on
  row 0"; "keeps the selection on its row when a higher-scoring batch arrives"; "never evicts the
  selected row when a later batch claims its floor past the render cap".
- `hooks/useSearch.core.test.ts`: "keeps an untouched selection on row 0 through an index-commit
  refresh"; "coalesces committed index refreshes and preserves the selected item".
- `box/CoreBox.result-switch.test.ts` › "CoreBox selection visibility" (stubbed `scrollTo` and
  `scrollActiveItemIntoView`, rows 48px apart in a 240px viewport):
  - a new query: a focus-only reset scrolls nothing; its rows then call `scrollTo(0, 0)` once and
    `scrollActiveItemIntoView` never;
  - `corebox:shown`: one `scrollTo(0, 0)`, and none for a later batch;
  - a visible followed row: one `scrollActiveItemIntoView`; a row scrolled away: none.
- `box/CoreBox.refresh-reconcile.test.ts` › "moves the selection to row 0 and into view when
  completion removes the selected row".

### 7. Wrong vs Correct

```ts
// Wrong: the untouched default chases the item that used to sit on row 0 (b592636ce)
const focusedItemId = res.value[boxOptions.focus]?.id ?? null

// Correct
const focusedItemId = boxOptions.focus > 0 ? (res.value[boxOptions.focus]?.id ?? null) : null
```

```ts
// Wrong: in pre-flush itemRefs may already be the fresh array the re-render will fill
followedRowWasOnScreen = isRowOnScreen(itemRefs.value[previousFocus])

// Correct: the array the rows on screen registered into
followedRowWasOnScreen =
  items !== previousItems && focus !== previousFocus && isRowOnScreen(onScreenItemRefs[previousFocus])
```

## Scenario: Results are append-only; a same-query refresh reconciles at search end

### 1. Scope / Trigger

- Changing `mergeRenderedItems`, `rankArrivals`, `applyRenderedItemQuota`, `setSearchResults` /
  `isRenderedTextQuery` / `renderedTextQuery`, `applySearchSnapshot`'s same-query branch, the
  `update` chunk, `settleRefreshReconcile` / `discardRefreshReconcile`, `applySearchEnd`,
  `executeSearch`'s recommendation path and `applyRecommendationResult`, or the index-commit refresh
  scheduler (`hooks/useSearch.ts`); or the list rows' `:key` in `box/CoreBox.vue`.
- The main-process pacing and the refresh's full matrix live in
  [index-commit-refresh-contracts.md](../main-process/index-commit-refresh-contracts.md), "CoreBox
  paces commit refreshes and reconciles same-query reruns". This scenario is the part the view is
  built on; change neither side without the other.

### 2. Signatures

```ts
// hooks/useSearch.ts
const MAX_RENDERED_RESULTS = 80
const MIN_SLOTS_PER_SOURCE = 6
function mergeRenderedItems(current: TuffItem[], incoming: TuffItem[], keepItemId?: string | null): TuffItem[]
function applyRenderedItemQuota(rankedItems: TuffItem[], keepItemId?: string | null): TuffItem[]
let renderedTextQuery: { key: string; items: TuffItem[] } | null
let pendingRefreshReconcile: RefreshReconcile | null // { items, deliveredIds: Set<string>, timer }
const REFRESH_RECONCILE_TIMEOUT_MS = 3_500
const INDEX_COMMIT_REFRESH_STEPS_MS = [500, 2_000, 5_000] as const // bulk starts at [1]; a 5s gap resets
const RECOMMENDATION_TIMEOUT_MS = 400 // executeSearch, recommendation path

// box/CoreBox.vue: row identity is the item id, so a merged row keeps its DOM node
<CoreBoxRender v-for="(item, index) in res" :key="item.id || index" :data-flip-key="item.id" … />
```

### 3. Contracts

- **Append-only** (user decision 2026-09-26, session talex-touch-51).
  - A row on screen keeps its index and takes the newer item data.
  - Arrivals are ranked among themselves (pinned, then `scoring.final`, then arrival order) and
    appended below everything. Pinned arrivals join the pinned block at the top.
  - The quota keeps each source at least `MIN_SLOTS_PER_SOURCE` of the 80 slots and never evicts
    `keepItemId`.
  - Nothing re-ranks rows across batches. People mostly launch apps, and the deferred file layer
    (the index and Spotlight) answers after them and reshuffled rows the user had already arrowed
    to.
- **A re-run of the query on screen merges.** `isRenderedTextQuery` holds when the key matches and
  `renderedTextQuery.items` is still the array in `searchResults`: an index-commit refresh, or the
  re-run on show. Its fast snapshot merges into the rendered rows instead of replacing them, and its
  updates merge as usual. Before D4 the snapshot dropped every file row until the deferred layer
  sent it again, once per refresh for as long as an index built.
- **The recommendation path keeps what is on screen (R-C).** Opening CoreBox or clearing the query
  leaves the current rows and `boxOptions.layout` up until `applyRecommendationResult` replaces both
  in one update, so no empty frame shows between the old grid and the new one. Swapping only one of
  the pair renders a grid's items as a list for a frame. Past `RECOMMENDATION_TIMEOUT_MS` without a
  snapshot, or on a failure, the rows are cleared.
- **Removal waits for the end.**
  - `deliveredIds` is the snapshot's ids after `filterDetachedItems` and **before**
    `applyRenderedItemQuota`, plus the ids of every `update` batch.
  - Rows not in it are removed by `settleRefreshReconcile`, on a non-cancelled `applySearchEnd`, or
    `REFRESH_RECONCILE_TIMEOUT_MS` after the snapshot if completion never comes.
  - Why before the cap: past 80 rows the two deferred providers race, so the capped `items` can lack
    a row the run did send again. Reconciling against it drops that row (possibly the selected one)
    and appends the other provider's tail.
- **3500ms** is main's gather budget plus room for ranking and IPC. `defaultTuffGatherOptions`
  (`search-engine/search-gather.ts`) starts the deferred layer 50ms after the fast snapshot and gives
  each provider 3000ms. Settling earlier removes a late provider's rows and then appends them again
  below everything.
- **Survivors are merged, never re-ranked** by the new snapshot:
  `mergeRenderedItems(current.filter(id in deliveredIds), reconcile.items, focusedItemId)`. The
  selection follows the previous scenario.
- **Guards.**
  - `settleRefreshReconcile` writes nothing when `renderedTextQuery?.items !== searchResults.value`:
    a widget activation, an execute or `replaceSearchResults` put other rows there since.
  - It writes nothing when the result is element-identical, which is most refreshes during a build.
  - Only `setSearchResults` carries `renderedTextQuery` along with the rows. Any other assignment
    ends the match on purpose, so a run never merges into rows another query left.
  - A cancelled end resets. A failure after the snapshot keeps the rows, since nothing says which are
    stale. A superseded run discards the reconcile (`cancelActiveSearchStream`).
- **Pacing** (D-a, D-d). A commit notification refreshes after 500ms, then 2s, then 5s while they
  keep coming. `bulk` starts at 2s; a 5s quiet gap, a query change, `corebox:shown` or the stream
  stopping resets to 500ms. While CoreBox is hidden a notification only marks a refresh pending, and
  showing it runs exactly one search. The reasons are in the main-process spec.
- D4 changed the timing of the 07-15 intermediate-state contract (b80730046). Stale rows still go,
  at completion instead of at the snapshot.

### 4. Validation & Error Matrix

View-level outcomes; the full matrix is in the main-process spec.

| Situation | On screen |
| --- | --- |
| A deferred batch outscores the rows on screen | Appended below them; no row moves |
| A pinned arrival | Joins the pinned block; rows below shift by one (the list FLIP slides them when it is on) |
| A refresh snapshot lacks two file rows, an update re-sends one | Both stay on their DOM nodes until completion; then only the other goes |
| Completion never arrives | Settled at 3500ms, not at 3499ms |
| Past the cap, the providers answer in the other order | Every re-delivered row kept; order and selection unchanged |
| Rows replaced by a widget or an execute during the refresh | Both settle paths leave them alone |
| The refresh is cancelled, or fails after its snapshot | Reset, or rows kept with `searchError` |
| The refresh changed nothing | No write, no re-render |
| Opening CoreBox, or clearing the query | The old rows and layout stay until the grid replaces both in one update; cleared at 400ms without a snapshot, or on failure |

### 5. Good / Base / Bad Cases

- Good: while an index builds, an open "wx" query refreshes at most every 5s, its rows keep their
  DOM nodes, and a refresh that changed nothing renders nothing.
- Base: a deleted file's row goes when the refresh that no longer finds it completes.
- Bad: replacing the list with the fast snapshot; ranking arrivals in among the rendered rows;
  reconciling against the capped `items`; settling on the snapshot or on a shorter timeout; writing
  the reconciled list over rows another path put there.

### 6. Tests Required

- `box/CoreBox.refresh-reconcile.test.ts` (CoreBox on the real `useSearch`): "keeps the DOM node of
  every row the refresh delivers again, and drops the rest at completion" compares the elements with
  `toBe`, keeps the pane on the selected file and the focus unchanged; plus the R4 case of the
  previous scenario.
- `hooks/useSearch.core.test.ts` › "a same-query refresh reconciles at completion", › "index-commit
  refreshes back off and wait for a visible CoreBox", and › "the recommendation path keeps what is on
  screen until its snapshot lands" (one-update swap, cleared at the 400ms budget and on failure).
- `hooks/useSearch.rank.test.ts`: the append-only cases, and "holds the rendered order and the
  selection through 100 random streamed sessions".

### 7. Wrong vs Correct

```ts
// Wrong: the refresh snapshot replaces the rows (files vanish, then come back re-ranked),
// and the reconcile trusts the capped list
searchResults.value = filteredItems
const kept = new Set(reconcile.items.map((item) => item.id))

// Correct
setSearchResults(mergeRenderedItems(searchResults.value, filteredItems, focusedItemId))
pendingRefreshReconcile = {
  items: filteredItems,
  deliveredIds: new Set(snapshotItems.map((item) => item.id)), // before applyRenderedItemQuota
  timer: setTimeout(settleRefreshReconcile, REFRESH_RECONCILE_TIMEOUT_MS)
}
```

## Scenario: The searching cue means no rows yet, not a running session

### 1. Scope / Trigger

- Changing `loading`, `hasFreshResults` or where it is written, `awaitingFirstResults` /
  `searchSettling` (`hooks/useSearch.ts`); `showSearchProgress`, `showSearchSettling`,
  `searchPulseAnimated`, `showSearchPulse`, `searchStatusMessage`, the `TxPrismGlow` mount, the
  `.CoreBox-SearchStatus-Live` announcer or the `.CoreBox-SearchStatus*` branches
  (`box/CoreBox.vue`); the `corebox.searching*` strings.
- Why (pulse-semantics): the glow followed `loading`, which stays true until the session completes,
  that is until the deferred file layer answers (up to 3000ms per provider). The apps were on
  screen under a lit bar, which read as "search is slow".

### 2. Signatures

```ts
// hooks/useSearch.ts
const loading = ref(false) // the session runs: aria-busy, send gating, refresh gating
const hasFreshResults = ref(false) // at least one row of the current query is on screen
const awaitingFirstResults = computed(() => loading.value && !hasFreshResults.value)
const searchSettling = computed(() => loading.value && hasFreshResults.value)

// box/CoreBox.vue
const showSearchProgress = useDeferredLoading(awaitingFirstResults, { delay: 600, minDuration: 400 })
const showSearchSettling = useDeferredLoading(searchSettling, { delay: 300, minDuration: 400 })
const searchPulseAnimated = computed(() => shouldAnimate())
const showSearchPulse = computed(
  () => showSearchProgress.value && shouldShowInput.value && !searchError.value &&
    searchPulseAnimated.value && !isDivisionBoxMode()
)
// What the search status announcer says; '' where the status texts never spoke
const searchStatusMessage = computed(() => {
  const message = showSearchProgress.value ? t('corebox.searching')
    : showSearchSettling.value ? t('corebox.searchingMore') : ''
  if (!message || isDivisionBoxMode() || !shouldShowInput.value || searchError.value) return ''
  return message
})
```

```vue
<!-- Direct children of .CoreBox-Wrapper, before div.CoreBox: two always-mounted announcers -->
<span class="CoreBox-ActionFeedback-Live sr-only" role="status" aria-live="polite">{{ actionFeedback?.message ?? '' }}</span>
<span class="CoreBox-SearchStatus-Live sr-only" role="status" aria-live="polite">{{ searchStatusMessage }}</span>

<!-- The MainBox header branch (the v-else inside div.CoreBox), first child -->
<TxPrismGlow class="CoreBox-SearchGlow" :active="showSearchPulse" :intensity="0.85" :grow-target="wrapperRef" />

<!-- .CoreBox-Configure: error, then searching, then settling. The texts are visual copies, drawn
     only when motion is degraded, and carry no live role -->
<div v-if="shouldShowInput && searchError" class="CoreBox-SearchStatus CoreBox-SearchStatus--error">…</div>
<div v-else-if="shouldShowInput && showSearchProgress && !searchPulseAnimated"
     class="CoreBox-SearchStatus CoreBox-SearchStatus--progress" aria-hidden="true">{{ t('corebox.searching') }}</div>
<div v-else-if="shouldShowInput && showSearchSettling && !searchPulseAnimated"
     class="CoreBox-SearchStatus CoreBox-SearchStatus--settling" aria-hidden="true">{{ t('corebox.searchingMore') }}</div>
```

`hasFreshResults` is written at exactly these points:

| Where | Value |
| --- | --- |
| `executeSearch`, text query | `isRenderedTextQuery(queryKey) && searchResults.length > 0`: a re-run of the query on screen settles from the start; a new query waits even with the previous query's rows up |
| `executeSearch`, recommendation path | `false`: the grid on screen is an earlier one |
| `applySearchSnapshot`, `applyRecommendationResult` | `searchResults.length > 0` |
| The `update` chunk | `searchResults.length > 0`: an empty snapshot keeps waiting for the deferred layer's first rows |
| `handleExecute` (rows cleared, `loading = true`) | `false`: an execute in flight is waiting, never "still searching" |

The end, no-results and failure paths leave it alone: `loading = false` zeroes both computeds.

### 3. Contracts

- **`loading` keeps its meaning.** `aria-busy` on `.CoreBoxRes`, `canSubmitFeaturePrompt` (send mode)
  and `runIndexCommitRefresh` (it re-polls while a search runs) read it. The cue is derived from
  `loading`: never change its assignments for the cue, and never point those three readers at the
  new flags.
- **The glow follows `awaitingFirstResults`**, shown after 600ms and held at least 400ms
  (`useDeferredLoading`; the pulse-beam task's R3, user-confirmed 2026-09-25). When the first rows
  land within 600ms it never lights, however long the files take.
- **Mount.**
  - First child of the MainBox header branch, inside `div.CoreBox`, which is positioned and
    z-indexed and so is its own stacking context.
  - `.CoreBox-SearchGlow { position: absolute; inset: 0; z-index: -1; border-radius: inherit;
    pointer-events: none }` paints it under the logo, input, tags and buttons, over the bar's
    transparent background, and never takes a click.
  - Bind `active`; never `v-if` the component. Its internal `Transition` has to play the fade and the
    retract.
- **Retract on grow.** The 56px header never grows; the window does when results land, and
  `.CoreBox-Wrapper` (`inset: 0`) with it. So `:grow-target="wrapperRef"` plus the default
  `collapseOnGrow` retract the glow the moment results make the box taller (user, 2026-09-26: "只要高度变高
  … 要立即收起"). The effect's own rules are [TuffEx Design Rules](./tuffex-design-rules.md), "A
  looping effect runs on the compositor…" and "A loading surface retracts when content lands under
  it"; do not restate them in CoreBox.
- **Where it shows.** MainBox only: a header-less DivisionBox still renders this header, hidden, so
  `!isDivisionBoxMode()` keeps the glow off. `searchError` shows the retry button instead.
- **One announcer for the search status.** `.CoreBox-SearchStatus-Live` (`sr-only`,
  `role="status"`, `aria-live="polite"`) is a direct child of `.CoreBox-Wrapper`, always mounted, and
  says `searchStatusMessage`: `corebox.searching`, then `corebox.searchingMore`, then nothing.
  - Why (09-25-corebox-search-pulse-beam, 2026-09-26): the status texts were `role="status"`
    elements inserted by `v-if` together with their words, and several screen readers (VoiceOver
    with Chromium in particular) do not announce a live region inserted already filled. Only a
    change to a region that already exists is announced reliably; the action feedback's announcer
    is built the same way (see "Action feedback placement").
  - Its own region, not the action feedback's: in a shared one an outcome ("已复制") would overwrite
    the status, and the status would be announced again when the outcome clears.
  - Silent wherever the status texts never spoke: a DivisionBox (with its header, or header-less and
    hidden), a hidden input (plugin UI mode), and a failed search, which has its retry button and
    `role="alert"`.
- **Status texts are visual copies.** `.CoreBox-SearchStatus--progress` and `--settling` render only
  when motion is degraded (reduced motion or low battery, the one gate), stand in for the glow there
  and carry no live role (`aria-hidden="true"`), so nothing is announced twice. While the glow
  animates they are not rendered at all. Showing the settling text only when degraded is the user's
  decision of 2026-09-26, the rule the searching text has followed since 09-25.
  - `showSearchSettling` waits 300ms, so a file layer that answers quickly is never announced.
  - Motion degrading while a status is up draws the copy and leaves the announcer's text as it was,
    so the status is not announced again.
- **Contrast.** The visible settling text is quieter by its words, not its ink.
  `--shell-text-secondary` on `--tx-fill-color` is 4.5:1 in the light theme, the AA floor, so any
  opacity below 1 fails AA. The pulse-semantics design proposed a lower opacity; it was dropped.
- **Expected on the real device** (2026-09-26): searches finish in 270–400ms, under the 600ms delay,
  so the glow rarely lights. It is there for a cold or busy search. Do not shorten the delay to make
  it show.
- Strings: `corebox.searching` ("正在搜索…" / "Searching…") and `corebox.searchingMore` ("还在搜索更多…"
  / "Still searching…") in `renderer/modules/lang/{zh-CN,en-US}.json`.

### 4. Validation & Error Matrix

`aria-busy="true"` holds for as long as `loading` in every row. "Status" is what the announcer says;
the header draws it as a visual copy only when motion is degraded.

| Situation | Glow | Status |
| --- | --- | --- |
| First rows within 600ms, files take 3s | never | settling, from 300ms after the rows until completion |
| No rows for 600ms | lit at 600ms | searching |
| Rows land 50ms after it lit | held until 400ms shown, then off | settling |
| Empty snapshot, then an update brings rows | as for no rows, until the update | settling after it |
| Index-commit refresh, or the re-run on show | never: settling from the start | settling |
| New query with the previous rows still up | as for no rows: the old rows do not count | searching |
| Recommendation snapshot lands | ends: `loading` is false at the snapshot | none |
| Execute in flight | as for no rows | searching, never settling |
| `searchError` | off | none: the retry button and its `role="alert"` |
| Reduced motion or low battery | off | as above, and drawn as a visual copy |
| Motion degrades while a status is up | goes out | unchanged: not announced again |
| DivisionBox, or a hidden input (plugin UI mode) | off | none |

### 5. Good / Base / Bad Cases

- Good: "wx" shows WeChat in 300ms with no glow; a screen reader hears "Still searching…" while the
  files gather; the apps never sit under a lit bar.
- Base: a cold index takes 1.2s; the glow rises at 600ms, stays at least 400ms, and retracts as the
  rows grow the window.
- Bad: binding the glow to `loading`; dimming the settling text; lowering the 600ms delay; `v-if` on
  `TxPrismGlow`; a `grow-target` that never grows (the header); a `role="status"` that arrives with
  its words (`v-if`), or a live role on the visual copy next to the announcer.

### 6. Tests Required

- `hooks/useSearch.pulse.test.ts` › "useSearch searching-cue state": waiting, settling at the
  snapshot, idle at completion; an empty snapshot waits for the update; a new query waits with the
  old rows up; a re-run of the query on screen is settling; the recommendation snapshot ends the
  wait; an execute in flight is waiting, never settling.
- `box/CoreBox.search-status.test.ts` › "CoreBox searching cue" (fake timers, real `useSearch`):
  - the glow (`TxPrismGlow` prop `active`) only while waiting; once rows land `aria-busy` is still
    `true` and the announcer says `corebox.searchingMore`;
  - never lit when rows beat 600ms, checked every 250ms for 3s; held for its minimum;
  - while animated only the announcer speaks and no text is drawn; in low-battery mode and under
    reduced motion the texts are drawn, not `sr-only`, `aria-hidden`, with no role, and the glow is
    off.
- … › "CoreBox search status announcer": mounted before any search and empty; searching, still
  searching, then empty, on one node; exactly one live region carries each status, animated and
  degraded; motion degrading while a status is up draws the copy and does not touch the
  announcer's text (a `MutationObserver` records nothing).
  - It stays silent on a search error (only the `role="alert"` retry speaks), when a plugin view
    hides the input, and in DivisionBox: one test each, and each of the three guards is caught only
    by its own test.
  - The action-feedback and search-status announcers never write each other's node: "copied" at
    600ms, the status turning to "still searching" at 1000ms, the feedback clearing at 1800ms and
    the status clearing at search end each change exactly one region.
- `box/CoreBox.result-switch.test.ts`: its `useSearch` fake is typed
  `satisfies Record<keyof SearchHook, unknown>`, so a field the real hook gains (such as
  `searchError`, `awaitingFirstResults` or `searchSettling`) fails the typecheck until the fake has
  it.
- … › "CoreBox searching glow mount": the glow's root is the first element child of `div.CoreBox`,
  and its `growTarget` prop is the `.CoreBox-Wrapper` element. Without that binding the glow fades
  out instead of retracting as results grow the box. What the tests cannot see, the painted result
  under the header content and the retract itself, is checked in the real window.

### 7. Wrong vs Correct

```ts
// Wrong: the session stays open for the file layer, so the glow burns over rows already up
const showSearchProgress = useDeferredLoading(loading, { delay: 600, minDuration: 400 })

// Correct
const showSearchProgress = useDeferredLoading(awaitingFirstResults, { delay: 600, minDuration: 400 })
```

```scss
// Wrong: quieter by ink; the text is at the AA floor, so this drops it below
.CoreBox-SearchStatus--settling { opacity: 0.7; }

// Correct: the same ink as the other statuses; the words say it is secondary
.CoreBox-SearchStatus--settling { padding-inline: var(--shell-space-1); }
```

```vue
<!-- Wrong: a live region inserted already filled; VoiceOver with Chromium does not announce it -->
<div v-else-if="showSearchProgress" class="CoreBox-SearchStatus--progress" role="status">{{ t('corebox.searching') }}</div>

<!-- Correct: an always-mounted announcer whose text changes; the drawn text is a visual copy -->
<span class="CoreBox-SearchStatus-Live sr-only" role="status" aria-live="polite">{{ searchStatusMessage }}</span>
<div v-else-if="showSearchProgress && !searchPulseAnimated" class="CoreBox-SearchStatus--progress" aria-hidden="true">{{ t('corebox.searching') }}</div>
```

## Scenario: One motion gate

### 1. Scope / Trigger

- Adding or changing any CoreBox motion a script drives (`element.animate()`, a rAF loop, a transform
  set from JS), anything in CoreBox that reads `lowBatteryMode` or `prefers-reduced-motion`, or
  `hooks/useMotionGate.ts`.

### 2. Signatures

```ts
// hooks/useMotionGate.ts
interface MotionGate {
  lowBatteryMode: ComputedRef<boolean> // for the few CoreBox rules that read it directly
  shouldAnimate: () => boolean // reactive; false under reduced motion or on low battery
}
function useMotionGate(): MotionGate // useGlobalBatteryOptimizer() + usePreferredReducedMotion()

// box/CoreBox.vue, called once
const { lowBatteryMode, shouldAnimate } = useMotionGate()
```

### 3. Contracts

- `shouldAnimate()` is true when `prefers-reduced-motion` is not `reduce` and `lowBatteryMode` is
  off (on battery at or below `blockBatteryBelowPercent`, with `animation.autoDisableOnLowBattery`
  on). It reads a computed, so a computed or watcher that calls it re-runs when either switch flips.
- **CoreBox owns the low-battery attribute for its window.** `useGlobalBatteryOptimizer()` inside
  the gate sets `html[data-low-battery-motion='1']`. The main window gets it from
  `MainWindowRuntimeServices.vue`, which CoreBox never mounts; before the gate, CoreBox CSS kept
  animating on low battery.
- Call `useMotionGate()` once, in `CoreBox.vue`, and pass `shouldAnimate` down. `useSelectionBlock`
  and `useListFlip` take it as an option (their tests pass a ref); a hook calling the gate itself
  would add a second writer of the attribute.
- **CSS stops its own motion; scripts ask.** `html[data-low-battery-motion='1'] *` sets
  `transition` and `animation` to `none !important` (`renderer/styles/index.scss`), and
  `@media (prefers-reduced-motion: reduce)` shortens them (`renderer/styles/accessibility.scss`).
  Neither reaches `element.animate()` or a value a script writes. Every such motion asks
  `shouldAnimate()` before it starts, and again when a deferred play runs (the grid FLIP plays on
  `nextTick`, the list FLIP after the flush): the gate can close in between.
- Degraded means lands in place. Nothing is hidden, and every row and control stays usable.

| Motion | Driver | Gate |
| --- | --- | --- |
| Search glow | `TxPrismGlow` | `searchPulseAnimated = computed(() => shouldAnimate())`; the status texts show instead |
| Grid re-wrap FLIP | `captureResultsLayout` → `playFlip` | `shouldAnimate()` at capture and at play |
| Selection block step | `useSelectionBlock` | its `shouldAnimate` option |
| List FLIP | `useListFlip` | `enabled` (the setting, never on low battery) and `shouldAnimate` |
| Preview pane slide | CSS `addon-slide-in` | reduce media query; the low-battery attribute |
| Result-layout and stagger entrances | CSS | classes off on low battery; reduce media query |

### 4. Validation & Error Matrix

| State | `shouldAnimate()` | `data-low-battery-motion` |
| --- | --- | --- |
| Neither switch | true | absent |
| On battery at 12% (threshold 20) | false | `'1'` |
| Plugged in again | true | removed |
| Reduced motion, changed to no-preference while mounted | false, then true | absent: CSS handles reduce |

### 5. Good / Base / Bad Cases

- Good: with reduced motion on, the preview pane, the grid re-wrap, the highlight and moved rows all
  land at once, and the search status shows as text.
- Base: on low battery the same, and CoreBox's own CSS transitions stop too.
- Bad: an `element.animate()` with no gate; a local `matchMedia` check or battery read beside the
  gate; a hook that calls `useMotionGate()` itself.

### 6. Tests Required

- `hooks/useMotionGate.test.ts`: open with neither switch; low battery closes it and sets
  `data-low-battery-motion="1"` on the window it runs in, and plugging in reopens it and removes the
  attribute; reduced motion closes it, including a change while mounted, without the attribute.
- `box/CoreBox.result-switch.test.ts` › "CoreBox motion gate": the grid FLIP captures before and
  plays after the pane opens; with low battery or reduced motion neither `captureFlipSnapshot` nor
  `playFlip` runs.
- Each consumer's own gate case: the selection block and list FLIP scenarios below, and
  `CoreBox.search-status.test.ts` for the status texts.

### 7. Wrong vs Correct

```ts
// Wrong: neither html[data-low-battery-motion] nor the reduce media query can stop this
playFlip(scrollContentRef.value, snapshot)

// Correct: asked at capture, and again when the deferred play runs
if (pendingFlipSnapshot || !isGridMode.value || listRef.value || !shouldAnimate()) return
void nextTick(() => {
  pendingFlipSnapshot = null
  if (shouldAnimate()) playFlip(scrollContentRef.value, snapshot)
})
```

## Scenario: The selection block (D8) and hover rule K

### 1. Scope / Trigger

- Changing `hooks/useSelectionBlock.ts`, `render/CoreBoxSelectionBlock.vue`, how `render/BoxItem.vue`
  paints its active state, hover or accent bar, the CoreBox hover-theme rules
  (`.CoreBoxResultHover-*`), or the list container's `position` / `isolation`.
- Why (list-motion D8, audit J/K): every row eased its own background (100ms) and accent bar (200ms)
  in and out, so a held arrow key left a trail of half-faded rows. Hover and selection fought: the
  theme's hover rule, `!important` at (0,4,0), painted over the selected row.

### 2. Signatures

```ts
// hooks/useSelectionBlock.ts
export const SELECTION_STEP_MS = 90
const SELECTION_STEP_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)' // flip-layout's; no overshoot
export const SELECTION_BLOCK_ATTR = 'data-selection-block' // on the list while the block shows a row
export const POINTER_IDLE_ATTR = 'data-pointer-idle' // on the CoreBox wrapper
const ACTIVE_ROW_SELECTOR = ':scope > * > .BoxItem.is-active'
function useSelectionBlock(options: {
  container: MaybeRefOrGetter<HTMLElement | null | undefined> // the list
  block: MaybeRefOrGetter<HTMLElement | null | undefined>
  focus: () => number
  items: () => readonly unknown[] // a new array is an update: land, never step
  shouldAnimate: () => boolean
  pointerIdleHost?: MaybeRefOrGetter<HTMLElement | null | undefined> // the CoreBox wrapper
}): { follower: ListFlipFollower } // handed to useListFlip
```

```vue
<!-- render/CoreBoxSelectionBlock.vue, the list's last child -->
<div class="CoreBox-SelectionBlock" data-flip-key="corebox-selection-block" data-flip="move" aria-hidden="true">
  <span class="CoreBox-SelectionBlock__accent" />
</div>
```

### 3. Contracts

- **Placement.**
  - One block per list, as its last child. `.item-list` is `position: relative; isolation:
    isolate`, so the block's `z-index: -1` paints under every row and over nothing outside the list.
  - The block has `pointer-events: none` and is `visibility: hidden` unless the list carries
    `data-selection-block`.
  - It covers the active BoxItem's border box, read from layout offsets
    (`offsetLeft` / `offsetTop` / `offsetWidth` / `offsetHeight` up to the list). Transforms are
    ignored, so a row in mid-FLIP is aimed at where it lands.
- **Writes.** The rest position goes to the individual `translate` property; `width` and `height`
  are written only when they change. Nothing goes through Vue: the block carries no `:style`.
  - Why `translate`: a WAAPI `transform` animation replaces an inline `transform` while it runs.
    With the rest in `translate`, both the step and the list FLIP animate `transform` on top of it,
    so the block rides its row's FLIP with the same delta.
- **Moves.** A post-flush watcher on `[focus, items]` decides: a new `items` array lands; focus
  moved by exactly one row steps; anything else is a jump, which lands. A `ResizeObserver` on the
  list lands as well, and does nothing when the box did not change, so a step in flight survives. A
  remounted list brings a new block, and every property is written again.
- **A step glides for `SELECTION_STEP_MS` only when** the block was showing a row, `shouldAnimate()`
  holds, at least 90ms have passed since the previous step or jump, and nothing is running on the
  block (a list FLIP). Otherwise it lands. Every write first cancels whatever runs on the block, so
  two motions never run together and a held key never trails.
- **Visibility.**
  - Shown only while an active default BoxItem exists.
  - A custom row keeps its own `.CoreBoxRender-Custom.active` primary outline; it and no selection
    (focus −1) hide the block and remove the attribute. The next show lands: there is nothing to
    glide from.
  - Widget and grid modes mount no list, so there is no block; tiles keep their own highlight.
- **The block replaces the row's paint.** While the list carries `data-selection-block`,
  `.BoxItem.is-active` is transparent and `.BoxItem__accent` is `display: none`. The block paints
  `--tx-bg-color` with the row's radius (`--corebox-result-radius`) and carries the accent bar
  (`--tx-color-primary`), so the bar moves with it. The row's own active background is a plain rule,
  not `!important`, so the attribute rule can win.
- **Rule K.**
  - `data-pointer-idle` goes on the CoreBox wrapper on any non-modifier `keydown` (document, capture
    phase; typing counts too) and comes off on a `mousemove` at a new screen position. Chromium can
    re-send a move at the same spot after a scroll or a re-layout; that is not the pointer coming
    back.
  - Hover never paints the active row and stays off while the pointer is idle:
    `.BoxItem:not(.is-active, .BoxItem--notice, [data-pointer-idle] *):hover` in BoxItem, and
    `.CoreBox-Wrapper.CoreBoxResultHover-*:not([data-pointer-idle]) .BoxItem:not(.is-active):hover`
    in CoreBox.
  - Hover colour is immediate: no `transition` on the row's `background-color` (its old
    `transition-colors duration-100` is gone). See [TuffEx Design
    Rules](./tuffex-design-rules.md#hover-colour-changes-are-immediate).
- It deliberately stays off `useJellyIndicator`: the keyboard steps it, it never retargets
  mid-flight, and a spring would lag behind key repeat. The exception is recorded in [Component
  Guidelines](./component-guidelines.md), "Sliding indicators ride `useJellyIndicator`".
- **Real device** (dev Electron over CDP, 120Hz, 2026-09-26):
  - a single step settles within 0.5px in about 58ms;
  - at a ~41ms key repeat the block tracks the selection with zero per-frame lag after the first
    step;
  - at a ~91ms repeat every step slides, and the lag is back to 0 before the next step (at most one
    row, 52px).

### 4. Validation & Error Matrix

| Event | Block |
| --- | --- |
| ↓ once | glides 90ms, ease-out without overshoot |
| ↓ held (repeats under 90ms apart) | each step lands; the running step is cancelled |
| A step while a list FLIP carries the block | the FLIP is cancelled; lands |
| A jump (a click on a file row further away, a reset to row 0 from further down) | lands |
| Results change under it, even by one row | lands on the selected row (a list FLIP may carry it) |
| The list resizes (the pane opens) | re-measured; only what changed is written (`width`); an unchanged box leaves a step in flight alone |
| Custom row, or focus −1 | hidden; the row paints itself |
| Grid or widget mode | no list, no block |
| Motion gate closed | every move lands |
| A key press, then the pointer rests over the list | no hover on any row until the pointer moves |

### 5. Good / Base / Bad Cases

- Good: ↓ held over 69 rows shows one highlight per frame and no trail, and the accent bar moves
  with the block.
- Base: the pointer rests over the list while the user arrows through it; rows slide under the
  pointer without lighting up.
- Bad: the rest position in `transform`; a CSS transition on the block; a `:style` binding on it;
  an `!important` active background; a colour transition on hover.

### 6. Tests Required

`hooks/useSelectionBlock.test.ts` (offsets stubbed per row, `HTMLElement.prototype.animate`
stubbed, `performance.now` driven by the test):

- Placement: for a 320px list, `translate` `8px 4px`, `width` `304px`, `height` `44px`, and the list
  attribute set. Across rows of 44, 60 and 44px, `height` is written `['44px', '60px', '44px']`,
  `width` once, `translate` once per move.
- Motion:
  - one step animates `[{ transform: 'translate(0px, -52px)' }, { transform: 'translate(0px, 0px)' }]`
    with `{ duration: 90, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }`;
  - steps 30ms apart land and cancel the running step; after 200ms the next step glides again;
  - a step during a FLIP cancels the FLIP and lands;
  - the gate closed, or a jump of two rows: lands;
  - results changing by one row: lands.
- Visibility: a custom row and focus −1 remove the attribute, and coming back lands at the right
  offset; grid mode removes the block, and a returning list rewrites every property.
- Resize: the observer watches the list; an unchanged box writes nothing and keeps the step; a list
  narrowed to 128px writes `width` (`112px`) alone.
- Pointer idle: ↓ sets it, a move clears it, `Meta` alone does not set it, `a` does, a move re-sent
  at the same spot does not clear it, and nothing listens after unmount.

### 7. Wrong vs Correct

```ts
// Wrong: the rest in `transform`; the FLIP's transform animation replaces it, and the block jumps
block.style.transform = `translate(${box.left}px, ${box.top}px)`

// Correct: rest in `translate`, motion in `transform` on top
block.style.setProperty('translate', `${box.left}px ${box.top}px`)
block.animate(
  [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
  { duration: SELECTION_STEP_MS, easing: SELECTION_STEP_EASING }
)
```

```scss
// Wrong: eased hover colour, and a hover that paints the selected row
.BoxItem { transition: background-color 100ms; }
.BoxItem:hover { background-color: var(--tx-fill-color-lighter); }

// Correct
.BoxItem:not(.is-active, .BoxItem--notice, [data-pointer-idle] *):hover {
  background-color: var(--tx-fill-color-lighter);
}
```

## Scenario: The list FLIP (G)

### 1. Scope / Trigger

- Changing `hooks/useListFlip.ts`, `playFlip` / `FLIP_EASING` in `hooks/flip-layout.ts`, the list
  rows' `data-flip-key` / `data-flip`, `resultTransitionEnabled` / `listFlipEnabled`, the
  `item-list--flip` rule, or `captureResultsLayout` (the grid FLIP) in `box/CoreBox.vue`.
- Why (list-motion D1/D3): a streamed batch or a refresh changes the list in one DOM update, and the
  rows under an insertion or a removal jumped.

### 2. Signatures

```ts
// hooks/useListFlip.ts
export const LIST_FLIP_DURATION_MS = 160 // ≤ 180 by R-G
const MIN_MOVE_PX = 0.5
interface ListFlipFollower { element: () => HTMLElement | null; row: () => HTMLElement | null }
function useListFlip(options: {
  container: MaybeRefOrGetter<HTMLElement | null | undefined> // the list; flip-keyed children are rows
  viewport: MaybeRefOrGetter<HTMLElement | null | undefined> // the scroller (TxScroll's root)
  items: () => readonly unknown[] // a new array is an update
  enabled: () => boolean // resultTransitionEnabled
  shouldAnimate: () => boolean
  follower?: ListFlipFollower // the selection block
  duration?: number
}): void

// hooks/flip-layout.ts: 'move' elements get a translate, eased with
const FLIP_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

// box/CoreBox.vue
const resultTransitionEnabled = computed(
  () => appSetting.animation?.resultTransition === true && !lowBatteryMode.value
)
const listFlipEnabled = computed(() => resultTransitionEnabled.value && shouldAnimate())
// <div ref="listRef" class="item-list" :class="{ 'item-list--flip': listFlipEnabled }">
//   <CoreBoxRender … :data-flip-key="item.id" data-flip="move" />
```

### 3. Contracts

- **The DOM lands first.** `useListFlip` captures in a pre-flush `watch(items)` and plays on
  `nextTick`, after the whole flush, so whatever post-flush watchers write (the selection block) is
  in place before rects are compared. Several updates in one tick play once, from before the first.
- **Only rows near the viewport are read**: those whose rect reaches within one viewport height
  above or below the visible part of the list, the first found by bisection. An 80-row list costs a
  handful of reads.
- **Positions are list-relative.** Rows are compared against the list's own rect at capture and at
  play, so a scroll between the reads (a new query scrolling to the top) is not a move.
- **Only rows that existed on both sides and moved at least 0.5px slide**, as a translate. A width
  change alone (the pane opening in the same update) is not a move. New rows are not animated: they
  are there at once and opaque, and the optional stagger is CSS.
- **An interrupted FLIP restarts from where the row is drawn.** Before reading new places, the
  script animations still running on the captured rows are cancelled. CSS animations and
  transitions, such as a row's stagger-in, carry `animationName` / `transitionProperty` and are left
  alone. Left running, an old slide is part of the new read, and the slide that replaces it starts
  short: the row jumped when a batch landed within 160ms of the previous one.
- **The follower rides its row.** The selection block is never read as a row. When its row moved,
  it is added with that row's delta, so one `playFlip` pass moves both with the same delta, duration
  and easing.
- **The grid FLIP never plays from a list.** `captureResultsLayout` returns while `listRef` is
  mounted. A grid replacing the list (a cleared query whose recommendations land as the pane closes)
  would otherwise morph tiles out of the full-width rows, which carry the same item ids.
- **Scroll anchoring.** While the FLIP can play, the list carries `item-list--flip` and only that
  list gets `overflow-anchor: none`. Rows landing above a scrolled list would otherwise be held
  still by the browser adjusting the scroll, and the FLIP, measuring against the list, would slide
  them in from a place they were never drawn. With the FLIP off, default anchoring keeps the rows on
  screen where they are, so no other element in CoreBox turns it off.
- **Default off.** `appSetting.animation.resultTransition` defaults to `false`
  (`packages/utils/common/storage/entity/app-settings.ts`). The user runs with it on, so the FLIP is
  live there. D1/D3 turns it on by default only after a CDP Performance recording with and without
  it shows under 5% dropped frames and no long task over 50ms; that measurement is still pending, and
  goes to the task's `research/perf.md`. The informal 120Hz sample (8.6ms mean frame, five gaps over
  20ms in 4.2s, during a full scan right after a restart) is not it.

### 4. Validation & Error Matrix

| Update | Result |
| --- | --- |
| A pinned arrival or a reconcile removal moves rows | the moved rows slide 160ms from their old place |
| Rows appended below | nothing slides: append-only moves no row above |
| A second batch within 160ms | slides restart from where the rows are drawn; the old ones are cancelled |
| A scroll to the top between the reads | no slide |
| The pane opens in the same update | no slide for the width change |
| A row's CSS stagger-in is running | untouched |
| List replaced by a grid | the list plays nothing (its rows are gone); the grid FLIP is skipped |
| Setting off, or gate closed | no reads, no plays; default anchoring |

### 5. Good / Base / Bad Cases

- Good: a deferred batch lands a pinned row on top; the rows below slide down together, the
  highlight rides its row, and nothing fades.
- Base: the setting is off; the same batch lands in one frame and anchoring keeps the rows in view.
- Bad: reading every row; comparing window coordinates; leaving the previous slide running; turning
  anchoring off for the whole window; animating new rows from transparent.

### 6. Tests Required

- `hooks/useListFlip.test.ts`:
  - › "useListFlip": only the moved rows (`b`, `c`) slide from `translate(0px, -52px)` with
    `{ duration: LIST_FLIP_DURATION_MS, easing: FLIP_EASING }`, and `LIST_FLIP_DURATION_MS ≤ 180`;
    40 rows with 20–23 visible: rows 16–27 slide, and rows far from the view (0–9, 29, 30, 35, 39)
    are never read; a scroll between the reads, or a width change alone, plays nothing; setting or
    gate off reads and plays nothing.
  - › "with the selection block": the block gets the row's keyframes and options in the same pass;
    it is not carried when the selection lands on a row that did not move; it is never read as a
    row, hidden or not.
  - › "over a slide still in flight": rows restart from where they are drawn (`-104px`) with one
    running animation each; the block starts from where its row is drawn; a CSS stagger-in is not
    cancelled.
- `hooks/flip-layout.test.ts`: `computeFlipDelta`, the scale keyframes, `playFlip` on rows and tiles.
- `box/CoreBox.result-switch.test.ts` › "CoreBox list scroll anchoring": the class follows the
  setting, low battery and reduced motion, and the compiled SFC CSS holds exactly one
  `overflow-anchor` rule, `.CoreBoxRes-Main > .scroll-area .item-list.item-list--flip { overflow-anchor: none }`.
  › "CoreBox motion gate" › "does not play the grid FLIP from the list a grid replaces as the pane
  closes".

### 7. Wrong vs Correct

```ts
// Wrong: window coordinates, and the previous slide still running during the read
const dy = before.top - row.getBoundingClientRect().top

// Correct: cancel script slides first, then compare within the list
for (const key of entry.rects.keys()) cancelSlides(rows.get(key))
const dy = before.top + (origin.top - entry.origin.top) - after.top
```

```scss
// Wrong: anchoring off everywhere, whether or not a FLIP can play
.CoreBox-Wrapper * { overflow-anchor: none; }

// Correct: only the list the FLIP moves, only while it can play
.CoreBoxRes-Main > .scroll-area .item-list.item-list--flip { overflow-anchor: none; }
```

## Scenario: The preview pane holds the last file (R-A)

### 1. Scope / Trigger

- Changing `addonType`, `addonItem`, `addonQuery`, `rowsQuery`, `PREVIEW_CLOSE_DELAY_MS` or the
  `activeItem` watcher in `box/CoreBox.vue`; anything that reads them (`compressed`,
  `gridAvailableWidth`, `BoxGrid :compact`, the grid FLIP watchers, `revealActiveItemAfterReflow`,
  `handlePreviewOpen` / `handlePreviewOpenWith`); or `render/addon/TuffItemAddon.vue`'s slide-in.
- Why (list-motion D2): the pane followed the selection, so every arrow step across a list mixing
  files and apps flipped the results column between 100% and 40% width, and each open faded the
  pane in from transparent.

### 2. Signatures

```ts
// box/CoreBox.vue
const PREVIEW_CLOSE_DELAY_MS = 200
const addonType = ref<'preview' | undefined>(undefined)
const addonItem = shallowRef<TuffItem | undefined>(undefined) // the file the pane shows
let addonQuery = '' // the query addonItem was selected under
let rowsQuery = searchVal.value // the query the rows on screen answer
watch(res, () => (rowsQuery = searchVal.value), { flush: 'sync' })
watch(activeItem, (item) => { /* open, hold or close */ }, { immediate: true })
```

### 3. Contracts

- **Open at once.** Selecting a file opens the pane on it, or switches the open pane to it, and
  cancels a pending close.
- **Close after a rest.** Off files, the pane stays open showing the last file, not the row selected
  now, until the selection has rested off files for 200ms. Every off-file step restarts the wait.
  The results column flips at most once per rest.
- **Close at once when there is nothing to go back to**: no row selected, or the rows were replaced
  (`rowsQuery !== addonQuery`) and the file is not among them.
- **Freeze while another query's rows are up.** The watcher ignores the selection while `loading &&
  searchVal !== rowsQuery`. A new query moves the selection to row 0 while the previous rows are
  still up, and a cleared query keeps them until the grid lands; row 0 there belongs to the query the
  user just left. `rowsQuery` is written with `flush: 'sync'` so the pre-flush `activeItem` watcher
  never reads it a render late.
- A same-query refresh whose fast snapshot drops the file for a moment is ridden out; with the
  same-query merge the row normally stays anyway.
- **Everything downstream reads `addonType` / `addonItem`, never the selection.** That covers the
  `compressed` class, `gridAvailableWidth`, `BoxGrid :compact`, the grid FLIP capture, the grid's
  reveal-after-reflow, and `TuffItemAddon :type` / `:item`. The pane's open control executes
  `addonItem`, and open-with uses its path: the file the pane shows, even while the pane waits to
  close.
- **Motion.** `.CoreBoxRes-Main.compressed { width: 40% }` switches in one layout pass, with no
  width transition. `.TuffItemAddon.show` (60%) plays `addon-slide-in`, 0.22s, `transform:
  translateX(16px)` to `none`: a translate only, never from `opacity: 0`, because the content is
  ready. It plays when `.show` is added, so switching between files does not replay it. Reduced
  motion sets `animation: none`; low battery stops it through the global attribute.
- The close timer is cleared on unmount.

### 4. Validation & Error Matrix

| Sequence | Pane |
| --- | --- |
| app → file | opens on the file at once, one slide-in |
| file → app | keeps the file; closes 200ms after the selection rests off files |
| app → file → app → file, 50ms apart | switches files; one slide-in for the whole walk |
| A sweep over four apps, 150ms apart | open on the last file until 200ms after the last step |
| A new query whose rows lack the file | closes at once |
| A cleared query while the grid loads | unchanged; never previews the old row 0 |
| A refined query loading, selection reset to row 0 | keeps the user's file; closes at once when rows without it land |
| A same-query refresh drops the file, then returns it | stays on the file; no second slide-in |
| The open control while the pane waits to close | opens the file shown, not the selected app |
| Unmount with a close pending | the timer is cleared |

### 5. Good / Base / Bad Cases

- Good: ↓ held across a mixed list keeps the pane open and switching files; it closes once, after
  the selection rests on an app.
- Base: selecting a file row opens the pane with a 16px slide and no fade.
- Bad: `addonType` computed from the current selection; the pane previewing a file from the rows a
  cleared query left up; a width transition on the column; an `opacity: 0` slide-in.

### 6. Tests Required

- `box/CoreBox.result-switch.test.ts` › "CoreBox preview pane" (fake timers; the pane stub reports
  its `type` and `item`, and counts opens): the rows of the matrix above.
- `render/addon/TuffItemAddon.motion.test.ts`, on the sass-compiled style: `addon-slide-in` animates
  `transform` and nothing else; it runs on `.TuffItemAddon.show`, and the reduce media query sets it
  to `none`.
- `box/CoreBox.refresh-reconcile.test.ts`: the pane stays on the selected file through a refresh.

### 7. Wrong vs Correct

```ts
// Wrong: the pane follows the selection; every step across a mixed list flips the column
const addonType = computed(() => (activeItem.value?.kind === 'file' ? 'preview' : undefined))

// Correct: open at once, close after a 200ms rest, frozen while another query's rows are up
if (loading.value && searchVal.value !== rowsQuery) return
if (item?.kind === 'file') { cancelAddonClose(); addonItem.value = item; addonQuery = rowsQuery; addonType.value = 'preview'; return }
addonCloseTimer = setTimeout(closeAddon, PREVIEW_CLOSE_DELAY_MS)
```

```scss
// Wrong: fades in content that is ready
@keyframes addon-slide-in { from { opacity: 0; transform: translateX(16px); } }

// Correct
@keyframes addon-slide-in { from { transform: translateX(16px); } to { transform: none; } }
```

## Scenario: Same-name file rows show their folders (R7.1)

- **Trigger.** Changing `render/duplicate-file-names.ts`, the folder label in
  `render/ItemSubtitle.vue`, or the `provideDuplicateFileFolderLabels(res)` call in
  `hooks/useSearch.ts`.
- **Why** (refresh-churn D-b): a file row's subtitle names only its folder, so the KaTeX font that
  every Vite build copies into `assets` showed as two identical rows.
- **Wiring.** `useSearch` calls `provideDuplicateFileFolderLabels(res)` during CoreBox's setup;
  outside a component (useSearch's bare unit tests) it does nothing. `ItemSubtitle` injects
  `DUPLICATE_FILE_FOLDER_LABELS` (default `null`) and shows `labels.get(item.id) ??
  displayParentName(path)`. Renderer only: main's item structure is unchanged.
- **Who gets a label.** File rows (`source.type === 'file'` or `kind === 'file'`) with a
  `meta.file.path`, grouped by the name they display (`render.basic.title`, not the path). Only
  groups of two or more; every other row keeps its folder name.
- **The label.** The last `FOLDER_LEVELS = 2` directories after `…` (`…/renderer/assets` beside
  `…/dist/assets`). A row goes up one more level only while a different directory still reads the
  same; a shallow directory shows whole; a path written only with `\` keeps it.
- **Cost.** Each level labels every unresolved row once and groups directories by label: one pass
  per level, not one per pair, about 0.1ms for 80 rows. It reruns on every change to `res`, so keep
  it that way.
- **It follows the rows on screen.** A later batch that makes two rows share a name labels both,
  and a new query parts them again.
- **Tests.** `render/duplicate-file-names.test.ts`: only repeated names; beyond two levels only
  where needed; Windows separators; shallow directories whole; the displayed name, not the path; a
  page of 78 same-name rows, each at the fewest levels it needs.
  `hooks/useSearch.duplicate-names.test.ts` (real `useSearch` and `ItemSubtitle`): only same-name
  rows show folders; labels follow the rows across batches and queries.

## Scenario: Action feedback placement (renderer side)

- **Trigger.** Changing where CoreBox shows or announces an action's outcome: `CoreBoxFooter`'s
  `onScreen` or `.FooterFeedback`, CoreBox's `footerOnScreen` / `headerActionFeedback`,
  `.CoreBox-ActionFeedback`, `.CoreBox-ActionFeedback-Live`, or
  `renderer/modules/box/meta-actions/footer-feedback.ts`. Who writes the feedback, and how failures
  are logged, is [corebox-meta-overlay-contracts.md](../main-process/corebox-meta-overlay-contracts.md),
  "Keys, execution failures and feedback".
- **One message.** `showCoreBoxFooterFeedback(message, tone)` holds it for
  `COREBOX_FOOTER_FEEDBACK_MS` (1200); a newer one replaces it and restarts the clock. No toast:
  CoreBox mounts no toast host.
- **The footer while it is on screen.** `CoreBoxFooter` exposes `onScreen` (`defineExpose`): slid
  in, or a file index building. It draws the outcome only then. A footer parked below the results
  (a plugin widget, an item hiding every hint) draws nothing, and says it left only when it slides
  out, after its 100ms debounce.
- **The header otherwise.** `headerActionFeedback = footerOnScreen ? null : actionFeedback` draws
  `.CoreBox-ActionFeedback` first in `.CoreBox-Configure`, when there is no footer (plugin UI mode,
  no rows) or a parked one.
- **One announcer.** `.CoreBox-ActionFeedback-Live` (`sr-only`, `role="status"`,
  `aria-live="polite"`) is a direct child of `.CoreBox-Wrapper`, before `div.CoreBox`. It is always
  mounted, because a live region only announces changes to an element that already exists, and it
  sits outside the header because a header-less DivisionBox hides `div.CoreBox`. The footer and
  header copies are visual only, so a message moving between them is not announced twice.
- **Not colour alone.** Each copy pairs the glyph (`i-ri-checkbox-circle-line` or
  `i-ri-error-warning-line`) with the words.
- **Tests.** `render/CoreBoxFooter.feedback.test.ts` (the outcome replaces the item and gives it
  back; a failure carries the error glyph; replacement restarts the clock; `onScreen` for a shown
  item, false when parked, true at once while indexing, false only after the slide-out).
  `box/CoreBox.search-status.test.ts` › "CoreBox action feedback" and "… with the real footer"
  (header in plugin UI mode, with no rows and behind a parked footer; exactly one live region says
  the message, outside the header; moving it does not announce it again).

```vue
<!-- Wrong: a live region in the header (hidden with it in a DivisionBox), or on each copy (announced twice) -->
<span class="CoreBox-ActionFeedback" role="status">{{ headerActionFeedback.message }}</span>

<!-- Correct: one always-mounted announcer on the wrapper; the copies are visual -->
<span class="CoreBox-ActionFeedback-Live sr-only" role="status" aria-live="polite">{{ actionFeedback?.message ?? '' }}</span>
```

## Rejected designs: do not reintroduce

| Design | Why it was removed |
| --- | --- |
| `<Transition mode="out-in">` around the result branches, or a delayed reveal class | The next branch mounts only after the old one's frames; the footer shows the new item first and search reads as slow (8f34ba297; [component guidelines](./component-guidelines.md#ready-results-must-not-wait-for-reveal-motion)) |
| Re-keying the list container per batch or per query | Tears down every row and repaints from blank: the switch flicker (5f44512ca) |
| `opacity: 0` or `blur()` in an entrance, the preview pane's included | Hides content that is ready (8f34ba297); blur is costly on the renderer (89e1f5963) |
| Transitions on the results column width, tile padding or the pane width | Re-lays out every row and repaints the preview image per frame (e6d7411aa); the column switches in one pass and FLIP or translate moves what is in it |
| An uncapped list stagger | `STAGGER_MAX_TOTAL_DELAY_S = 0.18` fits the 320ms class window; uncapped, row 79 waited ~4.3s and then snapped (`box/stagger-delay.ts`) |
| A "searching" or "indexing" placeholder in the results area | 07-15 decision (b80730046): the header glow and its status texts are the only searching cue |
| Smooth scrolling for keyboard navigation | Lags behind a held key, and native and BetterScroll scrolling disagree |
| Continuous animation of `filter`, `background-position`, a custom property or a size | The renderer main thread is the bottleneck while searching |
| `animation.coreBoxResize` on by default | Main drives it with a 16ms poll that inherits every main-loop stall |
| Re-ranking rows across batches in the renderer | User decision 2026-09-26: rows on screen keep their place |
| A spring (`useJellyIndicator`) for the selection block | Lags behind key repeat; see the selection block scenario |

## Verification

```bash
cd apps/core-app
node_modules/.bin/vitest run src/renderer/src/views/box src/renderer/src/modules/box/adapter/hooks src/renderer/src/components/render
node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json --composite false
```

Call the binaries directly: `pnpm run` can trigger an install through verify-deps, and
`typecheck:web` rebuilds the shared tuffex dist.

What jsdom cannot show, and how the tests stand in for it:

- No layout: stub `offsetTop` / `offsetLeft` / `offsetWidth` / `offsetHeight` and
  `getBoundingClientRect` per row.
- No Web Animations: stub `HTMLElement.prototype.animate` (and `getAnimations` where a test needs
  running slides) and assert keyframes and options.
- No `:hover`, no scroll anchoring, and vitest leaves SFC styles uncompiled: assert the classes and
  attributes on a mounted CoreBox, and the rule in the sass-compiled `<style>` block (as "CoreBox
  list scroll anchoring" and "TuffItemAddon slide-in" do).

In the real window (dev Electron over CDP on port 9333; the instance is shared, so coordinate before
attaching):

- ↓ held on a list of 60+ rows, frame by frame: one highlight per frame and no trail; the block's
  offset from the selected row as in the selection block scenario.
- ↓ swept across a mixed list: the results column flips width at most once per rest.
- A deferred-layer insertion with `animation.resultTransition` on: rows slide, they do not jump.
- Opening CoreBox and clearing the query: no empty frame between the old grid and the new one.
- Still pending: the CDP Performance recording that decides the list FLIP default, written to
  `.trellis/tasks/09-25-corebox-list-motion/research/perf.md`.
