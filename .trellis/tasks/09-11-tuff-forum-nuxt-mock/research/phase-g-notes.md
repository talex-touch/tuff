# Phase G notes — 用户页 / 偏好设置 / 用户目录 / 通知 / 书签 / 搜索（含 G0 标签创建）

实现 + 验证由 `impl-phase-g` 完成（2026-09-12）。门禁全绿，四个冒烟脚本 11 + 17 + 13 + 12 步全过。

## 文件

新增（均在 `~/Workspace/Projects/tuff-forum`）：

- `app/components/NotificationList.vue`(142) — 共用通知列表：未读/全部 `TxFilterChips`（带计数）+「全部标为已读」（0 未读时 disabled）+ 每类型一个图标与一句中文（reply 还区分「你的话题」与「你在《…》中的帖子」，因为 store 会同时通知话题作者和被回复者）。点击 = `markRead` + 跳到主体（follow → `/u/<actor>`，有 topicId → `/t/<id>`，system 无主体 → `/about`）。`/notifications` 和主页「通知」Tab 都用它。
- `app/pages/u/[username]/index.vue`(391) — 横幅（xlarge 头像 / 显示名 + 角色徽标 / `@handle · 加入于` / 简介 + 所在地 + 网站 / 关注·编辑资料）+ 6 张 `TxStatCard`（`TxGrid cols={xs:2,md:3,lg:6}`）+ 4 个 Tab（`?tab=` 同步）。
- `app/pages/u/[username]/preferences.vue`(238) — `TxTabs placement=left`：个人资料（4 个 `TxBlockInput`）/ 头像（8 个 `TxRadio` card）/ 通知（3 个 `TxBlockSwitch`）/ 界面（`TxBlockSelect` 主题）。草稿本地暂存，`保存更改` 一次性提交 + toast；另给「放弃修改」。
- `app/pages/users.vue`(114) — `TxSearchInput` + `TxDataTable` 用户/角色/已收到的赞/话题/回复/加入时间，六列全部可排序。
- `app/pages/notifications.vue`(28) · `app/pages/bookmarks.vue`(84) · `app/pages/search.vue`(168)
- `app/utils/highlight.ts`(32) — `highlightParts(text, query)` 把文本切成 命中/非命中 段，供模板包 `<mark>`（不用 `v-html`）。
- `scripts/verify-user-pages.mjs`(926) — Phase G 验收（12 步，复用 `scripts/lib/cdp.mjs`，先探测 3456 端口）。

修改：

- **G0**：`app/data/types.ts`（`Counters.tag`）、`app/data/seed.ts`（`counters.tag = tags.length`，新增 `tagSlug(name)`）、`app/data/persist.ts`（`normalizeCounters`）、`app/stores/forum.ts`（`createTag` / `resolveTagIds` / `nextId('tag')`）、`app/pages/new.vue`（开 `allow-create`）。
- `app/utils/excerpt.ts` — 抽出 `plainText()`，新增 `matchExcerpt()`（围绕命中位置取窗口，否则深处的命中在摘要里根本看不到）。
- `tests/forum-store.test.ts`（+9）、`tests/persist.test.ts`（+3）、`tests/seed.test.ts`（counters 断言 +tag）：85 → **96**。

## G0 的选择：版本号保持 1

按任务书的偏好，**没有**把 `FORUM_STATE_VERSION` 升到 2。`parseState` 新增 `normalizeCounters`：

- `topic` / `post` / `notification` 必须是有限非负数，否则整份 payload 作废（顺带把守卫变严了——把 `topic` 默认成 0 会重新发 `t1` 并覆盖种子）；
- 只有新增的 `tag` 缺失时回退成 `tags.length`。一份 v1 payload 从来没有造过标签，所以「现有标签数」就是下一个 id 的正确起点。

结果：老 localStorage 照常水合，用户看不到任何重置。若以后 `tags` 与 `counters.tag` 真的对不上（例如手改过 localStorage），`resumes the tag counter past tags a legacy payload had already grown` 这条测试锁住了「取 `tags.length` 而不是 16」的行为。

