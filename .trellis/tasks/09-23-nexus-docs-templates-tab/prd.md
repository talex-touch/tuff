# Nexus 组件文档新增「模板 Templates」tab：10 个组件组合模板

## Goal

Nexus 的 tuffex 组件文档目前只按"单个组件"组织（理念 / 基础 / 进阶 / AI / 数据 / 流程），开发者看不到组件拼成真实界面后的样子。新增「模板 / Templates」tab，收录预先搭好的整页组件组合：每个模板都是可交互的真实 tuffex 组件，读者能直接看到 Shell、CMS、AgentChat 这类界面该怎么搭。首批 10 个，给老板看效果。

## Decisions (from the user, 2026-09-23)

- D1 tab 名称：中文「模板」，英文「Templates」，紧跟「理念 Concepts」之后。
- D2 不做总览页：点 tab 直接进入第一个模板；侧栏按分组列出各章节。（原话："就不需要总览展示了 直接就是 每一个章节 去分门别类展示不同的样式"）
- D3 首批 10 个，组合要有创新；老板点名的方向：Gallery、CMS、Shell、AgentChat 等。
- D4 章节结构：10 章 × 各 1 个模板（广度优先）；每章页面预留「第二种风格」的位置，后续按章追加。（Q1）
- D5 首批清单与分组（老板在 Q1 预览中看过清单，未提异议；审阅本 PRD 时仍可替换）。组合是最终设计，细节见 design §6：

  | 分组 | 章节 | 核心组合 |
  |---|---|---|
  | 应用框架 | Shell 应用外壳 | SidebarNav + Breadcrumb + CommandPalette(⌘K) + StatCard + Timeline + ToastPanel |
  | 应用框架 | Launcher 启动器 | 仿 CoreBox：GlassSurface + SearchInput + FilterChips + 自建结果列表（IconChip / Tag / Kbd）+ MarkdownView 预览 |
  | 应用框架 | Settings 设置中心 | Tabs + GroupBlock / Block 行 + Switch / Select / Slider / SensitiveInput + Modal 确认；宽屏实时预览 |
  | 内容运营 | CMS 内容管理 | FilterChips + DataTable + StatusBadge + Pagination + Drawer 表单编辑器 + ToastPanel 撤销 |
  | 内容运营 | Gallery 画廊 | GlassSurface 工具条 + SegmentedSlider + EdgeFadeMask + Stagger 网格 + Rating + Modal 详情（内含 ImageGallery 灯箱） |
  | 内容运营 | Inbox 收件箱 | Splitter + VirtualList + MarkdownView + MessageActions + AttachmentTray + ChatComposer 回复 |
  | AI 应用 | AgentChat 智能体对话 | ConversationStream + AgentTrace + ApprovalCard 问卷 + ToolConfirmation 闸门 + CodeStream + TaskRows + PromptBar |
  | AI 应用 | Research 研究助手 | ChainOfThought + InlineCitation 引用段 + StreamMarkdown 对比表 + Sources / ContextCards + InsightCards + RecommendationCard |
  | 数据与流程 | Dashboard 数据看板 | StatCard + TimeseriesChart + AllocationBar + SignalMeter + ProgressBar + DataTable（内嵌 SparkChart） |
  | 数据与流程 | Automation 自动化编排 | Flowchart + 检查器（ScrubField / Switch / FineTuneCard）+ TaskRows + Timeline + CodeStream 日志 |
- D6 宽度策略：模板按正文列约 784px 设计，用容器查询自适应；每个模板带「展开」按钮，把同一个活实例 Teleport 到近全屏浮层（状态保留），不改 docs 布局。（Q3）

## Background (repo facts that shape the requirements)

