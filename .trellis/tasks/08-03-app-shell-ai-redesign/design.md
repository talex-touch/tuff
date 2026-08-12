# 技术设计 · app 壳层与设置界面 AI 化全面重构

设计基准：`docs/design/corebox/v2.5.0.pen` 的 `iqbKR`（设置 v2）与 `JVvAr`（首页 v2）。以下数值均从画板实测得出，不是估算。

## 1. Token 层

### 1.1 设计稿 token（`mode: light|dark`）

| token | light | dark | 用途 |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#141414` | 主区底、卡片/输入框填充 |
| `surface` | `#F7F7F8` | `#1C1C1E` | 侧栏底 |
| `surface-2` | `#EFEFF1` | `#2C2C2E` | chip / badge 底 |
| `border` | `#E5E5E5` | `#333335` | 发丝线、卡片描边 |
| `border-strong` | `#D2D2D4` | `#48484A` | 需要更强分隔时 |
| `text-primary` | `#1D1D1F` | `#F5F5F7` | 行标题、页标题 |
| `text-regular` | `#48484A` | `#D1D1D6` | 导航项、对话标题 |
| `text-secondary` | `#6E6E73` | `#AEAEB2` | 行描述、右侧值 |
| `text-muted` | `#8A8A8F` | `#8A8A8E` | 组标签、时间、次级图标 |
| `primary` | `#2B7FD9` | `#4E9AE6` | 主按钮、选中态文字/图标 |
| `primary-soft` | `#2B7FD91A` | `#4E9AE626` | 选中态导航项底 |
| `on-primary` | `#FFFFFF` | `#FFFFFF` | 主按钮文字 |
| `shadow-color` | `#0000000F` | `#00000047` | composer 投影 |

尺度：`radius-sm 6` / `md 10` / `lg 14` / `xl 20` / `2xl 24` / `full 999`；`space-1..7 = 4/8/12/16/24/32/48`；`fs-caption 11` / `sm 12` / `body 13` / `md 14` / `lg 17` / `title 22` / `h1 26` / `display 30`。字体 `Noto Sans SC`，拉丁 `Inter`。

### 1.2 落地策略

**v1 PRD 记录的「surface 语义反转」问题在 v2 已经消解**，不需要补 `$surface-raised`：v2 里 `surface` 只用于侧栏（与主区区分），浮起元素（IdentityCard / 设置分区 Card / SearchEntry / Composer）一律是 `bg` 填充 + `border` 1px 内描边，composer 另加 `0 2px 14px $shadow-color`。浮起感来自描边和阴影，不来自 surface 明度，因此两个主题下同构。

新增一层 shell 变量 `--shell-*`，落在 `styles/shell-tokens.scss`，在 `main.ts` 里于 `tuffex/base.css` 之后引入。

**不别名 `--tx-*`。** 实测 tuffex 是 Element 系色板（`--tx-color-primary: #409eff`、`--tx-text-color-primary: #303133`），与设计稿的 `#2B7FD9` / `#1D1D1F` 差异是实质性的，别名会静默渲染出错误颜色。因此 `:root`（light）与 `.dark` 两块直接给设计稿字面值，组件侧一律只写 `var(--shell-*)`，不出现十六进制。

**高对比模式是例外。** `html.contrast` / `html.dark.contrast` 是用户可开关的无障碍加成（`themeStyle.theme.addon.contrast`），tuffex 为它准备了专门的高对比色板（文字 `#111827`、描边 `#6b7280`、primary `#005fcc`）。若 shell token 不响应，开启高对比后整个壳层不跟着变，是无障碍回归。因此这两块把文字 / 描边 / primary 重定向到 `--tx-*` 的高对比值 —— 常规模式忠于设计稿，高对比模式让位于无障碍。

除颜色外，同一文件里还定义了 radius / space / font-size 尺度与 `--shell-sidebar-width: 260px`、`--shell-topbar-height: 52px`。

## 2. 壳层结构

### 2.1 组件契约

