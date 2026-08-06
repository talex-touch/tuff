# Design: O(n) token dedup + memoized per-app search derivation

## Change 1 — packages/utils/search/search-token-builder.ts

`addSearchToken` keeps its public signature `(tokens, token)`. Dedup keys move to a
module-level `WeakMap<SearchTokenList, Set<string>>`:

- Key function = the exact JSON shape used today (`{value, source, display, segments}`)
  → identical equality semantics, one stringify per insertion attempt instead of one
  per existing token.
- On first sight of a list, the Set is seeded from its current contents, so lists
  pre-populated outside `addSearchToken` keep today's behavior.
- Contract (worth a one-line comment): direct `tokens.push` after the first
  `addSearchToken` call can bypass dedup. No such caller exists (verified: all
  producers funnel through `addSearchToken`; only other consumer is
  plugin `feature-search-tokens.ts` which uses the add* helpers exclusively).
- WeakMap → token lists are collected normally; no lifecycle management needed.

## Change 2 — apps/core-app/.../apps/search-processing-service.ts

Extract the query-independent block of `processSearchResults` (semantic aliases,
tool-source ids, `buildAppSearchTokens`) into `resolveAppSearchDerived(...)` behind a
module-level content-keyed LRU:

- Fingerprint fields = exactly the inputs of the three computations: uniqueId, name,
  resolved displayName, alternateNames, user aliasList, path, displayPath, bundleId,
  appIdentity, launchTarget, description. Joined with `` (fields) / ``
  (list elements). `fileName` is derived from displayPath||path||name → covered.
  User aliases (`setAliases`) flow into the key via aliasList → self-invalidating.
- LRU: plain `Map`, capacity 512 (typical app libraries are 150–500 entries;
  eviction only means recompute-on-miss). Hit refreshes recency (delete+set);
  insert evicts `map.keys().next().value` when full.
- Cached arrays are shared by reference across keystrokes and attached to result
  items. Safe because `matchFeature` copies tokens it returns
  (`normalizeSearchToken` spreads) and never mutates inputs; no main-process
  writer of `item.meta.extension.searchTokens` exists (grep-verified); IPC
  structured-clones for the renderer.
- Catalogs are module constants → no runtime version key needed (process restart
  ships new code).

## Non-goals

Match scoring (`matchFeature`) stays per-keystroke O(tokens) — that is the correct
per-query work. No SQL changes. No API changes in `@talex-touch/utils`.

## Validation

- `pnpm utils:test`; core-app `vitest run` on search-processing-service + app-provider
  suites; `npm run typecheck:node`; eslint on changed files.
- Throwaway vitest bench (deleted before commit): (a) old-dedup replica vs new
  `addSearchToken` at 200 vs 400 tokens → expect ~linear scaling; (b) two
  `processSearchResults` passes over the same 150 synthetic apps → second pass ≥ 10×
  faster (memo hit).
