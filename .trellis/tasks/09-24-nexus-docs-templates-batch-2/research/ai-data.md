# Research: 第二批 AI / 数据模板（侧边 Copilot · 运营大屏 · Release 发布控制台）

- **Query**: 为 AgentChat 第二风格「侧边 Copilot」、Dashboard 第二风格「运营大屏」、新章节「Release 发布控制台」调研批 1 未覆盖的 tuffex 组件，给出三档布局、组件分工、交互、`@enter` 脚本、双语 mock 与风险。
- **Scope**: internal（tuffex 源码与 dist、Nexus demo / 文档页 / 公共资源、`.trellis/spec`、批 1 研究与已上线的 10 个模板）。没有做外部检索。
- **Date**: 2026-09-24
- **基线**: 本文引用的组件目录，源码都不比 `packages/tuffex/dist/es/<dir>/index.js`（09-24 07:31 构建）新，用 `find -newer` 核对过（charts、selection-actions、diff-table、version-capsule、text-morph、slider、segmented-slider、modal、steps、timeline、code-stream、data-table、tag、button、tool-confirmation、tool-chips、insight-cards、spark-chart、transition、base-anchor 等）。唯一例外是 `mode-chip/index.ts`，08:07 改过，看起来只动了文档注释。Nexus dev 默认读 dist，所以源码里读到的行为就是页面上的行为。
- **路径缩写**：`C/` = `packages/tuffex/packages/components/src/`，`D/` = `apps/nexus/app/components/content/demos/`，`N/` = `apps/nexus/`。

---

## 结论速览

1. **三个模板都能用现有组件拼出来，没有阻塞项。** 动手前需要主 agent 拍板四件事，见 Risks 第 1–4 条：
   - 大屏是否强制暗色；
   - Copilot 的脚本选区用什么实现；
   - Release 示例数据怎么呈现；
   - Release 用哪种审批形态。
2. **`TxSelectionActions` 是 Copilot 的核心，也是本批最大的坑。**
   - 它通过 `TxBaseAnchor` teleport 到 `<body>`，锚在一个「选区快照」构成的虚拟参考上。
   - 组件自己监听 window 的 scroll 和 resize，但重算时只拿快照里的 rect。按 floating-ui 1.7.6 的算法推断，页面一滚动，工具条就会贴在视口上不动，和文字错开；模板内部的滚动容器滚动时同样错位。这一条来自源码，**未在浏览器实测**。
   - 宿主必须在以下时机用 `range.getClientRects()` 重新测量，再调用 `updatePosition()`：
     - 页面滚动或文章滚动；
     - 文章尺寸变化；
     - 模板展开或收起。
3. **大屏的暗色墙可以只在模板里生效：在模板根上挂 `data-theme="dark"`。**
   - tuffex 的暗色 token 选择器是不限定元素的 `[data-theme='dark'], .dark`，所以挂在任意元素上都会生效。
   - 只有 5 个派生 token 需要在根上重新声明。
   - 另需在根上加 `color-scheme: dark`：地图和桑基图 tooltip 的背景兜底是系统色 `canvas`，只有这样才会变暗。
4. **地图用 `TxBubbleMap`，数据用站内的 `/geo/world-countries.geo.json`。**
   - 这份文件同源，257 KB，含 180 个国家。
   - 不用 choropleth，原因有三：它会画出国界；名称只有英文；数据把 Taiwan 列为独立 feature。
   - `roam` 必须关闭，打开后地图会吞掉页面滚轮。
5. **`TxSankeyChart` 有四处要宿主处理：**
   - tooltip 写死了英文 `Value` 和 `N items`，需要改用 `#tooltip` 插槽；
   - 高度只能用数值 prop 传；
   - 各节点的流量守恒要自己算；
   - 数据更新时没有补间，而且会清掉 hover 状态。
6. **Release 有四个坑：**
   - `TxSteps` 的 `active` 优先于单步 `status`；
   - `TxToolConfirmation` 的「记住」复选框无法隐藏；
   - `TxVersion*Panel` 只要传了 `href`，就会渲染成可下载 / 可导航的链接；
   - R1 发布完整性要求：版本号用永远不会发布的预发布标识（建议 `-demo.N`），sha256 和签名全部标「示例」。

---

## Reused from batch 1

下列组件的 API 已在批 1 调研里写全，本文不再重复，只补本批新发现的注意事项。

- `ai` = `.trellis/tasks/09-23-nexus-docs-templates-tab/research/ai.md`
- `data` = 同目录 `data-flow.md`

| 组件 | 批 1 出处 | 本批用在 | 本批补充 |
|---|---|---|---|
| TxPromptBar | ai §TxPromptBar | Copilot 侧栏输入 | 侧栏约 320px 宽，不要传 `models`：空数组时隐藏模型选择（`C/prompt-bar/src/TxPromptBar.vue:578`）。菜单向上弹出约 220px，侧栏不能设 `overflow:hidden` |
| TxChatMessage | ai | Copilot 回显读者的动作 | `:markdown="false"` |
| TxThinkingOrb | ai | Copilot 头部的在场感 | 固定 `state`；空闲时 `paused` |
| TxTypingIndicator | ai | Copilot「正在改写…」 | — |
| TxStreamMarkdown | ai | Copilot「解释」的答案 | 走 `v-html`，不写链接；正文固定 16px，需要局部覆盖 |
| TxSuggestionChips | ai | Copilot 下一步建议 | 暗色下底色透明，侧栏必须给不透明底 |
| TxDiffChips | ai | Copilot 改动摘要 `README.md +1 −1` | 以 `diff.file` 为 key（`C/tool-chips/src/TxDiffChips.vue:23-26`），同名文件会撞 key |
| TxMessageActions | ai | 复制建议 | — |
| TxToolConfirmation | ai | Release 首次放量闸门 | 「记住」复选框无条件渲染（`C/tool-confirmation/src/TxToolConfirmation.vue:61-64`）；`aria-label` 后缀固定为英文（:44）。见下文 cheat sheet 补充 |
| TxSignalMeter | ai / data | 大屏健康灯、Release 护栏 | — |
| TxInsightCards / TxInsightMetric | ai / data | 大屏焦点轮播 | 组件内没有计时器（`C/insight-cards/src/TxInsightCards.vue` 中无 setTimeout），轮播由宿主驱动 `v-model:active-index`；切页过渡有 reduced-motion 保护（:216、:257） |
| TxSparkChart / TxChartScrubber | data | 大屏 KPI 条带、Release 崩溃率趋势 | 实时条带用 `:animation="false"`；接近 100% 的比率用 `domain`；颜色在图表根上用 `getComputedStyle` 读 token（`C/spark-chart/src/TxSparkChart.vue:122-139`），所以能跟随局部暗色作用域 |
| TxStatCard | data | 可选的 KPI 外壳 | value 为 28px；要做大字需要 `:deep(.tx-stat-card__value)` 放大 |
| TxDotIndicator | data | 健康灯 | 没有脉冲动画（`C/dot-indicator/src/types.ts` 只有 color/label/size/ariaLabel），脉冲环要手写 |
| TxStatusBadge | data | 各处状态 | — |
| TxDataTable | data | Release 产物矩阵 | `maxHeight` 是数值 prop，从 slot `height` 算 |
| TxTimeline | data | Release 发布动态 | 暗色下圆点有白环，用 `:deep` 覆盖（先例 `D/TemplateAutomationDemo.vue:1674-1676`） |
| TxSteps / TxStep | data | Release 流水线 | `active` 优先于 `status`，见 cheat sheet 补充 |
| TxCodeStream | ai / data | Release 构建日志 | 外面包一层滚动容器，每次揭示后把 `scrollTop` 拉到底（先例 `D/TemplateAutomationDemo.vue:452-460, 1901-1914`，`:min-height="0"`） |
| TxProgressBar | data | Release 当前放量比例 | — |
| TxAllocationBar | data | 大屏焦点页（AI 端侧占比） | 不超过 4 段；数字沿用批 1 Dashboard 的 72.4 / 23.1 / 4.5（`D/TemplateDashboardDemo.vue:693-703`） |
| TxToastPanel | data | 三个模板的反馈 | 受控；reduced motion 下不启动自动关闭计时 |
| TxFlatRadio | data | Release 中栏页签 | — |
| TxMarkdownView | ai | Release 说明预览 | 走 `v-html`、不写链接；`.markdown-body` 字号覆盖先例 `D/TemplateLauncherDemo.vue:1073-1079` |
| TxButton / TxIconButton | ai | 各处 | — |
| TxSkeleton | ai | GeoJSON 加载占位 | — |
| TxWorkingIndicator | ai / data | Release 运行中 | 空闲时 `v-if` 掉（它有 100ms interval） |
| ChartPalette（`@talex-touch/tuffex/charts`） | data | 颜色 | `categoricalVar(i)` 跟随主题（包括局部作用域） |

**批 1 已上线模板里可以直接照抄的写法**：

- **计时器与复位**
  - `later` / `every` / `clearTimers`：`D/TemplateAgentChatDemo.vue:759-779`
  - `resetDemo` + `generation`：`:1458-1480`
  - `watch(locale, resetDemo)`：`:1476`
- **reduced motion 直接落终态、闸门仍然等待**：`settleToGate`，`:1331-1360`
- **闸门不设计时器**：`beginGate`，`:1190-1197`；闸门旁的提示文案 `gateHint` 在 `:276`
- **读者按下即停止自动演示**：`D/TemplateShellDemo.vue:596-599`，根元素 `@pointerdown="stopAutoplay"` 在 `:679`
- **`@enter` 之前不挂图表**：`v-if="entered"`，`D/TemplateDashboardDemo.vue:1073`
- **运行计划式时间轴**：`buildPlan` 生成步骤，reduced motion 下同步执行全部步骤，`D/TemplateAutomationDemo.vue:497-649`
- **`TemplateFrame` 已经给宿主加了 `not-prose`**（`D/TemplateFrame.vue:184, 214`），模板根不用再加。

---

## New component cheat sheets

### TxSelectionActions（划词工具条）+ `useSelectionAnchor` / `resolveSelectionPayload`

**导出与导入**

- 组件 `TxSelectionActions` 走全局注册，模板里直接写标签。
- `useSelectionAnchor`、`resolveSelectionPayload` 是运行时函数，必须显式 value import：`from '@talex-touch/tuffex/selection-actions'`。
- 类型同一路径导出：`SelectionPayload`、`SelectionActionItem`、`SelectionActionState`、`SelectionActionsProps` 等（`C/selection-actions/index.ts:1-54`）。

**数据**

- `SelectionPayload { text: string; rects: DOMRect[]; range?: Range }`（`src/types.ts:10-17`）。它是**快照**：聚焦工具条自己的输入框会让文档选区塌缩，所以动作必须作用在这份快照上。

**Props**（默认值见 `src/TxSelectionActions.vue:9-33`）

| 名称 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `selection` | `SelectionPayload \| null` | `null` | 为空时收起工具条 |
| `state` | `'idle'\|'thinking'\|'streaming'\|'result'` | `'idle'` | 状态机由宿主持有，组件从不调用模型 |
| `actions` | `SelectionActionItem[]`（`{ id, label, more?, busyLabel? }`） | Explain / Improve，外加折叠的 Shorten / Tone / Grammar（英文） | `more: true` 表示收进 chevron |
| `activeActionId` | `string` | — | 决定忙碌文案，如「润色中…」 |
| `expanded` / `prompt` | `boolean` / `string` | 非受控 | `v-model:expanded`、`v-model:prompt` |
| `hidePrompt` | `boolean` | `false` | 隐藏自由指令输入框与发送键 |
| `placeholder`、`ariaLabel`、`keepLabel`、`discardLabel`、`retryLabel`、`sendLabel`、`expandLabel`、`collapseLabel`、`busyLabel` | `string` | 英文 | **全部可传，能做到完全本地化**（先例 `D/SelectionActionsRewriteDemo.vue:8-46`） |
| `offset` | `number` | 8 | 距选区最后一行的距离（px） |

**Events**：

- `action({ id, action, selection })`
- `submit({ prompt, selection })`：`prompt` 已 trim，空白不派发
- `keep`、`discard`、`retry`
- `update:expanded`、`update:prompt`

**Slots**：

- `action-icon({ action })`：一旦提供，就替换**所有**动作的图标。
  - 内置图形只认 `explain`、`improve`、`shorten`、`tone`、`grammar`；其他 id 会落到一个「T」形兜底图标（`:335-337`）。
  - 所以要加「翻译」，就得走这个插槽，同时给 explain / improve 自配图标（如 `i-carbon-help`、`i-carbon-magic-wand`、`i-carbon-translate`，均已核对存在）。
- `busy({ label })`
- `result`：替换「保留 / 放弃 / 重试」整组。

**Expose**：`updatePosition()`、`focusInput()`、`el`（根元素，交给 `useSelectionAnchor` 的 `ignore`）（`:199-218`）。

**定位（重点）**

- 渲染在 `TxBaseAnchor` 里，传入 `virtualReference`（`:76-96`）。水平方向居中于全部 rect 的并集，竖直方向贴最后一行的底边。
- 其余 anchor 参数：`placement="bottom"`、`disable-flip`（靠近视口底部也不翻到上方）、`close-on-click-outside=false`、`close-on-esc=false`、`max-width 720`、`animation none`（`:222-239`）。
- 面板经 `<Teleport to="body">` 挂到 body（`C/base-anchor/src/TxBaseAnchor.vue:1037`），定位策略 `strategy: 'absolute'`，即文档坐标（`:178-211`）。
- z-index 每次打开从分配器取 `next()`（`:914`，种子 2000），所以**高于 TemplateFrame 展开浮层的 1900**，列内态下也会压在 docs 页头之上。
- **有虚拟参考时，组件在 window 上挂 `resize` 和 `scroll`（capture）监听**，回调里直接 `update()`（`:928-941`）。
  - `update()` 读的是 `props.selection.rects` 快照。
  - floating-ui 在 absolute 策略下把参考点算成 `rect.top + window.scrollY`（`node_modules/.pnpm/@floating-ui+dom@1.7.6/.../floating-ui.dom.mjs:385-417`）。
  - 页面滚动时快照不变而 scrollY 在变，结果是工具条在文档里被推走，**看起来钉在视口上**，和文字错开。
  - 模板里的文章滚动容器滚动时，同理错位。
  - 以上是从源码推断的，**未在浏览器实测**，实现时第一个要验。
- 宿主的两种对策：
  1. **文档契约做法（推荐）**：
     - 持有一个 `Range`（快照里就有 `range.cloneRange()`；Range 会跟随 DOM 变化，是活的）。
     - 在以下时机执行 `rects = Array.from(range.getClientRects())`，然后 `nextTick(() => barRef.value?.updatePosition())`：
       - window `scroll`（capture、passive）；
       - 文章滚动容器的 `scroll`；
       - 文章的 ResizeObserver；
       - `TemplateFrame` 的 `expanded` / `width` 变化；
       - 切换语言。
     - 必须放在 `nextTick` 里，因为子组件的 props 要等父组件 flush 后才更新。官方 demo 在流式重排时就是这么做的（`D/SelectionActionsRewriteDemo.vue:83-98`）。
  2. **活 getter**：payload 的 `rects` 定义成 `get: () => Array.from(range.getClientRects())`。组件每次 `update()` 都会重读，滚动时不用宿主再监听。但它依赖 `:76-96` 的实现细节，比较脆弱；展开 / 收起、侧栏折叠这类没有 scroll/resize 事件的场景，仍然要手动调用 `updatePosition()`。
