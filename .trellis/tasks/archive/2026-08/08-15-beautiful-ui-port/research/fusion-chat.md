# Research: Beautiful UI → tuffex 融合分析（chat 簇：03 / 07 / 08）

- **Query**: 分析 03-streaming-text / 07-chat-composer / 08-prompt-bar 三个 MIT React 组件，与 tuffex 现有组件对照并给出融合方案
- **Scope**: internal（BUI 源码 + tuffex 源码 + nexus 文档），无外部检索
- **Date**: 2026-08-15
- **源码目录**: `/Users/talexdreamsoul/Workspace/Projects/talex-touch/.trellis/tasks/08-15-beautiful-ui-port/research/beautifului-src/`
- **tuffex 根**: `/Users/talexdreamsoul/Workspace/Projects/talex-touch/packages/tuffex/packages/components/src/`

> **纠正任务书里的一处前提**：08-prompt-bar 的 `<canvas>` **不是听写波形**。它是 `glimm` 着色器的一次性彩虹扫光（`playSweep`），只在选中 `sprinkles-5` 模型时触发；听写指示器是三根纯 CSS `eq-bounce` 条。详见 §3.1.6 / §3.1.7。

---

## 0. 共享底座：token、keyframes、单位换算

### 0.1 全部 keyframes（从 `_global.css` 解压缩提取，逐字）

```css
@keyframes shimmer-text { 0%{background-position:150%} to{background-position:-50%} }
@keyframes fade-up      { 0%{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes fade-in      { 0%{opacity:0} to{opacity:1} }
@keyframes eq-bounce    { 0%,to{transform:scaleY(.35)} 50%{transform:scaleY(1)} }
@keyframes stream-in    { 0%{opacity:0;filter:blur(4px)} to{opacity:1;filter:blur()} }
@keyframes caret-blink  { 0%,to{opacity:1} 50%{opacity:0} }
@keyframes pop-in       { 0%{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
@keyframes spin         { to{transform:rotate(1turn)} }
@keyframes pixel-on     { 0%,to{opacity:.15} 18%,42%{opacity:1} 62%{opacity:.15} }
```

本簇实际使用：`stream-in`、`fade-up`、`fade-in`、`pop-in`、`eq-bounce`。
**未使用**：`shimmer-text`、`caret-blink`（03 的光标另有实现，见 §1.1.3）、`spin`、`pixel-on`。

### 0.2 缓动常量（`_global.css` 自定义属性）

```
--ease-link:       cubic-bezier(.16,1,.3,1)
--ease-out:        cubic-bezier(0,0,.2,1)
--ease-in-out:     cubic-bezier(.4,0,.2,1)
--ease-out-strong: cubic-bezier(.23,1,.32,1)
--radius-control: 8px   --radius-chip: 6px   --radius-card: 10px
```

`cubic-bezier(0.23,1,0.32,1)`（即 `--ease-out-strong`）是本簇的主导缓动：菜单 pop-in、fade-up、滑动高亮、grid 折叠、气泡入场全部用它。**唯一例外**是 03 的逐词显影 `cubic-bezier(0.22,0.61,0.25,1)`。

### 0.3 颜色 token → tuffex CSS 变量映射

BUI 用一套 `--ink / --surface / --line / --accent` 语义层；tuffex 用 `--tx-*` 层。移植时的对照（tuffex 侧取自本次读到的组件实际写法）：

| BUI token | light | dark | tuffex 对应 |
|---|---|---|---|
| `--ink` | `#1f2124` | `#f2f3f4` | `--tx-text-color-primary`（默认 `#111827`） |
| `--ink-2` | `#62656b` | `#a5a8ad` | `--tx-text-color-secondary`（`#6b7280`） |
| `--ink-3` | `#9a9da3` | `#6c6f75` | `--tx-text-color-placeholder`（`#a8abb2`） |
| `--surface` | `#fff` | `#232427` | `--tx-fill-color-blank`（`#fff`） |
| `--canvas` | `#f1f2f3` | `#1c1d1f` | `--tx-bg-color` / 宿主页面底色 |
| `--inset` | `#f7f8f9` | `#1f2022` | `--tx-fill-color`（`#f0f2f5`）近似 |
| `--field` | `#f2f2f3` | `#2b2c2f` | `--tx-fill-color` |
| `--hover` | `#f4f5f6` | `#2a2b2e` | 无直接对应，tuffex 惯例是 `color-mix(in srgb, var(--tx-text-color-secondary) 10%, transparent)` |
| `--hover-2` | `#e7e9eb` | `#313236` | 同上，权重更高 |
| `--line` | `#ecedef` | `#2e3033` | `--tx-border-color-lighter`（`#e5e7eb`） |
| `--line-strong` | `#e0e2e5` | `#3a3c40` | `--tx-border-color`（`#dcdfe6`） |
| `--accent` / `--accent-ink` / `--accent-tint` | `#0285ff` / `#0170dd` / `#e9f3ff` | `#3d9aff` / `#7ec0ff` / `#3d9aff29` | `--tx-color-primary`（`#409eff`）+ `color-mix` 派生 |
| `--green` | `#189a4d` | `#3dbb72` | `--tx-color-success`（`#67c23a`） |
| `--shadow-hairline` | `0 0 0 1px var(--line)` | 同 | 无，需新增或内联 |
| `--shadow-card` | `0 0 0 1px var(--line),0 1px 2px #1018280a,0 2px 6px #10182808` | dark 版更重 | 无，需内联 |
| `--shadow-raised` | `0 0 0 1px var(--line),0 2px 10px #0000000b` | dark 版更重 | 无，需内联 |

**注意**：BUI 的阴影全部以 `0 0 0 1px var(--line)` 的 ring 打底（代替 border），tuffex 现有组件普遍用真 `border: 1px solid`。移植时若照搬 ring 会与相邻 tuffex 组件的边框对不齐（ring 不占布局盒，border 占）。

### 0.4 Tailwind v4 数值换算（`--spacing: .25rem`）

移植时会反复用到，先列清楚：

| Tailwind | px | 出现处 |
|---|---|---|
| `max-w-95` | 380 | 03 / 07 容器宽 |
| `max-w-105` | 420 | 08 容器宽 |
| `min-h-[15.5rem]` | 248 | 03 容器最小高 |
| `h-[288px]` | 288 | 07 卡片固定高 |
| `size-3` / `size-3.5` / `size-4` | 12 / 14 / 16 | 03 favicon 三档 |
| `h-4.5` | 18 | 03 引用 chip 高、07 input 最小高 |
| `size-5.5` | 22 | 08 菜单行图标槽 |
| `h-6.5` | 26 | 08 附件 chip 高 |
| `size-6` | 24 | 03 / 07 图标按钮 |
| `size-7` | 28 | 08 全部控件、07 发送键 |
| `h-7.5` | 30 | 08 模型菜单行 |
| `h-9` | 36 | 08 @// 菜单行 |
| `w-44` | 176 | 08 模型菜单宽 |

### 0.5 减少动效（reduced-motion）—— 移植的最大陷阱

`_global.css` 里只有两条：

```css
@media (prefers-reduced-motion:reduce){ .stream-caret{animation:none} .stream-tail{filter:none;mask-image:none} }
@media (prefers-reduced-motion:reduce){ *,:after,:before{
  transition-duration:.01ms!important; animation-duration:.01ms!important; animation-iteration-count:1!important } }
```

也就是说 **BUI 的三个组件本身几乎不处理 reduced-motion，全靠一条全局通杀规则**。tuffex **没有**这条全局规则——已读的 `TxSources` / `TxMessageActions` / `TxContextIndicator` / `TxStreamMarkdown` / `TxTypingIndicator` 全部各自写 `@media (prefers-reduced-motion: reduce)` 块。所以每一个移植过来的动画都必须自带 rm 分支，否则会静默丢失无障碍行为。

唯一的例外是 08 的 glimm 扫光：它在 JS 里显式 `window.matchMedia("(prefers-reduced-motion: reduce)").matches` 早退（`08-prompt-bar.tsx:251`），这是全簇唯一的显式检查。

另外，**JS 定时器不受 rm 规则约束**：03 的 55ms 逐词推进、07 的 500/1400/1200ms 阶段机、08 的 2200ms 听写落字，在 reduced-motion 下照样按原速跑。移植时如果把这些做成组件内部行为，需要自己判断。

---

## 1. 03-streaming-text

### 1.1 做什么 + 全量清单

一段"AI 答案流式显影"的完整落地形态：逐词从模糊中析出 → 行内引用 chip 弹入 → 全文完成后动作行与追问列表依次可用 → 循环重放。

#### 1.1.1 Props / 状态

**无 props**。全部自驱动：

```ts
const WORD_MS = 55;    // 每词间隔
const HOLD_MS = 3400;  // 完成后停留，然后 count 归 0 重播
const [count, setCount] = useState(0);
const [sourcesOpen, setSourcesOpen] = useState(false);
const done = count >= TOKENS.length;
```

`TOKENS` 由两句话 `.split(" ")` 拼成，中间插一个 `{ text: "", cite: true }` 标记位——引用 chip 就是靠这个哨兵 token 渲染的，它不占文本内容。

#### 1.1.2 DOM 结构

