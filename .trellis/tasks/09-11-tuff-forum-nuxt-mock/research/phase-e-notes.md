# Phase E notes — topic list / categories / tags

实现 + 验证均由 `impl-phase-e` 完成（2026-09-12）。门禁全绿，`node scripts/verify-topics.mjs` 16 步全过。

## 文件

新增（均在 `~/Workspace/Projects/tuff-forum`）：

- `app/composables/useTopicFilters.ts`(113) — 过滤态全部落在 query（`?mode&category&tag&page`），默认值不写进 URL，setter 一律 `router.replace`；`pins` 让 `/c/[slug]` `/tag/[slug]` 钉住某个过滤器（不进 query、下拉隐藏）；页码 clamp，未知 slug 用哨兵 id 过滤出空集而不是"忽略该条件"。导出 `TOPIC_PAGE_SIZE = 20`。
- `app/utils/excerpt.ts`(23) — Markdown → 单行摘要（置顶话题的 summary）。
- `app/components/CategoryTag.vue`(38) · `TopicStats.vue`(28) · `TopicRow.vue`(59) · `TopicListNav.vue`(95) · `TopicList.vue`(154)
- `app/pages/categories.vue`(94) · `c/[slug].vue`(93) · `tag/[slug].vue`(95) · `tags.vue`(43)
- `scripts/verify-topics.mjs`(383) — Phase E 验收（复用 `scripts/lib/cdp.mjs`；先探测 3456，占用则复用、否则自起自停）

修改：`app/pages/index.vue`（占位页 → 导航行 + 列表）、`nuxt.config.ts`（`devtools: { enabled: false }`）。

## 验证证据

门禁：`pnpm typecheck` 0 error · `pnpm lint` exit 0 · `pnpm test` 85/85 · `pnpm build` 成功（Σ 1.85 MB / 455 kB gzip）· `grep -rnE '<style|[ :]style=' app/ modules/` 0 命中 · `Math.random` 0 命中 · `node scripts/verify-shell.mjs` 仍 11/11。

`node scripts/verify-topics.mjs` → **all 16 steps passed**（`reports/topics-verify.json`）：

1. 冷加载 `/`：**20 行骨架**（= 一页行数）先于表格出现，`aria-hidden=true`，与表格互斥
2. 桌面表格：表头 `话题/发帖者/回复/浏览/活动`，20 行，第 1–2 行 `已置顶`，20 个头像堆叠（可见 ≤5 + `+N` 溢出），分页信息 `第 1–20 个，共 48 个话题`
3. 模式 chips：`?mode=new` / `?mode=top`；三种模式下置顶都在前两行；首个非置顶行 最新/新 = "想法：给 TxDataTable 加上列拖拽排序"、热门 = "Nuxt 项目里引入 @talex-touch/tuffex 后图标不显示"
4. 类别下拉：选「公告」→ `?category=announcements`，5 行全部是公告；选「全部类别」→ query 清空、`第 1–20 个，共 48 个话题`
5. 分页：点 2 → `?page=2`，`第 21–40 个，共 48 个话题`，20 条与第 1 页无交集
6. 行点击 → `/t/t2`（详情页属 Phase F，此处只断言 URL）
7. 390×844：无 `.tx-data-table`，20 个 `.tx-card-item` 行，**0 个标题被裁切**，40/40 个 TopicStats 图标实测有非空 `maskImage`/`backgroundImage`
8. `/categories`：8 个类别行（彩点 + 计数徽标），16 条「最近话题」链接（8 × 2），右栏「最新」10 条；点类别名 → `/c/announcements`；390px 下右栏消失
9. `/c/announcements`：横幅「公告」、两张 StatCard（5 话题 / 42 帖子）、每行都是公告、类别下拉隐藏（只剩标签下拉）、query 保持为空、面包屑**没有 `<a href>`**；点面包屑「话题」→ `/`
10. `/c/does-not-exist` → 错误页「哎呀，这个页面不存在 / 类别不存在，它可能已经改名或被删除。」，**console 干净**
11. `/tags`：16 个 chip 全部带计数、全部 `role=button tabindex=0`、按计数降序（首位 plugin-sdk 13）；点击 → `/tag/plugin-sdk`，横幅 `#plugin-sdk`，13 行全部带该标签，标签下拉隐藏
12. 深色：切换后 `html.dark`，表格照常渲染，console 干净

