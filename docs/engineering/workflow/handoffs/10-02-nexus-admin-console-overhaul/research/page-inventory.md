# Research: Nexus 后台页面清单（统一骨架 + 逐页迁移前的现状盘点）

- **Query**: 盘点 `/admin/*` 外壳、全部页面及其外部依赖组件：数据加载、AdminPageShell 用法、管理员闸门、格式化与 locale、表格/筛选/分页/抽屉、加载/空/错/无权态、i18n、代码可见的视觉缺陷、钉住现结构的测试；汇总重复模式、TuffEx 覆盖、巨型页拆分边界、约束本次重构的 spec。
- **Scope**: internal，只读（grep/sed/awk/git）；**未运行**任何 vitest / 构建 / dev server。
- **Date**: 2026-10-02
- **Base**: 分支 `stage`；`apps/nexus/app/{pages/admin,components/admin,components/dashboard,layouts/admin.vue}`、`apps/nexus/i18n`、`apps/nexus/test/guards` 在 `git status --short` 下均无未提交改动。下文行号均对应当前 HEAD。

---

## 0. 速览

- `pages/admin/` 共 15 个 `.vue`：12 个壳内渲染页、1 个独立应急页（`emergency.vue`，`layout: false`）、2 个重定向壳（`codes.vue`、`credits.vue`）。13 个渲染页（含应急页）**全部**套了 `AdminPageShell`，但壳只有 `title` + `#actions` / `#filters` / 默认插槽（`components/admin/AdminPageShell.vue:1-23`），表格、筛选栏、分页、状态、格式化全部各页自写。
- 数据加载有 4 种写法并存：`onMounted + requestJson`、`onMounted + ofetch rawFetch`、非 await `useAsyncData`（composable）、**顶层 `await useAsyncData` ×10**（`governance.vue:178-819`）。
- 管理员闸门：`watch(isAdmin, …navigateTo('/dashboard/overview'))` 共 **8 份**（7 页 + 1 composable），另有 3 页完全无闸门、3 处页内"仅管理员"提示。
- 日期/数字格式化 **13 套**、4 种 locale 策略（写死 `en-US`、跟随 i18n locale、`zh→zh-CN/else en-US` 映射、浏览器默认）。
- i18n：`governance.vue` 的 332 个 `dashboard.governance.*` 键在两种语言里都**不存在**（守卫里整块豁免、封顶 332）；`risk.vue`/`emergency.vue` 近乎全英文；`updates.vue` 37 处 `isZh ? '中' : 'en'` 内联文案。
- 重构的最大阻力是测试：3 个测试把页面 `<script setup>` 源码剥掉 import 后用 esbuild 现编执行（analytics / audits / governance.runtime），1 个测试钉 ~186 条 governance.vue 源码字面量，i18n 守卫的 governance 豁免**按文件路径**生效——拆文件即失效。

---

## 1. 外壳与共享组件

| 文件 | 行数 (script/template/style) | 作用与关键事实 |
|---|---|---|
| `app/layouts/admin.vue` | 88 (–/1-11/13-88) | `h-screen`，滚动在 `<main>`（`:6`，`px-4 py-4 lg:px-8`），**无 max-width**（注释 `:19-22`）；把壳内 `.apple-card(-lg)` 改为 22px 圆角、去边框（`:71-82`）；把**所有** `.tx-button` 改成 999px 胶囊（`:85-87`）；头部压到 44px（`:55-65`）。 |
| `app/components/admin/AdminNav.vue` | 401 (1-275/277-315/317-401) | `sectionPaths`（`:33-46`）；五组 rail（`:82-188`，analytics / content / accounts / intelligence / operations）；`risk` 受 `runtimeConfig.public.riskControl.enabled` 控制（`:175-185`）；`activeSection` if 链（`:227-260`），未知路径回落 `updates`（`:255-259`）；`useHead` 用 rail 文案定标签页标题（`:272-274`）；`emergency` 不在 rail 中；宽度 `lg:w-56 xl:w-60`（`:280`）；`<ul role="listbox">` + `<NuxtLink role="option">`（`:296-303`）；`aria-label="Admin console sections"` 写死英文（`:289`）。注释 `:29-31` 称 routing 测试会"对照 app/pages/admin/ 文件"——实际测试并不读目录（见 §8）。 |
| `app/components/admin/AdminPageShell.vue` | 61 (1-5/7-24/26-61) | props 仅 `title: string`；`<h1>` 20px/600（`:42-48`）；`#actions` 右侧换行（`:50-55`）；`#filters`、默认插槽只有 `min-width:0`。无 subtitle / loading / 状态 / 宽度约束。 |
| `app/components/admin/PluginReviewsPanel.vue` | 237 (1-141/143-237) | `/admin/reviews?tab=plugins` 的面板；`rawFetch`；offset 分页 + `TxPagination`；请求代次防竞态（`:51,65`）。 |
| `app/components/admin/DocCommentsPanel.vue` | 331 (1-215/217-331) | `?tab=docs` 面板；`requestJson`；路径筛选 250ms 防抖（`:189-207`）；`TxBottomDialog` 删除确认（`:321-330`）；带 `useDocEngagementTracker`（`:52-61`，上报 `/api/docs/engagement`）。组件有两个根节点。 |

**外部依赖（被 admin 页面引用的非 admin 目录文件）**

| 文件 | 行数 | 被谁用 | 备注 |
|---|---|---|---|
| `components/dashboard/intelligence/IntelligenceAuditsPanel.vue` | 221 (1-99/101-221) | `intelligence-audits.vue` | `rawFetch`；卡片列表而非表格；只有 spinner。 |
| `components/dashboard/intelligence/IntelligenceOverviewPanel.vue` | 553 (1-267/269-553) | `intelligence-overview.vue` | 4 个独立 `rawFetch` 分区；IP 封禁需手填 step-up token。 |
| `components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue` | 2207 (1-503/505-2196/2198-2207) | `provider-registry.vue` | 逻辑在 `composables/useProviderRegistryAdmin.ts`（1186 行）+ `composables/provider-registry/*-service.ts`；1 个 TxTabs（4 个 tab）、5 个 TxDataTable、3 个原生 `<table>`、3 个 TxDrawer。 |
| `components/dashboard/UpdateFormDrawer.vue` | 318 (1-180/182-318) | `updates.vue` | 用 `components/ui/Drawer.vue`（TxDrawer 的本地包装，默认 60% 宽）而非直接 TxDrawer；POST / PATCH `/api/dashboard/updates(/:id)`（`:164-169`）。 |
| `composables/useAdminAnalyticsData.ts` | 212 | `analytics.vue` | 7 组 `{data, loading, error}`；`errorMessage` 回落 `cause.message`（`:20-29`），兜底文案英文写死（如 `:63`）。 |
| `utils/admin-analytics.ts` | 59 | `analytics.vue` | `formatAnalyticsNumber` K/M（`:1-7`）、`formatAnalyticsDateTime(value, locale)`（`:31-36`）、`formatAnalyticsDuration` "Xm Ys"（`:51-59`）。 |
| `utils/admin-governance.ts` | 537 | `governance.vue` | `createGovernanceFormatters(tt, locale)`；`formatNumber` 用无 locale 的 `Intl.NumberFormat()`（`:35-37`）；星期写死英文（`:89-94`）；日期 `toLocaleString(locale())`（`:96-112`）。代码风格是双引号 + 分号（与仓库其余文件不同）。 |
| `types/admin-analytics.ts` / `types/admin-governance.ts` | 205 / 1674 | 同上 | governance 类型被 `governance.test.ts` 钉字面量（§8）。 |
| `composables/useDashboardData.ts` | — | images / updates | `useDashboardUpdatesData()` = 非 lazy `useAsyncData('dashboard-updates')`（`:111-121`，SSR 可取）；`useDashboardImagesData({lazy})`（`:137-148`）。 |
| `composables/useStoreFormatters.ts` | 39 | PluginReviewsPanel | `localeTag = zh ? 'zh-CN' : 'en-US'`（`:6-8`）。 |
| `components/ui/Input.vue` | 64 | `auth/admin-bootstrap.vue:5` | 本地输入框，非 TuffInput。 |

