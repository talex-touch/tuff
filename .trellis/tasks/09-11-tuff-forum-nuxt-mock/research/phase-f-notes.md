# Phase F notes — 话题详情 / 发帖 / 全局列排序

实现 + 验证由 `impl-phase-f` 完成（2026-09-12）。门禁全绿，三个冒烟脚本 11 + 17 + 13 步全过。

## 文件

新增（均在 `~/Workspace/Projects/tuff-forum`）：

- `app/components/PostCard.vue`(228) — Discourse 的一条帖子：左头像 / 头行（作者 · 角色 · 相对时间+绝对时间 tooltip · 已编辑 · 「回复 @user」回链 · `#楼层`）/ `TxMarkdownView` 正文（已删除 → `TxAlert`）/ 控制行。编辑态就地换成 `TxMarkdownEditor` + 保存·取消。写操作一律先问 `can()`；访客仍看得见的赞按钮改为打开登录弹窗。
- `app/components/ReplyComposer.vue`(121) — 底部 composer（`TxDrawer direction=bottom :size=420 :close-on-click-mask=false`）。打开时（且草稿为空时）预填 `> 引用…`，提交走 `forum.createPost`，成功后 toast + 交回新帖 id 让页面滚动高亮。
- `app/components/TopicControls.vue`(94) — 话题底部控制条：书签（首帖）/ 分享 `TxCopyButton` / 通知级别 `TxSelect`（页面内 mock，代码里注明）/ 回复。关闭且非 staff → `TxAlert warning`；访客 → `TxEmptyState variant=permission`。
- `app/components/TopicTimeline.vue`(80) — 右栏：`TxTimeline`（创建 / 已置顶 / 已关闭 / 最新回复，末项 active）+ 两张 `TxStatCard`（回复 / 点赞）+ 参与者 `TxAvatarGroup :max=8`。
- `app/components/SuggestedTopics.vue`(50) — `TxDivider` + `forum.suggestedTopics(id, 5)` 的 `TxCardItem` 列表。
- `app/pages/t/[id].vue`(200) — 面包屑（无 href）/ h1（关闭时带锁）/ 类别·标签·状态徽标 / staff `TxDropdownMenu`（置顶·关闭）/ `TxRow` 主列 + 右栏 / composer / 建议话题；`focusPost()` 负责滚动 + 1.2s 高亮，`onMounted` 每会话每话题只 `incrementViews` 一次（`sessionStorage` 去重）。
- `app/pages/new.vue`(180) — `TxForm label-position=top`：标题 / 类别 / 标签 / Markdown 正文 + 校验，成功后 toast → `/t/<id>`；`?category=<slug>` 预选类别。
- `scripts/verify-topic-page.mjs`(608) — Phase F 验收（13 步，复用 `scripts/lib/cdp.mjs`，先探测 3456 端口）。

修改：

- `app/composables/useTopicFilters.ts` — **F0**：列排序提到 query（`?sort=replies|views|activity&dir=asc|desc`），排序作用于 `matching`（过滤后的全量）再切页；置顶永远在前（`Number(b.pinned)-Number(a.pinned)` 领先项 + 稳定排序保住模式次序）。`setSort(null)` 清空两个 key 并回到第 1 页。
- `app/components/TopicList.vue` — `TxDataTable` 改受控排序：`:sort` + `:sort-on-client="false"` + `@sort-change`；去掉列上已失效的 `sorter`。
- `app/pages/index.vue`、`c/[slug].vue`、`tag/[slug].vue` — 透传 `:sort` / `@update:sort`。
- `scripts/verify-topics.mjs` — 新增第 6 步「column sorting orders every topic, not just the page」（16 → 17 步）。

## 验证证据

门禁：`pnpm typecheck` 0 error · `pnpm lint` exit 0 · `pnpm test` 85/85 · `pnpm build` 成功（Σ 1.86 MB / 457 kB gzip）· `grep -rnE '<style|[ :]style=|v-bind:style' app/ modules/` 0 命中 · `app/` `modules/` 下无 `.css/.scss` · `Math.random` 0 命中 · `git diff --check` 干净。

`node scripts/verify-shell.mjs` → **all 11 steps passed**（未受影响）。

