# Recommendation Freshness Contracts (installedAt / novelty)

## Scenario: consuming or extending the app install-time signal

### 1. Scope / Trigger

Anything reading app install time, adding recommendation candidate dimensions, or
touching recommendation cache invalidation. Introduced by 08-06-reco-item-freshness.

### 2. Signatures

- Write side: `APP_INSTALLED_AT_EXTENSION_KEY = 'installedAt'` (app-provider.ts),
  `ScannedAppInfo.createdAt?: Date` (validated by `resolveScannedAppCreatedAt`:
  birthtime > 0 and ≤ now + 24h), `processAppPath(options.discovery: 'watch' | 'scan')`.
- Read side: `parseInstalledAt` / `loadInstalledAtByFileId` via
  `appCatalogDbUtils.getFileExtensionsByFileIds(ids, ['installedAt'])`.
- Default destination identity: `APP_DESTINATION_PROVIDER_ID`,
  `APP_DESTINATION_ITEM_ID_PREFIX` and `APP_DESTINATION_ITEM_IDS` in `shared/app-destinations.ts`.
  The provider and recommendation pool share them; main-window keeps its existing bare id.
- Query ranking: `tuff-sorter.ts` adds 90,000 only when the source is the host's
  `APP_DESTINATION_PROVIDER_ID` and the item id matches the destination resolved
  from the current query. The bonus is below the smallest app-intent bonus
  (180,000); it does not change aliases, pin partitions, usage history, or the
  empty-query recommendation pool. Rebuilt items use the same identity check.

### 3. Contracts

- **Storage**: primary-db `file_extensions` row on the app's `files` row; value is
  `String(Date.getTime())` — positive-integer epoch-ms string.
- **Write-once**: written on first index, never refreshed. Enforced at the write layer
  with `INSERT … ON CONFLICT (file_id, key) DO NOTHING` — callers' extension maps are
  not trustworthy (the bulk upsert path passes `EMPTY_APP_EXTENSION_MAP` even for rows
  it just updated). `DO NOTHING`'s conflict target requires the `(fileId, key)` PK that
  `file_extensions` declares; keep both in sync.
- **Fallback**: no valid birthtime → write `now` only when `discovery === 'watch'` AND
  a `files` row was actually inserted; full scans without birthtime write nothing.
- **Freshness predicate is a double gate**: `installedAt ≤ 7d` AND `files.ctime ≤ 7d`.
  `files.ctime` means "first indexed" (insert-only, absent from every
  `onConflictDoUpdate` set — keep it that way). Gate 1 alone misclassifies a fresh
  Touch install on an old machine; gate 2 alone misclassifies app self-updates
  (bundle rebuild refreshes fs birthtime).
- **Novelty handoff**: boost = `noveltyFactor(age) * NEWLY_INSTALLED_WEIGHT`, only while
  `executeCount === 0`; factor is 1 through 48h, linear to 0 at 7d. First execution
  hands ranking back to frecency; the item may still enter via frequent/recent.
- **Label rule (decided 2026-08-06)**: dimension-6 candidates keep
  `source: 'newly-installed'` even with `executeCount > 0` (it is the true reason they
  entered the pool); dedupe only promotes an existing candidate's source when
  `executeCount === 0` (a dead boost must not claim to be the ranking reason).
- **`recommendation.source` has ONE source of truth (since 09-04)** —
  `RECOMMENDATION_SECTION_ORDER` in `core-box/recommendation.ts`, with
  `type RecommendationSource = (typeof RECOMMENDATION_SECTION_ORDER)[number]`.
  It previously lived as three hand-maintained literal unions
  (`ScoredItem`, `core-box/tuff/tuff-dsl.ts`, and `transport/events/types/core-box.ts`
  — the one that crosses IPC); they had already drifted, and
  `RecommendationBadge.variant` was missing `'plugin'` while `generateBadge` emitted it
  (hidden by a loose `{ variant: string }` return type). All three now reference
  `RecommendationSource`. **Add a source by appending to the array, never by widening a
  consumer's union.**
- **Reasons do not partition the display.** `RECOMMENDATION_SECTION_ORDER` defines the reason
  vocabulary, not visual ordering. `buildContainerLayout()` slices the single pinned-first,
  score-ranked sequence into five grid items and the remaining list items. A new source still
  needs a badge entry, checked by `recommendation-presentation.test.ts` and the
  `Record<ScoredItem['source'], …>` type of `RECOMMENDATION_BADGES`.
