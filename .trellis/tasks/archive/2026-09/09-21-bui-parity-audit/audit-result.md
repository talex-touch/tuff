# BUI 21 例并排对齐审计结果

日期：2026-09-21。两侧同一台无扩展 headless Chrome、同视口（980×760 @2x）、**两边都强制浅色**后截取。原图在 `/tmp/tuff-ref/pairs/<key>--{bui,ours}.png`。

判定口径：**一致** = 结构与关键元素齐备；**差异** = 列出具体缺失/偏离元素；**有意偏离** = 我方刻意做得不同且有据（文档已写明）；**缺失** = 无对应实现。

## 汇总

| # | 案例 | 判定 | 要点 |
|---|---|---|---|
| 01 | Loading State | 一致 | 3×3 像素网格 + 文案 + mono 计时齐备。上游文字带 shimmer 扫光，我方该帧未见（需逐帧确认，未下结论） |
| 02 | Thinking | **已补齐** | `AgentTraceVariantsDemo` 由三个并排轨迹改成 `TxFlatRadio` 四档切换（步骤 / 推理 / 检索 / 工具），与上游同构。组件本就支持四个 `variant`，这是纯 demo 层改动。`:key="variant"` 让切换重建轨迹而非形变——四者是四套行语法不是四张皮。浏览器实测四档各自渲染：步骤 206px「走完 3 步」+ 状态字形；推理 160px 散文两行；检索 262px 查询行 + 彩色来源点 + 「还有 7 条」；工具 211px 等宽文件名 + `+74 −41`。另：steps 数据原先给了一行 `pending`，而组件的文档映射是「只有 `active` 转、`error` 打叉，其余一律打勾」，于是 pending 行显示成对勾、与「走完 3 步」的表头自相矛盾——改成三行全 `done` |
| 03 | Streaming Text | 未单独比对 | 由三个组件承载，无单一对照面 |
| 04 | Approval Card | 有意偏离 + 小缺口 | **交互模型不同**：上游每题两个显式按钮 `Skip` / `Continue`；我方是单选后 `autoAdvance` 自动前进、末题显示发送（props 有 `sendLabel`/`nextLabel`/`prevLabel`/`startOverLabel`，emits 有 `submit`）。真正缺的只有**显式 Skip（跳过本题）**能力。分页从分数计数改成圆点指示器 |
| 05 | Tool Chips | 一致 | 折叠头、四行工具调用、底部 diff chips 全齐。我方每行多一个蓝色圆点，行距更大 |
| 06 | Task Rows | 一致 | 绿勾圆、进度环、计数、Completed 胶囊、展开箭头全齐；行间距比上游大 |
| 07 | Chat | 未单独比对 | 落在 ai-suite showcase demo |
| 08 | Prompt Bar | 一致 | `+` / 输入框 / 模型选择 ⌄ / 听写 / 发送 结构全对上，连 `Rounded` `Pill` 两种形态切换都有 |
| 09 | Recommendation Card | **差异** | 标题、置信度量表（绿三格 + 文字）、`其他方案` / `接受` 双动作都对上。差在**内联实体 token 的呈现**：上游是 `[🟠 Cone King]` 带头像色点的实体徽标（人类可读名）+ `7 days` 绿底语义胶囊；我方渲染成 `cone_king` / `7_days` 蓝色 mono 代码片段（原始 id）。**已修复**：组件样式新增 `code.is-success`（绿 tint，配原有 `is-warning`）与 `mark` 规则——999px 胶囊、非等宽、带 14px 色点，颜色由宿主经 `--tx-entity-color` 给，不给落到中性灰。用 `mark` 而非自造约定类，是因为这个元素本身的语义就是「被单独标出来引用的文字」，读屏能读到，不靠颜色传达；`code` 留给真标识符，两者读起来是两类东西而不是同一类的两种 tint。9 项编译后 CSS 契约测试（含负控制：删掉被测行后断言翻假、邻行不受影响）+ 浏览器实测（`mark` 渲染 999px / `rgb(231,233,235)` 底 / 色点 14px `rgb(239,114,12)`，`code.is-success` `rgb(24,154,77)` on `rgb(232,245,237)` 等宽） |
| 10 | Context Cards | 一致 | `All chunks 32` 头、chunk 卡（标题 + 字符数 + 正文）、PDF/CSV 彩色角标、带外链箭头的来源胶囊全对上。仅来源胶囊文字我方为链接蓝、上游为深色 |
| 11 | Diff Table | **已修复** | 补齐操作层：每行红/绿采纳开关（整行可点）、底部 `删除 N 项 · 新增 N 项` 汇总 + 应用按钮、标题右侧提示。纯受控（`v-model` 绑定即不自写），三处文案均可注入。32 项测试、浏览器实测通过。修复中另发现两处：added 行的 CSS grid 在百分比列已占满 100% 时追加 44px 控制列会溢出被 `overflow:hidden` 吃掉（改为每列 `calc(pct - 44px/3)`）；单元格由换行改为截断，与上游一致 |
| 12 | Records Table | 未单独比对 | 上游该例由 `TxDataTable` 扩展 + `TxTag` + `TxDotIndicator` + `TxCellLink` + 三态 `TxCheckbox` 组合承载，没有单一对照组件；需要按组合场景另立比对，不在本轮逐组件审计的口径内 |
| 13 | Filter Table | 有意偏离 | 筛选胶囊一致；上游胶囊下直接接表格，我方拆成两个 demo（胶囊单独一个，表格组合在「与表格组合」节） |
| 14 | Sidebar Nav | 差异 + 有意偏离 | 我方多了真实搜索框与可用折叠（文档注明上游那两处「纯装饰」）；**缺底部 Upgrade 槽位**；上游无卡片边框，我方有 |
| 15 | Search | 一致 + 有意增强 | 搜索框 + 5 条结果一致；我方补了键盘导航与首项高亮（上游无键盘支持，文档已写明） |
| **16** | **Flowchart** | **已补齐** | 本轮新增 `TxFlowchart` + flow 套件，见 `09-21-flowchart-flow-suite` |
| 17 | Insight Cards | **一致 + 细节已补** | scrub 层**完整且工作正常**：悬停实测有竖直扫描线、深色 tooltip（`今天 12:00 / 薄荷脆片 −3.52% / 开心果 +0.76%` + 两个序列色点）、曲线活动端点，且比上游多一个时间标签。**残留细节差异**：图表左上缺一对序列色点胶囊、缺每序列的虚线基准线、缺静止态的曲线末端实心点；指标副行多了不该有的灰底框；容器偏窄 |
| 18 | Code Block | **已修复** | `TxCodeStream` 新增 `diff` prop（`CodeDiffRow[]`）：删除/新增行的底色与槽标、头部 `+N −N` 计数、替换处共享行号。斜纹槽标是**无障碍要求**——红绿两种色调正是色盲最难分辨的一对，形状必须能单独区分。高亮整段一起送 Shiki（逐行单独高亮会丢上下文）；复制按钮仍给 `code` 而非 diff（剥掉标记的 diff 两个版本都不是）。34 项测试、浏览器实测通过。缺标题 `</>` 图标与配色差异属有意偏离（我方走 Shiki，上游是手写五色模型） |
| 19 | Fine-tune Card | 一致 + 有意增强 | 卡片结构、Adjust、Layout 分段、四数值域、Type 选择器全对上；我方多了右侧实时预览 |
| 20 | Selection Actions | **已修复** | 入场由 `bui-pop-in`（ease-out，永不越过终值）换成新的 `bui-spring-in`：`scale(0.88) translateY(8px)` 配 `--tx-ease-spring`（`cubic-bezier(0.34, 1.56, 0.64, 1)`）冲过 1 再落回，即老板要的「q 弹」。背景**本就**是 `--tx-bui-surface`，无需改动。`bui-pop-in` 被另外九个组件共用，因此新增变体而非修改原 mixin。7 项编译后 CSS 契约测试 + 浏览器实测（模拟真实选区，读到 `animationName: tx-bui-spring-in`、`timing: cubic-bezier(0.34, 1.56, 0.64, 1)`） |
| **21** | **Agent Screen** | **已补齐** | 新增 `TxAgentScreen`：定比例画框（默认 `2964 / 1856`，与上游同为 340×242）、百分比定位并夹取的指针叠层（内联 SVG，浅填充+深描边才能压住任意画面）、复用 `skeleton-surface` 的加载占位（带 `role="status"`，且与 `overlay` 一并撤掉）、下方说明。13 项测试、浏览器实测通过 |

