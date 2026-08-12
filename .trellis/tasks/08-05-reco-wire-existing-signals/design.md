# Design: wire existing recommendation signals (R2)

Source: parent research/reco-signals-audit.md + reco-signal-program.md. R1 landed
(856f89b85): identities unified, order restored, foreground snapshot exists.

## Decisions (locked)

D1 **hourDistribution into time relevance.** `calculateTimeRelevanceScore`
(recommendation-utils) blends hour affinity: `0.5*existing(timeSlot/dayOfWeek) +
0.5*(dist[currentHour]/max(dist))`, 0 when the distribution is empty. Constants
named, tests cover empty/uniform/peaked distributions.

D2 **Cache key = slow context only; volatile applies post-cache.**
`generateCacheKey` keeps ONLY {timeSlot, workday/weekend, isOnline}. Foreground app,
clipboard, battery, powerMode, DND, network id leave the key. Engine scoring splits
into a stable stage (cached with candidates) and a volatile stage (contextMatch /
foregroundApp / systemState components) recomputed per request over the cached list
(bounded by candidate cap) then re-sorted. The 15-min background refresh must
produce user-path cache hits afterwards — assert via the existing perf/cacheLayer
counters in a test and keep the counter visible in diagnostics.

D3 **Cold start never empty.** When candidates are empty pre-fallback: top apps from
the files table (recently installed first) + recent files, marked
`meta.recommendation.source = 'cold-start'`. Test: fresh DB with apps → non-empty.

D4 **Aggregation goes incremental.** On the existing usage-queue drain path, bump
`item_time_stats` buckets additively (same write lanes/contracts). The 24h
full-table absolute rebuild retires to a gated repair path (config-flag guarded,
default off). Pruning `usage_logs` no longer erases distributions — test proves
stats survive log deletion. Fold in E-NEW5: `backfillTrendDay`'s direct upsert moves
onto `scheduleDbWrite`.

D5 **Selection + clipboard window.** Context provider ingests the latest
selection-capture text (same tier as clipboard: hashed/typed, new settings toggle,
default on per user's local-processing stance). Clipboard freshness window 5s → 30s.

D6 **Timezone-change signal.** Persist last-seen timezone (config); expose a
`timezoneChanged` boolean (true within 48h of a change) + semantic token.

D7 **Cleanups.** Bluetooth signal + its settings toggle removed;
`upsertItemTimeStats` deleted; foreground/bundleId matchers accept path-form item
ids (match on basename when the id is a path).

D8 **hit-rate@k groundwork (R9).** Renderer reports shown recommendation ids
(batch, fire-and-forget) when `applyRecommendationResult` renders; main keeps a
session-scoped exposure set and per-day aggregate counters {impressions@k,
clicks@k} in the aux DB (scheduleAuxWrite; new small table via drizzle migration,
follow the existing aux migration pattern). Click = recordExecute on an exposed id.
Ids and counts only — no content. Read side exposed through the existing
diagnostics surface.

## Out of scope / boundaries

- Realtime app/file scan chain (app-provider.ts, app-scanner, darwin.ts, file
  watcher services) — a parallel diagnosis task owns those; do not touch.
- New signal packs (R3a-R3e), weight retuning beyond D1.
- modules/ai/, tuffex, tool-gateway (other session). app-settings entity
  (packages/utils/common/storage/entity/app-settings.ts) is SHARED — check git
  status before editing; keep changes additive (add selection toggle, remove
  bluetooth toggle) and re-check for concurrent edits before finishing.

## Files

recommendation/{recommendation-engine, context-provider, item-rebuilder(minor)},
recommendation-utils (locate — packages/utils or core-app), time-stats-aggregator,
search-usage-service / usage-stats-queue (drain hook + exposure clicks),
app-settings entity, renderer useSearch (exposure send), db schema + aux migration
for the metrics table, tests beside each.

## Verification

`cd apps/core-app && npx vitest run src/main/modules/box-tool/search-engine/` +
renderer box suites + `npm run typecheck:node && npm run typecheck:web`;
`cd packages/utils && npx vitest run` if utils touched. DB changes must pass
`npm run db:generate` cleanly (no drift).
