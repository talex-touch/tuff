# Fix recommendation ranking and stats identity

## Goal

R1: rebuild preserves scoreAndRank order + scoring.final writeback + pinned truncation after sort (P0-1); unify usage sourceId identity across logs/stats/time-stats/trend with idempotent migration (P0-2, P1-3); pre-open foreground app snapshot (P1-4). Source: parent research/reco-signals-audit.md

## Requirements

- R1: The recommendation list the renderer receives is ordered by the engine's
  computed score; pinned handling truncates AFTER ordering (highest-scored
  recommendation is never dropped by a pinned slice); every recommendation item
  carries its score in `scoring.final` (compatible with the renderer ranking landed
  in 08-05-search-sort-reaches-ui).
- R2: One identity for usage accounting: `usage_logs.source`, `item_usage_stats.sourceId`,
  `item_time_stats.sourceId`, and `usage_trend_daily` keys all use `item.source.id`.
  Historical rows written under `source.type` are migrated (idempotent, gated,
  single-writer contract compliant); the time-based candidate dimension and
  timeRelevance scoring actually produce candidates afterwards.
- R3: Recommendation context reads the foreground app as it was BEFORE CoreBox stole
  focus (pre-open snapshot with a short TTL, falling back to live query when absent);
  the self-app penalty no longer fires against Touch itself.
- R4: No signal additions, no weight retuning beyond making existing weights reachable
  (that is R2's and C4's job). No renderer layout changes.

## Acceptance Criteria

- [ ] Unit tests: rebuild returns engine-score order across mixed sources; pinned +
      truncation keeps the top-scored item; scoring.final populated; time dimension
      yields candidates once identities align (regression test that fails on the old
      type/id mismatch); migration is idempotent and maps all four known type→id
      pairs; snapshot is taken before focus steal and consumed by context provider.
- [ ] Existing recommendation/search-engine/renderer suites green; typecheck
      node+web green for touched files.
- [ ] Digest updated: P0-1/P0-2/P1-3/P1-4 marked fixed.

## Notes

Complex task: design.md locked decisions; implement.md ordered steps.
