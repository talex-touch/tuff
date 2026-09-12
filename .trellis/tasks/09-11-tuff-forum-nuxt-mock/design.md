# Design — Tuff Forum (Nuxt 4 + Tuffex 0.5.0, 纯前端 mock)

依据：`prd.md`、`research/tuffex-0.5.0-inventory.md`（组件 API / 包结构均已实证）。

## 1. 边界与总体结构

```
~/Workspace/Projects/tuff-forum/            # 独立 git 仓库，独立 pnpm（不进 talex-touch workspace）
├── package.json  .npmrc  nuxt.config.ts  uno.config.ts  tsconfig.json  eslint.config.mjs  vitest.config.ts
├── modules/tuffex-components.ts            # Nuxt module：扫描 tuffex dist 自动注册 Tx* 组件
├── scripts/
│   ├── tuffex-icon-classes.mjs             # 扫描 dist/es/**/*.js 收集 i-carbon-*/i-ri-* → uno safelist
│   ├── check-styles.mjs                    # R2 守卫（含 --self-test）
│   └── smoke-routes.mjs                    # AC3 路由冒烟（console error / 图标可见性）
├── tests/                                  # vitest：seed 确定性、store 行为、持久化 round-trip
└── app/
    ├── app.vue          # NuxtLayout/NuxtPage + TxToastHost + TxCommandPalette + 全局快捷键
    ├── error.vue        # TxEmptyState(variant=error/no-data) + 返回首页
    ├── layouts/default.vue   # 顶栏 + 侧栏(TxSidebarNav) + 内容区；<1024px 侧栏进 TxDrawer
    ├── pages/           # 13 条路由（见 §4）
    ├── components/      # ForumHeader ForumSidebar LoginModal TopicList TopicRow TopicStats PostCard ReplyComposer TopicTimeline CategoryTag UserAvatar
    ├── composables/     # useCurrentUser useRelativeTime useForumNav useCommandPalette useTopicFilters
    ├── stores/          # forum.ts session.ts（Pinia setup store）
    ├── data/            # types.ts prng.ts seed.ts（确定性种子）
    └── plugins/persist.client.ts           # localStorage 水合 + 订阅保存
```

不做 SSR（`ssr: false`）：状态来自 localStorage/时间，SSR 只会带来 hydration 风险；Tuffex 多个组件顶层读 `window`（drawer / markdown-* / radio），SPA 下零风险。

## 2. 依赖与工具链（精确版本）

| 用途 | 包 |
|---|---|
| 框架 | `nuxt@4.5.2`（Vite 8 / rolldown）、`vue@3.5.42` |
| UI | `@talex-touch/tuffex@0.5.0`（自动带 `@talex-touch/utils@2.1.0` 等运行时依赖） |
| 原子类 / 图标 | `@unocss/nuxt@66.10.2`、`unocss@66.10.2`、`@unocss/reset@66.10.2`、`@iconify-json/carbon@1.2.27`、`@iconify-json/ri@1.2.10` |
| 状态 / 工具 | `pinia@4.0.3`、`@pinia/nuxt@1.0.2`、`@vueuse/core@14.4.0`、`@vueuse/nuxt@14.4.0`、`dayjs@1.11.23`、`@nuxtjs/color-mode@4.0.1` |
| 质量 | `@nuxt/eslint@1.17.0`、`eslint@9.39.4`、`typescript@5.9.3`、`vue-tsc@3.3.11`、`vitest@^3.2.7`（monorepo 已在 Node 26 上验证；5.0.0 刚发布，风险未知） |

`.npmrc`：`auto-install-peers=false`、`strict-peer-dependencies=false`（`@talex-touch/utils` 声明 `electron` peer，只允许告警、绝不安装）。

`package.json` scripts：`dev` / `build` / `preview` / `typecheck`（`nuxt typecheck`）/ `lint` / `test`（`vitest run`）/ `check:styles` / `smoke` / `check`（= typecheck + lint + check:styles + test）。

## 3. Tuffex 接入

