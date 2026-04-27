# Tuff 项目待办事项

> 从 PRD 文档提炼的执行清单（压缩版）
> 更新时间: 2026-04-27

---

## 🧭 单一口径矩阵（2.4.9）

| 主题 | 当前事实 | 下一动作 | 强制同步文档 |
| --- | --- | --- | --- |
| 版本主线 | 当前工作区基线为 `2.4.9-beta.4` | 推进 `CoreApp legacy 清理 + Windows/macOS 2.5.0 阻塞级适配` | `TODO` / `README` / `INDEX` / `CHANGES` |
| Legacy/兼容/结构治理 | 已锁定统一实施 PRD（五工作包并行），CoreApp 剩余兼容债务进入 `2.5.0` 前置清理窗口 | 清册中的 core-app `2.5.0` 项必须关闭或显式降权，不再新增 legacy 分支/raw channel/旧 storage protocol/旧 SDK bypass | `TODO` / `README` / `INDEX` / `CHANGES` / `Roadmap` / `Quality Baseline` |
| CoreApp 平台适配 | `2.5.0` 前 Windows/macOS 为 release-blocking；Linux 保留 documented best-effort | Windows/macOS 完成阻塞级人工回归；Linux 仅记录 `xdotool` / desktop environment 限制与非阻塞 smoke | `TODO` / `README` / `INDEX` / `CHANGES` / `Roadmap` / `Quality Baseline` |
| 2.4.8 Gate | OmniPanel 稳定版 MVP 已完成（historical） | 保留历史验收证据，不再作为当前开发主线 | `TODO` / `README` / `INDEX` / `CHANGES` |
| v2.4.7 Gate | A/B/C/D/E 全部完成（D/E historical） | 保留 run/manifest/sha256 证据链 | `TODO` / `README` / `Roadmap` / `Release Checklist` / `Quality Baseline` / `INDEX` |
| Pilot Runtime | Node Server + Postgres/Redis + JWT Cookie 主路径；首页默认 DeepAgent，legacy `$completion` 已收口为唯一前端主消费链 | 继续补齐 SSE 反向代理部署烟测与矩阵回归 | `TODO` / `README` / `Roadmap` / `Quality Baseline` / `INDEX` |

---

## 📚 文档盘点锚点（2026-03-17）

- 全仓 Markdown：`396`；`docs`：`146`；`docs/plan-prd`：`110`。
- 子域分布：`03-features 32`、`docs 20`、`04-implementation 17`、`01-project 12`、`05-archive 11`、`02-architecture 8`、`06-ecosystem 4`。
- 历史盘点锚点：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`；当前执行路线以本文件与 `CHANGES` 为准。

---

## 🔧 当前执行清单（2 周）

### CoreApp 兼容治理（当前进行中）

- [x] P0 Runtime Accessor / Sync IPC / Active Legacy Bridge hard-cut 主体完成。
- [x] P1 secure-store dedupe 收口到 `src/main/utils/secure-store.ts`。
- [x] P1 renderer update runtime 调用方迁移到 update SDK 薄运行时层，runtime 页面不再依赖 `useApplicationUpgrade`。
- [x] P2 fake prompt / DivisionBox settings 假入口清理完成。
- [x] P2 production `src` 下 demo/test/doc 文件物理删除，并清理 `components.d.ts` 悬空声明。
- [x] CoreApp compatibility 验收阻塞解除：
  - `pnpm -C "apps/core-app" run typecheck` 已通过。
  - `pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard.transport.test.ts" "src/main/modules/omni-panel/index.test.ts" "src/main/channel/common.test.ts"` 已通过（`3 files / 17 tests`）。
  - `rg` 回归扫描确认 runtime 口径仅保留 bootstrap `genTouchApp()`，`sendSync(` / `resolveRuntimeChannel(` / `legacy-toggle` / placeholder demo 命中已清零。
