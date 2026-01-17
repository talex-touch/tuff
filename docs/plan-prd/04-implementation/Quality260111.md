# Quality260111

## Scope
- Main process scheduling, polling, and timer usage
- Utils duplication/conflicts
- Comment hygiene and architecture consistency

## Scheduling & Polling Findings
- 已收敛：主/渲染进程中的 `setInterval` 已统一迁移到 `PollingService`（Clipboard、Sentry、DownloadCenter、UsageSummary、RecommendationEngine、DevServerMonitor、FxRate、DivisionBox、SystemSampler、renderer perf 等）。
- 仍保留的 `setTimeout` 为短生命周期的 debounce/timeout，不在统一轮询范围内。
- `StoragePollingService.setInterval` 仅为配置 API 命名，不是实际定时器。

## Utils Duplication / Conflict
- Sleep helpers are duplicated:
  - `apps/core-app/src/main/utils/common-util.ts` defines `sleep`.
  - `packages/utils/common/utils/index.ts` exports `sleep`.
- Delay helpers are reimplemented:
  - `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts` defines a local `delay`.
  - `apps/core-app/src/main/utils/common-util.ts` includes `debounce` while other debounce utilities are already in shared code.
- `packages/utils/common/utils/task-queue.ts` 已提供 `runAdaptiveTaskQueue`（自动让出事件循环），可替换手写分批/`setImmediate`。
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