**不在后台路由里的"相关"组件**：`components/dashboard/PluginDetailDrawer.vue`(1963)、`ReviewModalOverlay.vue`(292)、`PluginMetadataOverlay.vue`(379)、`DashboardAssetIcon.vue` 只被 `pages/dashboard/assets.vue` 引用；`DashboardMetricChart.client.vue`(268) 只被 PluginDetailDrawer 引用。插件包/版本的**待审队列**目前在 `pages/dashboard/assets.vue` 的 admin-only 视图（`:354-372`、`:401-423`、`:1204`），不在 `/admin/*`。`PendingReviewSection.vue`(138)、`PluginListItem.vue`(130) 全仓无引用。

---

## 2. 逐页总表

### 2.1 结构与数据

| 页面 | 行数 s/t/st | 加载方式 | 接口（method+path 数） | SSR / ClientOnly |
|---|---|---|---|---|
| `analytics.vue` | 2269 = 651/1617/0 | `onMounted` + composable(`requestJson`) 按 `?section=` 懒加载（`:524-548`、`:576-587`） | 7 API 路径 + 1 静态 GeoJSON：`/api/admin/analytics?days=`、`/geo`、`/versions`、`/docs`、`/intelligence`、`/api/telemetry/messages?limit=12`、`/api/admin/exchange/history`（history/snapshots 两视图）、`/geo/world-countries.geo.json`（`$fetch`，`:631-642`） | SSR 出外壳；天数下拉与版本下拉包 `ClientOnly`（`:656-667`、`:1638-1653`） |
| `audits.vue` | 398 = 285/112/0 | `onMounted` + `requestJson`（`:282-284`） | 2：GET `/api/admin/audits`；导出 `window.open('/api/admin/audits/export?…')`（`:244-263`） | SSR 首帧即渲染空态（§5） |
| `codes.vue` | 31 | `watch(user)` → `navigateTo('/admin/subscriptions', {replace})` | 0 | 重定向壳；被守卫列为已知孤儿（§8） |
| `credits.vue` | 11 | `definePageMeta({ redirect: '/admin/users' })` | 0 | 重定向壳 |
| `emergency.vue` | 611 = 437/173/0 | 纯用户触发 `requestJson` | 4 POST：`/api/admin/emergency/{init,verify,issue}`、`/api/admin/risk/actor.unblock`（Bearer 应急 token） | `layout: false`、**无 `requiresAuth`**、无 `defineI18nRoute(false)`（`:7-9`）；路由受 feature-gate 中间件控制 |
| `governance.vue` | 4049 = 1240/2808/0 (+`governance.css` 38) | **顶层 `await useAsyncData` ×10，均 `server:false`**（`:178,203,212,287,654,669,689,701,713,809`） | 17：10 GET（`/api/dashboard/governance/{summary,configs,d1-readiness,analytics,report}`、`/api/dashboard/storage/{policies,credentials,channels/analytics}`、`/api/dashboard/notifications/{credentials,channels}`）+ 6 POST（configs、storage/credentials、notifications/credentials、notifications/channels/test、storage/alerts/notify、storage/channels/smoke）+ Markdown 导出 `window.open`（`:1230-1238`） | 无 ClientOnly；无 `pageTransition`（`:21-24`） |
| `images.vue` | 273 = 135/137/0 | lazy `useAsyncData` + `watchEffect(isAdmin → execute)`（`:28-38`） | 3：GET `/api/images/list`、POST `/api/images/upload`、DELETE `/api/images/:key` | — |
| `intelligence-audits.vue` | 34 | 页面无逻辑；面板 `onMounted` + `rawFetch` | 1：GET `/api/dashboard/intelligence/audits`（page/limit/userId） | `ClientOnly` + `LazyDashboardIntelligenceAuditsPanel`，fallback 手写 `animate-pulse` 块（`:25-32`） |
| `intelligence-overview.vue` | 39 | 同上 | 6：GET overview、GET usage、GET/POST ip-bans、PATCH/DELETE ip-bans/:id | `ClientOnly`，fallback 手写 pulse 4+3 块（`:25-37`） |
| `provider-registry.vue` | 32 | 面板 → `useProviderRegistryAdmin` `onMounted`（`:1069`） | 21（providers CRUD、credentials、check、models、quota GET/POST、capabilities ×3、seed、scenes CRUD + run、usage、health） | `ClientOnly` + `LazyDashboardProviderRegistryAdminPanel`，fallback 手写 pulse（`:20-30`） |
| `reviews.vue` | 74 | TxTabs 只渲染当前 tab（`TxTabs.vue:720-740`），切 tab 即重挂、重拉 | plugins 2（GET `/api/admin/store/reviews/pending`、PATCH `…/:id/status`）；docs 2（GET/DELETE `/api/admin/doc-comments`）+ 埋点 | — |
| `risk.vue` | 591 = 359/231/0 | 纯用户触发 `requestJson` | 4 POST：`/api/admin/risk/{mode.override,actor.unblock,case.review,dual-control/confirm}` | — |
| `subscriptions.vue` | 380 = 261/118/0 | `onMounted` + `rawFetch`，代次防竞态（`:76,108`） | 3：GET `/api/admin/codes`、POST `/codes/generate`、PATCH `/codes/:id` | SSR 首帧渲染空态 |
| `updates.vue` | 913 = 384/300/227 | 非 await `useAsyncData('dashboard-updates')`（SSR 取数）；全量取回后**前端**筛选 + 分页 | 4：GET `/api/dashboard/updates`、DELETE `/:id`（`$fetch` + `method: 'DELETE' as unknown as 'PATCH'`，`:364-366`）、抽屉 POST/PATCH | — |
| `users.vue` | 926 = 520/405/0 | `onMounted` + `rawFetch` | 9：GET `/api/admin/users`、PATCH `users/:id/{profile,role,status}`、GET `users/:id/subscription`、POST `/api/admin/subscriptions/grant`、GET/PATCH `users/:id/credits`、POST `users/:id/deletion` | SSR 首帧渲染空态 |
| `auth/admin-bootstrap.vue` | 227 = 124/45/56 | 顶层 `await useTypedFetch`(=`useFetch`) `/api/admin-bootstrap/status`（`:34-41`） | 2：GET status、POST promote | `layout: false` + `AuthVisualShell` |

### 2.2 UI 结构

