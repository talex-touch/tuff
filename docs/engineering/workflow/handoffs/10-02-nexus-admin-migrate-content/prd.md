# 内容运营页迁移：更新与要闻、资源库（含列表分页）、评论管理

父任务：`10-02-nexus-admin-console-overhaul`。依赖：`10-02-nexus-admin-console-kit` 合入且组合件 API 已冻结。`design.md` / `implement.md` 在开工前按冻结后的 API 补写。

## Goal

把内容运营组三个页面迁到统一骨架，并承接 09-23 计划的 R5（资源库分页）。

## Requirements

- **R1 更新与要闻 `/admin/updates`**（`updates.vue` 913 行）：
  - 按父任务 design §4 迁移；当前没有管理员闸门、只隐藏按钮（`:398,622,632`），迁移后由布局闸门负责。
  - 37 处 `isZh ? … : …` 内联文案（如 `:83-116,170-184,196-204,408-486,532,660`）全部改为 i18n 键。
  - 仍是全量取回后前端筛选（接口不分页），但改用 `AdminTable` 的分页与每页条数，不再固定 5 条 / 页（`:70`）；筛选与页码进 URL。
  - 操作列用 `TxDataTable` 原生 `fixed: 'right'` 取代手写 sticky（`:736-761`），删除 `:deep()` 覆写 TxPagination 内部的样式（`:867-897`）。
  - 删除用 `AdminConfirmDialog`；修正 `method: 'DELETE' as unknown as 'PATCH'` 的类型绕行（`:364-366`）。
  - `UpdateFormDrawer.vue` 保留业务逻辑，外壳统一到后台抽屉宽度与 `TxDescriptions` / 表单标签规范。
  - 时间列用 `tableDate`（只显示日期，不折行；完整时间在悬停提示与详情抽屉）。手动条目存的是 `T00:00:00Z`，显示时分没有意义（2026-10-03 主会话决定）。
- **R2 资源库 `/admin/images`**（`images.vue` 273 行；承接 09-23 R5）：
  - `server/api/images/list.get.ts` 支持 `limit`（默认 60、上限 200）与 `cursor`，返回 `{ images, cursor, truncated }`；不带参数时与现在兼容。
  - 页面「加载更多」；列表加载失败显示错误态而非空态（当前未解构 `error`，`:28-33`）。
  - 上传区说明与「选择文件」不再重复两遍；删除走 `AdminConfirmDialog`。
  - 修正上传 / 删除失败共用的错误键（`i18n-key-existence.test.ts:377-381` 的 `KNOWN_WRONG_KEYS` 豁免随之删除，「豁免过期即失败」机制要求同步删）。
- **R3 评论管理 `/admin/reviews`**（`reviews.vue` + `PluginReviewsPanel.vue` + `DocCommentsPanel.vue`）：
  - `?tab=plugins|docs` 改用 `useAdminQueryState`；分区条放 `AdminPageShell #nav`。
  - 两个队列各自保留真实接口、筛选、动作与分页状态（spec `component-guidelines.md:74`），切 tab 不丢当前队列的筛选与页码（现在 TxTabs 只挂当前 tab，切换即重挂重拉）。
  - 插件评论通过 / 驳回、文档评论删除都要确认（当前插件评论无确认，`PluginReviewsPanel.vue:116-138`）。
  - 待审数只显示一次（`:146-148` 与 `:223-225` 重复）；不再借用 `users.pagination.*` 键（`:231-232`）；DocComments 时间改用 `useAdminFormat`（当前浏览器默认 locale，`DocCommentsPanel.vue:166-171`）。
  - 1280px 视口下不横向溢出（当前列宽合计超出，`PluginReviewsPanel.vue:55-62`、`DocCommentsPanel.vue:45-51`）。

## Acceptance Criteria

- [ ] 三页逐条满足父任务 design §4；ego 截图（1280 / 1920 × 亮 / 暗 × 中 / 英）存 `research/`，与基线对照。
- [ ] 资源库：本地造 > 60 个对象，验证分页加载更多与 `truncated`；无参请求与改动前响应一致。
- [ ] 评论管理：在插件评论翻到第 2 页后切到文档评论再切回，仍在第 2 页。
- [ ] 全量 vitest、typecheck、改动文件 eslint、`git diff --check`；`i18n-key-existence` 豁免删除后通过。

## Out of Scope

- 更新接口改为服务端分页；doc-comments 的回复 / 标记能力。