`node scripts/verify-topics.mjs` → **all 17 steps passed**，新增步骤输出：

> `?sort=replies&dir=desc`: pinned stay on top, first unpinned row has 10 replies (the maximum over all 48), page 2 peaks at 4 ≤ page 1's 4, the URL round-trips with aria-sort="descending", a third click clears it

`node scripts/verify-topic-page.mjs` → **all 13 steps passed**（`reports/topic-page-verify.json`）：

1. `/t/t1` 结构：h1 = 种子标题；帖子数（15）= localStorage 里 `posts.filter(topicId==='t1')`；楼层 `#1…#15`；面包屑 0 个 `<a href>`；右栏时间线 创建/已置顶/最新回复 + 两张 StatCard（14 回复 / 26 点赞）+ 6 位参与者；建议话题 5 条；**#1 没有 ··· 菜单而 #2 有**（见下面的变异测试）；console 干净
2. 赞：#2 计数 0 → 1、图标换成 `-filled`、**localStorage 里 `likeUserIds` 也 0 → 1**；再点回到 0
3. 回复：控制条「回复」→ 抽屉打开且头部含话题标题 → 输入 ``**粗体** 和 `代码` `` → 提交后抽屉关闭、toast 出现、帖子 15 → 16、新帖正文含 `<strong>`/`<code>`、右栏「回复」14 → 15、**刷新后 p222 仍在**
4. 引用回复：对 #3 点回复 → 预填 `> @talex 已经合并到 master 了，…`、头部「回复 @leon 的 #3」→ 提交后新帖带「回复 @leon」回链 → 点回链 `scrollY 2606 → 752`，目标帖在视口内且 box-shadow 非 none（高亮生效）
5. 编辑：切到 ryan（普通成员）→ 看不到管理员 #1 的「编辑」（反向控制）→ 自己发帖后「编辑」打开编辑器、改完保存、正文更新且出现「已编辑」
6. 删除：#1 完全没有 ··· 菜单；自己的帖子 ··· → 删除 → 「此帖已被删除」
7. 已关闭话题 `t42`：成员看不到回复按钮、控制条是 warning alert；换版主 mika 后回复按钮回来
8. staff 置顶：mika 在 `/t/t3` 置顶 → `/` 第 2 行且其上所有行都带「已置顶」→ 取消置顶后徽标消失
9. 访客：经用户菜单「退出登录」后，控制条是「登录后参与讨论」、无回复按钮、点赞按钮打开登录弹窗且计数不变
10. `/new`：空表单提交停在 `/new` 并显示 3 条校验信息；填好后跳到 `/t/t49`，`/?mode=new` 里它是第一条非置顶行
11. `/t/does-not-exist`：错误页在壳里渲染、header 还在、console 干净
12. 深色：`html.dark` 下帖子流照常
13. 390×844：无右栏时间线、18 条帖子（1 条已删）对应 17 条控制行且 0 条被裁切、composer 可打开可输入且提交按钮在视口内且是自身中心点的命中元素

**变异测试**（Guard Thinking Guide：先证明守卫会失败）：

| 变异 | 期望 | 实际 |
|---|---|---|
| `useTopicFilters` 改成只排当前页（等价 `sortOnClient`） | verify-topics 排序步骤失败 | ✅ `page 2 holds a topic with 10 replies while page 1 ends at 0 — the sort is page-local` |
| `canDelete` 去掉 `!isFirstPost` | 首帖删除守卫失败 | ❌ **第一次没抓到** → 见下 |
| `ReplyComposer` 去掉引用预填 | 引用步骤失败 | ✅ `composer did not prefill a quote: ""` |
| composer 的按钮从 `#footer` 挪进滚动区 | 390px 可达性守卫失败 | ❌ **第一次没抓到** → 见下 |

两个「没抓到」都按指南修成了真守卫：

