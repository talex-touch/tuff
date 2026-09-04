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
- **The array is also the render order.** `buildContainerLayout()` iterates
  `RECOMMENDATION_SECTION_ORDER` to emit sections, so array position = the order the
  user sees, and reordering it is a user-visible behavior change (that is how pinned
  moved from bottom to top). Appending a source without a `getReasonLabel` /
  `generateBadge` entry is caught by the badge-uniqueness test in
  `item-rebuilder.test.ts`, which asserts all 9 sources have distinct badges and reasons.
- **Cache invalidation**: `invalidateCache()` correctness = synchronous read guard
  (`cacheInvalidatedAt` rejects older rows) + generation counter (a recommend() started
  before invalidation may not write back to any layer). The aux `recommendation_cache`
  row deletion runs with `dropPolicy: 'drop'` — it is cleanup, never the mechanism.
  Index-commit trigger fires only for `providerIds` containing `APP_INDEXED_SOURCE_ID`.
- **Evidence must be verifiable or absent.** `meta.recommendation.evidence` carries only
  facts the DB actually holds (`executeCount`, `lastExecutedAt`, `installedAt`,
  `peakHourRange`). Every field is `Number.isFinite` + `> 0` guarded and omitted when
  unavailable; an all-empty evidence object is dropped entirely so the renderer prints
  nothing rather than a placeholder. `resolvePeakHourRange` (recommendation-utils.ts)
  returns `null` below 10 samples or when the best 3-hour window holds <40% of them —
  a weak peak is no peak, not a rounded one. There is **no app co-occurrence signal**
  anywhere in this codebase; do not add "used after X" copy without first adding the data.
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

### 5. Tests required

Contract anchors: `app-provider.install-time.test.ts` (write rules incl. EMPTY-map
never-overwrite), engine tests "treats an app as new only when…" (four-quadrant gate),
"hands ranking back to frecency…", "orders the cold-start catalog by install stamp
rather than index time" (discriminating fixture: ctime and stamp point opposite ways —
a stub without `getFileExtensionsByFileIds` silently tests the degraded path),
`search-core.contracts` app-vs-file commit invalidation, exposure slice isolation tests.
For the source union / evidence contracts (09-04):
`item-rebuilder.test.ts` badge-and-reason uniqueness across `RECOMMENDATION_SECTION_ORDER`,
`recommendation-utils.test.ts` peak-hour boundaries (9-vs-10 samples, exactly-0.4 share,
midnight wraparound), `recommendation-evidence.test.ts` "says nothing when there is no
evidence" and the future-timestamp case.
