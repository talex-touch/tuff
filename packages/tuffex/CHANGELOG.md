# TouchX UI 更新日志

## [Unreleased]

### 📦 组件变动 (Components)

- **更新组件**: `base-anchor`, `charts`, `liquid`, `transition`

### ✨ 组件增强

- 新增 `TxTransitionPush` 推入翻页过渡，用于层级导航（进入子页、返回上一页）：key 变化时新旧两页同时横向推入推出，`direction` 为 `forward` 时新页从行内结束方向进入、`back` 时反向，RTL 容器自动镜像；容器高度只在切换那一刻从旧页过渡到新页，结束后回到 `auto`；离场页固定在原位并设为 `inert`；中途打断从当前绘制的位置继续；`duration` 为 `0` 时直接替换，`prefers-reduced-motion: reduce` 时改为 120ms 原位淡入淡出、高度直接落定。新增 `before-enter`/`after-enter`/`after-leave` 事件与 `TransitionPushDirection`、`TxTransitionPushProps` 类型。
- `TxBaseAnchor` 的箭头有了自己的动画：箭头挂到面板内容层上，跟着面板的位移、缩放、模糊和透明度一起动，面板开始运动之前、收起之后都随面板隐藏（此前会在面板动起来前先完整闪出两三帧，关闭的第一帧就消失）；`expand` 下箭头等面板成形后才从边缘探出，回弹比面板晚一拍，关闭时先收回再折叠面板；`opacity` 的箭头只随面板淡入淡出。
- `TxBaseAnchor` 的 `transfer` / `boom` / `opacity` 现在和 `expand` 一样解析 `animation.ease` / `closeEase` 里的 `spring(omega, zeta)` 与 `cubic-bezier(...)`；此前原样交给 GSAP，被静默换成 GSAP 的默认缓动。GSAP 自己的缓动名照旧透传。
- `TxLiquid` 的 `cornerEase` 接受任意 CSS 缓动，包括全部关键字与 `linear(...)` 列表；此前只认 `cubic-bezier(...)` 与 `ease-in-out`，其余按线性处理。

### 🐛 组件修复

- `TxBaseAnchor` 的 `transfer` 关闭改为落在 `exit.scale`：此前它忽略 `exit.scale`，`closeType: 'transfer'` 的混搭关闭也不回落到 transfer 自己的默认缩放（0.92），而是沿用打开类型的值。

### 🧩 组件导出

- `@talex-touch/tuffex/utils`（根入口同步）新增缓动工具：`resolveGsapEase`、`resolveCssEase`、`createSpringEase`、`parseSpringEase`、`createCubicBezier`、`parseCubicBezier`。

### 🧪 内部

- 缓动实现收拢到 `utils/animation/easing.ts`，各处副本删除：`TxBaseAnchor` 的弹簧与贝塞尔构件、`TxLiquid` 的两份 CSS 缓动求值（`spring.ts` 的 `easingFunction` 与 observer 的圆角时间线）、`TxTextMorph` 借用的那份，以及图表入口的 `cubicBezier`（名字保留，改用共享求解器）。

### 组件修复

- `TxBubbleMap` 开启 `roam` 后仍可点击气泡并返回对应数据行。气泡按下不再触发底图的指针捕获，底图拖拽和滚轮缩放保持可用。

### 按需样式

- 动态组件导入在激活时加载完整 CSS 依赖，不提前加入首屏静态样式。静态导入继续展开依赖闭包；显式样式去重只识别真实导入，不把注释或字符串误当成已加载样式。

## [0.6.3] - 2026-10-01

本版本为当前源码及客户端 beta 内的组件版本，尚未独立发布 npm；已发布的 0.6.2 历史记录保持不变。

### 📦 组件变动 (Components)

- **新增组件 (Since 0.6.3)**: `descriptions`, `stream-element`, `stream-text`
- **更新组件**: `code-stream`, `context-menu`, `data-table`, `dropdown-menu`, `pagination`, `stream-markdown`

### ✨ 组件增强

