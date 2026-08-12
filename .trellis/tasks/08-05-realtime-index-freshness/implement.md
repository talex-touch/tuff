# Implement plan: realtime index freshness

Design source: ../08-05-search-audit-remediation/research/realtime-chain-diagnosis.md
(fix designs F1-F6 with file:line + parameter table). Anchor-check first; record
drift in check.jsonl.

1. [ ] F5 lastIndexedAt (two SQL sites) + F3 sleep trims + tests (trivial pair).
2. [ ] F2 coalescing: optional debounceMs on IndexingWatchDeltaQueueService
       schedule(); app router 400ms / file router 300ms; timer lifecycle tests.
3. [ ] F1 retry + dead-letter in app-scanner/app-provider resolution path;
       distinct failure vs not-app outcomes; operationalErrorService surfacing;
       sweep timer only-while-non-empty tests.
4. [ ] F4 filesystem cardinality probe in provider health + backfill trigger test.
5. [ ] F6 dev mdls gate change + test.
6. [ ] Gates: `cd apps/core-app && npx vitest run src/main/modules/box-tool/addon/apps/
       src/main/modules/box-tool/search-engine/ src/main/modules/box-tool/addon/files/`
       + `npm run typecheck:node`. Numbers into check.jsonl. NO git commit.

Rollback: revert commit; constants make parameter tuning a one-line change.
