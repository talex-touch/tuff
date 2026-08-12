# Implement plan: fix recommendation ranking and stats identity

1. [ ] Anchor-check: item-rebuilder.ts:73-134/507-542, engine.ts:838/421/442/
       1095-1140/1304/1381, search-usage-service.ts:150-162, usage-stats-queue.ts:158,
       time-stats-aggregator.ts:32/50/95, window.ts show path (:396-441),
       context-provider.ts:239-260; the sourceIdMap (item-rebuilder:93-102); homes of
       usage tables (primary vs aux) for write-lane choice. Record drift in check.jsonl.
2. [ ] D1 order restoration + scoring.final + pinned-after-sort + tests (mixed-source
       order regression that fails on the old grouped rebuild).
3. [ ] D2 identity unification at write sites + gated idempotent migration + tests
       (map coverage, collision merge, idempotency, unknown passthrough; time
       dimension yields candidates end-to-end after fix).
4. [ ] D3 snapshot hook + context preference + self-app fallback + tests (snapshot
       fresh/stale/absent; no delay added to show path).
5. [ ] Gates: `cd apps/core-app && npx vitest run src/main/modules/box-tool/search-engine/`
       + `npm run typecheck:node` (+ renderer suites only if renderer touched).
       Record numbers in check.jsonl. NO git commit.

Rollback: revert commit; migration version key prevents re-run mixing (idempotent
either way).