- **首帖删除**：原断言放在第 6 步，而那时登录的是 ryan（无权编辑管理员的 #1），所以 `more[0]` 为假是因为「无编辑权」而不是「首帖不可删」——换谁写代码都过。改到第 1 步（登录者 = 首帖作者 talex）并配上两条正向控制：`editable[0]` 必须为真（否则这条断言什么也证明不了）、`more[1]` 必须为真（否则「#1 没有菜单」不说明问题）。重跑变异 → `post #1 offers a ··· delete menu, which the store would refuse`。
- **composer 可达性**：原断言只看 `rect.top >= 0 && rect.bottom <= innerHeight`。抽屉高度被 CSS 夹住，所以「把抽屉调到 1400px」根本破坏不了它；而真正会出事的写法（把按钮放进 `.tx-drawer__body` 这个 `overflow-y:auto` 容器）在几何上仍然「在视口内」。改成 `document.elementFromPoint(按钮中心)` 必须落在按钮自身里，两种失效都能抓。重跑变异 → `inViewport:false, hittable:false`。

截图（`reports/`，已 gitignore）：

- `topic-desktop-light.png` — 1280×800 浅色 `/t/t1`：面包屑 话题/公告/截断标题、h1、类别彩点 tag + 已置顶徽标、首帖（大头像 / TalexDreamSoul + 管理员徽标 / 1 年前 / #1 / 渲染后的 Markdown），右栏时间线（创建 2025-09-17 · 已置顶 · 最新回复）与 14 回复 / 26 点赞两张 StatCard 加 6 位参与者。
- `topic-desktop-dark.png` — 同一页深色：表面转深、语义色与代码块仍可读，右栏时间线圆点与 StatCard 跟随主题。
- `topic-composer.png` — 底部 composer 打开：遮罩把正文虚化，抽屉头部「回复 @leon 的 #3」，Markdown 工具栏 + 模式切换，正文已预填 `> @talex 已经合并到 master 了，感谢贡献。`。
- `topic-new.png` — `/new` 填好后的表单：整宽标题输入（带清除）、类别「想法」与标签两个下拉并排、整宽 Markdown 编辑器，底部 取消 / 创建话题。
- `topic-mobile.png` — 390×844 打开 composer：页面堆叠（无右栏），抽屉头部标题折行、工具栏折两行、输入内容与 取消/回复 全在视口内。

## 撞到的 Tuffex 限制与绕法（接 Phase E 的 1–10）

11. **`TxDropdownItem` 不是 `<button>`**：它渲染的是 `TxCardItem`（`div[role="menuitem"]`，靠 tabindex + Enter/Space）。冒烟脚本里按文本点菜单项必须找 `.tx-dropdown__panel .tx-dropdown-item`，用「找 button」的 helper 会一无所获（第一次跑就栽在这）。
12. **`TxModal` 没有 `.tx-modal` 这个元素**：根节点是 teleport 到 body 的 `.tx-modal__overlay`（`role=dialog`），`tx-modal` 只是 Transition 的 name。等弹窗出现要 `waitFor('.tx-modal__overlay')`。
13. **`TxDrawer` 关闭时仍挂在 DOM 里**：teleport 到 body，用 `tx-drawer--visible` 切换，隐藏时加 `inert` + `aria-hidden`。两个后果：(a) composer 里的 `TxMarkdownEditor` 会随页面一起挂载；(b) 任何 `querySelectorAll` 统计都得排除 `.tx-drawer`（Phase E 的 `pageOnly` 里已补上，连同 `.tx-modal__overlay`）。判断「抽屉开着」要看 `.tx-drawer--visible`。
14. **给了 `#header` 插槽就没有关闭按钮**：`shouldRenderHeader` 在有 header 插槽时只渲染插槽，`showClose` 不再生效。composer 因此把「取消」放在 `#footer`（Esc 仍可关）。
15. **`label-position="top"` 的 `TxFormItem` 不会把控件拉宽**：`.tx-form-item { align-items: flex-start }`，列方向下每个子项都停在固有宽度——938px 的表单里标题输入只有 177px。`.tx-form-item[data-v-…]` 是 (0,2,0)，普通工具类压不过，只能用 UnoCSS 的 important 变体 `class="!items-stretch"`。
16. **`TxFormItem` 不会在输入时重新校验**：`errorMessage` 只在 `form.validate()` 时更新，所以空表单提交后即使把标题填好，「请先写个标题」也一直挂在下面。页面自己补了「首次提交后，model 每次变化就重跑一遍 `validate()`」——首次提交前保持安静，之后逐字段实时消错。
17. **`TxSelect` 是固定 `width: 240px`（`max-width: 100%`）**：给 FormItem 加 `flex-1` 只会把标签推开，控件不变宽。`/new` 的两个下拉因此保持 240px，与话题列表导航行一致。
18. **`TxDataTable` 的受控排序**：只要传了 `sort` prop（`props.sort !== void 0`，传 `null` 也算）就进入受控模式，此时必须配 `:sort-on-client="false"`，否则它会在收到的那一页里再排一次。表头是真 `button.tx-data-table__sort-button`，外层 `th` 带 `aria-sort`；`sortCycle` 默认 `tri`（升 → 降 → 无）。
19. **`TxDropdownMenu` 的 `class` 会落到浮层**（`TxBaseAnchor` 的 `inheritAttrs: false`）：要给触发器加类得用 `reference-class`（话题管理菜单的 `ml-auto` 就是这么加的）。
20. **`showError` 的 `statusMessage` 不能放中文长句**：h3 会打印 `Please prefer using 'message' for longer error messages instead of 'statusMessage'`，按 AC3 的「无 console 错误」这就是失败。沿用 Phase E 的写法：`statusMessage: 'Not Found'` + 中文放 `message`（`error.vue` 本来就渲染 `message`）。
21. **带 `transition-shadow` 的高亮不能马上量**：加上 ring 类后立刻 `getComputedStyle` 拿到的是过渡的起始值（全透明 0px），看起来像没生效。等过渡结束再断言（脚本里跳转后等 1.2s）。

