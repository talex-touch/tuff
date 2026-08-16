# Design — Beautiful UI → tuffex 移植与融合

依据：research/ 下 6 份分析报告（fusion-status-loading / fusion-chat / fusion-actions / fusion-tables / fusion-navcards / style-bridge-and-conventions）。API 细节以各报告的草案为准，本文记录**决策**与**偏差**；实现 agent 先读本文，再读自己簇的报告。

## 1. 总决策表（19 个 BUI 组件的落地形态）

| # | BUI | 决策 | 落地物 | 依据报告 |
|---|-----|------|--------|---------|
| 01 | Loading State | 新增 | `working-indicator/` → `TxWorkingIndicator`（+ `use-elapsed.ts`） | fusion-status-loading §1 |
| 02 | Thinking | 新增 | `agent-trace/` → `TxAgentTrace` | fusion-status-loading §2 |
| 03 | Streaming Text | 组合 + 新叶子 | `inline-citation/` → `TxInlineCitation`；`TxSources` 加 `variant: 'stack'`；`TxSuggestionChips` 加 `layout: 'list'`；整体观感在 nexus demo 组合复刻 | fusion-chat §1 |
| 04 | Approval Card | 新增 | `approval-card/` → `TxApprovalCard` | fusion-actions |
| 05 | Tool Chips | 新增 | `tool-chips/` → `TxToolChips` + `TxDiffChips`（同目录双导出） | fusion-actions |
| 06 | Task Rows | 新增 | `task-rows/` → `TxTaskRows`（内部 `TxTaskRow` 不导出） | fusion-status-loading §3 |
| 07 | Chat | **不新增组件** | nexus showcase demo（TxTabs + TxConversationStream + TxAiMessage + TxChainOfThought + TxChatComposer 组合）；`resolving` 态样式留 demo 局部 | fusion-chat §2 |
| 08 | Prompt Bar | 新增 | `prompt-bar/` → `TxPromptBar`（+ `useTokenMenu`、`use-autosize.ts`；**不移植 glimm 扫光彩蛋**；听写指示复用 `TxTypingIndicator` bars 动画配方） | fusion-chat §3 |
| 09 | Recommendation Card | 新增 | `recommendation-card/` → `TxRecommendationCard`；`signal-meter/` → `TxSignalMeter`（独立原子） | fusion-actions |
| 10 | Context Cards | 新增 | `context-cards/` → `TxContextCards` + `TxContextChunk` | fusion-navcards §1 |
| 11 | Diff Table | 新增 | `diff-table/` → `TxDiffTable`（变更集语义 + 阶段机 + `play/reset/settle` expose） | fusion-tables §2 |
| 12 | Records Table | **不新增组件** | `TxDataTable` 加法式扩展 + 单元格原语组合，落成文档化方案（demo + 文档） | fusion-tables §3 |
| 13 | Filter Table | 新原语 + 组合 | `filter-chips/` → `TxFilterChips`；表体用 `TxDataTable` 组合（瞬时过滤，不移植折叠动画——BUI 的折叠自带 a11y 缺陷） | fusion-tables §4 |
| 14 | Sidebar Nav | 新增 | `sidebar-nav/` → `TxSidebarNav`（tuffex 无垂直导航，真空） | fusion-navcards §2 |
| 15 | Search | 组合薄壳 | `search-panel/` → `TxSearchPanel`（内组合 TxSearchInput + TxSearchEmpty；键盘导航按 TxCommandPalette 范式**补齐**） | fusion-navcards §3 |
| 16 | Insight Cards | 新增组件族 | `insight-cards/` → `TxInsightCards`；`spark-chart/` → `TxSparkChart` + `TxChartScrubber`（同目录）；`allocation-bar/` → `TxAllocationBar`。图表自研 canvas（liveline 是 React-only，且 BUI 只用其静态渲染子集） | fusion-navcards §4 |
| 17 | Code Block | 新增 | `code-stream/` → `TxCodeStream`（复用 `TxCopyButton` + `shiki-runtime`；**不照抄手工 token 模型**） | fusion-status-loading §4 |
| 18 | Fine-tune Card | 新增 | `fine-tune-card/` → `TxFineTuneCard`；`scrub-field/` → `TxScrubField`（Figma 式 scrub 数值域，独立原语）；布局分段**复用 `TxFlatRadio`** | fusion-navcards §5 |
| 19 | Selection Actions | 组合优先 | `selection-actions/` → `TxSelectionActions`（TxBaseAnchor virtualReference + vueuse `useTextSelection` + 新 `useSelectionAnchor`；零新依赖） | fusion-actions |

