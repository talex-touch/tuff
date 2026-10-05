# Design — 后台统一骨架（Nexus 组合件 + 审计页试点）

父任务契约：`../10-02-nexus-admin-console-overhaul/design.md` §2.2。本文件给出可直接实现的形状；实现中如需偏离，先改父任务 design 再改这里。

## 1. 文件布局

```
apps/nexus/app/
  layouts/admin.vue                         # 加闸门三态
  components/admin/
    AdminPageShell.vue                      # + #nav
    AdminSection.vue
    AdminStatGrid.vue
    AdminFilterBar.vue
    AdminFilterField.vue
    AdminTable.vue
    AdminConfirmDialog.vue
    AdminIdentity.vue
    AdminGateSkeleton.vue                   # 闸门 resolving 时的整页骨架（标题条 + 区块）
  composables/
    useAdminGate.ts
    useAdminList.ts
    useAdminQueryState.ts
    useAdminFormat.ts
  utils/
    admin-request-error.ts                  # resolveAdminErrorMessage
    admin-audits.ts                         # 审计动作标签表、摘要格式化（纯函数）
  pages/admin/
    index.vue                               # redirect → /admin/updates
    audits.vue                              # 试点迁移
```

组件直接放在 `components/admin/` 下（自动导入名即 `Admin*`，满足 `component-auto-import` 守卫）；页面里显式 import。

## 2. 组合式函数

### 2.1 `useAdminGate()`

```ts
type AdminGateState = 'resolving' | 'allowed' | 'denied'
function useAdminGate(): { state: ComputedRef<AdminGateState> }
```

- 输入：`useAuthUser()` 的 `user / pending / status` 与 `useAccountRole().isAdmin`，外加本组件 `mounted`。
- `!mounted || status === 'loading' || pending || (status === 'authenticated' && !user)` → `resolving`；`user && isAdmin` → `allowed`；`user && !isAdmin` → `denied`。未登录由 `app.vue` 的 `requiresAuth` 门处理，这里不重复。
- `denied` 时 `navigateTo('/dashboard/overview', { replace: true })`，用一个 flag 保证只发一次。

### 2.2 `useAdminList<Row, F>(options)`

```ts
interface AdminListOptions<Row, F extends Record<string, string>> {
  fetch: (params: { page: number, limit: number, filters: F }) => Promise<{ rows: Row[], total: number }>
  defaults: F                      // 筛选默认值；等于默认值的筛选不写进 URL、不发参
  defaultLimit?: number            // 默认 20
  pageSizes?: number[]             // 默认 [20, 50, 100]
  debounceKeys?: (keyof F)[]       // 文本类筛选，300ms 防抖
  query?: boolean                  // 是否与 URL 同步，默认 true
}
interface AdminListState<Row, F> {
  rows: Ref<Row[]>, total: Ref<number>, page: Ref<number>, limit: Ref<number>, filters: F (reactive),
  loading: Ref<boolean>,           // 还没有任何数据时的加载 → 骨架
  refreshing: Ref<boolean>,        // 已有数据时的加载 → 保留行
  error: Ref<string | null>,
  hasActiveFilters: ComputedRef<boolean>,
  refresh(): Promise<void>, clearFilters(): void, setPage(n): void, setLimit(n): void
}
```

- 初始值从 `route.query` 解析（非法值回落默认）；状态变化时 `router.replace({ query })` 写回，只写非默认值，保留与本列表无关的 query 键（如 `?tab=`）。
- 筛选或条数变化 → `page = 1`；文本筛选防抖。
- 每次请求递增代次，旧代次的响应丢弃。
- 失败：`error = resolveAdminErrorMessage(e, fallback)`，`rows` 清空（审计页原有行为，测试守住）。
- 服务端渲染时不发请求（后台页面由闸门保证只在客户端挂载）。
- 首屏不得闪空态（`10-02-tuffex-admin-primitives` 复核提醒）：`useDeferredLoading` 会把 `loading` 延迟约 150ms 才置真，这段时间里 `loading=false` 且没有数据，`TxDataTable` 会先渲染一次「No data」再出骨架。`useAdminList` 在第一次响应返回前保持 `loading=true`（不经延迟），`useDeferredLoading` 只用于已有数据后的刷新提示；`AdminTable` 在「从未成功加载过」时不渲染空态。

### 2.3 `useAdminQueryState(key, allowed, fallback)`

返回可写 `Ref<string>`：读 `route.query[key]`，不在 `allowed` 内回落 `fallback`；写入用 `router.replace`，`fallback` 值不写进 URL。

### 2.4 `useAdminFormat()`