```
div.min-h-[15.5rem].w-full.max-w-95
├─ p.text-[13px].leading-relaxed.text-ink          ← 正文
│  ├─ span (逐词) × N  |  a.SourceChip (哨兵位)
│  └─ span (光标，!done 时)
├─ div.mt-2.flex.items-center.gap-0.5              ← 动作行（opacity 受 done 控制）
│  ├─ button.size-6 × 4  (copy / retry / thumb-up / thumb-down)
│  └─ button (来源堆叠 + "10 sources")
├─ div.grid  (gridTemplateRows 0fr↔1fr)            ← 来源展开面板
│  └─ div.overflow-hidden > div.rounded-[10px].bg-inset.p-1.shadow-hairline
│     └─ a × 3  (favicon + name.animated-underline + domain)
└─ div.mt-2.5                                       ← 追问区（opacity 受 done 控制）
   ├─ p.text-[12px].font-medium.text-ink-2  "Follow-ups"
   └─ button × 2
```

#### 1.1.3 动画逐条

| 元素 | 动画 | 精确参数 |
|---|---|---|
| 逐词 span | `stream-in` | `420ms cubic-bezier(0.22,0.61,0.25,1) both`，配 `[will-change:filter,opacity]`；`opacity 0 + blur(4px)` → `1 + blur()` |
| 引用 chip | `pop-in` | `250ms cubic-bezier(0.23,1,0.32,1) both` |
| 光标 | `fade-in` | `150ms ease-out both`。**不闪烁**——是 `h-3 w-0.5 rounded-full bg-ink` 的静态竖条，淡入后一直亮到 `done`。全局 `.stream-caret`（带 `caret-blink 1s step-end infinite`）本组件没用 |
| 动作行 / 追问区 | CSS transition | `transition-opacity duration-400`，`opacity` 与 `pointerEvents` 同时由 `done` 驱动 |
| 来源折叠 | CSS transition | `transition-[grid-template-rows,opacity] duration-300`，`cubic-bezier(0.23, 1, 0.32, 1)`；`gridTemplateRows: done && sourcesOpen ? "1fr" : "0fr"` |
| 追问按钮 | `fade-up` | `350ms cubic-bezier(0.23,1,0.32,1) ${i * 90}ms both`——90ms 阶梯 |
| 图标按钮 hover | transition | `duration-100`，`hover:bg-hover-2 hover:text-ink-2` |
| 引用 chip / 来源行 hover | transition | `duration-150`，`hover:bg-hover hover:text-ink` |
| 来源名下划线 | `.animated-underline` | `::after` `transform: scaleX(0→1)`，`transition: transform .28s var(--ease-link)`，触发条件是**父 `<a>` 的 hover / focus-visible** |

#### 1.1.4 消费的 token

`--ink` `--ink-2` `--ink-3` `--inset` `--hover` `--hover-2` `--surface` `--canvas` `--line` `--shadow-hairline`。**不用 `--accent`**——整个组件是纯灰阶，这是它质感的来源。

`--canvas` 只出现一次，在来源头像堆叠的描边里：`shadow-[0_0_0_1.5px_var(--canvas)]`，让重叠头像之间"挖"出与页底同色的缝。这是堆叠效果的关键，换成 `--surface` 在深色下会露白边。

#### 1.1.5 Canvas

无。

#### 1.1.6 源码里的两处事实，移植时不要照抄

- `SOURCES` 只有 3 条，按钮文案却写死 `10 sources`（`03-streaming-text.tsx:146`）。展开面板也只列 3 条。移植成 `labelFormatter(count)` 即可，不要保留字面量 10。
- `SourceChip()` 永远取 `SOURCES[0]`（`:51`），与哨兵 token 无关联——真实场景里引用 chip 必须携带自己的 source id。

### 1.2 与 tuffex 的重叠判定

| BUI 片段 | tuffex 对应 | 重叠程度 |
|---|---|---|
| 逐词模糊显影 | `stream-markdown/src/use-fresh-chunks.ts` + `.tx-stream-md__fresh` | **高，且 tuffex 更强** |
| 光标 | `TxStreamMarkdown` 的 `.tx-stream-md__cursor`（`showBlockCursor`） | 中，形态不同 |
| 4 个图标按钮 | `TxMessageActions`（`message-actions/src/TxMessageActions.vue`） | 高，缺点赞/点踩 |
| 来源折叠列表 | `TxSources`（`sources/src/TxSources.vue`） | **高，折叠技术完全一致** |
| 追问列表 | `TxSuggestionChips`（`suggestion-chips/src/TxSuggestionChips.vue`） | 数据同构，版式相反 |
| 行内引用 chip | **无** | 0 |
| 整体（正文+动作+来源+追问） | `TxAiMessage` 的 parts 管线 | 中 |

**逐词显影**（最值得说的一处）：

- BUI：渲染期按词切分，每个 `<span>` 挂 `animation: stream-in 420ms cubic-bezier(0.22,0.61,0.25,1) both`，`0% {opacity:0; filter:blur(4px)}`。
- tuffex：`createFreshChunks`（`use-fresh-chunks.ts:42`）按**字符 offset + 到达时间**登记 chunk，每次 DOM patch 后用 `TreeWalker` + `splitText` 重新包裹仍在动画中的区间，并用**负 `animation-delay`** 让动画从被打断处续播（`:107`）。动画本身：`tx-stream-md-fresh 0.44s cubic-bezier(0.22, 1, 0.36, 1) both`，`from { opacity: 0.08; filter: blur(5px) }`，`55% { opacity: 1 }`。

两者时长（420 vs 440ms）与模糊量（4 vs 5px）几乎同级。差别在于 tuffex 的实现能扛住 `v-html` 整块重写（markdown 解析器回改已输出内容的情况），而 BUI 的做法在纯文本 token 流之外不成立。文件头注释明确记录了"per-delta 整体重渐显"方案已被弃用。**结论：不要移植 BUI 的逐词机制，tuffex 侧是超集。**

**来源折叠**：两边都用 `grid-template-rows: 0fr → 1fr` + 内层 `overflow: hidden`。BUI `duration-300 cubic-bezier(0.23,1,0.32,1)`，tuffex `0.26s cubic-bezier(0.4, 0, 0.2, 1)`（`TxSources.vue:135`）。同一手法，只差参数。

**TxSources 与 BUI 来源面板的实际差异**：

- 头部：tuffex 是地球图标 + `Used N sources` + chevron；BUI 是 3 张 favicon 叠成一摞 + `10 sources`，且它就长在动作行里，不是独立行。
- 行内：tuffex 有序号 `ordinal`、`domainOf()` 自动从 URL 取 hostname 并剥 `www.`、favicon 加载失败降级（`failedIcons`）；BUI 有 `.animated-underline` 悬停下划线、domain 用等宽字体右对齐。
- 导航：tuffex `onOpen` 里 `event.preventDefault()` 后 `emit('open', source)`，**链接自己不跳转，宿主决定**（`TxSources.vue:48`）；BUI 是裸 `target="_blank"`。tuffex 这个契约在 Electron 宿主里是必须的，不能因为对齐视觉而回退。

**TxSuggestionChips 与 BUI 追问区**：数据都是 `AiSuggestion { id, text }`（`ai-elements/src/types.ts:88`），但版式是两个方向——tuffex 是横向 pill 行 + 两端遮罩渐隐（`mask-image: linear-gradient(to right, transparent, #000 12px, ...)`）；BUI 是纵向列表、每行 `border-b border-line`、行首一个 11×11 回车折返箭头、90ms 阶梯 fade-up。

**行内引用 chip**：tuffex 全无对应。`grep -rn "mention"` 在整个 components/src 下 0 命中，也没有任何"文本流中嵌入可点引用"的组件。这是本组件唯一的真空白。

### 1.3 融合建议

**推荐 (c) 现有原语组合 + 一个新的小组件。**

1. **整体 → nexus demo**，组合 `TxStreamMarkdown`（或 `TxAiMessage`）+ `TxMessageActions` + `TxSources` + `TxSuggestionChips`。四块里三块已有，且 tuffex 版本在无障碍（roving toolbar ARIA）、安全（remote image policy、DOMPurify）、宿主控制（`open` 事件不自跳转）上都更完整。做成单体组件等于把这三块的能力重新实现一遍且更弱。

2. **新增 `TxInlineCitation`**（目录 `inline-citation/`）——BUI 的 `SourceChip`。这是真正的空白：正文流中的行内可点引用，需要 `pop-in` 入场、`--inset` 底 + hairline ring、等宽 domain、baseline 微调（`translate-y-[-1px]` + `align-middle`）。它同时是 `TxStreamMarkdown` 未来支持 `[^1]` 式引用渲染的落点。

3. **两处 variant 扩展**（不新建组件）：
   - `TxSources` 增加 `variant?: 'list' | 'stack'`：`stack` 时头部渲染 favicon 堆叠（`-space-x-1` + `shadow: 0 0 0 1.5px <canvas>`）替代地球图标。`labelFormatter` 已存在，`10 sources` 这类文案直接由它出。
   - `TxSuggestionChips` 增加 `layout?: 'row' | 'list'`：`list` 时纵向、带 `border-b`、行首折返箭头、`fade-up` 90ms 阶梯。数据类型不变。

**被否掉的备选**：