| 页面 | Shell：title / #actions / #filters | 闸门 | 列表与分页 | 加载 / 空 / 错 | i18n |
|---|---|---|---|---|---|
| analytics | `activeSectionLabel`（当前面板名，非"统计分析"）/ 天数 TxSelect / 无；正文首行 TxFlatRadio 面板条（`:679-693`） | watch 闸门 `:40-46` | 2 张原生 `<table>`（`:939-980`、`:1040-1108`）+ 大量 div 列表；无分页 | 总 loading 用 TxCard+TxSkeleton（`:695-711`）；总 error TxEmptyState + 独立重试按钮（`:713-724`）；子面板只有 TxSpinner / TxEmptyState，无重试 | 213 处 `t()`；动态键 `sections.${id}`（`:134,146`） |
| audits | 写死 key `sections.audits.title`("审计日志") / Refresh + Export CSV / 卡片包裹的搜索 + 动作下拉（`:297-322`） | `:28-34` | TxDataTable 5 列（`:110-116`）+ 自写 Prev/Next（`:388-395`），page/limit=20，无总数 | spinner **和** 骨架行同时出现（`:335-348`）；空（`:352-354`）；错为红条（`:324-326`） | 43 处 `t()`；时间写死 `en-US`（`:160`、`:219`） |
| emergency | "Admin Emergency Console"（写死）/ 无 / 无；外包写死暗色 `bg-[#0f1318]` + 行内 `--tx-text-color-primary:#fff`（`:440-442`） | 无（设计如此） | — | 单行状态条（`:595-607`） | 0 处 `t()`，全英文 |
| governance | `tt(menu.governance)` / Refresh all / 无 | `:48-54` + 页内 adminOnly（`:1251-1253`） | 全部 div 列表，无表格、无分页 | **0 个骨架**；pending 时渲染 `default:` 零值；13 个错误合并成一条红条，显示原始 `.message`（`:1255-1257`） | 12 `t()` + 358 `tt()`（§6） |
| images | `images.title` / 无 / 无 | 无跳转；页内 adminOnly（`:141-145`） | 3 列卡片网格（`:219-256`），无分页（全量） | spinner + 2 块 TxSkeleton（`:196-210`）；空（`:212-217`）；**列表加载失败无错误分支**（未解构 `error`，`:28-33`） | 20 `t()`；上传/删除失败共用一个键（守卫豁免） |
| intelligence-audits | `intelligence.tabs.audits`（zh "审计日志"）/ 无 / 无 | 无 | 卡片列表 + `TxPagination`（仅 total>pageSize 时） | spinner；错误红条；空态有 `!auditError` 防伪空（`:210-214`） | 1 + 面板 18 |
| intelligence-overview | `intelligence.tabs.overview`（"概览"）/ 无 / 无；面板内另有 h2 + 副标题（`IntelligenceOverviewPanel.vue:274-279`） | 无 | 4+4 手写指标格、3 个 Top 列表、IP 封禁列表 | spinner；错误红条 | 1 + 面板 45；step-up 占位符英文（`:480`） |
| provider-registry | `providerRegistry.title` / 无（Refresh 在面板内 `:507-512`）/ 无 | composable `useProviderRegistryAdmin.ts:100-104` + 面板 adminOnly（`:514-516`） | TxTabs 4 页 × TxDataTable（含 `sortable`、`fixed`）；无分页 | 5 张统计卡有 TxSkeleton（`:527-539`），其余靠 TxDataTable `loading` 遮罩 | 1 + 面板 257 |
| reviews | `comments.title` / 无 / 无；TxTabs（`:52-72`） | `:44-47` | 两面板各一 TxDataTable + `TxPagination`（offset 分页） | spinner + 骨架行；红条；空 | 3 + 20 + 23 |
| risk | `menu.risk` / NuxtLink 新标签打开应急页（`:364-371`，非 TxButton）/ 无 | `:23-27` | 4 张表单卡（`:392-520`） | 无数据加载；结果卡（`:522-565`） | 1 处 `t()`，其余全英文 |
| subscriptions | `codes.title`（"激活码"）/ Add / 裸网格筛选 3 项（`:271-291`） | `:24-27` | TxDataTable 8 列 + `TxPagination`，page/limit=20 | `TxRowSkeleton`（`:298-300`）；错误 TxEmptyState + Retry（`:301`）；空（`:302`） | 47 `t()` |
| updates | `updates.title` / Changelog + Add / 卡片筛选 6 项 + Clear（`:403-491`） | 无（只隐藏按钮 `:398,622,632`） | TxDataTable 7 列 `min-w-[920px]` + 前端分页 **5 条/页**（`:70`、`:646-663`） | spinner + 2 块骨架（`:494-504`）；错误 TxEmptyState + 重试（`:510-519`）；空 / 筛选空（`:521-533`） | 27 `t()` + 37 处 `isZh` 三元 |
| users | `menu.users` / Refresh / 裸网格筛选 3 项（`:530-549`） | `:26-29` | TxDataTable 4 列 + 自写 Prev/Next（`:615-625`）；抽屉内账本 `TxPagination` | `TxRowSkeleton`（`:555-557`）；错误 TxEmptyState + Retry（`:558`）；空（`:559`） | 115 `t()` |
| admin-bootstrap | 非后台壳（`AuthVisualShell`） | 自身即提权流程 | — | spinner + 错误条 | 13 `t()`，键齐全（en/zh 各 13） |

---

## 3. 管理员闸门：所有副本

| # | 位置 | 形态 |
|---|---|---|
| 1-7 | `audits.vue:28-34`、`users.vue:26-29`、`subscriptions.vue:24-27`、`analytics.vue:40-46`、`governance.vue:48-54`、`risk.vue:23-27`、`reviews.vue:44-47` | `watch(isAdmin, a => { if (user.value && !a) navigateTo('/dashboard/overview') }, { immediate: true })` |
| 8 | `composables/useProviderRegistryAdmin.ts:98-104` | 同上（provider-registry 经面板生效） |
| 变体 | `codes.vue:15-26` | `watch(user)` + `isAdminAccountRole` + `replace` 双向跳转 |
| 页内提示 | `images.vue:141-145`、`governance.vue:1251-1253`、`ProviderRegistryAdminPanel.vue:514-516` | `v-if="!isAdmin"` 黄/灰提示块 |
| 无闸门 | `updates.vue`、`intelligence-overview.vue`、`intelligence-audits.vue`（API 侧 `requireAdmin` 会 403） | — |

其它全局门：`app.vue:504-537`（`requiresAuth` 路由在未登录/加载中渲染 `LazyAuthGateState`）；`middleware/feature-gates.global.ts:13-22`（风控关闭时 `/admin/risk*`→`/admin/updates`，`/admin/emergency*`→`/`）。`AdminNav` 对非管理员返回空菜单（`:83-84`）。入口：`HeaderUserMenu.vue:260` 链接 `/admin/updates`；没有 `/admin` 索引页（落到 `pages/[...all].vue`）。

---

## 4. 格式化函数与 locale

| 位置 | 函数 | locale 来源 |
|---|---|---|
| `audits.vue:159-164` / `:218-224` | `formatTime` / `formatDate` | **写死 `'en-US'`** |
| `users.vue:257-262` / `:264-269` / `:271-275` | `formatDate` / `formatDateTime` / `formatNumber` | `locale.value`（`zh`/`en` 原值） |
| `subscriptions.vue:218-223` | `formatDate` | `locale.value` |
| `updates.vue:65-66`、`:254-261` | `localeTag`+`dateFormatter`+`formatDate` | `zh→zh-CN / else en-US` |
| `composables/useStoreFormatters.ts:6-20` | `formatDate`（PluginReviewsPanel 用） | `zh→zh-CN / else en-US` |
| `DocCommentsPanel.vue:166-171` | `formatTime` | `Intl.DateTimeFormat(undefined)` = 浏览器 |
| `IntelligenceAuditsPanel.vue:69-78`、`IntelligenceOverviewPanel.vue:250-259` | `formatAuditTime`（两份同名） | `toLocaleString()` = 浏览器 |
| `utils/provider-registry-admin.ts:1223-1226` | `formatDate` | `toLocaleString()` = 浏览器 |
| `utils/admin-governance.ts:35-37,96-112,89-94` | `formatNumber` / `formatDate` / `formatShortDate` / 星期 | 数字=浏览器；日期=`locale()`；星期=写死英文 |
| `utils/admin-analytics.ts:1-7,31-36,51-59` | 数字 K/M、日期时间、时长 | 数字无 locale；日期=传入 locale |
| `analytics.vue:437-439` | `formatCompactDate` = `slice(0,10)` | 无 |
| `emergency.vue:63-67` | `formatCountdown` | 无 |
| `IntelligenceOverviewPanel.vue:302,318` | 指标直接插值（无千分位） | — |

