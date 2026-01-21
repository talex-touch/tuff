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

## Observed Failure
- Error: `StorageModule not ready: filePath not set`.
- Timing: occurs before `StorageModule.onInit()` completes.