- 选区滚出文章可视区时，工具条不会被裁剪（它在 body 上）。idle 态下应主动收起（`selection = null`）。
- 靠近舞台底边的选区：因为 `disable-flip`，工具条会挂到舞台外、压在下方的 docs 正文上。脚本里的目标句要离舞台底边至少 64px，文章 `padding-bottom` 至少 56px。

**焦点与指针**

- 工具条根上 `pointerdown` 会 `preventDefault`，但放行 input / textarea / contenteditable（`:192-197`）。所以点按钮不会让选区塌缩。
- `useSelectionAnchor` 必须传 `ignore: () => [barRef.value?.el ?? null]`，否则一点输入框工具条就会自行消失（文档 `N/content/docs/dev/components/selection-actions.zh.mdc:149`）。
- 根元素是 `role="group"`；折叠起来的动作 `tabindex=-1`。

**追踪层 `useSelectionAnchor({ root, debounce = 120, minLength = 1, disabled, ignore })`**（`src/use-selection-anchor.ts:77-136`）

- 基于 VueUse `useTextSelection`，也就是 document 上的 `selectionchange`。
- `root` 限定到文章节点，否则页面上任何一次选中都会弹出工具条。
- 返回 `{ selection, clear }`。
- **textarea / input 里的选区拿不到 Range rects**，所以宿主页面必须是普通 DOM（或 contenteditable），不能用 `TxTextarea` / `TxCodeEditor`；`TxMarkdownEditor` 本来就被禁用。

**动效**

- 入场是 `bui-spring-in(340ms)` 回弹。
- 宽度形变走 WAAPI，脚本里判断 reduced motion 后跳过补间（`:103-138`）。
- CSS 在 reduce 下关掉所有 transition 和 spinner（`:660-681`），状态机照常推进。

**暗色**：BUI（`--tx-bui-surface/ink/line`），跟随 `.dark` / `[data-theme='dark']`。

**可借**：`D/SelectionActionsRewriteDemo.vue`。

- idle 态用 anchor 的选区；运行中改用宿主 pin 住的 payload，并对正在重排的元素重新测 rect；
- `reset(keep)` 之后调用 `clear()`。

### TxDiffTable（变更表格，可选：结构化「逐条采纳 + 应用 N 处」）

**Props**（`C/diff-table/src/types.ts:79-160`，默认值 `TxDiffTable.vue:8-25`）：

- `columns: { key, title, dataIndex?, width?, align?, strikeOnRemove?, tintText?, format? }[]`
- `rows: { key, data, change?: 'unchanged'|'added'|'removed'|'modified' }[]`
- `title?`、`hint?`
- `play: 'auto'|'manual'|'settled'`，默认 `'auto'`
- `stageDelays [800,1000,1000]`、`duration 400`
- `selectable false`、`modelValue?`（被采纳的 key，绑定即全受控）
- `footer false`：左侧计数，右侧「应用 N 处」按钮
- `summaryFormatter` / `applyLabelFormatter` / `rowToggleLabelFormatter`：默认都是英文

**Events**：

- `stageChange(stage)`
- `settled`
- `update:modelValue(keys)`：按行序发出
- `toggle({ key, accepted })`
- `apply(keys)`

**Slots**：`title`、`hint`、`footer({ counts, accepted })`、`cell-<key>({ row, column, value, change, index })`。

**Expose**：`play()`、`reset()`、`settle()`、`stage`。

**坑**：

- `play="auto"` 在 `onMounted` 就开跑（`:108-113`）。模板里要用 `play="manual"`，在 `@enter` 之后 `ref.play()`；reduced motion 下用 `play="settled"`。
- **单元格 `white-space: nowrap` 加省略号**（`:596-616`），整句的散文会被截断。放长句必须 `:deep(.tx-bui-diff-table__cell){ white-space: normal }`，属于手写覆盖。
- 应用按钮是品牌蓝底配白字（`:557-578`）。
- 红绿底色用 `--tx-bui-*-tint`，有暗色版本。
- reduced motion 下只砍补间，状态机照走（`:728-734`）。

**适用**：

- Copilot 宽档里「一次改好几段」的批量采纳。
- Release 的「灰度参数变更」表，例如 `exposure 5% → 25%`、`channel`、`min version`。

单句改写不建议用它，散文会被截断，用手写的行内 diff 更自然（见 Copilot 方案）。

### TxTextMorph（数字滚动）

**Props**（`C/text-morph/src/types.ts`；默认值 `src/engine/types.ts:47-56`）：

- `text: string | number`：数字先经 `toLocaleString(locale, decimals)` 格式化
- `tag 'span'`、`durationMs 400`、`easing`
- `spring`：预设名或系数；设了它会覆盖时长和曲线
- `scale true`
- `numbers true`：按位值滚动，千分位跟着量级走
- `decimals?`、`locale 'en'`、`cursorIndex?`
- `disabled false`、`respectReducedMotion true`、`debug`

**Events**：`animation-start`、`animation-complete`、`animation-cancel`。

**行为**：

- 挂载后 Vue 不再渲染子节点（`TxTextMorph.vue:31-37`），由引擎接管。
- 根元素 `white-space: nowrap; display: inline-block`（`:98-105`），**不做软换行，也不做省略号**，所以只适合数字和短标签，不适合散文。
- reduced motion 下直接写 `textContent`（`src/engine/morph.ts:137-140`）。
- 样式没有 scoped，靠 `tx-morph-*` 属性限定作用域。
- 字号继承父元素：大字就给父元素设 `font-size` 和 `font-variant-numeric: tabular-nums`。

**用法**：

- 先例：`D/TemplateDashboardDemo.vue:917` 的 `<TxTextMorph :text="kpi.value" :locale="localeTag" />`。
- 大屏 KPI 直接传数字加 `:locale`；百分比传 `decimals`，单位写在组件外面。
- **同屏不要放太多高频实例**：每个字符都是一个带 `will-change` 的元素（文档 `text-morph.zh.mdc`「最佳实践」）。KPI 最多 6 个；事件滚动条不要用它。

### TxBubbleMap / TxChoroplethMap（`@talex-touch/tuffex/charts`，走全局注册）

**导出**：charts barrel 用显式 `export { TxBubbleMap, TxChoroplethMap }` 导出，所以会被全局注册（`C/charts/index.ts`）。类型 `MapGeoJson`、`BubbleMapProps` 等。二者都是泛型 SFC，没有 `*Instance` 类型。

**公共 Props**（`C/charts/src/maps/src/types.ts:20-48`）：

- `geoJson`：必填，`FeatureCollection`
- `center?: [lng, lat]`
- `zoom 1.25`：自适应缩放的倍率，以容器中心为基点
- `roam false`
- `projection`：d3-geo 实例；`null` 表示等距圆柱；默认是钳制纬度的 Mercator
- `showTooltip true`
- `valueFormat`：默认 `toLocaleString()`
- `aspectRatio?`：默认取投影窗口的宽高比
- `height?`：固定 px，优先于 `aspectRatio`
- `width?`

**BubbleMap 另有**：

- `data`、`lng`、`lat`、`value`、`name?`（accessor：key 或函数）
- `minRadius 6`、`maxRadius 26`、`bubbleSize?`
- `bubbleColor`：常量或 `(row) => color`，默认 `--tx-chart-categorical-1`
- `bubbleBorderColor`、`bubbleBorderWidth`：常量或函数。**宿主可以借此给「焦点城市」加环**
- 事件：`bubbleHover(row | undefined)`、`bubbleClick(row)`
- 插槽：`tooltip({ row })`

**Choropleth 另有**：

- `name`、`value`、`nameProperty 'name'`
- `colorRange`、`min`、`max`、`noDataColor`
- `showLegend`：图例在地图下方另占 22px 一行
- 事件：`regionHover`、`regionClick`
- 插槽：`tooltip({ row, regionName, value })`

**尺寸**：

- ResizeObserver 量宽度（`src/use-map-base.ts:134-149`）。
- 传了 `height` 就固定高度，投影用 `fitExtent` 等比塞进宽 × 高，宽高比不一致时两侧会留白（`:159-191`）。
- 根元素 `overflow: hidden`；tooltip 是容器内的 DOM，并被限制在容器范围内（`:276-288`）。

**动效**：

- 气泡入场在 **mount 时**跑 1000ms（`TxBubbleMap.vue:100-102`，`useEnterProgress`），reduced motion 下跳过（`C/charts/src/core/animate.ts:187-208`）。
- hover 强调走 `tween`，同样尊重 reduced motion。
- **数据更新时几何立即变化，没有补间**，因为 kumo 设了 `animationDurationUpdate: 0`（`TxBubbleMap.vue:111-116`）。大屏每几秒更新一次气泡值，半径会跳；想要平滑，可以手写 `:deep(.tx-map__bubble){ transition: r .6s }`，并放在 `prefers-reduced-motion: no-preference` 里面。

**颜色**：

- 陆地用 `--tx-chart-map-area`：亮色 `#e5e7eb`，暗色 `#2b2c31`（`C/charts/src/style/tokens.scss:43, 80`）。
- 陆地的描边色和填充色相同（`map-shared.scss:20-23`），所以 **BubbleMap 看不见国界**。
- Choropleth 按国家分色，会显出国界。

**`roam` 必须关**：开了以后 `@wheel` 会 `preventDefault()`（`use-map-base.ts:245-253`），读者的滚轮就滚不动 docs 页，还会 `setPointerCapture`。

**地理数据**：

- tuffex 不内置地理数据（文档 `maps.zh.mdc:15`）。
- Nexus 自带 `N/public/geo/world-countries.geo.json`（vendored 自 johan/world.geo.json，257 KB）：180 个 feature，`id` 是 ISO3，`properties.name` 只有英文名。
- 先例 `D/MapsBubbleMapDemo.vue:12-38` 在 `onMounted` 里用 `$fetch('/geo/world-countries.geo.json')`，同源、不依赖第三方源，但**运行时要走一次网络请求**：需要加载中和失败两种占位，并用 `shallowRef` 存。
- 数据里 `Taiwan` 是独立 feature，名称全英文。Choropleth 的着色、描边和 tooltip 名都会暴露这一点。**大屏只用 BubbleMap 画城市点，不做国家着色。**

### TxSankeyChart（`@talex-touch/tuffex/charts`，走全局注册）

**Props**（`C/charts/src/sankey/src/types.ts:33-70`，默认值 `TxSankeyChart.vue:16-28`）：

- `nodes: { id?, name, color?, value?, tooltipData?, isDrillable?, childCount? }[]`
- `links: { id?, source: 节点下标, target: 节点下标, value, isDrillable? }[]`
- **`height 400`，必须是数值**
- `width?`、`nodeWidth 8`、`nodePadding 10`
- `showNodeValues 'auto'`
- `nodeLabelLayout 'stacked'|'inline'`
- `formatValue`
- `showTooltip true`、`defaultNodeColor?`
- `left` / `right '5%'`
- `linkColor 'gradient'|'gray'`、`linkOpacity 0.5`

**Events**：`nodeClick(node)`、`linkClick(link)`。**Slots**：`tooltip({ params })`。

**布局**：

- 用 d3-sankey 计算。有环时 `computeSankeyLayout` 返回 `null`，只打一条 `console.warn`，**什么都不画**（`layout.ts:97-102`）。
- 节点的高度取「流入 / 流出」的较大者。节点 `value` 只用于显示，所以**每个中间节点的流入必须等于流出**，否则会留下一截秃尾巴（先例注释 `D/SankeyChartBasicDemo.vue:16-18`）。

**标签**：

- 节点在左半区时标签放右侧，否则放左侧（`:94-105`）。中间一列的标签会压在连线上。
- 窄宽度下用 `node-label-layout="inline"` 配短名称。
- 标签颜色 `--tx-chart-text-primary`。

**本地化缺口**：

- 默认 tooltip 写死了 `'Value'`（`:215, 218`）和 `{{ childCount }} items`（`:349`），必须用 `#tooltip` 插槽自己渲染。
- tooltip 背景用的是 `var(--tx-chart-tooltip-bg, canvas)`，这个 token 全仓没有定义，实际落到系统色 `canvas`，颜色随 `color-scheme` 走。

**动效**：没有入场动画。hover 采用邻接强调，其余元素变暗到 `opacity .1`，300ms 过渡只在 `no-preference` 下开启（`:370-376`）。

**数据更新**：

- layout 重算时没有补间，节点和连线直接跳到新位置。
- `watch(layout, clearHover)`（`:196`）：数据一变，hover 就被清掉。
- 大屏刷新间隔要长，读者指针悬停在图上时暂停刷新。

**尺寸**：宽度由 ResizeObserver 量；高度只能走 prop，展开态要从 slot `height` 算。

**颜色**：节点默认 `ChartPalette.categoricalVar(index)`，连线是源色到目标色的渐变。

### 局部暗色作用域（给运营大屏用）

**选择器**：

- `C/../style/variables.scss:391-392`、`style/bui-tokens.scss:79-80`、`C/charts/src/style/tokens.scss:58-59` 的暗色块，选择器都是不限定元素的 `[data-theme='dark'], .dark`。
- 模板根上挂 `data-theme="dark"`，整棵子树就会重新声明暗色的 `--tx-*`、`--tx-bui-*`、`--tx-chart-*`，页面是亮色也一样。
- **用属性，不用 `.dark` 类**。挂 `.dark` 类会连带激活 Nexus 的 UnoCSS `dark:` 变体：presetWind 的 class 策略会生成 `.dark .x` 规则（`N/uno.config.ts:7, 56-62`）。

**在局部作用域里不会自动变暗的 token**：它们在 `:root` 里由 `var()` 派生，暗色块没有重新声明，局部作用域继承的是按亮色算好的值。用脚本逐一比对过：

- `--tx-disabled-bg-color`、`--tx-disabled-text-color`、`--tx-disabled-border-color`（`variables.scss:321-323`）
- `--tx-chart-grid-line`（`tokens.scss:39`）
- `--tx-skeleton-base-color`（`tokens.scss:52`，亮色下为 `#dddddd`，暗底上的骨架会是浅灰）

模板根上照原式再声明一遍即可，例如 `--tx-skeleton-base-color: var(--tx-chart-semantic-skeleton)`。

**`color-scheme`**：Nexus 只在 `html.dark` 上设了 `color-scheme: dark`（`N/app/app.vue:576-578`）。局部作用域的根要自己加 `color-scheme: dark`，这样：

- 地图和桑基图 tooltip 的 `canvas` 系统色背景会变暗；
- 滚动条也会变暗。

**读 `<html>` 而不读局部作用域的组件**：