- **Cache invalidation**: `invalidateCache()` correctness = synchronous read guard
  (`cacheInvalidatedAt` rejects older rows) + generation counter (a recommend() started
  before invalidation may not write back to any layer). The aux `recommendation_cache`
  row deletion runs with `dropPolicy: 'drop'` — it is cleanup, never the mechanism.
  Index-commit trigger fires only for `providerIds` containing `APP_INDEXED_SOURCE_ID`.
- **Candidate-shape cache versions.** Persisted keys begin with `reco-v<schemaVersion>` (currently
  3), followed by local date/hour/minute, time-source availability, source-app identity, semantic
  settings and pin signature. A different app or clock window must not reuse learned-scene recall.
  Clipboard, selection and transient system-state effects remain per-request and idempotent.
- **Evidence must be verifiable or absent.** `meta.recommendation.evidence` carries only
  facts the DB actually holds (`executeCount`, `lastExecutedAt`, `installedAt`, `peakHourRange`,
  `yesterday`, `sourceApp`). Counts and dates are validated and omitted when
  unavailable; an all-empty evidence object is dropped entirely so the renderer prints
  nothing rather than a placeholder. The dated fields come from the batch behaviour read
  (`scored.behavior`), never from the stored aggregate: a legacy row's `lastExecuted` can
  predate the entry fix, so quoting it would date a "recent"/"peak" claim to an execution
  the ledger never accepted (R9). `resolvePeakHourRange` (recommendation-utils.ts) takes
  the 30-day histogram plus `activeDays30` / `executeCount30`, returns `null` below 10
  samples, when the best 3-hour window holds <40% of them, or below the shared gate
  (≥3 distinct local days and ≥10 executions in 30d) — a weak peak is no peak, not a
  rounded one. Source-app and yesterday evidence come from the accepted ledger joined to
  `usage_logs` by `event_id`; legacy logs alone cannot confer a dated recommendation.
- **The automatic score is one bounded budget, including recency.** The engine sums
  `calculateBehaviorScore(behavior)` (0..80 saturated) + `calculateTimeContribution(behavior, time)`
  (0..20, evidence-gated) + `calculateRecencyBoost(lastExecutedAt)` and clamps the total with
  `Math.min(BEHAVIOR_SCORE_MAX, …)` (`BEHAVIOR_SCORE_MAX = 100`) before multiplying by
  `BEHAVIOR_SCORE_WEIGHT`. The recency term is at most 10 points (`10 * exp(-0.1 * hoursSince)`) and
  only uses `behavior.lastExecutedAt`, so a reliable date is required. It used to be worth 100, which
  let one recent execution alone saturate the automatic budget and drown sustained habits; the cap is
  now 10. Comparing an item with a real run against one without must not let recency alone reach 100.
  A fully established habit's 100 lands at the same 1e6 scale as the old `executeCount * 1e4`
  asymptote, so effective scores are comparable.
- **One sequence, two presentations.** Pinned items keep their explicit order first; the other
  items follow final score order. The first five identities form `habitual`, the remainder
  `proposed`. Files, folders and plugin items may enter either presentation. The visible titles
  remain 此刻常用 / 最近案例. Placement does not confer a frequent label: the old
  `frequentEligible` display flag, kind exclusions and ghost/pinning guidance are removed.
  Fewer than five candidates stay fewer; global selection and quick-key indices never reset.
- **Learned scene recall is bounded and local.** `getRecommendationHistory()` reads up to 10,000
  accepted events in the trailing 30-day window and declines a larger incomplete sample. The
  source-app channel compares conditional target share with its global share in that same window;
  it requires three executions over two distinct local days and more than five percentage points
  of preference gain. The gate compares integer count cross-products against 1/20, so floating
  subtraction cannot turn an exact five-point boundary into a preference. Confidence dampens sparse
  evidence. Source-app contribution is at most 25
  points, yesterday at most five; their maximum is added once to the unchanged 100-point automatic
  budget. Preset volatile matches are capped at ten behaviour-equivalent points, not a dominant band.
- **Yesterday is a local-calendar claim.** Recall uses `setDate(-1)` and an inclusive one-hour
  neighbourhood of the current clock, clipped to the actual previous civil date. Adjacent-day,
  future and expired events cannot claim yesterday. `timeAvailable: false` disables yesterday and
  all time-derived contributions without disabling source-app preference.
- **Joint reasons require joint evidence.** `sourceApp.timeWindow` counts only executions from
  that app in the current clock neighbourhood. Five joint executions over three distinct days
  permit a combined app/time habit label. Separate source counts and global hour peaks cannot be
  joined into a claim that never happened. A weaker source preference may say “used”, not “often”.