`createTag(name)`：slug = 小写 + 空白转 `-` + 去掉 `[a-z0-9-]` 以外的字符；**slug 已存在就复用**（所以 `Vue` / `vue ` / `vue` 是同一个标签）；纯中文名 slug 会变空，回退成 `tag-${counters.tag + 1}`，`/tag/<slug>` 仍可寻址。颜色按 `counters.tag % AVATAR_PALETTE.length` 取，第 n 个被创建的标签颜色恒定。`createTopic` 的 `tagIds` 里「不是已知 tag id 的条目」一律当名字处理并去重——这正好接住 `TxSelect allow-create` 回传的**标签文本**。

## 验证证据

门禁：`pnpm typecheck` 0 error · `pnpm lint` exit 0 · `pnpm test` **96/96** · `pnpm build` 成功（Σ 1.88 MB / 459 kB gzip）· `grep -rnE '<style|[ :]style=|v-bind:style' app/ modules/ scripts/` 0 命中 · `app/` `modules/` 下无 `.css/.scss/.sass/.less/.styl` · `Math.random` 0 命中 · `git diff --check` 干净。

四个冒烟脚本（G0 动了 store，全部重跑）：`verify-shell` **11/11** · `verify-topics` **17/17** · `verify-topic-page` **13/13** · `verify-user-pages` **12/12**（`reports/user-pages-verify.json`）。

`node scripts/verify-user-pages.mjs` 的 12 步（每一步凡是声称「改了状态」，都回读 `localStorage`；期望值由脚本**自己**从存下来的 state 重算，不去问渲染它的 store）：

1. `/u/talex`：横幅带「管理员」徽标，6 张统计卡的标签与数值 = 脚本重算的 `statsOfUser`（7/20/102/52/3/1），本人 4 个 Tab；访客看 `/u/mika` 只有 2 个 Tab、无「编辑资料」、有「关注」
2. 关注：挑一个**种子里还没关注 talex** 的人（mika 已经关注了，硬编码 u2 会假阳性）→ 点「关注」→ 按钮变「已关注」、关注者 3 → 4、localStorage 里出现 `follows` 行与一条**未读** follow 通知；再点一次三者全部回退
3. `?tab=activity` 深链直接落在「活动」；chips 计数 = 全部存量事件（话题/回复/赞/书签 = 7/20/52/2，合计 81），面板每类最多渲染 30 行
4. 偏好设置：改「显示名」「简介」→ **提交前 localStorage 未变**（暂存断言）→ 「保存更改」→ toast、`/u/talex` 横幅与顶栏头像首字母一起变、刷新后仍在；换头像颜色预览跟着变、通知开关取反，二者都在 reload 后仍在
5. `/u/mika/preferences`（以 talex 身份）→ 重定向到 `/u/mika`，且一个**在文档脚本之前就装好**的 `MutationObserver`（`Page.addScriptToEvaluateOnNewDocument`）全程没看见 `.tx-group-block / .tx-block-input / .tx-radio-group`
6. `/users`：12 行、表头六列；「已收到的赞」降序把 @talex（102）排到第一并且 `aria-sort="descending"`、整列单调不增；搜 `mika` 剩 1 行；点行进 `/u/mika`
7. `/notifications`：顶栏角标 = 未读 chip = 加粗行数 = 3；点最新一条（follow）→ 落在 `/u/ryan`、localStorage 里 `read: true`、角标 3 → 2；「全部标为已读」清空 store、按钮自禁、角标消失
8. `/bookmarks`：行数 = 存量书签；「移除书签」同时掉行和掉存储；在 `/t/t1` 给 p2 加书签后该话题回到列表
9. `/search?q=tuffex`：三个 Tab 徽标 5/9/0 = 脚本重算值，每个 Tab 的行数与自己的徽标一致，10 处 `<mark>` 命中且背景不是浏览器默认；`?q=` 过刷新；乱码查询出空状态
10. **G0**：`/new` 输入一个没见过的标签名 → 出现「创建这个标签」→ 发帖后 tags 16 → 17（**恰好一个**）、话题的 `tagIds` 全部可解析、`counters.tag` 与 `tags.length` 一致；话题页显示该 chip、`/tags` 列出它且计数为 1、点它进 `/tag/rolldown` 且只剩那一条
11. 390×844：统计网格回到 2 列且 6 张卡都在；偏好设置 4 个 Tab 全部是自身中心点的命中元素；收件箱最多的人的 6 条通知，最长 51 字，**3 条真的折了行**，0 条被裁切
12. 深色：`html.dark`、body `rgb(10,10,10)`、6 张统计卡照常

