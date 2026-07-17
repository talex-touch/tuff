# Fix search core test fixtures

## Goal

恢复三个 SearchEngineCore 回归测试，使测试夹具与当前事件路由拆分和 Electron 导入依赖保持一致，而不修改生产行为。

## Confirmed Failures

- `search-core.trace.test.ts` 仍调用已迁移到 `IndexedSourceEventRouter` 的 `subscribeIndexedSourceFsBridge()`。
- `search-core.contracts.test.ts` 未提供 Electron mock，模块收集阶段在 `app.getLocale()` 处失败。
- `search-core.gather-ordering.test.ts` 的 Electron mock 缺少 `app.getPath()`，模块收集阶段在 `TempFileService` 构造时失败。

## Requirements

1. Trace 测试通过 `SearchEngineCore` 当前持有的 `indexedSourceEventRouter.subscribe()` 启动桥接，不恢复已删除的生产方法。
2. Contracts 测试提供当前导入图所需的最小 Electron mock，包括稳定的 `app.getLocale()` 与 `app.getPath()`。
3. Gather-ordering 测试补齐稳定的 `app.getPath()`，保留现有 Electron mock 其余行为。
4. 仅修改测试夹具和本任务元数据，不修改 SearchEngineCore、事件路由器或临时文件服务生产代码。
5. 完成后提交并推送当前 `master` 分支。

## Acceptance Criteria

- [x] 三个测试文件分别独立运行通过。
- [x] 三个测试文件同一 Vitest 命令运行通过，无 mock 污染或收集失败。
- [x] CoreApp Node typecheck、变更范围 lint 与 `git diff --check` 通过。
- [x] Git 提交成功并推送到远端 `master`。

## Out of Scope

- 恢复 `subscribeIndexedSourceFsBridge()` 兼容层。
- 修改文件过滤、搜索排序、事件路由或临时文件运行时行为。
- 顺带修复其他未关联测试。
