# Configuration SQLite Source of Truth — Implementation

## Ordered checklist

- [x] Add `app_config_entries` and `app_config_migration_state` schema, SQL migration `0029`, and journal entry.
- [x] Implement an application-config repository with backend selection, serialized SQLite writes, row hydration, tombstones and safe close.
- [x] Implement recursive legacy discovery, immutable backup, idempotent transactional import and key-level migration diagnostics.
- [x] Implement SQLite-primary legacy mirror and explicit/automatic legacy fallback without mixed-source reads.
- [x] Integrate repository hydration into `StorageModule.onInit()` while preserving synchronous cache access, persistent revisions and polling retries.
- [x] Replace file-based persist/delete/reload semantics with repository operations; make delete durable and revision-monotonic.
- [x] Add SQLite-first app-setting preflight and pass the snapshot into `TouchApp`; remove direct constructor disk ownership.
- [x] Preserve StorageEvents/main-storage contracts and update focused storage mocks/fixtures.
- [x] Exercise Settings hydration, logger/theme subscriptions, auto-start, onboarding, normal startup and silent startup.

## Test contracts

- Empty DB migration and schema constraints.
- Legacy import of multiple nested keys; plugin/backup/marker exclusions.
- Existing SQLite row and tombstone beat legacy; rerun is idempotent.
- Malformed/unreadable source and failed transaction preserve legacy files and enter deterministic fallback.
- Revisions survive restart; stale queued write cannot overwrite new revision.
- Delete persists tombstone and removes mirror only after primary commit.
- SQLite mirror on/off and explicit legacy rollback behavior.
- Preflight SQLite success, missing row/table fallback, query error fallback and client close.
- Storage app get/getVersioned/save/delete/update and conflict behavior.
- AppSetting normalization and Settings/startup consumers remain unchanged.

## Verification

```bash
corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/storage/**/*.test.ts" \
  "src/main/core/*startup*.test.ts" \
  "src/main/core/silent-launch.test.ts" \
  "src/main/modules/tray/tray-manager.test.ts" \
  "src/renderer/src/storage/*.test.ts" \
  "src/renderer/src/views/base/settings/**/*.test.ts"

corepack pnpm -C "packages/utils" exec vitest run \
  "__tests__/renderer-storage-transport.test.ts"

corepack pnpm -C "apps/core-app" run typecheck:node
corepack pnpm -C "apps/core-app" exec eslint --max-warnings=0 \
  "src/main/modules/storage/**/*.ts" \
  "src/main/core/index.ts" \
  "src/main/core/touch-app.ts" \
  "src/main/index.ts" \
  "src/main/db/schema.ts"
```

Smoke with an isolated profile:

1. seed legacy app-setting and secondary config files;
2. start CoreApp and verify migration/backend diagnostics;
3. change a Settings value, close, restart and verify SQLite-backed restoration;
4. delete a config and verify no resurrection after restart;
5. start once with `TALEX_CONFIG_STORAGE_BACKEND=legacy` and verify rollback boot/write;
6. start normal and silent modes and verify window visibility/bounds.

## Verification Result

- Full Drizzle migration succeeded and created both application-config tables; direct constraint probes rejected negative revisions, invalid tombstones and invalid migration phases.
- Real SQLite repository scenarios proved two-file import, exclusions, immutable backup, idempotent restart, existing-row/tombstone precedence, mirror on/off, stale-revision rejection, malformed-file fallback and zero partial rows.
- `StorageModule` runtime harness proved hydrate → save revision 2 → tombstone revision 3 → restart revision 3.
- Dirty-cache race harness proved revision 1 completion cannot clear revision 2 dirty state; revision 2 completion can.
- Preflight scenarios proved database/table/row fallback, SQLite read, tombstone no-resurrection, explicit legacy selection and post-preflight reopen/write.
- Focused CoreApp tests: Storage/silent launch 9, Settings/common channel 25, startup/tray 25, search onboarding 24; Utils renderer storage transport 10. All passed.
- Scoped ESLint passed with zero warnings. Full CoreApp Node typecheck passed.
- Final `electron-vite build` completed main, preload and renderer bundles.
- Isolated-profile Electron smoke imported two legacy files, then a SQLite restart and a SQLite-driven silent restart both reached `Startup health check passed`; explicit legacy rollback also reached the health gate and left all five SQLite rows byte-for-byte unchanged. Dev-process teardown exits 1 after its existing forced-shutdown timeout, after successful startup and Storage flush.

## Risky files and rollback points

- `apps/core-app/src/main/modules/storage/index.ts`: keep transport/cache surface stable; repository integration is the cutover point.
- `apps/core-app/src/main/core/touch-app.ts` and `src/main/index.ts`: preflight must finish before window construction and always close its client.
- `apps/core-app/resources/db/migrations/0029_app_config_sot.sql`: additive only; never drop legacy files or existing tables.
- Roll back operationally with `TALEX_CONFIG_STORAGE_BACKEND=legacy`; code rollback remains compatible because mirror files are retained.