- (a) 新建单体 `TxStreamingAnswer`：把正文/动作/来源/追问的版式焊死，宿主想换任一块都得 fork；且重复实现 `TxMessageActions` 的 roving toolbar 与 `TxSources` 的 favicon 降级。
- (b) 做成 `TxAiMessage` 的 variant：`TxAiMessage` 是 parts 驱动的（`AiMessagePart` 联合类型），把"动作行 + 追问"塞进去要动 parts 契约，影响面远超收益。它现在把 `sources` 渲染成独立 part 块，而 BUI 是折进动作行的——这是版式差异，属于 demo 层。
- 单独建 `TxFollowUpList`：与 `TxSuggestionChips` 数据完全同构（`AiSuggestion`），一个 `layout` prop 就够，不值得新目录。

### 1.4 Vue 移植 API 草案

```ts
// inline-citation/src/types.ts
export interface InlineCitationProps {
  /** 引用目标；与 ai-elements 的 AiSourceItem 复用，不新造类型 */
  source: AiSourceItem
  /** 显示文本；默认从 source.url 取 hostname 并剥 www. */
  label?: string
  /** 入场动画，列表重放时置 false 避免整段重弹 */
  appear?: boolean          // @default true
}
export interface InlineCitationEmits {
  /** 与 TxSources 一致：组件不自行导航，宿主决定 */
  (e: 'open', source: AiSourceItem): void
}
```

```vue
<!-- 用法 -->
<TxInlineCitation :source="s" @open="openInBrowser" />
```

- **slots**：`default`（覆盖 label 文本）、`icon`（覆盖 favicon）。
- **exposed**：无。这是叶子组件。
- **受控性**：全无内部状态，纯受控。
- 无障碍：渲染为 `<a :href="source.url">` 但 `@click.prevent` + emit，与 `TxSources.onOpen` 同构；favicon `alt="" aria-hidden`，失败时降级为不渲染（复用 `TxSources` 的 `failedIcons` 思路）。

variant 扩展的类型增量：

```ts
// TxSources 新增
variant?: 'list' | 'stack'   // @default 'list'
// TxSuggestionChips 新增
layout?: 'row' | 'list'      // @default 'row'
```

两者都是**加默认值的可选 prop**，现有 demo 与文档（`sources.zh.mdc` / `suggestion-chips.zh.mdc`）的契约不受影响。

### 1.5 移植风险

| 风险 | Vue 侧对应做法 |
|---|---|
| **流式模拟钩子**（`useEffect` + `setTimeout` 自循环） | 不进组件。demo 里用 `@vueuse/core` 的 `useIntervalFn`（tuffex 已依赖 `@vueuse/core ^14.4.0`），或 `watch` + 第三参 `onCleanup`。组件侧只暴露 `content` / `streaming` 受控 prop |
| **`animation: ... both` 在 v-for 复用节点上不重播** | 循环重置 `count=0` 时 Vue 会复用 DOM 节点，`both` 填充模式下动画不会重跑。`:key` 必须带一个 generation 计数（`` `${gen}-${i}` ``），或用 `<TransitionGroup>` |
| **`will-change: filter, opacity` 逐词施加** | 长文本会创建成百上千个合成层。tuffex 的 `createFreshChunks` 只包裹**仍在动画窗口内**的 chunk（`t - chunk.t0 < duration`，`use-fresh-chunks.ts:82`），过期即 unwrap。移植时沿用这个"只包活的"策略 |
| **无 reduced-motion 分支** | 每个新增 keyframe 都要配 `@media (prefers-reduced-motion: reduce)`（tuffex 惯例，见 `TxSources.vue:202`、`TxMessageActions.vue:266`） |
| **`.animated-underline` 依赖父 `<a>` 的 hover** | Vue scoped style 下 `a:hover .x::after` 的选择器要落在同一 scope，或把伪元素挂到 `<a>` 自身 |

---

## 2. 07-chat-composer

### 2.1 做什么 + 全量清单

一个带标签页的聊天面板：头部 tabs + 三个操作图标，中部固定高度的会话区（用户气泡 + 两段推理式回复），底部一个紧凑 composer。发送后回放一次回复序列。

#### 2.1.1 Props / 状态

**无 props**。状态：

```ts
type Phase = "idle" | "sent" | "reply1" | "reply2" | "done";
const [phase, setPhase] = useState<Phase>("done");   // 初始就是 done：静置时展示完成态
const [draft, setDraft] = useState("");
const [submitted, setSubmitted] = useState("Compare mint chip to last summer");
const [tab, setTab] = useState("Flavors");
```

阶段机时长：`sent →500ms→ reply1 →1400ms→ reply2 →1200ms→ done`（`07-chat-composer.tsx:56-58`）。

#### 2.1.2 DOM 结构

```
div.h-[288px].max-w-95.rounded-[14px].bg-surface.shadow-card.overflow-hidden
├─ header  .border-b.border-line.p-1.5
│  ├─ tabs: button × 2  .rounded-[6px].px-2.py-[3px].text-[13px]
│  └─ actions: button.size-6 × 3  (plus / clock / ellipsis)
├─ conversation  .flex-1.min-h-0.overflow-y-auto.px-3.pt-2.5.pb-1.gap-2.5
│  ├─ 用户气泡（右对齐，.pl-14 留出左侧空白）
│  └─ Section × 0..2
└─ composer  .mt-auto.shrink-0.p-1.5
   └─ div.rounded-control.border.border-line.bg-field.p-2.5  (role="presentation", click → input.focus)
      ├─ input  (注意：是 <input> 不是 <textarea>)
      └─ div.flex.justify-end > button.size-7 发送
```

注释里点明会话区是"fixed region so the card never changes shape"（`:111`）——卡片高度写死 288px，回复增长只让内部滚动。

#### 2.1.3 动画逐条

| 元素 | 参数 |
|---|---|
| tabs 切换 | `transition-[background-color,opacity] duration-100`；active `bg-field`，inactive `opacity-50 hover:opacity-75`；带 `aria-pressed` |
| 头部图标 hover | `transition-colors duration-100`，`hover:bg-hover hover:text-ink-2` |
| 用户气泡入场 | `transition-[opacity,transform] duration-300 cubic-bezier(0.23,1,0.32,1)`，`translateY(10px) → 0` |
| Section 入场 | `animation: fade-up 400ms cubic-bezier(0.23,1,0.32,1) both` |
| **Section "resolving" 态** | `transition-[opacity,filter,transform] duration-400 cubic-bezier(0.23,1,0.32,1)`；`opacity 0.55` / `filter blur(0.5px)` / `transform scale(0.985)` / `transformOrigin: top left` |
| composer 聚焦 | `transition-[border-color,box-shadow] duration-150`；`focus-within:border-line-strong`，阴影从 `0 1px 2px rgba(0,0,0,0.035)` → `0 1px 2px rgba(0,0,0,0.025)`（**变浅**，反直觉但确实如此） |
| 发送键 | `transition-[background-color,color,transform] duration-200`，`enabled:active:scale-[0.96]`；`background: canSend ? var(--ink) : var(--line-strong)`，`color: canSend ? var(--surface) : var(--ink-2)` |

**"resolving" 是本组件唯一的原创手法**：`reply2` 阶段时第二个 Section 处于"还没定稿"状态——半透明 + 0.5px 微模糊 + 缩到 98.5%，`transformOrigin: top left` 让它像是从左上角"还没长实"。400ms 后转 `done` 时这三者同时归位。0.5px 的模糊量是刻意的：够让文字发虚，又不到能看出是模糊的程度。

#### 2.1.4 消费的 token

`--surface` `--field` `--line` `--line-strong` `--ink` `--ink-2` `--ink-3` `--shadow-card` `--radius-control`。同样不用 `--accent`。

#### 2.1.5 Canvas

无。

### 2.2 与 tuffex 的重叠判定

**逐块比对，没有一块是 tuffex 缺的：**

| BUI 片段 | tuffex 对应 | 说明 |
|---|---|---|
| 头部 tabs | `TxTabs` / `TxTabBar` / `TxSegmentedSlider` | 三选一 |
| 头部图标行 | `TxIconButton` | 直接可用 |
| 会话滚动区 | `TxConversationStream` | tuffex 版更强：虚拟滚动 + `useStickToBottom` + `loadOlder` 上翻加载 + `tweenToBottom` |
| 用户气泡 | `TxChatMessage` / `TxAiMessage`（`role: 'user'`） | `TxAiMessage` 的 user 态已有右对齐 + primary 色调气泡 |
| **Section（label + sub + "for 4s" + body）** | **`AiChainStep` / `TxChainOfThought`** | **数据形状几乎逐字对应** |
| composer | `TxChatComposer` | 已存在，见下 |

`AiChainStep`（`ai-elements/src/types.ts:97`）：

```ts
export interface AiChainStep {
  id: string
  kind: 'thinking' | 'tool'
  title: string          // ← BUI 的 label "Sales History"
  body?: string          // ← BUI 的 body
  status: 'active' | 'done' | 'error'
  durationMs?: number    // ← BUI 的 "for 4s"
}
```

`sub`（"Flavor Data" / "Trend Detection"）在 tuffex 侧没有直接字段，但 `kind` 承载了同类语义。

**composer 的实质差异**（这条决定 §3 的走向）：