### 3.1 样式
`nuxt.config.css = ['@unocss/reset/tailwind-compat.css', '@talex-touch/tuffex/style.css']`。`style.css`（648 KB）已含全部 base tokens 与 `.dark` 覆盖；不再额外引 `base.css`。`./vite` 按需插件未发布，不用。
`body` 的字体 / 背景 / 前景通过 `useHead({ bodyAttrs: { class: 'min-h-screen bg-$tx-bg-color-page text-$tx-text-color-primary [font-family:var(--tx-font-family)]' } })` 用工具类设置（R2 允许）。

### 3.2 组件注册（`modules/tuffex-components.ts`）
复刻 `apps/nexus/modules/tuffex-components.ts` 的思路，但扫描的是 **npm dist**：
1. `createRequire(import.meta.url).resolve('@talex-touch/tuffex/package.json')` 定位 `dist/es`。
2. 遍历子目录，跳过 `ai` `base` `pro` `utils` `_virtual` `packages`；读取 `index.d.ts`，解析 `export { A, B }` / `export { default as TxFoo }`，对 `export * from './src'`（pagination / breadcrumb / steps）跟进一跳读 `src/index.d.ts`。
3. 名称匹配 `/^(Tx|Tuff)[A-Z][A-Za-z0-9]*$/` 且不是 `type` 导出 → `addComponent({ name, filePath: '@talex-touch/tuffex/<dir>', export: name })`。
4. 同名冲突直接 `throw`（与 Nexus 一致）。
回退方案：若 `addComponent` 对裸包说明符解析失败，SFC 改为显式 `import { TxButton } from '@talex-touch/tuffex/button'`（Nexus 业务代码正是这种写法，已验证可行）。

### 3.3 图标类
Tuffex 模板把图标渲染为 `<i class="i-carbon-…">`，而 UnoCSS 默认不扫描 `node_modules`。`scripts/tuffex-icon-classes.mjs` 在 `uno.config.ts` 加载时同步扫描 `node_modules/@talex-touch/tuffex/dist/es/**/*.js`，正则 `\bi-(carbon|ri)-[a-z0-9-]+` 去重后进 `safelist`（当前 39 个，版本升级自动跟随）。`presetIcons({ scale: 1.2 })` 自动发现已安装的 `@iconify-json/*`。`content.pipeline.include` 追加 `app/**/*.ts`，让数据模块里的图标名（分类 icon、通知类型 icon）也能被提取。

### 3.4 深色模式
`@nuxtjs/color-mode` `{ classSuffix: '', preference: 'system', fallback: 'light', storageKey: 'tuff-forum:color-mode' }` → `html.dark`，与 Tuffex `.dark` 选择器及 `TxMarkdownView/TxMarkdownEditor` 的 MutationObserver 直接匹配。切换按钮：`TxIconButton icon=i-carbon-sun|i-carbon-moon`。

## 4. 数据模型与状态

### 4.1 类型（`app/data/types.ts`）
```ts
User         { id, username, displayName, bio, location, website, avatarColor, joinedAt, role: 'admin'|'moderator'|'member', notifyPrefs: { reply, like, follow } }
Category     { id, slug, name, description, color, icon /* i-carbon-* */ }
Tag          { id, slug, name, color }
Topic        { id, slug, title, categoryId, tagIds[], authorId, createdAt, lastActivityAt, views, pinned, closed }
Post         { id, topicId, authorId, content /* markdown */, createdAt, editedAt?, replyToPostId?, likeUserIds[] , deleted? }
Notification { id, recipientId, type: 'reply'|'like'|'follow'|'mention'|'system', actorId, topicId?, postId?, createdAt, read }
Bookmark     { userId, postId, createdAt }        Follow { followerId, followeeId, createdAt }
ForumState   { version: 1, seededAt, users, categories, tags, topics, posts, notifications, bookmarks, follows }
SessionState { currentUserId: string | null }
```
派生量（回复数 / 点赞数 / 参与者 / 话题数 / 获赞总数）一律 getter 计算，不冗余存储。

