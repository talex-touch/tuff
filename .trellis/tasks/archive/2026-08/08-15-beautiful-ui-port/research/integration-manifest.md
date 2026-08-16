# Phase C 集成清单（协调者工作台，随 wave 报告增量更新）

共享文件五处：components.ts / README.md + README_ZHCN.md / apps/nexus/app/plugins/tuffex.ts / demo-registry.ts / DocsSidebar.vue(仅 ai-suite 一行)。全部由主会话一次性编辑。

## barrel 插入（components.ts，注意现有文件为连字符优先排序：tag-input 在 tag 前）

| 目录 | 插入位置（W 报告） | 状态 |
|---|---|---|
| agent-trace | 文件头（agents 前） | W1 ✓ |
| allocation-bar | alert 后 attachment-tray 前（待与 W5b 报告核对） | 待报告 |
| approval-card | 待 W3 报告（appro… 在 attachment-tray 前） | 待报告 |
| cell-link | cascader / chain-of-thought 之间 | W4 ✓ |
| code-stream | code-editor / collapse 之间 | W1 ✓ |
| context-cards | context-indicator 前（待核对） | 待报告 |
| diff-table | dialog / divider 之间 | W4 ✓ |
| dot-indicator | divider / drawer 之间 | W4 ✓ |
| filter-chips | file-uploader / flat-button 之间 | W4 ✓ |
| fine-tune-card | 待 W5b | 待报告 |
| icon-chip | icon / icon-button 之间（待核对） | 待报告 |
| inline-citation | 待 W2 | 待报告 |
| insight-cards | 待 W5b | 待报告 |
| prompt-bar | progress-bar 后（待核对） | 待报告 |
| recommendation-card | 待 W3 | 待报告 |
| scrub-field | 待 W5b | 待报告 |
| search-panel | search-input 后（待核对） | 待报告 |
| selection-actions | 待 W3 | 待报告 |
| sidebar-nav | 待 W5a | 待报告 |
| signal-meter | 待 W3 | 待报告 |
| spark-chart | 待 W5b | 待报告 |
| task-rows | tag / text-transformer 之间（注意 tag-input<tag 序） | W1 ✓ |
| tool-chips | 待 W3 | 待报告 |
| working-indicator | 文件尾（virtual-list 后） | W1 ✓ |

## 值导出（README 清单 + nexus 插件用）

- W1：TxWorkingIndicator（+useElapsed,formatElapsed）、TxAgentTrace、TxTaskRows、TxCodeStream。全局标签名=导出名，无 TuffSwitch 式错位。
- W4：TxDiffTable、TxFilterChips、TxDotIndicator、TxCellLink。TxDiffTableInstance 为手写（泛型组件、解包 expose 面）。
- W3：TxApprovalCard、TxRecommendationCard、TxSelectionActions、TxSignalMeter、TxToolChips + TxDiffChips（同目录双导出）。selection-actions 另导出 **useSelectionAnchor / resolveSelectionPayload —— 纯运行时值，不进全局组件注册**。
- W5a：TxIconChip、TxContextCards + TxContextChunk（**TxContextChunk 无未前缀别名**，防与数据类型 ContextChunk 同名遮蔽）、TxSidebarNav（+useIndicatorBox 从 sidebar-nav/index 导出；expose focusSearch/refreshIndicator）、TxSearchPanel。
- W5b：TxSparkChart + TxChartScrubber（同目录）、TxAllocationBar、TxInsightCards + TxInsightMetric（后者是设计表之外的合理新增，承接指标行；进 nexus 插件注册、文档并入 insight-cards 页）、TxScrubField、TxFineTuneCard（TxFineTuneChipSelect 内部件不导出）。
- W2：待报告。

## 提交暂存警告（Phase E）

- **base-anchor/ 目录有非本任务的脏文件**（base-anchor-liquid.ts、base-anchor-motion.ts、两个既有测试、untracked base-anchor-animation-phases.test.ts —— 属并行会话的工作）。W3 足迹仅三个文件：src/types.ts、src/TxBaseAnchor.vue、__tests__/base-anchor-flip.test.ts。**逐文件暂存，绝不整目录 add**。
- sources/、suggestion-chips/、data-table/、checkbox/、tag/ 等被扩展的现有目录同理：先 `git diff --stat` 核对每个文件归属再暂存。

## 已确认事实

- tuffex 包级 typecheck 零错误（协调者 2026-08-15 亲跑确认；此前 W1/W5a 报的 approval-card TS2769、dot-indicator TS2322 均已由归属 wave 修复，报告是旧快照）。
- @vueuse/core ^14.4.0 是 tuffex 已声明依赖（W3 核实），无幻影依赖。
- eslint 必须在 packages/tuffex 内跑（根配置会对所有 tuffex .vue 报 Parsing error —— 已知的仓库配置差异，非回归）。