- 新增 `TxDescriptions` / `TxDescriptionsItem` 描述列表组件：以语义 `<dl>` 渲染只读的标签/值对；`columns` 控制每行列数，容器窄于 480px 时退为单列；`layout` 支持 `horizontal`（同一列的标签共用一条 subgrid 轨道，值自动对齐，`labelWidth` 可固定标签宽度）与 `vertical`，`size` 支持 `sm` / `md`；`span` 跨列且不超过 `columns`；值不渲染任何内容（无插槽、仅空白或 `v-if` 为假）时显示 `emptyText`（默认 `—`，`0` 不算空）；`label` 插槽可替换标签。
- 新增 `TxStreamElement` 流式回答组件：把一整段回答（Markdown 或结构化 `parts`）放在同一个匀速时钟上逐词显影，标题、段落、列表、引用与代码严格按顺序出现；`[n]` 按 `sources` 解析为引用 chip（代码与链接文字中不解析）；表格、公式、mermaid、原始 HTML 与图片整体委托给 `TxStreamMarkdown` 并逐行显影；支持 `reserve` 回放、`replay()`/`skip()`，`caret`/`citation`/`inline`/`code`/`part-<name>`/`footer` 插槽与 `state-change`/`done`/`cite` 事件。
- 新增 `TxStreamText` 流式文字组件：逐词匀速放出流式到达的文字，突发内容不会让显示落后源头超过 `maxLagMs`，源头结束后在 `drainMs` 内放完；每个词从轻微模糊中析出并扫过蓝紫粉色带（默认 `aurora`，另有 `hue`/`blur`/`languid`/`none` 预设）；支持行内引用与自定义片段、取材自 Tuff logo 的光标、`caret`/`citation`/`inline` 插槽、`state-change`/`done` 事件与 `replay()`/`skip()`；遵循减少动态效果偏好。新增 `appear` 属性（挂载时已有的内容也播放进场）；关闭 `caret` 时光标立即移除，只有流结束时才收起；修复引用 chip 后紧跟的空格被吞掉，以及行内代码、链接后的空格落进代码框或链接下划线。
- `TxCodeStream` 新增流式模式（设置 `streaming` 即启用）：把目前收到的代码传给 `code`，组件逐词匀速放出，默认每个词在自己的语法颜色里从轻微模糊中析出（`reveal` 可换预设）；增长中的代码按 120ms 合并重新高亮，Tuff 光标跟随正在书写的那一行且换行不重挂载；新增 `reveal`/`wordMs`/`maxLagMs`/`drainMs`/`pauseMs`/`reserve` 属性、`state-change`/`done` 事件、`caret` 插槽与 `state`/`replay()`/`skip()`；并以 `TxStreamCode` 别名导出；另有 `paced`（由父组件统一控制节奏时关闭）与 `appear` 属性；关闭 `caret` 时流式光标立即移除，只有流结束时才收起。`revealedLines` 与 diff 模式行为不变，整个组件的动效统一只在未减弱动效时声明。
- `TxStreamMarkdown` 换上流式家族的动效：新流入的字符使用 `TxStreamText` 的显影预设（默认 `aurora`，新增可选 `reveal` 属性），新块改用共享的模糊淡入；尾部的渐变光球换成 Tuff 光标，全组件只保留一个、用 `translate` 属性定位（新增可选 `caret` 属性，关闭时光标立即移除，流结束时才收起），段落写到哪里跟到哪里，列表/表格/围栏下方单独一行，换元素不重新挂载；整个组件的动效统一只在未减弱动效时声明（遮罩过渡与表格复制按钮的过渡此前在减弱动效下仍会播放）。
- `TxDropdownMenu` 与 `TxContextMenu` 的关闭型菜单项新增统一确认反馈：先清空高亮 90ms、再复用 active 选中态确认 90ms，然后触发 `select` 并关闭；支持菜单/Panel/单项 `activationFeedback` 覆盖，`closeOnSelect=false` 与减少动态效果保持即时路径。
- `TxDataTable` 新增 `loadingVariant`（默认 `overlay`，可选 `skeleton`）与 `skeletonRows`（默认 5）：`skeleton` 在还没有数据时渲染贴合列宽、对齐方式与行高的骨架行（`aria-hidden`，表格仍为 `aria-busy`），不显示遮罩与空态；已有数据时刷新保留现有行、不加遮罩，只在表头下方显示 2px 进度条（减少动态效果时静止）。不传新属性的表格渲染不变。
- `TxPagination` 新增 `pageSizes`、`v-model:pageSize`（`update:pageSize` / `pageSizeChange`）与 `pageSizeLabel`（默认 `Items per page`）：提供 `pageSizes` 才在页码后渲染每页条数选择器（复用 `TxSelect`，由可见标签命名），控件排成一行并可换行；组件只发事件、不改当前页，是否回到第 1 页由调用方决定；不传 `pageSizes` 时 DOM 与此前一致。

## [0.6.2] - 2026-09-28

### 📦 组件变动 (Components)

- **新增组件 (Since 0.6.2)**: `bot-avatar`, `image-generation`, `metal-fx`, `voice-beam`
- **更新组件 (Updated)**: `card`, `empty-state`, `progress-bar`, `status-badge`

### ✨ 组件增强与生态收敛

- 深度适配并导出四大交互视觉特效套件：`TxImageGeneration` 图像生成占位揭示、`TxMetalFx` 金属质感物理悬浮徽标、`TxVoiceBeam` 语音声波光束与 `TxBotAvatar` 智能体动态头像。
- `TxProgressBar` 进度条增强多段聚合 (`segments`) 支持：支持自定义各段值、颜色与浮动标签，完美适配业务每日活动趋势图与版本分布多维度对比展示。
- `TxCard` 优化无遮挡悬浮体验与平滑背景阴影切换，与 `TxEmptyState`、`TxStatusBadge` 等全面覆盖系统后台与数据看板容器规范。
## [0.6.1] - 2026-09-28

### 📦 组件变动 (Components)

- **新增组件 (Since 0.6.1)**: `status-hint`

### ✨ 组件增强

- 新增 `TxStatusHint` 状态操作反馈组件：用于在操作完成后以涌现色带、文字字符级形变过渡与再次触发脉冲强调展示操作反馈（例如“已复制”、“固定失败”）；自带微弱噪点遮罩层，支持深浅色模式与无障碍单 live region 模式；完全支持并遵循用户 reduced motion 偏好。

## [0.6.0] - 2026-09-12

### 📦 组件变动 (Components)