- `TxSparkChart` 的回退色走 `useAutoTheme`，只看 html/body（`C/stream-markdown/src/use-auto-theme.ts:13-30`）。颜色本身在图表根上读 token，所以能跟随；稳妥起见仍传 `theme="dark"`。
- `TxEChart` 与 `TxCodeStream`：传 `theme="dark"`。
- `TxThinkingOrb`：读 `html.dark`。
- `TxSlider` 的玻璃拇指：读 `html.dark` 或 `prefers-color-scheme`（`C/slider/src/TxSlider.vue:203-210`）。
- `TxBorderBeam`：`theme` 默认 `'dark'`；`'auto'` 读的是 `prefers-color-scheme`，而不是站点主题。

**teleport 出去的浮层会离开作用域**：`TxTooltip`、`TxPopover`、`TxDatePicker` 面板、`TxModal`、`TxSelectionActions` 都会渲染成页面主题。大屏里不要用会 teleport 的浮层；地图和桑基图的 tooltip 在容器内，不受影响。

**展开态**：TemplateFrame 的浮层头部在模板根之外，仍按页面主题显示，这是预期表现。

### TxSlider（细粒度百分比，可选）

**Props**（`C/slider/src/types.ts`，默认值 `TxSlider.vue:12-41`）：

- 数值：`modelValue 0`、`min 0`、`max 100`、`step 1`、`disabled`
- 无障碍：`ariaLabel`、`ariaLabelledby`（根元素是 div，`aria-label` 要走 prop 才能落到 input 上）
- 显示：`showValue`、`formatValue`
- 拇指：`thumbSurface true`、`thumbVariant 'solid'|'blur'|'glass'`（默认 blur）
- tooltip：`showTooltip true`、`tooltipTrigger 'drag'|'hover'|'always'`、`tooltipFormatter`、`tooltipPlacement 'top'|'bottom'`、`tooltipTilt false`，以及一组 jelly / motion 参数

**Events**：`update:modelValue`、`change`（松手时触发）。

**实现与限制**：

- 内部是原生 `<input type="range">`，所以键盘可用。
- tooltip 渲染在组件内部，不 teleport，位于拇指上方 36px（`:257-258`）。**上方要留约 40px 不被裁剪的空间。**
- 拖动时在 window 上挂 `pointermove`，挂载时挂 `pointerup`，卸载时清理（`:421, 514-541`）。
- reduced motion 在 setup 时读一次，只关掉 jelly 形变（`:169-175`），CSS 另有保护（`:1004`）。
- 没有刻度或档位。灰度常用的 1 / 5 / 25 / 50 / 100 用 `TxSegmentedSlider` 更贴切。

### TxSegmentedSlider（灰度档位）

**Props**（`C/segmented-slider/src/types.ts`）：

- `modelValue`（默认 0）
- `segments: { value, label? }[]`
- `disabled`、`showLabels true`、`vertical false`

**Events**：`update:modelValue`、`change`。

**行为**：

- **档位按下标均匀分布**，不按数值比例（`TxSegmentedSlider.vue:27-49`）：1、5、25、50、100 在视觉上等距，正适合灰度。
- 根元素是 `role="radiogroup"`，方向键 / Home / End 切换（`:73-96`）。`aria-label` 走透传属性。
- `modelValue` 为 `null` 时，`onMounted` 会自动 emit 第一档（`:104-111`）。

**布局**：

- 标签绝对定位在圆点下方（`top: calc(100% + 8px)`，`nowrap`，`translateX(-50%)`，`:279-289`）。
- 首尾两档的标签会**溢出轨道两端各约半个标签宽**，还会溢出根元素底部约 20px。外层要给左右约 20px、下方约 24px 的 padding；放在会滚动的侧栏里还会被横向裁掉。

**颜色**：

- 进度与激活色走 `--tx-color-primary`。
- 轨道由文字色混出来，暗色下依然可见。
- reduced motion 保护在 `:291-297`。

### TxModal

**Props**（`C/modal/src/TxModal.vue:13-23`）：`modelValue`（必填）、`title`、`width '480px'`。

**Events**：`update:modelValue`、`close`。**Slots**：default、`header`、`footer`。

**行为**：

- teleport 到 body（`:107`），`position: fixed; inset: 0`，z-index 取分配器的 `next()`（`:35, :45`）。无论列内还是展开态，都盖住视口，并且**高于展开浮层**；这是组件本身的行为，spec 允许。
- 打开时聚焦遮罩层，Tab 在内部循环，关闭时焦点还给之前的元素（`:41-99`）。
- Esc 由遮罩层自己处理。遮罩层不在 TemplateFrame 的 host DOM 里，所以**不会连带收起展开态**。

**缺口**：

- 关闭按钮的 `aria-label="Close"` 写死（`:129`）。
- 进出场动画（`:219-262`）**没有 reduced-motion 保护**。批 1 已记入缺陷表，design.md §6.11。

**先例**：`D/TemplateSettingsDemo.vue:955-970`（确认框加 footer 双按钮）。

### TxVersionCapsule / TxVersionDownloadPanel / TxVersionHistoryPanel

**TxVersionCapsule**

- Props（`C/version-capsule/src/types.ts:9-28`，默认值 `TxVersionCapsule.vue:7-16`）：
  - `version`（必填）、`channel?`、`tone 'stable'|'preview'|'nightly'|'neutral'`
  - `historyLabel 'History'`、`downloadLabel 'Download this build'`
  - `panel`：受控 `'download'|'history'|null`，省略则非受控
  - `disabled`、`closeOnClickOutside true`、`closeOnEsc true`
- Events：`update:panel`、`download`、`history`。
- Slots：`download({ close })`、`history({ close })`。插槽为空时，分段只派发事件、不打开面板。
- Expose：`close()`（会把焦点还给分段）、`downloadRef`、`historyRef`。

**浮层行为（重要）**

- 面板**不 teleport**，绝对定位在胶囊下方：`top: 100% + 10px`，宽 `--tx-version-capsule-panel-width` 默认 394px（`:352-367`），z-index 取 `var(--tx-index-popper, 2000)`。
  - 下载面板左对齐，历史面板右对齐。
  - 会被舞台的 `overflow:hidden` 裁剪。胶囊应放在头部偏右的位置，或者把面板宽度变量调小。
- 面板打开时，在 document 上挂 `pointerdown`（capture）和 `keydown`（`:81-110`）。

**Esc 与展开浮层**

- 焦点在分段按钮上时，分段带 `aria-expanded="true"` + `aria-haspopup="dialog"`，TemplateFrame 会放过 Esc（`D/TemplateFrame.vue:137-146`）。
- **焦点在面板里的按钮上时，frame 的 `closest` 判断不命中**，因为面板是分段的兄弟节点而不是后代。一次 Esc 会同时收起面板和展开浮层。
- 对策：在胶囊外包一层，写 `@keydown.esc` → 面板打开时 `event.preventDefault()`。frame 看到 `defaultPrevented` 就会停手；胶囊自己挂在 document 上的监听仍然会关闭面板。

**TxVersionDownloadPanel**（`TxVersionDownloadPanel.vue:1-27`）

- Props：`notice?: { tone 'warning'|'success', title, description?, points? }`、`builds: { id, name, meta?, href?, recommended?, icon? }[]`，以及英文默认的 `buildsLabel`、`downloadLabel`、`emptyText`。
- Events：`select(id)`。
- **构建传了 `href` 就渲染成 `<a href download>`**，模板一律不传：不给任何下载链接，R1 也要求如此。
- 只有第一个 `recommended` 显示带文字的按钮。

**TxVersionHistoryPanel**

- Props：`title 'Version history'`、`latest?`、`entries`、`latestLabel 'LATEST'`、`countLabel?`、`notesLabel "What's new"`、`emptyText`。
- 条目结构：`{ id, tag, channel?, tone?, date?, note?, href? }`；`note` 只在精选卡片上显示。
- Events：`select(entry)`。
- 同样，传 `href` 会渲染成链接，模板不传。

**图标**：平台图标 `i-cib-apple` / `i-cib-windows` / `i-cib-linux` 已有 demo 在用（`D/VersionCapsuleVersionCapsuleDemo.vue` 的 builds），图标集已安装。

**动效**：reduced-motion 保护在 `:382-391`。

### TxCopyButton（sha256 复制）

- 从 `button` barrel 导出，走全局注册（`C/button/index.ts`）。
- Props：`text`、`copyLabel 'Copy'`、`copiedLabel 'Copied'`、`disabled`、`timeout 1400`、`size 'sm'|'md'`。
- Events：`copy(text)`、`error`。
- 优先写 `navigator.clipboard`，失败时退回到 `position:fixed` 的 textarea 加 `execCommand`（`src/copy-button.vue:48-70`）。
- 内部的 1.4s 计时器会在卸载时清理（先例同文件）。文档在 `button.zh.mdc`。

### TxTag（Copilot 上下文 chip）

**Props**（`C/tag/src/types.ts`）：

- `label`、`icon`（类名）、`color`、`background`、`border`
- `size 'sm'|'md'`、`pill`、`variant 'outline'|'soft'|'plain'`
- `dot`、`dotSize`、`count`
- `closable`、`closeAriaLabel 'Remove tag'`（可本地化）
- `disabled`

**Events**：`close`、`click`。

**行为**：

- **挂了 `@click` 才会变成 `role="button"` 并可以 Tab 聚焦**，Enter / Space 触发（`TxTag.vue:122-139, 155-172`）。
- 作为开关使用时，把 `aria-pressed` 透传到根元素。
- 关闭按钮自带 `stopPropagation`。
- 有 default 插槽。

### TxModeChip（Copilot「编辑需确认 / 只读」、大屏「实时 / 已暂停」）

**Props**（`C/mode-chip/src/types.ts`）：

- `label`：同时作为无障碍名
- `icon`
- `tone`：`StatusTone`，即 `success|warning|danger|info|muted`，默认 muted
- `disabled`

**行为**：

- 标签通过 `TxTextTransformer mode="fade"` 做模糊交叉淡化，并且自己用 FLIP 处理宽度变化（spec `tuffex-text-motion.md`「What each component uses」）。
- 标签本身就描述当前状态，所以**不加 `aria-pressed`**（`C/mode-chip/index.ts` 注释）。

**先例**：`D/ChatComposerModeChipDemo.vue:34-40`（请求批准 ↔ 无限制访问）。

**新鲜度**：新组件（commit `0e5b9e33f`），dist 里已包含。

### TxTransition（事件滚动条）

**Props**（`C/transition/src/types.ts`）：

- `preset 'fade'|'slide-fade'|'rebound'|'smooth-size'`
- `group false`：为 true 时渲染 `TransitionGroup`
- `tag 'div'`、`appear true`、`mode 'out-in'`、`duration 180`、`easing`

**行为**：

- 组里自带 `-move` 过渡（`TxTransition.vue:136-141`）。
- reduced motion 下把过渡时长压到 0.01ms（`:148-`）。
- 离场项**不会自动改成 `position:absolute`**。滚动条要在模板里写 `.ops-ticker__item.tx-slide-fade-leave-active { position: absolute; inset-inline: 0 }`：class 挂在我们自己的 `<li>` 上，scoped 样式可以命中。

### 其他可选件

- **TxEdgeFadeMask**：一个会随滚动位置显隐两端渐隐的滚动容器（`C/edge-fade-mask/src/types.ts`，默认 `axis 'vertical'`、`size 24`）。适合大屏在窄档下的纵向滚动区；不滚动的滚动条用 CSS `mask-image` 更简单。
- **TxBorderBeam**：给焦点面板加流光边框。`theme` 默认 `'dark'`，`active` 可以关掉；CSS 和 JS 两侧都有 reduced-motion 保护（`src/styles.ts:1677, 1863`，`TxBorderBeam.vue:238`）。纯装饰，可以不用。
- **TxAlert**：`type`、`title`、`message`、`closable`、`showIcon`，图标是内置 SVG，关闭按钮 `aria-label` 为英文（批 1 已记）。用于 Release 的「已暂停」横幅。

### 对批 1 cheat sheet 的补充

**TxStep 状态优先级**（`C/steps/src/TxStep.vue:44-61`）

- 计算顺序：`isActive`（`activeStep === step`）→ `'active'`；否则 `isCompleted`（`status === 'completed'`，或数字下标小于 active）→ `'completed'`；都不是才用 `props.status`。
- **当前步不能同时是 active 和 error**。要显示「公证失败」或「已暂停」，得给 `TxSteps` 传一个不匹配任何步骤的 `active`（例如 `-1`），每一步的 `status` 全部受控。
- `status` 可选值：`'wait'|'active'|'completed'|'error'`，error 为危险色。
- 自己传 `status="active"` 时，同样有「呼吸」动画，reduced motion 下关闭（`:462-475`）。

**TxStep `icon` 接 `TxIcon` 的 name**：以 `i-` 开头就按图标类名渲染（`C/icon/src/TxIcon.vue:109-115`），例如 `icon="i-carbon-build-tool"`。类名字面量要写进 `.vue` 文件。

**TxToolConfirmation 在 Release 里的两种处理**

- 复选框没法隐藏，要么改文案，要么用 `:deep(.tx-tool-confirmation__remember){ visibility:hidden }` 藏掉。
- 推荐改文案：`rememberLabel` 改成「护栏失守时自动暂停」，`approve` 回调里的 `remember` 作为 autoHalt 开关。autoHalt 是**往安全方向**的自动动作，不违背「晋级绝不自动」。

### 图标核对

用 `@iconify-json/{carbon,cib,logos,twemoji}` 的 `icons.json` 逐个核对过。

**存在**：

- 运行控制：`i-carbon-rocket`、`deploy`、`deployment-pattern`、`build-tool`、`pause-filled`、`play-filled-alt`、`stop-filled-alt`、`restart`
- 签名与安全：`certificate`、`certificate-check`、`security`、`locked`、`unlocked`、`fingerprint-recognition`
- 产物与文件：`package`、`archive`、`document`、`document-tasks`、`copy`、`hashtag`
- 版本与发布：`terminal`、`branch`、`version`、`tag`、`milestone`、`upgrade`、`download`、`cloud-upload`
- 状态提示：`warning-alt`、`warning-filled`、`checkmark-filled`、`error-filled`、`in-progress`、`pending`、`hourglass`、`dot-mark`
- 地图与数据：`earth`、`globe`、`map`、`activity`、`dashboard`、`sankey-diagram`、`chart-network`、`chart-bubble`、`heat-map`、`location-filled`、`flow`、`data-base`、`cloud`、`network-3`、`meter`、`analytics`、`signal-strength`
- AI 与编辑：`translate`、`magic-wand`、`ai-generate`、`help`、`information`、`edit`、`text-highlight`、`text-selection`、`quotes`、`pen`、`paste`、`bot`、`chat-bot`、`send-alt`
- 界面控制：`side-panel-open`、`side-panel-close`、`view`、`list-checked`、`task-approved`、`rule`、`arrow-up-right`、`arrow-down-right`、`caret-up`、`caret-down`
- 其他：`time`、`undo`、`reset`、`flash`、`search`、`plug`、`user-multiple`、`notification`
- 平台：`i-cib-apple`、`i-cib-windows`、`i-cib-linux`、`i-cib-ubuntu`、`i-cib-debian`、`i-logos-apple`、`i-logos-microsoft-windows`、`i-logos-linux-tux`

