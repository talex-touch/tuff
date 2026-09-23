# Implement — 修复手动重建文件索引自锁

## 顺序

- [x] 1. `search-index-writer.test.ts` 先加两条回归用例（修复前应超时/挂起）：
  - writer 层：`withPausedAdmission` 内 `execWrite` 可完成；同时窗口外 `indexItems` 被阻塞到 resume 后才执行。
  - router 层：`SourceScopedIndexWriterRouter.withPausedSelectedAdmission('file-provider', op)` 内调用 `writer.execWrite` 可完成。
- [x] 2. `search-index-writer.ts`：引入 `AsyncLocalStorage` 作用域，`withPausedAdmission` 用 `run` 包住 operation，`withAdmission` 在作用域内跳过门等待。
- [x] 3. 跑 `pnpm exec vitest run src/main/modules/box-tool/search-engine/search-index-writer.test.ts src/main/modules/box-tool/search-engine/indexing-runtime.test.ts`（在 `apps/core-app`）。
- [x] 4. `pnpm run typecheck:node`。
- [x] 5. 真机：起隔离实例（`/tmp/tuff-search-verify`，`REMOTE_DEBUGGING_PORT=9322 TUFF_STARTUP_BENCHMARK_USER_DATA_DIR=/tmp/tuff-search-verify/userdata TUFF_FILE_PROVIDER_BASE_WATCH_PATHS=/Users/Shared/tuff-search-bench TUFF_DISABLE_NATIVE_AUDIO=1 pnpm exec electron-vite dev`），注入 `ipc-helper.js`，发 `app:file-index:rebuild {force:true}`，断言：返回 `success:true`；stdout 出现 `File index runtime state reset completed`；`taskRunGate.reset.runningSince` 为空；`search-index.db files` 计数回到磁盘文件数；随后新建文件 5s 内出现在索引与搜索结果里。
- [x] 6. 更新 `.trellis/spec/main-process/database-write-contracts.md`：单写者暂停窗口契约补一条。
- [x] 7. `git diff --check`。

## 回滚点

步骤 2 之后若测试红：`git checkout -- apps/core-app/src/main/modules/box-tool/search-engine/search-index-writer.ts`。
