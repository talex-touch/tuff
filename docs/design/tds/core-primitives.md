# TDS Core 原语子集（36 个正交组件）

> 更新时间：2026-11-25
> 数据来源：`packages/tuffex/packages/components/src/components.ts`（共 193 个组件模块：99 `base` + 58 `pro` + 36 `ai`）
> 目标：把日常页面开发与 AI/LLM 界面生成收敛到同一套 36 个正交核心原语上，降低选型歧义、样式体积与模型幻觉。

---

## 1. 为什么要裁剪到 36 个核心原语

TuffEx 全量提供 193 个组件目录（约 630 个 `Tx*` 符号），覆盖了从基础表单、动效实验到专项 AI 交互的完整能力。直接把全量目录暴露给开发者或 LLM 会引发三个典型问题：

1. **同义组件漂移**：例如同时存在 `TxSelect` / `TxFlatSelect` / `TxSearchSelect`、`TxEmpty` / `TxEmptyState` / `TxBlankSlate` / `TxNoData`、`TxModal` / `TxPopperDialog` / `TxBlowDialog` / `TxBottomDialog`，同一业务域里容易出现多种拼装方式。
2. **Prop 词汇表污染**：不同历史批次组件的 `size` / `status` 枚举存在差异；收口到核心子集可以强制统一规范。
3. **LLM 上下文膨胀**：AI 界面生成（`OpenUI` / 代码生成 Agent）在超过 40 个候选组件后，错误选型和虚构 props 的概率显著上升。

**执行原则**：新页面与 AI 生成默认只从下表 36 个原语中选取；只有命中第 3 节「特化升级对照表」的明确场景，才引入全量库里的专项组件。

---

## 2. 36 个正交 TDS Core 原语清单

导入路径均对应 `@talex-touch/tuffex/<模块目录>`（如 `@talex-touch/tuffex/button`）；源码目录位于 `packages/tuffex/packages/components/src/<模块目录>/`。

### 2.1 表面与布局（5）

| # | 组件 | 模块目录 | 套件 | 职责与核心约束 |
| --- | --- | --- | --- | --- |
| 1 | `TxBaseSurface` | `base-surface` | `pro` | 统一材质引擎，默认 `mode="refraction"`、`refractionRenderer="css"`；桌面透明窗体开 `systemBackdrop` |
| 2 | `TxCard` | `card` | `base` | 独立对象容器，默认 `background="refraction"`；**禁止卡片套卡片**，标题加 `.tx-heading` |
| 3 | `TxFlex` | `flex` | `base` | 一维行/列排布与间距控制（纵向堆叠等价于 `TxStack`） |
| 4 | `TxGrid`（含 `TxGridItem`） | `grid` | `base` | 等分与响应式多列栅格 |
| 5 | `TxDivider` | `divider` | `base` | 分区与列表分割线（`--tx-border-color`） |

### 2.2 排版与基础展示（5）

| # | 组件 | 模块目录 | 套件 | 职责与核心约束 |
| --- | --- | --- | --- | --- |
| 6 | `TxText` | `text` | `base` | 13–14px 文本原语与溢出截断；正文严禁改 `letter-spacing`、严禁 `font-weight: 700` |
| 7 | `TxIcon` | `icon` | `base` | 统一图标渲染（含 `TxStatusIcon`）；外层须 `inline-flex` 并与首行文本视觉居中 |
| 8 | `TxAvatar`（含 `TxAvatarGroup`） | `avatar` | `base` | 主体头像与堆叠头像组 |
| 9 | `TxStatusBadge` | `status-badge` | `base` | 语义状态胶囊（`status`: `success \| warning \| danger \| info \| muted`），落实色相+图标+文案三重互锁 |
| 10 | `TxTag` | `tag` | `base` | 分类元数据与可移除标签（`size`: `sm \| md`） |

### 2.3 数据与指标（2）

| # | 组件 | 模块目录 | 套件 | 职责与核心约束 |
| --- | --- | --- | --- | --- |
| 11 | `TxDataTable` | `data-table` | `base` | 结构化数据表；首屏加载固定使用 `loadingVariant="skeleton"` |
| 12 | `TxStatCard` | `stat-card` | `base` | KPI 数值卡（28px Display 阶梯，含数值与趋势摘要） |

### 2.4 表单与操作控件（9）