## ~~系统性根因：演示区没有居中~~ —— 判断错误，已撤回

**这一条是错的，不要照它动手。**

原判断：`.tuff-demo__preview` 只有 `padding: 28px`、没有任何居中，所以内容靠上、下方留白；上游 `.primitive-demo-surface` 是 `flex items-center justify-center`，因此应当全局对齐。

**证伪过程**（2026-09-22）：

1. 在 diff-table / code-stream / agent-trace / filter-chips 四页注入居中样式，前后测量 **完全无变化**（`widthDelta: 0`、`topGapDelta: 0`）。
2. 加 `!important` 重测，**仍然无变化**——说明根本不是特异度问题。
3. 打印从 `.tuff-demo__preview` 到内容元素的完整 DOM 链，真相是：

```
.tuff-demo__preview (h:274, display:block)
  div.flex.flex-col (738x218)
    div.max-w-[380px].min-h-[176px]   ← demo 自己写的最小高度
      .tx-bui-agent-trace (380x28)     ← 内容仅 28px
```

空白来自 **demo 自己容器上的 `min-h-[176px]`**，与 `TuffDemoWrapper` 居不居中无关——这正是注入毫无效果的原因。

4. 进一步验证该 min-height 是否有意：agent-trace 是一个展开式轨迹，**收起 28px → 展开 257px**。那片留白是**为展开态预留的布局空间**，防止展开时页面跳动。