**变异测试**（Guard Thinking Guide：先证明守卫会红）：

| 变异 | 结果 |
|---|---|
| `/new` 去掉 `allow-create` | ✅ `the select offers no 创建这个标签 action for an unknown name` |
| 偏好设置的 `v-else-if="profile && isSelf"` 改成 `v-else-if="profile"`（重定向前先渲染表单） | ✅ `the preferences form was rendered before the redirect` |
| 通知标题去掉 `whitespace-normal` | ✅ `no notification title wrapped onto a second line at 390px (heights [16,16,16,16,16,16])`；另测：同一变异下 `titleScroll` 是 `[425,216] [494,216] …`，所以 `clipped === 0` 那条**也**会红——两条断言都不是摆设 |
| `?tab=` 不再给初始 tab 播种（`ref('summary')`） | ✅ 第 3 步等活动 chips 超时 |
| 「显示名」改成 `v-model="profile.displayName"`（直写 store） | ✅ `editing the field already wrote to the store before 保存更改` |

五个变异均已还原，还原后 96/96 + 12/12 复跑通过。

另外两处「守卫本来会假阳性」的自查，已按指南修掉：

- **`PROFILE.banner` 一开始读的是 `document.querySelector('.tx-card-item')`**，那是**侧栏 footer** 里当前用户那一行（文本同样是「显示名 @handle · 角色」），所以横幅断言一直在验错元素。改成 `pageOnly([...])[0]` 后才真的读到横幅——`badges` 同样加了 `pageOnly`。（Phase E/F 的 `pageOnly` 提醒我看了，但只用在「计数」上，漏了「取第一个」。）
- **「390px 通知不裁切」原本只在 mika 身上跑**，而 mika 只有 1 条短通知——那条断言几乎不可能红。现在脚本挑「收件箱最多的那个人」，并加了一条**正向控制** `wrapped > 0`：如果一条标题都没有折行，说明根本没到 nowrap 会露馅的地步，断言本身无效，直接报错。

截图（`reports/`，已 gitignore）：

- `user-desktop-light.png` — 1280×800 浅色 `/u/talex`：横幅（大头像 / 显示名 + 管理员徽标 / `@talex · 加入于 2024年9月12日` / 简介 / 杭州 + GitHub 链接 / 右侧「编辑资料」），下面 6 张统计卡一行排开，再下面横向 Tab（摘要/活动/通知/偏好设置）与摘要三栏（热门回复带赞数 tag、热门话题带类别徽标、最多点赞的用户头像堆叠 + 名字·次数）。
- `user-desktop-dark.png` — 同一页深色：卡面转深、管理员徽标与类别彩点保持色相、头像堆叠与统计数字仍清晰，`html.dark` 生效。
- `user-preferences.png` — `/u/talex/preferences`：左侧四项子导航（个人资料/头像/通知/界面），右侧 `TxGroupBlock` 四行（标题 + 说明在左、输入框在右），底部「放弃修改 / 保存更改」，右下角「偏好设置已保存」toast。
- `user-notifications.png` — `/notifications`：未读 3 / 全部 6 两个 chip、右端「全部标为已读」，三条未读行各带类型图标（关注 / @ 提及）、加粗中文句子、相对时间和右侧蓝点。
- `user-search.png` — `/search?q=tuffex`：顶部搜索框，横向三个 Tab（话题 5 / 帖子 9 / 用户 0，计数是 `TxBadge`），下面五条话题行（头像、标题、类别 + 标签、回复·浏览·相对时间）。
- `user-mobile.png` — 390×844 `/u/talex`：顶栏折成两行标题，横幅纵向堆叠且 `@talex · 加入于…` 正常折行（不再被裁），统计网格 2×3，Tab 仍横排。

## 撞到的 Tuffex 限制与绕法（接 Phase E/F 的 1–21）