| # | 组件 | 模块目录 | 套件 | 职责与核心约束 |
| --- | --- | --- | --- | --- |
| 13 | `TxButton`（含 `TxIconButton` / `TxCopyButton`） | `button` | `base` | 原生语义 `<button>` 动作家族；`size`: `sm \| md \| lg`，`variant`: `primary \| secondary \| ghost \| danger \| ...` |
| 14 | `TxForm`（含 `TxFormItem` / `TxFormRow`） | `form` | `base` | 表单校验与分组；超一行的字段说明放 `hint`（`?` 气泡），`help` 仅放单行硬约束 |
| 15 | `TxInput` | `input` | `base` | 单行文本输入（14px 值 / 13px 标签，inset ring 聚焦，不以 border 撑动行高） |
| 16 | `TxTextarea` | `textarea` | `base` | 多行文本输入（`status`: `default \| error \| success`） |
| 17 | `TxSelect`（含 `TxSelectItem`） | `select` | `base` | 单选/多选下拉，默认 `refraction` 面板（`status`: `default \| error \| warning`） |
| 18 | `TxCheckbox` | `checkbox` | `base` | 独立或多选布尔项 |
| 19 | `TxRadioGroup`（含 `TxRadio`） | `radio` | `base` | 互斥单选组（含分段按钮态，指示器走 `useJellyIndicator`） |
| 20 | `TxSwitch` | `switch` | `base` | 即时生效的二元开关（不需提交按钮确认的设置项） |
| 21 | `TxSlider` | `slider` | `base` | 连续区间数值调节 |

### 2.5 导航与命令（4）

| # | 组件 | 模块目录 | 套件 | 职责与核心约束 |
| --- | --- | --- | --- | --- |
| 22 | `TxTabs`（含 `TxTabItem`） | `tabs` | `base` | 视图内分页切换（`glide` 滑动指示器，图标走 `icon-class` 或 `#icon` 单一归属） |
| 23 | `TxSidebarNav` | `sidebar-nav` | `base` | 侧边栏分组导航（≤11px 大写组头可加 `0.08em` 字距） |
| 24 | `TxDropdownMenu`（含 `TxDropdownItem`） | `dropdown-menu` | `base` | 命令菜单；内置 `refraction` 面板与 90ms+90ms 关闭前激活确认，业务动作绑 `@select` |
| 25 | `TxCommandPalette` | `command-palette` | `pro` | 全局 `⌘K` 快捷命令面板（Teleport 至 `<body>`） |

### 2.6 浮层与状态反馈（7）

| # | 组件 | 模块目录 | 套件 | 职责与核心约束 |
| --- | --- | --- | --- | --- |
| 26 | `TxModal` | `modal` | `base` | 模态确认与表单弹窗（`visible` 控制，内部 `Teleport` + `Transition`，默认 `refraction`） |
| 27 | `TxDrawer` | `drawer` | `base` | 侧边详情抽屉（自动 z-index 分配，默认 `surface="refraction"`） |
| 28 | `TxPopover` | `popover` | `base` | 锚定弹出卡片（基于 `TxBaseAnchor`，默认 `panelBackground="refraction"`） |
| 29 | `TxTooltip` | `tooltip` | `base` | 轻量悬停说明（仅承载非关键短文本） |
| 30 | `TxAlert` | `alert` | `base` | 页内持久提示横幅（`type`: `info \| success \| warning \| error`） |
| 31 | `TxSkeleton`（含 `TxRowSkeleton`） | `skeleton` | `base` | 布局镜像骨架屏，配合 `useDeferredLoading` 防闪烁；数据等待态默认必选 |
| 32 | `TxEmptyState` | `empty-state` | `base` | 统一空态容器（收敛无数据、无搜索结果、权限受限与错误重试） |

### 2.7 AI 原生核心（4）

| # | 组件 | 模块目录 | 套件 | 职责与核心约束 |
| --- | --- | --- | --- | --- |
| 33 | `TxStreamText` | `stream-text` | `ai` | 流式文本节拍器（合成器 reveal、`maxLagMs` 防积压、不阻断划选复制） |
| 34 | `TxStreamMarkdown`（含 `TxCodeBlock`） | `stream-markdown` | `ai` | 流式 Markdown 与代码块（流式期 `text-wrap-style: auto`，定稿后切 `pretty`） |
| 35 | `TxToolCallCard` | `tool-call-card` | `ai` | Agent 工具调用折叠卡片（0fr↔1fr 无回流折叠） |
| 36 | `TxApprovalCard` | `approval-card` | `ai` | 人机协同审批与结构化追问卡片 |

---

## 3. 特化升级对照表（何时跳出 36 Core）

当需求超出 36 个核心原语时，按以下确定路径升级，禁止自造重复组件：