**共享单元格/视觉原语（新增小组件）**：`dot-indicator/` → `TxDotIndicator`（裸圆点+label）、`cell-link/` → `TxCellLink`（表格单元格链接）、`icon-chip/` → `TxIconChip`（图标角标方块，10/14/16/18 四处共用）。

新组件目录合计 **24 个**；不导出的内部子件（TxTaskRow）不单立目录。

## 2. 现有组件扩展（全部加法式、默认关闭、不破坏既有 API）

| 组件 | 扩展 | 独占实施归属 |
|------|------|------------|
| `TxDataTable` | `maxHeight` / `scrollX` / `stickyHeader` / `stickyFooter` / `rowClass` / `highlightSelected` / `sortCycle: 'tri'\|'bi'`；新 slots `footer` / `footer-<key>`；`header-<key>` 作用域扩为 `{column, sorted, order, toggle}`；显式受控 `sort` + `update:sort`；sticky 壳下切 `border-collapse: separate`（仅 `.is-sticky-shell` 类内） | W4 |
| `TxCheckbox` | `indeterminate?: boolean` + `aria-checked="mixed"` + 横杠视觉 | W4 |
| `TxTag` | `dot?: string` / `dotSize?` / `variant?: 'outline'\|'soft'\|'plain'` / `count?: number` | W4 |
| `TxSources` | `variant?: 'default'\|'stack'`（favicon 堆叠头） | W2 |
| `TxSuggestionChips` | `layout?: 'wrap'\|'list'`（纵向追问列表） | W2 |
| `TxBaseAnchor` | 虚拟参考点场景可选关掉 `flip` 中间件（新增可选 prop，默认行为完全不变） | W3 |

**明确不改**：`TxAvatar`（demo 侧传 `name.slice(0,1)`）、`TxButton`（PromptBar 发送键自绘，ink 主行动色是 BUI 签名，不给 TxButton 加 tone）、`TxChainOfThought` / `TxReasoningDisclosure` / `TxToolCallCard` / `TxCollapse`（既有披露语法不重构）、`TxFlatRadio` / `TxTabs`（指示器逻辑不抽离重构，新组件用新 `useIndicatorBox` composable）。

## 3. 基础设施层（Phase A，主会话独占）

1. **`style/bui-tokens.scss`（新建）**：33 token × `:root` / `[data-theme='dark'], .dark` + `--tx-bui-radius-chip/control/card`（6/8/10px）+ `--tx-bui-font-mono`。命名 `--tx-bui-*`（防宿主同名污染，见 style 报告 §3.2）。默认值 = BUI 原值（像素还原优先；宿主可用 CSS 变量覆写接回品牌色）。**排除 `--lexi-*` / `--ld-*`（抓取混入的浏览器扩展样式）**。`--shadow-overlay` 暗色环用 `--line-strong`（明暗结构性差异，不能同模板生成）。
2. **`style/mixins.scss`（追加）**：`bui-scope`（局部 reset：box-sizing/button/list/heading/svg，13px 基准）、`bui-keyframes-*` 9 个（keyframes 命名 `tx-bui-*`，组件内各自 emit——子路径分发模型的硬约束）、`shimmer-text-surface($duration: 1.4s)`、`fade-up-in` / `pop-in` / `disclosure-collapse` / `tabular-nums` / `card-bar` / `card-pad` / `press-scale`（reduced-motion 内建）。`stream-in` 的 `filter:blur()` 压缩产物要写回 `blur(0)`。
3. **`style/variables.scss`（追加一行）**：`--tx-ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)`（三簇主缓动，出现频次过高不该写字面量）。
4. **`style/index.scss`**：`@use './bui-tokens.scss'`。
5. **`scripts/audit-package-size.mjs` LIMITS 调高**（base.css 余量 2,384B < token 增量 2.7KB；components.css 余量 6,517B << 19 组件 ≥53KB）。**Phase A 就调**，否则每个实现 agent 本地 audit 全红。调整量按估算 + 裕度：`baseCssBytes` +8KiB、`fullCssBytes` +96KiB，收尾按实测回收多余裕度。
6. **共享 composable**：`packages/components/src/utils/`（或就近组件目录）新增 `useIndicatorBox`（测量+translate 移动指示器，sidebar-nav 与 fine-tune 用；不回改 TxFlatRadio/TxTabs）。

