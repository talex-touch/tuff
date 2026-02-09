# SDK 统一收口与代码质量治理进展（2026-02-08）

## 1. 背景与目标

本次工作按“先稳后快”执行：前期保留双轨以便迁移，当前阶段开始硬收口（不再优先兼容旧入口）。目标仍是把直连 channel 调用统一到 typed SDK，降低事件名散落、重复封装和监听泄漏风险。

对应计划：
- A：基础收口（domain SDK）
- B：Renderer 调用层统一
- C：Plugin SDK 生命周期治理
- D：Main 侧 handler 模板化
- E：大方法拆分
- F：迁移与下线策略

## 2. 范围与边界（已执行）

- 只做架构收口与质量治理，不改产品交互语义。
- 从当前阶段起不再新增兼容壳，优先替换并移除旧入口调用。
- 新增/改动代码优先走 typed events + domain sdk。
- 校验以“最贴近改动”的 lint + 单测/集测为主，不扩大到无关模块。

## 3. 当前总体状态（Snapshot）

### 已完成（核心）

1. domain sdk 收口已覆盖高收益域：
   - `update` / `intelligence` / `settings` / `permission`
   - `agents-market` / `agents`
2. renderer 层已有对应 hooks，页面逐步迁移到 SDK 调用。
3. plugin sdk 增加统一订阅释放约束，降低重复注册与泄漏风险。
4. main handler 已抽象 safe handler 模板，响应结构更一致。
5. 一批高复杂方法已拆分为职责更单一的私有流程。
6. 已进入 hard-cut 阶段：逐步删除 legacy 入口，收口到 typed SDK。

### 进行中

- renderer 其余页面/composable 仍有零散 `transport.send(...)` 直调待迁移。
- legacy channel 直连调用点仍有存量，正在按页面/模块批量替换。

## 4. 批次进展（A~F）

## A. 基础收口（Domain SDK）

### 已落地

- 新增/补齐：
  - `packages/utils/transport/sdk/domains/update.ts`
  - `packages/utils/transport/sdk/domains/intelligence.ts`
  - `packages/utils/transport/sdk/domains/settings.ts`
  - `packages/utils/transport/sdk/domains/permission.ts`
  - `packages/utils/transport/sdk/domains/agents-market.ts`
  - `packages/utils/transport/sdk/domains/agents.ts`
- 导出聚合：
  - `packages/utils/transport/sdk/domains/index.ts`
- 事件类型补齐（typed payload）：
  - `packages/utils/transport/events/types/agents.ts`
  - `packages/utils/transport/events/index.ts`

### 质量收益

- 新代码不再裸写字符串事件名（改为 `Events + SDK`）。
- 参数与返回值由类型系统约束，减少调用方猜测。

## B. Renderer 调用层统一

### 已落地

- 新增 hooks：
  - `packages/utils/renderer/hooks/use-update-sdk.ts`
  - `packages/utils/renderer/hooks/use-intelligence-sdk.ts`
  - `packages/utils/renderer/hooks/use-settings-sdk.ts`
  - `packages/utils/renderer/hooks/use-permission-sdk.ts`
  - `packages/utils/renderer/hooks/use-agent-market-sdk.ts`
  - `packages/utils/renderer/hooks/use-agents-sdk.ts`
- hooks 导出：
  - `packages/utils/renderer/hooks/index.ts`
- 页面迁移：
  - `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceAgentsPage.vue`
    - 由分散调用切到 `useAgentsSdk().listAll()`
  - `apps/core-app/src/renderer/src/components/intelligence/agents/AgentDetail.vue`
    - 执行链路改为 `execute` 队列模式
    - 接入 task push 状态
    - 增加取消防重入状态 `canceling`
    - 增加状态轮询兜底（push 丢失时可收敛）

### 本轮补充

- 多语言补齐：
  - `apps/core-app/src/renderer/src/modules/lang/en-US.json`
  - `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- 新增 key：`intelligence.agents.task_completed_no_result`
- Permission 页面迁移：
  - `apps/core-app/src/renderer/src/components/plugin/tabs/PluginPermissions.vue`
  - `apps/core-app/src/renderer/src/views/base/settings/SettingPermission.vue`
  - 从 `transport.send(PermissionEvents.*)` 迁移到 `usePermissionSdk()`
- Settings 页面迁移：
  - `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
    - `deviceIdle/appIndex` 相关读写迁移到 `useSettingsSdk()`
  - `apps/core-app/src/renderer/src/views/base/settings/SettingMessages.vue`
    - `analytics.messages` 相关读写迁移到 `useSettingsSdk()`