- [x] Windows Everything 搜索收口：
  - Everything provider 支持搜索取消、CLI CSV 稳健解析、多词查询透传、SDK 目录结果元数据保留。
  - SearchCore 明确 `@everything` / `@file` 路由语义，并修复同文本不同输入复用缓存的问题。
  - 已补 targeted regression：Everything provider 与 SearchCore baseline。
- [x] Clipboard 插件预览链路收口：
  - Clipboard SDK `history.onDidChange()` 对旧版 plugin transport stream 同步抛错做 non-fatal 降级。
  - clipboard-history 详情页优先解析 `meta.image_original_url` / `getHistoryImageUrl(id)`，原图不可用时显式展示缩略图降级状态。
- [x] Clipboard 自动粘贴失败诊断收口：
  - `copyAndPaste` / `applyToActiveApp` 失败结果保留 message/code，插件 UI 不再只显示泛化失败。
  - 主进程自动粘贴失败日志只记录安全元数据；macOS System Events 权限错误映射为可读授权提示。
- [x] Intelligence workflow / app-index 本地回归补强：
  - `workflow` shared SDK 与主进程 handler 已接通，`intelligence-module -> workflow service -> deepagent orchestration` 闭环可用；内置剪贴板整理模板改为 prompt step，避免不存在的 `deepagent.workflow` agent id 让默认模板即刻失败。
  - `tuff-intelligence-runtime` 的 tool trace / approval 现在会携带 `toolSource / approvalContext / contextSources`，方便 workflow 与 MCP 工具审批回放。
  - 定向回归已补：`common.test`、`intelligence-sdk.test`、`intelligence-deepagent-orchestration.test`、`transport-domain-sdks.test`、`search-processing-service.test`。
- [x] User-managed launcher foundation：
  - `settingsSdk.appIndex` 已补齐 `listEntries / upsertEntry / removeEntry / setEntryEnabled` typed contract，main `common.ts` 同步注册 handler。
  - `app-provider` 复用现有 `files + file_extensions` 模型支持 manual entry CRUD、启用/禁用、冲突校验与启动元数据持久化，不新增 schema/table。
  - `search-processing-service` 已对 disabled manual entry 做 recommendation/search 过滤，执行链路继续复用 `scheduleAppLaunch`。
  - 已补 targeted regression：`transport-domain-sdks.test.ts`、`common.test.ts`、`app-provider.test.ts`、`search-processing-service.test.ts`。
- [x] macOS 中文应用名首轮索引修复：
  - `darwin.getAppInfo()` 首轮扫描新增 Spotlight `kMDItemDisplayName` 安全读取，并在英文名优先时保留本地化名称为 `alternateNames`，避免“网易云音乐”等中文名称被扫描阶段丢弃。
  - `app-provider` 会把 `displayName + alternateNames` 一并生成中文、全拼与首字母关键词；补齐 `darwin.test.ts`、`app-provider.test.ts` 与 `search-processing-service.test.ts` 定向回归。
- [x] 官方插件体验补强：
  - `touch-translation` 快翻 widget 与 `fy-multi` 已统一默认翻译方向、provider 顺序与错误文案，多源页不再硬编码中文目标语言。
  - 新增 `touch-dev-utils` 纯本地程序员工具插件，覆盖 UUID、JWT、时间戳、Query String、命名转换与字符串转义。
- [x] Transport stream 内部协议统一：
  - `main/renderer/plugin` 共用 `packages/utils/transport/sdk/stream/*` 内部 runtime；默认 Port 优先，失败自动回退 `:stream:*`。
  - `ClipboardEvents.change` 已补 renderer/plugin/main 定向回归，覆盖 port 成功、回退、取消与 server fallback。