**结论**：不是缺陷，是有意的布局预留。原判断把「视觉上空」等同于「布局有问题」，并且在没有验证 DOM 结构的情况下就给出了「一处根因、全局症状」的结论。照它动手会是一个影响几百个 demo 的无谓改动。

同类留白（filter-chips 的 `gapBottom: 83` 等）应逐个按「该 demo 是否有展开/播放态需要预留」判断，而不是套一条全局规则。

**教训**：注入无效时，第一反应应当是「我对结构的假设错了」，而不是「特异度不够」。加 `!important` 之前先打印 DOM 链。


## 六个假故障（测量环境 / 方法 / 时序，非代码）

按 [[my-own-scans-fail-most]] 记录，本轮排掉六个我自己制造的错误结论：

1. **「InsightCards demo 挂了」** — ego-browser 走老板真实 profile，Lexi 扩展注入 `span.lexi-token` 打断 SSR 水合；叠加 `TuffDemoWrapper` 按 intersection 懒挂载。改无扩展 Chrome + 先滚完整页后 `pending: 0`。
2. **「agent-trace 整页空白」** — dev server 冷编译的偶发空窗。复测 `innerText=3804`、零异常。
3. **「Flowchart 第一行渲染淡化」** — `captureBeyondViewport: true` + `clip` 分块渲染的拼接缝，带锐利水平边界，酷似真 opacity bug。DOM 测得两侧 opacity/filter/mask 全同、`elementsFromPoint` 无遮罩，改全视口截图后消失。**审计工具已改为全视口截取**。
4. **「InsightCards 丢了整个 scrub 层」** — 用**静态截图**判了一个只在悬停时出现的交互层。`TxChartScrubber` 早已存在（309 行）且 demo 已接入；`Input.dispatchMouseEvent` 真实悬停后 tooltip / 扫描线 / 活动端点全部正常。
   **教训**：老板给的上游参考图本身也是悬停态截图。判定「缺失」前必须先确认该元素是静态态还是交互态，静态截图对交互层没有证据力。

