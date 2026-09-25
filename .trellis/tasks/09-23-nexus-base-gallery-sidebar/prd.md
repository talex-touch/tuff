# Nexus 基础套件画廊整改 + 文档侧栏重设计

## Goal

老板在暗色主题下审阅 Nexus 组件文档（2026-09-23，截图 #1–#6），指出：文档侧栏顶部需要重新设计；基础套件（`/docs/dev/components/base-suite`）画廊里 Container 布局有问题，MarkdownView / SortableList / StatCard / ErrorState / LayoutSkeleton 需要修复或重新设计、"有点设计感"。目标是每一处都正确、克制、有设计感地展示，并把根因修在它真正所在的层（nexus 页面 / 画廊样品 / tuffex 组件）。

## Background（已在代码与浏览器中核实）

- 画廊：`apps/nexus/app/components/docs/DocsComponentsGallery.vue`（`suite="base"`）+ `DocsComponentsGallery.css`。nexus 通过 `packages/tuffex/dist/` 解析 tuffex，改 tuffex 源码必须重建 dist 才能在 dev（:3200）里看到。
- 侧栏：`apps/nexus/app/components/DocsSidebar.vue`（230px 宽，`app/layouts/docs.vue:426`；移动端同一组件放在 82% 宽抽屉里）+ `app/components/docs/DocSection.vue`。

## Requirements

### R1 文档侧栏重设计（截图 #1）

现状：`DocsSidebar.vue:1246–1279` 两排下划线 tab 叠放；第二排 6 个套件在 230px 里放不下，靠 `flex-wrap`（`:1441–1443`）折行，"Flow" 单独掉到第二行；两排下划线指示器互相抢层级。老板选定方向：**分段控件 + 套件切换器**。

- R1.1 UI / Ext 做成整宽分段控件（两段，带图标），当前段为实底；保持链接语义（`NuxtLink` + `aria-current`）。
- R1.2 仅在 UI（组件）区显示套件切换器：触发按钮显示当前套件的图标、名称、文档数与展开箭头；点开浮层列出全部套件（遍历 `SUITES`，因此并行任务新增的 Templates 套件自动出现），每行含图标、名称、一句说明、文档数，当前套件有选中标记；选择后沿用现有 `selectSuite(key)`（跳转到该套件总览）。
- R1.3 切换器可键盘操作：Enter/Space 打开，方向键移动，Esc 关闭并把焦点还给触发按钮；点击外部关闭；在移动端抽屉内同样可用。
- R1.4 顶部区域在中英文、230px 宽度下都不折行、不出现横向滚动；吸顶时与下方列表用 1px 分隔线分开（不用阴影）。
- R1.5 文档列表：当前页有明确的选中指示（左侧强调条 + 浅底），hover 反馈即时；分组标题保持小号大写标签，分组间距拉开到能一眼看出分组。
- R1.6 亮 / 暗两套主题都成立。

### R2 `.dark` 全局样式泄漏（MarkdownView 灰雾的根因，截图 #3）

`TuffexDocsHeroBackground.vue:195–217` 的 scoped 样式写成 `:global(.dark) .tuffex-docs-hero-bg__…`，Vue 编译时只保留 `:global()` 内的部分，4 条规则变成全局的 `.dark, [data-theme="dark"] { … }`（已在浏览器 `document.styleSheets` 中核实）。结果：`<html class="dark">` 被刷上白色径向渐变背景、白色投影、文字色与边框色；所有带 `data-theme="dark"` 的组件根（TxMarkdownView、TxCodeEditorRuntime、TxMarkdownEditor）同样中招。

- R2.1 这 4 条规则只命中 hero 背景自己的元素；`<html>` 与任何组件根不再被它们改写。
- R2.2 这 4 条暗色规则自写下起从未作用到 hero 元素上；修复后 hero 会第一次拿到作者原意的暗色样式。修复前后截图对比并向老板报告观感差异；若明显变差，改为删除这 4 条从未生效的规则（外观保持现状，泄漏同样消除）。

### R3 Container 样品（截图 #2）

`DocsComponentsGallery.vue:1759–1795` 把 12/12/8/16 四列放进同一个 `TxRow`，折行后两行之间没有间距（`TxRow` 的 gutter 只作用于水平方向，与 Element Plus 一致）。

- R3.1 两行之间的竖向间距等于水平 gutter，整体仍居中。只改样品写法（每行一个 `TxRow`），不改 `TxRow` API。

### R4 MarkdownView 样品（截图 #3）

- R4.1 R2 修复后样品无光斑、无白色投影。
- R4.2 列表圆点回到内容框内（画廊的 `ul/li { padding: 0 }` 重置 `DocsComponentsGallery.css:281–287` 不再吃掉 markdown 列表缩进）。
- R4.3 字号回到设计规范（正文 13–14px、标题只比正文大一级；现为 16px 正文 + 20px h3）。
- R4.4 样品内容重新设计，展示标题、强调、行内代码、列表/清单、引用等 markdown 能力，排版有设计感（`markdownSample` `:511`）。

