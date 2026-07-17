# Design: Usage statistics single writer and conservative repair

## Boundaries

This change stays inside CoreApp main-process usage tracking and the primary SQLite resource migrations.

```text
execute
  ├─ usage_logs (detailed retained event; source type only)
  ├─ usage_summary (item-level exact increment)
  └─ UsageStatsQueue (provider-aware item_usage_stats increment)

periodic maintenance
  ├─ item_time_stats overwrite from retained logs
  └─ usage_logs retention cleanup
```

The removed edge is `usage_logs -> additive item_usage_stats`.

## Source Fix

`UsageSummaryService` remains the scheduled maintenance owner because it still:

- rebuilds time-distribution statistics;
- removes logs outside the retention window;
- owns the existing polling lifecycle and diagnostics.

The service will no longer:

- scan logs to build item usage counters;
- import retry helpers used only by that write path;
- expose `summarizedLogs` / `totalSummarized` metrics that would imply the removed behavior.

`UsageStatsQueue` and `DbUtils.incrementUsageStats()` remain unchanged. The queue is the normal writer; the direct DbUtils path is the existing initialization fallback.

## Conservative Data Migration

Add journaled data migration `0027_usage_stats_single_writer_repair.sql`.

### Step 1: delete provable phantom rows

Delete a row only when all are true:

- `source_id = source_type`;
- another row has the same `item_id` and `source_type`;
- that other row has a different `source_id`.

This proves a provider-aware row exists and avoids guessing a provider id.

### Step 2: cap provable execute over-counts

For every remaining row with a matching `usage_summary` row:

- if `item_usage_stats.execute_count > usage_summary.click_count`, set it to `click_count`;
- otherwise leave it unchanged.

`usage_summary` is safe only as an upper bound: its increment completes before queue enqueue, while the periodic bug never writes it. The migration never raises a counter, so crash-related queue under-counts are not guessed back into existence.

### Preserved fields

The migration changes only row existence for proven phantom rows and `execute_count` for proven over-counts. It does not modify:

- `search_count` / `cancel_count`;
- `last_searched` / `last_executed` / `last_cancelled`;
- `created_at` / `updated_at`;
- rows without a matching `usage_summary`.

## Transaction and Rollback

Drizzle's libSQL migrator batches pending migration statements through `client.migrate()`. The local libSQL implementation disables foreign keys, begins a transaction, commits only after every statement succeeds, and rolls back in `finally` when still in a transaction.

Therefore:

- migration SQL must not open its own nested transaction;
- the repair and journal insert are one atomic migration batch;
- a failing statement leaves both data and journal unchanged;
- no permanent backup table is created, avoiding a hidden copy that would escape the existing analytics-data deletion path.

The selected predicates intentionally trade maximal historical recovery for non-destructive certainty.

## Compatibility

- No schema.ts change: this is a data-only migration.
- Add the journal entry after `0026_catalog_service`.
- Existing databases run it once; new databases run it harmlessly against empty usage tables.
- Replaying the SQL is idempotent: deleted rows stay absent and capped counts no longer satisfy the update predicate.

## Validation

1. Migration integration test with a temporary libSQL database:
   - canonical + phantom pair;
   - provider id equal to type;
   - under-counted row;
   - row without summary;
   - unrelated search/cancel/timestamps;
   - second migration replay.
2. `UsageSummaryService` test proving maintenance leaves `item_usage_stats` unchanged while producing time stats.
3. Existing SearchEngineCore usage contract test.
4. CoreApp node type-check.
5. Direct temporary-database smoke: record/flush, run maintenance, reread exact count.