- 侧栏 suite 由 `apps/nexus/app/utils/docs-suites.ts` 与 `app/components/DocsSidebar.vue`（`SUITES` :476、`SECTION_ORDER['/docs/dev/components']` :215、`selectSuite()` :585 跳到 `standalonePages[0]`）驱动；文档归属靠 frontmatter `category`，`scripts/recategorize-component-docs.py` 的 `TAXONOMY` 必须与磁盘上的文档一一对应（多一条、少一条都报错）。侧栏数据来自 `server/api/docs/sidebar-components.get.ts`（抓 `/docs/dev/components/` 下全部文档）；标签在 `i18n/locales/{zh,en}.ts` 的 `docsSidebar.*`。
- demo 链路：`.mdc` 的 `:::TuffDemoWrapper{demo="…"}` → `app/components/content/demo-registry.ts`（字母序）→ `app/components/content/demos/*.vue`；`TuffDemoWrapper` 自带窗口外框、重播、代码折叠、视口懒加载。`demos/` 不参与 Nuxt 自动注册，helper 组件须被 demo 显式 import 才不算孤儿（`build/check-demo-registry-orphans.mjs`）。新 `.mdc` 自动进入预渲染（`build/docs-prerender-routes.ts`）。
- 已有组合先例：`AiSuiteChatShowcaseDemo.vue`、`AiSuiteStreamingAnswerDemo.vue`、`ComponentsWorkflowPanelDemo.vue`——模板要明显比它们完整（整页应用，而非单个部件）。
- 宽度：正文列 `--nexus-frame-compact: 840px`（`app/app.vue:550`），demo 预览区内边距 28px → 可用约 784px；右侧 240px 大纲栏在 `app/layouts/docs.vue:446` 固定渲染。页头 `.TuffHeader` 是 `z-index: 10000` 的固定条（`app/components/TheHeader.vue:221`）。
- docs 正文 prose 样式（`github-markdown.css`、`.docs-prose`）只排除 `.not-prose` 子树，而 `TuffDemoWrapper` 没有这层隔离。
- 生产构建里自动注册的 tuffex 组件编译自源码（`modules/tuffex-components.ts:90`），`@talex-touch/tuffex/utils` 与子路径走 dist（`nuxt.config.ts:436,555,558`），两份模块状态互相独立（research/app-shells.md R1 有 09-21 生产包证据）。
- tuffex 可用组件 156 个（`packages/tuffex/packages/components/src/components.ts`）；nexus dev 经 `packages/tuffex/dist` 解析 tuffex。
- 并行工作（共享工作树）：
  - `09-23-nexus-pro-gallery-polish`（in_progress）改 `DocsComponentsGallery.vue` 与 tuffex 组件，含 `TxFlipOverlay` 的 teleport 修复。
  - talex-touch-87（`09-23-nexus-base-gallery-sidebar`）修 `TuffexDocsHeroBackground.vue` 的 `.dark` 泄漏，重做 `TxStatCard` / `TxEmptyState` / `TxLayoutSkeleton` 并重建 dist（锁 `/tmp/tuffex-build.lock`），也改 `DocsSidebar.vue`。已对齐分区：它只改 tab 块模板（约 :1246–1279，换成「UI/Ext 分段 + 套件切换器浮层」，仍遍历 `SUITES`、调用 `selectSuite`）、在 `activeSuiteDef` 后新增 `SUITE_ICONS` 与计数、替换 `.docs-tab-*` 样式、i18n 追加 `docsSidebar.suiteDescriptions.*`；本任务的 `SUITES` 条目 / `SECTION_ORDER` / `suiteOverviewLink`+`selectSuite` 它不碰。它先落地的话，本任务顺手补 `SUITE_ICONS.templates` 与 `suiteDescriptions.templates`。

## Requirements