## 4. 横切硬约定（每个实现 agent 必须遵守）

1. **组件是纯受控原语，demo 编排不进组件**。BUI 源码全是自驱动 demo；时间轴（STAGES/TICKS/LINE_MS…常量已抄录在各报告）放 nexus demo 层。唯一例外：`TxDiffTable` 的阶段机是其语义本体（`play: 'auto'|'manual'|'settled'` + expose `play/reset/settle`），`TxWorkingIndicator` 的计时器是其语义本体（`startedAt` 受控）。
2. **reduced-motion 逐组件显式写**（tuffex 无全局兜底）：CSS 动画 `animation: none`（注意 01 像素格要停在 `opacity:.15` 暗态）；WAAPI/JS 动画（selection-actions 宽度形变、scrub）用 `matchMedia` 守卫。语义保持 BUI：只砍补间不砍状态机；01 计时器在 rm 下继续走。
3. **keyframes 全部组件内 emit**，命名 `tx-bui-<motion>`（经 mixin），禁止放全局表。
4. **样式写法**：`<style lang="scss">` 非 scoped（对齐 TxToolCallCard；BUI 子元素类名多，scoped 会放大体积）；类名 `tx-bui-<component>__<element>` + `is-*` 状态；每个 `var()` 带内联回退（1,416 处既有惯例）；透明度还原用 `color-mix(in oklab, …)`（BUI 编译产物如此）；**不加 `@supports` 回退层**；**禁止挂 `.tx-card` / `.tx-base-surface` / `.fake-background` 类**（全局着色层会套第二层环）；发丝环走 shadow 不走 border（双线陷阱）；**不用 `@include elevation()`**。
5. **半像素字号照抄**（13/12.5/11.5/10.5px 是 BUI 密度语言，有 TxToolCallCard 先例），数字一律 `tabular-nums`，差分负号用 **U+2212 `−`**。
6. **链接不自行导航**：`href` 场景一律 `@open` 事件（TxSources 既有约定，Electron 安全）。
7. **a11y 按 tuffex 标准补齐，不继承 BUI 缺陷**：@ / 命令菜单按 combobox 范式（TxSearchSelect）；搜索面板补键盘导航（TxCommandPalette 范式）；checkbox 三态补 `aria-checked="mixed"`；被过滤行补 `hidden`；折叠区补 `aria-controls`；chip select 补 Escape/outside-click/listbox。交互控件一律语义元素 `button type="button"`。
8. **源码缺陷修正清单**（fusion-tables §6 D1–D8 + 各报告风险节）：sorter 按时间戳不按 localeCompare、筛选计数派生不硬编码、行染色 class 驱动不 inline（修 hover 被压）、13 的行分隔线缺失**按截图保留**并注释。
9. **每个新组件文件头带 MIT 署名**：`// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.`
10. **测试**：每目录 `__tests__/<name>.test.ts`（mount + 类名/文本/aria 断言 + 受控 props 回路）；泛型组件 expose 面按解包类型断言（memory：tuffex-generic-sfc-expose-typing）。
11. **不碰共享文件**：`components.ts` / 双语 README / `apps/nexus/app/plugins/tuffex.ts` / `demo-registry.ts` / `DocsSidebar.vue` 由主会话统一编辑。

## 5. nexus 文档与 demo 设计

- **每个新组件目录一对文档** `content/docs/dev/components/<kebab>.zh.mdc` + `.en.mdc`（24 对）：8 字段 frontmatter、`status: beta`、`since: 2.5.0`、中文段名（基础用法/场景/API/交互契约/最佳实践/Source/审阅说明）、zh/en 段数相等、`syncStatus: reviewed`、`verified: true` 仅在真实核对后写。子件（TxContextChunk/TxChartScrubber/TxDiffChips）在父文档内成段，不单立文档。
- **现有文档增补**（5 处，跟随各自扩展的 wave 走）：data-table（新 props/slots + records 组合场景）、tag、checkbox、sources、suggestion-chips。
- **demo**：`app/components/content/demos/<RegistryKey>.vue`，命名 `<Pascal><DemoName>Demo`；BUI 时间轴在 demo 层复刻（观感对齐 shots）；文案用 `useI18n().locale` 切换。
- **分类**：复用现有 9 个 category，不新增。缺省映射——Status（working-indicator/agent-trace/task-rows/tool-chips）、Data（diff-table/filter-chips/context-cards/insight-cards/spark-chart/allocation-bar/dot-indicator/cell-link）、Form（prompt-bar/approval-card/scrub-field/fine-tune-card/search-panel）、Navigation（sidebar-nav）、Feedback（recommendation-card/selection-actions）、Basic（icon-chip/inline-citation/code-stream 归 Data 或 Basic 由实现时就近对齐同类）。
- **AI 套件总览页**：`content/docs/dev/components/ai-suite.zh.mdc` + `.en.mdc`，走 standalone 平铺（`DocsSidebar.vue` 的 `COMPONENT_STANDALONE_PAGES` 加一行，仿 foundations）。内容：19 个 BUI 组件的完整案例（含 07 Chat showcase demo 与 12 Records 组合 demo）+ 每个的跳转链接 + MIT 来源署名段。**这是交付给用户的入口链接**：`https://tuff.tagzxia.com/docs/dev/components/ai-suite`（本地 `pnpm nexus:dev` → `http://localhost:3200/docs/dev/components/ai-suite`）。

