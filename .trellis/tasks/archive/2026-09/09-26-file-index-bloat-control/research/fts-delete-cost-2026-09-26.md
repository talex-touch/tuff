# Finding — per-row search-index deletes walk the whole FTS table (2026-09-26)

Observed on the first boot with the stale-row cleanup enabled: `Removing stale database entries { removed: 428 }` at 14:08:44, the next page (`removed: 500`) at 14:10:42 — about two minutes per 500 rows, with a `[D] Provider [file-provider] … 3001.8ms (timeout)` and an 8s main-loop lag in between.

Cause: every document delete in `search-index-service.ts` is

```sql
DELETE FROM search_index WHERE provider = ? AND item_id = ?   -- :424, :623, :1243
```

and both `provider` and `item_id` are `UNINDEXED` FTS5 columns, so each statement scans the whole `search_index` content table (276k rows, 445MB). 500 rows ≈ 500 scans ≈ 2 minutes; the 222,047 legacy `~/go/pkg/mod` rows would take ~15 hours of continuous writer time.

What this task does about it: `FileProviderCleanupDeleteService` budgets stale-row removal per pass (`staleDeleteBudgetMs`, default 8s) and reports what is left, so startup and the deferred read lane are never held for long. Root-less rows keep the old unbudgeted behaviour.

Follow-up worth its own task (writer side, file held by another session today): delete FTS rows by `rowid` resolved through `search_index_meta`, or batch `item_id IN (…)` per page so a page costs one scan instead of 500; then the cleanup budget can be raised or dropped. Until then the fast way to drop the legacy rows on a profile like this one is the settings "重建索引" action (table-level clear + rescan with the new exclusions, ~54k files instead of 276k).