---

## 5. 加载 / 空 / 错 / 无权态（对照"骨架默认 + 贴合版式"）

- **骨架是否贴合版式**：audits / PluginReviews / DocComments 用 grid 列宽模拟表格行，但外加一行 spinner 文本、无表头、行 `p-4` 与表格单元 `10px 12px` 不同（`audits.vue:335-348`、`PluginReviewsPanel.vue:164-172`、`DocCommentsPanel.vue:246-254`）；users / subscriptions 用设置行骨架 `TxRowSkeleton` 代替多列表格（`users.vue:555-557`、`subscriptions.vue:298-300`）；updates、images 是 spinner + 2 块通用骨架（`updates.vue:494-504`、`images.vue:196-210`）；analytics 只有 overview 的 4 张 KPI 骨架贴版，其余面板一张 6 行卡（`:695-711`）；3 个 ClientOnly 包装页的 fallback 是手写 `animate-pulse` div（违反 `component-guidelines.md:332`）；governance 0 骨架。全后台 **0 处** `useDeferredLoading`（spec 要求，`component-guidelines.md:337`）。
- **刷新时整页换骨架**：`analytics.vue:695` 的 `v-if="loading"` 在改天数/重试时把全部内容换成骨架；`updates.vue:494`、`images.vue:197` 用 `pending` 判断，保存/上传后的 refresh 同样闪回加载态（`component-guidelines.md:316` 明确禁止）。
- **SSR / 首帧伪空态**：`loading` 初值 false，`onMounted` 才开始拉，首帧落进空分支——audits "No audit records found"（`:352`）、users / subscriptions 的 TxEmptyState（`users.vue:559`、`subscriptions.vue:302`）、PluginReviews / DocComments 空文案。
- **独立面板被总请求绑架**：analytics 的 intelligence / docs / messages / exchange 面板数据独立，却都包在 `<section v-else-if="analytics">`（`:726-2266`）里，总请求加载或失败时一起不可见。
- **错误文案泄露 API 路径**（ofetch `err.message` 形如 `[GET] "/api/…"`）：`governance.vue:1255-1257`、`:1047`；`PluginReviewsPanel.vue:92-94,132`；`DocCommentsPanel.vue:96-98,154`；`images.vue:71,99,125`；`IntelligenceOverviewPanel.vue:131`；`useAdminAnalyticsData.ts:25-26`。只有 audits 有对应测试守住（§8）。
- **有重试**：users、subscriptions、updates、analytics 总错误；**无重试**：analytics 子面板（`:1251-1257`、`:1479-1485`、`:1660-1665`、`:1772-1778`）、governance、audits（靠顶栏 Refresh）、两个评论面板、两个 intelligence 面板。
- **伪空（失败当空）**：images 列表失败 → "No resources uploaded yet"（未解构 `error`）。
- **无权态**：无统一组件（TuffEx 有 `TxPermissionState` 未用）。

---

## 6. i18n 现状

- 文案实际位置：后台全部 `dashboard.*` 键在 `i18n/locales/route/{en,zh}/dashboard.ts`（en 2700 行 / zh 2696 行），由 `utils/route-locale-chunks.ts:44-54` 为 `/admin/*` 懒合并；`common.*`、`auth.*` 在 `i18n/locales/{en,zh}.ts`。（`apps/nexus/AGENTS.md:15` 只写了后两者。）
- `t('dashboard.*')` 字面量键：由 `test/guards/i18n-key-existence.test.ts` 与 `utils/dashboard-admin-i18n-coverage.test.ts` 双重守卫，en/zh 齐全（本次未运行，结论来自守卫本身）。动态键 `analytics.vue:134,146`（7 个 section id 两语齐全，已人工核对 en:1657-1667 / zh:1653-1663）、`IntelligenceAuditsPanel.vue:66`（带回落）。
- **缺失**：`governance.vue` 用 `const tt = (key, fallback) => te(key) ? t(key) : fallback`（`:29`）调用 358 次，332 个 `dashboard.governance.*` 键在两种语言都不存在 → 中文界面整页英文；守卫整块豁免、封顶 332（`i18n-key-existence.test.ts:325-349`）。已有的 `dashboard.sections.governance.*` 只对得上 20 个（同处注释）。
- **硬编码**：`risk.vue` 除标题外全部英文（指引表 `:76-108`、确认文案 `:238-299`、模板 `:370-588`）；`emergency.vue` 全英文；`updates.vue` 37 处 `isZh ? … : …` 内联文案（如 `:83-116`、`:170-184`、`:196-204`、`:408-486`、`:532`、`:660`）；governance 模板内联英文片段 `total / events / actors / global / ms`（`:1295,1651,1673,1866,1952,2234,2255,2297,2648,2777,3196,3224,3232,3243,3268`）及占位符 `:3489`、`:3848`；`users.vue:640` `ID:`、`:870` `tokens`；`IntelligenceOverviewPanel.vue:480`；`useAdminAnalyticsData.ts` 英文兜底。
- **同一 zh 标题**：`/admin/audits`（`sections.audits.title`= "审计日志"，zh:2128）与 `/admin/intelligence-audits`（`intelligence.tabs.audits`= "审计日志"）H1 相同；rail 文案分别是"管理操作审计"/"AI 调用审计"。
- **退役残留键（10-01 删页后无引用）**：`dashboard.intelligenceLab.*`（en:618 起整棵）、`sections.menu.{intelligence,intelligenceLab,intelligenceChat,docComments,codes,accounts,audits,releases,reviews}`、`sections.intelligence.tabs.{chat,serviceChannels}`、`sections.analytics.sections.versions`（grep 源码 0 命中，含动态键核对）。

---

## 7. 代码可见的视觉 / UX 缺陷（按影响排序）