- `bcp47 = locale === 'zh' ? 'zh-CN' : 'en-US'`（按 i18n 实际 locale 列表映射，未知回落 `en-US`）；`Intl.*` 实例按 locale 缓存。
- `tableDateTime(v)`：`YYYY-MM-DD HH:mm`（本地时区，24 小时制）；`dateTimeTitle(v)`：`Intl.DateTimeFormat(bcp47, { dateStyle: 'medium', timeStyle: 'medium' })`；`date(v)`：`dateStyle: 'medium'`；`relative(v)`：`Intl.RelativeTimeFormat`；`number`、`compact`（`notation: 'compact'`）、`bytes`（1024 进制，B / KB / MB / GB）、`duration(ms)`（`<1s` 显示 ms，否则 `1m 5s` / `1分5秒` 走 i18n 键）、`percent(ratio, digits)`。
- 所有函数对 `null` / 空串 / 非法日期返回 `'—'`，绝不输出 `Invalid Date` / `NaN`。

### 2.5 `resolveAdminErrorMessage(error, fallback)`

顺序：`error.data.message` → `error.data.statusMessage` → `error.statusMessage` → `fallback`。不使用 `error.message`（ofetch 的 `message` 形如 `[GET] "/api/…": 500`，会泄露路径）。

## 3. 组件

| 组件 | Props / 插槽 / 事件 | 要点 |
|---|---|---|
| `AdminPageShell` | `title`；`#actions`、`#nav`、`#filters`、默认 | `#nav` 位于标题行与筛选之间；h1 20px / 600 不变 |
| `AdminSection` | `title?`、`description?`、`padded = true`；`#actions`、默认、`#footer` | `<section>` + `<h2>`（16px / 600）；圆角 22px、暗色底 `rgb(255 255 255 / 4.5%)`，与 `admin.vue` 对 `apple-card-lg` 的处理一致；所有颜色走 `--tx-*` |
| `AdminStatGrid` | `items: { key, label, value, meta?, iconClass?, insight? }[]`、`loading`、`min = 200`（卡最小宽 px） | `grid-template-columns: repeat(auto-fill, minmax(min, 1fr))`；`loading` 时渲染同数量、同尺寸骨架卡 |
| `AdminFilterBar` | `active`（是否有生效筛选）、`clearLabel`；默认插槽（放 `AdminFilterField`）、`#trailing`；`clear` | 字段网格自适应；「清空筛选」在 `active` 为假时禁用 |
| `AdminFilterField` | `label`、`for?`；默认插槽 | `<label>` 关联控件，满足无障碍 |
| `AdminTable` | `columns`、`rows`、`rowKey`、`loading`、`refreshing`、`error`、`emptyTitle`、`filteredEmptyTitle`、`filtered`、`page`、`limit`、`total`、`pageSizes`、`clickableRows`；透传 `cell-*` / `header-*` 插槽；`retry`、`update:page`、`update:limit`、`row-click` | 内部 `TxDataTable loading-variant="skeleton"`；`error` 时用 `TxErrorState` + 重试按钮替换表体；空态区分「没有数据」与「筛选后为空」（后者提供清空筛选按钮）；分页条 `#info` 显示「共 N 条」；`total ≤ limit` 且 `page = 1` 时隐藏页码只留总数 |
| `AdminConfirmDialog` | `v-model:open`、`title`、`description`、`confirmLabel`、`cancelLabel`、`tone: 'danger' \| 'warning'`、`requireText?`、`loading`；`confirm` | 基于后台已在用的 `TxBottomDialog`；`requireText` 存在时输入一致才可确认；`loading` 时两个按钮都禁用、阻止关闭 |
| `AdminIdentity` | `name?`、`email?`、`avatar?`、`size: 'sm' \| 'md'`、`compact` | 主行 = `name ?? email`；副行 = 有 `name` 时显示 `email`，否则不显示；首字母取第一个字母 / 数字 / CJK 字符；超长省略 + `title` |
| `AdminGateSkeleton` | — | 标题条 + 两个区块骨架，用 `TxSkeleton`，`aria-hidden` |

## 4. 布局

```vue
<main class="admin-shell-main …">
  <AdminGateSkeleton v-if="gate.state.value === 'resolving'" />
  <TxPermissionState v-else-if="gate.state.value === 'denied'" :title="t('dashboard.sections.adminGate.deniedTitle')" … />
  <slot v-else />
</main>
```

`AdminNav` 已对非管理员返回空菜单，不改。

## 5. 审计页试点

