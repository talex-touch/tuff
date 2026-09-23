# BUI 21 组件全量对齐审计与修复

父任务：`.trellis/tasks/09-21-bui-parity-and-interaction/`

## 背景

老板 2026-09-21：「确保这个库相关的都完整迁移到我们的库里」「包括样式啥的 你可以自己对比一下 看看每一个有无问题 **现在展示出来的问题很严重**」。

## 已确认的事实（2026-09-21 实测）

### 1. 上游从 19 个案例长到了 21 个，我们停在 19

`apps/nexus/content/docs/dev/components/ai-suite.zh.mdc:305-325` 的映射表是 **19 行**，编号 01–19。beautifului.dev 现在有 **21 个 section**。比对后两边编号发生了位移：

| 上游现编号 | section | 我们的落地 | 状态 |
|---|---|---|---|
| 01 | loading-state | TxWorkingIndicator | 已迁 |
| 02 | thinking-state | TxAgentTrace | 已迁 |
| 03 | streaming-text | TxInlineCitation + TxSources + TxSuggestionChips | 已迁 |
| 04 | approval-card | TxApprovalCard | 已迁 |
| 05 | tool-chips | TxToolChips / TxDiffChips | 已迁 |
| 06 | task-rows | TxTaskRows | 已迁 |
| 07 | chat-composer | ai-suite showcase demo | 已迁 |
| 08 | prompt-bar | TxPromptBar | 已迁 |
| 09 | recommendation-card | TxRecommendationCard + TxSignalMeter | 已迁 |
| 10 | context-cards | TxContextCards / TxContextChunk | 已迁 |
| 11 | diff-table | TxDiffTable | 已迁 |
| 12 | records-table | TxDataTable 扩展 | 已迁 |
| 13 | filter-table | TxFilterChips + TxDataTable | 已迁 |
| 14 | sidebar-nav | TxSidebarNav | 已迁 |
| 15 | search | TxSearchPanel | 已迁 |
| **16** | **flowchart** | **无** | **缺失** → 子任务 `09-21-flowchart-flow-suite` |
| 17 | insight-cards | TxInsightCards + TxSparkChart + TxAllocationBar | 已迁，有缺口（见下） |
| 18 | code-block | TxCodeStream | 已迁 |
| 19 | fine-tune-card | TxFineTuneCard + TxScrubField | 已迁 |
| 20 | selection-actions | TxSelectionActions | 已迁 |
| **21** | **agent-screen** | **无** | **缺失** |

映射表上的旧编号 16–19 分别对应上游今天的 17–20，**不是漏迁，是上游插入了 `flowchart`**。`ai-suite` 文档里「共 19 个」的表述需要随本任务更新。

### 2. InsightCards 丢掉了整个 scrub 数据呈现层（老板：「这个丢 data」）

上游该节标题是 "Paged agent insights with **scrub-ready live charts**"。逐项比对（上游截图 vs `/tmp/tuff-ref/ours/insight-cards-demo0.png`）：

| 元素 | 上游 | 我们 |
|---|---|---|
| 竖直扫描线（scrubber） | 有 | **无** |
| 深色 tooltip（`-3.76%` `+0.89%`） | 有 | **无** |
| 序列色点 chips（图表左上两颗） | 有 | **无** |
| 虚线基准线（每序列一条） | 有 | **无** |
| 曲线末端实心端点 | 有 | **无** |
| 结论句内联 token（🟠 @Creamery、红色 mono `-6%` / `-$2,453.44`） | 有 | **无高亮，非 mono** |
| 指标副行（`-$2,377.66`） | 裸文字 | **多了灰色圆角底框** |
| 容器比例 | 宽而矮（约 690px） | 窄而高（344px） |

### 3. 测量环境有两个坑，已踩过，写在这里防止复发

- **浏览器扩展污染**：ego-browser 走老板真实 profile，Lexi 扩展（`dabefmiiiipacllcgacbnlgnkfpgchpn`）向页面注入 `span.lexi-token`，打断 Vue SSR 水合，整页 MDC 渲染错乱。视觉审计必须用 `--disable-extensions` 的独立 headless Chrome。
- **demo 懒挂载**：`TuffDemoWrapper` 按 intersection 挂载，导航后立刻测量会看到「示例加载中…」并得出假故障结论（本次已误判一次，`[[nexus-cdp-visual-verification]]` 里记过同样的教训）。必须先滚完整页再测。

证据脚本：`research/shoot-docs.mjs`（整页 + demo 挂载普查）、`research/shoot-demo.mjs`（按选择器截特写）。基准图 `/tmp/tuff-ref/bui-shots/`，我方图 `/tmp/tuff-ref/ours/`。

## 需求

1. 对 21 个 section 逐个做**并排视觉与交互比对**，每项产出「一致 / 有差异（列出差异项）/ 缺失」三选一的判定，差异项要具体到元素，不接受「大致相同」。
2. 修复判定为差异的项。颜色、字体、间距走我们自己的 `--tx-bui-*` token 层，不照抄上游十六进制。
3. `flowchart`（#16）与 `agent-screen`（#21）的补齐分别落在子任务中，本任务只负责把它们标记为缺失并交接。
4. 更新 `ai-suite.{zh,en}.mdc` 的映射表与「共 19 个」表述。

## 验收标准

- 21 项每项都有判定记录与证据截图，存放在本任务 `research/` 下。
- 被判定为差异的项修复后，重新截图并附修复前后对比。
- `pnpm -C packages/tuffex` 的 build / typecheck / 测试 / audit 全绿；`apps/nexus` 的 `check:demo-registry`、`check:doc-parity`、wrapper typecheck 全绿。
- 不新增 lint 违规（按各包**自身**配置判 delta，不判零）。

## 非目标

- 不做像素级复刻。对齐的是设计意图与交互完整性；色值与字体走我们的 token 层。
- 不改这 21 个之外的 tuffex 组件。
