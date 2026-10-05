# 插件审核搬进后台 `/admin/plugins`

父任务：`10-02-nexus-admin-console-overhaul`（D5）；承接 `09-23-nexus-admin-console-gaps` 原 R2。依赖：`10-02-nexus-admin-console-kit` 合入且组合件 API 已冻结。`design.md` / `implement.md` 在开工前补写。

## Goal

插件与版本的审核目前藏在会员控制台 `/dashboard/assets` 里，只能在本地视图切换、不能深链，也看不到扫描结论与准入状态。把审核搬到后台独立页面，并补上扫描豁免管理与审核审计。

## Background

- 现有审核 UI：`pages/dashboard/assets.vue` 的管理员视图 `pending` / `all`（`:400-423`，仅 `ref`，不进 URL），待审列表在前端从全量插件算出（`:355-372`），审核弹窗 `ReviewModalOverlay.vue` 发出 approve / reject（`:27-31`），由 `assets.vue:545-589` 调用两个 PATCH。
- 接口：`GET /api/admin/plugins/pending`（`requireAdmin`，返回 `pendingPlugins` 与 `pluginsWithPendingVersions`，无分页，每次全量读两遍，`server/api/admin/plugins/pending.get.ts:7-17`）；`PATCH /api/dashboard/plugins/:id/status`（管理员可设任意状态，`reason` 仅 rejected 时保存、服务端可空）；`PATCH /api/dashboard/plugins/:id/versions/:versionId`（批准前检查产物 / 策略 / 签名 / 扫描结论，不满足返回 409 `PLUGIN_ADMISSION_PREREQUISITES_MISSING`，`pluginsStore.ts:2075-2089`）；扫描豁免 `GET / POST /api/admin/plugin-scan-waivers`、`DELETE …/:id`。
- 插件 / 版本状态变更**不写** `admin_audits`（只写插件时间线、治理事件与通知）。
- 前端类型 `app/types/dashboard-plugin.ts` 没有扫描结论、准入状态字段（只有 `rejectReason`，`:28`）；`PendingReviewSection.vue`、`PluginListItem.vue` 全仓无引用。

## Requirements

- **R1 页面与导航**：`/admin/plugins`，「内容运营」组在「评论管理」之后新增「插件审核」（`dashboard.sections.menu.pluginModeration`；`menu.plugins` 已被会员侧「发布物」占用）。
- **R2 待审队列**：两个分区（`?tab=plugins|versions`）：待审插件、含待审版本的插件（逐个版本一行）。列：插件（图标 + 名称 + id）、作者、版本、提交时间、扫描结论（结论 / 发现数 / 摘要）、准入状态；筛选与页码进 URL（接口不分页时前端分页；若数据量证明需要，后端补 `limit / cursor`，在 design 阶段用本地 / 生产规模判断）。
- **R3 审核动作**：详情抽屉展示元数据、扫描结论与发现摘要、准入前置条件；批准 / 驳回插件与版本，驳回必须填写理由（前端校验，沿用 09-23 R2 的要求）；批准遇 409 时在抽屉里逐条列出缺失的前置条件，而不是只弹错误。
- **R4 扫描豁免**：列表（按 artifact sha 过滤）、新建（`artifactSha256` 取自所选版本的产物、`ruleId` 只能是 5 条可豁免规则之一、`reason`、`expiresAt` 必须在未来、可选 `ticket`）、撤销（`AdminConfirmDialog`）。页面说明豁免只对之后上传 / 重传的同一 sha 包生效（`pluginsStore.ts:2546,2949`）。后端：重复撤销已撤销的豁免时不再重复写审计与治理事件（`pluginSecurityScanWaiverStore.ts:242-265`）。
- **R5 审计**：插件与版本状态变更写 `logAdminAudit`（动作 `plugin.status.update`、`plugin.version.status.update`，metadata 含旧 / 新状态与理由），`/admin/audits` 补标签。
- **R6 会员侧收口**：`/dashboard/assets` 删除管理员视图（`pending` / `all`）、审核弹窗接线与相关文案；`ReviewModalOverlay.vue` 迁到后台或删除（以引用为准）；删除无引用的 `PendingReviewSection.vue`、`PluginListItem.vue`。会员自己的发布物、提交审核 / 撤回不受影响（core-app `useUserPlugins.ts:280` 仍调用 status PATCH 做 owner 提交 / 撤回）。

## Acceptance Criteria

- [ ] 页面逐条满足父任务 design §4；ego 截图存 `research/`。
- [ ] 本地造一个待审插件与一个待审版本：在 `/admin/plugins` 批准 / 驳回后，`GET /api/admin/plugins/pending` 相应减少；管理操作审计出现两条新动作并有标签。
- [ ] 造一个前置条件不满足的版本：批准时抽屉列出缺失项。
- [ ] 新建、撤销一条豁免；重复撤销只产生一条审计。
- [ ] 普通会员访问 `/dashboard/assets` 看不到任何管理员视图；管理员访问也只看到自己的发布物。
- [ ] 全量 vitest、typecheck、改动文件 eslint、`git diff --check`；`DashboardNav.routing.test.ts:186-191` 仍通过。

## Out of Scope

- 插件准入规则、扫描规则本身的调整；商店评价审核（`/admin/reviews?tab=plugins`，那是用户评分评论，不是插件提交）。
