# 后台统一骨架：外壳闸门、区块 / 筛选 / 列表 / 确认组件与格式化（以管理操作审计页试点）

父任务：`10-02-nexus-admin-console-overhaul`（D3、D9；契约见父任务 `design.md` §2.2、§3、§4）。依赖：`10-02-tuffex-admin-primitives`（`TxDescriptions`、`TxDataTable` 骨架加载态、`TxPagination` 每页条数）合入后才能开工。

## Goal

把各页重复实现的闸门、格式化、列表、状态、确认、身份展示收拢成一套 Nexus 后台组合件，并用老板截图的 `/admin/audits` 做一次完整迁移，证明这套组合件够用、迁移完成标准可执行。之后的页面迁移子任务只引用、不改它的 API。

## Requirements

### 组合件

- **R1 布局级闸门**：`useAdminGate()`（`resolving | allowed | denied`）+ `layouts/admin.vue` 三态渲染（骨架 / `TxPermissionState` / 页面插槽）。`denied` 只导航一次到 `/dashboard/overview`。SSR 与首帧为 `resolving`。不影响 `layout: false` 的 `/admin/emergency`。
- **R1b 路由切换骨架（老板 2026-10-02 追加）**：后台页面之间切换时，从离开当前页到下一页挂载完成之前，`<main>` 显示与 `AdminGateSkeleton` 同形的骨架，不再出现整块空白。用 Nuxt 的 `page:start` / `page:finish` 钩子（或等价的路由生命周期）驱动，骨架延迟约 150ms 才出现，避免快速切换时闪一下；如果过渡出错导致 `page:finish` 迟迟不来，骨架不能永远挂着，要有兜底（例如路由已切换且页面根元素已挂载即收起）。背景：老板在 :3200 上遇到 `/admin/analytics` 主区域长时间空白；直接原因是 `intelligence-overview.vue` / `intelligence-audits.vue` 模板根部有一段注释，开发模式下成了多根节点，`out-in` 页面过渡卡死。这个原因由单独的小 PR 修复，本条只负责「加载中有骨架」。
- **R2 `AdminPageShell`**：保留现有 `title` / `#actions` / `#filters` / 默认插槽，新增 `#nav`（标题下方的分区条）。
- **R3 区块与指标**：`AdminSection`（`title?`、`description?`、`#actions`、默认插槽、`#footer`；语义 `<section>` + `<h2>`，区块标题描述区块本身，不得重复页面标题）、`AdminStatGrid`（`TxStatCard` 网格 + 同形骨架）。
- **R4 列表**：`AdminFilterBar` + `AdminFilterField`（带标签字段网格、「清空筛选」、有生效筛选时才可点）、`AdminTable`（`TxDataTable` `loadingVariant="skeleton"`、错误态 + 重试、两种空态、`TxPagination` 总数 + 每页条数、`cell-*` 插槽透传、行点击）、`useAdminList`（page / limit / total / filters、URL query 双向同步、筛选变化回第 1 页、文本筛选防抖、请求代次防竞态、`loading` 与 `refreshing` 分离）、`useAdminQueryState`（`?section=` / `?tab=` 读写）。
- **R5 格式化与错误**：`useAdminFormat`（`tableDateTime` 紧凑不折行 + `dateTimeTitle` 完整本地化、`date`、`dateTime`、`relative`、`number`、`compact`、`bytes`、`duration`、`percent`；locale 由 i18n 映射到 BCP-47）；`resolveAdminErrorMessage(error, fallback)`（不回落到 ofetch 的 `[GET] "/api/…"` 原文）。
- **R6 确认与身份**：`AdminConfirmDialog`（`tone`、可要求输入确认文本、提交中锁定）、`AdminIdentity`（名字为空时邮箱只出现一次；首字母跳过方括号 / emoji 等符号）。
- **R7 入口**：新增 `pages/admin/index.vue` → 重定向 `/admin/updates`。

### 试点：`/admin/audits`

- **R8** 按父任务 `design.md` §4 全部 11 条迁移，并逐条关闭基线缺陷（`research/visual-baseline-2026-10-02.md` §「/admin/audits」与 `page-inventory.md` §7-1~4）：
  - 标题改为 rail 文案「管理操作审计」（`menu.adminAudits`），与 AI 调用审计不再同名；
  - 列：时间（`tableDateTime`，固定宽度、不折行、悬停看完整时间）、管理员（`AdminIdentity` 紧凑模式）、动作（标签，不折行）、目标（标签 + 类型，超长省略）、摘要（按动作结构化；没有专门格式化的动作显示前几个键值，**不再整段 JSON**）；
  - 行点击打开详情抽屉（`TxDrawer` + `TxDescriptions`：完整时间、管理员、动作 id 与标签、目标类型 / id / 标签、IP、User-Agent、metadata 以格式化代码块展示）；
  - 筛选：关键词（`TxSearchInput` 防抖）、动作；`targetType`、`adminUserId` 支持经 URL 传入并以可清除的筛选标签显示（接口 `server/api/admin/audits/index.get.ts:8-15` 已支持这四个参数）；
  - 分页：`TxPagination` 显示总数，每页 20 / 50 / 100（接口上限 100）；筛选与页码进 URL；
  - 导出 CSV 沿用当前筛选；
  - 补齐 `intelligence.tool.approve` / `intelligence.tool.reject` 的动作标签（历史行仍在库里，`research/retired-ai-cleanup.md` §2.7）；
  - 首屏骨架、刷新保留、错误态不含 API 路径、「没有记录」与「筛选后为空」区分。
- **R9 测试**：组合件各有单测 / 组件测试；`audits-page-behavior.test.ts` 改为测试新组合件与审计摘要纯函数，并逐条保留原测试守住的行为（错误兜底 `'Failed to load audit logs.'` 不含 `/api/admin/audits`、优先 `err.data.message`、失败清空行、动作标签随 locale 变、下拉由标签表派生、筛选回第 1 页、空筛选不发参、默认 query 恰为 `{ page: 1, limit: 20 }`）。
- **R10 spec**：更新 `.trellis/spec/frontend/component-guidelines.md:72`，写清组合件清单、`#nav` 插槽、区块标题规则、布局闸门、页面迁移完成标准的出处（父任务 design §4）。

## Acceptance Criteria

- [ ] ego 实测 `/admin/audits`（1280 / 1920 × 亮 / 暗 × 中 / 英）：任何列不竖排、不折行到多行、无横向溢出；无名字管理员的邮箱只出现一次；摘要列无整段 JSON；详情抽屉展示完整 metadata；URL 带筛选与页码时刷新页面状态不丢；截图与基线对照存 `research/`。
- [ ] 非管理员账号（本地另签一个普通用户会话，**用独立浏览器上下文**，避免共享 cookie 罐伪造结论）访问 `/admin/audits`：不发 `/api/admin/audits` 请求，显示无权限态并跳转 `/dashboard/overview`。
- [ ] `/admin` 跳到 `/admin/updates`。
- [ ] 其余尚未迁移的后台页面（仍自带 watch 闸门）行为不变。
- [ ] `cd apps/nexus && ./node_modules/.bin/vitest run`、Nexus typecheck、改动文件 eslint、`git diff --check` 通过；守卫 `admin-route-reachability`、`component-auto-import`、`i18n-key-existence`、`dashboard-admin-i18n-coverage` 通过。

## Out of Scope

- 其它页面的迁移（#3–#7）；新功能页（#8–#12）。
- 审计接口新增日期区间筛选（接口不支持，本任务不扩展后端）。
- `useAdminStepUp`（由 #11 引入）。