22. **`TxTabs` 不会自动选中第一个子项**，`placement` 默认也是 **`left`** 而不是 `top`。没有 `modelValue`/`defaultValue` 时它渲染自带的英文占位 `No tab selected`（偏好设置第一版就是这样，四个 tab 全部 `aria-selected="false"`）。两个后果：任何 `TxTabs` 都必须显式给模型；想要 Discourse 那种横向 Tab 必须显式写 `placement="top"`。
23. **`TxBadge` 的数字走 `<number-flow-vue>`，字形在 shadow root 里**，宿主元素的 `textContent` / `innerText` 都是空字符串，也没有 `aria-label` 或 `value` 属性可读。想断言徽标上的数字，只能进 shadow root 读每个 `.digit` 的 `--current`（CSS 就是靠它挑可见字形的，所以这算读渲染结果而不是读自己的绑定）。`scripts/verify-user-pages.mjs` 顶部的 `BADGE_DIGITS` 是现成的。注意 `TxFilterChips` 的 `count` 不走这条路，是纯文本。
24. **`TxCardItem` 的 `subtitle` 和 `title` 一样是 `nowrap + overflow:hidden`**。Phase E 只记了 title；390px 下 `@talex · 加入于 2024年9月12日` 会被切成 `@talex · 加…`，副标题同样要走插槽 + `whitespace-normal`。
25. **`TxBlockInput` 只有单行输入**（`inputType: text|password|number|email`，没有 textarea）。Discourse 的「关于我」是多行，这里的「简介」只能是一行——想要多行得换成 `TxBlockSlot` + `TxTextarea`，但那会跳出 `TxGroupBlock` 的整齐排版。按 design §5.6 保持了 `TxBlockInput`，**这是一处真实的能力缺口，不是我省事**。
26. **`TxSelect` 的 `allow-create` 回传的是「标签文本」本身，不是新 id**（`createOptionFromInput` 造的是 `{ value: label, label }`），未注册的值在已选 chip 上会 `String(value)` 回显。所以「新标签」必须由宿主的 store 去认领——这正是 G0 让 `createTopic` 接受标签名的原因。创建入口是面板底部的 `button.tuff-select__create`（也支持在多选输入框里按 Enter）。
27. **`TxIconButton` 的 `click` 转发原生事件**（`emit("click", event)`），所以嵌在 `TxCardItem clickable` 里可以用 `@click.stop` 拦住行点击。`TxAvatar` 的 `click` 则**不带载荷**（`emits: { click: [] }`），对它写 `@click.stop` 会炸。
28. **`TxTabItem` 的 `name` 同时是 key 和默认标签**。想要 URL 里是 ASCII（`?tab=activity`）而界面是中文，就得 `name="activity"` + `#name` 插槽放中文——`?tab=` 才能干净地 round-trip。

## 偏离任务书 / design §5.6–5.7 的地方（都有理由）

