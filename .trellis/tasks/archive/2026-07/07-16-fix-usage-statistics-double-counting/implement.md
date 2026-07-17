# Implementation Plan

## 1. Add the conservative data repair migration

- Create `apps/core-app/resources/db/migrations/0027_usage_stats_single_writer_repair.sql`.
- Delete only source-type rows with an existing provider-aware sibling.
- Cap only `execute_count` values above matching `usage_summary.click_count`.
- Append migration index 27 to `meta/_journal.json` with a monotonic timestamp.
- Do not add a schema snapshot because the migration changes data only.

Rollback point: before applying the migration to any real profile. Validation uses temporary SQLite databases only.

## 2. Remove the duplicate writer

- Delete `UsageSummaryService.summarizeUsageLogs()`.
- Remove its private retry helpers and unused imports.
- Simplify run stats and log output to time aggregation + retention cleanup.
- Keep polling interval, initial delay, `triggerSummary()`, configuration updates, and lifecycle behavior unchanged.

Rollback point: restore the removed method only together with a real watermark/source-id contract; never restore the additive replay as-is.

## 3. Defend the observable contract

- Add a focused migration integration test using the existing temporary libSQL pattern.
- Add a focused `UsageSummaryService` database test proving maintenance does not mutate `item_usage_stats` and still rebuilds `item_time_stats`.
- Keep tests independent of local user databases and Electron profiles.

## 4. Verify

Run the smallest relevant checks:

```bash
corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/box-tool/search-engine/usage-summary-service.test.ts" \
  "src/main/modules/box-tool/search-engine/usage-stats-repair-migration.test.ts" \
  "src/main/modules/box-tool/search-engine/search-core.contracts.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:node
```

Then run a direct temporary-database smoke that exercises execute/flush/maintenance/reread and proves the count remains one.

## 5. Review Gate

Before task activation, confirm:

- PRD records the selected conservative policy.
- Migration predicates do not infer provider ids.
- No real profile/database is opened by tests or smoke.
- The migration and service change can be reviewed independently.
