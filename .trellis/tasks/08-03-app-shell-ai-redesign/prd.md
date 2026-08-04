# app 壳层与设置界面 AI 化全面重构

> 父任务。承载需求集合、子任务地图与跨子任务验收。实现落在 4 个子任务里。

## 背景

当前 `/setting` 是单页长滚动：`AppSettings.vue` 把 18 个 `Setting*.vue`（合计 14144 行）依次堆叠，顶部是一张高饱和蓝色 hero 横幅，下方是折叠分组卡片。

壳层不是单一形态：`views/layout/` 下有 8 套可切换 layout（simple / flat / compact / minimal / classic / card / dock / custom），由 `useDynamicTuffLayout` 按 `appSettingsData.layout` 动态加载，用户可在风格设置页切换，另有布局原子编辑器、预设导入导出、远程预设。这套可配置性使壳层无法收敛到一套确定的视觉语言。

观感与 Codex / 豆包 / Qwen 这类 AI 客户端差距明显：色块重、层级靠卡片边框堆出来、信息密度不均。

## 目标

把整个 app 壳层收敛到**一套固定 shell**：260px 侧栏 + 无全局 header 的主区，留白撑层级、发丝线代替卡片边框、强调色只用在少数动作上。设置页从长滚动改为「分类导航 + 内容列」。首页从 redirect 到设置改为对话页。

## 范围决策（2026-08-04 用户确认）

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 新壳层与现有 8 套 layout 的关系 | **移除整套 layout 切换特性**，只保留这一套固定 shell |
| 2 | 删除边界 | **只删 layout**。主题（亮/暗）、壁纸（`useWallpaper`）、窗口效果（refraction / filter / pure）保留，归到设置「外观」分类 |
| 3 | 首页对话深度 | **接通最小可用对话**：真实发消息 + 落库 + 历史列表 |
| 4 | 设置页改造深度 | **18 个 `Setting*.vue` 全部按设计稿重写**为发丝线行式布局 |
| 5 | 侧栏导航 | **照设计稿走**：新建对话 / 智能 / 市场 / 对话历史 / 设置。其余入口进设置或搜索 |
| 6 | 任务拆分 | **拆 4 个子任务**，见下方任务地图 |

## 设计产出

设计稿在 `docs/design/corebox/v2.5.0.pen`，themes 轴 `mode: light|dark`。

**本轮以 v2 画板为准**，v1 画板结构已过时，仅作历史参考：

| 画板 | node id | 状态 |
|---|---|---|
| Shell · 设置 · 浅色 v2 | `iqbKR` | **当前基准** |
| Shell · 首页 · 浅色 v2 | `JVvAr` | **当前基准** |
| Shell · 设置 · 浅色 / 深色（v1） | `Z5ej8I` / `wLbTl` | 过时 |
| Shell · 首页 · 浅色 / 变体 A（v1） | `zhUNf` / `M9LAOz` | 过时 |
| Shell · 首页 · 变体 B（项目优先） | `AEFYC` | 已暂缓，非当前方向 |

v2 只有浅色画板，深色靠 `mode` token 轴自动出。落地时两个主题都要验。

v2 组件：`C2/SideItem`（`C1zl3`）、`C2/Row`（`I6U5E`）、`C2/Btn`（`mfGFL`）、`C/ConvItem`（`lOZup`）、`C/QuickPill`（`rHJAM`）、`C/Chip`（`ZcbJI`）。

### 品牌标记

四块画板统一使用真实 logo，按 `apps/core-app/public/logo.svg` 复刻。落地时直接用 `logo.svg`，不复刻 Pencil 内的三层结构。

### 设置页要点

- 蓝色 hero 横幅换成一条安静的身份带：64px logo + `TUFF` + 版本胶囊 + 一行 tagline，环境信息降级为小号灰 chip。
- 长滚动改为「260 侧栏（含设置分类）+ 内容列」。分类分「偏好 · 能力 · 系统」三组共 9 项。
- 内容列内不再套折叠卡片：分区标题为小号灰标签，同一分区的行装在一个 `$radius-lg` 描边容器里，行与行之间用 1px 发丝线。每行左侧标题 + 描述、右侧控件。
- 强调色只出现在「登录」按钮、开关开态、额度进度条、选中态导航项。

### 首页

**不做项目/工作区概念。** 侧栏只承载对话：logo + `Tuff` 字标（**没有工作区切换器**），导航 新建对话 / 智能 / 市场，下方对话历史，底部一行设置。

对话历史按时间分桶：`今天 / 昨天 / 上周 / 上个月 / 近 3 月`，桶名作组头。**行内不再挂时间戳** —— 组头已经表达了时间，行内重复只会挤占标题宽度。

标题超长时用 CSS `text-overflow: ellipsis` + `white-space: nowrap` + `overflow: hidden`，**不要在数据层截字符串**（设计稿里的省略号是写进文案的，Pencil 没有 `text-overflow`）。

主区空态只有三件东西：64px logo、`今天想做点什么？`、720 宽 composer + 一行快捷 pill。竖向**居中偏上**（`Center` 的 `padding-bottom: 52`）。

刻意避开 Codex 的三处特征：工作区切换器、输入框下方的「Choose project + 插件头像」附件条、竖排建议链接列表。

## 任务地图

| 子任务 | 目录 | 依赖 | 交付 |
|---|---|---|---|
| ① 移除 layout 切换特性 + 固定 shell 骨架 | `08-04-shell-fixed-frame` | — | 删除 ~5k 行 layout 特性；`AppShell` 落地（侧栏 + TopBar + 主区），现有路由照常可达 |
| ② 设置页信息架构 + 行式基础组件 | `08-04-settings-ia-primitives` | ① | 9 分类子路由、设置侧栏、`SettingRow` / `SettingSection` / `SettingToggle` 等基础件 |
| ③ 18 个 Setting*.vue 按设计稿重写 | `08-04-settings-rewrite` | ② | 全部设置内容迁到行式布局，无遗漏项 |
| ④ 首页对话最小闭环 | `08-04-home-conversation` | ① | 对话表 + 迁移、composer 流式发送、历史分桶列表 |

③ 与 ④ 可并行。

## 跨子任务验收标准

- [ ] 两块 v2 画板对应的壳层在 light / dark 下都不出现对比度不足或布局溢出
- [ ] 仓库内不再存在 layout 切换能力：无 `layouts-definition`、无 `useDynamicTuffLayout`、无布局原子编辑器/预设导入导出/远程预设，`appSettingsData.layout` 字段已清理
- [ ] 主题、壁纸、窗口效果三项能力仍可用，且已归入设置「外观」
- [ ] 设置页不再有单页长滚动，分类切换不丢失滚动位置
- [ ] 现有 18 个 `Setting*.vue` 的每一项设置都有归属分类，无遗漏（以映射表逐项核对）
- [ ] 首页可发出一条消息、收到流式回复、刷新后历史仍在
- [ ] `pnpm lint` 与 `apps/core-app` 的 `npm run typecheck` 通过

## 已关闭的待定项

- ~~设置分类栏与主侧边栏是否合并~~ → v2 已合并为单一 260px 侧栏，进入设置时侧栏切换为设置上下文。
- ~~对话主页是否作为新的默认落地页~~ → 是。`/` 由 redirect 到 `/setting` 改为落到对话首页。
