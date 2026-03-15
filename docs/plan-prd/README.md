# Talex Touch - 项目文档中心

> 统一的项目文档索引，包含所有 PRD、设计文档、实现指南
> 更新时间: 2026-03-15

 ## PRD Index（以代码实现为准）
 
 本索引**只保留**：
 - 近 3 个月（相对当前时间）**关键里程碑**
 - 当前仍**未闭环**的能力与缺口
 - 对应的**代码位置**与**文档入口**
 
 超过 3 个月的“已完成叙事/历史记录”请移至 `01-project/CHANGES.md` 或归档目录。

 ## 快速入口

 - **[产品总览与 8 周路线图](./01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md)**：统一产品目标、质量约束与推进节奏
 - **[v2.4.7 发版推进清单](./01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md)**：文档进展、发布门禁与阻塞项单一入口
- **[Nexus Release Assets 核对清单](./docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md)**：`v2.4.9` Gate D 严格执行清单（notes/assets/signature/manifest）
- **[插件市场多源验收清单](./docs/PLUGIN-STORE-MULTI-SOURCE-ACCEPTANCE-2026-03-15.md)**：Provider 能力矩阵 + 安装链路 + 失败回滚
 - **[项目待办](./TODO.md)**：以 PRD 提炼的任务清单（需持续与代码同步）
 - **[Roadmap 任务01（TODO 现状校准）](./TODO.md)**：CoreBox/Nexus 剩余优先级与“变更前/后”对照
 - **[PRD 质量基线](./docs/PRD-QUALITY-BASELINE.md)**：活跃 PRD 必备章节与质量门禁
 - **[Pilot API/事件契约](./docs/PILOT-INTELLIGENCE-API-CONTRACT.md)**：`apps/pilot` 的 SSE、Checkpoint/Resume、错误码与时序
 - **[变更记录](./01-project/CHANGES.md)**：历史记录（不在本索引重复）
 - **[DivisionBox 文档索引](./docs/DIVISION_BOX_INDEX.md)**：DivisionBox 详细文档入口

## 单一口径矩阵（2026-03-15）

- **2.4.9 Gate 主线**：插件完善主线执行中，`权限中心 Phase 5` 已完成；`View Mode 安全闭环 + 类型增强` 与 `CLI 切换收口`进入同版本 Gate 验收。
- **2.4.8 Gate 主线（historical）**：OmniPanel 稳定版 MVP 已落地（真实窗口 smoke CI + 失败路径回归 + 触发稳定性回归）。
- **v2.4.7 发布门禁**：Gate A/B/C/D/E = Done（Gate E 为 historical，Gate D 为 historical backfill）。
  - **执行方式**：Gate D 已由 GitHub Actions `Build and Release`（run `23091014958`）通过 `workflow_dispatch(sync_tag=v2.4.7)` 完成自动回填与发布同步。
- **Pilot Runtime 主路径**：Node Server + Postgres/Redis + JWT Cookie；Cloudflare runtime/D1/R2 仅保留历史归档描述。
- **后续顺序（锁定）**：`权限中心 Phase 5（已完成） -> View Mode 安全闭环+类型增强 -> CLI 切换收口 -> 主文档同步验收 -> Nexus 设备授权风控`（`OmniPanel Gate`、`SDK Hard-Cut E~F`、`v2.4.7 Gate D/E` 已完成）。

## 项目最终目标（North Star）

- **产品目标**：构建本地优先 + AI 原生 + 插件可扩展的桌面指令中心，形成稳定主产品与可演进生态。
- **架构目标**：完成 SDK Hard-Cut，跨层调用统一到 typed SDK/transport，停止 legacy channel 扩散。
- **质量目标**：建立可复现、可追踪的质量门禁（typecheck/lint/test/build）并保持稳定通过。
- **发布目标**：打通 OIDC + RSA 官方构建信任链与 Nexus release 同步闭环。

## 质量约束（所有活跃 PRD 必须遵守）