`TxChatComposer`（`chat/src/TxChatComposer.vue`）是**块状** composer——`border-radius: 16px`、`padding: 12px`、内嵌一个 `minRows: 3` 的 textarea（`resize: vertical`）、下方一行 `TxButton` 文字按钮（`sendButtonText: 'Send'`）。BUI 的是**条状**——单行 `<input>`、`--radius-control`(8px)、右下角一个 28px 方形箭头图标键。

而且 **`TxChatComposer` 没有自动高度**：textarea 只有 `:rows="minRows"` 和 `max-height: calc(var(--tx-chat-composer-max-rows) * 1.6em)`（`:324`），没有任何 JS 撑高逻辑，靠 `resize: vertical` 让用户手动拉。这是一处真实能力缺口，08 会再次撞上。

反过来，`TxChatComposer` 在 BUI 之外多出的能力：粘贴与拖放文件入料（`onPaste` / `onDrop` → `attachmentAdd`，含 `dragDepth` 计数防闪烁）、`submitting` 态、`sendOnMetaEnter` 双模式、IME `isComposing` 保护、`ariaLabel` 回退、四个作用域插槽。

### 2.3 融合建议 —— **判定：这是 showcase 组合，不是组件**

**推荐：做成 nexus demo，不新增 tuffex 组件。**

理由：

1. 拆开后每一块都已有 tuffex 对应物（上表 6/6 命中），组件化只会把一套具体版式（288px 固定高、两个写死的 tab、右对齐气泡）焊进库里。
2. 它的"组件感"来自 288px 定高卡片这个**版式决策**，而版式决策属于宿主。tuffex 现有的 AI 组件（`TxAiConversation`、`TxConversationStream`）刻意都不定高。
3. 阶段机（`idle→sent→reply1→reply2→done`）是**演示脚本**，不是组件行为。真实宿主的回复由后端流决定。

**demo 落点**：`apps/nexus/app/components/content/demos/`，命名遵循现有惯例 `<Component><DemoName>Demo.vue`（现有如 `ChatChatListDemo.vue`、`AiElementsAiConversationDemo.vue`），建议 `ChatChatPanelDemo.vue`，组合 `TxTabs` + `TxIconButton` + `TxAiMessage` + `TxChainOfThought` + `TxChatComposer`。注册链路是 `demo-registry.ts` → `TuffDemoWrapper`。

**唯一值得往上游提的一个点**：`resolving` 视觉配方（`opacity .55 / blur(0.5px) / scale(.985) / transform-origin: top left / 400ms --ease-out-strong`）。它表达的是"这一步已产出但尚未定稿"，比 `status: 'active'` 的常见做法（转圈/闪烁）安静得多。

处置建议：**先留在 demo 的局部样式里并把参数写进注释**，不要立刻改 `AiChainStep` 的 `status` 联合类型。理由是加一个 `'settling'` 成员会波及 `TxChainOfThought`、`TxAiMessage`、以及已 `verified: true` 的相关文档契约，而目前只有一个用例。若后续第二个用例出现，再提升为正式状态。

**备选方案与否决理由**：

- (a) 新建 `TxChatPanel`：见理由 1、2。
- (b) 做成 `TxAiConversation` 的 variant：`TxAiConversation` 只管消息列表，不管 tabs/composer，套进来等于让它变成布局容器。

### 2.4 Vue 移植 API 草案

由于判定为 demo，这里给的是**组合骨架**而非组件 API：

```vue
<script setup lang="ts">
import type { AiChainStep, AiElementMessage } from '@talex-touch/tuffex'
import { ref, watch } from 'vue'

const tab = ref('Flavors')
const draft = ref('')
const phase = ref<'idle' | 'sent' | 'reply1' | 'reply2' | 'done'>('done')

// React useEffect + setTimeout 的 Vue 对应：watch 的第三参 onCleanup
watch(phase, (value, _old, onCleanup) => {
  const next = { sent: ['reply1', 500], reply1: ['reply2', 1400], reply2: ['done', 1200] }[value]
  if (!next) return
  const timer = setTimeout(() => { phase.value = next[0] }, next[1])
  onCleanup(() => clearTimeout(timer))
})
</script>

<template>
  <div class="chat-panel">                      <!-- 定高 288px 由 demo 自己写 -->
    <TxTabs v-model="tab" :items="['Flavors', 'Suppliers']" />
    <div class="chat-panel__body">
      <TxAiMessage :message="userMessage" />
      <TxChainOfThought :steps="steps" />
    </div>
    <TxChatComposer v-model="draft" :min-rows="1" :send-on-meta-enter="false" @send="onSend">
      <template #toolbar="{ send, disabled }">
        <TxIconButton :disabled="disabled" @click="send" />
      </template>
    </TxChatComposer>
  </div>
</template>
```

注意 `#toolbar` 插槽会**整体替换**默认操作行（`TxChatComposer.vue:227`），这正是把文字 Send 按钮换成方形箭头键的官方口子——不需要改组件。

### 2.5 移植风险

| 风险 | Vue 侧做法 |
|---|---|
| 阶段机的 `useEffect` 清理 | `watch(phase, (v, _, onCleanup) => ...)` 或 `useTimeoutFn`（`@vueuse/core`），组件卸载自动清 |
| `<input>` vs `<textarea>` | `TxChatComposer` 只有 textarea。设 `:min-rows="1"` 得到单行外观，但**没有 autosize**——多行输入会出现原生 resize 手柄。这是已知缺口，与 §3.5 同一条 |
| `role="presentation"` + `onClick → input.focus()` | Vue 里直接 `@click="textareaRef?.focus()"`。但 `role="presentation"` 挂在可点击 div 上是有争议的写法；tuffex 惯例（`TxSources` / `TxMessageActions`）是让可交互元素本身是 `<button>` / `<a>`。移植时建议改成 `<label>` 包裹，语义更正 |
| tabs 用 `aria-pressed` | BUI 用 `aria-pressed` 表示 tab 选中态；`TxTabs` 若已实现 `role="tab"` + `aria-selected`，以 tuffex 为准，不要回退到 `aria-pressed` |
| 定高卡片 + `overflow-y-auto` | 若换成 `TxConversationStream`，它自带虚拟滚动与 stick-to-bottom，要把外层的 `flex-1 min-h-0` 交给它，不要双层滚动容器 |

---

## 3. 08-prompt-bar（最大，~28KB）

### 3.1 做什么 + 全量清单

一个"真能用"的 composer 条：附件、`@` 数据源菜单、`/` 命令菜单、模型选择器、听写、发送。带自演示脚本，任意指针/键盘交互即交还控制权。

#### 3.1.1 Props

```ts
export default function PromptBar({ variant = "Rounded" }: { variant?: string })
const pill = variant === "Pill";
```

**只有这一个 prop**。截图底部的 `Rounded | Pill` 开关是 beautifului.dev 站点自己的 variant 切换器，不属于组件。

`pill` 影响 6 处：composer 外框圆角、附件 chip 圆角、chip 删除键圆角、+ 键 / 模型键 / 听写键 / 发送键的圆角、附件区左内边距（`px-1` vs `px-0.5`）。

```
Rounded: composer rounded-[14px]，控件 rounded-[8px]，chip rounded-chip(6px)
Pill:    composer rounded-full，但 attachments.length > 0 || expanded 时降为 rounded-[24px]
         控件全 rounded-full，chip rounded-full
```

#### 3.1.2 状态（16 个 state + 8 个 ref）

```ts
draft, dismissed, plusOpen, modelOpen, model, attachments, connected,
active, listening, auto, autoStep, expanded, rowBox, engaged, modelBox, modelHovered
controlsRef, inputRef, measureRef, modelRef, rowRefs, modelRowRefs, glimmRef, shaderRef, sweepingRef
```

数据常量：`SOURCES`（7 条：1 条附件行 + 3 条内置源 + 3 条品牌集成 figma/slack/gmail，gmail 带 `connect: true`）、`COMMANDS`（5 条）、`MODELS`（3 条）、`FILES`（3 个假文件名）、`DICTATION`（一句假转写）。

#### 3.1.3 Token 解析（`@` / `/` 的核心）

```ts
function parseToken(draft: string): { kind: "at" | "slash"; query: string; start: number } | null {
  const match = /(^|\s)([@/])([\w-]*)$/.exec(draft);
  if (!match) return null;
  return { kind: match[2] === "@" ? "at" : "slash", query: match[3].toLowerCase(),
           start: match.index + match[1].length };
}
```

规则：只认**末尾**的 token；必须在字符串开头或空白之后；query 只吃 `[\w-]`。`start` 加回前导空白的长度，指向 `@` / `/` 本身。

菜单归并与过滤：

```ts
const menu = plusOpen ? "at" : token?.kind ?? null;       // + 按钮强制打开 at 菜单
const query = plusOpen ? "" : token?.query ?? "";
rows = menu === "at"    ? SOURCES.filter(s => s.name.toLowerCase().includes(query))   // 子串
     : menu === "slash" ? COMMANDS.filter(c => c.name.slice(1).startsWith(query))     // 前缀
     : [];
```

注意两种菜单的匹配策略**不同**：源用 `includes`，命令用 `startsWith`（且先剥掉 `/`）。

`dismissed`：按 Esc 置 true，抑制 token 菜单，直到下一次 `onChange` 复位（`:567`）。这样 Esc 关掉后光标停在 `@` 后面也不会立刻重开。

#### 3.1.4 滑动高亮（两处，同一手法）