- **新增组件 (Since 0.6.0)**: `agent-screen`, `charts`, `choice-card`, `flowchart`, `fusion-surface`, `icon-morph`, `icon-picker`, `mode-chip`, `prism-glow`, `sensitive-input`, `text-morph`, `toast-panel`
- **更新组件 (Updated)**: `alert`, `badge`, `cascader`, `date-picker`, `flat-radio`, `group-block`, `picker`, `progress-bar`, `slider`, `sortable-list`, `stream-markdown`, `tab-bar`, `text-transformer`, `toast`, `toast-panel`, `transfer`, `tree`


### ✨ 组件增强

- 新增 `TxTextMorph`：按字符粒度在旧值与新值之间做形变过渡，并导出 `TextMorphEngine` / `MorphController` / `MORPH_DEFAULTS` 供 `TxTextTransformer`、`TxBadge` 等自带形变面的组件复用；`@number-flow/vue` 依赖随之移除，Nexus 侧 demo 与文档从 AutoSizer 数字滚动切到新组件。
- `TxToastHost` 重做为可堆叠通知栈：最新的在最前，后面的按 `gap` 与 5% 缩放露出顶边，超过 `visibleToasts` 的完全透明等待；悬停整栈展开并暂停所有倒计时，移开后各自从中断处继续而不是从头计时；收起时宿主 `pointer-events: none`，空列不再吞点击。新增 `position` / `expand` / `gap` / `offset` / `swipeToDismiss`，退场动画补齐（此前只有 0.16s 淡入，退场元素直接消失）。
- `TxSortableList` 拖拽可预期：列表随指针跨越实时重排（预览由组件自己保有，宿主未回写 `modelValue` 时行也会动，拖拽结束后所有权交还宿主），新增握柄与键盘排序路径，`reorder` 仍只在结束时触发一次并携带原始与最终下标。
- `TxTree` 无 `v-model` 时也能选中：内部选中状态与展开同构，新增 `defaultSelectedKeys` 作为种子，`modelValue` 绑定期间忽略种子。
- `TxTransfer` 新增 `minHeight` prop（写入 `--tx-transfer-min-height`），不再被 240px 硬下限撑出容器；行标签改用 `overflow-wrap: anywhere`，不再把 "Quick actions" 断成 "Quick actio / ns"。
- `TxDatePicker` 增加月/年视图、区间选择与过渡动画；`TxCascader` 每一级使用各自锚定的浮层面板；`TxProgressBar` 增加星尘流动与可悬停分段。
- `TxTabBar` 补齐与 `TxFlatRadio` 一致的 variant / size 组合，滑动指示器改由一份共享测量驱动（首次点击前就位）；`TxFlatRadio` 增加 `xl` 档位。
- `TxAlert` 增加状态图标、入场动画与可关闭回退。

### 🎨 外观与主题

- 所有阴影回到同一光源；抬升面锚定到轨道并压柔阴影，画廊单元格不再挤压自身。
- BUI 深色 ramp 回归中性灰：每档保留原有绿色通道（亮度不变），只去掉原先 +3..+5 的蓝偏，`--tx-bui-line` 与 `--tx-fill-color` 对齐；浅色 token 不动。
- 列表行统一 hover / active / 对齐；下拉项 hover 改为面板式；折叠头重绘为描边 chevron，折叠框架重新设计。
- 步骤条标记与连接线重绘并补过渡动画；BlowDialog 卡片重建；头像跟随主题取色；状态徽标图标归位到端帽。
- 自适应带与 GlowText 的离场改为真正离开，而不是在原处溶解或犹豫。

### 🐛 组件修复

- BUI 组件的 `bui-scope` reset 改由 `:where()` 包裹，组件自己写的 `&__name` 按钮样式不再被 `.tx-bui-x button` 的 (0,1,1) 静默压过（`TxSidebarNav` 行高回到 31.5px，`TxSearchPanel` 选项恢复内边距/字号/颜色）。
- `TxGroupBlock` 的行扁平化选择器实际命中；`TxRow` 负 gutter 的成因补齐，网格恢复方正。
- 对话框不再裁切长 token，内容体可滚动；`TxSelectionActions` 不再在用户操作时把自己关掉；`TxTabs` 指示器首次点击前可见。
- Picker 行标签不再重复渲染、滚轮不再卡顿、能滚到最后一行。3D 鼓形方案落地后因命中区随 transform 迁移（居中行挡住相邻行）而整体回退，最终保留平铺列，以及两个与鼓面无关的修复。
- `TxSlider` 分段停点变圆且可命中；滑块拇指沿用 radio 指示器的果冻感，radio 指示器收进组边框。
- 浮层面板锚定到文档而非视口；Nexus 文档的 prose 样式不再渗进组件 specimens。
- `TxStreamMarkdown` 不再重复内联 GitHub markdown 样式表（SFC `@import` 与按 chunk 去重导致 103.3 KiB 表发两遍）。

### ⚡ 性能优化