**不存在**（不要用）：`i-carbon-chart-sankey`、`server`、`live`、`shield`、`shield-check`、`selection`、`security-scan`、`fast-forward`、`trending-up`、`trending-down`。

---

## Template proposals

### 三个模板共用的约定（沿用 spec `nexus-docs-templates.md` 第 4–6 节）

**根与布局**

- 根组件 `<TemplateFrame :title :height @enter>`，默认插槽拿 `{ expanded, width, height }`。
- `layoutOf(width)` 与批 1 一致：
  - `0` 视为 `column`；
  - `< 640` 为 `narrow`；
  - `640–959` 为 `column`；
  - `≥ 960` 为 `wide`，可以再加 `≥ 1200` 一档 `full`。
- CSS 只用 `@container template (…)`；数值型尺寸从 slot 的 `width` / `height` 算。

**脚本与计时器**

- 脚本只从 `@enter` 开始。
- 计时器统一收在 `later` / `every` / `clearTimers` 里：`onBeforeUnmount(clearTimers)`、`watch(locale, resetDemo)`、`defineExpose({ resetDemo })`。
- 只在初始化时读 `default*` 的子树，用 `generation` 作 key 重建。
- reduced motion 在 `start()` 里读一次（写法同 `D/TemplateAgentChatDemo.vue:679-683`），然后直接落到终态，不启动任何计时器。
- 读者在模板根上 `pointerdown`，或做任何输入，都会停止自动演示（先例 `D/TemplateShellDemo.vue:596-599`）。

**页面礼仪**

- 自动演示期间不调用 `focus()`，不用 `scrollIntoView`。
- 快捷键只挂在模板根上。
- 反馈统一走模板内的 `TxToastPanel`。
- 组件不 import；只 import 类型和函数（`useSelectionAnchor`、`ChartPalette`）。
- 图标类名写在 `.vue` 里。

**命名与接入**

- 新增 demo（按字母序进 registry）：
  - `TemplateCopilotDemo`
  - `TemplateOpsWallDemo`
  - `TemplateReleaseDemo`
- 已有章节追加第二个 `###`：
  - AgentChat 页加「侧边 Copilot / Side Copilot」；
  - Dashboard 页加「运营大屏 / Ops wall」。
- Release 新开 `template-release.{zh,en}.mdc`，`category: TemplateData`，按 PRD D3 放在「数据与流程」组，排在 automation 之后。
  - 接入链路见 spec 第 2 节。
  - frontmatter 的 `description` 里不要出现未加引号的半角「: 」（spec 第 3 节 Warning）。

---

### A. AgentChat · 侧边 Copilot（`TemplateCopilotDemo`，建议 `:height="560"`）

**定位，以及与第一风格的区别**

- 第一风格是整页的「编码智能体工作台」：会话流、计划、工具调用、写权限闸门、代码 diff。
- 本风格里**宿主页面是主角**：读者在编辑 `clipboard-history` 插件的 README（插件市场详情页的文案），右侧停靠一个「文档助手」。
  - 入口是划词工具条；
  - 产出是能应用到页面的改写建议；
  - 没有工具调用、没有代码流，也没有写文件闸门。
- 安全边界换成：**页面上的任何改动都必须由读者点「应用」**。

**布局 · 列内 ≈782×560**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▤ clipboard-history / README.md   ● 已保存          [预览|编辑]  [◧ 收起助手] │ 44 宿主工具栏
├────────────────────────────────────────────┬─────────────────────────────────┤
│ 文章（自带滚动容器，13–14px 正文）              │ ◉ 文档助手   [🔒 编辑需确认]     ⟩ │ 40 TxThinkingOrb + TxModeChip + TxIconButton
│ # Clipboard History                         │ 它能看到 [▤ README.md] [⌶ 选区·1句 ×] [📋 剪贴板] │ TxTag×3
│ 剪贴板历史记录插件。从 Tuff 核心提取……            │ ─────────────────────────────── │
│ ## 权限                                      │ ┌ 你 · 润色选中的 1 句 ────────┐   │ TxChatMessage
│ ▓根搜索结果推送受 searchProviders 的           │ └────────────────────────────┘   │
│ ▓defaultState: "ask" 约束，需用户显式同意后才    │ ◉ 建议改写                         │
│ ▓会生效。▓  ← 脚本高亮（模板自有的 span）         │  原文 ~~根搜索结果推送受……才会生效。~~ │ 手写 <del>/<ins>
│     ╭──────────────────────────────────╮     │  建议 ++首次推送到 CoreBox 根搜索前……++│ （流式揭示）
│     │ 描述修改… │ ?解释  ✦润色  文翻译 │ ⌄ │     │  [应用到页面] [放弃]  README.md +1 −1 │ TxButton + TxDiffChips
│     ╰──────────────────────────────────╯     │  🔒 点「应用」才会改动页面           │ 提示行
│       ↑ TxSelectionActions（teleport 到 body） │ 接着可以 [再短一点][翻成英文][解释…] │ TxSuggestionChips(wrap)
│ 权限被拒绝时插件 fail-closed……                  │ ┌ TxPromptBar  问助手，@ 引用资料   ↑ ┐│ 无 models
│ ## 开发  ```pnpm -C plugins/… dev```         │ └──────────────────────────────────┘│
├────────────────────────────────────────────┴─────────────────────────────────┤
│ TxToastPanel（锚在文章底部）✓ 已应用到 README.md · [撤销]                          │
└──────────────────────────────────────────────────────────────────────────────┘
               文章约 460px                                      侧栏约 320px
```

**折叠态**：侧栏收成 44px 的竖条，只剩 orb、建议计数和展开按钮，文章变宽到约 730px。

- 这是一次重排，工具条必须重新测量（见 Risks 第 5 条）。
- 列宽变化不做过渡，直接切换，免得逐帧重新定位。

**布局 · 展开 ≈1440×900（≥960；≥1200 才出现目录）**

```
┌ 宿主工具栏：路径 · 已保存 / 1 处未保存 · [预览|编辑] · 字数 ───────────────┬ 文档助手 头 + 上下文 chips ─┐
├ 目录 200 ──────┬ 文章（阅读宽 ≤ 680，居中，自带滚动）                     │ 会话：建议卡 ×N（新的在下）  │
│ 功能特性         │                                                       │  每张卡：动作 · 原文/建议 ·  │
│ 权限 ●           │    …划词浮条（teleport）…                              │  应用/放弃 · 状态          │
│ 目录结构         │                                                       │ 改动记录：已应用 N 处 · 撤销 │
│ 开发             │                                                       │  （TxDiffChips）           │
│                 │                                                       │ SuggestionChips          │
│                 │                                                       │ PromptBar                │
└─────────────────┴───────────────────────────────────────────────────────┴──────────────────────────┘
       200                                  1fr                                    380
```

**布局 · 窄屏 < 640**

```
┌ README.md  ● 已保存                 [◉ 助手 1] ┐  ← 胶囊按钮，显示建议数
│ 文章单栏（全宽，自带滚动）                        │
│ …选区 + 浮条（teleport）…                        │
│ ┌ 助手面板（模板内 absolute，底部，高约 60%）──┐ │  ← 点胶囊打开；不用 TxDrawer
│ │ 头 + chips + 建议卡 + [应用][放弃] + 输入框   │ │    （它会盖住整个视口，而助手是常驻面板）
│ └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

- 建议就绪时，胶囊显示「1 条建议」，**不自动弹出**，免得挡住选区。
- 浮条的「保留 / 应用」照样可以直接应用。

**组件与角色**

| 组件 | 角色 |
|---|---|
| 手写 `<article>`（普通 DOM，按块标 `data-block`） | 宿主页面。selection 的 Range 必须能拿到 rects，所以不能用 textarea 或编辑器组件 |
| TxSelectionActions + `useSelectionAnchor` | 划词浮条。动作：解释 / 润色 / 翻译，外加折叠的「精简」；`action-icon` 插槽放三枚 carbon 图标；所有文案按 zh/en 传入 |
| TxThinkingOrb | 助手的在场感：空闲 `breathing` 且 paused，改写中 `composing` |
| TxModeChip | 「编辑需确认」↔「只读 · 仅解释」。只读模式下浮条只剩「解释」 |
| TxTag ×3 | 上下文 chip：文档（常驻）、选区（`closable`，关掉即清空选区）、剪贴板（`@click` 切换，`aria-pressed`） |
| TxChatMessage | 回显读者的动作，如「润色选中的 1 句」 |
| TxTypingIndicator | 思考阶段约 700ms |
| 手写行内 diff | 原文 `<del>`（删除线，`--tx-bui-red-tint` 底）加建议 `<ins>`（下划线，`--tx-bui-green-tint` 底），逐字揭示。语义不只靠颜色 |
| TxStreamMarkdown | 「解释」的回答（不写链接；正文字号在局部覆盖到 13px） |
| TxButton | 「应用到页面」（primary）和「放弃」 |
| TxDiffChips | 改动摘要 `README.md +1 −1`，以及宽档的改动记录 |
| TxMessageActions | 复制建议文本 |
| TxSuggestionChips（wrap） | 下一步建议 |
| TxPromptBar | 追问输入。`sources` 放「当前文档 / 选区 / 剪贴板 / manifest.json」，`commands` 放 `/improve` `/explain` `/translate` `/tone`，不传 `models` |
| TxToastPanel | 「已应用 · 撤销」 |
| TxIconButton | 侧栏折叠与展开（`i-carbon-side-panel-close/open`） |
| TxDiffTable（可选，仅宽档） | 「整节润色」时逐段采纳，再「应用 N 处」。需要 `play="manual"`，并覆盖单元格的 `white-space` |

**文档模型（建议）**

```ts
type BlockId = 'intro' | 'features' | 'perm-ask' | 'perm-deny' | 'dev'
interface Block {
  id: BlockId
  kind: 'h1' | 'h2' | 'p' | 'ul' | 'code'
  text: { zh: string, en: string } // 按 locale 取；应用后在 state 里记住 previous 以便撤销
  improve?: { zh: string, en: string } // 预写好的润色结果；code 块没有
  shorter?: { zh: string, en: string } // 「再短一点」
  explain?: { zh: string, en: string } // 「解释」的 markdown
}
// 翻译 = 同一块的另一种语言原文：确定、真实，无需伪造模型输出。
```

**怎么处理任意选区**

- 用 `payload.range.startContainer` 向上找 `closest('[data-block]')`，定位到所在块，再取该块预写的结果。
- 选区跨了多块，取第一块，并在建议卡上注明「只改写了第一段（演示）」。
- 选中的是标题或代码块：「解释」照常可用；「润色 / 翻译」回复「这是代码，只做解释（演示）」。
- 浮条里输入自由指令并提交：当作一次「润色」处理，卡片上注明「按你的要求：{prompt}（演示为预写结果）」。

**交互要点**

1. 在文章里任意划词，浮条出现在选区下方。
   - **读者自己的选区会取代脚本高亮**，同时取消剩余脚本。
   - 页面滚动、文章滚动、侧栏折叠、模板展开或收起时，重新测量 rect 并调用 `updatePosition()`。
2. 润色或翻译的流程：
   - 浮条依次经过 `thinking` → `streaming` → `result`；
   - 侧栏流式输出建议和行内 diff；
   - `result` 态下，浮条的「应用」（即 `keepLabel`）、「放弃」、「重试」与侧栏按钮等价；
   - 「重试」给出预写的第二版。
3. 解释：浮条经过 `thinking` → `streaming`，侧栏的 `TxStreamMarkdown` 写完后浮条收起（`selection = null`）。「解释」没有「应用」。
4. 点「应用」之后：
   - 块文本替换为建议，块上闪一下 `.is-applied` 高亮，约 1.2s；reduced motion 下改成静态描边，2s 后撤掉。撤掉的计时只在读者点击后启动，不属于自动演示。
   - 工具栏状态改为「1 处未保存」。
   - 弹出 `TxToastPanel`「已应用到 README.md · 撤销」，4s 后自动关闭；reduced motion 下不设计时器，常驻到读者手动关闭。
   - 点「撤销」恢复 `previous`。
5. 上下文 chip：关掉「选区」等于放弃当前建议。「剪贴板」只切换 chip 状态和头部「它能看到 N 项」，**绝不读取真实剪贴板**。
6. 模式 chip 切到只读后，浮条动作收缩为「解释」，侧栏提示「只读：只解释，不改写」。
7. 建议 chip：「再短一点」用该块的 `shorter`；「翻成英文 / 中文」对当前块执行翻译；「解释…」执行解释。
8. 侧栏 PromptBar 发送后，追加一问一答，回复是固定文案：「（演示）在左边选中文字，试试『润色』或『翻译』。」

**脚本时间轴（从 `@enter` 起算，最后停在「应用」前等待读者）**

| 时刻 | 页面 / 浮条 | 侧栏 |
|---|---|---|
| 0.0s | 文档就绪，没有选区 | 空态卡「选中页面里的文字，让我解释、润色或翻译」+ SuggestionChips；orb paused |
| 0.8s | `perm-ask` 块包一层 `.is-picked` 高亮 span；用 `document.createRange().selectNodeContents(span)` 构造 payload `{ text, rects, range }`（**不动 `window.getSelection()`**）；浮条回弹出现（idle） | 「选区 · 1 句」chip 出现 |
| 2.0s | 浮条 `state='thinking'`，`activeActionId='improve'`，显示「润色中…」 | 追加 `TxChatMessage`「润色选中的 1 句」；orb 切到 `composing` 并开始转；TxTypingIndicator「正在改写…」 |
| 2.7s | 浮条 `state='streaming'` | 建议卡逐字揭示：zh 每 30ms 2 字，en 每 30ms 4 字，约 1.5s。原文行（删除线）先整行出现 |
| 4.3s | 浮条 `state='result'`（应用 / 放弃 / 重试） | diff 完整；`TxDiffChips` `README.md +1 −1`；「应用到页面 / 放弃」；🔒 提示「点『应用』才会改动页面」；chips 换成下一步建议；orb paused |
| 等待 | —— 不设任何计时器，等读者操作 —— | |
| 读者点「应用」 | 块文本被替换，高亮闪一下，浮条收起 | TxToastPanel「已应用 · 撤销」；卡片状态改为「已应用」 |

- **reduced motion**：`@enter` 时直接落到 4.3s 的终态（高亮、浮条 `result`、完整 diff、chips），不启动计时器。「应用 / 撤销」照常可用，toast 常驻。
- **取消条件**：读者在文章里 `pointerdown`、产生真实选区、或在浮条 / 输入框里打字，都会清掉所有计时器。
  - 正在流式输出的建议会**立即补完**，直接落到 `result`，避免停在半截。
  - 读者选了别处，脚本高亮随之撤掉。