### R5 SortableList 样品（截图 #3）

- R5.1 去掉双线：行复用了 `.docs-gallery__scroll-row`（`DocsComponentsGallery.css:343`，带 `border-bottom`），与组件自带的圆角边框叠加。
- R5.2 行重新设计：前置图标徽章、名称、次要信息（如快捷键），拖拽手柄清晰；拖拽中的反馈可见。只改画廊样品。

### R6 StatCard（截图 #4，组件本体）

`packages/tuffex/packages/components/src/stat-card/src/TxStatCard.vue`：

- 涨幅行 `.tx-stat-card__insight`（`:415`）用 `gap: 6px` 排 前缀 / 数值 / 后缀 三个 span，显示成 `+ 16.7 %`。
- 涨幅图标 `i-carbon-growth` 依赖宿主 UnoCSS 扫描，nexus 没有生成，留下一块空白占位，使涨幅行缩进。
- 光晕颜色取自图标的计算颜色（`updateGlowVars`），图标未着色时是一团灰雾；hover 时装饰层 `scale(2.05)` + 模糊、图标层旋转 10°（`:365–384`）。
- core-app 有 6 处使用（`PluginFeatures.vue:778/783`、`PluginStorage.vue:367/377/387/397`），通过 `icon-class="i-ri-… text-6xl text-<color>"` 传入大号彩色图标，另有 1 处 `variant="progress"`。

要求：

- R6.1 涨幅显示为一个整体（如 `↑ 16.7%`），图标稳定渲染、不依赖宿主扫描到组件内部的图标类。
- R6.2 图标与交互按老板选定的方向 B 重新设计——**保留大号装饰图标，精修**：图标放大后裁在卡片右下角、低透明度、无模糊，配同色柔光（颜色取图标自身颜色，未着色时不出现灰雾）；hover 只做描边即时提亮、图标轻微位移、柔光增强，去掉模糊放大与旋转，含 reduced-motion 兜底。core-app 6 处卡片保持"大号彩色图标"的气质。
- R6.3 Props / slots / events 不变；`progress` 变体与 core-app 的 6 处用法照常渲染。
- R6.4 画廊样品给出真实感数据与着色。

### R7 ErrorState（截图 #5，组件本体 + 画廊）

- `TxEmptyState.vue:291–302` 的 error 插画包含两个 `tx-empty-state__error-pulse` 圆环，但文件里**没有任何** `error-*` 的 CSS，圆环静态叠在三角形上，成了一个怪符号。`TxErrorState` 是 `TxEmptyState variant="error"` 的薄包装。
- 画廊 12 个状态格共用一个模板（`:2501–2515`，表 `:755–768`），全部传 `title=组件名`、`description=copy.aboutBody`（"A Vue component family powering the Talex Touch ecosystem."），与状态语义无关。

要求：

- R7.1 error 插画重新设计成干净的错误图形；若保留脉冲动效，必须写出真实动画并有 reduced-motion 兜底（静止时是完整、好看的一帧）。
- R7.2 12 个状态格都换成各自语义的标题和说明（中英同步）——共用模板，只改 ErrorState 会留下 11 个同样错误的格子。ErrorState 格附带一个"重试"操作，展示 actions 能力。

### R8 LayoutSkeleton（截图 #6，组件本体）

`packages/tuffex/packages/components/src/layout-skeleton/src/TxLayoutSkeleton.vue`：

- `.tx-layout-skeleton__line { height: 100% }`（`:117`）与 `__header-line { height: 20px }`（`:62`）、`__sidebar-text { height: 16px }`（`:98`）同优先级且写在后面，把后两者覆盖：顶栏条撑满 40px 贴到外框，侧栏文字条和头像一样粗。
- 侧栏固定 `width: 200px`（`:74`），窄容器里把内容区挤成右侧一条；内容区用 `--tx-bg-color-page`（`:103`），暗色下比外框更黑。

要求：

- R8.1 顶栏、侧栏、内容区的占位条高度按设计生效；顶栏不贴边。
- R8.2 骨架在窄容器（画廊格 ~320px）和宽容器（文档页）里都像一个真实布局：侧栏按比例收缩、不挤压内容区，内容区不比外框更暗。
- R8.3 闪烁动画与 reduced-motion 契约不变（`skeleton-surface` mixin，motion-contract 测试）。

### 追加需求（2026-09-24，老板在验收汇报后要求一并处理）

