# Tuff 项目待办事项

> 从 PRD 文档提炼的执行清单（压缩版）
> 更新时间: 2026-04-22

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
- 统一口径文档：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`。

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
- [x] Intelligence workflow / app-index 本地回归补强：
  - `workflow` shared SDK 与主进程 handler 已接通，`intelligence-module -> workflow service -> deepagent orchestration` 闭环可用；内置剪贴板整理模板改为 prompt step，避免不存在的 `deepagent.workflow` agent id 让默认模板即刻失败。
  - `tuff-intelligence-runtime` 的 tool trace / approval 现在会携带 `toolSource / approvalContext / contextSources`，方便 workflow 与 MCP 工具审批回放。
  - 定向回归已补：`common.test`、`intelligence-sdk.test`、`intelligence-deepagent-orchestration.test`、`transport-domain-sdks.test`、`search-processing-service.test`。
- [x] macOS 中文应用名首轮索引修复：
  - `darwin.getAppInfo()` 首轮扫描新增 Spotlight `kMDItemDisplayName` 安全读取，优先级提升为 `Spotlight > localized strings > plist > bundle`，fresh scan 不再依赖后续 `mdls` 维护任务才能拿到中文显示名。
  - `app-provider` 中文关键词生成统一使用 `displayName` 优先顺序，并把拼音关键词规范化为 lowercase；补齐 `darwin.test.ts` 与 `app-provider.test.ts` 定向回归。
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
  - 插件 channel bridge 移除 legacy header 语义；DivisionBox trigger 切到 typed `CoreBoxEvents.ui.trigger`；Nexus store 旧 manifest/path fallback 已改为结构化错误；FlowTrigger 触发默认返回 `FLOW_TRIGGER_UNAVAILABLE`。
  - permission JSON->SQLite、dev data root migration、theme localStorage migration 降权为 `core-app-migration-exception`，保留定向 regression。
- [ ] Windows 阻塞级回归：Everything/文件搜索、应用扫描/UWP、托盘状态、更新包匹配、插件权限拦截、安装/卸载、退出资源释放。
- [ ] macOS 阻塞级回归：首次引导权限、OmniPanel Accessibility 门控、native-share 标记、托盘/dock 行为、更新安装、插件权限拦截、退出资源释放。
- [ ] Linux 非阻塞观察：记录 `xdotool` / desktop environment 限制与 smoke 结果；不作为 `2.5.0` release blocker。
- [ ] 证据闭环：每轮清理同步 `CHANGES + TODO + compatibility registry`，并附 `docs:guard` / `legacy:guard` / 定向回归结果。
  - 2026-04-20 自动门禁：`git diff --check`、`pnpm docs:guard`、`pnpm docs:guard:strict`、`pnpm compat:registry:guard`、`node scripts/check-legacy-boundaries.mjs`、`pnpm network:guard` 已通过；`pnpm legacy:guard` 在 legacy/compat 子门禁通过后被既有 `size:guard` 大文件基线漂移拦截；CoreApp typecheck/test 待本地依赖安装后补证。
  - 2026-04-23 renderer 权限中心死分支清理：删除未使用且仍保留旧 SDK “跳过权限校验”语义的 `PermissionStatusCard` / `PermissionRequestDialog` / `usePluginPermission`，同步移除 `PermissionStatusCard` 清册条目，并补齐当前 `compatibility-debt-registry` 漂移项；`pnpm -C "apps/core-app" run typecheck:web`、`pnpm compat:registry:guard`、`git diff --check` 已通过。
  - 2026-04-23 SearchLogger 旧配置键清理：`search-engine-logs-enabled` runtime fallback 已改成启动迁移到 `app-setting.ini`，并同步移除 `search-logger.ts` 的 compatibility registry 条目；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/storage/search-engine-logs-setting-transfer.test.ts" "src/main/modules/box-tool/search-engine/search-logger.burst.test.ts"`、`pnpm -C "apps/core-app" run typecheck:node` 待本轮 `git diff --check` / `pnpm compat:registry:guard` 一并复核。

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
- [ ] `TODO` 主文件压缩到 400 行以内并稳定维护。
- [ ] 第二批历史文档统一加“历史/待重写”头标。

### B. Nexus 风控主线（下一开发动作）

- [x] Phase 0：补齐设备授权风控验收证据（含回滚演练记录）。
- [x] Nexus 组件文档页卡死收口：组件同步表改走服务端轻量数据源，`TuffDemoWrapper` 改为按文档引用 demo 懒加载，`/docs/dev/components` 加入 prerender。
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

### F. Pilot 附件慢链路治理 + CMS 设置合并（2026-03-16）