- 组件样式不再把依赖 CSS 复制进每个 `style.css`：依赖改为 emit 共享样式的一次引用，发布集 2.2 MiB → 743 KiB。
- 共享样式通过 `style-deps.json` 展开为「每个样式表一次 import」，同一份 base-surface 规则只加载一次：五个组件的页面 208 KiB → 104 KiB。
- 导出 CSS 开启 `cssMinify`（JS 仍保持未压缩，便于依赖方调试与自行打包）：`components.css` 663.5 → 541.2 KiB，`base.css` 34.2 → 29.3 KiB；`audit:size` 的完整 CSS 预算以 664 KiB 重新基线。

### 🧩 组件导出

- 新增 `@talex-touch/tuffex/vite`（按需样式注入插件）与 `@talex-touch/tuffex/package.json` 导出。
- 新增 `TxTextMorph` 及其引擎导出；移除 `@number-flow/vue` 依赖。

## [0.5.0] - 2026-09-07

### 📦 组件变动 (Components)

- **更新组件 (Updated)**: `card-item`, `dropdown-menu`, `filter-chips`, `slider`, `stream-markdown`


### ✨ 组件增强

- `TxFilterChips` 增加滑动填充、图标与 icon-only 模式。
- `TxCardItem` 宿主可重新指向 hover / active 填充。
- `TxDropdown` 可承载文本输入框，锚定面板的背景在滚动行之下保持不透明。

### ⚡ 性能优化

- 锚定面板改用 transform 定位，`max-height` 保留 size middleware 写入的值。

### 🐛 组件修复

- 交互组件打磨收口：每个交互控件都有 cursor，`TxSlider` 的折射 slab 按尺寸计算而不是缩放。
- `TxStreamMarkdown` 的 PostCSS 产物保持 pack 可解析，构建期剥离非法律注释。

### 🧪 内部

- 类型审计可从 workspace 解析同级包（#1841）；补齐 spring / fill 契约与视觉任务证据文档。

## [0.4.0] - 2026-09-01

### 📦 组件变动 (Components)

- **组件架构收拢 (Updated)**: `button`, `icon` (移除冗余子路径与 `flat-button`)


### 💥 破坏性变更

- 收拢 button / icon 组件族：`TxIconButton`、`TxCopyButton` 移入 `@talex-touch/tuffex/button`，`TxOsIcon` 移入 `@talex-touch/tuffex/icon`；深子路径 `./flat-button`、`./icon-button`、`./copy-button`、`./os-icon`（含各自 `style.css`）随之移除。根入口导出的组件名与类型不变，仅深子路径消费方需要改导入来源。
- 删除冗余组件 `TuffFlatButton`（连同 `FlatButtonProps`、`TuffFlatButtonInstance`）：其能力与 `TxButton variant="flat"` 完全重复，请直接使用后者。

### 🧹 包体职责收口

- TuffEx 包移除本地 VitePress `docs:*` / playground 展示入口，源码包只保留 build、watch、lint、test、typecheck 与 package audit 脚本。
- 运行时 Demo 与公开文档统一迁移到 Nexus 承载，本地预览改为 `pnpm -C "apps/nexus" run dev`。

## [0.3.9] - 2026-06-12

### 📦 组件变动 (Components)

- **新增组件 (Since 0.3.9)**: `agent-trace`, `ai-elements`, `allocation-bar`, `approval-card`, `attachment-tray`, `border-beam`, `cell-link`, `chain-of-thought`, `code-stream`, `context-cards`, `context-indicator`, `conversation-stream`, `diff-table`, `dot-indicator`, `filter-chips`, `fine-tune-card`, `flat-dropdown`, `icon-chip`, `inline-citation`, `insight-cards`, `liquid`, `markdown-editor`, `message-actions`, `prompt-bar`, `reasoning-disclosure`, `recommendation-card`, `resize-box`, `scrub-field`, `search-panel`, `selection-actions`, `sidebar-nav`, `signal-meter`, `sources`, `spark-chart`, `stream-markdown`, `suggestion-chips`, `task-rows`, `thinking-orb`, `tool-call-card`, `tool-chips`, `tool-confirmation`, `version-capsule`, `working-indicator`
- **更新组件 (Updated)**: `base-anchor`, `base-surface`, `code-editor`, `empty-state`, `flip-overlay`, `radio`, `scroll`, `tabs`


### 🧩 组件导出

- 新增 `@talex-touch/tuffex/<component>` 稳定子路径导出与 `<component>/style.css` 局部样式入口，保留根入口兼容但推荐新代码使用按需子路径导入。
- 新增 `@talex-touch/tuffex/base.css` 基础样式入口，用于按需消费时单独加载共享 token 与全局 utility；`style.css` 继续保留为全量样式入口。
- Core App 的 TuffEx 受控注册逻辑改为按组件子路径动态加载，避免集中注册单个组件时触发根入口全量导出。
- 新增 Vite 按需样式注入插件，用于发布态按组件子路径消费时自动补齐 `<component>/style.css`；Core App 与 Nexus 开发态继续消费源码 SFC 样式，避免重复注入。
- 修复 `@talex-touch/tuffex/utils` 发布入口缺少 JS wrapper 的问题，并新增 `pnpm -C "packages/tuffex" run audit:exports` 校验发布 exports 对应 dist 文件。

### ⚡ 性能优化