- [ ] CoreBox 第三方 App 非阻塞启动 Windows 真机验证：
  - 验证 `shortcut` 保留 `launchArgs / workingDirectory` 并在 CoreBox 立即隐藏后后台启动。
  - 验证 `uwp` 继续通过 `explorer.exe shell:AppsFolder\\...` handoff，早期失败会触发系统通知。
  - 2026-04-22 本地回归已补：`app-provider.test.ts` 覆盖 `shortcut` / `uwp` `onExecute` 异步 handoff，不等待后台观察窗口即可返回；仍需 Windows 真机补“窗口已隐藏 + 实际启动体验”。

### 2.5.0 CoreApp Release Blockers（当前优先）

- [x] Legacy 清理阻塞：清册中的 core-app `2.5.0` 项已关闭或显式降权；不得新增 `legacy` 分支、raw channel、旧 storage protocol、旧 SDK bypass。
  - 已将 `apps/core-app/scripts` 与 `apps/pilot/scripts` 纳入 `legacy/compat` 显式扫描范围，并手工补齐 allowlist / registry。
  - 插件 channel bridge 移除 legacy header 语义；DivisionBox dead `flow-trigger` 事件面已物理删除；Nexus store 旧 manifest/path fallback 已改为结构化错误。
  - permission JSON->SQLite、dev data root migration、theme localStorage migration 与 download legacy migration manager 已从启动/runtime 主路径移除，不再保留 migration exception。
- [ ] Windows 阻塞级回归：Everything/文件搜索、应用扫描/UWP、托盘状态、更新包匹配、插件权限拦截、安装/卸载、退出资源释放。
- [ ] macOS 阻塞级回归：首次引导权限、OmniPanel Accessibility 门控、native-share 标记、托盘/dock 行为、更新安装、插件权限拦截、退出资源释放。
- [ ] Linux 非阻塞观察：记录 `xdotool` / desktop environment 限制与 smoke 结果；不作为 `2.5.0` release blocker。
- [ ] 证据闭环：每轮清理同步 `CHANGES + TODO + compatibility registry`，并通过 Nexus Release Evidence API 采集 `docs:guard` / `legacy:guard` / 定向回归结果。
  - 2026-04-26 Nexus 证据入口：新增 `/api/admin/release-evidence/*`，支持 run 创建/分页/详情、item upsert、平台阻塞 matrix 与 `doc-guard` 快速写入；管理员登录态或 `release:evidence` API key 可写入，CI 默认走 API key。
  - 2026-04-27 写入阻塞：当前本地环境未提供 `release:evidence` API key 或管理员登录态，只能先把 docs guard、Nexus build/smoke 与本机 CoreApp 验证结果同步到 `CHANGES`；拿到凭证后按同一证据载荷写入 `/api/admin/release-evidence/doc-guard` 与 matrix。
  - 2026-04-27 matrix caseId 固化：Windows required 使用 `windows-everything-file-search` / `windows-app-scan-uwp` / `windows-third-party-app-launch` / `windows-shortcut-launch-args` / `windows-tray-update-plugin-install-exit`；macOS required 使用 `macos-first-run-permissions` / `macos-omnipanel-accessibility` / `macos-native-share-tray-dock-update` / `macos-plugin-permission-install-update` / `macos-exit-resource-release`；Linux 仅写 `linux-best-effort-smoke` 且 `requiredForRelease=false`。
  - 2026-04-20 自动门禁：`git diff --check`、`pnpm docs:guard`、`pnpm docs:guard:strict`、`pnpm compat:registry:guard`、`node scripts/check-legacy-boundaries.mjs`、`pnpm network:guard` 已通过；`pnpm legacy:guard` 在 legacy/compat 子门禁通过后被既有 `size:guard` 大文件基线漂移拦截；CoreApp typecheck/test 待本地依赖安装后补证。
  - 2026-04-22 CoreApp 补证：补齐 `EverythingProvider` 的 `SDK -> CLI -> file-provider` 双重失效同次查询回退回归；`git diff --check`、`pnpm -C "apps/core-app" run typecheck`、`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/everything-provider.test.ts" "src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts" "src/main/channel/common.test.ts"` 已通过。
  - 2026-04-23 renderer 权限中心死分支清理：删除未使用且仍保留旧 SDK “跳过权限校验”语义的 `PermissionStatusCard` / `PermissionRequestDialog` / `usePluginPermission`，同步移除 `PermissionStatusCard` 清册条目，并补齐当前 `compatibility-debt-registry` 漂移项；`pnpm -C "apps/core-app" run typecheck:web`、`pnpm compat:registry:guard`、`git diff --check` 已通过。
  - 2026-04-23 SearchLogger 旧配置键清理：`search-engine-logs-enabled` runtime fallback 已改成启动迁移到 `app-setting.ini`，并同步移除 `search-logger.ts` 的 compatibility registry 条目；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/storage/search-engine-logs-setting-transfer.test.ts" "src/main/modules/box-tool/search-engine/search-logger.burst.test.ts"`、`pnpm -C "apps/core-app" run typecheck:node` 待本轮 `git diff --check` / `pnpm compat:registry:guard` 一并复核。
  - 2026-04-26 CoreApp capability 语义收口：FlowBus 未注册 delivery handler 的 target 改为 `TARGET_OFFLINE`，插件投递异常不再被吞成 delivered；`platform.flow-transfer` / `platform.division-box` / active-app 改为条件型 best-effort，并删除过度乐观的 `isActiveAppCapabilityAvailable()`；macOS notification 支持态不再误报为 granted。定向回归：`permission-checker.test.ts`、`capability-runtime.test.ts`、`flow-bus.test.ts`、`flow-trigger.test.ts` 已通过。