1. **审计时间写死英文且折行**：`audits.vue:160`、`:219` 用 `'en-US'`，列宽 180（`:111`）→ "Sep 30, 2026, 8:46 PM" 换行。
2. **审计管理员列邮箱重复**：`formatAdmin` 无名字时回落邮箱（`:166-168`），下一行又无条件打印 `adminEmail`（`:369-371`）。`users.vue:208-216,567-572` 是同类：名字回落邮箱本地部分（截 12 字符）+ 下一行完整邮箱。
3. **审计详情列被挤压**：其余列固定 180/24%/180/180（`:110-116`）；1280px 视口下 main≈976px（rail 240 + 左右 32），详情列≈200px；23 个已标注动作里只有 5 个有专门格式化（`:182-206`），其余整段 `JSON.stringify(meta)`（`:211-213`）。另外服务端会写入的 `intelligence.tool.approve/reject`（`server/api/admin/intelligence-agent/tool/approve.post.ts`）没有标签，原样显示且不在筛选下拉里。
4. **表格卡顶部空带**：`audits.vue:329-333` 一整条 `p-5` 头部只放 "1 / 3"；分页只有 Prev/Next，无总数（`:388-395`）。
5. **治理页整页英文 + 零值伪数据 + 无骨架**：§5、§6；10 个顶层 await 让客户端导航期间旧页停留（会话记忆 `nexus-async-setup-blocks-skeletons`，非 spec）。
6. **治理表单无标签**：22 个 `TuffInput` 无 label、只有 2 个占位符（`:3446-3851`），全文件 0 个 `<label>`；11 个原生 JSON `<textarea class="GovernanceTextarea">`（`governance.css:14-38`）。
7. **风控 / 应急页视觉另起一套**：risk 卡片 `rounded-xl border border-black/10 bg-white dark:bg-black/10`（`:374,393,423,455,486`），与壳内 `apple-card-lg`（22px、`dark:bg-white/4.5%`）不同；应急页用原生 `<input>/<button>/<textarea>`、写死暗色。
8. **Provider Registry 被限宽**：面板根 `mx-auto max-w-6xl`（`ProviderRegistryAdminPanel.vue:506`）对抗壳的"无 max-width"（`admin.vue:19-22`），而表格 `min-w-[1470px]`（`:691`）→ 必然横向滚动；另有 `min-w-[1040px]`（`:904`）、`[940px]`（`:1099`）、`[920px]`（`:1212`）。
9. **其它表格在常见宽度下横滚**：subscriptions 列宽合计 1180px（`:94-103`，`nowrap`）> 1440px 视口下 main≈1136px；PluginReviews 列宽 780+38%（`:55-62`）、DocComments 690+42%（`:45-51`）在 1280px 视口下超过 976px。
10. **标题重复 / 二级标题**：intelligence-overview 壳标题"概览"+面板 h2"智能概览"+副标题（`IntelligenceOverviewPanel.vue:274-279`，`component-guidelines.md:72` 禁止壳内第二个页头）；analytics 的 H1 = 当前面板名，与下方面板条文字重复（`analytics.vue:654`、`:679-693`）；两个"审计日志"（§6）。
11. **卡片圆角/内边距不一**：壳把 apple-card 改成 22px（`admin.vue:71-76`），analytics 的 58 个 TxCard 用 16（23 处）/18（35 处）圆角、14/16/18/20/24 五种内边距；IntelligenceOverview 三个 Top 列表是裸 `rounded-2xl` 色块直接放在页面上（`:336-381`）；images 卡内 `p-6` 再 `mt-6`（`images.vue:139,147`）；updates 卡内 `p-5` 再 `mt-4/mt-5`（`:494,535`）。
12. **自定义 CSS 与 TuffEx 打架**：`updates.vue:867-897` `:deep()` 改 TxPagination 内部列表/marker，`:736-761` 手写 sticky 操作列（TxDataTable 原生有 `fixed:'right'`）；`admin.vue:85-87` 全局胶囊按钮；`ProviderRegistryAdminPanel.vue:2198-2206` 再覆写圆形按钮。
13. **analytics 明细抽屉手写**：`fixed inset-0 z-40` 遮罩（`:2069-2264`），无 Esc、无 `role="dialog"`、暗色写死 `#1c1c1e`；8 张分布小卡（`:1113-1243`）与抽屉内 14 段列表（`:2104-2261`）都是同一段手写模板的复制。
14. **筛选栏三种样式**：卡片包裹（`audits.vue:298`、`updates.vue:404`）、裸网格（`users.vue:531`、`subscriptions.vue:272`）、行内（`DocCommentsPanel.vue:219-240`、`analytics.vue:1447-1473`、`:1979-2001`）；标签用 `apple-section-title`（11px 大写 + `tracking-wider`，`uno.config.ts:58`）。
15. **分页组件不统一**：audits / users 手写 Prev/Next；subscriptions / 评论 / intelligence-audits / 用户账本用 TxPagination；updates 前端 5 条/页；images、governance、analytics 无分页；评论面板借用 `users.pagination.*` 键（`PluginReviewsPanel.vue:231-232`）。
16. **小问题**：PluginReviews 待审数顶部、底部各显示一次（`:146-148`、`:223-225`）；DocComments `t(…) || \`${n} total\`` 的兜底永不触发（`:307`）；`reviews.vue` 切 tab 丢失分页/筛选（TxTabs 只挂当前 tab）；风控 step-up token 用明文 `type="text"`（`risk.vue:376-382`），TuffEx 有 `TxSensitiveInput` 未用；破坏性操作确认方式 5 种（TxBottomDialog ×4、TxModal ×1、"点两次"×2、输入邮箱 ×1、**无确认** ×3：评论通过/驳回 `PluginReviewsPanel.vue:116-138`、IP 封禁删除/停用 `IntelligenceOverviewPanel.vue:197-248`、governance 的 send/write 动作）。
17. **暗色**：除 risk 卡片底色族不同、analytics 抽屉写死色值外，未见缺 `dark:` 的亮色类（emergency 为固定暗色，属设计）。

---

## 8. 钉住现结构的测试与源码字面量契约