- **重置（`resetDemo`）**：
  - 清计时器，把块文本恢复成种子，`clear()` 掉 anchor；
  - 清空侧栏历史与 toast，恢复侧栏展开、只读关、剪贴板开；
  - `generation++`；
  - 若已进入过视口，在 `nextTick` 后重放。
- **切语言**：`watch(locale, resetDemo)`。文章切到另一种语言；翻译结果也随之反向。

**Mock 数据（zh / en 并列；取材自真实的 `plugins/clipboard-history/README.md`）**

```ts
const doc = {
  title: 'Clipboard History',
  intro: {
    zh: '剪贴板历史记录插件。从 Tuff 核心提取剪贴板历史能力，把复制过的内容留在手边，随时翻回去重新粘贴。',
    en: 'Clipboard history for Tuff. Pulled out of the Tuff core, it keeps what you copied within reach so you can paste it again any time.',
  },
  features: { // ul，来自 README「功能特性」
    zh: ['历史留存：自动记录复制过的文本、图片、文件与富文本', 'CoreBox 直达：输入「剪贴板」即可唤起', '一键回写：选中任意条目重新写回系统剪贴板', '来源标注：记录复制时的来源应用'],
    en: ['History: text, images, files and rich text you copy are kept', 'CoreBox shortcut: type "clipboard" to open it', 'Paste back: send any entry back to the system clipboard', 'Source app: remembers where each copy came from'],
  },
  permAsk: { // 脚本目标句
    zh: '根搜索结果推送受 `searchProviders` 的 `defaultState: "ask"` 约束，需用户显式同意后才会生效。',
    en: 'Pushing entries into the root search results is governed by `defaultState: "ask"` in `searchProviders` and only takes effect after explicit user consent.',
    improve: {
      zh: '插件第一次把条目放进 CoreBox 根搜索前，会先征得你的同意；你拒绝的话就不会推送。',
      en: 'Before the plugin first puts entries into CoreBox\'s root results, Tuff asks you; say no and nothing is pushed.',
    },
    shorter: { zh: '推送到 CoreBox 根搜索前会先问你。', en: 'Tuff asks before pushing to root search.' },
    explain: {
      zh: '`defaultState: "ask"` 表示这项搜索来源默认处于「待询问」状态：插件声明了它，但只有你在授权弹窗里点了同意才会启用。拒绝后插件照常可用，只是不往根搜索推结果。',
      en: '`defaultState: "ask"` means this search source starts as "ask first": the plugin declares it, but it only turns on once you approve the prompt. Declining keeps the plugin working; it just stays out of root search.',
    },
  },
  permDeny: {
    zh: '权限被拒绝时插件 fail-closed，不会静默降级为空列表。',
    en: 'If a permission is denied the plugin fails closed instead of silently showing an empty list.',
    improve: { zh: '如果你拒绝了某项权限，插件会明确告诉你，而不是悄悄显示一个空列表。', en: 'Deny a permission and the plugin tells you so, rather than quietly showing an empty list.' },
  },
  dev: 'pnpm -C plugins/clipboard-history dev   # 127.0.0.1:3488', // code，只可解释
}

const copilot = {
  name: { zh: '文档助手', en: 'Docs Copilot' },
  mode: { edit: { zh: '编辑需确认', en: 'Edits need your OK', icon: 'i-carbon-locked' },
          readonly: { zh: '只读 · 仅解释', en: 'Read-only · explain', icon: 'i-carbon-view' } },
  sees: { zh: '它能看到', en: 'Can see' },
  chips: { doc: 'README.md', selection: { zh: '选区 · 1 句', en: 'Selection · 1 sentence' },
           clipboard: { zh: '剪贴板（示例）', en: 'Clipboard (sample)' } },
  actions: { // 传给 TxSelectionActions
    zh: [{ id: 'explain', label: '解释', busyLabel: '解释中' }, { id: 'improve', label: '润色', busyLabel: '润色中' },
         { id: 'translate', label: '翻译', busyLabel: '翻译中' }, { id: 'shorten', label: '精简', more: true, busyLabel: '精简中' }],
    en: [{ id: 'explain', label: 'Explain', busyLabel: 'Explaining' }, { id: 'improve', label: 'Improve', busyLabel: 'Improving' },
         { id: 'translate', label: 'Translate', busyLabel: 'Translating' }, { id: 'shorten', label: 'Shorten', more: true, busyLabel: 'Shortening' }],
  },
  barLabels: { zh: { placeholder: '描述修改…', keepLabel: '应用', discardLabel: '放弃', retryLabel: '换一种写法', sendLabel: '发送修改指令',
                     expandLabel: '更多动作', collapseLabel: '收起动作', busyLabel: '处理中', ariaLabel: '划词助手' },
               en: { placeholder: 'Describe the edit…', keepLabel: 'Apply', discardLabel: 'Discard', retryLabel: 'Try another version', sendLabel: 'Send edit instruction',
                     expandLabel: 'More actions', collapseLabel: 'Fewer actions', busyLabel: 'Working', ariaLabel: 'Selection assistant' } },
  applyHint: { zh: '点「应用」才会改动页面，不会自动写入。', en: 'Nothing changes on the page until you click Apply.' },
  toast: { zh: '已应用到 README.md', en: 'Applied to README.md', undo: { zh: '撤销', en: 'Undo' } },
  next: { zh: ['再短一点', '翻译成英文', '解释 defaultState'], en: ['Make it shorter', 'Translate to Chinese', 'Explain defaultState'] },
  promptSources: [ // TxPromptBar sources
    { key: 'doc', name: 'README.md', desc: { zh: '当前文档', en: 'This document' } },
    { key: 'selection', name: { zh: '选区', en: 'Selection' }, desc: { zh: '1 句', en: '1 sentence' } },
    { key: 'clipboard', name: { zh: '剪贴板', en: 'Clipboard' }, desc: { zh: '最近 1 条（示例）', en: 'Latest item (sample)' } },
    { key: 'manifest', name: 'manifest.json', desc: { zh: '权限声明', en: 'Permission declarations' } },
  ],
  demoReply: { zh: '（演示）在左边选中文字，试试「润色」或「翻译」。', en: '(Demo) Select some text on the left and try Improve or Translate.' },
}
```

**需要手写的 CSS**

- 文章排版：h1 18px / h2 14px / p 13.5px / ul / 行内 code 0.9em（`tuffex-design-rules.md` Typography）。
- 选区高亮 `.is-picked`：`color-mix(--tx-bui-accent 14%)`，同 `D/SelectionActionsRewriteDemo.vue:131`。
- 应用后的闪烁 `.is-applied`：动画只放在 `no-preference` 里。
- 行内 diff 的 `del` / `ins`。
- 侧栏折叠的列宽与竖条。
- 窄屏底部面板。
- **侧栏要给不透明底**，因为 SuggestionChips、ChatMessage 在暗色下是透明的。

**本模板的专属风险**：见 Risks 第 2、5、6、7、8 条。

---

### B. Dashboard · 运营大屏（`TemplateOpsWallDemo`，建议 `:height="600"`）

**定位，以及与第一风格的区别**

- 批 1 的「Tuff Pulse」是**分析看板**：有时间范围、日期选择、框选缩放和可排序的表，亮 / 暗主题跟随站点。
- 运营大屏是**值班墙**：只看不筛。
  - 大字 KPI 实时跳动；
  - 全球活跃地图；
  - 搜索流向桑基图；
  - 事件滚动条；
  - 服务健康灯；
  - 自动轮播的焦点面板。
- 视觉以暗色为主。没有表格，没有日期控件。

**主题（需要主 agent 拍板）**

- **推荐方案 A · 强制暗色墙**：模板根写 `data-theme="dark"`，外加：
  - `color-scheme: dark`；
  - 重新声明 5 个派生 token（见「局部暗色作用域」）；
  - 会读 html 的组件显式传 `theme="dark"`：`TxSparkChart`，如果用到 `TxBorderBeam` 也一样。
  - 效果：亮色 docs 页上嵌着一块暗色屏，frame 工具栏仍是亮色；暗色页上两者一致。「亮色主题下也能用」指的是在亮色页上**完整、不破**，而不是要变成亮色。
- **备选方案 B · 自适应**：去掉 `data-theme`，按站点主题渲染，另写一套亮色的墙面背景。技术上更简单，但和第一风格的视觉差异会变小。

**布局 · 列内 ≈782×600（不滚动，四行塞满）**

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ● LIVE  Tuff 运营大屏 · 全球   12:04:31 UTC+8   [●6/7 服务正常]  [⏸ 实时刷新中] │ 40  TxStatusBadge + TxModeChip（暂停开关）
├──────────────────┬──────────────────┬──────────────────┬──────────────────┤
│ 在线用户 ●         │ CoreBox 搜索/分    │ AI 请求/分          │ 插件安装/时          │ 92  手写 KPI 瓦片：
│ 18,204            │ 12,480            │ 3,216              │ 486               │     TxTextMorph（40px）
│ ▲3.2% 较1小时前  ╱╲ │ ▲1.1%        ╱╲╱ │ 端侧 72.4%    ╱╲   │ ▼0.8%       ╲╱   │     + TxSparkChart 条带
├──────────────────┴──────────────────┴────────┬─────────┴──────────────────┤
│ 活跃用户分布 · 14 城                             │ 焦点 · 1/3  ‹ ›  ▮▮▯ 轮播     │
│ TxBubbleMap（:height≈200，roam 关）               │ TxInsightCards（受控页码）       │ 236
│      ◉北京 ◉上海 ◉东京  …  ◉旧金山                 │  「华东正在高峰」+ 2×TxInsightMetric │
│   （焦点城市气泡加环）                            │  + TxSparkChart（近 30 分钟）       │
├────────────────────────────┬──────────────────┴───────┬────────────────────┤
│ 搜索流向 · 每分钟            │ 服务健康                    │ 实时事件                │
│ TxSankeyChart（h≈140，inline │ ● 搜索索引   12ms  ▮▮▮      │ 12:04:29 上海 · 安装「翻译」│ 170
│ 标签）搜索框→翻译→翻译结果…   │ ● 云同步  延迟↑   ▮▮▯      │ 12:04:27 东京 · 搜「clip」 │
│                            │ … 共 7 行（2 列）            │ …（TxTransition group）  │
└────────────────────────────┴──────────────────────────┴────────────────────┘
      约 44%                          约 26%                        约 30%
```

合计高度：40 + 92 + 236 + 170 + 3 个间距 × 10 + 上下 padding 2 × 12 ≈ 592，接近 600 的舞台，余量很小。

- 桑基图在约 330px 宽下只能用 inline 标签和短名。
- 健康卡在列内只显示 7 行中的 4 行，其余折叠成「+3 正常」。

**布局 · 展开 ≈1440×900**

```
┌ 头：品牌 · 数据窗口「近 15 分钟」 · 时钟 · 服务状态 · 暂停 ────────────────────────────────────────┐ 48
├───────┬───────┬───────┬───────┬───────┬───────┤  KPI ×6（加上 同步 p95、崩溃/万次会话）          │ 128
│ 64px 大字 + 条带 + 较 1 小时前                                                                  │
├─────────────────────────────────────────────────────────┬────────────────────────────────────┤
│ TxBubbleMap（:height≈380）+ 右上角叠放的城市排行（前 5）      │ 焦点轮播（TxInsightCards，h≈380）     │ 380
│                                                         │  可选 TxBorderBeam 包边                │
├──────────────────────────────────────┬──────────────────┴──────────┬─────────────────────────┤
│ TxSankeyChart（h≈250，stacked 标签带值）│ 服务健康 7 行（单列，带延迟）   │ 实时事件 10 行             │ 260
└──────────────────────────────────────┴─────────────────────────────┴─────────────────────────┘
```

**布局 · 窄屏 < 640**：单列，舞台内部纵向滚动（同批 1 Dashboard 窄档的写法）。顺序依次是：

1. 头部，暂停开关换行显示；
2. KPI 2×2，数字 32px；
3. 地图，`:height≈180`；
4. 焦点卡；
5. 桑基图，`h≈200`，inline 标签；
6. 健康灯；
7. 事件 6 行。

滚动区可以用 `TxEdgeFadeMask`，或者手写上下两端的渐隐。

**组件与角色**

| 组件 | 角色 |
|---|---|
| TxTextMorph | KPI 大字：传数字加 `:locale`；百分比用 `decimals`，单位写在组件外 |
| TxSparkChart | KPI 条带：30 个采样，`:animation="false"`、`:interactive="false"`、`:baseline="false"`、小 padding、`theme="dark"`；焦点页里放近 30 分钟曲线 |
| TxBubbleMap | 城市气泡。`bubbleColor` 用 `ChartPalette.categoricalVar(0)`；`bubbleBorderColor` / `bubbleBorderWidth` 用函数给焦点城市加环；`#tooltip` 插槽显示双语城市名、在线人数和环比 |
| TxSankeyChart | 输入来源 → 插件 → 动作。数值高度；列内 `node-label-layout="inline"`，宽档 stacked 并显示值；`#tooltip` 本地化 |
| TxInsightCards + TxInsightMetric + TxAllocationBar | 焦点轮播 3 页：区域高峰、AI 端侧占比、插件热度 |
| TxDotIndicator + TxSignalMeter | 服务健康灯（色点、3 格信号、延迟文字）；脉冲环手写 |
| TxStatusBadge | 头部「6/7 服务正常」，降级时显示 warning |
| TxModeChip | 「实时刷新中」↔「已暂停」开关（WCAG 2.2.2 要求能暂停自动更新的内容） |
| TxTransition（`group`，`preset="slide-fade"`，`tag="ul"`） | 事件滚动条的进入与位移动画 |
| TxSkeleton | GeoJSON 加载占位；加载失败时显示一行说明 |
| TxBorderBeam（可选） | 焦点面板的流光边框（`theme="dark"`，`:active` 跟随「实时且未暂停」） |

**数据模型**

- 一切数字都从同一个整数 `tick` 推导：`sin` 哈希抖动，确定、可截图复现，写法同批 1 的 `noise()`（`D/TemplateDashboardDemo.vue:61-64`）。
- 在线用户 = 各城市之和；每分钟搜索 = 桑基图来源之和。
- `resetDemo` 把 `tick` 归零。

**交互要点**

1. **暂停开关**（TxModeChip）停下所有计时：KPI、气泡、事件、桑基刷新、轮播、时钟和脉冲 CSS（根加 `.is-paused`）。再点一次继续。
2. **焦点面板**：
   - 悬停或键盘焦点在面板内时，暂停轮播；
   - 读者用 ‹ › 翻过页后，自动轮播停止（交给读者控制）；
   - 当前页的城市在地图上加环。
3. **地图**：悬停气泡显示 tooltip。点击气泡，焦点面板跳到该城市页（如果有）；没有则只显示 tooltip。
4. **桑基图**：悬停邻接强调，悬停期间暂停桑基刷新（layout 重算会清掉 hover）。
5. **事件滚动条**：悬停时暂停追加。不做 `aria-live`，高频播报会刷屏；头部另放一个视觉隐藏的摘要，最多每 30s 更新一次，可选。
6. **不可见时自动暂停**：模板自己挂一个 IntersectionObserver（可见 < 10% 即暂停）并监听 `visibilitychange`，读者滚走后不再空转。frame 的 `enter` 只触发一次，没有「离开」事件。

