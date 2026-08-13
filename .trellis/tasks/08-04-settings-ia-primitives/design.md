# 技术设计 · ② 设置页信息架构 + 行式基础组件

父任务设计：`.trellis/tasks/08-03-app-shell-ai-redesign/design.md`（token 层与壳层契约见其 1、2 节）。
画板：`iqbKR`（Shell · 设置 · 浅色 v2）。以下数值均为画板实测。

## 1. 侧栏的上下文切换

v2 把设置分类栏并进了主侧栏 —— 进入设置时，同一个 260px 侧栏换一套内容：

| 位置 | 首页上下文 | 设置上下文 |
|---|---|---|
| 顶部（红绿灯下方） | `ShellBrand`（logo + `Tuff`） | `ShellBackRow`（`chevron-left` + `返回 Tuff`） |
| 搜索入口 | `搜索` + `⌘E` | `搜索设置`，无 kbd |
| 导航 | 新建对话 / 智能 / 市场 | 偏好 / 能力 / 系统 三组共 9 项 |
| 中部 | 对话历史（子任务 ④） | 无 |
| 底部 | `设置` 导航项 | 版本号文本 |

由路由驱动：`route.path.startsWith('/setting')` → 设置上下文。`ShellSidebar` 内部分支，不新增 props，避免 `AppShell` 承担路由判断。

`ShellBackRow` 实测：`fill_container`、`radius-md`、gap 6、padding [5,8]、居中；图标 14 `chevron-left` `$text-muted`，文字 12.5 `$text-secondary`。返回目标复用 `useSecondaryNavigation`，无历史时回落 `/`。

底部版本号实测：外框 padding [6,10] gap 6，文本 `fs-caption`、`$text-muted`、拉丁字体。

### 「新建对话」是特例

画板里它不是普通导航项：`fill: $bg` + 1px `$border` 内描边 + 图标与文字 `$text-primary` weight 500 —— 一个带描边的白底卡片，与其下的纯文字导航项刻意区分（同 ChatGPT 的 New chat）。`ShellNavItem` 因此需要一个 `variant: 'plain' | 'raised'`。

## 2. 分类与路由

| 组 | 分类 | 路由 | 画板图标 → `ri` 落地 |
|---|---|---|---|
| 偏好 | 总览 | `/setting/overview` | `gauge` → `i-ri-dashboard-3-line` |
| 偏好 | 通用 | `/setting/general` | `settings` → `i-ri-settings-3-line` |
| 偏好 | 外观 | `/setting/appearance` | `palette` → `i-ri-palette-line` |
| 能力 | 智能 | `/setting/intelligence` | `sparkles` → `i-ri-sparkling-2-line` |
| 能力 | 插件与工具 | `/setting/plugins` | `blocks` → `i-ri-puzzle-line` |
| 能力 | 文件索引 | `/setting/file-index` | `folder-search` → `i-ri-file-search-line`（`ri` 无 folder-search） |
| 系统 | 网络与更新 | `/setting/network` | `refresh-cw` → `i-ri-refresh-line` |
| 系统 | 存储 | `/setting/storage-usage` | `hard-drive` → `i-ri-hard-drive-2-line` |
| 系统 | 关于 | `/setting/about` | `info` → `i-ri-information-line` |

- `/setting` → redirect `/setting/overview`
- 旧深链兼容：`/setting?section=file-index` → `/setting/file-index`，`?section=everything` → `/setting/file-index`（Everything 归在文件索引下）。在路由守卫里做，不在组件里 watch。
- `/setting/storage` 是既有的 `Storagable` 路由，与新分类 `/setting/storage-usage` 并存，避免路径冲突；存储分类页内提供入口。

滚动位置：每个分类页独立 `keepAlive`，`keepAliveKey` 取 `setting-<category>`，沿用 router 既有的 `resolveRouteCacheKey`。滚动容器在内容列。

## 3. 内容列

`Body` 实测：vertical、gap 20、padding `[4,40,36,40]`、fill。内容宽度在画板里是 940（1020 − 40×2），落地用 `max-width` + 居中而非硬编码。

`SettingsPage` 提供统一骨架：`PageTitle`（`fs-h1` 26 / weight 600 / `$text-primary`）+ 默认插槽。

### 行式基础组件

| 组件 | 画板 | 实测 |
|---|---|---|
| `SettingSection` | `Sec 账户` | vertical gap 6；LabelWrap padding `[0,0,0,2]`；SecLabel `fs-sm` `$text-muted` letterSpacing 0.2；Card `$bg` + `radius-lg` + 1px `$border` 内描边 + `clip` |
| `SettingRow` | `C2/Row` | padding `[12,16]`、gap 16、space-between、居中；左 title 13.5 `$text-primary` + desc `fs-sm` `$text-secondary` lineHeight 1.5（gap 3）；右 trailing gap 6 |
| `SettingDivider` | `DividerWrap` | 1px `$border`，**左缩进 16、右侧齐边**（画板为 x=16 w=924 于 940，非对称，对齐文字起点） |
| `SettingChip` | `C/Chip` | `$surface-2`、radius 6、padding `[4,9]`、11px `$text-muted` |
| `SettingButton` | `C2/Btn` | primary：`$primary` 底 + `$on-primary` 文字；secondary（检查更新）：`$bg` 底 + 1px `$border` + `$text-primary` 文字。均 `radius-md`、padding `[8,14]`、`fs-body` |
| `SettingProgress` | `Track`/`Fill` | 高 6、`$surface-2` 轨 + `$primary` 条、`radius-full`、`clip` |
| `SettingToggle` | — | 画板未画开关本体，沿用既有开关组件，仅约束开态为 `$primary` |

`SettingRow` 的 trailing 是插槽，四种形态：值 + chevron（跳转）、开关、按钮、纯文本。

### 身份带

`IdentityCard` 实测：`$bg` + `radius-lg` + 1px `$border` 内描边、gap 18、padding 16、居中。
- `AppMark` 64×64（用 `logo.svg`，不复刻 Pencil 的三层结构）
- `IdentityText`：vertical gap 7 → NameRow（gap 8：`TUFF` `fs-lg`/600/ls 0.6 + 版本 Chip）+ Tagline 12.5 `$text-secondary`
- 右侧 `检查更新` 为 secondary 按钮

## 4. 现有组件的挂载

本子任务**不改** `Setting*.vue` 内部，按父 design.md 4.1 映射表原样挂进分类页；行式重写属子任务 ③。

移出侧栏的入口在此落位：`/application` → 插件与工具、`/downloads` → 网络与更新、风格页 → 外观、`Storagable` → 存储、`PluginNavTree` → 插件与工具（子任务 ① 从 `App.vue` 摘下时留了去向注释）。

总览页本轮 = 身份带 + 账户（挂 `SettingUser`）+ 常规（挂 `SettingLanguage`）。AI 积分区属 ③。

## 5. 风险

| 风险 | 应对 |
|---|---|
| 18 个组件原样挂进分类后，各自的内外边距叠加导致节奏错乱 | 分类页统一由 `SettingsPage` 控制外边距，组件容器不再额外加 margin；③ 重写时消除 |
| `?section=` 深链回归 | 守卫里重定向，并保留 `data-settings-section` 锚点直到 ③ 完成 |
| keepAlive 键冲突 | 键名统一前缀 `setting-`，与既有 `store-shell` 等不重叠 |