- 每个活跃 PRD 必须写明：**最终目标**、**范围/非目标**、**质量约束**、**验收标准**、**回滚策略**。
- 不允许通过降级规则/跳过校验绕过质量问题；既有失败项需在 PRD 中显式标注。
- 关键行为变更必须同步 `README.md`、`TODO.md`、`CHANGES.md` 与 Nexus 文档至少一处。
- Storage / Sync 相关能力必须遵守：SQLite 本地 SoT，JSON 仅同步载荷。

## 近期（近 3 个月）关键里程碑

- **CoreBox 内置能力抽离为 7 个独立插件**（2026-02，已落地）
  - **插件列表**
    - `touch-browser-open` - 浏览器打开 / URL 系统
    - `touch-browser-bookmarks` - 浏览器书签搜索
    - `touch-quick-actions` - 快捷操作
    - `touch-window-presets` - 窗口预设
    - `touch-workspace-scripts` - 工作区脚本
    - `touch-system-actions` - 系统操作
    - `touch-intelligence-actions` - AI 智能操作
  - **代码**
    - `plugins/` 目录（各插件独立包 + 测试 + 文档）
    - `apps/core-app/src/main/` 移除对应内置实现
  - **状态**：已完成抽离 + 测试 + Nexus 文档

- **SDK 统一 Hard-Cut**（2026-01 ~ 03，已完成）
  - **代码**
    - `packages/utils/transport/` - Typed Transport Domain SDKs
    - `packages/utils/renderer/hooks/` - SDK Hooks 迁移
  - **状态**
    - 批次 A~D 已完成（Settings/Permission/Download/Cloud Sync/Channel → SDK Hooks）
    - 批次 E~F（renderer 直连点清理）已完成（2026-03-14）
  - **参考**：`docs/engineering/reports/sdk-unification-progress-2026-02-08.md`
  - **2.4.8 P0 收口计划**：`./04-implementation/LegacyChannelCleanup-2408.md`

- **Nexus OAuth 修复**（2026-02，已落地）
  - **代码**
    - `apps/nexus/server/` - sign-in callback 稳定化
    - `apps/nexus/middleware/` - session/app auth guard 拆分
  - **状态**：OAuth flow + Turnstile + Passkey step-up 已闭环

- **Nexus 汇率服务（ExchangeRate-API）**（2026-02，已落地）
  - **代码**
    - `apps/nexus/server/utils/exchangeRateService.ts`
    - `apps/nexus/server/api/exchange/convert.get.ts`
  - **状态**：USD 基准换算 + 8h TTL 缓存，D1 历史快照与错误归档
  - **补充**：非 FREE 用户可访问历史查询 `/api/exchange/history`

- **更新系统增强**（2026-02，已落地）
  - **代码**
    - `apps/core-app/src/main/modules/download/` - reusable update tasks
  - **状态**：下载管理增强 + 更新任务复用

- **发布链路收敛（官网 + CLI）**（2026-02，已落地）
  - **代码**
    - `.github/workflows/build-and-release.yml` - 单一桌面发版主线 + Nexus 同步
    - `.github/workflows/package-tuff-cli-publish.yml` - CLI 四包自动发布到 npm
    - `apps/nexus/server/api/releases/*`、`apps/nexus/server/utils/auth.ts` - release scope 粒度化与兼容层
  - **状态**：GitHub Release / Nexus Release / npm CLI 发布三链路自动化闭环；官网部署由 Cloudflare Pages 平台侧 Git 自动部署