| 测试 | 机制 | 断言要点 | 重构会怎样破 |
|---|---|---|---|
| `app/components/admin/AdminNav.routing.test.ts`(256) | 读 AdminNav.vue `<script setup>`，删 import 行，esbuild 现编；注入 `vue{computed,onBeforeUnmount,onMounted,ref}`、`nuxt{useAccountRole,useHead,useI18n,useRoute,useRuntimeConfig}`、`isFeatureFlagEnabled`、`window`；要求顶层存在 `sectionPaths/menuGroups/menuItems/activeSection/activeLabel/riskControlEnabled`（`:44-69`） | intelligence 组 = 3 项且顺序固定、accounts 组 = [users, subscriptions]、analytics 组 = [analytics]、reviews → `/admin/reviews?tab=plugins`（`:151-168`，`toEqual`）；已删 id 不得出现（`:170-189`）；每个 href 回环（`:191-198`）；codes→subscriptions、credits→users（`:200-208`）；未知路径回落 `updates`（`:210-219`）；risk 开关真值表、非管理员空菜单、挂载前空菜单（`:226-255`） | 把菜单配置挪出 SFC、用新的自动导入组合式函数、给这三组加/删/换序项、改默认回落，均需同步改测试 |
| `app/pages/admin/analytics-page-performance.test.ts`(867) | 同法现编 analytics.vue 脚本，注入 `$fetch, defineAsyncComponent, definePageMeta, defineI18nRoute, useI18n, useAuthUser, useAccountRole, useRoute, navigateTo, requestJson` + 8 个 admin-analytics 工具；返回 45 个顶层绑定（`:249-303`、`:338-349`） | 非管理员跳 `/dashboard/overview`（`:489-498`）；7 个 section 顺序、`?section=` 用 `navigateTo({query},{replace:true})`（`:529-553`）；遗留 section 回落 overview；各取数组 loading/error 隔离；请求路径白名单（`successfulRequest` 遇未知路径抛错，`:395-412`）；地区名随 locale；docs 过滤防抖；旧响应后到不覆盖 | 拆面板 = 绑定散到子组件，测试需重写；新增 import 的工具会被剥成未定义；改共享闸门写法需注入 |
| `app/pages/admin/audits-page-behavior.test.ts`(287) | 同法现编 audits.vue，只注入 `definePageMeta, defineI18nRoute, useI18n, useAuthUser, useAccountRole, navigateTo, requestJson, hasWindow`（`:87-118`） | 错误兜底文案 `'Failed to load audit logs.'` 且不含 `/api/admin/audits`；优先 `err.data.message`；失败清空行；`actionLabels` 随 locale 变；下拉由标签表派生；`goPrev/goNext/hasPrev/hasNext` 边界；筛选回第 1 页；空筛选不发参，默认 query 恰为 `{page:1, limit:20}`（`:159-286`） | 换 TxPagination（去掉 goPrev/goNext）、改默认 limit、把格式化/取数移入未注入的模块都会红 |
| `app/pages/admin/governance.test.ts`(432) | 纯 `toContain` 源码字面量 | 约 186 条字面量钉在 governance.vue（请求字符串如 `requestJson<NotificationChannelsResponse>('/api/dashboard/notifications/channels'`、绑定名、`dashboard.governance.*` 键、`analyticsData.searches.byLocalHour` 等访问路径）、约 94 条钉 `types/admin-governance.ts`、约 32 条钉 `utils/admin-governance.ts`；脚本里每个 `const xxxError = ref(` 必须出现在模板某个 `v-if`（`:405-416`）；6 个 `scopedSaveFeedback.scope === '…'`、3 个处理器在 `try {` 前 `saveScope.value = ''`（`:418-431`） | 任何分文件、改键前缀、改访问路径都会红 |
| `app/pages/admin/governance.runtime.test.ts`(386) | `@vue/compiler-sfc` 取脚本后现编；`useAsyncData` 桩是 **async 函数**，页面必须 `await` 它；注入不含 `useLazyAsyncData`（`:63-133`、`:192-213`） | 非管理员跳转；10 个 async-data key 及**注册顺序**（`:260-289`）；`refreshAll` 刷新顺序（`:291-311`）；告警发送请求体；JSON 解析错误点名字段；saveScope 标记 | 把顶层 await 改成 lazy（为了骨架）或按分区拆取数，都要改此测试 |
| `test/guards/i18n-key-existence.test.ts`(578) | 扫描 `pages/dashboard`、`pages/admin`、`components/dashboard`、`components/admin` 的 `.vue`（`:300-307`），识别 `tt()` 这类别名 | governance 豁免**按文件** `app/pages/admin/governance.vue` + 前缀 + 封顶 332（`:339-349`）；要求该文件 `tt` 用量 > 300、未解析 > 300（`:469-489`）；`KNOWN_WRONG_KEYS` 含 images 的 `errors.unknown`（`:377-381`）并有"豁免过期即失败"（`:569-577`）；risk.vue 必须零违规（`:515-520`） | 把 governance 拆进 `components/admin/governance/*.vue`：新文件里的 332 个缺键不享受豁免 → 失败；原文件 `tt` 用量跌破 300 → 失败；修好 images 键需同步删豁免 |
| `app/utils/dashboard-admin-i18n-coverage.test.ts`(142) | `statSync` 列举 `ADMIN_SURFACE`（`:35-42`），路径不存在直接抛错（`:50`）；只认 `t(`（`:66`，看不到 `tt(`） | admin 用到的 `t('dashboard.*')` 在 en/zh 都存在；调用点 > 300、文件 > 8（`:100-101`）；`providerRegistry.*`、`sections.*` 两语结构一致（`:121-141`） | 搬动 `components/dashboard/intelligence`、`provider-registry` 目录需改清单 |
| `test/guards/admin-route-reachability.test.ts`(243) | 字符串扫描 `app/**/*.{vue,ts}` 中的链接出现 | 每个 `pages/admin/*.vue` 要被链接或是转发页；`KNOWN_ORPHANS = ['/admin/codes']` + 过期检查（`:133-140`、`:236-242`）；正控制：admin 页 > 10、链接源 > 100（`:143-155`）；`intelligence-lab` 用例在文件缺失时跳过（`:223-228`） | 删 `codes.vue` 或给它加链接要同步删豁免；合并页面后页数需仍 > 10 |
| `test/guards/sfc-size-budget.test.ts`(187) | 行数扫描 | > 3000 行的 SFC 不得带 `<style>`（`:35`）；任何 SFC ≤ 4500 行（`:45`）；governance.vue 4049 行靠 `governance.css` 过关 | 拆分只会更安全 |
| `test/guards/component-auto-import.test.ts`(291) | 推导 Nuxt 自动导入名并与 `.nuxt/components.d.ts` 对照 | 嵌套目录组件必须用带前缀名（如 `components/admin/x/Foo.vue` → `AdminXFoo`） | 新建 `components/admin/<sub>/` 组件时命名受约束 |
| `test/guards/form-submit-button.test.ts` / `page-toplevel-throw.test.ts` | 模板/脚本扫描 | `<form @submit>` 内 TxButton 须 `native-type` 或 `@click`；页面顶层不得无条件 `throw`（退役页应 `navigateTo`/`redirect`） | 新表单、退役页需遵守 |
| `app/pages/docs/docs-page-performance.test.ts` | `readFileSync` 源码字面量 | `provider-registry.vue` 含 `<ClientOnly>` 与 `<LazyDashboardProviderRegistryAdminPanel />`、不含 `import ProviderRegistryAdminPanel`（`:263-265`）；governance.vue 不引 `~/components/docs/`、`~/components/store/`（`:266-267`）；`admin-bootstrap.vue` 含 `requiresAuth: true` 与 `const { signOut } = useNexusAuth()`（`:234-235`） | 搬面板或改 provider-registry 页包装即红 |
| `app/utils/provider-registry-admin.test.ts` | 读 `ProviderRegistryAdminPanel.vue` 源码 | 钉调用表达式与**样式类**：`<table class="w-full min-w-[620px]`、`text-red-500`、`i-carbon-close`、`w-full min-w-0`（`:269-320`、`:390-444`） | 改面板视觉/拆分即红 |
| `app/composables/useProviderRegistryAdmin.test.ts` | 运行 composable | 非管理员 `navigateTo('/dashboard/overview')`（`:169-170`）+ 各 API 调用序列 | 闸门抽公共后需同步 |
| `test/middleware/feature-gates-route.test.ts` | 运行中间件 | `/admin/risk*`→`/admin/updates`、`/admin/emergency*`→`/`（`:77-118`） | 动风控/应急路由需同步 |
| `app/components/dashboard/DashboardNav.routing.test.ts` | 源码 + 运行 | DashboardNav 源码不得含 `/admin/`（`:186-191`） | 不应把后台入口加回 DashboardNav |

已在 10-01（`5e6579e05`）删除、但子任务 `09-23-nexus-admin-console-gaps/prd.md` 仍在引用的测试：`AdminNav.test.ts`、`admin-page-layout-contracts.test.ts`（原含"审计动作词表"守卫）、`reviews.test.ts`、`intelligence-chat.test.ts`。

---

## 9. 重复模式地图（统一骨架应吸收的部分）