| 场景 | 起始核心原语 | 升级目标（实际模块） | 说明 |
| --- | --- | --- | --- |
| 密钥 / Token 输入（遮罩+显隐+复制） | `TxInput` | `TxSensitiveInput`（`sensitive-input`） | 内置 `role="button"` 掩码区与同心圆角复制按钮 |
| 数值步进 / 搜索框 / 标签输入 / 文件上传 | `TxInput` | `TxNumberInput` / `TxSearchInput` / `TxTagInput` / `TxFileUploader` | 避免手写增减按钮或原生 `<input type="file">` |
| 键值对详情 / 快捷键提示 / 纯静态 Markdown | `TxText` | `TxDescriptions` / `TxKbd` / `TxMarkdownView` | 静态文档不必引入流式 pacer |
| 右键上下文菜单 / 面包屑 / 分页器 / 步骤条 | `TxDropdownMenu` / `TxTabs` | `TxContextMenu` / `TxBreadcrumb` / `TxPagination` / `TxSteps` | 保持统一键盘导航与 90ms+90ms 激活确认 |
| 瞬时通知 / 确定进度 / 行内微状态提示 | `TxAlert` | `TxToastHost` / `TxProgressBar` / `TxSpinner` / `TxStatusHint` | Toast 用于操作回执，ProgressBar 用于可量化进度 |
| 多系列数据图表 | `TxStatCard` | `charts`（`TxBarChart` / `TxLineChart` / `TxTimeseriesChart` 等） | 遵循 `tuffex-charts-package.md` CSS 变量换肤契约 |
| 完整 AI 对话工作台 | `TxStreamMarkdown` / `TxApprovalCard` | `TxChatComposer` / `TxChainOfThought` / `TxSources` / `TxModeChip` / `TxWorkingIndicator` | 仅用于主会话流，普通业务页不引入 |

---

## 4. OpenUI 与 LLM 紧凑 Schema 指南

Tuff 的 AIUI 渲染层（`packages/intelligence-uikit/src/components/openui/definitions.ts`）已提供 34 个模型侧声明式组件。下表建立 OpenUI 生成语法与 TDS Core 36 的映射关系，保证人类手写与模型生成落在同一视觉基线上：

| OpenUI 声明 | TDS Core 落点 | 样式与语义契约 |
| --- | --- | --- |
| `Col` / `Row` / `Box` / `Spacer` | `TxFlex` | 间距严格取 `4px` 步进（`--shell-space-1..7`） |
| `Grid` / `Divider` | `TxGrid` / `TxDivider` | 边框一律取 `--shell-border` / `--tx-border-color` |
| `Card` | `TxCard` | 默认 `refraction`；禁止 Card 内再套 Card |
| `Title` / `Text` / `Caption` / `Label` | `TxText` | 正文 13–14px，辅助 12px，标题 `600` + `balance`，正文 `400` + `pretty` |
| `Badge` | `TxStatusBadge` / `TxTag` | 状态词必带文字标签，不可纯色点表达状态 |
| `Markdown` / `Code` | `TxStreamMarkdown` / `TxMarkdownView` | 行内代码 `0.9em` + `--shell-font-mono` |
| `Button` / `IconButton` | `TxButton` / `TxIconButton` | 仅主操作用 `primary`；`size` 用 `sm \| md \| lg` |
| `Input` / `TextArea` / `Select` / `Checkbox` / `RadioGroup` / `Slider` / `Form` | 对应 `Tx*` 表单原语 | `SegmentedControl` 映射 `TxRadioGroup`（button 模式） |
| `Table` / `Chart` | `TxDataTable` / `charts` | 表格加载用 `TxSkeleton`，数值列开 `tabular-nums` |

### 可直接复用的紧凑 AI Prompt 片段

在系统提示词、Skill 或代码生成模板中引用 TDS 时，直接嵌入以下紧凑规则块（约 25 行，覆盖全部硬性门禁）：

```text
[TDS Core Contract]
1. Tokens only: use --shell-* (CoreApp shell) or --tx-* (TuffEx). Never emit raw hex/rgba in component or page styles; no custom page override CSS.
2. Default surface: every surface container (TxBaseSurface, TxCard, TxModal, TxDrawer, TxPopover, TxSelect, TxDropdownMenu) MUST use `refraction`. Switching to flat/plain/mask/blur/glass/acrylic/mica requires explicit user confirmation.
3. Core 36 subset first:
   - Layout/Surface: TxBaseSurface, TxCard, TxFlex, TxGrid, TxDivider
   - Display/Data: TxText, TxIcon, TxAvatar, TxStatusBadge, TxTag, TxDataTable, TxStatCard
   - Form/Input: TxButton, TxForm, TxInput, TxTextarea, TxSelect, TxCheckbox, TxRadioGroup, TxSwitch, TxSlider
   - Nav/Menu: TxTabs, TxSidebarNav, TxDropdownMenu, TxCommandPalette
   - Overlay/Feedback: TxModal, TxDrawer, TxPopover, TxTooltip, TxAlert, TxSkeleton, TxEmptyState
   - AI Core: TxStreamText, TxStreamMarkdown, TxToolCallCard, TxApprovalCard
4. Typography: body/controls 13-14px, secondary 12px, headings 600 (balance), emphasis 500, prose 400 (pretty), never 700 on prose, zero letter-spacing on body, inline code 0.9em mono.
5. Contrast & state: body ink >= WCAG AA 4.5:1 (use regular/primary ink, never secondary for 13px body); never rely on color alone for state (color + icon + label); never put white text on solid light semantic fills.
6. Layout & motion: never nest cards; use inset ring instead of layout-shifting focus borders; concentric radii (outer = inner + gap); hover color changes are 0ms immediate; every transition/animation requires prefers-reduced-motion escape; first-load waiting views must use TxSkeleton mirroring real layout.
```