- [x] 新旧链路统一附件投递策略：`id > https url > base64`（并发=3，快速失败错误码透出）。
- [x] `pilot stream` 与 `legacy executor` 接入统一解析器，并补充 `attachment.resolve.start/end` 与 `attachment.delivery.summary` 埋点。
- [x] `/api/chat/sessions/:sessionId/uploads` 支持 `multipart/form-data`，兼容保留 `contentBase64`。
- [x] 新增 `GET /api/chat/attachments/capability`，Pilot/legacy 输入框共用探测能力。
- [x] 新增聚合后台设置接口：`GET/POST /api/admin/settings`。
- [x] 新增 Admin 页面：`/admin/system/channels`、`/admin/system/storage`（列表 + 添加/编辑弹框），`/cms/*` 退化为 Legacy 跳转层。
- [x] App 管理进一步拆页：`model-groups / route-combos / routing-policy / routing-metrics` 独立入口；`pilot-settings` 退化为总览跳转页。
- [x] Channels 升级为多模型配置：每渠道维护模型列表、默认模型与启用模型列表。
- [x] 左侧导航滚动修复并精简系统管理入口（默认隐藏 `角色管理 / 菜单管理 / 字典项`）。
- [x] 管理配置 SoT 保持 `pilot_admin_settings`；密钥字段脱敏展示、写入加密、空值不覆写。
- [x] 自动部署口径澄清并固化：`commit != deploy`，仅 `push master` 命中 workflow 且 webhook secrets + 1Panel webhook 健康时自动触发；保留 `ssh home` 手动兜底路径。
- [x] SSE 前端兼容层补齐：`event/session_id/[DONE]` 统一映射到 `type/sessionId/done`，支持 `turn.*` 全链路事件消费。
- [x] `turn.failed` 错误可见性修复：消息区强制追加 assistant 失败消息，底部保留诊断详情（`code/status_code/request_id`）。
- [x] CMS 收口补丁：`/admin/*` 作为管理主入口，`/cms/*` 统一跳转到对应 `/admin/*`。
- [x] `/cms` 防御性修复：browser-only API 增加客户端守卫，`router.back()` 增加无历史栈 fallback。

### G. Pilot 合并升级 V2（2026-03-17）

- [x] 统一执行链路：`/api/aigc/executor` 与 `/api/chat/sessions/*` 接入路由解析与指标采集；`/api/v1/chat/sessions/*` 仅保留非 stream/turns 子路由。
- [x] 执行入口硬切：`/api/aigc/executor` 已物理删除，`/api/chat/sessions/:sessionId/stream` 成为唯一执行入口。
- [x] 旧输入框附件出站硬切：`ThInput` 改为会话级 `POST /api/chat/sessions/:sessionId/uploads`，发送改为 `message + attachments` 分离，不再拼接 `Attachment references` 文本。
- [x] 历史 dataURL 附件发送前自动转换为 session `attachmentId`；无法转换的旧附件阻断出站并提示重传。
- [x] `chat stream` 入参附件结构化校验收紧：拒绝 inline `data:` 与非 id-first 附件投递。
- [x] 新增渠道评比指标：记录 `queueWaitMs/ttftMs/totalDurationMs/success/errorCode/finishReason/channel+model/routeCombo`。
- [x] 新增渠道熔断状态机：按失败阈值摘除，冷却后半开探测恢复。
- [x] 新增模型目录与路由组合后台接口：`models/route-combos/channel-models/sync/routing-metrics/runtime-models`。
- [x] 前端 gptview 切换为运行时模型目录驱动，支持 `internet/thinking` 开关透传。
- [x] 兼容入口收口：`/pilot` 保留兼容跳转到 `/`。
- [x] 接入真实 LangGraph Local Server 运行图：`createPilotRuntime` 已支持 `langgraph-local` 主引擎执行，启动失败/空流自动回退 deepagent。

### H. Pilot 工具调用提示 + 数据源抓取 V1（2026-03-18）