- 动作标签表、动作到摘要的格式化移入 `utils/admin-audits.ts`：`buildAuditActionLabels(t)`、`summarizeAudit(entry, t, format)`（返回 `{ text, chips: { key, value }[] }`）。已有 5 个专门格式化（`audits.vue:182-206`）原样迁入；其余动作取 metadata 前 3 个标量键值，值超长截断。
- 列宽（1280px 视口下 main 约 976px）：时间 148、管理员 220、动作 150、目标 220、摘要自适应；`white-space: nowrap` + 省略，完整内容在 `title` 与详情抽屉。
- 详情抽屉：`TxDrawer` 宽 520；`TxDescriptions columns=1`；metadata 用 `<pre>` + `JSON.stringify(meta, null, 2)`，等宽字体、可复制。
- URL：`?q=&action=&targetType=&adminUserId=&page=&limit=`；`targetType` / `adminUserId` 以筛选标签（`TxTag` 可关闭）显示在筛选栏内。
- 导出：沿用 `window.open('/api/admin/audits/export?…')`，参数取自 `useAdminList` 当前筛选。

## 6. 测试

- `composables/useAdminList.test.ts`：URL 初始化与回写（只写非默认值、保留无关键）、筛选回第 1 页、防抖、代次防竞态、失败清空、`loading` 与 `refreshing` 区分。
- `composables/useAdminFormat.test.ts`：两种 locale 下的输出、空值与非法值返回 `—`。
- `composables/useAdminGate.test.ts`：三态转换、`denied` 只导航一次、未挂载为 `resolving`。
- `utils/admin-request-error.test.ts`：不泄露 `[GET] "/api/…"`。
- `components/admin/*.test.ts`：`AdminTable` 的骨架 / 错误 / 两种空态 / 分页；`AdminConfirmDialog` 的确认文本与 loading 锁定；`AdminIdentity` 的去重与首字母。
- `pages/admin/audits-page-behavior.test.ts`：改为测 `utils/admin-audits.ts` 与 `useAdminList` 对审计接口的组装，保留 PRD R9 列出的全部行为断言。

## 7. 兼容与回滚

- 未迁移的页面仍有自己的 watch 闸门，与布局闸门目标一致，重复跳转被 `replace` 合并，不产生副作用。
- 组合件全部新增；`AdminPageShell` 只加插槽。回滚 = revert 本 PR。

## 8. 定型 API（实现与复核后，2026-10-03；后续子任务以此为准）

与 §2–§3 的差异及原因：

- `useAdminGate(): { state: 'resolving' | 'allowed' | 'denied' | 'error', retrying, retry() }`；纯函数 `resolveAdminGateState({ mounted, status, hasUser, isAdmin, profileFailed })`。调用 `useAuthUser({ server: false })`，但**已有账号时不把 `pending` 视为 resolving**——否则每次后台重拉资料都会卸载重挂页面。新增 `error` 态（已登录、资料请求失败且无请求在跑）：布局渲染 `TxErrorState` + 重试（复用 `useAuthUser().refresh`）。闸门处于 resolving / error 时在挂载与路由变化后调用 `nuxtApp._route.sync?.()`：`app.vue` 的 `isProtectedRoute` 读 Nuxt 延迟路由，它只在 NuxtPage 的 Suspense resolve 时同步，而闸门扣住 NuxtPage 会让从公开页客户端进入后台时死锁（`_route` 为 Nuxt `@internal`，已用可选链兜底）。
- `useAdminList` 选项增加 `errorFallback`；返回增加 `pageSizes`、`appliedFilters`；`page` / `limit` 只读（改用 `setPage` / `setLimit`）；`setPage` 拒绝越界，响应发现越界时退到末页。搜索防抖在 `useAdminList` 内做，不用 `TxSearchInput` 自带的。
  - 已登记扩展（2026-10-03，`10-02-nexus-admin-migrate-content`）：选项增加可选 `queryKeyPrefix?: string`。设置后 URL 键为 `${prefix}page`、`${prefix}limit`、`${prefix}<filter>`（如评论管理的 `p_page` / `d_path`），两个同路由列表的筛选与页码互不覆盖、切标签保留；不设置时键名与行为完全不变。传给 `fetch` 的 `filters` 仍是不带前缀的原键。