不是每行各自切换背景，而是**一条绝对定位的高亮条滑到目标行**：

```tsx
<span aria-hidden className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
  style={{
    top: rowBox?.top ?? 0, height: rowBox?.height ?? 0,
    opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
    transition: "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
  }} />
```

位置由 `useLayoutEffect` 从 `rowRefs.current[active]` 读 `offsetTop` / `offsetHeight` 得到（`:199-202`）。

`engaged` 门控是细节所在：高亮**只在用户 hover 过某行或按过方向键之后才出现**（`onMouseEnter` 或 ArrowDown/Up 时置 true，`onMouseLeave` 容器时置 false，menu/query 变化时复位）。所以菜单刚弹出时没有任何选中态——避免"第一项被预选"的误导。

模型菜单同构，但目标是 `modelRowRefs.current[modelHovered ?? modelIndex]`，即 hover 优先、否则回落到当前选中项，`opacity` 只在 `modelHovered !== null` 时为 1。

#### 3.1.5 菜单外观

| | @// 菜单 | 模型菜单 |
|---|---|---|
| 定位 | `absolute inset-x-0 bottom-full z-10 mb-2` | `absolute right-0 bottom-full z-10 mb-2 w-44` |
| 容器 | `rounded-[10px] bg-surface p-1 shadow-raised` | 同 |
| 入场 | `pop-in 180ms cubic-bezier(0.23,1,0.32,1) both`，`transformOrigin: bottom center` | 同，`transformOrigin: bottom right` |
| 行高 | `h-9`(36px)，`gap-2.5 px-2` | `h-7.5`(30px)，`gap-2 px-2` |
| 行内容 | 图标槽 `size-5.5` + name `text-[12.5px] font-medium text-ink` + desc `flex-1 truncate text-[12px] text-ink-3` + 可选 connect | name `truncate text-[12.5px] font-medium` + tag `text-[11px] text-ink-3` + 勾（`invisible` 占位） |
| 空态 | `h-9 px-2 text-[12px] text-ink-3` — `No matches for "{query}"` | 无 |
| 页脚 | `mt-1 border-t border-line px-2 pt-1.5 pb-1 text-[11px] text-ink-3` — "Type to search sources & files" / "Type to search commands" | 无 |

菜单**向上生长**（`bottom-full`），因为 composer 贴在底部。整个 `relative` 锚点是 composer 的包裹 div（`:368`），不是页面。

connect 副操作：`text-[12px] font-medium`，未连 `text-accent-ink hover:underline`，已连 `text-green`；点击 `stopPropagation` 以免触发行的 `pick`（`:418-421`）。

**每一行都有 `onMouseDown={(e) => e.preventDefault()}`**（`:397`、`:469`）——阻止鼠标按下时抢焦点，让 textarea 始终保有光标。移植时这条极易漏，漏了就会出现"点菜单后光标消失"。

#### 3.1.6 Canvas —— glimm 彩虹扫光（**不是波形**）

```tsx
import { createShader, playSweep, accentChain, ACCENTS } from "glimm";
const RAINBOW = accentChain([ACCENTS.red, ACCENTS.orange, ACCENTS.yellow,
                             ACCENTS.green, ACCENTS.cyan, ACCENTS.blue, ACCENTS.purple]);
```

```tsx
<canvas ref={glimmRef} aria-hidden="true"
  className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
  style={{ borderRadius: "inherit" }} />
```

触发条件：`selectModel(next)` 且 `next.key === "sprinkles-5"`（升级到旗舰模型）才 `celebrate()`。参数：

```ts
playSweep(shader, { palette: RAINBOW, direction: "ltr", sweepMs: 950, outroMs: 130,
                    peakAlpha: 1.3, bandTight: 10, brightness: 1.4, swellAmount: 1,
                    waveSpeed: 1.3, easing: "easeOutExpo" })
```

三个实现细节写在注释里：

1. **`Math.random` 猴补丁**（`:220-236`）：`createShader` 用 `Math.random()` 播种 `hueShift`，导致每次刷新颜色不同；作者临时把 `Math.random = () => 0` 再还原，把色相钉死。
2. **每次扫光重建 shader**（`:254-256`）：为了让 `uTime` 归零，色相相位每次一致。
3. **显式 reduced-motion 早退**（`:251`）+ `sweepingRef` 防重入。

以及 `<canvas>` 必须写死 `h-full w-full`——replaced element 不会被 `inset-0` 撑开，否则会反馈进 shader 的 ResizeObserver（`:493-495` 注释）。

**`glimm` 不在本仓库任何 package.json 里**（已 grep 确认 0 命中）。移植需引入新外部依赖。

#### 3.1.7 听写指示器 —— 纯 CSS，无 canvas

```tsx
<span className="flex h-3.5 items-center gap-[2.5px]">
  {[0, 1, 2].map((i) => (
    <span key={i} className="w-[2.5px] rounded-full bg-current"
      style={{ height: "100%", animation: `eq-bounce 900ms ease-in-out ${i * 150}ms infinite` }} />
  ))}
</span>
```

按钮态：`listening` 时 `bg-accent-tint text-accent-ink`，否则 `text-ink-3 hover:bg-hover hover:text-ink`；placeholder 切成 `"Listening…"`；2200ms 后把 `DICTATION` 追加到 draft（`current ? \`${current.trimEnd()} ${DICTATION}\` : DICTATION`）、关闭 listening、`inputRef.current?.focus()`。

#### 3.1.8 Textarea 自动高度 + 网格重排

两段逻辑在同一个 `useLayoutEffect`（`:310-331`）：

**（a）是否需要独占整行**——用一个隐藏测量 span：

```tsx
<span ref={measureRef} aria-hidden="true"
  className="pointer-events-none absolute invisible whitespace-pre text-[13px] leading-[18px]">{draft}</span>
```

```ts
const fixedControlsWidth = 28 * 3 + modelButton.offsetWidth;   // +键 / 听写 / 发送 = 3×28，加模型键实测宽
const inlineGaps = 4 * 4;                                      // 4 个 gap × 4px
const inlineInputWidth = controls.clientWidth - fixedControlsWidth - inlineGaps;
const needsFullWidth = draft.includes("\n") || measure.offsetWidth + 8 > inlineInputWidth;
```

**（b）高度**——经典三步：

```ts
input.style.height = "0px";
const contentHeight = input.scrollHeight;
input.style.height = `${Math.min(Math.max(contentHeight, 28), 100)}px`;   // min 28, max 100
input.style.overflowY = contentHeight > 100 ? "auto" : "hidden";
```

**网格重排**：

```
collapsed: grid-cols-[28px_minmax(0,1fr)_auto_28px_28px]      全部 row-start-1
expanded:  grid-cols-[minmax(0,1fr)_auto_28px_28px]
           textarea → col-span-full col-start-1 row-start-1（独占首行）
           + 键 → col-start-1 row-start-2 ；模型 → col-start-2 row-start-2
           听写 → col-start-3 row-start-2 ；发送 → col-start-4 row-start-2
```

每个控件在两种模式下都写了显式 `col-start-N row-start-N`——不是靠流式排布。容器 `grid items-end gap-x-1 gap-y-1.5`。

#### 3.1.9 键盘路由（`onKeyDown`，优先级从上到下）

```
菜单开且有行时：
  ArrowDown/Up  → preventDefault; engaged = true; active = (active + (down ? 1 : rows.length - 1)) % rows.length
  Enter(无shift) / Tab → preventDefault; pick(rows[active])
Escape → dismissed = true; closeMenus()
Enter(无shift 且 !isComposing) → preventDefault; send()
```

`(current + (down ? 1 : rows.length - 1)) % rows.length` 是不用负数取模的循环写法。

#### 3.1.10 附件

`pick()` 命中 `source.attach` 时：`setAttachments(cur => [...cur, FILES[cur.length % FILES.length]])`，并把 token 从 draft 里切掉（`draft.slice(0, token.start)`）。

chip：`h-6.5 bg-field py-1 pr-1 pl-1.5 text-[11.5px] text-ink-2 shadow-hairline`，`pop-in 200ms cubic-bezier(0.23,1,0.32,1) both`；文件名 `max-w-36 truncate`；删除键 `size-4`，`hover:bg-line/70 hover:text-ink`，`transition-colors duration-100`。

`pick()` 的三个分支（`:338-351`）：附件 → 加附件并删 token；`menu === "at"` → `draft.slice(0, token.start) + "@" + row.name + " "`；否则（slash）→ `draft.slice(0, token.start) + row.name + " "`（命令名自带 `/`）。

#### 3.1.11 自演示与交还控制

`AUTO_STEPS` 14 步脚本，走一遍 @ 菜单 → / 菜单 → 模型选择器升级到旗舰（触发彩虹）。

```tsx
const takeOver = (event: { target: EventTarget | null }) => {
  setAuto(false);
  if (auto && event.target === inputRef.current) setDraft("");
};
// 挂在最外层 div：onPointerDownCapture={takeOver} onKeyDownCapture={takeOver}
```

用 capture 阶段确保先于任何子处理器触发；若用户点的正是输入框，顺手清掉演示遗留的草稿。

#### 3.1.12 消费的 token

`--surface` `--line` `--line-strong` `--hover` `--field` `--ink` `--ink-2` `--ink-3` `--accent-ink` `--accent-tint` `--green` `--shadow-card` `--shadow-raised` `--shadow-hairline` `--radius-chip`。本簇唯一用到 accent 色的组件（听写激活态 + connect 链接）。

