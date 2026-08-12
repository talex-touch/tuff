# Shell 窗口 chrome 平台适配 + 可拖拽侧边栏

关联任务：`08-04-shell-fixed-frame`（本任务修改的 `AppShell` / `Shell*` 组件由它落地）
基线提交：`abf7a7c85 ref(core-app)!: remove the switchable layout system`

## 背景

v2 固定 shell 落地后，窗口 chrome 的处理停在了「先能用」的状态，实测暴露四类问题：

1. **macOS 内容区顶部留了一条 52px 的空白**。`AppShell.vue` 渲染 `ShellTopBar`（`--shell-topbar-height: 52px`），但它唯一的内容 `LayoutBackButton` 只在有父路由时出现，一级页面（`/store`、`/home`）下整条是空的，视觉上像是布局出错。
2. **Windows / Linux 的窗口控制走 `titleBarOverlay`**（`main/config/default.ts:26`，height 40）。系统按钮画在窗口右上角，而顶栏塌陷后该位置正是页面自己的操作区（如 `StoreHeader` 的「5 来源 / ✓1 / ☰」），会互相遮挡。
3. **二级页面返回的位置不对**。设置态用 `ShellBackRow`（侧栏内一整行「返回 Tuff」），非设置态用 `ShellTopBar` 里的 `LayoutBackButton`，两套并存且都占了不该占的空间；且没有「前进」。
4. **侧边栏宽度写死 260px**（`--shell-sidebar-width`），窄屏下主区被压缩且用户无法调整。

## 目标

把窗口 chrome 收敛为「侧边栏顶行一条」：红绿灯 / brand / 侧栏折叠 / 后退前进都在这条里，右侧内容区顶格无空条；Windows / Linux 用悬浮窗口控制按钮且不遮挡页面 UI。同时让侧边栏可拖拽调宽，过窄自动收缩为纯 icon 栏。

## 范围

### 1. 顶部 chrome 重排（已与用户确认为「全塞侧边栏顶行，内容区顶格」方案）

侧边栏第一行（`ShellChromeBar`，新增）自左向右：

- macOS：红绿灯占位（64×20，保留现有 `trafficLightPosition: {x:20, y:18}`）→ brand（AppLogo + 「Tuff」）→ 侧栏折叠按钮 →（右对齐）后退 / 前进
- Windows / Linux：无红绿灯占位，其余同上

右侧内容区**不再有 `ShellTopBar`**，`--shell-topbar-height` 归 0，页面内容顶到窗口顶部。

- 后退 = 浏览历史 `router.back()`，前进 = `router.forward()`，不可用时置灰（非隐藏，避免按钮位置跳动）
- 删除 `ShellBackRow`（设置态的「返回 Tuff」整行）与 `ShellTopBar` 中的 `LayoutBackButton` 用法，返回语义统一由顶行的 `←` 承担
- `ShellBrand` 从侧栏第二行上移进顶行；`ShellTrafficLights` 并入 `ShellChromeBar`

### 2. Windows / Linux 悬浮窗口控制

- 用自绘 `ShellWindowControls`（`— □ ×`）替代 `titleBarOverlay`，绝对定位在窗口右上角，悬浮于内容之上
- 新增 `--shell-window-controls-inset` token：macOS 为 `0px`，Windows / Linux 为按钮组实际宽度 + 间距
- 页面顶行 header 消费该 token 做 `padding-right`，保证按钮不压住页面自身的右上角控件（至少覆盖 `StoreHeader`；实现阶段逐一核对内容区顶格后真正贴顶的 header）
- 主进程需要 `minimize` / `maximize` / `unmaximize` / `close` 与 `maximized` 状态的通道

### 3. 侧边栏可拖拽调宽

- 侧边栏右边缘 4px 拖拽热区（`col-resize`，`-webkit-app-region: no-drag`）
- 展开态宽度区间 **220–360px**，默认 260px
- 拖到 **< 180px** 自动吸附为**纯 icon 栏（64px）**：只留 icon，label / kbd / 分组标题隐藏，hover 出 tooltip
- icon 态下再往右拖超过 **110px** 恢复上一次展开宽度
- 折叠按钮在两态之间切换，等价于拖拽吸附
- macOS icon 态下顶行只保留红绿灯占位（64px 正好容下），brand / 折叠 / 前进后退下沉为竖排
- 宽度与折叠态持久化到 `appSetting.shell`（新增字段，纯增量不破坏已发布的 `@talex-touch/utils`）

### 4. 顺带修复（图1 标注）

- `StoreHeader.vue:83` 的 `t('flatNavBar.store')` 在 zh-CN / en-US 都没有对应 key，界面直接吐原始 key。改用已存在的 key 或补齐翻译（保持与同组其它 tab 一致）
- 侧栏「新建对话」去掉 `variant="raised"` 的突起态，默认与「市场」同一视觉层级（`ShellNavItem` 的 `raised` 变体如无其它使用点则一并移除）

## 不在范围

- 对话历史列表 / composer（属 `08-04-home-conversation`）
- 设置页内容与分类结构（属 `08-04-settings-ia-*`）
- CoreBox / Division / 其它窗口的 chrome —— 本任务只动主窗口
- 侧边栏宽度的云同步

## 验收标准

- [ ] macOS 下 `/store`、`/home`、`/setting/*` 均无内容区顶部空白条，页面首行贴窗口顶部
- [ ] macOS 红绿灯落在侧栏顶行左上，不被 brand / 折叠按钮遮挡，且顶行可拖动窗口
- [ ] Windows / Linux 下 `titleBarOverlay` 不再启用，右上角为自绘 `— □ ×`，最小化 / 最大化 / 还原 / 关闭四个行为实测可用
- [ ] Windows / Linux 下 `StoreHeader` 的「N 来源 / ✓N / ☰」不被窗口控制按钮遮挡
- [ ] 顶行 `←` 在设置二级页可返回；`→` 在返回后可前进；两者在不可用时为置灰态而非消失
- [ ] `ShellBackRow` 与 `ShellTopBar` 已删除且无残留引用
- [ ] 侧边栏可拖拽调宽，展开态被夹在 220–360px
- [ ] 拖到 180px 以下自动吸附为 64px 纯 icon 栏；icon 态下所有导航项仍可点击且有 tooltip
- [ ] icon 态下再拖过 110px 恢复到吸附前的展开宽度
- [ ] 重启应用后侧边栏宽度 / 折叠态保持
- [ ] 拖拽过程中主区内容不闪烁、不触发路由重渲染
- [ ] 界面上不再出现 `flatNavBar.store` 原始 key
- [ ] 「新建对话」与「市场」在默认态视觉一致
- [ ] `pnpm lint` 与 `apps/core-app` 的 `npm run typecheck` 通过
- [ ] light / dark 两个主题、以及 `html.contrast` 高对比态下顶行与 icon 栏均无对比度不足或溢出