- `TxScroll` 的 BetterScroll `pull-down` / `pull-up` 插件改为功能开启时按需加载，避免默认滚动入口静态拉入未启用的下拉刷新/上拉加载插件。
- `TxScroll` 的 pull 插件安装逻辑已抽到独立 helper，并新增 `scroll` 按需入口依赖图审计，防止默认滚动入口回退为静态拉入 pull 插件。
- `TxScroll` 的 wheel/bounce guard/RAF apply 运行时已拆到 `useScrollWheel`，SFC 仅保留模式切换、BetterScroll 初始化、native fallback 和模板绑定。
- `TxCodeEditor` 改为轻量 async wrapper，CodeMirror/YAML 运行时实现延后到真实渲染时加载，并在 `audit:size` 中禁止默认 `code-editor` 入口静态拉入 CodeMirror 依赖。
- 空态 wrapper 组件的局部样式入口改为轻量引用 `empty-state/style.css`，避免 `blank-slate` / `no-data` / `permission-state` 等按需样式重复复制整份 EmptyState CSS，并由 `audit:size` 防回涨。
- `TxBaseAnchor` 的 GSAP 动画运行时已抽到 `useBaseAnchorMotion` 并改为动态加载，默认 `base-anchor` / `button` / `select` 按需入口不再静态拉入 `gsap`，由 `audit:size` 防回涨。
- `TxFlipOverlay` 的 GSAP 动画运行时已抽到 `useFlipOverlayMotion` 并改为动态加载，默认 `flip-overlay` 按需入口不再静态拉入 `gsap`，由 `audit:size` 防回涨。
- `TxButton` 的 `v-wave` directive 改为首次挂载时动态加载，默认 `button` 按需入口不再静态拉入 `v-wave`，由 `audit:size` 防回涨。
- `TxRadioGroup` 的 v-model 延迟提交与 button indicator 动画/拖拽/键盘逻辑已拆到内部 helper，SFC 仅保留组合、provide、模板和样式，并新增 `radio` 按需入口依赖图审计。
- `TxBaseSurface` 的数值解析与 auto-detect / refraction recovery motion 状态机已拆到内部 helper，SFC 从 1150 行降到 725 行，并新增 `base-surface` 按需入口依赖图审计。
- Core App、Nexus 与 `intelligence-uikit` 的应用级样式入口已迁到 `base.css` + 按需局部样式，`audit:size` 现在同时防止根入口和 `@talex-touch/tuffex/style.css` 在这些消费侧回涨。

### 🐛 组件修复

- 修复 `TxTabs` 无法识别 `v-for` 生成的 `TxTabItem` / `TxTabItemGroup` 子项，以及 Nexus 异步注册后子项组件名丢失的问题，避免动态/文档标签页内容显示 `No tab selected`。

## [0.3.8] - 2026-05-29

### 🧩 组件增强

- 增强 `TxDrawer`：支持四方向、统一 `size`、`full` 全屏 prop、Header/Footer 自定义与关闭、TxDivider 分割线、遮罩/透明面板配置，以及移动端默认底部弹出。
- 增强 `TxDivider`：新增 `gradient` 渐变透明分割模式，支持起点、终点与两端透明衰减。
- 补齐 Nexus 侧 `TxDivider` 中英文文档、基础/渐变/垂直分割 demo、组件注册和索引入口。

## [0.3.7] - 2026-05-21

### 🚀 发布链路

- 修复 `@talex-touch/tuffex@0.3.7` 发布前的 lockfile specifier 不一致问题，确保 `pnpm install --frozen-lockfile`、构建与发布 manifest 校验可复现。
- 补齐 Tuffex CI/Publish workflow 对 `pnpm-lock.yaml` 与 workspace catalog 变更的触发，避免依赖规格修复漏跑包级流水线。

### 📚 文档站修复

- 修复组件文档中 `ApiSpecTable` 内联对象数组导致的 VitePress 构建失败，改为在 `<script setup>` 中声明数据后引用。
- 补齐文档主题缺失的 TuffEx 组件注册和旧标签兼容映射，确保 103 个组件页面均可正常渲染。
- 修复 `FlipOverlay`、`GroupBlock`、`Slider`、`Icon`、`Input`、`AvatarVariants` 等文档示例的运行时 warning/error。
- 新增文档站 `logo.svg`，并修正 favicon 路径。
- 补齐 `FlatRadio`、`FlatSelect`、`Transfer` 文档页，并把已有未入口化组件纳入侧边栏导航。
- 补齐 `docs/components/index.md` 中缺失的 `Alert`、`Badge`、`Breadcrumb`、`Card`、`Collapse`、`FlipOverlay`、`Modal`、`Pagination`、`Radio`、`Rating`、`SegmentedSlider`、`Steps`、`TextTransformer`、`Timeline` 入口，组件索引与 sidebar 保持一致。
- 将 `GlassSurface` 基础示例改为独立 Vue demo，修复真实浏览器预览中泄漏 Markdown / HTML 源码文本的问题。
- 将 `Input` 前后缀插槽示例改为独立 Vue demo，修复移动端真实预览中 raw slot markup 撑宽页面的问题。

### 🐛 组件修复

- 修复 `TxInput` 在 flex 容器中的收缩与横向溢出问题。
- 修复 `TxChatMessage`、`TxScroll`、`TxStagger` 在 VitePress SSR / hydration 场景下的客户端结构不一致问题。
- 修复 `TxStatCard` 默认数值与 insight 在文档站中可能被 `NumberFlow` 渲染为空的问题，改为稳定可见的文本基线。
- 修复 `TxTabs` 点击切换后 active nav 与内容不同步、并触发 Vue `setElementText(null)` 控制台错误的问题。

