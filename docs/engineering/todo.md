# TODO

## 已完成

- 插件详情页（`PluginInfo`）滚动收缩：隐藏描述/徽章，缩小图标与 padding，状态条收起并把状态入口收进头部右侧
- Tabs 滚动统一：`TTabs` / `TvTabs` 从 `ElScrollbar` 切换为 `TouchScroll`（TxScroll 封装）
- Plugin 页面滚动统一：
  - `Plugin.vue` 主内容区 `overflow-auto` → `TouchScroll`
  - `PluginIssues.vue` / `PluginStorage.vue` 列表滚动 → `TouchScroll`，并向上回传 `scroll` 事件以维持头部收缩逻辑
  - `PluginItem.vue` Popover issues 列表滚动 → `TouchScroll (native)`
  - `PluginFeatures.vue` JSON 横向滚动 → `TouchScroll (native, horizontal)`
- TxScroll 滚动回归修复：
  - wheel handler：在 **不可滚动** 的情况下不再吞掉 `wheel`（避免“看起来无法滚动/父级无法接管”）
  - `TTabs` 布局：修复 `align-items: center` 导致滚动容器高度不成立的问题
- 渐变模糊（TxGradualBlur）接入：
  - `ViewTemplate` 顶/底渐变模糊（覆盖大多数基础页面）
  - `TuffAsideTemplate` 主内容区顶/底渐变模糊（覆盖 Plugin/Market 等侧栏布局页面）
- 全局 TxScroll 收尾（已迁移 3 处）：
  - `apps/core-app/src/renderer/src/components/flow/FlowSelector.vue`
  - `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceAuditPage.vue`
  - `apps/core-app/src/renderer/src/components/base/dialog/TPopperDialog.vue`

## 待确认 / 待处理

- legacy 权限类型兼容层（`packages/utils/permission/legacy.ts`）去留评估与迁移清理（从 `TYPECHECK_FIXES` 转入）。
- 【P0/发版前】启动期日志与性能问题治理（基于 `docs/engineering/audits/260109-LOGANALY.md`）：event-loop 卡顿、StartupAnalytics 刷屏、`file-index:*` no-handler、renderer `sendSync.slow`、AppProvider 扫描/DB 更新偏重；需复测并验证日志收敛。
- 【P0/高优先级】剪贴板/AutoPaste/Pin 机制问题（`docs/clipboard-mechanism-analysis.md`）：Pinned 去重不一致与 AutoPaste/AutoClear 行为需统一修复与验证。
- 体验走查：插件详情页各 Tab（尤其 `Logs`）内部滚动时，头部收缩是否符合预期（当前 `Issues/Storage` 已回传滚动；`Logs` 若内部自带滚动，可能也需要回传）
- 嵌套滚动策略：`TouchScroll` 套 `TouchScroll` 时的滚轮/触控板事件传递（是否需要 `scrollChaining` 或统一只保留一层滚动容器）
- 全局 TxScroll 收尾（可选）：renderer 仍存在其它 `overflow-*`（部分为 dialog/test/preview 组件），是否继续统一到 `TouchScroll`（建议按“需要 sticky header/原生链式滚动”与“需要 BetterScroll 统一手感”两类拆分策略）
- 样式影响范围确认：`TvTabs` 为适配 `TouchScroll` 加的 `:deep(.tx-scroll__content)` 是否会带来副作用（如有则进一步局部化）
  - `apps/core-app/src/renderer/src/components/tabs/vertical/TvTabs.vue`

---

## Plan 目录对照（2026-01）

> 来源：`plan/` 目录。此处记录与实际落地的差距与后续待办。

### 已落地
- [x] 内部下载任务隐藏与通知抑制（`plan/2026-01-21_13-25-11-download-internal-visibility.md`）
- [x] TouchSDK/Window 示例迁移到 hooks（`plan/2026-01-20_18-50-26-touchsdk-window-hooks-migration.md`）
- [x] App Indexing 启动补漏 + 周期全量对比（`plan/planprd-app-indexing.md`）
- [x] Tuffex 组件 3/4/5/7/8（实现/测试/文档）（`plan/2026-01-20_21-16-53-tuffex-components-34578.md`）
- [x] Config Storage 上下文整理与策略文档（`plan/2026-01-20_18-55-03-context-requirements.md`、`plan/2026-01-20_18-47-35-config-storage-sqlite-json-sync.md`）

### 部分完成
- [ ] SearchLogger 延迟初始化已修复，测试与验证补齐（`plan/2026-01-21_13-39-30-basemodule-lifecycle-analysis.md`）
- [ ] Nexus Examples 入口已落地，但“单一来源”策略未统一（`plan/2026-01-21_13-22-14-nexus-examples-section.md`）
- [ ] Transport MessagePort 支持已在 SDK 落地，业务高频通道迁移待推进（`plan/2026-01-21_03-01-57-transport-message-port.md`）

### 待实现
- [ ] Config Storage SQLite/JSON 统一落地（ConfigRepository + 迁移/回滚/双写策略）（`plan/2026-01-20_18-47-54-config-storage-sqlite-json-sync.md`）
- [ ] TuffTransport 全量迁移与 async 任务模型，清理 sendSync（`plan/2026-01-21_01-29-05-transport-migration-async.md`）
- [ ] CLI 补齐 `tuff validate` 与 manifest 校验（`plan/2026-01-20_18-48-52-plugin-cli-refine.md`）
- [ ] Perf Log 优化项：core-box:query 同步改造、/setting 路由拆分、tfile 路径兼容（`plan/2026-01-19_11-10-40-perf-log-analysis.md`）
- [ ] Nexus 首页内容整改与占位移除（`plan/2026-01-21_13-25-00-nexus-homepage-revamp.md`）
- [ ] Release Pipeline：OIDC + RSA + notes/assets 同步（`plan/planprd-release-pipeline.md`）

### 需人工确认
- [ ] Stash 弹出恢复处理（`plan/2026-01-20_21-17-14-stash-pop-recovery.md`）

## 备注

- `npm run typecheck:web` 当前仓库存在既有类型错误（与本次 UI/滚动改动无关），暂时无法作为本次变更的回归信号。
