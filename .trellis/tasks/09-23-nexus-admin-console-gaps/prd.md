# Nexus 后台补齐：孤儿接口的缺页与巨型页面拆分

父任务：`09-23-nexus-docs-perf-cms-remediation`（路线 A："git 即 CMS"，见父任务 D2）。

## Goal

后台 `/admin/*` 里已有接口、没有界面的能力补上页面，导航不再指向重定向壳页；把 4,056 行的治理页拆成按需加载的分区组件，使后台首屏与交互不再受单文件体量拖累。文档内容仍由 git + 构建发布，不新增在线编辑。

## Background（已确认的事实）

- 导航分组与路径映射在 `app/components/admin/AdminNav.vue:33-48`（`sectionPaths`）与 `:110-230`（`menuGroups`：内容 / 实验场 / 账户 / 分析 / 运营）。菜单项必须在 `sectionPaths` 有条目、href 能回到同一 section、文案取自 `dashboard.sections.menu.*`（`AdminNav.routing.test.ts:241-281`）。
- `/admin/credits`（`app/pages/admin/credits.vue:9`）与 `/admin/codes`（`codes.vue:21-25`）都是重定向壳页。
- 无 UI 调用的后台接口（`research/audit-2026-09-23.md` §7）：
  - credits：`server/api/admin/credits/ledger.get.ts`（query 分页）、`usage.get.ts`、`pricing.get.ts`（返回 `{ unit:'credits', rules }`）、`pricing.patch.ts`（body：capability、creditsPerUnit、minCredits，校验在 :24-38）。
  - 插件审核：`server/api/admin/plugins/pending.get.ts` 返回 `pendingPlugins` 与 `pluginsWithPendingVersions`；插件状态变更复用 `server/api/dashboard/plugins/[id]/status.patch.ts`（admin 可设 `approved | rejected`，`rejected` 携带 `reason`）；版本级 `setPluginVersionStatus`（`server/utils/pluginsStore.ts:2044`）目前没有路由；豁免 `plugin-scan-waivers.{get,post}` 与 `plugin-scan-waivers/[id].delete`。
  - 发布证据：`server/api/admin/release-evidence/{matrix.get,runs.get,runs/[runId].get}`，鉴权 `requireAdminOrApiKey(event, ['release:evidence'])`；写接口（`runs.post`、`items.post`、`doc-guard.post`）由 CI 使用。
  - 风控 / 维护 / 应急：`telemetry/ip-blocks`、`maintenance/retention.post`、`emergency/revoke.post`，分别受 feature-gate、`maintenance:write`、控制面鉴权约束。
- 巨型单文件：`app/pages/admin/governance.vue` 4,056 行、13 次请求、0 个 `defineAsyncComponent`/`ClientOnly`；`analytics.vue` 1,875 行；`users.vue` 1,038 行；`updates.vue` 919 行。
- `server/api/images/list.get.ts` 无 `limit`/`cursor`；`app/pages/admin/images.vue` 一次拉全量。
- 现有表格页模式：`app/pages/admin/subscriptions.vue` 用 `TxDataTable` + `TxPagination`，`requestJson` 拉取；`admin-page-layout-contracts.test.ts:30-43` 要求 `TxDataTable` 自带 `scroll-x`。

## Requirements

### R1 Credits 控制台页 `/admin/credits`

- 替换 `credits.vue` 的重定向，页面含三块：ledger 表（走 `ledger.get` 的分页 query）、usage 汇总（`usage.get`）、pricing 规则编辑（`pricing.get` 展示，`pricing.patch` 保存；字段与校验以 `pricing.patch.ts:24-38` 为准）。
- 导航"账户"组新增条目；`sectionPaths` 同步；`dashboard.sections.menu.credits` 中英文案。

### R2 插件审核页 `/admin/plugins`

- 列出待审插件与含待审版本的插件（`pending.get`），每条可"通过 / 驳回"，驳回必须填写 reason，调用 `dashboard/plugins/[id]/status.patch`。
- 版本级审核：新增 `server/api/admin/plugins/[id]/versions/[versionId]/status.patch.ts` 调用 `setPluginVersionStatus`，鉴权 `requireAdmin`；若研究发现已有等价路由则复用。
- 扫描豁免（scan waivers）列表、新建、删除。
- 导航"内容"组新增条目，位于 reviews 之后。

### R3 发布证据页 `/admin/release-evidence`

- 只读：matrix 视图、runs 列表、run 详情（items）。不提供写操作按钮。
- 导航"运营"组新增条目。

### R4 `governance.vue` 拆分

- 按现有分区拆成 `app/components/admin/governance/*.vue`，非首屏分区用 `defineAsyncComponent`；13 个接口调用不变、行为不变。
- `governance.test.ts`、`governance.runtime.test.ts` 通过；`governance.css` 保持引用。

### R5 images 列表分页

- `list.get.ts` 支持 `limit` 与 `cursor`（R2 的 list API 契约），默认 limit 60；`images.vue` 增加"加载更多"。

### R6 导航整洁

- 移除或改写指向壳页的入口：`credits` 由 R1 解决；`/admin/codes` 保留重定向但不出现在菜单。

## Acceptance Criteria

- [ ] 三个新页面在真实浏览器（ego）以 admin 身份打开：列表有数据或正确空态；R1 保存 pricing 后 `pricing.get` 回读一致；R2 通过/驳回后 `pending.get` 列表相应减少；R3 能打开一个 run 的 items。
- [ ] `AdminNav.routing.test.ts`、`AdminNav.test.ts`、`admin-page-layout-contracts.test.ts`、`governance*.test.ts` 通过；新增页面各带一个最小 vitest（路由 meta + 首屏请求路径）。
- [ ] `governance.vue` 主文件 < 800 行；页面首屏 JS chunk 体积较拆分前下降（用 `nuxt build` 后 `.nuxt`/dist 的路由 chunk 对比记录）。
- [ ] `pnpm -C apps/nexus run typecheck`、所在文件 eslint、`git diff --check` 通过；中英文案同步。
- [ ] 不新增 `check-worker-bundle.mjs` findings。

## Out of Scope

- 路线 B：文档正文入 D1 与在线编辑器。
- ip-blocks / retention / emergency revoke 的界面（分别属风控 feature-gate、维护 API key、控制面应急，需单独决策）。
- `analytics.vue`、`users.vue`、`updates.vue` 的拆分（后续任务）。
- doc-comments 的回复 / 标记能力。
- intelligence-lab / intelligence-agent 已退役路由的清理。

## Open Questions

- 无阻塞项。版本级审核路由是否已存在待研究阶段确认（见 R2）。