- R1 **Tab**：组件文档侧栏新增「模板 / Templates」suite，位于「理念」之后；点 tab 直接进入第一个模板（Shell），没有总览页。（D1、D2）
- R2 **分组**：侧栏在该 tab 下按 4 组列出 10 个章节，顺序同 D5；任何 suite 的「其他」兜底组保持为空。
- R3 **章节页**：10 个章节各有中英两个页面，统一结构：场景 → 模板（`### 风格名` + 可交互 demo + 精简代码片段）→ 组成（区域 | 组件 | 作用，组件链接到各自文档）→ 交互要点 → 改造建议。（D4）
- R4 **模板内容**：每个模板是 design §6 所述的真实 tuffex 组件组合，可点、可输入、可操作；mock 数据贴合 Tuff 产品语境；第三方产品的性能 / 准确率只写定性描述或标注「示例数据」；不外链图片。（D3、D5）
- R5 **舞台与展开**：模板在正文列内以固定高度的舞台呈现；「展开」把同一实例移入近全屏浮层并保留全部状态，按钮或 Esc 收起；展开期间锁定页面滚动、收起后恢复；展开态里打开的 tuffex 浮层（下拉、提示、抽屉、对话框、命令面板）都显示在浮层之上。（D6）
- R6 **响应式**：按容器宽度分三档（< 640 窄 / 640–959 列内 / ≥ 960 宽）自适应，窄档不出现横向溢出。
- R7 **主题**：暗色、亮色主题都正确渲染。
- R8 **双语**：中英页面章节一一对应；模板内全部可见文案、可传入组件的 label / aria 文案都有中英两版；侧栏标签两种语言齐全。
- R9 **动效与交互礼仪**：自动演示在模板首次进入视口时才开播，可用窗口的「重播」重来；开启「减弱动态效果」时直接呈现终态；涉及安全的确认（写文件）一直等读者点击，不自动放行；模板不劫持页面滚动与焦点（自动演示期间不调用 `scrollIntoView` / `focus()`），快捷键只在焦点位于模板内时生效。
- R10 **边界**：不改 tuffex 源码 / dist，不改 docs 布局、`TuffDemoWrapper.vue`、`DocsComponentsGallery.*`、`TuffexDocsHeroBackground.vue`；共享文件（`docs-suites.ts`、`DocsSidebar.vue`、i18n、分类脚本、`demo-registry.ts`）只做插入式改动。

## Acceptance Criteria

- [x] AC1（R1）ego：中英两种语言下，「模板」tab 都位于「理念」之后，点击后落到 `/docs/dev/components/template-shell`。
- [x] AC2（R2）ego：模板 tab 下显示 4 个分组、10 个条目，顺序正确；各 suite 都没有「其他」分组。
- [x] AC3（R3、R8）20 个 `template-*.{zh,en}.mdc` 都有 R3 的五个章节；`check-doc-translation-parity` 通过。
- [x] AC4（R4、R7）ego：10 个模板在列内分别截取暗色、亮色截图；design §6 列出的核心交互逐一操作过；控制台无新增报错或 Vue warning。
- [x] AC5（R5）ego：每个模板都能展开和收起，收起后状态保留；Esc 可收起；展开期间页面不能滚动，收起后恢复；展开态内打开的至少一个 tuffex 浮层显示在浮层之上。
- [x] AC6（R6）ego：每个模板在窄容器（< 640）下检查，无横向溢出，布局按设计收起。
- [x] AC7（R9）自动演示在滚到可见时才开始，「重播」可重来；模拟「减弱动态效果」时，AgentChat、Automation、Inbox 直接显示终态、不跑计时器；AgentChat 的写文件闸门在无人点击时保持等待。
- [x] AC8（R10）门禁全部通过：`check-demo-registry-orphans` / `check-mdc-fences` / `check-doc-translation-parity` / `check-icon-collections`、图标名校验、`recategorize-component-docs.py` dry-run 输出 `would update 0 file(s)`、vitest（`tuffex-component-docs-coverage` / `component-auto-import` / `demo-client-boundary`）、改动文件的 eslint、vue-tsc 对本任务文件无报错、`git diff --check`。
- [x] AC9（R10）本任务的改动不涉及 `packages/tuffex/**`、`app/layouts/docs.vue`、`app/pages/docs/[...slug].vue`、`TuffDemoWrapper.vue`、`DocsComponentsGallery.*`、`TuffexDocsHeroBackground.vue`。

## Dependencies

- CMS inspector 与 Inbox 阅读区的**暗色**验收（AC4），依赖 talex-touch-87 修复 `.dark` 泄漏。
- Shell / Dashboard 的截图以 talex-touch-87 重建后的 dist 为准（`TxStatCard` 外观会变，API 不变）。

## Out of Scope

- 新增 tuffex 组件或导出；修复调研中发现的 tuffex 缺陷（清单见 design §6.11，收尾时汇报，不在本任务修）。其中生产环境 `toast()` 不显示是现存线上 bug，建议另开任务。
- Pro 画廊（`DocsComponentsGallery.vue`，并行任务）；docs 布局与大纲栏宽度规则。
- hub（`index.{zh,en}.mdc`）的 H2 与套件总览表行、画廊 band、总览页（理由见 design §2.5）。
- Gallery 详情升级为 `TxFlipOverlay`（等 pro-gallery 的 teleport 修复进 dist 后另做）。

## Open Questions

- 无阻塞项。D5 清单与各模板组合在本次审阅中确认即可。
