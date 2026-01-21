# SearchLogger Lifecycle Analysis

## Summary
- SearchLogger is instantiated at import time via `export const searchLogger = SearchLogger.getInstance()`.
- Its constructor subscribes to app settings immediately, which calls into `useMainStorage()`.
- During early startup, `storageModule.filePath` is not yet set, so `useMainStorage()` throws.

## Trigger Chain (Startup)
1. `apps/core-app/src/main/index.ts:15` imports `coreBoxModule`.
2. `apps/core-app/src/main/modules/box-tool/core-box/index.ts:13` imports `coreBoxManager`.
3. `apps/core-app/src/main/modules/box-tool/core-box/manager.ts:14` imports `searchLogger`.
4. `apps/core-app/src/main/modules/box-tool/search-engine/search-logger.ts:526` instantiates SearchLogger.
5. `apps/core-app/src/main/modules/box-tool/search-engine/search-logger.ts:18` constructor calls `setupSettingsWatcher()`.
6. `apps/core-app/src/main/modules/box-tool/search-engine/search-logger.ts:32` calls `subscribeMainConfig(...)`.
7. `apps/core-app/src/main/modules/storage/index.ts:803` `useMainStorage()` throws because `storageModule.filePath` is not set.

## Module Load Order (Electron Ready)
- `modulesToLoad` is defined in `apps/core-app/src/main/index.ts` and executed in a loop via `moduleManager.loadModule`.
- Load order (from the source list):
  1. databaseModule
  2. storageModule
  3. fileProtocolModule
  4. shortcutModule
  5. extensionLoaderModule
  6. commonChannelModule
  7. analyticsModule
  8. permissionCheckerModule
  9. permissionModule
  10. notificationModule
  11. sentryModule
  12. buildVerificationModule
  13. updateServiceModule
  14. intelligenceModule
  15. pluginModule
  16. pluginLogModule
  17. flowBusModule
  18. coreBoxModule
  19. trayManagerModule
  20. addonOpenerModule
  21. clipboardModule
  22. tuffDashboardModule
  23. FileSystemWatcher
  24. terminalModule
  25. downloadCenterModule
- Even though `coreBoxModule` loads after `storageModule`, its import occurs before `app.whenReady()`,
  so its transitive imports (including `searchLogger`) can run before `storageModule.onInit()`.

## Reference Patterns for Config Subscription
- `apps/core-app/src/main/modules/sentry/sentry-service.ts` subscribes in service init with a `try/catch`,
  after module setup (`setupIPCChannels`), which is invoked during normal startup.
- `apps/core-app/src/main/service/device-idle-service.ts` subscribes lazily in `setupSettingsWatcher()` and
  guards with `try/catch` to avoid crashing when storage is not ready.
- `apps/core-app/src/main/index.ts` subscribes to `StorageList.APP_SETTING` only after the loop hits
  `storageModule`, ensuring storage is ready before reading or subscribing.
- Common rule: subscribe only after storage initialization (module init / post-storage load) and guard failures.

## Recommended Fix Strategy
Option comparison:
- Explicit `init()` + `destroy()` on `SearchLogger`: move storage access out of constructor and call `init()`
  from a module lifecycle hook (e.g., `CoreBoxModule.onInit`). Keep singleton export to avoid API churn.
- Convert `SearchLogger` into a `BaseModule`: strong lifecycle control, but requires larger refactor and
  new wiring in `modulesToLoad`.
- Lazy retry inside `SearchLogger` when storage is not ready: minimal code change but introduces hidden
  timing and repeated polling/retry logic.

Recommendation (minimal change, compatible):
- Keep `SearchLogger` as singleton but add `init()` that calls `loadSettings()` and `setupSettingsWatcher()`.
- Remove storage-dependent work from constructor to avoid import-time side effects.
- Invoke `searchLogger.init()` in `CoreBoxModule.onInit` (after `StorageModule` is loaded).
- Keep `destroy()` called from `CoreBoxModule.onDestroy` for unsubscribe.

Impact:
- Public API remains `searchLogger` with same logging methods.
- Logging may remain disabled until `init()` runs, which aligns with storage readiness.
- No change to external call sites beyond adding `init()`/`destroy()` hook points.

## Observed Failure
- Error: `StorageModule not ready: filePath not set`.
- Timing: occurs before `StorageModule.onInit()` completes.