- `useAdminFormat` 已登记扩展（2026-10-03，`10-02-nexus-admin-migrate-content`）：增加 `tableDate(v)`，输出 `YYYY-MM-DD`（本地时区，即 `tableDateTime` 的日期部分），空值 / 非法值返回 `—`。给取值是「某一天」的列用：更新与要闻的手动条目存为 `T00:00:00Z`，`tableDateTime` 只会显示时区偏移（UTC+8 下恒为 08:00）。完整时间仍走 `dateTimeTitle`（单元格 `title` 与详情抽屉）。纯新增，其余函数不变。
  - 同日追加：`tableDate(v, options?)` 与 `date(v, options?)` 接受可选 `{ timeZone: 'UTC' }`，按 UTC 日历字段取日期。用于「存成 UTC 零点的日期」：手动要闻在 UTC 以西读本地会早一天（`2026-09-26T00:00:00Z` 在洛杉矶是 9 月 25 日 17:00；本机即 `America/Los_Angeles`，ego 实测复现）。更新页由 `utils/admin-updates.ts` 的 `isCalendarDayTimestamp`（恰为 UTC 零点）与 `updateDateLabels` 决定：日历日期列和详情都按 UTC 只显示日期；同步来的发布条目是真实时刻，仍按本地显示，提示里带完整时间。不传参时行为不变。
- `useAdminRouteSkeleton`（R1b）：`router.beforeEach` 在「路径变化且目标页用 admin 布局」时启动，150ms 延迟、至少显示 400ms；下一页 `AdminPageShell` 挂载（inject 通知）、`page:transition:finish`、导航失败 / 中止 / `onError`、10s 兜底任一即收起；**不用 `page:finish`**（Suspense resolve 时触发，`out-in` 新页尚未插入）。骨架期间页面容器 `height:0; overflow:hidden; visibility:hidden` + `inert`，`<main aria-busy="true">`；服务端不注册。
- `AdminTable`：增加 `tableLayout`、`skeletonRows` props 与 `clear-filters` emit；「共 N 条」在 footer（隐藏页码时也显示）；只有一页但更小的每页条数会分页时仍显示分页器。
- `AdminConfirmDialog` 基于 `TxModal`（`TxBottomDialog` 没有放输入框的内容插槽）；loading 时 Esc / 遮罩 / 关闭按钮都无效。
- `AdminIdentity` 增加 `fallback`；`compact` 为单行 20px 头像、邮箱进 `title`，行高与骨架行一致。
- `AdminFilterField` 增加 `wide`；label 永不包住控件（避免 `TxSelect` 被 label 转发点击开合，见 `tuffex-docs-sync.md`），未传 `for` 时挂载后为控件补 `aria-labelledby`。
- 已登记扩展（2026-10-03，用户与订阅迁移 `10-02-nexus-admin-migrate-accounts`，向后兼容）：新增 `AdminFormField`，抽屉 / 弹层表单的带标签字段。`AdminFilterField` 是筛选栏横排里的 flex 项（`flex: 1 1 200px`），放进纵向 flex 会被读成 200px 高，表单不再借用它。
  - Props：`label: string`、`for?: string`（控件 id，生成 `<label for>`）、`hint?: string`（显示在控件下方，经 `aria-describedby` 关联到控件）、`invalid?: boolean = false`（提示转 `--tx-color-danger`，控件得到 `aria-invalid="true"`）。默认插槽作用域 `{ labelId, hintId }`（`hintId` 无提示时为 `null`），只给字段找不到的自定义控件用。
  - 版式：块级、宽度 100%，列数由表单决定；标签 13px / 500 / `regular` 墨色，标签 → 控件 → 提示间距 6px，提示 12px / `regular` 墨色。
  - 字段自己写控件的 `aria-labelledby`（未传 `for` 时，且控件尚无名称）、`aria-describedby`（只增删自己的提示 id，保留其它 id）与 `aria-invalid`（只清除自己写过的），挂载后与每次重渲染后同步；页面不要再在控件上绑这三个属性（一个属性一个写入方）。控件 = `for` 指向的元素，否则字段内第一个 combobox / input / select / textarea。
  - 实现：查找与同步规则是 `utils/admin-kit.ts` 的纯函数（`findAdminFieldControl`、`syncAdminFieldControl`），生命周期在 `composables/useAdminFieldControl.ts`；`AdminFilterField` 改用同一实现，props、插槽与行为不变。
- `AdminStatGrid` 增加 `skeletonCount`；`loading` 只用于首屏，刷新保留卡片。
- 组件测试不引入 `@vue/test-utils` / jsdom（Nexus 未装，加依赖要改 lockfile）：用 `test/helpers/sfc-component.ts` 编译 SFC 后以 `vue/server-renderer` 断言标记，交互规则放进 `utils/admin-kit.ts` 纯函数单测。
- 审计摘要（验收中修正）：专门格式化一侧缺值用「—」补位，两侧都缺回退到通用字段摘要。