| # | 模式 | 副本 |
|---|---|---|
| 1 | 页面元数据样板 `definePageMeta({layout:'admin', requiresAuth, pageTransition fade})` + `defineI18nRoute(false)` | `layout:'admin'` 13 页（含 codes 壳，governance 缺 pageTransition）；`defineI18nRoute(false)` 14 页（emergency 缺） |
| 2 | 管理员闸门 | 8 份 watch + 1 变体 + 3 份页内提示（§3） |
| 3 | 日期/数字格式化 | 13 套、4 种 locale 策略（§4） |
| 4 | 错误信息提取 | `resolveErrorMessage` 两份逐字相同（`users.vue:82-86`、`subscriptions.vue:48-52`）；`readStatusCode` 两份相同（`risk.vue:110-125`、`emergency.vue:143-158`）；`useAdminAnalyticsData.ts:20-29`；`audits.vue:151` 内联；面板 `e.data?.message` / `Error.message` ×6 |
| 5 | 防抖搜索 + 定时器清理 | `audits.vue:240-280`、`users.vue:503-518`、`subscriptions.vue:241-259`、`DocCommentsPanel.vue:189-212`、`analytics.vue:567-598`（TuffEx `TxSearchInput` 自带 `searchDebounce`） |
| 6 | page/limit 分页状态 + 拉取 + 越界回退 | audits、users、subscriptions、PluginReviews、DocComments、IntelligenceAudits、用户账本；updates 前端分页 |
| 7 | 请求代次防竞态 | 有：subscriptions、PluginReviews、DocComments、users 订阅抽屉；无：audits、users 列表、IntelligenceAudits、users 积分抽屉（`users.vue:415-435`） |
| 8 | 筛选栏（标签 + TuffInput + TuffSelect 网格） | audits、users、subscriptions、updates、DocComments、analytics docs/exchange |
| 9 | 加载/错误/空 三分支模板 | 10+ 处，原语各异（§5） |
| 10 | 指标卡（小号大写标签 + 大数字 + 提示） | analytics 手写 20 个（`text-2xl font-bold`）、governance 4 + 27、IntelligenceOverview 8、users 积分 3；TxStatCard 仅 analytics KPI 4 + provider registry 5 |
| 11 | 状态→色调映射 | `users.vue:218-226`、`subscriptions.vue:229-239`、`updates.vue:289-322`、analytics 内联三元、governance formatters、IntelligenceOverview 封禁徽标 |
| 12 | 破坏性确认 | 5 种写法（§7-16） |
| 13 | Refresh 按钮 | 壳 #actions（audits、users、governance）vs 面板内（评论×2、intelligence×2、provider registry、analytics 子卡）vs 无（subscriptions、images、updates） |
| 14 | 详情/编辑抽屉 | TxDrawer（users、subscriptions、provider registry×3）、`ui/Drawer`（UpdateFormDrawer）、手写遮罩（analytics） |
| 15 | 导出 | `window.open` CSV（`audits.vue:244-263`）、Markdown（`governance.vue:1230-1238`） |
| 16 | ClientOnly + Lazy 面板 + 手写 pulse fallback 包装页 | intelligence-audits、intelligence-overview、provider-registry |
| 17 | 身份单元（头像 + 名字 + 邮箱） | users（TxAvatar）、DocComments（`<img>`/首字母）、audits（无头像） |

---

## 10. TuffEx 覆盖

**已用（显式 import 计数，覆盖 pages/admin、components/admin、两个 intelligence 面板、provider registry 面板、UpdateFormDrawer、admin-bootstrap、layout）**：button 14、input 12（`TuffInput` 112 处 / `TxInput` 3 处并存）、spinner 10、select 9（`TuffSelect` / `TxSelect` 并存）、data-table 9、skeleton 8（`TxSkeleton` 14 处、`TxRowSkeleton` 2 处）、pagination 6、status-badge 5、empty-state 3、drawer 3、tabs 2、stat-card 2、dialog 2（`TxBottomDialog` 4 处）、charts 2（`TxBarChart`/`TxEChart`/`TxChoroplethMap`/`TxBubbleMap`）、tooltip / tag / switch / modal / flat-radio / file-uploader / dropdown-menu / checkbox / card / avatar 各 1。images.vue、updates.vue 部分 Tx 组件走自动导入未显式 import（`component-guidelines.md:70` 要求显式）。

**TuffEx 已有、后台未用**：`TxErrorState`、`TxPermissionState`、`TxLoadingState`、`TxNoData`、`TxBlankSlate`、`TxCardSkeleton`、`TxListItemSkeleton`、`TxLayoutSkeleton`、`useDeferredLoading`、`TxSearchInput`（`searchDebounce`）、`TxFilterChips`、`TxDatePicker`（支持区间 `[start,end]`）、`TxTextarea`、`TxCodeEditor`、`TxNumberInput`、`TxSensitiveInput`、`TxAlert`、`TxStatusHint`、`TxCardItem`（title/subtitle/avatar）、`TxTimeline`、`TxTabBar`、`TxSegmentedSlider`、`TxForm/TxFormItem`、`TxPopperDialog`/`TxBlowDialog`。TxDataTable 已支持 `selectable/selectedKeys`、`sortable`、`stickyHeader`、`expandable`、`fixed` 列、`loading` 遮罩与内置空态（`data-table/src/types.ts:43-161`、`TxDataTable.vue:426-428,536-541`），后台只在 provider registry 用了 `sortable`/`fixed`，**无任何批量选择**。

**没有对应 TuffEx 原语的需求**：页面头/工具栏（标题 + 操作 + 元信息，目前是 Nexus 本地 `AdminPageShell`）；带标签字段 + 清空的筛选栏布局；描述列表（`<dl>` 键值对，users 抽屉 `:645-702`、订阅 `:750-779`；最近的是 `group-block` 设置行族）；表格行骨架（`TxRowSkeleton` 是设置行形状，无表头/列宽版本）；TxPagination 无每页条数切换（`pagination/src/types.ts:2-19`）；"输入确认文本"类危险确认对话框；分区卡（标题 + 副标题 + 操作 + 内容）。

---

## 11. 巨型页拆分边界

### governance.vue（4049；脚本 1-1240）
共享状态：`summaryDays`（`:58`，全页无 UI 可改）、`saving/saveError/saveMessage/saveScope`（`:59-89`）、`tt` + 43 个格式化/标签函数（`:29-41`）、10 个 `useAsyncData`。

| 模板区段 | 行 | 依赖 |
|---|---|---|
| 顶栏 Refresh all | 1243-1249 | `governancePagePending`、`refreshAll` |
| 横幅（无权 / 合并错误 / 保存成功） | 1251-1261 | 13 个 error ref、`saveMessage` |
| 运营报告快照 | 1263-1388 | `governanceReport`（report）、`exportGovernanceReport` |
| 汇总 4 格 | 1390-1423 | `summaryData`、`configs` |
| D1 迁移就绪 | 1425-1511 | `d1Readiness*`（d1-readiness） |
| 分析驾驶舱（外框） | 1513-3427 | `analyticsData`（analytics） |
| ├ 运营看板 | 1528-1813 | `analyticsData.dashboard`、`dashboardOperations*` |
| ├ 6 格指标 | 1815-1905 | users/searches/plugins/uploads/notifications/providers |
| ├ 访问热点 / 搜索上下文 | 1907-1956 / 1957-2285 | `.visits` / `.searches` + `searchTimeHeatmap*` |
| ├ 插件榜 / 上传 / 存储 | 2286-2308 / 2309-2588 / 2589-2825 | `.plugins` / `.uploads` / `.storage` + `storagePolicyAlerts` |
| ├ 通知投递 / 原因 / 提供方健康 / 浏览器推送 | 2826-2995 / 2996-3018 / 3019-3053 / 3054-3098 | `.notifications` |
| └ Provider 配额 | 3099-3426 | `.providers` + `providerQuota*` |
| 左栏表单：采集 / 通知测试 / 存储策略 / 存储凭据 / 通知渠道 / 通知凭据 / Provider 配额 | 3431 / 3459 / 3549 / 3696 / 3736 / 3792 / 3832（止于 3861） | `saveConfig`；`testNotificationChannel` + `notificationConfigs`；`storageProfiles` + `selectedStorageChannelAnalytics`（storage-channel-analytics，随表单 watch）；`saveStorageCredential`；`notificationProfiles`；`saveNotificationCredential`；`providerQuotaForm` |
| 右栏：事件动作 / 热点资源 / 存储告警 / 存储策略健康 / 策略列表 | 3864 / 3876 / 3893 / 3942 / 4015（aside 3863-4046） | `summaryData.byAction`、`.topResources`；`notifyStorageAlerts`；`smokeStoragePolicy`、`storageEvaluations`；`configs`、`groupedConfigs` |

### analytics.vue（2269；脚本 1-651）
共享：`selectedDays`（`:49`）、`activeSection`（`:87-99`）、`analytics/loading/error`（composable `:66-74`）、`fetchAnalytics`（`:474-476`）。