### A. 文档治理（本轮）

- [x] 六主文档日期统一到 `2026-03-16`。
- [x] 六主文档“下一动作”统一为 `Nexus 设备授权风控`。
- [x] `CHANGES` 完成“近 30 天主文件 + 历史月度归档”拆分。
- [x] `README/INDEX` 入口压缩为高价值快照。
- [x] Phase 0：新增 `legacy:guard`（冻结新增 `legacy` 分支与 `channel.send('x:y')` raw event）。
- [x] Phase 0：建立 `scripts/legacy-boundary-allowlist.json`，存量兼容债务全部附 `expiresVersion=2.5.0`。
- [x] 统一治理 SoT：新增 `docs/plan-prd/docs/compatibility-debt-registry.csv`（固定字段与 owner/expires/test_case）。
- [x] 统一治理门禁：新增 `pnpm compat:registry:guard` + `pnpm size:guard`，并并入 `pnpm legacy:guard`。
- [x] 统一主线验收入口：新增 `pnpm quality:gate` 聚合命令（`legacy/network/test:targeted/typecheck/docs`）。
- [x] 超长文件冻结：新增 `scripts/large-file-boundary-allowlist.json`（主线基线 `47` 个）。
- [x] 主线隔离：root workspace 与 root lint 默认仅覆盖 `core-app/nexus/pilot/packages/plugins`。
- [x] Sync 兼容壳行为固化：补充 `/api/sync/pull|push` 返回 410 的自动化测试断言。
- [x] 债务扫描口径显式化：主线改为显式白名单 + 漏扫报错 + `scanScope` 摘要输出。
- [x] 超长文件防漂移：`--write-baseline` 禁止自动上调，新增 `growthExceptions` 显式豁免机制。
- [x] `TODO` 主文件压缩到 400 行以内并稳定维护。
- [ ] 第二批历史文档统一加“历史/待重写”头标。

### B. Nexus 风控主线（下一开发动作）

- [x] Phase 0：补齐设备授权风控验收证据（含回滚演练记录）。
- [x] Nexus 组件文档页卡死收口：组件同步表改走服务端轻量数据源，`TuffDemoWrapper` 改为按文档引用 demo 懒加载，`/docs/dev/components` 加入 prerender。
- [x] Nexus updates/Tuffex 回归收口：公共 updates 页首屏 `history=1` 查询状态与要闻空态继续复用 Tuffex；Release Evidence schema guard 改为按 D1 binding 实例隔离，避免新 binding 跳过建表。
- [ ] Phase 1：完成速率限制、冷却窗口、审计日志落地。
- [x] Phase 1：补齐风控告警策略与责任人值守说明。
- [x] 输出最小可复现门禁命令与发布前检查单。