- R9 StatCard 进度环：`@property --tx-stat-card-progress` 声明 `inherits: false`，而数值写在父元素 `.tx-stat-card__progress` 上，读取它的子元素 `.tx-stat-card__progress-ring` 永远拿到初始值 0%，弧从未画出（core-app 插件存储页"使用率"卡同样受影响）。要求弧按进度绘制、进度变化有过渡，且过渡有 reduced-motion 兜底。DOM 契约不变。
- R10 `apps/nexus/app/components/updates/UpdatesAllView.vue:443–447` 的 `:global(.dark) .X` 泄漏（编译成裸 `.dark, [data-theme='dark'] { color }`）改为只作用于本组件元素；更新页暗色标题观感不变。
- R11 `DocsSuiteCatalog` 在套件总览页水合不一致（服务端渲染注释节点、客户端渲染分组 div）：找到根因并修复，页面控制台不再报该组件的水合警告。
- R12 tuffex 普通暗色主题下 success / warning / info 的 `-light-8` / `-light-9` 仍"混白"，作底色时在暗色页上成了浅色方块。改为与 primary 同一规则向暗色背景混合；`-light-3/5/7` 不在本次范围（core-app `PluginStatus.vue` 把 `warning-light-7` 当作彩色底上的文字色，整条阶梯改动需单独审计）。
- R13 `TxEmptyState` 除 error 外的插画关键帧动画全部补上 reduced-motion 兜底，且静止时是完整的一帧（不能停在隐藏或半截状态）。

## Constraints

- 设计遵循 `.trellis/spec/frontend/tuffex-design-rules.md`：正文 13–14px、次要文字 12px；颜色只来自 `--tx-*` token；有阴影或固定高度的元素用 inset ring 不用 border；嵌套圆角同心；hover 不过渡颜色；所有动效有 reduced-motion 兜底；阴影统一左上光源（x:y = 1:2，`--tx-elevation-*`）。
- 改 tuffex 组件按 `.trellis/spec/frontend/tuffex-docs-sync.md` 同步 Nexus 文档（stat-card / layout-skeleton / empty-state / error-state 的 zh + en，用户可见改动配 demo）。
- 新文案中英同步（`apps/nexus/i18n/locales/{zh,en}.ts`）。
- 共享工作树并行会话：
  - `09-23-nexus-pro-gallery-polish` 改同一个画廊文件的 Pro 区域并修 tuffex 组件——本任务在画廊里只动 base 套件的上述格子与相关 CSS；
  - `09-23-nexus-docs-templates-tab` 会改 `DocsSidebar.vue` 的 `SUITES` / `SECTION_ORDER` / `suiteOverviewLink` / `selectSuite` 与 `docs-suites.ts`、i18n——本任务不改这些段，只替换顶部 tab 模板与对应样式、在 `activeSuiteDef` 之后新增代码、i18n 只追加键。
  - 重建 tuffex dist 前 `mkdir /tmp/tuffex-build.lock`（成功才构建，结束 `rmdir`）。
  - 不 stash / checkout / restore；不 commit，除非老板要求。
- dev server（:3200）运行时不跑 `pnpm typecheck` / `nuxt typecheck` / core-app `typecheck:web`，只跑直连入口。

## Acceptance Criteria

- [ ] R1：侧栏在 ego 浏览器中、中英文 × 亮暗主题下截图确认：顶部两行（分段控件 + 切换器）不折行不溢出；切换器鼠标与键盘（Enter/Space/方向键/Esc）均可用，选择后跳到对应套件总览；列表选中态清晰；移动端抽屉里切换器可用。
- [ ] R2：真实导航进入组件文档页后，`getComputedStyle(document.documentElement).backgroundImage === 'none'`，TxMarkdownView（含 AI 套件页的 Chat / StreamMarkdown）根节点无径向渐变与投影；hero 背景修复前后截图已对比并报告。
- [ ] R3–R8：base-suite 画廊对应格子在暗色下截图确认，亮色抽查无回归。
- [ ] R6.3：stat-card 文档页各 demo 与 core-app 的 6 处用法（按 SSR/无头截图方式）渲染正常。
- [ ] 画廊页、侧栏无新增控制台报错。
- [ ] R9–R13：stat-card 文档页进度示例画出弧（暗 + 亮）；更新页暗色标题正常且 `<html>` 不再被该组件写入 `color`；套件总览页无 `DocsSuiteCatalog` 水合警告；暗色下 success/warning/info `-light-9` 计算值为深色；empty-state 各插画在 reduced-motion 下静止且完整（浏览器模拟 `prefers-reduced-motion: reduce` 截图）。相关单测覆盖 R9、R12、R13 的源码契约。
- [ ] `apps/nexus/app/pages/docs/docs-page-performance.test.ts` 通过；stat-card / layout-skeleton / empty-state（含 error-state）单测通过；nexus 门禁 `check-demo-registry-orphans` / `check-mdc-fences` / `check-doc-translation-parity` 通过；改动文件在各自包内 eslint 通过；`git diff --check` 通过。

## Out of Scope

- 给 `TxRow` 增加竖向 gutter API。
- tuffex 暗色主题 success / warning / info 的 `-light-3/5/7` 阶梯（见 R12）。
- Pro / AI / Data / Flow 套件画廊（另一会话负责）；Templates 套件（另一会话负责）。
- 提交代码。