| 区段 | 行 | 状态 / 请求 |
|---|---|---|
| 顶栏天数 + 面板条 | 653-693 | `selectedDays`、`analyticsTabs` |
| 总加载 / 总错误 | 695-724 | `loading`、`error` |
| overview：KPI、日趋势、版本旭日图 + 表、小时分布、6 张分布卡、版本使用 + 地理地图 | 728-743、784-800、910-983、986-1003、1146-1243、1627-1898 | `kpiCards`(`:154-187`)、`dailyActivityChart`、`versionDistribution/versionChartOption`(`:209-299`)、`hourlyChart`；`versionAnalytics`(/versions)、`geoAnalytics`(/geo)、`worldGeoJson`、`selectedGeoCountry/selectedVersion`、`ensureOverviewAnalytics`(`:500-506`)、地图解析 `:312-405` |
| performance：4 格 + 模块加载 | 803-907 | `analytics.summary.performance`、`topModuleLoads` |
| search：4 格、关键词关闭说明、Provider 表、2 张分布卡 | 747-781、1006-1110、1114-1145 | `topProviderMetrics`、`searchSlowRate` |
| intelligence | 1247-1408 | `/intelligence`（`:512-514`） |
| docs | 1411-1624 | `/docs`、`docsPath/docsSource`(`:62-63`)、防抖(`:567-574`)、`docsHeatmapBySection`(`:442-461`) |
| messages | 1901-1962 | `/api/telemetry/messages` |
| exchange | 1965-2066 | `/api/admin/exchange/history`、`exchange*`(`:58-61`)、watch(`:589-593`) |
| 明细抽屉（search/usage） | 2069-2264 | `showBreakdown`、`activeBreakdownTab`(`:113-114`) |

### users.vue（926）
列表：状态 `:88-93`、拉取 `:239-255`、模板 `:523-626`（顶栏 / 筛选 / 表 / 分页）。抽屉 `:628-924` 五模式：头部身份卡 `:630-643`；details `:645-702`（无请求）；edit `:704-737`（PATCH profile/role/status，`:319-353`）；subscription `:739-797`（GET + grant，`:355-407`，带代次）；credits `:799-887`（GET/PATCH credits，`:409-462`，无代次）；delete `:889-905`（POST deletion，`:464-487`）；页脚按模式切按钮 `:908-923`。

### updates.vue（913）
筛选状态 `:72-78`、选项 `:82-116`、前端过滤 `:127-167`、列 `:169-184`、前端分页 `:186-214`、标签/色调 `:244-322`、抽屉 `:331-349`、删除 `:351-383`；模板：顶栏 `:388-401`、筛选卡 `:403-491`、表卡 `:493-664`、`UpdateFormDrawer` `:666-672`、删除对话框 `:674-683`；样式 `:687-913`。

### emergency.vue（611）
状态 `:13-40`、倒计时 `:42-73`、阻断原因 `:75-105`、错误指引 `:113-199`、设备指纹 `:212-245`；四步各自一个请求：init `:247-281` / verify（WebAuthn）`:283-335` / issue `:337-368` / unblock `:370-426`；模板四段 `:448-471`、`:473-497`、`:499-544`、`:546-592`，状态条 `:595-607`。

### risk.vue（591）
共享：step-up token（`:47`、`:177-187`）、`runAction`（`:189-231`）、确认模态（`:233-236`、`:567-589`）、结果卡（`:522-565`）；四张卡各对应一个 POST：模式 `:393-421`、解封 `:423-453`、永久封禁 `:455-484`、双人复核 `:486-519`（处理器 `:301-345`）。

---

## 12. 约束本次重构的 spec

- `.trellis/spec/frontend/component-guidelines.md:72` — "Nexus administrator pages share `components/admin/AdminPageShell.vue`: `title: string`, `#actions`, `#filters`, and the default body slot. The native shell owns the single compact page heading; do not add a second page heading or subtitle inside its body. Redirect-only routes have no layout to migrate."
- 同文件 `:73` — analytics 七个 query 面板；"Overview owns usage/version/geography content, four KPI cards and their skeletons; other panels neither display those cards nor fetch overview-only version/geography resources. Keep localized labels reactive and retain per-query lazy-load ownership."
- 同文件 `:74` — 评论统一在 `/admin/reviews?tab=plugins|docs`，"separate queues keep their own real API, filter, action and pagination state"。
- 同文件 `:70` — "In Nexus pages, explicitly import custom components where the page already does so"。
- 同文件 Loading States `:311-341` — 骨架是默认（`:311`）；刷新已有内容不得换骨架（`:316`）；版式未知时用空态（`:318`）；骨架须贴合版式（`:322`）；用 `TxRowSkeleton`/`TxSkeleton`（`:329-331`）；禁止手写占位 div / 本地 `@keyframes`（`:332`）；用 `useDeferredLoading`（`:337`）；`aria-hidden`（`:341`）。
- `.trellis/spec/frontend/index.md:89` — "Prefer TuffEx primitives for new UI…"；`:92` 语义控件；`:94` 骨架默认 + 贴合；`:96` 新文案走所属消息目录。
- `.trellis/spec/frontend/quality-guidelines.md:20` — 禁止 SSR 输出依赖 window/当前时间/未水合用户态；`:118` — "Administrative subscription responses belong to one open drawer identity and request generation…"；`:51` — ESLint 按 workspace 跑。
- `.trellis/spec/frontend/tuffex-design-rules.md:11`（正文 13–14px）、`:27-29`（正文不加 letter-spacing）、`:101-103`（颜色只用 `--tx-*` token）——新增 TuffEx 原语时适用。
- `.trellis/spec/frontend/nexus-provider-scene-routing.md:105` — Provider Registry 后台须在真实浏览器验证适配器选择器、能力目录、绑定模型选择器与降级原因。
- `apps/nexus/AGENTS.md:12`（自定义组件显式 import；浏览器态用 ClientOnly）、`:14`（优先 TuffEx，不引入新视觉体系）、`:15`（新文案同步 zh/en——实际后台键在 route chunk）、`:45-48`（typecheck / 最近路径 vitest）。
- `test/guards/README.md` — 七类守卫的由来；其中可达性守卫描述仍写旧路径 `app/pages/dashboard/admin/*.vue`。

---

## 13. Caveats / 未覆盖

- 未运行任何测试；"字面量键两语齐全"的结论依赖守卫本身（`i18n-key-existence`、`dashboard-admin-i18n-coverage`），未独立复核。
- 视口宽度换算（§7-3、§7-9）按 `AdminNav.vue:280`（224/240px）与 `admin.vue:6`（`lg:px-8`）推算，未在浏览器实测。
- 后端审计覆盖面只抽查：`logAdminAudit` 写入 25 个动作 id；图片上传/删除、更新删除、治理配置、Provider 创建、风控模式切换等写操作未调用它（`server/api/images/upload.post.ts`、`dashboard/updates/[id].delete.ts`、`dashboard/governance/configs.post.ts`、`dashboard/provider-registry/providers.post.ts`、`admin/risk/mode.override.post.ts` 均 0 处），审计页因而看不到这些操作。
- 陈旧引用：`AdminNav.vue:29-31` 注释描述的"对照目录"测试不存在；`09-23-nexus-admin-console-gaps/prd.md` 引用的 `AdminNav.test.ts`、`admin-page-layout-contracts.test.ts` 与行数（governance 4,056、analytics 1,875、users 1,038）已过时。
- 会话记忆 `nexus-async-setup-blocks-skeletons`（顶层 await 导致客户端导航期间旧页停留约 4s）来自 2026-08-27 的实测，不是仓库 spec。