### 4.2 种子（`app/data/seed.ts`）
`createSeed(now = Date.now())`：mulberry32 固定种子，**无 `Math.random`**。规模：12 用户（含 1 admin、1 moderator）、8 分类、16 标签、~45 话题、~220 帖子（Markdown：标题/列表/引用/代码块/链接混合）、~30 通知、若干书签与关注。时间戳 = `now - offset`，偏移由 PRNG 生成，所以相对时间显示自然。`now` 可注入，供 vitest 断言完全确定。

### 4.3 Stores（Pinia setup store，显式 `import { defineStore } from 'pinia'`，不依赖 Nuxt 自动导入，便于 vitest）
- `useSessionStore`：`currentUserId`、`login(userId)`、`logout()`、getter `currentUser`、`isAdmin`。
- `useForumStore`：state 即 `ForumState`；actions：`createTopic` `createPost`（自动生成 reply/mention 通知）`editPost` `deletePost` `toggleLike`（生成 like 通知）`toggleBookmark` `toggleFollow`（follow 通知）`setPinned` `setClosed` `incrementViews` `markRead` `markAllRead` `updateProfile` `reset(now?)`；getters：`topicById` `postsOfTopic` `userByUsername` `sortedTopics(mode, filter)` `searchAll(q)` `unreadCount(userId)` `notificationsOf` `bookmarksOf` `statsOfUser(userId)`→`{topics, replies, likesReceived, likesGiven, followers, following}` `topicsOfUser` `repliesOfUser` `topLikedPostsOfUser` `topTopicsOfUser` `mostLikedByUsers(userId)`（摘要 Tab「最多点赞的用户」）`activityOfUser(userId)`（事件 kind：topic / reply / like / bookmark，供活动 Tab 过滤）`suggestedTopics(topicId, n)`（同类别优先、排除自身、按 `lastActivityAt`）。
- 权限规则集中在 `can(user, action, target)`（`app/data/permissions.ts`）：作者或 admin/moderator 可编辑删除；admin/moderator 可置顶关闭；访客不可写。UI 与 store 都调用它，测试直接断言。

### 4.4 持久化（`app/plugins/persist.client.ts`）
key `tuff-forum:state:v1` / `tuff-forum:session:v1`。启动：读取 → JSON.parse → `version` 校验通过则 `$patch`，否则 `reset()`。之后 `store.$subscribe(save, { detached: true })`，保存用 `useDebounceFn(…, 150)`。`reset()` 同步清 key。侧栏 footer 提供「重置示例数据」（`TxModal` 二次确认）。

## 5. 页面 → Tuffex 组件映射（以 Discourse 为形态基准）

对照对象是 Discourse 现行 UI（2023+ 带左侧 sidebar 的版本）。每个页面先写 Discourse 的结构，再写用哪些 Tx 组件复现；文案沿用 Discourse zh_CN 语言包的叫法（最新 / 新 / 热门 / 类别 / 标签 / 新话题 / 回复 / 分享 / 书签 / 建议话题 / 摘要 / 活动 / 偏好设置 / 已置顶 / 已关闭）。