#### 3.1.13 动画使用

`pop-in`（两个菜单 180ms + 附件 chip 200ms）、`eq-bounce`（听写 900ms ease-in-out 150ms 阶梯 infinite）。**未用** stream-in / fade-up / fade-in / shimmer-text / caret-blink / spin / pixel-on。

### 3.2 与 tuffex 的重叠判定

#### 3.2.1 vs `TxChatComposer`

**重叠**：`modelValue` 受控草稿、placeholder、disabled、发送门控（`canSend` 逻辑同构：文本 trim 非空 **或** 有附件）、Enter 发送、附件 chip 展示、IME 保护。

**`TxChatComposer` 已有而 BUI 没有的**：粘贴/拖放文件入料（`onPaste` 抽 `item.kind === 'file'`、`onDrop` + `dragDepth` 计数）、`submitting` 与 `allowAttachmentWhileSubmitting`、`sendOnMetaEnter` 双模式、`ariaLabel` 回退到 placeholder、四个作用域插槽（`attachments` / `toolbar` / `toolbar-left` / `actions` / `footer`）。

**BUI 有而 `TxChatComposer` 完全没有的六项**：

1. textarea 自动高度（`TxChatComposer` 只有 `max-height` 上限 + `resize: vertical`）
2. 控件内联进输入框（tuffex 是输入框上下分离的块结构）
3. `@` / `/` token 菜单
4. 模型选择器
5. 听写
6. Rounded / Pill 变体与 expanded 网格重排

#### 3.2.2 各子系统的 tuffex 对应

| BUI 子系统 | tuffex 现状 |
|---|---|
| `@` / `/` 菜单定位 | `TxBaseAnchor` 用 `@floating-ui/vue`（`arrow/autoUpdate/flip/offset/shift/size/useFloating`，`Teleport to="body"`）；`TxPopover` / `TxDropdownMenu` 建在它之上 |
| 菜单的键盘与 ARIA | `TxSearchSelect` 是最接近的先例：`role="combobox"` + `aria-haspopup="listbox"` + `aria-autocomplete="list"` + `aria-activedescendant`，`activeIndex` 从 -1 起（不预选，与 BUI 的 `engaged` 门控同一意图） |
| `TxCommandPalette` | **形态不对**：它是居中模态、自带搜索输入框、`role="dialog"`。BUI 的菜单没有自己的输入框，查询来自宿主 textarea 的尾部 token |
| 滑动高亮条 | **无先例**。grep 只在 `TxSegmentedSlider.vue:198` 找到一个 `translateX(-50%)`，是居中而非跟随 |
| 附件 chip | `TxAttachmentTray` / `TxAttachmentChip` —— **比 BUI 强**：`formatSize`、上传进度百分比、`uploading` 虚线态、取消/删除双态、`open` 事件 |
| 模型选择器 | `TxDropdownMenu` + `TxFlatDropdown` 可拼 |
| 听写 eq-bounce | **`TxTypingIndicator` 的 `bars` variant 几乎逐字对应**：`tx-typing-bars-pulse 0.92s ease-in-out infinite`、`0%,100% { scaleY(0.35) }` / `45% { scaleY(1) }`、`nth-child(2/3)` 延迟 0.12s / 0.24s、条宽 `max(2px, size/6)`、`transform-origin: center bottom`。BUI 是 900ms、50% 峰值、150ms 阶梯、2.5px 宽。**同一动画的两次独立实现** |
| glimm 彩虹扫光 | 无。tuffex 有 `gsap ^3.15.0`、`TxGlowText`、`TxThinkingOrb`、`TxKeyframeStrokeText`，但没有 WebGL 着色器管线 |
| 键盘提示（↑↓ Enter） | `TxKbd` |

### 3.3 融合建议

**推荐 (a)：新建 `TxPromptBar`（目录 `prompt-bar/`），而不是给 `TxChatComposer` 加 variant。**

**理由**：

1. **契约冲突**。`TxChatComposer` 的 `toolbar` 插槽契约是"**替换**默认操作行"（`TxChatComposer.vue:227`，文档 `chat-composer.zh.mdc` 的交互契约里明写）。PromptBar 的控件是**内联进输入框内部**并参与网格重排的，不是"操作行"。要兼容就得引入第二套布局分支，`toolbar` 的语义随之二义化。
2. **文档已定稿**。`chat-composer.zh.mdc` frontmatter 是 `status: beta` / `syncStatus: reviewed` / `verified: true`，含逐条交互契约与实测覆盖清单（`chat-composer.test.ts` + `chat-composer-attachments.test.ts`）。把 6 个子系统塞进去会让这份契约整体失效。
3. **仓库已有先例**：tuffex 的做法是并行组件而非巨型 variant —— `input` / `flat-input`、`select` / `flat-select`、`dropdown-menu` / `flat-dropdown`、`chat` / `ai-elements` / `conversation-stream` 三套聊天栈并存（126 个导出目录）。
4. **prop 面爆炸**。`ChatComposerProps` 现有 14 个 prop；把源列表、命令列表、模型列表、听写、变体、展开策略加进去会到 30+，且大半对块状用法无意义。

**同时建议**：把 token 解析 + 菜单状态机抽成 **composable `useTokenMenu`**，从 `prompt-bar/index.ts` 一并导出。它是纯逻辑（正则 + 过滤 + 键盘路由 + 激活索引），不含 DOM，宿主或 `TxChatComposer` 想要 `@` 提及但不要整条 bar 时可以单独用。tuffex 已有此类先例：`conversation-stream/index.ts` 导出 `useStickToBottom` 与 `createPositionCache`，`stream-markdown/index.ts` 导出 `createBlockStream` 与 `completeInlineMarkup`。

**明确排除 glimm 扫光**：引入 WebGL 着色器外部依赖（`glimm` 未在仓库任何 package.json 中），只为"选中旗舰模型时放一次彩虹"这一个彩蛋，代价与收益不成比例。若确实要保留庆祝反馈，用 tuffex 已有的 `gsap` 做一次 CSS 渐变位移扫光即可，或直接省略。

**被否掉的备选**：

- (b) `TxChatComposer variant="bar"` —— 见理由 1–4。
- (c) demo 里用 `TxTextarea` + `TxPopover` + `TxDropdownMenu` + `TxAttachmentTray` 组合 —— 否决理由是 **token 解析、自动高度、网格重排、键盘路由是真逻辑不是版式**。让每个消费方各写一遍 `/(^|\s)([@/])([\w-]*)$/` 和 `scrollHeight` 三步舞，正是组件库该消灭的重复。
- 把听写单独做成 `TxDictationButton` —— 可以，但 `TxTypingIndicator variant="bars"` 已提供指示器本体，剩下的只是一个带 `aria-pressed` 的图标按钮，不值得独立目录。

### 3.4 Vue 移植 API 草案

```ts
// prompt-bar/src/types.ts
import type { AiAttachment } from '../../ai-elements/src/types'

export type PromptBarVariant = 'rounded' | 'pill'

/** `@` 菜单的一行：数据源、集成、或"添加附件"入口 */
export interface PromptBarSource {
  key: string
  name: string
  desc?: string
  /** 走 icon 插槽的标识；不传则由 `icon` 插槽自行决定 */
  icon?: string
  /** 选中此行不插入 token，而是触发 `attach` 事件 */
  attach?: boolean
  /** 渲染右侧 Connect / Connected 副操作 */
  connectable?: boolean
  connected?: boolean
}

/** `/` 菜单的一行；`name` 含前导斜杠，与 BUI 一致 */
export interface PromptBarCommand {
  key: string
  name: string
  desc?: string
}

export interface PromptBarModel {
  key: string
  name: string
  /** 右侧灰色标签，如 Flagship / Basic */
  tag?: string
}

export interface PromptBarProps {
  modelValue?: string                      // v-model 草稿
  variant?: PromptBarVariant               // @default 'rounded'
  placeholder?: string                     // @default 'Write a message…'
  ariaLabel?: string                       // 回退到 placeholder，与 TxChatComposer 一致
  disabled?: boolean
  submitting?: boolean

  sources?: PromptBarSource[]              // @default []
  commands?: PromptBarCommand[]            // @default []
  /** 复用 ai-elements 的附件类型，直接喂 TxAttachmentTray */
  attachments?: AiAttachment[]             // @default []

  models?: PromptBarModel[]                // @default []
  /** v-model:model —— 受控；不传则模型键不渲染 */
  model?: string

  /** v-model:listening —— 受控；识别与转写全在宿主 */
  listening?: boolean
  dictatable?: boolean                     // @default false，控制听写键是否渲染
  listeningPlaceholder?: string            // @default 'Listening…'

  minHeight?: number                       // @default 28
  maxHeight?: number                       // @default 100
  sendOnEnter?: boolean                    // @default true
  allowEmptySend?: boolean                 // @default false（有附件时仍可发）

  // 无 i18n，英文默认文案作为回退（tuffex 惯例，见 StreamMarkdownProps）
  sourcesHintText?: string                 // @default 'Type to search sources & files'
  commandsHintText?: string                // @default 'Type to search commands'
  emptyTextFormatter?: (query: string) => string  // @default q => `No matches for "${q}"`
  connectText?: string                     // @default 'Connect'
  connectedText?: string                   // @default 'Connected'
  sendLabel?: string                       // @default 'Send'
  attachLabel?: string                     // @default 'Add attachments and sources'
  modelLabel?: string                      // @default 'Choose model'
  startDictationLabel?: string             // @default 'Start dictation'
  stopDictationLabel?: string              // @default 'Stop dictation'
}

export interface PromptBarEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'update:model', key: string): void
  (e: 'update:listening', value: boolean): void
  (e: 'send', payload: { text: string, attachments: AiAttachment[] }): void
  /** 选中 attach 行；宿主打开文件选择器 */
  (e: 'attach'): void
  (e: 'attachmentRemove', id: string): void
  /** 粘贴 / 拖放进来的文件，与 TxChatComposer 的 attachmentAdd 同名同形 */
  (e: 'attachmentAdd', files: File[]): void
  (e: 'sourceSelect', source: PromptBarSource): void
  (e: 'commandSelect', command: PromptBarCommand): void
  (e: 'connectToggle', source: PromptBarSource): void
  (e: 'paste', event: ClipboardEvent): void
  (e: 'focus', event: FocusEvent): void
  (e: 'blur', event: FocusEvent): void
}
```

