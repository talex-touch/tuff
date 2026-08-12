# Implement plan: keyword charset unification

Execute only after 08-05-file-index-data-safety has landed (regeneration rides the
mtime-accurate reconcile). Ordered; keep the tree green each step.

1. [ ] Anchor-check: search-index-service.ts:12-13 charset consts, isKeywordValid
       (~:1527), prepareDocument keyword emission (~:1330-1470) and the acronym guard
       (~:1366); the per-item keyword hash location (search-index-service or
       indexing-worker-persist-entry-mapper); file-provider-search-service.ts:24/69;
       app-provider.ts buildFtsQuery (~:3464), term split (~:3159), keyword-gen
       charset (~:2555); search-token-builder.ts:3-4. Record drift in check.jsonl.
2. [ ] D1 shared module + unit tests (validity, folding, Han detection, quoting
       helper if placed here).
3. [ ] D2 index side: validity swap, folded twins, pinyin trigger widen, acronym
       guard fix, SEARCH_KEYWORD_SCHEMA_VERSION folded into keyword hash + tests.
4. [ ] D3 query side: both builders + term handling + full-query exact keyword +
       folded lookup + injection-safety tests.
5. [ ] Integration round-trip tests via the existing search-index-service test
       harness (café both forms; vs code via full-query path; kana produces hits).
6. [ ] Gates: `cd apps/core-app && npx vitest run src/main/modules/box-tool/`;
       `cd packages/utils && npx vitest run`; `npm run typecheck:node`. Record in
       check.jsonl. NO git commit.

Rollback: revert the commit; hash-version bump reverts with it (hashes return to old
values → mappings regenerate back on next pass, idempotent).