```
AppShell.vue                     根，替代 AppLayout + DynamicLayout
├─ ShellSidebar.vue              260px 固定
│  ├─ ShellTrafficLights.vue     仅 macOS 占位；Win/Linux 渲染为空
│  ├─ (上下文头部)               首页=Brand / 设置=BackRow
│  ├─ ShellSearchEntry.vue       首页带 ⌘E kbd；设置为「搜索设置」
│  ├─ ShellNavGroup.vue          组标签 + ShellNavItem[]
│  ├─ ShellNavItem.vue           = C2/SideItem
│  ├─ ShellConvList.vue          仅首页上下文；分桶 + ShellConvItem
│  └─ (底部)                     首页=设置入口 / 设置=版本号
└─ ShellMain.vue
   ├─ ShellTopBar.vue            52px，右对齐图标按钮；首页左侧另有 ModePill
   └─ <router-view>              内容区
```

侧栏实测：`width 260`、`fill $surface`、`strokeWidth {right: 1}` 内描边、`layout vertical`、`gap 10`、`padding 14`。内部条目宽 232（= 260 − 14×2）。

`ShellNavItem`：`padding [7,10]`、`gap 10`、`radius-md`、icon 16、label 13。选中态 = `fill $primary-soft` + icon/label 改 `$primary` + `fontWeight 500`。

`ShellConvItem`：`padding [6,10]`、`gap 9`、`radius 8`、icon 14（`message-square`）、title 12.5 `$text-regular`。**Time 子节点在 v2 实例里不启用** —— 组头已表达时间。

主区：`fill $bg`、vertical、TopBar `height 52` `padding [0,32]`、内容区 `fill_container`。

### 2.2 平台差异

主进程 `config/default.ts` 的 `MainWindowOption` 已是 `titleBarStyle: 'hidden'` + `titleBarOverlay`，但**没有** `trafficLightPosition`（带该字段的是 `DivisionBoxWindowOption`），macOS 走系统默认位置。设计稿红绿灯落在绝对 `(20, 18)`，因此需要给主窗口**新增** `trafficLightPosition: {x: 20, y: 18}`。

主窗口默认高度由 680 提到 820（与 1280×820 画板一致）；`minWidth` / `minHeight` 保持 1100 / 680，不限制用户缩小。

- **macOS**：原生红绿灯，侧栏顶部留 `14 + 20` 的占位高度，不自绘。
- **Windows / Linux**：无原生红绿灯，`ShellTrafficLights` 渲染为空；窗口控制走 `titleBarOverlay`，位置在 TopBar 右侧。侧栏顶部占位取消，上下文头部上移。

`-webkit-app-region: drag` 加在侧栏顶部占位与 TopBar 空白处；所有可点元素显式 `no-drag`。

### 2.3 保留与移除

**移除**（子任务 ①）：

| 路径 | 说明 |
|---|---|
| `views/layout/{simple,flat,compact,minimal,classic,card,dock,custom}/` | 8 套 layout |
| `views/layout/shared/{LayoutShell,LayoutAtomProvider,FloatingNav,LayoutFooter}.vue` | 仅服务于可切换 layout |
| `views/layout/AppLayout.vue` | 由 `AppShell.vue` 取代 |
| `components/layout/{DynamicLayout,LayoutPreviewContent,LayoutPreviewFrame,LayoutSkeleton}.vue` | 动态加载与预览 |
| `modules/layout/{layouts-definition.ts,useDynamicTuffLayout.ts}` | 注册表与动态加载 |
| `modules/layout/atoms/` | 布局原子 |
| `modules/layout/preset/` | 预设导入导出 + 远程预设（含测试） |
| `views/base/styles/{LayoutSection,LayoutAtomEditor}.vue`、`editors/RemotePresetOverlay.vue` | 风格页里的布局区 |
| `styles/layout/{_layout-shell,_navbar-base,_controller-mixins,_container-base}.scss` | 旧 layout 样式（逐个确认无外部引用后删） |
| `appSettingsData.layout` 字段 | 及其读写点 |

**保留**：`modules/layout/useWallpaper.ts`、`wallpaper-state.ts`、`useSecondaryNavigation.ts`、`components/layout/LayoutBackButton.vue`、`modules/storage/theme-style.ts`（主题 / 壁纸 / 窗口效果三项能力归入设置「外观」）。