## 6. 实施分工（文件集互斥）

- **主会话（串行）**：Phase A 基础设施 → 各 wave 完成后的共享文件集成（barrel 字母序、README 双语计数与分类清单、nexus tuffex 插件两处、demo-registry 字母序、DocsSidebar 一行）→ ai-suite 页 → 验证与收尾。
- **W1 状态簇**：working-indicator、agent-trace、task-rows、code-stream
- **W2 聊天簇**：inline-citation、prompt-bar ＋ 独占改 sources/、suggestion-chips/
- **W3 动作簇**：approval-card、tool-chips、recommendation-card、signal-meter、selection-actions ＋ 独占改 base-anchor/
- **W4 表格簇**：diff-table、filter-chips、dot-indicator、cell-link ＋ 独占改 data-table/、checkbox/、tag/
- **W5a 导航簇**：context-cards、sidebar-nav、search-panel、icon-chip
- **W5b 卡片簇**：insight-cards、spark-chart、allocation-bar、fine-tune-card、scrub-field
- 文档+demo 由同簇 agent 在组件完成后续写（文档/demo 文件按组件名互斥）；07 Chat showcase demo 与 12 Records 组合 demo 归 W2 / W4。

## 7. 验证矩阵（Phase 2.2 / 收尾门）

| 门 | 命令 |
|---|---|
| tuffex 构建 | `pnpm -C packages/tuffex build`（下游 typecheck 前必跑，exports 解析到 dist/） |
| tuffex 类型/测试 | `pnpm -C packages/tuffex typecheck` + `test` |
| tuffex 四审计 | `audit:exports` / `audit:readme` / `audit:types` / `audit:size`（读 dist/，先 build） |
| nexus 类型 | `pnpm -C apps/nexus typecheck`（**必须走包装层**，raw 会漏 Volar 插件解析失败） |
| nexus 围栏/测试 | `check:mdc-fences` + `test` |
| lint | `pnpm lint:changed` |
| 视觉抽查 | headless Chrome + `audit-cdp-client.mjs` 截图 nexus demo，与 research/beautifului-src/shots/ 明暗双主题比对（memory：nexus-cdp-visual-verification） |

## 8. 风险与已接受的取舍

1. **高对比主题（HC light/dark）下 `--tx-bui-*` 保持 BUI 原值**，对比度可能不达标——本期不设计 HC BUI token，在 bui-tokens.scss 注释 + ai-suite 文档标注为已知限制。
2. **17 的代码高亮走 shiki**，BUI 手工五色映射不逐像素复现；如需贴近，实现时给 shiki 配自定义主题把 5 个 scope 映到 `--tx-bui-*`（AC2 风险点，允许「结构一致、高亮配色近似」）。
3. **13 的行折叠动画不移植**（a11y 缺陷 + 需破坏性改 TxDataTable DOM）；shots 是静态终态，验收不受影响。
4. **02 导轨 500ms 高度补间改纯 CSS `::before`**（放弃 JS 测量），折叠裁剪下肉眼几乎无差。
5. **06/其他 状态徽章动画重放需显式 `:key="status"`**——写进各组件测试。
6. **sticky × border-collapse 切换只在 `.is-sticky-shell` 内生效**，`bordered`/`striped` 既有观感回归需 Chromium+WebKit 双验。
7. **体积门**：LIMITS 调高是显式技术决策（新组件族的真实体积），收尾时按最终实测回收裕度并在 commit message 记录。
