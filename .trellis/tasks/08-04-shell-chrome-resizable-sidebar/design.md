# 技术设计

## 1. 边界

改动集中在三层，互相之间只通过 CSS token 与 transport 事件耦合：

| 层 | 文件 | 变更性质 |
| --- | --- | --- |
| 主进程窗口配置 | `main/config/default.ts`、`main/channel/common.ts`、`main/core/touch-window.ts` | 关闭 `titleBarOverlay`（仅 Win/Linux）、补齐最大化通道 |
| 共享事件 / 存储契约 | `packages/utils/transport/events/app.ts`、`packages/utils/common/storage/entity/app-settings.ts` | 纯增量：新增 `AppEvents.window.maximize/unmaximize/toggleMaximize/maximizedChanged/isMaximized`、新增 `appSetting.shell` |
| 渲染层 shell | `views/layout/AppShell.vue`、`components/shell/*`、`styles/shell-tokens.scss` | 顶栏重排、窗口控制、侧栏拖拽 |

`@talex-touch/utils` 是已发布包，两处契约变更都必须是**新增字段 / 新增事件**，不得修改或删除既有定义。

## 2. 顶部 chrome：从「两段」收敛为「一行」

### 2.1 现状

```
AppShell(flex row)
├── ShellSidebar   (aside, 260px, drag)
│   ├── ShellTrafficLights (mac only, 64×20 占位)
│   ├── ShellBackRow | ShellBrand
│   └── …
└── AppShell-Main  (flex col)
    ├── ShellTopBar (52px, 一级页面下全空)   ← 要删
    └── AppShell-View
```

### 2.2 目标

```
AppShell(flex row)
├── ShellSidebar
│   ├── ShellChromeBar        ← 新增：红绿灯占位 + brand + 折叠 + ←/→
│   ├── ShellSearchEntry
│   └── …
├── AppShell-Main
│   └── AppShell-View         ← 顶格，无 ShellTopBar
└── ShellWindowControls       ← 新增：Win/Linux only，absolute 右上角
```

`--shell-topbar-height` 从 tokens 移除（而不是设为 0）——留一个恒为 0 的 token 会让后续读者以为顶栏还在。若有其它消费点，改为按需局部定义。

### 2.3 `ShellChromeBar` 布局

单行 flex，高度 40px，`-webkit-app-region: drag`，内部交互元素 `no-drag`：

```
[ TrafficLightSlot 64×20 ][ Brand ][ CollapseBtn ]      [ Back ][ Forward ]
   mac only, flex 0 0 64                             ← margin-left:auto
```

宽度预算（默认 260px，padding 10×2）：`64 + 8 + (22+6+34) + 8 + 24 + 8 + 24 + 24 = 222 < 240`。brand 文案用 `min-width:0 + text-overflow:ellipsis` 承接压缩，因此 220px 下限仍能显示红绿灯 + 图标 + 前进后退。

Win/Linux 无红绿灯槽位，同一行多出 64px 余量。

### 2.4 后退 / 前进语义

用浏览历史而非路由父子关系：

- `back` → `router.back()`，`forward` → `router.forward()`
- 可用性从 `window.history.state`（vue-router 在 `history.state` 上维护 `back` / `forward` 字段）读取，`router.afterEach` 后刷新
- `useSecondaryNavigation` 保留（其它地方还在用），但 `ShellChromeBar` 不使用它

**行为差异（有意）**：原 `ShellBackRow` 是「固定回到 `/home`」，新的 `←` 是历史后退。设置页从 `/store` 进入时，`←` 会回到 `/store` 而非 `/home` —— 这是用户要的 Orca 语义，PRD 已确认。

### 2.5 删除清单

- `components/shell/ShellTopBar.vue`
- `components/shell/ShellBackRow.vue`
- `components/shell/ShellTrafficLights.vue`（内容并入 `ShellChromeBar` 的槽位）
- `AppShell.vue` 中的 `ShellTopBar` 引用
- `ShellSidebar.vue` 中设置态的 `ShellBackRow` 行

`components/layout/LayoutBackButton.vue` **不删** —— 需先 grep 确认除 `ShellTopBar` 外无其它消费点；若确无，一并删除并从 `components.d.ts` 移除。

## 3. Windows / Linux 悬浮窗口控制

### 3.1 为什么弃用 `titleBarOverlay`

原生 overlay 的位置、尺寸、色彩由系统绘制，塌陷顶栏后它压在页面内容上且无法被 CSS 感知；`symbolColor` 也不随 dark / contrast 主题走。改自绘后三者都可控，代价是要自己接最大化状态。

`titleBarStyle: 'hidden'` 保留（Win 下等价于无边框但保留窗口阴影/圆角），只移除 `titleBarOverlay` 字段。macOS 不受影响（它本来就靠 `trafficLightPosition` 而非 overlay）。

### 3.2 新增事件（`packages/utils/transport/events/app.ts` 的 `AppEvents.window`）

| 事件 | 载荷 | 语义 |
| --- | --- | --- |
| `maximize` | `void → void` | 最大化 |
| `unmaximize` | `void → void` | 还原 |
| `toggleMaximize` | `void → boolean` | 切换，返回切换后的 maximized |
| `isMaximized` | `void → boolean` | 查询当前态（挂载时同步初值） |
| `maximizedChanged` | `boolean → void` | 主进程 → 渲染层广播 |

主进程在 `common.ts` 注册前四个；`maximizedChanged` 由 `touch-window.ts` 监听 BrowserWindow 的 `maximize` / `unmaximize` 事件后 `sendTo` 主窗口——**必须走窗口事件而非只在 IPC 里回包**，否则双击标题栏、系统快捷键、拖到屏幕顶部触发的最大化不会同步图标。