### C. 文档门禁节奏

- [x] `docs:guard` 已在 CI 以 report-only 运行。
- [ ] 连续 5 次 `docs:guard` 零告警（升级 strict 前置条件之一）。
- [ ] 连续 2 周无“状态回退/口径漂移”冲突。
- [ ] 达成条件后将 CI 从 report-only 升级为 strict 阻塞。

### D. 本轮回滚预案（2026-03-16 Findings 修复）

- 回滚触发条件：
  - `apps/nexus` 在 Sentry server config 加载路径上出现异常（启动失败或配置未生效）。
  - `compat:registry:guard` 出现非预期 coverage 回退。
- 回滚步骤（提交粒度）：
  - 文件名回滚：`apps/nexus/sentry.server.config.ts` 按需恢复到异常旧名路径，仅用于应急回退验证。
  - 清册回滚：恢复本轮清理的两条 registry 行（`apps/pilot/shims-compat.d.ts`、`apps/nexus/i18n.config.ts`）。
  - 脚本回滚：撤销 `check-compatibility-debt-registry.mjs` 中 `registry-only domain` 改动。
- 回滚后必跑：
  - `pnpm compat:registry:guard`
  - `pnpm legacy:guard`
  - `pnpm quality:gate`

### E. Transport Legacy 清退清单（启动项，目标 v2.5.0）

- 清单文档：`docs/plan-prd/docs/TRANSPORT-LEGACY-RETIREMENT-CHECKLIST-2026-03.md`
- [x] 第一轮入口收口完成：`legacy-transport-import` 从 `4 files / 4 hits` 降到 `0 files / 0 hits`。
- [x] hard-cut 完成：`packages/utils/transport/legacy.ts` 与 `packages/utils/permission/legacy.ts` 已物理删除，SDK legacy 出口下线。
- 现状说明：
  - 对外仅保留 `@talex-touch/utils/transport` / `@talex-touch/utils/permission` 正式入口，CI/Lint 已禁止 legacy import。
- 统一替换策略：
  - 对外入口优先 `@talex-touch/utils/transport` typed SDK，不新增 legacy 导出。
  - legacy 仅保留读兼容和 warn-and-forward，不再承载新能力。
- 执行顺序（单链路）：
  - [x] `packages/utils/plugin/preload.ts` 与 `packages/utils/renderer/storage/base-storage.ts`（内部调用侧）。
  - [x] `apps/core-app/.../widget-registry.ts`（renderer 暴露面）。
  - [x] `packages/utils/index.ts`（统一出口重导向）。
  - [x] `v2.5.0` 前移除 transport 中 legacy 兼容符号对外转出（本轮已提前完成）。
- 验收口径：
  - [x] `legacy-transport-import` = `0 files / 0 hits`。
  - `pnpm quality:gate` 全绿且无新增兼容债务。

### F. Pilot / Intelligence 长尾（已下沉）

- [x] Pilot 附件、管理配置、路由 V2、工具审计、Websearch、旧 UI 卡片流、多模态与模型组能力治理的历史完成事实已下沉到 `CHANGES` 与长期债务池，主清单不再展开逐项历史。
- [ ] Pilot strict 错误码端到端回归、SSE 反向代理部署烟测、`video.generate` 真实运行时与严格模式线上观测继续由长期债务池承载。
- 入口：`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`

### N. Core Main 修理进展（2026-03-23）

