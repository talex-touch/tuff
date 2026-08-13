# 执行计划

按「契约 → 主进程 → 渲染层顶栏 → 窗口控制 → 侧栏拖拽 → 顺带修复」推进。每段末尾都是一个可独立回滚的点。

## 阶段 0 · 前置核对

- [ ] `grep -rn "LayoutBackButton" apps/core-app/src` —— 确认除 `ShellTopBar` 外无消费点，决定是否一并删除
- [ ] `grep -rn "variant=\"raised\"\|variant-raised" apps/core-app/src` —— 确认 `raised` 仅「新建对话」使用
- [ ] `grep -rn "shell-topbar-height" apps/core-app/src` —— 列出全部消费点
- [ ] 列出挂在 `AppShell-View` 下、根元素首个子节点为横向 header 的路由组件（Win/Linux inset 的消费清单）

## 阶段 1 · 共享契约（`packages/utils`）

- [ ] `transport/events/app.ts` 的 `AppEvents.window` 增加 `maximize` / `unmaximize` / `toggleMaximize` / `isMaximized` / `maximizedChanged`
- [ ] `common/storage/entity/app-settings.ts` 的 `_appSettingOriginData` 增加 `shell: { sidebarWidth: 260, sidebarCollapsed: false }`
- [ ] 校验：`pnpm utils:test`

**回滚点 A**：此阶段纯增量，可单独保留。

## 阶段 2 · 主进程

- [ ] `main/core/touch-window.ts`：补 `maximize()` / `unmaximize()` / `isMaximized()`，并在 BrowserWindow 的 `maximize` / `unmaximize` 事件上向渲染层广播 `maximizedChanged`
- [ ] `main/channel/common.ts`：注册四个请求型事件
- [ ] `main/config/default.ts`：`MainWindowOption` 移除 `titleBarOverlay`（保留 `titleBarStyle: 'hidden'` 与 `trafficLightPosition`）；`DivisionBoxWindowOption` **不动**
- [ ] 校验：`npm run typecheck:node`

**回滚点 B**

## 阶段 3 · 顶栏重排（渲染层）

- [ ] 新增 `components/shell/ShellChromeBar.vue`：红绿灯槽（mac）+ brand + 折叠按钮 + ←/→
- [ ] 新增 `modules/layout/useHistoryNavigation.ts`：从 `history.state` 派生 `canGoBack` / `canGoForward`，`router.afterEach` 刷新
- [ ] `ShellSidebar.vue`：顶部换成 `ShellChromeBar`，删除设置态的 `ShellBackRow` 行与非设置态的 `ShellBrand` 行
- [ ] `AppShell.vue`：删除 `ShellTopBar`；根元素加平台 class（`platform-mac` / `platform-win` / `platform-linux`）
- [ ] 删除 `ShellTopBar.vue`、`ShellBackRow.vue`、`ShellTrafficLights.vue`（及阶段 0 确认可删的 `LayoutBackButton.vue`）
- [ ] `styles/shell-tokens.scss`：移除 `--shell-topbar-height`
- [ ] 重新生成 / 手工同步 `renderer/components.d.ts`
- [ ] 校验：`npm run typecheck:web`；macOS 实测 `/home` `/store` `/setting/*` 顶格与红绿灯位置

**回滚点 C**

## 阶段 4 · Windows / Linux 悬浮窗口控制

- [ ] 新增 `components/shell/ShellWindowControls.vue`：`— □ ×`，绝对定位右上角，`no-drag`，最大化态图标切换
- [ ] `AppShell.vue` 挂载（`v-if="!isMac"`）
- [ ] `shell-tokens.scss` 新增 `--shell-window-controls-inset`（mac `0px`，win/linux `116px`）
- [ ] 按阶段 0 清单给贴顶 header 加 `padding-right: var(--shell-window-controls-inset)`（至少 `StoreHeader.vue`）
- [ ] 单测：窗口控制按钮点击是否发出正确事件、`maximizedChanged` 是否翻转图标态
- [ ] 校验：`npm run typecheck:web`

**回滚点 D**

## 阶段 5 · 侧边栏拖拽 + icon 态

- [ ] 新增 `modules/layout/useShellSidebar.ts`（阈值、clamp、迟滞、持久化节流）
- [ ] 单测 `useShellSidebar.test.ts`：clamp 边界、180 吸附、110 恢复、越界持久值的修正、拖拽期间不落盘
- [ ] `ShellSidebar.vue`：右边缘拖拽热区、`is-rail` / `is-resizing` class、宽度写到 `--shell-sidebar-width`
- [ ] `ShellNavItem` / `ShellSearchEntry` / `ShellNavGroup` / `ShellBrand` / `ShellChromeBar` 的 rail 态样式
- [ ] rail 态 tooltip（`title` 属性兜底）
- [ ] 校验：`npm run typecheck:web`；实测拖拽、吸附、恢复、重启保持

**回滚点 E**

## 阶段 6 · 顺带修复

- [ ] `StoreHeader.vue:83`：`t('flatNavBar.store')` → 补齐 zh-CN / en-US 的 key 或改用既有 key（与同组 tab 一致）
- [ ] 同文件确认其它 tab 的 key 都存在（`store.installed` / `store.docs` / `store.cli` / `store.publisher.tab`）
- [ ] `IntelligencePromptsPage.vue:542` 的 `t('flatNavBar.intelligence')` 同样缺 key，一并处理
- [ ] `ShellSidebar.vue`：「新建对话」去掉 `variant="raised"`；若 `raised` 无其它消费点，从 `ShellNavItem.vue` 移除该变体及其样式

## 阶段 7 · 全量校验

- [ ] `pnpm lint`
- [ ] `apps/core-app` → `npm run typecheck`
- [ ] `pnpm utils:test` + `apps/core-app` 相关单测
- [ ] 逐条走 `prd.md` 验收清单；Windows / Linux 项无实机时明确标注为未验证
- [ ] light / dark / `html.contrast` 三态截图核对

## 审查门

- 阶段 3 结束后请用户看一次 macOS 顶行截图再继续（排布是本任务的主观核心）
- 阶段 5 结束后请用户实测拖拽手感与 rail 态阈值
