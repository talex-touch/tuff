# Fix usage statistics double counting

## Goal

Stop the legacy periodic usage summarizer from repeatedly mutating `item_usage_stats`, preserve the real-time queue as the source-aware incremental writer, and conservatively repair historical pollution without discarding unrelated personalization data.

## Background

- `SearchUsageService.recordExecute()` performs three writes for one execution:
  1. `usage_logs` receives the detailed execution log.
  2. `usage_summary` increments the item-level click count.
  3. `UsageStatsQueue` increments source-aware `item_usage_stats` using `item.source.id`.
- `UsageSummaryService.summarizeUsageLogs()` later replays all retained non-search-session logs and additively writes `item_usage_stats` again.
- `usage_logs.source` stores `item.source.type`, not `item.source.id`. The periodic writer therefore creates source-type-keyed phantom rows such as `application:<item>` / `file:<item>` while the real-time queue writes provider-keyed rows such as `app-provider:<item>` / `file-provider:<item>`. If a provider id equals its type, the valid row is directly inflated instead.
- The periodic task first runs 30 seconds after startup and then every 24 hours. Cleanup is retention-based; there is no summarized watermark, so retained logs are replayed repeatedly.
- `item_usage_stats` is consumed by ranking and recommendation. Wrong rows/counts therefore alter user-visible ordering.
- `usage_summary` increments synchronously before queue enqueue and provides a conservative item-level upper bound. It does not contain a source id and must not be used to invent one.

## Decision

The user selected **conservative automatic repair**:

1. Remove a source-type-keyed row only when another provider-keyed row exists for the same `item_id` and `source_type`.
2. Lower `execute_count` only when it exceeds the matching `usage_summary.click_count`.
3. Preserve search/cancel counts and all unrelated timestamps.
4. Leave rows without a matching `usage_summary` untouched.
5. Do not reset all personalization and do not reconstruct provider ids from legacy logs.

## Requirements

1. `UsageStatsQueue` and its existing direct fallback are the only incremental writers of `item_usage_stats`.
2. Periodic maintenance must retain time-distribution aggregation and old-log cleanup, but must not insert, update, or add counts in `item_usage_stats`.
3. Search, execute, and cancel counters must keep their existing queue/fallback behavior and source identity.
4. Historical repair must run once through the normal Drizzle migration journal and remain idempotent if replayed in isolation.
5. Historical repair must execute transactionally through libSQL migration batching; a statement failure must roll back the entire repair.
6. Historical repair must preserve valid search/cancel counts and timestamps.
7. No repair may infer a provider id from `usage_logs.source`.
8. A full reset of usage personalization is prohibited.
9. The change must not broaden into Nexus sync, recommendation redesign, or a general usage-schema rewrite.

## Acceptance Criteria

- [x] Running `UsageSummaryService.runSummary()` does not write `item_usage_stats`.
- [x] Time statistics aggregation and usage-log retention still run on the existing schedule.
- [x] One execute event increments the provider-keyed `item_usage_stats.execute_count` exactly once.
- [x] Re-running periodic maintenance or restarting does not increment that count again.
- [x] Queue-unavailable fallback still increments exactly once.
- [x] The repair migration is repeatable with the second run producing no further changes.
- [x] The repair does not change `search_count`, `cancel_count`, `last_searched`, or `last_cancelled` for retained rows.
- [x] A source-type phantom row is removed only when a provider-keyed row for the same `item_id` and `source_type` exists.
- [x] A repaired `execute_count` never exceeds matching `usage_summary.click_count`; rows without a matching summary remain untouched.
- [x] Focused database/service tests and CoreApp node type-check pass.
- [x] A runtime smoke proves execute → flush → maintenance → reread remains exactly one execution.

## Out of Scope

- Nexus `pushSyncItemsV1` batching.
- Reworking recommendation scoring weights.
- Changing the public plugin/search SDK.
- Reconstructing provider ids for historical logs.
- Correcting `item_time_stats` source identity; that adjacent legacy issue needs a separate contract because historical logs lack provider ids.
