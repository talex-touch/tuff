# Design: fix recommendation ranking and stats identity

Findings P0-1, P0-2, P1-3, P1-4 in parent research/reco-signals-audit.md (line anchors
audit-time; verify first).

## Decisions (locked)

D1 **Order is restored where it is lost, not re-derived downstream.**
`rebuildItems` (recommendation/item-rebuilder.ts) reassembles its output in the input
(scored) order: build an id→rebuilt-item map from the per-source batches, then emit
`scored.map(...)` order. `mergeAndEnrichItems` writes `scoring.final = scored.score`
(keep `meta.recommendation.score` as is). `combineRecommendedWithPinned`
(engine ~:838) orders before any slice; pinned items keep their existing precedence
semantics, the remainder fills by score. Renderer `applyRecommendationResult` stays
as-is (backend order is now correct; scoring.final makes any future renderer ranking
compatible). Container `sections[].itemIds` inherit the corrected order.

D2 **One identity: `source.id`.**
- `recordExecute` (search-usage-service.ts ~:150) writes `item.source.id` into
  `usage_logs.source` (was `source.type`). Any sibling record* paths (search/cancel)
  get the same treatment — locate them in step 1.
- `TimeStatsAggregator` and trend backfill consume ids naturally afterwards.
- Migration (gated version key, idempotent, main-db writes via scheduleDbWrite per
  database-write-contracts.md): rewrite `usage_logs.source`,
  `item_time_stats.sourceId`, and `usage_trend_daily` type-keyed rows using the
  known map (item-rebuilder ~:93-102 sourceIdMap: application→app-provider,
  history→clipboard-history, plugin→plugin-features, + any file mapping found in
  step 1). Trend rows that would collide with an existing id-keyed row for the same
  day merge by summing counts. Unknown source values pass through unchanged.
- The aggregator's next 24h run rebuilds `item_time_stats` from migrated logs anyway;
  the migration still rewrites that table so the fix is visible immediately.

D3 **Pre-open foreground snapshot.**
- CoreBox show path (core-box/window.ts, before `app.focus`/`show()` steal focus)
  records `{app, capturedAt}` via the existing active-app service into a small
  main-process holder (module-level, no new table).
- ContextProvider.getForegroundApp prefers a snapshot younger than 15s; else falls
  back to the live query (today's behavior). The self-app guard stays as a safety
  net: if the resolved app is Touch itself, treat as unavailable rather than firing
  the −50 self penalty.
- Follow the async non-blocking pattern of clipboard.ts:719-750 (do not add sync IPC
  or delay window show).

## Out of scope

Weight retuning, new signals, cache-key changes (R2), hourDistribution (R2),
cold start (R2), bundleId path-form matching (R2 cleanup).

## Files

- apps/core-app/src/main/modules/box-tool/search-engine/recommendation/
  item-rebuilder.ts, recommendation-engine.ts (order + trend backfill keys)
- apps/core-app/src/main/modules/box-tool/search-engine/search-usage-service.ts
- apps/core-app/src/main/modules/box-tool/search-engine/time-stats-aggregator.ts
  (only if id assumptions are baked in)
- migration service: follow the gated maintenance pattern (A3's
  file-provider-path-normalization-service is the freshest precedent)
- apps/core-app/src/main/modules/box-tool/core-box/window.ts (snapshot hook)
- context provider: recommendation/context-provider.ts
- tests beside each

## Verification

`cd apps/core-app && npx vitest run src/main/modules/box-tool/search-engine/` (incl.
recommendation suites), renderer box suites if touched, `npm run typecheck:node`.
Concurrent work: A2 charset task is editing search-index-service.ts /
file-provider-search-service.ts / app-provider.ts / packages/utils/search — DO NOT
touch those; modules/ai, tuffex, tool-gateway belong to another session.