### 🧩 组件导出

- 为 `FlatInput` 增加 `TxFlatInput` 注册名和命名导出，避免文档页组件名与示例标签递归冲突。
- 新增 `TxTextarea`、`TxNumberInput`、`TxDivider`、`TxKbd`、`TxCopyButton` 五个基础补齐组件，并同步导出、文档和最小测试。
- 为文档站注册 `TxFlatRadio`、`TxFlatSelect`、`TxTransfer` 及其子项组件，保证新增页面可以直接渲染。

### ✅ 验证

- 完成组件源码目录、`components.ts` 导出、`docs/components` 页面、VitePress sidebar 与组件索引页对账。
- 真实浏览器桌面静态截图巡检 `111/111 PASS`，移动重点页截图巡检 `37/37 PASS`，明暗主题截图巡检 `222/222 PASS`，交互烟测 `26/26 PASS`。
- 新增 `scripts/audit-docs-inventory.mjs`、`scripts/audit-docs-coverage.mjs`、`scripts/audit-docs-pages.mjs`、`scripts/audit-docs-interactions.mjs` 和 `docs/quality/component-audit-2026-05-21.md`，沉淀可复跑的源码/导出/文档对账、覆盖矩阵、静态、主题、移动与交互 smoke 审计证据。
- 新增 `docs/quality/component-page-matrix-2026-05-21.md`，逐页记录源码、导出、文档、sidebar、索引、桌面截图、主题截图、移动重点页和交互 smoke 覆盖状态。
- `pnpm -C "packages/tuffex" run lint`、`pnpm -C "packages/tuffex" exec vitest run`、`pnpm -C "packages/tuffex" run docs:build`、`pnpm -C "packages/tuffex" run build` 与 `git diff --check -- "packages/tuffex"` 均通过。

## [0.3.4] - 2026-03-08

### 📚 文档优化

- 重写 `README.md`，统一安装、按需引入、工具导出和组件导出约定说明。
- 重写 `README_ZHCN.md`，与英文 README 结构对齐，去除过时 Beta 文案。

### 🧩 组件梳理

- 基于 `packages/components/src/components.ts` 重新梳理组件导出，确认当前导出模块为 **102** 项。
- 按基础导航、表单输入、布局结构、数据状态、反馈浮层、AI内容、动效视觉七大类补齐组件清单，避免文档与实际导出不一致。

## [最新更新] - 2024-07-22

### 🎨 重大设计更新

#### Button 组件全新视觉设计
- 🔥 **镂空透明效果**: 采用透明背景 + 底部 2px 粗边框的现代化设计
- ✨ **优雅悬停效果**: 悬停时轻微背景色 + 边框颜色变化 + 上移动画
- 🎯 **视觉层次优化**: 底部粗边框创造视觉重点，提升用户体验
- 📐 **尺寸规范化**: 统一的最小宽度和高度，确保一致的视觉效果

### ✨ 新功能

#### Button 组件重构
- 🔄 **组件名称更新**: `VcButton` → `TxButton`
- 🎨 **样式类名统一**: 全部使用 `tx-` 前缀
- 📱 **震动反馈支持**: 新增震动反馈功能，提升移动端体验
- 🎯 **完整功能实现**: 支持文档中所有要求的功能

#### 震动工具库
- 📳 **震动 API 封装**: 完整的设备震动功能支持
- 🎛️ **多种震动模式**: 7种预设震动类型
- 🔧 **高级配置**: 支持自定义震动模式和管理器
- 🛡️ **类型安全**: 完整的 TypeScript 类型定义
- 🧪 **单元测试**: 完整的测试覆盖

### 🎨 样式改进

#### 文档排版优化
- 📐 **按钮间距**: 使用 Flexbox 布局，支持自动换行
- 📱 **响应式设计**: 移动端适配，间距自动调整
- 🎯 **视觉一致性**: 统一的组件展示样式

#### 按钮样式增强
- ✨ **现代化效果**: 悬停上移 + 阴影效果
- 🔄 **平滑动画**: 所有状态变化都有过渡动画
- ♿ **无障碍支持**: 聚焦轮廓和键盘导航
- 🎨 **加载动画**: SVG 旋转加载指示器

### 📚 文档更新

#### Button 组件文档
- 🖼️ **可视化示例**: 所有示例都可直接在文档中渲染
- 📖 **完整 API**: 包含所有属性、事件和插槽说明
- 🎯 **震动功能**: 新增震动反馈使用示例
- 💡 **最佳实践**: 提供使用建议和注意事项

#### 工具库文档
- 📳 **震动工具**: 完整的震动 API 使用指南
- 🔧 **高级用法**: 自定义模式和管理器使用
- 🌐 **兼容性**: 浏览器支持情况说明
- 💡 **最佳实践**: 震动反馈使用建议

### 🧪 测试覆盖

#### Button 组件测试
- ✅ **基础功能**: 渲染、类型、尺寸测试
- ✅ **状态测试**: 禁用、加载状态测试
- ✅ **事件测试**: 点击事件和阻止测试
- ✅ **样式测试**: 各种样式变体测试