### 3.3 遮挡规避

`shell-tokens.scss` 新增：

```scss
:root { --shell-window-controls-inset: 0px; }
.platform-win, .platform-linux { --shell-window-controls-inset: 116px; }  // 3×36 + 8
```

平台 class 由 `AppShell.vue` 根据 `useRendererPlatform()` 打在 `.AppShell` 上（当前代码没有任何平台 class，需新增）。

页面顶行 header 消费 `padding-right: var(--shell-window-controls-inset)`。**实现阶段必须逐一核对**内容区顶格后真正贴顶的 header，而不是只改 `StoreHeader`；核对方法：对 `router.ts` 里挂在 `AppShell-View` 下的每个路由组件，看其根元素首个子节点是否为横向 header。已知至少包含 `components/store/StoreHeader.vue`。核对不到的页面在 PRD 验收里逐条实测。

## 4. 侧边栏拖拽 + icon 态

### 4.1 状态模型（新增 `modules/layout/useShellSidebar.ts`）

```ts
const EXPANDED_MIN = 220, EXPANDED_MAX = 360, EXPANDED_DEFAULT = 260
const RAIL_WIDTH = 64          // icon 态固定宽（Windows / Linux）
const RAIL_WIDTH_MAC = 84      // macOS：原生红绿灯画到 x≈80，64 装不下
const COLLAPSE_THRESHOLD = 180 // 展开态拖到此以下 → 吸附为 rail
const EXPAND_THRESHOLD = 200   // rail 态拖过此值 → 展开
```

对外暴露：`width`（当前渲染宽度）、`collapsed`、`isDragging`、`startDrag(e)`、`toggle()`。

**迟滞方向修正**：初稿写的是 `EXPAND_THRESHOLD = 110 < COLLAPSE_THRESHOLD = 180`，那会抖动 —— rail 态在 110 展开后，宽度被 clamp 到 220，而指针仍在 110，下一个 `pointermove` 立刻满足「< 180 → 收起」，来回翻。正确关系是 `EXPAND > COLLAPSE`，两者之间 [180, 200) 是不触发任何切换的死区。

**rail 宽修正**：初稿写「64px 正好容下红绿灯」，实测不成立。三个灯中心在 CSS x ≈ 26 / 50 / 74，第三个右边缘约 80，64px 的 rail 会让它溢出到主区背景上。macOS 下 rail 取 84px；`resolveRenderedWidth(state, railWidth)` 接收平台相关的 rail 宽，纯函数本身不感知平台。

### 4.2 拖拽实现

`pointerdown` → `setPointerCapture` → `pointermove` 更新 → `pointerup` 落盘。

- 拖拽期间只写 CSS 变量 `--shell-sidebar-width`（在 `.AppShell` inline style 上），不写 storage，`pointerup` 时才持久化一次；否则 `TouchStorage` 的 autoSave 会在每帧触发 IPC
- 拖拽期间给 `.AppShell` 加 `is-resizing`：`user-select: none` + 关掉 sidebar 的 `transition: width`，避免动画和指针位置打架
- 主区不需要任何监听：它是 `flex: 1 1 auto`，侧栏宽度变化自然回流；**不要**用 JS 同步主区宽度，那才会导致重渲染闪烁

### 4.3 icon（rail）态

`.ShellSidebar.is-rail` 下：

- `ShellBrand` 只留 `AppLogo`，隐藏文案
- `ShellSearchEntry` 变 40×30 的方形 icon 按钮，隐藏 placeholder / kbd
- `ShellNavItem` 隐藏 `-Label` / `-Badge`，icon 居中，`title` 属性兜底 tooltip
- `ShellNavGroup-LabelWrap` 隐藏
- `ShellSidebar-Footer`（版本号）隐藏

rail 态下 `ShellChromeBar` 换成竖排：红绿灯槽（macOS）占满 rail 宽度的第一行，brand / 折叠按钮 / ←→ 依次纵向堆叠。竖排里槽位左右不再有兄弟节点，所以它只需占住行高，宽度取 100% 即可，写死 74px 反而会溢出 rail 的 padding box。

### 4.4 持久化

`appSettingOriginData` 新增：

```ts
shell: {
  sidebarWidth: 260,
  sidebarCollapsed: false,
},
```

纯增量，`TouchStorage` 对老配置缺字段会用默认值补齐。读取时仍要 clamp 到 `[EXPANDED_MIN, EXPANDED_MAX]`——手改配置文件或跨版本回滚都可能带来越界值。

## 5. 兼容性与回滚

- 事件与存储都是新增，旧版本 `@talex-touch/utils` 的插件不受影响
- 回滚点：第 3 节（主进程 + 事件）与第 4 节（侧栏拖拽）互不依赖，可分别 revert
- `titleBarOverlay` 移除后若 Win 上自绘按钮出问题，回滚只需恢复 `default.ts` 的 5 行字段 + 隐藏 `ShellWindowControls`

## 6. 风险

| 风险 | 处置 |
| --- | --- |
| macOS 红绿灯坐标与顶行实际位置错位 | `trafficLightPosition` 是窗口坐标系，顶行改动后需实测；侧栏 padding 从 10 起算，`{x:20,y:18}` 对应 40px 行高居中，实现后截图核对 |
| 无 Windows / Linux 实机 | 自绘按钮的行为可单测（事件是否发出、maximized 态是否翻转）；视觉与真实窗口行为在验收里标注为「未实机验证」 |
| 顶格后某些页面首行贴边过紧 | 属于页面自身 padding 问题，本任务只保证不被 chrome 遮挡，页面内边距不在范围内 |
| `ShellNavItem` 的 `raised` 变体删除后影响其它调用点 | 删前 grep；当前仅「新建对话」使用 |
