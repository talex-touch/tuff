# Design — 内容运营页迁移（更新与要闻、资源库、评论管理）

依据：父任务 `design.md` §2.2 / §4；组合件定型 API 见 `../10-02-nexus-admin-console-kit/design.md` §8；页面现状见 `../10-02-nexus-admin-console-overhaul/research/page-inventory.md`（行号以动手时 `rg -n` 复核为准）。

## 1. 组合件 API 的一处向后兼容扩展

评论管理页的两个队列共用一个 URL，只挂载当前标签。若都用 `page` / `limit` / `q` 等键，切标签时页码会串到另一个队列（PRD 验收：插件评论翻到第 2 页、切到文档评论再切回仍在第 2 页）。

- `useAdminList` 增加可选 `queryKeyPrefix?: string`：设置后读写的 query 键为 `${prefix}page`、`${prefix}limit`、`${prefix}<filter>`；不设置时行为完全不变。
- 先更新父任务 `design.md` §2.2 与 `10-02-nexus-admin-console-kit/design.md` §8（「定型 API」的已登记扩展），再改代码；补单测（两个前缀互不干扰、未设置前缀时键名不变）。

## 2. 更新与要闻 `/admin/updates`

- 页头：`AdminPageShell title=menu.updates`；`#actions`：「Changelog 文档」外链、「新建要闻」。
- 数据：接口一次返回全部条目（不分页）。用一个前端分页的 fetcher 适配 `useAdminList`：
  ```ts
  // utils/admin-client-list.ts
  createClientListFetcher<Row, F>(loadAll: () => Promise<Row[]>, filter: (row: Row, f: F) => boolean)
  // 返回 useAdminList 的 fetch：首次与 refresh() 时调用 loadAll 并缓存；分页、筛选在缓存上切片
  ```
  筛选（搜索、类型、渠道、范围、来源、时间）与页码进 URL；每页 20 / 50 / 100，替换固定 5 条。
- 列：标题 / 摘要（含标签）、类型、渠道、范围、来源、时间（`tableDate`，只显示日期；完整时间放悬停提示与详情抽屉。组合件为此新增 `useAdminFormat().tableDate`，已登记 kit design §8）、操作（`fixed: 'right'`：打开、编辑、删除）。删除手写 sticky 与对 TxPagination 内部的 `:deep()` 覆写。
- 文案：37 处 `isZh ?` 全部改为 `dashboard.sections.updates.*` 键（中英）。
- 删除：`AdminConfirmDialog`；`$fetch` 的 `method: 'DELETE' as unknown as 'PATCH'` 改为 `requestJson(url, { method: 'DELETE' })`（与类型签名对齐）。
- `UpdateFormDrawer.vue`：业务逻辑不动；外壳统一为 `TxDrawer`（宽度与审计抽屉一致），表单字段补 `<label>` 关联。

## 3. 资源库 `/admin/images`

- 后端 `server/api/images/list.get.ts`：读取 `limit`（默认 60、上限 200）与 `cursor`，透传 R2 `list({ limit, cursor })`，返回 `{ images, cursor, truncated }`；不带参数时返回体与现在兼容（附 API 测试）。
- 页面：网格（不是表格），首屏骨架为同尺寸卡片；底部「加载更多」（游标分页，不进 URL）；列表加载失败显示 `TxErrorState` + 重试（当前未解构 `error`，失败显示成空）。
- 上传区：说明文字与「选择文件」只出现一次；上传 / 删除失败各用正确的 i18n 键，删除 `i18n-key-existence.test.ts` 中对 images 的 `KNOWN_WRONG_KEYS` 豁免（豁免过期检查要求同步删）。
- 删除：`AdminConfirmDialog`。

## 4. 评论管理 `/admin/reviews`

- `?tab=plugins|docs` 用 `useAdminQueryState`；分区条放 `AdminPageShell #nav`（替换页内 `TxTabs`）。
- 两个面板改为 `AdminTable` + `useAdminList`，分别用 `queryKeyPrefix: 'p_'` 与 `'d_'`，各自的筛选与页码互不干扰，切标签保留。
- 插件评论：通过 / 驳回走 `AdminConfirmDialog`（驳回 `tone: danger`）；待审数只在 footer 显示一次；不再借用 `users.pagination.*` 键。
- 文档评论：路径筛选（防抖）、删除确认沿用；时间改 `useAdminFormat`（当前浏览器默认 locale）。
- 列宽：1280px 视口下不横向溢出（作者用 `AdminIdentity compact`，正文单行省略，完整内容进详情抽屉）。

## 5. 测试

- `useAdminList` 前缀扩展单测；`createClientListFetcher` 单测（缓存、筛选、切片、refresh 重新加载）。
- `list.get.ts` API 测试：默认 limit、上限、cursor 透传、无参兼容。
- 三个页面：把可测逻辑放进纯函数 / 组合式函数测试；`i18n-key-existence` 豁免删除后通过；`admin-route-reachability` 页数门槛仍成立。

## 6. 兼容与回滚

- 后端只新增可选参数；`useAdminList` 扩展默认行为不变。回滚 = revert PR。