- [x] 新增 `PilotToolGateway` 与 `websearch` connector 三段接口（`search/fetch/extract`），形成统一工具执行入口。
- [x] 新增 `datasource.websearch` 配置并并入 Admin settings 聚合接口。
- [x] 新增 `tool-approvals` 审批票据存储与 `GET/POST` API，支持 `pending/approved/rejected` 生命周期。
- [x] `executor` 输出标准 `run.audit` 工具事件，已移除 `status_updated(calling/result)` 工具兼容映射。
- [x] `v1 chat stream` 透传 `run.audit/status_updated`，高风险审批命中后进入阻塞等待（`turn.approval_required`）。
- [x] 前端统一解析 `run.audit` 工具事件（`status_updated` 仅保留通用流状态），新增 Tool 卡片视图（含来源链接与审批上下文）。
- [x] Intent 混合识别（`/image|/img` 显式命令 + 规则 + nano 分类兜底）落地，默认 nano 未配置时跟随主模型。
- [x] 路由策略扩展：`intentNanoModelId/intentRouteComboId/imageGenerationModelId/imageRouteComboId` 与 `allowImageGeneration` 已接入配置与运行时模型输出。
- [x] 新增 `image.generate` 工具并接入新旧两条会话链路短路执行（命中图像意图时直接返回 Markdown 图片 + Tool 卡片审计事件）。
- [x] 增加“审批通过后自动续跑”前端交互：命中 `turn.approval_required` 后自动轮询审批票据，`approved` 时复用原 `request_id` 自动续跑，`rejected/timeout` 明确失败收口。
- [x] Legacy Phase 2（工具提示链路）收口：`$completion` 默认关闭 legacy `completion/verbose/status_updated(tool)` 兼容分支，统一以 `turn.* + run.audit` 为主链路；保留环境开关回滚。
- [x] 增补回归测试：覆盖 `request_id` 复用分支与审批 `approved/rejected/timeout` 状态映射，确保自动续跑与失败收口可持续回归。

### I. Pilot 严格模式 + 可感知差异 + 提示词升级（2026-03-19）

- [x] `pilotMode=true` 时禁降级：`executor` 与 `chat stream` 均在 LangGraph 不可用场景返回 `PILOT_STRICT_MODE_UNAVAILABLE`。
- [x] `createPilotRuntime` 支持 `strictPilotMode/allowDeepAgentFallback`，严格模式下禁用 fallback adapter。
- [x] 顶部 `PILOT` 可视化落地：主聊天 header + 状态栏均可识别 Pilot 模式。
- [x] 新增 ThisAi Prompt Builder：运行时系统提示词统一从 builder 注入 `name/ip/ua` 与安全约束。
- [x] websearch 增强：保留“意图优先 + 启发式兜底”，并在 datasource 未配置时回退 Responses 内置检索。
- [x] 审计可观测性增强：补齐 `memory.context` / `websearch.decision` / connector 来源，避免“命中无感”。
- [x] websearch 终态一致性修复：`decision=false/审批中断/工具异常/terminal finalize` 统一收口到 `websearch.skipped`，并在无外部来源时注入 guard 禁止“新闻感编造”。
- [ ] 回归补充：补齐 `executor/stream` 端到端 strict 错误码回归用例（含 HTTP status 与 SSE payload 断言）。
- [ ] 线上观测：新增 `PILOT_STRICT_MODE_UNAVAILABLE` 告警阈值和 7 天趋势看板。

### J. Pilot 旧 UI 会话卡片化硬切（2026-03-19）

- [x] 旧 UI 执行器仅走 `POST /api/chat/sessions/:sessionId/stream`，不再依赖 `v1 turns/stream`。
- [x] 运行态事件统一卡片化：`intent/routing/memory/websearch/thinking` 全部落入会话消息流并持久化回放。
- [x] `thinking.delta -> thinking.final` 采用同一卡片增量拼接，完整文本可视化展示。
- [x] legacy 事件 `turn.* / status_updated / completion / verbose / session_bound` 不再驱动 UI 状态，仅告警忽略。
- [x] 管理端渠道 `adapter` 固定 `openai`，移除 `legacy` 可编辑入口。

### J1. Pilot 流式主链合并收口（2026-04-07）

- [x] 首页保留旧 UI，legacy `$completion` 成为唯一前端流式主消费链；`usePilotChatPage.ts` 与 `app/components/pilot/*` 不再作为并行主方案继续演进。
- [x] 首页默认 DeepAgent：移除 `Pilot 模式` 默认标签与输入开关；`pilotMode` 不再进入首页默认发送、展示与恢复逻辑。
- [x] `fromSeq + follow` 收口到共享 seq cursor helper，刷新恢复只跟随真实可恢复事件，不再受 Pilot 模式分叉影响。
- [x] trace contract 收紧：`stream.started / stream.heartbeat / replay.* / run.metrics / done / error` 等 seq-optional 生命周期事件不再持久化到 trace；replay、trace.get、quota snapshot、follow tail 会统一过滤历史 lifecycle 噪音。
- [x] legacy SSE 契约测试补齐：覆盖 `assistant.delta / assistant.final / run.audit / turn.approval_required / replay / done / error` 与分块持续解析。
- [ ] 部署烟测补齐：验证 `/api/chat/sessions/:sessionId/stream` 经反向代理后仍持续分块返回；若 buffering 打开需直接失败并输出明确信号。

### K. Intelligence 多模态 Provider 统一配置与运行时打通（2026-03-20）

