# TODO

> 更新时间: 2026-02-10

## 已完成（已归档到 docs/engineering/ARCHIVE.md，2026-02-04）

## 2026-02 新增工程待办

- [ ] 【P1】SDK Hard-Cut 剩余 renderer 直连点清理（批次 E~F）
  - 参考：`docs/engineering/reports/sdk-unification-progress-2026-02-08.md`
- [ ] 【P1】`typecheck:web` 既有类型错误清理（恢复 CI 可信度）
- [ ] 【P2】测试覆盖提升：核心流程（插件加载、搜索、IPC 通信）系统测试
- [ ] 【P2】i18n 候选 key 清理（~410 keys）
  - 参考：已识别的 i18n ISSUES
- [ ] 【P2】TuffEx 构建跑通：`pnpm -C packages/tuffex build` + `docs:build`
- [ ] 【P3】`plan/` 目录索引生成（25+ 时间戳文件缺少导航）

## 待确认 / 待处理

- Nexus PWA 构建失败：Workbox 预缓存默认 2MiB 限制导致 `_nuxt/*.js`（~3MB）被拒；已加 `maximumFileSizeToCacheInBytes`，仍需确认是否继续拆分大 chunk。离线/内网构建需设置 `NUXT_DISABLE_WEB_FONTS=true`、`NUXT_DISABLE_SENTRY=true`。
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