**变异测试**（Guard Thinking Guide：先证明守卫会失败）：

- 把 `useDeferredLoading` 的 `delay: 0` 改回 `150` → 第 1 步失败（`no .tx-row-skeleton was observable during a cold / load`）。骨架断言不是摆设。
- 让 `useTopicFilters` 忽略 `pinnedCategory` → 第 9 步失败（`rows carry ["公告","想法","闲聊",…]`）。钉住类别的断言有效。
- 两次变异均已还原并复跑全绿。

截图（`reports/`，已 gitignore）：

- `topics-desktop-light.png` — 1280×800 浅色 `/`：导航行（三个 chip + 两个下拉 + 右端「新话题」）与五列表格，前两行带「已置顶」徽标和两行摘要，类别彩点 tag、标签 tag、头像堆叠 `+4`、回复/浏览/相对时间。
- `topics-desktop-dark.png` — 同一视图深色：表面转深、文本与标签色相保持可读，`html.dark` 生效。
- `topics-categories.png` — `/categories` 两栏：左侧 8 个类别（彩点、描述、计数徽标、各 2 条最近话题链接），右侧「最新」10 条带类别徽标与相对时间。
- `topics-tags.png` — `/tags` 标签云：16 个彩色 pill，各自带话题计数，按计数降序。
- `topics-mobile.png` — 390×844 `/`：无表格，卡片行（头像 / 置顶徽标 + 完整换行标题 / 类别 + 标签 / 置顶摘要 / 底部回复·浏览·时间）。

## 撞到的 Tuffex 限制与绕法

1. **`TxCardItem` 的 `title`/`subtitle` 是 `white-space: nowrap; overflow: hidden`**。窄屏首版把 TopicStats 放在 `#right`（`flex: 0 0 auto`，约 150px），标题只剩半行宽且**被从中间切断**（截图证据："Tuff 2.5 发布：全"）。改法：标题插槽加 `whitespace-normal` 让它换行、行高自然增长；统计行从 `#right` 移到 `#description`（`word-break: break-word`，无 nowrap）——这也更接近 Discourse 手机版的 标题 / 类别标签 / 元信息 三行结构。已在冒烟里加了 `scrollWidth > clientWidth` 的反向断言锁住。
2. **`TxCardItem` 在 0.5.0 没有 `align` prop**（research 清单里写有 `align start|center`，与 dist 不符）。未传，行本身已是 `align-items: flex-start`。
3. **`TxFlex` 的 `wrap` 是字符串枚举**（`'nowrap' | 'wrap' | 'wrap-reverse'`），不是布尔；裸写 `wrap` 过不了 typecheck。`TxStack` 的 `wrap` 才是布尔。
4. **`TxTag` 没有 `clickable`**：只要挂上 `@click` 就自动变成 `role="button" tabindex="0"` 并支持 Enter/Space。`CategoryTag` 因此用 `v-on="clickable ? { click } : {}"` 条件挂载监听，避免在可点击的行里嵌套出一个不该有的按钮。
5. **`TxPagination` 的 `show-info` 默认文案是英文**（`Page 1 of 3 (48 items)`）。用 `#info` 插槽渲染中文并给出区间：`第 1–20 个，共 48 个话题`。
6. **`TxCellLink` 从不自己导航**（`preventDefault` + `@open`），已按约定 `@open` → `router.push`。
7. **`TxBreadcrumb` 的点击在内层 `.tx-breadcrumb__link` 上**（`<li>` 只是容器）；不传 `href` 时渲染 `<button>`，传了才是 `<a>`（会整页刷新）。
8. **BUI 前缀**：`filter-chips` / `cell-link` 与侧栏一样是 `tx-bui-*`（`.tx-bui-filter-chips__chip`、`.tx-bui-cell-link`），`TxSelect` 更是 `tuff-select__*`（不是 `tx-select`）。
9. **`TxSelect` 的选项面板即使关闭也整份挂在 DOM 里**（teleport 到 `.tuff-select__panel`），选项本身是 `.tx-card-item`。任何 `document.querySelectorAll('.tx-card-item' | '.tx-tag' | '.i-carbon-*')` 的统计都必须排除 `.tuff-select__panel`（以及窄屏抽屉里常驻的 `.tx-bui-sidebar-nav`），否则多算 26 项。
10. **`TxAvatarGroup` 的 `+N` 溢出头像也带 `tx-avatar-group__item`**，断言"可见 ≤ max"要写成 `:not(.tx-avatar-group__more)`。包装组件（`UserAvatar`）能正常参与：group 用 `cloneVNode` 注入 `class/style/size`，穿过包装落到 `TxAvatar` 根元素。

