# Quality260111

## Scope
- Main process scheduling, polling, and timer usage
- Utils duplication/conflicts
- Comment hygiene and architecture consistency

## Scheduling & Polling Findings
- Duplicate PollingService implementations exist alongside `packages/utils/common/utils/polling.ts`:
  - `apps/core-app/src/main/modules/update/UpdateService.ts` defines a local `PollingService`.
  - `apps/core-app/src/main/modules/storage/storage-polling-service.ts` implements a separate polling loop.
- Ad-hoc interval timers likely belong in shared polling:
  - `apps/core-app/src/main/service/market-api.service.ts` uses `setInterval` + `setTimeout` for update checks.
  - `apps/core-app/src/main/modules/sentry/sentry-service.ts` uses multiple timers for perf flush, telemetry stats persist, and Nexus upload intervals.
  - `apps/core-app/src/main/modules/box-tool/search-engine/usage-summary-service.ts` uses `setInterval` for summary aggregation.
  - `apps/core-app/src/main/modules/clipboard.ts` uses `setInterval` for polling.
- Recommendation: prefer `PollingService` for periodic tasks with controlled intervals and centralized shutdown; reserve direct `setTimeout` for request timeouts and short-lived debounces.

## Utils Duplication / Conflict
- Sleep helpers are duplicated:
  - `apps/core-app/src/main/utils/common-util.ts` defines `sleep`.
  - `packages/utils/common/utils/index.ts` exports `sleep`.
- Delay helpers are reimplemented:
  - `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts` defines a local `delay`.
  - `apps/core-app/src/main/utils/common-util.ts` includes `debounce` while other debounce utilities are already in shared code.
- Custom PollingService in `UpdateService` overlaps with shared `PollingService`.
- Recommendation: consolidate into `packages/utils` and remove local duplicates to avoid inconsistent behavior and divergence.

## Complexity / Refactor Candidates
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` is very large with mixed responsibilities (indexing, caching, icon extraction, IPC). Consider extracting:
  - Icon extraction queue
  - Opener resolution + storage persistence
  - Indexing progress + event emission
- `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts` contains custom coalescing and delay logic; consider using shared task queue utilities (`packages/utils/common/utils/task-queue.ts`).

## Comment Hygiene Issues
- Large commented-out blocks should be either removed or restored behind feature flags:
  - `apps/core-app/src/main/modules/build-verification/index.ts` contains extensive commented logic.
  - `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` has a fully commented `ProgressLogger`.
- Recommendation: keep only active code and concise rationale comments; move long inactive blocks into docs or feature-flagged modules.

## Additional Notes
- Perf incident reporting now includes channel type and direction in summary keys; ensure Nexus messages include `eventName`, `channelType`, and direction in payload when applicable.
- Exception reporting should be always-on for Nexus even if user toggles analytics, per requirement.