## README 分类（Component Inventory 行）

- AI & Content 或 Status：W1 四件（working-indicator/agent-trace/task-rows → 按 README 现有 7 分类应归 AI & Content；README 分类 ≠ 文档 category，登记时按 README 自己的 7 类走，多数进 AI & Content）
- Data：diff-table、filter-chips、dot-indicator、cell-link（W4 明确）
- 计数：126 → 150（24 新目录）；zh/en 两份都改，行内计数=反引号条目数（audit:readme 规则）

## 文档 category（mdc frontmatter，9 合法值）

Status: working-indicator, agent-trace, task-rows, tool-chips
Data: code-stream, diff-table, filter-chips, dot-indicator, cell-link, context-cards, insight-cards, spark-chart, allocation-bar, signal-meter, recommendation-card
Form: prompt-bar, scrub-field, fine-tune-card, search-panel
Navigation: sidebar-nav
Feedback: approval-card, selection-actions
Basic: icon-chip, inline-citation

## demo registry keys（已收 23，待 W2/W5b）

- W1 (8)：WorkingIndicatorWorkingIndicatorDemo、WorkingIndicatorVariantsDemo、AgentTraceStepsDemo、AgentTraceVariantsDemo、TaskRowsCapsulesDemo、TaskRowsListDemo、CodeStreamStreamingDemo、CodeStreamStaticDemo
- W3 (5)：ApprovalCardWalkthroughDemo、ToolChipsRunFlowDemo、RecommendationCardConfidenceDemo、SelectionActionsRewriteDemo、SignalMeterLevelsDemo（W3 自增，已批准）
- W4 (6)：DiffTableDiffTableDemo、FilterChipsFilterChipsDemo、FilterChipsFilterTableDemo、DataTableRecordsDemo、DotIndicatorDotIndicatorDemo、CellLinkCellLinkDemo
- W5a (4)：IconChipIconChipDemo、ContextCardsContextCardsDemo、SidebarNavSidebarNavDemo、SearchPanelSearchPanelDemo
- W2（待报告，盘面已见）：PromptBarPromptBarDemo、InlineCitationInlineCitationDemo、AiSuiteChatShowcaseDemo、AiSuiteStreamingAnswerDemo
- W5b（待报告，盘面已见）：AllocationBarAllocationBarDemo、InsightCardsInsightCardsDemo、SparkChartSparkChartDemo、ScrubFieldScrubFieldDemo、FineTuneCardFineTuneCardDemo

## 文档已落盘核对（盘面）

- 新组件文档对：W1 4 对 + W3 5 对 + W4 4 对 + W5a 4 对 + W5b 3 对（scrub-field 缺 en、fine-tune-card 缺整对，进行中）+ W2 inline-citation 缺 en、prompt-bar 缺整对（已催）
- 现有文档增补：data-table/tag/checkbox（W4，含 4 行合理替换的行为改写）、base-anchor（W3 加 disableFlip 行）、sources/suggestion-chips（W2 待确认）
- **并行会话警报**：base-anchor-motion.ts 19:23 仍在被外部会话改写（legacyEase 未声明 + BOOM_DEFAULTS.scale 半改 + 20 测试红）——最终门禁若仍红，归因上报，本任务不修

## 已批准偏差要点（写 ai-suite 总览时引用）

- W1：TaskRowStatus 用 'error'；retry 箭头装饰性（嵌套交互非法）；CodeStream 用 div/code 非 pre（Vue 模板 pre 内缩进会进代码）；shiki 高亮近似（design §8.2 预授权）
- W4：added 行按 rows 序不钉底；modified→warning tone；行染色 class 驱动（修上游 hover 被内联样式压死）；checkbox mixed→true resolve；tag 三配方 outline/soft/plain；--tx-data-table-row-hover-bg/-selected-bg 覆写钩子；.has-fixed-columns 规则加 :not 守卫（空真等价）
- W5a：搜索真过滤+/键真绑定（上游死装饰）；search-panel 补全键盘导航；选中结果 emit 不回写输入框；rm 下 delay 清零（故意偏离上游）；context-chunk 静息态在 rm 块内钉回 opacity:1
- 全局：rm 语义=只砍补间不砍状态机；U+2212；oklab color-mix

## 后续跟进项（wrap-up 记录，不在本任务修）

- TxSources / TxToolCallCard 存在与 W1 修复同类的 inert/a11y 缺口（fusion-status 发现，已按 scope 纪律拒绝顺手修）
- TxTypingIndicator / TxSpinner 无 reduced-motion 块（fusion-status-loading §0.2）
- nexus demo-registry 无孤儿校验脚本（style 报告 §4.4）——19 组件 30+ demo 落地后人工核对一次