- 收口结果：renderer 侧已清理 `PermissionEvents` 直接调用，`AppEvents.deviceIdle/appIndex/analytics.messages` 直接调用也已收口到 domain sdk
- Intelligence 提示词页面迁移：
  - `apps/core-app/src/renderer/src/components/intelligence/IntelligencePrompts.vue`
  - `apps/core-app/src/renderer/src/views/base/intelligence/IntelligencePromptsPage.vue`
  - 从 `defineRawEvent("app:open-prompts-folder") + transport.send` 迁移到 `useAppSdk().openPromptsFolder()`
- Main 侧通道收口：
  - `apps/core-app/src/main/channel/common.ts`
  - 新增 `AppEvents.system.openPromptsFolder` handler，移除 legacy `app:open-prompts-folder` 处理分支
- SDK 事件补齐：
  - `packages/utils/transport/events/index.ts` 新增 `AppEvents.system.openPromptsFolder`
  - `packages/utils/transport/sdk/domains/app.ts` 新增 `openPromptsFolder()`
- hooks 导出 hard-cut：
  - `packages/utils/renderer/hooks/index.ts` 移除 deprecated 兼容导出 `use-agent-market`、`use-permission`
  - 新代码只能通过 `useAgentMarketSdk`、`usePermissionSdk` 使用对应能力
- Update 兼容壳质量修复：
  - `apps/core-app/src/renderer/src/modules/hooks/useUpdate.ts`
  - 补齐 `response.data` 判空分支，修复 `UpdateCheckResult/UpdateSettings/UpdateStatusInfo` 的 `undefined` 类型漏洞

## C. Plugin SDK 生命周期治理

### 已落地

- 统一订阅-释放模型，约束“创建即注册，销毁统一 dispose”。
- 重点治理对象：`feature/division-box/meta/intelligence/cloud-sync` 等 SDK。
- 核心文件：
  - `packages/utils/plugin/sdk/feature-sdk.ts`
  - `packages/utils/plugin/sdk/division-box.ts`
  - `packages/utils/plugin/sdk/meta-sdk.ts`
  - `packages/utils/plugin/sdk/intelligence.ts`
  - `packages/utils/plugin/sdk/cloud-sync.ts`

### 质量收益

- 避免重复注册监听导致的重复触发。
- 降低插件热重载后的监听器泄漏概率。

## D. Main 侧 handler 模板化

### 已落地

- 新增通用安全包装工具：
  - `apps/core-app/src/main/utils/safe-handler.ts`
- 覆盖复用：
  - `apps/core-app/src/main/channel/common.ts`
  - `apps/core-app/src/main/modules/download/download-center.ts`
  - `apps/core-app/src/main/modules/ai/intelligence-module.ts`

### 质量收益

- `try/catch + success/error` 输出结构统一。
- 错误转换与权限前置能力可复用，减少样板代码。

## E. 大方法拆分（可读性治理）

### 已落地（首批）

- 拆分目标：
  - `TouchPlugin.getFeatureUtil`
  - `CommonChannelModule.onInit`
  - `CommonChannelModule.registerTransportHandlers`
  - `AiSDK.invoke`
  - `IntelligenceModule.registerChannels`
- 目标达成：每个子函数职责更单一，分支更浅。

### 质量收益

- 降低认知复杂度，减少后续改动冲突面。

## F. 迁移策略与下线策略

### 已落地

- 已完成一批旧入口 `@deprecated` 标注与替换。
- 当前策略已切换为 hard-cut：新改动不再为 legacy 入口补兼容。

### 后续计划

- 继续清理 legacy 直连调用点（含 renderer/main/plugin）。
- 对内部已迁移场景直接删除 legacy 分支，不再保留双轨。

## 5. 关键实现细节（本轮重点）

1. `AgentDetail.vue` 从即时执行改为队列执行，统一走主进程任务编排。
2. 任务状态监听优先 push，轮询作为兜底（1.5s），避免 UI 长时间卡在执行中。
3. 取消按钮加入防重入状态，避免连续点击触发多次取消请求。
4. 如果仅拿到 `completed` 状态但无 result payload，页面会提示“任务已完成但无结果数据”，避免静默失败。

## 6. 验证记录（已执行）

> 以下命令在仓库根目录执行。

### Lint（定向）

