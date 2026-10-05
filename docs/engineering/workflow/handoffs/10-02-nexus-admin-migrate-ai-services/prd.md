# AI 服务页迁移：AI 概览、服务渠道、AI 调用审计

父任务：`10-02-nexus-admin-console-overhaul`。依赖：`10-02-nexus-admin-console-kit` 合入且组合件 API 已冻结。`design.md` / `implement.md` 在开工前按冻结后的 API 补写。

## Goal

把 AI 服务组三个页面迁到统一骨架，消除重名与双重标题，解除服务渠道面板的限宽与横向溢出。

## Requirements

- **R1 AI 概览 `/admin/intelligence-overview`**（页面 39 行 + `components/dashboard/intelligence/IntelligenceOverviewPanel.vue` 553 行）：
  - 页面标题改为 rail 文案「AI 概览」（当前为「概览」）；删除面板里的 h2「智能概览」与副标题（`IntelligenceOverviewPanel.vue:274-279`，违反 `component-guidelines.md:72`）。
  - 四个指标用 `AdminStatGrid`（数字加千分位，当前直接插值，`:302,318`）；Top 列表与用户消耗查询放进 `AdminSection`；四个独立请求各自加载、各自失败、各自重试。
  - `ClientOnly` 的手写 `animate-pulse` fallback（页面 `:25-37`）换成贴合版式的骨架。
  - **手动 IP 封禁区块不动**（含其 step-up 输入与「风险控制未启用」提示）：由 `10-02-nexus-admin-risk-console` 迁走，避免两个子任务重复改同一段。
- **R2 服务渠道 `/admin/provider-registry`**（页面 32 行 + `ProviderRegistryAdminPanel.vue` 2207 行 + `useProviderRegistryAdmin.ts` 1186 行）：
  - 去掉面板根部的 `mx-auto max-w-6xl`（`:506`）；四个标签页（服务渠道 / 能力路由 / 用量 / 健康）改为 `?tab=`，分区条放 `#nav`；「刷新」移到页头 `#actions`；删除面板内的二级标题与副标题。
  - 表格在 1280px 视口下主列不溢出：次要列（健康、配额、更新时间等）收进详情抽屉或在窄宽时隐藏，取消 `min-w-[1470px]`（`:691`）等强制最小宽度（`:904,1099,1212`）。
  - 时间改用 `useAdminFormat`（当前 `toLocaleString()`，`utils/provider-registry-admin.ts:1223-1226`，基线可见 `9/30/2026, 7:09:07 PM`）。
  - 闸门：删除 `useProviderRegistryAdmin.ts:98-104` 的 watch，由布局负责；同步 `useProviderRegistryAdmin.test.ts:169-170`。
  - 按 spec `nexus-provider-scene-routing.md:105` 在真实浏览器验证适配器选择器、能力目录、绑定模型选择器与降级原因。
- **R3 AI 调用审计 `/admin/intelligence-audits`**（页面 34 行 + `IntelligenceAuditsPanel.vue` 221 行）：
  - 标题改为「AI 调用审计」（当前与 `/admin/audits` 同为「审计日志」）。
  - 卡片流改为 `AdminTable`（时间、渠道 / 模型、结果与状态码、延迟、接口、Trace），行点击打开详情抽屉（错误信息、完整接口、Trace、metadata）；筛选沿用接口支持的用户 ID（`page/limit/userId`）。
  - 时间改用 `useAdminFormat`（当前 `toLocaleString()`，`:69-78`）。
- **R4 测试**：`provider-registry-admin.test.ts` 钉住的样式类断言（`:269-320,390-444`）与 `docs-page-performance.test.ts:263-265` 的包装断言改为行为 / 结构契约，说明原断言守的是什么。

## Acceptance Criteria

- [ ] 三页逐条满足父任务 design §4；ego 截图存 `research/`，与基线对照（双重标题、重名、限宽、横向溢出、英文日期均消失）。
- [ ] 服务渠道四个 tab 可深链；spec `nexus-provider-scene-routing.md:105` 列出的四项在浏览器中逐项验证并截图。
- [ ] 全量 vitest、typecheck、改动文件 eslint、`git diff --check`。

## Out of Scope

- 手动 IP 封禁区块（`10-02-nexus-admin-risk-console`）。
- Provider Registry 的业务逻辑与接口变更。