- **v2.4.7 发版推进**（2026-02，已收口）
  - **入口**
    - `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
  - **状态**
    - Gate A/B/C/D/E 已完成（Gate E 按历史闭环，不重发版；Gate D 已完成历史回填）
    - `v2.4.7` 签名缺口按历史豁免（Accepted waiver）

- **Nexus 文档收口（不含 Pilot）**（2026-03，已落地）
  - **代码/文档**
    - `apps/nexus/content/docs/dev/reference/examples.{zh,en}.mdc`（Examples 单一来源索引）
    - `apps/nexus/app/components/tuff/TuffHome.vue`、`apps/nexus/app/composables/useTuffHomeSections.ts`（首页占位段清理）
    - `apps/nexus/content/docs/guide/features/corebox-workflow.{zh,en}.mdc`、`apps/nexus/content/docs/guide/features/wallpaper.{zh,en}.mdc`（workflow/AI/翻译/壁纸现状）
    - `apps/nexus/content/docs/guide/features/plugins/translation.{zh,en}.mdc`（翻译插件入口）
  - **状态**
    - 已完成入口对齐与文档收口，避免规划态描述误导上线状态

- **Roadmap 任务01：TODO 现状校准（CoreBox/Nexus）**（2026-03，已落地）
  - **收口内容**
    - 清理 `TODO.md` 中“已落地但仍在待实现语义”条目（拆分为已完成项 + 剩余项）
    - 基于已完成项 `02/03/04/05/07/08` 重排剩余优先级
    - 对齐 `README.md` / `docs/INDEX.md` / `TODO.md` 导航与状态口径
  - **当前剩余优先级**
    - `OmniPanel Gate（已完成）` → `SDK Hard-Cut E~F（已完成）` → `权限中心 Phase 5（已完成）` → `View Mode 安全闭环+类型增强` → `CLI 切换收口` → `主文档同步验收` → `Nexus 设备授权风控`

- **Pilot × Intelligence（Protocol-first Runtime）**（2026-03，进行中）
  - **代码**
    - `apps/pilot/`：Nuxt Node Server（会话、消息、SSE、pause、trace、upload）
    - `packages/tuff-intelligence/src/{protocol,runtime,registry,policy,store,adapters}`：统一 Runtime/Protocol
  - **状态**
    - Runtime 已收敛为 `Postgres + Redis + JWT(access/refresh) + HttpOnly Cookie`，并移除 Cloudflare runtime/wrangler/D1/R2 主路径。
    - V1 Chat-first 页面可运行（会话列表、消息流、附件、Trace 抽屉），SSE 已支持 `assistant.delta/final`、`run.metrics`、`session.paused`、`done` 与 `fromSeq` 补播。
  - **缺口**
    - 端到端压测、渠道矩阵回归、发布环境鉴权联调（Nexus token/session）。

- **插件权限中心**（Phase 1-4 已落地）
  - **代码**
    - `apps/core-app/src/main/modules/permission/`
    - `packages/utils/permission/`
  - **状态**
    - 核心已完成；Phase 5（SQLite 主存储迁移 + 安装时权限确认）已落地（2026-03-15）

- **模块日志系统**（Phase 1-4 已落地）
  - **PRD**：`./02-architecture/module-logging-system-prd.md`
  - **代码**
    - `packages/utils/common/logger/`
  - **缺口**
    - UI 配置界面（可选）

> **已归档**（超过 3 个月）：插件市场多源、Search DSL、Nexus Team Invite、直接预览计算、Widget 动态加载 → 详见 `01-project/CHANGES.md` 和 `05-archive/`


 ## 仍未闭环（以代码为准）

 - **Flow Transfer（优先继续深化）**
   - **PRD**：`./03-features/flow-transfer-prd.md`
   - **代码**
     - 主进程：`apps/core-app/src/main/modules/flow-bus/`
     - SDK：`packages/utils/plugin/sdk/flow.ts`
     - 类型：`packages/utils/types/flow.ts`
     - 选择面板：`apps/core-app/src/renderer/src/components/flow/FlowSelector.vue`
   - **已完成**
     - IPC 全量迁移：Flow/DivisionBox 全部走 TuffTransport（renderer/main/plugin SDK），移除 legacy `flow:*`/`FlowIPCChannel` 通道
     - 权限中心接入：Flow 发送/接收授权 + 一次性 token 闭环
     - Selector ↔ 主进程授权闭环（FlowSelector → FlowBus）
     - 会话管理与失败回退（FlowSessionManager + fallback copy/rollback）
   - **缺口**
     - 审计日志（会话历史/失败原因记录）
     - 测试插件与开发文档补齐

 - **DivisionBox（生命周期对插件开放 / SDK 统一）**
   - **PRD**：`./03-features/division-box-prd.md`
   - **代码**
     - 主进程：`apps/core-app/src/main/modules/division-box/`
     - SDK：`packages/utils/plugin/sdk/division-box.ts`
     - Nexus 文档：`apps/nexus/content/docs/dev/api/division-box.zh.md`
   - **已完成**
     - IPC 全量迁移：DivisionBox 全部走 TuffTransport（renderer/main），移除 legacy `division-box:*` 通道
     - 生命周期事件已对插件 SDK 广播（stateChanged/sessionDestroyed + onLifecycleChange）
   - **缺口**
     - 生命周期语义与文档补齐（prepare/attach/detach 等时序说明）
     - 与 FlowTransfer 的触发链路联调验收

 - **Widget 沙箱隔离与存储收口**（进行中）
   - **PRD**：`./04-implementation/WidgetSandboxIsolation260221.md`
   - **代码**
     - `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
     - `apps/core-app/src/main/channel/common.ts`
   - **缺口**
     - 扩展拦截（navigator/clipboard/history/location/postMessage/worker）
     - 权限中心联动与审计

 - **SQLite 重试机制回退到 Retrier（规划）**
   - **PRD**：`./04-implementation/SqliteRetryRetrier260222.md`
   - **代码**
     - `apps/core-app/src/main/db/sqlite-retry.ts`
     - `packages/utils/common/utils/time.ts`
   - **缺口**
     - createRetrier 的 delay/jitter 扩展
     - sqlite-retry 迁移到 retrier 并保持签名稳定

 - **AttachUIView 缓存优化**（已做 Hot/LRU 的 MVP，PRD 大部分未落地）
   - **PRD**：`./03-features/view/attach-view-cache-prd.md`
   - **代码**
     - `apps/core-app/src/main/modules/box-tool/core-box/view-cache.ts`
   - **已完成**
     - stale cache 轮询清理（PollingService）
   - **缺口**
     - Warm/Cold 分层、Score 模型、Idle preload、SDK 接口、可视化/调试工具

 - **View Mode 与开发模式增强**（安全子项已收口，结构拆分待推进）
   - **PRD**：`./03-features/view/view-mode-prd.md`
   - **代码**
     - `apps/core-app/src/main/modules/plugin/dev-server-monitor.ts`
   - **缺口**
     - plugin-core 拆分、translation dev 配置与多源翻译 feature 最终收口

 - **Intelligence Agents（Phase 3 部分落地）**
   - **PRD**：`./02-architecture/intelligence-agents-system-prd.md`
   - **代码**
     - `apps/core-app/src/main/modules/ai/agents/`
     - `apps/core-app/src/renderer/src/views/base/intelligence/` - 管理 UI
   - **已完成**
     - WorkflowAgent 基础执行（workflow.run/plan）
     - 记忆系统基础实现（MemoryStore + ContextManager）
   - Intelligence 管理 UI（Capabilities/Channels/AuditLogs/Header 组件）
   - Agent 命名空间一次切换（`intelligence:agent:*`）与 Core/Nexus 路由同步上线
   - Prompt Registry（registry + binding）schema 对齐并接入默认提示词迁移
   - Prompt Registry 管理 API 与 Lab 弹窗管理面（record + binding CRUD）
   - LangGraph 五阶段状态机接管 `session/stream`（`session.start -> plan -> execute -> reflect -> finalize`）
 - **缺口**
   - Workflow 编辑器、用户自定义代理、协作与测试

 - **Pilot（独立部署）**
   - **PRD/契约**
     - `docs/plan-prd/docs/PILOT-INTELLIGENCE-API-CONTRACT.md`
   - **代码**
     - `apps/pilot/`
     - `packages/tuff-intelligence/`
   - **缺口**
     - `apps/pilot` 对 `tuff-intelligence` 的 pause/resume 单测与服务端集成测试
     - 长会话预算切片执行（20-25s）自动续跑的生产级回合编排
     - 登录鉴权与 Nexus account/配额策略完全对齐

 - **Assistant 实验功能（悬浮球 + 语音唤醒）**
   - **实现说明**：`./04-implementation/AssistantExperiment-VoiceFloatingBall-260223.md`
   - **代码**
     - `apps/core-app/src/main/modules/assistant/`
     - `apps/core-app/src/renderer/src/views/assistant/`
   - **当前约束**
     - 默认关闭（assistant/floatingBall/voiceWake）
     - 启动需环境变量门禁：`TUFF_ENABLE_ASSISTANT_EXPERIMENT=1`
   - **缺口**
     - 设置页实验开关与参数配置入口
     - 语音兼容性与最小回归自动化

 - **OmniPanel Feature Hub（全景面板能力中心）**
   - **PRD**：`./03-features/omni-panel/OMNIPANEL-FEATURE-HUB-PRD.md`
   - **代码**
     - `apps/core-app/src/main/modules/omni-panel/`
     - `apps/core-app/src/renderer/src/views/omni-panel/`
     - `apps/core-app/src/main/modules/plugin/plugin-module.ts`
   - **已完成（2026-03-01）**
     - 模块加载去除实验性 env 门控，OmniPanel 默认参与主进程初始化。
     - 面板移除 Feature 启停显示与切换入口，执行链不再受 `enabled` 阻断。
     - 主进程执行链补齐结构化错误码、refresh reason 扩展、plugin unavailable reason 透传。
     - 渲染层完成键盘交互（↑/↓/Enter/Cmd/Ctrl+F/Esc）与执行中态收敛。
     - 视图拆分为 Header/Context/SearchBar/ActionItem/ActionList，过滤逻辑纯函数化并补测试。
   - **稳定版 Gate（2026-03-14）**
     - 已补齐真实窗口 smoke（CI）与失败路径回归（plugin 不可用/插件缺失/无上下文/异常提示）。
     - 后续仅做回归稳定化，不扩新能力点。

 - **SDK 统一 Hard-Cut（批次 E~F 已完成）**
   - **参考**：`docs/engineering/reports/sdk-unification-progress-2026-02-08.md`
   - **状态**
     - renderer 直连 IPC 清理已完成（2026-03-14）。
   - **后续**
     - 旧 `channel-core` 彻底移除与插件 process message 协议统一，作为后续结构化债务推进，不阻塞当前 Gate D 与 View Mode 主线。

 - **平台能力体系（能力目录 + 管理 UI 基础已落地）**
   - **PRD**：`./02-architecture/platform-capabilities-prd.md`
   - **代码**
     - `apps/core-app/src/main/modules/platform/capability-registry.ts`
     - `packages/utils/transport/events/index.ts`
     - `packages/utils/renderer/hooks/use-platform-sdk.ts`
     - `apps/core-app/src/renderer/src/views/base/settings/SettingPlatformCapabilities.vue`
   - **缺口**
     - 能力调用监控、授权审批流程、能力治理策略

 ## Dock / Pin / Recommendation 重叠问题（建议）

 - **Pin**：针对 *Item*（搜索结果/推荐项）的用户偏好，要求“稳定置顶”。
 - **Recommendation**：算法推荐，允许波动；可以把 Pin 作为强约束输入（已存在 pinned items）。
 - **Dock**：针对 *UI 容器/会话*（如 DivisionBox 的常驻入口），更像“固定工作区”，不应与 Item Pin 混用。
 
 建议：
 - Pin 只作用在“Item 排序与推荐区块”，由 SearchEngine/DB 驱动。
 - Dock 只作用在“DivisionBox 会话入口/窗口管理”，由 DivisionBoxManager/Store 驱动。
 - Recommendation 作为默认入口，Pin/Dock 都是用户明确意图的 override。

 ---

 **维护规范**：任何实现/行为变更需要同步更新本索引与 Nexus 开发文档。