- 已完成启动链路 fail-fast：必需模块加载失败直接终止，不再发送 `ALL_MODULES_LOADED`。
- 已完成退出链路统一：`closeApp` + tray 退出分支移除运行时 `process.exit(0)`，统一走 `app.quit()`。
- 已完成 EventBus 契约补齐：`once` 消费生效、`emit/emitAsync` handler 级异常隔离、诊断指标可观测。
- 已完成 IPC 重复注册收敛：`dialogOpenFileEvent` 保留单一注册实现并维持 payload 兼容。
- 已补齐主进程回归用例与门禁命令：`vitest` 定向 19 tests + `typecheck:node` 均通过。
- 已完成生命周期收口补完：
  - 新增 `startup-health` 统一健康门禁（`loadStartupModules + waitUntilInitialized`）与失败阻断测试。
  - 新增 `before-quit` 8s 超时保险，确保异步 handler 卡死时仍能继续退出。
  - `ModuleManager` 增加 `reason/appClosing/duration/failedCount` 卸载观测，并暴露 `getLastUnloadObservation()`。
- 已完成 `$app` 去耦首轮：
  - 生命周期上下文新增 `ctx.runtime`（`MainRuntimeContext`）。
  - `plugin-module`、`UpdateService` 首批改为 runtime 注入读取，保留 1 迭代过渡兼容告警。
  - 新增静态守卫：`pnpm guard:global-app`，防止 `src/main/**` 新增 `$app` 直接读取。
- 已完成结构治理首轮（保持外部契约不变）：
  - `plugin-module` 抽取编排/IO 服务（orchestrator + io service）。
  - `file-provider` 抽取路径/查询服务。
  - `UpdateService` 抽取检查/下载/安装 action controller。
  - direct tests 已补齐并纳入 `pnpm test:core-main` 子集门禁。
- 下一轮待推进（P2）：
  - 继续压缩 `$app` allowlist 存量命中；
  - `plugin-module/file-provider/UpdateService` 进一步按编排层 + 领域层 + IO 层深拆，补齐剩余 direct tests。

### S. Core-App 兼容层激进硬切（2026-04-18）

- [x] 契约层硬切：插件 feature trigger 输入统一为 `TuffQuery`；OmniPanel deprecated toggle event/type 删除；旧 SDK 插件继续按 `SDKAPI_BLOCKED` 阻断。
- [x] 存储/协议硬切：prompt registry 成为唯一 prompt SoT；Store/Agent 忽略 legacy key；`touch-app` 仅认 `app-setting.ini`；legacy `tfile://` 与非 canonical update channel 不再兼容。
- [x] 鉴权硬切：移除明文 machine seed 与 renderer localStorage legacy 迁移；secure storage 不可用时进入显式 degraded session 模式。
- [x] Windows 文件搜索回补：普通查询优先 Everything，过滤/索引型查询直走 `file-provider`，Everything 不可用/禁用时自动 fallback。
- [x] 平台能力收敛：`native-share` 仅 macOS 标记 `supported`；Win/Linux 仅保留显式 `mail` 目标，不再冒充系统分享。
- [x] 正式 UI 去占位：布局页不再展示 disabled “Coming Soon” 卡片；`Publish to Cloud` 按钮移除。
- [x] 热点日志收敛：`file-provider` / `file-system-watcher` / `permission-store` / `tray-manager` / `file-protocol` 改走统一 logger。
- [ ] 验证收口：待当前 worktree 安装 `apps/core-app/node_modules` 后补跑 `typecheck:node` / `typecheck:web` / `test` 并记录证据。

### O. CoreApp 文件索引稳态修复（2026-03-25）

- [x] flush 链路改为 pending/inflight 可恢复队列，失败回补且保持“新数据优先”。
- [x] 定时 flush 统一调度入口并固定兜底，消除 `Unhandled rejection`。
- [x] `search-index-worker` 关键写路径补齐 `SQLITE_BUSY` 重试并统一 label。
- [x] `SearchIndexService` 索引/删除日志改为时间窗 summary，慢批次即时输出。
- [x] 补齐定向测试：flush 失败恢复、worker 重试、日志节流。

### P. CoreApp 兼容债务硬切（2026-03-23）