### 5.1 壳（`layouts/default.vue`）
**Discourse**：顶栏 = 左 Logo，右 [搜索🔍] [☰ 侧栏开关] [头像+未读角标]；左侧 sidebar 分区：社区（话题 / 我的帖子 / 用户 / 关于）、类别（彩色方块 + 名称，末尾"全部类别"）、标签（热门标签，末尾"全部标签"）、我的（通知 / 书签）。"新话题"按钮**不在顶栏**，在话题列表的导航行右端。
**实现**：
- 顶栏 `<header class="sticky top-0 z-30 border-b border-$tx-border-color-light bg-$tx-bg-color">` → `TxContainer :max-width="'1400px'"` → `TxFlex align=center justify=space-between gap=12`：左 `TxTuffLogoStroke size=28 mode=hover` + 站名；右 `TxSearchInput`（桌面）/ `TxIconButton i-carbon-search`（窄屏，打开搜索页）+ `TxKbd`⌘K · `TxIconButton i-carbon-menu`（切换侧栏；桌面折叠 / 窄屏开 `TxDrawer`）· 主题 `TxIconButton i-carbon-sun|moon` · `TxBadge :value=unread` 包 `TxIconButton i-carbon-notification` · `TxDropdownMenu`（trigger `TxAvatar`；items：我的主页 / 我的帖子 / 书签 / 偏好设置 / 切换用户 / 退出登录）；访客 → `TxButton variant=primary`登录。
- 主体 `TxContainer :max-width="'1400px'"` → `TxRow :gutter="24"` → `TxCol :span="24" :lg="6" :xl="5"` 侧栏（`v-if="isDesktop && sidebarOpen"`）+ `TxCol` 内容 `<NuxtPage/>`。
- `ForumSidebar` = `TxSidebarNav` **groups**：`community`（话题 / 我的帖子 / 用户 / 关于）· `categories`（每个分类一项，`#item-icon` 槽渲染 `TxBadge dot :color="category.color"` 复现彩色方块；末尾"全部类别"）· `tags`（前 8 个标签，末尾"全部标签"）· `mine`（通知 badge=unread / 书签）；`workspace`={name:'Tuff Forum', description:'开发者社区'}；`search-placeholder`="筛选侧栏"；`#footer` 当前用户 `TxCardItem`（头像 / 显示名 / 角色）+「重置示例数据」。v-model ↔ `route.path`（`useForumNav`）。窄屏：`TxDrawer direction=left size=300 :title="'导航'"` 装同一个 `ForumSidebar`。
- `LoginModal`：`TxModal title=选择一个身份登录` → `TxStack` 的 `TxCardItem clickable`（`TxAvatar` / 显示名 / @username / 角色 `TxStatusBadge`）。

### 5.2 话题列表 `/`（Discourse `/latest`）
**Discourse**：导航行 = [最新 | 新 | 热门] pill 导航 + 类别下拉 + 标签下拉 + 右端 [+ 新话题]；下方是**表格**：话题（标题 + 类别徽标 + 标签；置顶话题额外显示摘要）| 发帖者（头像堆叠，最多 5）| 回复 | 浏览 | 活动（相对时间）。行整体可点。
**实现**：
- 导航行 `TxFlex align=center gap=8 wrap`：`TxFilterChips role=tablist`(最新 / 新 / 热门) · `TxSelect`类别（options 前置"全部类别"）· `TxSelect`标签 · 右端 `TxButton variant=primary icon=i-carbon-add`新话题（`ml-auto`；访客隐藏）。
- 桌面（`isDesktop`）：`TxDataTable hover :data :columns rowKey=id @row-click`，columns：`topic`(话题, auto) / `posters`(发帖者, width 140) / `replies`(回复, 80, sortable, align right) / `views`(浏览, 80, sortable) / `activity`(活动, 110, sortable)。`#cell-topic`：`TxFlex direction=column gap=4` → 标题行（`TxStatusBadge status=muted icon=i-carbon-pin`已置顶 / `i-carbon-locked`已关闭 + 标题 `font-medium`）+ 元行（`CategoryTag`(`TxTag :dot=category.color variant=plain`) + `TxTag variant=plain size=sm` × tags）+ 置顶话题的摘要 `text-$tx-text-color-secondary text-sm line-clamp-2`。`#cell-posters`：`TxAvatarGroup :max="5" size=small` → `TxAvatar name backgroundColor`。`#cell-activity`：相对时间 + `TxTooltip content=绝对时间`。
- 窄屏：`TxStack gap=0` 的 `TopicRow`(`TxCardItem clickable align=start`：avatar 槽首帖作者；title 槽同上；subtitle 元行；right 槽 `TopicStats`(`TxFlex gap=10`：i-carbon-chat 回复 · i-carbon-view 浏览 · 相对时间)) + `TxDivider`。
- 底部 `TxPagination pageSize=20 show-info prev-label=上一页 next-label=下一页`。首屏骨架：桌面 `TxRowSkeleton :rows="10" leading description trailing separated`；空 `TxEmptyState variant=search-empty title=没有话题 description=换个筛选条件试试`。