1. **活动 Tab 改成「宽扫描 + 每类分页」**：任务书让我按 `activityOfUser` 的默认窗口过滤。实测那样做时 `activityOfUser(60)` 先截断混合列表，talex 的 52 个赞会把书签挤到只剩 1 条（他实际有 4 条），于是「书签」chip 显示 1、点进去也只有 1 行——数字是错的。现在 `ACTIVITY_SCAN = 500` 拿全量、chips 按类计真实总数、面板每类最多渲染 `ACTIVITY_PAGE = 30` 行，超出时在底部写明「只显示最近 30 条，共 N 条」。
2. **`/u/[username]` 的 Tab 名是 ASCII，标签走 `#name` 插槽**（见限制 28），否则 `?tab=` 里会出现百分号编码的中文，而顶栏「我的帖子」已经指向 `?tab=activity`。
3. **非本人访问偏好设置：在 setup 里 `router.replace` + 根节点 `v-if`，不是路由中间件**。中间件确实「组件都不创建」，但 Nuxt 4 下 Pinia 的水合插件与首屏中间件的先后顺序没有保证，中间件里读到的可能还是默认会话（u1）而不是 localStorage 里的身份——那会把刚切过去的用户误判成陌生人。setup 里读一定是水合之后。表单藏在 `v-if` 后面，所以「不闪表单」不是靠时序抢跑，是结构上根本没渲染；冒烟第 5 步用 `Page.addScriptToEvaluateOnNewDocument` 装的观察者证明了这一点。
4. **主题下拉直写 `colorMode.preference`，不进「保存更改」**。它不是资料数据，是这台浏览器的偏好；顶栏那个切换按钮是立即生效的，同一件事在两处一个立即一个要保存会更难用。页面上注明了「立即生效，不需要保存」，代码里也写了理由。
5. **`<mark>` 用的是 `bg-$tx-color-primary-light-9` + `text-$tx-color-primary-dark-2`**（浅色 `#ecf5ff`/`#337ecc`，深色 `#18222c`/`#66b1ff`），因为这两个 token 在 `.dark` 里是**反向**定义的，正好构成 spec 说的「soft fill + 同色系 ink」。`@unocss/reset/tailwind-compat.css` 不重置 `mark`，浏览器默认是系统黄，深色下配深色文字会看不清——所以必须显式给一对 token，不能什么都不写。
6. **搜索的 `?q=` 用防抖 `router.replace`**（250ms），不是 `push`：逐字 push 会把历史塞满，按返回键要按十几次才回得去。
7. **通知的 reply 文案分两种**：收件人是话题作者 → 「回复了你的话题《…》」；否则（被回复的帖子作者）→ 「回复了你在《…》中的帖子」。store 的 `createPost` 会同时通知这两种人，统一写「你的话题」对第二种人是错的。
8. **system 通知落到 `/about`**：种子里的 system 通知没有 `topicId`，也没有任何载荷能指向具体内容。比起做一个点了没反应的行，指向站点介绍更诚实。文案是「来自 Tuff Forum 的系统消息」。
9. **`/users` 用表格自带的客户端排序**（未传 `sort`，所以是非受控模式）。整个目录只有 12 人、一页放得下，Phase F 给话题列表做全局受控排序是因为那里有分页；这里没有分页，页内排序 = 全局排序。
10. **偏好设置多了一个「放弃修改」**（任务书只写了「保存更改」）。既然编辑是暂存的，就该有一个把草稿丢回去的出口；它同时让「暂存」这件事在界面上可见。
11. **`/u/[username]` 的 `profile` 是 setup 期一次性解析的常量**，配 `definePageMeta({ key: route => route.path })`；沿用 Phase E 对 `/c/[slug]` 的做法（不能用 `fullPath`，否则每次改 `?tab=` 都重挂载，Tab 状态会被重置）。

## 给 Phase H 的提醒

- `pageOnly()` 排除的四类容器不变（`.tx-bui-sidebar-nav` / `.tuff-select__panel` / `.tx-modal__overlay` / `.tx-drawer`），但**「取第一个元素」也要套**，不只是计数——侧栏 footer 的 `TxCardItem` 是最容易误伤的那个（见上）。
- 读 `TxBadge` 的数字请复用 `scripts/verify-user-pages.mjs` 的 `BADGE_DIGITS`，别用 `textContent`。
- `localStorage` 在页面**没有发生任何 store 变更**时是空的（持久化插件只在 `$subscribe` 触发时写）。冒烟脚本要先访问一次 `/t/<id>`（浏览数 +1）把种子落盘，再去读。
- 切换身份的 `loginAs` 必须「先到中立路由写会话，再导航到目标路由」：在目标路由上写会话再 `reload()`，重载的是**上一个身份被重定向到的那个 URL**（`/u/x/preferences` 会先把陌生人送去 `/u/x`）。
- `check:styles` 扫 `:style=` 时注意 `app/pages/search.vue` 和种子内容里有「style」这个英文词出现在文案/正文里（Phase C 已经把 `:style="…"` 那种写法从种子里改掉了），当前 `grep -rnE '<style|[ :]style=|v-bind:style'` 对 `app/ modules/ scripts/` 是 0 命中。
- 13 条路由已全部存在（`/`、`/categories`、`/c/[slug]`、`/tags`、`/tag/[slug]`、`/t/[id]`、`/new`、`/u/[username]`、`/u/[username]/preferences`、`/users`、`/notifications`、`/bookmarks`、`/search`）+ `/about` = 14 条，`smoke-routes.mjs` 可以直接按 PRD 的 AC3 列表跑。
