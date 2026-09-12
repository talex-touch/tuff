# Implement — Tuff Forum

执行位置：`~/Workspace/Projects/tuff-forum`（新目录）。每个阶段结束运行该阶段的校验命令；任何阶段失败先修再进下一阶段。Trellis 分派：每个阶段 = 一次 `trellis-implement` + 一次 `trellis-check`。

## Phase A — 脚手架（对应 AC1 前半）
- [x] A1 `mkdir -p ~/Workspace/Projects/tuff-forum && git init`；写 `.gitignore`（node_modules / .nuxt / .output / dist / .data / *.log）。
- [x] A2 `package.json`（name `tuff-forum`, private, type module, `packageManager: pnpm@11.24.0`, engines node >=26, scripts, 精确版本依赖见 design §2）、`.npmrc`（`auto-install-peers=false`, `strict-peer-dependencies=false`）。
- [x] A3 `nuxt.config.ts`（`ssr:false`、modules、css、colorMode、`app.head`(lang zh-CN, title)、`compatibilityDate: '2026-09-11'`、`typescript.strict`）；`uno.config.ts`（presetWind3 + presetIcons{scale:1.2} + safelist(scan) + pipeline include app ts）；`tsconfig.json`（extends .nuxt）；`eslint.config.mjs`（`withNuxt`）；`vitest.config.ts`（alias `~`→`app`, environment node, include `tests/**/*.test.ts`）。
- [x] A4 最小 `app/app.vue`（一个 `TxButton` + `TxPagination`）。
- [x] A5 `pnpm install`（预期仅 electron peer 告警）→ `pnpm dev` 能起（curl `http://localhost:3000/` 200）→ `pnpm typecheck` 0 error。
- 回滚点：整个目录可删。

## Phase B — Tuffex 接入（AC3 图标前提）
- [x] B1 `modules/tuffex-components.ts`（design §3.2）并加入 `modules`；`scripts/tuffex-icon-classes.mjs`（design §3.3）。
- [x] B2 `app.vue` 加 `useHead` bodyAttrs（design §3.1）、`TxToastHost`；临时页渲染 `TxPagination`/`TxEmptyState`/`TxMarkdownEditor`，确认箭头 / 图标 / 工具栏图标可见。
- [x] B3 校验：`curl -s localhost:3000/__uno.css | grep -c 'i-carbon-chevron-right'` ≥1（或从 `.nuxt`/dev 产物确认）；Chrome headless 打开 `/` stderr 无 `[Vue warn]`；`pnpm typecheck`。
- 风险：`addComponent` 裸说明符不解析 → 回退显式子路径导入（design §3.2）。

## Phase C — 数据与状态（AC4 基础）
- [x] C1 `app/data/types.ts` `prng.ts` `seed.ts` `permissions.ts`（design §4.1–4.2）。
- [x] C2 `app/stores/forum.ts` `session.ts`（design §4.3）；`app/plugins/persist.client.ts`（§4.4）。
- [x] C3 `tests/seed.test.ts` `tests/forum-store.test.ts` `tests/persist.test.ts`（design §7 单测清单）。
- [x] C4 校验：`pnpm test` 全绿；`pnpm typecheck`。

## Phase D — 全局壳（AC5 / AC6 / R5）
- [x] D1 `layouts/default.vue` + `components/ForumHeader.vue`（Discourse 顶栏：Logo / 搜索 / ☰ / 主题 / 通知角标 / 头像菜单；**无**新话题按钮）`ForumSidebar.vue`（`TxSidebarNav` groups：社区 / 类别(彩色圆点) / 标签 / 我的）`LoginModal.vue` `UserAvatar.vue`；`composables/useCurrentUser.ts` `useForumNav.ts` `useRelativeTime.ts`（dayjs + `zh-cn` + relativeTime）。见 design §5.1。
- [x] D2 深色切换（color-mode）、通知角标、用户菜单、切换用户 / 退出、窄屏 `TxDrawer`。
- [x] D3 `app.vue` 命令面板 + ⌘K；`error.vue`。
- [x] D4 校验：dev 下手动/冒烟打开 `/`：切深色 `html.dark` 出现且刷新保留；退出后顶栏变登录按钮；`pnpm typecheck && pnpm lint`。