**Slots**

| 插槽 | 作用域 | 说明 |
|---|---|---|
| `source-icon` | `{ source }` | 菜单行左侧图标槽（22×22），品牌 SVG 从这里进 |
| `source-row` | `{ source, active }` | 整行替换 |
| `command-row` | `{ command, active }` | 整行替换 |
| `model-row` | `{ model, selected }` | 模型行替换 |
| `attachments` | `{ attachments }` | 替换默认 chip 区（默认实现即 `TxAttachmentTray`） |
| `menu-footer` | `{ menu }` | 替换底部提示行，可放 `TxKbd` 键位提示 |
| `actions` | `{ send, canSend }` | 在发送键**之前**插入自定义控件 |

**Exposed**

```ts
export interface TxPromptBarInstance {
  focus: () => void
  /** 在光标处插入文本并归一空格，供宿主注入转写结果 */
  insert: (text: string) => void
  closeMenus: () => void
  /** 注意：expose 面是解包后类型，ref → 值 */
  menuOpen: boolean
}
```

（`menuOpen` 写成 `boolean` 而非 `Ref<boolean>` 是 tuffex 已有的经验：`conversation-stream/index.ts` 的 `TxConversationStreamInstance.atBottom` 注释说明 vue-tsc 把 expose 面按解包后类型看待。）

**受控 / 非受控划分**

| 状态 | 归属 | 理由 |
|---|---|---|
| `draft` | 受控（`v-model`） | 与 `TxChatComposer` 一致 |
| `model` | 受控（`v-model:model`） | 模型切换往往触发宿主副作用（计费、能力开关） |
| `listening` | 受控（`v-model:listening`） | 真实语音识别在宿主，组件只呈现态 |
| `attachments` | 受控（prop） | 与 `TxAttachmentTray` 一致，上传归宿主 |
| `connected` | 受控（`PromptBarSource.connected`） | OAuth 在宿主 |
| `menu` / `active` / `engaged` / `dismissed` | **内部** | 纯交互态，暴露只会制造同步 bug |
| `expanded` / textarea 高度 | **内部** | 从 `draft` 与容器宽度推导 |

**variant 映射**

```
BUI "Rounded" → variant: 'rounded'（默认）
BUI "Pill"    → variant: 'pill'
```

prop 值取小写，与 tuffex 现有枚举风格一致（`panelVariant: 'solid' | 'dashed' | 'plain'`、`speakState: 'idle' | 'loading' | 'speaking'`）。`pill + (有附件 || expanded) → 24px 圆角` 的降级规则做成内部推导，不外露。

**目录布局**（遵循一组件一目录）

```
prompt-bar/
├─ index.ts                     withInstall + 类型再导出 + useTokenMenu 导出
├─ src/
│  ├─ TxPromptBar.vue
│  ├─ TxPromptBarMenu.vue       @ / / 菜单（含滑动高亮）
│  ├─ types.ts
│  ├─ use-token-menu.ts         parseToken + 过滤 + 键盘路由（纯逻辑，可测）
│  └─ use-autosize.ts           测量 span + scrollHeight 三步 + expanded 判定
└─ __tests__/
   ├─ prompt-bar.test.ts
   ├─ token-menu.test.ts
   └─ autosize.test.ts
```

并在 `components.ts` 加一行 `export * from './prompt-bar/index'`（当前 126 行，按字母序插在 `progress-bar` 与 `radio` 之间）。

### 3.5 移植风险与 Vue 对应

| 风险 | Vue / tuffex 对应 |
|---|---|
| **流式模拟钩子** | 本组件无流式，但有 `AUTO_STEPS` 自演示。**不要进组件**——它是站点演示脚本。放 nexus demo，用 `useIntervalFn` / `watch` + `onCleanup`。`takeOver` 的 `onPointerDownCapture` / `onKeyDownCapture` 对应 Vue 的 `@pointerdown.capture` / `@keydown.capture` |
| **弹层定位** | 两种选择。(i) 照搬 BUI：`position: absolute; inset-x-0; bottom-full` 挂在 composer 的 `relative` 包裹上——零依赖，但会被祖先 `overflow: hidden` 裁掉，且不会翻转。(ii) 用 `TxBaseAnchor`：`@floating-ui/vue` + `flip({padding:8})` + `shift({padding:8})` + `Teleport to="body"`，能翻转、能跟随滚动（`autoUpdate` 带 `animationFrame: true`）。**推荐 (ii)**，配 `placement: 'top-start'` 与 `referenceFullWidth`（`PopoverProps` 已有此 prop）。代价是 teleport 后 `offsetTop` 相对系变了，滑动高亮的测量要相对菜单容器而非页面 |
| **滑动高亮的测量时机** | `useLayoutEffect` → Vue 的 `watchEffect(fn, { flush: 'post' })` 或 `watchPostEffect`。**不能用默认的 pre flush**，DOM 还没更新，`offsetTop` 读到旧值。行数变化（过滤）时也要重测——BUI 的依赖数组是 `[menu, query, active, connected, rows.length]` |
| **canvas 彩虹扫光** | 建议**不移植**（见 §3.3）。若必须：`glimm` 需新增依赖；`Math.random` 猴补丁在 Vue 里同样可行但更适合改用 glimm 自己的 seed 选项（若有）；`<canvas>` 的显式 `width/height` 与 `borderRadius: inherit` 必须保留；reduced-motion 早退不能省 |
| **听写指示器** | 直接 `<TxTypingIndicator variant="bars" :bars-size="14" />`——已验证动画等价（`tx-typing-bars-pulse` vs `eq-bounce`）。不要新写一份 keyframe |
| **textarea 自动高度** | tuffex 无现成 autosize。`TxAutoSizer` 是**容器**尺寸过渡（`AutoSizerProps` 的 `width/height/durationMs/rounding`），不做 textarea 内容撑高，用不上。写 `use-autosize.ts`：`el.style.height = '0px'` → 读 `scrollHeight` → clamp → 写回，用 `watchPostEffect` 触发，配 `ResizeObserver` 监听容器宽变化（`@vueuse/core` 的 `useResizeObserver`）。隐藏测量 span 用 `v-once` 不行（内容随 draft 变），保持普通绑定即可 |
| **`onMouseDown` 防抢焦点** | Vue `@mousedown.prevent` 挂在每个菜单行上。漏掉的症状是点菜单后 textarea 失焦、光标位置丢失、后续 `insert` 插到开头 |
| **`isComposing` 与 IME** | BUI 读 `event.nativeEvent.isComposing`；Vue 里原生事件对象直接有 `isComposing`。`TxChatComposer.vue:160` 已有正确写法可抄：`if (e.isComposing) return` |
| **`grid-cols` 硬编码 28px** | `fixedControlsWidth = 28 * 3 + modelButton.offsetWidth` 把控件尺寸写死在测量逻辑里。移植时改成读实际 `offsetWidth`，或把 28 提成 CSS 变量 `--tx-prompt-bar-control-size` 同时供样式与测量使用 |
| **reduced-motion** | 新增的 `pop-in`、滑动高亮 transition、`eq-bounce` 都要配 `@media (prefers-reduced-motion: reduce)` 块。BUI 靠全局通杀规则，tuffex 没有 |
| **无障碍补齐** | BUI 的菜单**没有 `role="listbox"` / `role="option"` / `aria-activedescendant`**，只有 `aria-expanded` 在触发按钮上。移植时按 `TxSearchSelect.vue:279-326` 的 combobox 模式补全：textarea 挂 `role="combobox"` + `aria-autocomplete="list"` + `aria-controls` + `aria-activedescendant`，菜单 `role="listbox"`，行 `role="option"` + `aria-selected` |

---

## 4. 跨组件共享模式（应抽成公共物）

### 4.1 来源头像 / favicon 堆叠

03 里出现三次、三种尺寸：引用 chip 内 `size-3`(12px) `rounded-[3px]`、动作行堆叠 `size-3.5`(14px) `rounded-full`、展开列表 `size-4`(16px) `rounded-[4px]`。共同的 `.source-avatar` 全局类：

