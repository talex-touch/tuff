# Design: search sort reaches UI

Findings E-H1..E-H4, E-M6 (parent digest). Four symptoms, one root: renderer
`mergeRenderedItems` (useSearch.ts:460) is append-only; backend main path sorts with
`enrichmentMode:'base'`; 80-cap both sides; cache stores only the fast-layer batch.

## Decisions (locked — do not re-litigate in implementation)

D1 **Score writeback.** The backend sorter path writes its computed final rank score
into each published item's `scoring.final` (number). If `TuffScoring` (packages/utils
core-box types) lacks a suitable field it already has `final` — reuse it; add optional
`pinned?: boolean` to `TuffScoring` if not present (additive, non-breaking).

D2 **Single enriched publish per batch.** The main search path switches to
`enrichmentMode:'full'` (usage stats + pinned + completion) BEFORE the one publish per
batch; delete the separate `enrichAndPushSearchItems` re-push (search-core.ts ~:1430,
E-M6). Net IPC per batch: 2 → 1. Usage-stats batch DB read moves into the main path —
acceptable now; negative-cache lands in batch B.

D3 **Renderer merge = merge by id, then rank, then cap.**
`mergeRenderedItems(current, incoming)`:
1. Map-merge by id (incoming value wins).
2. Sort: `scoring.pinned` first, then `scoring.final` desc, then stable
   tiebreak = previous visible order (keep a rank map from the pre-merge list; unknown
   ids tiebreak by incoming order). Never re-sort on pure re-render — only when a
   batch arrives.
3. Per-source floor before the 80 cap: if the merged set exceeds
   MAX_RENDERED_RESULTS, guarantee each distinct `source.id` present in the merged set
   min(6, itsCount) slots — fill the rest by global rank; implement by taking global
   top-80 then swapping the lowest-ranked overflow items for starved sources' top
   items. Deterministic, no randomness.
4. Backend per-update slice(0,80) (search-core.ts ~:225 region) relaxes to a safety
   cap of 200 so deferred batches are not pre-dropped before the renderer sees them.

D4 **Cache stores the final accumulated result.** Move `cacheSearchResult` from the
first-update branch to session completion (`isDone`), caching the full accumulated
sorted item list (cap 200). Cache hit path unchanged otherwise (publish + complete).
Kills E-H1 (repeat query within 5s losing file results).

D5 **Selection stability.** Preserve renderer selection BY ITEM ID across re-rank
(reuse the existing selection-preservation helpers in useSearch if present; else:
record selected id before merge, re-locate after). If the selected item left the list,
clamp to index 0.

D6 **Pinned.** tuff-sorter's hard pinned partition stays authoritative backend-side;
`scoring.pinned` is set during enrichment so the renderer can partition the same way.
Do NOT fold pinned into the numeric score (keeps plugin priority abuse M16 — batch C —
from outranking pins).

D7 **Out of scope.** boxItems-above-results policy (E-L3), provider dedup, M16 clamp,
weight rebalance (batch C scoring-rebalance), recommendation path, MessagePort
protocol.

## Files

- apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts — enrichment
  mode switch, cache move, cap relax, delete re-push.
- apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.ts — write
  `scoring.final` (+ `scoring.pinned`) onto items it ranks.
- apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts —
  mergeRenderedItems rank+floor+cap, selection preservation.
- packages/utils (core-box types) — only if `pinned?: boolean` needs adding.

## Verification

- Existing: search-core.contracts.test.ts, search-core.trace.test.ts, search-gather,
  tuff-sorter tests, renderer hook tests if present. All must pass; tuff-sorter's
  frecency/pin expectations become end-to-end true.
- New tests (place beside the code under test):
  1. Renderer merge-rank unit: deferred high-score file item ends above low-score
     fast item after second batch; pinned tops; per-source floor rescues a starved
     source at >80 items; selection id preserved across re-rank.
  2. search-core: cache written at completion contains deferred-batch items (repeat
     query hit returns them); exactly one publish per batch (no full re-push).
- Gates: `npx vitest run src/main/modules/box-tool/search-engine/` + renderer hook
  suite + `npm run typecheck:node && npm run typecheck:web`. Note: pre-existing
  typecheck errors in modules/ai/* and packages/tuff-intelligence belong to a
  concurrent session — ignore those, introduce none in touched files.