## 偏离 design §5.2 / §5.3 的地方（都有理由）

1. **骨架行数用 `pageSize`（20）而不是 design §5.2 写的 `:rows="10"`**。`.trellis/spec/frontend/component-guidelines.md` 的硬要求是"same row count，否则数据到达时页面照样跳"，而一页就是 20 行；10 行骨架会在落地时抖动 10 行高度。设计稿里的 10 看起来是没跟 pageSize=20 对齐的默认值。
2. **`/` 的首屏 loading 是有意造出来的**：mock store 是同步的，没有任何等待可言。`index.vue` 用一个 `FIRST_PAINT_MS = 32` 的窗口把 `loading` 撑住两帧，`useDeferredLoading` 配 `delay: 0, minDuration: 400` 把骨架稳定显示约 400ms。R7/AC7 要求"首屏出现与列表同结构的骨架"，同步数据下只能这样；这是**刻意的首屏 affordance，不是真实延迟**。按原样照抄任务书里的 "onMounted + nextTick"（微任务）会让 `delay: 0` 的定时器在触发前就被取消，**一帧骨架都不会出现**。
3. **未知 slug 的 404 用 `showError` + `v-if`，不是 `throw createError`**（任务书写的是 throw）。实测三条路径：
   - setup 里 `throw`：setup 中断但 Vue 仍会用空的 setup state 渲染一次模板 → 4 条 `[Vue warn]: Invalid prop ... got Undefined`（AC3 的"无 console error"直接挂）。Phase D 的 `[...slug].vue` 能 throw 是因为它的模板是 `<div />`，没有任何绑定。
   - `definePageMeta({ middleware })` 里 throw：组件根本不创建，但初始导航发生在 `app:mounted` 之前 → 2 条 `[NUXT_E1005] Error caught during app initialization`。
   - `showError(createError({...}))` 不中断 setup，其余绑定照常创建，根节点 `v-if="category"` 使模板不渲染任何子组件 → **console 干净**，错误页仍显示中文 message。冒烟第 10 步就是锁这个。
4. **列排序是当前页内的客户端排序**。`TxDataTable` 默认 `sortOnClient`，而它拿到的 `data` 已经是分页后的 20 条，所以点「回复/浏览/活动」表头排的是本页。design §5.2 只写了 `sortable`；要做成全局排序得再加一层 query 状态并与「最新/新/热门」三个 chip 协调，超出本阶段契约。记在这里，Phase H/后续若要改是已知点。
5. **`/c/[slug]` `/tag/[slug]` 加了 `definePageMeta({ key: route => route.path })`**（design 未提）。Nuxt 默认会复用同一个页面组件实例，slug 变了 setup 不会重跑；按 `path` 取 key 让换分类重新挂载，同时**不能用 `fullPath`** —— 那样每次改 query（翻页 / 换模式）都会重挂载，骨架和排序状态都会被重置。
6. **`/c/[slug]`、`/tag/[slug]` 的列表不跑骨架**（`loading` 默认 false）。首屏骨架只在 `/` 出现，设计里的骨架要求也只针对话题列表首屏。
7. **横幅统计用整个类别/标签的数量**，不随下方的模式 / 标签过滤变化——过滤后的条数分页信息里已经有了。

## 给 Phase F/G 的提醒

- `.tx-bui-*` / `tuff-select__*` 这些选择器前缀不统一，写断言前先 `grep -rho "tx-[a-z-]*" node_modules/@talex-touch/tuffex/dist/es/<dir>/src/*.js | sort -u` 确认一遍。
- 冒烟脚本里统计页面元素，务必套 `pageOnly()`（排除侧栏副本 + 选择器面板），`scripts/verify-topics.mjs` 顶部有现成常量。
- `/t/[id]` 目前落在 catch-all 404 上，Phase F 建好后 `verify-topics.mjs` 第 6 步的注释可以删掉、断言可以加强。