**自动演示（从 `@enter` 起算的常驻节拍）**

| 节拍 | 变化 |
|---|---|
| 0.0s | 地图用 `v-if="entered && world"` 挂载，气泡入场 1000ms；KPI、事件（预置 5 条）、健康灯、焦点第 1 页就位；时钟开始走 |
| 每 2.0s | KPI 按确定的增量变化（±0.2–0.8%），TextMorph 滚动数字（400ms）；条带追加一个采样 |
| 每 2.6s | 事件滚动条顶部插入 1 条，末条离场（上限 6 条，宽档 10 条） |
| 每 4.0s | 各城市在线人数漂移；气泡半径直接跳变，可选手写 `r` 过渡 |
| 每 8.0s | 焦点面板翻到下一页（loop），地图焦点环随之切换 |
| 每 12s | 桑基窗口刷新：各流量 ±3%，并保持守恒；指针在图上时跳过 |
| 18s → 30s | 「云同步」降级为 orange（延迟升高，东京区），头部变成「6/7」，事件条插入一条告警；30s 时恢复 green，显示「7/7」 |

- **reduced motion**：
  - 渲染 `tick = 0` 的静态快照，不启动任何计时器；
  - 暂停开关换成一行说明「已按系统设置停止实时刷新 · 快照 12:04」；
  - 焦点面板只能手动翻页；
  - 没有脉冲环；
  - 地图入场与 TextMorph 由组件自己跳过。
- **重置**：清掉所有 interval，`tick = 0`，焦点回到第 1 页，恢复为未暂停；若已进入过视口，重新开始。

**Mock 数据（全部是示例数据；头部角落写明「示例数据 / Sample data」）**

```ts
const kpis = [ // 列内取前 4 个，宽档 6 个
  { key: 'online', zh: '在线用户', en: 'Online now', base: 18_204, unit: '', delta1h: +3.2 },
  { key: 'search', zh: 'CoreBox 搜索 / 分', en: 'CoreBox searches / min', base: 12_480, unit: '', delta1h: +1.1 },
  { key: 'ai', zh: 'AI 请求 / 分', en: 'AI requests / min', base: 3_216, sub: { zh: '端侧 72.4%', en: '72.4% on-device' } },
  { key: 'installs', zh: '插件安装 / 时', en: 'Plugin installs / hr', base: 486, delta1h: -0.8 },
  { key: 'sync', zh: '同步延迟 p95', en: 'Sync p95', base: 182, unit: 'ms' },            // wide only
  { key: 'crash', zh: '崩溃 / 万次会话', en: 'Crashes / 10k sessions', base: 3.1, decimals: 1 }, // wide only
]

const cities = [ // lng, lat, share of online；合计 = online
  { id: 'sh', zh: '上海', en: 'Shanghai', lng: 121.47, lat: 31.23, online: 3_420 },
  { id: 'bj', zh: '北京', en: 'Beijing', lng: 116.40, lat: 39.90, online: 2_610 },
  { id: 'sz', zh: '深圳', en: 'Shenzhen', lng: 114.06, lat: 22.54, online: 2_180 },
  { id: 'hz', zh: '杭州', en: 'Hangzhou', lng: 120.16, lat: 30.27, online: 1_540 },
  { id: 'cd', zh: '成都', en: 'Chengdu', lng: 104.07, lat: 30.57, online: 980 },
  { id: 'tyo', zh: '东京', en: 'Tokyo', lng: 139.69, lat: 35.68, online: 1_260 },
  { id: 'sel', zh: '首尔', en: 'Seoul', lng: 126.98, lat: 37.57, online: 640 },
  { id: 'sin', zh: '新加坡', en: 'Singapore', lng: 103.82, lat: 1.35, online: 720 },
  { id: 'sfo', zh: '旧金山', en: 'San Francisco', lng: -122.42, lat: 37.77, online: 1_080 },
  { id: 'nyc', zh: '纽约', en: 'New York', lng: -74.01, lat: 40.71, online: 760 },
  { id: 'lon', zh: '伦敦', en: 'London', lng: -0.13, lat: 51.51, online: 690 },
  { id: 'ber', zh: '柏林', en: 'Berlin', lng: 13.40, lat: 52.52, online: 820 },
  { id: 'sao', zh: '圣保罗', en: 'São Paulo', lng: -46.63, lat: -23.55, online: 310 },
  { id: 'syd', zh: '悉尼', en: 'Sydney', lng: 151.21, lat: -33.87, online: 270 },
] // 合计 17,280；实现时按比例缩放到 KPI 的 online，或者反过来让 KPI = Σ

// 桑基（每分钟，示例）：来源 → 插件 / 提供方 → 动作；每个中间节点流入 = 流出
const nodes = [
  { zh: '搜索框', en: 'Search box' }, { zh: '剪贴板', en: 'Clipboard' }, { zh: '划词', en: 'Selection' }, { zh: '语音', en: 'Voice' }, // 0–3
  { zh: '应用', en: 'Apps' }, { zh: '文件', en: 'Files' }, { zh: '剪贴板历史', en: 'Clipboard history' }, { zh: '翻译', en: 'Translate' }, { zh: '智能问答', en: 'Intelligence' }, // 4–8
  { zh: '打开', en: 'Open' }, { zh: '复制回写', en: 'Copy back' }, { zh: '翻译结果', en: 'Translation' }, { zh: '问 AI', en: 'Ask AI' }, // 9–12
]
const links = [
  [0, 4, 4300], [0, 5, 2200], [0, 7, 700], [0, 8, 1000], // 搜索框 8,200
  [1, 6, 2100], // 剪贴板 2,100
  [2, 6, 300], [2, 7, 1000], // 划词 1,300
  [3, 8, 880], // 语音 880
  [4, 9, 4300], [5, 9, 1700], [5, 10, 500], [6, 10, 2400], [7, 11, 1500], [7, 10, 200], [8, 12, 1880],
] // 来源合计 12,480 = 「CoreBox 搜索 / 分」；右侧 打开 6,000 · 复制回写 3,100 · 翻译结果 1,500 · 问 AI 1,880

const services = [ // 沿用批 1 Dashboard 的前 4 项，保持跨模板一致（D/TemplateDashboardDemo.vue:590-598）
  { key: 'index', zh: '搜索索引', en: 'Search index', level: 3, meta: '12 ms' },
  { key: 'sync', zh: '云同步', en: 'Cloud sync', level: 3, meta: '96 ms' }, // 18s 起变成 2 格、orange、「东京区延迟升高」
  { key: 'gateway', zh: 'AI 网关', en: 'AI gateway', level: 3, meta: '180 ms' },
  { key: 'cdn', zh: '更新 CDN', en: 'Update CDN', level: 3, meta: '99.99%' },
  { key: 'market', zh: '插件市场', en: 'Plugin market', level: 3, meta: '64 ms' },
  { key: 'push', zh: '推送通道', en: 'Push channel', level: 3, meta: '41 ms' },
  { key: 'account', zh: '账户服务', en: 'Accounts', level: 3, meta: '58 ms' },
]

const eventTemplates = [ // 按 tick 轮换城市与插件；只做聚合描述，不含个人信息
  { zh: '{city} · 安装了「{plugin}」', en: '{city} · installed {plugin}' },
  { zh: '{city} · CoreBox 搜索「clip」→ 剪贴板历史', en: '{city} · CoreBox "clip" → Clipboard history' },
  { zh: '{city} · AI 请求 · 端侧完成 · {ms} ms', en: '{city} · AI request · on-device · {ms} ms' },
  { zh: '{city} · 划词翻译 · {n} 字', en: '{city} · selection translated · {n} chars' },
  { zh: '{city} · 同步了 {n} 台设备', en: '{city} · synced {n} devices' },
] // plugin 取 plugins/ 里真实的名字：翻译、剪贴板历史、JSON 工具、语音听写、窗口预设

const focusPages = [ // TxInsightCards pages
  { key: 'peak', zh: '华东正在高峰：上海 + 杭州在线 4,960，比昨天同一时刻高 12%（示例）。', en: 'East China is peaking: Shanghai + Hangzhou at 4,960 online, 12% above this time yesterday (sample).', city: 'sh' },
  { key: 'ai', zh: '72.4% 的 AI 请求在端侧完成，不消耗云端额度。', en: '72.4% of AI requests finish on-device and never touch the cloud quota.' },
  { key: 'market', zh: '过去一小时装得最多：翻译 128 · 剪贴板历史 96 · JSON 工具 54（示例）。', en: 'Most installed in the last hour: Translation 128 · Clipboard history 96 · JSON Formatter 54 (sample).' },
]
```

**需要手写的 CSS**

- 墙面底色与面板：暗色下用 `--tx-bui-page` 作底、`--tx-bui-surface` 作面板，外加 hairline ring。
- KPI 瓦片框：约 30 行。
- 大字排版：`font-variant-numeric: tabular-nums`、600 字重；可选 `text-shadow`。
- LIVE 点与健康灯的脉冲环：只写在 `no-preference` 里，`.is-paused` 时停止。
- 事件项离场时改为 `position: absolute`。
- 可选的气泡 `r` 过渡。
- 局部暗色作用域的 5 个 token 加 `color-scheme`。
- 窄档滚动区。

**本模板的专属风险**：见 Risks 第 1、9–12 条。

---

### C. Release 发布控制台（`TemplateReleaseDemo`，新章节，`category: TemplateData`，建议 `:height="600"`）

**定位**

- 以 Tuff 桌面端一次发布为主线，把「流水线 → 产物 → 灰度 → 审批 → 历史」放在一个控制台里。
- 与 Automation 模板的区别：
  - Automation 是可编辑的流程画布，演示一次运行；
  - Release 是**线性的发布阶段**，重点是产物校验信息、放量比例、护栏和人工审批。

**R1 发布完整性约束（必须遵守）**

`N/AGENTS.md:38-41` 规定 `sha256`、`signatureUrl`、签名端点属于 R1，不能拿本地 preflight 冒充真实链路证据。PRD 的 Constraints 要求这些都是「明显的示例数据」。建议做法：

- **版本号**：用永远不会发布的预发布标识 `v2.5.0-demo.4`。真实通道是 beta / snapshot / release；core-app 当前版本是 `2.4.14-beta.40`（`apps/core-app/package.json:3`）。`-demo` 不会与任何真实版本撞车。
- **通道**：chip 写 `DEMO / 演示`。
- **示例标记**：
  - 头部常驻 `TxTag variant="plain"`「示例数据 · 不是真实发布 / Sample data — not a real release」；
  - 日志第一行是注释 `# 示例日志 · 不代表真实构建`。
- **sha256**：按产物 id 用哈希函数生成 64 位十六进制，**始终带「示例 / SAMPLE」前缀**显示，例如 `SAMPLE · 3f9a1c…e07b`。复制出来的文本也带 `SAMPLE-` 前缀。
- **签名 / 公证**：写成「Developer ID（示例）」「Authenticode（示例）」「已公证（示例）」，不出现任何 URL 或 `signatureUrl`。
- **下载**：不给任何 `href`。`TxVersionDownloadPanel` 的 `select` 只弹 TxToastPanel「示例构建，不提供下载」。
- **产物文件名**：沿用 `electron-builder.yml` 的真实命名模式（`apps/core-app/electron-builder.yml:94, 154, 163`），带上 demo 版本号：
  - `tuff-2.5.0-demo.4-macos-arm64.dmg`
  - `tuff-2.5.0-demo.4-macos-x64.dmg`
  - `tuff-2.5.0-demo.4-setup.exe`
  - `tuff-2.5.0-demo.4.AppImage`
  - `tuff-2.5.0-demo.4.deb`

**审批（需要主 agent 拍板）。推荐：**

1. **首次放量**：CI 各步完成后，「发布机器人」提议「开始灰度 · 5%」，用 `TxToolConfirmation` 做成行内闸门，**无限等待**。
   - 允许：灰度开始；
   - 拒绝：停在「已分发，未发布」。
2. **继续晋级**：读者在 `TxSegmentedSlider` 选好目标档位，点「晋级到 25%」，弹出 `TxModal` 确认框（列出护栏检查项），点确认才生效。
3. **暂停发布**：头部「暂停发布」按钮，弹出危险色的 `TxModal`，确认后生效。
4. 以上**全部由读者发起，没有计时器会自动晋级**。

**布局 · 列内 ≈782×600**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⎇ 发布控制台  [● DEMO v2.5.0-demo.4 ⤓ │ 历史 ▾]  [示例数据]    ▦ 运行中 1.2s  [⏸ 暂停发布] │ 48 TxVersionCapsule
├──────────────────────────────────────────────────────────────────────────────┤
│ ①构建 ✓ ─── ②签名 ✓ ─── ③公证 ◉ ─── ④分发 ○ ─── ⑤灰度 ○        （TxSteps small）  │ 64 描述 = 耗时
│   4m 12s      38s        进行中                                                 │
├──────────────────────────────────────────────┬───────────────────────────────┤
│ [日志] [产物 5] [说明]  （TxFlatRadio sm）       │ 灰度                            │
│ 日志：TxCodeStream（在自己的滚动容器里，追尾）       │  当前 5%   （TxTextMorph 32px）   │
│  # 示例日志 · 不代表真实构建                       │  ━━━━○──────────  TxProgressBar  │
│  12:04:40 sign  codesign · Developer ID（示例）    │  目标 [1·5·25·50·100]            │ TxSegmentedSlider
│  12:05:03 notarize notarytool submit …            │  [晋级到 25%]（护栏未就绪时禁用）   │
│ 产物：TxDataTable                                │ 护栏（示例）                      │
│  平台        大小      sha256（示例）   签名/公证    │  无崩溃会话 99.71% ≥99.5 ▮▮▮       │ TxSignalMeter
│   macOS arm64 126.4MB SAMPLE·3f9a…e07b ⧉ ✓/✓   │  更新失败率 0.4%  <1.0   ▮▮▮       │
│   Windows x64 118.7MB SAMPLE·a1c4…9d20 ⧉ ✓/—   │  回滚请求   2     ≤5     ▮▮▯       │
│ 说明：TxMarkdownView（13px）                     │ ┌ 发布机器人 · rollout.start ────┐ │ TxToolConfirmation
│                                              │ │ 开始灰度：向 5% 的 beta 用户推送…  │ │ （出现时置顶）
│                                              │ │ [暂不发布]         [开始灰度]      │ │
│                                              │ └───────────────────────────────┘ │
│                                              │ 本次动态（TxTimeline，最近 4 条）    │
└──────────────────────────────────────────────┴───────────────────────────────┘
              约 470px                                         约 300px（自身可滚动）
