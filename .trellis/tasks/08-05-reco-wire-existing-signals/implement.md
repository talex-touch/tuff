# Implement plan: R2 wire existing signals

1. [ ] Anchor-check all D1-D8 sites (engine cache/generateCacheKey/scoring stages,
       recommendation-utils location, aggregator, drain path, settings entity state
       vs concurrent edits, aux migration pattern, renderer applyRecommendationResult).
       Record drift in check.jsonl.
2. [ ] D7 cleanups + D6 timezone (small, land first, tests).
3. [ ] D1 hourDistribution + tests.
4. [ ] D4 incremental aggregation + E-NEW5 lane fix + survives-pruning test.
5. [ ] D2 cache split (stable/volatile stages) + cache-hit counter test.
6. [ ] D3 cold start + test.
7. [ ] D5 selection/clipboard window + settings toggle + tests.
8. [ ] D8 exposure metrics (aux migration + renderer send + counters) + tests.
9. [ ] Gates per design Verification; numbers into check.jsonl. NO git commit.

Rollback: revert commit; aux migration is additive (new table only); incremental
aggregation retiring the rebuild is behind the gated repair flag.