```bash
pnpm -C "apps/core-app" exec eslint "src/renderer/src/components/intelligence/agents/AgentDetail.vue" "src/renderer/src/views/base/intelligence/IntelligenceAgentsPage.vue" "src/main/modules/ai/agents/agent-channels.ts" "src/renderer/src/modules/lang/en-US.json" "src/renderer/src/modules/lang/zh-CN.json"
pnpm -C "packages/utils" exec eslint "transport/events/index.ts" "transport/events/types/agents.ts" "transport/sdk/domains/agents.ts" "transport/sdk/domains/agents-market.ts" "transport/sdk/domains/intelligence.ts" "transport/sdk/domains/permission.ts" "transport/sdk/domains/settings.ts" "transport/sdk/domains/update.ts" "transport/sdk/domains/index.ts" "renderer/hooks/use-agents-sdk.ts" "renderer/hooks/use-agent-market-sdk.ts" "renderer/hooks/use-intelligence-sdk.ts" "renderer/hooks/use-permission-sdk.ts" "renderer/hooks/use-settings-sdk.ts" "renderer/hooks/use-update-sdk.ts" "renderer/hooks/index.ts" "__tests__/transport-domain-sdks.test.ts"
```

结果：无错误；JSON 文件在当前 ESLint 配置下属于“忽略文件”提示，不影响本次代码改动正确性。

补充验证：

```bash
pnpm -C "apps/core-app" exec eslint "src/renderer/src/components/plugin/tabs/PluginPermissions.vue" "src/renderer/src/views/base/settings/SettingPermission.vue" "src/renderer/src/views/base/settings/SettingFileIndex.vue" "src/renderer/src/views/base/settings/SettingMessages.vue"
pnpm -C "apps/core-app" exec eslint "src/renderer/src/components/intelligence/IntelligencePrompts.vue" "src/renderer/src/views/base/intelligence/IntelligencePromptsPage.vue" "src/main/channel/common.ts"
pnpm -C "apps/core-app" exec eslint "src/renderer/src/modules/hooks/useUpdate.ts"
pnpm -C "packages/utils" exec eslint "renderer/hooks/index.ts" "transport/events/index.ts" "transport/sdk/domains/app.ts" "__tests__/transport-domain-sdks.test.ts"
pnpm -C "apps/core-app" run typecheck:web
```

补充结果：新增迁移文件的 eslint 通过；`common.ts` 存在仓库既有的 Prettier 风格 warning（无新增 error）；`typecheck:web` 仍在仓库既有问题上失败（如 `packages/tuffex` 组件类型、`device-attest.test.ts`、`packages/utils/plugin/channel.ts`），本轮已消除 `useUpdate.ts` 的相关类型报错。

### Tests（定向）

```bash
pnpm -C "packages/utils" test -- "__tests__/transport-domain-sdks.test.ts"
pnpm -C "packages/utils" exec vitest run "__tests__/transport-domain-sdks.test.ts"
pnpm -C "apps/core-app" exec vitest run "src/main/channel/common.test.ts" "src/main/modules/ai/intelligence-sdk.test.ts" "src/main/utils/safe-handler.test.ts"
```

结果：通过。

## 7. 风险、限制与回滚点

## 风险

1. 少量页面/模块仍有 legacy channel 直连存量，迁移过程中可能出现遗漏。
2. 本轮已删除 `app:open-prompts-folder` legacy 分支，任何仍依赖该 raw 事件的调用会直接失效。
3. `packages/utils/renderer/hooks/index.ts` 已移除 deprecated 导出（`use-agent-market`、`use-permission`），外部若仍依赖旧导出将出现编译错误。
4. push 与轮询并存期间，存在“状态已完成但结果包丢失”的降级分支（已做用户提示）。
5. 跨端（plugin / renderer / main）替换节奏不同，短期需要额外回归。

## 回滚点

- A/B/C/D/E/F 各批次均为增量式改造，单批可独立回退。
- 当前策略不再依赖双轨回退，回滚以 git 提交粒度为准（而非切回 legacy 入口）。

## 8. 下一步建议（按优先级）

1. 继续扫尾 renderer 残余 `transport.send(...)` 直连点，补齐 SDK 壳层。
2. 对 plugin sdk 生命周期补更多“重复创建 + dispose”场景测试。
3. 建立 legacy 事件使用扫描清单，按清单逐项清理。
4. 推进第二阶段 hard-cut：删除剩余 legacy 直连导出与 raw event 用法。

---

维护说明：本报告用于持续更新 SDK 收口任务进展；每批次合并后同步更新“已完成/进行中/风险/验证”四块。