```

**布局 · 展开 ≈1440×900**

```
┌ 头（同上，另加 构建号 #1287（示例） · 触发人） ──────────────────────────────────────────────────┐
├ 流水线 240 ──────┬ 产物矩阵（TxDataTable，全部列：平台 · 文件名 · 大小 · sha256 · 签名 · 公证）──┬ 灰度 340 ─────────┐
│ TxSteps          │                                                           │ 当前 / 目标 / 晋级  │
│ vertical：       ├───────────────────────────────────────────────────────────┤ 护栏 + 崩溃率趋势   │
│ 5 步 + 描述      │ 日志（TxCodeStream，滚动容器，h≈260） │ 说明（TxMarkdownView）│ （TxSparkChart，    │
│ （时长、产物数）   │                                     │                     │  domain [99,100]） │
│                  │                                     │                     │ 审批闸门             │
│                  │                                     │                     │ 历史（TxTimeline）   │
└──────────────────┴─────────────────────────────────────┴─────────────────────┴────────────────────┘
```

**布局 · 窄屏 < 640**

- 头部换行：胶囊一行，示例标签和暂停按钮一行。
- TxSteps 保持水平、small，只显示短标题、不显示描述。
- 其下是 `[灰度] [日志] [产物] [说明]` 四个页签，灰度排第一。
- 闸门出现时，固定在灰度页顶部。
- 产物表只保留三列（平台 · 大小 · 状态），sha256 收进展开行或 `title`。

**组件与角色**

| 组件 | 角色 |
|---|---|
| TxVersionCapsule + TxVersionDownloadPanel + TxVersionHistoryPanel | 头部当前版本（`channel="DEMO"`，`tone="preview"`）。下载面板带 `notice`（warning「演示构建 · 不提供下载」）与 5 个 build（**无 href**）；历史面板列出往期示例版本（**无 href**）。外层包一层拦截 Esc |
| TxTag（`variant="plain"`） | 「示例数据」常驻标记 |
| TxSteps / TxStep | 流水线 5 步，`size="small"`（宽档 `direction="vertical"`）。**`:active="-1"`，每步 `status` 全受控**，这样暂停时「灰度」可以显示 error。`icon` 用 `i-carbon-*` 类名；`clickable=false` |
| TxWorkingIndicator | 头部「运行中」计时，空闲时 `v-if` 掉 |
| TxFlatRadio | 中栏页签：日志 / 产物 / 说明 |
| TxCodeStream（`lang=''`，`:min-height="0"`） | 构建日志，外包滚动容器，逐行揭示并追尾 |
| TxDataTable + TxCopyButton + TxStatusBadge | 产物矩阵：`cell-sha` 显示「SAMPLE · 前 4…后 4」加复制按钮；签名、公证状态用徽章；`table-layout="fixed"`；`maxHeight` 从 slot 高度算 |
| TxMarkdownView | 发布说明预览（不写链接，`.markdown-body` 在局部改为 13px） |
| TxTextMorph | 「当前 5% → 25%」数字滚动 |
| TxProgressBar | 当前放量比例 |
| TxSegmentedSlider | 目标档位 1 / 5 / 25 / 50 / 100（`aria-label` 走透传属性；左右留约 20px） |
| TxSlider（可选，仅宽档） | 「自定义比例」细调，tooltip 显示百分比 |
| TxSignalMeter + TxDotIndicator | 护栏 3–4 行，3 格表示达标程度 |
| TxSparkChart（宽档） | 无崩溃会话的走势，`domain: [99, 100]` |
| TxToolConfirmation | 发布机器人提议的首次放量闸门：`risk="execute"`，`riskLabels.execute` 为「推送给用户」；`rememberLabel` 改成「护栏失守时自动暂停」 |
| TxModal | 晋级确认、暂停确认（均由读者发起） |
| TxAlert | 暂停后在灰度卡顶部显示 warning 横幅 |
| TxTimeline | 本次发布动态，也可显示往期（暗色白环要覆盖） |
| TxToastPanel | 「已开始灰度 · 5%」「已晋级到 25%」「已暂停」「示例构建，不提供下载」 |
| TxDiffTable（可选，宽档） | 晋级确认框里的「参数变更」：`exposure 5% → 25%`，`play="settled"` |

**状态模型（建议）**

```ts
type StepKey = 'build' | 'sign' | 'notarize' | 'stage' | 'rollout'
type StepStatus = 'wait' | 'active' | 'completed' | 'error'
interface ReleaseState {
  steps: Record<StepKey, StepStatus> // 全受控，TxSteps :active="-1"
  revealed: number // 日志行
  artifacts: Record<ArtifactId, { signed: 'pending' | 'done', notarized: 'na' | 'pending' | 'running' | 'done' }>
  gate: 'hidden' | 'waiting' | 'allowed' | 'denied'
  autoHalt: boolean // 来自 TxToolConfirmation 的 remember
  rollout: { current: 0 | 1 | 5 | 25 | 50 | 100, target: number, halted: boolean }
  guardrails: { ready: boolean, crashFree: number, updateFail: number, rollbacks: number }
  modal: null | 'promote' | 'halt' | 'resume'
  timeline: Array<{ id: string, at: string, tone: 'success' | 'warning' | 'error' | 'primary' | 'default', text: { zh: string, en: string } }>
}
```

**交互要点**

1. **首次放量闸门**：出现后一直等读者。旁边提示「发布不会自动开始，点『开始灰度』继续」。
   - 允许：闸门折叠成一行结论（TxStatusBadge「已开始 · 5% · 由你批准」）；灰度一步变为 active；护栏在约 2.4s 内逐项填好。
   - 拒绝：显示「已分发，未发布」，灰度一步保持 wait，可以再次「开始灰度」。
2. **晋级**：
   - 前提：护栏已就绪、全部达标、目标高于当前、未暂停；否则按钮禁用并显示原因，例如「护栏数据收集中」「回滚请求超过阈值」。
   - 点击后打开 TxModal，确认框里列出护栏检查项，确认后执行。
   - 执行效果：TextMorph 从 5% 滚到 25%，进度条更新，Timeline 追加一条，弹出 toast。
3. **暂停**：确认后，灰度一步变为 error，描述「已暂停 · 25%」；头部徽章变成 warning「已暂停」；灰度卡出现 TxAlert；「晋级」变成「恢复」，恢复同样要经过 TxModal 确认。
4. **autoHalt**（可选，打开需勾选闸门里的复选框）：宽档可以提供一个「模拟崩溃率下滑」开关（类似 Automation 的模拟限流）。下滑后护栏变红，灰度自动暂停，Timeline 记一条「护栏触发自动暂停」。这是**往安全方向**的自动动作。
5. **复制 sha256**：复制出来的文本带 `SAMPLE-` 前缀；复制按钮自带「已复制」反馈。
6. **VersionCapsule**：
   - 下载面板：选任意构建都弹 toast「示例构建，不提供下载」；
   - 历史面板：选某个版本后，中栏「说明」切到那个版本的说明；
   - 外层拦截 Esc，只关面板，不收起展开态。

**脚本时间轴（从 `@enter` 起算，停在首次放量闸门前等待读者）**

| 时刻 | 流水线 | 中栏（默认「日志」页签） | 灰度栏 / 头部 |
|---|---|---|---|
| 0.0s | 构建 ✓（种子，4m 12s）；签名 active | 日志已显示前 4 行，之后每 250ms 揭示 1 行，滚动容器追尾 | 头部 WorkingIndicator「运行中」 |
| 1.0s | 签名 ✓；公证 active | 公证日志（submit → 等待） | 产物表中 mac 两行的公证显示 ⏳ |
| 2.8s | 公证 ✓ | 「Accepted（示例）· stapled」 | mac 行公证变成 ✓ |
| 3.1s | 分发 active | 上传 5 个产物、写入 latest*.yml（示例、未公开） | — |
| 4.3s | 分发 ✓；灰度 active（0%，待批准） | 「rollout: waiting for approval · target 5%」 | TxToolConfirmation 出现在灰度栏顶部；WorkingIndicator 换成 TxStatusBadge warning「待批准」 |
| 等待 | —— 不设计时器，等读者 —— | | |
| 允许 +0.3s | 灰度 active（5%） | 日志「rollout started · 5%」 | 当前 0 → 5；护栏依次从「收集中…」变为数值（每 0.8s 一项，共 3 项），Timeline 追加一条 |

- **reduced motion**：直接落到 4.3s 的状态：日志全部显示，mac 行已公证，闸门在等待。之后允许 / 晋级 / 暂停都即时生效；护栏直接显示数值。
- **重置**：清计时器，恢复种子状态，`generation++` 重建闸门（其复选框状态是内部的）。若已进入过视口，重放。
- **读者提前操作**：读者在模板里 `pointerdown` 不停止 CI 脚本。CI 步骤本来就是自动的，而且没有破坏性。但读者切了页签后，脚本不再自动切回「日志」。

**Mock 数据（示例；双语）**

```ts
const release = {
  version: 'v2.5.0-demo.4', channel: 'DEMO', build: '#1287',
  sample: { zh: '示例数据 · 不是真实发布', en: 'Sample data — not a real release' },
  steps: [
    { key: 'build', zh: '构建', en: 'Build', icon: 'i-carbon-build-tool', took: '4m 12s' },
    { key: 'sign', zh: '签名', en: 'Sign', icon: 'i-carbon-certificate', took: '38s' },
    { key: 'notarize', zh: '公证', en: 'Notarize', icon: 'i-carbon-certificate-check', took: '2m 51s' },
    { key: 'stage', zh: '分发', en: 'Stage', icon: 'i-carbon-cloud-upload', took: '1m 05s' },
    { key: 'rollout', zh: '灰度', en: 'Rollout', icon: 'i-carbon-rocket' },
  ],
  artifacts: [
    { id: 'mac-arm64', icon: 'i-cib-apple', zh: 'macOS · Apple 芯片', en: 'macOS · Apple silicon', file: 'tuff-2.5.0-demo.4-macos-arm64.dmg', size: '126.4 MB', sign: 'Developer ID', notarize: true },
    { id: 'mac-x64', icon: 'i-cib-apple', zh: 'macOS · Intel', en: 'macOS · Intel', file: 'tuff-2.5.0-demo.4-macos-x64.dmg', size: '131.2 MB', sign: 'Developer ID', notarize: true },
    { id: 'win-x64', icon: 'i-cib-windows', zh: 'Windows · x64', en: 'Windows · x64', file: 'tuff-2.5.0-demo.4-setup.exe', size: '118.7 MB', sign: 'Authenticode', notarize: false },
    { id: 'linux-appimage', icon: 'i-cib-linux', zh: 'Linux · AppImage', en: 'Linux · AppImage', file: 'tuff-2.5.0-demo.4.AppImage', size: '140.3 MB', sign: null, notarize: false },
    { id: 'linux-deb', icon: 'i-cib-debian', zh: 'Linux · deb', en: 'Linux · deb', file: 'tuff-2.5.0-demo.4.deb', size: '96.5 MB', sign: null, notarize: false },
  ], // sha256 = sampleHash(id)（sin 哈希生成 64 位十六进制），展示与复制都带 SAMPLE
  guardrails: [
    { key: 'crashFree', zh: '无崩溃会话', en: 'Crash-free sessions', value: '99.71%', target: '≥ 99.50%', level: 3 },
    { key: 'updateFail', zh: '更新失败率', en: 'Update failures', value: '0.4%', target: '< 1.0%', level: 3 },
    { key: 'rollbacks', zh: '回滚请求', en: 'Rollback requests', value: '2', target: '≤ 5', level: 2 },
  ],
  stages: [1, 5, 25, 50, 100],
  gate: {
    toolName: 'rollout.start',
    summary: { zh: '向 5% 的 beta 用户推送 v2.5.0-demo.4（示例）', en: 'Ship v2.5.0-demo.4 to 5% of beta users (sample)' },
    input: 'channel    beta (sample)\nexposure   0% → 5%\nartifacts  5 · signed (sample)\nguardrail  crash-free ≥ 99.50%',
    allowLabel: { zh: '开始灰度', en: 'Start rollout' }, denyLabel: { zh: '暂不发布', en: 'Not yet' },
    rememberLabel: { zh: '护栏失守时自动暂停', en: 'Halt automatically if a guardrail fails' },
    riskLabels: { zh: { read: '只读', write: '改动配置', execute: '推送给用户' }, en: { read: 'Read-only', write: 'Changes config', execute: 'Ships to users' } },
    hint: { zh: '发布不会自动开始，点「开始灰度」继续。', en: 'Nothing ships on its own — click Start rollout to continue.' },
  },
  log: [ // 每行「时间  阶段  消息」，同 Automation 的 logLine 写法（D/TemplateAutomationDemo.vue:425-432）
    '# 示例日志 · 不代表真实构建 / Sample log — not a real build',
    '12:00:04  build     pnpm build:release · tuff 2.5.0-demo.4',
    '12:03:51  build     electron-vite · main 2.1 MB · renderer 6.8 MB',
    '12:04:16  package   electron-builder · mac(arm64,x64) win(x64) linux(x64)',
    '12:04:40  sign      codesign · Developer ID (sample) · 2 artifacts',
    '12:04:52  sign      signtool · Authenticode (sample) · 1 artifact',
    '12:05:03  notarize  notarytool submit tuff-2.5.0-demo.4-macos-arm64.dmg',
    '12:07:41  notarize  status: Accepted (sample) · stapled',
    '12:07:55  stage     upload 5 artifacts → staging (sample, not public)',
    '12:08:06  stage     latest-mac.yml · latest.yml · latest-linux.yml (sample)',
    '12:08:07  rollout   waiting for approval · target 5%',
  ],
  notes: { // TxMarkdownView，不写链接；条目与其他模板呼应
    zh: '### 新功能（示例）\n- 剪贴板历史支持「阅后即焚」：密钥类内容到时自动清除\n- CoreBox 划词翻译支持 12 种语言\n\n### 修复（示例）\n- Windows 上截图 OCR 偶发崩溃\n- 插件市场详情页权限说明更易读',
    en: '### New (sample)\n- Clipboard history can burn secrets after reading\n- CoreBox selection translate supports 12 languages\n\n### Fixed (sample)\n- Occasional Windows crash in screenshot OCR\n- Clearer permission copy on plugin market pages',
  },
  history: [ // TxVersionHistoryPanel / TxTimeline
    { id: 'd3', tag: 'v2.5.0-demo.3', channel: 'DEMO', tone: 'preview', date: { zh: '9 月 22 日', en: 'Sep 22' }, note: { zh: '5% 时崩溃率抬头，已暂停（示例）', en: 'Halted at 5% on a crash-rate rise (sample)' } },
    { id: 'd2', tag: 'v2.5.0-demo.2', channel: 'DEMO', tone: 'preview', date: { zh: '9 月 18 日', en: 'Sep 18' } },
    { id: 's7', tag: 'v2.4.9-demo.7', channel: 'STABLE', tone: 'stable', date: { zh: '9 月 9 日', en: 'Sep 9' } },
  ],
}
```

**需要手写的 CSS**

- 控制台底色与面板分隔：沿用 Automation「编辑器面板」的做法（`D/TemplateAutomationDemo.vue:1350-1357` 起）。
- 日志滚动容器。
- `.markdown-body` 字号覆盖。
- Timeline 圆点白环覆盖。
- 分段滑块两侧的 padding。
- sha 单元格的等宽截断。
- 闸门置顶区。
- 暂停态下灰度卡的描边。

**本模板的专属风险**：见 Risks 第 3、4、13–16 条。

---

## Risks

按影响排序。前 4 条需要主 agent 先拍板；其余都能在模板层绕开。

1. **大屏的主题策略**（需拍板）：
   - 推荐方案 A：局部 `data-theme="dark"`，加 5 个 token 的重新声明、`color-scheme`、`theme="dark"`。
   - 方案 A 的代价：局部作用域之外的浮层（teleport 出去的）会显示成页面主题，大屏里要避免使用。
   - 备选方案 B：跟随站点主题，但与第一风格的差异会变小。
   - 两种方案都要按 R3 在暗 / 亮两种页面下各截一张图。
2. **Copilot 的脚本选区**（需拍板）：
   - 推荐用模板自己的高亮 span 构造 `Range` 和 payload，**不调用 `window.getSelection().addRange()`**，否则会冲掉读者在页面其他地方的选区，这是页面级副作用。
   - 读者一旦自己划词就接管，脚本停止。
   - 脚本停在「应用」之前，页面改动永远由读者点击触发。
3. **Release 的示例数据呈现**（需拍板）：
   - 版本号用 `-demo.N` 预发布标识；
   - sha256 和签名始终带「示例 / SAMPLE」，复制内容也带；
   - 所有 `TxVersion*Panel` 都不传 `href`；
   - 头部常驻「示例数据」标记。
   - 如果老板希望版本号更像真的，至少要保留「示例」标记，并且完全不出现 URL。
4. **Release 的审批形态**（需拍板）：
   - 推荐：首次放量用 `TxToolConfirmation`（机器人提议，读者允许）；晋级和暂停用 `TxModal`（读者发起）。没有任何计时器会推动放量。
   - `TxToolConfirmation` 的 remember 复选框藏不掉，只能改文案成「护栏失守时自动暂停」，或者用 `:deep` 隐藏。
5. **`TxSelectionActions` 的定位**（源码推断，**浏览器未验证**；实现时第一个要验）：
   - 问题：虚拟参考加快照 rect，再加组件自己的 window scroll/resize → `update()`，导致页面滚动后工具条钉在视口上；模板内部滚动容器滚动、侧栏折叠、展开 / 收起时也会错位。
   - 宿主对策：
     - 持有 `Range`；
     - 在上述时机重新测 `getClientRects()`，再 `nextTick(updatePosition)`；
     - 选区滚出文章可视区时，idle 态收起。
   - 另外两个约束：
     - 因为 `disable-flip`，脚本目标句离舞台底边至少 64px；
     - 工具条的 z-index（≥ 2000）高于展开浮层，列内态下也会压在站点页头上。
6. **Copilot 宿主页面必须是普通 DOM**：textarea / input 里的选区没有 Range rects。`TxTextarea`、`TxCodeEditor` 都不行，`TxMarkdownEditor` 本来就禁用。「应用」只改模板自己的响应式块数据。
7. **Copilot 的输出真实性**：
   - 任意选区只能映射到预写块。翻译用另一种语言的原文，润色和解释用预写文案。
   - 未覆盖的块（标题、代码）要明说「演示仅覆盖这些段落」。
   - **绝不读取真实剪贴板**：`navigator.clipboard.read*` 会触发权限弹窗，也有隐私问题。剪贴板 chip 只是示意。
8. **文案本地化缺口**：
   - `TxSankeyChart` 默认 tooltip（`Value`、`items`）→ 用 `#tooltip` 插槽。
   - `TxModal` 关闭按钮 `Close`、`TxToolConfirmation` 的 aria 后缀、`TxAlert` 关闭按钮 → 无法覆盖，记入审阅说明。
   - `TxDiffTable` 与 `TxVersion*` 的默认文案都可以传 prop 覆盖。
   - `TxSelectionActions` 的文案可以全部覆盖。