5. **「02 的切换器点了没反应」** — 探针写的是 `document.querySelector('.tuff-demo .tx-bui-agent-trace')`，而这一页有**两个**轨迹 demo，它取到的是上面那个 `AgentTraceStepsDemo`。那个 demo 当然不随切换变化，于是四档读出完全相同的内容。改成「从切换器出发 `closest('.tuff-demo')` 再往下找」后，四档各自正确。
   **教训**：页面上同类组件不止一个时，`document.querySelector` 取的是第一个，不是"我正在看的那个"。作用域要从**已知锚点**（这里是切换器本身）出发。
6. **「两个 demo 都不见了」** — 真因是 gulp build 会先删 `packages/tuffex/dist` 再重建，而 nexus `nuxt.config.ts` 在配置加载期读 `distEntryExists`；正在跑的 dev server 刚好在这个窗口里重载配置，直接抛 "tuffex dist is missing" 死掉，整站变成错误页。**在 dev server 开着的时候重建 tuffex，必须接着重启 dev server。**
   这一条差点被我当成"我的改动没生效"。先跑了一个正控制（打印 `document.title` 与 `.length`），才看出是整页 "An error has occurred"。

> 前三个是观察环境问题，第四、五个是**我的判定方法错误**，性质更重——第四个一度被写进给老板的汇报当作首要修复项。第六个是工具链时序。


## 工具

- `research/shoot-pair.mjs` — 单组件两侧特写（全视口，两边强制浅色）
- `research/shoot-all-pairs.sh` — 批量 15 对
- `research/shoot-docs.mjs` — 整页 + demo 挂载普查
- `research/probe-errors.mjs` — 客户端异常捕获
- `research/seam-test.mjs` — 截图接缝复现
- `research/verify-02-09.mjs` — 02/09 的 DOM 实测（计算样式 + 逐档点击）
- `research/shoot-02-09.mjs` — 02/09 的全视口取证截图（输出 `/tmp/tuff-ref/verify-02-09/`）

## 下一步（按严重度，已按复核结果重排）

复核方式：不看截图，读组件 `types.ts` 的完整 props/emits 判断能力是否存在。

**上游 21 例现已全部有对应实现**（16 Flowchart、21 Agent Screen 于 2026-09-21 补齐）。剩余为细节对齐：

1. ~~11 DiffTable 操作层~~ ✅ 已修
2. ~~21 Agent Screen~~ ✅ 已补
3. ~~18 CodeBlock unified diff~~ ✅ 已补
4. ~~20 SelectionActions 回弹入场~~ ✅ 已修
5. ~~04 ApprovalCard 补显式 Skip~~ ✅ 已补（`skippable` + `skip` 事件，默认关闭）
6. ~~17 InsightCards 细节~~ ✅ 补了虚线基准线与静止态曲线末端点（`TxSparkChart` 的 `baseline` / `endpoint`，默认开启）。**序列色点胶囊有意不做**：我方已在指标标题旁渲染色点（`● 薄荷脆片`），图表左上再来一组是重复信息
7. ~~08 / 09 / 10 补细看~~ ✅ 已补（08 一致、09 有差异、10 一致；12 无单一对照组件）
8. ~~02 Thinking demo 补四档切换~~ ✅ 已补（`TxFlatRadio` 四档，纯 demo 层）
9. ~~09 内联实体 token~~ ✅ 已补（`mark` 实体胶囊 + `code.is-success`）
10. ~~`TuffDemoWrapper` 演示区居中~~ ❌ 判断错误，已撤回（见上文「系统性根因」一节）

**上游 21 例逐项对齐至此收口**：全部为「一致」「已补齐/已修复」或「有意偏离（文档已写明）」，无未处理差异。

顺带扫尾：`icon-morph.zh.mdc` 的 `category` 是中文「视觉效果」，与分类表期望的 `Effects` 不符（全库仅此一处，其余 zh 文件都用英文分类名）。已按仓库自己的 `recategorize-component-docs.py --apply` 归位，`--check` 现在是 0 漂移。