- [x] 能力矩阵补齐：`image.generate`、`image.edit`、`audio.stt`、`video.generate`（保留 `audio.tts`、`audio.transcribe`）。
- [x] 历史配置回填升级为“按缺项补齐”，不覆盖用户已有能力绑定/优先级/Prompt。
- [x] 运行时分发补齐 `image.edit/audio.tts/audio.stt/audio.transcribe/video.generate`，避免注册后不可调用。
- [x] OpenAI-compatible Provider 完成媒体 REST 补齐（图片生成/编辑、语音合成、语音转写/翻译）。
- [x] 缺失媒体端点 provider 显式 `unsupported`，并由策略层自动 fallback 到下一 provider。
- [x] 媒体输出采用 URL-first（`tfile://`）并支持 `output.includeBase64=false` 默认可选扩展。
- [x] 前端能力测试器补齐：`image.generate/image.edit/audio.tts/audio.stt/audio.transcribe`；`video.generate` 返回“配置已生效，运行时未实现”。
- [ ] `video.generate` 真实运行时生成链路（Provider 端点接入 + 端到端成功路径）待下一迭代落地。

### L. Pilot Websearch 全局 Provider 池聚合（2026-03-20）

- [x] `datasource.websearch` 升级为全局池结构：`providers + aggregation + crawl`，并保留 legacy `gatewayBaseUrl/apiKeyRef` 读取兼容。
- [x] Provider key 管理切换为“配置页入库 + 统一加密 + 脱敏回传（hasApiKey/apiKeyMasked）”，支持“留空不变/clearApiKey 清空”。
- [x] `pilot-tool-gateway` 切换为优先级聚合执行：主 provider 先跑，结果不足按顺序补召回，去重后达标即停，不足则 fallback `responses_builtin`。
- [x] `websearch.executed` 可观测性增强：补齐 `providerChain/providerUsed/fallbackUsed/dedupeCount` 并保持 `source/sourceReason/sourceCount`。
- [x] 新增管理页 `/admin/system/websearch-providers`，支持全局 providers 列表维护与单页“聚合填写”（aggregation/crawl）。
- [x] 回归测试补齐：`pilot-tool-gateway`、`pilot-websearch-connector`、`pilot-admin-datasource-config` 定向用例通过。

### M. Pilot 模型组能力开关治理（2026-03-21）

- [x] `model-groups` 编辑页改为分层信息架构：`运行状态 / 推理策略 / 能力矩阵 / 工具权限`。
- [x] 能力文案升级为“中文主标签 + key 副文”，并显式标注 `video.generate` 为实验能力。
- [x] 新增模板预设：`通用对话 / 研究检索 / 多模态创作 / 语音助手`，新建模型组默认套用通用对话模板。
- [x] 联动规则落地：`thinkingSupported=false => thinkingDefaultEnabled=false`，关闭 `websearch` 自动移除 `builtinTools.websearch`。
- [x] `defaultRouteComboId` 改为 Route Combo 下拉选择；历史脏值标记失效并阻止保存。
- [x] 新增共享规则模块 `shared/pilot-capability-meta.ts`，统一前后端能力元数据、legacy 回填、模板与路由校验。
- [x] 新增/更新测试：`pilot-capability-meta.shared.test.ts`、`pilot-admin-routing-config.capabilities.test.ts`。

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

---

## 🔗 长期债务入口

- 长期与跨版本事项见：`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`

---

## 📊 任务统计

| 统计项 | 数值 |
| --- | --- |
| 已完成 (`- [x]`) | 154 |
| 未完成 (`- [ ]`) | 28 |
| 总计 | 182 |
| 完成率 | 85% |

> 统计时间: 2026-04-20（按本文件实时 checkbox 计数）。

---

## 🎯 下一步（锁定）

1. 完成 `CoreApp legacy 清理 + Windows/macOS 2.5.0 阻塞级适配` 文档化与清册闭环。
2. 按 Windows/macOS 阻塞级回归清单补齐人工证据；Linux 仅记录 best-effort smoke。
3. `Nexus 设备授权风控` 保留实施文档与历史入口，降为非当前主线。
4. `docs:guard` 连续零告警后，再升级 strict 阻塞策略。
### Startup Path Governance (2026-03-23)

- [x] Unified root path policy in core startup and network secure-store path resolution (`dev -> userData/tuff-dev`, `release -> userData/tuff`).
- [x] Completed startup chain hardening for directory creation (`root` before `logs`, recursive mkdir, sync semantics).
- [x] Added one-time legacy dev data migration (`appPath/tuff -> userData/tuff-dev`) with marker-based skip strategy.
- [x] Improved startup observability (`early unhandledRejection` log + corrected single-instance warning wording + optional deprecation trace switch).
- [x] Added targeted tests for root-path resolution, migration decision matrix, and directory creation idempotency.