#### 震动工具测试
- ✅ **API 测试**: 所有公开方法测试
- ✅ **错误处理**: 异常情况处理测试
- ✅ **兼容性**: 不同环境支持测试
- ✅ **管理器**: 震动管理器功能测试

### 🔧 技术改进

#### 类型定义
- 📝 **完整类型**: 所有组件和工具的 TypeScript 类型
- 🔗 **类型导出**: 便于外部使用的类型导出
- 🛡️ **类型安全**: 严格的类型检查

#### 代码结构
- 📁 **模块化**: 清晰的文件组织结构
- 🔄 **可维护**: 易于扩展和维护的代码
- 📚 **文档化**: 完整的代码注释和说明

### 📱 移动端优化

#### 震动反馈
- 📳 **智能震动**: 根据按钮类型自动选择震动模式
- 🎛️ **可控制**: 支持开关震动功能
- 🔋 **性能优化**: 避免频繁震动影响电池

#### 响应式设计
- 📱 **移动适配**: 按钮在移动设备上的最佳显示
- 👆 **触摸友好**: 合适的触摸目标大小
- 🎨 **视觉反馈**: 清晰的交互状态反馈

### 🚀 性能优化

#### 组件性能
- ⚡ **按需加载**: 支持按需导入组件
- 🎯 **优化渲染**: 减少不必要的重新渲染
- 📦 **体积优化**: 精简的组件代码

#### 工具性能
- 🔧 **轻量级**: 震动工具库体积小巧
- 🛡️ **错误处理**: 优雅的错误处理机制
- 💾 **内存优化**: 避免内存泄漏

### 🔮 未来计划

- 🎨 **主题系统**: 完整的主题定制系统
- 🧩 **更多组件**: 持续添加新组件
- 📱 **PWA 支持**: 渐进式 Web 应用支持
- 🌐 **国际化**: 多语言支持

---

## 使用示例

### 基础按钮
```vue
<template>
  <TxButton type="primary" @click="handleClick">
    点击我
  </TxButton>
</template>
```

### 震动反馈
```vue
<template>
  <TxButton 
    type="success" 
    vibrate-type="success"
    @click="handleSuccess"
  >
    成功操作
  </TxButton>
</template>
```

### 自定义震动
```typescript
import { useVibrate } from '@talex-touch/touchx-ui/utils'

const handleClick = () => {
  useVibrate('heavy')
}
```


## 📋 组件引入版本总览 (Component Since Index)