## Phase E — 页面批 1：列表 / 分类 / 标签（R4.1–R4.2, AC7）
- [x] E1 `components/TopicList.vue`（桌面 `TxDataTable` 话题 | 发帖者 | 回复 | 浏览 | 活动；窄屏 `TopicRow`）`TopicListNav.vue`（[最新|新|热门] + 类别/标签下拉 + 右端「新话题」）`TopicRow.vue` `TopicStats.vue` `CategoryTag.vue`；`composables/useTopicFilters.ts`（模式 / 分类 / 标签 / 分页 ↔ query）。见 design §5.2。
- [x] E2 `pages/index.vue` `categories.vue`（两栏：类别列表 + 最新）`c/[slug].vue`（类别横幅 + 列表）`tags.vue`（标签云）`tag/[slug].vue`；骨架（`TxRowSkeleton` + `useDeferredLoading`）、空态、404。见 design §5.3。
- [x] E3 校验：5 条路由无 warn；未知 slug 显示 error.vue；`pnpm typecheck && pnpm lint`。

## Phase F — 页面批 2：话题详情 / 发帖（R4.3–R4.4, AC4）
- [x] F1 `components/PostCard.vue`（左头像 + 头行 / 正文 / 控制行）`ReplyComposer.vue`（**`TxDrawer direction=bottom` 底部 composer**）`TopicTimeline.vue` `TopicControls.vue`（底部控制条：书签 / 分享 / 通知级别 mock / 回复）`SuggestedTopics.vue`；`pages/t/[id].vue`（点赞 / 引用 / 书签 / 编辑 / 删除 / 置顶 / 关闭 / 回复回链滚动 / 浏览计数）。见 design §5.4。
- [x] F2 `pages/new.vue`（`TxForm` 校验 → createTopic → toast → 跳转）。
- [x] F3 校验：发帖 → `/` 出现；回复 → 详情出现且回复数 +1；已关闭话题 composer 变 `TxAlert`；访客看到 permission 空态；刷新后保留。

## Phase G — 页面批 3：用户 / 通知 / 书签 / 搜索（R4.5–R4.10）
- [x] G1 `pages/u/[username]/index.vue`（横幅 + 6 项统计条 + Tabs 摘要 / 活动 / 通知 / 偏好设置）`pages/u/[username]/preferences.vue`（`TxTabs placement=left`：个人资料 / 头像 / 通知 / 界面）`pages/users.vue`（可排序目录表）。见 design §5.6。
- [x] G2 `pages/notifications.vue`（按类型图标 + 未读加粗 + 全部标为已读）`pages/bookmarks.vue` `pages/search.vue`（话题 / 帖子 / 用户 Tabs）。见 design §5.7。
- [x] G3 校验：关注 → 关注者 +1；编辑资料 → 主页更新；标记已读 → 角标减少；搜索 Tabs 计数正确；`pnpm typecheck && pnpm lint`。

## Phase H — 守卫与全量验证（AC1–AC8）
- [ ] H1 `scripts/check-styles.mjs`（含 `--self-test`）+ script `check:styles`。
- [ ] H2 `scripts/smoke-routes.mjs`（design §7）+ script `smoke`；对 13 条路由跑通，产出报告到 `reports/smoke.json`（gitignore 可选）。
- [ ] H3 `pnpm check`（typecheck + lint + check:styles + test）→ `pnpm build` → `pnpm smoke`（基于 preview 或 dev）。
- [ ] H4 把每条 AC 的证据（命令 + 关键输出）回填到 `prd.md` 勾选；组件缺陷记录到 `task.json.notes`。

## Phase I — 收尾
- [ ] I1 `~/Workspace/Projects/tuff-forum` 初始提交（需用户确认后执行）；talex-touch 仓库内仅提交 `.trellis/tasks/09-11-tuff-forum-nuxt-mock/**`（按 Trellis 3.4，`--no-gpg-sign`，只 stage 自己的文件）。
- [ ] I2 Trellis 3.3 spec update：若本任务沉淀了"Tuffex 作为 npm 包接入 Nuxt"的可复用规则（图标 safelist、dist 扫描注册、utils electron peer），追加到 `.trellis/spec/frontend/` 对应指南；否则记录 no-op 理由。

## 验证命令速查
```bash
cd ~/Workspace/Projects/tuff-forum
pnpm install && pnpm dev                 # AC1
pnpm typecheck && pnpm lint && pnpm test # AC1/AC8
pnpm check:styles && pnpm check:styles --self-test   # AC2
pnpm build && pnpm smoke                 # AC3
```

## 风险文件 / 回滚点
- `modules/tuffex-components.ts`、`uno.config.ts`：错了整站无图标/无组件 → Phase B 独立验证后再进 C。
- `app/plugins/persist.client.ts`：坏数据导致白屏 → hydrate 全程 try/catch，失败即 reseed。
- 每个 Phase 完成后 `git commit`（tuff-forum 仓库内，经用户同意）作为回滚点；未同意前用 `git stash`/目录快照。
