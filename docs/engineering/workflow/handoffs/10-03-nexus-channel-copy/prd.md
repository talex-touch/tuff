# 模型渠道 Tuff Nexus 详情的标签与文案

父任务：`.trellis/tasks/10-03-intelligence-settings-revamp`（需求来源：图 4）。轻量任务，只有 PRD。

## Goal

模型渠道页里的 Tuff Nexus 少说几句「需要登录 / 会回退」这类提示，把「官方托管」的身份放到副标题的位置。

## 现状

- **详情头**：`renderer/src/components/intelligence/layout/IntelligenceProviderHeader.vue:204-219`。
  - 标题行是 `provider.name`。如果是 Nexus 托管渠道，后面跟 `.provider-official-badge`：图标 `i-carbon-cloud-service-management`，文案 `settings.intelligence.nexusOfficialProvider`「Nexus 官方托管」。
  - 副标题 `#provider-type` 显示 `settings.intelligence.providerTypeOptions.<type>`，Nexus 显示的是「兼容」。
- **列表卡片**：`IntelligenceItem.vue:95-103` 的 `providerSubtitle`。
  - Nexus 托管：已登录显示 `intelligence.item.nexusAuthReady`「Nexus 登录态就绪」，未登录显示 `intelligence.item.nexusAuthRequired`「Nexus 需登录」。
  - 非 Nexus：显示渠道类型。
  - 卡片另有「官方」徽标（`nexusBadge`，`:105-109`）。
- **详情第一组**：`IntelligenceInfo.vue:173-200`，一个 `TuffGroupBlock`。
  - 组名 `nexusStatusTitle`：未登录「需要登录以启用 Nexus AI」，已登录「Nexus Intelligence 已就绪」。
  - 组描述 `nexusStatusDescription`：未登录是 `nexusInvokeLoginDesc`，已登录是 `nexusInvokeReadyDesc`。
  - 组内一行 `nexusCallStateText`：未登录是 `nexusInvokeFallback`「当前未登录，调用会回退到其他已配置渠道。」，已登录是 `nexusInvokeAutoCall`。未登录时还带一个「登录 Nexus」按钮。
- **高级配置组**：`IntelligenceInfo.vue:281-292`。
  - 描述是 `Intelligence.config.advanced.description`「配置优先级和超时设置」，所有渠道共用。
  - Nexus 渠道会传 `priority-only`，实际只有「优先级」一项，所以这句描述对 Nexus 本身就不准确。
- **现有测试**：`IntelligenceProviderHeader.test.ts`（操作菜单的官方渠道闸门）、`IntelligenceInfo.test.ts`（高级配置的超时持久化）。两者都不断言这些文案。

## Requirements

- **N1**：「Nexus 官方托管」标签从标题行挪到副标题行，替换「兼容」。非 Nexus 渠道的副标题不变，仍显示渠道类型。
- **N2（不做）**：图 4 的「默认启用」指的是行为，不是文案。但它会推翻 `09-10-nexus-signin-activation` 的决策 D1：登录即自动启用，登出就关回去，见 `main/modules/ai/intelligence-config.ts:1330-1420` 的 `applyNexusProviderAuthState`。2026-10-03 老板定：**维持 D1，不改行为**。卡片副标题「Nexus 需登录」/「Nexus 登录态就绪」也保持不变。
- **N3**：Nexus 状态组不再显示描述，未登录、已登录两种状态都去掉。
- **N4**：高级配置组不再显示描述。这是共用组件，所有渠道都会一起去掉。
- **N5**：`nexusInvokeFallback` 改成「登录后启用」，en-US 改成「Enabled after sign-in」。组标题和「登录 Nexus」按钮不动。
- **N6**：中英文同步。因本次改动不再被引用的键（`nexusInvokeLoginDesc`、`nexusInvokeReadyDesc`、`Intelligence.config.advanced.description`）从两份语言文件里删掉。
  - 两份语言文件目前有其他代理未提交的改动，只做针对这几个键的最小编辑，不整文件重排。

## Acceptance Criteria

- [ ] 真实应用截图 · Nexus 未登录：标题行只剩「Tuff Nexus」，副标题位置是「Nexus 官方托管」标签，状态组没有描述，组内是「登录后启用」加「登录 Nexus」按钮，高级配置组没有描述。
- [ ] 真实应用截图 · 非 Nexus 渠道（如 deepseek-default）：副标题仍是渠道类型，高级配置组没有描述，其他组照旧。
- [ ] `IntelligenceProviderHeader.test.ts`、`IntelligenceInfo.test.ts` 通过；core-app `typecheck:web` 通过；改动文件的 lint delta 为 0。

## Out of Scope

- 渠道详情里其他组（API 配置、模型配置、速率限制）的描述保持原样。
- 登录流程、渠道启用逻辑（D1）、回退调用的行为都不改，只改展示。
