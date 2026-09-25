# Design — 后台补齐（路线 A）

## 1. 边界

- 不改文档内容链路；只在 `/admin/*` 增加三页、拆一页、补一个列表分页。
- 页面全部走既有控制台外壳 `app/layouts/admin.vue` + `AdminNav`，数据请求走 `~/utils/request` 的 `requestJson`，表格用 `TxDataTable`（带 `scroll-x`）+ `TxPagination`，与 `subscriptions.vue` 同构。
- 鉴权在服务端已由 `requireAdmin` / `requireAdminOrApiKey` 保证；前端只做 `isAdmin` 门禁与非 admin 重定向（沿用 `doc-comments.vue:24-30` 的 watch 写法）。

## 2. 页面与数据流

| 页面 | 读 | 写 | 备注 |
|---|---|---|---|
| `/admin/credits` | `GET /api/admin/credits/ledger?…`、`/usage?…`、`/pricing` | `PATCH /api/admin/credits/pricing` | ledger / usage 的 query 参数以各 handler `getQuery` 读取的字段为准（研究步确认） |
| `/admin/plugins` | `GET /api/admin/plugins/pending`、`GET /api/admin/plugin-scan-waivers?…` | `PATCH /api/dashboard/plugins/:id/status`（approved / rejected + reason）、新增 `PATCH /api/admin/plugins/:id/versions/:versionId/status`、`POST /api/admin/plugin-scan-waivers`、`DELETE /api/admin/plugin-scan-waivers/:id` | 版本级路由复用 `setPluginVersionStatus`，鉴权 `requireAdmin`，写 `logAdminAudit`（`admin-page-layout-contracts.test.ts:62-128` 会检查 audits 页的 action 词表，需同步加标签） |
| `/admin/release-evidence` | `GET /api/admin/release-evidence/matrix?…`、`/runs?…`、`/runs/:runId` | 无 | 只读控制台 |

- 每页一个 `useXxxAdminData()` 组合式函数放在 `app/composables/`，返回 `{ data, loading, error, refresh }`，便于 vitest 用 `request` 注入桩（同 `useAdminAnalyticsData` 的 `options.request` 模式）。

## 3. 导航

- `AdminNav.vue` `sectionPaths` 增 `credits`、`plugins`、`release-evidence`；`menuGroups`：credits → 账户组，plugins → 内容组（reviews 之后），release-evidence → 运营组。
- 文案键 `dashboard.sections.menu.{credits,plugins,releaseEvidence}`，`i18n/locales/{zh,en}.ts` 同步；`AdminNav.routing.test.ts` 的"每个菜单项有 sectionPaths、href 回到同一 section、文案取自 menu 命名空间"三条自动覆盖新条目。
- `credits.vue` 从重定向壳页改为真实页面；`codes.vue` 保持重定向但确认不在菜单中出现。

## 4. `governance.vue` 拆分

- 以现有模板的顶层分区为边界，拆成 `app/components/admin/governance/<Section>.vue`；首屏分区静态 import，其余 `defineAsyncComponent`。
- 页面级状态与 13 个请求保留在页面或一个 `useGovernanceAdminData()` 中，通过 props/emit 下发，避免分区各自重复请求。
- `governance.css` 仍由页面引入；`governance.test.ts` / `governance.runtime.test.ts` 若钉住源字符串需同步更新断言目标文件。

## 5. images 分页

- `server/api/images/list.get.ts`：读取 `limit`（默认 60，上限 200）与 `cursor`，透传给 R2 `list({ limit, cursor })`，返回 `{ images, cursor, truncated }`；无参数时行为兼容今天的全量（保留一次性迁移窗口）。
- `images.vue`：`useDashboardImagesData` 增加 `loadMore()`。

## 6. 兼容与回滚

- 新路由与新页面对既有用户不可见（仅 admin）；版本级状态路由是新增文件，回滚即删除。
- `governance.vue` 拆分是纯前端重构，回滚为单提交撤销。