- **One activation, one source.** CoreBox captures before show, retains the source until hide,
  rejects self/late captures, and waits on actual pending readiness for at most 300ms, below the
  renderer's 400ms recommendation response budget. Cold OS reads must not be discarded at 40ms.
  A main-owned source promise travels
  with the retained search trace; execution uses async-local context so hide or a later activation
  cannot change the original action's source. Explicit `previousApp: null` stays unknown. Clipboard
  apply captures before automation hides. No OS-wide activity monitoring or new history table is added.
- **Default settings are suggestions, not fabricated habits.** An empty query always nominates
  three searchable destinations (`settings-general`, `settings-appearance`, `settings-channels`),
  even with sparse history. They use `source: 'cold-start'` and empty usage statistics. Real usage
  dimensions arrive first, so dedupe keeps an existing destination's evidence rather than replacing
  it with an empty row. Their final position follows the same ranking as every other candidate;
  a suggested setting in the first five remains a suggestion, never a fabricated habit.
- **The default priority is small and bounded.** Only unused host-nominated destinations receive
  the 5e3 term, above the 1e3 cold-start catalogue band and below established dated behaviour and
  pin priority. Volatile context and novelty retain their own precedence; do not promise an absolute
  ordering against every old aggregate. Execution uses the existing destination provider and
  navigation service, including accepted-execution recording, not a new recommendation-only route.
- **A post-notification consumer read must not regress to an older aggregate.** The
  `usageChanged` payload's `executeCount` is the committed epoch fact. A consumer that
  re-reads the richer aggregate right after that notification passes it as a floor
  (`ApplicationIndex.loadUsage(path, committedExecuteCount)`); when the reply is lower the
  whole reply is dropped, so it neither overwrites the committed count nor mixes an older
  distribution into it. Ordinary selection and explicit reads pass no floor, so a
  legitimate retention/cleanup drop still shows. This is a per-epoch guard, not a global
  `Math.max` that pins history.
- **Exposure slice tags**: extra rows keyed `surface + ':newly-installed'`; base surfaces
  must never contain `:` (readSliceTag splits on it). `getHitRate(days)` sums base
  surfaces only; pass the tag to read a slice.

### 4. Validation & error matrix

| Condition | Outcome |
|---|---|
| installedAt overwritten on rescan | updates masquerade as installs — forbidden by DO NOTHING |
| Only one freshness gate applied | old machines' first scan or self-updates flagged as new |
| union extended in <3 files | fixed at the root: extend `RECOMMENDATION_SECTION_ORDER` instead |
| evidence field fabricated (0, `Date.now()`, guessed peak) | forbidden — omit the field, or the whole evidence object |
| extension read fails | degrade to ctime ordering (`loadInstalledAtByFileId` swallows), never empty grid |
| Sparse history | Keep real candidates and default suggestions; rank them once and never manufacture usage or habit reasons |
| Destination already has real usage | One candidate retains that history; the default nomination does not replace it |
| Persisted key belongs to an older candidate schema | Recompute under the current version; do not serve the old shape |

### 5. Tests required

Contract anchors: `app-provider.install-time.test.ts` (write rules incl. EMPTY-map
never-overwrite), engine tests "treats an app as new only when…" (four-quadrant gate),
"hands ranking back to frecency…", "orders the cold-start catalog by install stamp
rather than index time" (discriminating fixture: ctime and stamp point opposite ways —
a stub without `getFileExtensionsByFileIds` silently tests the degraded path),
`search-core.contracts` app-vs-file commit invalidation, exposure slice isolation tests.
For the source union / evidence contracts (09-04):
`recommendation-presentation.test.ts` "has a badge for every source the scorer can record"
(the earlier `item-rebuilder.test.ts` "distinct badge and reason" assertion no longer
exists), `recommendation-utils.test.ts` peak-hour boundaries (9-vs-10 samples, exactly-0.4
share, midnight wraparound, too-few-active-days), renderer
`components/render/recommendation-evidence.test.ts` covers absent/future facts and truthful
source-app/yesterday/joint claims. `recommendation-context-history.test.ts` covers calendar/DST,
conditional preference, cross-day gates, disabled time signals and the bounded scene contribution.
Engine, accepted-history, retained-source and `BoxGrid` consumer tests cover unified ordering,
mixed kinds, cache isolation, unchanged headings and accepted execution attribution.
The engine's cache and sparse-history regressions cover context/pin isolation, invalidation, default
settings and real-history dedupe through returned items, not exact cache-key strings or full-list
incidental ordering. Real CoreBox acceptance opens an empty query and executes a default setting
from a different main-window route; seeing the destination in a list alone is not navigation proof.