9. **大屏的可访问性与动效**：
   - 会自动更新、而且持续超过 5 秒的内容和轮播，要有暂停手段（WCAG 2.2.2）→ TxModeChip 暂停开关。
   - 悬停或聚焦时暂停轮播。
   - reduced motion 下显示静态快照，不启动计时器。
   - 事件滚动条不做 `aria-live`。
   - 不可见（IntersectionObserver 或 `visibilitychange`）时暂停，避免空转。
   - TextMorph 实例不超过 6 个。
10. **地图**：
    - GeoJSON 要在运行时 fetch 同源的 257 KB 文件，需要加载中和失败两种状态，用 `shallowRef` 存。
    - `roam` 必须关，否则会吞页面滚轮。
    - 不用 choropleth：会画出国界，数据里有独立的 Taiwan feature，名称全英文。
    - 气泡入场发生在 mount 时，所以用 `v-if="entered && world"` 推迟挂载。
    - 气泡数据更新没有补间，可以手写 `r` 过渡。
    - `height` 是数值；宽高比和投影窗口不一致时两侧留白，需要调 `zoom` / `center`。
    - spec `tuffex-charts-package.md` 写的「map demo 从 CDN 取 GeoJSON」已经过时：现在是 vendored 的 `/geo/...`。
11. **桑基图**：
    - 高度是数值；有环时什么都不画，所以流量守恒要自己算。
    - 窄宽度下标签会压在连线上 → 用 inline 布局和短名。
    - 数据刷新没有补间且会清掉 hover → 刷新间隔要长，读者指针悬停时暂停刷新。
12. **局部暗色作用域的边角**：
    - 5 个派生 token 要重新声明，外加 `color-scheme`。
    - `useAutoTheme`（SparkChart 回退色、EChart、CodeStream、StreamMarkdown）只看 html/body，要显式传 `theme="dark"`。
    - `TxThinkingOrb`、`TxSlider` 的玻璃拇指、`TxBorderBeam`（`auto` 读的是系统偏好）也不认局部作用域。
13. **`TxSteps`**：`active` 下标优先于 `status`。要显示 error 或暂停，就用 `:active="-1"`，每步 status 全受控。组件不派发任何事件，只作展示（`clickable=false`）。
14. **`TxVersionCapsule`**：
    - 面板不 teleport，宽 394px，放在头部偏左会被舞台裁掉。
    - 面板打开时挂 document 级监听。
    - 焦点在面板内时按 Esc，会同时关闭面板和展开浮层 → 外层 `@keydown.esc` 里 `preventDefault()`。
15. **表单控件的溢出空间**：
    - `TxSegmentedSlider` 的首尾标签会横向溢出，并向下多占约 20px。
    - `TxSlider` 的 tooltip 要上方约 40px。
    - `TxPromptBar` 的菜单要上方约 220px。
    - 所在列都不能设 `overflow: hidden`，否则要预留 padding。
16. **动效缺口**：`TxModal` 的进出场没有 reduced-motion 保护（批 1 已记）。模板层不修，写进审阅说明。其余本批组件都有保护：SelectionActions、DiffTable、TextMorph、maps / sankey、SegmentedSlider、VersionCapsule、Transition、InsightCards。
17. **`TxDiffTable`（若采用）**：
    - `play="auto"` 在 mount 时就开跑，要改用 `manual` 或 `settled`。
    - 单元格 `nowrap` 会截断散文，需要 `:deep` 覆盖。
    - 应用按钮是品牌蓝底配白字。
18. **并行会话与 dist**：本批组件在 09-24 07:31 的 dist 与源码一致。别的会话如果重建 dist，正在运行的 Nexus dev 必须重启（批 1 `data-flow.md` Risk 14）。`TxModeChip` 是新组件，dist 里已包含。

---

## Files Found

| 路径 | 说明 |
|---|---|
| `.trellis/tasks/09-24-nexus-docs-templates-batch-2/prd.md` | 本批 PRD（D3 清单、Constraints：R1、禁价格） |
| `.trellis/spec/frontend/nexus-docs-templates.md` | 模板契约（接入链路、TemplateFrame、行为矩阵、规则、验证） |
| `.trellis/tasks/09-23-nexus-docs-templates-tab/research/{ai,data-flow}.md` | 批 1 组件 cheat sheet |
| `.trellis/tasks/09-23-nexus-docs-templates-tab/design.md` §5、§6.4、§6.6、§6.7、§6.11 | 批 1 的采纳决策与已知缺陷表 |
| `D/TemplateFrame.vue` | 舞台：slot 的 `expanded/width/height`、`@enter`（35% 可见）、Teleport、Esc 规则（:137-146）、z 1900（:67） |
| `D/TemplateAgentChatDemo.vue` | 闸门等待、`settleToGate`、`resetDemo`、`generation` 的先例 |
| `D/TemplateDashboardDemo.vue` | 确定性数据、`layoutOf`、数值尺寸、TextMorph KPI、`v-if="entered"` |
| `D/TemplateAutomationDemo.vue`、`D/TemplateAutomationSplit.vue` | 运行计划式时间轴、日志滚动容器、Timeline 白环覆盖、Splitter 去边框 |
| `D/TemplateShellDemo.vue:596-679` | 读者 pointerdown 停止自动演示 |
| `D/TemplateLauncherDemo.vue:1073-1079`、`D/TemplateInboxDemo.vue:2372-2395` | `.markdown-body` 字号覆盖 |
| `D/SelectionActionsRewriteDemo.vue` | 划词、pin 住的 payload、流式重测的先例 |
| `D/DiffTableDiffTableDemo.vue` | DiffTable 的 zh/en formatter 写法 |
| `D/MapsBubbleMapDemo.vue` | 同源 GeoJSON 的 fetch 写法 |
| `D/SankeyChartBasicDemo.vue`、`D/SankeyChartLabelsDemo.vue` | 桑基数据守恒、inline 标签 |
| `D/VersionCapsuleVersionCapsuleDemo.vue` | 胶囊与两个面板的 zh 文案、`i-cib-*` 平台图标 |
| `D/ChatComposerModeChipDemo.vue` | TxModeChip 用法 |
| `D/TemplateSettingsDemo.vue:955-970` | TxModal 确认框先例 |
| `C/selection-actions/{index.ts,src/*}` | TxSelectionActions / useSelectionAnchor |
| `C/base-anchor/src/TxBaseAnchor.vue:178-211, 914, 928-966, 1037` | 定位策略、z-index、虚拟参考监听、teleport |
| `C/diff-table/src/*` | TxDiffTable |
| `C/text-morph/src/*`、`src/engine/{types,morph,reduced-motion}.ts` | TxTextMorph |
| `C/charts/index.ts`、`C/charts/src/maps/src/*`、`C/charts/src/sankey/src/*`、`C/charts/src/style/tokens.scss`、`C/charts/src/core/animate.ts` | 地图、桑基、图表 token、动效辅助 |
| `C/slider/src/TxSlider.vue`、`C/segmented-slider/src/*` | 滑块 |
| `C/modal/src/TxModal.vue` | 模态框 |
| `C/version-capsule/src/*` | 版本胶囊与面板 |
| `C/button/src/copy-button.vue`、`C/tag/src/*`、`C/mode-chip/*`、`C/transition/src/TxTransition.vue`、`C/edge-fade-mask/src/*`、`C/border-beam/src/*`、`C/alert/src/TxAlert.vue` | 辅助组件 |
| `C/steps/src/TxStep.vue:44-61`、`C/icon/src/TxIcon.vue:109-115`、`C/tool-confirmation/src/TxToolConfirmation.vue:44, 61-64`、`C/tool-chips/src/TxDiffChips.vue` | 对批 1 的补充 |
| `C/stream-markdown/src/use-auto-theme.ts` | html/body 主题探测（局部作用域不生效的原因） |
| `packages/tuffex/packages/components/style/{variables,bui-tokens}.scss` | 暗色选择器、未重新声明的派生 token |
| `N/public/geo/world-countries.geo.json` | 180 个 feature，`id` 为 ISO3，`properties.name` 为英文 |
| `N/app/app.vue:576-578` | `html.dark { color-scheme: dark }` |
| `N/uno.config.ts:7, 56-62` | presetWind 的 class 暗色策略（`.dark` 会激活 `dark:` 变体） |
| `N/AGENTS.md:35, 38-41` | 禁价格与 mock checkout；R1 发布完整性 |
| `apps/core-app/package.json:3`、`apps/core-app/electron-builder.yml:94, 154, 163` | 当前真实版本号与产物命名模式 |
| `plugins/clipboard-history/README.md` | Copilot 宿主文档的取材 |
| `node_modules/.pnpm/@floating-ui+dom@1.7.6/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs:385-417` | absolute 策略下的参考点换算 |

## Related Specs

- `.trellis/spec/frontend/nexus-docs-templates.md`：全部模板规则，包括第 6 节 Layout / Playback / 闸门 / 页面礼仪 / 反馈 / 禁用组件 / 内容。
- `.trellis/spec/frontend/tuffex-design-rules.md`：13–14px 正文、600/500 字重、颜色全部来自 token、语义色不能是唯一的状态载体、每个 transition 都要有 reduced-motion 出口、不叠卡片。
- `.trellis/spec/frontend/tuffex-text-motion.md`：TextMorph 冻结子节点、不截断、reduced motion 清空段落记录。
- `.trellis/spec/frontend/tuffex-charts-package.md`：图表只通过 `--tx-chart-*` 取色，没有 `isDarkMode`。注意它关于包位置和 CDN GeoJSON 的描述已经过时（见 Caveats）。
- `.trellis/spec/frontend/tuffex-docs-sync.md`：Demos 与 Gates 两节。
- `.trellis/spec/frontend/bui-component-family.md`：BUI 组件是受控原语；composable 不走全局注册。

## Caveats / Not Found

- **没有在真实浏览器里验证过任何组合**，结论全部来自读源码。
  - 最需要尽早实测的是 Risk 第 5 条（SelectionActions 滚动错位），其次是局部暗色作用域的实际效果（Risk 第 1、12 条）。
- `tuffex-charts-package.md` 仍写着 `packages/tuffex-charts`、「Nexus 总是从源码消费」和「map demo 从 CDN 取 GeoJSON」。现状是：charts 在 `C/charts/`，走 tuffex 的 dist / 源码双模式；GeoJSON 已 vendored 到 `N/public/geo/`。本文以现状为准，spec 没有改（不在调研职责内）。
- tuffex 里**没有**跑马灯 / ticker / carousel 组件。事件滚动条要用 `TxTransition group` 加手写列表拼，轮播用 `TxInsightCards` 由宿主驱动。
- `TxProgress`（`TuffProgress`）只是线性进度条，没有环形。环形可以用 `TxStatCard variant="progress"`（锥形渐变环），也可以用 ECharts 的 `TxGaugeChart`（需要按需加载 echarts）。本文都没有采用。
- 城市坐标、在线人数、流量、护栏数值、产物大小、版本号全部是示例值，按 spec 要标注「示例数据 / sample data」。第三方工具名（codesign、notarytool、signtool）只作日志文案，不代表真实链路。