### 5.3 类别 `/categories` 与 `/c/[slug]`、标签 `/tags` 与 `/tag/[slug]`
**Discourse `/categories`**：两栏——左"类别"列表（彩色方块、名称、描述、话题数、最近话题标题×2），右"最新"话题简表。`/c/slug` = 话题列表 + 顶部类别横幅（名称 / 描述）。`/tags` = 标签云（名称 + 计数）。
**实现**：
- `/categories`：`TxRow gutter=24` → `TxCol :span=24 :lg=14`：`TxCard variant=plain padding=0` 内每个类别一行 `TxCardItem clickable`（avatar 槽 `TxBadge dot :color`；title 名称 + right `TxBadge :value=topicCount`；description 描述；下方 2 条最近话题 `TxCellLink @open`）+ `TxDivider`；`TxCol :lg=10`（桌面）："最新" `TxCardItem` 简表（标题 + 类别 + 相对时间）×10。
- `/c/[slug]`、`/tag/[slug]`：`TxBreadcrumb`（无 href，`@click` 路由）→ 横幅 `TxCard`（`TxCardItem`：avatar 槽 `TxBadge dot`；title 名称；description 描述；right `TxStatCard` 话题数 / 帖子数）→ §5.2 的列表（分类 / 标签固定，导航行仍可切最新 / 新 / 热门）。未知 slug → `createError({ statusCode: 404 })`。
- `/tags`：`TxFlex wrap gap=8` → `TxTag size=md pill :count @click`（按计数降序）。

