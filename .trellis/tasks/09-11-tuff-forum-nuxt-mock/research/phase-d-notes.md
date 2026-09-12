# Phase D notes — Discourse app shell

实现由 `impl-phase-d` 代理完成，但该代理在跑验证前被推理网关 503 中断，**验证与本笔记由主会话补做**（2026-09-12）。代码与门禁均为代理产出，未改动。

## 文件

- `app/composables/` — `useRelativeTime.ts`（dayjs + zh-cn + relativeTime）、`useForumNav.ts`（侧栏 items/groups ↔ 路由）、`useShell.ts`（isDesktop / sidebarOpen 持久化 / drawerOpen / loginOpen / paletteOpen）、`useCurrentUser.ts`
- `app/components/` — `ForumHeader.vue`(117)、`ForumSidebar.vue`(94)、`LoginModal.vue`(39)、`UserAvatar.vue`(31)
- `app/layouts/default.vue`(39)、`app/app.vue`(74, 命令面板 + ⌘K + TxToastHost)、`app/error.vue`(38)、`app/pages/about.vue`(78)、`app/pages/index.vue`(15, Phase E 替换)
- `app/pages/[...slug].vue`(10) — **计划外新增**：把未匹配 URL 变成页面级 404，否则冷加载会产生 vue-router "no match" 警告与 Nuxt `NUXT_E1005` 诊断
- `app/utils/user-role.ts`(24) — 角色中文名 / 徽标 tone
- `scripts/lib/cdp.mjs`(284) — 无依赖 CDP 驱动（launch + 看门狗 + open/evaluate/waitFor/emulate/key/type/screenshot/problems），Phase H 复用
- `scripts/verify-shell.mjs`(237) — Phase D 验收脚本（11 步）

## 验证证据（主会话执行，2026-09-12）

门禁：`pnpm test` 85/85 · `pnpm typecheck` 0 error · `pnpm lint` exit 0 · `grep -rnE '<style|[ :]style=' app/` 0 命中 · `Math.random` 0 命中。

`node scripts/verify-shell.mjs` → **all 11 steps passed**（`reports/shell-verify.json`）：

1. 桌面 `/` 渲染壳：24 个导航行，分组 `社区/类别/标签/我的`，8 个类别彩点，未读角标 2
2. **图标合成实测**：20 个 `i-carbon-*` 元素全部有非空 `maskImage`/`backgroundImage`（`getComputedStyle` 实测，补上了 Phase B 未测的那一环）
3. 深色：点击切换 → `html.dark`，`localStorage['tuff-forum:color-mode'] = 'dark'`，刷新后保持，body 背景 `rgb(10,10,10)`
4. 桌面侧栏折叠：点击消失 → `tuff-forum:sidebar = 'false'` → 刷新仍折叠 → 再点回来
5. 窄屏（390×844）：无内联侧栏；关闭态抽屉 `inert` + `aria-hidden`；点 ☰ 开出左侧「导航」抽屉；选「关于」后抽屉关闭并跳转
6. 退出登录 → 顶栏出现「登录」、侧栏「我的」组消失、`session:v1 = {"currentUserId":null}`
7. 登录模态列出 12 个用户（徽标 管理员/版主）→ 选 Mika → `{"currentUserId":"u2"}`、侧栏 footer `@mika · 版主`、toast「已切换为 Mika」
8. ⌘K 命令面板：输入 `mika` 命中用户项
9. `/about`：标题 `关于 · Tuff Forum`、3 个 StatCard、管理团队卡片
10. 冷加载 404 在布局内渲染，「返回首页」可用，**console 干净**
11. 应用内 `router.push` 到不存在路由同样干净

截图（`reports/`，已 gitignore）：`shell-light-desktop.png`（侧栏四组 + 类别彩点 + 顶栏搜索/⌘K/主题/通知角标/头像）、`shell-dark-desktop.png`（同布局，深色 token 生效）、`shell-mobile-drawer.png`（左抽屉「导航」含完整侧栏 + 用户 footer）。

## 偏离设计 / 观察

1. **新增 `app/pages/[...slug].vue`**（design §5 未列）——Nuxt 4 下没有 catch-all 时，未匹配路由在冷加载会打出 router 警告 + `NUXT_E1005`，AC3 的"无 console error"就无法达成。
2. 侧栏选择器是 `.tx-bui-sidebar-nav`（BUI 家族前缀），不是 `.tx-sidebar-nav`；窄屏抽屉里常驻一份副本，断言必须限定 `.tx-row .tx-bui-sidebar-nav` 才能只匹配桌面列。
3. `TxBadge` 是独立 pill，不包裹子元素 → 未读角标用 `<span class="relative">` + `absolute` 工具类定位（符合 R2）。
4. dev server 有锁文件：`.nuxt` 目录下的 dev lock 会拒绝第二个 `pnpm dev`（错误信息给出 PID 与 `NUXT_IGNORE_LOCK=1`）。Phase H 冒烟脚本应先探测端口再决定是否自己起服务。
5. `devtools` 未关闭 → 截图右下角有浮动徽标，窄屏会压住侧栏 footer。建议 Phase E 起设 `devtools: { enabled: false }`。