- [x] 跨平台一致性修复：Linux 权限探测路径按平台分流；更新资产平台/架构识别统一并显式 `unsupported`；AppImage 小写识别修复。
- [x] 权限系统硬切：删除 legacy `sdkapi` 放行路径，缺失/低版本统一 `SDKAPI_BLOCKED` 阻断；`allowLegacy` 配置移除。
- [x] Storage/Channel 硬切：主进程 legacy `storage:get/save/reload/save-sync/saveall` 处理移除，统一 `StorageEvents.app.*`；`window.$channel` 业务入口清零。
- [x] 插件 API 硬切：deprecated 旧暴露（含顶层 `box/feature` 兼容别名）下线，仅保留 `plugin.box`/`plugin.feature` 与 `boxItems` 新入口。
- [x] 占位能力补齐：`OfficialUpdateProvider` 改为真实接口探测，后端不可用返回 `unavailable + reason`；`AgentStore` 实装远端目录/下载/校验/解包/回滚/真实更新比对；`ExtensionLoader` 补齐 unload 生命周期。
- [x] 自动化验证：`typecheck` 通过；定向 `vitest`（权限门禁、平台识别、AgentStore、Extension unload）通过。
- [ ] Windows/macOS 阻塞级人工回归：首次引导权限、更新包匹配、插件权限拦截、Agent 安装升级卸载、退出资源释放。
- [ ] Linux 非阻塞 smoke：记录 `xdotool` / desktop environment 限制与 smoke 结果，不阻塞 `2.5.0`。

### Q. CoreBox 搜索性能优化（2026-03-23）

- [x] P0：输入防抖下调（`BASE_DEBOUNCE=80ms`），保持去重窗口 `200ms`。
- [x] P0：`SearchIndexService` 增加 `warmup()`，并在初始化补齐 `keyword_mappings` 复合索引（`provider+keyword`、`provider+item`）。
- [x] P0：`SearchEngineCore` 在查询入口记录搜索活跃时间，并在 init 阶段非阻塞预热索引服务。
- [x] P0：`file-provider` 语义检索改为预算内补召回（`query>=3 && candidate<20`）+ `120ms` 超时降级。
- [x] P1：app/file 精确词匹配改为批量 `lookupByKeywords`，减少逐 term SQL round-trip。
- [x] P1：`lookupBySubsequence` 增加扫描上限（默认 `2000` + SQL `LIMIT`），app 侧触发约束为 `candidate<5 && query<=8`。
- [x] P2：后台重任务避让搜索活跃窗口（最近 `2s` 有 query 时跳过一轮，后续 idle 自动补跑）。
- [x] 单测：新增 `search-activity.test.ts`，覆盖活跃窗口判定行为。
- [ ] 验收：按 `search-trace` 采样 200 次真实查询，确认 `first.result/session.end` P95 与慢查询占比达标。
- [ ] 门禁：待仓库既有 `extension-loader.test.ts` 类型错误修复后，补跑并记录 `typecheck:node` 全绿证据。

### R. 启动搜索卡顿永久治理（2026-03-24）

- [x] 数据库分层：新增 aux 库（`database-aux.db`）并迁移高频/非核心写入表（analytics/recommendation/clipboard/ocr/report queue）。
- [x] 双库开关：新增 `TUFF_DB_AUX_ENABLED`、`TUFF_DB_QOS_ENABLED`、`TUFF_STARTUP_DEGRADE_ENABLED`。
- [x] 调度器 QoS：`DbWriteScheduler` 支持 `priority/maxQueueWaitMs/budgetKey/dropPolicy`，并内建标签策略与 busy 熔断。
- [x] 兼容读取窗口：关键路径支持“先查 aux，未命中回查 core”兜底（recommendation/analytics range/report queue/telemetry stats）。
- [x] 索引热路径单写者：`file-index.full-scan/reconcile/scan-progress` 改由 `search-index-worker` 统一落库。
- [x] 启动降载：analytics 写入失败指数退避；clipboard 在索引高压下动态降频并增加图片落库去抖。
- [x] 观测增强：队列分级深度、标签等待统计、drop/circuit 状态与 `SQLITE_BUSY` 比例输出。
- [x] 新增单测：`db-write-scheduler.test.ts` 覆盖优先级、丢弃策略、熔断开启/恢复。
- [ ] 压测验收：执行“全量索引 + 高频推荐 + 剪贴板图像轮询”并产出 2 分钟窗口内 lag/P95 证据。