### 5.4 话题页 `/t/[id]`（Discourse `/t/slug/id`）
**Discourse**：标题区（标题 + 类别徽标 + 标签 + 置顶/关闭标记）；帖子流：每帖 = 左头像、右侧 [用户名 · 角色 · 时间 · #楼层] 头行 / 正文 / 控制行（赞♥+计数 · 链接 · 书签 · 回复；作者或管理可见 ✎编辑 与 ··· 更多：删除）；被回复的帖子在头行右侧显示"↰ 回复 @user"可点跳转；右侧**时间线滑条**（1/N、创建时间 → 最近回复时间）；话题底部控制条 [书签] [分享] [标记] [回复]，以及"通知级别"下拉（关注 / 跟踪 / 常规 / 静音）；再往下"建议话题"简表；**回复编辑器是从底部滑出的面板**，带 Markdown 编辑 + 预览。
**实现**：
- 头部：`TxBreadcrumb` → `h1 class="text-2xl font-semibold"`（`v-if closed` 前置 `i-carbon-locked`）→ 元行 `CategoryTag` + `TxTag plain` × tags + `TxStatusBadge`已置顶/已关闭 → 管理 `TxDropdownMenu`（置顶 / 取消置顶 / 关闭 / 重开；仅 staff）。
- `TxRow gutter=24`：主列 `TxCol :span=24 :lg=17`；右栏 `TxCol :lg=7`（桌面）。
- 主列 `TxStack gap=12` → `PostCard`(`TxCard variant=plain :padding="16"`)：`TxFlex gap=14 align=start`：左 `TxAvatar size=large name backgroundColor clickable @click→主页`；右 `TxFlex direction=column gap=8 class="flex-1 min-w-0"`：头行 `TxFlex align=center gap=8`（显示名 `TxCellLink @open` · 角色 `TxStatusBadge size=sm`(admin/moderator) · 相对时间 `text-$tx-text-color-secondary` · `ml-auto` `#n` · 若 `replyToPostId`：`TxButton variant=bare size=sm icon=i-carbon-reply`"回复 @user" 点击滚到目标帖）· 正文 `TxMarkdownView :content`（已删除 → `TxAlert type=info` "此帖已被删除"）· 控制行 `TxFlex gap=4 align=center`：`TxButton variant=bare size=sm :icon="liked ? 'i-carbon-favorite-filled' : 'i-carbon-favorite'"` +计数 · `TxCopyButton :text=链接 copy-label=链接 copied-label=已复制 size=sm` · `TxIconButton :icon="bookmarked ? 'i-carbon-bookmark-filled' : 'i-carbon-bookmark'" :pressed label=书签 size=sm` · `ml-auto` `TxButton variant=bare size=sm icon=i-carbon-edit`编辑(可编辑者) · `TxDropdownMenu`···(删除 danger) · `TxButton variant=secondary size=sm icon=i-carbon-reply`回复（打开底部编辑器并带引用上下文；已关闭且非 staff 隐藏）。编辑态：正文替换为 `TxMarkdownEditor` + 保存 / 取消。
- 话题底部控制条 `TxCard variant=plain` → `TxFlex gap=8 align=center wrap`：`TxIconButton i-carbon-bookmark`（书签首帖）· `TxCopyButton`分享 · `TxSelect`通知级别（关注 / 跟踪 / 常规 / 静音；v1 为页面内 mock 状态，不入 store）· `ml-auto` `TxButton variant=primary icon=i-carbon-reply`回复；已关闭 → `TxAlert type=warning title=此话题已关闭，不再接受新回复`；访客 → `TxEmptyState variant=permission size=small layout=horizontal title=登录后参与讨论 primaryAction=登录`。
- **回复编辑器 = `TxDrawer direction=bottom size=420 :mobile-adapt="true" :close-on-click-mask="false"`**（Discourse 的底部 composer）：`#header` 槽显示"回复：{话题标题}"或"回复 @user 的 #n"；主体 `TxMarkdownEditor v-model default-mode=source :min-height="240"`（Discourse 是源码 + 预览分栏，用编辑器自带 source / preview 模式切换代替）；引用回复时预填 `> 引用文本` ；`#footer` `TxFlex justify=flex-end gap=8`：取消 · `TxButton variant=primary :loading :disabled=!content.trim()`回复。成功后关闭、`toast success`、滚动到新帖。
- 右栏（桌面，`sticky top-20` 由 `class` 实现）：`TxCard variant=plain`：`TxTimeline` → `TxTimelineItem`(创建 / 置顶 / 关闭 / 最新回复，`:active` 最后一项) 复现时间线滑条；`TxStatCard`×2（`TxGrid cols=2`：回复数、点赞数）；参与者 `TxAvatarGroup :max="8"`。
- 底部 **建议话题**：`TxDivider`建议话题 → 同类别最近 5 条（排除当前）的简表：`TxCardItem clickable`（title 标题 + 类别徽标；right 回复数 · 相对时间）。
- `onMounted` → `incrementViews`（每会话每话题一次，`sessionStorage` 去重）。

### 5.5 新话题 `/new`
**Discourse**：composer 面板（标题输入 + 类别下拉 + 标签选择 + Markdown 编辑 / 预览分栏 + 创建按钮）。这里做成独立页面以便深链，视觉沿用 composer 的顺序。
**实现**：`TxCard` → `TxForm :model :rules label-position=top` → `TxFormItem prop=title`（`TxInput placeholder=输入标题，说清楚这个话题是什么`）· `TxFlex gap=12 wrap`（`TxFormItem prop=categoryId` `TxSelect :options`类别 · `TxFormItem prop=tagIds` `TxSelect multiple searchable allow-create`可选标签）· `TxFormItem prop=content`（`TxMarkdownEditor default-mode=source :min-height="320" placeholder=在这里输入内容…`）→ `TxFlex justify=flex-end gap=8`：取消 · `TxButton variant=primary :loading`创建话题。规则：标题 ≥ 5 字、正文 ≥ 10 字、类别必选。成功 → `createTopic` → `toast success` → `/t/[id]`。访客 → `TxEmptyState variant=permission`。

### 5.6 用户页 `/u/[username]`、偏好 `/u/[username]/preferences`、用户目录 `/users`
**Discourse `/u/name`**：横幅 = 大头像 + 用户名 / 显示名 + 简介 + [关注 / 编辑资料]；统计条：加入时间 · 最近发帖 · 已读 · 已送出的赞 · 已收到的赞 · 话题 · 帖子；Tabs：摘要 / 活动 / 通知 / 徽章 / 偏好设置。摘要页分块："热门回复"、"热门话题"、"最多点赞的用户"。活动页子过滤：全部 / 话题 / 回复 / 赞 / 书签。
**实现**：
- 横幅 `TxCard` → `TxCardItem align=start`（avatar 槽 `TxAvatar size=xlarge name backgroundColor`；title 显示名 + `TxStatusBadge`角色；subtitle `@username · 加入于 {date}`；description 简介 + `TxFlex gap=12`（`i-carbon-location` 所在地 · `TxCellLink external` 网站）；right `TxFlex gap=8`：`TxButton :variant="following ? 'secondary' : 'primary'" :icon="following ? 'i-carbon-checkmark' : 'i-carbon-user-follow'"`关注/已关注（非本人）· `TxButton variant=secondary icon=i-carbon-edit`编辑资料（本人）· 退出登录（本人）)。
- 统计条 `TxGrid :cols="{xs:2, md:3, lg:6}" :gap="12"` → `TxStatCard`：话题 / 帖子 / 已收到的赞 / 已送出的赞 / 关注者 / 正在关注。
- `TxTabs indicator-variant=pill`：`TxTabItem name=摘要`（`TxRow gutter=16`：热门回复 `TxCardItem` ×5（按赞）· 热门话题 ×5 · 最多点赞的用户 `TxAvatarGroup`）· `name=活动`（`TxFilterChips`全部 / 话题 / 回复 / 赞 / 书签 → `TxTimeline` 或 `TxCardItem` 列表）· `name=通知`（仅本人，= `/notifications` 的列表组件复用）· `name=偏好设置`（仅本人，点击跳 `/u/[username]/preferences`）。
- `/u/[username]/preferences`（非本人 → `navigateTo` 主页）：Discourse 偏好页是左侧子导航（账户 / 个人资料 / 邮件 / 通知 / 界面）+ 右侧表单。实现：`TxTabs placement=left`：`个人资料`（`TxGroupBlock name=个人资料` → `TxBlockInput` 显示名 / 简介 / 所在地 / 网站）· `头像`（`TxRadioGroup type=card` → `TxRadio` 内 `TxAvatar` 8 色预设）· `通知`（`TxGroupBlock` → `TxBlockSwitch` 有人回复 / 有人点赞 / 有人关注）· `界面`（`TxBlockSelect` 主题：跟随系统 / 浅色 / 深色 → 写 colorMode）→ 底部 `TxButton variant=primary`保存更改 → `updateProfile` + `toast success`。
- `/users`：Discourse 用户目录是可排序表格（用户名 / 收到的赞 / 送出的赞 / 话题 / 回复 / 浏览 / 加入）。实现：`TxSearchInput` + `TxDataTable hover sortable`（`#cell-user`：`TxAvatar size=small` + 显示名 `TxCellLink` + `@username`；角色 `TxStatusBadge`；已收到的赞 / 话题 / 回复 / 加入时间）`@row-click` → 主页。

