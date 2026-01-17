# Talex Touch - 项目文档中心
 
 > 统一的项目文档索引，包含所有 PRD、设计文档、实现指南
 > 更新时间: 2025-12-07

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

 - **插件权限中心**（Phase 1-4 已落地）
   - **代码**
     - `apps/core-app/src/main/modules/permission/`
     - `packages/utils/permission/`
   - **状态**
     - 核心已完成；Phase 5（测试/性能验证）待补

 - **模块日志系统**（Phase 1 已落地，后续迁移未完成）
   - **PRD**：`./02-architecture/module-logging-system-prd.md`
   - **代码**（已落地的 utils 实现）
     - `packages/utils/common/logger/`
   - **缺口**
     - SearchEngine/Providers/核心模块迁移
     - UI 配置界面（可选）

 - **插件市场多源**（核心已落地，仍需验收/文档）
   - **PRD**：`./03-features/plugin/plugin-market-provider-frontend-plan.md`
   - **代码**
     - `apps/core-app/src/renderer/src/modules/market/providers/`
     - `apps/core-app/src/renderer/src/views/base/Market.vue`
   - **近期开销点**
     - icon 加载（已修复：TPEX iconUrl + UI fallback）
     - 文档补齐（market source editor / provider 配置说明）

 - **Search DSL**（`@xxx` provider filter + pinned）
   - **PRD**：`./03-features/search/SEARCH-DSL-PRD.md`
   - **代码**
     - `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`（`@xxx` 解析与筛 provider）
     - `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.ts`（pinned 置顶排序）
     - `apps/core-app/src/main/db/utils.ts`（pinned 表与 toggle）
   - **说明**
     - pinned 当前以 `item.meta.pinned.isPinned` 驱动 UI 与排序

 - **Nexus Team Invite**（已闭环：邀请 + join 页面）
   - **PRD**：`./03-features/nexus/NEXUS-TEAM-INVITE-PRD.md`
   - **代码**
     - `apps/nexus/server/api/dashboard/team/invites.*`
     - `apps/nexus/server/api/team/join.post.ts`
     - `apps/nexus/app/pages/team/join.vue`

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
   - **缺口**
     - 权限中心接入（Flow 发送/接收、目标授权记忆等）
     - Selector ↔ 主进程 target selection 的端到端闭环验收

 - **DivisionBox（生命周期对插件开放 / SDK 统一）**
   - **PRD**：`./03-features/division-box-prd.md`
   - **代码**
     - 主进程：`apps/core-app/src/main/modules/division-box/`
     - SDK：`packages/utils/plugin/sdk/division-box.ts`
     - Nexus 文档：`apps/nexus/content/docs/dev/api/division-box.zh.md`
   - **已完成**
     - IPC 全量迁移：DivisionBox 全部走 TuffTransport（renderer/main），移除 legacy `division-box:*` 通道
   - **缺口**
     - 生命周期事件（prepare/attach/active/inactive/detach/destroy）对插件侧开放并统一进 SDK
     - 与 FlowTransfer 的权限/触发入口对齐

 - **AttachUIView 缓存优化**（已做 Hot/LRU 的 MVP，PRD 大部分未落地）
   - **PRD**：`./03-features/view/attach-view-cache-prd.md`
   - **代码**
     - `apps/core-app/src/main/modules/box-tool/core-box/view-cache.ts`
   - **缺口**
     - Warm/Cold 分层、Score 模型、Idle preload、SDK 接口、可视化/调试工具

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