---

## 📚 文档债务池（第二轮 + 第三轮摘要）

### 已处理

- [x] `OMNIPANEL-FEATURE-HUB-PRD`：标记为 historical done（2.4.8 Gate）。
- [x] `PILOT-NEXUS-OAUTH-CLI-TEST-PLAN`：改为“已落地 vs 未启动”结构。
- [x] `TUFFCLI-INVENTORY`：切换为 `tuff-cli` 主入口口径。
- [x] `NEXUS-SUBSCRIPTION-PRD` 与 `NEXUS-PLUGIN-COMMUNITY-PRD`：加历史降权头标。
- [x] 新增长期债务池文档：`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`。

### 剩余

- [ ] Telemetry/Search/Transport/DivisionBox 四个长文档改造为 TL;DR 分层模板。
- [ ] `04-implementation` 目录继续清点 Draft 文档并标注有效状态。
- [ ] 抽样复核主入口链接可达性（归档后不得断链）。

---

## 🌊 分波次债务推进（W2-W4）

- [ ] Wave A（Transport）：MessagePort 高频通道迁移 + `sendSync` 清理。
- [ ] Wave B（Pilot）：存量 typecheck/lint 清理 + SSE/鉴权矩阵回归。
- [ ] Wave C（架构质量）：`plugin-module/search-core/file-provider` SRP 拆分。
- [ ] 每波固定产出：`CHANGES` 证据 + `TODO` 状态 + 可复现门禁命令集。

---

## ✅ 历史收口状态（仅保留事实）

- [x] `2.4.8 OmniPanel Gate`：已完成，保留 historical 记录。
- [x] `v2.4.7 Gate D`：历史资产回填已完成（run `23091014958`）。
- [x] `v2.4.7 Gate E`：按 historical done 关闭，不重发版。
- [x] `2.4.9-beta.4`：发布基线与 CI 证据已固化。
- [x] CLI Phase1+2：迁移完成，`2.4.x` shim 保留、`2.5.0` 退场。
- [x] Pilot Chat/Turn 协议硬切：`/api/chat/sessions/:sessionId/stream` 为唯一主入口，`/api/v1/chat/sessions/:sessionId/{stream,turns}` 已物理删除；历史 `pilot_quota_history.value` 已完成 base64 -> JSON 迁移并统一 JSON 读写。
- [x] Startup Path Governance：启动 root path、目录创建、legacy dev data marker 迁移与启动观测已完成；详细实现留在 2026-03-23 历史记录。

---

## 🔗 长期债务入口

- 长期与跨版本事项见：`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`

---

## 📊 任务统计

| 统计项 | 数值 |
| --- | --- |
| 已完成 (`- [x]`) | 85 |
| 未完成 (`- [ ]`) | 24 |
| 总计 | 109 |
| 完成率 | 78% |

> 统计时间: 2026-04-27（按本文件实时 checkbox 计数）。

---

## 🎯 下一步（锁定）

1. 完成 `CoreApp legacy 清理 + Windows/macOS 2.5.0 阻塞级适配` 文档化与清册闭环。
2. 按 Windows/macOS 阻塞级回归清单补齐人工证据；Linux 仅记录 best-effort smoke。
3. `Nexus 设备授权风控` 保留实施文档与历史入口，降为非当前主线。
4. `docs:guard` 连续零告警后，再升级 strict 阻塞策略。