### 5.7 通知 `/notifications`、书签 `/bookmarks`、搜索 `/search`
**Discourse**：通知列表按类型带图标（回复 ↰ / 赞 ♥ / 提及 @ / 关注 / 系统），未读加粗，"全部标为已读"；书签是带话题标题 + 摘要 + 移除的列表；搜索页有 [话题/帖子 | 用户 | 类别/标签] 结果分组。
**实现**：
- `/notifications`：`TxFlex justify=space-between`（`TxFilterChips`未读 / 全部 · `TxButton variant=secondary icon=i-carbon-checkmark`全部标为已读）→ `TxCard variant=plain padding=0` → `TxCardItem clickable :iconClass`(reply→`i-carbon-reply` / like→`i-carbon-favorite` / mention→`i-carbon-at` / follow→`i-carbon-user-follow` / system→`i-carbon-information`)（title 文案"{actor} 回复了你的话题《…》"，未读 `font-semibold`；subtitle 相对时间；right `TxBadge dot variant=primary :open=!read`）+ `TxDivider`；空 `TxEmptyState variant=no-data title=没有通知`。
- `/bookmarks`：`TxCardItem` 列表（title 话题标题；description 帖子摘要 60 字；subtitle 作者 · 相对时间；right `TxIconButton icon=i-carbon-trash-can label=移除书签 status=danger`）；空 `TxEmptyState variant=blank-slate title=还没有书签 description=在帖子下方点击书签图标即可收藏`。
- `/search`：`TxSearchInput`（同步 `?q=`）→ `TxTabs`：`TxTabItem name=topics`（`#name` 槽"话题 `TxBadge :value`"）→ §5.2 窄屏样式列表；`posts`（`TxCardItem`：title 话题标题；description 命中片段；subtitle 作者 · 时间）；`users`（`TxCardItem` 头像 + 显示名 + @username）。无结果 `TxEmptyState variant=search-empty`。
- `error.vue`：`TxEmptyState :variant="404 ? 'no-data' : 'error'" title="哎呀，这个页面不存在" description primaryAction=返回首页` → `clearError({ redirect: '/' })`。

