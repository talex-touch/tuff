# Search Hot-Path Contracts (main process)

Source: task 08-05-search-hotpath-quadratic-fix (2026-08-05). These are executable
contracts for the per-keystroke CoreBox search path; violating them reintroduces the
quadratic-per-keystroke bug class this task removed.

## Scenario: code on the per-keystroke search path

CoreBox query → provider `onSearch` → candidate scoring → result build. Budget
context: `SLOW_PROCESS_THRESHOLD_MS = 300` (search-processing-service.ts), gather
fast layer 80ms.

## Contracts

### 1. Token dedup is O(1) per insert — all producers funnel through `addSearchToken`

`packages/utils/search/search-token-builder.ts` tracks dedup keys in a
`WeakMap<SearchTokenList, Set<string>>` seeded on first use. A direct `tokens.push`
after the first `addSearchToken` call bypasses dedup silently — never push token
lists directly; add tokens only via the `add*SearchTokens` helpers.

### 2. Per-app search derivation is memoized — the cache key MUST cover every input

`resolveAppSearchDerived` (search-processing-service.ts) memoizes semantic aliases,
tool-source ids, and `buildAppSearchTokens` output on a content fingerprint
(`buildAppSearchDerivedKey`). **Any new field that feeds catalog resolution or token
building must be added to the key** (exception: values derived from existing key
fields, e.g. `fileName`). A field feeding derivation but missing from the key is a
stale-cache bug: search results silently stop reflecting that field's changes.
User aliases (`setAliases`) flow in via `aliasList` — already keyed.

### 3. Cached arrays are shared references — consumers stay read-only

Cached `searchTokens`/`toolSourceIds` are attached to result items across
keystrokes. `matchFeature` copies tokens it returns (`normalizeSearchToken`) and
must stay non-mutating; no main-process code may write to
`item.meta.extension.searchTokens`. Cache is LRU-bounded
(`APP_SEARCH_DERIVED_CACHE_LIMIT = 512`).

## Verification

```bash
cd packages/utils && npx vitest run                     # 979 tests
cd apps/core-app && npx vitest run src/main/modules/box-tool/addon/apps/
cd apps/core-app && npm run typecheck:node
```

Benchmark shape (throwaway vitest file, see task design.md): old-dedup replica vs
new at 150 apps × 200/400 tokens — measured 2026-08-05: old 1388→6006ms (4.33×,
quadratic), new 34→62ms (1.82×, linear); memoized `processSearchResults` over 150
rows: cold 21.6ms → warm 2.9ms with identical match sets.