## 偏离任务书 / design §5.4–5.5 的地方（都有理由）

1. **`/new` 的标签下拉没开 `allow-create`**（design §5.5 写了）。store 没有「新建标签」的 action，`counters` 也只有 topic/post/notification 三个计数器；开了之后新建的标签会变成一个解析不到的 tagId，列表里的标签 chip 直接消失。Discourse 本身也把建标签放在信任等级后面。改法若要补：给 store 加 `createTag` + `counters.tag`，但那会动 Phase C 的数据契约，不在本阶段。
2. **404 用 `statusMessage: 'Not Found'` 而不是任务书写的 `'话题不存在'`**：理由见限制 20。
3. **帖子控制行是「左组 + 右组 + `justify=space-between`」，不是单行 `ml-auto`**：手机上这一行会折行，`ml-auto` 的写法会把右半组顶到卡片外；两组写法让它整组掉到下一行。390px 下 17/17 条控制行 `scrollWidth <= clientWidth`。
4. **`/new` 加了「首次提交后实时重校验」**（任务书未提）：见限制 16，否则填好的字段底下会一直挂着旧错误。
5. **通知级别下拉是页面内状态**：按任务书要求，代码里写明了「store 没有订阅模型，造一个没人能读的状态没有意义」。
6. **右栏只在 `useShell().isDesktop`（≥1024px）渲染**，与 Phase D 的侧栏同一个断点。
7. **`verify-topic-page.mjs` 用 localStorage 播种会话切换用户**（任务书允许的两种方式之一）；只有「退出登录」走真实 UI 路径（用户菜单 → 退出登录），因为 AC6 要的就是这条路径。顺带发现：退出后要等 `PERSIST_MS` 再整页导航，否则 150ms 的防抖还没落盘，刷新会把旧用户读回来——脚本里对此有注释。

## 给 Phase G/H 的提醒

- `pageOnly()` 现在要排除四类容器：`.tx-bui-sidebar-nav`、`.tuff-select__panel`、`.tx-modal__overlay`、`.tx-drawer`。`scripts/verify-topic-page.mjs` 顶部是最新版本。
- 用户页 `/u/[username]` 的 Tabs 里要复用通知列表；`PostCard` 已经是可复用的帖子渲染单元（props `post/topic/floor/flash`，emits `reply/jump`），活动 Tab 想展示帖子可以直接用。
- `forum.statsOfUser` / `activityOfUser` / `mostLikedByUsers` / `topLikedPostsOfUser` / `topTopicsOfUser` 都已就绪（Phase C），Phase G 不需要再往 store 里加 getter。
- 若 Phase H 的 `check:styles` 要把 `!items-stretch` 这类 important 变体一起扫，注意它是 class 里的工具类，不是内联样式——别误报。