| 组件 (Slug) | 所属套件 (Suite) | 引入版本 (Since) |
|---|---|---|
| `agent-screen` | ai | **0.6.0** |
| `agent-trace` | ai | **0.3.9** |
| `agents` | ai | **0.3.4** |
| `ai-elements` | ai | **0.3.9** |
| `alert` | base | **0.3.4** |
| `allocation-bar` | pro | **0.3.9** |
| `approval-card` | ai | **0.3.9** |
| `attachment-tray` | ai | **0.3.9** |
| `auto-sizer` | pro | **0.3.4** |
| `avatar` | base | **0.3.4** |
| `badge` | base | **0.3.4** |
| `base-anchor` | pro | **0.3.4** |
| `base-surface` | pro | **0.3.4** |
| `blank-slate` | base | **0.3.4** |
| `border-beam` | pro | **0.3.9** |
| `breadcrumb` | base | **0.3.4** |
| `button` | base | **0.3.4** |
| `card` | base | **0.3.4** |
| `card-item` | base | **0.3.4** |
| `cascader` | base | **0.3.4** |
| `cell-link` | base | **0.3.9** |
| `chain-of-thought` | ai | **0.3.9** |
| `charts` | pro | **0.6.0** |
| `chat` | ai | **0.3.4** |
| `checkbox` | base | **0.3.4** |
| `choice-card` | ai | **0.6.0** |
| `code-editor` | pro | **0.3.4** |
| `code-stream` | ai | **0.3.9** |
| `collapse` | base | **0.3.4** |
| `command-palette` | pro | **0.3.4** |
| `container` | base | **0.3.4** |
| `context-cards` | ai | **0.3.9** |
| `context-indicator` | ai | **0.3.9** |
| `context-menu` | base | **0.3.4** |
| `conversation-stream` | ai | **0.3.9** |
| `corner-overlay` | pro | **0.3.4** |
| `data-table` | base | **0.3.4** |
| `date-picker` | base | **0.3.4** |
| `dialog` | base | **0.3.4** |
| `diff-table` | pro | **0.3.9** |
| `divider` | base | **0.3.7** |
| `dot-indicator` | base | **0.3.9** |
| `drawer` | base | **0.3.4** |
| `dropdown-menu` | base | **0.3.4** |
| `edge-fade-mask` | pro | **0.3.4** |
| `empty` | base | **0.3.4** |
| `empty-state` | base | **0.3.4** |
| `error-state` | base | **0.3.4** |
| `file-uploader` | base | **0.3.4** |
| `filter-chips` | base | **0.3.9** |
| `fine-tune-card` | ai | **0.3.9** |
| `flat-dropdown` | base | **0.3.9** |
| `flat-radio` | base | **0.3.4** |
| `flat-select` | base | **0.3.4** |
| `flex` | base | **0.3.4** |
| `flip-overlay` | pro | **0.3.4** |
| `floating` | pro | **0.3.4** |
| `flowchart` | ai | **0.6.0** |
| `form` | base | **0.3.4** |
| `fusion` | pro | **0.3.4** |
| `fusion-surface` | pro | **0.6.0** |
| `glass-surface` | pro | **0.3.4** |
| `glow-text` | pro | **0.3.4** |
| `gradient-border` | pro | **0.3.4** |
| `gradual-blur` | pro | **0.3.4** |
| `grid` | base | **0.3.4** |
| `grid-layout` | base | **0.3.4** |
| `group-block` | base | **0.3.4** |
| `guide-state` | base | **0.3.4** |
| `icon` | base | **0.3.4** |
| `icon-chip` | base | **0.3.9** |
| `icon-morph` | pro | **0.6.0** |
| `icon-picker` | base | **0.6.0** |
| `image-gallery` | base | **0.3.4** |
| `image-uploader` | base | **0.3.4** |
| `inline-citation` | ai | **0.3.9** |
| `input` | base | **0.3.4** |
| `insight-cards` | ai | **0.3.9** |
| `kbd` | base | **0.3.7** |
| `keyframe-stroke-text` | pro | **0.3.4** |
| `layout-skeleton` | base | **0.3.4** |
| `liquid` | pro | **0.3.9** |
| `loading-overlay` | base | **0.3.4** |
| `loading-state` | base | **0.3.4** |
| `markdown-editor` | pro | **0.3.9** |
| `markdown-view` | base | **0.3.4** |
| `message-actions` | ai | **0.3.9** |
| `modal` | base | **0.3.4** |
| `mode-chip` | ai | **0.6.0** |
| `nav-bar` | base | **0.3.4** |
| `no-data` | base | **0.3.4** |
| `no-selection` | base | **0.3.4** |
| `number-input` | base | **0.3.7** |
| `offline-state` | base | **0.3.4** |
| `outline-border` | pro | **0.3.4** |
| `pagination` | base | **0.3.4** |
| `permission-state` | base | **0.3.4** |
| `picker` | base | **0.3.4** |
| `popover` | base | **0.3.4** |
| `prism-glow` | pro | **0.6.0** |
| `progress` | base | **0.3.4** |
| `progress-bar` | base | **0.3.4** |
| `prompt-bar` | ai | **0.3.9** |
| `radio` | base | **0.3.4** |
| `rating` | base | **0.3.4** |
| `reasoning-disclosure` | ai | **0.3.9** |
| `recommendation-card` | ai | **0.3.9** |
| `resize-box` | pro | **0.3.9** |
| `scroll` | base | **0.3.4** |
| `scrub-field` | base | **0.3.9** |
| `search-empty` | base | **0.3.4** |
| `search-input` | base | **0.3.4** |
| `search-panel` | pro | **0.3.9** |
| `search-select` | base | **0.3.4** |
| `segmented-slider` | base | **0.3.4** |
| `select` | base | **0.3.4** |
| `selection-actions` | base | **0.3.9** |
| `sensitive-input` | base | **0.6.0** |
| `sidebar-nav` | base | **0.3.9** |
| `signal-meter` | pro | **0.3.9** |
| `skeleton` | base | **0.3.4** |
| `slider` | base | **0.3.4** |
| `sortable-list` | base | **0.3.4** |
| `sources` | ai | **0.3.9** |
| `spark-chart` | pro | **0.3.9** |
| `spinner` | base | **0.3.4** |
| `splitter` | base | **0.3.4** |
| `stack` | base | **0.3.4** |
| `stagger` | pro | **0.3.4** |
| `stat-card` | base | **0.3.4** |
| `status-badge` | base | **0.3.4** |
| `status-hint` | base | **0.6.0** |
| `steps` | base | **0.3.4** |
| `stream-element` | ai | **0.6.3** |
| `stream-markdown` | ai | **0.3.9** |
| `stream-text` | ai | **0.6.3** |
| `suggestion-chips` | ai | **0.3.9** |
| `switch` | base | **0.3.4** |
| `tab-bar` | base | **0.3.4** |
| `tabs` | base | **0.3.4** |
| `tag` | base | **0.3.4** |
| `tag-input` | base | **0.3.4** |
| `task-rows` | ai | **0.3.9** |
| `text-morph` | pro | **0.6.0** |
| `text-transformer` | pro | **0.3.4** |
| `textarea` | base | **0.3.7** |
| `thinking-orb` | ai | **0.3.9** |
| `timeline` | base | **0.3.4** |
| `toast` | base | **0.3.4** |
| `toast-panel` | base | **0.6.0** |
| `tool-call-card` | ai | **0.3.9** |
| `tool-chips` | ai | **0.3.9** |
| `tool-confirmation` | ai | **0.3.9** |
| `tooltip` | base | **0.3.4** |
| `transfer` | base | **0.3.4** |
| `transition` | pro | **0.3.4** |
| `tree` | base | **0.3.4** |
| `tree-select` | base | **0.3.4** |
| `tuff-logo-stroke` | pro | **0.3.4** |
| `version-capsule` | pro | **0.3.9** |
| `virtual-list` | pro | **0.3.4** |
| `working-indicator` | ai | **0.3.9** |
