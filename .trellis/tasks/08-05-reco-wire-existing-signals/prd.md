# Wire existing recommendation signals

## Goal

R2: hourDistribution into scoring; cache-key cardinality reduction (base ranking cache + volatile-context light re-rank); cold-start fallback; incremental/hourly aggregation preserving history; selection-capture ingestion; timezone-change signal; cleanups (dead bluetooth toggle, upsertItemTimeStats, path-form bundleId matching). After R1. Source: parent research/reco-signals-audit.md

## Requirements

- R1: `item_time_stats.hourDistribution[24]` (aggregated since forever, never read)
  participates in time relevance scoring alongside timeSlot/dayOfWeek.
- R2: Background 15-min refresh becomes useful: cache key carries only slow-moving
  context (time slot, day type, network on/off); volatile context (foreground app,
  clipboard, battery, DND) applies as a light post-cache re-rank so a cache hit does
  not require an exact volatile match. Perf counters must show cache hits on the
  user-visible path afterwards.
- R3: Cold start is never empty: with no usage history, recommend from the app
  catalog (top system/common apps) + recent files, clearly marked as fallback.
- R4: Time-stats aggregation moves from 24h full-table absolute rewrite to
  incremental accumulation (hourly or on-execute), and pruning `usage_logs` no
  longer erases accumulated historical distributions.
- R5: `selection-capture` text feeds the context signal set (same handling tier as
  clipboard content: hashed/typed, settings-gated); clipboard window widened from
  the 5s single-item read per the audit note.
- R6: Timezone-change ("traveling") boolean signal derived from persisted last-seen
  timezone.
- R7: Cleanups: bluetooth dead signal removed together with its settings toggle (or
  implemented via audio-route if trivially available — decide in design); dead
  `upsertItemTimeStats` removed; foreground/bundleId matchers accept both bundleId
  and path-form item ids.
- R8: Every signal remains individually toggleable in settings; no new privacy
  surface beyond selection text (which reuses the clipboard tier and its gating).
- R9: Evaluation groundwork (prerequisite for all later signal work): local-only
  recommendation exposure logging (which item ids were shown, per surface) joined
  with clicks to yield hit-rate@k; exposed as a perf/diagnostics counter. No
  network, no raw content — ids and counts only. R3e's exposure-CTR decay consumes
  this data.

## Acceptance Criteria

- [ ] Tests per requirement (hour-weighting effect, cache hit with changed volatile
      context, cold-start non-empty, aggregation survives log pruning, selection
      ingestion gated by setting, timezone-change flag, path-form matcher).
- [ ] Existing suites green; typecheck:node green for touched files.
- [ ] Digest/reco research updated with what landed.

## Notes

Starts after 08-05-reco-ranking-stats-fix lands (identity fix is a prerequisite for
meaningful time stats). Complex task: write design.md at start (cache re-rank split
needs a fresh look at engine cache structure post-R1).