**命令面板**：`app.vue` 挂 `TxCommandPalette v-model placeholder=搜索话题、用户或页面…`；commands = 固定页面 + 最近活跃 20 话题 + 全部用户（keywords 含 username）；`@select` → `router.push`；`useEventListener(document,'keydown')` 捕获 ⌘K / Ctrl+K。

**a11y 文案**：Tuffex 默认英文 aria 文案通过 props 传中文（`TxPagination` prev/next-label、`TxDrawer` title、`TxSidebarNav` aria-label / workspace-label、`TxCopyButton` copy/copied-label、`TxIconButton` label）。

## 6. R2 守卫（`scripts/check-styles.mjs`）

规则（对 `app/`、`modules/`、`layouts` 等源码目录递归）：① `.vue` 含 `<style` → 失败；② 任何源码含 ` style="`、`:style=`、`v-bind:style`、`:style.` → 失败；③ 存在 `.css/.scss/.sass/.less/.styl` 文件 → 失败；④ `nuxt.config.ts` 的 `css:` 条目必须以包名开头（允许 `@unocss/reset/*`、`@talex-touch/tuffex/*`）。`--self-test`：在临时目录写入三类违规夹具，逐一断言脚本返回非零并输出定位；再对干净夹具断言零退出（遵循 Guard Thinking Guide：守卫必须在保护对象损坏时失败）。

## 7. 验证策略

- 单测（vitest, node 环境）：seed 确定性（同 now 两次生成深度相等；不同 now 仅时间戳不同）、`createTopic/createPost/toggleLike/toggleBookmark/toggleFollow` 状态与通知副作用、权限矩阵、`serialize→hydrate` round-trip、版本不匹配回退 reseed。
- 冒烟（`scripts/smoke-routes.mjs`）：启动 `nuxt dev`（或 `nuxt preview`）后，用本机 Chrome headless（`--headless=new --enable-logging=stderr --virtual-time-budget=8000`）逐一打开 13 条路由：断言 stderr 无 `[Vue warn]` / `Uncaught`；`--dump-dom` 含每页的标志元素（如 `.tx-pagination`、`.tx-sidebar-nav`）。图标可见性：抓取 UnoCSS 产出（dev：`/__uno.css`；build：`.output/public/_nuxt/*.css`）断言每个 safelist 图标类都有 `--un-icon`/`mask-image` 规则，并在 `/t/[id]` 与 `/` 的 DOM 中出现 `i-carbon-*` 元素。若 `ego-browser` CDP 可用，再补 `getComputedStyle(el).maskImage !== 'none'` 的实测。Chrome 在 macOS 上可能不退出 → 脚本自带看门狗（memory：core-app-component-screenshot-without-cdp）。
- 手动清单：AC4 交互链路 + 刷新保留 + 重置、AC5 深色、AC6 访客态，用冒烟脚本的 CDP 步骤或手动在浏览器执行，结果写回 `prd.md` 勾选。

## 8. 取舍与已知限制

- 不用 `TxNavBar` 做桌面顶栏：它是 44px 移动栏，左右槽被包在 `<button>` 内，无法承载多个交互控件。
- `TxBreadcrumb` 带 `href` 会渲染 `<a>` 整页跳转；一律不传 href、用 `@click` 路由。
- `TxCellLink` 不自行导航（Electron 约束）→ 统一 `@open` → `router.push`。
- `TxCol` 断点在挂载时读 `window.innerWidth`，SPA 下无 SSR 抖动问题。
- 全量 `style.css` 648 KB：按需插件未发布，接受；生产构建由 Vite 压缩。
- 组件缺陷（若发现）记录到 `task.json.notes`，不改 Tuffex 源码。