`modules/layout/index.ts` 收窄到只导出保留项。目录名维持 `modules/layout/` 不改，避免无谓的引用面扩散。

## 3. 路由

### 3.1 顶层

| 路径 | 变化 |
|---|---|
| `/` | redirect `/setting` → **redirect `/home`** |
| `/home` | **新增**，对话首页 |
| `/home/c/:id` | **新增**，具体对话 |
| `/setting` | redirect 到 `/setting/overview` |
| `/setting/:category` | **新增** 9 个分类子路由 |
| `/store*`、`/intelligence*`、`/plugin/:name` | 不变 |
| `/application`、`/downloads`、`/details`、`/setting/storage`、风格路由 | 路由保留可达；**从侧栏移除**，入口改由设置对应分类或 CoreBox 搜索进入 |

`/details`（LingPan，`requiresDashboard`）的 `beforeEach` 目前 fallback 到 `/home` —— 该路径此前不存在，本轮新增 `/home` 后这条 fallback 才真正成立，属于顺带修好。

### 3.2 侧栏导航映射（决策 5：照设计稿走）

| 侧栏项 | 目标 |
|---|---|
| 新建对话 | `/home`（清空当前会话） |
| 智能 | `/intelligence` |
| 市场 | `/store` |
| 对话历史项 | `/home/c/:id` |
| 设置（底部） | `/setting/overview` |

移出侧栏的入口去向：`/application` → 设置 › 插件与工具；`/downloads` → 设置 › 网络与更新；风格 → 设置 › 外观；`/setting/storage` → 设置 › 存储；`/details`、`/plugin/:name` → 走搜索或从市场进入。

## 4. 设置页

### 4.1 9 分类 ← 现有组件映射

| 组 | 分类 | 路由 | 来源组件 |
|---|---|---|---|
| 偏好 | 总览 | `/setting/overview` | **新建**：身份带（重构自 `SettingHeader`）+ 账户（`SettingUser`）+ AI 积分（新，接 `accountSDK`）+ 常规（`SettingLanguage` + `SettingSetup` 的开机自启） |
| 偏好 | 通用 | `/setting/general` | `SettingSetup`（除开机自启）、`SettingWindow`、`SettingMessages` |
| 偏好 | 外观 | `/setting/appearance` | `views/base/styles/`（`ThemeStyle` / `WindowSection` / `sub/ThemePreference` 等，**去掉布局区**） |
| 能力 | 智能 | `/setting/intelligence` | `SettingAssistant` + `/intelligence/*` 配置入口 |
| 能力 | 插件与工具 | `/setting/plugins` | `SettingTools`、`SettingPlatformCapabilities`、`SettingPermission`、`/application` 入口 |
| 能力 | 文件索引 | `/setting/file-index` | `SettingFileIndex`、`SettingEverything`、`SettingFileIndexAppDiagnostic`、`SettingFileIndexAppIndexManager` |
| 系统 | 网络与更新 | `/setting/network` | `SettingNetwork`、`SettingUpdate`、`SettingDownload` |
| 系统 | 存储 | `/setting/storage-usage` | `SettingStorage`、`views/storage/Storagable` |
| 系统 | 关于 | `/setting/about` | `SettingAbout`、`SettingSentry` |

20 个来源组件全部有归属。`SettingHeader` 被身份带吸收后不再单独存在。

现有 `?section=` 查询参数（`file-index` / `everything`）的深链要保留兼容：`/setting?section=file-index` 重定向到 `/setting/file-index`。

### 4.2 行式基础组件（子任务 ② 产出）

| 组件 | 对应设计 | 实测规格 |
|---|---|---|
| `SettingSection` | Sec + LabelWrap + Card | 组标签 `fs-caption` `$text-muted` + 间距 23 + `radius-lg` `$bg` 描边容器，`clip: true` |
| `SettingRow` | `C2/Row` | `padding [12,16]`、`gap 16`、`space_between`、左 title 13.5 `$text-primary` + desc `fs-sm` `$text-secondary` `lineHeight 1.5`（gap 3），右 trailing `gap 6` |
| `SettingDivider` | DividerWrap | 1px `$border`，左右各缩进 16 |
| `SettingToggle` | — | 开态 `$primary` |
| `SettingChip` | `C/Chip` | `surface-2` 底、`radius 6`、`padding [4,9]`、11px `$text-muted` |
| `SettingButton` | `C2/Btn` | `$primary` 底、`radius-md`、`padding [8,14]`、`fs-body` `$on-primary` |
| `SettingProgress` | Track + Fill | 高 6，轨 `$surface-2`，条 `$primary` |

