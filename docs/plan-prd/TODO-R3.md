# Tuff R3 Search / Indexing Runtime TODO

> 更新时间：2026-06-20
> 范围：Roadmap R3 / Search Provider 与 Indexing Runtime 收口清单。专题设计仍以 `03-features/search/INDEXING-RUNTIME-V1-PLAN.md` 为准。

## 当前口径

- R3 的目标是把 File write/store boundary、SQLite/FTS 写入、`scan_progress`、integrity reset 与 durable job history 收敛到 runtime task/store。
- 当前阶段先做非破坏性 hygiene 与 adapter boundary hardening；source-scoped `scan_progress` schema migration 属高风险数据结构变更，执行前必须单独确认影响范围。
- focused tests 可以证明边界合同，不等同于完整 durable scheduler 或 SQLite/FTS 迁移完成。

## 已收口

- Watch-root policy 已统一过滤 normalizer 拒绝的空 root，并覆盖 ownership 与 pending permission filtering。
- FileProvider 构造期初始 `watchPaths` / `normalizedWatchPaths` 已复用 shared resolver，和 watch service 口径一致。
- FileProvider index worker depth scheduling 已复用 shared watch-root resolver，避免 normalizer rejected root 影响深度优先调度。
- Scan progress 读写边界已过滤空路径、重复路径、非法 timestamp；worker client 和 worker handler 两侧都有 guard。
- Scan progress upsert 边界已返回规范化后的真实写入 row count summary，FileProvider scan-progress evidence metadata 已记录最近一次 `attempted/ready/upserted/reason/checkedAt` 聚合结果且不暴露 path。
- FileProvider scan-progress raw/normalized path expansion、normalized progress path dedupe、watch-path filtering、WatchService auto-scan eligibility 的 scoped `scan_progress` 读侧路径扩展，以及 RuntimeReset scan-progress cleanup 路径扩展，已复用 shared `@talex-touch/utils/search` progress path helpers；RuntimeReset adapter 现在只传当前 owned watch roots，由 service 统一扩展 raw/normalized paths；`addWatchPath()` 已复用 shared watch-root ownership 判断，不再手写 normalized root exact-match 分支，减少 FileProvider 内部手写 path/progress 规则。
- Source progress/evidence/store、snapshot clone/cache、task-state、worker status、write flush snapshot/evidence 等 runtime diagnostics 已补多处输入清洗和快照隔离。
- Runtime reset 已走 `FileProviderRuntimeResetService` / `IndexedSourceResetExecutorService`，并已覆盖当前 watch roots 下的 `scan_progress` cleanup。
- Runtime automatic scan/reconcile retry policy 已在同类成功任务后重置失败 backoff，避免 hydrate 后旧失败记录继续阻断后续自动任务；已覆盖 shared policy 与 CoreApp scan/reconcile runtime 回归。
- Runtime automatic scan/reconcile debounce 已可从持久 task history hydrate 最近完成时间，避免重启后立即绕过短窗口自动调度；已覆盖 shared run-gate 与 CoreApp scan/reconcile runtime 回归。
- Recovery policy 已把 automatic scan/reconcile 的 retry-window、debounce skipped history 与 active `taskRunGate` running/debounced diagnostics 统一解释为低优先级 wait recommendation，避免 Settings diagnostics 误导用户立即 scan/reset。
- Settings recovery chip display 已为 retry-window 与 `taskRunGate` wait recommendation 输出结构化 wait metadata，避免 run-gate wait chip 显示空 retry 时间。
- 2026-06-20 当前阶段收尾：R3 已完成的本轮重点是非 schema、非破坏性的 hygiene 与 adapter boundary hardening，包括 watch delta queue 失败保留 pending delta、write flush / snapshot cache / worker-status cache snapshot 隔离、task-state hydrate/更新清洗、scan eligibility/strategy/current watch roots scoped filtering、SearchIndex worker `upsertScanProgress` 双侧 normalizer、FileProvider runtime reset cleanup raw+normalized path expansion、provider-scoped SearchIndex/FTS 写删 safety guard、reset/flush/progress/recovery 数值归一化，以及 Settings recovery chip wait metadata。该批只降低 fake evidence / cache pollution / duplicate scheduling 风险，不等同于完整 runtime-store migration。
- 2026-06-20 本轮验证口径：R3 相关 packages/utils 与 CoreApp focused tests 已按切片多次覆盖，当前 TODO 只保留下一批应复跑命令；涉及 schema、真实 watcher、真实浏览器 profile 或 packaged evidence 时仍必须补专项证据。

## 仍未完成

| 主题 | 状态 | 缺口 |
| --- | --- | --- |
| FileProvider SQLite/FTS runtime-store migration | open | scan worker、incremental DB persist、index worker flush trace 与 FTS 写入语义仍主要在 FileProvider/SearchIndex worker 内部。 |
| `scan_progress` source-scoped schema | open | 当前是读写侧 scoped hygiene 与 upsert evidence summary；完整 schema/source migration 需要单独确认并设计迁移。 |
| Durable job history | partial | scan/watch/reconcile/reset 已有 runtime task evidence 与 bounded history；scan/reconcile 同类成功后重置 retry backoff、debounce hydrate、skipped history wait、`taskRunGate` wait recommendation 与 recovery chip structured metadata 已覆盖。完整 durable scheduler history 与 Settings recovery UI screenshot/evidence 仍未闭环。 |
| Quicklinks persistent feed | open | runtime feed 已可见，但官方插件持久 feed storage、用户级 clear/rebuild UI 与 Settings evidence 未完成。 |
| Browser Bookmarks platform evidence | partial | metadata-only intent、consent、clear/disable/rebuild UI 已推进；真实浏览器 profile、跨平台 watch root 与 packaged evidence 仍缺。 |
| Everything productionization | partial | 仍需 SDK/CLI 最终策略、registry/PATH 探测、Windows 性能与 fail-closed 诊断 evidence。 |

## 下一步

1. 继续非 schema 小切片：优先消除 FileProvider 内部仍手写 root/path/progress 规则的地方，复用 `@talex-touch/utils/search` primitives。
2. 把 index worker flush trace、incremental DB persist、FTS write/delete summary 继续向 runtime store/task evidence 迁移，避免 FileProvider/SearchIndex worker 私有语义继续外溢。
3. 补 durable job history 的持久化边界：history append/update/store、Settings diagnostics recovery chip UI evidence、packaged/真实 Settings 截图或录屏。
4. 设计 `scan_progress` source-scoped migration 前先列出表结构、兼容读写、rollback、数据清理影响范围与迁移验证命令；这是数据结构变更，执行前需要单独确认。
5. Browser Bookmarks、Everything、Quicklinks 只做可验证小切片，不用 mock evidence 关闭真实平台项；真实浏览器 profile、Windows Everything、Quicklinks persistent feed 都必须有平台/evidence artifact。

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

涉及 schema、真实平台 watcher 或 packaged evidence 时，必须补对应 migration/evidence 专项验证，不能只用 unit tests 代替。
