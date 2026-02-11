# Talex Touch - 项目文档中心
 
 > 统一的项目文档索引，包含所有 PRD、设计文档、实现指南
 > 更新时间: 2026-02-10

 ## PRD Index（以代码实现为准）
 
 本索引**只保留**：
 - 近 3 个月（相对当前时间）**关键里程碑**
 - 当前仍**未闭环**的能力与缺口
 - 对应的**代码位置**与**文档入口**
 
 超过 3 个月的“已完成叙事/历史记录”请移至 `01-project/CHANGES.md` 或归档目录。

 ## 快速入口

 - **[项目待办](./TODO.md)**：以 PRD 提炼的任务清单（需持续与代码同步）
 - **[变更记录](./01-project/CHANGES.md)**：历史记录（不在本索引重复）
 - **[DivisionBox 文档索引](./docs/DIVISION_BOX_INDEX.md)**：DivisionBox 详细文档入口

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

- **SDK 统一 Hard-Cut**（2026-01 ~ 02，进行中）
  - **代码**
    - `packages/utils/transport/` - Typed Transport Domain SDKs
    - `packages/utils/renderer/hooks/` - SDK Hooks 迁移
  - **状态**
    - 批次 A~D 已完成（Settings/Permission/Download/Cloud Sync/Channel → SDK Hooks）
    - 批次 E~F（renderer 直连点清理）进行中
  - **参考**：`docs/engineering/reports/sdk-unification-progress-2026-02-08.md`

- **Nexus OAuth 修复**（2026-02，已落地）
  - **代码**
    - `apps/nexus/server/` - sign-in callback 稳定化
    - `apps/nexus/middleware/` - session/app auth guard 拆分
  - **状态**：OAuth flow + Turnstile + Passkey step-up 已闭环

- **更新系统增强**（2026-02，已落地）
  - **代码**
    - `apps/core-app/src/main/modules/download/` - reusable update tasks
  - **状态**：下载管理增强 + 更新任务复用

- **插件权限中心**（Phase 1-4 已落地）
  - **代码**
    - `apps/core-app/src/main/modules/permission/`
    - `packages/utils/permission/`
  - **状态**
    - 核心已完成；Phase 5（测试/性能验证）已落地

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

 - **AttachUIView 缓存优化**（已做 Hot/LRU 的 MVP，PRD 大部分未落地）
   - **PRD**：`./03-features/view/attach-view-cache-prd.md`
   - **代码**
     - `apps/core-app/src/main/modules/box-tool/core-box/view-cache.ts`
   - **已完成**
     - stale cache 轮询清理（PollingService）
   - **缺口**
     - Warm/Cold 分层、Score 模型、Idle preload、SDK 接口、可视化/调试工具

 - **View Mode 与开发模式增强**（部分能力已落地）
   - **PRD**：`./03-features/view/view-mode-prd.md`
   - **代码**
     - `apps/core-app/src/main/modules/plugin/dev-server-monitor.ts`
   - **缺口**
     - plugin-core 拆分、URL 安全构造、生产环境协议限制、Hash 路由校验

 - **Intelligence Agents（Phase 3 部分落地）**
   - **PRD**：`./02-architecture/intelligence-agents-system-prd.md`
   - **代码**
     - `apps/core-app/src/main/modules/ai/agents/`
     - `apps/core-app/src/renderer/src/views/base/intelligence/` - 管理 UI
   - **已完成**
     - WorkflowAgent 基础执行（workflow.run/plan）
     - 记忆系统基础实现（MemoryStore + ContextManager）
     - Intelligence 管理 UI（Capabilities/Channels/AuditLogs/Header 组件）
   - **缺口**
     - Workflow 编辑器、用户自定义代理、协作与测试

 - **SDK 统一 Hard-Cut 剩余**（批次 E~F）
   - **参考**：`docs/engineering/reports/sdk-unification-progress-2026-02-08.md`
   - **缺口**
     - renderer 直连 IPC 点清理（使用 SDK hooks 替换）
     - 旧 Channel 通道最终移除

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