`SettingRow` 的 trailing 是插槽：值 + chevron（跳转型）、开关、按钮、纯文本四种形态。

内容列宽度：画板里 Main 宽 1020、Body `padding-left/right 40`、内容 940。落地用 `max-width` + 居中，不硬编码 940。

### 4.3 滚动位置

「分类切换不丢失滚动位置」：每个分类路由独立 `keep-alive`，滚动容器在内容列而非 window。用 `keepAliveKey` 按分类区分，沿用 router 里既有的 `resolveRouteCacheKey` 机制。

## 5. 首页对话（子任务 ④）

### 5.1 数据层

`src/main/db/schema.ts` 现有 12 张表，无对话表。新增两张：

```
conversations       id / title / created_at / updated_at / model / archived
conversation_messages  id / conversation_id / role / content / created_at / status / meta
```

`npm run db:generate` 出迁移，`npm run db:migrate` 应用。标题由首条用户消息截取生成（**存全量，渲染层截断**）。

### 5.2 通路

主进程 AI 能力已具备，不新写模型层。复用：

- `intelligence:api:stream` —— 流式回复
- `intelligence:api:invoke` —— 非流式兜底
- `intelligence:api:get-provider-model-options` —— TopBar ModePill 的模型选择

新增一组 transport（对话 CRUD + 消息追加），与 `packages/utils/transport/sdk/domains` 下既有域 SDK 同构。

### 5.3 历史分桶

`今天 / 昨天 / 上周 / 上个月 / 近 3 月`，按 `updated_at` 分。分桶在渲染层算（`dayjs`，项目已依赖）。**列表项不渲染时间戳**。

### 5.4 空态

`Center` 竖向居中偏上：`justifyContent: center` + `padding-bottom 52`。三件套 64px logo → `今天想做点什么？`（gap 30 内 Head 自身 gap 82−64=18）→ ComposerGroup（composer + 快捷 pill，gap 18）。

Composer：宽 720、`radius-2xl`、`$bg` 填充、`$border` 1px 内描边、`0 2px 14px $shadow-color`、`padding [16,16,12,16]`、`gap 14`。占位符 `塔芙来帮你做任何事`。ToolRow 左 `＋` 与「工具」，右 mic 与主色发送键（30×30）。

## 6. 兼容与回退

- 每个子任务独立成一个提交序列，可单独 revert。
- 子任务 ① 是不可逆点（删除 5k 行）：删除前先确认 `git` 历史干净，删除提交与 `AppShell` 落地提交分开，便于二分定位。
- `appSettingsData.layout` 字段移除后，旧配置文件里残留的该键不会引发错误（存储层对未知键宽容），无需写迁移；如实测报错则在 `app-storage` 里静默丢弃。
- 用户既有的布局预设文件（如有导出物）在移除后不再可导入 —— 这是决策 1 的既定代价，在 release note 里说明。

## 7. 风险

| 风险 | 应对 |
|---|---|
| 删 layout 时误伤壁纸/窗口效果（它们同在 `modules/layout/` 与 `views/base/styles/`） | 删除前逐文件 grep 引用；`useWallpaper` 及其两个测试文件明确保留 |
| 18 个组件重写量大，易在中途破坏既有功能 | 子任务 ③ 内按分类逐个迁移，每迁一个跑一次 typecheck；行为逻辑原样搬运，只换表现层 |
| 对话表 schema 一旦发布难改 | 首版字段保守，`meta` 留 JSON 扩展位 |
| v2 无深色画板 | 每个组件落地后在 light / dark 各验一次；token 全部走 `--shell-*`，不写死颜色 |