```css
.source-avatar      { box-shadow: 0 0 0 1px #1018281a }
.dark .source-avatar{ box-shadow: 0 0 0 1px #ffffff1f }
```

堆叠额外加 `flex -space-x-1` + `shadow-[0_0_0_1.5px_var(--canvas)]`（用页底色挖缝，见 §1.1.4）。

**建议**：`utils/` 下一个共享 SCSS mixin 或一个 `TxSourceAvatar` 叶子组件，承载 hairline ring + 加载失败降级（`TxSources.vue:33-37` 的 `failedIcons` 逻辑值得一并提取——目前只有 `TxSources` 有）。`TxSources` 的 `stack` variant 与新的 `TxInlineCitation` 都会用到。

### 4.2 chip 家族

簇内三种 chip，圆角策略不同：

| chip | 尺寸 | 圆角 | 底色 | 出处 |
|---|---|---|---|---|
| 行内引用 | `h-4.5`(18px) | `rounded-[5px]` | `--inset` + hairline | 03 |
| 附件 | `h-6.5`(26px) | `--radius-chip`(6px) / `rounded-full` | `--field` + hairline | 08 |
| 追问 | `py-1.5` | `rounded-[7px]` | 透明 + `border-b` | 03 |

`--radius-chip: 6px` 是标称值，但三处实际用了 5 / 6 / 7px。移植时**统一到一个 token**（`--tx-radius-chip`），不要复制这三个魔数——它们的差异不承载设计意图，是手写偏差。

### 4.3 发送键配方（07 与 08 逐字相同）

```
background: canSend ? var(--ink)     : var(--line-strong)
color:      canSend ? var(--surface) : var(--ink-2)
size-7 (28px)
transition-[background-color,color,transform] duration-200
enabled:active:scale-[0.94]   ← 08
enabled:active:scale-[0.96]   ← 07（唯一差异）
icon: <path d="M12 19V5M5 12l7-7 7 7" /> strokeWidth 2.4, 16×16
```

用 `--ink` 而非 `--accent` 做主行动色，是这套设计语言的签名（全簇只有听写激活态与 Connect 链接用 accent）。tuffex 的 `TxButton type="primary"` 默认走 `--tx-color-primary`（蓝），移植时若照抄会破坏这个语言。**建议**：`TxPromptBar` 的发送键自绘，不复用 `TxButton`；或给 `TxButton` 一个 `tone="ink"`。

### 4.4 `pop-in` 是本簇的通用弹入

用了三次，时长按体量分档：菜单 180ms、附件 chip 200ms、引用 chip 250ms，缓动一律 `cubic-bezier(0.23,1,0.32,1) both`。

**建议**：`utils/` 里一个共享 keyframe `tx-pop-in`（`opacity 0 + scale(.95) → 1 + scale(1)`）+ 三档时长变量，避免三个组件各写一份。同时配一个 rm 分支。

### 4.5 逐词显影：**不要**做成共享物

03 的 `stream-in`（420ms / blur 4px）与 tuffex 的 `tx-stream-md-fresh`（440ms / blur 5px / 55% 处 opacity 归 1）在观感上等价，但 tuffex 的实现（字符 offset + 负 `animation-delay` 续播 + `TreeWalker`/`splitText`）能扛住 markdown 解析器回改已输出内容，BUI 的渲染期切词不能。`use-fresh-chunks.ts` 的文件头注释还记录了"per-delta 整体重渐显"方案的弃用理由。**沿用 tuffex 版本，把 03 的参数当作调参参考即可。**

### 4.6 `--ease-out-strong` = `cubic-bezier(0.23,1,0.32,1)`

跨三个组件、至少 9 处使用（菜单 pop-in ×2、滑动高亮 top/height、grid 折叠、fade-up ×2、气泡入场、resolving 过渡）。这是本套设计语言的**唯一主缓动**。tuffex 侧目前散落着 `cubic-bezier(0.4, 0, 0.2, 1)`（TxSources 折叠、TxMessageActions 按钮）与 `cubic-bezier(0.22, 1, 0.36, 1)`（TxMessageActions 入场、fresh chunks）。移植时若要视觉一致，需要先确定用哪一条，而不是逐组件抄。

---

## 5. 相关文件索引

### BUI 源

| 路径 | 说明 |
|---|---|
| `.trellis/tasks/08-15-beautiful-ui-port/research/beautifului-src/03-streaming-text.tsx` | 207 行，流式答案 |
| `.trellis/tasks/08-15-beautiful-ui-port/research/beautifului-src/07-chat-composer.tsx` | 187 行，标签页聊天面板 |
| `.trellis/tasks/08-15-beautiful-ui-port/research/beautifului-src/08-prompt-bar.tsx` | 669 行，composer 条 |
| `.../beautifului-src/_global.css` | 压缩成一行的 Tailwind v4 产物，keyframes / token / 自定义类都在里面 |
| `.../beautifului-src/_design-tokens.json` | light / dark 两套 token 值 |
| `.../beautifului-src/shots/{dark,light}-{streaming-text,chat-composer,prompt-bar}.png` | 截图；prompt-bar 截图是静置态，菜单未展开 |

### tuffex 对应源

| 路径 | 说明 |
|---|---|
| `packages/tuffex/packages/components/src/chat/src/TxChatComposer.vue` | 382 行，块状 composer；无 autosize |
| `packages/tuffex/packages/components/src/chat/src/types.ts` | `ChatComposerProps` / `ChatComposerEmits` / `ChatComposerAttachment` |
| `packages/tuffex/packages/components/src/chat/src/TxTypingIndicator.vue` | `bars` variant = `eq-bounce` 等价物（`:220-243`, `:430-441`） |
| `packages/tuffex/packages/components/src/ai-elements/src/types.ts` | `AiSourceItem` / `AiSuggestion` / `AiChainStep` / `AiMessagePart` |
| `packages/tuffex/packages/components/src/ai-elements/src/TxAiMessage.vue` | parts 管线，聚合 sources / attachments / reasoning / tool-call |
| `packages/tuffex/packages/components/src/sources/src/TxSources.vue` | grid 0fr↔1fr 折叠、favicon 降级、`open` 不自跳转 |
| `packages/tuffex/packages/components/src/suggestion-chips/src/TxSuggestionChips.vue` | 横向 pill + 边缘遮罩 |
| `packages/tuffex/packages/components/src/message-actions/src/TxMessageActions.vue` | roving toolbar ARIA、copy/regenerate/speak |
| `packages/tuffex/packages/components/src/attachment-tray/src/TxAttachmentChip.vue` | 尺寸格式化、上传进度、取消/删除 |
| `packages/tuffex/packages/components/src/stream-markdown/src/use-fresh-chunks.ts` | 逐块模糊显影引擎（负 delay 续播） |
| `packages/tuffex/packages/components/src/stream-markdown/src/TxStreamMarkdown.vue` | `tx-stream-md-fresh` / `__cursor` / rm 分支 |
| `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue` | `@floating-ui/vue` + Teleport，弹层定位底座 |
| `packages/tuffex/packages/components/src/search-select/src/TxSearchSelect.vue` | combobox + listbox + `aria-activedescendant` 键盘导航先例 |
| `packages/tuffex/packages/components/src/conversation-stream/index.ts` | 组件目录导出 composable 的先例（`useStickToBottom`） |
| `packages/tuffex/packages/components/src/components.ts` | 126 行注册表 |

### nexus 文档 / demo

| 路径 | 说明 |
|---|---|
| `apps/nexus/content/docs/dev/components/chat-composer.zh.mdc` | `TxChatComposer` 已定稿文档（`verified: true`，含交互契约与实测覆盖清单） |
| `apps/nexus/app/components/content/demos/` | demo 命名惯例 `<Component><DemoName>Demo.vue` |
| `apps/nexus/app/components/content/demo-registry.ts` | demo 注册链路 |

---

## 6. Caveats / 未查证

- **`glimm` 未做外部检索**。只确认它不在本仓库任何 package.json 中（grep 0 命中）。其 npm 可用性、许可证、体积、SSR 兼容性未核实。若最终决定移植扫光效果，需要单独查。
- **`TxTabs` / `TxChainOfThought` / `TxIconButton` 只看了目录与类型名，未逐行读实现**。§2.3 的组合骨架里对它们的 prop 写法是推测的，落地前需核对各自 `types.ts`。
- **未验证 tuffex 是否有全局 `prefers-reduced-motion` 兜底**。结论基于"已读的 5 个组件各自都写了 rm 块"这一观察——如果它们有全局兜底，就没必要各写一份，所以推断没有；但没有直接查 `base.css`。
- **截图是静置态**：`dark/light-prompt-bar.png` 里菜单未展开、无附件、非 expanded，所以滑动高亮、菜单版式、双行网格的视觉都只能从代码推断，没有图像佐证。`dark-chat-composer.png` 是 `done` 阶段，`resolving` 态同样没有图像佐证。
- **未测量真实渲染尺寸**。§0.4 的 px 值是按 `--spacing: .25rem` 从 Tailwind 类名换算的，未在浏览器里实测。
- `_global.css` 里的 `.stream-tail`（`filter: blur(1.6px)` + `mask-image: linear-gradient(90deg,#000 20%,#0003)`）**本簇三个组件都没用**，可能属于其它编号的组件；如果后续簇里出现"尾部渐隐"效果，这是它的实现。
