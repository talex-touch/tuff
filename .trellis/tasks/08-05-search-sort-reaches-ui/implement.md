# Implement plan: search sort reaches UI

Ordered checklist; each step keeps the tree green. Do not widen scope beyond design.md.

1. [ ] Read search-core.ts publish/enrich/cache paths (~:580-730, ~:1130-1450),
       search-session.ts publish API, tuff-sorter.ts:270-350, useSearch.ts:380-500 +
       :820-870 (merge/selection), and TuffScoring type in packages/utils. Confirm the
       audit line anchors still hold; note drift in check.jsonl if any.
2. [ ] packages/utils: add `pinned?: boolean` to TuffScoring ONLY if absent.
3. [ ] tuff-sorter: write `scoring.final` (computed rank score) and `scoring.pinned`
       onto returned items (mutate the item copies it already produces — verify it
       does not mutate caller-owned objects shared elsewhere; clone shallowly if so).
4. [ ] search-core: main path enrichmentMode 'full'; delete enrichAndPushSearchItems
       re-push; relax per-update cap 80→200; move cacheSearchResult to completion with
       accumulated list.
5. [ ] useSearch: mergeRenderedItems → merge+rank+floor+cap per design D3; selection
       preservation by id (D5).
6. [ ] New tests per design Verification; run:
       `cd apps/core-app && npx vitest run src/main/modules/box-tool/search-engine/`
       `cd apps/core-app && npx vitest run src/renderer` (scope to the hook's suite if
       a narrower path exists)
       `cd apps/core-app && npm run typecheck:node && npm run typecheck:web`
7. [ ] check.jsonl: record gate outputs (counts), anchor drift, and any decision made
       under ambiguity. NO git commit (main session commits).

Rollback: single revert of this task's commit; no migrations involved.
