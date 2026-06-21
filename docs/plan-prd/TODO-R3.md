# Tuff R3 Search / Indexing Runtime TODO

> 更新时间：2026-06-21
> 范围：Roadmap R3 / Search Provider 与 Indexing Runtime。专题设计以 `03-features/search/INDEXING-RUNTIME-V1-PLAN.md` 为准。

## 当前口径

- R3 目标是把 File write/store boundary、SQLite/FTS 写入、`scan_progress`、integrity reset 与 durable job history 收敛到 runtime task/store。
- 当前完成度约 `70%`。
- source-scoped `scan_progress` schema migration 属高风险数据结构变更，执行前必须单独确认影响范围。
- focused tests 可以证明边界合同，不能等同于完整 durable scheduler 或 SQLite/FTS 迁移完成。

## 已完成

- Watch-root policy、scan eligibility、scan strategy、runtime reset、task retry/debounce、recovery wait metadata 已完成多处 hygiene。
- Scan progress 读写边界已过滤空路径、重复路径、非法 timestamp，并返回真实写入 row count summary。
- FileProvider runtime reset cleanup 已覆盖当前 watch roots 下的 scan-progress cleanup。
- Runtime automatic scan/reconcile retry policy 已在同类成功任务后重置失败 backoff。
- Settings recovery chip display 已输出结构化 wait metadata。
- 本阶段没有新增 schema、真实 watcher、SQLite/FTS 或 Settings evidence 改动。

## 未完成

| 主题 | 状态 | 缺口 |
| --- | --- | --- |
| FileProvider SQLite/FTS runtime-store migration | open | scan worker、incremental DB persist、index worker flush trace 与 FTS 写入仍主要在 FileProvider/SearchIndex worker 内部。 |
| `scan_progress` source-scoped schema | open | 需要 schema/source migration 设计、兼容读写、rollback、数据清理影响范围与验证命令。 |
| Durable job history | partial | 需要 history append/update/store、Settings diagnostics recovery chip UI evidence、packaged/真实 Settings 截图或录屏。 |
| Quicklinks persistent feed | open | 需要官方插件持久 feed storage、用户级 clear/rebuild UI 与 Settings evidence。 |
| Browser Bookmarks platform evidence | partial | 需要真实浏览器 profile、跨平台 watch root 与 packaged evidence。 |
| Everything productionization | partial | 需要 SDK/CLI 最终策略、registry/PATH 探测、Windows 性能与 fail-closed 诊断 evidence。 |

## 下一步

1. 继续非 schema 小切片，优先移除 FileProvider 内部仍手写 root/path/progress 规则的地方。
2. 把 index worker flush trace、incremental DB persist、FTS write/delete summary 迁到 runtime store/task evidence。
3. 补 durable job history 的持久化边界与 Settings diagnostics evidence。
4. 设计 `scan_progress` source-scoped migration；执行前必须单独确认。
5. Browser Bookmarks、Everything、Quicklinks 只用真实平台/evidence artifact 关闭，不用 mock evidence 替代。

## 验证命令

```bash
corepack pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-watch-root-policy.test.ts" "__tests__/search/indexing-scan-strategy.test.ts" "__tests__/search/indexing-scan-eligibility.test.ts" "__tests__/search/indexing-source-progress-store.test.ts"
corepack pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-task-retry-policy.test.ts"
corepack pnpm -C "packages/utils" exec vitest run "__tests__/search/indexing-source-task-run-gate.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/file-provider-startup.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-watch-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-scan-progress-service.test.ts" "src/main/modules/box-tool/addon/files/services/file-provider-index-scheduler-service.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/search-engine/indexing-runtime.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run "src/renderer/src/views/base/settings/indexing-source-diagnostics-display.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:node
corepack pnpm -C "apps/core-app" run typecheck:web
git diff --check
```
